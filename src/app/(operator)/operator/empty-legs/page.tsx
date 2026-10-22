'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { readApiFailure, summaryLine } from '@/lib/api/form-errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';
import { AirportField } from '@/components/ui/route-field';
import { EmptyLegCard } from '@/components/empty-legs/empty-leg-card';
import type { EmptyLegView } from '@/lib/empty-legs/service';
import type { Aircraft } from '@/lib/types';

type Errors = Record<string, string>;

const FIELD_LABELS: Errors = {
  originCode: 'From', destCode: 'To', departureDate: 'Departure date', departureTime: 'Departure time',
  seats: 'Seats', priceCents: 'Price', aircraftId: 'Aircraft', notes: 'Note', flexDays: 'Date flexibility',
};

const STATUS: Record<EmptyLegView['status'], { label: string; variant: StatusVariant }> = {
  listed: { label: 'Listed', variant: 'confirmed' },
  booked: { label: 'Booked', variant: 'confirmed' },
  withdrawn: { label: 'Withdrawn', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'neutral' },
};

function NewListingForm({ aircraft, onCreated, onCancel }: { aircraft: Aircraft[]; onCreated: (leg: EmptyLegView) => void; onCancel: () => void }) {
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [aircraftId, setAircraftId] = useState(aircraft[0] ? String(aircraft[0].id) : '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [flex, setFlex] = useState('0');
  const [seats, setSeats] = useState(aircraft[0] ? String(aircraft[0].capacity) : '');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const pickAircraft = (id: string) => {
    setAircraftId(id);
    const a = aircraft.find(x => String(x.id) === id);
    if (a) setSeats(String(a.capacity));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');
    const res = await fetch('/api/operator/empty-legs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: aircraftId ? Number(aircraftId) : null,
        originCode: origin, destCode: dest, departureDate: date, departureTime: time || null,
        flexDays: Number(flex), seats: Number(seats), priceCents: Math.round(Number(price) * 100), notes: notes || null,
      }),
    });
    if (!res.ok) {
      const failure = await readApiFailure(res, 'Could not list this empty leg.');
      setErrors(failure.fields);
      setMessage(Object.keys(failure.fields).length ? summaryLine(failure.fields, FIELD_LABELS) : failure.message);
      setSaving(false);
      return;
    }
    onCreated((await res.json()) as EmptyLegView);
  };

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="New empty leg">
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border-control">
          <AirportField id="el-origin" label="From" value={origin} onChange={setOrigin} required cellClass="px-4 py-3" inputClass="text-body" />
        </div>
        <div className="rounded-md border border-border-control">
          <AirportField id="el-dest" label="To" value={dest} onChange={setDest} required cellClass="px-4 py-3" inputClass="text-body" />
        </div>
      </div>
      {(errors.originCode || errors.destCode) && <p className="text-label text-danger">{errors.originCode ?? errors.destCode}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Departure date" type="date" value={date} onChange={e => setDate(e.target.value)} required error={errors.departureDate} />
        <Input label="Departure time (local)" type="time" value={time} onChange={e => setTime(e.target.value)} error={errors.departureTime} />
        <Select label="Date flexibility" value={flex} onChange={e => setFlex(e.target.value)} error={errors.flexDays}
          options={[{ value: '0', label: 'Fixed date' }, { value: '1', label: '±1 day' }, { value: '2', label: '±2 days' }, { value: '3', label: '±3 days' }, { value: '7', label: '±7 days' }]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Aircraft" value={aircraftId} onChange={e => pickAircraft(e.target.value)} error={errors.aircraftId}
          options={[{ value: '', label: 'To be confirmed' }, ...aircraft.map(a => ({ value: String(a.id), label: `${a.type} · ${a.tail_number}` }))]} />
        <Input label="Seats" type="number" min={1} max={100} value={seats} onChange={e => setSeats(e.target.value)} required error={errors.seats} />
        <Input label="All-in price (USD)" type="number" min={1} step="1" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} required error={errors.priceCents} />
      </div>
      <Input label="Note to travelers (optional)" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Catering included. Pets welcome." error={errors.notes} />
      <p className="text-label text-ink-muted">The price is the whole aircraft, taxes and fees included. The empty-leg commission applies on booking.</p>
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? 'Listing…' : 'List empty leg'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function ListingActions({ leg, onChange }: { leg: EmptyLegView; onChange: (leg: EmptyLegView) => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(leg.price_cents / 100));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/operator/empty-legs/${leg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (res.ok) { onChange(data as EmptyLegView); setEditing(false); setConfirm(false); }
    else setError(typeof data?.error === 'string' ? data.error : 'Could not update the listing');
    setBusy(false);
  };

  if (leg.status !== 'listed') return null;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {editing ? (
        <form onSubmit={e => { e.preventDefault(); patch({ priceCents: Math.round(Number(price) * 100) }); }} className="flex items-end gap-2">
          <Input label="New price (USD)" type="number" min={1} step="1" value={price} onChange={e => setPrice(e.target.value)} className="w-36" />
          <Button type="submit" size="sm" disabled={busy}>Save price</Button>
          <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      ) : confirm ? (
        <div className="flex items-center gap-2">
          <span className="text-label text-ink-muted">Take this flight off the market?</span>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => patch({ status: 'withdrawn' })}>Withdraw</Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Keep</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change price</Button>
          <Button size="sm" variant="quiet" onClick={() => setConfirm(true)}>Withdraw</Button>
        </div>
      )}
      {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
    </div>
  );
}

