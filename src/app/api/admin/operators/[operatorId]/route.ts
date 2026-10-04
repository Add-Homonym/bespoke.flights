import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';

export async function PATCH(req: Request, { params }: { params: Promise<{ operatorId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { operatorId } = await params;
  const body = await req.json();
  const { status } = body as { status: 'approved' | 'suspended' };

  if (!['approved', 'suspended'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const db = getDb();
  await db.run('UPDATE operators SET status = ? WHERE id = ?', [status, toId(operatorId)]);

  return NextResponse.json({ success: true });
}
