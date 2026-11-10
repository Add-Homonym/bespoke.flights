import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { appBaseUrl } from '@/lib/payments/config';
import { PaymentError } from '@/lib/payments/service';
import {
  acceptChange, ChangeError, declineChange, getChangeRequest, proposedLegs, resolveChangeSchema, withdrawChange,
} from '@/lib/bookings/changes';
import type { Operator } from '@/lib/types';

/**
 * Resolve a change request.
 *   accept  (winning operator, optional newPriceCents and note)
 *   decline (winning operator, optional note)
 *   withdraw (the traveler who proposed it)
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ changeId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { changeId } = await params;
  const parsed = resolveChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  const db = getDb();
  const cr = await getChangeRequest(db, toId(changeId));
  if (!cr) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const baseUrl = appBaseUrl(req);

  try {
    if (parsed.data.action === 'withdraw') {
      if (session.role !== 'customer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const updated = await withdrawChange(db, cr.id, session.userId);
      return NextResponse.json({ ...updated, proposed_legs: proposedLegs(updated) });
    }

    if (session.role !== 'operator') return NextResponse.json({ error: 'Only the operator can accept or decline' }, { status: 403 });
    const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
    if (!operator || operator.status !== 'approved') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (parsed.data.action === 'decline') {
      const updated = await declineChange(db, cr.id, operator.id, parsed.data.note, baseUrl);
      return NextResponse.json({ ...updated, proposed_legs: proposedLegs(updated) });
    }

    const result = await acceptChange(db, cr.id, operator, { newPriceCents: parsed.data.newPriceCents, note: parsed.data.note, baseUrl });
    return NextResponse.json({
      ...result.changeRequest,
      proposed_legs: proposedLegs(result.changeRequest),
      paymentDue: result.paymentDue ?? null,
      refundedCents: result.refundedCents ?? null,
    });
  } catch (err) {
    if (err instanceof ChangeError || err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
