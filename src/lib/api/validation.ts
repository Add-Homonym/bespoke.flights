import { NextResponse } from 'next/server';
import type { ZodError, ZodIssue } from 'zod';

const ZOD_DEFAULT = /^(Too (small|big): |Invalid (input|string|option|number|email|url|uuid)|Unrecognized key)/i;

/** Plain-language text for one Zod issue; never the raw library message. */
export function friendlyIssue(issue: ZodIssue): string {
  const i = issue as ZodIssue & Record<string, unknown>;
  // A message written in the schema is already plain language; only Zod's own defaults are rewritten.
  if (!ZOD_DEFAULT.test(issue.message)) return issue.message;
  switch (i.code) {
    case 'invalid_type':
      return /received undefined/i.test(issue.message) ? 'Required' : i.expected === 'number' ? 'Enter a number' : 'Enter a valid value';
    case 'too_small': {
      const min = Number(i.minimum);
      if (i.origin === 'string') return min <= 1 ? 'Required' : `Enter at least ${min} characters`;
      if (i.origin === 'array') return `Choose at least ${min}`;
      return i.inclusive === false ? `Must be more than ${min}` : `Must be at least ${min}`;
    }
    case 'too_big': {
      const max = Number(i.maximum);
      if (i.origin === 'string') return `Use ${max} characters or fewer`;
      if (i.origin === 'array') return `Choose at most ${max}`;
      return i.inclusive === false ? `Must be less than ${max}` : `Must be at most ${max}`;
    }
    case 'invalid_format':
      if (i.format === 'email') return 'Enter a valid email address';
      if (i.format === 'regex') return 'Check the format';
      return 'Enter a valid value';
    case 'invalid_value':
      return 'Choose one of the listed options';
    case 'not_multiple_of':
      return `Use a multiple of ${String(i.multipleOf)}`;
    case 'unrecognized_keys':
      return 'Not an editable field';
    default:
      // Custom refinements are written in plain language already.
      return issue.message;
  }
}

/** Dotted field path to its messages, e.g. `{ validUntil: ['…'], 'cancellation_policy.partial_refund_bps': ['…'] }`. */
export function fieldErrorsOf(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    const msg = friendlyIssue(issue);
    const list = (out[key] ??= []);
    if (!list.includes(msg)) list.push(msg);
  }
  return out;
}

/** 400 response shared by every route: a summary line plus per-field messages. */
export function validationResponse(error: ZodError, summary = 'Check the highlighted fields.') {
  return NextResponse.json({ error: summary, fieldErrors: fieldErrorsOf(error) }, { status: 400 });
}
