import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/dashboard');

  const db = getDb();
  const user = (await db.one<{ name: string; role: string }>('SELECT name, role FROM users WHERE id = ?', [session.userId]))!;

  return (
    <>
      <Header user={user} />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 pt-12 pb-16">
        {children}
      </main>
    </>
  );
}
