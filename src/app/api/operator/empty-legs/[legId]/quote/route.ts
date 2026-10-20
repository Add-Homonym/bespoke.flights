import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { currentOperator } from '@/lib/fleet';
import { appBaseUrl } from '@/lib/payments/config';
import { EmptyLegError, quoteRequestFromListing } from '@/lib/empty-legs/service';

const schema = z.object({ requestId: z.number().int().positive() });

/** Quote an open request with this listing at the listed price. */
export async function POST(req: Request, { params }: { params: Promise<{ legId: string }> }) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  if (me.operator.status !== 'approved') return NextResponse.json({ error: 'Operator not approved' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { legId } = await params;
  try {
    const quoteId = await quoteRequestFromListing(db, me.operator.id, toId(legId), parsed.data.requestId, appBaseUrl(req));
    return NextResponse.json({ id: quoteId }, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyLegError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
