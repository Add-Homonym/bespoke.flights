'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { FieldStatus, type SaveState } from '@/components/ui/field-status';
import { readApiFailure } from '@/lib/api/form-errors';
import { PayoutSettings } from '@/components/operator/payout-settings';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { MARKET_LABELS, FLEET_TYPE_LABELS, SAFETY_RATINGS } from '@/lib/types';
import type { MarketKey } from '@/lib/types';

interface OperatorSettings {
  id: number;
  company_name: string;
  status: string;
  contact_method: string;
  contact_email: string | null;
  contact_phone: string | null;
  safety_rating: string | null;
  fleet_types: string[];
  markets: string[];
  range_max_nm: number | null;
  hi_capable: number;
  transoceanic: number;
  certificate: string | null;
  notes: string | null;
  cancellation_policy: { full_refund_hours: number; partial_refund_hours: number; partial_refund_bps: number };
  cancellation_policy_custom: boolean;
  user_email: string;
  user_phone: string | null;
}

export default function OperatorSettingsPage() {
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/operator/settings').then(r => r.json()).then(setSettings);
  }, []);

  /** Which field last saved or failed, so the result shows next to it. */
  const [fieldState, setFieldState] = useState<Record<string, SaveState>>({});
  const mark = (key: string, state: SaveState | null) => setFieldState(prev => {
    const next = { ...prev };
    if (state) next[key] = state; else delete next[key];
    return next;
  });

  /** Saves `patch`; resolves to an error message on failure so the caller can revert the field. */
  const save = async (key: string, patch: Record<string, unknown>, apiKey = key): Promise<string | null> => {
    setMessage('');
    mark(key, null);
    let failure: string;
    try {
      const res = await fetch('/api/operator/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setSettings(await res.json());
        mark(key, { kind: 'saved' });
        setMessage('Saved');
        setTimeout(() => { setMessage(''); mark(key, null); }, 2500);
        return null;
      }
      const err = await readApiFailure(res, 'Could not save. Try again.');
      failure = err.fields[apiKey] ?? Object.values(err.fields)[0] ?? err.message;
    } catch {
      failure = 'Could not save. Check your connection and try again.';
    }
    mark(key, { kind: 'error', message: failure });
    return failure;
  };

  const savePolicy = async (key: keyof OperatorSettings['cancellation_policy'], value: number): Promise<string | null> => {
    if (!settings) return null;
    const pct = key === 'partial_refund_bps';
    if (!Number.isInteger(pct ? value / 100 : value) || value < 0) {
      const message = pct ? 'Enter a whole percentage from 0 to 100' : 'Enter a whole number of hours';
      mark(key, { kind: 'error', message });
      return message;
    }
    return save(key, { cancellation_policy: { ...settings.cancellation_policy, [key]: value } }, `cancellation_policy.${key}`);
  };

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  if (!settings) return <div className="text-ink-muted p-10">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">Operator Settings</h1>
          <p className="text-ink-muted">Configure how Bespoke Flights reaches you with charter requests.</p>
        </div>
        {message && <StatusBadge variant="confirmed">{message}</StatusBadge>}
      </div>

      <Link href="/operator/autopilot" className="mb-6 flex min-h-11 items-center gap-3 rounded-lg border border-hairline bg-surface-raised px-6 py-4 text-body text-ink shadow-raised transition-colors duration-200 hover:border-border-control">
        <Bot size={20} strokeWidth={1.5} aria-hidden="true" className="text-royal" />
        <span>Autopilot: drafted quotes from your pricing parameters</span>
        <span className="ml-auto text-label text-royal">Open console</span>
      </Link>

      <div id="payouts" className="scroll-mt-6"><PayoutSettings /></div>

      {/* Contact Method */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-6">Contact Preferences</h2>
        <p className="text-ink-muted text-sm mb-6">
          When a traveler submits a charter request that matches your profile, we automatically send you the RFQ via your preferred method.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-3">Preferred Contact Method</label>
            <div className="flex rounded-md border border-hairline overflow-hidden">
              {(['email', 'text', 'both'] as const).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => save('contact_method', { contact_method: method })}
                  className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer capitalize ${
                    settings.contact_method === method
                      ? 'bg-royal text-on-royal'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {method === 'both' ? 'Email + Text' : method}
                </button>
              ))}
            </div>
            <FieldStatus state={fieldState.contact_method} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SettingInput
              label="Charter Sales Email"
              type="email"
              saved={settings.contact_email || settings.user_email}
              state={fieldState.contact_email}
              placeholder="charter@yourcompany.com"
              onCommit={v => save('contact_email', { contact_email: v })}
              hint="RFQs are sent here. Defaults to your account email."
            />
            <SettingInput
              label="Charter Sales Phone (SMS)"
              type="tel"
              saved={settings.contact_phone || settings.user_phone || ''}
              state={fieldState.contact_phone}
              placeholder="+1-555-123-4567"
              onCommit={v => save('contact_phone', { contact_phone: v })}
              hint="For text message RFQs. US numbers only for now."
            />
          </div>
        </div>
      </Card>

      {/* Safety & Certification */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-6">Safety & Certification</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <SettingInput
            label="FAA Certificate Number"
            saved={settings.certificate || ''}
            state={fieldState.certificate}
            placeholder="FAA-135-XXXX"
            onCommit={v => save('certificate', { certificate: v })}
          />
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1.5">Highest Safety Rating</label>
            <select
              value={settings.safety_rating || ''}
              onChange={e => { void save('safety_rating', { safety_rating: e.target.value }); }}
              className="w-full rounded-md border border-hairline bg-surface-raised px-4 py-2.5 text-ink transition-colors"
            >
              <option value="">Select...</option>
              {SAFETY_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <FieldStatus state={fieldState.safety_rating} className="mt-1" />
          </div>
        </div>
      </Card>

      {/* Cancellation policy */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-2">Cancellation policy</h2>
        <p className="text-ink-muted text-sm mb-6">
          Applied when a traveler cancels a paid booking. Refunds are measured from the first leg&apos;s departure and go back automatically.
          {!settings.cancellation_policy_custom && ' Showing the platform default.'}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <SettingInput
            label="Full refund until (hours before)"
            type="number"
            min={0}
            step={1}
            saved={String(settings.cancellation_policy.full_refund_hours)}
            state={fieldState.full_refund_hours}
            onCommit={v => savePolicy('full_refund_hours', Number(v))}
          />
          <SettingInput
            label="Partial refund until (hours before)"
            type="number"
            min={0}
            step={1}
            saved={String(settings.cancellation_policy.partial_refund_hours)}
            state={fieldState.partial_refund_hours}
            onCommit={v => savePolicy('partial_refund_hours', Number(v))}
          />
          <SettingInput
            label="Partial refund (%)"
            type="number"
            min={0}
            max={100}
            step={1}
            saved={String(settings.cancellation_policy.partial_refund_bps / 100)}
            state={fieldState.partial_refund_bps}
            onCommit={v => savePolicy('partial_refund_bps', Math.round(Number(v) * 100))}
          />
        </div>
      </Card>

      {/* Market Coverage */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Market Coverage</h2>
        <p className="text-ink-muted text-sm mb-6">
          Select the markets you serve. The matching engine uses this to route relevant requests to you.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(MARKET_LABELS) as [MarketKey, string][]).map(([key, label]) => {
            const active = settings.markets.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => save('markets', { markets: toggleArrayItem(settings.markets, key) })}
                className={`rounded-md border px-4 py-3 text-sm text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-brass bg-surface-raised text-ink'
                    : 'border-hairline text-ink-muted hover:border-border-control'
                }`}
              >
                <span className={active ? 'text-royal' : ''}>●</span>{' '}{label}
              </button>
            );
          })}
        </div>
        <FieldStatus state={fieldState.markets} className="mt-2" />

        <div className="flex gap-4 mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.hi_capable}
              onChange={e => { void save('hi_capable', { hi_capable: e.target.checked ? 1 : 0 }); }}
              className="rounded border-hairline bg-surface-raised text-royal "
            />
            <span className="text-sm text-ink">Hawaii capable</span>
            <FieldStatus state={fieldState.hi_capable} />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.transoceanic}
              onChange={e => { void save('transoceanic', { transoceanic: e.target.checked ? 1 : 0 }); }}
              className="rounded border-hairline bg-surface-raised text-royal "
            />
            <span className="text-sm text-ink">Transoceanic capable</span>
            <FieldStatus state={fieldState.transoceanic} />
          </label>
        </div>
      </Card>

      {/* Fleet Types */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Fleet Categories</h2>
        <p className="text-ink-muted text-sm mb-6">
          Which aircraft categories do you operate? This is used in addition to your actual fleet inventory.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(FLEET_TYPE_LABELS).map(([key, label]) => {
            const active = settings.fleet_types.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => save('fleet_types', { fleet_types: toggleArrayItem(settings.fleet_types, key) })}
                className={`rounded-md border px-4 py-3 text-sm text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-brass bg-surface-raised text-ink'
                    : 'border-hairline text-ink-muted hover:border-border-control'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FieldStatus state={fieldState.fleet_types} className="mt-2" />

        <div className="mt-4">
          <SettingInput
            label="Maximum Range (NM)"
            type="number"
            saved={String(settings.range_max_nm || '')}
            state={fieldState.range_max_nm}
            placeholder="7000"
            onCommit={v => save('range_max_nm', { range_max_nm: v ? Number(v) : null })}
          />
        </div>
      </Card>

      {/* Status info */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ink-muted text-xs uppercase tracking-wider">Matching Engine Status</p>
            <p className="text-ink mt-1">
              {settings.status === 'approved'
                ? 'Active — you will receive RFQs for matching requests automatically.'
                : settings.status === 'pending'
                  ? 'Pending approval — configure your profile now, RFQs will begin once approved.'
                  : 'Suspended — contact support.'
              }
            </p>
          </div>
          <StatusBadge variant={settings.status === 'approved' ? 'confirmed' : settings.status === 'pending' ? 'warning' : 'danger'}>
            {settings.status}
          </StatusBadge>
        </div>
      </Card>
    </div>
  );
}

/**
 * A text or number field that saves when you leave it. A rejected save puts
 * the last saved value back and shows the reason under the field; "Saved"
 * appears under the field that saved.
 */
function SettingInput({ label, saved, state, onCommit, hint, ...rest }: {
  label: string;
  /** The last value the server accepted. */
  saved: string;
  state?: SaveState;
  /** Resolves to an error message when the save was rejected. */
  onCommit: (value: string) => Promise<string | null>;
  hint?: ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [value, setValue] = useState(saved);
  useEffect(() => { setValue(saved); }, [saved]);
  const rejected = state?.kind === 'error';
  return (
    <div>
      <Input
        label={label}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={async () => {
          if (value === saved) return;
          const failure = await onCommit(value);
          if (failure) setValue(saved);
        }}
        error={rejected ? state.message : undefined}
        {...rest}
      />
      {state?.kind === 'saved' && <FieldStatus state={state} className="mt-1" />}
      {hint && <p className="text-ink-subtle text-xs mt-1">{hint}</p>}
    </div>
  );
}
