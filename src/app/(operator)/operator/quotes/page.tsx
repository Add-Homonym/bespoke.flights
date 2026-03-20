import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Operator, Quote, BookingLeg } from '@/lib/types';
import Link from 'next/link';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
  withdrawn: 'default',
};

export default async function OperatorQuotesPage() {
  const session = await getSession();
  const db = getDb();

  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(session!.userId) as Operator | undefined;

  if (!operator) {
    return (
      <div>
        <h1 className="font-display text-3xl text-brand-cream mb-4">My Quotes</h1>
        <Card><p className="text-brand-muted text-center py-8">Operator profile not found.</p></Card>
      </div>
    );
  }

  const quotes = db.prepare(`
    SELECT q.*, a.type as aircraft_type, a.tail_number
    FROM quotes q
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.operator_id = ?
    ORDER BY q.created_at DESC
  `).all(operator.id) as (Quote & { aircraft_type?: string; tail_number?: string })[];

  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');

  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">My Quotes</h1>
      <p className="text-brand-muted mb-10">Track all quotes you&apos;ve submitted.</p>

      {quotes.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-12">No quotes submitted yet. <Link href="/operator/requests" className="text-brand-gold hover:underline">Browse demand</Link></p>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map(quote => {
            const legs = getLegs.all(quote.request_id) as BookingLeg[];
            const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');

            return (
              <Link key={quote.id} href={`/operator/requests/${quote.request_id}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <p className="text-brand-cream font-mono tracking-wide">{route}</p>
                    <p className="text-brand-muted text-xs mt-1">
                      {quote.aircraft_type && `${quote.aircraft_type} · `}
                      ${(quote.price_cents / 100).toLocaleString()}
                    </p>
                    <p className="text-brand-muted/50 text-xs mt-1">{new Date(quote.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={statusBadge[quote.status]}>{quote.status}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
