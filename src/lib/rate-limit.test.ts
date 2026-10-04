import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clientIp, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit in a window and refuses after', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, t).ok).toBe(true);
    const r = rateLimit('k', 3, 60_000, t + 1000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(59);
  });

  it('resets once the window has passed', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) rateLimit('k', 3, 60_000, t);
    expect(rateLimit('k', 3, 60_000, t + 60_000).ok).toBe(true);
  });

  it('keys are independent', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) rateLimit('a', 3, 60_000, t);
    expect(rateLimit('b', 3, 60_000, t).ok).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
    expect(clientIp(req)).toBe('203.0.113.9');
  });
  it('falls back to unknown', () => {
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
