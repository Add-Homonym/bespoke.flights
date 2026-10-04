import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { checkoutSchema } from '@/lib/validations';
import { appBaseUrl } from '@/lib/payments/config';
import { createCheckout, PaymentError } from '@/lib/payments/service';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await createCheckout(getDb(), {
      quoteId: parsed.data.quoteId,
      customerId: session.userId,
      baseUrl: appBaseUrl(req),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
