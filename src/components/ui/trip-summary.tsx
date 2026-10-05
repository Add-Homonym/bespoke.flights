import type { ReactNode } from 'react';

export interface SummaryPlace {
  code: string;
  city: string;
}

/**
 * The trip at a glance, on the night surface. Informational only: no buttons.
 * `status` is a StatusBadge element; `depart` is local time with day.
 */
export function TripSummary({
  status,
  reference,
  origin,
  destination,
  depart,
  guests,
  aircraft,
}: {
  status: ReactNode;
  reference: string;
  origin: SummaryPlace;
  destination: SummaryPlace;
  depart: string;
  guests: number;
  aircraft: string;
}) {
  const facts: [string, ReactNode][] = [
    ['Depart', depart],
    ['Guests', guests],
    ['Aircraft', aircraft],
  ];
  return (
    <section
      aria-label="Trip summary"
      className="flex flex-col gap-5 rounded-lg border border-hairline bg-night p-6 text-on-night shadow-raised"
    >
      <div className="flex items-center justify-between gap-3">
        {status}
        <p className="text-label text-on-night-muted tabular-nums">{reference}</p>
      </div>

      <div className="flex items-center gap-4">
        <Place {...origin} />
        <div aria-hidden="true" className="h-px flex-1 bg-brass" />
        <Place {...destination} align="right" />
      </div>

      <dl className="grid grid-cols-[1.6fr_1fr_1fr] gap-4">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-overline text-on-night-muted">{term}</dt>
            <dd className="mt-1 text-body break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Place({ code, city, align = 'left' }: SummaryPlace & { align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-display tabular-nums">{code}</p>
      <p className="text-label text-on-night-muted">{city}</p>
    </div>
  );
}
