'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PayoutStatus {
  mode: 'stripe' | 'stub' | 'disabled';
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  platform_fee_bps: number;
  gross_payout_cents: number;
  paid_bookings: number;
}

export function PayoutSettings() {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/operator/payouts')
      .then(async r => {
        const data = await r.json();
        if (r.ok) setStatus(data);
        else setError(data.error || 'Could not load payout status');
      })
      .catch(() => setError('Could not load payout status'));
  }, []);

  const go = async (action: 'onboard' | 'dashboard') => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/operator/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.assign(data.url);
      return;
    }
    setError(data.error || 'Request failed');
    setLoading(false);
  };

  const ready = status?.charges_enabled && status?.payouts_enabled;

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Payouts</h2>
        {status && (
          <Badge variant={ready ? 'success' : status.connected ? 'warning' : 'default'}>
            {ready ? 'active' : status.connected ? 'setup incomplete' : 'not set up'}
          </Badge>
        )}
      </div>

      {!status && !error && <p className="text-ink-muted text-sm">Loading&hellip;</p>}

      {status && (
        <>
          <p className="text-ink-muted text-sm mb-4">
            Customers pay at booking. Funds go directly to your payout account, less a{' '}
            {(status.platform_fee_bps / 100).toFixed(2).replace(/\.00$/, '')}% platform fee.
            Travelers can only book your quotes once payout setup is complete.
          </p>

          {status.mode === 'disabled' && (
            <p className="text-warning text-sm">Payments are not yet enabled on the platform.</p>
          )}
          {status.mode === 'stub' && (
            <p className="text-ink-muted text-xs mb-4">Test mode: payout setup is simulated. No Stripe account is created.</p>
          )}

          {status.connected && (
            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <p className="text-ink-muted text-xs">Details submitted</p>
                <p className="text-ink">{status.details_submitted ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-ink-muted text-xs">Can accept payments</p>
                <p className="text-ink">{status.charges_enabled ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-ink-muted text-xs">Payouts enabled</p>
                <p className="text-ink">{status.payouts_enabled ? 'Yes' : 'No'}</p>
              </div>
            </div>
          )}

          {status.paid_bookings > 0 && (
            <p className="text-ink-muted text-sm mb-4">
              {status.paid_bookings} paid booking{status.paid_bookings !== 1 ? 's' : ''} &middot;{' '}
              ${(status.gross_payout_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} net to you
            </p>
          )}

          {status.mode !== 'disabled' && (
            <div className="flex gap-3">
              {!ready && (
                <Button size="sm" onClick={() => go('onboard')} disabled={loading}>
                  {status.connected ? 'Continue payout setup' : 'Set up payouts'}
                </Button>
              )}
              {status.details_submitted && status.mode === 'stripe' && (
                <Button size="sm" variant="secondary" onClick={() => go('dashboard')} disabled={loading}>
                  Open payout dashboard
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-danger text-sm mt-2">{error}</p>}
    </Card>
  );
}
