// Nothing is ever left undrawn or soft while the view moves (the owner's rule: no drop in quality, not even mid-gesture).
// Whatever stage.js drawVeins and lobule-zoom.js drawGL do during a pan or a pinch (today: a whole redraw at each new view),
// the picture on screen must be the one a whole draw of that view gives. Here a hand pans the zoomed-in anatomy to each edge, pinches out, back in and on in to twice the
// start, and pans the zoomed-in lobule, and on the way the picture as it stands is compared with a whole draw of the same
// view, in 8 px blocks: none may be left empty where the whole draw has something (the vessels missing past the old
// layer's edge), and none may be softer (its edges' contrast under 85% of the whole draw's: a scaled-up or coarser layer).
//
//   node tests/e2e/veins-gesture.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 640, height: 420 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0, checks = 0, worstAll = 0, undrawnAll = 0, sharpAll = 1;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

// The picture now against a whole draw of the same view, in 8 px blocks: a block is undrawn where the whole draw shows
// vessels (or anything) and the moving picture shows under a quarter of that coverage. (A coarse layer is softer, not
// emptier: its blocks keep their coverage.) The softness is reported too: the largest change of a block's mean coverage.
async function check(what, lobule = false) {
  const r = await page.evaluate(async (lobule) => {
    const c = lobule ? window.pps.stage.lobuleGlCheck() : window.pps.stage.veinsCheck();
    if (!c) return null;
    const px = async (url) => { const im = new Image(); im.src = url; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return [x.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height]; };
    const [A, w, h] = await px(c.now), [B] = await px(c.whole);
    const B8 = 8;
    let undrawn = 0, soft = 0, blurred = 0, sharp = 1;
    const lum = (P, i) => P[i] * 0.299 + P[i + 1] * 0.587 + P[i + 2] * 0.114;
    for (let by = 0; by + B8 <= h; by += B8) for (let bx = 0; bx + B8 <= w; bx += B8) {
      let a = 0, b = 0;
      for (let y = by; y < by + B8; y++) for (let x = bx; x < bx + B8; x++) { const i = (y * w + x) * 4; a += A[i + 3]; b += B[i + 3]; }
      a /= B8 * B8; b /= B8 * B8;
      if (b > 40 && a < b * 0.25) undrawn++;
      soft = Math.max(soft, Math.abs(a - b));
    }
    // Edges: the summed contrast between neighbouring pixels, in 32 px blocks with real edges in the whole draw (smaller
    // blocks see a hairline drawn at another sub-pixel phase, which is not softer). A layer scaled up, or drawn coarser
    // and scaled to fit, loses a third or more of it.
    const B32 = 32;
    for (let by = 0; by + B32 < h; by += B32) for (let bx = 0; bx + B32 < w; bx += B32) {
      let ea = 0, eb = 0;
      for (let y = by; y < by + B32; y++) for (let x = bx; x < bx + B32; x++) {
        const i = (y * w + x) * 4, r = i + 4, d = i + w * 4;
        ea += Math.abs(lum(A, r) - lum(A, i)) + Math.abs(lum(A, d) - lum(A, i)); eb += Math.abs(lum(B, r) - lum(B, i)) + Math.abs(lum(B, d) - lum(B, i));
      }
      if (eb > 32000) { const k = ea / eb; sharp = Math.min(sharp, k); if (k < 0.85) blurred++; }
    }
    return { undrawn, soft, blurred, sharp, now: c.now, whole: c.whole };
  }, lobule);
  if (!r) { fail(`${what}: no GPU picture to check`); return; }
  if (process.env.DUMP && (r.undrawn || r.blurred)) { const fs = await import('node:fs'); const n = what.replace(/\W+/g, '-'); fs.writeFileSync(`${process.env.DUMP}/${n}-now.png`, Buffer.from(r.now.split(',')[1], 'base64')); fs.writeFileSync(`${process.env.DUMP}/${n}-whole.png`, Buffer.from(r.whole.split(',')[1], 'base64')); }
  checks++; worstAll = Math.max(worstAll, r.soft); undrawnAll += r.undrawn; sharpAll = Math.min(sharpAll, r.sharp);
  if (r.undrawn) fail(`${what}: ${r.undrawn} block(s) left undrawn in the moving picture (drawn in a whole draw of the same view)`);
  if (r.blurred) fail(`${what}: ${r.blurred} block(s) softer than a whole draw of the same view (edges at ${(r.sharp * 100).toFixed(0)}% of its contrast)`);
}

const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
// A drag held down the whole way, checked every few steps (the check draws the layer whole, so the steps between move on
// from it: past its edge at once).
async function drag(what, from, step, n, lobule = false) {
  await page.mouse.move(...from); await page.mouse.down();
  let p = from;
  for (let i = 1; i <= n; i++) {
    p = [p[0] + step[0], p[1] + step[1]];
    await page.mouse.move(...p); await frames();
    if (lobule) await page.waitForTimeout(300);   // (a software renderer paints the lobule about 9 times a second: the picture catches up)
    if (i % 3 === 0) await check(`${what}, step ${i}`, lobule);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
}

try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
  // Zoomed in (so there is somewhere to pan to), then to each edge in turn.
  await page.evaluate(() => { const c = window.pps.stage.cameraState(); window.pps.stage.setCamera({ k: c.k * 2.2, x: c.x - 300, y: c.y - 250 }, 1); });
  await page.waitForTimeout(3000);
  await drag('anatomy pan left', [420, 210], [-28, 0], 9);
  await drag('anatomy pan right', [200, 210], [28, 0], 9);
  await drag('anatomy pan up', [320, 300], [0, -22], 9);
  await drag('anatomy pan down', [320, 100], [0, 22], 9);
  // A trackpad pinch out (the picture shrinks: new ground at every edge), back in, and on in to twice the start (the
  // tiles drawn at the start would show scaled up).
  await page.mouse.move(380, 200);
  for (const [dir, what] of [[1, 'out'], [-1, 'back in'], [-1, 'in to 2×']]) {
    for (let i = 1; i <= 9; i++) {
      await page.keyboard.down('Control'); await page.mouse.wheel(0, (dir > 0 ? 9 : -9) * (what === 'in to 2×' ? 0.85 : 1)); await page.keyboard.up('Control'); await frames();
      if (i % 3 === 0) await check(`anatomy pinch ${what}, step ${i}`);
    }
    if (what !== 'back in') await page.waitForTimeout(800);
  }
  // The lobule, zoomed in and panned.
  await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
  await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(1500);
  await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(3000);
  await drag('lobule pan left', [420, 210], [-24, 6], 9, true);
  await drag('lobule pan right', [200, 210], [24, -6], 9, true);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`veins-gesture: ${checks} moving pictures checked, ${undrawnAll} undrawn blocks; softest block off by ${worstAll.toFixed(0)} of 255 in coverage; edges at ${(sharpAll * 100).toFixed(0)}% or more of a whole draw's contrast`);
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('veins-gesture: ok');
