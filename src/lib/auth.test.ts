import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb, resetDb } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { seedDemoData, DEMO_PASSWORD } from '@/lib/db/demo-data';

// In-memory stand-in for the Neon Auth service.
interface FakeUser { id: string; email: string; name: string; password: string; emailVerified: boolean }
const store = vi.hoisted(() => ({ users: [] as FakeUser[], current: null as FakeUser | null }));

vi.mock('@/lib/neon-auth', () => {
  const ok = (u: FakeUser) => ({ data: { user: u }, error: null });
  return {
    neonAuthEnabled: () => true,
    neonAuth: () => ({
      signIn: {
        email: async ({ email, password }: { email: string; password: string }) => {
          const u = store.users.find(x => x.email === email && x.password === password);
          if (!u) return { data: null, error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' } };
          store.current = u;
          return ok(u);
        },
      },
      signUp: {
        email: async ({ email, password, name }: { email: string; password: string; name: string }) => {
          if (store.users.some(x => x.email === email)) return { data: null, error: { status: 422, code: 'USER_ALREADY_EXISTS' } };
          const u = { id: `neon-${store.users.length + 1}`, email, name, password, emailVerified: false };
          store.users.push(u);
          store.current = u;
          return ok(u);
        },
      },
      getSession: async () => ({ data: store.current ? { user: store.current } : null }),
      signOut: async () => { store.current = null; },
    }),
  };
});

const { authenticate, registerUser, getSession } = await import('./auth');

describe('Neon Auth', () => {
  beforeEach(() => { store.users = []; store.current = null; });

  it('moves a seeded demo account onto Neon Auth on first sign-in', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    await seedDemoData(db);

    const user = await authenticate(db, 'John@Example.com', DEMO_PASSWORD);
    expect(user?.email).toBe('john@example.com');
    expect(user?.role).toBe('customer');
    expect(user?.auth_id).toBe(store.users[0].id);
    expect(user?.password_hash).toBeNull();
    expect(await getSession()).toEqual({ userId: user!.id, role: 'customer' });

    // Second sign-in goes straight through Neon Auth.
    store.current = null;
    expect((await authenticate(db, 'john@example.com', DEMO_PASSWORD))?.id).toBe(user!.id);
    expect(store.users).toHaveLength(1);
  });

  it('keeps the operator and admin roles of demo accounts', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    await seedDemoData(db);
    expect((await authenticate(db, 'admin@bespoke.flights', DEMO_PASSWORD))?.role).toBe('admin');
    expect((await authenticate(db, 'ops@eliteair.com', DEMO_PASSWORD))?.role).toBe('operator');
  });

  it('rejects a wrong password, for migrated and unknown accounts alike', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    await seedDemoData(db);
    expect(await authenticate(db, 'john@example.com', 'wrong-password')).toBeNull();
    expect(await authenticate(db, 'nobody@example.com', DEMO_PASSWORD)).toBeNull();
    expect(store.users).toHaveLength(0);
  });

  it('registers a user with a profile linked to Neon Auth', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    const id = await registerUser(db, { email: 'New@x.com', password: 'longenough1', name: 'New', role: 'operator', companyName: 'NewCo' });
    expect(id).not.toBeNull();
    const row = await db.one<{ role: string; auth_id: string; password_hash: string | null }>('SELECT role, auth_id, password_hash FROM users WHERE id = ?', [id]);
    expect(row).toEqual({ role: 'operator', auth_id: store.users[0].id, password_hash: null });
    expect(await db.one('SELECT id FROM operators WHERE user_id = ?', [id])).toBeTruthy();
    expect(await registerUser(db, { email: 'new@x.com', password: 'longenough1', name: 'Dup', role: 'customer' })).toBeNull();
  });

  it('does not hand an existing profile to an unverified Neon Auth identity with the same email', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    await seedDemoData(db);
    store.current = { id: 'attacker', email: 'admin@bespoke.flights', name: 'x', password: 'x', emailVerified: false };
    expect(await getSession()).toBeNull();
    expect((await db.one<{ auth_id: string | null }>("SELECT auth_id FROM users WHERE email = 'admin@bespoke.flights'"))!.auth_id).toBeNull();
  });

  it('gives a direct Neon Auth sign-up a customer profile', async () => {
    const db = await testDb();
    await resetDb(db);
    setDb(db);
    store.current = { id: 'n-9', email: 'direct@x.com', name: 'Direct', password: 'x', emailVerified: true };
    const session = await getSession();
    expect(session?.role).toBe('customer');
  });
});
