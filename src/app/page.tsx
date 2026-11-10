import { cookies } from 'next/headers';
import { Footer, Header } from '@/components/layout/header';
import { TicketBookingForm } from '@/components/booking/ticket-booking-form';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';

export default async function HomePage() {
  const session = await getSession();
  const user = session
    ? (await getDb().one<{ name: string; role: string }>('SELECT name, role FROM users WHERE id = ?', [session.userId])) ?? null
    : null;
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  return (
    <>
      <Header user={user} />
      <main id="home" className="flex-1">
        {/* Hero: the booking form is the first thing on the page. */}
        <section id="hero" className="border-b border-hairline bg-night text-on-night">
          <div className="mx-auto max-w-2xl px-4 pb-8 pt-12 sm:px-6">
            <p className="text-overline text-on-night-muted mb-4">Private charter</p>
            <h1 className="text-display text-on-night sm:text-display-xl">
              Fly on <em className="italic">your</em> terms.
            </h1>
            <p className="mt-4 text-body text-on-night-muted">
              Add your route, compare all-in quotes from certified operators, and book it on this screen.
            </p>
          </div>
        </section>

        <section id="plan-trip" aria-label="Plan your trip" className="mx-auto max-w-2xl px-4 pt-8 pb-[var(--space-7)] sm:px-6">
          <TicketBookingForm initialDraft={draft} viewerRole={session?.role ?? null} />
        </section>
      </main>

      <Footer user={user} />
    </>
  );
}
