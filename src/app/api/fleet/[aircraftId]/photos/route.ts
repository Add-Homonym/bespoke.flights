import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';
import {
  currentOperator, MAX_PHOTO_BYTES, MAX_PHOTOS, MAX_THUMB_BYTES, notFound, ownedAircraft, photoList, sniffImageType,
} from '@/lib/fleet';

type Ctx = { params: Promise<{ aircraftId: string }> };

/**
 * Upload one photo as multipart form data: `photo` (required), `thumb`
 * (optional, small preview), `width`, `height`, `caption`. The browser resizes
 * before upload (see fleet page); the server checks type and size only.
 */
export async function POST(req: Request, { params }: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  const aircraft = await ownedAircraft(db, me.operator.id, Number((await params).aircraftId));
  if (!aircraft) return notFound();

  const limited = await rateLimited('photoUpload', me.userId, db);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!(photo instanceof Blob)) return NextResponse.json({ error: 'Attach a photo' }, { status: 400 });
  if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'Photo is larger than 3 MB' }, { status: 413 });

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return NextResponse.json({ error: 'Use a JPEG, PNG or WebP image' }, { status: 415 });

  let thumb: Uint8Array | null = null;
  const thumbFile = form!.get('thumb');
  if (thumbFile instanceof Blob && thumbFile.size > 0) {
    if (thumbFile.size > MAX_THUMB_BYTES) return NextResponse.json({ error: 'Preview is too large' }, { status: 413 });
    thumb = new Uint8Array(await thumbFile.arrayBuffer());
    if (sniffImageType(thumb) !== 'image/jpeg') return NextResponse.json({ error: 'Preview must be a JPEG' }, { status: 415 });
  }

  const dim = (k: string) => {
    const n = Number(form!.get(k));
    return Number.isInteger(n) && n > 0 && n <= 20_000 ? n : null;
  };
  const caption = String(form!.get('caption') ?? '').trim().slice(0, 200) || null;

  const inserted = await db.transaction(async tx => {
    // Lock the aircraft row so concurrent uploads cannot exceed the cap.
    await tx.one('SELECT id FROM aircraft WHERE id = ? FOR UPDATE', [aircraft.id]);
    const { count, next } = (await tx.one<{ count: number; next: number }>(
      'SELECT COUNT(*)::int AS count, COALESCE(MAX(position) + 1, 0)::int AS next FROM aircraft_photos WHERE aircraft_id = ?', [aircraft.id]))!;
    if (count >= MAX_PHOTOS) return null;
    return tx.one<{ id: number }>(
      `INSERT INTO aircraft_photos (aircraft_id, position, content_type, width, height, bytes, thumb, caption)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [aircraft.id, next, contentType, dim('width'), dim('height'), bytes, thumb, caption]);
  });
  if (!inserted) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per aircraft` }, { status: 409 });

  return NextResponse.json({ id: inserted.id, photos: await photoList(db, aircraft.id) }, { status: 201 });
}
