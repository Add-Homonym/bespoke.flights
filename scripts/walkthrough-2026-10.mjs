// Walkthrough of the 2026-10-21 fixes: a traveler at 390x844 and an operator at 1280x800, test mode.
//   APP_TEST_MODE=true npx next dev -p 3100     (empty PGlite database; demo data loads itself)
//   node scripts/walkthrough-2026-10.mjs
// Every item from the fix list is checked and screenshotted into docs/screenshots/walkthrough-2026-10/,
// and docs/screenshots/walkthrough-2026-10/RESULTS.md lists what passed.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../docs/screenshots/walkthrough-2026-10');
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const results = [];
const day = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const state = {};

function check(item, ok, note = '') {
  results.push({ item, ok: !!ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${item}${note ? ' — ' + note : ''}`);
}
async function shot(page, view, item, desc) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${view}-${item}-${desc}.png`, fullPage: true });
}
const live = {};
async function step(name, fn) {
  try { await fn(); } catch (err) {
    check(name, false, String(err.message).split('\n')[0]);
    // Keep the page as it was when the step failed, for debugging (removed before commit).
    for (const [k, p] of Object.entries(live)) await p?.screenshot({ path: `${OUT}/_fail-${name.replace(/\W+/g, '-').slice(0, 40)}-${k}.png`, fullPage: true }).catch(() => {});
  }
}
async function login(browser, view, email) {
  const ctx = await browser.newContext({ viewport: view, colorScheme: 'light' });
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'password123' } });
  if (!res.ok()) throw new Error(`login ${email} failed`);
  return { ctx, page };
}
const text = async page => (await page.locator('body').innerText());
const hasNoUglyStrings = async (page, label) => {
  const t = await text(page);
  check(`${label}: no raw error text`, !/Payment is succeeded|Too small:|Score:|\bPHNL\b|\bPHOG\b|1 operators|Empty leg #/.test(t),
    (t.match(/Payment is succeeded|Too small:|Score:|\bPHNL\b|\bPHOG\b|1 operators|Empty leg #/) || [''])[0]);
};

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  // ───────────────────────── Traveler: booking form (E) and register (A2) ─────────────────────────
  const guest = await browser.newContext({ viewport: PHONE, colorScheme: 'light' });
  const g = await guest.newPage();
  live.g = g;

  await step('E4 placeholder fits', async () => {
    await g.goto(`${BASE}/book`);
    await g.waitForSelector('#ticket-1-from:not([disabled])');
    const fits = await g.evaluate(() => {
      const out = [];
      for (const id of ['ticket-1-from', 'ticket-1-to']) {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el, '::placeholder');
        const c = document.createElement('canvas').getContext('2d');
        c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        out.push({ id, text: c.measureText(el.placeholder).width, box: el.clientWidth });
      }
      return out;
    });
    check('E4 "City or code" placeholder fits at 390px', fits.every(f => f.text <= f.box), JSON.stringify(fits));
    await shot(g, 'phone', 'E4', 'placeholder-fits');
  });

  await step('E2 enter selects top match', async () => {
    await g.fill('#ticket-1-from', '');
    await g.type('#ticket-1-from', 'hnl');
    await g.keyboard.press('Enter');
    await g.waitForTimeout(150);
    const focused = await g.evaluate(() => document.activeElement?.id);
    const from = await g.inputValue('#ticket-1-from');
    check('E2 Enter selects the top match and moves to the next field', from === 'HNL' && focused === 'ticket-1-to', `from=${from} focus=${focused}`);
    await g.type('#ticket-1-to', 'ogg');
    await g.keyboard.press('Enter');
    check('E2 destination resolves to OGG', (await g.inputValue('#ticket-1-to')) === 'OGG');
    // A resolved field is replaced, not appended to.
    await g.click('#ticket-1-from');
    await g.keyboard.type('lax');
    check('E2 resolved field is replaced, not appended to', (await g.inputValue('#ticket-1-from')) === 'LAX', await g.inputValue('#ticket-1-from'));
    await g.fill('#ticket-1-from', '');
    await g.type('#ticket-1-from', 'hnl');
    await g.keyboard.press('Enter');
    await shot(g, 'phone', 'E2', 'enter-selects-top-match');
  });

  await step('E3 request quotes button + E1 draft restore', async () => {
    await g.fill('#ticket-1-date', day(20));
    check('E3 explicit Request quotes button', await g.locator('#request-quotes').isVisible());
    await g.waitForTimeout(400); // the draft cookie is written on each edit
    const html = await (await g.request.get(`${BASE}/book`)).text(); // same cookie jar
    check('E1 saved draft is in the server HTML, fields locked until hydrated', /value="HNL"/.test(html) && /<fieldset[^>]*disabled/.test(html));
    await g.reload();
    const v = await g.inputValue('#ticket-1-from'); // fill waits for enabled
    await g.click('#ticket-1-from');
    await g.keyboard.type('o');
    const after = await g.inputValue('#ticket-1-from');
    check('E1 typing after restore never merges with the saved draft', v === 'HNL' && after === 'O', `restored=${v} typed=${after}`);
    await g.fill('#ticket-1-from', '');
    await g.type('#ticket-1-from', 'hnl');
    await g.keyboard.press('Enter');
    await shot(g, 'phone', 'E1', 'draft-restored');
  });

  // Register with a short phone: plain-language field error (A2).
  await step('A2 register errors', async () => {
    await guest.clearCookies(); // no saved draft: this register goes to the dashboard
    await g.goto(`${BASE}/register`);
    await g.getByLabel('Full name').fill('Walker Traveler');
    await g.getByLabel('Email').fill(`walker${Date.now()}@example.com`);
    await g.getByLabel('Phone number').fill('123');
    await g.getByLabel('Password').fill('password123');
    await g.getByRole('button', { name: 'Create account' }).click();
    await g.waitForSelector('text=/Enter at least 7 characters/');
    const t = await text(g);
    check('A2 register: message under the phone field in plain language', /Enter at least 7 characters/.test(t) && !/Too small/.test(t), t.slice(0, 200).replace(/\n/g, ' '));
    check('A2 register: summary line', /Fix 1 field: Phone number/.test(t));
    await shot(g, 'phone', 'A2', 'register-field-errors');
    await g.getByLabel('Phone number').fill('808-555-0100');
    await g.getByRole('button', { name: 'Create account' }).click();
    await g.waitForURL(/\/dashboard/);
  });

  // G2 sign-up links
  await step('G2 operator sign-up links', async () => {
    const out = await browser.newContext({ viewport: PHONE });
    const p = await out.newPage();
    await p.goto(`${BASE}/login`);
    const onLogin = await p.locator('a[href="/register?role=operator"]').count();
    await p.goto(`${BASE}/book`);
    const onSite = await p.locator('a[href="/register?role=operator"]').count();
    check('G2 operator sign-up link in header, footer and /login', onLogin >= 1 && onSite >= 2, `login ${onLogin}, header+footer ${onSite}`);
    await p.goto(`${BASE}/login`);
    await shot(p, 'phone', 'G2', 'login-operator-signup');
    await out.close();
  });

  // ───────────────────────── Traveler: request HNL→OGG with Pets and Surfboards ─────────────────────────
  await step('traveler request', async () => {
    await g.goto(`${BASE}/book`);
    await g.waitForSelector('#ticket-1-from:not([disabled])');
    await g.fill('#ticket-1-from', '');
    await g.type('#ticket-1-from', 'hnl'); await g.keyboard.press('Enter');
    await g.type('#ticket-1-to', 'ogg'); await g.keyboard.press('Enter');
    await g.fill('#ticket-1-date', day(20));
    await g.fill('#ticket-1-time', '09:30');
    await g.click('#requests-open');
    await g.getByRole('button', { name: 'Pets' }).click();
    await g.getByRole('button', { name: 'Surfboards' }).click();
    await g.getByRole('button', { name: 'Done' }).click();
    await g.getByRole('button', { name: 'Wait' }).click().catch(() => {});
    await g.locator('#request-quotes').click();
    await g.waitForURL(/\/requests\/\d+\?submitted=1/);
    state.requestId = Number(g.url().match(/requests\/(\d+)/)[1]);
    const t = await text(g);
    check('F1 request page reads HNL → OGG, not ICAO', /HNL/.test(t) && /OGG/.test(t) && !/PHNL|PHOG/.test(t));
    check('F4 aircraft says To be assigned only when no quote names one', /To be assigned/.test(t));
    await shot(g, 'phone', 'F1', 'request-iata');
    await hasNoUglyStrings(g, 'request page');
  });

  // F2: outreach list hides internals
  await step('F2 outreach', async () => {
    await g.reload();
    await g.waitForTimeout(800);
    const t = await text(g);
    check('F2 no score, no "via", correct plural', !/Score:|\bvia\b|\b1 operators\b/.test(t), (t.match(/Score:.*|\bvia\b.*|1 operators/) || [''])[0]);
    await shot(g, 'phone', 'F2', 'outreach-hidden-internals');
  });

  // ───────────────────────── Operator (1280x800) ─────────────────────────
  const op = await login(browser, DESK, 'ops@pacificwings.com');
  const o = op.page;
  live.o = o;

  await step('G1 pending operator dashboard + G3', async () => {
    const pend = await login(browser, DESK, 'ops@westsidejets.com');
    await pend.page.goto(`${BASE}/operator/dashboard`);
    const t = await text(pend.page);
    check('G1 checklist with done/missing and what approval waits on', /Get ready for approval/.test(t) && /Missing|Done/.test(t) && /Staff approve operators by hand/.test(t));
    check('G1 routing profile explained', /Routing profile/.test(t) ? (/Incomplete/.test(t) ? /Requests are routed to you by market/.test(t) : true) : false);
    await shot(pend.page, 'desktop', 'G1', 'pending-operator-checklist');
    await pend.page.goto(`${BASE}/operator/requests/${state.requestId}`);
    const d = await text(pend.page);
    check('G3 pending operator sees route/date/pax, not notes', /HNL/.test(d) && !/Pets|Surfboards/.test(d) && /Shown once your account is approved/.test(d));
    await shot(pend.page, 'desktop', 'G3', 'pending-operator-no-notes');
    const api = await pend.page.request.get(`${BASE}/api/booking-requests/${state.requestId}`);
    const body = await api.json();
    check('G3 API matches the UI', api.ok() && !('notes' in body) && !JSON.stringify(body).match(/Pets|Surfboards/));
    await pend.ctx.close();
  });

  await step('H1/H2 operator dashboard targets', async () => {
    await o.goto(`${BASE}/operator/dashboard`);
    await shot(o, 'desktop', 'H1', 'operator-dashboard');
  });

  // Quote form: defaults and bounds (D), errors (A2), confirmation (A4)
  await step('D/A quote form', async () => {
    await o.goto(`${BASE}/operator/requests/${state.requestId}`);
    const form = `#quote-form-${state.requestId}`;
    await o.waitForSelector(form);
    const valid = o.locator(`#quote-${state.requestId}-valid`);
    const val = await valid.inputValue();
    check('D1 valid-until defaults to 72 hours out', val === day(3), val);
    const [min, max] = [await valid.getAttribute('min'), await valid.getAttribute('max')];
    check('D1 min is today and max is the departure date', min === day(0) && max === day(20), `${min}..${max}`);
    // Bypass the browser's own check to see the server's field error.
    await o.evaluate(id => { const el = document.getElementById(id); el.removeAttribute('min'); el.removeAttribute('max'); el.form.noValidate = true; document.getElementById(id.replace('valid', 'price')).removeAttribute('min'); document.getElementById(id.replace('valid', 'price')).removeAttribute('step'); }, `quote-${state.requestId}-valid`);
    await o.fill(`#quote-${state.requestId}-price`, '24000');
    await o.fill(`#quote-${state.requestId}-valid`, day(-1));
    await o.getByRole('button', { name: /Submit quote/ }).click();
    await o.waitForSelector('text=/Valid-until date is in the past/');
    const t = await text(o);
    check('A2/D1 past valid-until shows a field error under the field', /Valid-until date is in the past/.test(t) && /Fix 1 field: Valid until/.test(t));
    await shot(o, 'desktop', 'D1', 'valid-until-past-error');
    await o.fill(`#quote-${state.requestId}-valid`, day(21));
    await o.getByRole('button', { name: /Submit quote/ }).click();
    await o.waitForSelector('text=/cannot be after the departure date/');
    check('D1 valid-until after departure is rejected', true);
    await o.fill(`#quote-${state.requestId}-price`, '50');
    await o.getByRole('button', { name: /Submit quote/ }).click();
    await o.waitForSelector('text=/at least \\$100/');
    check('D2 price below the minimum is rejected in plain language', true);
    await shot(o, 'desktop', 'D2', 'price-error');
    await o.fill(`#quote-${state.requestId}-price`, '24000.505');
    await o.getByRole('button', { name: /Submit quote/ }).click();
    await o.waitForSelector('text=/fractions of a cent/');
    check('D2 fractions of a cent are rejected', true);
    await o.reload();
    await o.fill(`#quote-${state.requestId}-price`, '24000');
    await o.locator(`#quote-${state.requestId}-aircraft`).selectOption({ index: 1 }).catch(() => {});
    await o.getByRole('button', { name: /Submit quote/ }).click();
    await o.waitForSelector('text=/Quote submitted/');
    const c = await text(o);
    check('A4 on-screen confirmation after submit', /Quote submitted: \$24,000\.00/.test(c));
    check('A4 quote card shows aircraft (type · tail) and valid-until', /· N\w+/.test(c) && /Valid until/.test(c));
    await shot(o, 'desktop', 'A4', 'quote-submitted-confirmation');
  });

  // Revise: server errors surface (A2, D2)
  await step('revise', async () => {
    await o.getByRole('button', { name: 'Revise quote' }).click();
    await o.evaluate(() => { document.querySelectorAll('input[type=number]').forEach(i => { i.removeAttribute('min'); i.removeAttribute('step'); }); });
    await o.getByLabel('All-in price (USD)').fill('99');
    await o.getByRole('button', { name: 'Save revision' }).click();
    await o.waitForSelector('text=/at least \\$100/');
    check('D2/A2 revise price error shown in the UI', true);
    await o.getByLabel('All-in price (USD)').fill('23500');
    await o.evaluate(() => { const el = [...document.querySelectorAll('input[type=date]')].pop(); el.removeAttribute('min'); el.removeAttribute('max'); });
    await o.getByLabel('Valid until').fill(day(-3));
    await o.getByRole('button', { name: 'Save revision' }).click();
    await o.waitForSelector('text=/Valid-until date is in the past/');
    check('D1/A2 revise valid-until error shown in the UI', true);
    await shot(o, 'desktop', 'D1', 'revise-valid-until-error');
    await o.getByLabel('Valid until').fill(day(5));
    await o.getByRole('button', { name: 'Save revision' }).click();
    await o.waitForSelector('text=/Quote revised/');
    check('revise succeeds inside the window', true);
  });

  // Settings (A3, H)
  await step('settings', async () => {
    await o.goto(`${BASE}/operator/settings`);
    await o.waitForSelector('text=Charter Sales Email');
    const email = o.getByLabel('Charter Sales Email');
    const saved = await email.inputValue();
    await email.fill('not-an-email');
    await email.blur();
    await o.waitForSelector('text=/Enter a valid email address/');
    const after = await email.inputValue();
    check('A3 rejected auto-save reverts the field and shows the error beside it', after === saved && /Enter a valid email address/.test(await text(o)), `${saved} → ${after}`);
    await shot(o, 'desktop', 'A3', 'settings-rejected-reverts');
    await email.fill('sales@pacificwings.com');
    await email.blur();
    const savedMsg = o.locator('#' + (await email.getAttribute('id'))).locator('xpath=ancestor::div[2]').locator('text=Saved');
    await savedMsg.waitFor({ timeout: 5000 });
    check('A3 Saved shows next to the field that saved', true);
    await shot(o, 'desktop', 'A3', 'settings-saved-next-to-field');
    const pct = o.getByLabel('Partial refund (%)');
    await pct.fill('12.5'); await pct.blur();
    await o.waitForSelector('text=/whole percentage from 0 to 100/');
    check('H3 12.5% refund percentage rejected', true);
    await shot(o, 'desktop', 'H3', 'refund-percent-integer');
    check('H2 safety rating select is labelled', (await o.getByLabel('Highest safety rating').count()) === 1);
  });

  // Empty legs (C)
  await step('empty legs', async () => {
    await o.goto(`${BASE}/operator/empty-legs`);
    await o.waitForLoadState('networkidle');
    await o.getByRole('button', { name: 'List empty leg' }).first().click();
    const form = o.getByRole('form', { name: 'New empty leg' });
    await form.locator('#el-origin').fill('HNL'); await o.keyboard.press('Enter');
    await form.locator('#el-dest').fill('OGG'); await o.keyboard.press('Enter');
    await form.getByLabel('Departure date').fill(day(9));
    const seatsInput = form.getByLabel(/^Seats/);
    const max = await seatsInput.getAttribute('max');
    check('C1 seats max comes from the aircraft', Number(max) > 0 && Number(max) < 100, `max=${max}`);
    await o.evaluate(() => { for (const el of document.querySelectorAll('input[type=number]')) el.removeAttribute('max'); document.querySelectorAll('input[type=date]').forEach(d => d.removeAttribute('min')); document.querySelector('form[aria-label="New empty leg"]').noValidate = true; });
    await seatsInput.fill(String(Number(max) + 3));
    await form.getByLabel('All-in price (USD)').fill('4500');
    await form.getByRole('button', { name: 'List empty leg' }).click();
    await o.waitForSelector('text=/This .* seats \\d+/');
    check('C1 seats above capacity rejected in the form', true);
    await shot(o, 'desktop', 'C1', 'seats-over-capacity');
    await seatsInput.fill(max);
    await form.getByLabel('Departure date').fill('2020-01-01');
    await form.getByRole('button', { name: 'List empty leg' }).click();
    await o.waitForSelector('text=/Departure date is in the past/');
    check('C1 past date rejected', true);
    await form.getByLabel('Departure date').fill(day(9));
    await form.getByLabel('Note to travelers (optional)').fill('Catering included');
    await form.getByRole('button', { name: 'List empty leg' }).click();
    await o.waitForSelector('text=On the market');
    check('C1 valid listing accepted', true);
    // C2 edit
    await o.getByRole('button', { name: 'Edit listing' }).first().click();
    const edit = o.getByRole('form', { name: 'Edit listing' });
    await edit.getByLabel(/^Seats/).fill('3');
    await edit.getByLabel('Departure date').fill(day(10));
    await edit.getByLabel('Note to travelers (optional)').fill('Catering and Wi-Fi included');
    await edit.getByLabel('All-in price (USD)').fill('4200');
    await shot(o, 'desktop', 'C2', 'edit-listing-form');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await o.waitForSelector('text=/Catering and Wi-Fi included/');
    check('C2 operator can edit seats, date, notes and price on an unbooked listing', /\$4,200/.test(await text(o)) && /3/.test(await text(o)));
    await shot(o, 'desktop', 'C2', 'listing-edited');
  });

  // Traveler books the empty leg (C3, C4)
  await step('book empty leg', async () => {
    await g.goto(`${BASE}/empty-legs`);
    check('F6 filter placeholders are From / To', (await g.locator('input[placeholder="From"]').count()) === 1 && (await g.locator('input[placeholder="To"]').count()) === 1);
    await shot(g, 'phone', 'F6', 'empty-leg-filter');
    await g.locator('input[placeholder="Special requests (optional)"]').first().fill('Window seats, one small dog');
    await g.getByRole('button', { name: 'Book this flight' }).first().click();
    await g.waitForURL(/\/requests\/\d+\?submitted=empty-leg/);
    state.emptyLegRequest = Number(g.url().match(/requests\/(\d+)/)[1]);
    const t = await text(g);
    check('C3 no "Confirmed:" banner before payment', !/Confirmed:/.test(t));
    check('C3 status reads Awaiting payment', /awaiting payment/i.test(t));
    check('C3 aircraft filled from the listing', !/To be assigned/.test(t) && /Aircraft/.test(t));
    check('C4 no "Empty leg #N" special request; traveler notes carried', !/Empty leg #/.test(t) && /Window seats, one small dog/.test(t));
    await shot(g, 'phone', 'C3', 'empty-leg-awaiting-payment');
    await o.goto(`${BASE}/operator/requests/${state.emptyLegRequest}`);
    check('C4 operator view carries the traveler notes', /Window seats, one small dog/.test(await text(o)) && !/Empty leg #/.test(await text(o)));
    await shot(o, 'desktop', 'C4', 'operator-sees-notes');
  });

  // ───────────────────────── Traveler: quote card, checkout, pay ─────────────────────────
  await step('book quote', async () => {
    await g.goto(`${BASE}/requests/${state.requestId}`);
    const t = await text(g);
    check('A4 traveler quote shows aircraft and valid-until', /Valid until/.test(t));
    check('F3 cancellation policy on the quote card', /Cancellation: Full refund/.test(t));
    check('F4 aircraft shows the quoted aircraft, not To be assigned', !/To be assigned/.test(t));
    await shot(g, 'phone', 'F3', 'quote-card-cancellation-policy');
    await g.getByRole('button', { name: 'Book this jet' }).first().click();
    await g.waitForURL(/checkout=stub/);
    const c = await text(g);
    check('F3 cancellation policy shown before payment', /cancellation policy: Full refund/i.test(c));
    await shot(g, 'phone', 'F3', 'checkout-cancellation-policy');
    const pid = Number((await g.evaluate(() => location.search)).match(/payment=(\d+)/)?.[1] ?? 0);
    // Slow the simulated payment so the in-flight state can be seen.
    await g.route('**/api/payments/*/simulate', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
    await g.getByRole('button', { name: /^Pay \$/ }).click();
    const busy = g.getByRole('button', { name: 'Paying…' });
    await busy.waitFor();
    check('A1 Pay is disabled and reads "Paying…" while the call runs', await busy.isDisabled());
    await shot(g, 'phone', 'A1', 'paying-disabled');
    await g.getByText('Paid', { exact: true }).first().waitFor();
    check('A1 success state shows without a reload', /Paid/.test(await text(g)));
    await shot(g, 'phone', 'A1', 'paid-without-reload');
    await g.unroute('**/api/payments/*/simulate');
    const again = pid ? await g.request.post(`${BASE}/api/payments/${pid}/simulate`) : null;
    check('A1 repeat call on a succeeded payment returns 200', again?.status() === 200, String(again?.status()));
    await g.goto(`${BASE}/requests/${state.requestId}`);
    await hasNoUglyStrings(g, 'booked request');
  });

  // Message, change (traveler), handle change (operator)
  await step('message + change', async () => {
    await g.getByRole('button', { name: /Message operator/ }).click().catch(() => {});
    await g.locator('textarea[id^=draft-]').first().fill('Can we add a surfboard rack?');
    await g.getByRole('button', { name: 'Send message' }).click();
    await g.waitForSelector('text=/Can we add a surfboard rack/');
    await shot(g, 'phone', 'B4', 'message-before-cancel');
    // First change: accepted by the operator.
    await g.getByRole('button', { name: 'Request a change' }).click();
    const from = g.locator('#change-origin-0, input[role=combobox]').first();
    await from.focus();
    const ring = await g.evaluate(() => {
      const el = document.activeElement; const ring = e => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2; };
      return ring(el) || (el.closest('.field-cell') ? ring(el.closest('.field-cell')) : false);
    });
    check('H2 change-form From input shows a focus outline', ring);
    await shot(g, 'phone', 'H2', 'change-form-focus');
    const t = await text(g);
    check('F1 change form reads IATA codes', !/PHNL|PHOG/.test(t));
    // A2: blank date, server error.
    await g.evaluate(() => document.querySelectorAll('input[required]').forEach(i => i.removeAttribute('required')));
    await g.locator('input[type=date]').first().fill('');
    await g.getByRole('button', { name: 'Send change request' }).click();
    await g.waitForSelector('text=/Enter a date/');
    check('A2 change request errors are field-level and plain', /Enter a date/.test(await text(g)) && !/Too small|Invalid/.test(await text(g)));
    await shot(g, 'phone', 'A2', 'change-request-errors');
    await g.locator('input[type=date]').first().fill(day(21));
    await g.getByRole('button', { name: 'Send change request' }).click();
    await g.waitForSelector('text=/Change request sent/');
  });

  await step('operator handles change', async () => {
    await o.goto(`${BASE}/operator/requests/${state.requestId}`);
    await o.getByRole('button', { name: 'Accept change' }).click();
    await o.waitForSelector('text=/Change accepted/');
    check('operator accepts the change', true);
    await shot(o, 'desktop', 'B3', 'operator-change-accepted');
    // The operator replies in the thread.
    await o.locator('textarea[id^=draft-]').first().fill('Yes, a rack is included.');
    await o.getByRole('button', { name: 'Send message' }).click();
    await o.waitForSelector('text=/a rack is included/');
  });

  await step('receipt', async () => {
    await g.goto(`${BASE}/requests/${state.requestId}/receipt`);
    const t = await text(g);
    check('F5 receipt button says Print receipt', (await g.getByRole('button', { name: 'Print receipt' }).count()) === 1 && !/Print trip sheet/.test(t));
    check('F1 receipt shows IATA codes', /HNL/.test(t) && !/PHNL|PHOG/.test(t));
    await shot(g, 'phone', 'F5', 'receipt');
    await hasNoUglyStrings(g, 'receipt');
  });

  // Second change request left pending, then cancel (B)
  await step('cancel', async () => {
    await g.goto(`${BASE}/requests/${state.requestId}`);
    await g.getByRole('button', { name: 'Request a change' }).click();
    await g.locator('input[type=date]').first().fill(day(22));
    await g.getByRole('button', { name: 'Send change request' }).click();
    await g.waitForSelector('text=/Change request sent/');
    await g.getByRole('button', { name: 'Cancel trip' }).click();
    await shot(g, 'phone', 'B1', 'cancel-confirmation-panel');
    await g.getByRole('button', { name: 'Confirm cancellation' }).click();
    await g.waitForSelector('text=/Trip cancelled\\. Refund of/');
    const t = await text(g);
    check('B1 banner: refund amount, destination, tier and time', /Trip cancelled\. Refund of \$[\d,.]+ to (card ending \d{4}|the original payment method)\./.test(t) && /Full refund/.test(t) && /UTC/.test(t));
    await shot(g, 'phone', 'B1', 'cancel-banner');
    await g.reload();
    await g.waitForSelector('text=/read-only/');
    const r = await text(g);
    check('B1 banner persists after reload', /Trip cancelled\. Refund of/.test(r));
    check('B2 quote shows Cancelled, never Accepted', /Cancelled/.test(r) && !/\bAccepted\b/.test(r));
    check('B3 pending change request closed with the reason', /Change request closed because the trip was cancelled/.test(r));
    check('B4 message thread is read-only', /read-only/.test(r) && (await g.locator('textarea[id^=draft-]').count()) === 0);
    await shot(g, 'phone', 'B2', 'cancelled-quote-status');
    await shot(g, 'phone', 'B4', 'thread-read-only');
    await hasNoUglyStrings(g, 'cancelled request');
    state.cancelled = true;
  });

  await step('operator sees cancellation', async () => {
    await o.goto(`${BASE}/operator/requests/${state.requestId}`);
    await o.waitForSelector('text=/read-only/');
    const t = await text(o);
    check('B5 operator cancellation summary: refund, tier, payout adjustment', /Trip cancelled/.test(t) && /Refunded to traveler/.test(t) && /Policy tier applied/.test(t) && /Payout adjustment/.test(t));
    check('B3 operator sees the closed change request', /Change request closed because the trip was cancelled/.test(t));
    check('B4 operator thread read-only', /read-only/.test(t));
    await shot(o, 'desktop', 'B5', 'operator-cancellation-summary');
    await o.goto(`${BASE}/operator/quotes`);
    const rowText = await o.locator(`a[href="/operator/requests/${state.requestId}"]`).first().innerText();
    check('B2 My quotes shows one status per cancelled quote', /cancelled/i.test(rowText) && !/\baccepted\b|\bpaid\b/i.test(rowText), rowText.replace(/\n/g, ' | '));
    await shot(o, 'desktop', 'B2', 'my-quotes-one-status');
    await o.goto(`${BASE}/operator/dashboard`);
    const d = await text(o);
    check('B6 dashboard accepted/total exclude the cancelled booking', /Quotes accepted\s*\n?\s*0|Quotes accepted[\s\S]{0,20}0/.test(d));
    await shot(o, 'desktop', 'B6', 'dashboard-excludes-cancelled');
  });

  await step('H1 target sizes', async () => {
    const small = async page => {
      const bad = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')) {
          if (el.closest('nextjs-portal') || el.classList.contains('sr-only')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          // Text links inside running copy are exempt (WCAG inline exception).
          const inline = el.tagName === 'A' && cs.display === 'inline';
          if (inline) continue;
          const textLink = el.tagName === 'A' && r.height >= 43.5; // a text link only needs the height
          if (!textLink && (r.height < 43.5 || r.width < 43.5)) {
            // A control is still reachable at 44px when its label is 44px tall.
            const lab = el.labels?.[0]?.getBoundingClientRect();
            if (lab && lab.height >= 43.5) continue;
            out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out;
      });
      return bad;
    };
    for (const [page, label, url] of [[o, 'operator dashboard', '/operator/dashboard'], [o, 'operator settings', '/operator/settings'], [o, 'operator autopilot', '/operator/autopilot'], [o, 'operator requests', '/operator/requests'], [o, 'operator empty legs', '/operator/empty-legs']]) {
      await page.goto(BASE + url);
      await page.waitForTimeout(500);
      const bad = await small(page);
      check(`H1 touch targets ≥44px on ${label}`, bad.length === 0, bad.slice(0, 6).join('; '));
    }
    await o.goto(`${BASE}/operator/autopilot`);
    await shot(o, 'desktop', 'H1', 'autopilot');
    await o.goto(`${BASE}/operator/settings`);
    await shot(o, 'desktop', 'H1', 'settings-checkboxes');
  });

  // axe on the pages named in the brief, light and dark.
  await step('axe', async () => {
    await g.goto(`${BASE}/requests/${state.emptyLegRequest}`);
    await g.getByRole('button', { name: 'Book this jet' }).first().click();
    await g.waitForURL(/checkout=stub/);
    state.checkoutUrl = g.url().replace(BASE, '');
    await o.goto(`${BASE}/operator/requests`);
    const open = await o.locator('a[href^="/operator/requests/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
    for (const h of open) { await o.goto(BASE + h); if (await o.locator('form[id^=quote-form-]').count()) { state.quoteForm = h; break; } }
    const pages = [
      [g, 'book', '/book'], [g, 'request-page', `/requests/${state.requestId}`], [g, 'checkout', state.checkoutUrl],
      [g, 'receipt', `/requests/${state.requestId}/receipt`],
      [o, 'operator-dashboard', '/operator/dashboard'], [o, 'quote-form', state.quoteForm || '/operator/requests'],
      [o, 'operator-empty-legs', '/operator/empty-legs'], [o, 'operator-settings', '/operator/settings'],
    ];
    for (const scheme of ['light', 'dark']) for (const [page, name, url] of pages) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(BASE + url); await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      check(`axe ${name} (${scheme}): zero violations`, r.violations.length === 0, r.violations.map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`).join('; '));
    }
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  const md = ['# Walkthrough results (2026-10)', '', `${results.length - failed.length}/${results.length} checks passed.`, '',
    '| Result | Item | Note |', '| --- | --- | --- |',
    ...results.map(r => `| ${r.ok ? 'pass' : '**FAIL**'} | ${r.item} | ${r.note.replace(/\|/g, '/')} |`), ''].join('\n');
  fs.writeFileSync(`${OUT}/RESULTS.md`, md);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
