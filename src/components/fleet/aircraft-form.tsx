'use client';

import { useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { RegistrySummary } from '@/components/fleet/registry-summary';
import { suggestedType, type RegistryRecord } from '@/lib/faa/registry';
import type { AircraftView } from '@/lib/fleet';

export interface AircraftValues {
  tailNumber: string;
  type: string;
  capacity: string;
  rangeNm: string;
  year: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  hourlyRate: string;
  cruiseKtas: string;
}

export const valuesFrom = (a?: AircraftView): AircraftValues => ({
  tailNumber: a?.tail_number ?? '',
  type: a?.type ?? '',
  capacity: a?.capacity ? String(a.capacity) : '',
  rangeNm: a?.range_nm ? String(a.range_nm) : '',
  year: a?.year ? String(a.year) : '',
  serialNumber: a?.serial_number ?? '',
  manufacturer: a?.manufacturer ?? '',
  model: a?.model ?? '',
  hourlyRate: a?.hourly_rate_cents ? String(a.hourly_rate_cents / 100) : '',
  cruiseKtas: a?.cruise_ktas ? String(a.cruise_ktas) : '',
});

const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length > 1);

/** The typed aircraft type shares no word with the registry's manufacturer or model. */
export function registryMismatch(type: string, r: RegistryRecord): boolean {
  if (r.status !== 'assigned' || !type.trim() || (!r.manufacturer && !r.model)) return false;
  const reg = new Set(words(`${r.manufacturer ?? ''} ${r.model ?? ''}`));
  return !words(type).some(w => reg.has(w));
}

const num = (s: string) => (s.trim() ? Number(s) : null);

export function toPayload(v: AircraftValues) {
  return {
    tailNumber: v.tailNumber.trim(),
    type: v.type.trim(),
    capacity: Number(v.capacity),
    rangeNm: num(v.rangeNm),
    year: num(v.year),
    serialNumber: v.serialNumber.trim() || null,
    manufacturer: v.manufacturer.trim() || null,
    model: v.model.trim() || null,
    hourlyRateCents: v.hourlyRate.trim() ? Math.round(Number(v.hourlyRate) * 100) : null,
    cruiseKtas: num(v.cruiseKtas),
  };
}

function fieldErrors(body: unknown): Record<string, string> {
  const e = (body as { error?: unknown })?.error;
  if (!e || typeof e !== 'object') return {};
  return Object.fromEntries(Object.entries(e as Record<string, string[]>).map(([k, v]) => [k, v?.[0] ?? 'Invalid']));
}

/**
 * Add or edit an aircraft. "Look up" reads the FAA registry for the tail
 * number and fills fields that are blank; it never overwrites what was typed.
 */
export function AircraftForm({
  id,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  id: string;
  initial?: AircraftView;
  submitLabel: string;
  /** Resolves with field errors or a message on failure, nothing on success. Gets the previewed record, if any. */
  onSubmit: (payload: ReturnType<typeof toPayload>, lookedUp: RegistryRecord | null) => Promise<{ fields?: Record<string, string>; message?: string } | void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<AircraftValues>(() => valuesFrom(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; record?: RegistryRecord; error?: string }>({ state: 'idle' });

  const set = (k: keyof AircraftValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setV(prev => ({ ...prev, [k]: value }));
    if (k === 'tailNumber') setLookup({ state: 'idle' });
  };

  const runLookup = async () => {
    setLookup({ state: 'loading' });
    const res = await fetch(`/api/fleet/faa?n=${encodeURIComponent(v.tailNumber)}`).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      setLookup({ state: 'error', error: body?.error ?? 'Lookup failed' });
      return;
    }
    const record = body.record as RegistryRecord;
    setLookup({ state: 'done', record });
    if (record.status !== 'assigned') return;
    setV(prev => ({
      ...prev,
      tailNumber: record.nNumber,
      type: prev.type || body.suggestedType || '',
      year: prev.year || (record.year ? String(record.year) : ''),
      serialNumber: prev.serialNumber || record.serialNumber || '',
      manufacturer: prev.manufacturer || record.manufacturer || '',
      model: prev.model || record.model || '',
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');
    try {
      const failure = await onSubmit(toPayload(v), lookup.state === 'done' && lookup.record ? lookup.record : null);
      if (failure) {
        setErrors(failure.fields ?? {});
        setMessage(failure.message ?? (failure.fields ? 'Check the highlighted fields.' : ''));
      }
    } catch {
      setMessage('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id={id} onSubmit={submit} noValidate className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-3 text-overline text-ink-muted">Registration</legend>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <Input name="tailNumber" label="Tail number" placeholder="N123AB" autoCapitalize="characters" autoComplete="off"
              value={v.tailNumber} onChange={set('tailNumber')} error={errors.tailNumber} required />
          </div>
          <Button variant="secondary" disabled={v.tailNumber.trim().length < 2 || lookup.state === 'loading'} onClick={runLookup}>
            <Search size={16} strokeWidth={1.5} aria-hidden="true" />
            {lookup.state === 'loading' ? 'Checking FAA registry…' : 'Look up on FAA registry'}
          </Button>
        </div>
        {lookup.state === 'error' && <Notice tone="danger">{lookup.error}</Notice>}
        {lookup.state === 'done' && lookup.record && registryMismatch(v.type, lookup.record) && (
          <Notice tone="warning">
            The registry lists {lookup.record.nNumber} as a {suggestedType(lookup.record)}, not a {v.type.trim()}. Check the tail number.
          </Notice>
        )}
        {lookup.state === 'done' && lookup.record && (
          <div className="rounded-md border border-hairline bg-surface-sunken p-4">
            <RegistrySummary record={lookup.record} />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-overline text-ink-muted">Aircraft</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input name="type" label="Type (shown to travelers)" placeholder="Gulfstream G650" value={v.type} onChange={set('type')} error={errors.type} required />
          <Input name="capacity" label="Passenger seats" type="number" inputMode="numeric" min={1} max={100} value={v.capacity} onChange={set('capacity')} error={errors.capacity} required />
          <Input name="rangeNm" label="Range (nm)" type="number" inputMode="numeric" min={0} placeholder="7000" value={v.rangeNm} onChange={set('rangeNm')} error={errors.rangeNm} />
          <Input name="year" label="Year built" type="number" inputMode="numeric" placeholder="2020" value={v.year} onChange={set('year')} error={errors.year} />
          <Input name="manufacturer" label="Manufacturer" value={v.manufacturer} onChange={set('manufacturer')} error={errors.manufacturer} />
          <Input name="model" label="Model" value={v.model} onChange={set('model')} error={errors.model} />
          <Input name="serialNumber" label="Serial number" value={v.serialNumber} onChange={set('serialNumber')} error={errors.serialNumber} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 inline-flex items-center gap-1.5 text-overline text-ink-muted">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" /> Pricing defaults (private)
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input name="hourlyRate" label="Hourly rate (USD)" type="number" inputMode="decimal" min={0} step={50} placeholder="5500"
            value={v.hourlyRate} onChange={set('hourlyRate')} error={errors.hourlyRateCents} />
          <Input name="cruiseKtas" label="Cruise speed (kt)" type="number" inputMode="numeric" min={50} max={700} placeholder="450"
            value={v.cruiseKtas} onChange={set('cruiseKtas')} error={errors.cruiseKtas} />
        </div>
        <p className="mt-2 text-label text-ink-muted">Used to start the price worksheet on quotes. Not shown to travelers.</p>
      </fieldset>

      {message && <Notice tone="danger">{message}</Notice>}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

export { fieldErrors };
