import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { appBaseUrl } from '@/lib/payments/config';
import {
  getShare,
  getOrCreateShare,
  revokeShares,
  emailTripSheet,
  parseRecipients,
  shareUrl,
  ShareError,
} from '@/lib/sharing/trip-share';
import type { Operator } from '@/lib/types';

async function context(params: Promise<{ requestId: string }>) {
  const session = await getSession();
  if (!session || session.role !== 'operator') return null;
  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return null;
  return { db, session, operator, requestId: toId((await params).requestId) };
}

/** Current share link, if any. */
export async function GET(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const ctx = await context(params);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const share = await getShare(ctx.db, ctx.requestId, ctx.operator.id);
  return NextResponse.json(share
    ? { url: shareUrl(appBaseUrl(req), share.token), expiresAt: share.expires_at }
    : { url: null });
}

/** { action: 'create' | 'revoke' | 'email', recipients?: string } */
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const ctx = await context(params);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { action?: string; recipients?: string };
  const baseUrl = appBaseUrl(req);

  try {
    if (body.action === 'revoke') {
      await revokeShares(ctx.db, ctx.requestId, ctx.operator.id);
      return NextResponse.json({ url: null });
    }
    if (body.action === 'email') {
      const user = (await ctx.db.one<{ name: string }>('SELECT name FROM users WHERE id = ?', [ctx.session.userId]))!;
      const result = await emailTripSheet(ctx.db, {
        requestId: ctx.requestId,
        operatorId: ctx.operator.id,
        userId: ctx.session.userId,
        recipients: parseRecipients(body.recipients ?? ''),
        baseUrl,
        senderName: user.name,
      });
      const share = (await getShare(ctx.db, ctx.requestId, ctx.operator.id))!;
      return NextResponse.json({ ...result, url: shareUrl(baseUrl, share.token), expiresAt: share.expires_at });
    }
    const share = await getOrCreateShare(ctx.db, ctx.requestId, ctx.operator.id, ctx.session.userId);
    return NextResponse.json({ url: shareUrl(baseUrl, share.token), expiresAt: share.expires_at });
  } catch (err) {
    if (err instanceof ShareError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
