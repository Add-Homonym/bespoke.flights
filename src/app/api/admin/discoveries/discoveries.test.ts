import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let route: typeof import('./route');

const get = (qs = '') => route.GET(new Request('http://localhost/api/admin/discoveries' + qs));

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  route = await import('./route');
  who.session = { userId: 1, role: 'admin' };
});
afterAll(() => setDb(null));

describe('discoveries API', () => {
  it('lists an empty table with numeric stats', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.stats.total).toBe(0);
    expect(body.stats.new_count).toBe(0);
  });

  it('lists, filters and updates rows', async () => {
    await f.db.run(`INSERT INTO discovered_operators (company_name, certificate_number, state, status) VALUES ('Alpha Air','A1X','HI','no_email'), ('Beta Jets','B2Y','CA','new')`);
    let body = await (await get()).json();
    expect(body.data).toHaveLength(2);
    expect(body.stats).toMatchObject({ total: 2, new_count: 1, no_email_count: 1 });
    body = await (await get('?status=no_email&state=hi&q=alpha')).json();
    expect(body.data).toHaveLength(1);
    const id = body.data[0].id;
    const res = await route.PATCH(new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, contact_email: 'a@alpha.com' }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ contact_email: 'a@alpha.com', status: 'new' });
  });
});

describe('state rotation', () => {
  it('continues after the furthest state of the last batch', async () => {
    const { getNextStateBatch, US_STATES } = await import('@/lib/discovery/faa-scraper');
    expect(getNextStateBatch(['AL', 'AK', 'AZ'], 2)).toEqual(US_STATES.slice(3, 5));
    expect(getNextStateBatch(['AZ', 'AL'], 2)).toEqual(US_STATES.slice(3, 5));
    expect(getNextStateBatch([], 2)).toEqual(US_STATES.slice(0, 2));
  });
});
