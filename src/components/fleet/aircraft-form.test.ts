import { describe, expect, it } from 'vitest';
import { registryMismatch } from './aircraft-form';
import type { RegistryRecord } from '@/lib/faa/registry';

const rec = (manufacturer: string, model: string): RegistryRecord =>
  ({ nNumber: 'N1', status: 'assigned', manufacturer, model, sourceUrl: '' });

describe('registryMismatch', () => {
  it('flags a type that shares nothing with the registry', () =>
    expect(registryMismatch('Cessna Citation X', rec('CIRRUS DESIGN CORP', 'SR20'))).toBe(true));
  it('accepts a type that names the maker or the model', () => {
    expect(registryMismatch('Gulfstream G650', rec('GULFSTREAM AEROSPACE CORP', 'GVI (G650ER)'))).toBe(false);
    expect(registryMismatch('Cirrus SR20', rec('CIRRUS DESIGN CORP', 'SR20'))).toBe(false);
  });
  it('ignores a blank type or a non-assigned record', () => {
    expect(registryMismatch('', rec('CIRRUS DESIGN CORP', 'SR20'))).toBe(false);
    expect(registryMismatch('G650', { nNumber: 'N1', status: 'reserved', sourceUrl: '' })).toBe(false);
  });
});
