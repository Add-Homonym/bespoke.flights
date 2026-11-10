/**
 * In-app messaging between a traveler and an operator about one request.
 *
 * One thread per (request, operator), available once the operator has quoted.
 * Bodies are plain text (≤ 2000 chars). Phone numbers and email addresses are
 * never included in the thread payload; the parties' names are enough.
 *
 * Each new message emails the other side with a link, at most once per
 * thread and recipient every NOTIFY_THROTTLE_MS, and raises a 'message'
 * staff alert for the operator.
 */

import { z } from 'zod';
import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { newMessageEmail } from '@/lib/email/templates';
import { appBaseUrl } from '@/lib/payments/config';
import { alertStaff } from '@/lib/staff/alerts';
import { fromDbLegs, tripRoute } from '@/lib/trip-format';
import type { BookingLeg } from '@/lib/types';

export const MAX_MESSAGE_LENGTH = 2000;
export const NOTIFY_THROTTLE_MS = 10 * 60 * 1000;

export const messageInputSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(MAX_MESSAGE_LENGTH),
});

export interface Message {
  id: number;
  request_id: number;
  operator_id: number;
  sender_user_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ThreadMessage {
  id: number;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Which side wrote it. */
  from: 'customer' | 'operator';
  /** Display name: the traveler's name or the company name. */
  senderName: string;
}

export interface Thread {
  requestId: number;
  operatorId: number;
  operatorName: string;
  customerName: string;
  messages: ThreadMessage[];
}

async function parties(db: Db, requestId: number, operatorId: number) {
  return (await db.one<{ customer_id: number; customer_name: string; operator_user_id: number; company_name: string }>(`
    SELECT br.customer_id, u.name AS customer_name, o.user_id AS operator_user_id, o.company_name
    FROM booking_requests br
    JOIN users u ON u.id = br.customer_id
    JOIN operators o ON o.id = ?
    WHERE br.id = ?
  `, [operatorId, requestId]))!;
}

/** The thread. When `viewer` is given, messages from the other side are marked read. */
export async function getThread(
  db: Db, requestId: number, operatorId: number, viewer?: 'customer' | 'operator' | 'admin', afterId = 0,
): Promise<Thread> {
  const p = await parties(db, requestId, operatorId);
  if (viewer === 'customer' || viewer === 'operator') {
    const otherSender = viewer === 'customer' ? p.operator_user_id : p.customer_id;
    await db.run('UPDATE messages SET read_at = now() WHERE request_id = ? AND operator_id = ? AND sender_user_id = ? AND read_at IS NULL',
      [requestId, operatorId, otherSender]);
  }
  const rows = await db.query<Message>(
    'SELECT * FROM messages WHERE request_id = ? AND operator_id = ? AND id > ? ORDER BY id ASC LIMIT 500',
    [requestId, operatorId, afterId]);
  const customerName = viewer === 'operator' ? await customerNameForOperator(db, requestId, operatorId, p.customer_name) : p.customer_name;
  return {
    requestId,
    operatorId,
    operatorName: p.company_name,
    customerName,
    messages: rows.map(m => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
      from: m.sender_user_id === p.customer_id ? 'customer' : 'operator',
      senderName: m.sender_user_id === p.customer_id ? customerName : p.company_name,
    })),
  };
}

/** Unread counts per operator thread on a request, for the traveler's page. */
export async function unreadByOperator(db: Db, requestId: number, customerId: number): Promise<Map<number, number>> {
  const rows = await db.query<{ operator_id: number; n: number }>(`
    SELECT operator_id, COUNT(*) AS n FROM messages
    WHERE request_id = ? AND sender_user_id <> ? AND read_at IS NULL GROUP BY operator_id
  `, [requestId, customerId]);
  return new Map(rows.map(r => [r.operator_id, r.n]));
}

