import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['customer', 'operator']),
  companyName: z.string().min(1).optional(),
}).refine(data => data.role !== 'operator' || data.companyName, {
  message: 'Company name is required for operators',
  path: ['companyName'],
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const legSchema = z.object({
  originCode: z.string().min(3).max(4),
  originName: z.string().optional(),
  destCode: z.string().min(3).max(4),
  destName: z.string().optional(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureTime: z.string().optional(),
});

export const bookingRequestSchema = z.object({
  passengerCount: z.number().int().min(1).max(19),
  notes: z.string().optional(),
  legs: z.array(legSchema).min(1).max(10),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const quoteSchema = z.object({
  aircraftId: z.number().int().positive().optional(),
  // Cents, up to $10,000,000.
  priceCents: z.number().int().min(50).max(1_000_000_000),
  currency: z.enum(['USD']).default('USD'),
  message: z.string().max(2000).optional(),
  validUntil: z.string().regex(ISO_DATE).optional()
    .refine(d => !d || d >= new Date().toISOString().slice(0, 10), { message: 'Valid-until date is in the past' }),
});

export const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
});

export const aircraftSchema = z.object({
  tailNumber: z.string().min(1),
  type: z.string().min(1),
  capacity: z.number().int().min(1),
  rangeNm: z.number().int().optional(),
  year: z.number().int().optional(),
});

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const operatorSettingsSchema = z.object({
  contact_method: z.enum(['email', 'text', 'both']).optional(),
  contact_email: z.preprocess(blankToNull, z.string().email().max(200).optional().nullable()),
  contact_phone: z.preprocess(blankToNull, z.string().min(7).max(30).optional().nullable()),
  safety_rating: z.string().max(60).optional().nullable(),
  fleet_types: z.array(z.string()).optional(),
  markets: z.array(z.string()).optional(),
  range_max_nm: z.number().int().optional().nullable(),
  hi_capable: z.number().int().min(0).max(1).optional(),
  transoceanic: z.number().int().min(0).max(1).optional(),
  certificate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  cancellation_policy: z.object({
    full_refund_hours: z.number().int().min(0).max(24 * 365),
    partial_refund_hours: z.number().int().min(0).max(24 * 365),
    partial_refund_bps: z.number().int().min(0).max(10_000),
  }).refine(p => p.partial_refund_hours <= p.full_refund_hours, {
    message: 'The partial refund window must end before the full refund window',
    path: ['partial_refund_hours'],
  }).optional().nullable(),
});

export const checkoutSchema = z.object({
  quoteId: z.number().int().positive(),
});

export const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});
