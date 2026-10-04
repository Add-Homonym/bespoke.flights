import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest, quoteCountsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import type { BookingRequest } from '@/lib/types';

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

  const requests = await db.query<BookingRequest>('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC', [session!.userId]);

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));
  const quoteCounts = await quoteCountsByRequest(db, requests.map(r => r.id));

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
            const legs = legsByReq.get(req.id) ?? [];
            const quoteCount = quoteCounts.get(req.id) ?? 0;
            return (
              <Link key={req.id} href={`/requests/${req.id}`}>
                <Card hover className="flex items-start justify-between gap-4">
                  <div>
                    <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                    {quoteCount > 0 && (
                      <p className="text-brand-gold text-xs mt-2">{quoteCount} quote{quoteCount !== 1 ? 's' : ''} received</p>
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
