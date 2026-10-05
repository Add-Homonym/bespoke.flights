import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { Plane, ClipboardList, Settings } from 'lucide-react';
import { RequestStatusBadge } from '@/components/booking/request-status';
import type { BookingRequest, User } from '@/lib/types';

export default async function DashboardPage() {
  const session = await getSession();
  const db = getDb();
  const user = (await db.one<Pick<User, 'name'>>('SELECT name FROM users WHERE id = ?', [session!.userId]))!;

  const requests = await db.query<BookingRequest>('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10', [session!.userId]);

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));

  const actions = [
    { href: '/book', icon: Plane, title: 'Request quotes', desc: 'Start a new multi-leg trip' },
    { href: '/requests', icon: ClipboardList, title: 'My requests', desc: 'See every trip and its quotes' },
    { href: '/account', icon: Settings, title: 'Account settings', desc: 'Update your profile' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-display text-ink">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="mt-2 text-body text-ink-muted">Your trips, quotes and receipts.</p>
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {actions.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href} className="block rounded-lg">
            <Card hover className="h-full">
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" className="text-ink" />
              <h2 className="mt-3 text-heading text-ink">{title}</h2>
              <p className="text-label text-ink-muted">{desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent requests */}
      <h2 className="mb-4 text-title text-ink">Recent requests</h2>
      {requests.length === 0 ? (
        <Card>
          <p className="text-body text-ink-muted text-center py-8">No trips yet. <Link href="/book" className="text-brass-ink underline underline-offset-4">Request your first quotes</Link></p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {requests.map(req => {
            const legs = legsByReq.get(req.id) ?? [];
            return (
              <li key={req.id}>
                <Link href={`/requests/${req.id}`} className="block rounded-lg">
                  <Card hover className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                      <p className="mt-2 text-label text-ink-muted">Requested {new Date(req.created_at).toLocaleDateString()}</p>
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
