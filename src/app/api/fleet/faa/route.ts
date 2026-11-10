import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';
import { currentOperator } from '@/lib/fleet';
import { lookupNNumber, normalizeNNumber, RegistryUnavailable, suggestedType } from '@/lib/faa/registry';

/** GET /api/fleet/faa?n=N628TS — read the FAA registry before adding an aircraft. */
export async function GET(req: Request) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;

  const n = normalizeNNumber(new URL(req.url).searchParams.get('n') ?? '');
  if (!n) return NextResponse.json({ error: 'Not a US registration (N-number)' }, { status: 400 });

  const limited = await rateLimited('faaLookup', me.userId, db);
  if (limited) return limited;

  try {
    const record = await lookupNNumber(n);
    return NextResponse.json({ record, suggestedType: suggestedType(record) ?? null });
  } catch (err) {
    if (err instanceof RegistryUnavailable) return NextResponse.json({ error: 'The FAA registry is not responding. Try again later.' }, { status: 502 });
    throw err;
  }
}
