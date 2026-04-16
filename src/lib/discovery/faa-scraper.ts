/**
 * FAA Part 135 Certificate Holder Scraper.
 *
 * Queries the FAA's Aviation Safety Information system (av-info.faa.gov)
 * for Part 135 on-demand air taxi certificate holders, state by state.
 *
 * The FAA's public search returns HTML tables with:
 *   - Certificate holder name, DBA, certificate number
 *   - Address, city, state, zip
 *
 * NOTE: The FAA does NOT publish email addresses. Discovered operators
 * are stored with status 'no_email' until an admin adds contact info
 * or a secondary email discovery step is implemented.
 */

export interface FAAOperator {
  company_name: string;
  dba_name: string | null;
  certificate_number: string;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  phone: string | null;
}

const FAA_SEARCH_URL = 'https://av-info.faa.gov/OperatorInfo.asp';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','PR','VI','GU',
];

/**
 * Build form body for the FAA OperatorInfo search.
 * The FAA form expects URL-encoded POST data.
 */
function buildFormBody(state: string): string {
  const params = new URLSearchParams();
  params.set('Rone', '');           // Cert number range start
  params.set('Rtwo', '');           // Cert number range end
  params.set('OpName', '');         // Operator name (blank = all)
  params.set('OpCity', '');         // City (blank = all)
  params.set('OpState', state);     // State code
  params.set('OpZip', '');          // Zip
  params.set('Teflag', '');         // TE flag
  params.set('Teflag2', '');        // TE flag 2
  params.set('submit1', 'Submit');  // Submit button
  return params.toString();
}

/**
 * Parse the FAA response HTML to extract operator records.
 *
 * The FAA returns an HTML page with a <table> containing rows like:
 *   <tr><td>CERT_NUM</td><td>NAME</td><td>DBA</td><td>ADDR</td>
 *       <td>CITY</td><td>STATE</td><td>ZIP</td></tr>
 *
 * Column order and count may vary. This parser is defensive —
 * it attempts multiple known layouts and skips malformed rows.
 */
export function parseOperatorTable(html: string, state: string): FAAOperator[] {
  const operators: FAAOperator[] = [];

  // Extract all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tagStripper = /<[^>]+>/g;

  let rowMatch: RegExpExecArray | null;
  let isFirstRow = true;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract cell contents
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(tagStripper, '').trim());
    }

    // Skip header rows and rows with too few cells
    if (cells.length < 4) continue;
    if (isFirstRow) {
      isFirstRow = false;
      // Check if this is a header row (contains "Cert" or "Name" or "State")
      const headerish = cells.some(c =>
        /^(cert|name|operator|dba|city|state|zip|address)/i.test(c)
      );
      if (headerish) continue;
    }

    // Skip empty/whitespace-only rows
    if (cells.every(c => !c)) continue;

    // Attempt to extract based on common FAA layouts:
    // Layout A (7 cols): CertNum | Name | DBA | Address | City | State | Zip
    // Layout B (6 cols): CertNum | Name | Address | City | State | Zip
    // Layout C (5 cols): CertNum | Name | City | State | Zip

    let op: FAAOperator | null = null;

    if (cells.length >= 7) {
      op = {
        certificate_number: cells[0],
        company_name: cells[1],
        dba_name: cells[2] || null,
        address: cells[3] || null,
        city: cells[4] || null,
        state: cells[5] || state,
        zip: cells[6] || null,
        phone: null,
      };
    } else if (cells.length >= 6) {
      op = {
        certificate_number: cells[0],
        company_name: cells[1],
        dba_name: null,
        address: cells[2] || null,
        city: cells[3] || null,
        state: cells[4] || state,
        zip: cells[5] || null,
        phone: null,
      };
    } else if (cells.length >= 5) {
      op = {
        certificate_number: cells[0],
        company_name: cells[1],
        dba_name: null,
        address: null,
        city: cells[2] || null,
        state: cells[3] || state,
        zip: cells[4] || null,
        phone: null,
      };
    } else if (cells.length >= 4) {
      op = {
        certificate_number: cells[0],
        company_name: cells[1],
        dba_name: null,
        address: null,
        city: cells[2] || null,
        state: state,
        zip: null,
        phone: null,
      };
    }

    // Validate: cert number should look plausible (alphanumeric)
    if (op && op.certificate_number && /^[A-Z0-9]{3,12}$/i.test(op.certificate_number) && op.company_name) {
      operators.push(op);
    }
  }

  return operators;
}

/**
 * Scrape FAA Part 135 operators for a single state.
 * Returns parsed operator records.
 */
export async function scrapeState(state: string): Promise<FAAOperator[]> {
  try {
    const res = await fetch(FAA_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BespokeFlights/1.0 (charter marketplace; contact hello@bespoke.flights)',
      },
      body: buildFormBody(state),
    });

    if (!res.ok) {
      console.error(`FAA scrape failed for ${state}: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseOperatorTable(html, state);
  } catch (err) {
    console.error(`FAA scrape error for ${state}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Scrape multiple states. Adds a delay between requests to be polite.
 *
 * @param states - List of 2-letter state codes. Defaults to all US states.
 * @param delayMs - Delay between state queries (default 500ms).
 * @param maxStates - Maximum states to query per run (for Vercel timeout management).
 */
export async function scrapeStates(
  states: string[] = US_STATES,
  delayMs = 500,
  maxStates = 10
): Promise<{ operators: FAAOperator[]; statesQueried: string[] }> {
  const operators: FAAOperator[] = [];
  const statesQueried: string[] = [];

  const batch = states.slice(0, maxStates);

  for (let i = 0; i < batch.length; i++) {
    const state = batch[i];
    const result = await scrapeState(state);
    operators.push(...result);
    statesQueried.push(state);

    if (i < batch.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { operators, statesQueried };
}

/**
 * Get the next batch of states to scrape, based on which states
 * were last scraped. Rotates through all states across multiple runs.
 */
export function getNextStateBatch(
  lastScrapedStates: string[],
  batchSize = 10
): string[] {
  if (lastScrapedStates.length === 0) {
    return US_STATES.slice(0, batchSize);
  }

  // Find the index of the last scraped state
  const lastState = lastScrapedStates[lastScrapedStates.length - 1];
  const lastIdx = US_STATES.indexOf(lastState);

  if (lastIdx === -1 || lastIdx >= US_STATES.length - 1) {
    // Wrap around to the beginning
    return US_STATES.slice(0, batchSize);
  }

  const startIdx = lastIdx + 1;
  return US_STATES.slice(startIdx, startIdx + batchSize);
}

export { US_STATES };
