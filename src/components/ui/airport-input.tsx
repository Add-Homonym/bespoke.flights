'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchAirports, type Airport } from '@/lib/airports';

interface AirportInputProps {
  label?: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function AirportInput({
  label,
  value,
  onChange,
  placeholder = 'Search airport...',
  required,
  readOnly,
  className = '',
}: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Airport[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.length >= 1) {
      const matches = searchAirports(q);
      setResults(matches);
      setIsOpen(matches.length > 0);
      setHighlightIndex(-1);
    } else {
      setResults([]);
      setIsOpen(false);
    }
    // Also update the parent with the raw text (so it works if they type an ICAO directly)
    onChange(q.toUpperCase());
  }, [onChange]);

  const selectAirport = useCallback((airport: Airport) => {
    setQuery(airport.icao);
    onChange(airport.icao);
    setIsOpen(false);
    setResults([]);
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectAirport(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-brand-muted">{label}</label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => handleSearch(e.target.value)}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        maxLength={4}
        autoComplete="off"
        className={`w-full rounded-lg border border-brand-border bg-brand-navy px-4 py-2.5 text-brand-cream placeholder:text-brand-muted/50 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors uppercase ${readOnly ? 'opacity-60' : ''} ${className}`}
      />

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-brand-border bg-brand-navy shadow-xl shadow-black/30 overflow-hidden max-h-64 overflow-y-auto">
          {results.map((airport, i) => (
            <button
              key={`${airport.icao}-${i}`}
              type="button"
              onClick={() => selectAirport(airport)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors cursor-pointer ${
                i === highlightIndex
                  ? 'bg-brand-gold/10'
                  : 'hover:bg-brand-slate/50'
              }`}
            >
              <span className="font-mono text-brand-gold text-sm font-semibold shrink-0 w-10 pt-0.5">
                {airport.icao}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-brand-cream text-sm truncate">{airport.name}</p>
                <p className="text-brand-muted text-xs truncate">
                  {airport.city}, {airport.country}
                  {airport.iata !== airport.icao.slice(1) && (
                    <span className="ml-1 text-brand-muted/50">({airport.iata})</span>
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
