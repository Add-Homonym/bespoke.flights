'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
        setError(data.error || 'Login failed');
        return;
      }

      const user = await res.json();
      if (user.role === 'operator') router.push('/operator/dashboard');
      else if (user.role === 'admin') router.push('/admin/dashboard');
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
      <h1 className="font-display text-2xl text-brand-cream mb-2">Welcome Back</h1>
      <p className="text-brand-muted text-sm mb-8">Sign in to your account</p>

      {error && (
        <div className="rounded-lg bg-brand-error/10 border border-brand-error/30 px-4 py-3 text-sm text-brand-error mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input name="email" label="Email" type="email" placeholder="you@example.com" required />
        <Input name="password" label="Password" type="password" placeholder="Min. 8 characters" required />
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-brand-gold hover:underline">Create one</Link>
      </p>
    </div>
  );
}
