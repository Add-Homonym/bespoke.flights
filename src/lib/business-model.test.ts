import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import {
  defaultBusinessModel, estimatedProcessingCents, getBusinessModel, resolveCommission, saveBusinessModel, BUSINESS_MODEL_KEY,
} from './business-model';

let f: Fixture;

beforeAll(async () => { f = await createFixture(); });
beforeEach(() => { vi.stubEnv('PLATFORM_FEE_BPS', ''); });
afterAll(() => vi.unstubAllEnvs());

const op = (overrides: Partial<{ platform_fee_bps: number | null; plan: string; launch_partner: number }> = {}) =>
  ({ id: f.operatorA, platform_fee_bps: null, plan: 'standard', launch_partner: 0, ...overrides });

describe('storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getBusinessModel(f.db)).toEqual(defaultBusinessModel());
  });

  it('merges a saved patch over the defaults and persists it', async () => {
    const saved = await saveBusinessModel(f.db, { operatorCommissionBps: 800, launchPromoEnabled: true });
    expect(saved.operatorCommissionBps).toBe(800);
    expect(saved.launchPromoEnabled).toBe(true);
    expect(saved.feePayer).toBe('operator');
    expect(await getBusinessModel(f.db)).toEqual(saved);
  });

  it('ignores corrupt or out-of-range stored values', async () => {
    await f.db.run(`INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [BUSINESS_MODEL_KEY, '{not json']);
    expect(await getBusinessModel(f.db)).toEqual(defaultBusinessModel());
    await f.db.run(`UPDATE platform_settings SET value = ? WHERE key = ?`, [JSON.stringify({ operatorCommissionBps: 99_999 }), BUSINESS_MODEL_KEY]);
    expect((await getBusinessModel(f.db)).operatorCommissionBps).toBe(defaultBusinessModel().operatorCommissionBps);
  });

  it('rejects an invalid patch', async () => {
    await expect(saveBusinessModel(f.db, { operatorCommissionBps: -1 })).rejects.toThrow();
  });
});

describe('resolveCommission', () => {
  it('uses the default commission', async () => {
    const m = { ...defaultBusinessModel(), operatorCommissionBps: 800 };
    expect(await resolveCommission(f.db, m, op())).toEqual({ bps: 800, source: 'default' });
  });

  it('per-operator override wins over everything, including zero', async () => {
    const m = { ...defaultBusinessModel(), launchPromoEnabled: true, launchPromoCommissionBps: 0 };
    expect(await resolveCommission(f.db, m, op({ platform_fee_bps: 0, launch_partner: 1 }))).toEqual({ bps: 0, source: 'operator_override' });
    expect((await resolveCommission(f.db, m, op({ platform_fee_bps: 250 }))).bps).toBe(250);
  });

  it('launch promo applies only to flagged operators, while active, under the cap, before the end date', async () => {
    const m = { ...defaultBusinessModel(), operatorCommissionBps: 800, launchPromoEnabled: true, launchPromoCommissionBps: 100, launchPromoBookingCap: 1, launchPromoUntil: '2027-01-01' };
    expect((await resolveCommission(f.db, m, op())).source).toBe('default');
    expect(await resolveCommission(f.db, m, op({ launch_partner: 1 }), { today: '2026-12-31' })).toEqual({ bps: 100, source: 'launch_promo' });
    expect((await resolveCommission(f.db, m, op({ launch_partner: 1 }), { today: '2027-01-02' })).source).toBe('default');
    expect((await resolveCommission(f.db, { ...m, launchPromoEnabled: false }, op({ launch_partner: 1 }), { today: '2026-12-31' })).source).toBe('default');

    await f.db.run(`INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents, operator_payout_cents, status, provider)
      VALUES (?, ?, ?, ?, 1000, 10, 990, 'succeeded', 'stub')`, [f.requestId, f.quoteA, f.customerId, f.operatorA]);
    expect((await resolveCommission(f.db, m, op({ launch_partner: 1 }), { today: '2026-12-31' })).source).toBe('default');
    expect((await resolveCommission(f.db, { ...m, launchPromoBookingCap: 0 }, op({ launch_partner: 1 }), { today: '2026-12-31' })).source).toBe('launch_promo');
  });

  it('empty legs and subscribers get their own rates', async () => {
    const m = { ...defaultBusinessModel(), operatorCommissionBps: 800, emptyLegCommissionBps: 1500, subscriptionEnabled: true, subscriptionCommissionBps: 500 };
    expect(await resolveCommission(f.db, m, op(), { emptyLeg: true })).toEqual({ bps: 1500, source: 'empty_leg' });
    expect(await resolveCommission(f.db, m, op({ plan: 'subscriber' }))).toEqual({ bps: 500, source: 'subscription' });
    expect((await resolveCommission(f.db, { ...m, subscriptionEnabled: false }, op({ plan: 'subscriber' }))).source).toBe('default');
  });
});

describe('estimatedProcessingCents', () => {
  it('is zero unless processing is passed to the operator', () => {
    const m = { ...defaultBusinessModel(), processingFeeBps: 290, processingFeeFixedCents: 30 };
    expect(estimatedProcessingCents(m, 100_000)).toBe(0);
    expect(estimatedProcessingCents({ ...m, passProcessingToOperator: true }, 100_000)).toBe(2_930);
  });
});
