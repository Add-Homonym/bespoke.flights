/**
 * Payments service.
 *
 * Flow:
 *   1. Customer chooses a pending quote → createCheckout() inserts a `payments`
 *      row and opens a Stripe Checkout Session (destination charge to the
 *      operator's Connect account, platform fee retained as application fee).
 *   2. Stripe webhook → handleStripeEvent() → markPaymentSucceeded(), which
 *      accepts the quote, rejects the others and books the request.
 *   3. If a second payment for the same request succeeds (race between two
 *      open sessions), it is refunded automatically.
 *
 * In stub mode (no STRIPE_SECRET_KEY, non-production) the same state machine
 * runs, but checkout is completed via simulateStubPayment().
 */

import type Database from 'better-sqlite3';
import type Stripe from 'stripe';
import { getStripe } from './stripe';
import {
  getPaymentsMode,
  platformFeeBps,
  computeFees,
  MIN_CHARGE_CENTS,
  CHECKOUT_TTL_SECONDS,
  allowedPaymentMethods,
  formatMoney,
} from './config';
import { sendEmail } from '@/lib/email/resend';
import { paymentReceiptEmail, bookingConfirmedOperatorEmail } from '@/lib/email/templates';
import type { Payment, Quote, BookingRequest, Operator, BookingLeg } from '@/lib/types';

export class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'PaymentError';
  }
}

const SETTLED_STATUSES = ['succeeded', 'refunded', 'partially_refunded'] as const;

function getPayment(db: Database.Database, id: number): Payment | undefined {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | undefined;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Checkout ───────────────────────────────────────────────────────

export interface CheckoutResult {
  paymentId: number;
  url: string;
  provider: 'stripe' | 'stub';
}

export async function createCheckout(
  db: Database.Database,
  params: { quoteId: number; customerId: number; baseUrl: string }
): Promise<CheckoutResult> {
  const mode = getPaymentsMode();
  if (mode === 'disabled') {
    throw new PaymentError('Payments are not configured', 503);
  }

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(params.quoteId) as Quote | undefined;
  if (!quote) throw new PaymentError('Quote not found', 404);

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(quote.request_id) as BookingRequest;
  if (request.customer_id !== params.customerId) throw new PaymentError('Quote not found', 404);

  if (quote.status !== 'pending') throw new PaymentError(`Quote is ${quote.status}`, 409);
  if (!['open', 'quoted'].includes(request.status)) {
    throw new PaymentError(`Request is ${request.status}`, 409);
  }
  if (quote.valid_until && quote.valid_until < todayUtc()) {
    throw new PaymentError('Quote has expired', 409);
  }
  if (quote.price_cents < MIN_CHARGE_CENTS) {
    throw new PaymentError('Quote amount is below the minimum charge', 400);
  }

  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(quote.operator_id) as Operator;
  if (operator.status !== 'approved') {
    throw new PaymentError('Operator is not currently approved', 409);
  }
  if (mode === 'stripe' && (!operator.stripe_account_id || !operator.stripe_charges_enabled)) {
    throw new PaymentError('Operator has not completed payout setup', 409);
  }

  const inFlight = db.prepare(`
    SELECT id FROM payments WHERE request_id = ? AND status IN ('processing', 'succeeded', 'partially_refunded')
  `).get(request.id);
  if (inFlight) {
    throw new PaymentError('A payment for this request is already in progress or complete', 409);
  }

  // Close any other open checkout for this request so only one can be paid.
  await supersedePendingPayments(db, request.id);

  const fees = computeFees(quote.price_cents, platformFeeBps(operator.platform_fee_bps));
  const provider = mode === 'stripe' ? 'stripe' : 'stub';

  const paymentId = Number(db.prepare(`
    INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents,
      operator_payout_cents, currency, status, provider, stripe_destination_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    request.id, quote.id, params.customerId, operator.id,
    fees.amountCents, fees.platformFeeCents, fees.operatorPayoutCents,
    quote.currency.toUpperCase(), provider, operator.stripe_account_id ?? null,
  ).lastInsertRowid);

  const requestUrl = `${params.baseUrl}/requests/${request.id}`;

  if (provider === 'stub') {
    const url = `${requestUrl}?checkout=stub&payment=${paymentId}`;
    db.prepare('UPDATE payments SET checkout_url = ? WHERE id = ?').run(url, paymentId);
    return { paymentId, url, provider };
  }

  const customer = db.prepare('SELECT email FROM users WHERE id = ?').get(params.customerId) as { email: string };
  const route = routeLabel(db, request.id);
  const metadata = {
    payment_id: String(paymentId),
    quote_id: String(quote.id),
    request_id: String(request.id),
    operator_id: String(operator.id),
  };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: String(paymentId),
      customer_email: customer.email,
      allowed_payment_method_types: allowedPaymentMethods(quote.currency),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: quote.currency.toLowerCase(),
          unit_amount: fees.amountCents,
          product_data: {
            name: `Private charter: ${route}`,
            description: `${operator.company_name} · Request #${request.id} · ${request.passenger_count} pax`,
          },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fees.platformFeeCents,
        on_behalf_of: operator.stripe_account_id!,
        transfer_data: { destination: operator.stripe_account_id! },
        description: `Charter request #${request.id} — ${operator.company_name}`,
        metadata,
      },
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
      success_url: `${requestUrl}?checkout=success`,
      cancel_url: `${requestUrl}?checkout=canceled`,
    }, { idempotencyKey: `checkout-payment-${paymentId}` });

    db.prepare(`
      UPDATE payments SET stripe_checkout_session_id = ?, checkout_url = ?, updated_at = datetime('now') WHERE id = ?
    `).run(session.id, session.url, paymentId);

    return { paymentId, url: session.url!, provider };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`
      UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = datetime('now') WHERE id = ?
    `).run(`Checkout creation failed: ${message}`, paymentId);
    console.error('Stripe checkout creation failed:', message);
    throw new PaymentError('Could not start checkout', 502);
  }
}

