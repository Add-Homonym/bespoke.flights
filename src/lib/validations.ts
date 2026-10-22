import { z } from 'zod';
import { worksheetSchema } from '@/lib/quotes/worksheet';
import { autopilotSchema } from '@/lib/quotes/autopilot';
import { MIN_QUOTE_CENTS } from '@/lib/quotes/price';

export const registerSchema = z.object({
  email: z.string().email().max(254),
  phone: z.string().min(7).max(32).optional(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  role: z.enum(['customer', 'operator']),
  companyName: z.string().min(1).max(120).optional(),
}).refine(data => data.role !== 'operator' || data.companyName, {
  message: 'Company name is required for operators',
  path: ['companyName'],
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const legSchema = z.object({
  originCode: z.string().min(3, 'Enter an airport code').max(4, 'Enter an airport code'),
  originName: z.string().max(200).optional(),
  destCode: z.string().min(3, 'Enter an airport code').max(4, 'Enter an airport code'),
  destName: z.string().max(200).optional(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date'),
  departureTime: z.union([z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time'), z.literal('')]).optional(),
});

export const bookingRequestSchema = z.object({
  passengerCount: z.number().int().min(1).max(999),
  notes: z.string().max(2000).optional(),
  legs: z.array(legSchema).min(1).max(10),
  /** Booking form the request came from, for comparing the two designs. */
  formVariant: z.enum(['ticket', 'classic']).optional(),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;


export const quoteSchema = z.object({
  aircraftId: z.number().int().positive().optional(),
  // Whole cents, $100 to $10,000,000.
  priceCents: z.number().int('Enter dollars and cents, no fractions of a cent')
    .min(MIN_QUOTE_CENTS, 'Enter a price of at least $100').max(1_000_000_000, 'Enter a price of $10,000,000 or less'),
  currency: z.enum(['USD']).default('USD'),
  message: z.string().max(2000).optional(),
  validUntil: z.string().regex(ISO_DATE, 'Enter a date').optional()
    .refine(d => !d || d >= new Date().toISOString().slice(0, 10), { message: 'Valid-until date is in the past' }),
  /** The operator's private working for the price. Never shown to the traveler. */
  worksheet: worksheetSchema.optional().nullable(),
});

export const emptyLegSchema = z.object({
  aircraftId: z.number().int().positive().optional().nullable(),
  originCode: z.string().trim().toUpperCase().min(3).max(4),
  destCode: z.string().trim().toUpperCase().min(3).max(4),
  departureDate: z.string().regex(ISO_DATE)
    .refine(d => d >= new Date().toISOString().slice(0, 10), { message: 'Departure date is in the past' }),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  flexDays: z.number().int().min(0).max(7).default(0),
  seats: z.number().int().min(1).max(100),
  // Cents, up to $10,000,000.
  priceCents: z.number().int().min(50).max(1_000_000_000),
  currency: z.enum(['USD']).default('USD'),
  notes: z.string().trim().max(1000).optional().nullable(),
}).refine(l => l.originCode !== l.destCode, { message: 'Origin and destination are the same', path: ['destCode'] });

export const emptyLegPatchSchema = z.object({
  priceCents: z.number().int().min(50).max(1_000_000_000).optional(),
  seats: z.number().int().min(1).max(100).optional(),
  departureDate: z.string().regex(ISO_DATE, 'Enter a date')
    .refine(d => d >= new Date().toISOString().slice(0, 10), { message: 'Departure date is in the past' }).optional(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time').optional().nullable(),
  flexDays: z.number().int().min(0).max(7).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(['withdrawn']).optional(),
}).strict();

export const emptyLegBookSchema = z.object({
  passengerCount: z.number().int().min(1).max(100),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().min(7).max(32).optional(),
});

const thisYear = new Date().getFullYear();

export const aircraftSchema = z.object({
  tailNumber: z.string().trim().min(2).max(10),
  type: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(100),
  rangeNm: z.number().int().min(0).max(10_000).optional().nullable(),
  year: z.number().int().min(1940).max(thisYear + 1).optional().nullable(),
  serialNumber: z.string().trim().max(40).optional().nullable(),
  manufacturer: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  hourlyRateCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  cruiseKtas: z.number().int().min(50).max(700).optional().nullable(),
});

export const aircraftPatchSchema = aircraftSchema.partial().strict();

export const operatorSettingsSchema = z.object({
  contact_method: z.enum(['email', 'text', 'both']).optional(),
  contact_email: z.union([z.string().email().max(254), z.literal('')]).optional().nullable(),
  contact_phone: z.union([z.string().min(7).max(32), z.literal('')]).optional().nullable(),
  safety_rating: z.string().max(80).optional().nullable(),
  fleet_types: z.array(z.string().max(32)).max(20).optional(),
  markets: z.array(z.string().max(32)).max(20).optional(),
  range_max_nm: z.number().int().min(0).max(20_000).optional().nullable(),
  hi_capable: z.number().int().min(0).max(1).optional(),
  transoceanic: z.number().int().min(0).max(1).optional(),
  certificate: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  cancellation_policy: z.object({
    full_refund_hours: z.number().int().min(0).max(24 * 365),
    partial_refund_hours: z.number().int().min(0).max(24 * 365),
    partial_refund_bps: z.number().int().min(0).max(10_000)
      .refine(v => v % 100 === 0, { message: 'Enter a whole percentage from 0 to 100' }),
  }).refine(p => p.partial_refund_hours <= p.full_refund_hours, {
    message: 'The partial refund window must end before the full refund window',
    path: ['partial_refund_hours'],
  }).optional().nullable(),
  autopilot: autopilotSchema.optional(),
}).strict();

export const discoveryPatchSchema = z.object({
  id: z.number().int().positive(),
  contact_email: z.string().email().max(254).optional().nullable(),
  phone: z.string().min(7).max(32).optional().nullable(),
  status: z.enum(['new', 'no_email', 'emailed', 'registered', 'opted_out', 'bounced']).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const roleEnum = z.enum(['customer', 'operator', 'admin']);
const optPhone = z.union([z.string().trim().min(7).max(32), z.literal('')]).optional().nullable();

/** Admin: add a user. */
export const adminCreateUserSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  phone: optPhone,
  role: roleEnum,
  companyName: z.string().trim().max(120).optional().nullable(),
  password: z.union([z.string().min(8).max(128), z.literal('')]).optional().nullable(),
}).strict().refine(d => d.role !== 'operator' || !!d.companyName, { message: 'Company name is required for an operator', path: ['companyName'] });

/** Admin: change a user's name, phone or role. */
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: optPhone,
  role: roleEnum.optional(),
  companyName: z.string().trim().max(120).optional().nullable(),
}).strict();

/** Admin: add an operator (a new operator account with its company profile). */
export const adminCreateOperatorSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: optPhone,
  certificate: z.string().trim().max(80).optional().nullable(),
  status: z.enum(['pending', 'approved', 'suspended']).default('approved'),
  password: z.union([z.string().min(8).max(128), z.literal('')]).optional().nullable(),
}).strict();

/** Admin: edit an operator's company profile and status. */
export const adminOperatorPatchSchema = operatorSettingsSchema.omit({ cancellation_policy: true, autopilot: true }).extend({
  company_name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['pending', 'approved', 'suspended']).optional(),
  platform_fee_bps: z.number().int().min(0).max(5000).optional().nullable(),
}).strict();

export const operatorStatusSchema = z.object({
  status: z.enum(['approved', 'suspended']),
});

export const checkoutSchema = z.object({
  quoteId: z.number().int().positive(),
});

export const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});
