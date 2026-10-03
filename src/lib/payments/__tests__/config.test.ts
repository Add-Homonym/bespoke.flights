import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeFees, platformFeeBps, getPaymentsMode, DEFAULT_PLATFORM_FEE_BPS, allowedPaymentMethods } from '../config';

afterEach(() => vi.unstubAllEnvs());

describe('computeFees', () => {
  it('splits amount into fee and payout that sum to the total', () => {
    expect(computeFees(8_500_000, 500)).toEqual({ amountCents: 8_500_000, platformFeeCents: 425_000, operatorPayoutCents: 8_075_000 });
  });

  it('rounds the fee to the nearest cent', () => {
    // 333 * 5% = 16.65 → 17
    const f = computeFees(333, 500);
    expect(f.platformFeeCents).toBe(17);
    expect(f.platformFeeCents + f.operatorPayoutCents).toBe(333);
  });

  it('clamps bps into 0..10000', () => {
    expect(computeFees(1000, -50).platformFeeCents).toBe(0);
    expect(computeFees(1000, 20_000).platformFeeCents).toBe(1000);
  });

  it('rejects non-positive or fractional amounts', () => {
    expect(() => computeFees(0, 500)).toThrow();
    expect(() => computeFees(10.5, 500)).toThrow();
  });
});

describe('platformFeeBps', () => {
  it('defaults when env is unset', () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '');
    expect(platformFeeBps()).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });

  it('reads env', () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '750');
    expect(platformFeeBps()).toBe(750);
  });

  it('ignores invalid env', () => {
    vi.stubEnv('PLATFORM_FEE_BPS', 'ten percent');
    expect(platformFeeBps()).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });

  it('prefers operator override, including zero', () => {
    vi.stubEnv('PLATFORM_FEE_BPS', '750');
    expect(platformFeeBps(300)).toBe(300);
    expect(platformFeeBps(0)).toBe(0);
  });
});

describe('getPaymentsMode', () => {
  it('is stripe when a key is set', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    expect(getPaymentsMode()).toBe('stripe');
  });

  it('is stub in development without a key', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getPaymentsMode()).toBe('stub');
  });

  it('is disabled in production without a key', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getPaymentsMode()).toBe('disabled');
  });
});

describe('allowedPaymentMethods', () => {
  it('offers ACH only for USD', () => {
    expect(allowedPaymentMethods('USD')).toEqual(['card', 'us_bank_account']);
    expect(allowedPaymentMethods('EUR')).toEqual(['card']);
  });
});
