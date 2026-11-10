import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ photoId: string }> };

/**
 * Serve an aircraft photo: `?size=thumb` for the preview. Public — aircraft
 * photos are shown to travelers alongside quotes. A photo's bytes never change
 * (edits replace the row), so responses are cached as immutable.
 */
export async function GET(req: Request, { params }: Ctx) {
  const id = Number((await params).photoId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';

  const row = await getDb().one<{ content_type: string; bytes: Uint8Array; thumb: Uint8Array | null }>(
    `SELECT content_type, ${thumb ? 'COALESCE(thumb, bytes)' : 'bytes'} AS bytes, thumb FROM aircraft_photos WHERE id = ?`, [id]);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const type = thumb && row.thumb ? 'image/jpeg' : row.content_type;
  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      'Content-Type': type,
      'Content-Length': String(row.bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
