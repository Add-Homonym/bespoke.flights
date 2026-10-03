import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from './fixtures';
import {
  createCheckout,
  simulateStubPayment,
  fulfillPayment,
  refundPayment,
  applyRefundTotal,
  startConnectOnboarding,
  PaymentError,
} from '../service';
import type { Payment } from '@/lib/types';

const BASE = 'http://localhost:3000';
let f: Fixture;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('PLATFORM_FEE_BPS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const payment = (id: number) => row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', id);
const status = async (table: string, id: number) => (await row<{ status: string }>(f.db, `SELECT status FROM ${table} WHERE id = ?`, id)).status;

async function expectError(p: Promise<unknown>, httpStatus: number) {
  await expect(p).rejects.toBeInstanceOf(PaymentError);
  await p.catch(e => expect(e.status).toBe(httpStatus));
}

describe('createCheckout (stub mode)', () => {
  it('creates a pending payment with the fee split and a stub URL', async () => {
    const res = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    expect(res.provider).toBe('stub');
    expect(res.url).toBe(`${BASE}/requests/${f.requestId}?checkout=stub&payment=${res.paymentId}`);

    const p = await payment(res.paymentId);
    expect(p.status).toBe('pending');
    expect(p.amount_cents).toBe(8_500_000);
    expect(p.platform_fee_cents).toBe(425_000);
    expect(p.operator_payout_cents).toBe(8_075_000);
    // Quote and request untouched until paid
    expect(await status('quotes', f.quoteA)).toBe('pending');
    expect(await status('booking_requests', f.requestId)).toBe('quoted');
  });

  it('uses a per-operator fee override', async () => {
    await f.db.run('UPDATE operators SET platform_fee_bps = 250 WHERE id = ?', [f.operatorA]);
    const res = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    expect((await payment(res.paymentId)).platform_fee_cents).toBe(212_500);
  });

  it('hides other customers’ quotes', async () => {
    await expectError(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.otherCustomerId, baseUrl: BASE }), 404);
  });

  it('rejects unknown quotes', async () => {
    await expectError(createCheckout(f.db, { quoteId: 9999, customerId: f.customerId, baseUrl: BASE }), 404);
  });

  it('rejects expired quotes', async () => {
    await f.db.run("UPDATE quotes SET valid_until = '2020-01-01' WHERE id = ?", [f.quoteA]);
    await expectError(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }), 409);
  });

  it('rejects non-pending quotes', async () => {
    await f.db.run("UPDATE quotes SET status = 'rejected' WHERE id = ?", [f.quoteA]);
    await expectError(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }), 409);
  });

  it('rejects quotes from suspended operators', async () => {
    await f.db.run("UPDATE operators SET status = 'suspended' WHERE id = ?", [f.operatorA]);
    await expectError(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }), 409);
  });

  it('is refused in production without Stripe', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expectError(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE }), 503);
  });

  it('supersedes an earlier open checkout on the same request', async () => {
    const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    const second = await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    expect((await payment(first.paymentId)).status).toBe('canceled');
    expect((await payment(second.paymentId)).status).toBe('pending');
  });

  it('blocks a new checkout once the request is paid', async () => {
    const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, first.paymentId, f.customerId, BASE);
    await expectError(createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE }), 409);
  });
});

