// Screenshots, axe, overflow and focus-ring checks for the traveler flows.
// Run against `APP_TEST_MODE=true npx next dev -p 3100` on an empty PGlite database:
//   node scripts/visual-check.mjs
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

async function ctx(browser, v, theme, auth) {
  const c = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: theme });
  if (auth) await c.addCookies(auth);
  return c;
}
async function check(page, label, focus) {
  await page.waitForLoadState('networkidle');
  const ov = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    if (document.documentElement.scrollWidth > w) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') out.push(`${el.tagName}.${(el.className||'').toString().slice(0,60)} right=${Math.round(r.right)}`);
      const cs = getComputedStyle(el);
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim()) out.push(`clipped: ${el.textContent.trim().slice(0,40)}`);
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
        const el = document.activeElement; if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return { id: el.outerHTML.slice(0, 80), ok: el.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
      });
      if (!f || seen.has(f.id)) break; seen.add(f.id);
      if (!f.ok) issues.push(`${label}: no focus ring on ${f.id}`);
    }
  }
}
async function shoot(page, file) { await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true }); }

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  // log in once as the demo traveler
  const lc = await browser.newContext();
  const lp = await lc.newPage();
  const res = await lp.request.post(`${BASE}/api/auth/login`, { data: { email: 'john@example.com', password: 'password123' } });
  if (!res.ok()) throw new Error('login failed');
  const auth = await lc.cookies();
  await lp.goto(`${BASE}/requests`);
  const hrefs = await lp.$$eval('a[href^="/requests/"]', as => as.map(a => a.getAttribute('href')));
  let quoted = null;
  for (const h of hrefs) { await lp.goto(BASE + h); if (await lp.getByRole('button', { name: 'Book this jet' }).count() > 0) { quoted = h; break; } }
  if (!quoted) throw new Error('no quotable request');

  const pass = async (stage, path, setup) => {
    for (const v of VIEWS) for (const t of THEMES) {
      const c = await ctx(browser, v, t, stage === 'home' ? null : auth);
      const p = await c.newPage();
      await p.goto(BASE + path);
      if (setup) await setup(p);
      const label = `${stage}-${v.name}-${t}`;
      await check(p, label, v.name === 'desktop');
      await shoot(p, label);
      await c.close();
    }
  };
  await pass('home', '/', async p => {
    // type into the origin field so the airport list and resolved line are exercised
    await p.getByLabel('From').first().fill('honolulu');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  });
  await pass('quotes', quoted);
  // book the first quote -> checkout state (stub)
  {
    const c = await ctx(browser, VIEWS[1], 'light', auth); const p = await c.newPage();
    await p.goto(BASE + quoted);
    await p.getByRole('button', { name: 'Book this jet' }).first().click();
    await p.waitForURL(/checkout=stub/); await c.close();
  }
  await pass('checkout', quoted);
  {
    const c = await ctx(browser, VIEWS[1], 'light', auth); const p = await c.newPage();
    await p.goto(BASE + quoted);
    await p.getByRole('button', { name: /^Pay \$/ }).click();
    await p.getByRole('heading', { name: 'Booking confirmed' }).waitFor({ timeout: 15000 });
    await c.close();
  }
  await pass('confirmation', quoted);
  await browser.close();
  
  console.log(issues.length ? issues.join('\n') : 'NO ISSUES');
})().catch(e => { console.error(e); process.exit(1); });
