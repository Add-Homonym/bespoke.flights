import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { defaultWorksheet } from '@/lib/quotes/worksheet';
import type { SessionPayload } from '@/lib/types';

/** The quote worksheet is private to the quoting operator. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let quotes: typeof import('../booking-requests/[requestId]/quotes/route');
let quote: typeof import('./[quoteId]/route');
let sheet: typeof import('./[quoteId]/worksheet/route');
let requestId: number;
let quoteId: number;

const json = (body: unknown, method: string) =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const asOperator = async (operatorId: number) => {
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', operatorId)).user_id, role: 'operator' };
};
const worksheet = {
  ...defaultWorksheet({ legs: [{ origin: 'KLAX', dest: 'PHNL', date: '2027-01-10' }], passengers: 4 }),
  hourlyRate: 6200, marginPct: 12, notes: 'Fuel at $6.10/gal',
};
const getSheet = () => sheet.GET(new Request('http://localhost/x'), { params: Promise.resolve({ quoteId: String(quoteId) }) });

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  quotes = await import('../booking-requests/[requestId]/quotes/route');
  quote = await import('./[quoteId]/route');
  sheet = await import('./[quoteId]/worksheet/route');
  requestId = (await f.db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 4) RETURNING id`, [f.customerId]))!.id;
  await asOperator(f.operatorA);
  const res = await quotes.POST(json({ priceCents: 4_000_000, worksheet }, 'POST'), { params: Promise.resolve({ requestId: String(requestId) }) });
  expect(res.status).toBe(201);
  quoteId = (await res.json()).id;
});

afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('quote worksheet', () => {
  it('is returned to the quoting operator', async () => {
    await asOperator(f.operatorA);
    const res = await getSheet();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hourlyRate: 6200, marginPct: 12, notes: 'Fuel at $6.10/gal' });
  });

  it('is hidden from other operators, the traveler and admins', async () => {
    await asOperator(f.operatorB);
    expect((await getSheet()).status).toBe(404);
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await getSheet()).status).toBe(404);
    who.session = { userId: 999, role: 'admin' };
    expect((await getSheet()).status).toBe(404);
  });

  it('is not in the quote list the traveler sees', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    const res = await quotes.GET(new Request('http://localhost/x'), { params: Promise.resolve({ requestId: String(requestId) }) });
    const text = JSON.stringify(await res.json());
    expect(text).toContain('4000000');
    expect(text).not.toMatch(/hourlyRate|marginPct|Fuel at/);
  });

  it('can be updated alone without revising the quote', async () => {
    await asOperator(f.operatorA);
    const res = await quote.PATCH(json({ worksheet: { ...worksheet, marginPct: 15 } }, 'PATCH'), { params: Promise.resolve({ quoteId: String(quoteId) }) });
    expect(res.status).toBe(200);
    expect((await res.json()).revised_at).toBeNull();
    expect((await (await getSheet()).json()).marginPct).toBe(15);
  });

  it('rejects malformed worksheets', async () => {
    await asOperator(f.operatorA);
    const res = await quote.PATCH(json({ worksheet: { ...worksheet, marginPct: 500 } }, 'PATCH'), { params: Promise.resolve({ quoteId: String(quoteId) }) });
    expect(res.status).toBe(400);
  });
});
