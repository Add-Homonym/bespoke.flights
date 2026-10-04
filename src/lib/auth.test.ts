import { afterEach, describe, expect, it, vi } from 'vitest';

describe('session tokens', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('round-trips a payload and rejects a token signed with another key', async () => {
    vi.stubEnv('JWT_SECRET', 'first-key-first-key-first-key-first-key');
    const a = await import('./auth');
    const token = await a.createToken({ userId: 7, role: 'operator' });
    expect(await a.verifyToken(token)).toEqual({ userId: 7, role: 'operator' });

    vi.resetModules();
    vi.stubEnv('JWT_SECRET', 'second-key-second-key-second-key-second');
    const b = await import('./auth');
    expect(await b.verifyToken(token)).toBeNull();
  });

  it('rejects a token with a malformed payload', async () => {
    vi.stubEnv('JWT_SECRET', 'first-key-first-key-first-key-first-key');
    const { SignJWT } = await import('jose');
    const a = await import('./auth');
    const forged = await new SignJWT({ userId: '7', role: 'superuser' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('first-key-first-key-first-key-first-key'));
    expect(await a.verifyToken(forged)).toBeNull();
  });

  it('refuses to run in production without a strong secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'change-me');
    const a = await import('./auth');
    await expect(a.createToken({ userId: 1, role: 'admin' })).rejects.toThrow(/JWT_SECRET/);
  });
});
