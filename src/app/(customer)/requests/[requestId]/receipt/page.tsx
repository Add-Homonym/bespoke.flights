import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { loadReceipt } from '@/lib/payments/receipt';
import { formatTripDate, formatTripTime, tripRoute } from '@/lib/trip-format';
import { airportLabel } from '@/lib/airports';
import { PrintButton } from '@/components/operator/print-button';
import { StatusBadge } from '@/components/ui/status-badge';
import type { BookingRequest } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Receipt — bespoke.flights',
  robots: { index: false, follow: false },
};

/** Invoice-style receipt for a paid booking. Owner or admin. Prints cleanly. */
export default async function ReceiptPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { requestId } = await params;
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) notFound();
  if (session.role !== 'admin' && !(session.role === 'customer' && request.customer_id === session.userId)) notFound();

  const receipt = await loadReceipt(db, request.id);
  if (!receipt) notFound();

  const cancelled = receipt.status === 'cancelled';
  const fullyRefunded = receipt.netCents <= 0;

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <Link href={`/requests/${request.id}`} className="text-label text-brass-ink underline underline-offset-4">Back to trip</Link>
        <PrintButton />
      </div>

      <article className="rounded-lg border border-hairline bg-surface-raised p-8 shadow-raised print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-hairline pb-6">
          <div>
            <p className="text-title text-ink">
              <span>bespoke</span><span className="text-brass-ink">.flights</span>
            </p>
            <p className="mt-1 text-label text-ink-muted">Bespoke Flights Inc. · Honolulu, HI</p>
          </div>
          <div className="text-right">
            <p className="text-overline text-ink-muted">Receipt</p>
            <p className="text-heading text-ink tabular-nums">{receipt.receiptNumber}</p>
            {receipt.paidAt && <p className="text-label text-ink-muted tabular-nums">Paid {receipt.paidAt.slice(0, 10)}</p>}
            <div className="mt-2 flex justify-end">
              {cancelled ? <StatusBadge variant="danger">Cancelled</StatusBadge>
                : fullyRefunded ? <StatusBadge variant="neutral">Refunded</StatusBadge>
                : <StatusBadge variant="confirmed">Paid</StatusBadge>}
            </div>
          </div>
        </header>

        <section className="grid gap-6 border-b border-hairline py-6 sm:grid-cols-2">
          <div>
            <p className="text-overline text-ink-muted">Billed to</p>
            <p className="mt-1 text-body text-ink">{receipt.customer.name}</p>
            <p className="text-body text-ink-muted">{receipt.customer.email}</p>
          </div>
          <div>
            <p className="text-overline text-ink-muted">Operator</p>
            <p className="mt-1 text-body text-ink">{receipt.operator.company}</p>
            <p className="text-body text-ink-muted">
              FAA Part 135 {receipt.operator.certificate ? `· Certificate ${receipt.operator.certificate}` : '· Certificate on file'}
            </p>
            {receipt.operator.safetyRating && <p className="text-body text-ink-muted">{receipt.operator.safetyRating}</p>}
          </div>
        </section>

        <section className="border-b border-hairline py-6">
          <p className="text-overline text-ink-muted">Charter · Request #{receipt.requestId}</p>
          <p className="mt-1 text-heading text-ink tabular-nums">{tripRoute(receipt.legs)}</p>
          <table className="mt-4 w-full text-body">
            <thead>
              <tr className="text-left text-label text-ink-muted">
                <th className="pb-2 font-medium">Leg</th>
                <th className="pb-2 font-medium">Route</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Departure</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {receipt.legs.map((leg, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="py-2 tabular-nums">{i + 1}</td>
                  <td className="py-2">{airportLabel(leg.from)} → {airportLabel(leg.to)}</td>
                  <td className="py-2">{formatTripDate(leg.date) || leg.date}</td>
                  <td className="py-2">{formatTripTime(leg.time) || 'Any time'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
            <dt className="text-ink-muted">Aircraft</dt>
            <dd className="text-ink">{receipt.aircraft ?? 'To be confirmed by the operator'}</dd>
            <dt className="text-ink-muted">Passengers</dt>
            <dd className="text-ink">{receipt.passengerCount}</dd>
            <dt className="text-ink-muted">Special requests</dt>
            <dd className="text-ink break-words">{receipt.specialRequests ?? 'None'}</dd>
          </dl>
        </section>

        <section className="py-6">
          <table className="w-full text-body">
            <thead>
              <tr className="text-left text-label text-ink-muted">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Payment method</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {receipt.charges.map(c => (
                <tr key={c.receiptNumber} className="border-t border-hairline">
                  <td className="py-2">{c.label} <span className="text-ink-muted tabular-nums">({c.receiptNumber})</span></td>
                  <td className="py-2 tabular-nums">{c.date ?? '—'}</td>
                  <td className="py-2">{c.method ?? 'Not recorded'}</td>
                  <td className="py-2 text-right tabular-nums">{c.amount}</td>
                </tr>
              ))}
              {receipt.refunds.map((r, i) => (
                <tr key={`r${i}`} className="border-t border-hairline">
                  <td className="py-2">Refund{r.reason ? <span className="text-ink-muted"> · {r.reason}</span> : null}</td>
                  <td className="py-2 tabular-nums">{r.date}</td>
                  <td className="py-2">To original payment method</td>
                  <td className="py-2 text-right tabular-nums">−{r.amount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-ink">
              <tr className="border-t border-hairline">
                <td colSpan={3} className="pt-3 text-ink-muted">Total paid</td>
                <td className="pt-3 text-right tabular-nums">{receipt.totalPaid}</td>
              </tr>
              {receipt.totalRefundedCents > 0 && (
                <tr>
                  <td colSpan={3} className="pt-1 text-ink-muted">Total refunded</td>
                  <td className="pt-1 text-right tabular-nums">−{receipt.totalRefunded}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="pt-2 text-heading">Net</td>
                <td className="pt-2 text-right text-figure">{receipt.net}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-6 text-label text-ink-muted">
            All-in price: taxes and fees included. The operator named above is the carrier and merchant of record; Bespoke Flights Inc. arranges the charter.
          </p>
        </section>
      </article>
    </div>
  );
}
