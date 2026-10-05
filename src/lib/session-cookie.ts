import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import type { SessionPayload } from './types';

/**
 * Edge-safe session helpers (no database, no Node-only imports), shared by
 * middleware and src/lib/auth.ts.
 */

export const COOKIE_NAME = 'session';
const NEON_SESSION_COOKIE = 'neon-auth.session_token';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'bespoke-flights-dev-secret-change-in-production'
);

/** Development-mode session token (used when Neon Auth is not configured). */
export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Middleware gate: is there a session cookie at all? Cheap and edge-safe. Real
 * verification and role checks happen in getSession(), which every page layout
 * and API route calls.
 */
export async function hasSessionCookie(req: NextRequest): Promise<boolean> {
  if (process.env.NEON_AUTH_BASE_URL) {
    return req.cookies.getAll().some(c => c.name.endsWith(NEON_SESSION_COOKIE));
  }
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return Boolean(token && (await verifyToken(token)));
}
