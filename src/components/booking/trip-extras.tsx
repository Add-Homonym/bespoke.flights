'use client';

import { useId, useRef, useState } from 'react';
import { Check, Minus, Pencil, Plus, X } from 'lucide-react';
import { MAX_CUSTOM_REQUEST_CHARS, MAX_CUSTOM_REQUESTS, REQUEST_TAGS, normalizeCustom, type RequestTagId } from '@/lib/bookings/request-tags';

/** Sanity bound only; large groups are split across aircraft by the operator. */
export const MAX_GUESTS = 999;
/** Above this, one business jet is unlikely to carry the group. */
export const ONE_AIRCRAFT_GUESTS = 19;

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
            value={value}
            onChange={e => onChange(clamp(Number(e.target.value)))}
            className="block w-full bg-transparent text-title text-ink tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <p className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">
            {value > ONE_AIRCRAFT_GUESTS ? 'Operators can split a large group across aircraft.' : ''}
          </p>
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

/** Shared pill shape for every special-request chip. */
const chipBase = 'inline-flex min-h-11 items-center rounded-pill border text-label transition-colors duration-200 ease-out';
const chipOn = 'border-royal bg-royal text-on-royal';
const chipOff = 'border-border-control bg-surface-raised text-ink hover:bg-surface-sunken';

/**
 * Special requests as chips: preset tags to toggle, the traveler's own
 * requests as editable chips, and an "Add your own" chip that becomes a text
 * field. Enter or leaving the field saves; Esc cancels; an emptied chip is removed.
 */
export function RequestsField({
  tags,
  onTagsChange,
  custom,
  onCustomChange,
}: {
  tags: RequestTagId[];
  onTagsChange: (tags: RequestTagId[]) => void;
  custom: string[];
  onCustomChange: (custom: string[]) => void;
}) {
  const hintId = useId();
  /** Index of the custom chip being edited, 'new' for the add field, or null. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [text, setText] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const skipBlur = useRef(false);

  const toggle = (tag: RequestTagId) =>
    onTagsChange(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);

  const startEdit = (target: number | 'new') => {
    // Enter/Esc unmount the field without a blur event, so clear the flag here.
    skipBlur.current = false;
    setText(target === 'new' ? '' : custom[target]);
    setEditing(target);
  };

  /** Save the field. `refocus` returns focus to a chip after a keyboard save. */
  const commit = (refocus: boolean) => {
    if (editing === null) return;
    const value = text.trim();
    let next = [...custom];
    let focusIndex: number | 'add' = 'add';
    if (editing === 'new') {
      if (value) next.push(value);
    } else if (value) {
      next[editing] = value;
      focusIndex = editing;
    } else {
      next.splice(editing, 1);
    }
    next = normalizeCustom(next);
    onCustomChange(next);
    setEditing(null);
    setText('');
    if (refocus) {
      requestAnimationFrame(() => {
        const target = focusIndex === 'add' ? addRef.current : chipRefs.current[Math.min(focusIndex, next.length - 1)];
        (target ?? addRef.current)?.focus();
      });
    }
  };

  const cancel = () => {
    const was = editing;
    setEditing(null);
    setText('');
    requestAnimationFrame(() => (typeof was === 'number' ? chipRefs.current[was] : addRef.current)?.focus());
  };

  const remove = (index: number) => {
    onCustomChange(custom.filter((_, i) => i !== index));
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const field = (
    <span className={`chip-field ${chipBase} border-royal bg-surface-raised px-4`}>
      <input
        id={editing === 'new' ? 'request-custom-new' : `request-custom-${editing}-input`}
        autoFocus
        type="text"
        value={text}
        maxLength={MAX_CUSTOM_REQUEST_CHARS}
        size={Math.min(48, Math.max(18, text.length + 2))}
        placeholder="Describe your request"
        aria-label={editing === 'new' ? 'Your own request' : 'Edit request'}
        aria-describedby={hintId}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); skipBlur.current = true; commit(true); }
          else if (e.key === 'Escape') { e.preventDefault(); skipBlur.current = true; cancel(); }
        }}
        onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } commit(false); }}
        className="min-w-0 max-w-full bg-transparent text-label text-ink placeholder:text-ink-subtle"
      />
    </span>
  );

  return (
    <div className="space-y-3">
      <div id="request-tags" role="group" aria-label="Special requests" className="flex flex-wrap gap-2">
        {REQUEST_TAGS.map(tag => {
          const on = tags.includes(tag.id);
          return (
            <button
              key={tag.id}
              id={`request-tag-${tag.id}`}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag.id)}
              className={`${chipBase} gap-1.5 px-4 cursor-pointer ${on ? chipOn : chipOff}`}
            >
              {on
                ? <Check size={14} strokeWidth={2} aria-hidden="true" />
                : <Plus size={14} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />}
              {tag.label}
            </button>
          );
        })}

        {custom.map((entry, i) =>
          editing === i ? (
            <span key={`edit-${i}`} id={`request-custom-${i}`}>{field}</span>
          ) : (
            <span key={entry} id={`request-custom-${i}`} className={`${chipBase} ${chipOn} pl-1`}>
              <button
                ref={el => { chipRefs.current[i] = el; }}
                type="button"
                onClick={() => startEdit(i)}
                aria-label={`Edit request: ${entry}`}
                title={entry}
                className="inline-flex min-h-11 max-w-[min(32rem,70vw)] items-center gap-1.5 rounded-pill px-3 cursor-pointer"
              >
                <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">{entry}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove request: ${entry}`}
                className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill hover:bg-on-royal/15 cursor-pointer"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ),
        )}

        {editing === 'new'
          ? field
          : custom.length < MAX_CUSTOM_REQUESTS && (
            <button
              ref={addRef}
              id="request-custom-add"
              type="button"
              onClick={() => startEdit('new')}
              className={`${chipBase} gap-1.5 border-dashed border-border-control px-4 text-ink-muted hover:bg-surface-sunken hover:text-ink cursor-pointer`}
            >
              <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
              Add your own
            </button>
          )}
      </div>
      <p id={hintId} className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">
        {editing !== null
          ? 'Press Enter to save, Esc to cancel.'
          : custom.length
            ? 'Select a request to edit it.'
            : 'Choose any that apply, or add your own.'}
      </p>
    </div>
  );
}
