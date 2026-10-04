import Stripe from 'stripe';

let client: Stripe | null = null;

/** Returns the Stripe client. Throws if STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    client = new Stripe(key, { appInfo: { name: 'bespoke.flights' } });
  }
  return client;
}

/** Test hook: replace the Stripe client. Pass null to reset. */
export function setStripeClient(stripe: Stripe | null) {
  client = stripe;
}

/** Webhook signing secrets: platform endpoint and (optionally) the Connect endpoint. */
export function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .filter((s): s is string => !!s);
}
