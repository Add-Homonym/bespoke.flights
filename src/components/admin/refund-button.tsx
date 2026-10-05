'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RefundButton({ paymentId, remainingCents }: { paymentId: number; remainingCents: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > remainingCents) {
      setError(`Enter an amount up to ${(remainingCents / 100).toFixed(2)}`);
      return;
    }
    if (!confirm(`Refund ${(amountCents / 100).toFixed(2)}? This cannot be undone.`)) return;

    setLoading(true);
    setError('');
    const res = await fetch(`/api/admin/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents, reason: reason || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Refund failed');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Refund</Button>;
  }

  return (
    <div className="flex flex-col gap-2 min-w-48">
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        className="rounded border border-hairline bg-surface-raised px-2 py-1 text-ink text-sm"
        aria-label="Refund amount"
      />
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded border border-hairline bg-surface-raised px-2 py-1 text-ink text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} disabled={loading}>Confirm</Button>
        <Button size="sm" variant="quiet" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
