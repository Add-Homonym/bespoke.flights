import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { appBaseUrl } from '@/lib/payments/config';
import { simulateStubPayment, PaymentError } from '@/lib/payments/service';

/** Stub mode only: completes a simulated checkout. Returns 404 when Stripe is configured or in production. */
export async function POST(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { paymentId } = await params;
  try {
    const db = getDb();
    const outcome = await simulateStubPayment(db, toId(paymentId), session.userId, appBaseUrl(req));
    const current = await db.one<{ status: string }>('SELECT status FROM payments WHERE id = ?', [toId(paymentId)]);
    return NextResponse.json({ outcome, status: current?.status ?? null });
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
