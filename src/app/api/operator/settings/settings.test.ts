import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let settings: typeof import('./route');

const patch = (body: unknown) =>
  new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  settings = await import('./route');
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' };
});

afterAll(() => { setDb(null); vi.restoreAllMocks(); });

describe('PATCH /api/operator/settings validation', () => {
  it('rejects an invalid email with a field error in plain language', async () => {
    const res = await settings.PATCH(patch({ contact_email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.contact_email).toEqual(['Enter a valid email address']);
    expect(typeof body.error).toBe('string');
  });

  it('rejects a short phone number', async () => {
    const res = await settings.PATCH(patch({ contact_phone: '123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.contact_phone).toEqual(['Enter at least 7 characters']);
  });

  it('rejects a fractional refund percentage (12.5%) and out-of-range values', async () => {
    const policy = { full_refund_hours: 72, partial_refund_hours: 24 };
    const fractional = await settings.PATCH(patch({ cancellation_policy: { ...policy, partial_refund_bps: 1250 } }));
    expect(fractional.status).toBe(400);
    expect((await fractional.json()).fieldErrors['cancellation_policy.partial_refund_bps']).toEqual(['Enter a whole percentage from 0 to 100']);

    const over = await settings.PATCH(patch({ cancellation_policy: { ...policy, partial_refund_bps: 12_000 } }));
    expect(over.status).toBe(400);

    const ok = await settings.PATCH(patch({ cancellation_policy: { ...policy, partial_refund_bps: 1200 } }));
    expect(ok.status).toBe(200);
  });

  it('accepts valid values and saves them', async () => {
    const res = await settings.PATCH(patch({ contact_email: 'sales@alpha.com', contact_phone: '+1-555-123-4567' }));
    expect(res.status).toBe(200);
    expect((await res.json()).contact_email).toBe('sales@alpha.com');
  });
});
