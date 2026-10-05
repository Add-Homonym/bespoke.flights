'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

export default function AccountPage() {
  const [user, setUser] = useState<{ name: string; email: string; phone: string | null; role: string; created_at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/users/me').then(r => r.json()).then(setUser);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
    };

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      setUser(updated);
      setMessage('Profile updated.');
    } else {
      setMessage('Could not update your profile. Try again.');
    }
    setLoading(false);
  };

  if (!user) return <div role="status" className="text-ink-muted">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-display text-ink">Account settings</h1>
      <p className="mt-2 mb-8 text-body text-ink-muted">Manage your profile information.</p>

      <Card>
        {message && (
          <Notice tone={message.endsWith('updated.') ? 'confirmed' : 'danger'} className="mb-6">{message}</Notice>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input name="name" label="Full name" defaultValue={user.name} required />
          <Input name="email" label="Email" type="email" defaultValue={user.email} required />
          <Input name="phone" label="Phone number" type="tel" defaultValue={user.phone || ''} />

          <div>
            <p className="text-label text-ink-muted">Account type</p>
            <p className="text-body text-ink capitalize">{user.role}</p>
          </div>

          <div>
            <p className="text-label text-ink-muted">Member since</p>
            <p className="text-body text-ink">{new Date(user.created_at).toLocaleDateString()}</p>
          </div>

          <Button type="submit" disabled={loading} block>
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