/** Unread messages from the traveler, for the operator's page. */
export async function unreadForOperator(db: Db, requestId: number, operatorId: number): Promise<number> {
  const p = await parties(db, requestId, operatorId);
  return (await db.one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM messages WHERE request_id = ? AND operator_id = ? AND sender_user_id = ? AND read_at IS NULL',
    [requestId, operatorId, p.customer_id]))!.n;
}

/**
 * Post a message as `side`. Emails the other side (throttled) and alerts the
 * operator's staff when the traveler writes.
 */
export async function postMessage(
  db: Db,
  params: { requestId: number; operatorId: number; senderUserId: number; side: 'customer' | 'operator'; body: string; baseUrl?: string; now?: number },
): Promise<ThreadMessage> {
  const baseUrl = params.baseUrl ?? appBaseUrl();
  const body = params.body.trim().slice(0, MAX_MESSAGE_LENGTH);
  const p = await parties(db, params.requestId, params.operatorId);
  const row = (await db.one<Message>(
    'INSERT INTO messages (request_id, operator_id, sender_user_id, body) VALUES (?, ?, ?, ?) RETURNING *',
    [params.requestId, params.operatorId, params.senderUserId, body]))!;

  const recipient = params.side === 'customer' ? 'operator' : 'customer';
  if (await claimNotification(db, params.requestId, params.operatorId, recipient, params.now)) {
    await emailRecipient(db, params.requestId, params.operatorId, recipient, p, baseUrl).catch(err =>
      console.error('Message email failed:', err));
  }
  if (recipient === 'operator') {
    await alertStaff(db, { kind: 'message', requestId: params.requestId, operatorId: params.operatorId, detail: { eventId: row.id } }, baseUrl);
  }

  return {
    id: row.id, body: row.body, createdAt: row.created_at, readAt: null,
    from: params.side, senderName: params.side === 'customer' ? p.customer_name : p.company_name,
  };
}

/** An operator learns the traveler's name only once its quote is paid for (src/lib/access.ts). */
async function customerNameForOperator(db: Db, requestId: number, operatorId: number, name: string): Promise<string> {
  const won = await db.one("SELECT id FROM quotes WHERE request_id = ? AND operator_id = ? AND status = 'accepted'", [requestId, operatorId]);
  return won ? name : 'Traveler';
}

/** True when no email went to this side of the thread within the throttle window. Records the send. */
async function claimNotification(db: Db, requestId: number, operatorId: number, recipient: 'customer' | 'operator', now = Date.now()): Promise<boolean> {
  const cutoff = new Date(now - NOTIFY_THROTTLE_MS).toISOString();
  const at = new Date(now).toISOString();
  const row = await db.one(`
    INSERT INTO message_notifications (request_id, operator_id, recipient, last_sent_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (request_id, operator_id, recipient) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
      WHERE message_notifications.last_sent_at <= ?::timestamptz
    RETURNING request_id
  `, [requestId, operatorId, recipient, at, cutoff]);
  return !!row;
}

async function emailRecipient(
  db: Db, requestId: number, operatorId: number, recipient: 'customer' | 'operator',
  p: Awaited<ReturnType<typeof parties>>, baseUrl: string,
) {
  const to = recipient === 'customer'
    ? (await db.one<{ email: string }>('SELECT email FROM users WHERE id = ?', [p.customer_id]))!.email
    : (await db.one<{ email: string }>(`
        SELECT COALESCE(o.contact_email, u.email) AS email FROM operators o JOIN users u ON u.id = o.user_id WHERE o.id = ?
      `, [operatorId]))!.email;
  const legs = fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId]));
  const email = newMessageEmail({
    requestId,
    route: tripRoute(legs),
    senderName: recipient === 'customer' ? p.company_name : await customerNameForOperator(db, requestId, operatorId, p.customer_name),
    url: recipient === 'customer' ? `${baseUrl}/requests/${requestId}#messages-${operatorId}` : `${baseUrl}/operator/requests/${requestId}#messages`,
  });
  await sendEmail({ to, ...email, tags: [{ name: 'type', value: 'message' }, { name: 'request_id', value: String(requestId) }] });
}
