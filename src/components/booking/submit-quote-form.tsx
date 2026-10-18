'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
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
export function SubmitQuoteForm({ requestId, aircraft, legs, passengerCount, onSubmitted }: {
  requestId: number;
  aircraft: Aircraft[];
  legs: QuoteLeg[];
  passengerCount: number;
  /** Called after a successful submit; defaults to refreshing the page. */
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [aircraftId, setAircraftId] = useState<number | ''>(aircraft.length === 1 ? aircraft[0]!.id : '');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSheet, setShowSheet] = useState(false);
  const [sheet, setSheet] = useState<WorksheetInputs | null>(null);
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
    const amount = parseFloat(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a price');
      return;
    }
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch(`/api/booking-requests/${requestId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceCents: Math.round(amount * 100),
          aircraftId: aircraftId || undefined,
          message: formData.get('message') || undefined,
          validUntil: formData.get('validUntil') || undefined,
          worksheet: sheet ? { ...sheet, aircraftId: aircraftId || null } : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === 'string' ? data.error : 'Could not submit the quote');
        return;
      }
      if (onSubmitted) onSubmitted(); else router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={`quote-form-${requestId}`} onSubmit={handleSubmit} className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}

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
          </div>
        )}
        <Input id={`quote-${requestId}-price`} name="price" label="Total price (USD)" type="number" step="1" min="1" inputMode="decimal"
          placeholder="25000" value={price} onChange={e => setPrice(e.target.value)} required />
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
        <textarea id={`quote-${requestId}-message`} name="message" rows={3}
          placeholder="What is included: aircraft, crew, catering, Wi-Fi…"
          className="block w-full resize-y rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink placeholder:text-ink-subtle" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
        <Input id={`quote-${requestId}-valid`} name="validUntil" label="Valid until" type="date" />
        <Button type="submit" disabled={loading} block>{loading ? 'Submitting…' : 'Submit quote'}</Button>
      </div>
    </form>
  );
}
