/**
 * Access control on the JSON API: each role sees only what it should.
 * Session lookup is mocked; the database is the shared test fixture.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

let session: SessionPayload | null = null;
vi.mock('@/lib/auth', () => ({ getSession: async () => session }));

let f: Fixture;
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

let opUserA: number;
let opUserB: number;

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  opUserA = (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id;
  opUserB = (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorB)).user_id;
});
afterAll(() => setDb(null));
beforeEach(() => { session = null; });

describe('GET /api/booking-requests/[id]/quotes', () => {
  it('hides other customers’ quotes', async () => {
    const { GET } = await import('@/app/api/booking-requests/[requestId]/quotes/route');
    session = { userId: f.otherCustomerId, role: 'customer' };
    expect((await GET(new Request('http://localhost'), params({ requestId: String(f.requestId) }))).status).toBe(403);
  });

  it('shows the owner every quote', async () => {
    const { GET } = await import('@/app/api/booking-requests/[requestId]/quotes/route');
    session = { userId: f.customerId, role: 'customer' };
    const res = await GET(new Request('http://localhost'), params({ requestId: String(f.requestId) }));
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(2);
  });

  it('shows an operator only its own quote', async () => {
    const { GET } = await import('@/app/api/booking-requests/[requestId]/quotes/route');
    session = { userId: opUserA, role: 'operator' };
    const quotes = await (await GET(new Request('http://localhost'), params({ requestId: String(f.requestId) }))).json();
    expect(quotes.map((q: { id: number }) => q.id)).toEqual([f.quoteA]);
  });
});

describe('GET /api/booking-requests/[id]', () => {
  it('does not disclose the customer’s identity to operators', async () => {
    const { GET } = await import('@/app/api/booking-requests/[requestId]/route');
    session = { userId: opUserA, role: 'operator' };
    const body = await (await GET(new Request('http://localhost'), params({ requestId: String(f.requestId) }))).json();
    expect(body.customer).toBeUndefined();
    expect(body.legs.length).toBe(2);
  });

  it('discloses it to admins', async () => {
    const { GET } = await import('@/app/api/booking-requests/[requestId]/route');
    session = { userId: 999, role: 'admin' };
    const body = await (await GET(new Request('http://localhost'), params({ requestId: String(f.requestId) }))).json();
    expect(body.customer.email).toBe('cust@example.com');
  });
});

describe('PATCH /api/booking-requests/[id]', () => {
  it('operators cannot cancel a request', async () => {
    const { PATCH } = await import('@/app/api/booking-requests/[requestId]/route');
    session = { userId: opUserB, role: 'operator' };
    const res = await PATCH(json({ status: 'cancelled' }, 'PATCH'), params({ requestId: String(f.requestId) }));
    expect(res.status).toBe(403);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('quoted');
  });

  it('another customer cannot cancel it either', async () => {
    const { PATCH } = await import('@/app/api/booking-requests/[requestId]/route');
    session = { userId: f.otherCustomerId, role: 'customer' };
    expect((await PATCH(json({ status: 'cancelled' }, 'PATCH'), params({ requestId: String(f.requestId) }))).status).toBe(403);
  });

  it('the owner can', async () => {
    const { PATCH } = await import('@/app/api/booking-requests/[requestId]/route');
    session = { userId: f.customerId, role: 'customer' };
    expect((await PATCH(json({ status: 'cancelled' }, 'PATCH'), params({ requestId: String(f.requestId) }))).status).toBe(200);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('cancelled');
    // Restore for later tests.
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
  });
});

describe('GET /api/outreach', () => {
  beforeAll(async () => {
    await f.db.run(
      "INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_body) VALUES (?, ?, 'email', 80, 'rfq')",
      [f.requestId, f.operatorA]
    );
  });

  it('refuses other customers', async () => {
    const { GET } = await import('@/app/api/outreach/route');
    session = { userId: f.otherCustomerId, role: 'customer' };
    expect((await GET(new Request(`http://localhost/api/outreach?requestId=${f.requestId}`))).status).toBe(403);
  });

  it('refuses operators', async () => {
    const { GET } = await import('@/app/api/outreach/route');
    session = { userId: opUserA, role: 'operator' };
    expect((await GET(new Request(`http://localhost/api/outreach?requestId=${f.requestId}`))).status).toBe(403);
  });

  it('gives the owner the log without operator contact details', async () => {
    const { GET } = await import('@/app/api/outreach/route');
    session = { userId: f.customerId, role: 'customer' };
    const logs = await (await GET(new Request(`http://localhost/api/outreach?requestId=${f.requestId}`))).json();
    expect(logs.length).toBe(1);
    expect(logs[0].company_name).toBe('Alpha Air');
    expect(logs[0].contact_method).toBe('email');
    expect(logs[0]).not.toHaveProperty('contact_email');
    expect(logs[0]).not.toHaveProperty('contact_phone');
  });

  it('gives admins contact details', async () => {
    const { GET } = await import('@/app/api/outreach/route');
    session = { userId: 999, role: 'admin' };
    const logs = await (await GET(new Request(`http://localhost/api/outreach?requestId=${f.requestId}`))).json();
    expect(logs[0].contact_email).toBe('dispatch@alpha.com');
  });
});

describe('PATCH /api/operator/settings', () => {
  it('rejects values outside the schema instead of failing in the database', async () => {
    const { PATCH } = await import('@/app/api/operator/settings/route');
    session = { userId: opUserA, role: 'operator' };
    expect((await PATCH(json({ contact_method: 'carrier-pigeon' }, 'PATCH'))).status).toBe(400);
    expect((await PATCH(json({ fleet_types: 'not-an-array' }, 'PATCH'))).status).toBe(400);
  });

  it('accepts valid settings', async () => {
    const { PATCH } = await import('@/app/api/operator/settings/route');
    session = { userId: opUserA, role: 'operator' };
    const res = await PATCH(json({ contact_method: 'both', markets: ['west'] }, 'PATCH'));
    expect(res.status).toBe(200);
    expect((await res.json()).markets).toEqual(['west']);
  });
});

describe('cron endpoint', () => {
  it('is closed when CRON_SECRET is unset', async () => {
    const { GET } = await import('@/app/api/cron/weekly-discovery/route');
    delete process.env.CRON_SECRET;
    expect((await GET(new Request('http://localhost'))).status).toBe(401);
  });

  it('refuses a wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/weekly-discovery/route');
    process.env.CRON_SECRET = 'correct-secret';
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }));
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });
});
