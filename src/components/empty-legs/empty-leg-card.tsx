import type { ReactNode } from 'react';
import { airportLabel } from '@/lib/airports';
import { formatMoney } from '@/lib/payments/config';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import type { EmptyLegView } from '@/lib/empty-legs/service';

/** One listed flight. The operator is named, the price is all-in for the whole aircraft. */
export function EmptyLegCard({ leg, badge, action, children }: { leg: EmptyLegView; badge?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  const when = [formatTripDate(leg.departure_date) || leg.departure_date, leg.departure_time ? formatTripTime(leg.departure_time) : 'Time to be confirmed'].join(' · ');
  const specs: [string, string][] = [
    ['Seats', String(leg.seats)],
    ['Aircraft', leg.aircraft_type ?? 'To be confirmed'],
    ['Flexibility', leg.flex_days > 0 ? `±${leg.flex_days} day${leg.flex_days === 1 ? '' : 's'}` : 'Fixed date'],
  ];
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-heading text-ink">
            {airportLabel(leg.origin_code)} <span aria-label="to">&rarr;</span> {airportLabel(leg.dest_code)}
          </h3>
          <p className="text-body text-ink-muted">{when}</p>
          <p className="text-label text-ink-muted break-words">{leg.company_name} · Part 135</p>
          {(leg.certificate || leg.safety_rating) && (
            <p className="text-label text-ink-subtle break-words">{[leg.certificate && `FAA certificate ${leg.certificate}`, leg.safety_rating].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        {badge}
      </div>
      {leg.notes && <p className="text-body text-ink-muted">{leg.notes}</p>}
      <dl className="grid grid-cols-3 gap-3 border-y border-hairline py-4">
        {specs.map(([term, value]) => (
          <div key={term}>
            <dt className="text-label text-ink-muted">{term}</dt>
            <dd className="text-body text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="text-figure text-ink">{formatMoney(leg.price_cents, leg.currency)}</p>
          <p className="text-label text-ink-muted">Whole aircraft · all-in</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}
