import { cookies } from 'next/headers';
import { Header } from '@/components/layout/header';
import { MultiLegForm } from '@/components/booking/multi-leg-form';
import { ButtonLink } from '@/components/ui/button';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { DRAFT_COOKIE, parseDraft } from '@/lib/bookings/draft';
import { Logo } from '@/components/ui/logo';

const operatorPoints = [
  'See booking demand as it arrives',
  'Quote with your fleet details',
  'Track which quotes are accepted',
  'Share booked trips with your team',
];

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
          <MultiLegForm initialDraft={draft} viewerRole={session?.role ?? null} />
        </section>

        {/* For operators */}
        <section id="for-operators" className="border-t border-hairline bg-surface-sunken">
          <div className="mx-auto max-w-3xl px-4 py-[var(--space-7)] sm:px-6">
            <p className="text-overline text-ink-muted mb-2">For operators</p>
            <h2 className="text-display text-ink">Fill empty legs. Grow your business.</h2>
            <p className="mt-4 max-w-xl text-body text-ink-muted">
              Access a stream of qualified charter requests with passenger counts, routes and dates, then quote to win new clients. There are no listing fees.
            </p>
            <ul className="mt-6 grid gap-2 text-body text-ink">
              {operatorPoints.map(point => <li key={point}>{point}</li>)}
            </ul>
            <ButtonLink href="/register?role=operator" variant="secondary" className="mt-8">Register as an operator</ButtonLink>
          </div>
        </section>
      </main>

      <footer id="site-footer" className="border-t border-hairline py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <span className="text-label text-ink-muted">&copy; {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </>
  );
}
