/**
 * Weekly operator discovery pipeline.
 *
 * Orchestrates: FAA scrape → store in DB → send invite emails.
 *
 * Designed to run within a Vercel Cron function (~60s budget).
 * Processes a batch of states per run and rotates through all states
 * across multiple weeks.
 */

import type Database from 'better-sqlite3';
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
function storeDiscoveries(db: Database.Database, operators: FAAOperator[]): number {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO discovered_operators
      (company_name, dba_name, certificate_number, phone, address, city, state, zip, status, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;

  const tx = db.transaction(() => {
    for (const op of operators) {
      // Skip operators already registered on the platform
      const existing = db.prepare(
        "SELECT id FROM operators WHERE certificate = ? OR company_name = ?"
      ).get(op.certificate_number, op.company_name);
      if (existing) continue;

      const status = op.phone ? 'new' : 'no_email'; // 'new' if we have some contact info
      const result = insert.run(
        op.company_name,
        op.dba_name,
        op.certificate_number,
        op.phone,
        op.address,
        op.city,
        op.state,
        op.zip,
        status,
        'faa_registry'
      );
      if (result.changes > 0) inserted++;
    }
  });

  tx();
  return inserted;
}

/**
 * Send invite emails to discovered operators that have email addresses
 * and haven't been emailed yet.
 *
 * @param limit - Max emails to send per run (respect Resend rate limits).
 */
async function sendInviteEmails(
  db: Database.Database,
  limit = 20
): Promise<{ sent: number; failed: number; errors: string[] }> {
  // Get operators with emails that haven't been emailed
  const pending = db.prepare(`
    SELECT * FROM discovered_operators
    WHERE status = 'new' AND contact_email IS NOT NULL AND contact_email != ''
    ORDER BY discovered_at ASC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    company_name: string;
    certificate_number: string | null;
    contact_email: string;
  }>;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const updateSent = db.prepare(`
    UPDATE discovered_operators
    SET status = 'emailed', emailed_at = datetime('now'), invite_resend_id = ?
    WHERE id = ?
  `);

  const updateFailed = db.prepare(`
    UPDATE discovered_operators
    SET notes = COALESCE(notes || ' | ', '') || ?
    WHERE id = ?
  `);

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
      updateSent.run(result.id, op.id);
      sent++;
    } else {
      const errMsg = result.error || 'Unknown error';
      updateFailed.run('Send failed: ' + errMsg, op.id);
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
function getLastScrapedStates(db: Database.Database): string[] {
  // Look at the most recently discovered operators to infer which states were last done
  const recent = db.prepare(`
    SELECT DISTINCT state FROM discovered_operators
    WHERE source = 'faa_registry'
    ORDER BY discovered_at DESC
    LIMIT 10
  `).all() as Array<{ state: string }>;

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
  db: Database.Database,
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
    getLastScrapedStates(db),
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
    newOperators = storeDiscoveries(db, scrapeResult.operators);
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
