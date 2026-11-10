import type { Metadata } from 'next';
import { buttonStyles } from '@/components/ui/button-styles';

export const metadata: Metadata = {
  title: 'Unsubscribe — bespoke.flights',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Opt-out page linked from operator outreach emails. The opt-out itself is a
 * POST, so link scanners that open the page do not unsubscribe anyone.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;

  return (
    <main className="flex-1 mx-auto max-w-xl w-full px-4 sm:px-6 py-16">
      <h1 className="text-display text-ink">Unsubscribe</h1>
      {done ? (
        <p role="status" className="mt-4 text-body text-ink">You will not receive further messages from bespoke.flights about joining as an operator.</p>
      ) : t ? (
        <form method="post" action="/api/unsubscribe" className="mt-6 space-y-4">
          <p className="text-body text-ink-muted">Stop receiving invitations to join bespoke.flights as an operator.</p>
          <input type="hidden" name="t" value={t} />
          <button type="submit" className={buttonStyles()}>
            Unsubscribe
          </button>
        </form>
      ) : (
        <p className="mt-4 text-body text-ink-muted">This link is incomplete. Reply to the email you received and we will remove you.</p>
      )}
    </main>
  );
}
