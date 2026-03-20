import Link from 'next/link';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BookingRequest, BookingLeg } from '@/lib/types';

export default async function OperatorRequestsPage() {
  const db = getDb();

  const requests = db.prepare(
    "SELECT * FROM booking_requests WHERE status IN ('open', 'quoted') ORDER BY created_at DESC"
  ).all() as BookingRequest[];

  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');
  const getQuoteCount = db.prepare('SELECT COUNT(*) as count FROM quotes WHERE request_id = ?');

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-3xl text-brand-cream mb-2">Flight Demand</h1>
        <p className="text-brand-muted">Browse open booking requests and submit competitive quotes.</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-12">No open requests at the moment. Check back soon.</p>
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
            const timeAgo = getTimeAgo(req.created_at);

            return (
              <Link key={req.id} href={`/operator/requests/${req.id}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <p className="text-brand-cream font-mono tracking-wide text-lg">{route}</p>
                    <p className="text-brand-muted text-xs mt-1">
                      {legs.length} leg{legs.length !== 1 ? 's' : ''} &middot; {req.passenger_count} pax &middot; {dateRange}
                    </p>
                    <p className="text-brand-muted/50 text-xs mt-1">Posted {timeAgo}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={quoteCount > 0 ? 'warning' : 'gold'}>
                      {quoteCount} quote{quoteCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + 'Z').getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
