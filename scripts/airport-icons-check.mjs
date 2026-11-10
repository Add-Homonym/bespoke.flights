// Screenshots, axe, overflow, image-load and focus-ring checks for the airport icon surfaces:
// /book (HNL -> OGG resolved), /requests (trips list), /operator/inbound (RFQ list).
// Run against `APP_TEST_MODE=true PGLITE_DIR=<fresh dir> npx next dev -p 3100`:
//   node scripts/airport-icons-check.mjs
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../docs/screenshots/airport-icons');
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }];
const THEMES = ['light', 'dark'];
const issues = [];

async function login(browser, email) {
  const c = await browser.newContext();
  const r = await c.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'password123' } });
  if (!r.ok()) throw new Error(`login failed for ${email}`);
  return c.cookies();
}

async function check(page, label) {
  await page.waitForLoadState('networkidle');
  const ov = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    if (document.documentElement.scrollWidth > w) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 60)} right=${Math.round(r.right)}`);
      const cs = getComputedStyle(el);
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim()) out.push(`clipped: ${el.textContent.trim().slice(0, 40)}`);
    }
    return out.slice(0, 10);
  });
  ov.forEach(o => issues.push(`${label}: overflow ${o}`));
  const imgs = await page.evaluate(() => [...document.images].filter(i => i.src.includes('/airports/')).map(i => ({ src: i.src, ok: i.complete && i.naturalWidth > 0, alt: i.getAttribute('alt'), w: i.getBoundingClientRect().width })));
  imgs.forEach(i => { if (!i.ok) issues.push(`${label}: icon failed to load ${i.src}`); if (i.alt !== '') issues.push(`${label}: icon alt not empty ${i.src}`); if (i.w < 24) issues.push(`${label}: icon below 24px (${i.w}) ${i.src}`); });
  if (imgs.length === 0) issues.push(`${label}: no airport icons rendered`);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of axe.violations) issues.push(`${label}: axe ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body || el.tagName === 'NEXTJS-PORTAL') return null;
      const cs = getComputedStyle(el);
      return { id: el.outerHTML.slice(0, 80), ok: el.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
    });
    if (!f || seen.has(f.id)) break; seen.add(f.id);
    if (!f.ok) issues.push(`${label}: no focus ring on ${f.id}`);
  }
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const traveler = await login(browser, 'john@example.com');
  const operator = await login(browser, 'ops@eliteair.com');
  const pages = [
    { stage: 'book', path: '/book', auth: traveler, setup: async p => {
      for (const [label, q] of [['From', 'honolulu'], ['To', 'kahului']]) {
        await p.getByLabel(label).first().fill(q);
        await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
      }
      await p.getByLabel('Special requests').fill('Pets, surfboards');
    } },
    { stage: 'book-autocomplete', path: '/book', auth: traveler, setup: async p => { await p.getByLabel('From').first().fill('honolulu'); }, noFocus: true },
    { stage: 'trips', path: '/requests', auth: traveler },
    { stage: 'rfq', path: '/operator/inbound', auth: operator },
  ];
  for (const pg of pages) for (const v of VIEWS) for (const t of THEMES) {
    const c = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: t });
    await c.addCookies(pg.auth);
    const p = await c.newPage();
    await p.goto(BASE + pg.path);
    await p.waitForLoadState('networkidle');
    if (pg.setup) await pg.setup(p);
    const label = `${pg.stage}-${v.name}-${t}`;
    await p.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
    if (!pg.noFocus) await check(p, label);
    await c.close();
  }
  await browser.close();
  console.log(issues.length ? issues.join('\n') : 'NO ISSUES');
})().catch(e => { console.error(e); process.exit(1); });
