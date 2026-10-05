'use client';

import { useId, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { findAirport, searchAirports } from '@/lib/airports';

interface AirportFieldProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  required?: boolean;
}

/**
 * One airport input. The text is the value: it holds whatever was typed
 * (upper-cased) until an airport is chosen, then its ICAO code. Accepts city,
 * airport name, IATA or ICAO.
 */
function AirportField({ label, value, onChange, readOnly, required }: AirportFieldProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const results = open && !readOnly ? searchAirports(value) : [];
  const expanded = results.length > 0;
  const resolved = findAirport(value);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (!expanded) {
      return;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      choose(results[highlight].icao);
    }
  };

  // Leaving the field settles what was typed on a single airport when it is unambiguous.
  const onBlur = () => {
    setOpen(false);
    if (readOnly || !value) return;
    const match = findAirport(value) ?? (searchAirports(value).length === 1 ? searchAirports(value)[0] : undefined);
    if (match && match.icao !== value) onChange(match.icao);
  };

  return (
    <div className="relative px-4 py-3 pr-16">
      <label htmlFor={id} className="block text-label text-ink-muted">{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded && highlight >= 0 ? `${id}-opt-${highlight}` : undefined}
        value={value}
        readOnly={readOnly}
        required={required}
        autoComplete="off"
        placeholder="City, airport or code"
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`block w-full bg-transparent text-title text-ink placeholder:text-ink-subtle ${readOnly ? 'opacity-70' : ''}`}
      />
      <p className="min-h-[18px] text-[13px] leading-[18px] text-ink-muted">
        {resolved ? `${resolved.iata} · ${resolved.name}` : ''}
      </p>

      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} airports`}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-hairline bg-surface-raised shadow-float"
        >
          {results.map((airport, i) => (
            <li
              key={airport.icao}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(airport.icao)}
              onMouseEnter={() => setHighlight(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 ${i === highlight ? 'bg-surface-sunken' : ''}`}
            >
              <span className="w-12 shrink-0 text-label text-ink tabular-nums">{airport.iata}</span>
              <span className="min-w-0">
                <span className="block truncate text-body text-ink">{airport.name}</span>
                <span className="block truncate text-label text-ink-muted">{airport.city}, {airport.country}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Origin and destination in one raised card, with a swap button on the
 * divider. When `originLocked` the origin is fixed (a later leg departs where
 * the last one landed) and swapping is unavailable.
 */
export function RouteField({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSwap,
  originLocked = false,
}: {
  origin: string;
  destination: string;
  onOriginChange: (code: string) => void;
  onDestinationChange: (code: string) => void;
  onSwap: () => void;
  originLocked?: boolean;
}) {
  return (
    <div className="relative rounded-md border border-border-control bg-surface-raised">
      <AirportField label="From" value={origin} onChange={onOriginChange} readOnly={originLocked} required />
      <div className="border-t border-hairline" />
      <AirportField label="To" value={destination} onChange={onDestinationChange} required />
      <button
        type="button"
        aria-label="Swap origin and destination"
        disabled={originLocked}
        onClick={onSwap}
        className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-pill border border-border-control bg-surface-raised text-ink transition-colors duration-200 ease-out hover:bg-surface-sunken cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 after:absolute after:-inset-0.5 after:content-['']"
      >
        <ArrowUpDown size={24} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
