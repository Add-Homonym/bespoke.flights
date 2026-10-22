/**
 * Empty legs: repositioning flights an operator lists at a fixed all-in price.
 *
 *   list        public listing of upcoming flights
 *   create      operator lists a flight from their fleet
 *   book        a traveler takes a listing: a request plus a ready-to-pay
 *               quote (is_empty_leg = 1) are created; payment goes through
 *               the normal checkout
 *   onBooked    when that payment clears the listing is marked booked and
 *               every other traveler's quote on it is withdrawn
 *   expire      daily: listings whose date has passed
 *   forRequest  listings that fit an open request (same route, date within
 *               the listing's flex window, enough seats)
 */

import type { Db } from '@/lib/db';
import type { EmptyLeg, Quote } from '@/lib/types';
import { findAirport } from '@/lib/airports';
import { notifyEmptyLegUnavailable } from '@/lib/notify/traveler';

export class EmptyLegError extends Error {
  /** The form field the message belongs under, when there is one. */
  constructor(message: string, public status: number, public field?: string) { super(message); }
}

/** Seats cannot exceed what the named aircraft carries. */
async function checkSeats(db: Db, aircraftId: number | null, seats: number): Promise<void> {
  if (!aircraftId) return;
  const plane = await db.one<{ capacity: number; type: string }>('SELECT capacity, type FROM aircraft WHERE id = ?', [aircraftId]);
  if (plane && seats > plane.capacity) {
    throw new EmptyLegError(`This ${plane.type} seats ${plane.capacity}. Enter ${plane.capacity} or fewer.`, 400, 'seats');
  }
}

export interface EmptyLegView extends EmptyLeg {
  company_name: string;
  certificate: string | null;
  safety_rating: string | null;
  aircraft_type: string | null;
  tail_number: string | null;
  aircraft_capacity: number | null;
  aircraft_year: number | null;
}

const VIEW = `
  SELECT el.*, o.company_name, o.certificate, o.safety_rating,
    a.type AS aircraft_type, a.tail_number, a.capacity AS aircraft_capacity, a.year AS aircraft_year
  FROM empty_legs el
  JOIN operators o ON o.id = el.operator_id
  LEFT JOIN aircraft a ON a.id = el.aircraft_id`;

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Upcoming listings from approved operators, soonest first. Codes are ICAO or IATA; both are matched. */
export async function listEmptyLegs(db: Db, filter: { from?: string | null; to?: string | null; today?: string } = {}): Promise<EmptyLegView[]> {
  const today = filter.today ?? todayUtc();
  const params: unknown[] = [today];
  let where = "WHERE el.status = 'listed' AND o.status = 'approved' AND el.departure_date >= ?";
  const code = (c: string) => c.trim().toUpperCase();
  if (filter.from) { where += ' AND el.origin_code = ANY(?)'; params.push(variants(code(filter.from))); }
  if (filter.to) { where += ' AND el.dest_code = ANY(?)'; params.push(variants(code(filter.to))); }
  return db.query<EmptyLegView>(`${VIEW} ${where} ORDER BY el.departure_date, el.departure_time NULLS LAST, el.price_cents`, params);
}

/** Both codes of a known airport ('OGG' → ['OGG','PHOG']); an unknown code matches itself and its K-prefixed/unprefixed form. */
function variants(code: string): string[] {
  const a = findAirport(code);
  if (a) return [...new Set([code, a.iata, a.icao])];
  const set = new Set([code]);
  if (code.length === 3) set.add(`K${code}`);
  if (code.length === 4 && code.startsWith('K')) set.add(code.slice(1));
  return [...set];
}

export async function getEmptyLeg(db: Db, id: number): Promise<EmptyLegView | undefined> {
  return db.one<EmptyLegView>(`${VIEW} WHERE el.id = ?`, [id]);
}

export async function operatorEmptyLegs(db: Db, operatorId: number): Promise<EmptyLegView[]> {
  return db.query<EmptyLegView>(`${VIEW} WHERE el.operator_id = ? ORDER BY el.departure_date DESC, el.id DESC`, [operatorId]);
}

export interface NewEmptyLeg {
  aircraftId?: number | null;
  originCode: string;
  destCode: string;
  departureDate: string;
  departureTime?: string | null;
  flexDays: number;
  seats: number;
  priceCents: number;
  currency: string;
  notes?: string | null;
}

