import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getBusinessModel } from '@/lib/business-model';
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
import { CancelTrip } from '@/components/booking/cancel-trip';
import { ChangeRequestSummary, TravelerChangeRequests } from '@/components/booking/change-request';
import { changeRequestViews } from '@/lib/bookings/changes';
import { MessageThread } from '@/components/messaging/message-thread';
import { unreadByOperator } from '@/lib/messaging/messages';
import { cancellationSummary, previewCancellation } from '@/lib/bookings/cancellation';
import { cancelBanner } from '@/lib/bookings/cancel-text';
import { formatMoney, getPaymentsMode } from '@/lib/payments/config';
import { emptyLegsForRequest } from '@/lib/empty-legs/service';
import { EmptyLegCard } from '@/components/empty-legs/empty-leg-card';
import { BookEmptyLeg } from '@/components/empty-legs/book-empty-leg';
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

  const quotes = await db.query<Quote & { company_name: string; certificate: string | null; safety_rating: string | null; stripe_charges_enabled: number; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string; aircraft_year?: number }>(`
    SELECT q.*, o.company_name, o.certificate, o.safety_rating, o.stripe_charges_enabled, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number, a.year as aircraft_year
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    LEFT JOIN outreach_log ol ON ol.request_id = q.request_id AND ol.operator_id = q.operator_id
    WHERE q.request_id = ?
    ORDER BY ${(await getBusinessModel(db)).rankQuotesBy === 'score' ? 'COALESCE(ol.match_score, 0) DESC, q.price_cents ASC' : 'q.price_cents ASC'}
  `, [request.id]);

  // Most relevant payment: settled or in flight first, then the latest failure.
  const payment = await db.one<(Payment & { company_name: string })>(`
    SELECT p.*, o.company_name FROM payments p
    JOIN operators o ON o.id = p.operator_id
    WHERE p.request_id = ? AND p.status != 'canceled' AND p.change_request_id IS NULL
    ORDER BY CASE p.status
      WHEN 'succeeded' THEN 0 WHEN 'partially_refunded' THEN 0 WHEN 'refunded' THEN 0
      WHEN 'processing' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, p.id DESC
    LIMIT 1
  `, [request.id]);
  // An open payment for the price difference of an accepted change request.
  const changePayment = await db.one<(Payment & { company_name: string })>(`
    SELECT p.*, o.company_name FROM payments p
    JOIN operators o ON o.id = p.operator_id
    WHERE p.request_id = ? AND p.change_request_id IS NOT NULL AND p.status IN ('pending', 'processing')
    ORDER BY p.id DESC LIMIT 1
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
  // Aircraft: the booked quote's, else the one aircraft the open quotes name, else not yet known.
  const bookedQuote = acceptedQuote ?? quotes.find(q => q.status === 'cancelled');
  const quotedTypes = [...new Set(quotes.filter(q => q.status === 'pending' && q.aircraft_type).map(q => q.aircraft_type!))];
  const aircraftLabel = bookedQuote?.aircraft_type
    ? [bookedQuote.aircraft_type, bookedQuote.tail_number].filter(Boolean).join(' · ')
    : quotedTypes.length === 1 ? quotedTypes[0]!
    : quotedTypes.length > 1 ? `${quotedTypes.length} aircraft quoted`
    : 'To be assigned';
  const confirmed = request.status === 'booked' || request.status === 'completed';

  // One "Best value" per list: the lowest price still open to book, when there is a choice.
  const bookable = quotes.filter(q => q.status === 'pending' && !isExpired(q.valid_until, today));
  const bestValueId = !acceptedQuote && bookable.length > 1 ? bookable[0].id : null;

  // Cancellation: paid bookings refund per the operator's policy; unpaid requests are simply withdrawn.
  const canCancel = session.role === 'customer' && ['open', 'quoted', 'booked'].includes(request.status) && !(payment && payment.status === 'processing');
  const cancelPreview = canCancel && request.status === 'booked' ? await previewCancellation(db, request) : null;
  const cancelled = request.status === 'cancelled' ? await cancellationSummary(db, request.id) : null;
  const changes = ['booked', 'completed', 'cancelled'].includes(request.status) ? await changeRequestViews(db, request.id, payment?.currency) : [];
  const unread = quotes.length ? await unreadByOperator(db, request.id, request.customer_id) : new Map<number, number>();
  // Listed empty legs that fit this trip, offered while the request is still open.
  const emptyLegs = session.role === 'customer' && ['open', 'quoted'].includes(request.status) && !paymentInFlight ? await emptyLegsForRequest(db, request.id) : [];
  const isEmptyLegBooking = quotes.some(q => q.empty_leg_id);
  // An empty leg is held, not booked, until its payment clears.
  const awaitingPayment = request.empty_leg_id != null && ['open', 'quoted'].includes(request.status);

  return (
    <div className={`mx-auto max-w-3xl ${payment?.status === 'pending' || changePayment?.status === 'pending' ? 'pb-28' : ''}`}>
      <div className="mb-6">
        {confirmed ? (
          <h1 className="text-display sm:text-display-xl text-ink">Booking confirmed</h1>
        ) : request.status === 'cancelled' ? (
          <h1 className="text-display text-ink">Trip cancelled</h1>
        ) : (
          <h1 className="text-display text-ink">Your trip</h1>
        )}
      </div>

      {first && last && (
        <div className="mb-8">
          <TripSummary
            status={<RequestStatusBadge status={request.status} emptyLeg={awaitingPayment} />}
            reference={`Request #${request.id}`}
            origin={place(first.origin_code)}
            destination={place(last.dest_code)}
            depart={formatDeparture(first.departure_date, first.departure_time ?? '') || first.departure_date}
            guests={request.passenger_count}
            aircraft={aircraftLabel}
          />
        </div>
      )}

      {cancelled && (
        <Notice tone="info" className="mb-8">
          <span className="block">{cancelBanner(cancelled).headline}</span>
          <span className="mt-1 block text-label">{cancelBanner(cancelled).detail}</span>
        </Notice>
      )}

      {submitted === '1' && (
        <Notice tone="confirmed" className="mb-8">
          Your request is submitted. Matching operators have been notified, and quotes appear below as they respond.
        </Notice>
      )}
      {submitted === 'empty-leg' && (
        <Notice tone="warning" className="mb-8">
          Not booked yet. The empty leg is held at the listed price until you pay. Book it below to confirm; another traveler can take it until your payment clears.
        </Notice>
      )}

      {checkout === 'canceled' && (!payment || payment.status === 'pending') && (
        <Notice tone="warning" className="mb-8">Checkout was canceled. No payment was taken.</Notice>
      )}

      {payment && (
        <PaymentStatus
          returnedFromCheckout={checkout === 'success'}
          receiptHref={`/requests/${request.id}/receipt`}
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

      {changePayment && (
        <PaymentStatus
          returnedFromCheckout={checkout === 'success'}
          title="Itinerary change"
          payment={{
            id: changePayment.id,
            status: changePayment.status,
            provider: changePayment.provider,
            amount: formatMoney(changePayment.amount_cents, changePayment.currency),
            refunded: null,
            companyName: changePayment.company_name,
            paidAt: null,
            failureReason: changePayment.failure_reason,
            checkoutUrl: changePayment.status === 'pending' && session.role === 'customer' ? changePayment.checkout_url : null,
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

      {request.status === 'booked' && session.role === 'customer' && cancelPreview && (
        <TravelerChangeRequests
          requestId={request.id}
          changes={changes}
          currentLegs={legs.map(l => ({ originCode: l.origin_code, destCode: l.dest_code, departureDate: l.departure_date, departureTime: l.departure_time ?? '' }))}
          passengerCount={request.passenger_count}
          notes={request.notes ?? ''}
        />
      )}

      {request.status === 'cancelled' && changes.length > 0 && (
        <Card className="mb-8 space-y-3">
          <h2 className="text-title text-ink">Changes</h2>
          {changes.map(cr => <ChangeRequestSummary key={cr.id} cr={cr} />)}
        </Card>
      )}

      {canCancel && (request.status !== 'booked' || cancelPreview) && (
        <CancelTrip
          requestId={request.id}
          preview={cancelPreview && {
            tier: cancelPreview.tier,
            refund: cancelPreview.refund,
            paid: cancelPreview.paid,
            hoursBeforeDeparture: cancelPreview.hoursBeforeDeparture,
            policyText: cancelPreview.policyText,
            operatorCompany: cancelPreview.operatorCompany,
          }}
        />
      )}

      {/* Outreach Status — shows which operators were auto-contacted */}
      {outreachCount > 0 && <OutreachStatus requestId={request.id} />}

      {emptyLegs.length > 0 && (
        <section aria-labelledby="empty-legs-heading" className="mb-8">
          <h2 id="empty-legs-heading" className="text-title text-ink">Empty legs on this route</h2>
          <p className="mt-1 mb-4 text-label text-ink-muted">
            Repositioning flights at a fixed price. The operator sets the date. Booking one opens its own trip; this request stays open until you cancel it.
          </p>
          <div className="grid gap-4">
            {emptyLegs.map(leg => (
              <EmptyLegCard key={leg.id} leg={leg} badge={<StatusBadge variant="neutral">Empty leg</StatusBadge>}
                action={<BookEmptyLeg legId={leg.id} seats={leg.seats} viewerRole={session.role} />} />
            ))}
          </div>
        </section>
      )}

      {/* Quotes */}
      <section aria-labelledby="quotes-heading">
        <h2 id="quotes-heading" className="text-title text-ink">
          Quotes {quotes.length > 0 && <span className="text-ink-muted tabular-nums">({quotes.length})</span>}
        </h2>
        <p className="mt-1 mb-4 text-label text-ink-muted">
          {isEmptyLegBooking ? 'Empty leg at the listed price. Part 135 — certified for charter. All-in.' : 'Part 135 — certified for charter. Every price is all-in.'}
        </p>

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
              const expired = quote.status === 'expired' || (quote.status === 'pending' && isExpired(quote.valid_until, today));
              const canBook = quote.status === 'pending' && ['open', 'quoted'].includes(request.status) && !paymentInFlight && session.role === 'customer';
              return (
                <QuoteCard
                  key={quote.id}
                  selected={quote.status === 'accepted'}
                  aircraft={[quote.aircraft_type ?? 'Aircraft to be confirmed', quote.tail_number].filter(Boolean).join(' · ')}
                  operatorName={quote.company_name}
                  operatorDetail={[quote.certificate && `FAA certificate ${quote.certificate}`, quote.safety_rating].filter(Boolean).join(' · ') || undefined}
                  badge={
                    quote.status === 'accepted' ? <StatusBadge variant="confirmed">Accepted</StatusBadge>
                    : quote.status === 'cancelled' ? <StatusBadge variant="neutral">Cancelled</StatusBadge>
                    : quote.status === 'rejected' ? <StatusBadge variant="neutral">Declined</StatusBadge>
                    : quote.status === 'withdrawn' ? <StatusBadge variant="neutral">Withdrawn</StatusBadge>
                    : expired ? <StatusBadge variant="warning">Expired</StatusBadge>
                    : quote.revised_at ? <StatusBadge variant="neutral">Revised</StatusBadge>
                    : quote.id === bestValueId ? <StatusBadge variant="brass">Best value</StatusBadge>
                    : quote.is_empty_leg ? <StatusBadge variant="neutral">Empty leg</StatusBadge>
                    : undefined
                  }
                  seats={quote.aircraft_capacity ?? null}
                  flightTime={null}
                  yearBuilt={quote.aircraft_year ?? null}
                  price={formatMoney(quote.price_cents, quote.currency)}
                  note={(quote.message || quote.valid_until || quote.previous_price_cents != null) && (
                    <>
                      {quote.message && <span className="block italic">&ldquo;{quote.message}&rdquo;</span>}
                      {quote.valid_until && <span className="block text-label">{expired ? 'Expired' : 'Valid until'} {quote.valid_until}</span>}
                      {quote.previous_price_cents != null && quote.previous_price_cents !== quote.price_cents && (
                        <span className="block text-label">Previously {formatMoney(quote.previous_price_cents, quote.currency)}</span>
                      )}
                    </>
                  )}
                  action={canBook && (
                    <QuoteActions
                      quoteId={quote.id}
                      payable={!expired && (!stripeMode || !!quote.stripe_charges_enabled)}
                      unavailableReason={expired ? 'This quote has expired.' : 'Operator is completing payment setup.'}
                    />
                  )}
                  footer={
                    <MessageThread
                      requestId={request.id}
                      operatorId={quote.operator_id}
                      title={`Messages with ${quote.company_name}`}
                      collapsed={quote.status !== 'accepted' && quote.status !== 'cancelled'}
                      unread={unread.get(quote.operator_id) ?? 0}
                      viewer={session.role}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
