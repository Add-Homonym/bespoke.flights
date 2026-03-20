import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QuoteActions } from '@/components/booking/quote-actions';
import type { BookingRequest, BookingLeg, Quote } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { requestId } = await params;
  const db = getDb();

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(requestId) as BookingRequest | undefined;
  if (!request || (session.role === 'customer' && request.customer_id !== session.userId)) {
    notFound();
  }

  const legs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order').all(request.id) as BookingLeg[];

  const quotes = db.prepare(`
    SELECT q.*, o.company_name, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number, a.year as aircraft_year
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ?
    ORDER BY q.price_cents ASC
  `).all(request.id) as (Quote & { company_name: string; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string; aircraft_year?: number })[];

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
                  <p className="text-brand-cream text-sm">{leg.departure_date}</p>
                  {leg.departure_time && <p className="text-brand-muted text-xs">{leg.departure_time}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-sm text-brand-muted">
          <span>{request.passenger_count} passenger{request.passenger_count !== 1 ? 's' : ''}</span>
          {request.notes && <span>&middot; {request.notes}</span>}
        </div>
      </Card>

      {/* Quotes */}
      <h2 className="font-display text-xl text-brand-cream mb-4">
        Quotes {quotes.length > 0 && <span className="text-brand-muted text-sm font-normal">({quotes.length})</span>}
      </h2>

      {quotes.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-8">No quotes yet. Operators are reviewing your request.</p>
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
                    ${(quote.price_cents / 100).toLocaleString()}
                  </p>
                  <p className="text-brand-muted text-xs">{quote.currency}</p>
                  {quote.status !== 'pending' && (
                    <Badge variant={quote.status === 'accepted' ? 'success' : 'error'} className="mt-2">
                      {quote.status}
                    </Badge>
                  )}
                </div>
              </div>
              {quote.status === 'pending' && request.status !== 'booked' && session.role === 'customer' && (
                <QuoteActions quoteId={quote.id} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
