'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const fieldClasses =
  'block h-12 w-full rounded-md border border-border-control bg-surface-raised px-4 text-body text-ink ' +
  'placeholder:text-ink-subtle transition-colors duration-200 ease-out';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const generated = useId();
    const inputId = id || generated;
    const errorId = `${inputId}-error`;
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={inputId} className="block text-label text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${fieldClasses} ${error ? 'border-danger' : ''} ${className}`}
          {...props}
        />
        {error && <p id={errorId} className="text-label text-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
