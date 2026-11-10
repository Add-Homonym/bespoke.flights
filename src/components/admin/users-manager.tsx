'use client';

import { useMemo, useState } from 'react';
import { Pencil, Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { PasswordReveal, apiError } from '@/components/admin/password-reveal';

type Role = 'customer' | 'operator' | 'admin';

export interface AdminUserRow {
  id: number;
  email: string;
  phone: string | null;
  name: string;
  role: Role;
  created_at: string;
  operator_id: number | null;
  company_name: string | null;
}

const ROLE_LABEL: Record<Role, string> = { customer: 'Traveler', operator: 'Operator', admin: 'Admin' };
const ROLE_BADGE: Record<Role, 'neutral' | 'confirmed' | 'warning'> = { customer: 'neutral', operator: 'confirmed', admin: 'warning' };
const selectClass = 'block h-12 w-full rounded-md border border-border-control bg-surface-raised px-4 text-body text-ink';

function RoleSelect({ id, value, onChange, disabled }: { id: string; value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value as Role)} className={selectClass}>
      {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

/** Add-user form. */
function AddUser({ onCreated, onCancel }: { onCreated: (u: AdminUserRow) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: '', email: '', phone: '', role: 'customer' as Role, companyName: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setMessage('');
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...v, companyName: v.role === 'operator' ? v.companyName : null }),
    }).catch(() => null);
    setSaving(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) { const err = apiError(body); setErrors(err.fields); setMessage(err.message); return; }
    setCreated({ email: v.email.trim().toLowerCase(), password: body.password });
    onCreated({
      id: body.id, email: v.email.trim().toLowerCase(), phone: v.phone || null, name: v.name.trim(), role: v.role,
      created_at: new Date().toISOString(), operator_id: body.operatorId ?? null, company_name: v.role === 'operator' ? v.companyName : null,
    });
  };

  if (created) return <PasswordReveal email={created.email} password={created.password} onDone={onCancel} />;

  return (
    <form id="add-user-form" onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
      <h2 className="text-heading text-ink">Add user</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Full name" value={v.name} onChange={set('name')} error={errors.name} required autoComplete="off" />
        <Input label="Email" type="email" value={v.email} onChange={set('email')} error={errors.email} required autoComplete="off" />
        <Input label="Phone (optional)" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} autoComplete="off" />
        <div className="space-y-2">
          <label htmlFor="add-user-role" className="block text-label text-ink-muted">Role</label>
          <RoleSelect id="add-user-role" value={v.role} onChange={role => setV({ ...v, role })} />
        </div>
        {v.role === 'operator' && (
          <Input label="Company name" value={v.companyName} onChange={set('companyName')} error={errors.companyName} required />
        )}
        <Input label="Password (optional)" type="text" value={v.password} onChange={set('password')} error={errors.password}
          placeholder="Leave blank to generate one" autoComplete="off" />
      </div>
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add user'}</Button>
      </div>
    </form>
  );
}

/** One user's edit form: name, phone, role (and company when becoming an operator). */
function EditUser({ u, isSelf, onSaved, onCancel }: { u: AdminUserRow; isSelf: boolean; onSaved: (u: AdminUserRow) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: u.name, phone: u.phone ?? '', role: u.role, companyName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const needsCompany = v.role === 'operator' && !u.operator_id;
  const roleChange = v.role !== u.role;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setMessage('');
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: v.name, phone: v.phone, ...(roleChange ? { role: v.role } : {}), ...(needsCompany ? { companyName: v.companyName } : {}) }),
    }).catch(() => null);
    setSaving(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) { const err = apiError(body); setErrors(err.fields); setMessage(err.message); return; }
    onSaved(body);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 bg-surface-sunken px-4 py-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Full name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} error={errors.name} />
        <Input label="Phone" type="tel" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} error={errors.phone} />
        <div className="space-y-2">
          <label htmlFor={`role-${u.id}`} className="block text-label text-ink-muted">Role</label>
          <RoleSelect id={`role-${u.id}`} value={v.role} disabled={isSelf} onChange={role => setV({ ...v, role })} />
          {isSelf && <p className="text-label text-ink-muted">You cannot change your own role.</p>}
          {errors.role && <p className="text-label text-danger">{errors.role}</p>}
        </div>
        {needsCompany && <Input label="Company name" value={v.companyName} onChange={e => setV({ ...v, companyName: e.target.value })} error={errors.companyName} />}
      </div>
      {roleChange && (
        <Notice tone="warning">
          {ROLE_LABEL[u.role]} → {ROLE_LABEL[v.role]}. Takes effect on their next page load.
          {v.role === 'admin' ? ' Admins can see and change everything.' : ''}
          {u.role === 'operator' ? ' Their company profile, aircraft and quotes are kept.' : ''}
        </Notice>
      )}
      {message && !errors.role && <Notice tone="danger">{message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}

export function UsersManager({ initial, selfId }: { initial: AdminUserRow[]; selfId: number }) {
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => (role === 'all' || r.role === role)
      && (!s || [r.name, r.email, r.company_name ?? '', r.phone ?? ''].some(x => x.toLowerCase().includes(s))));
  }, [rows, q, role]);
  const counts = useMemo(() => rows.reduce((c, r) => ({ ...c, [r.role]: (c[r.role] ?? 0) + 1 }), {} as Record<string, number>), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input id="user-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, company"
            className="block h-12 w-full rounded-md border border-border-control bg-surface-raised pl-10 pr-4 text-body text-ink placeholder:text-ink-subtle" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by role">
          {(['all', 'customer', 'operator', 'admin'] as const).map(r => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}
              className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-label cursor-pointer transition-colors ${role === r ? 'border-royal bg-royal text-on-royal' : 'border-border-control text-ink hover:bg-surface-sunken'}`}>
              {r === 'all' ? `All ${rows.length}` : `${ROLE_LABEL[r]}s ${counts[r] ?? 0}`}
            </button>
          ))}
        </div>
        {!adding && <Button onClick={() => setAdding(true)}><UserPlus size={16} strokeWidth={1.5} aria-hidden="true" /> Add user</Button>}
      </div>

      {adding && <AddUser onCreated={u => setRows([u, ...rows])} onCancel={() => setAdding(false)} />}

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface-raised">
        <ul id="users-list" className="divide-y divide-hairline">
          {shown.map(u => (
            <li key={u.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{u.name}{u.id === selfId && <span className="text-ink-muted"> (you)</span>}</p>
                  <p className="truncate font-mono text-label text-ink-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                  {u.company_name && <p className="text-label text-ink-muted">{u.company_name}</p>}
                </div>
                <StatusBadge variant={ROLE_BADGE[u.role]} icon={false}>{ROLE_LABEL[u.role]}</StatusBadge>
                <span className="hidden w-24 text-right text-label text-ink-muted sm:inline">{new Date(u.created_at).toLocaleDateString()}</span>
                <button type="button" aria-expanded={editing === u.id} aria-label={`${editing === u.id ? 'Close' : 'Edit'} ${u.name}`}
                  onClick={() => setEditing(editing === u.id ? null : u.id)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink cursor-pointer">
                  {editing === u.id ? <X size={16} strokeWidth={1.5} aria-hidden="true" /> : <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />}
                </button>
              </div>
              {editing === u.id && (
                <EditUser u={u} isSelf={u.id === selfId} onCancel={() => setEditing(null)}
                  onSaved={nu => { setRows(rows.map(r => (r.id === nu.id ? nu : r))); setEditing(null); }} />
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-8 text-center text-body text-ink-muted">No users match.</li>}
        </ul>
      </div>
    </div>
  );
}
