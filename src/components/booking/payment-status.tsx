'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

const badge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  pending: 'gold',
  processing: 'warning',
  succeeded: 'success',
  partially_refunded: 'warning',
  refunded: 'default',
  failed: 'error',
  canceled: 'default',
};

const labels: Record<string, string> = {
  pending: 'awaiting payment',
  processing: 'bank transfer processing',
  succeeded: 'paid',
  partially_refunded: 'partially refunded',
  refunded: 'refunded',
  failed: 'failed',
  canceled: 'canceled',
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
      setError(data.error || 'Simulation failed');
    }
    setLoading(false);
    router.replace(window.location.pathname);
    router.refresh();
  };

  return (
    <Card className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">Payment</h2>
          <p className="text-brand-cream">
            {payment.amount} to {payment.companyName}
          </p>
          {payment.paidAt && <p className="text-brand-muted text-xs mt-1">Paid {payment.paidAt} UTC</p>}
          {payment.refunded && <p className="text-brand-muted text-xs mt-1">Refunded {payment.refunded}</p>}
          {payment.failureReason && ['failed', 'canceled'].includes(payment.status) && (
            <p className="text-brand-muted text-xs mt-1">{payment.failureReason}</p>
          )}
          {awaitingWebhook && (
            <p className="text-brand-muted text-sm mt-2">Confirming your payment&hellip;</p>
          )}
          {payment.status === 'processing' && (
            <p className="text-brand-muted text-sm mt-2">
              Bank payments take a few business days to clear. Your booking is confirmed once funds arrive.
            </p>
          )}
        </div>
        <Badge variant={badge[payment.status] ?? 'default'}>{labels[payment.status] ?? payment.status}</Badge>
      </div>

      {payment.status === 'pending' && !awaitingWebhook && (
        <div className="mt-4 pt-4 border-t border-brand-border flex items-center gap-3">
          {payment.provider === 'stub' ? (
            <>
              <Button size="sm" onClick={simulate} disabled={loading}>Simulate successful payment</Button>
              <span className="text-brand-muted text-xs">Test mode: no card is charged.</span>
            </>
          ) : payment.checkoutUrl ? (
            <a href={payment.checkoutUrl}>
              <Button size="sm">Resume checkout</Button>
            </a>
          ) : null}
        </div>
      )}
      {error && <p className="text-brand-error text-sm mt-2">{error}</p>}
    </Card>
  );
}
