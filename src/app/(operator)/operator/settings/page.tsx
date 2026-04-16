'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  user_email: string;
  user_phone: string | null;
}

export default function OperatorSettingsPage() {
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/operator/settings').then(r => r.json()).then(setSettings);
  }, []);

  const save = async (patch: Partial<OperatorSettings>) => {
    setSaving(true);
    setMessage('');
    const res = await fetch('/api/operator/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings(updated);
      setMessage('Saved');
      setTimeout(() => setMessage(''), 2000);
    }
    setSaving(false);
  };

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  if (!settings) return <div className="text-brand-muted p-10">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-brand-cream mb-2">Operator Settings</h1>
          <p className="text-brand-muted">Configure how Bespoke Flights reaches you with charter requests.</p>
        </div>
        {message && <Badge variant="success">{message}</Badge>}
      </div>

      {/* Contact Method */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-6">Contact Preferences</h2>
        <p className="text-brand-cream/70 text-sm mb-6">
          When a traveler submits a charter request that matches your profile, we automatically send you the RFQ via your preferred method.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-muted mb-3">Preferred Contact Method</label>
            <div className="flex rounded-lg border border-brand-border overflow-hidden">
              {(['email', 'text', 'both'] as const).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => save({ contact_method: method })}
                  className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer capitalize ${
                    settings.contact_method === method
                      ? 'bg-brand-gold text-brand-dark'
                      : 'text-brand-muted hover:text-brand-cream'
                  }`}
                >
                  {method === 'both' ? 'Email + Text' : method}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Charter Sales Email"
                type="email"
                defaultValue={settings.contact_email || settings.user_email}
                placeholder="charter@yourcompany.com"
                onBlur={e => save({ contact_email: e.target.value })}
              />
              <p className="text-brand-muted/50 text-xs mt-1">
                RFQs are sent here. Defaults to your account email.
              </p>
            </div>
            <div>
              <Input
                label="Charter Sales Phone (SMS)"
                type="tel"
                defaultValue={settings.contact_phone || settings.user_phone || ''}
                placeholder="+1-555-123-4567"
                onBlur={e => save({ contact_phone: e.target.value })}
              />
              <p className="text-brand-muted/50 text-xs mt-1">
                For text message RFQs. US numbers only for now.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Safety & Certification */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-6">Safety & Certification</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label="FAA Certificate Number"
            defaultValue={settings.certificate || ''}
            placeholder="FAA-135-XXXX"
            onBlur={e => save({ certificate: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-brand-muted mb-1.5">Highest Safety Rating</label>
            <select
              value={settings.safety_rating || ''}
              onChange={e => save({ safety_rating: e.target.value })}
              className="w-full rounded-lg border border-brand-border bg-brand-navy px-4 py-2.5 text-brand-cream focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors"
            >
              <option value="">Select...</option>
              {SAFETY_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Market Coverage */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4">Market Coverage</h2>
        <p className="text-brand-cream/70 text-sm mb-6">
          Select the markets you serve. The matching engine uses this to route relevant requests to you.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(MARKET_LABELS) as [MarketKey, string][]).map(([key, label]) => {
            const active = settings.markets.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => save({ markets: toggleArrayItem(settings.markets, key) })}
                className={`rounded-lg border px-4 py-3 text-sm text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-brand-gold bg-brand-gold/10 text-brand-cream'
                    : 'border-brand-border text-brand-muted hover:border-brand-gold/30'
                }`}
              >
                <span className={active ? 'text-brand-gold' : ''}>●</span>{' '}{label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-4 mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.hi_capable}
              onChange={e => save({ hi_capable: e.target.checked ? 1 : 0 })}
              className="rounded border-brand-border bg-brand-navy text-brand-gold focus:ring-brand-gold"
            />
            <span className="text-sm text-brand-cream">Hawaii capable</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.transoceanic}
              onChange={e => save({ transoceanic: e.target.checked ? 1 : 0 })}
              className="rounded border-brand-border bg-brand-navy text-brand-gold focus:ring-brand-gold"
            />
            <span className="text-sm text-brand-cream">Transoceanic capable</span>
          </label>
        </div>
      </Card>

      {/* Fleet Types */}
      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4">Fleet Categories</h2>
        <p className="text-brand-cream/70 text-sm mb-6">
          Which aircraft categories do you operate? This is used in addition to your actual fleet inventory.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(FLEET_TYPE_LABELS).map(([key, label]) => {
            const active = settings.fleet_types.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => save({ fleet_types: toggleArrayItem(settings.fleet_types, key) })}
                className={`rounded-lg border px-4 py-3 text-sm text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-brand-gold bg-brand-gold/10 text-brand-cream'
                    : 'border-brand-border text-brand-muted hover:border-brand-gold/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <Input
            label="Maximum Range (NM)"
            type="number"
            defaultValue={settings.range_max_nm || ''}
            placeholder="7000"
            onBlur={e => save({ range_max_nm: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </Card>

      {/* Status info */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-muted text-xs uppercase tracking-wider">Matching Engine Status</p>
            <p className="text-brand-cream mt-1">
              {settings.status === 'approved'
                ? 'Active — you will receive RFQs for matching requests automatically.'
                : settings.status === 'pending'
                  ? 'Pending approval — configure your profile now, RFQs will begin once approved.'
                  : 'Suspended — contact support.'
              }
            </p>
          </div>
          <Badge variant={settings.status === 'approved' ? 'success' : settings.status === 'pending' ? 'warning' : 'error'}>
            {settings.status}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
