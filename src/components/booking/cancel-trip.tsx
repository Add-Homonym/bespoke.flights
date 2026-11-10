'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { readApiFailure } from '@/lib/api/form-errors';
import { cancelBanner } from '@/lib/bookings/cancel-text';

export interface CancelPreview {
  tier: 'full' | 'partial' | 'none';
  refund: string;
  paid: string;
  hoursBeforeDeparture: number;
  policyText: string;
  operatorCompany: string;
}

/**
 * "Cancel trip": a secondary button that opens an inline confirmation panel.
 * For paid bookings the panel shows the refund under the operator's policy;
 * for unpaid requests it simply withdraws the request.
 */
export function CancelTrip({ requestId, preview }: { requestId: number; preview: CancelPreview | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ headline: string; detail?: string } | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError('');
    const res = preview
      ? await fetch(`/api/booking-requests/${requestId}/cancel`, { method: 'POST' })
      : await fetch(`/api/booking-requests/${requestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
    setBusy(false);
    if (!res.ok) {
      setError((await readApiFailure(res, 'Could not cancel the trip.')).message);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setDone(preview ? cancelBanner(data) : { headline: 'Request cancelled.' });
    router.refresh();
  };

  if (done) {
    return (
      <Notice tone="info" className="mb-8">
        <span className="block">{done.headline}</span>
        {done.detail && <span className="mt-1 block text-label">{done.detail}</span>}
      </Notice>
    );
  }

  if (!open) {
    return (
      <div className="mb-8 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Cancel trip</Button>
      </div>
    );
  }

  return (
    <Card className="mb-8 space-y-4" role="region" aria-label="Cancel trip">
      <h2 className="text-title text-ink">Cancel this trip</h2>
      {preview ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
            <dt className="text-ink-muted">Paid</dt>
            <dd className="text-ink tabular-nums">{preview.paid}</dd>
            <dt className="text-ink-muted">Refund now</dt>
            <dd className="text-ink tabular-nums">
              {preview.refund}
              <span className="text-ink-muted"> · {preview.tier === 'full' ? 'full refund' : preview.tier === 'partial' ? 'partial refund' : 'no refund'}</span>
            </dd>
            <dt className="text-ink-muted">Departure in</dt>
            <dd className="text-ink tabular-nums">{preview.hoursBeforeDeparture} hours</dd>
          </dl>
          <p className="text-label text-ink-muted">{preview.operatorCompany} policy: {preview.policyText}</p>
          <p className="text-body text-ink-muted">The refund goes back to your original payment method. The operator is told at once.</p>
        </>
      ) : (
        <p className="text-body text-ink-muted">Your request is withdrawn and any open quotes are declined. Nothing has been charged.</p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={confirm} disabled={busy}>Confirm cancellation</Button>
        <Button variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={busy}>Keep trip</Button>
      </div>
    </Card>
  );
}
