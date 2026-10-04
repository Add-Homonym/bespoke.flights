import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';
import { toId } from '@/lib/db/queries';
import { removeStaff, updateStaff, StaffError } from '@/lib/staff/roster';

type Ctx = { params: Promise<{ staffId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const member = await updateStaff(ctx.db, ctx.operator.id, toId((await params).staffId), await req.json().catch(() => null));
    return NextResponse.json(member);
  } catch (err) {
    if (err instanceof StaffError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await removeStaff(ctx.db, ctx.operator.id, toId((await params).staffId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StaffError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
