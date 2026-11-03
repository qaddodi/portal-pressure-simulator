// The diaphragm is drawn on the Anatomy view: the GPU's live 'back' layer (the backdrop, which holds the diaphragm's two strokes) is
// in the painter and holds shapes. 2 Nov 2026 (e6d08386): the backdrop leaves the page's layout (display: none) while the GPU draws the
// plate, the live reader skipped it as hidden, and every reading made after the plate was up (a reload, a patient change, a look change)
// left the diaphragm out; only the very first reading, made before the plate, had it.
//
//   node tests/e2e/diaphragm.mjs [dir]
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const boot = async () => {
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 120000 });
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('done'); }, null, { timeout: 120000 });
};
// The shapes the 'back' layer holds once the plate is up (the organs drawn as GPU layers).
async function back(when) {
  const r = await page.waitForFunction(() => {
    const sv = document.querySelector('.stage-view'), p = window.pps.stage.organPaths();
    return sv?.classList.contains('gl-plate') && p.live?.includes('painted live') ? p.liveLayers || {} : null;
  }, null, { timeout: 120000 }).then((h) => h.jsonValue());
  await page.waitForTimeout(3000);
  const now = await page.evaluate(() => window.pps.stage.organPaths().liveLayers || {});
  const n = now.back || 0;
  console.log(`${when}: live layers ${JSON.stringify(now)} (first seen ${JSON.stringify(r)})`);
  if (!(n >= 2)) fail(`${when}: the diaphragm's layer ('back') holds ${n} shapes, it needs its two strokes`);
  const dia = await page.evaluate(() => document.querySelectorAll('.org-diaphragm').length);
  if (dia !== 2) fail(`${when}: ${dia} diaphragm strokes in the page, not 2`);
}

await page.goto(`${server.url}?gpuorgans=force`);
await boot();
await back('first load');
await page.reload();
await boot();
await back('reload');
await page.evaluate(() => window.pps.loadPreset('cirr-decomp'));
await back('after a patient change');
await page.evaluate(() => window.pps.loadPreset('healthy'));
await back('back to healthy');
// A look change reads the organs again while the plate is up (the stage's own key holds the theme and the palette).
for (const look of ['light', 'navy', 'black', 'dark']) {
  await page.evaluate(async (l) => { const { applyLookAttrs } = await import('/src/ui/looks.js'); applyLookAttrs(document.documentElement, l); }, look);
  await back(`after the ${look} look`);
}
if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
await browser.close();
server.close();
if (failed) { console.log(`${failed} diaphragm check(s) failed`); process.exit(1); }
console.log('The diaphragm is drawn.');
