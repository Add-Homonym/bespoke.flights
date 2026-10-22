import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * A labelled checkbox with a 44px touch target. The real input fills the
 * 44px square and is invisible; a 24px box drawn over it shows the state.
 */
export function Checkbox({ label, children, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; children?: ReactNode }) {
  return (
    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-1 ${className}`}>
      <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
        <input type="checkbox" className="peer absolute inset-0 size-full cursor-pointer opacity-0" {...props} />
        <span
          aria-hidden="true"
          className="pointer-events-none flex size-6 items-center justify-center rounded-sm border border-border-control bg-surface-raised text-on-royal
            peer-checked:border-royal peer-checked:bg-royal peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus
            peer-disabled:opacity-40 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
        >
          <Check size={16} strokeWidth={2} />
        </span>
      </span>
      <span className="text-body text-ink">{label}</span>
      {children}
    </label>
  );
}
