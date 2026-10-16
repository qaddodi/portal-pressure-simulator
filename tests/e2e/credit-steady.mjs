// The credit lands in the same spot every time the same view is loaded, on one line, and holds it (sweep 02: a dark lobule
// put it at the bottom on one run and at the top on the next; a narrow strip wrapped it onto two lines). Each view is loaded
// twice in a fresh page; the credit's spot is read once it shows and again 2 s later.
//
//   node tests/e2e/credit-steady.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const VIEWS = [
  { name: 'phone lobule dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', url: '?preset=constrictive', view: 'Lobule' },
  { name: 'phone anatomy', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, url: '?preset=pvt-acute' },
  { name: 'iPad menu open', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, colorScheme: 'dark', url: '?home=explore' },
  { name: 'Mac lobule', viewport: { width: 1280, height: 800 }, colorScheme: 'dark', url: '?preset=rhf', view: 'Lobule' },
  { name: 'iPad slide', viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, colorScheme: 'dark', url: '?script=circuit&slide=10' },
];
const server = await serve(ROOT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const spot = (page) => page.evaluate(() => {
  const c = document.querySelector('.stage-credit'), r = c.getBoundingClientRect();
  if (getComputedStyle(c).opacity === '0' || !c.offsetParent) return 'hidden';
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.height)}h`;
});
let fails = 0;
for (const v of VIEWS) {
  const seen = [];
  for (let run = 0; run < 2; run++) {
    const { name, url, view, ...opts } = v;
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(server.url + url);
    await page.waitForFunction(() => window.pps?.stage, null, { timeout: 30000 });
    if (view) { await page.waitForTimeout(800); await page.click(`#viewSeg button:has-text("${view}")`); }
    await page.waitForTimeout(4000);
    const a = await spot(page);
    await page.waitForTimeout(2000);
    const b = await spot(page);
    // One line: no taller than one line of 12 px text.
    const lineH = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.stage-credit')).lineHeight));
    if (a !== 'hidden' && +a.split(' ')[1].replace('h', '') > lineH * 1.5) { console.log(`✗ ${name}: the credit wraps (${a})`); fails++; }
    if (a !== b) { console.log(`✗ ${name}: the credit moved while the view held still (${a} → ${b})`); fails++; }
    seen.push(a);
    await ctx.close();
  }
  if (seen[0] !== seen[1]) { console.log(`✗ ${name}: two loads put the credit in different spots (${seen[0]} vs ${seen[1]})`); fails++; }
  else console.log(`✓ ${v.name}: ${seen[0]}`);
}
await browser.close();
server.close?.();
if (fails) { console.log(`${fails} credit check(s) failed`); process.exit(1); }
console.log('credit steady: all views land the same spot on one line');
process.exit(0);
