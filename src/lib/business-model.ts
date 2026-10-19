/**
 * Business model settings, editable from /admin/settings.
 *
 * Stored as one JSON document under platform_settings.key = 'business_model'.
 * Every field has a default, so an empty table behaves exactly like today's
 * environment-driven configuration. Only fields marked `applied: true` change
 * live behavior; the rest are recorded so the model can be tuned ahead of the
 * features that use them.
 */
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { platformFeeBps as envPlatformFeeBps } from '@/lib/payments/config';

export const BUSINESS_MODEL_KEY = 'business_model';

const bps = (max = 10_000) => z.number().int().min(0).max(max);
const cents = z.number().int().min(0).max(100_000_000);

export const businessModelSchema = z.object({
  // ── 1. Commission ──
  /** Default commission charged to the operator on a confirmed booking. */
  operatorCommissionBps: bps(5_000),
  /** Who pays the platform fee. 'operator' keeps the traveler's price equal to the quote. */
  feePayer: z.enum(['operator', 'traveler', 'split']),
  /** Fee added to the traveler's charge when feePayer is 'traveler' or 'split'. */
  travelerFeeBps: bps(5_000),

  // ── 2. Operator subscription tier ──
  subscriptionEnabled: z.boolean(),
  subscriptionMonthlyCents: cents,
  /** Commission charged to subscribing operators instead of the default. */
  subscriptionCommissionBps: bps(5_000),
  subscriptionPriorityPlacement: z.boolean(),

  // ── 3. Ancillaries ──
  ancillaryMarginBps: bps(10_000),

  // ── 4. Payments ──
  /** Deduct an estimate of card/ACH processing from the operator payout instead of the platform's share. */
  passProcessingToOperator: z.boolean(),
  processingFeeBps: bps(2_000),
  processingFeeFixedCents: cents,
  /** Hours after the last leg before the operator payout is released. */
  payoutHoldHours: z.number().int().min(0).max(24 * 60),

  // ── 5. Empty legs ──
  emptyLegCommissionBps: bps(5_000),

  // ── 6. Launch partner promotion ──
  launchPromoEnabled: z.boolean(),
  launchPromoCommissionBps: bps(5_000),
  /** Paid bookings per launch partner at the promo rate; 0 = unlimited. */
  launchPromoBookingCap: z.number().int().min(0).max(100_000),
  /** ISO date (YYYY-MM-DD) after which the promo no longer applies; empty = no end. */
  launchPromoUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),

  // ── 7. Referrals ──
  referralFeeBps: bps(5_000),

  // ── 8. Quote ranking ──
  rankQuotesBy: z.enum(['price', 'score']),
  discloseAffiliations: z.boolean(),
});

export type BusinessModel = z.infer<typeof businessModelSchema>;

export const businessModelPatchSchema = businessModelSchema.partial().strict();

/** Defaults match current behavior: the environment's PLATFORM_FEE_BPS (or 5%) for the operator commission. */
export function defaultBusinessModel(): BusinessModel {
  return {
    operatorCommissionBps: envPlatformFeeBps(),
    feePayer: 'operator',
    travelerFeeBps: 0,
    subscriptionEnabled: false,
    subscriptionMonthlyCents: 50_000,
    subscriptionCommissionBps: 500,
    subscriptionPriorityPlacement: true,
    ancillaryMarginBps: 4_000,
    passProcessingToOperator: false,
    processingFeeBps: 290,
    processingFeeFixedCents: 30,
    payoutHoldHours: 24,
    emptyLegCommissionBps: 1_500,
    launchPromoEnabled: false,
    launchPromoCommissionBps: 0,
    launchPromoBookingCap: 100,
    launchPromoUntil: '',
    referralFeeBps: 400,
    rankQuotesBy: 'price',
    discloseAffiliations: true,
  };
}

/** Which fields change live behavior today. Shown in the admin UI. */
export const APPLIED_FIELDS: ReadonlySet<keyof BusinessModel> = new Set<keyof BusinessModel>([
  'operatorCommissionBps',
  'subscriptionEnabled',
  'subscriptionCommissionBps',
  'passProcessingToOperator',
  'processingFeeBps',
  'processingFeeFixedCents',
  'emptyLegCommissionBps',
  'launchPromoEnabled',
  'launchPromoCommissionBps',
  'launchPromoBookingCap',
  'launchPromoUntil',
  'rankQuotesBy',
]);

export async function getBusinessModel(db: Db): Promise<BusinessModel> {
  const defaults = defaultBusinessModel();
  const row = await db.one<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [BUSINESS_MODEL_KEY]).catch(() => undefined);
  if (!row) return defaults;
  let stored: unknown;
  try { stored = JSON.parse(row.value); } catch { return defaults; }
  const parsed = businessModelSchema.partial().safeParse(stored);
  return parsed.success ? { ...defaults, ...parsed.data } : defaults;
}

/** Merge a validated patch into the stored model and return the result. */
export async function saveBusinessModel(db: Db, patch: Partial<BusinessModel>): Promise<BusinessModel> {
  return db.transaction(async tx => {
    const current = await getBusinessModel(tx);
    const next = businessModelSchema.parse({ ...current, ...patch });
    await tx.run(`INSERT INTO platform_settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [BUSINESS_MODEL_KEY, JSON.stringify(next)]);
    return next;
  });
}

// ─── Fee resolution ─────────────────────────────────────────────────

export interface FeeOperator {
  id: number;
  platform_fee_bps: number | null;
  plan?: string | null;
  launch_partner?: number | null;
}

export interface ResolvedFee {
  bps: number;
  source: 'operator_override' | 'launch_promo' | 'empty_leg' | 'subscription' | 'default';
}

/**
 * Commission for one booking, in priority order:
 * per-operator override → launch promo (while active and under cap) →
 * empty leg → subscription tier → default.
 */
export async function resolveCommission(
  db: Db,
  model: BusinessModel,
  operator: FeeOperator,
  opts: { emptyLeg?: boolean; today?: string } = {},
): Promise<ResolvedFee> {
  if (operator.platform_fee_bps != null) return { bps: operator.platform_fee_bps, source: 'operator_override' };

  if (model.launchPromoEnabled && operator.launch_partner) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10);
    const inWindow = !model.launchPromoUntil || today <= model.launchPromoUntil;
    let underCap = true;
    if (model.launchPromoBookingCap > 0) {
      const { c } = (await db.one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM payments WHERE operator_id = ? AND status IN ('succeeded', 'partially_refunded', 'refunded') AND change_request_id IS NULL`,
        [operator.id],
      ))!;
      underCap = c < model.launchPromoBookingCap;
    }
    if (inWindow && underCap) return { bps: model.launchPromoCommissionBps, source: 'launch_promo' };
  }

  if (opts.emptyLeg) return { bps: model.emptyLegCommissionBps, source: 'empty_leg' };
  if (model.subscriptionEnabled && operator.plan === 'subscriber') return { bps: model.subscriptionCommissionBps, source: 'subscription' };
  return { bps: model.operatorCommissionBps, source: 'default' };
}

/** Estimated processor cost for a charge, used when it is passed to the operator. */
export function estimatedProcessingCents(model: BusinessModel, amountCents: number): number {
  if (!model.passProcessingToOperator) return 0;
  return Math.round((amountCents * model.processingFeeBps) / 10_000) + model.processingFeeFixedCents;
}
