import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from './fixtures';
import { createCheckout, refundPayment, simulateStubPayment } from '../service';
import { loadReceipt, receiptNumber } from '../receipt';
import { paymentReceiptEmail } from '@/lib/email/templates';

const BASE = 'https://bespoke.flights';
let f: Fixture;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  await f.db.run("UPDATE operators SET certificate = 'ABCD123X', safety_rating = 'ARGUS Platinum' WHERE id = ?", [f.operatorA]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('receipt', () => {
  it('is null before payment', async () => {
    expect(await loadReceipt(f.db, f.requestId)).toBeNull();
  });

  it('numbers receipts BF-<year>-<padded id>', () => {
    expect(receiptNumber({ id: 42, paid_at: '2026-10-17T00:00:00.000Z', created_at: '2026-10-16T00:00:00.000Z' })).toBe('BF-2026-000042');
    expect(receiptNumber({ id: 1234567, paid_at: null, created_at: '2027-01-01T00:00:00.000Z' })).toBe('BF-2027-1234567');
  });

  it('lists the booking, operator identity, legs and refunds', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    await refundPayment(f.db, paymentId, { amountCents: 500_000, reason: 'Catering removed' });

    const r = (await loadReceipt(f.db, f.requestId))!;
    expect(r.receiptNumber).toBe(`BF-${new Date().getUTCFullYear()}-${String(paymentId).padStart(6, '0')}`);
    expect(r.operator).toEqual({ company: 'Alpha Air', certificate: 'ABCD123X', safetyRating: 'ARGUS Platinum' });
    expect(r.customer.email).toBe('cust@example.com');
    expect(r.legs.map(l => `${l.from}-${l.to}`)).toEqual(['LAX-HNL', 'HNL-LAX']);
    expect(r.charges).toHaveLength(1);
    expect(r.charges[0]).toMatchObject({ label: 'Charter booking', cents: 8_500_000, method: 'Test payment' });
    expect(r.refunds).toEqual([expect.objectContaining({ cents: 500_000, reason: 'Catering removed' })]);
    expect(r.totalPaid).toBe('$85,000.00');
    expect(r.net).toBe('$80,000.00');
    expect(r.paymentMethod).toBe('Test payment');
  });

  it('the receipt email links to the printable receipt', () => {
    const { html } = paymentReceiptEmail({
      requestId: 7, route: 'LAX → HNL', dateRange: '2026-12-01', legLines: [], specialRequests: null, passengerCount: 2,
      operatorCompany: 'Alpha Air', aircraft: null, amount: '$1.00', baseUrl: BASE,
    });
    expect(html).toContain(`${BASE}/requests/7/receipt`);
  });
});
