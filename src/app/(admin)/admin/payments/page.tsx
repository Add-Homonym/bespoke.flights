import Link from 'next/link';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import { RefundButton } from '@/components/admin/refund-button';
import { formatMoney, getPaymentsMode, platformFeeBps } from '@/lib/payments/config';
import type { Payment } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  pending: 'gold',
  processing: 'warning',
  succeeded: 'success',
  partially_refunded: 'warning',
  refunded: 'default',
  failed: 'error',
  canceled: 'default',
};

export default async function AdminPaymentsPage() {
  const db = getDb();
  const mode = getPaymentsMode();

  const payments = await db.query<Payment & { customer_name: string; company_name: string }>(`
    SELECT p.*, u.name AS customer_name, o.company_name
    FROM payments p
    JOIN users u ON u.id = p.customer_id
    JOIN operators o ON o.id = p.operator_id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 200
  `);

  // Fee revenue net of refunds: refunds return the platform fee pro rata.
  const totals = (await db.one<{ gross_cents: number; refunded_cents: number; net_fee_cents: number; count: number }>(`
    SELECT
      COALESCE(SUM(amount_cents), 0) AS gross_cents,
      COALESCE(SUM(refunded_cents), 0) AS refunded_cents,
      COALESCE(SUM(platform_fee_cents - (platform_fee_cents * refunded_cents) / amount_cents), 0) AS net_fee_cents,
      COUNT(*) AS count
    FROM payments WHERE status IN ('succeeded', 'partially_refunded', 'refunded')
  `))!;

  const processing = (await db.one<{ c: number }>("SELECT COUNT(*) AS c FROM payments WHERE status = 'processing'"))!.c;
  const disputed = (await db.one<{ c: number }>("SELECT COUNT(*) AS c FROM payments WHERE dispute_status IS NOT NULL AND dispute_status NOT IN ('won', 'lost')"))!.c;

  const stats = [
    { label: 'Gross bookings', value: formatMoney(totals.gross_cents) },
    { label: 'Platform fees (net)', value: formatMoney(totals.net_fee_cents) },
    { label: 'Refunded', value: formatMoney(totals.refunded_cents) },
    { label: 'Processing / disputed', value: `${processing} / ${disputed}` },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-brand-cream mb-2">Payments</h1>
          <p className="text-brand-muted">
            {totals.count} paid booking{totals.count !== 1 ? 's' : ''} &middot; default platform fee{' '}
            {(platformFeeBps() / 100).toFixed(2).replace(/\.00$/, '')}%
          </p>
        </div>
        <Badge variant={mode === 'stripe' ? 'success' : mode === 'stub' ? 'warning' : 'error'}>
          {mode === 'stripe' ? 'Stripe live' : mode === 'stub' ? 'Development stub' : 'Payments disabled'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {stats.map(s => (
          <Card key={s.label}>
            <p className="text-brand-muted text-xs uppercase tracking-wider">{s.label}</p>
            <p className="text-brand-cream font-display text-2xl mt-2">{s.value}</p>
          </Card>
        ))}
      </div>

      {payments.length === 0 ? (
        <Card><p className="text-brand-muted text-center py-12">No payments yet.</p></Card>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>ID</Th>
              <Th>Request</Th>
              <Th>Customer</Th>
              <Th>Operator</Th>
              <Th>Amount</Th>
              <Th>Fee</Th>
              <Th>Refunded</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>{''}</Th>
            </tr>
          </Thead>
          <tbody>
            {payments.map(p => (
              <Tr key={p.id}>
                <Td className="font-mono text-xs">
                  #{p.id}
                  {p.stripe_payment_intent_id && (
                    <div className="text-brand-muted">{p.stripe_payment_intent_id}</div>
                  )}
                </Td>
                <Td>
                  <Link href={`/requests/${p.request_id}`} className="hover:text-brand-gold">#{p.request_id}</Link>
                </Td>
                <Td>{p.customer_name}</Td>
                <Td>{p.company_name}</Td>
                <Td>{formatMoney(p.amount_cents, p.currency)}</Td>
                <Td className="text-brand-muted">{formatMoney(p.platform_fee_cents, p.currency)}</Td>
                <Td className="text-brand-muted">{p.refunded_cents > 0 ? formatMoney(p.refunded_cents, p.currency) : '—'}</Td>
                <Td>
                  <Badge variant={statusBadge[p.status] ?? 'default'}>{p.status.replace('_', ' ')}</Badge>
                  {p.dispute_status && <Badge variant="error" className="ml-1">dispute: {p.dispute_status}</Badge>}
                  {p.failure_reason && ['failed', 'canceled'].includes(p.status) && (
                    <div className="text-brand-muted text-xs mt-1">{p.failure_reason}</div>
                  )}
                </Td>
                <Td className="text-brand-muted text-xs">{new Date(p.created_at + 'Z').toLocaleDateString()}</Td>
                <Td>
                  {['succeeded', 'partially_refunded'].includes(p.status) && (
                    <RefundButton paymentId={p.id} remainingCents={p.amount_cents - p.refunded_cents} />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
