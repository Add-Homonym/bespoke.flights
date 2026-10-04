import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import type { BookingRequest, User } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

export default async function DashboardPage() {
  const session = await getSession();
  const db = getDb();
  const user = (await db.one<Pick<User, 'name'>>('SELECT name FROM users WHERE id = ?', [session!.userId]))!;

  const requests = await db.query<BookingRequest>('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10', [session!.userId]);

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-3xl text-brand-cream mb-2">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="text-brand-muted">Manage your flight requests and bookings.</p>
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        <Link href="/book">
          <Card hover className="text-center">
            <div className="text-3xl mb-3">&#9992;</div>
            <h3 className="text-brand-cream font-semibold mb-1">Book a Flight</h3>
            <p className="text-brand-muted text-xs">Create a new multi-leg request</p>
          </Card>
        </Link>
        <Link href="/requests">
          <Card hover className="text-center">
            <div className="text-3xl mb-3">&#128203;</div>
            <h3 className="text-brand-cream font-semibold mb-1">My Requests</h3>
            <p className="text-brand-muted text-xs">View all booking requests</p>
          </Card>
        </Link>
        <Link href="/account">
          <Card hover className="text-center">
            <div className="text-3xl mb-3">&#9881;</div>
            <h3 className="text-brand-cream font-semibold mb-1">Account Settings</h3>
            <p className="text-brand-muted text-xs">Update your profile info</p>
          </Card>
        </Link>
      </div>

      {/* Recent requests */}
      <h2 className="font-display text-xl text-brand-cream mb-4">Recent Requests</h2>
      {requests.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-8">No flight requests yet. <Link href="/book" className="text-brand-gold hover:underline">Book your first flight</Link></p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const legs = legsByReq.get(req.id) ?? [];
            return (
              <Link key={req.id} href={`/requests/${req.id}`}>
                <Card hover className="flex items-start justify-between gap-4">
                  <div>
                    <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                    <p className="text-brand-muted/60 text-xs mt-2">Requested {new Date(req.created_at).toLocaleDateString()}</p>
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
