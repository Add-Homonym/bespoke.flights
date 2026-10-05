import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest, quoteCountsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { ButtonLink } from '@/components/ui/button';
import { RequestStatusBadge } from '@/components/booking/request-status';
import type { BookingRequest } from '@/lib/types';

export default async function RequestsPage() {
  const session = await getSession();
  const db = getDb();

  const requests = await db.query<BookingRequest>('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC', [session!.userId]);

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));
  const quoteCounts = await quoteCountsByRequest(db, requests.map(r => r.id));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">My requests</h1>
          <p className="mt-2 text-body text-ink-muted">Track your trips and compare operator quotes.</p>
        </div>
        <ButtonLink href="/book" size="sm">New request</ButtonLink>
      </div>

      {requests.length === 0 ? (
        <Card>
          <p className="text-body text-ink-muted text-center py-12">No trips yet. <Link href="/book" className="text-brass-ink underline underline-offset-4">Request your first quotes</Link></p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {requests.map(req => {
            const legs = legsByReq.get(req.id) ?? [];
            const quoteCount = quoteCounts.get(req.id) ?? 0;
            return (
              <li key={req.id}>
                <Link href={`/requests/${req.id}`} className="block rounded-lg">
                  <Card hover className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                      {quoteCount > 0 && (
                        <p className="mt-2 text-label text-ink-muted tabular-nums">{quoteCount} {quoteCount !== 1 ? 'quotes' : 'quote'} received</p>
                      )}
                    </div>
                    <RequestStatusBadge status={req.status} />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
