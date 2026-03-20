import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import type { Operator } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default async function OperatorDashboardPage() {
  const session = await getSession();
  const db = getDb();

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(session!.userId) as { name: string };
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(session!.userId) as Operator | undefined;

  const openRequests = (db.prepare("SELECT COUNT(*) as count FROM booking_requests WHERE status IN ('open', 'quoted')").get() as { count: number }).count;
  const myQuotes = operator ? (db.prepare('SELECT COUNT(*) as count FROM quotes WHERE operator_id = ?').get(operator.id) as { count: number }).count : 0;
  const acceptedQuotes = operator ? (db.prepare("SELECT COUNT(*) as count FROM quotes WHERE operator_id = ? AND status = 'accepted'").get(operator.id) as { count: number }).count : 0;
  const fleetSize = operator ? (db.prepare('SELECT COUNT(*) as count FROM aircraft WHERE operator_id = ?').get(operator.id) as { count: number }).count : 0;

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-3xl text-brand-cream mb-2">Operator Dashboard</h1>
        <p className="text-brand-muted">Welcome back, {user.name}</p>
        {operator && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-brand-cream text-sm">{operator.company_name}</span>
            <Badge variant={operator.status === 'approved' ? 'success' : operator.status === 'pending' ? 'warning' : 'error'}>
              {operator.status}
            </Badge>
          </div>
        )}
      </div>

      {operator?.status === 'pending' && (
        <Card className="mb-8 border-brand-warning/30 bg-brand-warning/5">
          <p className="text-brand-warning text-sm">Your operator account is pending approval. You&apos;ll be able to submit quotes once approved by an administrator.</p>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Open Requests', value: openRequests, href: '/operator/requests' },
          { label: 'Quotes Submitted', value: myQuotes, href: '/operator/quotes' },
          { label: 'Quotes Accepted', value: acceptedQuotes, href: '/operator/quotes' },
          { label: 'Fleet Size', value: fleetSize, href: '/operator/fleet' },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <Card hover>
              <p className="text-brand-muted text-xs uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-brand-cream font-display text-3xl">{stat.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/operator/requests">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Browse Demand</h3>
            <p className="text-brand-muted text-xs">View open flight requests</p>
          </Card>
        </Link>
        <Link href="/operator/fleet">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Manage Fleet</h3>
            <p className="text-brand-muted text-xs">Add and manage your aircraft</p>
          </Card>
        </Link>
        <Link href="/operator/quotes">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">My Quotes</h3>
            <p className="text-brand-muted text-xs">Track your submitted quotes</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
