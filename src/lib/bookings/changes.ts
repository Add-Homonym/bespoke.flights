/**
 * Change requests on a booked trip.
 *
 *   traveler proposes → pending
 *     operator accepts, same price  → accepted, applied at once
 *     operator accepts, higher price → accepted; a payment for the difference
 *                                      is created and the change is applied
 *                                      when it is paid (fulfillPayment)
 *     operator accepts, lower price  → accepted; the difference is refunded
 *                                      and the change is applied at once
 *     operator declines              → declined (with a note)
 *     traveler withdraws             → withdrawn
 *
 * Only one change request can be pending per booking.
 */

import { z } from 'zod';
import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { changeRequestEmail } from '@/lib/email/templates';
import { appBaseUrl, computeFees, formatMoney, getPaymentsMode, MIN_CHARGE_CENTS } from '@/lib/payments/config';
import { estimatedProcessingCents, getBusinessModel, resolveCommission } from '@/lib/business-model';
import { PaymentError, refundPayment } from '@/lib/payments/service';
import { alertStaff } from '@/lib/staff/alerts';
import { fromDbLegs, legLine, tripRoute } from '@/lib/trip-format';
import { legSchema } from '@/lib/validations';
import { bookingPayment } from './cancellation';
import type { BookingLeg, BookingRequest, Operator, Payment } from '@/lib/types';

export class ChangeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ChangeError';
  }
}

export const proposeChangeSchema = z.object({
  legs: z.array(legSchema).min(1).max(10),
  passengerCount: z.number().int().min(1).max(999),
  notes: z.string().max(2000).optional(),
});
export type ProposeChangeInput = z.infer<typeof proposeChangeSchema>;

export const resolveChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    /** New all-in price for the whole trip. Omit to keep the current price. */
    newPriceCents: z.number().int().min(MIN_CHARGE_CENTS).max(1_000_000_000).optional(),
    note: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal('decline'), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal('withdraw') }),
]);

export interface ChangeRequest {
  id: number;
  request_id: number;
  requested_by: number;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  proposed_legs: string;
  proposed_passenger_count: number;
  proposed_notes: string | null;
  operator_note: string | null;
  new_price_cents: number | null;
  previous_price_cents: number | null;
  created_at: string;
  resolved_at: string | null;
  applied_at: string | null;
  /** Why it was closed without the operator or traveler acting: 'trip_cancelled'. */
  closed_reason?: string | null;
}

export type ProposedLeg = z.infer<typeof legSchema>;

