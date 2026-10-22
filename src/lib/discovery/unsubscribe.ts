import type { Db } from '@/lib/db';

const TOKEN = /^[A-Za-z0-9_-]{24}$/;

/** Opt a discovered operator out of further outreach. Returns false for an unknown token. */
export async function unsubscribeDiscovered(db: Db, token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const n = await db.run(`
    UPDATE discovered_operators SET status = 'opted_out', updated_at = now()
    WHERE unsubscribe_token = ? AND status != 'registered'
  `, [token]);
  if (n) return true;
  // Already registered: still a valid link, nothing to change.
  return Boolean(await db.one('SELECT id FROM discovered_operators WHERE unsubscribe_token = ?', [token]));
}
