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

  // Inbound RFQs (auto-matched to this operator)
  const inboundTotal = operator ? (db.prepare('SELECT COUNT(*) as count FROM outreach_log WHERE operator_id = ?').get(operator.id) as { count: number }).count : 0;
  const inboundPending = operator ? (db.prepare(`
    SELECT COUNT(*) as count FROM outreach_log ol
    WHERE ol.operator_id = ?
      AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = ol.request_id AND q.operator_id = ol.operator_id)
      AND EXISTS (SELECT 1 FROM booking_requests br WHERE br.id = ol.request_id AND br.status IN ('open', 'quoted'))
  `).get(operator.id) as { count: number }).count : 0;

  // Profile completeness check
  const profileComplete = operator && operator.markets && operator.fleet_types && operator.safety_rating && (operator.contact_email || operator.contact_phone);

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

      {/* Profile incomplete warning */}
      {operator && !profileComplete && (
        <Card className="mb-8 border-brand-warning/30 bg-brand-warning/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-brand-warning text-sm font-semibold">Complete your operator profile</p>
              <p className="text-brand-warning/70 text-xs mt-1">
                Configure your markets, fleet types, safety rating, and contact method so the matching engine can route charter requests to you automatically.
              </p>
            </div>
            <Link href="/operator/settings" className="rounded-lg bg-brand-warning px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-warning/80 transition-colors shrink-0">
              Configure →
            </Link>
          </div>
        </Card>
      )}

      {operator?.status === 'pending' && (
        <Card className="mb-8 border-brand-warning/30 bg-brand-warning/5">
          <p className="text-brand-warning text-sm">Your operator account is pending approval. Configure your profile now — RFQs will begin flowing once approved.</p>
        </Card>
      )}

      {/* Inbound highlight */}
      {inboundPending > 0 && (
        <Link href="/operator/inbound">
          <Card hover className="mb-8 border-brand-gold/30 bg-brand-gold/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-brand-gold font-semibold text-lg">{inboundPending} inbound request{inboundPending !== 1 ? 's' : ''} awaiting your quote</p>
                <p className="text-brand-cream/60 text-sm mt-1">These were automatically matched to your operator profile.</p>
              </div>
              <span className="text-brand-gold text-2xl">→</span>
            </div>
          </Card>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Inbound RFQs', value: inboundTotal, sub: inboundPending > 0 ? `${inboundPending} pending` : undefined, href: '/operator/inbound' },
          { label: 'Quotes Submitted', value: myQuotes, href: '/operator/quotes' },
          { label: 'Quotes Accepted', value: acceptedQuotes, href: '/operator/quotes' },
          { label: 'Fleet Size', value: fleetSize, href: '/operator/fleet' },
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

      {/* Quick actions */}
      <div className="grid md:grid-cols-4 gap-4">
        <Link href="/operator/inbound">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Inbound RFQs</h3>
            <p className="text-brand-muted text-xs">Requests matched to you</p>
          </Card>
        </Link>
        <Link href="/operator/requests">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Browse All Demand</h3>
            <p className="text-brand-muted text-xs">See all open requests</p>
          </Card>
        </Link>
        <Link href="/operator/fleet">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Manage Fleet</h3>
            <p className="text-brand-muted text-xs">Add and manage aircraft</p>
          </Card>
        </Link>
        <Link href="/operator/settings">
          <Card hover className="text-center py-8">
            <h3 className="text-brand-cream font-semibold mb-1">Settings</h3>
            <p className="text-brand-muted text-xs">Contact method & profile</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