describe('payment success', () => {
  it('books the request, accepts the quote and rejects the rest', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    const outcome = await simulateStubPayment(f.db, paymentId, f.customerId, BASE);

    expect(outcome).toBe('booked');
    expect((await payment(paymentId)).status).toBe('succeeded');
    expect((await payment(paymentId)).paid_at).not.toBeNull();
    expect(await status('quotes', f.quoteA)).toBe('accepted');
    expect(await status('quotes', f.quoteB)).toBe('rejected');
    expect(await status('booking_requests', f.requestId)).toBe('booked');
  });

  it('sends receipt and operator confirmation emails', async () => {
    const log = vi.mocked(console.log);
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    const recipients = log.mock.calls.filter(c => c[0] === '  To:').map(c => c[1]);
    expect(recipients).toEqual(['cust@example.com', 'dispatch@alpha.com']);
  });

  it('is idempotent', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await fulfillPayment(f.db, paymentId, { baseUrl: BASE });
    expect(await fulfillPayment(f.db, paymentId, { baseUrl: BASE })).toBe('duplicate');
    expect((await row<{ c: number }>(f.db, 'SELECT COUNT(*) c FROM refunds')).c).toBe(0);
  });

  it('cannot be simulated by another customer or twice', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await expectError(simulateStubPayment(f.db, paymentId, f.otherCustomerId, BASE), 404);
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    await expectError(simulateStubPayment(f.db, paymentId, f.customerId, BASE), 409);
  });

  it('refunds automatically when a superseded checkout is paid after another booked', async () => {
    const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    const second = await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    await fulfillPayment(f.db, second.paymentId, { baseUrl: BASE });

    // Customer had completed the first (superseded) session too
    const outcome = await fulfillPayment(f.db, first.paymentId, { baseUrl: BASE });
    expect(outcome).toBe('conflict');
    expect((await payment(first.paymentId)).status).toBe('refunded');
    expect((await payment(first.paymentId)).refunded_cents).toBe(8_500_000);
    // The real booking stands
    expect(await status('booking_requests', f.requestId)).toBe('booked');
    expect(await status('quotes', f.quoteB)).toBe('accepted');
  });

  it('books exactly once when two payments for the same request complete concurrently', async () => {
    // Repeated so the two transactions overlap; without row locks this deadlocks on real Postgres.
    for (let round = 0; round < 15; round++) {
      f = await createFixture();
      const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
      const second = await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });

      const outcomes = await Promise.all([
        fulfillPayment(f.db, first.paymentId, { baseUrl: BASE }),
        fulfillPayment(f.db, second.paymentId, { baseUrl: BASE }),
      ]);

      expect([...outcomes].sort()).toEqual(['booked', 'conflict']);
      const accepted = await f.db.query("SELECT id FROM quotes WHERE request_id = ? AND status = 'accepted'", [f.requestId]);
      expect(accepted).toHaveLength(1);
      expect(await status('booking_requests', f.requestId)).toBe('booked');
      const refunded = await f.db.query("SELECT id FROM payments WHERE request_id = ? AND status = 'refunded'", [f.requestId]);
      expect(refunded).toHaveLength(1);
    }
  });

  it('books a superseded checkout if it is the one that gets paid', async () => {
    const first = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await createCheckout(f.db, { quoteId: f.quoteB, customerId: f.customerId, baseUrl: BASE });
    expect(await fulfillPayment(f.db, first.paymentId, { baseUrl: BASE })).toBe('booked');
    expect(await status('quotes', f.quoteA)).toBe('accepted');
  });
});

describe('refunds', () => {
  async function paid() {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    return paymentId;
  }

  it('partial then full refund; full refund cancels the booking', async () => {
    const id = await paid();
    await refundPayment(f.db, id, { amountCents: 1_000_000, reason: 'Leg 2 cancelled' });
    expect((await payment(id)).status).toBe('partially_refunded');
    expect(await status('booking_requests', f.requestId)).toBe('booked');

    await refundPayment(f.db, id, {});
    expect((await payment(id)).status).toBe('refunded');
    expect((await payment(id)).refunded_cents).toBe(8_500_000);
    expect(await status('booking_requests', f.requestId)).toBe('cancelled');
    expect((await row<{ c: number }>(f.db, 'SELECT COUNT(*) c FROM refunds WHERE payment_id = ?', id)).c).toBe(2);
  });

  it('rejects over-refunds', async () => {
    const id = await paid();
    await expectError(refundPayment(f.db, id, { amountCents: 8_500_001 }), 400);
    await expectError(refundPayment(f.db, id, { amountCents: 0 }), 400);
  });

  it('rejects refunds of unpaid payments', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await expectError(refundPayment(f.db, paymentId, {}), 409);
  });

  it('applyRefundTotal is absolute and never decreases', async () => {
    const id = await paid();
    await applyRefundTotal(f.db, id, 500_000);
    await applyRefundTotal(f.db, id, 500_000);
    expect((await payment(id)).refunded_cents).toBe(500_000);
    await applyRefundTotal(f.db, id, 100);
    expect((await payment(id)).refunded_cents).toBe(500_000);
  });
});

describe('connect onboarding (stub mode)', () => {
  it('marks the operator as payout-ready', async () => {
    await f.db.run('UPDATE operators SET stripe_account_id = NULL, stripe_charges_enabled = 0, stripe_payouts_enabled = 0 WHERE id = ?', [f.operatorB]);
    const url = await startConnectOnboarding(f.db, f.operatorB, BASE);
    expect(url).toBe(`${BASE}/operator/settings?payouts=return`);
    const op = await row<{ stripe_account_id: string; stripe_charges_enabled: number }>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorB);
    expect(op.stripe_account_id).toBe(`acct_stub_${f.operatorB}`);
    expect(op.stripe_charges_enabled).toBe(1);
  });
});
