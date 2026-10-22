import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { appBaseUrl } from '@/lib/payments/config';
import { quoteFromEmail } from '@/lib/quotes/by-email';

/**
 * Inbound email → quote. Point the email provider's inbound webhook here with
 * `Authorization: Bearer $INBOUND_EMAIL_SECRET`. Accepts a flat message
 * ({from, to, subject, text, html}) or a provider envelope ({data: {...}}).
 * Replies to quotes+<token>@<domain> become quotes (src/lib/quotes/by-email.ts);
 * anything else is acknowledged and ignored.
 */
const message = z.object({
  from: z.string().min(3),
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  html: z.string().optional().nullable(),
});
const envelope = z.union([message, z.object({ data: message })]);

export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return NextResponse.json({ error: 'Inbound email is not configured' }, { status: 503 });
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = envelope.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  const mail = 'data' in parsed.data ? parsed.data.data : parsed.data;

  const result = await quoteFromEmail(getDb(), mail, appBaseUrl(req));
  if (!result.ok) console.log(`Inbound email ignored: ${result.reason}`);
  // Always 200: the provider must not retry a message we have decided about.
  return NextResponse.json(result);
}
