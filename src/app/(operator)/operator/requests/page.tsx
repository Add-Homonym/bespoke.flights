import Link from 'next/link';
import { getDb } from '@/lib/db';
import { legsByRequest, quoteCountsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import type { BookingRequest } from '@/lib/types';

export default async function OperatorRequestsPage() {
  const db = getDb();

  const requests = await db.query<BookingRequest>("SELECT * FROM booking_requests WHERE status IN ('open', 'quoted') ORDER BY created_at DESC");

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));
  const quoteCounts = await quoteCountsByRequest(db, requests.map(r => r.id));

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
            const legs = legsByReq.get(req.id) ?? [];
            const quoteCount = quoteCounts.get(req.id) ?? 0;
            const timeAgo = getTimeAgo(req.created_at);

            return (
              <Link key={req.id} href={`/operator/requests/${req.id}`}>
                <Card hover className="flex items-start justify-between gap-4">
                  <div>
                    <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                    <p className="text-brand-muted/50 text-xs mt-2">Posted {timeAgo}</p>
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
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
