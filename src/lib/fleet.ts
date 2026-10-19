import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { Db } from '@/lib/db';
import type { RegistryRecord } from '@/lib/faa/registry';
import type { Aircraft, AircraftPhotoMeta, Operator } from '@/lib/types';

/** Photos per aircraft. */
export const MAX_PHOTOS = 8;
/** Upload limits after the browser resizes (1600px JPEG ≈ 300–600 KB). */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_THUMB_BYTES = 400 * 1024;

const PHOTO_COLUMNS = 'id, aircraft_id, position, content_type, width, height, caption';

export type AircraftView = Omit<Aircraft, 'faa_record'> & {
  faa_record: RegistryRecord | null;
  photos: AircraftPhotoMeta[];
};

/** The signed-in operator, or the response to send. */
export async function currentOperator(db: Db): Promise<{ operator: Operator; userId: number } | { error: NextResponse }> {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return { error: NextResponse.json({ error: 'Operator not found' }, { status: 404 }) };
  return { operator, userId: session.userId };
}

/** An aircraft of this operator, or undefined (another operator's aircraft is treated as missing). */
export async function ownedAircraft(db: Db, operatorId: number, aircraftId: number): Promise<Aircraft | undefined> {
  if (!Number.isInteger(aircraftId) || aircraftId <= 0) return undefined;
  return db.one<Aircraft>('SELECT * FROM aircraft WHERE id = ? AND operator_id = ?', [aircraftId, operatorId]);
}

export const notFound = () => NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });

function parseRecord(raw: string | null): RegistryRecord | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as RegistryRecord; } catch { return null; }
}

/** Aircraft rows with their photo list (cover first) and parsed FAA record. */
export async function presentFleet(db: Db, aircraft: Aircraft[]): Promise<AircraftView[]> {
  if (aircraft.length === 0) return [];
  const ids = aircraft.map(a => a.id);
  const photos = await db.query<AircraftPhotoMeta>(
    `SELECT ${PHOTO_COLUMNS} FROM aircraft_photos WHERE aircraft_id = ANY(?) ORDER BY position, id`, [ids]);
  return aircraft.map(a => ({
    ...a,
    faa_record: parseRecord(a.faa_record),
    photos: photos.filter(p => p.aircraft_id === a.id),
  }));
}

export async function photoList(db: Db, aircraftId: number): Promise<AircraftPhotoMeta[]> {
  return db.query<AircraftPhotoMeta>(
    `SELECT ${PHOTO_COLUMNS} FROM aircraft_photos WHERE aircraft_id = ? ORDER BY position, id`, [aircraftId]);
}

/** Rewrite positions 0..n-1 in the given order. */
export async function setPhotoOrder(db: Db, aircraftId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async tx => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.run('UPDATE aircraft_photos SET position = ? WHERE id = ? AND aircraft_id = ?', [i, id, aircraftId]);
    }
  });
}

/** Image type from the file's first bytes; the browser-declared type is not trusted. */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
