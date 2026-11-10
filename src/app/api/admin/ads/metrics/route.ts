import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { importMetricsCsv } from '@/lib/ads/csv';

const MAX_BYTES = 2_000_000;

/** Import a Google Ads report download (CSV text in the body). */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const text = await req.text();
  if (!text.trim()) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  if (text.length > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 2 MB' }, { status: 413 });
  const result = await importMetricsCsv(getDb(), text);
  return NextResponse.json(result, { status: result.imported === 0 && result.problems.length ? 400 : 200 });
}
