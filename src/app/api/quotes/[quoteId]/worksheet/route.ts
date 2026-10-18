import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { loadWorksheet } from '@/lib/quotes/worksheet-store';
import type { Operator } from '@/lib/types';

/** GET — the quoting operator's private worksheet for this quote. Nobody else can read it. */
export async function GET(_req: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'operator') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = getDb();
  const operator = await db.one<Operator>('SELECT id FROM operators WHERE user_id = ?', [session.userId]);
  const worksheet = operator ? await loadWorksheet(db, toId((await params).quoteId), operator.id) : null;
  if (!worksheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(worksheet, { headers: { 'Cache-Control': 'private, no-store' } });
}
