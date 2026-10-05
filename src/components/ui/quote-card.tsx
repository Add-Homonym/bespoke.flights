import type { ReactNode } from 'react';

/**
 * One operator quote. The operator is always named before booking, the price
 * is the all-in total (never "from"), and there are no photos.
 */
export function QuoteCard({
  aircraft,
  operatorName,
  badge,
  seats,
  flightTime,
  yearBuilt,
  price,
  note,
  selected = false,
  action,
}: {
  aircraft: string;
  /** Operator legal name. */
  operatorName: string;
  badge?: ReactNode;
  seats: number | null;
  flightTime: string | null;
  yearBuilt: number | null;
  price: string;
  /** Optional operator message or validity line, shown above the specs. */
  note?: ReactNode;
  selected?: boolean;
  /** Bottom-right action, normally a `sm` Button. */
  action?: ReactNode;
}) {
  const specs: [string, string][] = [
    ['Seats', seats ? String(seats) : 'Not listed'],
    ['Flight time', flightTime ?? 'Not listed'],
    ['Year built', yearBuilt ? String(yearBuilt) : 'Not listed'],
  ];
  return (
    <article
      className={`flex flex-col gap-4 rounded-lg border bg-surface-raised p-6 shadow-raised ${
        selected ? 'border-brass ring-1 ring-brass' : 'border-hairline'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-heading text-ink">{aircraft}</h3>
          <p className="text-label text-ink-muted break-words">{operatorName} · Part 135</p>
        </div>
        {badge}
      </div>

      {note && <div className="text-body text-ink-muted">{note}</div>}

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
          <p className="text-figure text-ink">{price}</p>
          <p className="text-label text-ink-muted">All-in · taxes and fees included</p>
        </div>
        {action}
      </div>
    </article>
  );
}
