import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import { requireAdminPage } from '@/lib/admin/guard';
import { getDb } from '@/lib/db';
import { getBusinessModel } from '@/lib/business-model';
import { getAdsSettings } from '@/lib/ads/settings';
import { addDays, monthSummary, valuePerRequestCents, variantStats } from '@/lib/ads/measure';
import { googleAdsConfig } from '@/lib/ads/google';
import type { ActionRow, CampaignRow, VariantRow } from '@/lib/ads/loop';
import { AdsSettingsForm, CampaignForm, MetricsImport, ResolveAction, RunNowButton } from '@/components/admin/ads-console';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

export default async function AdminAdsPage() {
  await requireAdminPage();
  const db = getDb();
  const now = new Date();
  const settings = await getAdsSettings(db);
  const model = await getBusinessModel(db);
  const month = await monthSummary(db, model, settings, now);
  const value = await valuePerRequestCents(db, model, settings, now);
  const stats = await variantStats(db, model, addDays(now, -settings.lookbackDays), addDays(now, 1));
  const campaigns = await db.query<CampaignRow>('SELECT * FROM ad_campaigns ORDER BY name');
  const variants = new Map((await db.query<VariantRow>('SELECT * FROM ad_variants')).map(v => [v.id, v]));
  const queue = await db.query<ActionRow>("SELECT * FROM ad_actions WHERE status IN ('pending','failed') ORDER BY created_at DESC LIMIT 50");
  const recent = await db.query<ActionRow>("SELECT * FROM ad_actions WHERE status = 'applied' ORDER BY applied_at DESC LIMIT 15");
  const lastRun = await db.one<{ ran_at: string; mode: string; summary: string }>('SELECT ran_at, mode, summary FROM ad_loop_runs ORDER BY id DESC LIMIT 1');
  const notes = lastRun ? ((JSON.parse(lastRun.summary) as { notes?: string[] }).notes ?? []) : [];
  const apiReady = googleAdsConfig(process.env) !== null;
  const origin = (process.env.APP_URL ?? 'https://bespoke.flights').replace(/\/$/, '');
  const campaignName = (id: number | null) => campaigns.find(c => c.id === id)?.name ?? 'campaign';

  const tiles = [
    { label: `Net after ads, ${month.month}`, value: usd(month.netAfterAdsCents), sub: `goal ${usd(month.goalCents)}` },
    { label: 'Projected month end', value: usd(month.projectedNetCents), sub: `day ${month.daysElapsed} of ${month.daysInMonth}` },
    { label: 'Ad spend this month', value: usd(month.adSpendCents), sub: `cap ${usd(settings.monthlySpendCapCents)}` },
    { label: 'Platform net this month', value: usd(month.platformNetCents), sub: `${month.bookings} paid bookings, ${month.attributedBookings} from ads` },
    { label: 'Bookings still needed', value: Number.isFinite(month.bookingsToGoal) ? String(month.bookingsToGoal) : 'n/a', sub: `at ${usd(month.netPerBookingCents)} net each` },
    { label: 'Value of one ad request', value: usd(value), sub: `${month.attributedRequests} ad requests this month` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display text-ink mb-2">Ads</h1>
        <p className="text-body text-ink-muted">
          The loop measures each ad on requests per click, pauses the ones that lose, writes replacements from approved copy blocks, and moves budget toward campaigns that return more than they cost.
          Net is the platform fee kept on paid bookings, less card processing the platform absorbs, less ad spend.
        </p>
      </div>

      {!settings.enabled && <Notice tone="warning">The loop is off. It measures and changes nothing.</Notice>}
      {settings.enabled && settings.monthlySpendCapCents === 0 && <Notice tone="warning">The monthly spend cap is $0, so every budget is held at zero. Set a cap below.</Notice>}
      {settings.mode === 'api' && !apiReady && <Notice tone="warning">API mode is selected but the Google Ads credentials are incomplete. Changes are queued for you to apply.</Notice>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map(t => (
          <Card key={t.label}>
            <p className="text-label text-ink-muted mb-1">{t.label}</p>
            <p className="text-title text-ink">{t.value}</p>
            <p className="text-label text-ink-muted mt-1">{t.sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-title text-ink mb-2">Changes to apply in Google Ads</h2>
        {queue.length === 0 ? <p className="text-body text-ink-muted">Nothing queued.</p> : (
          <ul className="divide-y divide-hairline">
            {queue.map(a => {
              const v = a.variant_id ? variants.get(a.variant_id) : undefined;
              const detail = JSON.parse(a.detail) as { headlines?: string[]; descriptions?: string[]; finalUrl?: string; fromCents?: number; toCents?: number };
              return (
                <li key={a.id} className="py-4 space-y-3">
                  <p className="text-body text-ink">
                    <strong>{a.kind === 'pause' ? 'Pause ad' : a.kind === 'launch' ? 'Create ad' : 'Set daily budget'}</strong>
                    {' '}in {campaignName(a.campaign_id)}{a.variant_id ? ` (ad ${a.variant_id})` : ''}
                    {a.kind === 'budget' ? `: ${usd(detail.fromCents ?? 0)} to ${usd(detail.toCents ?? 0)}` : ''}
                  </p>
                  <p className="text-label text-ink-muted">{a.reason}</p>
                  {a.status === 'failed' && <Notice tone="danger">{a.error ?? 'The platform refused this change.'}</Notice>}
                  {a.kind === 'launch' && detail.headlines && (
                    <div className="rounded-md border border-hairline bg-surface-sunken p-4 text-body text-ink">
                      {detail.headlines.map(h => <p key={h}>Headline: {h}</p>)}
                      {detail.descriptions?.map(d => <p key={d}>Description: {d}</p>)}
                      <p className="break-all">Final URL: {origin}{detail.finalUrl}</p>
                    </div>
                  )}
                  {a.kind === 'pause' && v && <p className="text-label text-ink-muted">Headlines: {(JSON.parse(v.headlines) as string[]).join(' | ')}</p>}
                  <ResolveAction id={a.id} kind={a.kind} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-title text-ink mb-4">Ads, last {settings.lookbackDays} days</h2>
        {campaigns.length === 0 ? <p className="text-body text-ink-muted">No campaigns yet. Add one below.</p> : (
          <Table>
            <Thead>
              <tr><Th>Campaign</Th><Th>Ad</Th><Th>Angle</Th><Th>Status</Th><Th>Clicks</Th><Th>Cost</Th><Th>Requests</Th><Th>Rate</Th><Th>Bookings</Th><Th>Net</Th></tr>
            </Thead>
            <tbody>
              {campaigns.flatMap(c => {
                const rows = stats.filter(s => s.campaignId === c.id);
                const head = (
                  <Tr key={`c${c.id}`}>
                    <Td><strong>{c.name}</strong></Td>
                    <Td className="text-ink-muted">{usd(c.daily_budget_cents)} a day</Td>
                    <Td>{''}</Td><Td>{c.status}</Td>
                    <Td>{rows.reduce((s, r) => s + r.clicks, 0)}</Td>
                    <Td>{usd(rows.reduce((s, r) => s + r.costCents, 0))}</Td>
                    <Td>{rows.reduce((s, r) => s + r.requests, 0)}</Td>
                    <Td>{pct(rows.reduce((s, r) => s + r.requests, 0), rows.reduce((s, r) => s + r.clicks, 0))}</Td>
                    <Td>{rows.reduce((s, r) => s + r.bookings, 0)}</Td>
                    <Td>{usd(rows.reduce((s, r) => s + r.netRevenueCents - r.costCents, 0))}</Td>
                  </Tr>
                );
                return [head, ...rows.map(r => (
                  <Tr key={r.id}>
                    <Td>{''}</Td>
                    <Td>{r.id}: {(JSON.parse(variants.get(r.id)?.headlines ?? '[]') as string[])[1] ?? ''}</Td>
                    <Td>{r.angle}</Td><Td>{r.status}</Td><Td>{r.clicks}</Td><Td>{usd(r.costCents)}</Td>
                    <Td>{r.requests}</Td><Td>{pct(r.requests, r.clicks)}</Td><Td>{r.bookings}</Td><Td>{usd(r.netRevenueCents - r.costCents)}</Td>
                  </Tr>
                ))];
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="text-title text-ink mb-2">Last run</h2>
        <p className="text-body text-ink-muted mb-4">{lastRun ? `${new Date(lastRun.ran_at).toISOString().replace('T', ' ').slice(0, 16)} UTC, ${lastRun.mode}` : 'The loop has not run yet.'} Runs daily at 16:00 UTC.</p>
        {notes.length > 0 && <ul className="mb-4 list-disc pl-5 text-body text-ink-muted">{notes.map(n => <li key={n}>{n}</li>)}</ul>}
        {recent.length > 0 && (
          <ul className="mb-4 text-body text-ink-muted">
            {recent.map(a => <li key={a.id}>{a.applied_at?.slice(0, 10)}: {a.kind} in {campaignName(a.campaign_id)}{a.variant_id ? ` (ad ${a.variant_id})` : ''}. {a.reason}</li>)}
          </ul>
        )}
        <RunNowButton />
      </Card>

      <AdsSettingsForm initial={settings} />
      <CampaignForm />
      <MetricsImport />
    </div>
  );
}
