/**
 * SMS via Twilio's REST API.
 *
 * Sends when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
 * TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER are set and the app is
 * not in test mode. Otherwise messages are logged to stdout (stub mode),
 * like email without RESEND_API_KEY.
 */

import { isTestMode } from '@/lib/payments/config';
import { normalizePhone } from './phone';

export interface SmsResult {
  id: string | null;
  error: string | null;
}

/** SMS bodies over 1,600 characters are rejected by Twilio. */
const MAX_SMS = 1600;

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER));
}

export async function sendSms(params: { to: string; body: string }): Promise<SmsResult> {
  const to = normalizePhone(params.to);
  if (!to) return { id: null, error: `Invalid phone number: ${params.to}` };
  const body = params.body.length > MAX_SMS ? params.body.slice(0, MAX_SMS - 1) + '…' : params.body;

  if (isTestMode() || !smsConfigured()) {
    console.log('[SMS STUB] Would text:');
    console.log('  To:', to);
    console.log('  Body:', body);
    return { id: 'stub-sms-' + Date.now(), error: null };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', process.env.TWILIO_FROM_NUMBER!);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const data = await res.json().catch(() => ({})) as { sid?: string; message?: string };
    if (!res.ok) return { id: null, error: data.message || `HTTP ${res.status}` };
    return { id: data.sid ?? null, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}
