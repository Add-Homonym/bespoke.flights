import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePhone } from './phone';
import { sendSms } from './sms';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('normalizePhone', () => {
  it('accepts common formats', () => {
    expect(normalizePhone('+1 (808) 555-0100')).toBe('+18085550100');
    expect(normalizePhone('808-555-0100')).toBe('+18085550100');
    expect(normalizePhone('1 808 555 0100')).toBe('+18085550100');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('rejects non-numbers', () => {
    expect(normalizePhone('555-0100')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('sendSms', () => {
  const twilio = () => {
    vi.stubEnv('APP_TEST_MODE', '');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', 'MG456');
  };

  it('posts to Twilio with basic auth and the messaging service', async () => {
    twilio();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendSms({ to: '808-555-0100', body: 'hi' })).toEqual({ id: 'SM1', error: null });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + Buffer.from('AC123:secret').toString('base64'));
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(form)).toEqual({ To: '+18085550100', Body: 'hi', MessagingServiceSid: 'MG456' });
  });

  it('reports Twilio errors', async () => {
    twilio();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Invalid To' }), { status: 400 })));
    expect(await sendSms({ to: '+18085550100', body: 'hi' })).toEqual({ id: null, error: 'Invalid To' });
  });

  it('only logs in test mode, even with Twilio configured', async () => {
    twilio();
    vi.stubEnv('APP_TEST_MODE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await sendSms({ to: '+18085550100', body: 'hi' });
    expect(r.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid numbers without calling Twilio', async () => {
    twilio();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await sendSms({ to: '12', body: 'hi' })).error).toMatch(/Invalid phone/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
