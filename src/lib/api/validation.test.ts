import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldErrorsOf } from './validation';
import { fieldsOf, summaryLine } from './form-errors';

describe('validation messages', () => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7),
    age: z.number().int().min(1).max(10),
    note: z.string().max(5),
    nested: z.object({ pct: z.number().int().min(0).max(100) }),
    custom: z.string().min(3, 'Enter an airport code'),
  });

  it('turns Zod text into plain language, keyed by dotted path', () => {
    const r = schema.safeParse({ name: 'a', email: 'x', phone: '1', age: 99, note: 'too long', nested: { pct: -1 }, custom: '' });
    expect(r.success).toBe(false);
    const f = fieldErrorsOf(r.error!);
    expect(f.name).toEqual(['Enter at least 2 characters']);
    expect(f.email).toEqual(['Enter a valid email address']);
    expect(f.phone).toEqual(['Enter at least 7 characters']);
    expect(f.age).toEqual(['Must be at most 10']);
    expect(f.note).toEqual(['Use 5 characters or fewer']);
    expect(f['nested.pct']).toEqual(['Must be at least 0']);
    expect(f.custom).toEqual(['Enter an airport code']);
    expect(JSON.stringify(f)).not.toMatch(/Too small|Too big|Invalid input/);
  });

  it('marks missing fields as required', () => {
    const r = schema.safeParse({});
    expect(fieldErrorsOf(r.error!).name).toEqual(['Required']);
  });

  it('reads either response shape on the client', () => {
    expect(fieldsOf({ error: 'x', fieldErrors: { a: ['one', 'two'] } })).toEqual({ a: 'one' });
    expect(fieldsOf({ error: { a: ['old shape'] } })).toEqual({ a: 'old shape' });
    expect(fieldsOf({ error: 'plain' })).toEqual({});
    expect(summaryLine({ email: 'x', priceCents: 'y' }, { priceCents: 'Price' })).toBe('Fix 2 fields: Email, Price.');
  });
});
