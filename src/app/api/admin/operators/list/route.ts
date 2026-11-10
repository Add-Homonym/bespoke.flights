import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { listOperators } from '@/lib/admin/operators';

export async function GET() {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  return NextResponse.json(await listOperators(getDb()), { headers: { 'Cache-Control': 'no-store' } });
}
