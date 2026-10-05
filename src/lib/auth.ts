import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { neonAuth, neonAuthEnabled } from './neon-auth';
import { getDb, type Db } from './db';
import { COOKIE_NAME, createToken, verifyToken } from './session-cookie';
import type { SessionPayload, User } from './types';

/**
 * Authentication.
 *
 * Production: Neon Auth owns credentials and sessions (users live in the
 * neon_auth schema of the same database). Our `users` table is the app profile:
 * it holds role and phone, and links to the Neon Auth user through `auth_id`.
 *
 * Development and tests without NEON_AUTH_BASE_URL: bcrypt hashes in
 * users.password_hash and a signed JWT cookie. Production refuses to start
 * without Neon Auth.
 *
 * Callers only see getSession(), authenticate(), registerUser() and signOut().
 */

type Role = SessionPayload['role'];

// ─── Local (development) sessions ───────────────────────────────────

async function setLocalSession(payload: SessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, await createToken(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

function requireConfigured() {
  if (!neonAuthEnabled() && process.env.NODE_ENV === 'production') {
    throw new Error('NEON_AUTH_BASE_URL is not set. Enable Neon Auth for the project and set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET.');
  }
}

// ─── Session ────────────────────────────────────────────────────────

/** The profile that belongs to a Neon Auth user, linking or creating it on first sight. */
async function profileForNeonUser(
  db: Db,
  neonUser: { id: string; email: string; name?: string | null; emailVerified?: boolean },
): Promise<Pick<User, 'id' | 'role'> | null> {
  const linked = await db.one<Pick<User, 'id' | 'role'>>('SELECT id, role FROM users WHERE auth_id = ?', [neonUser.id]);
  if (linked) return linked;

  const email = neonUser.email.toLowerCase();
  const byEmail = await db.one<Pick<User, 'id' | 'role'> & { auth_id: string | null }>(
    'SELECT id, role, auth_id FROM users WHERE lower(email) = ?', [email]);
  if (byEmail) {
    // Link by email only when Neon Auth has verified the address; otherwise anyone
    // could register an unverified identity with an admin's email and inherit the role.
    if (byEmail.auth_id || !neonUser.emailVerified) return null;
    await db.run('UPDATE users SET auth_id = ?, updated_at = now() WHERE id = ? AND auth_id IS NULL', [neonUser.id, byEmail.id]);
    return { id: byEmail.id, role: byEmail.role };
  }

  // Signed up with Neon Auth directly: a plain customer profile.
  const created = await db.one<{ id: number }>(
    "INSERT INTO users (email, name, role, auth_id) VALUES (?, ?, 'customer', ?) ON CONFLICT DO NOTHING RETURNING id",
    [email, neonUser.name || email.split('@')[0], neonUser.id]);
  return created ? { id: created.id, role: 'customer' } : null;
}

export async function getSession(): Promise<SessionPayload | null> {
  // Reading cookies first marks the calling page dynamic, so a missing Neon Auth
  // setting fails the request instead of the build's prerender step.
  const cookieStore = await cookies();
  requireConfigured();
  if (neonAuthEnabled()) {
    const { data } = await neonAuth().getSession();
    if (!data?.user) return null;
    const profile = await profileForNeonUser(getDb(), data.user);
    return profile ? { userId: profile.id, role: profile.role } : null;
  }

  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? verifyToken(token) : null;
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function requireRole(role: string): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== role) throw new Error('Forbidden');
  return session;
}

// ─── Sign in / up / out ─────────────────────────────────────────────

type NeonResult = { data?: { user?: { id: string } } | null; error?: { code?: string; message?: string; status?: number } | null };

function neonSignIn(email: string, password: string): Promise<NeonResult> {
  return neonAuth().signIn.email({ email, password }) as Promise<NeonResult>;
}

function neonSignUp(email: string, password: string, name: string): Promise<NeonResult> {
  return neonAuth().signUp.email({ email, password, name }) as Promise<NeonResult>;
}

/**
 * Check credentials and start a session. Returns the profile, or null for bad credentials.
 *
 * With Neon Auth, a profile that predates it (a demo account, or a user from the
 * bcrypt era: password_hash set, auth_id empty) is moved over the first time its
 * owner signs in with the right password.
 */
export async function authenticate(db: Db, email: string, password: string): Promise<User | null> {
  requireConfigured();
  email = email.trim().toLowerCase();

  if (!neonAuthEnabled()) {
    const user = await db.one<User>('SELECT * FROM users WHERE lower(email) = ?', [email]);
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) return null;
    await setLocalSession({ userId: user.id, role: user.role });
    return user;
  }

  let result = await neonSignIn(email, password);
  if (!result.data?.user) {
    const legacy = await db.one<User>('SELECT * FROM users WHERE lower(email) = ?', [email]);
    if (!legacy || legacy.auth_id || !legacy.password_hash || !(await bcrypt.compare(password, legacy.password_hash))) {
      if (result.error && (result.error.status ?? 0) >= 500) console.error('Neon Auth sign-in failed:', result.error);
      return null;
    }
    const created = await neonSignUp(email, password, legacy.name);
    // "Already exists" means the identity is there under another password; anything else is a real failure.
    if (created.error) console.error('Neon Auth migration sign-up failed:', created.error);
    result = await neonSignIn(email, password);
    if (!result.data?.user) {
      console.error('Neon Auth sign-in after migration failed:', result.error);
      return null;
    }
    await db.run('UPDATE users SET auth_id = ?, password_hash = NULL, updated_at = now() WHERE id = ? AND auth_id IS NULL',
      [result.data.user.id, legacy.id]);
  }

  const neonUser = result.data!.user!;
  const profile = await profileForNeonUser(db, neonUser as Parameters<typeof profileForNeonUser>[1]);
  if (!profile) return null;
  return (await db.one<User>('SELECT * FROM users WHERE id = ?', [profile.id]))!;
}

