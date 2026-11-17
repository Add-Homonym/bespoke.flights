/**
 * Ad copy generator. Every ad is assembled from vetted blocks: a route
 * headline, a lead headline and description that share one angle, the brand
 * headline, and a closing line. The loop learns which angle earns requests
 * (Thompson sampling over all campaigns) and builds the next ad from it.
 *
 * Add or edit blocks here. Each must hold on its own under src/lib/ads/lint.ts
 * and state only what the product does today.
 */
import { displayCode, findAirport } from '@/lib/airports';
import { lintAd, HEADLINE_MAX, type AdCopy } from './lint';
import { sampleBeta, type Rng, type Trials } from './stats';

export type Angle = 'compare' | 'operator' | 'no_markup' | 'flexible' | 'all_in' | 'empty_leg';

interface AngleBlocks { leads: string[]; descriptions: string[] }

export const ANGLES: Record<Angle, AngleBlocks> = {
  compare: {
    leads: ['Compare charter quotes', 'One request, several quotes', 'Compare all-in quotes'],
    descriptions: [
      'Request a trip once and compare all-in quotes from certified operators.',
      'Send one request. Operators reply with all-in quotes you can compare side by side.',
    ],
  },
  operator: {
    leads: ['Named, certified operators', 'Know who flies you', 'Operator named on every quote'],
    descriptions: [
      'Every quote names the operator and shows its certificate and safety rating.',
      'See who operates the flight, their certificate and safety rating before you pay.',
    ],
  },
  no_markup: {
    leads: ['No broker markup', 'Book direct with the operator', 'Operator pricing, no markup'],
    descriptions: [
      'Operators quote you directly. No broker markup is added to the price you see.',
      'The price you see is the operator’s own quote. No markup is added on top.',
    ],
  },
  flexible: {
    leads: ['Change or cancel on screen', 'Book, change or cancel online', 'Manage your trip online'],
    descriptions: [
      'Book, change or cancel on screen. Refunds follow the operator’s stated policy.',
      'Message the operator, change the trip or cancel from your trip page.',
    ],
  },
  all_in: {
    leads: ['All-in charter quotes', 'All-in pricing on every quote', 'See the full price up front'],
    descriptions: [
      'Quotes are all-in, so the price you compare is the price you pay.',
      'Each quote shows the full trip price before you commit to anything.',
    ],
  },
  empty_leg: {
    leads: ['Fixed-price empty legs', 'Book an empty leg on screen', 'Empty legs at a fixed price'],
    descriptions: [
      'Repositioning flights listed by operators at a fixed price. Book on screen.',
      'See empty legs listed by certified operators and book the one that fits.',
    ],
  },
};

export const BRAND_HEADLINE = 'Bespoke Flights';
export const CLOSERS = [
  'Request quotes online. No commitment until you accept one.',
  'Enter the trip once. Compare quotes and book on screen.',
];

export interface CampaignTarget {
  id: number;
  name: string;
  origin_code: string | null;
  dest_code: string | null;
  landing_path: string;
}

export interface Components { angle: Angle; lead: number; description: number; closer: number }
export const componentsKey = (c: Components) => `${c.angle}:${c.lead}:${c.description}:${c.closer}`;

/** Angles a campaign may use: empty-leg copy only on the empty-legs page, and the reverse. */
export function anglesFor(campaign: CampaignTarget): Angle[] {
  return campaign.landing_path === '/empty-legs' ? ['empty_leg', 'operator'] : ['compare', 'operator', 'flexible', 'no_markup', 'all_in'];
}

const city = (code: string) => findAirport(code)?.city ?? displayCode(code);

