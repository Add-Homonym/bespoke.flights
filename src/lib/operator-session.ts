import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { Operator } from '@/lib/types';

/** The signed-in operator's company, or null. */
export async function currentOperator() {
  const session = await getSession();
  if (!session || session.role !== 'operator') return null;
  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  return operator ? { db, session, operator } : null;
}
