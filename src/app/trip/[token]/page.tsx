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
    <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-10 print:py-0 print:text-black">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-brand-muted text-sm print:text-gray-600">{sheet.operatorCompany} · Booking #{sheet.requestId}</p>
          <h1 className="font-display text-3xl text-brand-cream font-mono tracking-wide mt-1 print:text-black">{tripRoute(sheet.legs)}</h1>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href={`/trip/${token}/calendar`}
            className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-cream hover:border-brand-gold/50"
          >
            Add to calendar
          </a>
          <PrintButton />
        </div>
      </div>

      {cancelled && (
        <div role="alert" className="mb-6 rounded-lg border border-brand-error/40 bg-brand-error/10 px-4 py-3 text-brand-error text-sm font-medium print:border-black print:text-black">
          This booking has been cancelled.
        </div>
      )}

      <section className="rounded-xl border border-brand-border bg-brand-card p-6 mb-6 print:border-gray-400 print:bg-white">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4 print:text-gray-600">Flight legs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-brand-muted print:text-gray-600">
              <th className="pb-2 font-medium">Leg</th>
              <th className="pb-2 font-medium">Route</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Departure</th>
            </tr>
          </thead>
          <tbody className="text-brand-cream print:text-black">
            {sheet.legs.map((leg, i) => (
              <tr key={i} className="border-t border-brand-border/60 print:border-gray-300">
                <td className="py-2">{i + 1}</td>
                <td className="py-2 font-mono">{leg.from} → {leg.to}</td>
                <td className="py-2">{formatTripDate(leg.date) || leg.date}</td>
                <td className="py-2">{formatTripTime(leg.time) || 'Any time'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-brand-muted text-xs mt-3 print:text-gray-600">Times are local to the departure airport, as requested by the client.</p>
      </section>

      <section className="rounded-xl border border-brand-border bg-brand-card p-6 mb-6 print:border-gray-400 print:bg-white">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-brand-muted print:text-gray-600">Aircraft</dt>
          <dd className="text-brand-cream print:text-black">{sheet.aircraft ?? 'Not assigned'}</dd>
          <dt className="text-brand-muted print:text-gray-600">Passengers</dt>
          <dd className="text-brand-cream print:text-black">{sheet.passengerCount}</dd>
          <dt className="text-brand-muted print:text-gray-600">Special requests</dt>
          <dd className="text-brand-cream break-words print:text-black">{sheet.specialRequests ?? 'None'}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-brand-border bg-brand-card p-6 mb-6 print:border-gray-400 print:bg-white">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4 print:text-gray-600">Lead passenger</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-brand-muted print:text-gray-600">Name</dt>
          <dd className="text-brand-cream print:text-black">{sheet.leadPassenger.name}</dd>
          <dt className="text-brand-muted print:text-gray-600">Phone</dt>
          <dd className="text-brand-cream print:text-black">
            {sheet.leadPassenger.phone ? <a href={`tel:${sheet.leadPassenger.phone}`} className="hover:text-brand-gold">{sheet.leadPassenger.phone}</a> : 'Not provided'}
          </dd>
          <dt className="text-brand-muted print:text-gray-600">Email</dt>
          <dd className="text-brand-cream print:text-black">
            <a href={`mailto:${sheet.leadPassenger.email}`} className="hover:text-brand-gold">{sheet.leadPassenger.email}</a>
          </dd>
        </dl>
      </section>

      <p className="text-brand-muted text-xs print:text-gray-600">
        Shared by {sheet.operatorCompany} for internal use. Contains passenger contact details; do not forward outside your company.
        This link stops working on {formatTripDate(sheet.expiresAt.slice(0, 10))} or when the operator revokes it.
      </p>
    </main>
  );
}
