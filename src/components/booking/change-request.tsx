'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { RouteField } from '@/components/ui/route-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { readApiFailure, summaryLine } from '@/lib/api/form-errors';
import { formatTripDate, formatTripTime } from '@/lib/trip-format';
import type { DraftLeg } from '@/lib/bookings/draft';

const CHANGE_LABELS: Record<string, string> = { passengerCount: 'Guests', notes: 'Special requests', legs: 'Itinerary' };

export interface ChangeRequestView {
  id: number;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  proposed_legs: { originCode: string; destCode: string; departureDate: string; departureTime?: string }[];
  proposed_passenger_count: number;
  proposed_notes: string | null;
  operator_note: string | null;
  new_price_cents: number | null;
  previous_price_cents: number | null;
  applied_at: string | null;
  closed_reason?: string | null;
  created_at: string;
  /** Formatted new price, when the operator set one. */
  newPrice?: string | null;
  /** Open difference checkout, when the traveler must pay more. */
  paymentDue?: { url: string; amount: string } | null;
}

const badge: Record<ChangeRequestView['status'], { variant: 'warning' | 'confirmed' | 'neutral' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Awaiting operator' },
  accepted: { variant: 'confirmed', label: 'Accepted' },
  declined: { variant: 'danger', label: 'Declined' },
  withdrawn: { variant: 'neutral', label: 'Withdrawn' },
};

