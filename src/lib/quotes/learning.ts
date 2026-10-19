/**
 * Autopilot learning: every quote a staffer submits or revises with a
 * worksheet teaches Autopilot how this operator prices. Each parameter keeps
 * an exponentially weighted average, so recent quotes count most.
 *
 * Learned: margin, fuel surcharge, daily minimum, crew overnight, landing per
 * leg, catering per guest per leg, excise tax, segment fee; per aircraft the
 * hourly rate and how flight times compare with the distance estimate; and
 * how far the final price moves from the worksheet total.
 */

import { z } from 'zod';
import type { Db } from '@/lib/db';
import { computeWorksheet, DEFAULT_CRUISE_KTAS, estimateLegHours, type WorksheetInputs } from './worksheet';
import type { AutopilotSettings } from './autopilot';

/** Weight of the newest quote. */
const ALPHA = 0.35;

export const LEARN_KEYS = [
  'marginPct', 'fuelSurchargePct', 'minDailyHours', 'crewOvernight',
  'landingPerLeg', 'cateringPerPaxLeg', 'fetPct', 'segmentFeePerPax',
] as const;
export type LearnKey = typeof LEARN_KEYS[number];

const stat = z.object({ v: z.number(), n: z.number().int().min(0) });
export type Stat = z.infer<typeof stat>;

const learnedSchema = z.object({
  samples: z.number().int().min(0),
  fields: z.record(z.string(), stat),
  aircraft: z.record(z.string(), z.object({ rate: stat.optional(), hoursFactor: stat.optional() })),
  priceRatio: stat.optional(),
  updatedAt: z.string().optional(),
});
export type Learned = z.infer<typeof learnedSchema>;

export const emptyLearned = (): Learned => ({ samples: 0, fields: {}, aircraft: {} });

export function parseLearned(raw: string | null | undefined): Learned {
  if (!raw) return emptyLearned();
  try {
    const p = learnedSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : emptyLearned();
  } catch {
    return emptyLearned();
  }
}

const blend = (s: Stat | undefined, x: number): Stat =>
  !s || s.n === 0 ? { v: x, n: 1 } : { v: s.v + ALPHA * (x - s.v), n: s.n + 1 };

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Fold one submitted quote into what Autopilot knows. Pure. */
export function observe(prev: Learned, q: {
  worksheet: WorksheetInputs;
  finalPriceCents: number;
  /** Cruise speed the worksheet hours are compared against. */
  cruiseKtas?: number | null;
  now?: string;
}): Learned {
  const w = q.worksheet;
  const legs = w.legs.length || 1;
  const next: Learned = structuredClone(prev);
  const put = (k: LearnKey, x: number) => { if (Number.isFinite(x) && x >= 0) next.fields[k] = blend(next.fields[k], x); };

  put('marginPct', w.marginPct);
  put('fuelSurchargePct', w.fuelSurchargePct);
  put('minDailyHours', w.minDailyHours);
  put('fetPct', w.fetPct);
  put('segmentFeePerPax', w.segmentFeePerPax);
  put('landingPerLeg', w.landingFees / legs);
  put('cateringPerPaxLeg', w.catering / (legs * Math.max(1, w.passengers)));
  // Only trips with nights away say anything about the overnight rate.
  if (w.overnights > 0) put('crewOvernight', w.crewOvernight);

  if (w.aircraftId) {
    const key = String(w.aircraftId);
    const a = { ...(next.aircraft[key] ?? {}) };
    if (w.hourlyRate > 0) a.rate = blend(a.rate, w.hourlyRate);
    // How the operator's flight times compare with the distance estimate.
    const cruise = q.cruiseKtas || DEFAULT_CRUISE_KTAS;
    let est = 0, entered = 0;
    for (const l of w.legs) {
      const e = estimateLegHours(l.origin, l.dest, cruise);
      if (e && e > 0 && l.hours > 0) { est += e; entered += l.hours; }
    }
    if (est > 0) a.hoursFactor = blend(a.hoursFactor, clamp(entered / est, 0.5, 2));
    next.aircraft[key] = a;
  }

  const total = computeWorksheet(w).totalCents;
  if (total > 0 && q.finalPriceCents > 0) next.priceRatio = blend(next.priceRatio, clamp(q.finalPriceCents / total, 0.5, 2));

  next.samples = prev.samples + 1;
  next.updatedAt = q.now ?? new Date().toISOString();
  return next;
}

