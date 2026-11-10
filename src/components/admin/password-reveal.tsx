'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

/** A newly created account's sign-in details, shown once. */
export function PasswordReveal({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`Email: ${email}\nTemporary password: ${password}`).catch(() => {});
    setCopied(true);
  };
  return (
    <div role="status" className="space-y-3 rounded-md border border-confirmed bg-confirmed-tint px-4 py-3">
      <p className="inline-flex items-center gap-2 text-body text-confirmed">
        <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" /> Account created. Share these sign-in details; the password is shown only once.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-ink-muted">Email</dt><dd className="font-mono text-ink">{email}</dd>
        <dt className="text-ink-muted">Password</dt><dd className="font-mono text-ink select-all">{password}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-control bg-surface-raised px-4 text-label text-ink hover:bg-surface-sunken cursor-pointer">
          {copied ? <Check size={14} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <button type="button" onClick={onDone} className="inline-flex min-h-11 items-center px-4 text-label text-royal hover:underline underline-offset-4 cursor-pointer">Done</button>
      </div>
    </div>
  );
}

/** First error message from an API error body ({ error: string | { field: [msg] } }). */
export function apiError(body: unknown, fallback = 'Something went wrong'): { message: string; fields: Record<string, string> } {
  const e = (body as { error?: unknown; message?: string } | null)?.error;
  if (typeof e === 'string') return { message: e, fields: {} };
  if (e && typeof e === 'object') {
    const fields = Object.fromEntries(Object.entries(e as Record<string, string[]>).map(([k, v]) => [k, v?.[0] ?? 'Invalid']));
    return { message: (body as { message?: string }).message ?? Object.values(fields)[0] ?? fallback, fields };
  }
  return { message: fallback, fields: {} };
}
