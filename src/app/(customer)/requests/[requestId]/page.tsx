import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { QuoteCard } from '@/components/ui/quote-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TripSummary } from '@/components/ui/trip-summary';
import { formatDeparture, formatTripDate, formatTripTime } from '@/lib/trip-format';
import { airportLabel, findAirport } from '@/lib/airports';
import { QuoteActions } from '@/components/booking/quote-actions';
import { RequestStatusBadge } from '@/components/booking/request-status';
import { OutreachStatus } from '@/components/operator/outreach-status';
import { PaymentStatus } from '@/components/booking/payment-status';
import { formatMoney, getPaymentsMode } from '@/lib/payments/config';
import type { BookingRequest, BookingLeg, Quote, Payment } from '@/lib/types';

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

  const first = legs[0];
  const last = legs[legs.length - 1];
  const place = (code: string | undefined) => {
    const airport = code ? findAirport(code) : undefined;
    return { code: airport?.iata ?? code ?? '', city: airport?.city ?? '' };
  };
  const acceptedQuote = quotes.find(q => q.status === 'accepted');
  const confirmed = request.status === 'booked' || request.status === 'completed';

  // One "Best value" per list: the lowest price still open to book, when there is a choice.
  const bookable = quotes.filter(q => q.status === 'pending' && !isExpired(q.valid_until, today));
  const bestValueId = !acceptedQuote && bookable.length > 1 ? bookable[0].id : null;

  return (
    <div className={`mx-auto max-w-3xl ${payment?.status === 'pending' ? 'pb-28' : ''}`}>
      <div className="mb-6">
        {confirmed ? (
          <h1 className="text-display sm:text-display-xl text-ink">Booking confirmed</h1>
        ) : (
          <h1 className="text-display text-ink">Your trip</h1>
        )}
      </div>

      {first && last && (
        <div className="mb-8">
          <TripSummary
            status={<RequestStatusBadge status={request.status} />}
            reference={`Request #${request.id}`}
            origin={place(first.origin_code)}
            destination={place(last.dest_code)}
            depart={formatDeparture(first.departure_date, first.departure_time ?? '') || first.departure_date}
            guests={request.passenger_count}
            aircraft={acceptedQuote?.aircraft_type ?? 'To be assigned'}
          />
        </div>
      )}

      {submitted === '1' && (
        <Notice tone="confirmed" className="mb-8">
          Your request is submitted. Matching operators have been notified, and quotes appear below as they respond.
        </Notice>
      )}

      {checkout === 'canceled' && (!payment || payment.status === 'pending') && (
        <Notice tone="warning" className="mb-8">Checkout was canceled. No payment was taken.</Notice>
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

      {/* Itinerary */}
      <Card className="mb-8">
        <h2 className="text-title text-ink mb-4">Itinerary</h2>
        <ol className="space-y-3">
          {legs.map((leg, i) => (
            <li key={leg.id} className="rounded-md bg-surface-sunken px-4 py-3">
              <p className="text-label text-ink-muted">Leg {i + 1}</p>
              <p className="text-heading text-ink">
                {airportLabel(leg.origin_code)} <span aria-label="to">&rarr;</span> {airportLabel(leg.dest_code)}
              </p>
              <p className="text-body text-ink-muted">
                {formatTripDate(leg.departure_date) || leg.departure_date} · {formatTripTime(leg.departure_time ?? '') || 'Any time'}
              </p>
            </li>
          ))}
        </ol>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
          <dt className="text-ink-muted">Guests</dt>
          <dd className="text-ink">{request.passenger_count}</dd>
          <dt className="text-ink-muted">Special requests</dt>
          <dd className="text-ink break-words">{request.notes?.trim() || <span className="text-ink-subtle">None</span>}</dd>
        </dl>
      </Card>

      {/* Outreach Status — shows which operators were auto-contacted */}
      {outreachCount > 0 && <OutreachStatus requestId={request.id} />}

      {/* Quotes */}
      <section aria-labelledby="quotes-heading">
        <h2 id="quotes-heading" className="text-title text-ink">
          Quotes {quotes.length > 0 && <span className="text-ink-muted tabular-nums">({quotes.length})</span>}
        </h2>
        <p className="mt-1 mb-4 text-label text-ink-muted">Part 135 — certified for charter. Every price is all-in.</p>

        {quotes.length === 0 ? (
          <Card>
            <p className="text-body text-ink-muted text-center py-8">
              {outreachCount > 0
                ? `${outreachCount} operators have been contacted. Quotes appear here as they respond.`
                : 'No quotes yet. Operators are reviewing your request.'
              }
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {quotes.map(quote => {
              const expired = quote.status === 'pending' && isExpired(quote.valid_until, today);
              const canBook = quote.status === 'pending' && ['open', 'quoted'].includes(request.status) && !paymentInFlight && session.role === 'customer';
              return (
                <QuoteCard
                  key={quote.id}
                  selected={quote.status === 'accepted'}
                  aircraft={[quote.aircraft_type ?? 'Aircraft to be confirmed', quote.tail_number].filter(Boolean).join(' · ')}
                  operatorName={quote.company_name}
                  badge={
                    quote.status === 'accepted' ? <StatusBadge variant="confirmed">Accepted</StatusBadge>
                    : quote.status === 'rejected' ? <StatusBadge variant="neutral">Declined</StatusBadge>
                    : quote.status === 'withdrawn' ? <StatusBadge variant="neutral">Withdrawn</StatusBadge>
                    : expired ? <StatusBadge variant="warning">Expired</StatusBadge>
                    : quote.id === bestValueId ? <StatusBadge variant="brass">Best value</StatusBadge>
                    : undefined
                  }
                  seats={quote.aircraft_capacity ?? null}
                  flightTime={null}
                  yearBuilt={quote.aircraft_year ?? null}
                  price={formatMoney(quote.price_cents, quote.currency)}
                  note={(quote.message || quote.valid_until) && (
                    <>
                      {quote.message && <span className="block italic">&ldquo;{quote.message}&rdquo;</span>}
                      {quote.valid_until && <span className="block text-label">Valid until {quote.valid_until}</span>}
                    </>
                  )}
                  action={canBook && (
                    <QuoteActions
                      quoteId={quote.id}
                      payable={!expired && (!stripeMode || !!quote.stripe_charges_enabled)}
                      unavailableReason={expired ? 'This quote has expired.' : 'Operator is completing payment setup.'}
                    />
                  )}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
