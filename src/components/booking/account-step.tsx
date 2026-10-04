'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Final step of booking for a visitor without a session. The itinerary is
 * already in the draft cookie; signing up or in submits it server-side and
 * returns the new request's URL.
 */
export function AccountStep({
  summary,
  passengerCount,
  onBack,
}: {
  summary: string;
  passengerCount: number;
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
        setError(typeof err === 'object' && err ? String(Object.values(err).flat()[0]) : err || 'Something went wrong');
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
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-brand-navy/50 border border-brand-border px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-brand-muted mb-1 uppercase tracking-wider">Your trip</p>
          <p className="text-brand-cream font-mono tracking-wider">{summary}</p>
          <p className="text-brand-muted text-xs mt-1">{passengerCount} passenger{passengerCount !== 1 ? 's' : ''}</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-brand-muted hover:text-brand-cream cursor-pointer">
          Edit trip
        </button>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-card p-8">
        <h2 className="font-display text-2xl text-brand-cream mb-2">
          {mode === 'register' ? 'Create an account to get quotes' : 'Sign in to get quotes'}
        </h2>
        <p className="text-brand-muted text-sm mb-6">
          Operators send quotes to your account. Your trip is saved and is submitted as soon as you continue.
        </p>

        <div className="flex rounded-lg border border-brand-border overflow-hidden mb-6">
          {(['register', 'login'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                mode === m ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-cream'
              }`}
            >
              {m === 'register' ? 'New here' : 'I have an account'}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-brand-error/10 border border-brand-error/30 px-4 py-3 text-sm text-brand-error mb-6">
            {error}
          </div>
        )}

        <form key={mode} onSubmit={handleSubmit} className="space-y-5">
          {mode === 'register' && <Input name="name" label="Full Name" placeholder="John Doe" required autoComplete="name" />}
          <Input name="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
          {mode === 'register' && <Input name="phone" label="Phone Number" type="tel" placeholder="+1 (555) 123-4567" autoComplete="tel" />}
          <Input
            name="password"
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? 'Submitting…' : mode === 'register' ? 'Create Account & Request Quotes' : 'Sign In & Request Quotes'}
          </Button>
        </form>
      </div>
    </div>
  );
}
