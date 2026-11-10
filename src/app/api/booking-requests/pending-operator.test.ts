import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { buildDashboard } from '@/lib/operator/dashboard';
import type { Operator, SessionPayload } from '@/lib/types';

/** An operator awaiting approval sees route, date and passengers, and nothing a traveler typed. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const NOTE = 'Gluten-free catering; flying with a service dog';
let f: Fixture;
let detail: typeof import('./[requestId]/route');
let list: typeof import('./route');
let inbound: typeof import('../operator/inbound/route');

const ctx = (id: number) => ({ params: Promise.resolve({ requestId: String(id) }) });
const asOperator = async (id: number) => {
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', id)).user_id, role: 'operator' };
};

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  detail = await import('./[requestId]/route');
  list = await import('./route');
  inbound = await import('../operator/inbound/route');
  await f.db.run('UPDATE booking_requests SET notes = ?, status = ? WHERE id = ?', [NOTE, 'open', f.requestId]);
  await f.db.run("UPDATE quotes SET status = 'withdrawn' WHERE request_id = ?", [f.requestId]);
  await f.db.run('INSERT INTO outreach_log (request_id, operator_id, method, rfq_body) VALUES (?, ?, ?, ?)', [f.requestId, f.operatorB, 'email', `Special requests: ${NOTE}`]);
  await f.db.run("UPDATE operators SET status = 'pending' WHERE id = ?", [f.operatorB]);
});
afterAll(() => setDb(null));

describe('pending operator', () => {
  it('request detail has route, date and passengers but no notes', async () => {
    await asOperator(f.operatorB);
    const res = await detail.GET(new Request('http://localhost/x'), ctx(f.requestId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passenger_count).toBe(4);
    expect(body.legs).toHaveLength(2);
    expect(body.legs[0]).toMatchObject({ origin_code: 'KLAX', dest_code: 'PHNL' });
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('customer_id');
    expect(JSON.stringify(body)).not.toContain('service dog');
  });

  it('the request list omits notes too', async () => {
    const res = await list.GET();
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('service dog');
    expect(body[0]).not.toHaveProperty('notes');
  });

  it('the inbound feed strips notes and RFQ text', async () => {
    const body = await (await inbound.GET()).json();
    expect(body).toHaveLength(1);
    expect(body[0].request_notes).toBeNull();
    expect(body[0].rfq_body).toBe('');
    expect(JSON.stringify(body)).not.toContain('service dog');
  });

  it('an approved operator still sees the notes', async () => {
    await f.db.run("UPDATE operators SET status = 'approved' WHERE id = ?", [f.operatorB]);
    const body = await (await detail.GET(new Request('http://localhost/x'), ctx(f.requestId))).json();
    expect(body.notes).toBe(NOTE);
    expect((await (await inbound.GET()).json())[0].request_notes).toBe(NOTE);
  });
});

describe('setup checklist', () => {
  it('marks each step done or missing and says what gates it', async () => {
    const op = await row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorA);
    const d = await buildDashboard(f.db, { ...op, certificate: null, safety_rating: null, markets: null, fleet_types: null, contact_email: 'ops@a.com', cancellation_policy: null });
    const by = Object.fromEntries(d.checklist.map(c => [c.key, c]));
    expect(by.profile).toMatchObject({ done: false, gate: 'approval' });
    expect(by.profile!.detail).toMatch(/markets you serve, aircraft categories/);
    expect(by.certificate).toMatchObject({ done: false, gate: 'approval' });
    expect(by.safety).toMatchObject({ done: false });
    expect(by.fleet).toMatchObject({ done: false });
    expect(by.payouts).toMatchObject({ done: true, gate: 'payment' });
    expect(by.policy).toMatchObject({ done: false, gate: 'optional' });
    expect(d.settings.profileMissing).toEqual(['markets you serve', 'aircraft categories']);
  });
});
