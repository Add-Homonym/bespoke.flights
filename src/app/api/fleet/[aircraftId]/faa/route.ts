import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';
import { currentOperator, notFound, ownedAircraft, presentFleet } from '@/lib/fleet';
import { lookupNNumber, normalizeNNumber, RegistryUnavailable } from '@/lib/faa/registry';
import type { Aircraft } from '@/lib/types';

type Ctx = { params: Promise<{ aircraftId: string }> };

/**
 * POST — look up this aircraft's tail number on the FAA registry and store the
 * record. Serial number, manufacturer, model and year are filled where blank;
 * values the operator entered are kept.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  const aircraft = await ownedAircraft(db, me.operator.id, Number((await params).aircraftId));
  if (!aircraft) return notFound();

  const n = normalizeNNumber(aircraft.tail_number);
  if (!n) return NextResponse.json({ error: 'Only US registrations (N-numbers) are on the FAA registry' }, { status: 400 });

  const limited = await rateLimited('faaLookup', me.userId, db);
  if (limited) return limited;

  let record;
  try {
    record = await lookupNNumber(n);
  } catch (err) {
    if (err instanceof RegistryUnavailable) return NextResponse.json({ error: 'The FAA registry is not responding. Try again later.' }, { status: 502 });
    throw err;
  }

  const updated = (await db.one<Aircraft>(
    `UPDATE aircraft SET faa_record = ?, faa_checked_at = now(),
       serial_number = COALESCE(serial_number, ?), manufacturer = COALESCE(manufacturer, ?),
       model = COALESCE(model, ?), year = COALESCE(year, ?)
     WHERE id = ? RETURNING *`,
    [JSON.stringify(record), record.serialNumber ?? null, record.manufacturer ?? null, record.model ?? null, record.year ?? null, aircraft.id],
  ))!;
  return NextResponse.json((await presentFleet(db, [updated]))[0]);
}
