import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { commitAction, type ActionRow } from '@/lib/ads/loop';

const bodySchema = z.object({
  /** applied: the change is live in Google Ads. dismissed: it will not be made. */
  status: z.enum(['applied', 'dismissed']),
  /** Google's ad id for a launched ad, so CSV rows and API calls can find it. */
  platformAdId: z.string().trim().regex(/^\d{1,20}$/, 'Digits only').optional(),
});

/** Resolve a queued change after making it (or declining it) in Google Ads. */
export async function PATCH(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const id = Number((await params).actionId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  const db = getDb();
  const action = await db.one<ActionRow>('SELECT * FROM ad_actions WHERE id = ?', [id]);
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (action.status !== 'pending' && action.status !== 'failed') return NextResponse.json({ error: 'This change is already resolved' }, { status: 409 });

  if (parsed.data.status === 'applied') {
    await commitAction(db, action, { platformAdId: parsed.data.platformAdId });
  } else {
    await db.transaction(async tx => {
      await tx.run("UPDATE ad_actions SET status = 'superseded' WHERE id = ?", [id]);
      // A dismissed launch leaves no draft behind, so the loop writes a different ad next run.
      if (action.kind === 'launch') await tx.run("UPDATE ad_variants SET status = 'paused', paused_at = now(), pause_reason = 'dismissed before launch' WHERE id = ? AND status = 'draft'", [action.variant_id]);
    });
  }
  return NextResponse.json(await db.one('SELECT * FROM ad_actions WHERE id = ?', [id]));
}
