/**
 * Transactional emails for status changes that have no richer template of
 * their own. Everything logs instead of sending when RESEND_API_KEY is unset.
 */

import type { Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/resend';
import { newQuoteEmail, statusUpdateEmail } from '@/lib/email/templates';
import { formatMoney } from '@/lib/payments/config';
import { fromDbLegs, tripRoute } from '@/lib/trip-format';
import type { BookingLeg } from '@/lib/types';

async function routeOf(db: Db, requestId: number): Promise<string> {
  return tripRoute(fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId])));
}

async function customerEmail(db: Db, requestId: number): Promise<string | null> {
  return (await db.one<{ email: string }>('SELECT u.email FROM booking_requests br JOIN users u ON u.id = br.customer_id WHERE br.id = ?', [requestId]))?.email ?? null;
}

async function operatorEmail(db: Db, operatorId: number): Promise<string | null> {
  return (await db.one<{ email: string }>(
    'SELECT COALESCE(o.contact_email, u.email) AS email FROM operators o JOIN users u ON u.id = o.user_id WHERE o.id = ?', [operatorId]))?.email ?? null;
}

const tags = (type: string, requestId: number) => [{ name: 'type', value: type }, { name: 'request_id', value: String(requestId) }];

/** A quote was submitted or revised: tell the traveler. */
export async function notifyNewQuote(db: Db, quoteId: number, baseUrl: string, kind: 'new' | 'revised' = 'new', previousPriceCents?: number | null) {
  try {
    const q = await db.one<{
      request_id: number; price_cents: number; currency: string; valid_until: string | null; message: string | null;
      company_name: string; aircraft_type: string | null; tail_number: string | null; customer_email: string;
    }>(`
      SELECT q.request_id, q.price_cents, q.currency, q.valid_until, q.message, o.company_name,
        a.type AS aircraft_type, a.tail_number, u.email AS customer_email
      FROM quotes q
      JOIN operators o ON o.id = q.operator_id
      JOIN booking_requests br ON br.id = q.request_id
      JOIN users u ON u.id = br.customer_id
      LEFT JOIN aircraft a ON a.id = q.aircraft_id
      WHERE q.id = ?
    `, [quoteId]);
    if (!q) return;
    const { n } = (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM quotes WHERE request_id = ? AND status = 'pending'", [q.request_id]))!;
    const email = newQuoteEmail({
      requestId: q.request_id,
      route: await routeOf(db, q.request_id),
      operatorCompany: q.company_name,
      aircraft: q.aircraft_type ? `${q.aircraft_type}${q.tail_number ? ` (${q.tail_number})` : ''}` : null,
      price: formatMoney(q.price_cents, q.currency),
      validUntil: q.valid_until,
      message: q.message,
      quoteCount: n,
      baseUrl,
      kind,
      previousPrice: previousPriceCents != null ? formatMoney(previousPriceCents, q.currency) : null,
    });
    await sendEmail({ to: q.customer_email, ...email, tags: tags(kind === 'new' ? 'quote-new' : 'quote-revised', q.request_id) });
  } catch (err) {
    console.error('New quote email failed:', err);
  }
}

/** The traveler cancelled an unpaid request: tell every operator with a live quote. */
export async function notifyRequestWithdrawn(db: Db, requestId: number, operatorIds: number[], baseUrl: string) {
  try {
    const route = await routeOf(db, requestId);
    for (const operatorId of operatorIds) {
      const to = await operatorEmail(db, operatorId);
      if (!to) continue;
      await sendEmail({
        to,
        ...statusUpdateEmail({
          requestId, route,
          heading: 'Request withdrawn',
          text: 'The traveler withdrew this request before booking. Your quote is closed and nothing further is needed.',
          url: `${baseUrl}/operator/requests/${requestId}`,
          buttonLabel: 'View request',
        }),
        tags: tags('request-withdrawn', requestId),
      });
    }
  } catch (err) {
    console.error('Request withdrawn email failed:', err);
  }
}

/** The traveler declined a quote: tell its operator. */
export async function notifyQuoteDeclined(db: Db, quoteId: number, baseUrl: string) {
  try {
    const q = await db.one<{ request_id: number; operator_id: number }>('SELECT request_id, operator_id FROM quotes WHERE id = ?', [quoteId]);
    if (!q) return;
    const to = await operatorEmail(db, q.operator_id);
    if (!to) return;
    await sendEmail({
      to,
      ...statusUpdateEmail({
        requestId: q.request_id, route: await routeOf(db, q.request_id),
        heading: 'Quote declined',
        text: 'The traveler declined your quote. The request may still be open; you can submit a new quote if your offer changes.',
        url: `${baseUrl}/operator/requests/${q.request_id}`,
        buttonLabel: 'View request',
      }),
      tags: tags('quote-declined', q.request_id),
    });
  } catch (err) {
    console.error('Quote declined email failed:', err);
  }
}

/** An operator withdrew a pending quote: tell the traveler. */
export async function notifyQuoteWithdrawn(db: Db, quoteId: number, baseUrl: string) {
  try {
    const q = await db.one<{ request_id: number; company_name: string }>(
      'SELECT q.request_id, o.company_name FROM quotes q JOIN operators o ON o.id = q.operator_id WHERE q.id = ?', [quoteId]);
    if (!q) return;
    const to = await customerEmail(db, q.request_id);
    if (!to) return;
    await sendEmail({
      to,
      ...statusUpdateEmail({
        requestId: q.request_id, route: await routeOf(db, q.request_id),
        heading: `${q.company_name} withdrew its quote`,
        text: 'The operator withdrew its quote for this trip. Other quotes on your request are unaffected.',
        url: `${baseUrl}/requests/${q.request_id}`,
        buttonLabel: 'View quotes',
      }),
      tags: tags('quote-withdrawn', q.request_id),
    });
  } catch (err) {
    console.error('Quote withdrawn email failed:', err);
  }
}

/** Quotes expired overnight: one email to the traveler per request. */
export async function notifyQuotesExpired(db: Db, requestId: number, companies: string[], baseUrl: string) {
  try {
    const to = await customerEmail(db, requestId);
    if (!to) return;
    const names = companies.join(', ');
    await sendEmail({
      to,
      ...statusUpdateEmail({
        requestId, route: await routeOf(db, requestId),
        heading: companies.length === 1 ? 'A quote on your trip expired' : 'Quotes on your trip expired',
        text: `The quote${companies.length === 1 ? '' : 's'} from ${names} passed ${companies.length === 1 ? 'its' : 'their'} valid-until date and can no longer be booked. You can message the operator to ask for a fresh quote.`,
        url: `${baseUrl}/requests/${requestId}`,
        buttonLabel: 'View quotes',
      }),
      tags: tags('quotes-expired', requestId),
    });
  } catch (err) {
    console.error('Quotes expired email failed:', err);
  }
}

/** A trip's last leg has flown: thank the traveler and point at the receipt. */
export async function notifyTripCompleted(db: Db, requestId: number, baseUrl: string) {
  try {
    const to = await customerEmail(db, requestId);
    if (!to) return;
    await sendEmail({
      to,
      ...statusUpdateEmail({
        requestId, route: await routeOf(db, requestId),
        heading: 'Trip completed',
        text: 'Your trip is complete. Your receipt is available on the trip page. Thank you for flying with bespoke.flights.',
        url: `${baseUrl}/requests/${requestId}/receipt`,
        buttonLabel: 'View receipt',
      }),
      tags: tags('trip-completed', requestId),
    });
  } catch (err) {
    console.error('Trip completed email failed:', err);
  }
}
