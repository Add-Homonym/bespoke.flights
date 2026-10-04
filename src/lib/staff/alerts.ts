/**
 * Automatic staff alerts. When something happens to a charter, every active
 * staff member of the operator who subscribed to that event is emailed and/or
 * texted.
 *
 * Idempotent: each (staff member, event, channel) is claimed in
 * staff_notifications before sending, so retried webhooks or repeated calls
 * never alert anyone twice. A failed send is retried by the next call.
 */

import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { staffAlertEmail } from '@/lib/email/templates';
import { sendSms } from '@/lib/notify/sms';
import { getOrCreateShare, shareUrl } from '@/lib/sharing/trip-share';
import { boardUrlFor } from '@/lib/board/data';
import { fromDbLegs, legLine, tripRoute, formatTripDate, formatTripTime } from '@/lib/trip-format';
import type { BookingLeg } from '@/lib/types';
import type { StaffMember } from './roster';

export type StaffEventKind = 'new_request' | 'booking' | 'cancellation';

const SUBSCRIPTION: Record<StaffEventKind, keyof StaffMember> = {
  new_request: 'on_new_request',
  booking: 'on_booking',
  cancellation: 'on_cancellation',
};

export interface AlertResult {
  sent: number;
  failed: number;
  skipped: number;
}

interface AlertContent {
  emailSubject: string;
  emailHtml: string;
  sms: string;
}

async function buildContent(db: Db, kind: StaffEventKind, requestId: number, operatorId: number, baseUrl: string): Promise<AlertContent | null> {
  const request = await db.one<{
    id: number; passenger_count: number; notes: string | null; customer_name: string; customer_phone: string | null;
  }>(`
    SELECT br.id, br.passenger_count, br.notes, u.name AS customer_name, u.phone AS customer_phone
    FROM booking_requests br JOIN users u ON u.id = br.customer_id WHERE br.id = ?
  `, [requestId]);
  if (!request) return null;

  const operator = (await db.one<{ company_name: string; user_id: number }>('SELECT company_name, user_id FROM operators WHERE id = ?', [operatorId]))!;
  const legs = fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId]));
  const quote = await db.one<{ price_cents: number; aircraft_type: string | null; tail_number: string | null }>(`
    SELECT q.price_cents, a.type AS aircraft_type, a.tail_number
    FROM quotes q LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ? AND q.operator_id = ? ORDER BY q.id DESC LIMIT 1
  `, [requestId, operatorId]);
  const aircraft = quote?.aircraft_type ? `${quote.aircraft_type}${quote.tail_number ? ` (${quote.tail_number})` : ''}` : null;

  const route = tripRoute(legs);
  const first = legs[0];
  const when = first ? [formatTripDate(first.date), formatTripTime(first.time)].filter(Boolean).join(' ') : '';
  const board = await boardUrlFor(db, operatorId, baseUrl);

  let heading: string, intro: string, link: string, linkLabel: string, smsLead: string;
  if (kind === 'booking') {
    const share = await getOrCreateShare(db, requestId, operatorId, operator.user_id);
    link = shareUrl(baseUrl, share.token);
    linkLabel = 'Open Trip Sheet';
    heading = `New charter booked: ${route}`;
    intro = `${request.customer_name} has paid. Booking #${requestId} is confirmed for ${operator.company_name}.`;
    smsLead = `BOOKED #${requestId}`;
  } else if (kind === 'cancellation') {
    link = board ?? `${baseUrl}/operator/requests/${requestId}`;
    linkLabel = board ? 'Open Company Board' : 'View Request';
    heading = `Charter cancelled: ${route}`;
    intro = `Booking #${requestId} for ${operator.company_name} has been cancelled. Release the aircraft and crew.`;
    smsLead = `CANCELLED #${requestId}`;
  } else {
    link = board ?? `${baseUrl}/operator/requests/${requestId}`;
    linkLabel = board ? 'Open Company Board' : 'Quote This Request';
    heading = `New charter request: ${route}`;
    intro = `A new request matching ${operator.company_name}'s markets and fleet is waiting for a quote.`;
    smsLead = `NEW REQUEST #${requestId}`;
  }

  const { subject, html } = staffAlertEmail({
    subject: `${heading} (#${requestId})`,
    heading,
    intro,
    legLines: legs.map(legLine),
    passengerCount: request.passenger_count,
    specialRequests: request.notes?.trim() || null,
    aircraft,
    leadPassenger: kind === 'new_request' ? null : request.customer_name,
    url: link,
    buttonLabel: linkLabel,
  });

  const sms = [
    `bespoke.flights ${smsLead}: ${route}`,
    when && `${when}${legs.length > 1 ? ` (+${legs.length - 1} more leg${legs.length > 2 ? 's' : ''})` : ''}`,
    `${request.passenger_count} pax${aircraft ? `, ${aircraft}` : ''}`,
    request.notes?.trim() && `Requests: ${request.notes.trim().slice(0, 120)}`,
    link,
  ].filter(Boolean).join('\n');

  return { emailSubject: subject, emailHtml: html, sms };
}

