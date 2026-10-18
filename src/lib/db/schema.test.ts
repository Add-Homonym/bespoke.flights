import { describe, expect, it } from 'vitest';
import { SCHEMA } from './schema';

describe('SCHEMA', () => {
  // migrate() splits SCHEMA on ';', so a semicolon in a comment breaks the statement after it.
  it('has no semicolons inside comments', () => {
    const bad = SCHEMA.split('\n').filter(l => /--.*;/.test(l));
    expect(bad).toEqual([]);
  });
});
