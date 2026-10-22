import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Operator, Quote } from '@/lib/types';
import Link from 'next/link';
import { formatMoney } from '@/lib/payments/config';

const statusBadge: Record<string, 'neutral' | 'confirmed' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  accepted: 'confirmed',
  rejected: 'danger',
  withdrawn: 'neutral',
  expired: 'neutral',
  cancelled: 'neutral',
};

/** One status per quote: the quote's own, refined by how its payment stands. */
function quoteStatus(q: { status: string; payment_status: string | null; payout_cents: number | null; currency: string }): { variant: 'neutral' | 'confirmed' | 'warning' | 'danger'; label: string } {
  if (q.status === 'cancelled') return { variant: 'neutral', label: q.payment_status === 'refunded' ? 'cancelled · refunded' : q.payment_status === 'partially_refunded' ? 'cancelled · partially refunded' : 'cancelled' };
  if (q.status === 'accepted') {
    if (q.payment_status === 'processing') return { variant: 'warning', label: 'accepted · payment processing' };
    const payout = q.payout_cents != null ? ` · ${formatMoney(q.payout_cents, q.currency)} payout` : '';
    if (q.payment_status === 'partially_refunded') return { variant: 'warning', label: `booked · partially refunded${payout}` };
    return { variant: 'confirmed', label: `booked${q.payment_status === 'succeeded' ? ' · paid' : ''}${payout}` };
  }
  return { variant: statusBadge[q.status] ?? 'neutral', label: q.status };
}

export default async function OperatorQuotesPage() {
  const session = await getSession();
  const db = getDb();

  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session!.userId]);

  if (!operator) {
    return (
      <div>
        <h1 className="font-display text-3xl text-ink mb-4">My Quotes</h1>
        <Card><p className="text-ink-muted text-center py-8">Operator profile not found.</p></Card>
      </div>
    );
  }

  const quotes = await db.query<Quote & { aircraft_type?: string; tail_number?: string; payment_status: string | null; payout_cents: number | null }>(`
    SELECT q.*, a.type as aircraft_type, a.tail_number,
      (SELECT p.status FROM payments p WHERE p.quote_id = q.id AND p.status IN ('processing','succeeded','partially_refunded','refunded')
       ORDER BY p.id DESC LIMIT 1) as payment_status,
      (SELECT p.operator_payout_cents FROM payments p WHERE p.quote_id = q.id AND p.status IN ('succeeded','partially_refunded')
       ORDER BY p.id DESC LIMIT 1) as payout_cents
    FROM quotes q
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.operator_id = ?
    ORDER BY q.created_at DESC
  `, [operator.id]);

  const legsByReq = await legsByRequest(db, quotes.map(r => r.request_id));

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-2">My Quotes</h1>
      <p className="text-ink-muted mb-10">Track all quotes you&apos;ve submitted.</p>

      {quotes.length === 0 ? (
        <Card>
          <p className="text-ink-muted text-center py-12">No quotes submitted yet. <Link href="/operator/requests" className="text-royal hover:underline">Browse demand</Link></p>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map(quote => {
            const legs = legsByReq.get(quote.request_id) ?? [];
            const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');

            return (
              <Link key={quote.id} href={`/operator/requests/${quote.request_id}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <p className="text-ink font-mono tracking-wide">{route}</p>
                    <p className="text-ink-muted text-xs mt-1">
                      {quote.aircraft_type && `${quote.aircraft_type} · `}
                      ${(quote.price_cents / 100).toLocaleString()}
                    </p>
                    <p className="text-ink-subtle text-xs mt-1">{new Date(quote.created_at).toLocaleDateString()}</p>
                    {quote.status === 'accepted' && quote.payment_status && ['succeeded', 'partially_refunded'].includes(quote.payment_status) && (
                      <p className="text-royal text-xs mt-1">Booked. Open to share the trip sheet with your team &rarr;</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={quoteStatus(quote).variant}>{quoteStatus(quote).label}</StatusBadge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
