import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { operatorForBoardToken } from '@/lib/board/data';
import { CompanyBoard } from '@/components/board/company-board';

export const metadata: Metadata = {
  title: 'Company board',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Read-only live board for staff without logins, behind a private link. */
export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const operatorId = await operatorForBoardToken(db, token);
  if (!operatorId) notFound();
  const company = (await db.one<{ company_name: string }>('SELECT company_name FROM operators WHERE id = ?', [operatorId]))!.company_name;

  return (
    <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-10">
      <div className="mb-8">
        <p className="text-brand-muted text-sm">{company}</p>
        <h1 className="font-display text-3xl text-brand-cream">Company Board</h1>
        <p className="text-brand-muted text-xs mt-2">Internal use only. Contains passenger contact details.</p>
      </div>
      <CompanyBoard source={`/api/board/${token}`} linkTrips={false} />
    </main>
  );
}
