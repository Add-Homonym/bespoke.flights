import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { currentOperator } from '@/lib/operator-session';
import { draftQuote, loadDraft } from '@/lib/quotes/autopilot';

type Ctx = { params: Promise<{ requestId: string }> };

/** The signed-in operator's Autopilot draft for this request. */
export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const draft = await loadDraft(ctx.db, toId((await params).requestId), ctx.operator.id);
  if (!draft) return NextResponse.json({ error: 'No draft' }, { status: 404 });
  return NextResponse.json(draft, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** POST — draft (or redraft) now from the current Autopilot settings and fleet, even with Autopilot off. */
export async function POST(_req: Request, { params }: Ctx) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requestId = toId((await params).requestId);
  // Only requests this operator can quote: matched to them, or open on the board.
  const req = await ctx.db.one<{ status: string }>('SELECT status FROM booking_requests WHERE id = ?', [requestId]);
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['open', 'quoted'].includes(req.status)) return NextResponse.json({ error: `This request is ${req.status}` }, { status: 409 });
  const id = await draftQuote(ctx.db, requestId, ctx.operator.id, { force: true });
  if (!id) return NextResponse.json({ error: 'Already quoted' }, { status: 409 });
  return NextResponse.json(await loadDraft(getDb(), requestId, ctx.operator.id), { status: 201 });
}

/** DELETE — discard the draft. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const n = await ctx.db.run(
    "UPDATE quote_drafts SET status = 'discarded', reviewed_by = ?, reviewed_at = now() WHERE request_id = ? AND operator_id = ? AND status = 'draft'",
    [ctx.session.userId, toId((await params).requestId), ctx.operator.id]);
  return n ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'No draft' }, { status: 404 });
}
