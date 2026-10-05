import type { ReactNode } from 'react';
import { Check, Clock, X } from 'lucide-react';

export type StatusVariant = 'confirmed' | 'warning' | 'danger' | 'neutral' | 'brass';

const styles: Record<StatusVariant, string> = {
  confirmed: 'bg-confirmed-tint text-confirmed',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-surface-sunken text-ink-muted',
  brass: 'bg-brass text-on-brass',
};

const icons = { confirmed: Check, warning: Clock, danger: X } as const;

/**
 * Status as a word plus an icon, never color alone. `icon` defaults on for
 * confirmed / warning / danger.
 */
export function StatusBadge({
  variant = 'neutral',
  icon,
  children,
  className = '',
}: {
  variant?: StatusVariant;
  icon?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Icon = variant in icons && icon !== false ? icons[variant as keyof typeof icons] : null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-overline ${styles[variant]} ${className}`}>
      {Icon && <Icon size={12} strokeWidth={1.5} aria-hidden="true" />}
      {children}
    </span>
  );
}
