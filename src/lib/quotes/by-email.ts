/**
 * Reply-by-email quoting.
 *
 * Every RFQ email carries a reply address of the form
 * quotes+<token>@<domain>, where <token> is outreach_log.reply_token. An
 * operator can quote by replying with a price; the inbound-email webhook
 * (POST /api/webhooks/inbound-email) hands the message here. The token is the
 * credential: only the holder of the RFQ email can quote with it, and the
 * sender address must belong to the operator the RFQ went to.
 *
 * Reply format (first line that carries a dollar amount wins):
 *   Quote $12,500
 *   $12,500 Citation CJ3 N123AB valid 2026-11-01
 * Everything else in the reply (before any quoted original) becomes the
 * message shown to the traveler.
 */

import { randomBytes } from 'crypto';
import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { quoteConfirmationEmail, quoteRejectedEmail } from '@/lib/email/templates';
import { QuoteError, submitQuote } from '@/lib/quotes/submit';
import type { Operator } from '@/lib/types';

export const REPLY_LOCAL_PART = 'quotes';

export function newReplyToken(): string {
  return randomBytes(12).toString('base64url');
}

/** The domain replies go to: EMAIL_REPLY_DOMAIN, else the domain of EMAIL_FROM, else bespoke.flights. */
export function replyDomain(): string {
  if (process.env.EMAIL_REPLY_DOMAIN) return process.env.EMAIL_REPLY_DOMAIN;
  const from = process.env.EMAIL_FROM ?? '';
  const m = /@([A-Za-z0-9.-]+)/.exec(from);
  return m ? m[1] : 'bespoke.flights';
}

export function replyAddress(token: string | null): string {
  return token ? `${REPLY_LOCAL_PART}+${token}@${replyDomain()}` : `${REPLY_LOCAL_PART}@${replyDomain()}`;
}

/** The token in any of the recipient addresses, or null. */
export function tokenFromRecipients(to: string | string[]): string | null {
  for (const addr of Array.isArray(to) ? to : [to]) {
    const m = new RegExp(`${REPLY_LOCAL_PART}\\+([A-Za-z0-9_-]{8,64})@`, 'i').exec(addr);
    if (m) return m[1];
  }
  return null;
}

export function emailAddress(header: string): string {
  const m = /<([^>]+)>/.exec(header);
  return (m ? m[1] : header).trim().toLowerCase();
}

export interface ParsedReply {
  priceCents: number;
  tailNumber: string | null;
  validUntil: string | null;
  message: string | null;
}

/** Plain text from an HTML body, for replies that arrive as HTML only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\r/g, '');
}

/** The reply's own text: everything above the quoted original or the signature separator. */
export function ownText(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^(On .{3,200} wrote:|-----\s*Original Message\s*-----|From:\s.+|--\s*$|_{5,}|Sent from my )/i.test(t)) break;
    if (t.startsWith('>')) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/;

export function parseQuoteReply(text: string): ParsedReply | null {
  const own = ownText(text);
  const money = MONEY.exec(own);
  if (!money) return null;
  const dollars = Number(money[1].replace(/,/g, ''));
  const cents = money[2] ? Number(money[2]) : 0;
  const priceCents = dollars * 100 + cents;
  if (!Number.isFinite(priceCents) || priceCents < 50) return null;

  const tail = /\b(N[1-9][0-9A-Z]{1,4})\b/.exec(own.toUpperCase());
  const valid = /\bvalid(?:\s+(?:until|through|thru|to))?\s+(\d{4}-\d{2}-\d{2})\b/i.exec(own);
  const message = own.replace(/\s+/g, ' ').trim();
  return {
    priceCents,
    tailNumber: tail ? tail[1] : null,
    validUntil: valid ? valid[1] : null,
    message: message.length > 0 ? message.slice(0, 2000) : null,
  };
}

export interface InboundEmail {
  from: string;
  to: string | string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}

export type EmailQuoteResult =
  | { ok: true; quoteId: number; requestId: number; operatorId: number }
  | { ok: false; reason: string; operatorId?: number; requestId?: number };

/** Turn an inbound reply into a quote. Never throws for bad input; the reason is reported back to the sender when the sender is known. */
export async function quoteFromEmail(db: Db, mail: InboundEmail, baseUrl: string): Promise<EmailQuoteResult> {
  const token = tokenFromRecipients(mail.to);
  if (!token) return { ok: false, reason: 'No reply token in the recipient address' };

  const log = await db.one<{ request_id: number; operator_id: number }>('SELECT request_id, operator_id FROM outreach_log WHERE reply_token = ?', [token]);
  if (!log) return { ok: false, reason: 'Unknown reply token' };

  const operator = await db.one<Operator & { user_email: string }>(
    'SELECT o.*, u.email AS user_email FROM operators o JOIN users u ON u.id = o.user_id WHERE o.id = ?', [log.operator_id]);
  if (!operator) return { ok: false, reason: 'Operator not found' };

  const sender = emailAddress(mail.from);
  const allowed = [operator.contact_email, operator.user_email].filter(Boolean).map(e => e!.toLowerCase());
  if (!allowed.includes(sender)) return { ok: false, reason: 'Sender is not the operator this request went to', operatorId: operator.id, requestId: log.request_id };

  const body = mail.text?.trim() ? mail.text : mail.html ? htmlToText(mail.html) : '';
  const parsed = parseQuoteReply(body);
  const fail = async (reason: string): Promise<EmailQuoteResult> => {
    await sendEmail({ to: sender, ...quoteRejectedEmail({ requestId: log.request_id, reason, url: `${baseUrl}/operator/inbound` }),
      tags: [{ name: 'type', value: 'quote-email-rejected' }, { name: 'request_id', value: String(log.request_id) }] }).catch(() => {});
    return { ok: false, reason, operatorId: operator.id, requestId: log.request_id };
  };
  if (!parsed) return fail('No price was found. Reply with the all-in price, for example "Quote $12,500".');

  let aircraftId: number | null = null;
  if (parsed.tailNumber) {
    const a = await db.one<{ id: number }>('SELECT id FROM aircraft WHERE operator_id = ? AND UPPER(tail_number) = ?', [operator.id, parsed.tailNumber]);
    aircraftId = a?.id ?? null;
  }

  try {
    const quoteId = await submitQuote(db, operator, {
      requestId: log.request_id, priceCents: parsed.priceCents, message: parsed.message, aircraftId, validUntil: parsed.validUntil, source: 'email',
    }, baseUrl);
    await sendEmail({ to: sender, ...quoteConfirmationEmail({ requestId: log.request_id, priceCents: parsed.priceCents, url: `${baseUrl}/operator/requests/${log.request_id}` }),
      tags: [{ name: 'type', value: 'quote-email-confirmed' }, { name: 'request_id', value: String(log.request_id) }] }).catch(() => {});
    return { ok: true, quoteId, requestId: log.request_id, operatorId: operator.id };
  } catch (err) {
    if (err instanceof QuoteError) return fail(err.message);
    throw err;
  }
}
