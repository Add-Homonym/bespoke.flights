import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { migrate, pgliteDb, pgPoolDb, PGLITE_PARSERS, type Db } from '@/lib/db';

export interface Fixture {
  db: Db;
  customerId: number;
  otherCustomerId: number;
  operatorA: number;
  operatorB: number;
  requestId: number;
  quoteA: number;
  quoteB: number;
}

let shared: Promise<Db> | undefined;

/**
 * One database per test file: in-process PGlite, or a real Postgres server
 * when TEST_DATABASE_URL is set (its tables are truncated between tests).
 */
export function testDb(): Promise<Db> {
  shared ??= (async () => {
    const db = process.env.TEST_DATABASE_URL
      ? pgPoolDb(new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 }))
      : pgliteDb(await PGlite.create({ parsers: PGLITE_PARSERS }));
    await migrate(db);
    return db;
  })();
  return shared;
}

export async function resetDb(db: Db) {
  await db.run(`TRUNCATE users, operators, aircraft, booking_requests, booking_legs, quotes, outreach_log,
    discovered_operators, payments, refunds, payment_events, trip_shares,
    operator_staff, staff_notifications, operator_boards RESTART IDENTITY CASCADE`);
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function insertId(db: Db, sql: string, params: unknown[]): Promise<number> {
  return (await db.one<{ id: number }>(`${sql} RETURNING id`, params))!.id;
}

export async function createFixture(): Promise<Fixture> {
  const db = await testDb();
  await resetDb(db);

  const user = 'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)';
  const customerId = await insertId(db, user, ['cust@example.com', 'x', 'Customer', 'customer']);
  const otherCustomerId = await insertId(db, user, ['other@example.com', 'x', 'Other', 'customer']);
  const opUserA = await insertId(db, user, ['a@ops.com', 'x', 'Op A', 'operator']);
  const opUserB = await insertId(db, user, ['b@ops.com', 'x', 'Op B', 'operator']);

  const op = `INSERT INTO operators (user_id, company_name, status, contact_email, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled)
    VALUES (?, ?, 'approved', ?, ?, 1, 1)`;
  const operatorA = await insertId(db, op, [opUserA, 'Alpha Air', 'dispatch@alpha.com', 'acct_alpha']);
  const operatorB = await insertId(db, op, [opUserB, 'Bravo Jets', null, 'acct_bravo']);

  const requestId = await insertId(db, `INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'quoted', 4)`, [customerId]);
  const leg = `INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, ?, ?, ?, ?)`;
  await db.run(leg, [requestId, 1, 'KLAX', 'PHNL', future(30)]);
  await db.run(leg, [requestId, 2, 'PHNL', 'KLAX', future(37)]);

  const quote = `INSERT INTO quotes (request_id, operator_id, price_cents, valid_until) VALUES (?, ?, ?, ?)`;
  const quoteA = await insertId(db, quote, [requestId, operatorA, 8_500_000, future(14)]);
  const quoteB = await insertId(db, quote, [requestId, operatorB, 9_200_000, future(14)]);

  return { db, customerId, otherCustomerId, operatorA, operatorB, requestId, quoteA, quoteB };
}

export async function row<T>(db: Db, sql: string, ...params: unknown[]): Promise<T> {
  return (await db.one<T>(sql, params))!;
}
