'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { buttonStyles } from '@/components/ui/button-styles';
import { Card } from '@/components/ui/card';
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

export function PaymentStatus({ payment, returnedFromCheckout }: {
  payment: PaymentSummary;
  returnedFromCheckout: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // After Stripe redirects back, the webhook may land a few seconds later.
  const awaitingWebhook = returnedFromCheckout && payment.provider === 'stripe' && payment.status === 'pending';
  useEffect(() => {
    if (!awaitingWebhook) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [awaitingWebhook, router]);

  const simulate = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/payments/${payment.id}/simulate`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Simulation failed.');
    }
    setLoading(false);
    router.replace(window.location.pathname);
    router.refresh();
  };

  const status = badge[payment.status] ?? { variant: 'neutral' as const, label: payment.status };
  const payNow = payment.status === 'pending' && !awaitingWebhook;

  return (
    <>
      <Card className="mb-8 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-title text-ink">{payment.status === 'succeeded' ? 'Receipt' : 'Payment'}</h2>
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
        </div>
        <p className="text-figure text-ink">{payment.amount}</p>
        <p className="text-body text-ink-muted">To {payment.companyName}</p>
        {payment.paidAt && <p className="text-label text-ink-muted tabular-nums">Paid {payment.paidAt} UTC</p>}
        {payment.refunded && <p className="text-label text-ink-muted">Refunded {payment.refunded}</p>}
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
        {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
      </Card>

      {payNow && (payment.provider === 'stub' || payment.checkoutUrl) && (
        <ActionBar amount={payment.amount}>
          {payment.provider === 'stub' ? (
            <Button onClick={simulate} disabled={loading} className="!rounded-pill">
              Pay {payment.amount}
            </Button>
          ) : (
            <a href={payment.checkoutUrl!} className={buttonStyles({ className: "!rounded-pill" })}>
              Pay {payment.amount}
            </a>
          )}
        </ActionBar>
      )}
    </>
  );
}
