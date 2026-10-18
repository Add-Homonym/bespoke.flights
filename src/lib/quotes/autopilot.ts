/**
 * Autopilot: draft a quote for every request matched to an operator, from the
 * operator's own pricing parameters. Drafts are never sent: a staffer reviews,
 * edits if needed, and submits (see /operator/inbound).
 *
 * Steps: pick the aircraft (smallest that seats the group and covers the
 * longest leg), estimate leg hours from distance and cruise speed, add
 * positioning from the home base, then apply the operator's fees and margin
 * through the quote worksheet (worksheet.ts).
 */

import { z } from 'zod';
import type { Db } from '@/lib/db';
import { legDistance } from '@/lib/distance';
import { findAirport } from '@/lib/airports';
import type { Aircraft, BookingLeg } from '@/lib/types';
import { applyLearning, emptyLearned, loadLearned, type Learned } from './learning';
import {
  computeWorksheet, DEFAULT_CRUISE_KTAS, DEFAULT_FET_PCT, estimateLegHours, nightsAway, type WorksheetInputs,
} from './worksheet';

export const autopilotSchema = z.object({
  enabled: z.boolean(),
  /** Use what staff submit to adjust these parameters (learning.ts). */
  learn: z.boolean().default(true),
  /** ICAO of the home base, for positioning legs. Blank: no positioning. */
  baseAirport: z.string().trim().toUpperCase().max(4).optional().nullable(),
  marginPct: z.number().min(0).max(100),
  fuelSurchargePct: z.number().min(0).max(100),
  minDailyHours: z.number().min(0).max(12),
  crewOvernight: z.number().min(0).max(100_000),
  /** Landing and handling per leg flown, USD. */
  landingPerLeg: z.number().min(0).max(100_000),
  /** Catering per passenger per leg, USD. */
  cateringPerPaxLeg: z.number().min(0).max(10_000),
  fetPct: z.number().min(0).max(100),
  segmentFeePerPax: z.number().min(0).max(100),
  /** Days the quote stays valid. */
  validDays: z.number().int().min(1).max(90),
  /** Message to the traveler; {aircraft} and {seats} are filled in. */
  message: z.string().max(2000).optional().nullable(),
}).strict();

export type AutopilotSettings = z.infer<typeof autopilotSchema>;

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  enabled: false,
  learn: true,
  baseAirport: null,
  marginPct: 10,
  fuelSurchargePct: 0,
  minDailyHours: 0,
  crewOvernight: 0,
  landingPerLeg: 0,
  cateringPerPaxLeg: 0,
  fetPct: DEFAULT_FET_PCT,
  segmentFeePerPax: 0,
  validDays: 7,
  message: 'All-in price for the {aircraft} ({seats} seats), crew, fuel, fees and taxes included.',
};

export function parseAutopilot(raw: string | null | undefined): AutopilotSettings {
  if (!raw) return DEFAULT_AUTOPILOT;
  try {
    const parsed = autopilotSchema.safeParse({ ...DEFAULT_AUTOPILOT, ...JSON.parse(raw) });
    return parsed.success ? parsed.data : DEFAULT_AUTOPILOT;
  } catch {
    return DEFAULT_AUTOPILOT;
  }
}

type Plane = Pick<Aircraft, 'id' | 'type' | 'tail_number' | 'capacity' | 'range_nm' | 'hourly_rate_cents' | 'cruise_ktas'>;
type Leg = Pick<BookingLeg, 'origin_code' | 'dest_code' | 'departure_date'>;

export interface AutopilotDraft {
  aircraft: Plane | null;
  worksheet: WorksheetInputs;
  priceCents: number;
  message: string | null;
  validUntil: string;
  /** Points for the reviewer: assumptions made and anything missing. */
  flags: string[];
  /** What Autopilot applied from earlier quotes. */
  notes: string[];
}

