import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { aircraftPatchSchema } from '@/lib/validations';
import { currentOperator, notFound, ownedAircraft, presentFleet } from '@/lib/fleet';
import { normalizeNNumber } from '@/lib/faa/registry';
import type { Aircraft } from '@/lib/types';

type Ctx = { params: Promise<{ aircraftId: string }> };

const COLUMNS = {
  tailNumber: 'tail_number', type: 'type', capacity: 'capacity', rangeNm: 'range_nm', year: 'year',
  serialNumber: 'serial_number', manufacturer: 'manufacturer', model: 'model',
  hourlyRateCents: 'hourly_rate_cents', cruiseKtas: 'cruise_ktas',
} as const;

export async function GET(_req: Request, { params }: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  const aircraft = await ownedAircraft(db, me.operator.id, Number((await params).aircraftId));
  if (!aircraft) return notFound();
  return NextResponse.json((await presentFleet(db, [aircraft]))[0]);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  const aircraft = await ownedAircraft(db, me.operator.id, Number((await params).aircraftId));
  if (!aircraft) return notFound();

  const parsed = aircraftPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let newTail: string | undefined;
  for (const [key, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    if (!(key in parsed.data)) continue;
    let v = parsed.data[key] ?? null;
    if (typeof v === 'string' && v === '') v = null;
    if (key === 'tailNumber' && typeof v === 'string') newTail = v = normalizeNNumber(v) ?? v.toUpperCase();
    if ((key === 'tailNumber' || key === 'type' || key === 'capacity') && v === null) {
      return NextResponse.json({ error: { [key]: ['Required'] } }, { status: 400 });
    }
    sets.push(`${column} = ?`);
    values.push(v);
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  // A new tail number is a different registration: the stored FAA record no longer applies.
  if (newTail && newTail !== aircraft.tail_number) {
    sets.push('faa_record = NULL', 'faa_checked_at = NULL');
  }
  sets.push('updated_at = now()');

  const updated = (await db.one<Aircraft>(
    `UPDATE aircraft SET ${sets.join(', ')} WHERE id = ? RETURNING *`, [...values, aircraft.id]))!;
  return NextResponse.json((await presentFleet(db, [updated]))[0]);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  const aircraft = await ownedAircraft(db, me.operator.id, Number((await params).aircraftId));
  if (!aircraft) return notFound();

  const { count } = (await db.one<{ count: number }>('SELECT COUNT(*)::int AS count FROM quotes WHERE aircraft_id = ?', [aircraft.id]))!;
  if (count > 0) {
    return NextResponse.json(
      { error: `This aircraft is on ${count} quote${count === 1 ? '' : 's'} and stays on record. Edit it instead.` },
      { status: 409 });
  }
  await db.run('DELETE FROM aircraft WHERE id = ?', [aircraft.id]);
  return new NextResponse(null, { status: 204 });
}
