// Nothing stale in the vessel layers: the figure and the lobule redraw only the vessels that changed (veins-gl drawRows).
// After each change below, the picture as it stands must
// equal a whole redraw of it, pixel for pixel: colours moving while playing (checked at the pause), a paused change, a
// lens switch, a theme switch, a resize, Blur effect off, a pan, a drag while playing, the anatomy → lobule → anatomy round trip, and the lobule
// playing, its lens switched, zoomed in and panned.
//
//   node tests/e2e/veins-stale.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 640, height: 420 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0, checked = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
const run = (on) => page.evaluate((v) => window.pps.host.send({ type: 'run', running: v }), on);
// Waits for the picture to settle (no glide, no easing: the canvas the same over two looks), then compares.
async function same(what, lobule = false) {
  const look = () => page.evaluate((lb) => (lb ? window.pps.stage.lobuleGlCheck() : window.pps.stage.veinsCheck()), lobule);
  let r = null;
  for (let t0 = Date.now(); Date.now() - t0 < 30000;) {
    await page.waitForTimeout(1500);
    const a = await page.evaluate((lb) => (lb ? document.querySelector('canvas.lz-gl')?.toDataURL() : window.pps.stage.veinsShot()), lobule);
    await page.waitForTimeout(700);
    const b = await page.evaluate((lb) => (lb ? document.querySelector('canvas.lz-gl')?.toDataURL() : window.pps.stage.veinsShot()), lobule);
    if (a === b) { r = await look(); if (r) break; }
  }
  if (!r) { fail(`${what}: the picture never held still (or there is no GPU layer)`); return; }
  checked++;
  console.log(`${what.padEnd(34)} ${r.now === r.whole ? 'same as a whole redraw' : 'DIFFERS from a whole redraw'}`);
  if (r.now !== r.whole) fail(`${what}: the vessel layer differs from a whole redraw (stale pixels)`);
}

try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  await run(true); await page.waitForTimeout(8000); await run(false);
  await same('anatomy, played then paused');
  await page.evaluate(() => window.pps.updateParams({ tips: { on: true, d: 8 } }));
  await same('anatomy, a paused change (TIPS)');
  await page.evaluate(() => window.pps.store.set({ colorMode: 'velocity' }));
  await same('anatomy, lens switch');
  await page.evaluate(() => window.pps.store.set({ colorMode: 'pressure' }));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await same('anatomy, theme switch');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 560, height: 460 });
  await same('anatomy, resize');
  await page.evaluate(() => document.documentElement.setAttribute('data-noglass', ''));
  await same('anatomy, Blur effect off');
  await page.evaluate(() => document.documentElement.removeAttribute('data-noglass'));
  await page.mouse.move(280, 230); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(280 + 4 * i, 230 + 2 * i); await page.waitForTimeout(16); }
  await page.mouse.up();
  await same('anatomy, a pan');
  // Dragged while the model plays: the moved layer has the changed vessels' cells drawn again (veins-gl draw's rows).
  await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(2000);
  await run(true); await page.waitForTimeout(1500);
  await page.mouse.move(280, 230); await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(280 - 3 * i, 230 + i); await page.waitForTimeout(30); }
  await page.mouse.up();
  await run(false);
  await same('anatomy, dragged while playing');
  await page.evaluate(() => window.pps.stage.zoomOut()); await page.waitForTimeout(2000);
  await run(true); await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
  await page.waitForTimeout(10000); await page.waitForTimeout(6000); await run(false);
  await same('lobule, played then paused', true);
  await page.evaluate(() => window.pps.store.set({ colorMode: 'velocity' }));
  await same('lobule, lens switch', true);
  await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(3000);
  await page.mouse.move(320, 210); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(320 - 4 * i, 210 + 2 * i); await page.waitForTimeout(16); }
  await page.mouse.up();
  await same('lobule, zoomed in and panned', true);
  await page.evaluate(() => window.pps.store.set({ colorMode: 'pressure' }));
  await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click());
  await page.waitForTimeout(8000);
  await same('anatomy, back from the lobule');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`veins-stale: ok (${checked} states)`);
