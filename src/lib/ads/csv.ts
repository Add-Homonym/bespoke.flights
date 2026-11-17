/**
 * Import ad delivery from a Google Ads report download (CSV), for use until
 * the API is connected. In Google Ads: Ads report, segmented by Day, with the
 * columns Day, Final URL (or Ad ID), Impr., Clicks, Cost.
 *
 * Each row is matched to an ad by the bfv parameter in its final URL, or by
 * the Google ad id once that has been recorded on the ad.
 */
import type { Db } from '@/lib/db';

/** RFC 4180 rows: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

const HEADERS: Record<string, string[]> = {
  day: ['day', 'date'],
  url: ['final url', 'final urls', 'landing page'],
  adId: ['ad id'],
  variant: ['bfv', 'variant', 'variant id', 'variant_id'],
  impressions: ['impr.', 'impressions', 'impr'],
  clicks: ['clicks'],
  cost: ['cost'],
};

const number = (v: string | undefined) => {
  const n = Number((v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function isoDay(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(`${s} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export interface ImportResult { imported: number; skipped: number; problems: string[] }

export async function importMetricsCsv(db: Db, text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex(r => r.some(c => HEADERS.clicks.includes(c.trim().toLowerCase())) && r.some(c => HEADERS.day.includes(c.trim().toLowerCase())));
  if (headerAt < 0) return { imported: 0, skipped: 0, problems: ['No header row with Day and Clicks columns'] };
  const header = rows[headerAt].map(c => c.trim().toLowerCase());
  const col = (key: keyof typeof HEADERS) => header.findIndex(h => HEADERS[key].includes(h));
  const idx = { day: col('day'), url: col('url'), adId: col('adId'), variant: col('variant'), impressions: col('impressions'), clicks: col('clicks'), cost: col('cost') };
  if (idx.cost < 0) return { imported: 0, skipped: 0, problems: ['No Cost column'] };
  if (idx.url < 0 && idx.adId < 0 && idx.variant < 0) return { imported: 0, skipped: 0, problems: ['Needs a Final URL, Ad ID or bfv column to match rows to ads'] };

  const known = await db.query<{ id: number; platform_ad_id: string | null }>('SELECT id, platform_ad_id FROM ad_variants');
  const ids = new Set(known.map(v => v.id));
  const byAdId = new Map(known.filter(v => v.platform_ad_id).map(v => [v.platform_ad_id!, v.id]));

  const result: ImportResult = { imported: 0, skipped: 0, problems: [] };
  const totals = new Map<string, { variantId: number; day: string; impressions: number; clicks: number; costCents: number }>();
  for (const r of rows.slice(headerAt + 1)) {
    const day = isoDay(r[idx.day] ?? '');
    if (!day) { result.skipped++; continue; } // totals and footer rows
    let variantId: number | undefined;
    if (idx.variant >= 0 && /^\d+$/.test((r[idx.variant] ?? '').trim())) variantId = Number(r[idx.variant]);
    if (variantId === undefined && idx.url >= 0) {
      const m = /[?&]bfv=(\d+)/.exec(r[idx.url] ?? '');
      if (m) variantId = Number(m[1]);
    }
    if (variantId === undefined && idx.adId >= 0) variantId = byAdId.get((r[idx.adId] ?? '').trim());
    if (variantId === undefined || !ids.has(variantId)) {
      result.skipped++;
      if (result.problems.length < 5) result.problems.push(`${day}: no matching ad`);
      continue;
    }
    const key = `${variantId}|${day}`;
    const t = totals.get(key) ?? { variantId, day, impressions: 0, clicks: 0, costCents: 0 };
    t.impressions += Math.round(number(r[idx.impressions]));
    t.clicks += Math.round(number(r[idx.clicks]));
    t.costCents += Math.round(number(r[idx.cost]) * 100);
    totals.set(key, t);
  }
  await upsertMetrics(db, [...totals.values()]);
  result.imported = totals.size;
  return result;
}

/** Replace the stored figures for each (ad, day). Re-importing a day is safe. */
export async function upsertMetrics(db: Db, rows: { variantId: number; day: string; impressions: number; clicks: number; costCents: number }[]): Promise<void> {
  await db.transaction(async tx => {
    for (const r of rows) {
      await tx.run(`INSERT INTO ad_metrics_daily (variant_id, day, impressions, clicks, cost_cents) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (variant_id, day) DO UPDATE SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, cost_cents = EXCLUDED.cost_cents`,
        [r.variantId, r.day, r.impressions, r.clicks, r.costCents]);
    }
  });
}
