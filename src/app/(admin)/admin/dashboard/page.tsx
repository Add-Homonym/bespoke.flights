import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function AdminDashboardPage() {
  await requireAdminPage();
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

  // Booking form comparison: requests and bookings per form design.
  const variants = await db.query<{ variant: string; requests: number; booked: number }>(`
    SELECT COALESCE(form_variant, 'unrecorded') AS variant, COUNT(*)::int AS requests,
      COUNT(*) FILTER (WHERE status IN ('booked','completed'))::int AS booked
    FROM booking_requests GROUP BY 1 ORDER BY 1`);

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

      <h2 className="font-display text-xl text-ink mb-4">Booking form comparison</h2>
      <Card className="mb-12">
        {variants.length === 0 ? (
          <p className="text-body text-ink-muted">No requests yet.</p>
        ) : (
          <table id="form-variants" className="w-full text-left text-body">
            <thead>
              <tr className="text-overline text-ink-muted">
                <th className="pb-2 font-semibold">Form</th>
                <th className="pb-2 text-right font-semibold">Requests</th>
                <th className="pb-2 text-right font-semibold">Booked</th>
                <th className="pb-2 text-right font-semibold">Booking rate</th>
              </tr>
            </thead>
            <tbody>
              {variants.map(v => (
                <tr key={v.variant} className="border-t border-hairline">
                  <td className="py-2 text-ink">{v.variant === 'ticket' ? 'Ticket (/book)' : v.variant === 'classic' ? 'Classic (/book/classic)' : 'Before tracking'}</td>
                  <td className="py-2 text-right tabular-nums">{v.requests}</td>
                  <td className="py-2 text-right tabular-nums">{v.booked}</td>
                  <td className="py-2 text-right tabular-nums">{v.requests ? `${Math.round((v.booked / v.requests) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

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
              {stat.sub && <p className="text-royal text-xs mt-1">{stat.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
