'use client';

import { useId } from 'react';
import { formatTripDate } from '@/lib/trip-format';

/**
 * Date and departure time in one raised card, with the same typography as
 * RouteField: label inside the card, value in the title style, a helper line
 * underneath. Side by side from `sm`, stacked on phones.
 */
export function ScheduleField({
  date,
  time,
  onDateChange,
  onTimeChange,
  idPrefix,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  /** Prefix for element ids, e.g. "leg-1". */
  idPrefix?: string;
}) {
  const id = useId();
  const dateId = idPrefix ? `${idPrefix}-date` : `${id}-date`;
  const timeId = idPrefix ? `${idPrefix}-time` : `${id}-time`;

  return (
    <div className="grid grid-cols-1 rounded-md border border-border-control bg-surface-raised sm:grid-cols-2">
      <div className="px-4 py-3">
        <label htmlFor={dateId} className="block text-label text-ink-muted">Date</label>
        <input
          id={dateId}
          type="date"
          value={date}
          data-empty={!date}
          required
          onChange={e => onDateChange(e.target.value)}
          className="schedule-input block w-full bg-transparent text-title"
        />
        <p className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">{formatTripDate(date)}</p>
      </div>
      <div className="border-t border-hairline px-4 py-3 sm:border-l sm:border-t-0">
        <label htmlFor={timeId} className="block text-label text-ink-muted">Departure time (local)</label>
        <input
          id={timeId}
          type="time"
          value={time}
          data-empty={!time}
          onChange={e => onTimeChange(e.target.value)}
          className="schedule-input block w-full bg-transparent text-title"
        />
        <p className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">
          {time ? 'At the departure airport' : 'Optional. Leave blank for any time.'}
        </p>
      </div>
    </div>
  );
}
