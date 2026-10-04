import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';
import { buildBoard } from '@/lib/board/data';

export const dynamic = 'force-dynamic';

/** Live company board for the signed-in operator. */
export async function GET() {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await buildBoard(ctx.db, ctx.operator.id), { headers: { 'Cache-Control': 'no-store' } });
}