export interface Applied {
  settings: AutopilotSettings;
  /** Hourly rate per aircraft id, USD, where the fleet has none on file. */
  rates: Record<number, number>;
  /** Multiplier on estimated leg hours, per aircraft id. */
  hoursFactor: Record<number, number>;
  /** Multiplier on the worksheet total. 1 when not learned. */
  priceRatio: number;
  /** What was learned, for the reviewer. */
  notes: string[];
}

const LABEL: Record<LearnKey, (v: number) => string> = {
  marginPct: v => `margin ${round(v, 1)}%`,
  fuelSurchargePct: v => `fuel ${round(v, 1)}%`,
  minDailyHours: v => `daily minimum ${round(v, 1)} h`,
  crewOvernight: v => `crew $${Math.round(v)}/night`,
  landingPerLeg: v => `landing $${Math.round(v)}/leg`,
  cateringPerPaxLeg: v => `catering $${Math.round(v)}/guest/leg`,
  fetPct: v => `tax ${round(v, 1)}%`,
  segmentFeePerPax: v => `segment $${round(v, 2)}`,
};

/**
 * Settings Autopilot drafts with: the learned value for each parameter once
 * the operator has quoted, otherwise the console setting.
 */
export function applyLearning(settings: AutopilotSettings, learned: Learned): Applied {
  const out: Applied = { settings: { ...settings }, rates: {}, hoursFactor: {}, priceRatio: 1, notes: [] };
  if (!settings.learn || learned.samples === 0) return out;

  const changed: string[] = [];
  for (const k of LEARN_KEYS) {
    const s = learned.fields[k];
    if (!s?.n) continue;
    const v = k === 'crewOvernight' || k === 'landingPerLeg' || k === 'cateringPerPaxLeg' ? Math.round(s.v) : round(s.v);
    if (Math.abs(v - settings[k]) > 0.005) changed.push(LABEL[k](v));
    out.settings[k] = v;
  }
  for (const [id, a] of Object.entries(learned.aircraft)) {
    if (a.rate?.n) out.rates[Number(id)] = Math.round(a.rate.v);
    if (a.hoursFactor?.n && Math.abs(a.hoursFactor.v - 1) > 0.02) out.hoursFactor[Number(id)] = round(a.hoursFactor.v);
  }
  if (learned.priceRatio?.n && Math.abs(learned.priceRatio.v - 1) > 0.01) out.priceRatio = round(learned.priceRatio.v, 3);

  const n = learned.samples;
  if (changed.length) out.notes.push(`Learned from your last ${n} quote${n === 1 ? '' : 's'}: ${changed.join(', ')}.`);
  return out;
}

/** Record a submitted or revised quote for this operator. Never throws. */
export async function learnFromQuote(db: Db, operatorId: number, worksheet: WorksheetInputs, finalPriceCents: number): Promise<void> {
  try {
    const row = await db.one<{ data: string }>('SELECT data FROM autopilot_learning WHERE operator_id = ?', [operatorId]);
    const cruise = worksheet.aircraftId
      ? (await db.one<{ cruise_ktas: number | null }>('SELECT cruise_ktas FROM aircraft WHERE id = ? AND operator_id = ?', [worksheet.aircraftId, operatorId]))?.cruise_ktas
      : null;
    const next = observe(parseLearned(row?.data), { worksheet, finalPriceCents, cruiseKtas: cruise });
    await db.run(`
      INSERT INTO autopilot_learning (operator_id, data, samples, updated_at) VALUES (?, ?, ?, now())
      ON CONFLICT (operator_id) DO UPDATE SET data = EXCLUDED.data, samples = EXCLUDED.samples, updated_at = now()`,
      [operatorId, JSON.stringify(next), next.samples]);
    // An aircraft with no rate on file takes the rate the staffer used.
    if (worksheet.aircraftId && worksheet.hourlyRate > 0) {
      await db.run('UPDATE aircraft SET hourly_rate_cents = ? WHERE id = ? AND operator_id = ? AND hourly_rate_cents IS NULL',
        [Math.round(worksheet.hourlyRate * 100), worksheet.aircraftId, operatorId]);
    }
  } catch (err) {
    console.error('Autopilot learning failed:', err);
  }
}

export async function loadLearned(db: Db, operatorId: number): Promise<Learned> {
  const row = await db.one<{ data: string }>('SELECT data FROM autopilot_learning WHERE operator_id = ?', [operatorId]);
  return parseLearned(row?.data);
}
