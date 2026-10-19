import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { businessModelPatchSchema, getBusinessModel, saveBusinessModel } from '@/lib/business-model';

/** Current business model settings (defaults merged in). */
export async function GET() {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  return NextResponse.json(await getBusinessModel(getDb()));
}

/** Update any subset of the business model settings. Column-free: the whole model is one JSON setting. */
export async function PATCH(req: Request) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;

  const parsed = businessModelPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  return NextResponse.json(await saveBusinessModel(getDb(), parsed.data));
}
