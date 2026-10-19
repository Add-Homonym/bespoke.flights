'use client';

import { useState } from 'react';
import { Building2, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { PasswordReveal, apiError } from '@/components/admin/password-reveal';
import { FLEET_TYPE_LABELS, MARKET_LABELS, SAFETY_RATINGS } from '@/lib/types';
import type { AdminOperatorRow } from '@/lib/admin/operators';
export type { AdminOperatorRow };

type Status = 'pending' | 'approved' | 'suspended';


const STATUS_BADGE: Record<Status, 'warning' | 'confirmed' | 'danger'> = { pending: 'warning', approved: 'confirmed', suspended: 'danger' };
const selectClass = 'block h-12 w-full rounded-md border border-border-control bg-surface-raised px-4 text-body text-ink';
const list = (json: string | null): string[] => { try { return JSON.parse(json ?? '[]'); } catch { return []; } };

function StatusSelect({ id, value, onChange }: { id: string; value: Status; onChange: (s: Status) => void }) {
  return (
    <select id={id} value={value} onChange={e => onChange(e.target.value as Status)} className={selectClass}>
      <option value="pending">Pending</option>
      <option value="approved">Approved</option>
      <option value="suspended">Suspended</option>
    </select>
  );
}

function Chips({ legend, options, value, onChange }: { legend: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-label text-ink-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([k, label]) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== k) : [...value, k])}
              className={`inline-flex min-h-11 items-center rounded-pill border px-3 text-label cursor-pointer transition-colors ${on ? 'border-royal bg-royal text-on-royal' : 'border-border-control text-ink hover:bg-surface-sunken'}`}>
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AddOperator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [v, setV] = useState({ companyName: '', name: '', email: '', phone: '', certificate: '', status: 'approved' as Status, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setMessage('');
    const res = await fetch('/api/admin/operators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).catch(() => null);
    setSaving(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) { const err = apiError(body); setErrors(err.fields); setMessage(err.message); return; }
    setCreated({ email: v.email.trim().toLowerCase(), password: body.password });
    onCreated();
  };

  if (created) return <PasswordReveal email={created.email} password={created.password} onDone={onCancel} />;

  return (
    <form id="add-operator-form" onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
      <h2 className="text-heading text-ink">Add operator</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Company name" value={v.companyName} onChange={set('companyName')} error={errors.companyName} required />
        <Input label="Contact name" value={v.name} onChange={set('name')} error={errors.name} required />
        <Input label="Email (sign-in)" type="email" value={v.email} onChange={set('email')} error={errors.email} required autoComplete="off" />
        <Input label="Phone (optional)" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} />
        <Input label="Part 135 certificate (optional)" value={v.certificate} onChange={set('certificate')} error={errors.certificate} />
        <div className="space-y-2">
          <label htmlFor="add-operator-status" className="block text-label text-ink-muted">Status</label>
          <StatusSelect id="add-operator-status" value={v.status} onChange={status => setV({ ...v, status })} />
        </div>
        <Input label="Password (optional)" value={v.password} onChange={set('password')} error={errors.password} placeholder="Leave blank to generate one" autoComplete="off" />
      </div>
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add operator'}</Button>
      </div>
    </form>
  );
}

