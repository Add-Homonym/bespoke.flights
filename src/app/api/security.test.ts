import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { createCheckout, markPaymentSucceeded, simulateStubPayment } from '@/lib/payments/service';
import { acceptChange, ChangeError, proposeChange } from '@/lib/bookings/changes';
import { getThread } from '@/lib/messaging/messages';
import { operatorInviteEmail, paymentReceiptEmail } from '@/lib/email/templates';
import { unsubscribeDiscovered } from '@/lib/discovery/unsubscribe';
import { createToken, verifyToken } from '@/lib/session-cookie';
import { proxy } from '@/proxy';
import type { BookingRequest, Operator, Payment, SessionPayload } from '@/lib/types';

/** Regression tests for the October 2026 security review. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const BASE = 'http://localhost:3000';
let f: Fixture;
let quoteRoute: typeof import('./quotes/[quoteId]/route');
let boardRoute: typeof import('./operator/board/route');
let shareRoute: typeof import('./operator/requests/[requestId]/share/route');
let staffTestRoute: typeof import('./operator/staff/[staffId]/test/route');
let settingsRoute: typeof import('./operator/settings/route');
let draftRoute: typeof import('./booking-requests/[requestId]/draft/route');
let unsubscribeRoute: typeof import('./unsubscribe/route');

const json = (body: unknown, method = 'PATCH') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const userOf = async (operatorId: number) => (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', operatorId)).user_id;
const asOperator = async (operatorId: number) => { who.session = { userId: await userOf(operatorId), role: 'operator' }; };
const setStatus = (operatorId: number, status: string) => f.db.run('UPDATE operators SET status = ? WHERE id = ?', [status, operatorId]);
const payment = (id: number) => row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', id);

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('TWILIO_ACCOUNT_SID', '');
  vi.stubEnv('APP_URL', BASE);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  quoteRoute = await import('./quotes/[quoteId]/route');
  boardRoute = await import('./operator/board/route');
  shareRoute = await import('./operator/requests/[requestId]/share/route');
  staffTestRoute = await import('./operator/staff/[staffId]/test/route');
  settingsRoute = await import('./operator/settings/route');
  draftRoute = await import('./booking-requests/[requestId]/draft/route');
  unsubscribeRoute = await import('./unsubscribe/route');
});

beforeEach(async () => {
  f = await createFixture();
  setDb(f.db);
  await f.db.run("UPDATE booking_requests SET notes = 'Gate code 4417' WHERE id = ?", [f.requestId]);
});

afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('quote price changes during checkout', () => {
  it('a price revision cancels the open checkout for that quote only', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await asOperator(f.operatorA);
    const res = await quoteRoute.PATCH(json({ priceCents: 9_900_000 }), { params: Promise.resolve({ quoteId: String(f.quoteA) }) });
    expect(res.status).toBe(200);
    expect((await payment(paymentId)).status).toBe('canceled');
  });

  it('a payment for a stale price does not book the request', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await f.db.run('UPDATE quotes SET price_cents = 9_900_000 WHERE id = ?', [f.quoteA]);
    expect(await markPaymentSucceeded(f.db, paymentId)).toBe('conflict');
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('quoted');
  });
});

describe('suspended operators', () => {
  beforeEach(async () => { await setStatus(f.operatorA, 'suspended'); await asOperator(f.operatorA); });
  const quoteParams = () => ({ params: Promise.resolve({ quoteId: String(f.quoteA) }) });

  it('cannot revise a quote, but can withdraw it', async () => {
    expect((await quoteRoute.PATCH(json({ priceCents: 100_000 }), quoteParams())).status).toBe(403);
    expect((await quoteRoute.PATCH(json({ status: 'withdrawn' }), quoteParams())).status).toBe(200);
  });

  it('cannot create Autopilot drafts', async () => {
    const res = await draftRoute.POST(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ requestId: String(f.requestId) }) });
    expect(res.status).toBe(403);
  });

  it('get a board without traveler notes or contact details', async () => {
    await setStatus(f.operatorA, 'approved');
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    await setStatus(f.operatorA, 'suspended');
    const text = JSON.stringify(await (await boardRoute.GET()).json());
    expect(text).not.toContain('cust@example.com');
    expect(text).not.toContain('Gate code');
  });

  it('cannot create or email trip share links', async () => {
    const params = { params: Promise.resolve({ requestId: String(f.requestId) }) };
    expect((await shareRoute.POST(json({ action: 'create' }, 'POST'), params)).status).toBe(403);
    expect((await shareRoute.POST(json({ action: 'email', recipients: 'x@example.com' }, 'POST'), params)).status).toBe(403);
  });
});

describe('pending operators', () => {
  it('cannot send staff test alerts', async () => {
    await setStatus(f.operatorA, 'pending');
    await asOperator(f.operatorA);
    const staffId = (await f.db.one<{ id: number }>(
      "INSERT INTO operator_staff (operator_id, name, phone, notify_sms) VALUES (?, 'X', '+19005550100', 1) RETURNING id", [f.operatorA]))!.id;
    const res = await staffTestRoute.POST(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ staffId: String(staffId) }) });
    expect(res.status).toBe(403);
  });
});

describe('operator settings', () => {
  it('an approved operator cannot change its certificate or safety rating', async () => {
    await f.db.run("UPDATE operators SET certificate = 'ABCD123', safety_rating = 'ARGUS Gold' WHERE id = ?", [f.operatorA]);
    await asOperator(f.operatorA);
    expect((await settingsRoute.PATCH(json({ certificate: 'ZZZZ999' }))).status).toBe(400);
    expect((await settingsRoute.PATCH(json({ safety_rating: 'Wyvern Wingman' }))).status).toBe(400);
    // Saving the same value (the settings form does this) is fine.
    expect((await settingsRoute.PATCH(json({ certificate: 'ABCD123' }))).status).toBe(200);
    const op = await row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorA);
    expect(op).toMatchObject({ certificate: 'ABCD123', safety_rating: 'ARGUS Gold' });
  });

  it('a pending operator can still fill them in', async () => {
    await setStatus(f.operatorA, 'pending');
    await asOperator(f.operatorA);
    expect((await settingsRoute.PATCH(json({ certificate: 'NEW1234' }))).status).toBe(200);
  });
});

describe('message threads', () => {
  it('an operator sees the traveler as "Traveler" until it wins the booking', async () => {
    const before = await getThread(f.db, f.requestId, f.operatorA, 'operator');
    expect(before.customerName).toBe('Traveler');
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    expect((await getThread(f.db, f.requestId, f.operatorA, 'operator')).customerName).toBe('Customer');
  });
});

describe('change requests', () => {
  it('two simultaneous accepts refund once', async () => {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    const request = await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', f.requestId);
    const cr = await proposeChange(f.db, request, f.customerId, {
      legs: [{ originCode: 'KLAX', destCode: 'PHOG', departureDate: '2030-06-01' }], passengerCount: 4,
    }, BASE);
    const op = await row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', f.operatorA);
    const results = await Promise.allSettled([
      acceptChange(f.db, cr.id, op, { newPriceCents: 8_000_000, baseUrl: BASE }),
      acceptChange(f.db, cr.id, op, { newPriceCents: 8_000_000, baseUrl: BASE }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ChangeError);
    expect((await payment(paymentId)).refunded_cents).toBe(500_000);
  });
});

describe('email templates', () => {
  it('escape operator-chosen names in the traveler receipt', () => {
    const { html } = paymentReceiptEmail({
      requestId: 1, route: 'KLAX → PHNL', dateRange: 'Jun 1', legLines: [], specialRequests: null, passengerCount: 2,
      operatorCompany: '<a href="https://evil.example">Confirm passport</a>', aircraft: '<img src=x>', amount: '$1', baseUrl: BASE,
    });
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;a href=');
  });

  it('the operator invite escapes scraped names and links to a working unsubscribe', () => {
    const { html } = operatorInviteEmail('<b>ACME</b>', 'X<1>', `${BASE}/unsubscribe?t=abc`);
    expect(html).toContain('&lt;b&gt;ACME&lt;/b&gt;');
    expect(html).toContain(`${BASE}/unsubscribe?t=abc`);
    expect(html).not.toContain('https://bespoke.flights/unsubscribe"');
  });
});

describe('unsubscribe', () => {
  const token = 'A'.repeat(24);
  beforeEach(async () => {
    await f.db.run("INSERT INTO discovered_operators (company_name, contact_email, status, unsubscribe_token) VALUES ('Acme', 'a@acme.test', 'emailed', ?)", [token]);
  });

  it('opts the discovered operator out', async () => {
    expect(await unsubscribeDiscovered(f.db, token)).toBe(true);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM discovered_operators WHERE unsubscribe_token = ?', token)).status).toBe('opted_out');
  });

  it('rejects unknown or malformed tokens', async () => {
    expect(await unsubscribeDiscovered(f.db, 'B'.repeat(24))).toBe(false);
    expect(await unsubscribeDiscovered(f.db, "' OR 1=1 --")).toBe(false);
    const res = await unsubscribeRoute.POST(new Request(`${BASE}/api/unsubscribe?t=nope`, { method: 'POST' }));
    expect(res.status).toBe(404);
  });

  it('accepts one-click POSTs with the token in the query string', async () => {
    const res = await unsubscribeRoute.POST(new Request(`${BASE}/api/unsubscribe?t=${token}`, { method: 'POST' }));
    expect(res.status).toBe(200);
  });
});

describe('session tokens', () => {
  it('round-trip a valid payload', async () => {
    expect(await verifyToken(await createToken({ userId: 7, role: 'customer' }))).toEqual({ userId: 7, role: 'customer' });
  });

  it('reject unsigned tokens and unexpected payloads', async () => {
    const none = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ userId: 1, role: 'admin' }))}.`;
    expect(await verifyToken(none)).toBeNull();
    // Correctly signed, wrong shape: forged roles never come out of verifyToken.
    const bad = await createToken({ userId: 1, role: 'superuser' } as unknown as SessionPayload);
    expect(await verifyToken(bad)).toBeNull();
    expect(await verifyToken(await new SignJWT({ userId: '1', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32)))).toBeNull();
  });
});

describe('proxy', () => {
  const req = (path: string, init: { method?: string; origin?: string } = {}) =>
    new NextRequest(`https://bespoke.flights${path}`, {
      method: init.method ?? 'POST',
      headers: { host: 'bespoke.flights', ...(init.origin ? { origin: init.origin } : {}) },
    });

  it('refuses cross-site writes to API routes', async () => {
    expect((await proxy(req('/api/auth/login', { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('allows same-origin writes, requests without Origin, and webhooks', async () => {
    expect((await proxy(req('/api/auth/login', { origin: 'https://bespoke.flights' }))).status).toBe(200);
    expect((await proxy(req('/api/auth/login'))).status).toBe(200);
    expect((await proxy(req('/api/webhooks/stripe', { origin: 'https://stripe.com' }))).status).toBe(200);
  });
});
