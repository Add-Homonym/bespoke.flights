import Link from 'next/link';
import { cookies } from 'next/headers';
import { MultiLegForm } from '@/components/booking/multi-leg-form';
import { getSession } from '@/lib/auth';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';

/** The step-by-step booking form. The ticket form at /book is the default. */
export default async function ClassicBookPage() {
  const session = await getSession();
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  return (
    <div id="book-page" className="mx-auto max-w-2xl">
      <div id="book-intro" className="mb-8">
        <h1 className="text-display text-ink">Plan your trip</h1>
        <p className="mt-2 text-body text-ink-muted">
          Add each leg and operators will quote the whole trip.{' '}
          <Link href="/book" className="text-royal underline underline-offset-4">Use the ticket form</Link>
        </p>
      </div>
      <MultiLegForm initialDraft={draft} viewerRole={session?.role ?? null} />
    </div>
  );
}
