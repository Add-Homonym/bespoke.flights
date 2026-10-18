/**
 * Cancelling a paid booking.
 *
 * The refund follows the operator's cancellation policy, measured from the
 * first leg's departure: a full refund far enough ahead, a partial refund
 * closer in, nothing inside the final window. Times are compared as local
 * wall-clock values treated as UTC (no time zone library); a leg with no
 * time counts as departing at 23:59 that day, which favours the traveler.
 */

import { z } from 'zod';
import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { bookingCancelledEmail } from '@/lib/email/templates';
import { appBaseUrl, formatMoney } from '@/lib/payments/config';
import { PaymentError, refundPayment } from '@/lib/payments/service';
import { alertStaff } from '@/lib/staff/alerts';
import { fromDbLegs, legLine, tripRoute } from '@/lib/trip-format';
import type { BookingLeg, BookingRequest, Payment } from '@/lib/types';

export const cancellationPolicySchema = z.object({
  /** Cancel at least this many hours before departure for a full refund. */
  full_refund_hours: z.number().int().min(0).max(24 * 365),
  /** Cancel at least this many hours before departure for a partial refund. */
  partial_refund_hours: z.number().int().min(0).max(24 * 365),
  /** Share refunded in the partial window, in basis points (5000 = 50%). */
  partial_refund_bps: z.number().int().min(0).max(10_000),
}).refine(p => p.partial_refund_hours <= p.full_refund_hours, {
  message: 'The partial refund window must be shorter than the full refund window',
  path: ['partial_refund_hours'],
});

export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

export const DEFAULT_POLICY: CancellationPolicy = {
  full_refund_hours: 72,
  partial_refund_hours: 24,
  partial_refund_bps: 5000,
};

/** The stored policy, or the default when missing or malformed. */
export function parsePolicy(raw: string | null | undefined): CancellationPolicy {
  if (!raw) return DEFAULT_POLICY;
  try {
    const parsed = cancellationPolicySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_POLICY;
  } catch {
    return DEFAULT_POLICY;
  }
}

/** Departure instant of a leg, as a UTC timestamp of its local date and time. */
export function departureMs(leg: Pick<BookingLeg, 'departure_date' | 'departure_time'>): number {
  const time = leg.departure_time && /^\d{2}:\d{2}$/.test(leg.departure_time) ? leg.departure_time : '23:59';
  return new Date(`${leg.departure_date}T${time}:00Z`).getTime();
}

export type RefundTier = 'full' | 'partial' | 'none';

export interface RefundQuote {
  tier: RefundTier;
  hoursBeforeDeparture: number;
  refundBps: number;
  refundCents: number;
  paidCents: number;
  policy: CancellationPolicy;
}

/** How much of `paidCents` comes back when cancelling at `now`. */
export function computeRefund(
  policy: CancellationPolicy,
  firstLeg: Pick<BookingLeg, 'departure_date' | 'departure_time'>,
  paidCents: number,
  now = Date.now(),
): RefundQuote {
  const hours = (departureMs(firstLeg) - now) / 3_600_000;
  let tier: RefundTier;
  let bps: number;
  if (hours >= policy.full_refund_hours) { tier = 'full'; bps = 10_000; }
  else if (hours >= policy.partial_refund_hours) { tier = 'partial'; bps = policy.partial_refund_bps; }
  else { tier = 'none'; bps = 0; }
  // A "partial" window at 100% or 0% is reported as what it is.
  if (tier === 'partial' && bps === 10_000) tier = 'full';
  if (tier === 'partial' && bps === 0) tier = 'none';
  return {
    tier,
    hoursBeforeDeparture: Math.max(0, Math.floor(hours)),
    refundBps: bps,
    refundCents: Math.round((paidCents * bps) / 10_000),
    paidCents,
    policy,
  };
}

/** Plain-language policy, for the confirmation panel and emails. */
export function describePolicy(p: CancellationPolicy): string {
  const pct = Math.round(p.partial_refund_bps / 100);
  const parts = [`Full refund ${p.full_refund_hours} hours or more before departure.`];
  if (p.partial_refund_hours < p.full_refund_hours && pct > 0) {
    parts.push(`${pct}% refund between ${p.partial_refund_hours} and ${p.full_refund_hours} hours before.`);
    parts.push(`No refund under ${p.partial_refund_hours} hours.`);
  } else {
    parts.push(`No refund after that.`);
  }
  return parts.join(' ');
}

/** The payment that booked a request: succeeded or partially refunded. */
export async function bookingPayment(db: Db, requestId: number): Promise<(Payment & { cancellation_policy: string | null; company_name: string }) | undefined> {
  return db.one<Payment & { cancellation_policy: string | null; company_name: string }>(`
    SELECT p.*, o.cancellation_policy, o.company_name
    FROM payments p
    JOIN quotes q ON q.id = p.quote_id AND q.status = 'accepted'
    JOIN operators o ON o.id = p.operator_id
    WHERE p.request_id = ? AND p.status IN ('succeeded', 'partially_refunded')
    ORDER BY p.id DESC LIMIT 1
  `, [requestId]);
}

