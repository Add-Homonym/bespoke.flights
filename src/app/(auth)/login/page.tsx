'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Sign in failed.');
        return;
      }

      const user = await res.json();
      if (user.redirectTo) router.push(user.redirectTo);
      else if (user.role === 'operator') router.push('/operator/dashboard');
      else if (user.role === 'admin') router.push('/admin/dashboard');
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
      <h1 className="text-title text-ink mb-2">Sign in</h1>
      <p className="text-body text-ink-muted mb-6">Welcome back. Your trips and receipts are waiting.</p>

      {error && <Notice tone="danger" className="mb-6">{error}</Notice>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input name="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <Input name="password" label="Password" type="password" placeholder="Your password" required autoComplete="current-password" />
        <Button type="submit" disabled={loading} block>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-body text-ink-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="inline-flex min-h-11 items-center text-brass-ink underline underline-offset-4">Create one</Link>
      </p>
    </div>
  );
}
