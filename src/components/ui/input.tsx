'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-brand-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-lg border border-brand-border bg-brand-navy px-4 py-2.5 text-brand-cream placeholder:text-brand-muted/50 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors ${error ? 'border-brand-error' : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-brand-error">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
