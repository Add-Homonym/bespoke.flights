import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';
import { addStaff, listStaff, StaffError } from '@/lib/staff/roster';
import { smsConfigured } from '@/lib/notify/sms';
import { isTestMode } from '@/lib/payments/config';

export async function GET() {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    staff: await listStaff(ctx.db, ctx.operator.id),
    sms: isTestMode() ? 'test' : smsConfigured() ? 'live' : 'not_configured',
  });
}

export async function POST(req: Request) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await addStaff(ctx.db, ctx.operator.id, await req.json().catch(() => null)), { status: 201 });
  } catch (err) {
    if (err instanceof StaffError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
