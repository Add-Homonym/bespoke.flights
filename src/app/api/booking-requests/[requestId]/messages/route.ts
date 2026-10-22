import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { threadAccess } from '@/lib/access';
import { getThread, messageInputSchema, postMessage } from '@/lib/messaging/messages';
import { appBaseUrl } from '@/lib/payments/config';
import { rateLimited } from '@/lib/rate-limit';
import type { Db } from '@/lib/db';
import type { BookingRequest, SessionPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Side = 'customer' | 'operator' | 'admin';
type Resolved =
  | { error: NextResponse }
  | { error?: undefined; session: SessionPayload; db: Db; request: BookingRequest; operatorId: number; side: Side; afterId: number };

/** Resolve the thread (request, operator) and the caller's side. */
async function resolve(req: Request, requestId: string): Promise<Resolved> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };

  const url = new URL(req.url);
  let operatorId = toId(url.searchParams.get('operatorId') ?? '');
  if (!operatorId && session.role === 'operator') {
    // Operators always speak for their own company.
    operatorId = (await db.one<{ id: number }>('SELECT id FROM operators WHERE user_id = ?', [session.userId]))?.id ?? 0;
  }
  if (!operatorId) return { error: NextResponse.json({ error: 'operatorId is required' }, { status: 400 }) };

  const side = await threadAccess(db, session, request, operatorId);
  if (!side) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session, db, request, operatorId, side, afterId: toId(url.searchParams.get('after') ?? '') };
}

/** The thread. `?after=<id>` returns only newer messages. Marks the other side's messages read. */
export async function GET(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await resolve(req, requestId);
  if (ctx.error) return ctx.error;
  const thread = await getThread(ctx.db, ctx.request.id, ctx.operatorId, ctx.side, ctx.afterId);
  return NextResponse.json({ ...thread, viewer: ctx.side, closed: ctx.request.status === 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Post a message. Admins read but do not write. */
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await resolve(req, requestId);
  if (ctx.error) return ctx.error;
  if (ctx.side === 'admin') return NextResponse.json({ error: 'Admins can read but not post' }, { status: 403 });
  if (ctx.request.status === 'cancelled') {
    return NextResponse.json({ error: 'This trip was cancelled, so the conversation is closed.' }, { status: 409 });
  }

  const parsed = messageInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid message' }, { status: 400 });
  const limited = await rateLimited('message', ctx.session.userId, ctx.db);
  if (limited) return limited;

  const message = await postMessage(ctx.db, {
    requestId: ctx.request.id, operatorId: ctx.operatorId, senderUserId: ctx.session.userId,
    side: ctx.side, body: parsed.data.body, baseUrl: appBaseUrl(req),
  });
  return NextResponse.json(message, { status: 201 });
}
