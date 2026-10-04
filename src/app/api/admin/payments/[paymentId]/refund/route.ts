import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { refundSchema } from '@/lib/validations';
import { refundPayment, PaymentError } from '@/lib/payments/service';
import { appBaseUrl } from '@/lib/payments/config';

export async function POST(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = refundSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { paymentId } = await params;
  try {
    const payment = await refundPayment(getDb(), toId(paymentId), {
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason,
      initiatedBy: session.userId,
      baseUrl: appBaseUrl(req),
    });
    return NextResponse.json(payment);
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
