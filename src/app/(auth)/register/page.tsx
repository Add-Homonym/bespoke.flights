'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get('role') === 'operator' ? 'operator' : 'customer';

  const [role, setRole] = useState<'customer' | 'operator'>(defaultRole);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      email: formData.get('email'),
      phone: formData.get('phone') || undefined,
      password: formData.get('password'),
      name: formData.get('name'),
      role,
      companyName: role === 'operator' ? formData.get('companyName') : undefined,
    };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        const errors = data.error;
        if (typeof errors === 'object') {
          const firstError = Object.values(errors).flat()[0];
          setError(String(firstError));
        } else {
          setError(errors || 'Registration failed');
        }
        return;
      }

      const data = await res.json();
      if (data.redirectTo) router.push(data.redirectTo);
      else if (role === 'operator') router.push('/operator/dashboard');
      else router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-card p-8">
      <h1 className="font-display text-2xl text-brand-cream mb-2">Create Your Account</h1>
      <p className="text-brand-muted text-sm mb-6">Join bespoke.flights today</p>

      {/* Role Toggle */}
      <div className="flex rounded-lg border border-brand-border overflow-hidden mb-8">
        <button
          type="button"
          onClick={() => setRole('customer')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            role === 'customer' ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-cream'
          }`}
        >
          Traveler
        </button>
        <button
          type="button"
          onClick={() => setRole('operator')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            role === 'operator' ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-cream'
          }`}
        >
          Charter Operator
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-brand-error/10 border border-brand-error/30 px-4 py-3 text-sm text-brand-error mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input name="name" label="Full Name" placeholder="John Doe" required />
        <Input name="email" label="Email" type="email" placeholder="you@example.com" required />
        <Input name="phone" label="Phone Number" type="tel" placeholder="+1 (555) 123-4567" />
        <Input name="password" label="Password" type="password" placeholder="Min. 8 characters" required minLength={8} />
        {role === 'operator' && (
          <Input name="companyName" label="Company Name" placeholder="Your charter company" required />
        )}
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-gold hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-brand-muted text-center">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
