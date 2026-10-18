import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { createCheckout, simulateStubPayment } from '@/lib/payments/service';
import { completeTrips, expireQuotes, runDailyLifecycle } from './lifecycle';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const BASE = 'https://bespoke.flights';
let f: Fixture;
let log: ReturnType<typeof vi.spyOn>;
let cron: typeof import('@/app/api/cron/daily-lifecycle/route');
let quoteRoute: typeof import('@/app/api/quotes/[quoteId]/route');

const subjects = () => log.mock.calls.filter(c => c[0] === '  Subject:').map(c => String(c[1]));
const recipients = () => log.mock.calls.filter(c => c[0] === '  To:').map(c => String(c[1]));
const status = async (table: string, id: number) => (await row<{ status: string }>(f.db, `SELECT status FROM ${table} WHERE id = ?`, id)).status;
const json = (body: unknown) => new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const qp = (id: number) => ({ params: Promise.resolve({ quoteId: String(id) }) });

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', BASE);
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_TEST_MODE', '');
  cron = await import('@/app/api/cron/daily-lifecycle/route');
  quoteRoute = await import('@/app/api/quotes/[quoteId]/route');
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

beforeEach(async () => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
});

describe('expireQuotes', () => {
  it('expires pending quotes past valid_until, emails the traveler once per request, and is idempotent', async () => {
    await f.db.run("UPDATE quotes SET valid_until = '2020-01-01' WHERE request_id = ?", [f.requestId]);
    expect(await expireQuotes(f.db, { baseUrl: BASE })).toBe(2);
    expect(await status('quotes', f.quoteA)).toBe('expired');
    expect(await status('quotes', f.quoteB)).toBe('expired');
    expect(recipients()).toEqual(['cust@example.com']);
    expect(subjects()[0]).toBe(`Quotes on your trip expired — Request #${f.requestId}`);
    expect(await expireQuotes(f.db, { baseUrl: BASE })).toBe(0);
  });

  it('leaves quotes valid today or later, and those without a date', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await f.db.run('UPDATE quotes SET valid_until = ? WHERE id = ?', [today, f.quoteA]);
    await f.db.run('UPDATE quotes SET valid_until = NULL WHERE id = ?', [f.quoteB]);
    expect(await expireQuotes(f.db, { baseUrl: BASE })).toBe(0);
  });

  it('an expired quote cannot be paid, and the operator can quote again', async () => {
    const { PaymentError } = await import('@/lib/payments/service');
    await f.db.run("UPDATE quotes SET valid_until = '2020-01-01' WHERE id = ?", [f.quoteA]);
    await expireQuotes(f.db, { baseUrl: BASE });
    await expect(createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE })).rejects.toBeInstanceOf(PaymentError);
    // The partial unique index ignores expired quotes.
    await f.db.run('INSERT INTO quotes (request_id, operator_id, price_cents) VALUES (?, ?, ?)', [f.requestId, f.operatorA, 1_000_000]);
  });
});

describe('completeTrips', () => {
  it('completes booked trips whose last leg has flown and emails the traveler', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    log.mockClear();
    expect(await completeTrips(f.db, { baseUrl: BASE })).toBe(0);   // legs are in the future
    await f.db.run("UPDATE booking_legs SET departure_date = '2020-01-01' WHERE request_id = ?", [f.requestId]);
    expect(await completeTrips(f.db, { baseUrl: BASE })).toBe(1);
    expect(await status('booking_requests', f.requestId)).toBe('completed');
    expect(subjects()).toEqual([`Trip completed — Request #${f.requestId}`]);
    expect(await completeTrips(f.db, { baseUrl: BASE })).toBe(0);
  });

  it('ignores unbooked requests with past legs', async () => {
    await f.db.run("UPDATE booking_legs SET departure_date = '2020-01-01' WHERE request_id = ?", [f.requestId]);
    expect(await completeTrips(f.db, { baseUrl: BASE })).toBe(0);
    expect(await status('booking_requests', f.requestId)).toBe('quoted');
  });
});

