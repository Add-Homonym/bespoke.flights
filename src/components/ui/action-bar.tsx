import type { ReactNode } from 'react';

/**
 * Fixed bottom bar: the running total on the left, one primary action on the
 * right. The amount is a live region so a changing total is announced.
 * Pages that use it need bottom padding (pb-28) so content is not covered.
 */
export function ActionBar({
  amount,
  label = 'Total, all-in',
  children,
}: {
  amount: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--space-4)+env(safe-area-inset-bottom))] z-40 px-4 print:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-pill border border-hairline bg-surface-raised py-2 pl-6 pr-2 shadow-float">
        <div className="min-w-0">
          <p className="text-label text-ink-muted">{label}</p>
          <p aria-live="polite" className="text-[20px] leading-6 font-medium tabular-nums text-ink">{amount}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
