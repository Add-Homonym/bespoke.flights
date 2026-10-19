import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { checkStripe } from '@/lib/payments/stripe-setup';

/** Stripe readiness: key, account, Connect, webhooks, public URL. */
export async function GET() {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  return NextResponse.json(await checkStripe(getDb()), { headers: { 'Cache-Control': 'no-store' } });
}
