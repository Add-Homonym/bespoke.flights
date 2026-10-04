import { NextResponse } from 'next/server';
import { currentOperator } from '@/lib/operator-session';
import { toId } from '@/lib/db/queries';
import { sendEmail } from '@/lib/email/resend';
import { sendSms } from '@/lib/notify/sms';
import type { StaffMember } from '@/lib/staff/roster';

/** Send a test alert to one staff member on each channel they use. */
export async function POST(_req: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const ctx = await currentOperator();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const member = await ctx.db.one<StaffMember>(
    'SELECT * FROM operator_staff WHERE id = ? AND operator_id = ?', [toId((await params).staffId), ctx.operator.id]
  );
  if (!member) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  const text = `Test alert from ${ctx.operator.company_name} on bespoke.flights. Charter alerts will arrive like this.`;
  const results: Record<string, string> = {};
  if (member.notify_email && member.email) {
    const r = await sendEmail({ to: member.email, subject: 'Test alert from bespoke.flights', html: `<p>${text.replace(/[<>&]/g, '')}</p>` });
    results.email = r.error ?? 'sent';
  }
  if (member.notify_sms && member.phone) {
    const r = await sendSms({ to: member.phone, body: text });
    results.sms = r.error ?? 'sent';
  }
  if (Object.keys(results).length === 0) {
    return NextResponse.json({ error: 'This person has no alert channel turned on' }, { status: 400 });
  }
  return NextResponse.json(results);
}
