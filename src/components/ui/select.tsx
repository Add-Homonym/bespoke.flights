'use client';

import { SelectHTMLAttributes, forwardRef, useId } from 'react';
import { fieldClasses } from './input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const generated = useId();
    const selectId = id || generated;
    const errorId = `${selectId}-error`;
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={selectId} className="block text-label text-ink-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${fieldClasses} ${error ? 'border-danger' : ''} ${className}`}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p id={errorId} className="text-label text-danger">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
