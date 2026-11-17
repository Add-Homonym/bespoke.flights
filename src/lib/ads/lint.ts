/**
 * Copy rules every ad must pass before the loop may launch it. Mirrors the
 * marketing runbook: responsive-search-ad limits, brand voice, and only the
 * product claims the site can back. An ad with any violation is never launched.
 */

export const HEADLINE_MAX = 30;
export const DESCRIPTION_MAX = 90;
export const MIN_HEADLINES = 3;
export const MAX_HEADLINES = 15;
export const MIN_DESCRIPTIONS = 2;
export const MAX_DESCRIPTIONS = 4;

/** Landing paths an ad may point at. */
export const ALLOWED_PATHS = ['/book', '/empty-legs'];

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /!/, why: 'exclamation mark' },
  { pattern: /\p{Extended_Pictographic}/u, why: 'emoji' },
  { pattern: /\b(luxury|luxurious|ultimate|vip|elite|experience the)\b/i, why: 'brand voice: banned word' },
  { pattern: /\b(call|phone|concierge|hotline)\b/i, why: 'no phone or concierge claims' },
  { pattern: /\b(membership|jet card|white[- ]label)\b/i, why: 'no membership, jet card or white-label claims' },
  { pattern: /\b(guarantee[ds]?|cheapest|lowest|best price|#1|number one)\b/i, why: 'unsupported superlative or guarantee' },
  { pattern: /%\s*off|\bdiscount/i, why: 'percent-off claims need a basis' },
  { pattern: /[$€£]\s*\d|\b\d+\s*(usd|dollars)\b/i, why: 'no price figures' },
  { pattern: /\b\d[\d,]*\+?\s*(operators?|routes?|aircraft|jets?|flights?)\b/i, why: 'no operator, route or fleet counts' },
  { pattern: /\b(in|within)\s+\d+\s*(minutes?|hours?|mins?|hrs?)\b|\binstant(ly)?\b/i, why: 'no response-time claims' },
];

export interface AdCopy {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
}

/** Every rule the copy breaks. Empty means it may run. */
export function lintAd(ad: AdCopy): string[] {
  const out: string[] = [];
  if (ad.headlines.length < MIN_HEADLINES || ad.headlines.length > MAX_HEADLINES) out.push(`needs ${MIN_HEADLINES}-${MAX_HEADLINES} headlines`);
  if (ad.descriptions.length < MIN_DESCRIPTIONS || ad.descriptions.length > MAX_DESCRIPTIONS) out.push(`needs ${MIN_DESCRIPTIONS}-${MAX_DESCRIPTIONS} descriptions`);
  if (new Set(ad.headlines.map(h => h.toLowerCase())).size !== ad.headlines.length) out.push('duplicate headline');
  if (new Set(ad.descriptions.map(d => d.toLowerCase())).size !== ad.descriptions.length) out.push('duplicate description');

  const check = (text: string, max: number, kind: string) => {
    if (!text.trim()) out.push(`${kind} is empty`);
    if ([...text].length > max) out.push(`${kind} over ${max} characters: "${text}"`);
    if (text !== text.trim() || /\s{2,}/.test(text)) out.push(`${kind} has stray whitespace: "${text}"`);
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 8 && letters === letters.toUpperCase()) out.push(`${kind} is all capitals: "${text}"`);
    for (const { pattern, why } of BANNED) if (pattern.test(text)) out.push(`${why}: "${text}"`);
  };
  ad.headlines.forEach(h => check(h, HEADLINE_MAX, 'headline'));
  ad.descriptions.forEach(d => check(d, DESCRIPTION_MAX, 'description'));

  try {
    const u = new URL(ad.finalUrl, 'https://bespoke.flights');
    if (!ALLOWED_PATHS.includes(u.pathname)) out.push(`final URL must be one of ${ALLOWED_PATHS.join(', ')}`);
    if (!u.searchParams.get('bfv')) out.push('final URL is missing bfv');
  } catch {
    out.push('final URL is not a URL');
  }
  return out;
}
