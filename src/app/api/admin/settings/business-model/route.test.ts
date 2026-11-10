import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

/** Admin business-model settings: admin-only, validated, merged over defaults. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let route: typeof import('./route');

const patch = (body: unknown) =>
  new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  const adminId = (await f.db.one<{ id: number }>(`INSERT INTO users (email, password_hash, name, role) VALUES ('boss@x.com', 'x', 'Boss', 'admin') RETURNING id`))!.id;
  who.session = { userId: adminId, role: 'admin' };
  route = await import('./route');
});
afterAll(() => { setDb(null); vi.restoreAllMocks(); });

describe('access', () => {
  it('refuses everyone but admins', async () => {
    const keep = who.session;
    for (const s of [null, { userId: f.customerId, role: 'customer' as const }]) {
      who.session = s;
      expect((await route.GET()).status).toBe(403);
      expect((await route.PATCH(patch({ operatorCommissionBps: 800 }))).status).toBe(403);
    }
    who.session = keep;
  });
});

describe('settings', () => {
  it('returns defaults, then the saved values', async () => {
    expect((await (await route.GET()).json()).feePayer).toBe('operator');
    const res = await route.PATCH(patch({ operatorCommissionBps: 800, rankQuotesBy: 'score' }));
    expect(res.status).toBe(200);
    const body = await (await route.GET()).json();
    expect(body.operatorCommissionBps).toBe(800);
    expect(body.rankQuotesBy).toBe('score');
    expect(body.emptyLegCommissionBps).toBe(1500);
  });

  it('validates', async () => {
    expect((await route.PATCH(patch('{nope'))).status).toBe(400);
    expect((await route.PATCH(patch({}))).status).toBe(400);
    expect((await route.PATCH(patch({ operatorCommissionBps: 50.5 }))).status).toBe(400);
    expect((await route.PATCH(patch({ feePayer: 'nobody' }))).status).toBe(400);
    expect((await route.PATCH(patch({ unknownKey: 1 }))).status).toBe(400);
    expect((await route.PATCH(patch({ launchPromoUntil: 'soon' }))).status).toBe(400);
  });
});
