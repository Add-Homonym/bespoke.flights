import { cookies } from 'next/headers';
import { MultiLegForm } from '@/components/booking/multi-leg-form';
import { getSession } from '@/lib/auth';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';

export default async function BookPage() {
  const session = await getSession();
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-3xl text-brand-cream mb-2">Book a Flight</h1>
        <p className="text-brand-muted">
          Build your multi-leg itinerary. Operators will compete to quote your trip.
          {!session && ' No account needed until you submit.'}
        </p>
      </div>
      <MultiLegForm initialDraft={draft} viewerRole={session?.role ?? null} />
    </div>
  );
}
