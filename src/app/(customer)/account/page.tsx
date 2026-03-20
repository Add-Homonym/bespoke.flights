'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
      setMessage('Profile updated successfully');
    } else {
      setMessage('Failed to update profile');
    }
    setLoading(false);
  };

  if (!user) return <div className="text-brand-muted">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl text-brand-cream mb-2">Account Settings</h1>
      <p className="text-brand-muted mb-10">Manage your profile information.</p>

      <Card>
        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-6 ${message.includes('success') ? 'bg-brand-success/10 text-brand-success' : 'bg-brand-error/10 text-brand-error'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input name="name" label="Full Name" defaultValue={user.name} required />
          <Input name="email" label="Email" type="email" defaultValue={user.email} required />
          <Input name="phone" label="Phone Number" type="tel" defaultValue={user.phone || ''} />

          <div className="pt-2">
            <p className="text-xs text-brand-muted mb-1">Account Type</p>
            <p className="text-brand-cream capitalize">{user.role}</p>
          </div>

          <div className="pt-2">
            <p className="text-xs text-brand-muted mb-1">Member Since</p>
            <p className="text-brand-cream">{new Date(user.created_at).toLocaleDateString()}</p>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