export interface CancellationPreview extends RefundQuote {
  paymentId: number;
  currency: string;
  operatorCompany: string;
  /** Formatted for display. */
  refund: string;
  paid: string;
  policyText: string;
}

/** What cancelling now would refund, or null when the request has no paid booking. */
export async function previewCancellation(db: Db, request: BookingRequest, now = Date.now()): Promise<CancellationPreview | null> {
  if (request.status !== 'booked') return null;
  const payment = await bookingPayment(db, request.id);
  if (!payment) return null;
  const first = await db.one<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order LIMIT 1', [request.id]);
  if (!first) return null;
  const policy = parsePolicy(payment.cancellation_policy);
  const remaining = payment.amount_cents - payment.refunded_cents;
  const quote = computeRefund(policy, first, remaining, now);
  return {
    ...quote,
    paymentId: payment.id,
    currency: payment.currency,
    operatorCompany: payment.company_name,
    refund: formatMoney(quote.refundCents, payment.currency),
    paid: formatMoney(remaining, payment.currency),
    policyText: describePolicy(policy),
  };
}

export interface CancellationResult {
  status: 'cancelled';
  refundCents: number;
  refund: string;
  tier: RefundTier;
}

/**
 * Cancel a paid booking: refund per policy, mark the request cancelled,
 * reject pending quotes, email both sides and alert the operator's staff.
 */
export async function cancelPaidBooking(
  db: Db,
  request: BookingRequest,
  params: { initiatedBy: number; baseUrl?: string; now?: number },
): Promise<CancellationResult> {
  const baseUrl = params.baseUrl ?? appBaseUrl();
  const preview = await previewCancellation(db, request, params.now);
  if (!preview) throw new PaymentError('This trip is not a paid booking', 409);

  // A full refund already cancels the request inside applyRefundTotal and
  // alerts staff; a partial or zero refund needs the status change here.
  if (preview.refundCents > 0) {
    await refundPayment(db, preview.paymentId, {
      amountCents: preview.refundCents,
      reason: `Traveler cancellation (${preview.tier} refund, ${preview.hoursBeforeDeparture} h before departure)`,
      initiatedBy: params.initiatedBy,
      baseUrl,
    });
  }
  const changed = await db.run(
    "UPDATE booking_requests SET status = 'cancelled', updated_at = now() WHERE id = ? AND status <> 'cancelled'", [request.id]);
  await db.run("UPDATE quotes SET status = 'rejected' WHERE request_id = ? AND status = 'pending'", [request.id]);

  const payment = (await db.one<Payment>('SELECT * FROM payments WHERE id = ?', [preview.paymentId]))!;
  if (changed) {
    await alertStaff(db, { kind: 'cancellation', requestId: request.id, operatorId: payment.operator_id }, baseUrl);
  }
  await sendCancellationEmails(db, request.id, payment, preview, baseUrl).catch(err =>
    console.error('Cancellation email failed:', err));

  return { status: 'cancelled', refundCents: preview.refundCents, refund: preview.refund, tier: preview.tier };
}

async function sendCancellationEmails(db: Db, requestId: number, payment: Payment, preview: CancellationPreview, baseUrl: string) {
  const row = (await db.one<{ customer_email: string; company_name: string; operator_email: string | null; operator_user_email: string; passenger_count: number }>(`
    SELECT u.email AS customer_email, o.company_name, o.contact_email AS operator_email, ou.email AS operator_user_email, br.passenger_count
    FROM payments p
    JOIN users u ON u.id = p.customer_id
    JOIN operators o ON o.id = p.operator_id
    JOIN users ou ON ou.id = o.user_id
    JOIN booking_requests br ON br.id = p.request_id
    WHERE p.id = ?
  `, [payment.id]))!;
  const legs = fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId]));
  const data = {
    requestId,
    route: tripRoute(legs),
    legLines: legs.map(legLine),
    passengerCount: row.passenger_count,
    operatorCompany: row.company_name,
    paid: preview.paid,
    refund: preview.refund,
    tier: preview.tier,
    policyText: preview.policyText,
    baseUrl,
  };
  const tags = [{ name: 'type', value: 'booking-cancelled' }, { name: 'request_id', value: String(requestId) }];
  await sendEmail({ to: row.customer_email, ...bookingCancelledEmail({ ...data, audience: 'customer' }), tags });
  await sendEmail({ to: row.operator_email || row.operator_user_email, ...bookingCancelledEmail({ ...data, audience: 'operator' }), tags });
}
