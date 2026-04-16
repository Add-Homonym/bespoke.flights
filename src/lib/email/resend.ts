/**
 * Resend email client.
 *
 * If RESEND_API_KEY is not set, emails are logged to stdout instead of sent.
 * This allows local development without a Resend account.
 */

interface SendParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface SendResult {
  id: string | null;
  error: string | null;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(params: SendParams): Promise<SendResult> {
  const from = params.from || process.env.EMAIL_FROM || 'Bespoke Flights <hello@bespoke.flights>';
  const apiKey = process.env.RESEND_API_KEY;

  // Stub mode: log to console when no API key is configured
  if (!apiKey) {
    console.log('[EMAIL STUB] Would send:');
    console.log('  From:', from);
    console.log('  To:', Array.isArray(params.to) ? params.to.join(', ') : params.to);
    console.log('  Subject:', params.subject);
    console.log('  Body length:', params.html.length, 'chars');
    return { id: 'stub-' + Date.now(), error: null };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        reply_to: params.replyTo,
        tags: params.tags,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.message || data?.error || 'HTTP ' + res.status;
      console.error('Resend API error:', errMsg);
      return { id: null, error: errMsg };
    }

    return { id: data.id, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Resend request failed:', message);
    return { id: null, error: message };
  }
}

/**
 * Send multiple emails with basic rate limiting.
 * Resend free tier: 100 emails/day, 1 email/second.
 */
export async function sendBatch(
  emails: SendParams[],
  delayMs = 1100
): Promise<SendResult[]> {
  const results: SendResult[] = [];

  for (let i = 0; i < emails.length; i++) {
    const result = await sendEmail(emails[i]);
    results.push(result);

    if (i < emails.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}
