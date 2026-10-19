import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';

/** DELETE — forget what Autopilot has learned; drafts use the console settings again. */
export async function DELETE() {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ctx.db.run('DELETE FROM autopilot_learning WHERE operator_id = ?', [ctx.operator.id]);
  return new NextResponse(null, { status: 204 });
}
