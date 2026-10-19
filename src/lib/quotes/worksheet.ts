/**
 * Quote worksheet: the operator's working for a charter price. Private to the
 * operator — stored in quote_worksheets and never returned to travelers.
 *
 * Price = billable flight time × hourly rate (with an optional daily minimum)
 *       + positioning time + fuel surcharge + crew overnights + fees
 *       + margin, then federal excise tax and per-passenger segment fees.
 */

import { z } from 'zod';
import { legDistance } from '@/lib/distance';

/** US federal excise tax on domestic air transportation (26 U.S.C. § 4261(a)). */
export const DEFAULT_FET_PCT = 7.5;
/** Planning cruise speed when the aircraft has none on file. */
export const DEFAULT_CRUISE_KTAS = 420;
/** Taxi, climb and descent allowance added to each leg's cruise time. */
export const LEG_ALLOWANCE_HOURS = 0.3;

const money = z.number().min(0).max(10_000_000);
const pct = z.number().min(0).max(100);
const hours = z.number().min(0).max(48);

export const worksheetSchema = z.object({
  aircraftId: z.number().int().positive().nullable().optional(),
  hourlyRate: money,
  legs: z.array(z.object({
    origin: z.string().max(4),
    dest: z.string().max(4),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours,
  })).min(1).max(10),
  positioningHours: hours,
  minDailyHours: z.number().min(0).max(12),
  overnights: z.number().int().min(0).max(60),
  crewOvernight: money,
  fuelSurchargePct: pct,
  landingFees: money,
  catering: money,
  other: money,
  marginPct: pct,
  fetPct: pct,
  segmentFeePerPax: z.number().min(0).max(100),
  passengers: z.number().int().min(1).max(100),
  notes: z.string().max(2000).optional(),
}).strict();

export type WorksheetInputs = z.infer<typeof worksheetSchema>;

export interface WorksheetLine {
  key: string;
  label: string;
  detail?: string;
  cents: number;
}

export interface WorksheetResult {
  lines: WorksheetLine[];
  /** Before margin and taxes. */
  costCents: number;
  /** Price before taxes (cost + margin). */
  baseCents: number;
  totalCents: number;
  billableHours: number;
}

const cents = (dollars: number) => Math.round(dollars * 100);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Estimated block hours for a leg: great-circle distance at cruise plus an allowance. Null when an airport is unknown. */
export function estimateLegHours(origin: string, dest: string, cruiseKtas = DEFAULT_CRUISE_KTAS): number | null {
  const d = legDistance(origin, dest);
  if (!d || cruiseKtas <= 0) return null;
  return round1(d.nm / cruiseKtas + LEG_ALLOWANCE_HOURS);
}

/** Nights the aircraft and crew stay away: from the first leg's date to the last. */
export function nightsAway(dates: string[]): number {
  if (dates.length < 2) return 0;
  const sorted = [...dates].sort();
  return Math.max(0, Math.round((Date.parse(sorted[sorted.length - 1]!) - Date.parse(sorted[0]!)) / 86_400_000));
}

export function computeWorksheet(w: WorksheetInputs): WorksheetResult {
  // Flight time per day, with the daily minimum applied to each flying day.
  const byDay = new Map<string, number>();
  for (const leg of w.legs) byDay.set(leg.date, (byDay.get(leg.date) ?? 0) + leg.hours);
  const flown = [...byDay.values()].reduce((s, h) => s + h, 0);
  const billable = [...byDay.values()].reduce((s, h) => s + Math.max(h, w.minDailyHours), 0);
  const minimumTopUp = billable - flown;

  const lines: WorksheetLine[] = [];
  const add = (key: string, label: string, value: number, detail?: string) => {
    if (value > 0) lines.push({ key, label, detail, cents: value });
  };

  const rate = cents(w.hourlyRate);
  add('flight', 'Flight time', Math.round(flown * rate), `${round1(flown)} h × ${fmt(rate)}/h`);
  add('minimum', 'Daily minimum', Math.round(minimumTopUp * rate), `${round1(minimumTopUp)} h to reach ${w.minDailyHours} h/day`);
  add('positioning', 'Positioning', Math.round(w.positioningHours * rate), `${w.positioningHours} h × ${fmt(rate)}/h`);
  const timeCents = Math.round((billable + w.positioningHours) * rate);
  add('fuel', 'Fuel surcharge', Math.round(timeCents * w.fuelSurchargePct / 100), `${w.fuelSurchargePct}% of flight time`);
  add('crew', 'Crew overnights', w.overnights * cents(w.crewOvernight), `${w.overnights} × ${fmt(cents(w.crewOvernight))}`);
  add('landing', 'Landing and handling', cents(w.landingFees));
  add('catering', 'Catering', cents(w.catering));
  add('other', 'Other', cents(w.other));

  const costCents = lines.reduce((s, l) => s + l.cents, 0);
  const marginCents = Math.round(costCents * w.marginPct / 100);
  add('margin', 'Margin', marginCents, `${w.marginPct}%`);
  const baseCents = costCents + marginCents;

  add('fet', 'Federal excise tax', Math.round(baseCents * w.fetPct / 100), `${w.fetPct}%`);
  const segments = w.legs.length * w.passengers;
  add('segment', 'Segment fees', Math.round(segments * cents(w.segmentFeePerPax)), `${segments} passenger segments × ${fmt(cents(w.segmentFeePerPax))}`);

  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  // Quote in whole dollars.
  return { lines, costCents, baseCents, totalCents: Math.round(totalCents / 100) * 100, billableHours: round1(billable + w.positioningHours) };
}

function fmt(c: number): string {
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: c % 100 ? 2 : 0 })}`;
}

/** Starting values for a request, from the chosen aircraft's rate and speed. */
export function defaultWorksheet(input: {
  legs: { origin: string; dest: string; date: string }[];
  passengers: number;
  aircraft?: { id: number; hourly_rate_cents?: number | null; cruise_ktas?: number | null } | null;
}): WorksheetInputs {
  const cruise = input.aircraft?.cruise_ktas || DEFAULT_CRUISE_KTAS;
  return {
    aircraftId: input.aircraft?.id ?? null,
    hourlyRate: input.aircraft?.hourly_rate_cents ? input.aircraft.hourly_rate_cents / 100 : 0,
    legs: input.legs.map(l => ({ ...l, hours: estimateLegHours(l.origin, l.dest, cruise) ?? 0 })),
    positioningHours: 0,
    minDailyHours: 0,
    overnights: nightsAway(input.legs.map(l => l.date)),
    crewOvernight: 0,
    fuelSurchargePct: 0,
    landingFees: 0,
    catering: 0,
    other: 0,
    marginPct: 0,
    fetPct: DEFAULT_FET_PCT,
    segmentFeePerPax: 0,
    passengers: input.passengers,
  };
}
