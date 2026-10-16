// Frame cost per surface, in a real browser: the main-thread time each surface's frame callbacks take (window.pps.perf
// totals.ms, src/ui/frame.js) over 10 s in three busy moments of a busy patient (decompensated cirrhosis, flow moving):
// the anatomy with the Tests dock open, the anatomy with the pointer resting on a vessel, and the lobule.
// Report only: it prints ms per second for each surface and never fails on a number, because CI's machines have no
// graphics card. Compare the lines between builds, not with a device.
//
//   node scripts/frame-cost.mjs [dir]       dir defaults to the repository root

import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const WINDOW_MS = 10000;
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const totals = () => page.evaluate(() => { const p = window.pps.perf; return { ms: p.totals.ms, frames: p.totals.frames }; });
// The cost of each surface over the window, while `during` keeps the moment busy (it runs until the window ends).
async function measure(name, during) {
  const a = await totals(), t0 = Date.now();
  if (during) while (Date.now() - t0 < WINDOW_MS) await during(Date.now() - t0);
  else await page.waitForTimeout(WINDOW_MS);
  const b = await totals(), secs = (Date.now() - t0) / 1000;
  const rows = Object.keys(b.ms).map((tag) => [tag, (b.ms[tag] - (a.ms[tag] || 0)) / secs]).filter(([, ms]) => ms >= 0.05).sort((x, y) => y[1] - x[1]);
  const sum = rows.reduce((s, [, ms]) => s + ms, 0), fps = (b.frames - a.frames) / secs;
  console.log(`${name}: ${sum.toFixed(1)} ms of frame callbacks a second over ${fps.toFixed(0)} frames a second (${(sum / Math.max(1, fps)).toFixed(2)} ms a frame)`);
  for (const [tag, ms] of rows) console.log(`  ${tag.padEnd(16)} ${ms.toFixed(1).padStart(6)} ms/s`);
}
async function moment(name, set, during) {
  try { await set(); await page.waitForTimeout(3000); await measure(name, during); }   // (3 s: landed, first rasters done)
  catch (e) { console.log(`${name}: not measured (${e.message.split('\n')[0]})`); }
}
const view = (v) => page.evaluate((x) => document.querySelector(`#viewSeg [data-view="${x}"]`).click(), v);

try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => document.querySelector('#scenarioName')?.textContent.includes('Decompensated') && window.pps?.store.get().frame, null, { timeout: 60000 });
  await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
  await page.waitForTimeout(2500);

  await moment('Anatomy, Tests dock open', async () => {
    await view('anatomic');
    await page.evaluate(() => window.pps.dock.show('doppler', { reveal: true }));
  });

  // The pointer rests on the middle of a vessel that is the topmost thing there, moving a pixel or two as a hand does.
  let at = null;
  await moment('Anatomy, hovering a vessel', async () => {
    await page.evaluate(() => window.pps.dock.close?.());
    at = await page.evaluate(() => {
      for (const p of document.querySelectorAll('.v-hit[role="button"][data-id]')) {
        const len = p.getTotalLength?.();
        if (!len) continue;
        const q = p.getPointAtLength(len / 2), m = p.getScreenCTM();
        if (!m) continue;
        const x = m.a * q.x + m.c * q.y + m.e, y = m.b * q.x + m.d * q.y + m.f;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        if (document.elementFromPoint(x, y)?.closest('.v-hit')?.dataset.id === p.dataset.id) return { x, y, id: p.dataset.id };
      }
      return null;
    });
    if (!at) throw new Error('no vessel under a free point');
    console.log(`(hovering ${at.id})`);
    await page.mouse.move(at.x, at.y);
  }, async (t) => { const d = Math.round(t / 100) % 2 ? 1.5 : -1.5; await page.mouse.move(at.x + d, at.y); await page.waitForTimeout(100); });

  await moment('Lobule', async () => {
    await page.mouse.move(2, 2);
    await view('lobule');
  });
} finally {
  if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await browser.close();
  server.close();
}
