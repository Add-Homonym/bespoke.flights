'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import type { BusinessModel } from '@/lib/business-model';

type Key = keyof BusinessModel;
type Kind = 'pct' | 'usd' | 'int' | 'bool' | 'date' | 'enum';

interface Field {
  key: Key;
  label: string;
  kind: Kind;
  help?: string;
  options?: { value: string; label: string }[];
}

interface Group {
  title: string;
  intro: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    title: 'Commission',
    intro: 'Charged only on confirmed bookings. The operator pays it, so the traveler sees the operator’s own price.',
    fields: [
      { key: 'operatorCommissionBps', label: 'Operator commission (%)', kind: 'pct', help: 'Default for every operator without an override. Brokers mark up 10–25%; 7–10% leaves both sides better off.' },
      { key: 'feePayer', label: 'Who pays the platform fee', kind: 'enum', options: [{ value: 'operator', label: 'Operator' }, { value: 'traveler', label: 'Traveler' }, { value: 'split', label: 'Both' }] },
      { key: 'travelerFeeBps', label: 'Traveler fee (%)', kind: 'pct', help: 'Added to the traveler’s charge when the traveler pays or the fee is split.' },
    ],
  },
  {
    title: 'Operator subscription',
    intro: 'Recurring revenue from the operators who get the most value: priority placement and a lower commission.',
    fields: [
      { key: 'subscriptionEnabled', label: 'Offer a subscription tier', kind: 'bool' },
      { key: 'subscriptionMonthlyCents', label: 'Monthly price (USD)', kind: 'usd' },
      { key: 'subscriptionCommissionBps', label: 'Subscriber commission (%)', kind: 'pct', help: 'Applies to operators on the subscriber plan.' },
      { key: 'subscriptionPriorityPlacement', label: 'Priority placement in quote lists', kind: 'bool' },
    ],
  },
  {
    title: 'Ancillaries',
    intro: 'Ground transport, catering, porters and hotels resold at retail margin.',
    fields: [
      { key: 'ancillaryMarginBps', label: 'Ancillary margin (%)', kind: 'pct' },
    ],
  },
  {
    title: 'Payments',
    intro: 'Funds are collected by the platform and routed to the operator, minus the platform’s share.',
    fields: [
      { key: 'passProcessingToOperator', label: 'Deduct processing cost from the operator payout', kind: 'bool', help: 'Off: processing comes out of the platform’s share.' },
      { key: 'processingFeeBps', label: 'Processing estimate (%)', kind: 'pct' },
      { key: 'processingFeeFixedCents', label: 'Processing estimate, fixed (USD)', kind: 'usd' },
      { key: 'payoutHoldHours', label: 'Payout hold after last leg (hours)', kind: 'int' },
    ],
  },
  {
    title: 'Empty legs',
    intro: 'Repositioning flights listed by operators. Their alternative is zero revenue, so a higher take rate holds.',
    fields: [
      { key: 'emptyLegCommissionBps', label: 'Empty-leg commission (%)', kind: 'pct' },
    ],
  },
  {
    title: 'Launch partner promotion',
    intro: 'A reduced commission for operators flagged as launch partners, until a booking cap or end date.',
    fields: [
      { key: 'launchPromoEnabled', label: 'Promotion active', kind: 'bool' },
      { key: 'launchPromoCommissionBps', label: 'Promo commission (%)', kind: 'pct' },
      { key: 'launchPromoBookingCap', label: 'Paid bookings per partner at the promo rate', kind: 'int', help: '0 = no cap.' },
      { key: 'launchPromoUntil', label: 'Promotion ends', kind: 'date', help: 'Leave empty for no end date.' },
    ],
  },
  {
    title: 'Referrals',
    intro: 'Paid to concierges and other referrers out of the platform commission.',
    fields: [
      { key: 'referralFeeBps', label: 'Referral fee (%)', kind: 'pct' },
    ],
  },
  {
    title: 'Quote ranking',
    intro: 'How quotes are ordered for the traveler. Ranking by price keeps the transparency claim literal.',
    fields: [
      { key: 'rankQuotesBy', label: 'Order quotes by', kind: 'enum', options: [{ value: 'price', label: 'Price, lowest first' }, { value: 'score', label: 'Match score, then price' }] },
      { key: 'discloseAffiliations', label: 'Disclose operators affiliated with the platform', kind: 'bool' },
    ],
  },
];

type Form = Record<Key, string>;