/** The first route headline that fits 30 characters, from most to least descriptive. */
export function routeHeadline(campaign: CampaignTarget): string {
  const emptyLegs = campaign.landing_path === '/empty-legs';
  const { origin_code: o, dest_code: d } = campaign;
  const options = o && d
    ? emptyLegs
      ? [`${city(o)} to ${city(d)} empty legs`, `${displayCode(o)} to ${displayCode(d)} empty legs`]
      : [`${city(o)} to ${city(d)} private charter`, `${city(o)} to ${city(d)} charter`, `${displayCode(o)} to ${displayCode(d)} private charter`, `${displayCode(o)} to ${displayCode(d)} charter`]
    : emptyLegs
      ? ['Empty leg flights in Hawaiʻi']
      : ['Hawaiʻi private charter quotes'];
  return options.find(h => [...h].length <= HEADLINE_MAX) ?? options[options.length - 1];
}

/** Final URL for a variant: the campaign's landing page, the route prefilled, and the attribution parameters. */
export function finalUrlFor(campaign: CampaignTarget, variantId: number): string {
  const q = new URLSearchParams();
  if (campaign.origin_code && campaign.dest_code) {
    q.set('from', displayCode(campaign.origin_code));
    q.set('to', displayCode(campaign.dest_code));
  }
  q.set('utm_source', 'google');
  q.set('utm_medium', 'cpc');
  q.set('utm_campaign', campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  q.set('bfv', String(variantId));
  return `${campaign.landing_path}?${q.toString()}`;
}

export function buildCopy(campaign: CampaignTarget, c: Components, variantId: number): AdCopy {
  const blocks = ANGLES[c.angle];
  const second = blocks.leads[(c.lead + 1) % blocks.leads.length];
  return {
    headlines: [routeHeadline(campaign), blocks.leads[c.lead], BRAND_HEADLINE, second],
    descriptions: [blocks.descriptions[c.description], CLOSERS[c.closer]],
    finalUrl: finalUrlFor(campaign, variantId),
  };
}

function untried(angle: Angle, tried: Set<string>): Components[] {
  const out: Components[] = [];
  const b = ANGLES[angle];
  for (let lead = 0; lead < b.leads.length; lead++)
    for (let description = 0; description < b.descriptions.length; description++)
      for (let closer = 0; closer < CLOSERS.length; closer++) {
        const c = { angle, lead, description, closer };
        if (!tried.has(componentsKey(c))) out.push(c);
      }
  return out;
}

export interface NextVariantInput {
  campaign: CampaignTarget;
  /** componentsKey of every variant this campaign has had, live or not. */
  tried: Set<string>;
  /** Angles currently live in this campaign; a new ad avoids them while others remain. */
  liveAngles: Set<string>;
  /** Clicks and requests per angle across all campaigns. */
  angleStats: Partial<Record<Angle, Trials>>;
  rng: Rng;
}

/**
 * The next ad to try in a campaign, or null when every combination has run.
 * Angle: Thompson sample of each angle's request rate, preferring angles not
 * live in this campaign. Blocks: a random untried combination within it.
 */
export function nextVariant(input: NextVariantInput): Components | null {
  const { campaign, tried, liveAngles, angleStats, rng } = input;
  const scored = anglesFor(campaign)
    .map(angle => {
      const s = angleStats[angle] ?? { successes: 0, trials: 0 };
      const ok = Math.min(s.successes, s.trials);
      return { angle, options: untried(angle, tried), score: sampleBeta(1 + ok, 1 + s.trials - ok, rng) };
    })
    .filter(a => a.options.length > 0);
  if (scored.length === 0) return null;
  const fresh = scored.filter(a => !liveAngles.has(a.angle));
  const pick = (fresh.length ? fresh : scored).sort((a, b) => b.score - a.score)[0];
  return pick.options[Math.floor(rng() * pick.options.length)];
}

/** Lint violations across every block combination for a campaign. Used by tests and before seeding. */
export function lintAllCopy(campaign: CampaignTarget): string[] {
  const out: string[] = [];
  for (const angle of anglesFor(campaign))
    for (const c of untried(angle, new Set()))
      for (const v of lintAd(buildCopy(campaign, c, 1))) out.push(`${componentsKey(c)}: ${v}`);
  return out;
}
