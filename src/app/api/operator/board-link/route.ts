import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';
import { appBaseUrl } from '@/lib/payments/config';
import { boardUrl, createBoardToken, getBoardToken, revokeBoardToken } from '@/lib/board/data';

export async function GET(req: Request) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = await getBoardToken(ctx.db, ctx.operator.id);
  return NextResponse.json({ url: token ? boardUrl(appBaseUrl(req), token) : null });
}

/** { action: 'create' | 'revoke' }. Creating replaces any existing link. */
export async function POST(req: Request) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { action } = await req.json().catch(() => ({})) as { action?: string };
  if (action === 'revoke') {
    await revokeBoardToken(ctx.db, ctx.operator.id);
    return NextResponse.json({ url: null });
  }
  const token = await createBoardToken(ctx.db, ctx.operator.id);
  return NextResponse.json({ url: boardUrl(appBaseUrl(req), token) });
}