/**
 * Cancel open checkouts for a request. A session that turns out to be already
 * complete means the customer has paid; that blocks a new checkout.
 */
async function supersedePendingPayments(db: Database.Database, requestId: number, exceptPaymentId?: number) {
  const pending = db.prepare(`
    SELECT * FROM payments WHERE request_id = ? AND status = 'pending' AND id != ?
  `).all(requestId, exceptPaymentId ?? -1) as Payment[];

  for (const payment of pending) {
    if (payment.provider === 'stripe' && payment.stripe_checkout_session_id) {
      const stripe = getStripe();
      try {
        await stripe.checkout.sessions.expire(payment.stripe_checkout_session_id);
      } catch {
        const session = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
        if (session.status === 'complete') {
          throw new PaymentError('A payment for this request is already in progress', 409);
        }
      }
    }
    db.prepare(`
      UPDATE payments SET status = 'canceled', failure_reason = 'Superseded by a new checkout', updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(payment.id);
  }
}

// ─── State transitions ──────────────────────────────────────────────

export type FulfillmentOutcome = 'booked' | 'duplicate' | 'conflict';

/**
 * Record a successful payment and book the request. Idempotent.
 *
 * Returns 'conflict' when the request was already booked by a different
 * payment, or the quote is no longer available; the caller must refund.
 */
export function markPaymentSucceeded(
  db: Database.Database,
  paymentId: number,
  details: { paymentIntentId?: string | null } = {}
): FulfillmentOutcome {
  const run = db.transaction((): FulfillmentOutcome => {
    const payment = getPayment(db, paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if ((SETTLED_STATUSES as readonly string[]).includes(payment.status)) {
      // A succeeded payment whose quote never got accepted is a conflict whose
      // refund has not gone through yet (e.g. Stripe error, webhook retried).
      const quoteStatus = (db.prepare('SELECT status FROM quotes WHERE id = ?').get(payment.quote_id) as { status: string }).status;
      return payment.status === 'succeeded' && quoteStatus !== 'accepted' ? 'conflict' : 'duplicate';
    }

    db.prepare(`
      UPDATE payments SET status = 'succeeded', paid_at = datetime('now'), updated_at = datetime('now'),
        failure_reason = NULL,
        stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
      WHERE id = ?
    `).run(details.paymentIntentId ?? null, paymentId);

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(payment.quote_id) as Quote;
    const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(payment.request_id) as BookingRequest;

    if (quote.status !== 'pending' || !['open', 'quoted'].includes(request.status)) {
      return 'conflict';
    }

    db.prepare("UPDATE quotes SET status = 'accepted' WHERE id = ?").run(quote.id);
    db.prepare("UPDATE quotes SET status = 'rejected' WHERE request_id = ? AND id != ? AND status = 'pending'")
      .run(request.id, quote.id);
    db.prepare("UPDATE booking_requests SET status = 'booked', updated_at = datetime('now') WHERE id = ?")
      .run(request.id);
    return 'booked';
  });
  return run.immediate();
}

export function markPaymentProcessing(db: Database.Database, paymentId: number, paymentIntentId?: string | null) {
  db.prepare(`
    UPDATE payments SET status = 'processing', updated_at = datetime('now'),
      stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
    WHERE id = ? AND status IN ('pending', 'canceled')
  `).run(paymentIntentId ?? null, paymentId);
}

export function markPaymentFailed(db: Database.Database, paymentId: number, reason: string) {
  db.prepare(`
    UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND status IN ('pending', 'processing', 'canceled')
  `).run(reason, paymentId);
}

export function markPaymentCanceled(db: Database.Database, paymentId: number, reason: string) {
  db.prepare(`
    UPDATE payments SET status = 'canceled', failure_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(reason, paymentId);
}

/**
 * Set the refunded total (absolute, so repeated webhook deliveries are safe).
 * A full refund of the payment that booked a request cancels the booking.
 */
export function applyRefundTotal(db: Database.Database, paymentId: number, refundedCents: number) {
  db.transaction(() => {
    const payment = getPayment(db, paymentId);
    if (!payment) return;
    const total = Math.min(Math.max(refundedCents, payment.refunded_cents), payment.amount_cents);
    if (total <= 0) return;
    const status = total >= payment.amount_cents ? 'refunded' : 'partially_refunded';

    db.prepare(`
      UPDATE payments SET refunded_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(total, status, paymentId);

    if (status === 'refunded') {
      const quote = db.prepare('SELECT status FROM quotes WHERE id = ?').get(payment.quote_id) as { status: string };
      if (quote.status === 'accepted') {
        db.prepare(`
          UPDATE booking_requests SET status = 'cancelled', updated_at = datetime('now')
          WHERE id = ? AND status = 'booked'
        `).run(payment.request_id);
      }
    }
  })();
}

// ─── Refunds ────────────────────────────────────────────────────────

export async function refundPayment(
  db: Database.Database,
  paymentId: number,
  params: { amountCents?: number; reason?: string | null; initiatedBy?: number | null }
): Promise<Payment> {
  const payment = getPayment(db, paymentId);
  if (!payment) throw new PaymentError('Payment not found', 404);
  if (!['succeeded', 'partially_refunded'].includes(payment.status)) {
    throw new PaymentError(`Cannot refund a payment that is ${payment.status}`, 409);
  }

  const remaining = payment.amount_cents - payment.refunded_cents;
  const amount = params.amountCents ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw new PaymentError(`Refund amount must be between 1 and ${remaining} cents`, 400);
  }

  let stripeRefundId: string | null = null;
  if (payment.provider === 'stripe') {
    if (!payment.stripe_payment_intent_id) {
      throw new PaymentError('Payment has no Stripe PaymentIntent', 409);
    }
    try {
      const refund = await getStripe().refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount,
        // Pull the funds back from the operator and return the platform fee pro rata.
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { payment_id: String(payment.id), request_id: String(payment.request_id) },
      }, { idempotencyKey: `refund-${payment.id}-${payment.refunded_cents}-${amount}` });
      stripeRefundId = refund.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Stripe refund failed:', message);
      throw new PaymentError(`Refund failed: ${message}`, 502);
    }
  }

  db.prepare(`
    INSERT OR IGNORE INTO refunds (payment_id, amount_cents, reason, stripe_refund_id, initiated_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(payment.id, amount, params.reason ?? null, stripeRefundId, params.initiatedBy ?? null);
  applyRefundTotal(db, payment.id, payment.refunded_cents + amount);

  return getPayment(db, payment.id)!;
}

// ─── Fulfillment side effects ───────────────────────────────────────

/** Apply a successful payment: book, notify, and refund on conflict. */
export async function fulfillPayment(
  db: Database.Database,
  paymentId: number,
  details: { paymentIntentId?: string | null; baseUrl: string }
): Promise<FulfillmentOutcome> {
  const outcome = markPaymentSucceeded(db, paymentId, details);

  if (outcome === 'booked') {
    // Other checkouts for this request can no longer complete a booking.
    const payment = getPayment(db, paymentId)!;
    await supersedePendingPayments(db, payment.request_id, paymentId).catch(err =>
      console.error('Failed to close other checkouts:', err)
    );
    await sendBookingEmails(db, paymentId, details.baseUrl).catch(err =>
      console.error('Booking email failed:', err)
    );
  } else if (outcome === 'conflict') {
    await refundPayment(db, paymentId, {
      reason: 'Automatic refund: request already booked or quote no longer available',
    });
  }

  return outcome;
}

/** Stub mode only: complete a pending payment as if Stripe had confirmed it. */
export async function simulateStubPayment(
  db: Database.Database,
  paymentId: number,
  customerId: number,
  baseUrl: string
): Promise<FulfillmentOutcome> {
  if (getPaymentsMode() !== 'stub') throw new PaymentError('Not available', 404);
  const payment = getPayment(db, paymentId);
  if (!payment || payment.customer_id !== customerId || payment.provider !== 'stub') {
    throw new PaymentError('Payment not found', 404);
  }
  if (payment.status !== 'pending') throw new PaymentError(`Payment is ${payment.status}`, 409);
  return fulfillPayment(db, paymentId, { paymentIntentId: null, baseUrl });
}

function routeLabel(db: Database.Database, requestId: number): string {
  const legs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order').all(requestId) as BookingLeg[];
  return legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');
}

async function sendBookingEmails(db: Database.Database, paymentId: number, baseUrl: string) {
  const row = db.prepare(`
    SELECT p.*, u.email AS customer_email, br.passenger_count,
      o.company_name, o.contact_email AS operator_email, ou.email AS operator_user_email,
      a.type AS aircraft_type, a.tail_number
    FROM payments p
    JOIN users u ON u.id = p.customer_id
    JOIN booking_requests br ON br.id = p.request_id
    JOIN operators o ON o.id = p.operator_id
    JOIN users ou ON ou.id = o.user_id
    JOIN quotes q ON q.id = p.quote_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE p.id = ?
  `).get(paymentId) as Payment & {
    customer_email: string; passenger_count: number; company_name: string;
    operator_email: string | null; operator_user_email: string;
    aircraft_type: string | null; tail_number: string | null;
  };

  const legs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order').all(row.request_id) as BookingLeg[];
  const dateRange = legs.length > 1
    ? `${legs[0].departure_date} — ${legs[legs.length - 1].departure_date}`
    : legs[0]?.departure_date ?? '';

  const data = {
    requestId: row.request_id,
    route: routeLabel(db, row.request_id),
    dateRange,
    passengerCount: row.passenger_count,
    operatorCompany: row.company_name,
    aircraft: row.aircraft_type ? `${row.aircraft_type}${row.tail_number ? ` (${row.tail_number})` : ''}` : null,
    amount: formatMoney(row.amount_cents, row.currency),
    baseUrl,
  };

  const receipt = paymentReceiptEmail(data);
  const confirmation = bookingConfirmedOperatorEmail({
    ...data,
    platformFee: formatMoney(row.platform_fee_cents, row.currency),
    payout: formatMoney(row.operator_payout_cents, row.currency),
  });
  const tags = [{ name: 'type', value: 'booking-confirmed' }, { name: 'request_id', value: String(row.request_id) }];

  await sendEmail({ to: row.customer_email, ...receipt, tags });
  await sendEmail({ to: row.operator_email || row.operator_user_email, ...confirmation, tags });
}

// ─── Stripe Connect (operator payouts) ──────────────────────────────

export function syncConnectAccount(db: Database.Database, account: Stripe.Account) {
  db.prepare(`
    UPDATE operators SET stripe_charges_enabled = ?, stripe_payouts_enabled = ?, stripe_details_submitted = ?
    WHERE stripe_account_id = ?
  `).run(account.charges_enabled ? 1 : 0, account.payouts_enabled ? 1 : 0, account.details_submitted ? 1 : 0, account.id);
}

/** Create (if needed) the operator's Express account and return an onboarding link. */
export async function startConnectOnboarding(
  db: Database.Database,
  operatorId: number,
  baseUrl: string
): Promise<string> {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(operatorId) as Operator | undefined;
  if (!operator) throw new PaymentError('Operator not found', 404);

  const mode = getPaymentsMode();
  if (mode === 'disabled') throw new PaymentError('Payments are not configured', 503);

  const returnUrl = `${baseUrl}/operator/settings?payouts=return`;

  if (mode === 'stub') {
    db.prepare(`
      UPDATE operators SET stripe_account_id = COALESCE(stripe_account_id, ?),
        stripe_charges_enabled = 1, stripe_payouts_enabled = 1, stripe_details_submitted = 1
      WHERE id = ?
    `).run(`acct_stub_${operator.id}`, operator.id);
    return returnUrl;
  }

  const stripe = getStripe();
  let accountId = operator.stripe_account_id;
  if (!accountId) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(operator.user_id) as { email: string };
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: operator.contact_email || user.email,
      business_type: 'company',
      business_profile: { name: operator.company_name, mcc: '4522' }, // 4522: airlines, air carriers (non-scheduled)
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { operator_id: String(operator.id) },
    }, { idempotencyKey: `connect-account-${operator.id}` });
    accountId = account.id;
    db.prepare('UPDATE operators SET stripe_account_id = ? WHERE id = ?').run(accountId, operator.id);
    syncConnectAccount(db, account);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${baseUrl}/operator/settings?payouts=refresh`,
    return_url: returnUrl,
  });
  return link.url;
}

/** Refresh capability flags from Stripe. */
export async function refreshConnectAccount(db: Database.Database, operatorId: number): Promise<Operator> {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(operatorId) as Operator;
  if (getPaymentsMode() === 'stripe' && operator.stripe_account_id) {
    const account = await getStripe().accounts.retrieve(operator.stripe_account_id);
    syncConnectAccount(db, account);
  }
  return db.prepare('SELECT * FROM operators WHERE id = ?').get(operatorId) as Operator;
}

export async function connectDashboardLink(db: Database.Database, operatorId: number): Promise<string> {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(operatorId) as Operator;
  if (getPaymentsMode() !== 'stripe' || !operator.stripe_account_id) {
    throw new PaymentError('No payout account', 409);
  }
  const link = await getStripe().accounts.createLoginLink(operator.stripe_account_id);
  return link.url;
}

// ─── Webhooks ───────────────────────────────────────────────────────

function paymentForSession(db: Database.Database, session: Stripe.Checkout.Session): Payment | undefined {
  const byId = db.prepare('SELECT * FROM payments WHERE stripe_checkout_session_id = ?').get(session.id) as Payment | undefined;
  if (byId) return byId;
  const metaId = Number(session.metadata?.payment_id);
  if (!metaId) return undefined;
  const byMeta = getPayment(db, metaId);
  // Only trust metadata when the session id was never recorded (crash between create and update).
  if (byMeta && !byMeta.stripe_checkout_session_id) {
    db.prepare('UPDATE payments SET stripe_checkout_session_id = ? WHERE id = ?').run(session.id, byMeta.id);
    return byMeta;
  }
  return undefined;
}

function paymentForIntent(db: Database.Database, intent: string | Stripe.PaymentIntent | null): Payment | undefined {
  const id = typeof intent === 'string' ? intent : intent?.id;
  if (!id) return undefined;
  return db.prepare('SELECT * FROM payments WHERE stripe_payment_intent_id = ?').get(id) as Payment | undefined;
}

function intentId(intent: string | Stripe.PaymentIntent | null): string | null {
  return typeof intent === 'string' ? intent : intent?.id ?? null;
}

/**
 * Process a verified Stripe event. Safe to call more than once per event:
 * already-processed events are skipped and every handler is idempotent.
 */
export async function handleStripeEvent(
  db: Database.Database,
  event: Stripe.Event,
  baseUrl: string
): Promise<'processed' | 'skipped'> {
  const existing = db.prepare('SELECT processed_at FROM payment_events WHERE stripe_event_id = ?')
    .get(event.id) as { processed_at: string | null } | undefined;
  if (existing?.processed_at) return 'skipped';
  if (!existing) {
    db.prepare('INSERT INTO payment_events (stripe_event_id, type) VALUES (?, ?)').run(event.id, event.type);
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = paymentForSession(db, session);
      if (!payment) break;
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        await fulfillPayment(db, payment.id, { paymentIntentId: intentId(session.payment_intent), baseUrl });
      } else {
        // ACH and other delayed methods: funds not yet confirmed.
        markPaymentProcessing(db, payment.id, intentId(session.payment_intent));
      }
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = paymentForSession(db, session);
      if (payment) markPaymentFailed(db, payment.id, 'Bank payment failed');
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = paymentForSession(db, session);
      if (payment) markPaymentCanceled(db, payment.id, 'Checkout expired');
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const payment = paymentForIntent(db, charge.payment_intent);
      if (payment) applyRefundTotal(db, payment.id, charge.amount_refunded);
      break;
    }
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed': {
      const dispute = event.data.object as Stripe.Dispute;
      const payment = paymentForIntent(db, dispute.payment_intent);
      if (payment) {
        db.prepare("UPDATE payments SET dispute_status = ?, updated_at = datetime('now') WHERE id = ?")
          .run(dispute.status, payment.id);
      }
      break;
    }
    case 'account.updated': {
      syncConnectAccount(db, event.data.object as Stripe.Account);
      break;
    }
    default:
      break;
  }

  db.prepare("UPDATE payment_events SET processed_at = datetime('now') WHERE stripe_event_id = ?").run(event.id);
  return 'processed';
}
