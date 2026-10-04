/**
 * Weekly operator discovery pipeline.
 *
 * Orchestrates: FAA scrape → store in DB → send invite emails.
 *
 * Designed to run within a Vercel Cron function (~60s budget).
 * Processes a batch of states per run and rotates through all states
 * across multiple weeks.
 */

import type { Db } from '@/lib/db';
import { scrapeStates, getNextStateBatch } from './faa-scraper';
import type { FAAOperator } from './faa-scraper';
import { sendEmail } from '@/lib/email/resend';
import { operatorInviteEmail } from '@/lib/email/templates';

export interface DiscoveryResult {
  statesQueried: string[];
  operatorsFound: number;
  newOperators: number;
  emailsSent: number;
  emailsFailed: number;
  errors: string[];
}

/**
 * Store discovered operators in the database.
 * Skips duplicates (by certificate_number).
 * Returns count of newly inserted records.
 */
async function storeDiscoveries(db: Db, operators: FAAOperator[]): Promise<number> {
  return db.transaction(async tx => {
    let inserted = 0;
    for (const op of operators) {
      // Skip operators already registered on the platform
      const existing = await tx.one(
        'SELECT id FROM operators WHERE certificate = ? OR company_name = ?',
        [op.certificate_number, op.company_name]
      );
      if (existing) continue;

      const status = op.phone ? 'new' : 'no_email'; // 'new' if we have some contact info
      inserted += await tx.run(`
        INSERT INTO discovered_operators
          (company_name, dba_name, certificate_number, phone, address, city, state, zip, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'faa_registry')
        ON CONFLICT (certificate_number) DO NOTHING
      `, [
        op.company_name,
        op.dba_name,
        op.certificate_number,
        op.phone,
        op.address,
        op.city,
        op.state,
        op.zip,
        status,
      ]);
    }
    return inserted;
  });
}

/**
 * Send invite emails to discovered operators that have email addresses
 * and haven't been emailed yet.
 *
 * @param limit - Max emails to send per run (respect Resend rate limits).
 */
async function sendInviteEmails(
  db: Db,
  limit = 20
): Promise<{ sent: number; failed: number; errors: string[] }> {
  // Get operators with emails that haven't been emailed
  const pending = await db.query<{
    id: number;
    company_name: string;
    certificate_number: string | null;
    contact_email: string;
  }>(`
    SELECT * FROM discovered_operators
    WHERE status = 'new' AND contact_email IS NOT NULL AND contact_email != ''
    ORDER BY discovered_at ASC
    LIMIT ?
  `, [limit]);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const op of pending) {
    const { subject, html } = operatorInviteEmail(
      op.company_name,
      op.certificate_number || undefined
    );

    const result = await sendEmail({
      to: op.contact_email,
      subject,
      html,
      replyTo: 'hello@bespoke.flights',
      tags: [
        { name: 'type', value: 'operator-invite' },
        { name: 'discovery_id', value: String(op.id) },
      ],
    });

    if (result.id && !result.error) {
      await db.run(`
        UPDATE discovered_operators
        SET status = 'emailed', emailed_at = now(), updated_at = now(), invite_resend_id = ?
        WHERE id = ?
      `, [result.id, op.id]);
      sent++;
    } else {
      const errMsg = result.error || 'Unknown error';
      await db.run(`
        UPDATE discovered_operators
        SET notes = COALESCE(notes || ' | ', '') || ?
        WHERE id = ?
      `, ['Send failed: ' + errMsg, op.id]);
      errors.push(`${op.company_name}: ${errMsg}`);
      failed++;
    }

    // Rate limit: 1 email/sec for Resend free tier
    await new Promise(r => setTimeout(r, 1100));
  }

  return { sent, failed, errors };
}

/**
 * Get which states were last scraped (from the most recent discovery run).
 */
async function getLastScrapedStates(db: Db): Promise<string[]> {
  // Look at the most recently discovered operators to infer which states were last done
  const recent = await db.query<{ state: string }>(`
    SELECT state FROM discovered_operators
    WHERE source = 'faa_registry' AND state IS NOT NULL
    GROUP BY state
    ORDER BY MAX(discovered_at) DESC
    LIMIT 10
  `);

  return recent.map(r => r.state);
}

/**
 * Run the full weekly discovery pipeline.
 *
 * 1. Determine which states to scrape (rotates through all states)
 * 2. Scrape FAA Part 135 registry for those states
 * 3. Store new discoveries in the database
 * 4. Send invite emails to operators with email addresses
 */
export async function runDiscoveryPipeline(
  db: Db,
  options: {
    statesPerRun?: number;
    emailsPerRun?: number;
    forceStates?: string[];
  } = {}
): Promise<DiscoveryResult> {
  const { statesPerRun = 10, emailsPerRun = 20, forceStates } = options;
  const errors: string[] = [];

  // Step 1: Determine which states to scrape
  const stateBatch = forceStates || getNextStateBatch(
    await getLastScrapedStates(db),
    statesPerRun
  );

  console.log(`[Discovery] Scraping states: ${stateBatch.join(', ')}`);

  // Step 2: Scrape FAA registry
  let operatorsFound = 0;
  let newOperators = 0;

  try {
    const scrapeResult = await scrapeStates(stateBatch, 500, statesPerRun);
    operatorsFound = scrapeResult.operators.length;
    console.log(`[Discovery] Found ${operatorsFound} operators across ${scrapeResult.statesQueried.length} states`);

    // Step 3: Store in DB
    newOperators = await storeDiscoveries(db, scrapeResult.operators);
    console.log(`[Discovery] ${newOperators} new operators stored`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push('Scrape error: ' + msg);
    console.error('[Discovery] Scrape failed:', msg);
  }

  // Step 4: Send invite emails (to any pending operators, not just this batch)
  let emailsSent = 0;
  let emailsFailed = 0;

  try {
    const emailResult = await sendInviteEmails(db, emailsPerRun);
    emailsSent = emailResult.sent;
    emailsFailed = emailResult.failed;
    errors.push(...emailResult.errors);
    console.log(`[Discovery] Emails: ${emailsSent} sent, ${emailsFailed} failed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push('Email error: ' + msg);
    console.error('[Discovery] Email sending failed:', msg);
  }

  return {
    statesQueried: stateBatch,
    operatorsFound,
    newOperators,
    emailsSent,
    emailsFailed,
    errors,
  };
}
