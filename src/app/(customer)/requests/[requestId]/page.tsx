import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import { QuoteActions } from '@/components/booking/quote-actions';
import { OutreachStatus } from '@/components/operator/outreach-status';
import { PaymentStatus } from '@/components/booking/payment-status';
import { formatMoney, getPaymentsMode } from '@/lib/payments/config';
import type { BookingRequest, BookingLeg, Quote, Payment } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

function isExpired(validUntil: string | null, today: string): boolean {
  return !!validUntil && validUntil < today;
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ checkout?: string; submitted?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { requestId } = await params;
  const { checkout, submitted } = await searchParams;
  const db = getDb();

  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [requestId]);
  if (!request || (session.role === 'customer' && request.customer_id !== session.userId)) {
    notFound();
  }

  const legs = await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [request.id]);

  const quotes = await db.query<Quote & { company_name: string; stripe_charges_enabled: number; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string; aircraft_year?: number }>(`
    SELECT q.*, o.company_name, o.stripe_charges_enabled, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number, a.year as aircraft_year
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ?
    ORDER BY q.price_cents ASC
  `, [request.id]);

  // Most relevant payment: settled or in flight first, then the latest failure.
  const payment = await db.one<(Payment & { company_name: string })>(`
    SELECT p.*, o.company_name FROM payments p
    JOIN operators o ON o.id = p.operator_id
    WHERE p.request_id = ? AND p.status != 'canceled'
    ORDER BY CASE p.status
      WHEN 'succeeded' THEN 0 WHEN 'partially_refunded' THEN 0 WHEN 'refunded' THEN 0
      WHEN 'processing' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, p.id DESC
    LIMIT 1
  `, [request.id]);
  const paymentInFlight = payment && ['processing', 'succeeded', 'partially_refunded'].includes(payment.status);
  const stripeMode = getPaymentsMode() === 'stripe';
  const today = new Date().toISOString().slice(0, 10);

  // Count operators contacted via outreach
  const outreachCount = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM outreach_log WHERE request_id = ?', [request.id]))!.count;

  const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-brand-muted text-sm mb-1">Request #{request.id}</p>
          <h1 className="font-display text-3xl text-brand-cream font-mono tracking-wide">{route}</h1>
        </div>
        <Badge variant={statusBadge[request.status]} className="text-base px-4 py-1">{request.status}</Badge>
      </div>

      {/* Itinerary */}
      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4">Itinerary</h2>
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={leg.id} className="flex items-center gap-4">
              <span className="w-7 h-7 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 flex items-center justify-between rounded-lg bg-brand-navy/50 px-4 py-3">
                <div>
                  <span className="text-brand-cream font-mono">{leg.origin_code}</span>
                  <span className="text-brand-muted mx-3">&rarr;</span>
                  <span className="text-brand-cream font-mono">{leg.dest_code}</span>
                </div>
                <div className="text-right">
                  <p className="text-brand-cream text-sm">{formatTripDate(leg.departure_date) || leg.departure_date}</p>
                  <p className="text-brand-muted text-xs">{formatTripTime(leg.departure_time ?? '') || 'Any time'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-brand-muted">Passengers</dt>
          <dd className="text-brand-cream">{request.passenger_count}</dd>
          <dt className="text-brand-muted">Special requests</dt>
          <dd className="text-brand-cream break-words">{request.notes?.trim() || <span className="text-brand-muted/60">None</span>}</dd>
        </dl>
      </Card>

      {submitted === '1' && (
        <Card className="mb-8 border-brand-success/30">
          <p className="text-brand-cream text-sm">
            Your request is submitted. Matching operators have been notified; quotes will appear below as they respond.
          </p>
        </Card>
      )}

      {checkout === 'canceled' && (!payment || payment.status === 'pending') && (
        <Card className="mb-8 border-brand-warning/30">
          <p className="text-brand-cream text-sm">Checkout was canceled. No payment was taken.</p>
        </Card>
      )}

      {payment && (
        <PaymentStatus
          returnedFromCheckout={checkout === 'success'}
          payment={{
            id: payment.id,
            status: payment.status,
            provider: payment.provider,
            amount: formatMoney(payment.amount_cents, payment.currency),
            refunded: payment.refunded_cents > 0 ? formatMoney(payment.refunded_cents, payment.currency) : null,
            companyName: payment.company_name,
            paidAt: payment.paid_at ? payment.paid_at.slice(0, 16).replace('T', ' ') : null,
            failureReason: payment.failure_reason,
            checkoutUrl: payment.status === 'pending' && session.role === 'customer' ? payment.checkout_url : null,
          }}
        />
      )}

      {/* Outreach Status — shows which operators were auto-contacted */}
      {outreachCount > 0 && <OutreachStatus requestId={request.id} />}

      {/* Quotes */}
      <h2 className="font-display text-xl text-brand-cream mb-4">
        Quotes {quotes.length > 0 && <span className="text-brand-muted text-sm font-normal">({quotes.length})</span>}
      </h2>

      {quotes.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-8">
            {outreachCount > 0
              ? `${outreachCount} operators have been contacted. Quotes will appear here as they respond.`
              : 'No quotes yet. Operators are reviewing your request.'
            }
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quotes.map(quote => (
            <Card key={quote.id} className={quote.status === 'accepted' ? 'border-brand-success/50' : ''}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-brand-cream font-semibold text-lg">{quote.company_name}</h3>
                  {quote.aircraft_type && (
                    <p className="text-brand-muted text-sm mt-1">
                      {quote.aircraft_type}
                      {quote.tail_number && ` (${quote.tail_number})`}
                      {quote.aircraft_capacity && ` · ${quote.aircraft_capacity} seats`}
                      {quote.aircraft_year && ` · ${quote.aircraft_year}`}
                    </p>
                  )}
                  {quote.message && <p className="text-brand-cream/80 text-sm mt-3 italic">&quot;{quote.message}&quot;</p>}
                  {quote.valid_until && (
                    <p className="text-brand-muted text-xs mt-2">Valid until {quote.valid_until}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-brand-gold font-display text-2xl">
                    {formatMoney(quote.price_cents, quote.currency)}
                  </p>
                  <p className="text-brand-muted text-xs">{quote.currency}</p>
                  {quote.status !== 'pending' && (
                    <Badge variant={quote.status === 'accepted' ? 'success' : 'error'} className="mt-2">
                      {quote.status}
                    </Badge>
                  )}
                </div>
              </div>
              {quote.status === 'pending' && ['open', 'quoted'].includes(request.status) && !paymentInFlight && session.role === 'customer' && (
                <QuoteActions
                  quoteId={quote.id}
                  amountLabel={formatMoney(quote.price_cents, quote.currency)}
                  payable={!isExpired(quote.valid_until, today) && (!stripeMode || !!quote.stripe_charges_enabled)}
                  unavailableReason={isExpired(quote.valid_until, today) ? 'This quote has expired.' : 'Operator is completing payment setup.'}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