describe('GET /api/cron/daily-lifecycle', () => {
  it('requires the CRON_SECRET bearer token, admins may POST', async () => {
    vi.stubEnv('CRON_SECRET', '');
    who.session = null;
    expect((await cron.GET(new Request('http://localhost/x'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await cron.GET(new Request('http://localhost/x', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    await f.db.run("UPDATE quotes SET valid_until = '2020-01-01' WHERE id = ?", [f.quoteA]);
    const res = await cron.GET(new Request('http://localhost/x', { headers: { authorization: 'Bearer s3cret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, expiredQuotes: 1, completedTrips: 0 });
    who.session = { userId: 1, role: 'admin' };
    vi.stubEnv('CRON_SECRET', '');
    expect((await cron.POST(new Request('http://localhost/x', { method: 'POST' }))).status).toBe(200);
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await cron.POST(new Request('http://localhost/x', { method: 'POST' }))).status).toBe(401);
  });

  it('runDailyLifecycle reports both counts', async () => {
    expect(await runDailyLifecycle(f.db, { baseUrl: BASE })).toEqual({ expiredQuotes: 0, completedTrips: 0 });
  });
});

describe('PATCH /api/quotes/[id] withdraw and revise', () => {
  const asOperatorA = async () => { who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' }; };
  const asOperatorB = async () => { who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorB)).user_id, role: 'operator' }; };

  it('only the owning operator withdraws; the traveler is emailed; a new quote is allowed', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await quoteRoute.PATCH(json({ status: 'withdrawn' }), qp(f.quoteA))).status).toBe(403);
    await asOperatorB();
    expect((await quoteRoute.PATCH(json({ status: 'withdrawn' }), qp(f.quoteA))).status).toBe(403);
    await asOperatorA();
    log.mockClear();
    expect((await quoteRoute.PATCH(json({ status: 'withdrawn' }), qp(f.quoteA))).status).toBe(200);
    expect(await status('quotes', f.quoteA)).toBe('withdrawn');
    expect(recipients()).toEqual(['cust@example.com']);
    expect(subjects()[0]).toMatch(/^Alpha Air withdrew its quote/);
    expect((await quoteRoute.PATCH(json({ status: 'withdrawn' }), qp(f.quoteA))).status).toBe(409);
    await f.db.run('INSERT INTO quotes (request_id, operator_id, price_cents) VALUES (?, ?, ?)', [f.requestId, f.operatorA, 1_000_000]);
  });

  it('revises price, message and validity, keeps the previous price, and emails the traveler', async () => {
    await asOperatorA();
    log.mockClear();
    const res = await quoteRoute.PATCH(json({ priceCents: 8_000_000, message: 'Sharper price' }), qp(f.quoteA));
    expect(res.status).toBe(200);
    const q = await row<{ price_cents: number; previous_price_cents: number | null; message: string; revised_at: string | null }>(
      f.db, 'SELECT price_cents, previous_price_cents, message, revised_at FROM quotes WHERE id = ?', f.quoteA);
    expect(q).toMatchObject({ price_cents: 8_000_000, previous_price_cents: 8_500_000, message: 'Sharper price' });
    expect(q.revised_at).not.toBeNull();
    expect(recipients()).toEqual(['cust@example.com']);
    expect(subjects()[0]).toBe(`Quote revised — $80,000.00 from Alpha Air — Request #${f.requestId}`);

    // Message-only revision does not touch previous_price_cents.
    await quoteRoute.PATCH(json({ message: 'Still here' }), qp(f.quoteA));
    expect((await row<{ previous_price_cents: number }>(f.db, 'SELECT previous_price_cents FROM quotes WHERE id = ?', f.quoteA)).previous_price_cents).toBe(8_500_000);

    // Validation and ownership.
    expect((await quoteRoute.PATCH(json({}), qp(f.quoteA))).status).toBe(400);
    expect((await quoteRoute.PATCH(json({ priceCents: 10 }), qp(f.quoteA))).status).toBe(400);
    await asOperatorB();
    expect((await quoteRoute.PATCH(json({ priceCents: 1_000_000 }), qp(f.quoteA))).status).toBe(403);
  });

  it('traveler decline still works and emails the operator', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    log.mockClear();
    expect((await quoteRoute.PATCH(json({ status: 'rejected' }), qp(f.quoteB))).status).toBe(200);
    expect(await status('quotes', f.quoteB)).toBe('rejected');
    expect(recipients()).toEqual(['b@ops.com']);
    expect(subjects()[0]).toMatch(/^Quote declined/);
  });
});
