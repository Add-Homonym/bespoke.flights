import Link from 'next/link';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function AdminDashboardPage() {
  const db = getDb();

  const totalUsers = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM users'))!.count;
  const totalCustomers = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'customer'"))!.count;
  const totalOperators = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM operators'))!.count;
  const pendingOperators = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM operators WHERE status = 'pending'"))!.count;
  const totalRequests = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM booking_requests'))!.count;
  const openRequests = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM booking_requests WHERE status = 'open'"))!.count;
  const totalQuotes = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM quotes'))!.count;
  const bookedRequests = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM booking_requests WHERE status = 'booked'"))!.count;

  // Discovery stats
  const discoveredTotal = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM discovered_operators'))!.count;
  const discoveredNew = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'new'"))!.count;
  const discoveredNoEmail = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'no_email'"))!.count;
  const discoveredEmailed = (await db.one<{ count: number }>("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'emailed'"))!.count;

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-2">Admin Dashboard</h1>
      <p className="text-ink-muted mb-10">System overview and management.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Total Users', value: totalUsers, href: '/admin/users' },
          { label: 'Customers', value: totalCustomers, href: '/admin/users' },
          { label: 'Operators', value: totalOperators, sub: pendingOperators > 0 ? `${pendingOperators} pending` : undefined, href: '/admin/operators' },
          { label: 'Total Requests', value: totalRequests, href: '/admin/requests' },
          { label: 'Open Requests', value: openRequests, href: '/admin/requests' },
          { label: 'Booked Flights', value: bookedRequests, href: '/admin/requests' },
          { label: 'Total Quotes', value: totalQuotes, href: '/admin/requests' },
          { label: 'Pending Approvals', value: pendingOperators, href: '/admin/operators' },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <Card hover>
              <p className="text-ink-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-ink font-display text-3xl">{stat.value}</p>
              {stat.sub && <p className="text-warning text-xs mt-1">{stat.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>

      {/* Discovery Pipeline */}
      <h2 className="font-display text-xl text-ink mb-4">Operator Discovery Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Discovered (FAA)', value: discoveredTotal, href: '/admin/discoveries' },
          { label: 'Ready to Email', value: discoveredNew, sub: discoveredNew > 0 ? 'have email addresses' : undefined, href: '/admin/discoveries?status=new' },
          { label: 'Need Email', value: discoveredNoEmail, sub: 'add contact info', href: '/admin/discoveries?status=no_email' },
          { label: 'Invited', value: discoveredEmailed, href: '/admin/discoveries?status=emailed' },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <Card hover>
              <p className="text-ink-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-ink font-display text-3xl">{stat.value}</p>
              {stat.sub && <p className="text-brass-ink text-xs mt-1">{stat.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
