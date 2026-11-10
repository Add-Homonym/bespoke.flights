/**
 * Receipt data for a paid booking: the booking payment, any difference
 * payments for accepted changes, and refunds.
 */

import type { Db } from '@/lib/db';
import { formatMoney } from './config';
import { fromDbLegs, type TripLeg } from '@/lib/trip-format';
import type { BookingLeg, Payment, Refund } from '@/lib/types';

export function receiptNumber(payment: Pick<Payment, 'id' | 'paid_at' | 'created_at'>): string {
  const year = (payment.paid_at ?? payment.created_at).slice(0, 4);
  return `BF-${year}-${String(payment.id).padStart(6, '0')}`;
}

export interface ReceiptLine {
  label: string;
  amount: string;
  cents: number;
  date: string | null;
  method: string | null;
  receiptNumber: string;
}

export interface Receipt {
  requestId: number;
  status: string;
  receiptNumber: string;
  paidAt: string | null;
  customer: { name: string; email: string };
  operator: { company: string; certificate: string | null; safetyRating: string | null };
  aircraft: string | null;
  legs: TripLeg[];
  passengerCount: number;
  specialRequests: string | null;
  currency: string;
  /** Booking payment plus any paid price differences. */
  charges: ReceiptLine[];
  refunds: { amount: string; cents: number; date: string; reason: string | null }[];
  totalPaidCents: number;
  totalRefundedCents: number;
  netCents: number;
  totalPaid: string;
  totalRefunded: string;
  net: string;
  /** 'card', 'bank' or null when unknown (stub payments, or no intent recorded). */
  paymentMethod: string | null;
}

/** The receipt for a request, or null when nothing was ever paid. */
export async function loadReceipt(db: Db, requestId: number): Promise<Receipt | null> {
  const payments = await db.query<Payment & { change_request_id: number | null }>(`
    SELECT * FROM payments WHERE request_id = ? AND status IN ('succeeded', 'partially_refunded', 'refunded')
    ORDER BY id ASC
  `, [requestId]);
  const booking = payments.find(p => !p.change_request_id);
  if (!booking) return null;

  const head = (await db.one<{
    status: string; passenger_count: number; notes: string | null; customer_name: string; customer_email: string;
    company_name: string; certificate: string | null; safety_rating: string | null; aircraft_type: string | null; tail_number: string | null;
  }>(`
    SELECT br.status, br.passenger_count, br.notes, u.name AS customer_name, u.email AS customer_email,
      o.company_name, o.certificate, o.safety_rating, a.type AS aircraft_type, a.tail_number
    FROM booking_requests br
    JOIN users u ON u.id = br.customer_id
    JOIN quotes q ON q.id = ?
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE br.id = ?
  `, [booking.quote_id, requestId]))!;

  const legs = fromDbLegs(await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [requestId]));
  const refunds = await db.query<Refund>(
    'SELECT * FROM refunds WHERE payment_id = ANY(?::int[]) ORDER BY id ASC', [payments.map(p => p.id)]);

  const currency = booking.currency;
  const charges: ReceiptLine[] = payments.map(p => ({
    label: p.change_request_id ? `Itinerary change (change #${p.change_request_id})` : 'Charter booking',
    amount: formatMoney(p.amount_cents, currency),
    cents: p.amount_cents,
    date: p.paid_at ? p.paid_at.slice(0, 10) : null,
    method: methodOf(p),
    receiptNumber: receiptNumber(p),
  }));
  const totalPaidCents = payments.reduce((s, p) => s + p.amount_cents, 0);
  // Refunds issued from the app are in the ledger; refunded_cents also covers refunds synced from Stripe.
  const totalRefundedCents = payments.reduce((s, p) => s + p.refunded_cents, 0);

  return {
    requestId,
    status: head.status,
    receiptNumber: receiptNumber(booking),
    paidAt: booking.paid_at,
    customer: { name: head.customer_name, email: head.customer_email },
    operator: { company: head.company_name, certificate: head.certificate, safetyRating: head.safety_rating },
    aircraft: head.aircraft_type ? `${head.aircraft_type}${head.tail_number ? ` · ${head.tail_number}` : ''}` : null,
    legs,
    passengerCount: head.passenger_count,
    specialRequests: head.notes?.trim() || null,
    currency,
    charges,
    refunds: refunds.map(r => ({ amount: formatMoney(r.amount_cents, currency), cents: r.amount_cents, date: r.created_at.slice(0, 10), reason: r.reason })),
    totalPaidCents,
    totalRefundedCents,
    netCents: totalPaidCents - totalRefundedCents,
    totalPaid: formatMoney(totalPaidCents, currency),
    totalRefunded: formatMoney(totalRefundedCents, currency),
    net: formatMoney(totalPaidCents - totalRefundedCents, currency),
    paymentMethod: methodOf(booking),
  };
}

function methodOf(p: Payment): string | null {
  if (p.provider === 'stub') return 'Test payment';
  return p.stripe_payment_intent_id ? 'Card or bank transfer (Stripe)' : null;
}
