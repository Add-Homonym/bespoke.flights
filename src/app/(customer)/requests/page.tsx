import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BookingRequest, BookingLeg } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

export default async function RequestsPage() {
  const session = await getSession();
  const db = getDb();

  const requests = db.prepare(
    'SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC'
  ).all(session!.userId) as BookingRequest[];

  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');
  const getQuoteCount = db.prepare('SELECT COUNT(*) as count FROM quotes WHERE request_id = ?');

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-brand-cream mb-2">My Requests</h1>
          <p className="text-brand-muted">Track your flight requests and view operator quotes.</p>
        </div>
        <Link
          href="/book"
          className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-accent transition-colors"
        >
          New Request
        </Link>
      </div>

      {requests.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-12">No flight requests yet. <Link href="/book" className="text-brand-gold hover:underline">Create your first one</Link></p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const legs = getLegs.all(req.id) as BookingLeg[];
            const quoteCount = (getQuoteCount.get(req.id) as { count: number }).count;
            const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');
            const dateRange = legs.length > 0
              ? `${legs[0].departure_date}${legs.length > 1 ? ` — ${legs[legs.length - 1].departure_date}` : ''}`
              : '';

            return (
              <Link key={req.id} href={`/requests/${req.id}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <p className="text-brand-cream font-mono tracking-wide text-lg">{route}</p>
                    <p className="text-brand-muted text-xs mt-1">
                      {legs.length} leg{legs.length !== 1 ? 's' : ''} &middot; {req.passenger_count} pax &middot; {dateRange}
                    </p>
                    {quoteCount > 0 && (
                      <p className="text-brand-gold text-xs mt-1">{quoteCount} quote{quoteCount !== 1 ? 's' : ''} received</p>
                    )}
                  </div>
                  <Badge variant={statusBadge[req.status]}>{req.status}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
