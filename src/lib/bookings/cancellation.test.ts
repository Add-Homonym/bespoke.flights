import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { createCheckout, simulateStubPayment } from '@/lib/payments/service';
import { addStaff } from '@/lib/staff/roster';
import {
  cancelPaidBooking, computeRefund, DEFAULT_POLICY, describePolicy, parsePolicy, previewCancellation,
} from './cancellation';
import type { BookingRequest, Payment } from '@/lib/types';

const BASE = 'https://bespoke.flights';
const H = 3_600_000;
let f: Fixture;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_TEST_MODE', '');
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const request = () => row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', f.requestId);

async function paid() {
  const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
  await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
  log.mockClear();
  return paymentId;
}

/** Put the first leg N hours from now (date and HH:MM, treated as UTC). */
async function firstLegIn(hours: number) {
  const d = new Date(Date.now() + hours * H);
  await f.db.run('UPDATE booking_legs SET departure_date = ?, departure_time = ? WHERE request_id = ? AND leg_order = 1',
    [d.toISOString().slice(0, 10), d.toISOString().slice(11, 16), f.requestId]);
}

describe('computeRefund', () => {
  const leg = { departure_date: '2030-01-10', departure_time: '12:00' };
  const at = (hoursBefore: number) => new Date('2030-01-10T12:00:00Z').getTime() - hoursBefore * H;

  it('applies full, partial and no-refund windows', () => {
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(100))).toMatchObject({ tier: 'full', refundCents: 10_000 });
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(72))).toMatchObject({ tier: 'full' });
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(48))).toMatchObject({ tier: 'partial', refundCents: 5_000 });
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(24))).toMatchObject({ tier: 'partial' });
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(23))).toMatchObject({ tier: 'none', refundCents: 0 });
    expect(computeRefund(DEFAULT_POLICY, leg, 10_000, at(-5))).toMatchObject({ tier: 'none', hoursBeforeDeparture: 0 });
  });

  it('treats a missing time as 23:59 and rounds to the cent', () => {
    const noTime = { departure_date: '2030-01-10', departure_time: null };
    const r = computeRefund(DEFAULT_POLICY, noTime, 10_001, new Date('2030-01-07T23:00:00Z').getTime());
    expect(r.tier).toBe('full');
    const p = computeRefund({ ...DEFAULT_POLICY, partial_refund_bps: 3333 }, noTime, 10_001, new Date('2030-01-09T00:00:00Z').getTime());
    expect(p.refundCents).toBe(Math.round(10_001 * 0.3333));
  });

  it('parses stored policies and falls back to the default', () => {
    expect(parsePolicy(null)).toEqual(DEFAULT_POLICY);
    expect(parsePolicy('not json')).toEqual(DEFAULT_POLICY);
    expect(parsePolicy('{"full_refund_hours":48,"partial_refund_hours":12,"partial_refund_bps":2500}')).toMatchObject({ full_refund_hours: 48 });
    expect(parsePolicy('{"full_refund_hours":10,"partial_refund_hours":20,"partial_refund_bps":2500}')).toEqual(DEFAULT_POLICY);
    expect(describePolicy(DEFAULT_POLICY)).toContain('50% refund between 24 and 72 hours');
  });
});

describe('cancelPaidBooking', () => {
  it('previews nothing for an unpaid request', async () => {
    expect(await previewCancellation(f.db, await request())).toBeNull();
  });

  it('refunds in full far ahead of departure, cancels, rejects quotes, notifies', async () => {
    const paymentId = await paid();
    await addStaff(f.db, f.operatorA, { name: 'Dee', email: 'dee@alpha.com', notify_email: true, notify_sms: false, on_new_request: false, on_booking: true, on_cancellation: true });
    const preview = await previewCancellation(f.db, await request());
    expect(preview).toMatchObject({ tier: 'full', refundCents: 8_500_000, paymentId });

    const result = await cancelPaidBooking(f.db, await request(), { initiatedBy: f.customerId, baseUrl: BASE });
    expect(result).toMatchObject({ status: 'cancelled', refundCents: 8_500_000, tier: 'full' });
    expect((await request()).status).toBe('cancelled');
    expect((await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId)).status).toBe('refunded');
    expect((await row<{ n: number }>(f.db, "SELECT COUNT(*) n FROM quotes WHERE request_id = ? AND status = 'pending'", f.requestId)).n).toBe(0);

    const recipients = log.mock.calls.filter(c => c[0] === '  To:').map(c => c[1]);
    expect(recipients).toContain('cust@example.com');      // cancellation email
    expect(recipients).toContain('dispatch@alpha.com');    // operator email
    expect(recipients).toContain('dee@alpha.com');         // staff alert
    const subjects = log.mock.calls.filter(c => c[0] === '  Subject:').map(c => String(c[1]));
    expect(subjects.some(s => s.startsWith('Booking cancelled'))).toBe(true);
  });

  it('refunds half inside the partial window and still cancels', async () => {
    const paymentId = await paid();
    await firstLegIn(40);
    const result = await cancelPaidBooking(f.db, await request(), { initiatedBy: f.customerId, baseUrl: BASE });
    expect(result).toMatchObject({ tier: 'partial', refundCents: 4_250_000 });
    expect((await request()).status).toBe('cancelled');
    const p = await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId);
    expect(p.status).toBe('partially_refunded');
    expect(p.refunded_cents).toBe(4_250_000);
  });

  it('refunds nothing inside the final window but cancels and alerts', async () => {
    const paymentId = await paid();
    await firstLegIn(5);
    const result = await cancelPaidBooking(f.db, await request(), { initiatedBy: f.customerId, baseUrl: BASE });
    expect(result).toMatchObject({ tier: 'none', refundCents: 0 });
    expect((await request()).status).toBe('cancelled');
    expect((await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId)).status).toBe('succeeded');
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM refunds')).n).toBe(0);
  });

  it('uses the operator\'s own policy', async () => {
    await f.db.run('UPDATE operators SET cancellation_policy = ? WHERE id = ?',
      ['{"full_refund_hours":168,"partial_refund_hours":48,"partial_refund_bps":2500}', f.operatorA]);
    await paid();
    await firstLegIn(100);
    const preview = await previewCancellation(f.db, await request());
    expect(preview).toMatchObject({ tier: 'partial', refundCents: 2_125_000 });
    expect(preview!.policyText).toContain('25% refund between 48 and 168 hours');
  });
});
