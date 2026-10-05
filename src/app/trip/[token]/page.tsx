import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { loadTripSheet } from '@/lib/sharing/trip-share';
import { formatTripDate, formatTripTime, tripRoute } from '@/lib/trip-format';
import { PrintButton } from '@/components/operator/print-button';

export const metadata: Metadata = {
  title: 'Trip sheet — bespoke.flights',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Read-only trip sheet an operator shares with their own staff. No login. */
export default async function TripSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await loadTripSheet(getDb(), token);
  if (!sheet) notFound();

  const cancelled = sheet.status === 'cancelled';

  return (
    <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-10 print:py-0">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-ink-muted text-sm">{sheet.operatorCompany} · Booking #{sheet.requestId}</p>
          <h1 className="font-display text-3xl text-ink font-mono tracking-wide mt-1">{tripRoute(sheet.legs)}</h1>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href={`/trip/${token}/calendar`}
            className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:border-border-control"
          >
            Add to calendar
          </a>
          <PrintButton />
        </div>
      </div>

      {cancelled && (
        <div role="alert" className="mb-6 rounded-md border border-danger bg-danger-tint px-4 py-3 text-danger text-sm font-medium">
          This booking has been cancelled.
        </div>
      )}

      <section className="rounded-lg border border-hairline bg-surface-raised p-6 mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Flight legs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="pb-2 font-medium">Leg</th>
              <th className="pb-2 font-medium">Route</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Departure</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {sheet.legs.map((leg, i) => (
              <tr key={i} className="border-t border-hairline">
                <td className="py-2">{i + 1}</td>
                <td className="py-2 font-mono">{leg.from} → {leg.to}</td>
                <td className="py-2">{formatTripDate(leg.date) || leg.date}</td>
                <td className="py-2">{formatTripTime(leg.time) || 'Any time'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-ink-muted text-xs mt-3">Times are local to the departure airport, as requested by the client.</p>
      </section>

      <section className="rounded-lg border border-hairline bg-surface-raised p-6 mb-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">Aircraft</dt>
          <dd className="text-ink">{sheet.aircraft ?? 'Not assigned'}</dd>
          <dt className="text-ink-muted">Passengers</dt>
          <dd className="text-ink">{sheet.passengerCount}</dd>
          <dt className="text-ink-muted">Special requests</dt>
          <dd className="text-ink break-words">{sheet.specialRequests ?? 'None'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-hairline bg-surface-raised p-6 mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Lead passenger</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">Name</dt>
          <dd className="text-ink">{sheet.leadPassenger.name}</dd>
          <dt className="text-ink-muted">Phone</dt>
          <dd className="text-ink">
            {sheet.leadPassenger.phone ? <a href={`tel:${sheet.leadPassenger.phone}`} className="hover:text-brass-ink">{sheet.leadPassenger.phone}</a> : 'Not provided'}
          </dd>
          <dt className="text-ink-muted">Email</dt>
          <dd className="text-ink">
            <a href={`mailto:${sheet.leadPassenger.email}`} className="hover:text-brass-ink">{sheet.leadPassenger.email}</a>
          </dd>
        </dl>
      </section>

      <p className="text-ink-muted text-xs">
        Shared by {sheet.operatorCompany} for internal use. Contains passenger contact details; do not forward outside your company.
        This link stops working on {formatTripDate(sheet.expiresAt.slice(0, 10))} or when the operator revokes it.
      </p>
    </main>
  );
}
