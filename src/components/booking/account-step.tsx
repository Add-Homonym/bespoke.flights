'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { TripDetails } from '@/components/booking/trip-details';
import type { TripLeg } from '@/lib/trip-format';

/**
 * Final step of booking for a visitor without a session. The itinerary is
 * already in the draft cookie; signing up or in submits it server-side and
 * returns the new request's URL.
 */
export function AccountStep({
  legs,
  passengerCount,
  notes,
  onBack,
}: {
  legs: TripLeg[];
  passengerCount: number;
  notes: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = mode === 'register'
      ? {
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone') || undefined,
          password: form.get('password'),
          role: 'customer',
        }
      : { email: form.get('email'), password: form.get('password') };

    try {
      const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = data.error;
        setError(typeof err === 'object' && err ? String(Object.values(err).flat()[0]) : err || 'Something went wrong. Try again.');
        return;
      }

      if (data.redirectTo) {
        router.push(data.redirectTo);
      } else if (data.role && data.role !== 'customer') {
        setError('That is an operator or admin account. Use a traveler account to request quotes.');
        return;
      } else {
        // Signed in but the trip was not submitted (e.g. the draft cookie was
        // cleared): return to the form, now with a session.
        router.push('/book');
      }
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-hairline bg-surface-raised px-6 py-4 shadow-raised">
        <TripDetails title="Your trip" legs={legs} passengerCount={passengerCount} notes={notes} />
        <Button type="button" variant="quiet" size="sm" onClick={onBack} className="shrink-0">
          Edit trip
        </Button>
      </div>

      <div className="rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
        <h2 className="text-title text-ink mb-2">
          {mode === 'register' ? 'Create an account to get quotes' : 'Sign in to get quotes'}
        </h2>
        <p className="text-body text-ink-muted mb-6">
          Operators send quotes to your account. Your trip is saved and is submitted as soon as you continue.
        </p>

        <Segmented
          label="Account"
          className="mb-6"
          value={mode}
          onChange={m => { setMode(m as 'register' | 'login'); setError(''); }}
          options={[
            { value: 'register', label: 'New here' },
            { value: 'login', label: 'I have an account' },
          ]}
        />

        {error && <Notice tone="danger" className="mb-6">{error}</Notice>}

        <form key={mode} onSubmit={handleSubmit} className="space-y-5">
          {mode === 'register' && <Input name="name" label="Full name" placeholder="John Doe" required autoComplete="name" />}
          <Input name="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
          {mode === 'register' && <Input name="phone" label="Phone number" type="tel" placeholder="+1 (555) 123-4567" autoComplete="tel" />}
          <Input
            name="password"
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          <Button type="submit" disabled={loading} block>
            {loading ? 'Requesting quotes…' : mode === 'register' ? 'Create account and request quotes' : 'Sign in and request quotes'}
          </Button>
        </form>
      </div>
    </div>
  );
}
