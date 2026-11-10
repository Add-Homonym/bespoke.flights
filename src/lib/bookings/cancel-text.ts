/** Wording for a cancelled booking. Pure, so server pages and the cancel button share it. */

export type CancelTier = 'full' | 'partial' | 'none';

export interface CancelBannerParts {
  refund: string;
  refundCents: number;
  /** "card ending 4242" or "the original payment method". */
  refundTo: string;
  tierLabel: string;
  /** "2026-10-21 14:05 UTC" */
  cancelledAt: string;
}

export function cancelBanner(p: CancelBannerParts): { headline: string; detail: string } {
  return {
    headline: p.refundCents > 0
      ? `Trip cancelled. Refund of ${p.refund} to ${p.refundTo}.`
      : 'Trip cancelled. No refund is due under the operator’s policy.',
    detail: `${p.tierLabel} Cancelled ${p.cancelledAt}.`,
  };
}

export function tierLabel(tier: CancelTier, policy: { full_refund_hours: number; partial_refund_hours: number; partial_refund_bps: number }): string {
  if (tier === 'full') return `Full refund: cancelled at least ${policy.full_refund_hours} hours before departure.`;
  if (tier === 'partial') {
    return `${Math.round(policy.partial_refund_bps / 100)}% refund: cancelled between ${policy.partial_refund_hours} and ${policy.full_refund_hours} hours before departure.`;
  }
  return `No refund: cancelled less than ${policy.partial_refund_hours} hours before departure.`;
}

export function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}
