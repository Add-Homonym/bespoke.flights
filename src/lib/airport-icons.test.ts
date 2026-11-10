import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AIRPORT_ICONS, airportIconSrc } from './airport-icons';

describe('airportIconSrc', () => {
  it('maps a known code to its icon', () => {
    expect(airportIconSrc('HNL')).toBe('/airports/hnl.svg');
  });
  it('accepts lowercase input', () => {
    expect(airportIconSrc('ogg')).toBe('/airports/ogg.svg');
  });
  it('falls back to any.svg for an unknown code', () => {
    expect(airportIconSrc('JFK')).toBe('/airports/any.svg');
    expect(airportIconSrc('')).toBe('/airports/any.svg');
  });
  it('falls back to any.svg for null and undefined', () => {
    expect(airportIconSrc(null)).toBe('/airports/any.svg');
    expect(airportIconSrc(undefined)).toBe('/airports/any.svg');
  });
  it('has a file in public/airports for every mapped code and for the fallback', () => {
    for (const code of [...AIRPORT_ICONS, 'ANY']) {
      expect(fs.existsSync(path.join(process.cwd(), 'public/airports', `${code.toLowerCase()}.svg`))).toBe(true);
    }
  });
});
