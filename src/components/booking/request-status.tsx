import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';

const requestStatus: Record<string, { variant: StatusVariant; label: string }> = {
  open: { variant: 'warning', label: 'Awaiting quotes' },
  quoted: { variant: 'neutral', label: 'Quotes ready' },
  booked: { variant: 'confirmed', label: 'Booked' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  completed: { variant: 'neutral', label: 'Completed' },
};

/** Status of a booking request, as a word plus an icon. */
export function RequestStatusBadge({ status }: { status: string }) {
  const { variant, label } = requestStatus[status] ?? { variant: 'neutral' as const, label: status };
  return <StatusBadge variant={variant}>{label}</StatusBadge>;
}
