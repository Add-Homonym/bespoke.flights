import { z } from 'zod';
import type { Db } from '@/lib/db';
import { normalizePhone } from '@/lib/notify/phone';

export interface StaffMember {
  id: number;
  operator_id: number;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notify_email: number;
  notify_sms: number;
  on_new_request: number;
  on_booking: number;
  on_cancellation: number;
  active: number;
  created_at: string;
}

export class StaffError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'StaffError';
  }
}

export const MAX_STAFF = 50;

const flag = z.boolean().transform(b => (b ? 1 : 0));

export const staffInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  role: z.string().trim().max(60).optional().transform(v => v || null),
  email: z.string().trim().toLowerCase().max(200).optional().transform(v => v || null)
    .refine(v => v === null || z.string().email().safeParse(v).success, 'Invalid email address'),
  phone: z.string().trim().max(30).optional().transform(v => v || null)
    .refine(v => v === null || normalizePhone(v) !== null, 'Invalid phone number; include the country code, e.g. +1 808 555 0100')
    .transform(v => (v ? normalizePhone(v) : null)),
  notify_email: flag,
  notify_sms: flag,
  on_new_request: flag,
  on_booking: flag,
  on_cancellation: flag,
  active: flag.optional(),
}).superRefine((s, ctx) => {
  if (s.notify_email && !s.email) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Add an email address to send email alerts' });
  if (s.notify_sms && !s.phone) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Add a mobile number to send text alerts' });
});

export type StaffInput = z.input<typeof staffInputSchema>;

function parse(input: unknown) {
  const parsed = staffInputSchema.safeParse(input);
  if (!parsed.success) throw new StaffError(parsed.error.issues[0]?.message ?? 'Invalid staff member', 400);
  return parsed.data;
}

export function listStaff(db: Db, operatorId: number): Promise<StaffMember[]> {
  return db.query<StaffMember>('SELECT * FROM operator_staff WHERE operator_id = ? ORDER BY name, id', [operatorId]);
}

export async function addStaff(db: Db, operatorId: number, input: unknown): Promise<StaffMember> {
  const s = parse(input);
  const { count } = (await db.one<{ count: number }>('SELECT COUNT(*) AS count FROM operator_staff WHERE operator_id = ?', [operatorId]))!;
  if (count >= MAX_STAFF) throw new StaffError(`A company can have up to ${MAX_STAFF} staff members`, 400);
  return (await db.one<StaffMember>(`
    INSERT INTO operator_staff (operator_id, name, role, email, phone, notify_email, notify_sms, on_new_request, on_booking, on_cancellation, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [operatorId, s.name, s.role, s.email, s.phone, s.notify_email, s.notify_sms, s.on_new_request, s.on_booking, s.on_cancellation, s.active ?? 1]))!;
}

export async function updateStaff(db: Db, operatorId: number, staffId: number, input: unknown): Promise<StaffMember> {
  const s = parse(input);
  const row = await db.one<StaffMember>(`
    UPDATE operator_staff SET name = ?, role = ?, email = ?, phone = ?, notify_email = ?, notify_sms = ?,
      on_new_request = ?, on_booking = ?, on_cancellation = ?, active = COALESCE(?, active)
    WHERE id = ? AND operator_id = ?
    RETURNING *
  `, [s.name, s.role, s.email, s.phone, s.notify_email, s.notify_sms, s.on_new_request, s.on_booking, s.on_cancellation, s.active ?? null, staffId, operatorId]);
  if (!row) throw new StaffError('Staff member not found', 404);
  return row;
}

export async function removeStaff(db: Db, operatorId: number, staffId: number): Promise<void> {
  const n = await db.run('DELETE FROM operator_staff WHERE id = ? AND operator_id = ?', [staffId, operatorId]);
  if (n === 0) throw new StaffError('Staff member not found', 404);
}