/** Claim a (staff, event, channel) slot. Returns false if already sent. */
async function claim(db: Db, staffId: number, eventKey: string, channel: 'email' | 'sms'): Promise<boolean> {
  const row = await db.one(`
    INSERT INTO staff_notifications (staff_id, event_key, channel, status)
    VALUES (?, ?, ?, 'sent')
    ON CONFLICT (staff_id, event_key, channel) DO UPDATE SET status = 'sent', error = NULL, created_at = now()
      WHERE staff_notifications.status = 'failed'
    RETURNING id
  `, [staffId, eventKey, channel]);
  return !!row;
}

async function markFailed(db: Db, staffId: number, eventKey: string, channel: 'email' | 'sms', error: string) {
  await db.run(`
    UPDATE staff_notifications SET status = 'failed', error = ? WHERE staff_id = ? AND event_key = ? AND channel = ?
  `, [error.slice(0, 500), staffId, eventKey, channel]);
}

/** Alert the operator's subscribed staff about a charter event. Never throws. */
export async function alertStaff(
  db: Db,
  event: { kind: StaffEventKind; requestId: number; operatorId: number },
  baseUrl: string
): Promise<AlertResult> {
  const result: AlertResult = { sent: 0, failed: 0, skipped: 0 };
  try {
    const staff = (await db.query<StaffMember>(
      'SELECT * FROM operator_staff WHERE operator_id = ? AND active = 1 ORDER BY id', [event.operatorId]
    )).filter(s => s[SUBSCRIPTION[event.kind]] === 1);
    if (staff.length === 0) return result;

    const content = await buildContent(db, event.kind, event.requestId, event.operatorId, baseUrl);
    if (!content) return result;
    const eventKey = `${event.kind}:${event.requestId}`;

    for (const member of staff) {
      if (member.notify_email && member.email) {
        if (!(await claim(db, member.id, eventKey, 'email'))) { result.skipped++; }
        else {
          const r = await sendEmail({
            to: member.email, subject: content.emailSubject, html: content.emailHtml,
            tags: [{ name: 'type', value: `staff-${event.kind}` }, { name: 'request_id', value: String(event.requestId) }],
          });
          if (r.error) { result.failed++; await markFailed(db, member.id, eventKey, 'email', r.error); } else result.sent++;
        }
      }
      if (member.notify_sms && member.phone) {
        if (!(await claim(db, member.id, eventKey, 'sms'))) { result.skipped++; }
        else {
          const r = await sendSms({ to: member.phone, body: content.sms });
          if (r.error) { result.failed++; await markFailed(db, member.id, eventKey, 'sms', r.error); } else result.sent++;
        }
      }
    }
  } catch (err) {
    console.error(`Staff alert ${event.kind} for request ${event.requestId} failed:`, err);
  }
  return result;
}

/** The operator whose quote was accepted on a request, if any. */
export async function bookedOperatorId(db: Db, requestId: number): Promise<number | null> {
  const row = await db.one<{ operator_id: number }>(
    "SELECT operator_id FROM quotes WHERE request_id = ? AND status = 'accepted' LIMIT 1", [requestId]
  );
  return row?.operator_id ?? null;
}
