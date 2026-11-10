/**
 * Measurement for the ads loop: what each ad cost, what it brought in, and
 * where the month stands against the net goal.
 *
 * Net revenue of a payment = the platform fee kept after refunds, minus card
 * processing when the platform absorbs it (business model: Payments).
 * Monthly net = net revenue of every paid booking in the month minus ad spend.
 * Months and days are UTC.
 */
import type { Db } from '@/lib/db';
import type { BusinessModel } from '@/lib/business-model';
import type { AdsSettings } from './settings';
import type { Angle } from './copy';
import type { Trials } from './stats';

const PAID = `('succeeded','partially_refunded','refunded')`;

export interface PaymentRow { amount_cents: number; platform_fee_cents: number; refunded_cents: number }

export function netOfPayment(model: BusinessModel, p: PaymentRow): number {
  const kept = p.amount_cents > 0 ? (p.amount_cents - p.refunded_cents) / p.amount_cents : 0;
  const processing = model.passProcessingToOperator
    ? 0
    : Math.round((p.amount_cents * model.processingFeeBps) / 10_000) + model.processingFeeFixedCents;
  return Math.round(p.platform_fee_cents * kept) - processing;
}

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export interface VariantStat {
  id: number;
  campaignId: number;
  angle: Angle;
  status: 'draft' | 'active' | 'paused';
  impressions: number;
  clicks: number;
  costCents: number;
  requests: number;
  bookings: number;
  netRevenueCents: number;
}

/** Delivery and outcomes per ad for [since, until). */
export async function variantStats(db: Db, model: BusinessModel, since: Date, until: Date): Promise<VariantStat[]> {
  const rows = await db.query<{ id: number; campaign_id: number; angle: Angle; status: VariantStat['status']; impressions: number; clicks: number; cost_cents: number; requests: number }>(`
    SELECT v.id, v.campaign_id, v.angle, v.status,
      COALESCE(m.impressions, 0)::int AS impressions, COALESCE(m.clicks, 0)::int AS clicks, COALESCE(m.cost_cents, 0) AS cost_cents,
      COALESCE(r.requests, 0)::int AS requests
    FROM ad_variants v
    LEFT JOIN (SELECT variant_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(cost_cents) AS cost_cents
               FROM ad_metrics_daily WHERE day >= ? AND day < ? GROUP BY variant_id) m ON m.variant_id = v.id
    LEFT JOIN (SELECT ad_variant_id, COUNT(*) AS requests
               FROM booking_requests WHERE ad_variant_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY ad_variant_id) r ON r.ad_variant_id = v.id
    ORDER BY v.campaign_id, v.id`, [dayOf(since), dayOf(until), since.toISOString(), until.toISOString()]);

  const paid = await db.query<PaymentRow & { ad_variant_id: number; request_id: number; change_request_id: number | null }>(`
    SELECT br.ad_variant_id, p.request_id, p.change_request_id, p.amount_cents, p.platform_fee_cents, p.refunded_cents
    FROM payments p JOIN booking_requests br ON br.id = p.request_id
    WHERE br.ad_variant_id IS NOT NULL AND p.status IN ${PAID} AND p.paid_at >= ? AND p.paid_at < ?`, [since.toISOString(), until.toISOString()]);

  const net = new Map<number, number>();
  const booked = new Map<number, Set<number>>();
  for (const p of paid) {
    net.set(p.ad_variant_id, (net.get(p.ad_variant_id) ?? 0) + netOfPayment(model, p));
    if (p.change_request_id == null) (booked.get(p.ad_variant_id) ?? booked.set(p.ad_variant_id, new Set()).get(p.ad_variant_id)!).add(p.request_id);
  }
  return rows.map(r => ({
    id: r.id, campaignId: r.campaign_id, angle: r.angle, status: r.status,
    impressions: r.impressions, clicks: r.clicks, costCents: r.cost_cents, requests: r.requests,
    bookings: booked.get(r.id)?.size ?? 0, netRevenueCents: net.get(r.id) ?? 0,
  }));
}

/** Clicks and requests per copy angle, all campaigns, all time. Feeds the generator. */
export async function angleStats(db: Db): Promise<Partial<Record<Angle, Trials>>> {
  const rows = await db.query<{ angle: Angle; clicks: number; requests: number }>(`
    SELECT v.angle,
      COALESCE((SELECT SUM(m.clicks) FROM ad_metrics_daily m JOIN ad_variants v2 ON v2.id = m.variant_id WHERE v2.angle = v.angle), 0)::int AS clicks,
      (SELECT COUNT(*) FROM booking_requests br JOIN ad_variants v3 ON v3.id = br.ad_variant_id WHERE v3.angle = v.angle)::int AS requests
    FROM ad_variants v GROUP BY v.angle`);
  return Object.fromEntries(rows.map(r => [r.angle, { successes: r.requests, trials: r.clicks }]));
}