/** The proposed itinerary, as a compact list. */
export function ProposedItinerary({ cr }: { cr: ChangeRequestView }) {
  return (
    <div className="space-y-1 text-body">
      <ol className="space-y-1">
        {cr.proposed_legs.map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-ink-muted w-12 shrink-0">Leg {i + 1}</span>
            <span className="text-ink tabular-nums">{l.originCode} → {l.destCode}</span>
            <span className="text-ink">{formatTripDate(l.departureDate) || l.departureDate}</span>
            <span className="text-ink-muted">{formatTripTime(l.departureTime ?? '') || 'Any time'}</span>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted">
        {cr.proposed_passenger_count} guest{cr.proposed_passenger_count !== 1 ? 's' : ''}
        {' · '}Special requests: <span className="text-ink">{cr.proposed_notes?.trim() || 'None'}</span>
      </p>
    </div>
  );
}

/** One change request's status line, shown to both sides. */
export function ChangeRequestSummary({ cr, children }: { cr: ChangeRequestView; children?: React.ReactNode }) {
  const b = badge[cr.status];
  return (
    <div className="rounded-md bg-surface-sunken px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label text-ink-muted">Change #{cr.id} · {cr.created_at.slice(0, 10)}</p>
        <StatusBadge variant={b.variant}>{b.label}</StatusBadge>
      </div>
      <ProposedItinerary cr={cr} />
      {cr.newPrice && cr.status === 'accepted' && (
        <p className="text-label text-ink-muted">New all-in price: <span className="text-ink tabular-nums">{cr.newPrice}</span></p>
      )}
      {cr.operator_note && <p className="text-body text-ink-muted italic">&ldquo;{cr.operator_note}&rdquo;</p>}
      {cr.status === 'withdrawn' && cr.closed_reason === 'trip_cancelled' && (
        <p className="text-body text-ink">Change request closed because the trip was cancelled.</p>
      )}
      {cr.status === 'accepted' && !cr.applied_at && cr.paymentDue && (
        <p className="text-body text-ink">Pay {cr.paymentDue.amount} to apply this change.</p>
      )}
      {children}
    </div>
  );
}

/**
 * Traveler side: list of past change requests, the pending one with a
 * withdraw button or a pay-the-difference link, and a form to propose one.
 */
export function TravelerChangeRequests({
  requestId, changes, currentLegs, passengerCount, notes,
}: {
  requestId: number;
  changes: ChangeRequestView[];
  currentLegs: DraftLeg[];
  passengerCount: number;
  notes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [legs, setLegs] = useState<DraftLeg[]>(currentLegs);
  const [pax, setPax] = useState(passengerCount);
  const [note, setNote] = useState(notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState('');
  const pending = changes.find(c => c.status === 'pending');

  const updateLeg = (i: number, field: keyof DraftLeg, value: string) =>
    setLegs(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'destCode' && i < next.length - 1) next[i + 1] = { ...next[i + 1], originCode: value };
      return next;
    });
  const addLeg = () => setLegs(prev => [...prev, { originCode: prev[prev.length - 1]?.destCode ?? '', destCode: '', departureDate: '', departureTime: '' }]);
  const removeLeg = (i: number) => setLegs(prev => prev.filter((_, j) => j !== i));

  const submit = async () => {
    setBusy(true);
    setError('');
    setFields({});
    const res = await fetch(`/api/booking-requests/${requestId}/changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legs: legs.map(l => ({ originCode: l.originCode, destCode: l.destCode, departureDate: l.departureDate, departureTime: l.departureTime || undefined })),
        passengerCount: pax,
        notes: note || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const failure = await readApiFailure(res, 'Check each leg has an airport code and a date.');
      setFields(failure.fields);
      setError(Object.keys(failure.fields).length ? summaryLine(failure.fields, CHANGE_LABELS) : failure.message);
      return;
    }
    setOpen(false);
    setDone('Change request sent. The operator will accept or decline it.');
    router.refresh();
  };

  const withdraw = async (id: number) => {
    setBusy(true);
    const res = await fetch(`/api/change-requests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }),
    });
    setBusy(false);
    if (!res.ok) { setError('Could not withdraw the change request.'); return; }
    router.refresh();
  };

  return (
    <Card className="mb-8 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-title text-ink">Changes</h2>
        {!pending && !open && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Request a change</Button>}
      </div>
      {done && <Notice tone="confirmed">{done}</Notice>}
      {changes.length === 0 && !open && (
        <p className="text-body text-ink-muted">Need different dates, airports or a different group size? Propose a change and the operator will confirm it here.</p>
      )}
      {changes.map(cr => (
        <ChangeRequestSummary key={cr.id} cr={cr}>
          {cr.status === 'pending' && (
            <Button variant="quiet" size="sm" onClick={() => withdraw(cr.id)} disabled={busy}>Withdraw request</Button>
          )}
          {cr.status === 'accepted' && !cr.applied_at && cr.paymentDue && (
            <a href={cr.paymentDue.url} className="text-label text-royal underline underline-offset-4">Pay {cr.paymentDue.amount}</a>
          )}
        </ChangeRequestSummary>
      ))}

      {open && (
        <div className="space-y-4 border-t border-hairline pt-4">
          <p className="text-body text-ink-muted">Edit the itinerary below. The operator may accept it at the same price, quote a new all-in price, or decline.</p>
          {legs.map((leg, i) => (
            <div key={i} className="rounded-md bg-surface-sunken p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-label text-ink-muted">Leg {i + 1}</p>
                {legs.length > 1 && <Button variant="quiet" size="sm" onClick={() => removeLeg(i)}>Remove leg</Button>}
              </div>
              <RouteField
                origin={leg.originCode}
                destination={leg.destCode}
                onOriginChange={v => updateLeg(i, 'originCode', v)}
                onDestinationChange={v => updateLeg(i, 'destCode', v)}
                onSwap={() => setLegs(prev => prev.map((l, j) => (j === i ? { ...l, originCode: l.destCode, destCode: l.originCode } : l)))}
              />
              {(fields[`legs.${i}.originCode`] || fields[`legs.${i}.destCode`]) && (
                <p className="text-label text-danger">{fields[`legs.${i}.originCode`] ? `From: ${fields[`legs.${i}.originCode`]}` : `To: ${fields[`legs.${i}.destCode`]}`}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date" type="date" value={leg.departureDate} onChange={e => updateLeg(i, 'departureDate', e.target.value)} required error={fields[`legs.${i}.departureDate`]} />
                <Input label="Time (optional)" type="time" value={leg.departureTime} onChange={e => updateLeg(i, 'departureTime', e.target.value)} error={fields[`legs.${i}.departureTime`]} />
              </div>
            </div>
          ))}
          {legs.length < 10 && (
            <Button variant="quiet" size="sm" onClick={addLeg}><Plus size={16} aria-hidden="true" /> Add leg</Button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Guests" type="number" min={1} max={19} value={pax} onChange={e => setPax(Number(e.target.value))} error={fields.passengerCount} />
          </div>
          <div className="space-y-2">
            <label htmlFor="change-notes" className="block text-label text-ink-muted">Special requests</label>
            <textarea
              id="change-notes"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="block w-full rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink placeholder:text-ink-subtle"
            />
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={submit} disabled={busy}>Send change request</Button>
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Operator side: the pending change with accept (optional new price) and decline. */
export function OperatorChangeRequests({ changes, currentPrice }: { changes: ChangeRequestView[]; currentPrice: string }) {
  const router = useRouter();
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const resolve = async (id: number, action: 'accept' | 'decline') => {
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = { action, note: note || undefined };
    if (action === 'accept' && price.trim()) {
      const cents = Math.round(Number(price) * 100);
      if (!Number.isFinite(cents) || cents <= 0) { setError('Enter a valid price.'); setBusy(false); return; }
      body.newPriceCents = cents;
    }
    const res = await fetch(`/api/change-requests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not update the change request.'); return; }
    setResult(action === 'decline' ? 'Change declined. The traveler has been told.'
      : data.paymentDue ? 'Change accepted. The itinerary updates once the traveler pays the difference.'
      : data.refundedCents ? 'Change accepted and applied. The difference is being refunded to the traveler.'
      : 'Change accepted and applied.');
    router.refresh();
  };

  if (changes.length === 0) return null;
  return (
    <Card className="mb-8 space-y-4">
      <h2 className="text-title text-ink">Change requests</h2>
      {result && <Notice tone="confirmed">{result}</Notice>}
      {changes.map(cr => (
        <ChangeRequestSummary key={cr.id} cr={cr}>
          {cr.status === 'pending' && (
            <div className="space-y-3 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={`New all-in price (USD), blank keeps ${currentPrice}`}
                  type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Same price"
                />
                <Input label="Note to traveler (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} />
              </div>
              {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => resolve(cr.id, 'accept')} disabled={busy}>Accept change</Button>
                <Button variant="secondary" size="sm" onClick={() => resolve(cr.id, 'decline')} disabled={busy}>Decline change</Button>
              </div>
            </div>
          )}
        </ChangeRequestSummary>
      ))}
    </Card>
  );
}
