import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import type { BookingRequest, EmptyLeg, SessionPayload } from '@/lib/types';

/** Operator empty-leg listings: capacity and date rules, editing, and how a booking reads before payment. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
let f: Fixture;
let aircraft: number;
let create: typeof import('./route');
let one: typeof import('./[legId]/route');
let book: typeof import('../../empty-legs/[legId]/book/route');

const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (legId: number) => ({ params: Promise.resolve({ legId: String(legId) }) });

const listingBody = (over: Record<string, unknown> = {}) => ({
  aircraftId: aircraft, originCode: 'HNL', destCode: 'OGG', departureDate: future(10), departureTime: '09:00',
  flexDays: 1, seats: 6, priceCents: 450_000, ...over,
});

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  create = await import('./route');
  one = await import('./[legId]/route');
  book = await import('../../empty-legs/[legId]/book/route');
});
afterAll(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

beforeEach(async () => {
  f = await createFixture();
  setDb(f.db);
  aircraft = (await f.db.one<{ id: number }>(
    "INSERT INTO aircraft (operator_id, tail_number, type, capacity) VALUES (?, 'N100AA', 'Citation CJ3', 6) RETURNING id", [f.operatorA]))!.id;
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' };
});

describe('creating a listing', () => {
  it('rejects more seats than the aircraft carries', async () => {
    const res = await create.POST(json(listingBody({ seats: 9 })));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.seats[0]).toMatch(/seats 6/);
  });

  it('rejects a past date', async () => {
    const res = await create.POST(json(listingBody({ departureDate: '2020-01-01' })));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.departureDate).toEqual(['Departure date is in the past']);
  });

  it('accepts seats up to capacity', async () => {
    expect((await create.POST(json(listingBody({ seats: 6 })))).status).toBe(201);
  });
});

describe('editing an unbooked listing', () => {
  const makeListing = async () => (await (await create.POST(json(listingBody()))).json()).id as number;

  it('changes seats, date, time, notes and price', async () => {
    const id = await makeListing();
    const res = await one.PATCH(json({ seats: 4, departureDate: future(12), departureTime: '14:30', notes: 'Catering included', priceCents: 400_000 }, 'PATCH'), ctx(id));
    expect(res.status).toBe(200);
    expect(await row<EmptyLeg>(f.db, 'SELECT * FROM empty_legs WHERE id = ?', id)).toMatchObject({
      seats: 4, departure_date: future(12), departure_time: '14:30', notes: 'Catering included', price_cents: 400_000,
    });
  });

  it('applies the same capacity and date rules', async () => {
    const id = await makeListing();
    const tooMany = await one.PATCH(json({ seats: 7 }, 'PATCH'), ctx(id));
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).fieldErrors.seats).toBeTruthy();
    const past = await one.PATCH(json({ departureDate: '2020-01-01' }, 'PATCH'), ctx(id));
    expect(past.status).toBe(400);
    expect((await past.json()).fieldErrors.departureDate).toBeTruthy();
  });

  it('refuses to edit a booked listing', async () => {
    const id = await makeListing();
    await f.db.run("UPDATE empty_legs SET status = 'booked' WHERE id = ?", [id]);
    expect((await one.PATCH(json({ seats: 3 }, 'PATCH'), ctx(id))).status).toBe(409);
  });

  it('withdraws a traveler\'s open quote when the date moves', async () => {
    const id = await makeListing();
    who.session = { userId: f.customerId, role: 'customer' };
    const booked = await (await book.POST(json({ passengerCount: 2 }), ctx(id))).json();
    who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', f.operatorA)).user_id, role: 'operator' };
    await one.PATCH(json({ departureDate: future(15) }, 'PATCH'), ctx(id));
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM quotes WHERE id = ?', booked.quoteId)).status).toBe('withdrawn');
  });
});

describe('booking an empty leg', () => {
  it('keeps the traveler\'s notes clean, links the listing in its own field, and holds the trip until paid', async () => {
    const id = (await (await create.POST(json(listingBody()))).json()).id as number;
    who.session = { userId: f.customerId, role: 'customer' };
    const res = await book.POST(json({ passengerCount: 2, notes: 'Two surfboards' }), ctx(id));
    expect(res.status).toBe(201);
    const { requestId, quoteId } = await res.json();

    const request = await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', requestId);
    expect(request.notes).toBe('Two surfboards');
    expect(request.notes).not.toMatch(/Empty leg #/);
    expect(request.empty_leg_id).toBe(id);
    // Not booked, not paid: the request is still open to payment.
    expect(request.status).toBe('quoted');
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*)::int AS n FROM payments WHERE request_id = ?', requestId)).n).toBe(0);
    // The aircraft comes from the listing.
    expect((await row<{ aircraft_id: number }>(f.db, 'SELECT aircraft_id FROM quotes WHERE id = ?', quoteId)).aircraft_id).toBe(aircraft);
  });

  it('books with no notes without inventing a special request', async () => {
    const id = (await (await create.POST(json(listingBody()))).json()).id as number;
    who.session = { userId: f.customerId, role: 'customer' };
    const { requestId } = await (await book.POST(json({ passengerCount: 1 }), ctx(id))).json();
    expect((await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', requestId)).notes).toBeNull();
  });
});