function toForm(m: BusinessModel): Form {
  const out = {} as Form;
  for (const g of GROUPS) {
    for (const f of g.fields) {
      const v = m[f.key];
      out[f.key] =
        f.kind === 'pct' ? String((v as number) / 100)
        : f.kind === 'usd' ? ((v as number) / 100).toFixed(2)
        : f.kind === 'bool' ? (v ? 'true' : 'false')
        : String(v);
    }
  }
  return out;
}

function fromForm(form: Form): { patch: Partial<BusinessModel>; errors: Partial<Record<Key, string>> } {
  const patch: Record<string, unknown> = {};
  const errors: Partial<Record<Key, string>> = {};
  for (const g of GROUPS) {
    for (const f of g.fields) {
      const raw = form[f.key].trim();
      switch (f.kind) {
        case 'pct': {
          const n = Number(raw);
          if (raw === '' || !Number.isFinite(n) || n < 0) errors[f.key] = 'Enter a percentage of 0 or more';
          else patch[f.key] = Math.round(n * 100);
          break;
        }
        case 'usd': {
          const n = Number(raw);
          if (raw === '' || !Number.isFinite(n) || n < 0) errors[f.key] = 'Enter an amount of 0 or more';
          else patch[f.key] = Math.round(n * 100);
          break;
        }
        case 'int': {
          const n = Number(raw);
          if (raw === '' || !Number.isInteger(n) || n < 0) errors[f.key] = 'Enter a whole number of 0 or more';
          else patch[f.key] = n;
          break;
        }
        case 'bool': patch[f.key] = raw === 'true'; break;
        case 'date':
          if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[f.key] = 'Enter a date';
          else patch[f.key] = raw;
          break;
        case 'enum': patch[f.key] = raw; break;
      }
    }
  }
  return { patch: patch as Partial<BusinessModel>, errors };
}

export function BusinessModelForm({ initial, applied }: { initial: BusinessModel; applied: Key[] }) {
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const appliedSet = new Set<Key>(applied);

  const set = (key: Key, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setStatus('idle');
  };

  const dirty = GROUPS.some(g => g.fields.some(f => form[f.key] !== saved[f.key]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { patch, errors: errs } = fromForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setStatus('saving');
    const res = await fetch('/api/admin/settings/business-model', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const fieldErrors = typeof data.error === 'object' && data.error ? data.error : {};
      const next: Partial<Record<Key, string>> = {};
      for (const [k, v] of Object.entries(fieldErrors)) next[k as Key] = Array.isArray(v) ? String(v[0]) : String(v);
      setErrors(next);
      setMessage(typeof data.error === 'string' ? data.error : 'Some values were rejected.');
      setStatus('error');
      return;
    }
    const next = toForm(await res.json());
    setForm(next);
    setSaved(next);
    setStatus('saved');
    setMessage('Settings saved. New checkouts use these values.');
  };

  const reset = () => { setForm(saved); setErrors({}); setStatus('idle'); };

  return (
    <form onSubmit={submit} className="space-y-6" aria-label="Business model">
      {GROUPS.map(g => (
        <Card key={g.title}>
          <h2 className="text-title text-ink mb-1">{g.title}</h2>
          <p className="text-body text-ink-muted mb-6">{g.intro}</p>
          <div className="grid gap-6 sm:grid-cols-2">
            {g.fields.map(f => (
              <div key={f.key} className="space-y-2">
                <FieldControl field={f} value={form[f.key]} error={errors[f.key]} onChange={v => set(f.key, v)} />
                <div className="flex items-center gap-2">
                  {appliedSet.has(f.key)
                    ? <StatusBadge variant="confirmed">Applied</StatusBadge>
                    : <StatusBadge variant="neutral">Recorded, not yet applied</StatusBadge>}
                  {f.help && <span className="text-label text-ink-muted">{f.help}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {status === 'saved' && <Notice tone="confirmed">{message}</Notice>}
      {status === 'error' && <Notice tone="danger">{message}</Notice>}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={!dirty || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save settings'}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={!dirty || status === 'saving'}>Discard changes</Button>
      </div>
    </form>
  );
}

function FieldControl({ field, value, error, onChange }: { field: Field; value: string; error?: string; onChange: (v: string) => void }) {
  switch (field.kind) {
    case 'bool':
      return <Select label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} options={[{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]} />;
    case 'enum':
      return <Select label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} options={field.options ?? []} />;
    case 'date':
      return <Input type="date" label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} />;
    case 'pct':
      return <Input type="number" inputMode="decimal" step="0.1" min="0" label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} />;
    case 'usd':
      return <Input type="number" inputMode="decimal" step="0.01" min="0" label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} />;
    case 'int':
      return <Input type="number" inputMode="numeric" step="1" min="0" label={field.label} value={value} onChange={e => onChange(e.target.value)} error={error} />;
  }
}
