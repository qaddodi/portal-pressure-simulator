// The figure draws its vessels, and a paused figure goes to sleep after a lens switch (round 2 review, §7 guard rails).
//
// Draw check: on the GPU path, the vessel canvas holds vessels at the home view and zoomed in. Counted as strongly coloured
// pixels in the Flow lens, where the organs under them are greyed (a figure with no vessels, as NaN widths once drew, has
// almost none). Sleep check: paused, a lens switch crossfades and then the figure stops drawing; a fade left running (the
// paused heat bug from round 1) keeps it drawing every frame.
// The unit tests only read source text, and once passed with a figure that drew no vessels: this looks at the page.
//
//   node tests/e2e/figure-draws.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const MIN_SHARE = 0.003;   // at least 0.3 % of the canvas strongly coloured (the healthy figure at home: about 0.7 %; zoomed: about 2.6 %)
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/renderer|shader/i.test(m.text())) errors.push(m.text().slice(0, 300)); });
  // A hardware renderer's name, so the figure takes its GPU path on a machine without one (draws still run, on SwiftShader).
  await page.addInitScript(() => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const gp = C.prototype.getParameter;
      C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); };
    }
  });
  await page.goto(server.url + '?preset=healthy');
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 120000 });
  await page.evaluate(() => window.pps.store.set({ colorMode: 'flow' }));
  await page.waitForTimeout(6000);

  // Strongly coloured share of the vessel canvas (alpha over half, channels spread by more than 60 of 255).
  const share = () => page.evaluate(() => {
    const c = document.getElementById('veins');
    if (!c || !c.width || !c.height) return -1;
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const g = o.getContext('2d'); g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, o.width, o.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) n++;
    return n / (o.width * o.height);
  });
  const home = await share();
  console.log(`home view    vessels cover ${(home * 100).toFixed(2)} % of the figure`);
  if (home < 0) fail('no vessel canvas: the figure is not on its GPU path');
  else if (home < MIN_SHARE) fail(`home view: the figure drew almost no vessels (${(home * 100).toFixed(2)} %)`);
  await page.evaluate(() => { window.pps.stage.zoomIn(); window.pps.stage.zoomIn(); });
  await page.waitForTimeout(2500);
  const zoomed = await share();
  console.log(`zoomed in    vessels cover ${(zoomed * 100).toFixed(2)} % of the figure`);
  if (zoomed >= 0 && zoomed < MIN_SHARE) fail(`zoomed in: the figure drew almost no vessels (${(zoomed * 100).toFixed(2)} %)`);

  // Paused, a lens switch crossfades (0.3 s) and the plate eases; then the figure sleeps (a few frames at most: one left
  // running draws about 180 in 3 s).
  await page.evaluate(() => window.pps.store.set({ running: false }));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.pps.store.set({ colorMode: 'pressure' }));
  await page.waitForTimeout(2500);
  const drawn = () => page.evaluate(() => window.pps.perf.totals.drawn.stage || 0);
  const d0 = await drawn();
  await page.waitForTimeout(3000);
  const d1 = await drawn();
  console.log(`paused       ${d1 - d0} figure frames drawn in the 3 s after a lens switch settled`);
  if (d1 - d0 > 10) fail(`a paused figure kept drawing after a lens switch: ${d1 - d0} frames in 3 s`);
  if (errors.length) fail(`page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  server.close?.();
}
console.log(failed ? `figure-draws: ${failed} failure(s)` : 'figure-draws: passed');
process.exit(failed ? 1 : 0);
