import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

/** Autopilot drafts: operator-only, never a quote until a staffer submits. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let draft: typeof import('./route');
let quotes: typeof import('../quotes/route');
let requestId: number;
const ctx = () => ({ params: Promise.resolve({ requestId: String(requestId) }) });
const asOperator = async (id: number) => {
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', id)).user_id, role: 'operator' };
};

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  draft = await import('./route');
  quotes = await import('../quotes/route');
  requestId = (await f.db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id`, [f.customerId]))!.id;
  await f.db.run(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'PHNL', 'PHKO', '2027-02-01')`, [requestId]);
  await f.db.run(`INSERT INTO aircraft (operator_id, tail_number, type, capacity, hourly_rate_cents, cruise_ktas) VALUES (?, 'N7', 'King Air', 8, 300000, 280)`, [f.operatorA]);
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Autopilot draft routes', () => {
  it('rejects travelers', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await draft.POST(new Request('http://x'), ctx())).status).toBe(401);
    expect((await draft.GET(new Request('http://x'), ctx())).status).toBe(401);
  });

  it('drafts on demand, visible only to that operator', async () => {
    await asOperator(f.operatorA);
    const res = await draft.POST(new Request('http://x'), ctx());
    expect(res.status).toBe(201);
    expect((await res.json()).worksheet.hourlyRate).toBe(3000);
    await asOperator(f.operatorB);
    expect((await draft.GET(new Request('http://x'), ctx())).status).toBe(404);
  });

  it('is not a quote the traveler can see', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    const list = await (await quotes.GET(new Request('http://x'), ctx())).json();
    expect(list).toEqual([]);
  });

  it('is marked submitted when the staffer submits the quote', async () => {
    await asOperator(f.operatorA);
    const d = await (await draft.GET(new Request('http://x'), ctx())).json();
    const res = await quotes.POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceCents: d.priceCents, worksheet: d.worksheet }) }), ctx());
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await row(f.db, 'SELECT status, quote_id FROM quote_drafts WHERE request_id = ?', requestId)).toEqual({ status: 'submitted', quote_id: id });
    expect((await draft.GET(new Request('http://x'), ctx())).status).toBe(404);
  });
});

describe('learning from review', () => {
  it('redrafts other open drafts with what was just submitted', async () => {
    await f.db.run('DELETE FROM autopilot_learning');
    await f.db.run('UPDATE operators SET autopilot = ? WHERE id = ?', [JSON.stringify({ enabled: true, learn: true, marginPct: 5, fuelSurchargePct: 0, minDailyHours: 0, crewOvernight: 0, landingPerLeg: 0, cateringPerPaxLeg: 0, fetPct: 7.5, segmentFeePerPax: 0, validDays: 7 }), f.operatorA]);
    const mk = async () => {
      const id = (await f.db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id`, [f.customerId]))!.id;
      await f.db.run(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'PHNL', 'PHOG', '2027-03-01')`, [id]);
      return id;
    };
    const a = await mk(); const b = await mk();
    await asOperator(f.operatorA);
    const ctxFor = (id: number) => ({ params: Promise.resolve({ requestId: String(id) }) });
    await draft.POST(new Request('http://x'), ctxFor(a));
    await draft.POST(new Request('http://x'), ctxFor(b));
    const da = await (await draft.GET(new Request('http://x'), ctxFor(a))).json();
    expect(da.worksheet.marginPct).toBe(5);
    // Staffer submits request a with a 20% margin.
    await quotes.POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceCents: 500_000, worksheet: { ...da.worksheet, marginPct: 20 } }) }), ctxFor(a));
    const db2 = await (await draft.GET(new Request('http://x'), ctxFor(b))).json();
    expect(db2.worksheet.marginPct).toBe(20);
    expect(db2.notes.join(' ')).toMatch(/margin 20%/);
  });
});
