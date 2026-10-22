import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { currentOperator } from '@/lib/fleet';
import { emptyLegSchema } from '@/lib/validations';
import { createEmptyLeg, EmptyLegError, getEmptyLeg, operatorEmptyLegs } from '@/lib/empty-legs/service';

export async function GET() {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  return NextResponse.json(await operatorEmptyLegs(db, me.operator.id));
}

export async function POST(req: Request) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;
  if (me.operator.status !== 'approved') return NextResponse.json({ error: 'Operator not approved' }, { status: 403 });

  const parsed = emptyLegSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const id = await createEmptyLeg(db, me.operator.id, parsed.data);
    return NextResponse.json(await getEmptyLeg(db, id), { status: 201 });
  } catch (err) {
    if (err instanceof EmptyLegError) return NextResponse.json({ error: { aircraftId: [err.message] } }, { status: err.status });
    throw err;
  }
}
