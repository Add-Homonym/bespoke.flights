import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { addStaff } from '@/lib/staff/roster';
import { getThread, NOTIFY_THROTTLE_MS, postMessage, unreadByOperator, unreadForOperator } from './messages';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const BASE = 'https://bespoke.flights';
let f: Fixture;
let log: ReturnType<typeof vi.spyOn>;
let route: typeof import('@/app/api/booking-requests/[requestId]/messages/route');
let opUserA: number;
let opUserB: number;

const params = (requestId: number) => ({ params: Promise.resolve({ requestId: String(requestId) }) });
const get = (operatorId?: number, after?: number) =>
  new Request(`http://localhost/x?${operatorId ? `operatorId=${operatorId}` : ''}${after ? `&after=${after}` : ''}`);
const post = (body: unknown, operatorId?: number) =>
  new Request(`http://localhost/x${operatorId ? `?operatorId=${operatorId}` : ''}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
const emails = () => log.mock.calls.filter(c => c[0] === '  To:').map(c => String(c[1]));
const subjects = () => log.mock.calls.filter(c => c[0] === '  Subject:').map(c => String(c[1]));

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_TEST_MODE', '');
  vi.stubEnv('APP_URL', BASE);
  route = await import('@/app/api/booking-requests/[requestId]/messages/route');
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

beforeEach(async () => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  opUserA = (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id;
  opUserB = (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorB)).user_id;
});

describe('route authorization', () => {
  it('requires a session and a thread that exists (operator has quoted)', async () => {
    who.session = null;
    expect((await route.GET(get(f.operatorA), params(f.requestId))).status).toBe(401);
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await route.GET(get(), params(f.requestId))).status).toBe(400);
    // An operator who never quoted this request has no thread with the traveler.
    await f.db.run('DELETE FROM quotes WHERE id = ?', [f.quoteB]);
    expect((await route.GET(get(f.operatorB), params(f.requestId))).status).toBe(403);
    who.session = { userId: opUserB, role: 'operator' };
    expect((await route.GET(get(), params(f.requestId))).status).toBe(403);
    expect((await route.POST(post({ body: 'hi' }), params(f.requestId))).status).toBe(403);
  });

  it('keeps another customer out, and an operator out of a rival thread', async () => {
    who.session = { userId: f.otherCustomerId, role: 'customer' };
    expect((await route.GET(get(f.operatorA), params(f.requestId))).status).toBe(403);
    who.session = { userId: opUserB, role: 'operator' };
    expect((await route.GET(get(f.operatorA), params(f.requestId))).status).toBe(403);
    expect((await route.POST(post({ body: 'hi' }, f.operatorA), params(f.requestId))).status).toBe(403);
  });

  it('traveler and quoting operator exchange messages; admins read only; no contact details leak', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    const sent = await route.POST(post({ body: 'Is catering included?' }, f.operatorA), params(f.requestId));
    expect(sent.status).toBe(201);
    expect(await sent.json()).toMatchObject({ from: 'customer', senderName: 'Customer' });

    who.session = { userId: opUserA, role: 'operator' };
    const seen = await (await route.GET(get(), params(f.requestId))).json();
    expect(seen.viewer).toBe('operator');
    expect(seen.messages).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toMatch(/@|phone/i);
    expect((await route.POST(post({ body: 'Yes, light catering is included.' }), params(f.requestId))).status).toBe(201);

    who.session = { userId: 999, role: 'admin' };
    expect((await (await route.GET(get(f.operatorA), params(f.requestId))).json()).messages).toHaveLength(2);
    expect((await route.POST(post({ body: 'x' }, f.operatorA), params(f.requestId))).status).toBe(403);

    // Validation
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await route.POST(post({ body: '   ' }, f.operatorA), params(f.requestId))).status).toBe(400);
    expect((await route.POST(post({ body: 'x'.repeat(2001) }, f.operatorA), params(f.requestId))).status).toBe(400);
    expect((await route.POST(new Request('http://localhost/x?operatorId=' + f.operatorA, { method: 'POST', body: '{' }), params(f.requestId))).status).toBe(400);

    // Incremental fetch
    const newer = await (await route.GET(get(f.operatorA, 1), params(f.requestId))).json();
    expect(newer.messages.map((m: { id: number }) => m.id)).toEqual([2]);
  });
});

describe('read receipts', () => {
  it('counts unread per side and clears when the recipient opens the thread', async () => {
    await postMessage(f.db, { requestId: f.requestId, operatorId: f.operatorA, senderUserId: f.customerId, side: 'customer', body: 'a' });
    await postMessage(f.db, { requestId: f.requestId, operatorId: f.operatorA, senderUserId: f.customerId, side: 'customer', body: 'b' });
    expect(await unreadForOperator(f.db, f.requestId, f.operatorA)).toBe(2);
    await getThread(f.db, f.requestId, f.operatorA, 'customer');   // sender looking does not clear
    expect(await unreadForOperator(f.db, f.requestId, f.operatorA)).toBe(2);
    await getThread(f.db, f.requestId, f.operatorA, 'operator');
    expect(await unreadForOperator(f.db, f.requestId, f.operatorA)).toBe(0);

    await postMessage(f.db, { requestId: f.requestId, operatorId: f.operatorA, senderUserId: opUserA, side: 'operator', body: 'c' });
    expect((await unreadByOperator(f.db, f.requestId, f.customerId)).get(f.operatorA)).toBe(1);
  });
});

describe('notifications', () => {
  it('emails the recipient once per 10 minutes per thread and side, and alerts staff on traveler messages', async () => {
    await addStaff(f.db, f.operatorA, { name: 'Dee', email: 'dee@alpha.com', notify_email: true, notify_sms: false, on_new_request: false, on_booking: false, on_cancellation: false, on_message: true });
    const t0 = Date.parse('2030-01-01T10:00:00Z');
    const send = (side: 'customer' | 'operator', body: string, now: number) => postMessage(f.db, {
      requestId: f.requestId, operatorId: f.operatorA, senderUserId: side === 'customer' ? f.customerId : opUserA, side, body, baseUrl: BASE, now,
    });

    await send('customer', 'one', t0);
    expect(emails()).toEqual(['dispatch@alpha.com', 'dee@alpha.com']);   // operator email + staff alert
    expect(subjects()[0]).toBe(`New message from Customer — Request #${f.requestId}`);
    log.mockClear();

    await send('customer', 'two', t0 + 60_000);
    expect(emails()).toEqual(['dee@alpha.com']);   // throttled email, staff alert still per message
    log.mockClear();

    // The other direction has its own window.
    await send('operator', 'reply', t0 + 60_000);
    expect(emails()).toEqual(['cust@example.com']);
    log.mockClear();
    await send('operator', 'again', t0 + 120_000);
    expect(emails()).toEqual([]);
    log.mockClear();

    // Window elapsed.
    await send('customer', 'three', t0 + NOTIFY_THROTTLE_MS + 1);
    expect(emails()[0]).toBe('dispatch@alpha.com');
    log.mockClear();

    // A different operator's thread is independent.
    await send('customer', 'four', t0 + NOTIFY_THROTTLE_MS + 2);
    expect(emails()).not.toContain('dispatch@alpha.com');
    const opUserBEmail = 'b@ops.com';
    await postMessage(f.db, { requestId: f.requestId, operatorId: f.operatorB, senderUserId: f.customerId, side: 'customer', body: 'hi B', baseUrl: BASE, now: t0 });
    expect(emails()).toContain(opUserBEmail);
  });
});
