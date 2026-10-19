'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CreditCard, RefreshCw, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import type { StripeReadiness } from '@/lib/payments/stripe-setup';

type State = 'ok' | 'todo' | 'warn';

function Step({ state, title, children }: { state: State; title: string; children?: React.ReactNode }) {
  const Icon = state === 'ok' ? CircleCheck : state === 'warn' ? CircleAlert : CircleDashed;
  const color = state === 'ok' ? 'text-confirmed' : state === 'warn' ? 'text-warning' : 'text-ink-muted';
  return (
    <li className="flex gap-3 py-3">
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 space-y-1">
        <p className="text-body text-ink">{title}<span className="sr-only"> — {state === 'ok' ? 'done' : 'to do'}</span></p>
        {children && <div className="text-label text-ink-muted">{children}</div>}
      </div>
    </li>
  );
}

/** Admin checklist for taking real payments, with one-click webhook setup. */
export function StripeSetup() {
  const [s, setS] = useState<StripeReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'confirmed' | 'danger'; text: string } | null>(null);

  const load = async () => {
    const res = await fetch('/api/admin/stripe', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setS(await res.json());
  };
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, []);

  const setupWebhooks = async () => {
    setBusy(true); setMessage(null);
    const res = await fetch('/api/admin/stripe/webhooks', { method: 'POST' }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setS(body.status);
      setMessage({ tone: 'confirmed', text: `Webhooks created${body.replaced ? `, ${body.replaced} older endpoint${body.replaced === 1 ? '' : 's'} replaced` : ''}.` });
    } else {
      setMessage({ tone: 'danger', text: body?.error ?? 'Could not create webhooks' });
    }
  };

  if (!s) return <p role="status" className="text-body text-ink-muted">Checking Stripe…</p>;
  const hasKey = !!s.keyMode;
  const webhooksOk = !!s.webhooks.platform && !!s.webhooks.connect;

  return (
    <section id="stripe-setup" aria-labelledby="stripe-setup-title" className="rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="stripe-setup-title" className="inline-flex items-center gap-2 text-heading text-ink">
          <CreditCard size={20} strokeWidth={1.5} aria-hidden="true" className="text-royal" /> Stripe setup
          {s.keyMode && <span className={`rounded-pill px-2 py-0.5 text-overline ${s.keyMode === 'live' ? 'bg-confirmed-tint text-confirmed' : 'bg-warning-tint text-warning'}`}>{s.keyMode} mode</span>}
        </h2>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-1.5 text-label text-royal hover:underline underline-offset-4 cursor-pointer">
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" /> Check again
        </button>
      </div>
      {s.ready
        ? <Notice tone="confirmed" className="mt-4">Ready for payments. Travelers can pay and operators can set up payouts.</Notice>
        : <p className="mt-2 text-body text-ink-muted">{s.mode === 'disabled' ? 'Payments are off until these steps are done.' : 'Finish these steps to take real payments.'}</p>}

      <ol className="mt-2 divide-y divide-hairline">
        <Step state={hasKey ? 'ok' : 'todo'} title="Secret key on Vercel">
          {hasKey ? <>STRIPE_SECRET_KEY is set ({s.keyMode}).</> : <>Add STRIPE_SECRET_KEY to the Vercel project (Production), then redeploy. With the Stripe integration on Vercel, connect it to this project so it adds the key.</>}
        </Step>
        <Step state={s.account ? (s.account.chargesEnabled ? 'ok' : 'warn') : 'todo'} title="Stripe account can take charges">
          {s.account
            ? <>{s.account.name ?? s.account.id}{s.account.country ? ` · ${s.account.country}` : ''} · charges {s.account.chargesEnabled ? 'on' : 'off'} · payouts {s.account.payoutsEnabled ? 'on' : 'off'}
                {!s.account.chargesEnabled && <> — finish account activation in the Stripe dashboard.</>}</>
            : hasKey ? (s.error ?? 'Not reachable') : 'Needs the key.'}
        </Step>
        <Step state={s.connect ? 'ok' : s.connect === false ? 'warn' : 'todo'} title="Connect enabled (operator payouts)">
          {s.connect ? 'Operators can link payout accounts.' : s.connect === false ? 'Turn on Connect in the Stripe dashboard (Connect → Get started), with Express accounts.' : hasKey ? 'Needs a working key.' : 'Needs the key.'}
        </Step>
        <Step state={s.appUrl ? 'ok' : 'todo'} title="Public URL">
          {s.appUrl ?? 'Set APP_URL on Vercel.'}
        </Step>
        <Step state={webhooksOk ? 'ok' : 'todo'} title="Webhooks">
          <>
            {webhooksOk
              ? <>Payments and operator-account endpoints are set ({s.webhooks.platform === 'env' ? 'from environment' : 'created here'}).</>
              : <>Stripe tells the app when a payment succeeds, is refunded or disputed, and when an operator&apos;s account changes.</>}
            {s.webhooks.endpoints.length > 0 && <> {s.webhooks.endpoints.length} endpoint{s.webhooks.endpoints.length === 1 ? '' : 's'} at {s.appUrl}/api/webhooks/stripe.</>}
            {hasKey && (
              <div className="mt-2">
                <Button size="sm" variant={webhooksOk ? 'secondary' : 'primary'} onClick={setupWebhooks} disabled={busy}>
                  <Webhook size={14} strokeWidth={1.5} aria-hidden="true" /> {busy ? 'Working…' : webhooksOk ? 'Recreate webhooks' : 'Create webhooks'}
                </Button>
              </div>
            )}
          </>
        </Step>
      </ol>
      {message && <Notice tone={message.tone} className="mt-3">{message.text}</Notice>}
    </section>
  );
}
