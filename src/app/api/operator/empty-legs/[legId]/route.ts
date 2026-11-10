import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { currentOperator } from '@/lib/fleet';
import { appBaseUrl } from '@/lib/payments/config';
import { emptyLegPatchSchema } from '@/lib/validations';
import { EmptyLegError, getEmptyLeg, updateEmptyLeg, withdrawEmptyLeg } from '@/lib/empty-legs/service';

/** `{status:'withdrawn'}` takes the flight off the market; otherwise price, seats or notes change. */
export async function PATCH(req: Request, { params }: { params: Promise<{ legId: string }> }) {
  const db = getDb();
  const me = await currentOperator(db);
  if ('error' in me) return me.error;

  const parsed = emptyLegPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  const { legId } = await params;
  const id = toId(legId);
  try {
    if (parsed.data.status === 'withdrawn') await withdrawEmptyLeg(db, me.operator.id, id, appBaseUrl(req));
    else await updateEmptyLeg(db, me.operator.id, id, parsed.data, appBaseUrl(req));
    return NextResponse.json(await getEmptyLeg(db, id));
  } catch (err) {
    if (err instanceof EmptyLegError) {
      return NextResponse.json(err.field
        ? { error: 'Check the highlighted fields.', fieldErrors: { [err.field]: [err.message] } }
        : { error: err.message }, { status: err.status });
    }
    throw err;
  }
}