export interface NewUser {
  email: string;
  phone?: string;
  password: string;
  name: string;
  role: Exclude<Role, 'admin'>;
  companyName?: string;
}

/** Create an account and start its session. Returns null when the email is taken. */
export async function registerUser(db: Db, input: NewUser): Promise<number | null> {
  requireConfigured();
  const email = input.email.trim().toLowerCase();
  if (await db.one('SELECT id FROM users WHERE lower(email) = ?', [email])) return null;

  let authId: string | null = null;
  let passwordHash: string | null = null;
  if (neonAuthEnabled()) {
    const { data, error } = await neonSignUp(email, input.password, input.name);
    if (!data?.user) {
      if (error?.code === 'USER_ALREADY_EXISTS' || error?.status === 422) return null;
      throw new Error(`Neon Auth sign-up failed: ${error?.message ?? 'unknown error'}`);
    }
    authId = data.user.id;
  } else {
    passwordHash = await bcrypt.hash(input.password, 12);
  }

  const userId = await db.transaction(async tx => {
    const { id } = (await tx.one<{ id: number }>(
      'INSERT INTO users (email, phone, password_hash, auth_id, name, role) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [email, input.phone || null, passwordHash, authId, input.name, input.role],
    ))!;
    if (input.role === 'operator' && input.companyName) {
      await tx.run('INSERT INTO operators (user_id, company_name) VALUES (?, ?)', [id, input.companyName]);
    }
    return id;
  });

  if (neonAuthEnabled()) {
    // signUp.email normally opens a session; make sure of it.
    if (!(await neonAuth().getSession()).data?.user) await neonSignIn(email, input.password);
  } else {
    await setLocalSession({ userId, role: input.role });
  }
  return userId;
}

export async function signOut() {
  if (neonAuthEnabled()) {
    await neonAuth().signOut();
    return;
  }
  (await cookies()).delete(COOKIE_NAME);
}
