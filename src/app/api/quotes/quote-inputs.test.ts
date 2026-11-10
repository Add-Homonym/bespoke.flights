import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { validityWindow, resolveValidUntil } from '@/lib/quotes/validity';
import { priceProblem } from '@/lib/quotes/price';
import type { Quote, SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let f: Fixture;
let submit: typeof import('../booking-requests/[requestId]/quotes/route');
let revise: typeof import('./[quoteId]/route');
let openRequest: number;

const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const reqCtx = (id: number) => ({ params: Promise.resolve({ requestId: String(id) }) });
const quoteCtx = (id: number) => ({ params: Promise.resolve({ quoteId: String(id) }) });

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  submit = await import('../booking-requests/[requestId]/quotes/route');
  revise = await import('./[quoteId]/route');
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

beforeEach(async () => {
  f = await createFixture();
  setDb(f.db);
  // A fresh request departing in 10 days that operator A has not quoted.
  openRequest = (await f.db.one<{ id: number }>("INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id", [f.customerId]))!.id;
  await f.db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'PHNL', 'PHOG', ?)", [openRequest, day(10)]);
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' };
});

describe('valid-until', () => {
  it('rejects a past date on submit with a validUntil field error', async () => {
    const res = await submit.POST(json({ priceCents: 2_500_000, validUntil: day(-1) }), reqCtx(openRequest));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.validUntil).toEqual(['Valid-until date is in the past']);
  });

  it('rejects a date after departure, on submit and on revise', async () => {
    const late = await submit.POST(json({ priceCents: 2_500_000, validUntil: day(11) }), reqCtx(openRequest));
    expect(late.status).toBe(400);
    expect((await late.json()).fieldErrors.validUntil[0]).toMatch(/cannot be after the departure date/);

    const res = await revise.PATCH(json({ validUntil: day(-2) }, 'PATCH'), quoteCtx(f.quoteA));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.validUntil).toEqual(['Valid-until date is in the past']);

    const after = await revise.PATCH(json({ validUntil: day(60) }, 'PATCH'), quoteCtx(f.quoteA));
    expect(after.status).toBe(400);
    expect((await after.json()).fieldErrors.validUntil).toBeTruthy();
  });

  it('defaults to 72 hours out when none is given', async () => {
    const res = await submit.POST(json({ priceCents: 2_500_000 }), reqCtx(openRequest));
    expect(res.status).toBe(201);
    const q = await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', (await res.json()).id);
    expect(q.valid_until).toBe(day(3));
  });

  it('defaults to the departure date when that comes sooner', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(validityWindow('2026-10-21', now)).toEqual({ min: '2026-10-20', max: '2026-10-21', default: '2026-10-21' });
    expect(validityWindow('2026-11-30', now).default).toBe('2026-10-23');
    expect(resolveValidUntil(undefined, '2026-10-21', now)).toEqual({ value: '2026-10-21' });
    expect(resolveValidUntil('2026-10-22', '2026-10-21', now)).toHaveProperty('error');
  });

  it('accepts a revise inside the window', async () => {
    const res = await revise.PATCH(json({ validUntil: day(5), priceCents: 8_000_000 }, 'PATCH'), quoteCtx(f.quoteA));
    expect(res.status).toBe(200);
    expect((await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', f.quoteA)).valid_until).toBe(day(5));
  });
});

describe('price', () => {
  it('refuses zero, negative, fractional-cent and out-of-range prices with a priceCents error', async () => {
    for (const priceCents of [0, -500, 12_345.5, 5_000, 2_000_000_000]) {
      const res = await submit.POST(json({ priceCents }), reqCtx(openRequest));
      expect(res.status, String(priceCents)).toBe(400);
      expect((await res.json()).fieldErrors.priceCents?.length, String(priceCents)).toBeGreaterThan(0);
    }
  });

  it('applies the same rules on revise', async () => {
    const res = await revise.PATCH(json({ priceCents: 99 }, 'PATCH'), quoteCtx(f.quoteA));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.priceCents).toEqual(['Enter a price of at least $100']);
  });

  it('checks typed dollar amounts before sending', () => {
    expect(priceProblem('25000')).toBeNull();
    expect(priceProblem('25000.50')).toBeNull();
    expect(priceProblem('0')).toMatch(/at least \$100/);
    expect(priceProblem('-5')).toMatch(/dollars/);
    expect(priceProblem('10.005')).toMatch(/fractions of a cent/);
    expect(priceProblem('abc')).toMatch(/dollars/);
    expect(priceProblem('99999999999')).toMatch(/or less/);
  });
});
