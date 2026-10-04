import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aircraftSchema } from '@/lib/validations';
import type { Operator, Aircraft } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  const aircraft = await db.query<Aircraft>('SELECT * FROM aircraft WHERE operator_id = ? ORDER BY created_at DESC', [operator.id]);
  return NextResponse.json(aircraft);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = aircraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  const { tailNumber, type, capacity, rangeNm, year } = parsed.data;
  const { id } = (await db.one<{ id: number }>(
    'INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [operator.id, tailNumber, type, capacity, rangeNm || null, year || null]
  ))!;

  return NextResponse.json({ id }, { status: 201 });
}
