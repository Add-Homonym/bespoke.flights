import { beforeAll, describe, expect, it } from 'vitest';
import { testDb, resetDb } from '@/lib/payments/__tests__/fixtures';
import { checkRateLimit, rateLimited } from './rate-limit';
import type { Db } from '@/lib/db';

let db: Db;

beforeAll(async () => {
  db = await testDb();
  await resetDb(db);
});

describe('rate limit', () => {
  it('allows up to the limit in a window and then refuses', async () => {
    const rule = { limit: 3, windowSeconds: 3600 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(db, 'test:a', rule));
    expect(results.map(r => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfter).toBeGreaterThan(0);
    expect(results[3].retryAfter).toBeLessThanOrEqual(3600);
  });

  it('keeps keys independent', async () => {
    const rule = { limit: 1, windowSeconds: 3600 };
    expect((await checkRateLimit(db, 'test:b', rule)).allowed).toBe(true);
    expect((await checkRateLimit(db, 'test:c', rule)).allowed).toBe(true);
    expect((await checkRateLimit(db, 'test:b', rule)).allowed).toBe(false);
  });

  it('returns a 429 response with Retry-After once a scope is exhausted', async () => {
    let res = null;
    for (let i = 0; i < 4; i++) res = await rateLimited('discoveryRun', 42, db);
    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toMatch(/^\d+$/);
  });
});
