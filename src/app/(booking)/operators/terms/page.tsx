import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BusinessModelEditor } from '@/components/admin/business-model-editor';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { APPLIED_FIELDS, estimatedProcessingCents, getBusinessModel, type BusinessModel } from '@/lib/business-model';
import { formatMoney } from '@/lib/payments/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator terms — Bespoke Flights',
  description: 'What Bespoke Flights charges operators, how travelers pay, and how payouts work.',
};

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

const EXAMPLE_PRICE_CENTS = 8_500_000;

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Terms row: label on the left, figure on the right. */
function Term({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3 border-b border-hairline last:border-b-0">
      <div>
        <p className="text-body text-ink">{label}</p>
        {note && <p className="text-label text-ink-muted">{note}</p>}
      </div>
      <p className="text-heading text-ink tabular-nums shrink-0">{value}</p>
    </div>
  );
}

function example(m: BusinessModel) {
  const price = EXAMPLE_PRICE_CENTS;
  const commission = Math.round((price * m.operatorCommissionBps) / 10_000);
  const processing = estimatedProcessingCents(m, price);
  return { price, commission, processing, payout: price - commission - processing };
}

export default async function OperatorTermsPage() {
  const db = getDb();
  const [session, model] = await Promise.all([getSession(), getBusinessModel(db)]);
  const isAdmin = session?.role === 'admin';
  const ex = example(model);
  const promoActive = model.launchPromoEnabled && (!model.launchPromoUntil || model.launchPromoUntil >= new Date().toISOString().slice(0, 10));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10">
        <div>
          <p className="text-overline text-royal mb-3">For operators</p>
          <h1 className="text-display text-ink mb-3">How the money works</h1>
          <p className="text-body text-ink-muted">
            Bespoke Flights is a quote marketplace, not a broker. You set the price, the traveler sees your price, and the platform earns a commission only when a booking is paid. There is no listing fee and no markup on your quote.
          </p>
        </div>
        {isAdmin && <div className="mt-6"><BusinessModelEditor initial={model} applied={[...APPLIED_FIELDS]} /></div>}
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="text-title text-ink mb-1">Commission</h2>
          <p className="text-body text-ink-muted mb-4">Deducted from the booking when the traveler pays. Nothing is owed on quotes that are not booked.</p>
          <Term label="Standard commission" value={pct(model.operatorCommissionBps)} note="On the quoted price of a confirmed booking." />
          <Term label="Empty-leg bookings" value={pct(model.emptyLegCommissionBps)} note="Repositioning flights you list as empty legs." />
          {model.subscriptionEnabled && (
            <Term label="Subscriber commission" value={pct(model.subscriptionCommissionBps)} note={`For operators on the subscription plan, ${formatMoney(model.subscriptionMonthlyCents)} per month${model.subscriptionPriorityPlacement ? ', with priority placement in quote lists' : ''}.`} />
          )}
          {promoActive && (
            <Term
              label="Launch partner rate"
              value={pct(model.launchPromoCommissionBps)}
              note={[
                model.launchPromoBookingCap > 0 ? `First ${model.launchPromoBookingCap} paid bookings` : 'All paid bookings',
                model.launchPromoUntil ? `through ${longDate(model.launchPromoUntil)}` : null,
                'for operators onboarded as launch partners.',
              ].filter(Boolean).join(' ')}
            />
          )}
          <p className="text-label text-ink-muted mt-4">A negotiated rate on your account replaces the rates above. Your current rate is shown on your Payouts page.</p>
        </Card>

        <Card>
          <h2 className="text-title text-ink mb-1">What the traveler pays</h2>
          <p className="text-body text-ink-muted mb-4">The traveler pays the price you quoted, all in. Quotes show the operator’s legal name, FAA certificate and safety rating before booking.</p>
          <Term label="Platform fee charged to the traveler" value={model.feePayer === 'operator' || model.travelerFeeBps === 0 ? 'None' : pct(model.travelerFeeBps)} />
          <Term label="Quote order shown to travelers" value={model.rankQuotesBy === 'price' ? 'Lowest price first' : 'Best match first, then price'} />
        </Card>

        <Card>
          <h2 className="text-title text-ink mb-1">Payment and payout</h2>
          <p className="text-body text-ink-muted mb-4">The platform collects payment by card or bank transfer and routes it to your Stripe Connect account. Your payout is the quoted price less the commission{model.passProcessingToOperator ? ' and the payment processing cost' : ''}.</p>
          <Term
            label="Payment processing"
            value={model.passProcessingToOperator ? `${pct(model.processingFeeBps)} + ${formatMoney(model.processingFeeFixedCents)}` : 'Covered by the platform'}
            note={model.passProcessingToOperator ? 'Deducted from your payout.' : 'Not deducted from your payout.'}
          />
          <Term label="Refunds" value="Pro rata" note="When a booking is refunded, the commission on the refunded amount is returned with it." />
        </Card>

        <section className="rounded-lg border border-hairline bg-night p-6 text-on-night shadow-raised" aria-labelledby="example-heading">
          <h2 id="example-heading" className="text-title text-on-night mb-1">Worked example</h2>
          <p className="text-body text-on-night-muted mb-4">A {formatMoney(ex.price)} quote booked at the standard commission.</p>
          <dl className="space-y-2 text-body">
            <div className="flex justify-between gap-6"><dt className="text-on-night-muted">Traveler pays</dt><dd className="text-on-night tabular-nums">{formatMoney(ex.price)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-on-night-muted">Commission ({pct(model.operatorCommissionBps)})</dt><dd className="text-on-night tabular-nums">−{formatMoney(ex.commission)}</dd></div>
            {ex.processing > 0 && (
              <div className="flex justify-between gap-6"><dt className="text-on-night-muted">Payment processing</dt><dd className="text-on-night tabular-nums">−{formatMoney(ex.processing)}</dd></div>
            )}
            <div className="flex justify-between gap-6 border-t border-on-night-muted/40 pt-2"><dt className="text-on-night">Your payout</dt><dd className="text-figure text-on-night">{formatMoney(ex.payout)}</dd></div>
          </dl>
        </section>

        <Card>
          <h2 className="text-title text-ink mb-1">What you get</h2>
          <ul className="text-body text-ink space-y-2 list-disc pl-5">
            <li>Requests matched to your markets and fleet, delivered by email or text.</li>
            <li>Quote in-app, revise or withdraw before booking, and message the traveler through the platform.</li>
            <li>The traveler books and pays on screen. No phone calls to close a sale.</li>
            <li>Trip sheet, company board and receipts generated automatically once a booking is paid.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/register?role=operator" variant="primary">Register as an operator</ButtonLink>
            <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
