import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { createCheckout, simulateStubPayment } from '@/lib/payments/service';
import { cancelPaidBooking } from '@/lib/bookings/cancellation';
import {
  bookEmptyLeg, createEmptyLeg, EmptyLegError, emptyLegsForRequest, expireEmptyLegs, listEmptyLegs,
  quoteRequestFromListing, updateEmptyLeg, withdrawEmptyLeg,
} from './service';
import type { BookingRequest, EmptyLeg, Quote } from '@/lib/types';

const BASE = 'https://bespoke.flights';
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
let f: Fixture;
let aircraftA: number;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_TEST_MODE', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  aircraftA = (await f.db.one<{ id: number }>(
    "INSERT INTO aircraft (operator_id, tail_number, type, capacity) VALUES (?, 'N100AA', 'Citation CJ3', 6) RETURNING id", [f.operatorA]))!.id;
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const listing = (over: Partial<Parameters<typeof createEmptyLeg>[2]> = {}) => createEmptyLeg(f.db, f.operatorA, {
  aircraftId: aircraftA, originCode: 'PHNL', destCode: 'PHOG', departureDate: future(10), departureTime: '09:00',
  flexDays: 1, seats: 6, priceCents: 450_000, currency: 'USD', ...over,
});
const leg = (id: number) => row<EmptyLeg>(f.db, 'SELECT * FROM empty_legs WHERE id = ?', id);

describe('listing', () => {
  it('lists upcoming flights from approved operators and matches IATA or ICAO codes', async () => {
    const id = await listing();
    await listing({ departureDate: '2020-01-01' }).catch(() => null); // past dates are refused by the schema, not the service
    const all = await listEmptyLegs(f.db);
    expect(all.map(l => l.id)).toEqual([id]);
    expect(all[0]).toMatchObject({ company_name: 'Alpha Air', aircraft_type: 'Citation CJ3', aircraft_capacity: 6 });
    expect((await listEmptyLegs(f.db, { from: 'hnl' })).length).toBe(1);
    expect((await listEmptyLegs(f.db, { from: 'PHNL', to: 'OGG' })).length).toBe(1);
    expect((await listEmptyLegs(f.db, { to: 'KOA' })).length).toBe(0);
    await f.db.run("UPDATE operators SET status = 'pending' WHERE id = ?", [f.operatorA]);
    expect((await listEmptyLegs(f.db)).length).toBe(0);
  });

  it('refuses another operator\'s aircraft', async () => {
    await expect(createEmptyLeg(f.db, f.operatorB, {
      aircraftId: aircraftA, originCode: 'PHNL', destCode: 'PHOG', departureDate: future(3), flexDays: 0, seats: 4, priceCents: 100_000, currency: 'USD',
    })).rejects.toBeInstanceOf(EmptyLegError);
  });

  it('expires flights whose date has passed', async () => {
    const id = await listing();
    await f.db.run("UPDATE empty_legs SET departure_date = '2024-01-01' WHERE id = ?", [id]);
    expect(await expireEmptyLegs(f.db)).toBe(1);
    expect((await leg(id)).status).toBe('expired');
    expect(await expireEmptyLegs(f.db)).toBe(0);
  });
});

