/** An operator's cancellation policy: parsing and plain-language wording. Pure, so any layer can import it. */

import { z } from 'zod';

export const cancellationPolicySchema = z.object({
  /** Cancel at least this many hours before departure for a full refund. */
  full_refund_hours: z.number().int().min(0).max(24 * 365),
  /** Cancel at least this many hours before departure for a partial refund. */
  partial_refund_hours: z.number().int().min(0).max(24 * 365),
  /** Share refunded in the partial window, in basis points (5000 = 50%). */
  partial_refund_bps: z.number().int().min(0).max(10_000),
}).refine(p => p.partial_refund_hours <= p.full_refund_hours, {
  message: 'The partial refund window must be shorter than the full refund window',
  path: ['partial_refund_hours'],
});

export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

export const DEFAULT_POLICY: CancellationPolicy = {
  full_refund_hours: 72,
  partial_refund_hours: 24,
  partial_refund_bps: 5000,
};

/** The stored policy, or the default when missing or malformed. */
export function parsePolicy(raw: string | null | undefined): CancellationPolicy {
  if (!raw) return DEFAULT_POLICY;
  try {
    const parsed = cancellationPolicySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_POLICY;
  } catch {
    return DEFAULT_POLICY;
  }
}

/** Plain-language policy, for the confirmation panel and emails. */
export function describePolicy(p: CancellationPolicy): string {
  const pct = Math.round(p.partial_refund_bps / 100);
  const parts = [`Full refund ${p.full_refund_hours} hours or more before departure.`];
  if (p.partial_refund_hours < p.full_refund_hours && pct > 0) {
    parts.push(`${pct}% refund between ${p.partial_refund_hours} and ${p.full_refund_hours} hours before.`);
    parts.push(`No refund under ${p.partial_refund_hours} hours.`);
  } else {
    parts.push(`No refund after that.`);
  }
  return parts.join(' ');
}

