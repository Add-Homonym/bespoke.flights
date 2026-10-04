import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildBoard, operatorForBoardToken } from '@/lib/board/data';

export const dynamic = 'force-dynamic';

/** Live company board behind a private staff link (no login). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = getDb();
  const operatorId = await operatorForBoardToken(db, (await params).token);
  if (!operatorId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await buildBoard(db, operatorId), {
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
