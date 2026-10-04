import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(254),
  phone: z.string().min(7).max(32).optional(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  role: z.enum(['customer', 'operator']),
  companyName: z.string().min(1).optional(),
}).refine(data => data.role !== 'operator' || data.companyName, {
  message: 'Company name is required for operators',
  path: ['companyName'],
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
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
  notes: z.string().max(2000).optional(),
  legs: z.array(legSchema).min(1).max(10),
});

export const quoteSchema = z.object({
  aircraftId: z.number().int().optional(),
  priceCents: z.number().int().min(1).max(100_000_000_00),
  currency: z.string().regex(/^[A-Za-z]{3}$/).default('USD'),
  message: z.string().max(2000).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().min(7).max(32).optional(),
});

export const aircraftSchema = z.object({
  tailNumber: z.string().min(1).max(20),
  type: z.string().min(1).max(100),
  capacity: z.number().int().min(1).max(500),
  rangeNm: z.number().int().min(0).max(20_000).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
});

export const operatorSettingsSchema = z.object({
  contact_method: z.enum(['email', 'text', 'both']).optional(),
  contact_email: z.string().email().max(254).optional().nullable(),
  contact_phone: z.string().min(7).max(32).optional().nullable(),
  safety_rating: z.string().max(100).optional().nullable(),
  fleet_types: z.array(z.string().max(32)).max(20).optional(),
  markets: z.array(z.string().max(32)).max(20).optional(),
  range_max_nm: z.number().int().min(0).max(20_000).optional().nullable(),
  hi_capable: z.number().int().min(0).max(1).optional(),
  transoceanic: z.number().int().min(0).max(1).optional(),
  certificate: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const discoveredOperatorPatchSchema = z.object({
  id: z.number().int().positive(),
  contact_email: z.string().email().max(254).optional().nullable(),
  phone: z.string().min(7).max(32).optional().nullable(),
  status: z.enum(['new', 'no_email', 'emailed', 'registered', 'opted_out', 'bounced']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const checkoutSchema = z.object({
  quoteId: z.number().int().positive(),
});

export const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});
