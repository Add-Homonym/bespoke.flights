import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { currentOperator, notFound, ownedAircraft, photoList, setPhotoOrder } from '@/lib/fleet';

type Ctx = { params: Promise<{ aircraftId: string; photoId: string }> };

const patchSchema = z.object({
  cover: z.literal(true).optional(),
  caption: z.string().trim().max(200).nullable().optional(),
}).strict();

async function load(ctx: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return { ok: false as const, error: me.error };
  const { aircraftId, photoId } = await ctx.params;
  const aircraft = await ownedAircraft(db, me.operator.id, Number(aircraftId));
  if (!aircraft) return { ok: false as const, error: notFound() };
  const photos = await photoList(db, aircraft.id);
  const photo = photos.find(p => p.id === Number(photoId));
  if (!photo) return { ok: false as const, error: NextResponse.json({ error: 'Photo not found' }, { status: 404 }) };
  return { ok: true as const, db, aircraft, photos, photo };
}

/** Make a photo the cover (first), or change its caption. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await load(ctx);
  if (!r.ok) return r.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  if (parsed.data.cover) {
    await setPhotoOrder(r.db, r.aircraft.id, [r.photo.id, ...r.photos.filter(p => p.id !== r.photo.id).map(p => p.id)]);
  }
  if ('caption' in parsed.data) {
    await r.db.run('UPDATE aircraft_photos SET caption = ? WHERE id = ?', [parsed.data.caption || null, r.photo.id]);
  }
  return NextResponse.json({ photos: await photoList(r.db, r.aircraft.id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await load(ctx);
  if (!r.ok) return r.error;
  await r.db.run('DELETE FROM aircraft_photos WHERE id = ?', [r.photo.id]);
  await setPhotoOrder(r.db, r.aircraft.id, r.photos.filter(p => p.id !== r.photo.id).map(p => p.id));
  return NextResponse.json({ photos: await photoList(r.db, r.aircraft.id) });
}
