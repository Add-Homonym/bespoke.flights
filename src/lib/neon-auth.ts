import { createNeonAuth } from '@neondatabase/auth/next/server';

/**
 * Neon Auth (managed Better Auth) server client.
 *
 * Neon Auth is on when NEON_AUTH_BASE_URL is set (Neon console → Auth → Configuration).
 * NEON_AUTH_COOKIE_SECRET must be at least 32 characters.
 */
export function neonAuthEnabled(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL);
}

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function neonAuth() {
  if (!instance) {
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('NEON_AUTH_COOKIE_SECRET must be set to a random string of at least 32 characters.');
    }
    instance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret },
    });
  }
  return instance;
}
