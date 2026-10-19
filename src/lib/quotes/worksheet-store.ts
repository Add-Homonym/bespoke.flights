import type { Db } from '@/lib/db';
import { computeWorksheet, worksheetSchema, type WorksheetInputs } from './worksheet';

/** Save the operator's working for a quote. Totals are recomputed here, not trusted from the client. */
export async function saveWorksheet(db: Db, quoteId: number, operatorId: number, inputs: WorksheetInputs): Promise<void> {
  const { totalCents } = computeWorksheet(inputs);
  await db.run(`
    INSERT INTO quote_worksheets (quote_id, operator_id, inputs, total_cents) VALUES (?, ?, ?, ?)
    ON CONFLICT (quote_id) DO UPDATE SET inputs = EXCLUDED.inputs, total_cents = EXCLUDED.total_cents, updated_at = now()`,
    [quoteId, operatorId, JSON.stringify(inputs), totalCents]);
}

/** The worksheet for a quote, only for the operator that made the quote. */
export async function loadWorksheet(db: Db, quoteId: number, operatorId: number): Promise<WorksheetInputs | null> {
  const row = await db.one<{ inputs: string }>('SELECT inputs FROM quote_worksheets WHERE quote_id = ? AND operator_id = ?', [quoteId, operatorId]);
  if (!row) return null;
  const parsed = worksheetSchema.safeParse(JSON.parse(row.inputs));
  return parsed.success ? parsed.data : null;
}
