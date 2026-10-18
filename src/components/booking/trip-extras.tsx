'use client';

import { useId } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { REQUEST_TAGS, type RequestTagId } from '@/lib/bookings/request-tags';

export const MAX_GUESTS = 19;
export const MAX_REQUEST_CHARS = 500;

const stepButton =
  'relative flex size-11 shrink-0 items-center justify-center rounded-pill border border-border-control text-ink ' +
  'transition-colors duration-200 ease-out hover:bg-surface-sunken cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

/** Guests: a stepper in the same raised field style as the route. */
export function GuestsField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const id = useId();
  const clamp = (n: number) => Math.min(MAX_GUESTS, Math.max(1, Math.round(n) || 1));
  return (
    <div className="field-card rounded-md border border-border-control bg-surface-raised">
      <div className="field-cell flex items-center gap-4 rounded-md px-4 py-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-label text-ink-muted">Passengers</label>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GUESTS}
            value={value}
            onChange={e => onChange(clamp(Number(e.target.value)))}
            className="block w-full bg-transparent text-title text-ink tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <p className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">Up to {MAX_GUESTS} on one request</p>
        </div>
        <button type="button" className={stepButton} aria-label="Remove a passenger" onClick={() => onChange(clamp(value - 1))} disabled={value <= 1}>
          <Minus size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className={stepButton} aria-label="Add a passenger" onClick={() => onChange(clamp(value + 1))} disabled={value >= MAX_GUESTS}>
          <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Special requests: free text in the same raised field style, plus quick-add tags. */
export function RequestsField({
  value,
  onChange,
  tags,
  onTagsChange,
}: {
  value: string;
  onChange: (s: string) => void;
  tags: RequestTagId[];
  onTagsChange: (tags: RequestTagId[]) => void;
}) {
  const id = useId();
  const toggle = (tag: RequestTagId) =>
    onTagsChange(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);

  return (
    <div className="space-y-4">
      <div id="request-tags" role="group" aria-label="Common requests" className="flex flex-wrap gap-2">
        {REQUEST_TAGS.map(tag => {
          const on = tags.includes(tag.id);
          return (
            <button
              key={tag.id}
              id={`request-tag-${tag.id}`}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-label transition-colors duration-200 ease-out cursor-pointer ${
                on
                  ? 'border-royal bg-royal text-on-royal'
                  : 'border-border-control bg-surface-raised text-ink hover:bg-surface-sunken'
              }`}
            >
              {on
                ? <Check size={14} strokeWidth={2} aria-hidden="true" />
                : <Plus size={14} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />}
              {tag.label}
            </button>
          );
        })}
      </div>

      <div className="field-card rounded-md border border-border-control bg-surface-raised">
        <div className="field-cell rounded-md px-4 py-3">
          <label htmlFor={id} className="block text-label text-ink-muted">Details for operators</label>
          <textarea
            id={id}
            rows={3}
            maxLength={MAX_REQUEST_CHARS}
            value={value}
            placeholder={tags.length ? 'Add details, such as pet size or board count' : 'Anything else operators should know'}
            onChange={e => onChange(e.target.value)}
            aria-describedby={`${id}-count`}
            className="mt-1 block w-full resize-y bg-transparent text-body text-ink placeholder:text-ink-subtle"
          />
          <p id={`${id}-count`} className="text-right text-[13px] leading-[18px] text-ink-subtle tabular-nums">
            {value.length}/{MAX_REQUEST_CHARS}
          </p>
        </div>
      </div>
    </div>
  );
}