/** Smallest aircraft that seats the group and covers the longest leg; with a rate on file preferred. */
export function pickAircraft(fleet: Plane[], passengers: number, longestLegNm: number): { aircraft: Plane | null; flags: string[] } {
  const flags: string[] = [];
  if (fleet.length === 0) return { aircraft: null, flags: ['No aircraft in the fleet.'] };
  const fits = (a: Plane) => a.capacity >= passengers && (!a.range_nm || a.range_nm >= longestLegNm);
  const bySize = [...fleet].sort((a, b) => a.capacity - b.capacity || (a.hourly_rate_cents ?? 0) - (b.hourly_rate_cents ?? 0));
  let choice = bySize.find(a => fits(a) && a.hourly_rate_cents) ?? bySize.find(fits);
  if (!choice) {
    choice = [...fleet].sort((a, b) => b.capacity - a.capacity)[0]!;
    if (choice.capacity < passengers) flags.push(`${passengers} guests exceed the largest aircraft (${choice.capacity} seats). Price more than one aircraft or decline.`);
    if (choice.range_nm && choice.range_nm < longestLegNm) flags.push(`Longest leg (${Math.round(longestLegNm)} nm) exceeds the ${choice.type}'s range (${choice.range_nm} nm). Add a fuel stop.`);
  }
  if (!choice.hourly_rate_cents) flags.push(`No hourly rate on file for ${choice.tail_number}. Set it in Fleet, or enter the rate here.`);
  if (!choice.cruise_ktas) flags.push(`No cruise speed on file for ${choice.tail_number}; leg times assume ${DEFAULT_CRUISE_KTAS} kt.`);
  return { aircraft: choice, flags };
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function buildAutopilotDraft(input: {
  legs: Leg[];
  passengers: number;
  fleet: Plane[];
  settings: AutopilotSettings;
  /** What Autopilot has learned from this operator's quotes. */
  learned?: Learned;
  today?: string;
}): AutopilotDraft {
  const { legs, passengers } = input;
  const applied = applyLearning(input.settings, input.learned ?? emptyLearned());
  const s = applied.settings;
  const notes = [...applied.notes];
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const longest = Math.max(0, ...legs.map(l => legDistance(l.origin_code, l.dest_code)?.nm ?? 0));
  // Aircraft with no rate on file use the rate staff have quoted them at.
  const fleet = input.fleet.map(a => (!a.hourly_rate_cents && applied.rates[a.id] ? { ...a, hourly_rate_cents: applied.rates[a.id]! * 100 } : a));
  const { aircraft, flags } = pickAircraft(fleet, passengers, longest);
  const cruise = aircraft?.cruise_ktas || DEFAULT_CRUISE_KTAS;
  if (aircraft && !input.fleet.find(a => a.id === aircraft.id)?.hourly_rate_cents && applied.rates[aircraft.id]) {
    notes.push(`Hourly rate $${applied.rates[aircraft.id]!.toLocaleString('en-US')} for ${aircraft.tail_number}, from your earlier quotes.`);
  }
  const factor = aircraft ? applied.hoursFactor[aircraft.id] ?? 1 : 1;
  if (factor !== 1) notes.push(`Leg times ${factor > 1 ? '+' : ''}${Math.round((factor - 1) * 100)}% vs the distance estimate, as in your earlier quotes.`);

  const legRows = legs.map(l => {
    const est = estimateLegHours(l.origin_code, l.dest_code, cruise);
    if (est === null) flags.push(`Distance unknown for ${l.origin_code}–${l.dest_code}; enter its flight time.`);
    return { origin: l.origin_code, dest: l.dest_code, date: l.departure_date, hours: est === null ? 0 : Math.round(est * factor * 10) / 10 };
  });

  // Positioning: base to the first departure, and the last arrival back to base.
  let positioningHours = 0;
  const base = s.baseAirport && findAirport(s.baseAirport) ? s.baseAirport : null;
  if (base && legs.length) {
    const first = legs[0]!.origin_code;
    const last = legs[legs.length - 1]!.dest_code;
    const out = first === base ? 0 : estimateLegHours(base, first, cruise) ?? 0;
    const back = last === base ? 0 : estimateLegHours(last, base, cruise) ?? 0;
    positioningHours = Math.round((out + back) * 10) / 10;
    if (positioningHours > 0) flags.push(`Positioning ${positioningHours} h from and back to ${base}.`);
  } else if (!s.baseAirport) {
    flags.push('No home base set, so no positioning is included.');
  }

  const worksheet: WorksheetInputs = {
    aircraftId: aircraft?.id ?? null,
    hourlyRate: (aircraft?.hourly_rate_cents ?? 0) / 100,
    legs: legRows,
    positioningHours,
    minDailyHours: s.minDailyHours,
    overnights: nightsAway(legs.map(l => l.departure_date)),
    crewOvernight: s.crewOvernight,
    fuelSurchargePct: s.fuelSurchargePct,
    landingFees: s.landingPerLeg * legs.length,
    catering: s.cateringPerPaxLeg * passengers * legs.length,
    other: 0,
    marginPct: s.marginPct,
    fetPct: s.fetPct,
    segmentFeePerPax: s.segmentFeePerPax,
    passengers,
    notes: 'Drafted by Autopilot.',
  };
  if (worksheet.overnights > 0 && s.crewOvernight === 0) {
    flags.push(`${worksheet.overnights} nights away with no crew overnight cost set.`);
  }

  const worksheetTotal = computeWorksheet(worksheet).totalCents;
  // Staff who regularly move the final price off the worksheet total teach that adjustment.
  const totalCents = Math.round((worksheetTotal * applied.priceRatio) / 100) * 100;
  if (applied.priceRatio !== 1 && worksheetTotal > 0) {
    notes.push(`Price ${applied.priceRatio > 1 ? '+' : ''}${Math.round((applied.priceRatio - 1) * 100)}% on the worksheet total, as your staff usually adjust.`);
  }
  const firstDate = legs.map(l => l.departure_date).sort()[0] ?? today;
  // Valid for validDays, but not past the day before departure, and never before today.
  const lastUseful = addDays(firstDate, -1);
  let validUntil = addDays(today, s.validDays);
  if (validUntil > lastUseful) validUntil = lastUseful < today ? today : lastUseful;

  const message = s.message && aircraft
    ? s.message.replaceAll('{aircraft}', aircraft.type).replaceAll('{seats}', String(aircraft.capacity))
    : s.message || null;

  return { aircraft, worksheet, priceCents: totalCents, message, validUntil, flags, notes };
}

export interface QuoteDraftRow {
  id: number;
  request_id: number;
  operator_id: number;
  aircraft_id: number | null;
  price_cents: number;
  message: string | null;
  valid_until: string | null;
  worksheet: string;
  flags: string;
  notes: string | null;
  status: 'draft' | 'submitted' | 'discarded';
  created_at: string;
}

/**
 * Draft (or redraft) the quote for one request and operator, if the operator
 * has Autopilot on and has not quoted yet. Returns the draft id, or null.
 */
export async function draftQuote(db: Db, requestId: number, operatorId: number, opts: { force?: boolean } = {}): Promise<number | null> {
  const op = await db.one<{ autopilot: string | null; status: string }>('SELECT autopilot, status FROM operators WHERE id = ?', [operatorId]);
  if (!op) return null;
  const settings = parseAutopilot(op.autopilot);
  if (!settings.enabled && !opts.force) return null;

  const request = await db.one<{ status: string; passenger_count: number }>('SELECT status, passenger_count FROM booking_requests WHERE id = ?', [requestId]);
  if (!request || !['open', 'quoted'].includes(request.status)) return null;
  const quoted = await db.one("SELECT 1 FROM quotes WHERE request_id = ? AND operator_id = ? AND status IN ('pending','accepted')", [requestId, operatorId]);
  if (quoted) return null;

  const legs = await db.query<Leg>('SELECT origin_code, dest_code, departure_date FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId]);
  if (legs.length === 0) return null;
  const fleet = await db.query<Plane>(
    'SELECT id, type, tail_number, capacity, range_nm, hourly_rate_cents, cruise_ktas FROM aircraft WHERE operator_id = ?', [operatorId]);

  const d = buildAutopilotDraft({ legs, passengers: request.passenger_count, fleet, settings, learned: await loadLearned(db, operatorId) });
  const row = await db.one<{ id: number }>(`
    INSERT INTO quote_drafts (request_id, operator_id, aircraft_id, price_cents, message, valid_until, worksheet, flags, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    ON CONFLICT (request_id, operator_id) DO UPDATE SET
      aircraft_id = EXCLUDED.aircraft_id, price_cents = EXCLUDED.price_cents, message = EXCLUDED.message,
      valid_until = EXCLUDED.valid_until, worksheet = EXCLUDED.worksheet, flags = EXCLUDED.flags, notes = EXCLUDED.notes,
      status = 'draft', created_at = now()
    WHERE quote_drafts.status <> 'submitted' OR ?
    RETURNING id`,
    [requestId, operatorId, d.aircraft?.id ?? null, d.priceCents, d.message, d.validUntil,
     JSON.stringify(d.worksheet), JSON.stringify(d.flags), JSON.stringify(d.notes), !!opts.force]);
  return row?.id ?? null;
}

/** The operator's current draft for a request, parsed; null when none or not a draft. */
export async function loadDraft(db: Db, requestId: number, operatorId: number) {
  const row = await db.one<QuoteDraftRow>(
    "SELECT * FROM quote_drafts WHERE request_id = ? AND operator_id = ? AND status = 'draft'", [requestId, operatorId]);
  if (!row) return null;
  return {
    id: row.id,
    aircraftId: row.aircraft_id,
    priceCents: Number(row.price_cents),
    message: row.message,
    validUntil: row.valid_until,
    worksheet: JSON.parse(row.worksheet) as WorksheetInputs,
    flags: JSON.parse(row.flags) as string[],
    notes: JSON.parse(row.notes ?? '[]') as string[],
    createdAt: row.created_at,
  };
}

export type LoadedDraft = NonNullable<Awaited<ReturnType<typeof loadDraft>>>;

/** Redraft the operator's open drafts, so what was just learned applies to them too. */
export async function refreshDrafts(db: Db, operatorId: number): Promise<number> {
  const open = await db.query<{ request_id: number }>(
    "SELECT request_id FROM quote_drafts WHERE operator_id = ? AND status = 'draft'", [operatorId]);
  let n = 0;
  for (const d of open) if (await draftQuote(db, d.request_id, operatorId)) n++;
  return n;
}
