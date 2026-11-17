/**
 * Paid-click attribution. An ad's final URL carries `bfv=<ad variant id>` plus
 * the usual utm_* parameters; Google adds `gclid`. The proxy stores the click
 * in a first-party cookie, and the booking request records it when created.
 * Last paid click wins. The cookie holds campaign parameters only.
 */

export const ATTR_COOKIE = 'bf_attr';
export const ATTR_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export interface Attribution {
  /** ad_variants.id from the bfv parameter. */
  variantId?: number;
  gclid?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  /** Path the click landed on. */
  landing: string;
  /** ISO time of the click. */
  at: string;
}

const clip = (v: string | null, max = 200) => (v ? v.slice(0, max) : undefined);

/** The click described by a landing URL, or null when it carries no paid-click parameters. */
export function attributionFromUrl(url: URL, now = new Date()): Attribution | null {
  const q = url.searchParams;
  const bfv = q.get('bfv');
  const variantId = bfv && /^\d{1,9}$/.test(bfv) ? Number(bfv) : undefined;
  const gclid = clip(q.get('gclid'));
  const source = clip(q.get('utm_source'), 60);
  if (variantId === undefined && !gclid && !source) return null;
  return {
    variantId,
    gclid,
    source,
    medium: clip(q.get('utm_medium'), 60),
    campaign: clip(q.get('utm_campaign'), 120),
    term: clip(q.get('utm_term'), 120),
    content: clip(q.get('utm_content'), 120),
    landing: url.pathname.slice(0, 200),
    at: now.toISOString(),
  };
}

export const encodeAttribution = (a: Attribution) => encodeURIComponent(JSON.stringify(a));

/** Parse the cookie leniently. Never throws. */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (!d || typeof d !== 'object') return null;
    const s = (v: unknown, max = 200) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
    const variantId = Number.isInteger(d.variantId) && (d.variantId as number) > 0 ? (d.variantId as number) : undefined;
    const out: Attribution = {
      variantId,
      gclid: s(d.gclid),
      source: s(d.source, 60),
      medium: s(d.medium, 60),
      campaign: s(d.campaign, 120),
      term: s(d.term, 120),
      content: s(d.content, 120),
      landing: s(d.landing) ?? '/',
      at: s(d.at, 40) ?? '',
    };
    if (out.variantId === undefined && !out.gclid && !out.source) return null;
    return out;
  } catch {
    return null;
  }
}

/** The click stored in this request's cookies, or null. Safe outside a request scope. */
export async function readAttribution(): Promise<Attribution | null> {
  try {
    const { cookies } = await import('next/headers');
    return parseAttribution((await cookies()).get(ATTR_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Column values for booking_requests (ad_variant_id, attribution). */
export function attributionColumns(a: Attribution | null): [number | null, string | null] {
  return a ? [a.variantId ?? null, JSON.stringify(a)] : [null, null];
}
