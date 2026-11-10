// Screenshots, axe, overflow and focus-ring checks for the empty-leg pages.
// Run against `APP_TEST_MODE=true npx next dev -p 3100` on an empty PGlite database:
//   node scripts/visual-check-empty-legs.mjs
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }];
const THEMES = ['light', 'dark'];
const issues = [];

async function check(page, label, focus) {
  await page.waitForLoadState('networkidle');
  const ov = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    if (document.documentElement.scrollWidth > w) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll('body *')) {
      if (el.classList.contains('sr-only') || el.tagName === 'NEXTJS-PORTAL') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') out.push(`${el.tagName}.${(el.className||'').toString().slice(0,60)} right=${Math.round(r.right)}`);
    }
    return out.slice(0, 10);
  });
  ov.forEach(o => issues.push(`${label}: overflow ${o}`));
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of axe.violations) issues.push(`${label}: axe ${v.id} (${v.nodes.length}) ${v.nodes.slice(0,3).map(n => n.target.join(' ')).join(' | ')}`);
  if (focus) {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body || el.tagName === 'NEXTJS-PORTAL') return null;
        const ring = (e) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2; };
        const cell = el.closest('.field-cell');
        return { id: el.outerHTML.slice(0, 80), ok: el.matches(':focus-visible') && (ring(el) || (cell !== null && ring(cell))) };
      });
      if (!f || seen.has(f.id)) break; seen.add(f.id);
      if (!f.ok) issues.push(`${label}: no focus ring on ${f.id}`);
    }
  }
}
const shoot = (page, file) => page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });

async function login(browser, email) {
  const c = await browser.newContext();
  const res = await c.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'password123' } });
  if (!res.ok()) throw new Error(`login failed for ${email}`);
  const cookies = await c.cookies();
  await c.close();
  return cookies;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const traveler = await login(browser, 'john@example.com');
  const operator = await login(browser, 'ops@pacificwings.com');

  const pass = async (stage, path, auth, setup) => {
    for (const v of VIEWS) for (const t of THEMES) {
      const c = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: t });
      if (auth) await c.addCookies(auth);
      const p = await c.newPage();
      await p.goto(BASE + path);
      if (setup) await setup(p);
      const label = `${stage}-${v.name}-${t}`;
      await check(p, label, v.name === 'desktop');
      await shoot(p, label);
      await c.close();
    }
  };

  await pass('empty-legs-public', '/empty-legs', null);
  await pass('empty-legs-filtered', '/empty-legs?from=HNL', traveler);
  await pass('operator-empty-legs', '/operator/empty-legs', operator, async p => {
    await p.getByRole('heading', { name: 'On the market' }).waitFor();
  });
  await pass('operator-empty-legs-new', '/operator/empty-legs', operator, async p => {
    await p.getByRole('button', { name: 'List empty leg' }).first().click();
    await p.getByRole('heading', { name: 'New empty leg' }).waitFor();
  });

  // Traveler books the first listing (stub payments) and lands on the trip page with the price ready to pay.
  let tripPath = null;
  {
    const c = await browser.newContext({ viewport: VIEWS[1] }); await c.addCookies(traveler);
    const p = await c.newPage();
    await p.goto(`${BASE}/empty-legs`);
    await p.getByRole('button', { name: 'Book this flight' }).first().click();
    await p.waitForURL(/\/requests\/\d+\?submitted=empty-leg/);
    tripPath = new URL(p.url()).pathname + '?submitted=empty-leg';
    await c.close();
  }
  await pass('empty-leg-trip', tripPath, traveler);
  await browser.close();
  console.log(issues.length ? issues.join('\n') : 'NO ISSUES');
})().catch(e => { console.error(e); process.exit(1); });
