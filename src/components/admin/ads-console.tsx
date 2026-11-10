'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import type { AdsSettings } from '@/lib/ads/settings';

type Message = { tone: 'confirmed' | 'danger'; text: string } | null;

async function send(url: string, method: string, body?: unknown, raw?: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: raw !== undefined ? { 'content-type': 'text/csv' } : { 'content-type': 'application/json' },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const errorText = (data: Record<string, unknown>) => {
  const fields = data.fieldErrors as Record<string, string[]> | undefined;
  const detail = fields ? Object.entries(fields).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') : (data.problems as string[] | undefined)?.join('; ');
  return [typeof data.error === 'string' ? data.error : 'Request failed', detail].filter(Boolean).join(' ');
};

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const run = async (fn: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, done: (data: Record<string, unknown>) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await fn();
      setMessage(ok ? { tone: 'confirmed', text: done(data) } : { tone: 'danger', text: errorText(data) });
      if (ok) router.refresh();
    } catch {
      setMessage({ tone: 'danger', text: 'Network error' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

const usd = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(Number(v) * 100);

export function RunNowButton() {
  const { busy, message, run } = useAction();
  return (
    <div className="space-y-3">
      <Button disabled={busy} onClick={() => run(() => send('/api/cron/ads-loop', 'POST'), d => `Run complete: ${d.applied} applied, ${d.pending} queued, ${d.failed} failed`)}>
        {busy ? 'Running' : 'Run the loop now'}
      </Button>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}

export function AdsSettingsForm({ initial }: { initial: AdsSettings }) {
  const { busy, message, run } = useAction();
  const [f, setF] = useState({
    enabled: initial.enabled ? 'true' : 'false',
    mode: initial.mode,
    goal: usd(initial.monthlyNetGoalCents),
    cap: usd(initial.monthlySpendCapCents),
    minDaily: usd(initial.minDailyBudgetCents),
    adsPerCampaign: String(initial.adsPerCampaign),
    minClicks: String(initial.minClicksToJudge),
    bookingRate: String(initial.assumedBookingRateBps / 100),
    netPerBooking: usd(initial.assumedNetPerBookingCents),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => run(() => send('/api/admin/ads/settings', 'PATCH', {
    enabled: f.enabled === 'true',
    mode: f.mode,
    monthlyNetGoalCents: toCents(f.goal),
    monthlySpendCapCents: toCents(f.cap),
    minDailyBudgetCents: toCents(f.minDaily),
    adsPerCampaign: Number(f.adsPerCampaign),
    minClicksToJudge: Number(f.minClicks),
    assumedBookingRateBps: Math.round(Number(f.bookingRate) * 100),
    assumedNetPerBookingCents: toCents(f.netPerBooking),
  }), () => 'Settings saved');

  return (
    <Card>
      <h2 className="text-title text-ink mb-2">Loop settings</h2>
      <p className="text-body text-ink-muted mb-6">The loop never budgets past the monthly spend cap. The two assumptions stand in until real bookings outweigh them.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Select label="Loop" value={f.enabled} onChange={set('enabled')} options={[{ value: 'false', label: 'Off: measure only' }, { value: 'true', label: 'On: change ads and budgets' }]} />
        <Select label="Changes are made" value={f.mode} onChange={set('mode')} options={[{ value: 'manual', label: 'By hand, from the queue below' }, { value: 'api', label: 'By the loop, through the Google Ads API' }]} />
        <Input label="Monthly net goal (USD)" inputMode="decimal" value={f.goal} onChange={set('goal')} />
        <Input label="Monthly ad spend cap (USD)" inputMode="decimal" value={f.cap} onChange={set('cap')} />
        <Input label="Lowest daily budget per campaign (USD)" inputMode="decimal" value={f.minDaily} onChange={set('minDaily')} />
        <Input label="Live ads per campaign" inputMode="numeric" value={f.adsPerCampaign} onChange={set('adsPerCampaign')} />
        <Input label="Clicks before an ad is judged" inputMode="numeric" value={f.minClicks} onChange={set('minClicks')} />
        <Input label="Assumed requests that book (%)" inputMode="decimal" value={f.bookingRate} onChange={set('bookingRate')} />
        <Input label="Assumed net per booking (USD)" inputMode="decimal" value={f.netPerBooking} onChange={set('netPerBooking')} />
      </div>
      <div className="mt-6 space-y-3">
        <Button disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save settings'}</Button>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    </Card>
  );
}

export function CampaignForm() {
  const { busy, message, run } = useAction();
  const [f, setF] = useState({ name: '', origin: '', dest: '', landing: '/book', budget: '', campaign: '', adGroup: '', budgetResource: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const create = () => run(() => send('/api/admin/ads/campaigns', 'POST', {
    name: f.name,
    originCode: f.origin.trim() || undefined,
    destCode: f.dest.trim() || undefined,
    landingPath: f.landing,
    dailyBudgetCents: toCents(f.budget || '0'),
    platformCampaign: f.campaign.trim() || undefined,
    platformAdGroup: f.adGroup.trim() || undefined,
    platformBudget: f.budgetResource.trim() || undefined,
  }), () => 'Campaign added. Its first ads are written on the next run.');

  return (
    <Card>
      <h2 className="text-title text-ink mb-2">Add a campaign</h2>
      <p className="text-body text-ink-muted mb-6">One campaign per route, matching a search campaign and ad group you created in Google Ads. Leave the airports empty for a campaign that is not tied to a route. The three resource names are needed only for the API.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Input label="Name" value={f.name} onChange={set('name')} placeholder="HNL-OGG" />
        <Input label="From (airport code)" value={f.origin} onChange={set('origin')} placeholder="HNL" />
        <Input label="To (airport code)" value={f.dest} onChange={set('dest')} placeholder="OGG" />
        <Select label="Landing page" value={f.landing} onChange={set('landing')} options={[{ value: '/book', label: 'Request quotes (/book)' }, { value: '/empty-legs', label: 'Empty legs (/empty-legs)' }]} />
        <Input label="Daily budget (USD)" inputMode="decimal" value={f.budget} onChange={set('budget')} />
        <Input label="Google campaign resource name" value={f.campaign} onChange={set('campaign')} placeholder="customers/123/campaigns/456" />
        <Input label="Google ad group resource name" value={f.adGroup} onChange={set('adGroup')} placeholder="customers/123/adGroups/789" />
        <Input label="Google budget resource name" value={f.budgetResource} onChange={set('budgetResource')} placeholder="customers/123/campaignBudgets/321" />
      </div>
      <div className="mt-6 space-y-3">
        <Button disabled={busy || !f.name.trim()} onClick={create}>{busy ? 'Adding' : 'Add campaign'}</Button>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    </Card>
  );
}

export function MetricsImport() {
  const { busy, message, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const upload = () => run(async () => send('/api/admin/ads/metrics', 'POST', undefined, await file!.text()), d => `Imported ${d.imported} ad-days, skipped ${d.skipped} rows`);
  return (
    <Card>
      <h2 className="text-title text-ink mb-2">Import ad results</h2>
      <p className="text-body text-ink-muted mb-6">Until the API is connected: in Google Ads, download the Ads report as CSV, segmented by Day, with the columns Day, Final URL, Impr., Clicks and Cost. Importing the same days again replaces them.</p>
      <label className="block text-label text-ink-muted mb-2" htmlFor="ads-csv">Report file (CSV)</label>
      <input id="ads-csv" type="file" accept=".csv,text/csv" className="block text-body text-ink" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <div className="mt-6 space-y-3">
        <Button disabled={busy || !file} onClick={upload}>{busy ? 'Importing' : 'Import report'}</Button>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    </Card>
  );
}

export function ResolveAction({ id, kind }: { id: number; kind: string }) {
  const { busy, message, run } = useAction();
  const [adId, setAdId] = useState('');
  const resolve = (status: 'applied' | 'dismissed') =>
    run(() => send(`/api/admin/ads/actions/${id}`, 'PATCH', { status, platformAdId: status === 'applied' && adId.trim() ? adId.trim() : undefined }), () => (status === 'applied' ? 'Marked as applied' : 'Dismissed'));
  return (
    <div className="space-y-3">
      {kind === 'launch' && <Input label="Google ad ID (optional)" inputMode="numeric" value={adId} onChange={e => setAdId(e.target.value)} />}
      <div className="flex flex-wrap gap-3">
        <Button size="sm" disabled={busy} onClick={() => resolve('applied')}>Mark as applied</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => resolve('dismissed')}>Dismiss</Button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
