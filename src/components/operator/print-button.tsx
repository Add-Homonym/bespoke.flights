'use client';

import { Button } from '@/components/ui/button';

/** Opens the browser print dialog. The label says what is being printed. */
export function PrintButton({ label = 'Print trip sheet' }: { label?: string }) {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
