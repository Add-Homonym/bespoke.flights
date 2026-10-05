import { cookies } from 'next/headers';
import { MultiLegForm } from '@/components/booking/multi-leg-form';
import { getSession } from '@/lib/auth';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';

export default async function BookPage() {
  const session = await getSession();
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-display text-ink">Plan your trip</h1>
        <p className="mt-2 text-body text-ink-muted">
          Add each leg and operators will quote the whole trip.
          {!session && ' You need an account only when you request quotes.'}
        </p>
      </div>
      <MultiLegForm initialDraft={draft} viewerRole={session?.role ?? null} />
    </div>
  );
}
