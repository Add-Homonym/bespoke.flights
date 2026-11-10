import { cookies } from 'next/headers';
import { TicketBookingForm } from '@/components/booking/ticket-booking-form';
import { getSession } from '@/lib/auth';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';

export default async function BookPage() {
  const session = await getSession();
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  return (
    <div id="book-page" className="mx-auto max-w-2xl">
      <div id="book-intro" className="mb-8">
        <h1 className="text-display text-ink">Plan your trip</h1>
        <p className="mt-2 text-body text-ink-muted">
          One ticket per leg. Quotes are requested as soon as the route is set.
        </p>
      </div>
      <TicketBookingForm initialDraft={draft} viewerRole={session?.role ?? null} />
    </div>
  );
}
