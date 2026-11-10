import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let simulate: typeof import('./[paymentId]/simulate/route');
let checkout: typeof import('./checkout/route');

const post = (url: string, body?: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  simulate = await import('./[paymentId]/simulate/route');
  checkout = await import('./checkout/route');
  who.session = { userId: f.customerId, role: 'customer' };
});

afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('POST /api/payments/[id]/simulate', () => {
  it('returns 200 with the current state when called twice, and keeps a single payment row', async () => {
    const res = await checkout.POST(post('http://localhost/x', { quoteId: f.quoteA }));
    const { paymentId } = await res.json();
    const ctx = { params: Promise.resolve({ paymentId: String(paymentId) }) };

    const first = await simulate.POST(post('http://localhost/x'), ctx);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ outcome: 'booked', status: 'succeeded' });

    const second = await simulate.POST(post('http://localhost/x'), ctx);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ outcome: 'duplicate', status: 'succeeded' });

    expect((await row<{ c: number }>(f.db, 'SELECT COUNT(*)::int AS c FROM payments WHERE request_id = ?', f.requestId)).c).toBe(1);
  });

  it('never words a stale payment as "Payment is …"', async () => {
    const { rows } = { rows: await f.db.query<{ id: number }>('SELECT id FROM payments LIMIT 1') };
    await f.db.run("UPDATE payments SET status = 'canceled' WHERE id = ?", [rows[0]!.id]);
    const res = await simulate.POST(post('http://localhost/x'), { params: Promise.resolve({ paymentId: String(rows[0]!.id) }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).not.toMatch(/Payment is/);
  });
});
