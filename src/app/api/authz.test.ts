import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { SessionPayload } from '@/lib/types';

/**
 * Route-level authorization: who may read or change a booking request, its
 * quotes and its outreach log, and who may call the discovery cron.
 */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let request: typeof import('./booking-requests/[requestId]/route');
let quotes: typeof import('./booking-requests/[requestId]/quotes/route');
let outreach: typeof import('./outreach/route');
let cron: typeof import('./cron/weekly-discovery/route');
let cancel: typeof import('./booking-requests/[requestId]/cancel/route');
let changes: typeof import('./booking-requests/[requestId]/changes/route');
let changeOne: typeof import('./change-requests/[changeId]/route');

const params = (requestId: number) => ({ params: Promise.resolve({ requestId: String(requestId) }) });
const json = (body: unknown, method = 'PATCH') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  request = await import('./booking-requests/[requestId]/route');
  quotes = await import('./booking-requests/[requestId]/quotes/route');
  outreach = await import('./outreach/route');
  cron = await import('./cron/weekly-discovery/route');
  cancel = await import('./booking-requests/[requestId]/cancel/route');
  changes = await import('./booking-requests/[requestId]/changes/route');
  changeOne = await import('./change-requests/[changeId]/route');
  await f.db.run(
    'INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [f.requestId, f.operatorA, 'email', 80, 'RFQ', 'body', 'sent']);
});

afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const asCustomer = () => { who.session = { userId: f.customerId, role: 'customer' }; };
const asOther = () => { who.session = { userId: f.otherCustomerId, role: 'customer' }; };
const asOperatorA = async () => { who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' }; };
const asOperatorB = async () => { who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorB)).user_id, role: 'operator' }; };
const asAdmin = () => { who.session = { userId: 999, role: 'admin' }; };

