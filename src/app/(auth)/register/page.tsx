'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';

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
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised">
      <h1 className="text-title text-ink mb-2">Create your account</h1>
      <p className="text-body text-ink-muted mb-6">Join bespoke.flights.</p>

      <Segmented
        label="Account type"
        className="mb-8"
        value={role}
        onChange={v => setRole(v as 'customer' | 'operator')}
        options={[
          { value: 'customer', label: 'Traveler' },
          { value: 'operator', label: 'Charter operator' },
        ]}
      />

      {error && <Notice tone="danger" className="mb-6">{error}</Notice>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input name="name" label="Full name" placeholder="John Doe" required autoComplete="name" />
        <Input name="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <Input name="phone" label="Phone number" type="tel" placeholder="+1 (555) 123-4567" autoComplete="tel" />
        <Input name="password" label="Password" type="password" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
        {role === 'operator' && (
          <Input name="companyName" label="Company name" placeholder="Your charter company" required />
        )}
        <Button type="submit" disabled={loading} block>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-body text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="inline-flex min-h-11 items-center text-brass-ink underline underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div role="status" className="text-ink-muted text-center">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
