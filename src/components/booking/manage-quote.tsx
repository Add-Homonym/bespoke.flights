'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import type { Aircraft } from '@/lib/types';

/** Operator controls on a pending quote: revise it or withdraw it. */
export function ManageQuote({
  quoteId, aircraft, priceCents, message, validUntil, aircraftId,
}: {
  quoteId: number;
  aircraft: Aircraft[];
  priceCents: number;
  message: string | null;
  validUntil: string | null;
  aircraftId: number | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'revise' | 'withdraw'>('idle');
  const [price, setPrice] = useState((priceCents / 100).toFixed(2));
  const [note, setNote] = useState(message ?? '');
  const [until, setUntil] = useState(validUntil ?? '');
  const [plane, setPlane] = useState(aircraftId ? String(aircraftId) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const patch = async (body: unknown) => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not update the quote.');
      return false;
    }
    return true;
  };

  const revise = async () => {
    const cents = Math.round(Number(price) * 100);
    if (!Number.isFinite(cents) || cents < 50) { setError('Enter a valid price.'); return; }
    const body: Record<string, unknown> = { priceCents: cents };
    if (note.trim() !== (message ?? '')) body.message = note.trim();
    if (until && until !== validUntil) body.validUntil = until;
    if (plane && Number(plane) !== aircraftId) body.aircraftId = Number(plane);
    if (await patch(body)) { setDone('Quote revised. The traveler has been emailed.'); setMode('idle'); router.refresh(); }
  };

  const withdraw = async () => {
    if (await patch({ status: 'withdrawn' })) { setDone('Quote withdrawn. You can submit a new one.'); setMode('idle'); router.refresh(); }
  };

  if (done) return <Notice tone="info" className="mt-4">{done}</Notice>;

  if (mode === 'idle') {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setMode('revise')}>Revise quote</Button>
        <Button variant="quiet" size="sm" onClick={() => setMode('withdraw')}>Withdraw quote</Button>
      </div>
    );
  }

  if (mode === 'withdraw') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-body text-ink-muted">The traveler is told the quote is withdrawn. You can quote again afterwards.</p>
        {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
        <div className="flex gap-2">
          <Button variant="danger" size="sm" onClick={withdraw} disabled={busy}>Confirm withdrawal</Button>
          <Button variant="quiet" size="sm" onClick={() => setMode('idle')} disabled={busy}>Keep quote</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 border-t border-hairline pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="All-in price (USD)" type="number" step="0.01" min="0.50" value={price} onChange={e => setPrice(e.target.value)} />
        <Input label="Valid until" type="date" value={until} onChange={e => setUntil(e.target.value)} />
      </div>
      {aircraft.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="revise-aircraft" className="block text-label text-ink-muted">Aircraft</label>
          <select
            id="revise-aircraft"
            value={plane}
            onChange={e => setPlane(e.target.value)}
            className="block h-12 w-full rounded-md border border-border-control bg-surface-raised px-4 text-body text-ink"
          >
            <option value="">Keep current</option>
            {aircraft.map(a => <option key={a.id} value={a.id}>{a.type} — {a.tail_number} ({a.capacity} seats)</option>)}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="revise-message" className="block text-label text-ink-muted">Message to traveler</label>
        <textarea
          id="revise-message"
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          className="block w-full rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink"
        />
      </div>
      {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={revise} disabled={busy}>Save revision</Button>
        <Button variant="quiet" size="sm" onClick={() => setMode('idle')} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
