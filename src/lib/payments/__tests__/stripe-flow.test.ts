import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { createFixture, row, type Fixture } from './fixtures';
import { setStripeClient } from '../stripe';
import { createCheckout, handleStripeEvent, refundPayment, startConnectOnboarding, PaymentError } from '../service';
import type { Payment } from '@/lib/types';

const BASE = 'https://bespoke.flights';
let f: Fixture;

function mockStripe() {
  let n = 0;
  return {
    checkout: {
      sessions: {
        create: vi.fn(async () => { n++; return { id: `cs_test_${n}`, url: `https://checkout.stripe.com/c/cs_test_${n}` }; }),
        expire: vi.fn(async (id: string) => ({ id, status: 'expired' })),
        retrieve: vi.fn(async (id: string) => ({ id, status: 'open' })),
      },
    },
    refunds: { create: vi.fn(async () => ({ id: 're_test_1' })) },
    accounts: {
      create: vi.fn(async () => ({ id: 'acct_new', charges_enabled: false, payouts_enabled: false, details_submitted: false })),
      retrieve: vi.fn(),
      createLoginLink: vi.fn(),
    },
    accountLinks: { create: vi.fn(async () => ({ url: 'https://connect.stripe.com/setup/e/acct_new' })) },
  };
}

let stripe: ReturnType<typeof mockStripe>;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('PLATFORM_FEE_BPS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stripe = mockStripe();
  setStripeClient(stripe as unknown as Stripe);
  f = await createFixture();
});

