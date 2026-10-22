'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { readApiFailure } from '@/lib/api/form-errors';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';

export interface PaymentSummary {
  id: number;
  status: string;
  provider: 'stripe' | 'stub';
  amount: string;
  refunded: string | null;
  companyName: string;
  paidAt: string | null;
  failureReason: string | null;
  checkoutUrl: string | null;
}

const badge: Record<string, { variant: StatusVariant; label: string }> = {
  pending: { variant: 'warning', label: 'Awaiting payment' },
  processing: { variant: 'warning', label: 'Bank transfer processing' },
  succeeded: { variant: 'confirmed', label: 'Paid' },
  partially_refunded: { variant: 'warning', label: 'Partially refunded' },
  refunded: { variant: 'neutral', label: 'Refunded' },
  failed: { variant: 'danger', label: 'Failed' },
  canceled: { variant: 'neutral', label: 'Canceled' },
};

export function PaymentStatus({ payment, returnedFromCheckout, title, receiptHref }: {
  payment: PaymentSummary;
  returnedFromCheckout: boolean;
  /** Card heading; defaults to "Receipt" once paid, otherwise "Payment". */
  title?: string;
  /** Link to the printable receipt, shown once paid. */
  receiptHref?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The server's answer to the Pay tap, shown at once; router.refresh() then brings the full receipt.
  const [paidNow, setPaidNow] = useState<{ at: string } | null>(null);

  // After Stripe redirects back, the webhook may land a few seconds later.
  const awaitingWebhook = returnedFromCheckout && payment.provider === 'stripe' && payment.status === 'pending';
  useEffect(() => {
    if (!awaitingWebhook) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [awaitingWebhook, router]);

  const simulate = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/payments/${payment.id}/simulate`, { method: 'POST' });
      if (!res.ok) {
        setError((await readApiFailure(res, 'The payment did not go through. Try again.')).message);
        setLoading(false);
        return;
      }
      setPaidNow({ at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
      router.replace(window.location.pathname);
      router.refresh();
    } catch {
      setError('The payment did not go through. Check your connection and try again.');
    }
    setLoading(false);
  };

  /** Live Stripe: the tap hands off to Checkout, so lock the button right away. */
  const goToCheckout = () => {
    if (loading || !payment.checkoutUrl) return;
    setLoading(true);
    window.location.assign(payment.checkoutUrl);
  };

  const effective = paidNow && payment.status === 'pending' ? 'succeeded' : payment.status;
  const status = badge[effective] ?? { variant: 'neutral' as const, label: effective };
  const payNow = effective === 'pending' && !awaitingWebhook;

  return (
    <>
      <Card className="mb-8 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-title text-ink">{title ?? (effective === 'succeeded' ? 'Receipt' : 'Payment')}</h2>
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
        </div>
        <p className="text-figure text-ink">{payment.amount}</p>
        <p className="text-body text-ink-muted">To {payment.companyName}</p>
        {(payment.paidAt ?? paidNow?.at) && <p className="text-label text-ink-muted tabular-nums">Paid {payment.paidAt ?? paidNow?.at} UTC</p>}
        {payment.refunded && <p className="text-label text-ink-muted">Refunded {payment.refunded}</p>}
        {receiptHref && ['succeeded', 'partially_refunded', 'refunded'].includes(effective) && (
          <a href={receiptHref} className="inline-block text-label text-royal underline underline-offset-4">View receipt</a>
        )}
        {payment.failureReason && ['failed', 'canceled'].includes(payment.status) && (
          <p className="text-label text-ink-muted">{payment.failureReason}</p>
        )}
        {awaitingWebhook && (
          <p role="status" className="text-body text-ink-muted">Confirming your payment…</p>
        )}
        {payment.status === 'processing' && (
          <p className="text-body text-ink-muted">
            Bank payments take a few business days to clear. Your booking is confirmed once funds arrive.
          </p>
        )}
        {payNow && payment.provider === 'stub' && (
          <p className="text-label text-ink-muted">Test mode: no card is charged.</p>
        )}
        {paidNow && payment.status === 'pending' && <Notice tone="confirmed">Payment received. Your trip is booked.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      {payNow && (payment.provider === 'stub' || payment.checkoutUrl) && (
        <ActionBar amount={payment.amount}>
          {payment.provider === 'stub' ? (
            <Button onClick={simulate} disabled={loading} aria-busy={loading} className="!rounded-pill">
              {loading ? 'Paying…' : `Pay ${payment.amount}`}
            </Button>
          ) : (
            <Button onClick={goToCheckout} disabled={loading} aria-busy={loading} className="!rounded-pill">
              {loading ? 'Paying…' : `Pay ${payment.amount}`}
            </Button>
          )}
        </ActionBar>
      )}
    </>
  );
}
