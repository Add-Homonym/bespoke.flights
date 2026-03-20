import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const db = getDb();
  const user = db.prepare('SELECT name, role FROM users WHERE id = ?').get(session.userId) as { name: string; role: string };

  return (
    <>
      <Header user={user} />
      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-10">
        {children}
      </main>
    </>
  );
}
