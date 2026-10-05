import type { ReactNode } from 'react';
import { StatusBadge, type StatusVariant } from './status-badge';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'gold';

// Legacy variant names used by the operator and admin pages.
const map: Record<BadgeVariant, StatusVariant> = {
  default: 'neutral',
  success: 'confirmed',
  warning: 'warning',
  error: 'danger',
  gold: 'neutral',
};

export function Badge({
  variant = 'default',
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return <StatusBadge variant={map[variant]} className={className}>{children}</StatusBadge>;
}
