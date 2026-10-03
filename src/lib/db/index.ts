import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA, COLUMN_MIGRATIONS } from './schema';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bespoke.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initDb(db);
  }
  return db;
}

/** Apply pragmas, schema, and column migrations to a connection. */
export function initDb(conn: Database.Database): Database.Database {
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  applyColumnMigrations(conn);
  return conn;
}

export function applyColumnMigrations(conn: Database.Database) {
  for (const { table, column, definition } of COLUMN_MIGRATIONS) {
    const columns = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(c => c.name === column)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
