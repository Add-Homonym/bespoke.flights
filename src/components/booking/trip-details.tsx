import { formatTripDate, formatTripTime, tripRoute, type TripLeg } from '@/lib/trip-format';

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
  const pending = <span className="text-brand-muted/60">Not set</span>;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {title && <p className="text-xs text-brand-muted uppercase tracking-wider">{title}</p>}
      <p className={`text-brand-cream font-mono tracking-wide ${compact ? 'text-base' : 'text-lg'}`}>{tripRoute(legs)}</p>

      <ol className={compact ? 'space-y-1' : 'space-y-2'}>
        {legs.map((leg, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
            <span className="text-brand-muted w-12 shrink-0">Leg {i + 1}</span>
            <span className="text-brand-cream font-mono">
              {leg.from || '…'} → {leg.to || '…'}
            </span>
            <span className="text-brand-cream">{formatTripDate(leg.date) || pending}</span>
            <span className="text-brand-muted">{formatTripTime(leg.time) || 'Any time'}</span>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-brand-muted">Passengers</dt>
        <dd className="text-brand-cream">{passengerCount}</dd>
        <dt className="text-brand-muted">Special requests</dt>
        <dd className="text-brand-cream break-words">{notes?.trim() ? notes : <span className="text-brand-muted/60">None</span>}</dd>
      </dl>
    </div>
  );
}