export default function OperatorEmptyLegsPage() {
  const [legs, setLegs] = useState<EmptyLegView[] | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/operator/empty-legs'), fetch('/api/fleet')])
      .then(async ([a, b]) => {
        if (!a.ok) { setLoadError('Could not load your listings'); return; }
        setLegs(await a.json());
        if (b.ok) setAircraft(await b.json());
      })
      .catch(() => setLoadError('Could not load your listings'));
  }, []);

  const replace = (leg: EmptyLegView) => setLegs(list => list?.map(x => (x.id === leg.id ? leg : x)) ?? null);
  const live = legs?.filter(l => l.status === 'listed') ?? [];
  const past = legs?.filter(l => l.status !== 'listed') ?? [];

  return (
    <div id="empty-legs-page" className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Empty legs</h1>
          <p className="mt-2 text-body text-ink-muted">
            Repositioning flights you sell at a fixed all-in price. They are listed publicly, offered on matching requests, and booked without a quote round.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}><Plus size={16} strokeWidth={1.5} aria-hidden="true" /> List empty leg</Button>
        )}
      </div>

      {loadError && <Notice tone="danger">{loadError}</Notice>}

      {adding && (
        <Card id="new-empty-leg">
          <h2 className="mb-6 text-heading text-ink">New empty leg</h2>
          <NewListingForm aircraft={aircraft} onCancel={() => setAdding(false)}
            onCreated={leg => { setLegs(list => [leg, ...(list ?? [])]); setAdding(false); }} />
        </Card>
      )}

      {legs === null ? (
        !loadError && <p className="text-body text-ink-muted" role="status">Loading…</p>
      ) : legs.length === 0 ? (
        !adding && (
          <Card className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-body text-ink-muted">No empty legs listed. Add the next repositioning flight on your schedule.</p>
            <Button onClick={() => setAdding(true)}>List empty leg</Button>
          </Card>
        )
      ) : (
        <>
          {live.length > 0 && (
            <section aria-labelledby="live-heading" className="space-y-4">
              <h2 id="live-heading" className="text-title text-ink">On the market <span className="text-ink-muted tabular-nums">({live.length})</span></h2>
              {live.map(leg => (
                <EmptyLegCard key={leg.id} leg={leg} badge={<StatusBadge variant={STATUS[leg.status].variant}>{STATUS[leg.status].label}</StatusBadge>}
                  action={<ListingActions leg={leg} onChange={replace} />} />
              ))}
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past-heading" className="space-y-4">
              <h2 id="past-heading" className="text-title text-ink">Booked and past</h2>
              {past.map(leg => (
                <EmptyLegCard key={leg.id} leg={leg} badge={<StatusBadge variant={STATUS[leg.status].variant}>{STATUS[leg.status].label}</StatusBadge>}
                  action={leg.booked_request_id ? (
                    <a href={`/operator/requests/${leg.booked_request_id}`} className="text-label text-royal underline underline-offset-4">Open the trip</a>
                  ) : undefined} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
