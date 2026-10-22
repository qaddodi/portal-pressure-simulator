// A fluid level that moves composites only the pool's cells (veins-gl fluidPool), not the whole screen: while ascites drains
// and fills, every look at the canvas must equal a whole redraw of it at that moment, pixel for pixel (nothing outside the pool
// changed, and nothing inside it was left stale), and at least one of those frames must have been a pool-only one. (Against the
// whole picture composited again from the same vessel layer: a whole redraw of the vessels mid-ease differs on its own.)
//
//   node tests/e2e/fluid-pool.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await page.waitForFunction(() => (window.pps.store.get().frame?.slow?.ascites || 0) > 800, null, { timeout: 60000 });
  await page.evaluate(() => window.pps.store.set({ running: false }));
  // (The moving blood off: its frames are drawn with the clock at each look, so they would differ from any picture drawn before.)
  await page.evaluate(() => { const s = window.pps.store.get(); window.pps.store.set({ layers: { ...s.layers, flow: false }, blood: { ...s.blood, chevrons: false } }); });
  await page.waitForTimeout(4000);
  for (const [what, act] of [['draining', { kind: 'paracentesis', mL: 6000, albumin: true }]]) {
    await page.evaluate((a) => window.pps.host.send({ type: 'action', action: a }), act);
    // (Looked at while the model runs and the level eases, then for a while after the pause.)
    await page.evaluate(() => window.pps.store.set({ running: true }));
    let looks = 0, easing = 0;
    for (let t0 = Date.now(); Date.now() - t0 < 12000;) {
      if (Date.now() - t0 > 6000) await page.evaluate(() => window.pps.store.set({ running: false }));
      if (await page.evaluate(() => window.pps.stage.fluidEasing())) easing++;
      const r = await page.evaluate(async () => {
        const c = window.pps.stage.veinsCheck(true);
        if (!c) return null;
        // (Premultiplied, to a level: a PNG's colour at alpha near 0 is noise, and the blood's dither can move a level.)
        const px = async (u) => { const img = new Image(); img.src = u; await img.decode(); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
        const a = await px(c.now), b = await px(c.whole);
        let off = 0;
        for (let i = 0; i < a.length; i += 4) for (let q = 0; q < 4; q++) { const k = q === 3 ? 255 : a[i + 3], l = q === 3 ? 255 : b[i + 3]; if (Math.abs(a[i + q] * k - b[i + q] * l) / 255 > 1.01) { off++; break; } }
        return { off };
      });
      if (!r) continue;
      looks++;
      if (r.off) { fail(`${what}: a frame of the moving level differs from the whole picture composited again at ${r.off} pixels (stale)`); break; }
      await page.waitForTimeout(150);
    }
    if (failed) break;
    const pools = await page.evaluate(() => window.pps.stage.poolFrames());
    if (!pools || !easing) fail(`${what}: no frame composited only the pool, or none looked at while the level eased`);
    else console.log(`ok ${what}: ${looks} looks (${easing} while easing) all equal to the whole picture; ${pools} pool-only frames`);
  }
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
