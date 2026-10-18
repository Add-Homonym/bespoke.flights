/**
 * FAA Aircraft Registry lookup by N-number.
 *
 * Source: https://registry.faa.gov/AircraftInquiry/Search/NNumberResult —
 * the public N-number inquiry page, updated each federal working day. The page
 * is a set of tables, one per section (<caption>), whose rows hold label/value
 * cell pairs: <td data-label="">Serial Number</td><td data-label="Serial Number">6177</td>.
 *
 * The registry rejects requests that do not look like a browser, so the fetch
 * sends a browser user agent. It holds registration and airworthiness data only;
 * accident and incident history lives with the NTSB (see NTSB_SEARCH_URL).
 */

export const FAA_INQUIRY_URL = 'https://registry.faa.gov/AircraftInquiry/Search/NNumberResult';
export const NTSB_SEARCH_URL = 'https://data.ntsb.gov/carol-main-public/basic-search';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const TIMEOUT_MS = 8_000;

export type RegistryStatus = 'assigned' | 'reserved' | 'not_assigned' | 'unknown';

export interface RegistryRecord {
  nNumber: string;
  status: RegistryStatus;
  /** Aircraft Description */
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  year?: number;
  aircraftType?: string;
  engineType?: string;
  /** "Valid", "Expired", "Deregistered", … */
  registrationStatus?: string;
  certificateIssued?: string;   // YYYY-MM-DD
  registrationExpires?: string; // YYYY-MM-DD
  registrationType?: string;
  modeSHex?: string;
  fractionalOwner?: boolean;
  /** Registered Owner */
  ownerName?: string;
  ownerCity?: string;
  ownerState?: string;
  ownerCountry?: string;
  /** Airworthiness */
  engineManufacturer?: string;
  engineModel?: string;
  airworthinessClass?: string;
  airworthinessCategory?: string;
  airworthinessDate?: string;   // YYYY-MM-DD
  /** Reserved N-number */
  reservedBy?: string;
  /** Link to the record on the FAA site. */
  sourceUrl: string;
}

/** 'n628ts', ' N 628TS ', '628TS' → 'N628TS'. Null when it cannot be a US registration. */
export function normalizeNNumber(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  const body = raw.startsWith('N') ? raw.slice(1) : raw;
  // 1–5 characters, starts with a digit 1–9, no I or O, at most two trailing letters.
  if (!/^[1-9][0-9]{0,4}$|^[1-9][0-9]{0,3}[A-HJ-NP-Z]$|^[1-9][0-9]{0,2}[A-HJ-NP-Z]{2}$/.test(body)) return null;
  return `N${body}`;
}

export function registryUrl(nNumber: string): string {
  return `${FAA_INQUIRY_URL}?nNumberTxt=${encodeURIComponent(nNumber)}`;
}

const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 'MM/DD/YYYY' → 'YYYY-MM-DD'; anything else → undefined. */
function isoDate(v: string | undefined): string | undefined {
  const m = v ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v) : null;
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

const present = (v: string | undefined) => (v && v.toLowerCase() !== 'none' ? v : undefined);

/** Section caption → { label → value } from the inquiry page HTML. */
export function parseSections(html: string): Map<string, Map<string, string>> {
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  const main = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
  const sections = new Map<string, Map<string, string>>();
  let current = new Map<string, string>();
  sections.set('', current);
  const re = /<caption[^>]*>([\s\S]*?)<\/caption>|<td\s+data-label=""[^>]*>([\s\S]*?)<\/td>\s*<td\s+data-label="[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  for (let m = re.exec(main); m; m = re.exec(main)) {
    if (m[1] !== undefined) {
      const title = decode(m[1]);
      // Captions that are notices (the airworthiness disclaimer) or blank keep the current section.
      if (!title || title.length > 60) continue;
      current = sections.get(title) ?? new Map();
      sections.set(title, current);
    } else {
      const label = decode(m[2]);
      if (label) current.set(label, decode(m[3]));
    }
  }
  return sections;
}

export function parseRegistryHtml(html: string, nNumber: string): RegistryRecord {
  const base: RegistryRecord = { nNumber, status: 'unknown', sourceUrl: registryUrl(nNumber) };
  const text = decode(html.slice(0, 200_000));
  if (/is Not Assigned/i.test(text)) return { ...base, status: 'not_assigned' };

  const sections = parseSections(html);
  const reserved = sections.get('Reserved N-Number');
  if (reserved) {
    return { ...base, status: 'reserved', reservedBy: present(reserved.get('Reserving Party Name')) };
  }

  const d = sections.get('Aircraft Description');
  if (!d) return base;
  const owner = sections.get('Registered Owner') ?? new Map<string, string>();
  const aw = sections.get('Airworthiness') ?? new Map<string, string>();
  const year = Number(d.get('MFR Year'));

  return {
    ...base,
    status: 'assigned',
    serialNumber: present(d.get('Serial Number')),
    manufacturer: present(d.get('Manufacturer Name')),
    model: present(d.get('Model')),
    year: Number.isInteger(year) && year > 1900 ? year : undefined,
    aircraftType: present(d.get('Type Aircraft')),
    engineType: present(d.get('Type Engine')),
    registrationStatus: present(d.get('Status')),
    certificateIssued: isoDate(d.get('Certificate Issue Date')),
    registrationExpires: isoDate(d.get('Expiration Date')),
    registrationType: present(d.get('Type Registration')),
    modeSHex: present(d.get('Mode S Code (Base 16 / Hex)')),
    fractionalOwner: d.has('Fractional Owner') ? /^yes$/i.test(d.get('Fractional Owner')!) : undefined,
    ownerName: present(owner.get('Name')),
    ownerCity: present(owner.get('City')),
    ownerState: present(owner.get('State')),
    ownerCountry: present(owner.get('Country')),
    engineManufacturer: present(aw.get('Engine Manufacturer')),
    engineModel: present(aw.get('Engine Model')),
    airworthinessClass: present(aw.get('Classification')),
    airworthinessCategory: present(aw.get('Category')),
    airworthinessDate: isoDate(aw.get('A/W Date')),
  };
}

/**
 * 'GULFSTREAM AEROSPACE CORP' + 'GVI (G650ER)' → 'Gulfstream GVI (G650ER)'.
 * The registry's legal manufacturer names are long; the first word is what operators use.
 */
export function suggestedType(r: Pick<RegistryRecord, 'manufacturer' | 'model'>): string | undefined {
  if (!r.model) return undefined;
  const maker = r.manufacturer?.split(/\s+/)[0];
  const name = maker ? maker.charAt(0) + maker.slice(1).toLowerCase() : '';
  return [name, r.model].filter(Boolean).join(' ');
}

export class RegistryUnavailable extends Error {}

/** Fetch and parse one N-number. Throws RegistryUnavailable when the FAA site cannot be reached or refuses. */
export async function lookupNNumber(nNumber: string, fetchImpl: typeof fetch = fetch): Promise<RegistryRecord> {
  let res: Response;
  try {
    res = await fetchImpl(registryUrl(nNumber), {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    throw new RegistryUnavailable(`FAA registry did not respond: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new RegistryUnavailable(`FAA registry returned HTTP ${res.status}`);
  return parseRegistryHtml(await res.text(), nNumber);
}
