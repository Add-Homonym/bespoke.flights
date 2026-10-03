import Database from 'better-sqlite3';
import { initDb } from '@/lib/db';

export interface Fixture {
  db: Database.Database;
  customerId: number;
  otherCustomerId: number;
  operatorA: number;
  operatorB: number;
  requestId: number;
  quoteA: number;
  quoteB: number;
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export function createFixture(db: Database.Database = initDb(new Database(':memory:'))): Fixture {
  const user = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)');
  const customerId = Number(user.run('cust@example.com', 'x', 'Customer', 'customer').lastInsertRowid);
  const otherCustomerId = Number(user.run('other@example.com', 'x', 'Other', 'customer').lastInsertRowid);
  const opUserA = Number(user.run('a@ops.com', 'x', 'Op A', 'operator').lastInsertRowid);
  const opUserB = Number(user.run('b@ops.com', 'x', 'Op B', 'operator').lastInsertRowid);

  const op = db.prepare(`INSERT INTO operators (user_id, company_name, status, contact_email, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled)
    VALUES (?, ?, 'approved', ?, ?, 1, 1)`);
  const operatorA = Number(op.run(opUserA, 'Alpha Air', 'dispatch@alpha.com', 'acct_alpha').lastInsertRowid);
  const operatorB = Number(op.run(opUserB, 'Bravo Jets', null, 'acct_bravo').lastInsertRowid);

  const requestId = Number(db.prepare(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'quoted', 4)`)
    .run(customerId).lastInsertRowid);
  db.prepare(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'KLAX', 'PHNL', ?)`)
    .run(requestId, future(30));
  db.prepare(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 2, 'PHNL', 'KLAX', ?)`)
    .run(requestId, future(37));

  const quote = db.prepare(`INSERT INTO quotes (request_id, operator_id, price_cents, valid_until) VALUES (?, ?, ?, ?)`);
  const quoteA = Number(quote.run(requestId, operatorA, 8_500_000, future(14)).lastInsertRowid);
  const quoteB = Number(quote.run(requestId, operatorB, 9_200_000, future(14)).lastInsertRowid);

  return { db, customerId, otherCustomerId, operatorA, operatorB, requestId, quoteA, quoteB };
}

export function row<T>(db: Database.Database, sql: string, ...params: unknown[]): T {
  return db.prepare(sql).get(...params) as T;
}
