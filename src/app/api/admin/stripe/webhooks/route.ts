import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { getPaymentsMode } from '@/lib/payments/config';
import { checkStripe, setupWebhooks } from '@/lib/payments/stripe-setup';

/** POST — create (or replace) the Stripe webhook endpoints for this app. */
export async function POST() {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  if (getPaymentsMode() !== 'stripe') return NextResponse.json({ error: 'Set STRIPE_SECRET_KEY first' }, { status: 409 });
  const db = getDb();
  try {
    const result = await setupWebhooks(db);
    return NextResponse.json({ ...result, status: await checkStripe(db) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe error' }, { status: 502 });
  }
}
