import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { aircraftSchema } from '@/lib/validations';
import { currentOperator, presentFleet } from '@/lib/fleet';
import { normalizeNNumber } from '@/lib/faa/registry';
import type { Aircraft } from '@/lib/types';

export async function GET() {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;

  const aircraft = await db.query<Aircraft>('SELECT * FROM aircraft WHERE operator_id = ? ORDER BY created_at DESC, id DESC', [me.operator.id]);
  return NextResponse.json(await presentFleet(db, aircraft));
}

export async function POST(req: Request) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;

  const parsed = aircraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const a = parsed.data;
  const tail = normalizeNNumber(a.tailNumber) ?? a.tailNumber.toUpperCase();
  const { id } = (await db.one<{ id: number }>(
    `INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year, serial_number, manufacturer, model, hourly_rate_cents, cruise_ktas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [me.operator.id, tail, a.type, a.capacity, a.rangeNm ?? null, a.year ?? null, a.serialNumber || null, a.manufacturer || null, a.model || null,
     a.hourlyRateCents ?? null, a.cruiseKtas ?? null],
  ))!;

  return NextResponse.json({ id }, { status: 201 });
}
