import { Header } from '@/components/layout/header';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

/** Public pages that work with or without an account. */
export default async function BookingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session
    ? (await getDb().one<{ name: string; role: string }>('SELECT name, role FROM users WHERE id = ?', [session.userId])) ?? null
    : null;

  return (
    <>
      <Header user={user} />
      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-10">
        {children}
      </main>
    </>
  );
}
