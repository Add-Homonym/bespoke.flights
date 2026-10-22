/** Client side of the shared form error pattern (see lib/api/validation.ts for the server half). */

export interface ApiFailure {
  /** One summary line for the whole form. */
  message: string;
  /** First message for each field, keyed by the API field path. */
  fields: Record<string, string>;
  status: number;
}

type ErrorBody = { error?: unknown; fieldErrors?: unknown } | null | undefined;

/** First message per field from an API error body. Also accepts the older `{ error: { field: [..] } }` shape. */
export function fieldsOf(body: unknown): Record<string, string> {
  const b = body as ErrorBody;
  const raw = (b?.fieldErrors ?? (b && typeof b.error === 'object' ? b.error : null)) as Record<string, string[] | string> | null;
  const fields: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const first = Array.isArray(v) ? v[0] : v;
      if (first) fields[k] = String(first);
    }
  }
  return fields;
}

/** Reads a failed fetch response into a summary and per-field messages. */
export async function readApiFailure(res: Response, fallback = 'Something went wrong. Try again.'): Promise<ApiFailure> {
  const body = await res.json().catch(() => null) as ErrorBody;
  const fields = fieldsOf(body);
  const message = typeof body?.error === 'string' && body.error ? body.error : Object.keys(fields).length ? 'Check the highlighted fields.' : fallback;
  return { message, fields, status: res.status };
}

/** Summary line that names the fields to fix, e.g. "Fix 2 fields: Email, Phone." */
export function summaryLine(fields: Record<string, string>, labels: Record<string, string> = {}): string {
  const keys = Object.keys(fields).filter(k => k !== '_');
  if (keys.length === 0) return fields._ ?? 'Check the form and try again.';
  const names = keys.map(k => labels[k] ?? k.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, c => c.toUpperCase()));
  return `Fix ${keys.length === 1 ? '1 field' : `${keys.length} fields`}: ${names.join(', ')}.`;
}
