'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';

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

/** Special requests: free text in the same raised field style. */
export function RequestsField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const id = useId();
  return (
    <div className="field-card rounded-md border border-border-control bg-surface-raised">
      <div className="field-cell rounded-md px-4 py-3">
        <label htmlFor={id} className="block text-label text-ink-muted">Anything operators should know</label>
        <textarea
          id={id}
          rows={3}
          maxLength={MAX_REQUEST_CHARS}
          value={value}
          placeholder="Pets, luggage, catering, accessibility"
          onChange={e => onChange(e.target.value)}
          aria-describedby={`${id}-count`}
          className="mt-1 block w-full resize-y bg-transparent text-body text-ink placeholder:text-ink-subtle"
        />
        <p id={`${id}-count`} className="text-right text-[13px] leading-[18px] text-ink-subtle tabular-nums">
          {value.length}/{MAX_REQUEST_CHARS}
        </p>
      </div>
    </div>
  );
}
