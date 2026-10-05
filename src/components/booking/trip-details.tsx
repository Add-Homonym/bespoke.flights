import { formatTripDate, formatTripTime, type TripLeg } from '@/lib/trip-format';
import { airportLabel } from '@/lib/airports';

/**
 * Every detail of a trip: route, each leg's date and time, passengers and
 * special requests. Used wherever a trip that is being booked is shown.
 * Works in server and client components (no hooks).
 */
export function TripDetails({
  legs,
  passengerCount,
  notes,
  title,
  compact = false,
}: {
  legs: TripLeg[];
  passengerCount: number;
  notes: string | null;
  title?: string;
  /** Tighter spacing for list cards. */
  compact?: boolean;
}) {
  const pending = <span className="text-ink-subtle">Not set</span>;
  const route = legs.length === 0
    ? ''
    : [...legs.map(l => l.from), legs[legs.length - 1].to].map(code => (code ? airportLabel(code) : '…')).join(' → ');

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {title && <p className="text-overline text-ink-muted">{title}</p>}
      <p className={`text-ink tabular-nums ${compact ? 'text-heading' : 'text-title'}`}>{route}</p>

      <ol className={compact ? 'space-y-1' : 'space-y-2'}>
        {legs.map((leg, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-body">
            <span className="text-ink-muted w-12 shrink-0">Leg {i + 1}</span>
            <span className="text-ink tabular-nums">
              {leg.from || '…'} → {leg.to || '…'}
            </span>
            <span className="text-ink">{formatTripDate(leg.date) || pending}</span>
            <span className="text-ink-muted">{formatTripTime(leg.time) || 'Any time'}</span>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-body">
        <dt className="text-ink-muted">Guests</dt>
        <dd className="text-ink">{passengerCount}</dd>
        <dt className="text-ink-muted">Special requests</dt>
        <dd className="text-ink break-words">{notes?.trim() ? notes : <span className="text-ink-subtle">None</span>}</dd>
      </dl>
    </div>
  );
}