/**
 * Expected platform net per ad-attributed request. Starts at the settings'
 * priors (booking rate x net per booking) and moves to the measured figure as
 * requests accumulate. Requests from the last 14 days are left out: most have
 * not had time to book.
 */
export async function valuePerRequestCents(db: Db, model: BusinessModel, settings: AdsSettings, now: Date): Promise<number> {
  const matureBefore = addDays(now, -14).toISOString();
  const { requests } = (await db.one<{ requests: number }>(
    'SELECT COUNT(*)::int AS requests FROM booking_requests WHERE ad_variant_id IS NOT NULL AND created_at < ?', [matureBefore]))!;
  const paid = await db.query<PaymentRow>(`
    SELECT p.amount_cents, p.platform_fee_cents, p.refunded_cents
    FROM payments p JOIN booking_requests br ON br.id = p.request_id
    WHERE br.ad_variant_id IS NOT NULL AND br.created_at < ? AND p.status IN ${PAID}`, [matureBefore]);
  const measuredNet = paid.reduce((sum, p) => sum + netOfPayment(model, p), 0);
  const prior = (settings.assumedBookingRateBps / 10_000) * settings.assumedNetPerBookingCents;
  return Math.round((settings.priorRequests * prior + measuredNet) / (settings.priorRequests + requests));
}

export interface MonthSummary {
  month: string;
  /** Net revenue from every paid booking this month, attributed or not. */
  platformNetCents: number;
  /** The part of platformNetCents from ad-attributed requests. */
  attributedNetCents: number;
  bookings: number;
  attributedBookings: number;
  attributedRequests: number;
  adSpendCents: number;
  /** platformNetCents - adSpendCents. This is the figure the goal is measured on. */
  netAfterAdsCents: number;
  goalCents: number;
  /** netAfterAdsCents extended at the month-to-date daily rate. */
  projectedNetCents: number;
  daysElapsed: number;
  daysInMonth: number;
  /** Measured net per paid booking this month, or the assumed figure when there are none. */
  netPerBookingCents: number;
  /** Paid bookings still needed this month at netPerBookingCents, before further ad spend. */
  bookingsToGoal: number;
}

export async function monthSummary(db: Db, model: BusinessModel, settings: AdsSettings, now: Date): Promise<MonthSummary> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000)));

  const paid = await db.query<PaymentRow & { request_id: number; change_request_id: number | null; ad_variant_id: number | null }>(`
    SELECT p.request_id, p.change_request_id, p.amount_cents, p.platform_fee_cents, p.refunded_cents, br.ad_variant_id
    FROM payments p JOIN booking_requests br ON br.id = p.request_id
    WHERE p.status IN ${PAID} AND p.paid_at >= ? AND p.paid_at < ?`, [start.toISOString(), end.toISOString()]);
  let platformNetCents = 0, attributedNetCents = 0;
  const bookings = new Set<number>(), attributed = new Set<number>();
  for (const p of paid) {
    const net = netOfPayment(model, p);
    platformNetCents += net;
    if (p.ad_variant_id != null) attributedNetCents += net;
    if (p.change_request_id == null) {
      bookings.add(p.request_id);
      if (p.ad_variant_id != null) attributed.add(p.request_id);
    }
  }
  const { spend } = (await db.one<{ spend: number }>(
    'SELECT COALESCE(SUM(cost_cents), 0) AS spend FROM ad_metrics_daily WHERE day >= ? AND day < ?', [dayOf(start), dayOf(end)]))!;
  const { requests } = (await db.one<{ requests: number }>(
    'SELECT COUNT(*)::int AS requests FROM booking_requests WHERE ad_variant_id IS NOT NULL AND created_at >= ? AND created_at < ?', [start.toISOString(), end.toISOString()]))!;

  const netAfterAdsCents = platformNetCents - spend;
  const netPerBookingCents = bookings.size > 0 ? Math.round(platformNetCents / bookings.size) : settings.assumedNetPerBookingCents;
  const gap = settings.monthlyNetGoalCents - netAfterAdsCents;
  return {
    month: dayOf(start).slice(0, 7),
    platformNetCents, attributedNetCents,
    bookings: bookings.size, attributedBookings: attributed.size, attributedRequests: requests,
    adSpendCents: spend, netAfterAdsCents,
    goalCents: settings.monthlyNetGoalCents,
    projectedNetCents: Math.round((netAfterAdsCents / daysElapsed) * daysInMonth),
    daysElapsed, daysInMonth, netPerBookingCents,
    bookingsToGoal: gap <= 0 ? 0 : netPerBookingCents > 0 ? Math.ceil(gap / netPerBookingCents) : Infinity,
  };
}
