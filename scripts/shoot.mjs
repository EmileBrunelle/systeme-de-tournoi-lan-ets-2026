import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 });

// 1) ce que voit l'utilisateur (viewport plein écran)
await page.screenshot({ path: '/tmp/home_view.png', fullPage: false });
// 2) page entière
await page.screenshot({ path: '/tmp/home_full.png', fullPage: true });

// largeur réelle des conteneurs clés
const dims = await page.evaluate(() => {
  const pick = (el) => el && { w: Math.round(el.getBoundingClientRect().width), tag: el.tagName, cls: (el.className || '').toString().slice(0, 60) };
  return {
    bodyW: document.body.getBoundingClientRect().width,
    scrollW: document.documentElement.scrollWidth,
    main: pick(document.querySelector('main')),
    h1: pick(document.querySelector('h1')),
  };
});
console.log(JSON.stringify(dims, null, 2));
if (errors.length) console.log('console errors:\n - ' + errors.join('\n - '));
await browser.close();
