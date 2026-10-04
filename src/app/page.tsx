import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function getUser() {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const user = await db.one<{ name: string; role: string }>('SELECT name, role FROM users WHERE id = ?', [session.userId]);
  return user || null;
}

export default async function HomePage() {
  const user = await getUser();

  return (
    <>
      <Header user={user} />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-navy/50 via-brand-dark to-brand-dark" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-gold/5 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-32 text-center">
            <p className="text-brand-gold text-sm font-semibold tracking-widest uppercase mb-6">Private Aviation, Redefined</p>
            <h1 className="font-display text-5xl md:text-7xl text-brand-cream leading-tight mb-8">
              Fly on <span className="text-brand-gold italic">Your</span> Terms
            </h1>
            <p className="text-brand-muted text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
              Build multi-leg itineraries, receive competitive quotes from certified charter operators, and book your perfect flight — all in one place.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-lg bg-brand-gold px-8 py-3.5 text-base font-semibold text-brand-dark hover:bg-brand-accent transition-colors"
              >
                Start Booking
              </Link>
              <Link
                href="/register?role=operator"
                className="rounded-lg border border-brand-border px-8 py-3.5 text-base font-medium text-brand-cream hover:border-brand-gold/50 hover:bg-brand-slate transition-colors"
              >
                Join as Operator
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="font-display text-3xl text-center text-brand-cream mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Build Your Itinerary', desc: 'Create multi-leg flight plans. Fly from A to B, B to C, and beyond — all in a single request.' },
              { step: '02', title: 'Receive Quotes', desc: 'Certified charter operators compete to offer you the best aircraft and pricing for your trip.' },
              { step: '03', title: 'Book & Fly', desc: 'Compare quotes side-by-side, accept the best offer, and prepare for departure.' },
            ].map(item => (
              <div key={item.step} className="rounded-xl border border-brand-border bg-brand-card p-8 hover:border-brand-gold/30 transition-colors">
                <span className="text-brand-gold font-display text-4xl">{item.step}</span>
                <h3 className="text-brand-cream text-lg font-semibold mt-4 mb-3">{item.title}</h3>
                <p className="text-brand-muted text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* For Operators */}
        <section className="border-t border-brand-border">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-brand-gold text-sm font-semibold tracking-widest uppercase mb-4">For Operators</p>
                <h2 className="font-display text-3xl text-brand-cream mb-6">Fill Empty Legs & Grow Your Business</h2>
                <p className="text-brand-muted leading-relaxed mb-8">
                  Access a stream of qualified charter requests. See passenger counts, routes, and dates — then submit competitive quotes to win new clients. No listing fees, just results.
                </p>
                <Link
                  href="/register?role=operator"
                  className="inline-block rounded-lg border border-brand-gold text-brand-gold px-6 py-3 text-sm font-semibold hover:bg-brand-gold hover:text-brand-dark transition-colors"
                >
                  Register as an Operator
                </Link>
              </div>
              <div className="rounded-xl border border-brand-border bg-brand-card p-8 space-y-4">
                {['View real-time booking demand', 'Submit quotes with your fleet details', 'Track quote acceptance rates', 'Build your reputation with clients'].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-gold/20 flex items-center justify-center mt-0.5 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-brand-gold" />
                    </div>
                    <span className="text-brand-cream text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-brand-border bg-brand-navy/30">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h2 className="font-display text-3xl text-brand-cream mb-6">Ready to Elevate Your Travel?</h2>
            <p className="text-brand-muted text-lg mb-10">Create your free account and start building your first itinerary in minutes.</p>
            <Link
              href="/register"
              className="rounded-lg bg-brand-gold px-10 py-4 text-base font-semibold text-brand-dark hover:bg-brand-accent transition-colors"
            >
              Create Your Account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border py-8">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between">
          <span className="font-display text-sm text-brand-muted">bespoke<span className="text-brand-gold">.flights</span></span>
          <span className="text-xs text-brand-muted/50">&copy; {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </>
  );
}
