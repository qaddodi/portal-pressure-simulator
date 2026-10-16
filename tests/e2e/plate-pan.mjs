// The sharp organ copy during a zoomed-in pan. Redrawn at every pause of the hand, even with the copy still covering the
// whole screen, it stalled the pan for a raster of the organs (longest over the liver). Now:
//   - a pause with the hand still down, the copy covering the screen: no redraw, and the copy shown covers the view at
//     the sharpness a new one would have;
//   - the hand lets go: the copy of the view is drawn a moment later (the picture a pause used to give);
//   - the view moves past the copy's edge while the hand is down: it is redrawn at once, as before (never soft there);
//   - the copy kept through the pan is the picture a new one drawn there gives (it lies on the screen's pixel grid).
//
//   node tests/e2e/plate-pan.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 640, height: 420 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
// The app draws the organs on the GPU only with a hardware renderer: the software one here passes for one.
await ctx.addInitScript(() => {
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const g = P.getParameter;
    P.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' : g.call(this, p); };
  }
});
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
const ok = (m) => console.log(`ok   ${m}`);

const state = () => page.evaluate(() => { const s = window.pps.stage; return { n: s.plateViewRasters(), pv: s.plateView(), view: s.viewWorld() }; });
// The copy covers the view (within the plate's own bounds, past which there is nothing to draw).
const covers = ({ pv, view }) => {
  if (!pv) return false;
  const P = [200, -200, 1220, 1120];
  return Math.max(view[0], P[0]) >= pv[0] - 1e-6 && Math.max(view[1], P[1]) >= pv[1] - 1e-6 && Math.min(view[2], P[2]) <= pv[2] + 1e-6 && Math.min(view[3], P[3]) <= pv[3] + 1e-6;
};
// Waits for a sharp copy to land (or the time to run out), returning the last state.
async function settle(n0, ms = 6000) {
  const t = Date.now();
  let s = await state();
  while (s.n === n0 && Date.now() - t < ms) { await page.waitForTimeout(200); s = await state(); }
  return s;
}
const steps = async (from, d, n) => { let p = from; for (let i = 1; i <= n; i++) { p = [from[0] + (d[0] * i) / n, from[1] + (d[1] * i) / n]; await page.mouse.move(...p); } return p; };

try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
  await page.waitForFunction(() => document.querySelector('.stage-view')?.classList.contains('gl-plate'), null, { timeout: 60000 });
  // Eight times the fit (sharper than the whole-plate raster at this size), the liver in the middle of the screen.
  await page.evaluate(() => {
    const st = window.pps.stage, c = st.cameraState(), M = document.getElementById('world').getScreenCTM();
    const r = document.querySelector('.stage-view').getBoundingClientRect();
    const s0 = M.a / c.k, k = c.k * 8, ox = M.e - s0 * c.x, oy = M.f - s0 * c.y;
    st.setCamera({ k, x: (r.left + r.width / 2 - ox) / s0 - k * 590, y: (r.top + r.height / 2 - oy) / s0 - k * 340 }, 1);
  });
  const s0 = await settle(0, 15000);
  if (!s0.n || !covers(s0)) throw new Error(`no sharp copy of the zoomed-in view (${s0.n} drawn, ${JSON.stringify(s0.pv)} for ${JSON.stringify(s0.view)})`);
  const mid = [320, 210];

  // 1. A short pan, then the hand holds still (well past the redraw's wait), still down.
  await page.mouse.move(...mid); await page.mouse.down();
  await steps(mid, [-30.37, -16.61], 6);   // (a finger's moves fall between pixels)
  await page.waitForTimeout(900);
  const s1 = await state();
  if (s1.n !== s0.n) fail(`a pause with the hand down redrew the sharp copy although it covered the screen (${s1.n - s0.n} redraw(s))`);
  else ok('a pause with the hand down keeps the sharp copy that covers the screen');
  if (!covers(s1)) fail(`the copy shown in the pause does not cover the view (${JSON.stringify(s1.pv)} for ${JSON.stringify(s1.view)})`);
  else if (s1.pv[4] < s0.pv[4] / 1.05) fail(`the copy shown in the pause is softer than the one before (${s1.pv[4].toFixed(2)} against ${s0.pv[4].toFixed(2)} px per unit)`);
  else ok('the copy shown in the pause covers the view at full sharpness');
  // The same view drawn anew, the hand still down: the same picture as the copy kept. (The rasterizer's dither follows the copy's
  // origin, 1-3 levels; a few vessel pixels may move by a little more. A copy off the pixel grid differs along every edge.)
  // (The figure alone: the controls fade while a hand holds the figure, .stage-busy, on their own clock.)
  await page.addStyleTag({ content: '#labels, #overlay, .stage-credit, .hover-tip, .stage-blocker, .float-ui, .stage-fit, .stage-rotate, .zoom-pill { visibility: hidden !important; }' });
  await page.waitForTimeout(300);
  const kept = await page.screenshot();
  await page.evaluate(() => window.pps.stage.plateViewAgain());
  const s1b = await settle(s1.n, 6000);
  await page.waitForTimeout(300);
  const fresh = await page.screenshot();
  const diff = await page.evaluate(async ([a, b]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const [A, B] = [await load(a), await load(b)];
    let max = 0, over = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d > 3) over++;
      if (d > max) max = d;
    }
    return { max, over, px: A.length / 4 };
  }, [kept.toString('base64'), fresh.toString('base64')]);
  if (s1b.n !== s1.n + 1) fail(`asked for, no new copy of the view was drawn (${s1b.n - s1.n})`);
  else if (diff.over > diff.px * 2e-4) fail(`the copy kept through the pan differs from a new one of the same view (${diff.over} pixels by more than 3/255, up to ${diff.max})`);
  else ok(`the copy kept through the pan is the picture a new one gives (${diff.over} pixels by more than 3/255)`);

  // 2. A little further, then the hand lets go: the copy of the view now on screen follows.
  await steps([mid[0] - 30.37, mid[1] - 16.61], [-6, -4], 2);
  await page.mouse.up();
  const s2 = await settle(s1b.n, 4000);
  if (s2.n !== s1b.n + 1) fail(`letting go did not draw the copy of the view (${s2.n - s1b.n} redraw(s))`);
  else ok('letting go draws the copy of the view');

  // 3. Held down, the view moves past the copy's edge: redrawn while the hand is still down (as before), never left soft.
  await page.mouse.move(...mid); await page.mouse.down();
  await steps(mid, [-260, 0], 14);
  // (A slow frame mid-stroke can draw a copy on the way: wait for the one of the view where the hand stopped.)
  let s3 = await settle(s2.n, 4000);
  for (const t = Date.now(); !covers(s3) && Date.now() - t < 6000;) { await page.waitForTimeout(200); s3 = await state(); }
  if (s3.n <= s2.n) fail(`a pause past the copy's edge, hand down, did not redraw it`);
  else if (!covers(s3)) fail(`the copy drawn past the edge does not cover the view (${JSON.stringify(s3.pv)} for ${JSON.stringify(s3.view)})`);
  else ok("a pause past the copy's edge redraws it with the hand still down");
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const s4 = await state();
  if (s4.n !== s3.n) fail(`letting go after that redrew the same view again (${s4.n - s3.n} redraw(s))`);
  else ok('letting go there draws nothing more');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`plate-pan: ${failed} check(s) failed`); process.exit(1); }
console.log('plate-pan: ok');
