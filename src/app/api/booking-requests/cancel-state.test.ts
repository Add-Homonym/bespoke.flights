import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { createCheckout, simulateStubPayment } from '@/lib/payments/service';
import { proposeChange } from '@/lib/bookings/changes';
import { buildDashboard } from '@/lib/operator/dashboard';
import { cancellationSummary } from '@/lib/bookings/cancellation';
import { setDb } from '@/lib/db';
import type { BookingRequest, Operator, SessionPayload } from '@/lib/types';

/**
 * Cancelling a paid booking is one state change: the quote, change requests,
 * message thread and operator dashboard all agree afterwards.
 */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const BASE = 'http://localhost:3000';
let f: Fixture;
let cancel: typeof import('./[requestId]/cancel/route');
let messages: typeof import('./[requestId]/messages/route');

const params = (requestId: number) => ({ params: Promise.resolve({ requestId: String(requestId) }) });
const req = (method: string, body?: unknown, url = 'http://localhost/x') =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', BASE);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  cancel = await import('./[requestId]/cancel/route');
  messages = await import('./[requestId]/messages/route');
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

beforeEach(async () => {
  f = await createFixture();
  setDb(f.db);
  who.session = { userId: f.customerId, role: 'customer' };
});

async function bookAndRequestChange() {
  const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
  await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
  const request = await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', f.requestId);
  const change = await proposeChange(f.db, request, f.customerId, {
    legs: [{ originCode: 'KLAX', destCode: 'PHOG', departureDate: '2030-06-01', departureTime: '09:00' }],
    passengerCount: 3,
  }, BASE);
  return { paymentId, change };
}

describe('cancelling a paid booking', () => {
  it('leaves no quote accepted, closes the pending change request, and locks the thread', async () => {
    const { change } = await bookAndRequestChange();
    const opUser = (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id;

    // The thread works before the cancellation.
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await messages.POST(req('POST', { body: 'Hello' }, `http://localhost/x?operatorId=${f.operatorA}`), params(f.requestId))).status).toBe(201);

    const res = await cancel.POST(req('POST'), params(f.requestId));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toMatchObject({ status: 'cancelled', tier: 'full', refundTo: 'the original payment method' });
    expect(result.tierLabel).toMatch(/^Full refund/);

    // Quote status: cancelled, never accepted; the rival quote is rejected.
    const statuses = await f.db.query<{ id: number; status: string }>('SELECT id, status FROM quotes ORDER BY id');
    expect(statuses.find(q => q.id === f.quoteA)?.status).toBe('cancelled');
    expect(statuses.find(q => q.id === f.quoteB)?.status).toBe('rejected');
    expect(statuses.some(q => q.status === 'accepted')).toBe(false);

    // Pending change request is withdrawn, with the reason both sides read.
    const cr = await row<{ status: string; closed_reason: string }>(f.db, 'SELECT status, closed_reason FROM change_requests WHERE id = ?', change.id);
    expect(cr).toEqual({ status: 'withdrawn', closed_reason: 'trip_cancelled' });

    // Message thread: read-only, POST is 409 for both sides, GET still works.
    for (const session of [{ userId: f.customerId, role: 'customer' as const }, { userId: opUser, role: 'operator' as const }]) {
      who.session = session;
      const post = await messages.POST(req('POST', { body: 'Still there?' }, `http://localhost/x?operatorId=${f.operatorA}`), params(f.requestId));
      expect(post.status).toBe(409);
      const get = await messages.GET(req('GET', undefined, `http://localhost/x?operatorId=${f.operatorA}`), params(f.requestId));
      expect(get.status).toBe(200);
      const thread = await get.json();
      expect(thread.closed).toBe(true);
      expect(thread.messages).toHaveLength(1);
    }
  });

  it('summarizes the refund, tier and payout adjustment for the operator', async () => {
    await bookAndRequestChange();
    await cancel.POST(req('POST'), params(f.requestId));
    const s = await cancellationSummary(f.db, f.requestId);
    expect(s).toMatchObject({ tier: 'full', paid: '$85,000.00', refund: '$85,000.00', payout: '$80,750.00', payoutAdjustment: '$80,750.00', payoutRetained: '$0.00' });
    expect(s!.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  });

  it('applies a partial refund and keeps the matching share of the payout', async () => {
    await bookAndRequestChange();
    // Depart in ~48 hours: the default policy refunds 50%.
    const d = new Date(Date.now() + 48 * 3_600_000);
    await f.db.run('UPDATE booking_legs SET departure_date = ?, departure_time = ? WHERE request_id = ? AND leg_order = 1',
      [d.toISOString().slice(0, 10), d.toISOString().slice(11, 16), f.requestId]);
    const result = await (await cancel.POST(req('POST'), params(f.requestId))).json();
    expect(result.tier).toBe('partial');
    const s = await cancellationSummary(f.db, f.requestId);
    expect(s).toMatchObject({ tier: 'partial', refund: '$42,500.00', payoutAdjustment: '$40,375.00', payoutRetained: '$40,375.00' });
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM quotes WHERE id = ?', f.quoteA)).status).toBe('cancelled');
  });

  it('drops the booking from the operator dashboard totals', async () => {
    await bookAndRequestChange();
    const operator = () => row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorA);
    expect((await buildDashboard(f.db, await operator())).deals).toMatchObject({ accepted: 1, wonCents: 8_500_000 });
    await cancel.POST(req('POST'), params(f.requestId));
    expect((await buildDashboard(f.db, await operator())).deals).toMatchObject({ accepted: 0, wonCents: 0 });
  });

  it('nets a partial refund on a standing booking out of the total won', async () => {
    const { paymentId } = await bookAndRequestChange();
    await f.db.run("UPDATE payments SET refunded_cents = 500000, status = 'partially_refunded' WHERE id = ?", [paymentId]);
    const operator = await row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorA);
    expect((await buildDashboard(f.db, operator)).deals).toMatchObject({ accepted: 1, wonCents: 8_000_000 });
  });
});
