'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Calculator } from 'lucide-react';
import { readApiFailure, summaryLine } from '@/lib/api/form-errors';
import { QuoteWorksheet } from '@/components/booking/quote-worksheet';
import { FIELD_LABELS, type QuoteLeg } from '@/components/booking/submit-quote-form';
import { defaultWorksheet, type WorksheetInputs } from '@/lib/quotes/worksheet';
import type { Aircraft } from '@/lib/types';

/** Operator controls on a pending quote: revise it or withdraw it. */
export function ManageQuote({
  quoteId, aircraft, priceCents, message, validUntil, aircraftId, legs, passengerCount,
}: {
  quoteId: number;
  legs: QuoteLeg[];
  passengerCount: number;
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
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState('');
  const [sheet, setSheet] = useState<WorksheetInputs | null>(null);
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const [sheetChanged, setSheetChanged] = useState(false);

  /** Open the revise form with the saved private worksheet, or a fresh one. */
  const startRevise = async () => {
    setMode('revise');
    if (sheetLoaded) return;
    const res = await fetch(`/api/quotes/${quoteId}/worksheet`).catch(() => null);
    const saved = res?.ok ? ((await res.json()) as WorksheetInputs) : null;
    const a = aircraft.find(x => x.id === aircraftId) ?? null;
    setSheet(saved ?? defaultWorksheet({
      legs: legs.map(l => ({ origin: l.origin_code, dest: l.dest_code, date: l.departure_date })),
      passengers: passengerCount,
      aircraft: a,
    }));
    setSheetLoaded(true);
  };

  const patch = async (body: unknown) => {
    setBusy(true);
    setError('');
    setFields({});
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const failure = await readApiFailure(res, 'Could not update the quote.');
      setFields(failure.fields);
      setError(Object.keys(failure.fields).length ? summaryLine(failure.fields, FIELD_LABELS) : failure.message);
      return false;
    }
    return true;
  };

  const revise = async () => {
    const cents = Math.round(Number(price) * 100);
    if (!Number.isFinite(cents) || cents < 50) { setFields({ priceCents: 'Enter a price of at least $0.50' }); setError('Fix 1 field: Price.'); return; }
    const body: Record<string, unknown> = { priceCents: cents };
    if (note.trim() !== (message ?? '')) body.message = note.trim();
    if (until && until !== validUntil) body.validUntil = until;
    if (plane && Number(plane) !== aircraftId) body.aircraftId = Number(plane);
    if (sheet && sheetChanged) body.worksheet = { ...sheet, aircraftId: plane ? Number(plane) : aircraftId };
    if (await patch(body)) { setDone('Quote revised. The traveler has been emailed.'); setMode('idle'); router.refresh(); }
  };

  const withdraw = async () => {
    if (await patch({ status: 'withdrawn' })) { setDone('Quote withdrawn. You can submit a new one.'); setMode('idle'); router.refresh(); }
  };

  if (done) return <Notice tone="info" className="mt-4">{done}</Notice>;

  if (mode === 'idle') {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={startRevise}>Revise quote</Button>
        <Button variant="quiet" size="sm" onClick={() => setMode('withdraw')}>Withdraw quote</Button>
      </div>
    );
  }

  if (mode === 'withdraw') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-body text-ink-muted">The traveler is told the quote is withdrawn. You can quote again afterwards.</p>
        {error && <Notice tone="danger">{error}</Notice>}
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
        <Input label="All-in price (USD)" type="number" step="0.01" min="0.50" value={price} onChange={e => setPrice(e.target.value)} error={fields.priceCents} />
        <Input label="Valid until" type="date" value={until} onChange={e => setUntil(e.target.value)} error={fields.validUntil} />
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
      {sheet && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-label text-royal hover:underline underline-offset-4">
            <Calculator size={16} strokeWidth={1.5} aria-hidden="true" /> Price worksheet (private)
          </summary>
          <div className="mt-3">
            <QuoteWorksheet id={`revise-${quoteId}-worksheet`} value={sheet}
              onChange={w => { setSheet(w); setSheetChanged(true); }}
              cruiseKtas={aircraft.find(a => a.id === (plane ? Number(plane) : aircraftId))?.cruise_ktas}
              onUse={c => { setPrice((c / 100).toFixed(2)); setSheetChanged(true); }} />
          </div>
        </details>
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
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={revise} disabled={busy}>Save revision</Button>
        <Button variant="quiet" size="sm" onClick={() => setMode('idle')} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
