/**
 * Payment configuration.
 *
 * Modes:
 *   stripe   — STRIPE_SECRET_KEY is set. Real Checkout + Connect.
 *   stub     — no key, not production. Payments are simulated in-app so the
 *              full booking flow can be exercised locally.
 *   disabled — no key in production. Checkout is refused rather than
 *              letting bookings through unpaid.
 */

export type PaymentsMode = 'stripe' | 'stub' | 'disabled';

export function getPaymentsMode(): PaymentsMode {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.NODE_ENV === 'production') return 'disabled';
  return 'stub';
}

/** Default platform commission in basis points (500 = 5%). */
export const DEFAULT_PLATFORM_FEE_BPS = 500;

export function platformFeeBps(operatorOverride?: number | null): number {
  if (operatorOverride != null) return clampBps(operatorOverride);
  const raw = process.env.PLATFORM_FEE_BPS;
  const env = raw ? Number(raw) : NaN;
  return Number.isFinite(env) ? clampBps(env) : DEFAULT_PLATFORM_FEE_BPS;
}

function clampBps(bps: number): number {
  return Math.min(10_000, Math.max(0, Math.round(bps)));
}

export interface FeeBreakdown {
  amountCents: number;
  platformFeeCents: number;
  operatorPayoutCents: number;
}

/** Split a charge into platform fee and operator payout. Fee rounds half up to the cent. */
export function computeFees(amountCents: number, bps: number): FeeBreakdown {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  const platformFeeCents = Math.round((amountCents * clampBps(bps)) / 10_000);
  return {
    amountCents,
    platformFeeCents,
    operatorPayoutCents: amountCents - platformFeeCents,
  };
}

/** Stripe's minimum charge for USD is $0.50. */
export const MIN_CHARGE_CENTS = 50;

/** How long a Checkout Session stays open (Stripe allows 30 min – 24 h). */
export const CHECKOUT_TTL_SECONDS = 60 * 60;

/** Absolute base URL for redirects. Prefers APP_URL, falls back to the request origin. */
export function appBaseUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}

/** Payment methods offered at checkout. ACH is USD-only. */
export function allowedPaymentMethods(currency: string): ('card' | 'us_bank_account')[] {
  return currency.toUpperCase() === 'USD' ? ['card', 'us_bank_account'] : ['card'];
}

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
