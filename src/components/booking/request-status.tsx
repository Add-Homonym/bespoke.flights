import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';

const requestStatus: Record<string, { variant: StatusVariant; label: string }> = {
  open: { variant: 'warning', label: 'Awaiting quotes' },
  quoted: { variant: 'neutral', label: 'Quotes ready' },
  booked: { variant: 'confirmed', label: 'Booked' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  completed: { variant: 'neutral', label: 'Completed' },
};

/** Status of a booking request, as a word plus an icon. */
export function RequestStatusBadge({ status, emptyLeg = false }: { status: string; /** Booked from an empty-leg listing: held until paid. */ emptyLeg?: boolean }) {
  const { variant, label } = emptyLeg && (status === 'open' || status === 'quoted')
    ? { variant: 'warning' as const, label: 'Awaiting payment' }
    : requestStatus[status] ?? { variant: 'neutral' as const, label: status };
  return <StatusBadge variant={variant}>{label}</StatusBadge>;
}
