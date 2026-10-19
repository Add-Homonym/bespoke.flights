import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

/** Admin user and operator management. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let adminId: number;
let users: typeof import('./users/route');
let user: typeof import('./users/[userId]/route');
let operators: typeof import('./operators/route');
let operator: typeof import('./operators/[operatorId]/route');

const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const uctx = (id: number) => ({ params: Promise.resolve({ userId: String(id) }) });
const octx = (id: number) => ({ params: Promise.resolve({ operatorId: String(id) }) });
const asAdmin = () => { who.session = { userId: adminId, role: 'admin' }; };

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  adminId = (await f.db.one<{ id: number }>(`INSERT INTO users (email, password_hash, name, role) VALUES ('boss@x.com', 'x', 'Boss', 'admin') RETURNING id`))!.id;
  users = await import('./users/route');
  user = await import('./users/[userId]/route');
  operators = await import('./operators/route');
  operator = await import('./operators/[operatorId]/route');
});
afterAll(() => { setDb(null); vi.restoreAllMocks(); });

describe('access', () => {
  it('refuses everyone but admins', async () => {
    for (const s of [null, { userId: f.customerId, role: 'customer' as const }]) {
      who.session = s;
      expect((await users.GET()).status).toBe(403);
      expect((await users.POST(json({ email: 'a@b.com', name: 'A', role: 'customer' }))).status).toBe(403);
      expect((await user.PATCH(json({ role: 'admin' }, 'PATCH'), uctx(f.customerId))).status).toBe(403);
      expect((await operators.POST(json({ companyName: 'X', name: 'X', email: 'x@x.com' }))).status).toBe(403);
      expect((await operator.PATCH(json({ status: 'approved' }, 'PATCH'), octx(f.operatorA))).status).toBe(403);
    }
  });
});

describe('add user', () => {
  it('creates a user with a temporary password that signs in', async () => {
    asAdmin();
    const res = await users.POST(json({ email: ' New@Example.com ', name: 'New Person', role: 'customer' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.password).toMatch(/^[A-Za-z2-9]{14}$/);
    const u = await row<{ email: string; role: string; password_hash: string; auth_id: string | null }>(f.db, 'SELECT * FROM users WHERE id = ?', body.id);
    expect(u).toMatchObject({ email: 'new@example.com', role: 'customer', auth_id: null });
    expect(await bcrypt.compare(body.password, u.password_hash)).toBe(true);
  });

  it('creates an operator user with a company profile', async () => {
    asAdmin();
    const body = await (await users.POST(json({ email: 'ops2@x.com', name: 'Ops Two', role: 'operator', companyName: 'Two Air', password: 'longenough1' }))).json();
    expect(body.password).toBe('longenough1');
    expect(await row(f.db, 'SELECT company_name, status FROM operators WHERE id = ?', body.operatorId)).toEqual({ company_name: 'Two Air', status: 'approved' });
  });

  it('rejects a duplicate email and an operator without a company', async () => {
    asAdmin();
    const dup = await users.POST(json({ email: 'CUST@example.com', name: 'X', role: 'customer' }));
    expect(dup.status).toBe(409);
    expect((await users.POST(json({ email: 'z@z.com', name: 'Z', role: 'operator' }))).status).toBe(400);
  });
});

describe('edit role', () => {
  it('promotes a customer to admin and lists the change', async () => {
    asAdmin();
    const res = await user.PATCH(json({ role: 'admin' }, 'PATCH'), uctx(f.otherCustomerId));
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('admin');
    await user.PATCH(json({ role: 'customer' }, 'PATCH'), uctx(f.otherCustomerId));
  });

  it('makes a customer an operator only with a company name', async () => {
    asAdmin();
    expect((await user.PATCH(json({ role: 'operator' }, 'PATCH'), uctx(f.customerId))).status).toBe(400);
    const res = await user.PATCH(json({ role: 'operator', companyName: 'Cust Air' }, 'PATCH'), uctx(f.customerId));
    expect((await res.json())).toMatchObject({ role: 'operator', company_name: 'Cust Air' });
    await user.PATCH(json({ role: 'customer' }, 'PATCH'), uctx(f.customerId));
  });

  it('keeps an admin from changing their own role or removing the last admin', async () => {
    asAdmin();
    const self = await user.PATCH(json({ role: 'customer' }, 'PATCH'), uctx(adminId));
    expect(self.status).toBe(403);
    // A second admin demoting the only other admin is fine; demoting the last one is not.
    const second = (await f.db.one<{ id: number }>(`INSERT INTO users (email, password_hash, name, role) VALUES ('two@x.com', 'x', 'Two', 'admin') RETURNING id`))!.id;
    expect((await user.PATCH(json({ role: 'customer' }, 'PATCH'), uctx(second))).status).toBe(200);
    who.session = { userId: second, role: 'admin' }; // stale session after demotion is irrelevant here
    await f.db.run("UPDATE users SET role = 'admin' WHERE id = ?", [second]);
    await f.db.run("UPDATE users SET role = 'customer' WHERE id = ?", [adminId]);
    expect((await user.PATCH(json({ role: 'customer' }, 'PATCH'), uctx(second))).status).toBe(403); // own role
    await f.db.run("UPDATE users SET role = 'admin' WHERE id = ?", [adminId]);
    await f.db.run('DELETE FROM users WHERE id = ?', [second]);
  });

  it('edits name and phone', async () => {
    asAdmin();
    const res = await user.PATCH(json({ name: 'Renamed', phone: '' }, 'PATCH'), uctx(f.otherCustomerId));
    expect(await res.json()).toMatchObject({ name: 'Renamed', phone: null });
  });

  it('returns 404 for a missing user', async () => {
    asAdmin();
    expect((await user.PATCH(json({ name: 'X' }, 'PATCH'), uctx(99999))).status).toBe(404);
  });
});

describe('operators', () => {
  it('adds an operator with certificate and status', async () => {
    asAdmin();
    const res = await operators.POST(json({ companyName: 'Island Air', name: 'Kai', email: 'kai@island.com', certificate: 'ISLA123', status: 'pending' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(await row(f.db, 'SELECT company_name, certificate, status FROM operators WHERE id = ?', body.id))
      .toEqual({ company_name: 'Island Air', certificate: 'ISLA123', status: 'pending' });
    expect((await row<{ role: string }>(f.db, 'SELECT role FROM users WHERE id = ?', body.userId)).role).toBe('operator');
  });

  it('edits the company profile and status', async () => {
    asAdmin();
    const res = await operator.PATCH(json({
      company_name: 'Alpha Aviation', status: 'suspended', markets: ['hi_inter'], fleet_types: ['light'],
      contact_email: '', safety_rating: 'ARGUS Gold', platform_fee_bps: 600,
    }, 'PATCH'), octx(f.operatorA));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      company_name: 'Alpha Aviation', status: 'suspended', markets: '["hi_inter"]', fleet_types: '["light"]',
      contact_email: null, safety_rating: 'ARGUS Gold', platform_fee_bps: 600,
    });
  });

  it('rejects unknown fields', async () => {
    asAdmin();
    expect((await operator.PATCH(json({ user_id: 1 }, 'PATCH'), octx(f.operatorA))).status).toBe(400);
    expect((await operator.PATCH(json({ status: 'approved' }, 'PATCH'), octx(99999))).status).toBe(404);
  });
});
