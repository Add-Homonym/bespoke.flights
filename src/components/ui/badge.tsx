type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'gold';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-brand-slate text-brand-muted',
  success: 'bg-brand-success/10 text-brand-success',
  warning: 'bg-brand-warning/10 text-brand-warning',
  error: 'bg-brand-error/10 text-brand-error',
  gold: 'bg-brand-gold/10 text-brand-gold',
};

export function Badge({
  variant = 'default',
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
