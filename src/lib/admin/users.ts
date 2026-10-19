/**
 * Admin user and operator management.
 *
 * Accounts an admin creates get a temporary password (bcrypt, auth_id empty).
 * In production the first sign-in with that password moves the account to
 * Neon Auth (see authenticate() in lib/auth.ts), so the same path works in
 * both modes and never touches the admin's own session.
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import type { Db } from '@/lib/db';

export type Role = 'customer' | 'operator' | 'admin';

export class AdminError extends Error {
  constructor(message: string, public status = 400, public field?: string) { super(message); }
}

/** 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I). */
export function temporaryPassword(length = 14): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export interface NewAccount {
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  /** Required for operators. */
  companyName?: string | null;
  /** Operator approval on creation; admins usually add operators they have vetted. */
  operatorStatus?: 'pending' | 'approved' | 'suspended';
  /** Leave out to generate one. */
  password?: string | null;
}

/** Create an account. Returns its id and the password to hand over. */
export async function createAccount(db: Db, input: NewAccount): Promise<{ userId: number; operatorId: number | null; password: string }> {
  const email = input.email.trim().toLowerCase();
  if (await db.one('SELECT id FROM users WHERE lower(email) = ?', [email])) {
    throw new AdminError('An account with this email already exists', 409, 'email');
  }
  if (input.role === 'operator' && !input.companyName?.trim()) {
    throw new AdminError('Company name is required for an operator', 400, 'companyName');
  }
  const password = input.password || temporaryPassword();
  const hash = await bcrypt.hash(password, 12);

  return db.transaction(async tx => {
    const { id } = (await tx.one<{ id: number }>(
      'INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [email, input.phone?.trim() || null, hash, input.name.trim(), input.role]))!;
    let operatorId: number | null = null;
    if (input.role === 'operator') {
      operatorId = (await tx.one<{ id: number }>(
        'INSERT INTO operators (user_id, company_name, status, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [id, input.companyName!.trim(), input.operatorStatus ?? 'approved', email, input.phone?.trim() || null]))!.id;
    }
    return { userId: id, operatorId, password };
  });
}

export interface AccountChanges {
  name?: string;
  phone?: string | null;
  role?: Role;
  /** Needed when making someone an operator who has no operator profile yet. */
  companyName?: string | null;
}

/**
 * Change a user's name, phone or role. An admin cannot change their own role,
 * and the last admin cannot be demoted, so the platform always keeps an admin.
 */
export async function updateAccount(db: Db, actorId: number, userId: number, changes: AccountChanges): Promise<void> {
  const user = await db.one<{ id: number; role: Role }>('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!user) throw new AdminError('User not found', 404);

  await db.transaction(async tx => {
    if (changes.role && changes.role !== user.role) {
      if (userId === actorId) throw new AdminError('You cannot change your own role', 403, 'role');
      if (user.role === 'admin') {
        const { n } = (await tx.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'"))!;
        if (n <= 1) throw new AdminError('This is the only admin', 409, 'role');
      }
      if (changes.role === 'operator') {
        const existing = await tx.one('SELECT id FROM operators WHERE user_id = ?', [userId]);
        if (!existing) {
          if (!changes.companyName?.trim()) throw new AdminError('Company name is required to make this user an operator', 400, 'companyName');
          const u = (await tx.one<{ email: string; phone: string | null }>('SELECT email, phone FROM users WHERE id = ?', [userId]))!;
          await tx.run("INSERT INTO operators (user_id, company_name, status, contact_email, contact_phone) VALUES (?, ?, 'approved', ?, ?)",
            [userId, changes.companyName!.trim(), u.email, u.phone]);
        }
      }
      // A former operator keeps their operator profile (quotes and bookings refer to it); the role gates access.
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    if (changes.name !== undefined) { sets.push('name = ?'); values.push(changes.name.trim()); }
    if (changes.phone !== undefined) { sets.push('phone = ?'); values.push(changes.phone?.trim() || null); }
    if (changes.role !== undefined) { sets.push('role = ?'); values.push(changes.role); }
    if (sets.length) await tx.run(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = ?`, [...values, userId]);
  });
}