export function proposedLegs(cr: Pick<ChangeRequest, 'proposed_legs'>): ProposedLeg[] {
  try {
    const parsed = z.array(legSchema).safeParse(JSON.parse(cr.proposed_legs));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function getChangeRequest(db: Db, id: number): Promise<ChangeRequest | undefined> {
  return db.one<ChangeRequest>('SELECT * FROM change_requests WHERE id = ?', [id]);
}

export function listChangeRequests(db: Db, requestId: number): Promise<ChangeRequest[]> {
  return db.query<ChangeRequest>('SELECT * FROM change_requests WHERE request_id = ? ORDER BY id DESC', [requestId]);
}

/** The pending change request on a booking, if any. */
export function pendingChange(db: Db, requestId: number): Promise<ChangeRequest | undefined> {
  return db.one<ChangeRequest>("SELECT * FROM change_requests WHERE request_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [requestId]);
}

// ─── Propose ────────────────────────────────────────────────────────

export async function proposeChange(
  db: Db,
  request: BookingRequest,
  customerId: number,
  input: ProposeChangeInput,
  baseUrl = appBaseUrl(),
): Promise<ChangeRequest> {
  if (request.status !== 'booked') throw new ChangeError('Only a booked trip can be changed', 409);
  const payment = await bookingPayment(db, request.id);
  if (!payment) throw new ChangeError('This trip has no paid booking', 409);
  if (await pendingChange(db, request.id)) throw new ChangeError('A change request is already waiting for the operator', 409);

  const legs = input.legs.map(l => ({
    originCode: l.originCode.toUpperCase(),
    destCode: l.destCode.toUpperCase(),
    departureDate: l.departureDate,
    departureTime: l.departureTime || undefined,
  }));
  const cr = (await db.one<ChangeRequest>(`
    INSERT INTO change_requests (request_id, requested_by, proposed_legs, proposed_passenger_count, proposed_notes, previous_price_cents)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING *
  `, [request.id, customerId, JSON.stringify(legs), input.passengerCount, input.notes?.trim() || null, payment.amount_cents]))!;

  await notify(db, cr, 'proposed', baseUrl).catch(err => console.error('Change request email failed:', err));
  await alertStaff(db, {
    kind: 'change', requestId: request.id, operatorId: payment.operator_id,
    detail: { eventId: cr.id, summary: summarize(cr) },
  }, baseUrl);
  return cr;
}

function summarize(cr: ChangeRequest): string {
  const legs = proposedLegs(cr);
  return `Proposed: ${legs.map(l => `${l.originCode} → ${l.destCode} ${l.departureDate}${l.departureTime ? ` ${l.departureTime}` : ''}`).join('; ')}, ${cr.proposed_passenger_count} pax.`;
}

// ─── Resolve ────────────────────────────────────────────────────────

export interface AcceptResult {
  changeRequest: ChangeRequest;
  /** Set when the traveler must pay more: a stub or Stripe checkout URL. */
  paymentDue?: { paymentId: number; url: string; amountCents: number };
  refundedCents?: number;
}

/** Operator accepts. `operator` must be the one whose quote was accepted. */
export async function acceptChange(
  db: Db,
  changeRequestId: number,
  operator: Pick<Operator, 'id' | 'platform_fee_bps' | 'stripe_account_id' | 'plan' | 'launch_partner'>,
  params: { newPriceCents?: number; note?: string; baseUrl?: string },
): Promise<AcceptResult> {
  const baseUrl = params.baseUrl ?? appBaseUrl();
  const cr = await getChangeRequest(db, changeRequestId);
  if (!cr) throw new ChangeError('Change request not found', 404);
  if (cr.status !== 'pending') throw new ChangeError(`Change request is ${cr.status}`, 409);

  const payment = await bookingPayment(db, cr.request_id);
  if (!payment || payment.operator_id !== operator.id) throw new ChangeError('Forbidden', 403);
  const request = (await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [cr.request_id]))!;
  if (request.status !== 'booked') throw new ChangeError(`Trip is ${request.status}`, 409);

  const currentPrice = payment.amount_cents - payment.refunded_cents;
  const newPrice = params.newPriceCents ?? currentPrice;
  const diff = newPrice - currentPrice;

  // The status guard makes concurrent accepts safe: only one of them goes on to charge or refund.
  const claimed = await db.run(`
    UPDATE change_requests SET status = 'accepted', operator_note = ?, new_price_cents = ?, previous_price_cents = ?, resolved_at = now()
    WHERE id = ? AND status = 'pending'
  `, [params.note?.trim() || null, newPrice, currentPrice, cr.id]);
  if (!claimed) throw new ChangeError('Change request was already answered', 409);

  if (diff > 0) {
    const due = await createDifferenceCheckout(db, cr, payment, operator, diff, baseUrl);
    const updated = (await getChangeRequest(db, cr.id))!;
    await notify(db, updated, 'accepted_payment_due', baseUrl, { amount: formatMoney(diff, payment.currency), url: due.url })
      .catch(err => console.error('Change request email failed:', err));
    return { changeRequest: updated, paymentDue: due };
  }

  if (diff < 0) {
    await refundPayment(db, payment.id, {
      amountCents: -diff,
      reason: `Change request #${cr.id}: price reduced to ${formatMoney(newPrice, payment.currency)}`,
      baseUrl,
    });
  }
  await applyChange(db, cr.id);
  const updated = (await getChangeRequest(db, cr.id))!;
  await notify(db, updated, 'accepted', baseUrl, diff < 0 ? { amount: formatMoney(-diff, payment.currency) } : undefined)
    .catch(err => console.error('Change request email failed:', err));
  return { changeRequest: updated, refundedCents: diff < 0 ? -diff : undefined };
}

export async function declineChange(
  db: Db, changeRequestId: number, operatorId: number, note: string | undefined, baseUrl = appBaseUrl(),
): Promise<ChangeRequest> {
  const cr = await getChangeRequest(db, changeRequestId);
  if (!cr) throw new ChangeError('Change request not found', 404);
  if (cr.status !== 'pending') throw new ChangeError(`Change request is ${cr.status}`, 409);
  const payment = await bookingPayment(db, cr.request_id);
  if (!payment || payment.operator_id !== operatorId) throw new ChangeError('Forbidden', 403);

  const claimed = await db.run("UPDATE change_requests SET status = 'declined', operator_note = ?, resolved_at = now() WHERE id = ? AND status = 'pending'",
    [note?.trim() || null, cr.id]);
  if (!claimed) throw new ChangeError('Change request was already answered', 409);
  const updated = (await getChangeRequest(db, cr.id))!;
  await notify(db, updated, 'declined', baseUrl).catch(err => console.error('Change request email failed:', err));
  return updated;
}

export async function withdrawChange(db: Db, changeRequestId: number, customerId: number): Promise<ChangeRequest> {
  const cr = await getChangeRequest(db, changeRequestId);
  if (!cr) throw new ChangeError('Change request not found', 404);
  if (cr.requested_by !== customerId) throw new ChangeError('Forbidden', 403);
  if (cr.status !== 'pending') throw new ChangeError(`Change request is ${cr.status}`, 409);
  const claimed = await db.run("UPDATE change_requests SET status = 'withdrawn', resolved_at = now() WHERE id = ? AND status = 'pending'", [cr.id]);
  if (!claimed) throw new ChangeError('Change request was already answered', 409);
  return (await getChangeRequest(db, cr.id))!;
}

// ─── Apply ──────────────────────────────────────────────────────────

/** Write the proposed legs, passengers and notes onto the booking. Idempotent. */
export async function applyChange(db: Db, changeRequestId: number): Promise<boolean> {
  return db.transaction(async tx => {
    const cr = await tx.one<ChangeRequest>('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [changeRequestId]);
    if (!cr || cr.status !== 'accepted' || cr.applied_at) return false;
    const legs = proposedLegs(cr);
    if (legs.length === 0) return false;

    await tx.run('DELETE FROM booking_legs WHERE request_id = ?', [cr.request_id]);
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      await tx.run(
        'INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)',
        [cr.request_id, i + 1, l.originCode, l.destCode, l.departureDate, l.departureTime || null]);
    }
    await tx.run('UPDATE booking_requests SET passenger_count = ?, notes = ?, updated_at = now() WHERE id = ?',
      [cr.proposed_passenger_count, cr.proposed_notes, cr.request_id]);
    await tx.run('UPDATE change_requests SET applied_at = now() WHERE id = ?', [cr.id]);
    return true;
  });
}

/**
 * Called by payment fulfillment when a difference payment succeeds: apply the
 * change, email both sides and alert staff. Idempotent.
 */
export async function onChangePaymentSucceeded(db: Db, payment: Payment & { change_request_id?: number | null }, baseUrl: string) {
  if (!payment.change_request_id) return;
  const applied = await applyChange(db, payment.change_request_id);
  if (!applied) return;
  const cr = (await getChangeRequest(db, payment.change_request_id))!;
  await notify(db, cr, 'applied', baseUrl).catch(err => console.error('Change request email failed:', err));
}

// ─── Difference payment ─────────────────────────────────────────────

async function createDifferenceCheckout(
  db: Db, cr: ChangeRequest, booking: Payment, operator: Pick<Operator, 'id' | 'platform_fee_bps' | 'stripe_account_id' | 'plan' | 'launch_partner'>,
  diff: number, baseUrl: string,
) {
  const mode = getPaymentsMode();
  if (mode === 'disabled') throw new PaymentError('Payments are not configured', 503);
  if (diff < MIN_CHARGE_CENTS) throw new ChangeError(`The price difference must be at least ${formatMoney(MIN_CHARGE_CENTS, booking.currency)}`, 400);

  // Only one open difference checkout per change request.
  await db.run("UPDATE payments SET status = 'canceled', failure_reason = 'Superseded', updated_at = now() WHERE change_request_id = ? AND status = 'pending'", [cr.id]);

  const model = await getBusinessModel(db);
  const commission = await resolveCommission(db, model, operator);
  const fees = computeFees(diff, commission.bps, estimatedProcessingCents(model, diff));
  const provider = mode === 'stripe' ? 'stripe' : 'stub';
  const paymentId = (await db.one<{ id: number }>(`
    INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents,
      operator_payout_cents, currency, status, provider, stripe_destination_account, change_request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?) RETURNING id
  `, [booking.request_id, booking.quote_id, booking.customer_id, operator.id, fees.amountCents, fees.platformFeeCents,
    fees.operatorPayoutCents, booking.currency, provider, operator.stripe_account_id ?? null, cr.id]))!.id;

  const requestUrl = `${baseUrl}/requests/${booking.request_id}`;
  if (provider === 'stub') {
    const url = `${requestUrl}?checkout=stub&payment=${paymentId}`;
    await db.run('UPDATE payments SET checkout_url = ? WHERE id = ?', [url, paymentId]);
    return { paymentId, url, amountCents: diff };
  }

  const { getStripe } = await import('@/lib/payments/stripe');
  const { allowedPaymentMethods, CHECKOUT_TTL_SECONDS } = await import('@/lib/payments/config');
  const customer = (await db.one<{ email: string }>('SELECT email FROM users WHERE id = ?', [booking.customer_id]))!;
  const metadata = { payment_id: String(paymentId), request_id: String(booking.request_id), change_request_id: String(cr.id), operator_id: String(operator.id) };
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: String(paymentId),
      customer_email: customer.email,
      allowed_payment_method_types: allowedPaymentMethods(booking.currency),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: diff,
          product_data: { name: `Itinerary change: request #${booking.request_id}`, description: summarize(cr).slice(0, 1000) },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fees.platformFeeCents,
        on_behalf_of: operator.stripe_account_id!,
        transfer_data: { destination: operator.stripe_account_id! },
        description: `Change request #${cr.id} on charter request #${booking.request_id}`,
        metadata,
      },
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
      success_url: `${requestUrl}?checkout=success`,
      cancel_url: `${requestUrl}?checkout=canceled`,
    }, { idempotencyKey: `checkout-payment-${paymentId}` });
    await db.run('UPDATE payments SET stripe_checkout_session_id = ?, checkout_url = ?, updated_at = now() WHERE id = ?',
      [session.id, session.url, paymentId]);
    return { paymentId, url: session.url!, amountCents: diff };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.run("UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = now() WHERE id = ?", [`Checkout creation failed: ${message}`, paymentId]);
    throw new PaymentError('Could not start checkout', 502);
  }
}