describe('booking', () => {
  it('creates a request with one leg and a ready-to-pay empty-leg quote', async () => {
    const id = await listing();
    const { requestId, quoteId } = await bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 3, notes: 'Two surfboards' });
    const request = await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', requestId);
    expect(request).toMatchObject({ status: 'quoted', passenger_count: 3, customer_id: f.customerId });
    expect(request.notes).toContain('Two surfboards');
    const legs = await f.db.query('SELECT * FROM booking_legs WHERE request_id = ?', [requestId]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ origin_code: 'PHNL', dest_code: 'PHOG', departure_time: '09:00' });
    const quote = await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', quoteId);
    expect(quote).toMatchObject({ price_cents: 450_000, is_empty_leg: 1, empty_leg_id: id, aircraft_id: aircraftA, status: 'pending' });
    expect(quote.valid_until).toBe(future(10));
    // Booking again returns the same open request instead of a duplicate.
    expect(await bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 2 })).toEqual({ requestId, quoteId });
  });

  it('refuses more guests than seats and flights that are not listed', async () => {
    const id = await listing({ seats: 4 });
    await expect(bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 5 })).rejects.toMatchObject({ status: 400 });
    await withdrawEmptyLeg(f.db, f.operatorA, id, BASE);
    await expect(bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('marks the listing booked on payment and withdraws other travelers\' quotes', async () => {
    const id = await listing();
    const mine = await bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 2 });
    const theirs = await bookEmptyLeg(f.db, id, f.otherCustomerId, { passengerCount: 2 });
    const { paymentId } = await createCheckout(f.db, { quoteId: mine.quoteId, customerId: f.customerId, baseUrl: BASE });
    expect(await simulateStubPayment(f.db, paymentId, f.customerId, BASE)).toBe('booked');
    expect(await leg(id)).toMatchObject({ status: 'booked', booked_request_id: mine.requestId });
    expect((await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', theirs.quoteId)).status).toBe('withdrawn');
    // The loser cannot pay for the withdrawn quote, and the listing refuses new checkouts.
    await expect(createCheckout(f.db, { quoteId: theirs.quoteId, customerId: f.otherCustomerId, baseUrl: BASE })).rejects.toMatchObject({ status: 409 });
    // The empty-leg commission applies.
    const payment = await row<{ platform_fee_cents: number; amount_cents: number }>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId);
    expect(payment.platform_fee_cents).toBeGreaterThan(0);
  });

  it('relists the flight when the traveler cancels before departure', async () => {
    const id = await listing();
    const { requestId, quoteId } = await bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 2 });
    const { paymentId } = await createCheckout(f.db, { quoteId, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    const request = await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', requestId);
    await cancelPaidBooking(f.db, request, { initiatedBy: f.customerId, baseUrl: BASE });
    expect(await leg(id)).toMatchObject({ status: 'listed', booked_request_id: null });
  });
});

describe('operator changes', () => {
  it('updates price and seats of a listed flight only', async () => {
    const id = await listing();
    expect((await updateEmptyLeg(f.db, f.operatorA, id, { priceCents: 400_000, notes: 'Catering included' })).price_cents).toBe(400_000);
    await expect(updateEmptyLeg(f.db, f.operatorB, id, { priceCents: 1 })).rejects.toMatchObject({ status: 404 });
    await withdrawEmptyLeg(f.db, f.operatorA, id, BASE);
    await expect(updateEmptyLeg(f.db, f.operatorA, id, { priceCents: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('withdrawing a listing withdraws the quotes made from it', async () => {
    const id = await listing();
    const { quoteId } = await bookEmptyLeg(f.db, id, f.customerId, { passengerCount: 1 });
    await withdrawEmptyLeg(f.db, f.operatorA, id, BASE);
    expect((await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', quoteId)).status).toBe('withdrawn');
    expect((await leg(id)).status).toBe('withdrawn');
  });
});

describe('matching a request', () => {
  const newRequest = async (date: string, pax = 2, legs: [string, string][] = [['PHNL', 'PHOG']]) => {
    const id = (await f.db.one<{ id: number }>("INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', ?) RETURNING id", [f.customerId, pax]))!.id;
    for (const [i, [o, d]] of legs.entries()) {
      await f.db.run('INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, ?, ?, ?, ?)', [id, i + 1, o, d, date]);
    }
    return id;
  };

  it('finds listed flights on the route within the flex window with enough seats', async () => {
    const id = await listing({ departureDate: future(10), flexDays: 1, seats: 4 });
    expect((await emptyLegsForRequest(f.db, await newRequest(future(11)))).map(l => l.id)).toEqual([id]);
    expect(await emptyLegsForRequest(f.db, await newRequest(future(12)))).toEqual([]);
    expect(await emptyLegsForRequest(f.db, await newRequest(future(10), 5))).toEqual([]);
    expect(await emptyLegsForRequest(f.db, await newRequest(future(10), 2, [['PHNL', 'PHOG'], ['PHOG', 'PHNL']]))).toEqual([]);
    expect(await emptyLegsForRequest(f.db, await newRequest(future(10), 2, [['PHOG', 'PHNL']]))).toEqual([]);
  });

  it('lets the operator quote a request from a listing, once', async () => {
    const id = await listing();
    const requestId = await newRequest(future(10));
    const quoteId = await quoteRequestFromListing(f.db, f.operatorA, id, requestId, BASE);
    expect(await row<Quote>(f.db, 'SELECT * FROM quotes WHERE id = ?', quoteId)).toMatchObject({ price_cents: 450_000, is_empty_leg: 1, empty_leg_id: id });
    expect((await row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', requestId)).status).toBe('quoted');
    expect(await emptyLegsForRequest(f.db, requestId)).toEqual([]);
    await expect(quoteRequestFromListing(f.db, f.operatorA, id, requestId, BASE)).rejects.toMatchObject({ status: 409 });
  });
});
