/**
 * Trip sheets: once a booking is paid, the operator that won it can share
 * a private, read-only trip sheet with the rest of their company (dispatch,
 * crew, catering, FBO) by link, by email, or as a calendar file.
 *
 * A share link is a random token; whoever holds it can view the sheet until
 * the operator revokes it or it expires 30 days after the last leg.
 */

import { randomBytes } from 'crypto';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { tripSheetEmail } from '@/lib/email/templates';
import { fromDbLegs, legLine, tripRoute, type TripLeg } from '@/lib/trip-format';
import type { BookingLeg } from '@/lib/types';

export class ShareError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ShareError';
  }
}

const SHARE_DAYS_AFTER_TRIP = 30;
export const MAX_SHARE_RECIPIENTS = 20;

export interface TripSheet {
  requestId: number;
  status: string;
  operatorId: number;
  operatorCompany: string;
  aircraft: string | null;
  legs: TripLeg[];
  passengerCount: number;
  specialRequests: string | null;
  leadPassenger: { name: string; email: string; phone: string | null };
  expiresAt: string;
}

/** The booking, if this operator won it and it has been paid. */
async function bookedTripForOperator(db: Db, requestId: number, operatorId: number) {
  const row = await db.one<{ id: number; status: string; last_date: string | null }>(`
    SELECT br.id, br.status,
      (SELECT MAX(departure_date) FROM booking_legs WHERE request_id = br.id) AS last_date
    FROM booking_requests br
    JOIN quotes q ON q.request_id = br.id AND q.operator_id = ? AND q.status = 'accepted'
    WHERE br.id = ? AND br.status IN ('booked', 'completed')
  `, [operatorId, requestId]);
  return row;
}

async function activeShare(db: Db, requestId: number, operatorId: number) {
  return db.one<{ token: string; expires_at: string }>(`
    SELECT token, expires_at FROM trip_shares
    WHERE request_id = ? AND operator_id = ? AND revoked_at IS NULL AND expires_at > now()
    ORDER BY id DESC LIMIT 1
  `, [requestId, operatorId]);
}

/** Current share link token for a booking, or null. Only for the operator that won it. */
export async function getShare(db: Db, requestId: number, operatorId: number) {
  if (!(await bookedTripForOperator(db, requestId, operatorId))) return null;
  return (await activeShare(db, requestId, operatorId)) ?? null;
}

/** Return the active share link, creating one if needed. */
export async function getOrCreateShare(db: Db, requestId: number, operatorId: number, userId: number) {
  const trip = await bookedTripForOperator(db, requestId, operatorId);
  if (!trip) throw new ShareError('Only the operator of a paid booking can share it', 403);

  const existing = await activeShare(db, requestId, operatorId);
  if (existing) return existing;

  const lastDay = trip.last_date ? new Date(`${trip.last_date}T00:00:00Z`) : new Date();
  const expires = new Date(Math.max(lastDay.getTime(), Date.now()) + SHARE_DAYS_AFTER_TRIP * 86_400_000);

  return (await db.one<{ token: string; expires_at: string }>(`
    INSERT INTO trip_shares (request_id, operator_id, token, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING token, expires_at
  `, [requestId, operatorId, randomBytes(24).toString('base64url'), userId, expires.toISOString()]))!;
}

/** Disable every link for this booking. Existing links stop working immediately. */
export async function revokeShares(db: Db, requestId: number, operatorId: number) {
  if (!(await bookedTripForOperator(db, requestId, operatorId))) {
    throw new ShareError('Only the operator of a paid booking can share it', 403);
  }
  await db.run(`
    UPDATE trip_shares SET revoked_at = now()
    WHERE request_id = ? AND operator_id = ? AND revoked_at IS NULL
  `, [requestId, operatorId]);
}

