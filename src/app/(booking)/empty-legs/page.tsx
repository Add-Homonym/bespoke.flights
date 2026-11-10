import type { Metadata } from 'next';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listEmptyLegs } from '@/lib/empty-legs/service';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { EmptyLegCard } from '@/components/empty-legs/empty-leg-card';
import { BookEmptyLeg } from '@/components/empty-legs/book-empty-leg';
import { EmptyLegFilter } from '@/components/empty-legs/empty-leg-filter';

export const metadata: Metadata = {
  title: 'Empty legs — Bespoke Flights',
  description: 'Repositioning flights listed by certified charter operators at a fixed all-in price. Book the whole aircraft on this screen.',
};

export default async function EmptyLegsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const session = await getSession();
  const legs = await listEmptyLegs(getDb(), { from, to });
  const filtered = Boolean(from || to);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="text-overline text-ink-muted mb-2">Empty legs</p>
        <h1 className="text-display text-ink">Flights already going your way</h1>
        <p className="mt-3 text-body text-ink-muted">
          Operators list repositioning flights here at a fixed all-in price for the whole aircraft. The date and route are the operator&rsquo;s;
          the price is well below a full charter. Book on this screen and pay the listed amount.
        </p>
      </div>

      <EmptyLegFilter from={from ?? ''} to={to ?? ''} />

      {legs.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-body text-ink-muted">
            {filtered ? 'No empty legs on this route right now.' : 'No empty legs are listed right now.'}
          </p>
          <ButtonLink href="/book" size="sm">Request quotes for your trip</ButtonLink>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4">
          {legs.map(leg => (
            <EmptyLegCard key={leg.id} leg={leg} action={<BookEmptyLeg legId={leg.id} seats={leg.seats} viewerRole={session?.role ?? null} />} />
          ))}
        </div>
      )}

      <p className="mt-8 text-label text-ink-muted">
        An empty leg is confirmed when your payment clears. If the operator&rsquo;s schedule changes before then, you are refunded in full and told on this screen and by email.
      </p>
    </div>
  );
}
