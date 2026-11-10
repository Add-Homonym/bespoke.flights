'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessModelForm } from '@/components/admin/business-model-form';
import type { BusinessModel } from '@/lib/business-model';

/**
 * Admin-only "Edit" control on the operator terms page. Opens the business
 * model form in place; a save re-renders the page from the server so the
 * figures in the terms update immediately.
 */
export function BusinessModelEditor({ initial, applied }: { initial: BusinessModel; applied: (keyof BusinessModel)[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="business-model-editor">
        <Pencil size={16} strokeWidth={1.5} aria-hidden /> Edit terms
      </Button>
    );
  }

  return (
    <section id="business-model-editor" aria-label="Edit business model" className="rounded-lg border border-royal bg-surface-sunken p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-heading text-ink">Admin: edit the business model</p>
          <p className="text-label text-ink-muted">Saving updates the figures on this page and the rates applied at checkout.</p>
        </div>
        <Button variant="quiet" size="sm" onClick={() => setOpen(false)} aria-label="Close editor">
          <X size={16} strokeWidth={1.5} aria-hidden /> Close
        </Button>
      </div>
      <BusinessModelForm initial={initial} applied={applied} onSaved={() => router.refresh()} />
    </section>
  );
}