// ─── Email ──────────────────────────────────────────────────────────

type ChangeEvent = 'proposed' | 'accepted' | 'accepted_payment_due' | 'applied' | 'declined';

async function notify(db: Db, cr: ChangeRequest, event: ChangeEvent, baseUrl: string, extra?: { amount?: string; url?: string }) {
  const row = (await db.one<{
    customer_email: string; customer_name: string; company_name: string; operator_email: string | null; operator_user_email: string;
  }>(`
    SELECT u.email AS customer_email, u.name AS customer_name, o.company_name, o.contact_email AS operator_email, ou.email AS operator_user_email
    FROM change_requests cr
    JOIN booking_requests br ON br.id = cr.request_id
    JOIN users u ON u.id = br.customer_id
    JOIN quotes q ON q.request_id = br.id AND q.status = 'accepted'
    JOIN operators o ON o.id = q.operator_id
    JOIN users ou ON ou.id = o.user_id
    WHERE cr.id = ?
  `, [cr.id]))!;
  const current = fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [cr.request_id]));
  const proposed = proposedLegs(cr).map(l => ({ from: l.originCode, to: l.destCode, date: l.departureDate, time: l.departureTime ?? '' }));
  const data = {
    requestId: cr.request_id,
    changeRequestId: cr.id,
    route: tripRoute(proposed),
    proposedLegLines: proposed.map(legLine),
    currentLegLines: current.map(legLine),
    passengerCount: cr.proposed_passenger_count,
    notes: cr.proposed_notes,
    operatorNote: cr.operator_note,
    operatorCompany: row.company_name,
    customerName: row.customer_name,
    amount: extra?.amount ?? null,
    url: extra?.url ?? null,
    baseUrl,
  };
  const tags = [{ name: 'type', value: `change-${event}` }, { name: 'request_id', value: String(cr.request_id) }];
  if (event === 'proposed') {
    await sendEmail({ to: row.operator_email || row.operator_user_email, ...changeRequestEmail({ ...data, event, audience: 'operator' }), tags });
  } else if (event === 'applied' || event === 'accepted') {
    await sendEmail({ to: row.customer_email, ...changeRequestEmail({ ...data, event, audience: 'customer' }), tags });
    await sendEmail({ to: row.operator_email || row.operator_user_email, ...changeRequestEmail({ ...data, event, audience: 'operator' }), tags });
  } else {
    await sendEmail({ to: row.customer_email, ...changeRequestEmail({ ...data, event, audience: 'customer' }), tags });
  }
}

// ─── Page view ──────────────────────────────────────────────────────

/** Change requests for a request page, with display fields the components need. */
export async function changeRequestViews(db: Db, requestId: number, currency = 'USD') {
  const rows = await listChangeRequests(db, requestId);
  if (rows.length === 0) return [];
  const open = await db.query<{ change_request_id: number; checkout_url: string | null; amount_cents: number }>(
    "SELECT change_request_id, checkout_url, amount_cents FROM payments WHERE request_id = ? AND change_request_id IS NOT NULL AND status = 'pending'",
    [requestId]);
  const due = new Map(open.map(p => [p.change_request_id, p]));
  return rows.map(cr => {
    const p = due.get(cr.id);
    return {
      ...cr,
      proposed_legs: proposedLegs(cr),
      newPrice: cr.new_price_cents != null && cr.new_price_cents !== cr.previous_price_cents ? formatMoney(cr.new_price_cents, currency) : null,
      paymentDue: p?.checkout_url && cr.status === 'accepted' && !cr.applied_at ? { url: p.checkout_url, amount: formatMoney(p.amount_cents, currency) } : null,
    };
  });
}
