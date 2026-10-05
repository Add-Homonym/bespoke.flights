/**
 * Postgres access.
 *
 * Production: Neon via the Vercel Marketplace integration, which sets
 * DATABASE_URL (pooled connection string). Queries go through node-postgres.
 *
 * Development and tests without DATABASE_URL: an embedded PGlite (Postgres
 * compiled to WASM), stored in PGLITE_DIR (default data/pglite), or in
 * memory when PGLITE_DIR=memory.
 *
 * SQL is written with `?` placeholders; they are rewritten to $1, $2, ...
 * Do not use a literal `?` inside SQL text.
 */

import path from 'path';
import { types as pgTypes, Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import type { PGlite, Transaction as PGliteTransaction } from '@electric-sql/pglite';
import { SCHEMA } from './schema';

export interface Db {
  /** All rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** First row, or undefined. */
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Execute a statement; returns affected row count. */
  run(sql: string, params?: unknown[]): Promise<number>;
  /** Run fn inside BEGIN/COMMIT; rolls back if it throws. Nested calls reuse the outer transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

// ─── Type parsing ───────────────────────────────────────────────────
// int8 (COUNT, SUM, BIGINT cents) → number: all values are far below 2^53.
// numeric → number. timestamptz → ISO 8601 string, so rows serialize the
// same way in server components, JSON responses and client props.

const INT8 = 20;
const NUMERIC = 1700;
const TIMESTAMPTZ = 1184;

const toNumber = (v: string) => Number(v);

/**
 * Postgres timestamptz text ('2026-10-03 21:56:01.123456+00', '+05:30') → ISO 8601 UTC.
 * Self-contained so it is safe when this module is evaluated more than once
 * (dev hot reload), where pg's registered parser would already be this one.
 */
export function toIso(v: string): string {
  const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(\.\d+)?(?:([+-]\d\d)(?::?(\d\d))?(?::?\d\d)?|Z)?$/.exec(v);
  if (!m) return v; // 'infinity', BC dates: leave as-is
  const [, date, time, frac = '', oh, om = '00'] = m;
  const ms = frac ? frac.slice(0, 4).padEnd(4, '0') : '';
  const offset = oh ? `${oh}:${om}` : 'Z';
  return new Date(`${date}T${time}${ms}${offset}`).toISOString();
}

pgTypes.setTypeParser(INT8, toNumber);
pgTypes.setTypeParser(NUMERIC, toNumber);
pgTypes.setTypeParser(TIMESTAMPTZ, toIso);

export const PGLITE_PARSERS = { [INT8]: toNumber, [NUMERIC]: toNumber, [TIMESTAMPTZ]: toIso };

/** Rewrite `?` placeholders to `$n`. */
export function toPositional(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// ─── Adapters ───────────────────────────────────────────────────────

type Executor = (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

function makeDb(exec: Executor, transaction: Db['transaction']): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await exec(toPositional(sql), params)).rows as T[];
    },
    async one<T>(sql: string, params: unknown[] = []) {
      return (await exec(toPositional(sql), params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      return (await exec(toPositional(sql), params)).rowCount;
    },
    transaction,
  };
}

function pgClientDb(client: PoolClient): Db {
  const db: Db = makeDb(
    async (sql, params) => {
      const r = await client.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    fn => fn(db),
  );
  return db;
}

export function pgPoolDb(pool: Pool): Db {
  return makeDb(
    async (sql, params) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(pgClientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );
}

function pgliteTxDb(tx: PGliteTransaction): Db {
  const db: Db = makeDb(
    async (sql, params) => {
      const r = await tx.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? 0 };
    },
    fn => fn(db),
  );
  return db;
}

export function pgliteDb(pg: PGlite): Db {
  return makeDb(
    async (sql, params) => {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? 0 };
    },
    fn => pg.transaction(tx => fn(pgliteTxDb(tx))),
  );
}

// ─── Schema ─────────────────────────────────────────────────────────

/** Apply the schema. Serialized with an advisory lock so concurrent cold starts don't race. */
export async function migrate(db: Db): Promise<void> {
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(727274)');
    for (const statement of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
      await tx.run(statement);
    }
  });
}

// ─── Connection ─────────────────────────────────────────────────────

declare global {
  var __bespokeDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  let db: Db;
  const url = process.env.DATABASE_URL;

  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      idleTimeoutMillis: 10_000,
    });
    pool.on('error', err => console.error('Postgres pool error:', err.message));
    // On Vercel, closes idle connections before the function instance suspends. No-op elsewhere.
    attachDatabasePool(pool);
    db = pgPoolDb(pool);
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is not set. Add Neon to the Vercel project (Storage → Neon).');
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(process.cwd(), 'data', 'pglite');
    const pg = await PGlite.create(dir === 'memory' ? undefined : dir, { parsers: PGLITE_PARSERS });
    db = pgliteDb(pg);
  }

  await migrate(db);
  if (process.env.APP_TEST_MODE === 'true') {
    const { seedDemoData } = await import('./demo-data');
    if (await seedDemoData(db)) console.log('[test mode] Loaded demo accounts');
  }
  return db;
}

/** Shared connection, created on first use and reused across requests (and dev hot reloads). */
function ready(): Promise<Db> {
  if (!globalThis.__bespokeDb) {
    globalThis.__bespokeDb = connect().catch(err => {
      globalThis.__bespokeDb = undefined;
      throw err;
    });
  }
  return globalThis.__bespokeDb;
}

const lazyDb: Db = {
  async query<T>(sql: string, params?: unknown[]) { return (await ready()).query<T>(sql, params); },
  async one<T>(sql: string, params?: unknown[]) { return (await ready()).one<T>(sql, params); },
  async run(sql: string, params?: unknown[]) { return (await ready()).run(sql, params); },
  async transaction<T>(fn: (tx: Db) => Promise<T>) { return (await ready()).transaction(fn); },
};

export function getDb(): Db {
  return lazyDb;
}

/** Test hook: use a specific database for getDb(). */
export function setDb(db: Db | null) {
  globalThis.__bespokeDb = db ? Promise.resolve(db) : undefined;
}
