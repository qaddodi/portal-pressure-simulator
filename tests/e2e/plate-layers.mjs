// The organs as layers painted on the GPU (organs-gl.js, organ-paint.js): the only picture of them there is (the flattened plate the
// browser rasterized from an SVG copy is gone, owner, 1 Nov: nothing off the GPU). The app is run on the software renderer: it must
// show the organs from the layers, and from healthy to cirrhosis the liver, spleen and fluid ease while the organs stay on the GPU,
// never dropped to the page's SVG for a frame, with no organ picture begun while the fluid eases (the bowel's float is a shift on the
// GPU). How each organ's GPU painting compares with the browser's drawing of its SVG: tests/e2e/organ-paint.mjs.
//
//   node tests/e2e/plate-layers.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

try {
  await page.goto(server.url + '');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  // With the switch on, the organs on screen come from the layers.
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && !(await page.evaluate(() => window.pps.stage.organsSettled() && window.pps.stage.organLayersShown()));) await page.waitForTimeout(500);
  if (!(await page.evaluate(() => window.pps.stage.organLayersShown()))) fail('with  the organs are never shown from the layers');
  else console.log('ok the organs are shown from the layers');
  // Healthy to cirrhosis with the switch on: the liver, spleen and fluid ease while the organs stay on the GPU, never dropped
  // to the live SVG for a frame (the drop and its SVG repaint were the slow frames).
  await page.evaluate(() => window.pps.stage.gpuOrgans(true));
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && !(await page.evaluate(() => window.pps.stage.organLayersShown()));) await page.waitForTimeout(500);
  const ease = await page.evaluate(async () => {
    const st = window.pps.stage;
    window.pps.host.send({ type: 'run', running: true });
    const runs0 = st.layerStarts();
    await window.pps.loadPreset('cirr-decomp');
    let frames = 0, dropped = 0, eased = 0;
    for (const t0 = performance.now(); performance.now() - t0 < 6000;) { await new Promise((r) => requestAnimationFrame(r)); frames++; if (!st.organLayersShown()) dropped++; if (st.fluidEasing()) eased++; }
    return { frames, dropped, eased, runs: st.layerStarts()[1] - runs0[1] };
  });
  const eline = `healthy to cirrhosis, switch on: ${ease.dropped} of ${ease.frames} frames without the GPU organs`;
  if (!ease.frames || ease.dropped) fail(`${eline}: the organs dropped to the SVG during the change`); else console.log(`ok ${eline}`);
  // Nor is any organ picture begun while the fluid eases: the bowel's float is a shift on the GPU (it was a whole new set of
  // pictures every half step of the bulge, the bowel standing still until each landed).
  const rline = `healthy to cirrhosis, switch on: ${ease.runs} organ pictures begun in ${ease.eased} frames of the fluid easing`;
  if (!ease.eased) fail(`${rline}: the fluid never eased`); else if (ease.runs) fail(`${rline}: the pictures are made again while the fluid eases`); else console.log(`ok ${rline}`);
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
