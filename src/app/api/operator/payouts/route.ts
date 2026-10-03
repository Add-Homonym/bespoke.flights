import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { appBaseUrl, getPaymentsMode, platformFeeBps } from '@/lib/payments/config';
import {
  refreshConnectAccount,
  startConnectOnboarding,
  connectDashboardLink,
  PaymentError,
} from '@/lib/payments/service';
import type { Operator } from '@/lib/types';

async function currentOperator() {
  const session = await getSession();
  if (!session || session.role !== 'operator') return null;
  return getDb().prepare('SELECT * FROM operators WHERE user_id = ?').get(session.userId) as Operator | undefined ?? null;
}

function errorResponse(err: unknown) {
  if (err instanceof PaymentError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Payout account error:', err);
  return NextResponse.json({ error: 'Payout provider error' }, { status: 502 });
}

/** Payout account status (refreshed from Stripe). */
export async function GET() {
  const operator = await currentOperator();
  if (!operator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const updated = await refreshConnectAccount(db, operator.id);
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('succeeded','partially_refunded') THEN operator_payout_cents END), 0) AS gross_payout_cents,
        COUNT(CASE WHEN status IN ('succeeded','partially_refunded','refunded') THEN 1 END) AS paid_bookings
      FROM payments WHERE operator_id = ?
    `).get(operator.id) as { gross_payout_cents: number; paid_bookings: number };

    return NextResponse.json({
      mode: getPaymentsMode(),
      connected: !!updated.stripe_account_id,
      charges_enabled: !!updated.stripe_charges_enabled,
      payouts_enabled: !!updated.stripe_payouts_enabled,
      details_submitted: !!updated.stripe_details_submitted,
      platform_fee_bps: platformFeeBps(updated.platform_fee_bps),
      ...totals,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** { action: 'onboard' | 'dashboard' } → { url } */
export async function POST(req: Request) {
  const operator = await currentOperator();
  if (!operator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { action?: string };
  try {
    const db = getDb();
    const url = body.action === 'dashboard'
      ? await connectDashboardLink(db, operator.id)
      : await startConnectOnboarding(db, operator.id, appBaseUrl(req));
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
