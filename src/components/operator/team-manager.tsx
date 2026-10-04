'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { StaffMember } from '@/lib/staff/roster';

interface Form {
  name: string;
  role: string;
  email: string;
  phone: string;
  notify_email: boolean;
  notify_sms: boolean;
  on_new_request: boolean;
  on_booking: boolean;
  on_cancellation: boolean;
  active: boolean;
}

const blank: Form = {
  name: '', role: '', email: '', phone: '',
  notify_email: true, notify_sms: false,
  on_new_request: false, on_booking: true, on_cancellation: true, active: true,
};

const fromMember = (m: StaffMember): Form => ({
  name: m.name, role: m.role ?? '', email: m.email ?? '', phone: m.phone ?? '',
  notify_email: !!m.notify_email, notify_sms: !!m.notify_sms,
  on_new_request: !!m.on_new_request, on_booking: !!m.on_booking, on_cancellation: !!m.on_cancellation,
  active: !!m.active,
});

const EVENTS: { key: 'on_booking' | 'on_cancellation' | 'on_new_request'; label: string }[] = [
  { key: 'on_booking', label: 'Charter booked' },
  { key: 'on_cancellation', label: 'Charter cancelled' },
  { key: 'on_new_request', label: 'New request to quote' },
];

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-brand-cream cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-[#C9A84C]" />
      {label}
    </label>
  );
}

function StaffForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: Form;
  submitLabel: string;
  onSubmit: (f: Form) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        const err = await onSubmit(f);
        setBusy(false);
        setError(err ?? '');
        if (!err && !onCancel) setF(blank);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Name" value={f.name} onChange={e => set('name', e.target.value)} required />
        <Input label="Role (optional)" placeholder="Dispatch, Captain, Catering…" value={f.role} onChange={e => set('role', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={e => set('email', e.target.value)} />
        <Input label="Mobile (for texts)" type="tel" placeholder="+1 808 555 0100" value={f.phone} onChange={e => set('phone', e.target.value)} />
      </div>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="text-sm font-medium text-brand-muted mb-2">Send alerts by</legend>
        <Check label="Email" checked={f.notify_email} onChange={v => set('notify_email', v)} />
        <Check label="Text message" checked={f.notify_sms} onChange={v => set('notify_sms', v)} />
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="text-sm font-medium text-brand-muted mb-2">Alert when</legend>
        {EVENTS.map(ev => <Check key={ev.key} label={ev.label} checked={f[ev.key]} onChange={v => set(ev.key, v)} />)}
      </fieldset>
      {onCancel && <Check label="Alerts on for this person" checked={f.active} onChange={v => set('active', v)} />}
      {error && <p role="alert" className="text-brand-error text-sm">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={busy}>{submitLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export function TeamManager() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [sms, setSms] = useState<'live' | 'test' | 'not_configured'>('not_configured');
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const load = () => fetch('/api/operator/staff').then(r => r.json()).then(d => { setStaff(d.staff); setSms(d.sms); });
  useEffect(() => { load(); }, []);

  const save = async (url: string, method: string, f: Form) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || 'Could not save';
    await load();
    setEditing(null);
    return null;
  };

  const remove = async (m: StaffMember) => {
    if (!confirm(`Remove ${m.name}? They will stop receiving alerts.`)) return;
    await fetch(`/api/operator/staff/${m.id}`, { method: 'DELETE' });
    await load();
  };

  const test = async (m: StaffMember) => {
    setNotice('');
    const res = await fetch(`/api/operator/staff/${m.id}/test`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok
      ? `Test sent to ${m.name}: ${Object.entries(data).map(([ch, r]) => `${ch === 'sms' ? 'text' : ch} ${r}`).join(', ')}.`
      : data.error || 'Test failed');
  };

  return (
    <>
      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4">Add a staff member</h2>
        {sms !== 'live' && (
          <p className="text-brand-muted text-xs mb-4">
            {sms === 'test'
              ? 'Test mode: text messages are logged, not sent.'
              : 'Text messages are logged, not sent, until Twilio is configured.'}
          </p>
        )}
        <StaffForm initial={blank} submitLabel="Add to team" onSubmit={f => save('/api/operator/staff', 'POST', f)} />
      </Card>

      <h2 className="font-display text-xl text-brand-cream mb-4">
        Team {staff && <span className="text-brand-muted text-sm font-normal">({staff.length})</span>}
      </h2>
      {notice && <p role="status" className="text-brand-success text-sm mb-3">{notice}</p>}
      {staff === null ? (
        <p className="text-brand-muted">Loading&hellip;</p>
      ) : staff.length === 0 ? (
        <Card><p className="text-brand-muted text-center py-6">No staff yet. Add the people who should hear about new charters.</p></Card>
      ) : (
        <div className="space-y-3">
          {staff.map(m => (
            <Card key={m.id}>
              {editing === m.id ? (
                <StaffForm
                  initial={fromMember(m)}
                  submitLabel="Save"
                  onSubmit={f => save(`/api/operator/staff/${m.id}`, 'PATCH', f)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-brand-cream font-medium">
                      {m.name} {m.role && <span className="text-brand-muted font-normal">· {m.role}</span>}
                      {!m.active && <Badge className="ml-2">alerts off</Badge>}
                    </p>
                    <p className="text-brand-muted text-sm mt-1">
                      {[m.notify_email && m.email && `Email ${m.email}`, m.notify_sms && m.phone && `Text ${m.phone}`].filter(Boolean).join(' · ') || 'No alert channel on'}
                    </p>
                    <p className="text-brand-muted text-xs mt-1">
                      Alerts: {EVENTS.filter(ev => m[ev.key]).map(ev => ev.label.toLowerCase()).join(', ') || 'none'}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <button type="button" onClick={() => test(m)} className="text-brand-gold hover:underline cursor-pointer">Send test</button>
                    <button type="button" onClick={() => setEditing(m.id)} className="text-brand-muted hover:text-brand-cream cursor-pointer">Edit</button>
                    <button type="button" onClick={() => remove(m)} className="text-brand-muted hover:text-brand-error cursor-pointer">Remove</button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