function EditOperator({ op, onSaved, onCancel }: { op: AdminOperatorRow; onSaved: (o: Partial<AdminOperatorRow>) => void; onCancel: () => void }) {
  const [v, setV] = useState({
    company_name: op.company_name, status: op.status, certificate: op.certificate ?? '',
    contact_method: op.contact_method, contact_email: op.contact_email ?? '', contact_phone: op.contact_phone ?? '',
    safety_rating: op.safety_rating ?? '', markets: list(op.markets), fleet_types: list(op.fleet_types),
    range_max_nm: op.range_max_nm ? String(op.range_max_nm) : '', notes: op.notes ?? '',
    platform_fee_pct: op.platform_fee_bps != null ? String(op.platform_fee_bps / 100) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setMessage('');
    const { platform_fee_pct, range_max_nm, ...rest } = v;
    const payload = {
      ...rest,
      safety_rating: rest.safety_rating || null,
      certificate: rest.certificate || null,
      notes: rest.notes || null,
      range_max_nm: range_max_nm ? Number(range_max_nm) : null,
      platform_fee_bps: platform_fee_pct === '' ? null : Math.round(Number(platform_fee_pct) * 100),
    };
    const res = await fetch(`/api/admin/operators/${op.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    setSaving(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) { const err = apiError(body); setErrors(err.fields); setMessage(err.message); return; }
    onSaved(body);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5 border-t border-hairline pt-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Company name" value={v.company_name} onChange={set('company_name')} error={errors.company_name} />
        <div className="space-y-2">
          <label htmlFor={`op-status-${op.id}`} className="block text-label text-ink-muted">Status</label>
          <StatusSelect id={`op-status-${op.id}`} value={v.status} onChange={status => setV({ ...v, status })} />
        </div>
        <Input label="Part 135 certificate" value={v.certificate} onChange={set('certificate')} error={errors.certificate} />
        <div className="space-y-2">
          <label htmlFor={`op-method-${op.id}`} className="block text-label text-ink-muted">Send requests by</label>
          <select id={`op-method-${op.id}`} value={v.contact_method} onChange={set('contact_method')} className={selectClass}>
            <option value="email">Email</option><option value="text">Text</option><option value="both">Email and text</option>
          </select>
        </div>
        <Input label="Requests email" type="email" value={v.contact_email} onChange={set('contact_email')} error={errors.contact_email} />
        <Input label="Requests phone" type="tel" value={v.contact_phone} onChange={set('contact_phone')} error={errors.contact_phone} />
        <div className="space-y-2">
          <label htmlFor={`op-safety-${op.id}`} className="block text-label text-ink-muted">Safety rating</label>
          <select id={`op-safety-${op.id}`} value={v.safety_rating} onChange={set('safety_rating')} className={selectClass}>
            <option value="">Not set</option>
            {SAFETY_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Input label="Max range (nm)" type="number" min={0} value={v.range_max_nm} onChange={set('range_max_nm')} error={errors.range_max_nm} />
        <Input label="Platform fee (%)" type="number" min={0} max={50} step={0.1} value={v.platform_fee_pct} onChange={set('platform_fee_pct')}
          placeholder="Default" error={errors.platform_fee_bps} />
      </div>
      <Chips legend="Markets" options={MARKET_LABELS} value={v.markets} onChange={markets => setV({ ...v, markets })} />
      <Chips legend="Aircraft categories" options={FLEET_TYPE_LABELS} value={v.fleet_types} onChange={fleet_types => setV({ ...v, fleet_types })} />
      <div className="space-y-2">
        <label htmlFor={`op-notes-${op.id}`} className="block text-label text-ink-muted">Notes</label>
        <textarea id={`op-notes-${op.id}`} rows={2} maxLength={2000} value={v.notes} onChange={set('notes')}
          className="block w-full resize-y rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink" />
      </div>
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save operator'}</Button>
      </div>
    </form>
  );
}

export function OperatorsManager({ initial }: { initial: AdminOperatorRow[] }) {
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const reload = async () => {
    const res = await fetch('/api/admin/operators/list', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setRows(await res.json());
  };
  const quickStatus = async (op: AdminOperatorRow, status: Status) => {
    const res = await fetch(`/api/admin/operators/${op.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (res.ok) setRows(rows.map(r => (r.id === op.id ? { ...r, status } : r)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!adding && <Button onClick={() => setAdding(true)}><Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Add operator</Button>}
      </div>
      {adding && <AddOperator onCreated={reload} onCancel={() => setAdding(false)} />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-control px-6 py-10 text-center text-body text-ink-muted">No operators yet.</p>
      ) : (
        <ul id="operators-list" className="space-y-3">
          {rows.map(op => (
            <li key={op.id} id={`operator-${op.id}`} className={`rounded-lg border bg-surface-raised p-5 shadow-raised ${op.status === 'pending' ? 'border-warning' : 'border-hairline'}`}>
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-royal">
                  <Building2 size={20} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-heading text-ink">{op.company_name}</h2>
                  <p className="text-label text-ink-muted">{op.name} · <span className="font-mono">{op.email}</span>{op.phone ? ` · ${op.phone}` : ''}</p>
                  <p className="text-label text-ink-muted">
                    {[op.certificate ? `Cert ${op.certificate}` : null, `${op.aircraft_count} aircraft`, op.safety_rating, `Joined ${new Date(op.created_at).toLocaleDateString()}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge variant={STATUS_BADGE[op.status]}>{op.status}</StatusBadge>
                  {op.status !== 'approved' && editing !== op.id && <Button size="sm" onClick={() => quickStatus(op, 'approved')}>Approve</Button>}
                  <button type="button" aria-expanded={editing === op.id} aria-label={`${editing === op.id ? 'Close' : 'Edit'} ${op.company_name}`}
                    onClick={() => setEditing(editing === op.id ? null : op.id)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink cursor-pointer">
                    {editing === op.id ? <X size={16} strokeWidth={1.5} aria-hidden="true" /> : <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {editing === op.id && (
                <EditOperator op={op} onCancel={() => setEditing(null)}
                  onSaved={o => { setRows(rows.map(r => (r.id === op.id ? { ...r, ...o } : r))); setEditing(null); }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