/** Load the sheet behind a share token, or null if unknown, revoked or expired. */
export async function loadTripSheet(db: Db, token: string): Promise<TripSheet | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;

  const row = await db.one<{
    request_id: number; status: string; operator_id: number; company_name: string;
    aircraft_type: string | null; tail_number: string | null; passenger_count: number; notes: string | null;
    customer_name: string; customer_email: string; customer_phone: string | null; expires_at: string;
  }>(`
    SELECT s.request_id, br.status, s.operator_id, o.company_name,
      a.type AS aircraft_type, a.tail_number, br.passenger_count, br.notes,
      u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone, s.expires_at
    FROM trip_shares s
    JOIN booking_requests br ON br.id = s.request_id
    JOIN operators o ON o.id = s.operator_id
    JOIN users u ON u.id = br.customer_id
    LEFT JOIN quotes q ON q.request_id = br.id AND q.operator_id = s.operator_id AND q.status = 'accepted'
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE s.token = ? AND s.revoked_at IS NULL AND s.expires_at > now()
  `, [token]);
  if (!row) return null;

  const legs = await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [row.request_id]);
  return {
    requestId: row.request_id,
    status: row.status,
    operatorId: row.operator_id,
    operatorCompany: row.company_name,
    aircraft: row.aircraft_type ? `${row.aircraft_type}${row.tail_number ? ` (${row.tail_number})` : ''}` : null,
    legs: fromDbLegs(legs),
    passengerCount: row.passenger_count,
    specialRequests: row.notes?.trim() || null,
    leadPassenger: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
    expiresAt: row.expires_at,
  };
}

export const shareUrl = (baseUrl: string, token: string) => `${baseUrl}/trip/${token}`;

// ─── Email ──────────────────────────────────────────────────────────

const recipientsSchema = z.array(z.string().trim().toLowerCase().email()).min(1).max(MAX_SHARE_RECIPIENTS);

/** Split a free-form list ("a@x.com, b@x.com; c@x.com") into addresses. */
export function parseRecipients(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];
}

/** Email the trip sheet link to colleagues. Returns how many were sent. */
export async function emailTripSheet(
  db: Db,
  params: { requestId: number; operatorId: number; userId: number; recipients: string[]; baseUrl: string; senderName: string }
): Promise<{ sent: number; failed: string[] }> {
  const parsed = recipientsSchema.safeParse(params.recipients);
  if (!parsed.success) {
    throw new ShareError(`Enter between 1 and ${MAX_SHARE_RECIPIENTS} valid email addresses`, 400);
  }

  const { token } = await getOrCreateShare(db, params.requestId, params.operatorId, params.userId);
  const sheet = (await loadTripSheet(db, token))!;
  const { subject, html } = tripSheetEmail({
    requestId: sheet.requestId,
    route: tripRoute(sheet.legs),
    legLines: sheet.legs.map(legLine),
    passengerCount: sheet.passengerCount,
    specialRequests: sheet.specialRequests,
    aircraft: sheet.aircraft,
    operatorCompany: sheet.operatorCompany,
    senderName: params.senderName,
    url: shareUrl(params.baseUrl, token),
  });

  let sent = 0;
  const failed: string[] = [];
  for (const to of parsed.data) {
    const result = await sendEmail({
      to, subject, html,
      tags: [{ name: 'type', value: 'trip-sheet' }, { name: 'request_id', value: String(sheet.requestId) }],
    });
    if (result.error) failed.push(to); else sent++;
  }
  return { sent, failed };
}

// ─── Calendar ───────────────────────────────────────────────────────

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets, as RFC 5545 requires. */
function icsFold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * One event per leg. Times have no time zone in the booking (they are local
 * to the departure airport), so events are "floating": calendars show them
 * at the entered clock time. Legs without a time become all-day events.
 */
export function tripSheetIcs(sheet: TripSheet, url: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const details = [
    `${sheet.operatorCompany} · Booking #${sheet.requestId}`,
    sheet.aircraft ? `Aircraft: ${sheet.aircraft}` : null,
    `Passengers: ${sheet.passengerCount}`,
    `Special requests: ${sheet.specialRequests ?? 'none'}`,
    `Lead passenger: ${sheet.leadPassenger.name}${sheet.leadPassenger.phone ? `, ${sheet.leadPassenger.phone}` : ''}`,
    `Trip sheet: ${url}`,
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//bespoke.flights//Trip Sheet//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  sheet.legs.forEach((leg, i) => {
    const date = leg.date.replace(/-/g, '');
    const timed = /^\d{2}:\d{2}$/.test(leg.time);
    lines.push(
      'BEGIN:VEVENT',
      `UID:booking-${sheet.requestId}-leg-${i + 1}@bespoke.flights`,
      `DTSTAMP:${stamp}`,
      timed ? `DTSTART:${date}T${leg.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${date}`,
      ...(timed ? [] : [`DTEND;VALUE=DATE:${nextDay(leg.date)}`]),
      `SUMMARY:${icsEscape(`${leg.from} → ${leg.to} · Booking #${sheet.requestId} (leg ${i + 1}/${sheet.legs.length})`)}`,
      `LOCATION:${icsEscape(leg.from)}`,
      `DESCRIPTION:${icsEscape(details)}`,
      `URL:${url}`,
      sheet.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
