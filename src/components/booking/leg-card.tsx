'use client';

import { Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteField } from '@/components/ui/route-field';
import { ScheduleField } from '@/components/ui/schedule-field';
import { airportLabel } from '@/lib/airports';
import { formatLandUnits, formatNm, legDistance } from '@/lib/distance';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import type { DraftLeg } from '@/lib/bookings/draft';

/** A leg is set once it has two different airports and a date. */
export function legIsComplete(leg: DraftLeg): boolean {
  return leg.originCode.length >= 3 && leg.destCode.length >= 3 && leg.originCode !== leg.destCode && /^\d{4}-\d{2}-\d{2}$/.test(leg.departureDate);
}

/** Why a leg cannot be set yet, or '' when it can. */
function incompleteReason(leg: DraftLeg): string {
  if (!leg.originCode || !leg.destCode) return 'Choose where this leg departs and lands.';
  if (leg.originCode === leg.destCode) return 'Origin and destination are the same airport.';
  if (!leg.departureDate) return 'Choose a date for this leg.';
  return '';
}

/** Distance for a leg, or a short note when it cannot be computed. */
function DistanceLine({ id, leg, compact = false }: { id: string; leg: DraftLeg; compact?: boolean }) {
  if (!leg.originCode || !leg.destCode) return null;
  const d = legDistance(leg.originCode, leg.destCode);
  if (!d) {
    return (
      <p id={id} className="text-label text-ink-muted">
        Distance appears once both airports are chosen from the list.
      </p>
    );
  }
  if (compact) {
    return (
      <p id={id} className="text-label text-ink-muted tabular-nums">
        <span className="text-ink">{formatNm(d)}</span> · {formatLandUnits(d)}
      </p>
    );
  }
  return (
    <div id={id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md bg-surface-raised px-4 py-3" aria-live="polite">
      <span className="text-overline text-ink-muted">Distance</span>
      <span className="tabular-nums">
        <span className="text-heading text-ink">{formatNm(d)}</span>
        <span className="text-label text-ink-muted"> · {formatLandUnits(d)}</span>
      </span>
      <span className="w-full text-label text-ink-subtle">Great-circle distance. The flown route is usually a few percent longer.</span>
    </div>
  );
}

export function LegCard({
  index,
  leg,
  editing,
  wasSet,
  legCount,
  isLast,
  onChange,
  onSwap,
  onDone,
  onEdit,
  onCancel,
  onDiscard,
  onAddLeg,
}: {
  index: number;
  leg: DraftLeg;
  /** Fields open for editing; otherwise the leg shows as a summary. */
  editing: boolean;
  /** The leg was set before this edit began, so its changes can be discarded. */
  wasSet: boolean;
  legCount: number;
  isLast: boolean;
  onChange: (field: keyof DraftLeg, value: string) => void;
  onSwap: () => void;
  onDone: () => void;
  onEdit: () => void;
  /** Remove the leg, or clear it when it is the only one. */
  onCancel: () => void;
  onDiscard: () => void;
  onAddLeg: () => void;
}) {
  const n = index + 1;
  const base = `leg-${n}`;
  const complete = legIsComplete(leg);
  const cancelLabel = legCount > 1 ? 'Cancel leg' : 'Clear leg';

  const addLeg = isLast && (
    <Button id="add-leg" type="button" variant="secondary" size="sm" onClick={onAddLeg}>
      <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
      Add a leg
    </Button>
  );

  return (
    <div
      id={base}
      role="group"
      aria-labelledby={`${base}-title`}
      className="space-y-4 rounded-lg border border-hairline bg-surface-sunken p-4"
    >
      <div id={`${base}-header`} className="flex items-center justify-between gap-3">
        <h3 id={`${base}-title`} className="text-heading text-ink">
          Leg {n}
          {!editing && <span className="sr-only">: {airportLabel(leg.originCode)} to {airportLabel(leg.destCode)}</span>}
        </h3>
        {!editing && (
          <div id={`${base}-controls`} className="flex items-center gap-1">
            <Button id={`${base}-edit`} type="button" variant="quiet" size="sm" onClick={onEdit} aria-label={`Edit leg ${n}`}>
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
              Edit
            </Button>
            <Button id={`${base}-cancel`} type="button" variant="quiet" size="sm" onClick={onCancel} aria-label={`${cancelLabel} ${n}`}>
              <X size={16} strokeWidth={1.5} aria-hidden="true" />
              {cancelLabel}
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <div id={`${base}-route`}>
            <RouteField
              origin={leg.originCode}
              destination={leg.destCode}
              onOriginChange={val => onChange('originCode', val)}
              onDestinationChange={val => onChange('destCode', val)}
              onSwap={onSwap}
              originLocked={index > 0}
            />
          </div>

          <div id={`${base}-schedule`}>
            <ScheduleField
              idPrefix={base}
              date={leg.departureDate}
              time={leg.departureTime}
              onDateChange={v => onChange('departureDate', v)}
              onTimeChange={v => onChange('departureTime', v)}
            />
          </div>

          <DistanceLine id={`${base}-distance`} leg={leg} />

          <div id={`${base}-actions`} className="flex flex-wrap items-center justify-end gap-2">
            {!complete && (
              <p id={`${base}-hint`} className="mr-auto text-label text-ink-muted">{incompleteReason(leg)}</p>
            )}
            {wasSet && (
              <Button id={`${base}-discard`} type="button" variant="quiet" size="sm" onClick={onDiscard}>
                Discard changes
              </Button>
            )}
            {(legCount > 1 || leg.originCode || leg.destCode || leg.departureDate) && (
              <Button id={`${base}-cancel`} type="button" variant="quiet" size="sm" onClick={onCancel} aria-label={`${cancelLabel} ${n}`}>
                {cancelLabel}
              </Button>
            )}
            <Button
              id={`${base}-done`}
              type="button"
              variant="secondary"
              size="sm"
              onClick={onDone}
              disabled={!complete}
              aria-describedby={!complete ? `${base}-hint` : undefined}
            >
              <Check size={18} strokeWidth={1.5} aria-hidden="true" />
              {wasSet ? 'Save leg' : 'Set leg'}
            </Button>
            {addLeg}
          </div>
        </>
      ) : (
        <div id={`${base}-summary`} className="space-y-3">
          <p className="text-body text-ink">
            {airportLabel(leg.originCode)} <span aria-hidden="true">→</span><span className="sr-only">to</span> {airportLabel(leg.destCode)}
          </p>
          <p className="text-label text-ink-muted">
            {formatTripDate(leg.departureDate)} · {formatTripTime(leg.departureTime) || 'Any time'}
          </p>
          <DistanceLine id={`${base}-distance`} leg={leg} compact />
          {addLeg && <div id={`${base}-actions`} className="flex justify-end">{addLeg}</div>}
        </div>
      )}
    </div>
  );
}
