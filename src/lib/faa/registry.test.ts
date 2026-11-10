import { describe, expect, it } from 'vitest';
import { lookupNNumber, normalizeNNumber, parseRegistryHtml, RegistryUnavailable, suggestedType } from './registry';

/** Rows in the FAA page's markup: label cell, then value cell with a data-label. */
const rows = (pairs: [string, string][]) =>
  pairs.map(([k, v]) => `<tr class="devkit-table-row" scope="row"> <td data-label="">${k}</td> <td data-label="${k}">${v} </td> </tr>`).join('\n');
const table = (caption: string, pairs: [string, string][]) =>
  `<table class="devkit-table"> <caption class="devkit-table-title">${caption}</caption> <tbody> ${rows(pairs)} </tbody> </table>`;
const page = (status: string, body: string) =>
  `<html><body><header>nav</header><main class="devkit-main-wrapper" id="main-content"><h1>FAA REGISTRY</h1>
   <p>Data Updated Each Federal Working Day At Midnight</p><p>${status}</p>${body}</main><footer>Federal Aviation Administration</footer></body></html>`;

// Values as returned by the registry for N628TS on 2026-10-18 (from Vercel's network).
const ASSIGNED = page('N628TS is Assigned',
  `<table class="devkit-table"><caption class="devkit-table-title">N-Number Entered: 628ts</caption></table>` +
  table('Aircraft Description', [
    ['Serial Number', '6177'], ['Status', 'Valid'], ['Manufacturer Name', 'GULFSTREAM AEROSPACE CORP'],
    ['Certificate Issue Date', '03/31/2016'], ['Model', 'GVI (G650ER)'], ['Expiration Date', '03/31/2029'],
    ['Type Aircraft', 'Fixed Wing Multi-Engine'], ['Type Engine', 'Turbo-fan'], ['Pending Number Change', 'None'],
    ['Dealer', 'No'], ['Mode S Code (base 8 / Oct)', '52032657'], ['MFR Year', '2015'],
    ['Mode S Code (Base 16 / Hex)', 'A835AF'], ['Type Registration', 'LLC'], ['Fractional Owner', 'NO'],
  ]) +
  table('Registered Owner', [
    ['Name', 'FALCON LANDING LLC'], ['Street', '1 ROCKET RD'], ['City', 'HAWTHORNE'], ['State', 'CALIFORNIA'], ['Country', 'UNITED STATES'],
  ]) +
  `<table><caption class="devkit-table-title">Airworthiness</caption><caption class="devkit-table-title">INFORMATION PROVIDED HERE SHOULD NOT BE USED TO DETERMINE THE AIRWORTHINESS OF AN AIRCRAFT.<br />Refer to 14 CFR Parts 39, 43, 91.</caption><tbody>` +
  rows([['Engine Manufacturer', 'ROLLS DEUT'], ['Classification', 'Standard'], ['Engine Model', 'BR700-725A112'], ['Category', 'Transport'], ['A/W Date', '03/31/2015']]) +
  `</tbody></table>` + table('Other Owner Names', [['Name', 'None']]));

const RESERVED = page('',
  `<table><caption class="devkit-table-title">N-Number Entered: 650ga</caption><caption class="devkit-table-title">Reserved N-Number</caption>` +
  rows([['Type Reservation', 'Fee Paid'], ['Reserved Date', '11/02/2021'], ['Reserving Party Name', 'GULFSTREAM AEROSPACE CORP']]) + '</table>');

const UNASSIGNED = page('N9999Q is Not Assigned/Reserved', '');

describe('normalizeNNumber', () => {
  it.each([
    ['n628ts', 'N628TS'], [' N 628TS ', 'N628TS'], ['628TS', 'N628TS'], ['N1KE', 'N1KE'], ['N-12345', 'N12345'], ['N1234Z', 'N1234Z'],
  ])('%s → %s', (input, out) => expect(normalizeNNumber(input)).toBe(out));

  it.each(['N0123', 'N123456', 'N12IO', 'N1ABC', 'C-GABC', '', 'N'])('rejects %s', input =>
    expect(normalizeNNumber(input)).toBeNull());
});

describe('parseRegistryHtml', () => {
  it('reads a registered aircraft', () => {
    const r = parseRegistryHtml(ASSIGNED, 'N628TS');
    expect(r).toMatchObject({
      status: 'assigned',
      serialNumber: '6177',
      manufacturer: 'GULFSTREAM AEROSPACE CORP',
      model: 'GVI (G650ER)',
      year: 2015,
      registrationStatus: 'Valid',
      certificateIssued: '2016-03-31',
      registrationExpires: '2029-03-31',
      modeSHex: 'A835AF',
      fractionalOwner: false,
      ownerName: 'FALCON LANDING LLC',
      ownerState: 'CALIFORNIA',
      engineManufacturer: 'ROLLS DEUT',
      engineModel: 'BR700-725A112',
      airworthinessCategory: 'Transport',
      airworthinessDate: '2015-03-31',
    });
    expect(r.sourceUrl).toContain('nNumberTxt=N628TS');
  });

  it('keeps the airworthiness rows under Airworthiness despite the disclaimer caption', () => {
    expect(parseRegistryHtml(ASSIGNED, 'N628TS').airworthinessClass).toBe('Standard');
  });

  it('reads a reserved number', () => {
    expect(parseRegistryHtml(RESERVED, 'N650GA')).toMatchObject({ status: 'reserved', reservedBy: 'GULFSTREAM AEROSPACE CORP' });
  });

  it('reads an unassigned number', () => {
    expect(parseRegistryHtml(UNASSIGNED, 'N9999Q').status).toBe('not_assigned');
  });

  it('returns unknown for an unexpected page', () => {
    expect(parseRegistryHtml('<html><main>Maintenance</main></html>', 'N1').status).toBe('unknown');
  });
});

describe('suggestedType', () => {
  it('shortens the legal manufacturer name', () => {
    expect(suggestedType({ manufacturer: 'GULFSTREAM AEROSPACE CORP', model: 'GVI (G650ER)' })).toBe('Gulfstream GVI (G650ER)');
    expect(suggestedType({ manufacturer: 'TEXTRON AVIATION INC', model: '680A' })).toBe('Textron 680A');
    expect(suggestedType({ model: undefined })).toBeUndefined();
  });
});

describe('lookupNNumber', () => {
  it('sends a browser user agent and parses the page', async () => {
    let ua = '';
    const fake = (async (_url: string, init?: RequestInit) => {
      ua = new Headers(init?.headers).get('User-Agent') ?? '';
      return new Response(ASSIGNED, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await lookupNNumber('N628TS', fake);
    expect(ua).toMatch(/Mozilla\/5\.0/);
    expect(r.serialNumber).toBe('6177');
  });

  it('reports a refusal as unavailable', async () => {
    const fake = (async () => new Response('Access Denied', { status: 403 })) as unknown as typeof fetch;
    await expect(lookupNNumber('N628TS', fake)).rejects.toBeInstanceOf(RegistryUnavailable);
  });
});
