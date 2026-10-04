/**
 * Company board: everything an operator's staff needs to see about incoming
 * charters, in one payload the board page polls.
 */

import { randomBytes } from 'crypto';
import type { Db } from '@/lib/db';
import { legsByRequest } from '@/lib/db/queries';
import { fromDbLegs, type TripLeg } from '@/lib/trip-format';

export interface BoardTrip {
  requestId: number;
  status: string;
  legs: TripLeg[];
  passengerCount: number;
  specialRequests: string | null;
  aircraft: string | null;
  quoteCents: number | null;
  leadPassenger: { name: string; phone: string | null; email: string } | null;
  /** When this trip last changed, for "new" highlighting. */
  updatedAt: string;
}

export interface Board {
  generatedAt: string;
  company: string;
  upcoming: BoardTrip[];
  toQuote: BoardTrip[];
  awaitingClient: BoardTrip[];
  cancelled: BoardTrip[];
}

interface Row {
  id: number;
  status: string;
  passenger_count: number;
  notes: string | null;
  updated_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string;
  quote_cents: number | null;
  aircraft_type: string | null;
  tail_number: string | null;
}

const BASE = `
  SELECT br.id, br.status, br.passenger_count, br.notes, br.updated_at,
    u.name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
    q.price_cents AS quote_cents, a.type AS aircraft_type, a.tail_number
  FROM booking_requests br
  JOIN users u ON u.id = br.customer_id
  LEFT JOIN quotes q ON q.request_id = br.id AND q.operator_id = ?
  LEFT JOIN aircraft a ON a.id = q.aircraft_id
`;

export async function buildBoard(db: Db, operatorId: number): Promise<Board> {
  const company = (await db.one<{ company_name: string }>('SELECT company_name FROM operators WHERE id = ?', [operatorId]))?.company_name ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const [booked, toQuote, awaiting, cancelled] = await Promise.all([
    // Paid bookings won by this operator whose last leg is today or later
    db.query<Row>(`${BASE}
      WHERE q.status = 'accepted' AND br.status IN ('booked', 'completed')
        AND (SELECT MAX(departure_date) FROM booking_legs WHERE request_id = br.id) >= ?
    `, [operatorId, today]),
    // Matched requests this operator has not quoted yet
    db.query<Row>(`${BASE}
      JOIN outreach_log ol ON ol.request_id = br.id AND ol.operator_id = ?
      WHERE q.id IS NULL AND br.status IN ('open', 'quoted')
      ORDER BY ol.sent_at DESC LIMIT 50
    `, [operatorId, operatorId]),
    // Quoted, waiting for the client to pay
    db.query<Row>(`${BASE}
      WHERE q.status = 'pending' AND br.status IN ('open', 'quoted')
      ORDER BY q.created_at DESC LIMIT 50
    `, [operatorId]),
    // This operator's bookings cancelled in the last 14 days
    db.query<Row>(`${BASE}
      WHERE q.status = 'accepted' AND br.status = 'cancelled' AND br.updated_at > now() - interval '14 days'
      ORDER BY br.updated_at DESC LIMIT 20
    `, [operatorId]),
  ]);

  const legs = await legsByRequest(db, [...booked, ...toQuote, ...awaiting, ...cancelled].map(r => r.id));
  const toTrip = (r: Row, withContact: boolean): BoardTrip => ({
    requestId: r.id,
    status: r.status,
    legs: fromDbLegs(legs.get(r.id) ?? []),
    passengerCount: r.passenger_count,
    specialRequests: r.notes?.trim() || null,
    aircraft: r.aircraft_type ? `${r.aircraft_type}${r.tail_number ? ` (${r.tail_number})` : ''}` : null,
    quoteCents: r.quote_cents,
    leadPassenger: withContact ? { name: r.customer_name, phone: r.customer_phone, email: r.customer_email } : null,
    updatedAt: r.updated_at,
  });
  const firstDeparture = (t: BoardTrip) => `${t.legs[0]?.date ?? ''}T${t.legs[0]?.time || '00:00'}`;

  return {
    generatedAt: new Date().toISOString(),
    company,
    // Client contact details only once the client has booked with this operator.
    upcoming: booked.map(r => toTrip(r, true)).sort((a, b) => firstDeparture(a).localeCompare(firstDeparture(b))),
    toQuote: toQuote.map(r => toTrip(r, false)),
    awaitingClient: awaiting.map(r => toTrip(r, false)),
    cancelled: cancelled.map(r => toTrip(r, true)),
  };
}

// ─── Staff board link ───────────────────────────────────────────────

export async function getBoardToken(db: Db, operatorId: number): Promise<string | null> {
  return (await db.one<{ token: string }>('SELECT token FROM operator_boards WHERE operator_id = ?', [operatorId]))?.token ?? null;
}

export async function createBoardToken(db: Db, operatorId: number): Promise<string> {
  return (await db.one<{ token: string }>(`
    INSERT INTO operator_boards (operator_id, token) VALUES (?, ?)
    ON CONFLICT (operator_id) DO UPDATE SET token = EXCLUDED.token, created_at = now()
    RETURNING token
  `, [operatorId, randomBytes(24).toString('base64url')]))!.token;
}

export async function revokeBoardToken(db: Db, operatorId: number): Promise<void> {
  await db.run('DELETE FROM operator_boards WHERE operator_id = ?', [operatorId]);
}

export async function operatorForBoardToken(db: Db, token: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return (await db.one<{ operator_id: number }>(
    "SELECT ob.operator_id FROM operator_boards ob JOIN operators o ON o.id = ob.operator_id WHERE ob.token = ? AND o.status = 'approved'",
    [token]
  ))?.operator_id ?? null;
}

export const boardUrl = (baseUrl: string, token: string) => `${baseUrl}/board/${token}`;

export async function boardUrlFor(db: Db, operatorId: number, baseUrl: string): Promise<string | null> {
  const token = await getBoardToken(db, operatorId);
  return token ? boardUrl(baseUrl, token) : null;
}
