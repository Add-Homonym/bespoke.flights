import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import { StatusBadge } from '@/components/ui/status-badge';
import { SubmitQuoteForm } from '@/components/booking/submit-quote-form';
import { ManageQuote } from '@/components/booking/manage-quote';
import { TripShare } from '@/components/operator/trip-share';
import { OperatorChangeRequests } from '@/components/booking/change-request';
import { changeRequestViews } from '@/lib/bookings/changes';
import { formatMoney } from '@/lib/payments/config';
import { MessageThread } from '@/components/messaging/message-thread';
import { unreadForOperator } from '@/lib/messaging/messages';
import type { BookingRequest, BookingLeg, Operator, Aircraft, Quote } from '@/lib/types';

export default async function OperatorRequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'operator') redirect('/login');

  const { requestId } = await params;
  const db = getDb();

  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [requestId]);
  if (!request) notFound();

  const legs = await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [request.id]);
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);

  const aircraft = operator
    ? (await db.query<Aircraft>('SELECT * FROM aircraft WHERE operator_id = ?', [operator.id]))
    : [];

  // The live quote if there is one, otherwise the most recent (withdrawn, rejected, expired).
  const quotes = operator
    ? await db.query<Quote>('SELECT * FROM quotes WHERE request_id = ? AND operator_id = ? ORDER BY id DESC', [request.id, operator.id])
    : [];
  const liveQuote = quotes.find(q => q.status === 'pending' || q.status === 'accepted');
  const existingQuote = liveQuote ?? quotes[0];
  const canQuoteAgain = !liveQuote && ['open', 'quoted'].includes(request.status) && operator?.status === 'approved';

  const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');
  const won = existingQuote?.status === 'accepted' && ['booked', 'completed'].includes(request.status);
  const changes = won ? await changeRequestViews(db, request.id, existingQuote!.currency) : [];
  const unread = existingQuote && operator ? await unreadForOperator(db, request.id, operator.id) : 0;
  const currentPaid = won
    ? await db.one<{ paid: number }>("SELECT COALESCE(SUM(amount_cents - refunded_cents), 0) AS paid FROM payments WHERE request_id = ? AND status IN ('succeeded','partially_refunded')", [request.id])
    : undefined;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-ink-muted text-sm mb-1">Request #{request.id}</p>
          <h1 className="font-display text-3xl text-ink font-mono tracking-wide">{route}</h1>
        </div>
        <StatusBadge variant="brass" className="text-base px-4 py-1">{request.status}</StatusBadge>
      </div>

      {/* Itinerary */}
      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Itinerary Details</h2>
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={leg.id} className="flex items-center gap-4">
              <span className="w-7 h-7 rounded-full bg-surface-sunken flex items-center justify-center text-royal text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 flex items-center justify-between rounded-md bg-surface-sunken px-4 py-3">
                <div>
                  <span className="text-ink font-mono">{leg.origin_code}</span>
                  <span className="text-ink-muted mx-3">&rarr;</span>
                  <span className="text-ink font-mono">{leg.dest_code}</span>
                </div>
                <div className="text-right">
                  <p className="text-ink text-sm">{formatTripDate(leg.departure_date) || leg.departure_date}</p>
                  <p className="text-ink-muted text-xs">{formatTripTime(leg.departure_time ?? '') || 'Any time'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Passengers</dt>
          <dd className="text-ink">{request.passenger_count}</dd>
          <dt className="text-ink-muted">Special requests</dt>
          <dd className="text-ink break-words">{request.notes?.trim() || <span className="text-ink-subtle">None</span>}</dd>
        </dl>
      </Card>

      {/* Quote submission */}
      {won && (
        <>
          <OperatorChangeRequests changes={changes} currentPrice={formatMoney(currentPaid?.paid ?? existingQuote!.price_cents, existingQuote!.currency)} />
          <TripShare requestId={request.id} />
        </>
      )}

      {existingQuote && operator && (
        <Card className="mb-8" id="messages">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Messages with the traveler</h2>
          <MessageThread requestId={request.id} operatorId={operator.id} title="Conversation" unread={unread} viewer="operator" />
        </Card>
      )}

      {existingQuote ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Your Quote</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-royal font-display text-2xl">${(existingQuote.price_cents / 100).toLocaleString()}</p>
              {existingQuote.message && <p className="text-ink-muted text-sm mt-2 italic">&quot;{existingQuote.message}&quot;</p>}
            </div>
            <StatusBadge variant={existingQuote.status === 'accepted' ? 'confirmed' : existingQuote.status === 'rejected' ? 'danger' : existingQuote.status === 'pending' ? 'warning' : 'neutral'}>
              {existingQuote.status}
            </StatusBadge>
          </div>
          {existingQuote.previous_price_cents != null && (
            <p className="text-ink-muted text-xs mt-2">Revised from ${(existingQuote.previous_price_cents / 100).toLocaleString()}</p>
          )}
          {existingQuote.status === 'pending' && ['open', 'quoted'].includes(request.status) && (
            <ManageQuote
              quoteId={existingQuote.id}
              aircraft={aircraft}
              priceCents={existingQuote.price_cents}
              message={existingQuote.message}
              validUntil={existingQuote.valid_until}
              aircraftId={existingQuote.aircraft_id}
              legs={legs}
              passengerCount={request.passenger_count}
            />
          )}
          {canQuoteAgain && (
            <div className="mt-6 border-t border-hairline pt-6">
              <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Submit a new quote</h3>
              <SubmitQuoteForm requestId={request.id} aircraft={aircraft} legs={legs} passengerCount={request.passenger_count} />
            </div>
          )}
        </Card>
      ) : operator?.status === 'approved' ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-6">Submit a Quote</h2>
          <SubmitQuoteForm requestId={request.id} aircraft={aircraft} legs={legs} passengerCount={request.passenger_count} />
        </Card>
      ) : (
        <Card>
          <p className="text-warning text-center py-4">Your operator account must be approved before you can submit quotes.</p>
        </Card>
      )}
    </div>
  );
}
