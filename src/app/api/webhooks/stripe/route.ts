import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { getStripe, webhookSecrets } from '@/lib/payments/stripe';
import { appBaseUrl } from '@/lib/payments/config';
import { handleStripeEvent } from '@/lib/payments/service';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook endpoint. Register for both the platform account and
 * connected accounts (Connect) in the Stripe dashboard:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired,
 *   charge.refunded, charge.dispute.created/updated/closed, account.updated
 */
export async function POST(req: Request) {
  const secrets = webhookSecrets();
  if (secrets.length === 0 || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Webhooks not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Signature is computed over the raw body; it must not be re-serialized.
  const payload = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(getDb(), event, appBaseUrl(req));
    return NextResponse.json({ received: true, result });
  } catch (err) {
    // Non-2xx makes Stripe retry with backoff; handlers are idempotent.
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
