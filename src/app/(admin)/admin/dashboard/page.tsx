import Link from 'next/link';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function AdminDashboardPage() {
  const db = getDb();

  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const totalCustomers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get() as { count: number }).count;
  const totalOperators = (db.prepare('SELECT COUNT(*) as count FROM operators').get() as { count: number }).count;
  const pendingOperators = (db.prepare("SELECT COUNT(*) as count FROM operators WHERE status = 'pending'").get() as { count: number }).count;
  const totalRequests = (db.prepare('SELECT COUNT(*) as count FROM booking_requests').get() as { count: number }).count;
  const openRequests = (db.prepare("SELECT COUNT(*) as count FROM booking_requests WHERE status = 'open'").get() as { count: number }).count;
  const totalQuotes = (db.prepare('SELECT COUNT(*) as count FROM quotes').get() as { count: number }).count;
  const bookedRequests = (db.prepare("SELECT COUNT(*) as count FROM booking_requests WHERE status = 'booked'").get() as { count: number }).count;

  // Discovery stats
  const discoveredTotal = (db.prepare('SELECT COUNT(*) as count FROM discovered_operators').get() as { count: number }).count;
  const discoveredNew = (db.prepare("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'new'").get() as { count: number }).count;
  const discoveredNoEmail = (db.prepare("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'no_email'").get() as { count: number }).count;
  const discoveredEmailed = (db.prepare("SELECT COUNT(*) as count FROM discovered_operators WHERE status = 'emailed'").get() as { count: number }).count;

  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">Admin Dashboard</h1>
      <p className="text-brand-muted mb-10">System overview and management.</p>

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
              <p className="text-brand-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-brand-cream font-display text-3xl">{stat.value}</p>
              {stat.sub && <p className="text-brand-warning text-xs mt-1">{stat.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>

      {/* Discovery Pipeline */}
      <h2 className="font-display text-xl text-brand-cream mb-4">Operator Discovery Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Discovered (FAA)', value: discoveredTotal, href: '/admin/discoveries' },
          { label: 'Ready to Email', value: discoveredNew, sub: discoveredNew > 0 ? 'have email addresses' : undefined, href: '/admin/discoveries?status=new' },
          { label: 'Need Email', value: discoveredNoEmail, sub: 'add contact info', href: '/admin/discoveries?status=no_email' },
          { label: 'Invited', value: discoveredEmailed, href: '/admin/discoveries?status=emailed' },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <Card hover>
              <p className="text-brand-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-brand-cream font-display text-3xl">{stat.value}</p>
              {stat.sub && <p className="text-brand-gold text-xs mt-1">{stat.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