afterEach(() => {
  setStripeClient(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const payment = (id: number) => row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', id);
const status = async (table: string, id: number) => (await row<{ status: string }>(f.db, `SELECT status FROM ${table} WHERE id = ?`, id)).status;

let eventSeq = 0;
function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${++eventSeq}`, type, data: { object } } as unknown as Stripe.Event;
}

describe('createCheckout (Stripe)', () => {
  it('creates a destination charge with the platform fee and idempotency key', async () => {
    const res = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    expect(res).toEqual({ paymentId: res.paymentId, url: 'https://checkout.stripe.com/c/cs_test_1', provider: 'stripe' });

    const [params, opts] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, { idempotencyKey: string }];
    expect(opts.idempotencyKey).toBe(`checkout-payment-${res.paymentId}`);
    expect(params.mode).toBe('payment');
    expect(params.customer_email).toBe('cust@example.com');
    expect(params.line_items![0].price_data!.unit_amount).toBe(8_500_000);
    expect(params.line_items![0].price_data!.currency).toBe('usd');
    expect(params.line_items![0].price_data!.product_data!.name).toBe('Private charter: KLAX → PHNL → KLAX');
    const description = params.line_items![0].price_data!.product_data!.description!;
    expect(description).toContain('Alpha Air · Request #');
    expect(description).toMatch(/Leg 1: KLAX → PHNL · \w{3}, \w{3} \d{1,2}, \d{4}, any time/);
    expect(description).toMatch(/Leg 2: PHNL → KLAX · /);
    expect(description).toContain('4 passengers');
    expect(description).toContain('Special requests: none');
    expect(params.payment_intent_data!.application_fee_amount).toBe(425_000);
    expect(params.payment_intent_data!.transfer_data!.destination).toBe('acct_alpha');
    expect(params.payment_intent_data!.on_behalf_of).toBe('acct_alpha');
    expect(params.metadata!.payment_id).toBe(String(res.paymentId));
    expect(params.success_url).toBe(`${BASE}/requests/${f.requestId}?checkout=success`);
    expect(params.allowed_payment_method_types).toEqual(['card', 'us_bank_account']);

    const p = await payment(res.paymentId);
    expect(p.stripe_checkout_session_id).toBe('cs_test_1');
    expect(p.stripe_destination_account).toBe('acct_alpha');
  });

  it('requires the operator to have completed Connect onboarding', async () => {
    await f.db.run('UPDATE operators SET stripe_charges_enabled = 0 WHERE id = ?', [f.operatorA]);
    await expect(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }))
      .rejects.toMatchObject({ status: 409, message: 'Operator has not completed payout setup' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('marks the payment failed when Stripe errors', async () => {
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('card_declined'));
    await expect(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }))
      .rejects.toMatchObject({ status: 502 });
    const p = await row<Payment>(f.db, 'SELECT * FROM payments ORDER BY id DESC LIMIT 1');
    expect(p.status).toBe('failed');
    expect(p.failure_reason).toContain('card_declined');
  });

  it('expires the previous open session when the customer switches quotes', async () => {
    const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_test_1');
    expect((await payment(first.paymentId)).status).toBe('canceled');
  });

  it('refuses to start a new checkout if the previous session already completed', async () => {
    await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('session is complete'));
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_test_1', status: 'complete' });
    await expect(createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE }))
      .rejects.toBeInstanceOf(PaymentError);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});

describe('handleStripeEvent', () => {
  async function checkout() {
    const res = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    return { id: res.paymentId, session: `cs_test_${stripe.checkout.sessions.create.mock.calls.length}` };
  }

  it('books on checkout.session.completed (card) and skips redelivery', async () => {
    const { id, session } = await checkout();
    const ev = event('checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_1', metadata: { payment_id: String(id) } });

    expect(await handleStripeEvent(f.db, ev, BASE)).toBe('processed');
    expect((await payment(id)).status).toBe('succeeded');
    expect((await payment(id)).stripe_payment_intent_id).toBe('pi_1');
    expect(await status('booking_requests', f.requestId)).toBe('booked');
    expect(await status('quotes', f.quoteA)).toBe('accepted');

    expect(await handleStripeEvent(f.db, ev, BASE)).toBe('skipped');
  });

  it('handles delayed bank payments: processing → succeeded', async () => {
    const { id, session } = await checkout();
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: session, payment_status: 'unpaid', payment_intent: 'pi_2' }), BASE);
    expect((await payment(id)).status).toBe('processing');
    expect(await status('booking_requests', f.requestId)).toBe('quoted');

    await handleStripeEvent(f.db, event('checkout.session.async_payment_succeeded', { id: session, payment_status: 'paid', payment_intent: 'pi_2' }), BASE);
    expect((await payment(id)).status).toBe('succeeded');
    expect(await status('booking_requests', f.requestId)).toBe('booked');
  });

  it('handles delayed bank payment failure', async () => {
    const { id, session } = await checkout();
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: session, payment_status: 'unpaid', payment_intent: 'pi_3' }), BASE);
    await handleStripeEvent(f.db, event('checkout.session.async_payment_failed', { id: session }), BASE);
    expect((await payment(id)).status).toBe('failed');
    expect(await status('quotes', f.quoteA)).toBe('pending');
  });

  it('cancels on checkout.session.expired', async () => {
    const { id, session } = await checkout();
    await handleStripeEvent(f.db, event('checkout.session.expired', { id: session }), BASE);
    expect((await payment(id)).status).toBe('canceled');
  });

  it('ignores sessions it did not create', async () => {
    await checkout();
    const ev = event('checkout.session.completed', { id: 'cs_unknown', payment_status: 'paid', payment_intent: 'pi_x', metadata: {} });
    expect(await handleStripeEvent(f.db, ev, BASE)).toBe('processed');
    expect(await status('booking_requests', f.requestId)).toBe('quoted');
  });

  it('does not trust metadata pointing at a payment with a different session', async () => {
    const { id } = await checkout();
    const ev = event('checkout.session.completed', { id: 'cs_forged', payment_status: 'paid', payment_intent: 'pi_x', metadata: { payment_id: String(id) } });
    await handleStripeEvent(f.db, ev, BASE);
    expect((await payment(id)).status).toBe('pending');
  });

  it('syncs refunds made in the Stripe dashboard via charge.refunded', async () => {
    const { id, session } = await checkout();
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_4' }), BASE);
    await handleStripeEvent(f.db, event('charge.refunded', { payment_intent: 'pi_4', amount_refunded: 8_500_000 }), BASE);
    expect((await payment(id)).status).toBe('refunded');
    expect(await status('booking_requests', f.requestId)).toBe('cancelled');
  });

  it('records disputes', async () => {
    const { id, session } = await checkout();
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_5' }), BASE);
    await handleStripeEvent(f.db, event('charge.dispute.created', { payment_intent: 'pi_5', status: 'needs_response' }), BASE);
    expect((await payment(id)).dispute_status).toBe('needs_response');
  });

  it('syncs Connect account capability flags', async () => {
    await handleStripeEvent(f.db, event('account.updated', { id: 'acct_bravo', charges_enabled: false, payouts_enabled: false, details_submitted: true }), BASE);
    const op = await row<{ stripe_charges_enabled: number; stripe_details_submitted: number }>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorB);
    expect(op.stripe_charges_enabled).toBe(0);
    expect(op.stripe_details_submitted).toBe(1);
  });

  it('auto-refunds a second paid session with reverse transfer', async () => {
    const first = await checkout();
    await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: 'cs_test_2', payment_status: 'paid', payment_intent: 'pi_b' }), BASE);
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: first.session, payment_status: 'paid', payment_intent: 'pi_a' }), BASE);

    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    const [params] = stripe.refunds.create.mock.calls[0] as unknown as [Stripe.RefundCreateParams];
    expect(params).toMatchObject({ payment_intent: 'pi_a', amount: 8_500_000, reverse_transfer: true, refund_application_fee: true });
    expect((await payment(first.id)).status).toBe('refunded');
    expect(await status('quotes', f.quoteB)).toBe('accepted');
    expect(await status('booking_requests', f.requestId)).toBe('booked');
  });

  it('retries a failed conflict refund when Stripe redelivers the event', async () => {
    const first = await checkout();
    await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: 'cs_test_2', payment_status: 'paid', payment_intent: 'pi_b' }), BASE);

    stripe.refunds.create.mockRejectedValueOnce(new Error('api_connection_error'));
    const ev = event('checkout.session.completed', { id: first.session, payment_status: 'paid', payment_intent: 'pi_a' });
    await expect(handleStripeEvent(f.db, ev, BASE)).rejects.toBeInstanceOf(PaymentError);
    expect((await payment(first.id)).status).toBe('succeeded');

    // Redelivery of the same event retries the refund
    await handleStripeEvent(f.db, ev, BASE);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
    expect((await payment(first.id)).status).toBe('refunded');
  });
});

describe('refundPayment (Stripe)', () => {
  it('sends a reversing refund with an idempotency key', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await handleStripeEvent(f.db, event('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_r' }), BASE);
    await refundPayment(f.db, paymentId, { amountCents: 100_000, reason: 'Catering credit', initiatedBy: f.customerId });

    const [params, opts] = stripe.refunds.create.mock.calls[0] as unknown as [Stripe.RefundCreateParams, { idempotencyKey: string }];
    expect(params).toMatchObject({ payment_intent: 'pi_r', amount: 100_000, reverse_transfer: true });
    expect(opts.idempotencyKey).toBe(`refund-${paymentId}-0-100000`);
    const r = await row<{ stripe_refund_id: string; reason: string }>(f.db, 'SELECT * FROM refunds WHERE payment_id = ?', paymentId);
    expect(r).toMatchObject({ stripe_refund_id: 're_test_1', reason: 'Catering credit' });
  });
});

describe('startConnectOnboarding (Stripe)', () => {
  it('creates an Express account once and returns an onboarding link', async () => {
    await f.db.run('UPDATE operators SET stripe_account_id = NULL, stripe_charges_enabled = 0 WHERE id = ?', [f.operatorB]);
    const url = await startConnectOnboarding(f.db, f.operatorB, BASE);
    expect(url).toBe('https://connect.stripe.com/setup/e/acct_new');
    expect(stripe.accounts.create).toHaveBeenCalledTimes(1);
    expect(stripe.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_new', type: 'account_onboarding', return_url: `${BASE}/operator/settings?payouts=return`,
    }));

    await startConnectOnboarding(f.db, f.operatorB, BASE);
    expect(stripe.accounts.create).toHaveBeenCalledTimes(1);
  });
});