describe('GET /api/booking-requests/[id]', () => {
  it('rejects anonymous callers', async () => {
    who.session = null;
    expect((await request.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(401);
  });

  it('hides another customer\'s request', async () => {
    asOther();
    expect((await request.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(403);
  });

  it('shows the owner the customer details', async () => {
    asCustomer();
    const res = await request.GET(new Request('http://localhost/x'), params(f.requestId));
    expect(res.status).toBe(200);
    expect((await res.json()).customer.email).toBe('cust@example.com');
  });

  it('shows an operator an open request without customer contact details', async () => {
    await asOperatorB();
    const res = await request.GET(new Request('http://localhost/x'), params(f.requestId));
    expect(res.status).toBe(200);
    expect((await res.json()).customer).toBeNull();
  });
});

describe('GET /api/booking-requests/[id]/quotes', () => {
  it('gives the owner every quote', async () => {
    asCustomer();
    const res = await quotes.GET(new Request('http://localhost/x'), params(f.requestId));
    expect((await res.json()).length).toBe(2);
  });

  it('gives an operator only its own quote', async () => {
    await asOperatorA();
    const res = await quotes.GET(new Request('http://localhost/x'), params(f.requestId));
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].operator_id).toBe(f.operatorA);
  });

  it('refuses another customer', async () => {
    asOther();
    expect((await quotes.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(403);
  });
});

describe('POST /api/booking-requests/[id]/quotes', () => {
  it('refuses an aircraft from another operator\'s fleet', async () => {
    const foreign = await row<{ id: number }>(f.db,
      "INSERT INTO aircraft (operator_id, tail_number, type, capacity) VALUES (?, 'N1', 'G650', 12) RETURNING id", f.operatorB);
    await f.db.run("UPDATE quotes SET status = 'withdrawn' WHERE id = ?", [f.quoteA]);
    await asOperatorA();
    const res = await quotes.POST(json({ priceCents: 100_000, aircraftId: foreign.id }, 'POST'), params(f.requestId));
    expect(res.status).toBe(400);
    await f.db.run("UPDATE quotes SET status = 'pending' WHERE id = ?", [f.quoteA]);
  });

  it('refuses a second live quote', async () => {
    await asOperatorA();
    const res = await quotes.POST(json({ priceCents: 100_000 }, 'POST'), params(f.requestId));
    expect(res.status).toBe(409);
  });

  it('refuses quotes on a booked request', async () => {
    await f.db.run("UPDATE booking_requests SET status = 'booked' WHERE id = ?", [f.requestId]);
    await f.db.run("UPDATE quotes SET status = 'withdrawn' WHERE id = ?", [f.quoteA]);
    await asOperatorA();
    const res = await quotes.POST(json({ priceCents: 100_000 }, 'POST'), params(f.requestId));
    expect(res.status).toBe(409);
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
    await f.db.run("UPDATE quotes SET status = 'pending' WHERE id = ?", [f.quoteA]);
  });

  it('rejects malformed JSON with 400', async () => {
    await asOperatorA();
    const res = await quotes.POST(new Request('http://localhost/x', { method: 'POST', body: '{' }), params(f.requestId));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/booking-requests/[id] (cancel)', () => {
  it('refuses operators', async () => {
    await asOperatorA();
    expect((await request.PATCH(json({ status: 'cancelled' }), params(f.requestId))).status).toBe(403);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('quoted');
  });

  it('refuses other customers and bad bodies', async () => {
    asOther();
    expect((await request.PATCH(json({ status: 'cancelled' }), params(f.requestId))).status).toBe(403);
    asCustomer();
    expect((await request.PATCH(json({ status: 'booked' }), params(f.requestId))).status).toBe(400);
  });

  it('refuses the customer on a paid booking (refund flow instead)', async () => {
    await f.db.run("UPDATE booking_requests SET status = 'booked' WHERE id = ?", [f.requestId]);
    asCustomer();
    expect((await request.PATCH(json({ status: 'cancelled' }), params(f.requestId))).status).toBe(409);
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
  });

  it('lets the owner cancel an unpaid request and rejects pending quotes', async () => {
    asCustomer();
    const res = await request.PATCH(json({ status: 'cancelled' }), params(f.requestId));
    expect(res.status).toBe(200);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('cancelled');
    expect((await row<{ n: number }>(f.db, "SELECT COUNT(*) AS n FROM quotes WHERE request_id = ? AND status = 'pending'", f.requestId)).n).toBe(0);
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
    await f.db.run("UPDATE quotes SET status = 'pending' WHERE request_id = ?", [f.requestId]);
  });
});

describe('/api/booking-requests/[id]/cancel (paid booking)', () => {
  it('refuses operators and other customers, 409 on an unpaid request', async () => {
    await asOperatorA();
    expect((await cancel.POST(new Request('http://localhost/x', { method: 'POST' }), params(f.requestId))).status).toBe(403);
    asOther();
    expect((await cancel.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(403);
    asCustomer();
    expect((await cancel.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(409);
    expect((await cancel.POST(new Request('http://localhost/x', { method: 'POST' }), params(f.requestId))).status).toBe(409);
  });

  it('previews and performs the refund for the owner', async () => {
    const { createCheckout, simulateStubPayment } = await import('@/lib/payments/service');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: 'http://localhost:3000' });
    await simulateStubPayment(f.db, paymentId, f.customerId, 'http://localhost:3000');

    asCustomer();
    const preview = await (await cancel.GET(new Request('http://localhost/x'), params(f.requestId))).json();
    expect(preview).toMatchObject({ tier: 'full', refundCents: 8_500_000 });
    const res = await cancel.POST(new Request('http://localhost/x', { method: 'POST' }), params(f.requestId));
    expect(res.status).toBe(200);
    expect((await res.json()).refundCents).toBe(8_500_000);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('cancelled');

    // Reset for later suites.
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
    await f.db.run("UPDATE quotes SET status = 'pending' WHERE request_id = ?", [f.requestId]);
    await f.db.run('DELETE FROM refunds');
    await f.db.run('DELETE FROM payments');
  });
});

describe('change requests', () => {
  const proposal = { legs: [{ originCode: 'KLAX', destCode: 'PHOG', departureDate: '2030-06-01' }], passengerCount: 3 };
  const change = (id: number) => ({ params: Promise.resolve({ changeId: String(id) }) });

  it('refuses proposals from operators, other customers, and on unpaid requests', async () => {
    await asOperatorA();
    expect((await changes.POST(json(proposal, 'POST'), params(f.requestId))).status).toBe(403);
    asOther();
    expect((await changes.POST(json(proposal, 'POST'), params(f.requestId))).status).toBe(403);
    asCustomer();
    expect((await changes.POST(json(proposal, 'POST'), params(f.requestId))).status).toBe(409);
    expect((await changes.POST(json({ legs: [] }, 'POST'), params(f.requestId))).status).toBe(400);
  });

  it('owner proposes; only the winning operator resolves; losing operator cannot even list', async () => {
    const { createCheckout, simulateStubPayment } = await import('@/lib/payments/service');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: 'http://localhost:3000' });
    await simulateStubPayment(f.db, paymentId, f.customerId, 'http://localhost:3000');

    asCustomer();
    const created = await changes.POST(json(proposal, 'POST'), params(f.requestId));
    expect(created.status).toBe(201);
    const cr = await created.json();
    expect(cr.proposed_legs[0].destCode).toBe('PHOG');

    await asOperatorB();
    expect((await changes.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(403);
    expect((await changeOne.PATCH(json({ action: 'accept' }), change(cr.id))).status).toBe(403);
    asCustomer();
    expect((await changeOne.PATCH(json({ action: 'accept' }), change(cr.id))).status).toBe(403);
    expect((await changeOne.PATCH(json({ action: 'nope' }), change(cr.id))).status).toBe(400);

    await asOperatorA();
    expect((await changes.GET(new Request('http://localhost/x'), params(f.requestId))).status).toBe(200);
    const accepted = await changeOne.PATCH(json({ action: 'accept', newPriceCents: 9_000_000 }), change(cr.id));
    expect(accepted.status).toBe(200);
    const body = await accepted.json();
    expect(body.status).toBe('accepted');
    expect(body.paymentDue.amountCents).toBe(500_000);

    // Reset for later suites.
    await f.db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = ?", [f.requestId]);
    await f.db.run("UPDATE quotes SET status = 'pending' WHERE request_id = ?", [f.requestId]);
    await f.db.run('DELETE FROM payments');
    await f.db.run('DELETE FROM change_requests');
  });
});

describe('GET /api/outreach', () => {
  it('hides operator contact details from customers', async () => {
    asCustomer();
    const res = await outreach.GET(new Request(`http://localhost/x?requestId=${f.requestId}`));
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0]).not.toHaveProperty('contact_email');
  });

  it('shows admins contact details', async () => {
    asAdmin();
    const body = await (await outreach.GET(new Request(`http://localhost/x?requestId=${f.requestId}`))).json();
    expect(body[0].contact_email).toBe('dispatch@alpha.com');
  });

  it('refuses other customers', async () => {
    asOther();
    expect((await outreach.GET(new Request(`http://localhost/x?requestId=${f.requestId}`))).status).toBe(403);
  });

  it('limits an operator\'s recent activity to its own rows', async () => {
    await asOperatorB();
    expect((await (await outreach.GET(new Request('http://localhost/x'))).json()).length).toBe(0);
    await asOperatorA();
    expect((await (await outreach.GET(new Request('http://localhost/x'))).json()).length).toBe(1);
  });
});

describe('/api/cron/weekly-discovery', () => {
  beforeEach(() => { who.session = null; });

  it('refuses everyone when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await cron.GET(new Request('http://localhost/x'))).status).toBe(401);
    expect((await cron.POST(new Request('http://localhost/x', { method: 'POST' }))).status).toBe(401);
  });

  it('refuses a wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'top-secret');
    const req = new Request('http://localhost/x', { headers: { authorization: 'Bearer nope' } });
    expect((await cron.GET(req)).status).toBe(401);
  });

  it('validates the manual-run body for admins', async () => {
    vi.stubEnv('CRON_SECRET', '');
    asAdmin();
    const res = await cron.POST(json({ states: ['hawaii'] }, 'POST'));
    expect(res.status).toBe(400);
  });

  it('refuses the manual run for non-admins', async () => {
    asCustomer();
    expect((await cron.POST(json({}, 'POST'))).status).toBe(401);
  });
});