export async function createEmptyLeg(db: Db, operatorId: number, input: NewEmptyLeg): Promise<number> {
  if (input.aircraftId) {
    const owned = await db.one('SELECT id FROM aircraft WHERE id = ? AND operator_id = ?', [input.aircraftId, operatorId]);
    if (!owned) throw new EmptyLegError('Aircraft not in your fleet', 400, 'aircraftId');
  }
  await checkSeats(db, input.aircraftId ?? null, input.seats);
  const { id } = (await db.one<{ id: number }>(`
    INSERT INTO empty_legs (operator_id, aircraft_id, origin_code, dest_code, departure_date, departure_time, flex_days, seats, price_cents, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [operatorId, input.aircraftId ?? null, input.originCode.toUpperCase(), input.destCode.toUpperCase(), input.departureDate,
      input.departureTime || null, input.flexDays, input.seats, input.priceCents, input.currency, input.notes || null]))!;
  return id;
}

export interface EmptyLegPatch {
  priceCents?: number;
  seats?: number;
  departureDate?: string;
  departureTime?: string | null;
  flexDays?: number;
  notes?: string | null;
}

/**
 * Price, seats, date, time, flexibility or notes of a listing nobody has booked.
 * Travelers who already hold a quote keep their price. A quote made for a date
 * or time that has since moved, or for more guests than the listing now seats,
 * is withdrawn and that traveler is told.
 */
export async function updateEmptyLeg(db: Db, operatorId: number, id: number, patch: EmptyLegPatch, baseUrl = ''): Promise<EmptyLeg> {
  const leg = await db.one<EmptyLeg>('SELECT * FROM empty_legs WHERE id = ? AND operator_id = ?', [id, operatorId]);
  if (!leg) throw new EmptyLegError('Listing not found', 404);
  if (leg.status !== 'listed') throw new EmptyLegError(`This listing is ${leg.status}. Only a listed flight can be edited.`, 409);
  const seats = patch.seats ?? leg.seats;
  await checkSeats(db, leg.aircraft_id, seats);
  const date = patch.departureDate ?? leg.departure_date;
  const time = patch.departureTime === undefined ? leg.departure_time : (patch.departureTime || null);
  const moved = date !== leg.departure_date || time !== leg.departure_time;

  const affected = await db.transaction(async tx => {
    await tx.run(`
      UPDATE empty_legs SET price_cents = COALESCE(?, price_cents), seats = ?, departure_date = ?, departure_time = ?,
        flex_days = COALESCE(?, flex_days), notes = ?, updated_at = now() WHERE id = ?
    `, [patch.priceCents ?? null, seats, date, time, patch.flexDays ?? null,
        patch.notes === undefined ? leg.notes : (patch.notes || null), id]);
    if (moved) {
      return closeOtherQuotes(tx, id, null);
    }
    if (seats < leg.seats) {
      const rows = await tx.query<{ request_id: number }>(`
        UPDATE quotes SET status = 'withdrawn'
        WHERE empty_leg_id = ? AND status = 'pending'
          AND request_id IN (SELECT id FROM booking_requests WHERE passenger_count > ?)
        RETURNING request_id`, [id, seats]);
      return rows.map(r => r.request_id);
    }
    return [];
  });
  for (const requestId of affected) await notifyEmptyLegUnavailable(db, requestId, baseUrl);
  return (await db.one<EmptyLeg>('SELECT * FROM empty_legs WHERE id = ?', [id]))!;
}

/** Take a listing off the market. Pending quotes made from it are withdrawn and those travelers are told. */
export async function withdrawEmptyLeg(db: Db, operatorId: number, id: number, baseUrl: string): Promise<void> {
  const leg = await db.one<EmptyLeg>('SELECT * FROM empty_legs WHERE id = ? AND operator_id = ?', [id, operatorId]);
  if (!leg) throw new EmptyLegError('Listing not found', 404);
  if (leg.status === 'booked') throw new EmptyLegError('This flight is booked. Cancel it from the trip page instead.', 409);
  if (leg.status !== 'listed') return;
  const affected = await db.transaction(async tx => {
    await tx.run("UPDATE empty_legs SET status = 'withdrawn', updated_at = now() WHERE id = ?", [id]);
    return closeOtherQuotes(tx, id, null);
  });
  for (const requestId of affected) await notifyEmptyLegUnavailable(db, requestId, baseUrl);
}

/**
 * A traveler takes a listing. Creates a request in status 'quoted' with one
 * leg and one pending quote at the listed price, valid until the departure
 * date. Returns the request id; the traveler pays from the trip page.
 */
export async function bookEmptyLeg(
  db: Db, listingId: number, customerId: number, input: { passengerCount: number; notes?: string | null },
): Promise<{ requestId: number; quoteId: number }> {
  const leg = await getEmptyLeg(db, listingId);
  if (!leg) throw new EmptyLegError('Flight not found', 404);
  if (leg.status !== 'listed') throw new EmptyLegError('This flight is no longer available', 409);
  if (leg.departure_date < todayUtc()) throw new EmptyLegError('This flight has departed', 409);
  if (input.passengerCount > leg.seats) throw new EmptyLegError(`This flight has ${leg.seats} seats`, 400);
  const operator = await db.one<{ status: string }>('SELECT status FROM operators WHERE id = ?', [leg.operator_id]);
  if (operator?.status !== 'approved') throw new EmptyLegError('This flight is no longer available', 409);

  const open = await db.one<{ id: number }>(
    "SELECT q.id FROM quotes q JOIN booking_requests br ON br.id = q.request_id WHERE q.empty_leg_id = ? AND br.customer_id = ? AND q.status = 'pending' AND br.status IN ('open','quoted')",
    [listingId, customerId]);
  if (open) {
    const r = (await db.one<{ request_id: number }>('SELECT request_id FROM quotes WHERE id = ?', [open.id]))!;
    return { requestId: r.request_id, quoteId: open.id };
  }

  const notes = input.notes?.trim() || null;
  return db.transaction(async tx => {
    const { id: requestId } = (await tx.one<{ id: number }>(
      "INSERT INTO booking_requests (customer_id, status, passenger_count, notes, form_variant, empty_leg_id) VALUES (?, 'quoted', ?, ?, 'empty_leg', ?) RETURNING id",
      [customerId, input.passengerCount, notes, leg.id]))!;
    await tx.run(
      'INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, 1, ?, ?, ?, ?)',
      [requestId, leg.origin_code, leg.dest_code, leg.departure_date, leg.departure_time]);
    const { id: quoteId } = (await tx.one<{ id: number }>(`
      INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, currency, message, valid_until, is_empty_leg, empty_leg_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING id
    `, [requestId, leg.operator_id, leg.aircraft_id, leg.price_cents, leg.currency,
        leg.flex_days > 0 ? `Empty leg. Departure may move by up to ${leg.flex_days} day${leg.flex_days === 1 ? '' : 's'}; the operator confirms the time after booking.` : 'Empty leg. Listed price, no further quotes needed.',
        leg.departure_date, leg.id]))!;
    return { requestId, quoteId };
  });
}

/**
 * The listing behind a quote, if it is still open to this booking. Used by
 * checkout and fulfillment: a listing taken by someone else cannot be paid.
 */
export async function listingAvailable(db: Db, quote: Pick<Quote, 'empty_leg_id'>): Promise<boolean> {
  if (!quote.empty_leg_id) return true;
  const leg = await db.one<{ status: string }>('SELECT status FROM empty_legs WHERE id = ?', [quote.empty_leg_id]);
  return leg?.status === 'listed';
}

/** Withdraw every pending quote on a listing except `keepQuoteId`; returns the affected request ids. */
async function closeOtherQuotes(db: Db, listingId: number, keepQuoteId: number | null): Promise<number[]> {
  const rows = await db.query<{ request_id: number }>(`
    UPDATE quotes SET status = 'withdrawn' WHERE empty_leg_id = ? AND status = 'pending' ${keepQuoteId ? 'AND id != ?' : ''} RETURNING request_id
  `, keepQuoteId ? [listingId, keepQuoteId] : [listingId]);
  return [...new Set(rows.map(r => r.request_id))];
}

/**
 * Inside the fulfillment transaction, once the quote is accepted: the listing
 * is booked and rival quotes are withdrawn. Returns the requests whose
 * travelers lost out, so the caller can email them after commit.
 */
export async function markListingBooked(tx: Db, quote: Pick<Quote, 'id' | 'empty_leg_id' | 'request_id'>): Promise<number[]> {
  if (!quote.empty_leg_id) return [];
  await tx.run("UPDATE empty_legs SET status = 'booked', booked_request_id = ?, updated_at = now() WHERE id = ? AND status = 'listed'",
    [quote.request_id, quote.empty_leg_id]);
  return closeOtherQuotes(tx, quote.empty_leg_id, quote.id);
}

/** A booked listing whose trip was cancelled goes back on the market when its date has not passed. */
export async function relistAfterCancellation(db: Db, requestId: number): Promise<void> {
  await db.run(`
    UPDATE empty_legs SET status = CASE WHEN departure_date >= ? THEN 'listed' ELSE 'expired' END, booked_request_id = NULL, updated_at = now()
    WHERE booked_request_id = ? AND status = 'booked'
  `, [todayUtc(), requestId]);
}

/** Daily: listings whose departure date is before today. */
export async function expireEmptyLegs(db: Db, today = todayUtc()): Promise<number> {
  return db.run("UPDATE empty_legs SET status = 'expired', updated_at = now() WHERE status = 'listed' AND departure_date < ?", [today]);
}

/**
 * Listings that fit a request: a single leg (or its first leg) on the same
 * route, departing within the listing's flex window of the requested date,
 * with enough seats, from an operator other than one that already quoted
 * from that listing.
 */
export async function emptyLegsForRequest(db: Db, requestId: number): Promise<EmptyLegView[]> {
  const leg = await db.one<{ origin_code: string; dest_code: string; departure_date: string; passenger_count: number; legs: number }>(`
    SELECT bl.origin_code, bl.dest_code, bl.departure_date, br.passenger_count,
      (SELECT COUNT(*) FROM booking_legs WHERE request_id = br.id) AS legs
    FROM booking_requests br JOIN booking_legs bl ON bl.request_id = br.id AND bl.leg_order = 1
    WHERE br.id = ? AND br.status IN ('open','quoted')
  `, [requestId]);
  if (!leg || leg.legs !== 1) return [];
  return db.query<EmptyLegView>(`${VIEW}
    WHERE el.status = 'listed' AND o.status = 'approved'
      AND el.origin_code = ANY(?) AND el.dest_code = ANY(?)
      AND el.seats >= ?
      AND el.departure_date >= ?
      AND ABS(CAST(el.departure_date AS date) - CAST(? AS date)) <= el.flex_days
      AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = ? AND q.empty_leg_id = el.id)
    ORDER BY el.price_cents
  `, [variants(leg.origin_code), variants(leg.dest_code), leg.passenger_count, todayUtc(), leg.departure_date, requestId]);
}

/**
 * The operator accepts a request with one of their listings: a quote at the
 * listed price is created on that request (the listing stays open for others
 * until a payment clears).
 */
export async function quoteRequestFromListing(db: Db, operatorId: number, listingId: number, requestId: number, baseUrl: string): Promise<number> {
  const leg = await db.one<EmptyLeg>('SELECT * FROM empty_legs WHERE id = ? AND operator_id = ?', [listingId, operatorId]);
  if (!leg || leg.status !== 'listed') throw new EmptyLegError('Listing not available', 409);
  const request = await db.one<{ status: string; passenger_count: number }>('SELECT status, passenger_count FROM booking_requests WHERE id = ?', [requestId]);
  if (!request || !['open', 'quoted'].includes(request.status)) throw new EmptyLegError('Request is closed', 409);
  if (request.passenger_count > leg.seats) throw new EmptyLegError('Not enough seats for this request', 400);
  const existing = await db.one("SELECT id FROM quotes WHERE request_id = ? AND operator_id = ? AND status IN ('pending','accepted')", [requestId, operatorId]);
  if (existing) throw new EmptyLegError('You have already quoted this request', 409);
  const quoteId = await db.transaction(async tx => {
    const { id } = (await tx.one<{ id: number }>(`
      INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, currency, message, valid_until, is_empty_leg, empty_leg_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING id
    `, [requestId, operatorId, leg.aircraft_id, leg.price_cents, leg.currency, `Empty leg on ${leg.departure_date}.`, leg.departure_date, leg.id]))!;
    await tx.run("UPDATE booking_requests SET status = 'quoted', updated_at = now() WHERE id = ? AND status = 'open'", [requestId]);
    await tx.run("UPDATE outreach_log SET status = 'responded', responded_at = now() WHERE request_id = ? AND operator_id = ?", [requestId, operatorId]);
    return id;
  });
  const { notifyNewQuote } = await import('@/lib/notify/traveler');
  await notifyNewQuote(db, quoteId, baseUrl);
  return quoteId;
}

// ─── Visitors ───────────────────────────────────────────────────────
// A visitor who picks a flight before signing in: the choice is kept in a
// cookie and booked right after sign-in or sign-up (like the booking draft).

export const EMPTY_LEG_COOKIE = 'bf_empty_leg';

export function parseEmptyLegCookie(raw: string | undefined): { id: number; passengerCount: number; notes?: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { id?: unknown; passengerCount?: unknown; notes?: unknown };
    const id = Number(v.id), passengerCount = Number(v.passengerCount);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(passengerCount) || passengerCount <= 0) return null;
    return { id, passengerCount, notes: typeof v.notes === 'string' ? v.notes.slice(0, 300) : undefined };
  } catch { return null; }
}

/** After sign-in or sign-up: book the chosen flight for this traveler and clear the cookie. Returns the request id, or null. */
export async function claimEmptyLegCookie(db: Db, customerId: number): Promise<number | null> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const choice = parseEmptyLegCookie(store.get(EMPTY_LEG_COOKIE)?.value);
  if (!choice) return null;
  store.delete(EMPTY_LEG_COOKIE);
  try {
    return (await bookEmptyLeg(db, choice.id, customerId, { passengerCount: choice.passengerCount, notes: choice.notes })).requestId;
  } catch (err) {
    if (err instanceof EmptyLegError) return null;
    throw err;
  }
}
