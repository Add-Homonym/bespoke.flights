import { describe, expect, it } from 'vitest';
import { testDb, resetDb } from '@/lib/payments/__tests__/fixtures';
import { seedDemoData, DEMO_ACCOUNTS } from './demo-data';

describe('seedDemoData', () => {
  it('loads every demo account into an empty database, once', async () => {
    const db = await testDb();
    await resetDb(db);

    expect(await seedDemoData(db)).toBe(true);
    const emails = (await db.query<{ email: string }>('SELECT email FROM users ORDER BY id')).map(r => r.email);
    expect(emails).toEqual(DEMO_ACCOUNTS.map(a => a.email));

    expect(await seedDemoData(db)).toBe(false);
    expect((await db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users'))!.c).toBe(DEMO_ACCOUNTS.length);
  });

  it('creates payable quotes and future departures', async () => {
    const db = await testDb();
    await resetDb(db);
    await seedDemoData(db);

    const today = new Date().toISOString().slice(0, 10);
    const past = await db.query("SELECT id FROM booking_legs WHERE departure_date < ?", [today]);
    expect(past).toHaveLength(0);
    const quotes = await db.query<{ valid_until: string; status: string }>('SELECT valid_until, status FROM quotes');
    expect(quotes).toHaveLength(2);
    for (const q of quotes) {
      expect(q.status).toBe('pending');
      expect(q.valid_until > today).toBe(true);
    }
  });

  it('seeds exactly once when called concurrently', async () => {
    const db = await testDb();
    await resetDb(db);
    const results = await Promise.all([seedDemoData(db), seedDemoData(db), seedDemoData(db)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users'))!.c).toBe(DEMO_ACCOUNTS.length);
  });

  it('does nothing when a demo account already exists', async () => {
    const db = await testDb();
    await resetDb(db);
    await db.run("INSERT INTO users (email, password_hash, name, role) VALUES ('john@example.com', 'x', 'Real John', 'customer')");
    expect(await seedDemoData(db)).toBe(false);
    expect((await db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users'))!.c).toBe(1);
  });
});

describe('seedDemoData alongside real users', () => {
  it('still loads the demo accounts when someone has already signed up', async () => {
    const db = await testDb();
    await resetDb(db);
    await db.run("INSERT INTO users (email, password_hash, name, role) VALUES ('real@x.com', 'x', 'Real', 'customer')");
    expect(await seedDemoData(db)).toBe(true);
    expect((await db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users'))!.c).toBe(DEMO_ACCOUNTS.length + 1);
  });
});
