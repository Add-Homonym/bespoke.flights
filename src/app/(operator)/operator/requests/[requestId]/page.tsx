import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import { SubmitQuoteForm } from '@/components/booking/submit-quote-form';
import { TripShare } from '@/components/operator/trip-share';
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

  const existingQuote = operator
    ? (await db.one<Quote>('SELECT * FROM quotes WHERE request_id = ? AND operator_id = ?', [request.id, operator.id]))
    : undefined;

  const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-ink-muted text-sm mb-1">Request #{request.id}</p>
          <h1 className="font-display text-3xl text-ink font-mono tracking-wide">{route}</h1>
        </div>
        <Badge variant="gold" className="text-base px-4 py-1">{request.status}</Badge>
      </div>

      {/* Itinerary */}
      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Itinerary Details</h2>
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={leg.id} className="flex items-center gap-4">
              <span className="w-7 h-7 rounded-full bg-surface-sunken flex items-center justify-center text-brass-ink text-xs font-bold shrink-0">
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
      {existingQuote?.status === 'accepted' && ['booked', 'completed'].includes(request.status) && (
        <TripShare requestId={request.id} />
      )}

      {existingQuote ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Your Quote</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-brass-ink font-display text-2xl">${(existingQuote.price_cents / 100).toLocaleString()}</p>
              {existingQuote.message && <p className="text-ink-muted text-sm mt-2 italic">&quot;{existingQuote.message}&quot;</p>}
            </div>
            <Badge variant={existingQuote.status === 'accepted' ? 'success' : existingQuote.status === 'rejected' ? 'error' : 'warning'}>
              {existingQuote.status}
            </Badge>
          </div>
        </Card>
      ) : operator?.status === 'approved' ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-6">Submit a Quote</h2>
          <SubmitQuoteForm requestId={request.id} aircraft={aircraft} />
        </Card>
      ) : (
        <Card>
          <p className="text-warning text-center py-4">Your operator account must be approved before you can submit quotes.</p>
        </Card>
      )}
    </div>
  );
}
