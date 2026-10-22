'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, Calculator, ChevronDown, CircleAlert, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { readApiFailure, summaryLine } from '@/lib/api/form-errors';
import { QuoteWorksheet } from '@/components/booking/quote-worksheet';
import { defaultWorksheet, type WorksheetInputs } from '@/lib/quotes/worksheet';
import type { Aircraft } from '@/lib/types';

export interface QuoteLeg {
  origin_code: string;
  dest_code: string;
  departure_date: string;
}

/**
 * Submit a quote. The worksheet works out the price from the operator's own
 * inputs and is saved privately with the quote.
 */
export interface QuoteDraft {
  aircraftId: number | null;
  priceCents: number;
  message: string | null;
  validUntil: string | null;
  worksheet: WorksheetInputs;
  flags: string[];
  /** What Autopilot applied from the operator's earlier quotes. */
  notes?: string[];
}

export const FIELD_LABELS: Record<string, string> = {
  priceCents: 'Price', validUntil: 'Valid until', aircraftId: 'Aircraft', message: 'Message',
};

export function SubmitQuoteForm({ requestId, aircraft, legs, passengerCount, onSubmitted, draft: initialDraft = null }: {
  requestId: number;
  /** An Autopilot draft to review: prefills every field. */
  draft?: QuoteDraft | null;
  aircraft: Aircraft[];
  legs: QuoteLeg[];
  passengerCount: number;
  /** Called after a successful submit; defaults to refreshing the page. */
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<QuoteDraft | null>(initialDraft);
  const [aircraftId, setAircraftId] = useState<number | ''>(draft?.aircraftId ?? (aircraft.length === 1 ? aircraft[0]!.id : ''));
  const [price, setPrice] = useState(draft ? String(draft.priceCents / 100) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showSheet, setShowSheet] = useState(!!draft);
  const [sheet, setSheet] = useState<WorksheetInputs | null>(draft?.worksheet ?? null);
  const [note, setNote] = useState(draft?.message ?? '');
  const [validUntil, setValidUntil] = useState(draft?.validUntil ?? '');
  const [drafting, setDrafting] = useState(false);

  const applyDraft = (d: QuoteDraft | null) => {
    setDraft(d);
    if (!d) return;
    setAircraftId(d.aircraftId ?? '');
    setPrice(String(d.priceCents / 100));
    setSheet(d.worksheet);
    setShowSheet(true);
    setNote(d.message ?? '');
    setValidUntil(d.validUntil ?? '');
  };

  /** Ask Autopilot to draft (or redraft) from the current parameters. */
  const redraft = async () => {
    setDrafting(true);
    setError('');
    const res = await fetch(`/api/booking-requests/${requestId}/draft`, { method: 'POST' }).catch(() => null);
    setDrafting(false);
    if (res?.ok) applyDraft(await res.json());
    else setError('Autopilot could not draft this request.');
  };

  const discard = async () => {
    await fetch(`/api/booking-requests/${requestId}/draft`, { method: 'DELETE' }).catch(() => null);
    setDraft(null);
  };
  const plane = aircraft.find(a => a.id === aircraftId) ?? null;

  const fresh = (a: Aircraft | null) => defaultWorksheet({
    legs: legs.map(l => ({ origin: l.origin_code, dest: l.dest_code, date: l.departure_date })),
    passengers: passengerCount,
    aircraft: a,
  });

  const openSheet = () => {
    if (!sheet) setSheet(fresh(plane));
    setShowSheet(s => !s);
  };

  const chooseAircraft = (value: string) => {
    const id = value ? Number(value) : '';
    setAircraftId(id);
    const a = aircraft.find(x => x.id === id) ?? null;
    // Take the new aircraft's rate when the worksheet has none yet.
    if (sheet && a) setSheet({ ...sheet, aircraftId: a.id, hourlyRate: sheet.hourlyRate || (a.hourly_rate_cents ?? 0) / 100 });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setFields({});
    const amount = parseFloat(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFields({ priceCents: 'Enter a price greater than $0' });
      setError('Fix 1 field: Price.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/booking-requests/${requestId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceCents: Math.round(amount * 100),
          aircraftId: aircraftId || undefined,
          message: note.trim() || undefined,
          validUntil: validUntil || undefined,
          worksheet: sheet ? { ...sheet, aircraftId: aircraftId || null } : undefined,
        }),
      });
      if (!res.ok) {
        const failure = await readApiFailure(res, 'Could not submit the quote.');
        setFields(failure.fields);
        setError(Object.keys(failure.fields).length ? summaryLine(failure.fields, FIELD_LABELS) : failure.message);
        return;
      }
      if (onSubmitted) { onSubmitted(); return; }
      // The page swaps this form for the saved quote, so the confirmation rides along in the URL.
      router.replace(`${pathname}?quoted=1`);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={`quote-form-${requestId}`} onSubmit={handleSubmit} className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}

      {draft ? (
        <div id={`quote-${requestId}-draft`} className="space-y-2 rounded-md border border-royal bg-surface-sunken px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-body text-ink">
              <Bot size={16} strokeWidth={1.5} aria-hidden="true" className="text-royal" />
              Drafted by Autopilot. Review, adjust, then submit. Your changes teach Autopilot.
            </p>
            <span className="flex gap-1">
              <Button type="button" size="sm" variant="quiet" onClick={redraft} disabled={drafting}>{drafting ? 'Redrafting…' : 'Redraft'}</Button>
              <Button type="button" size="sm" variant="quiet" onClick={discard}>Discard</Button>
            </span>
          </div>
          {(draft.notes?.length ?? 0) > 0 && (
            <ul className="space-y-1">
              {draft.notes!.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-label text-ink-muted">
                  <GraduationCap size={14} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-royal" /> {n}
                </li>
              ))}
            </ul>
          )}
          {draft.flags.length > 0 && (
            <ul className="space-y-1">
              {draft.flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-label text-ink-muted">
                  <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" /> {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button type="button" onClick={redraft} disabled={drafting}
          className="inline-flex min-h-11 items-center gap-2 text-label text-royal hover:underline underline-offset-4 cursor-pointer disabled:opacity-40">
          <Bot size={16} strokeWidth={1.5} aria-hidden="true" /> {drafting ? 'Drafting…' : 'Draft with Autopilot'}
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {aircraft.length > 0 && (
          <div className="space-y-2">
            <label htmlFor={`quote-${requestId}-aircraft`} className="block text-label text-ink-muted">Aircraft</label>
            <select id={`quote-${requestId}-aircraft`} value={aircraftId} onChange={e => chooseAircraft(e.target.value)}
              className="block h-12 w-full rounded-md border border-border-control bg-surface-raised px-4 text-body text-ink">
              <option value="">Not specified</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>{a.type} · {a.tail_number} · {a.capacity} seats</option>
              ))}
            </select>
            {fields.aircraftId && <p className="text-label text-danger">{fields.aircraftId}</p>}
          </div>
        )}
        <Input id={`quote-${requestId}-price`} name="price" label="Total price (USD)" type="number" step="1" min="1" inputMode="decimal"
          placeholder="25000" value={price} onChange={e => setPrice(e.target.value)} required error={fields.priceCents} />
      </div>

      <button type="button" onClick={openSheet} aria-expanded={showSheet} aria-controls={`quote-${requestId}-worksheet`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-royal hover:underline underline-offset-4 cursor-pointer">
        <Calculator size={16} strokeWidth={1.5} aria-hidden="true" />
        {showSheet ? 'Hide price worksheet' : 'Work out the price'}
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className={`transition-transform duration-200 ${showSheet ? 'rotate-180' : ''}`} />
      </button>

      {showSheet && sheet && (
        <QuoteWorksheet id={`quote-${requestId}-worksheet`} value={sheet} onChange={setSheet} cruiseKtas={plane?.cruise_ktas}
          onUse={c => setPrice(String(c / 100))} />
      )}

      <div className="space-y-2">
        <label htmlFor={`quote-${requestId}-message`} className="block text-label text-ink-muted">Message to the traveler</label>
        <textarea id={`quote-${requestId}-message`} name="message" rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="What is included: aircraft, crew, catering, Wi-Fi…"
          className="block w-full resize-y rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink placeholder:text-ink-subtle" />
        {fields.message && <p className="text-label text-danger">{fields.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
        <Input id={`quote-${requestId}-valid`} name="validUntil" label="Valid until" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} error={fields.validUntil} />
        <Button type="submit" disabled={loading} block>{loading ? 'Submitting…' : draft ? 'Approve and submit quote' : 'Submit quote'}</Button>
      </div>
    </form>
  );
}
