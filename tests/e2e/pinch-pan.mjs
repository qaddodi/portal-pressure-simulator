// Pinch and pan follow the hand: a two-finger pinch about an off-centre point keeps the point of the figure under the
// fingers' midpoint there and scales the figure by the fingers' spread, a one-finger pan moves it 1:1, and nothing moves it
// again once the hand lifts (no glide, spring or refit pulling it off). Phone touch, a Mac trackpad pinch (Ctrl + wheel)
// and Safari's gesture events; playing and paused; and the same after a resize.
//
//   node tests/e2e/pinch-pan.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

// The figure's world → screen transform, as the browser lays it out.
const ctm = (page) => page.evaluate(() => { const m = document.getElementById('world').getScreenCTM(); return [m.a, m.b, m.c, m.d, m.e, m.f]; });
const toWorld = (m, x, y) => { const det = m[0] * m[3] - m[1] * m[2]; const dx = x - m[4], dy = y - m[5]; return [(m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det]; };
const toScreen = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const scaleOf = (m) => Math.hypot(m[0], m[1]);
// The lobule's view (its scale and offset inside its own box), as the same kind of transform.
const lobuleM = (page) => page.evaluate(() => { const [k, x, y] = window.pps.stage.lobuleViewKey().split('|')[0].split(',').map(Number); const r = document.querySelector('.lz').getBoundingClientRect(); return [k, 0, 0, k, r.left + x, r.top + y]; });
const steady = async (page, get = ctm) => { let a = JSON.stringify(await get(page)), same = 0; for (let i = 0; i < 60 && same < 3; i++) { await page.waitForTimeout(250); const b = JSON.stringify(await get(page)); same = a === b ? same + 1 : 0; a = b; } return JSON.parse(a); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);

// Checks one gesture: `steps` is a list of [midpoint, spread] (a pan keeps the spread 0); after every step the point that was
// under the start midpoint must be under the current one, at the start scale times the spread's ratio; and after the hand
// lifts, the view must stay where the hand left it.
async function judge(page, what, start, run, get = ctm) {
  const m0 = await get(page);
  const w0 = toWorld(m0, start[0][0], start[0][1]), s0 = scaleOf(m0), d0 = start[1];
  let worst = 0, worstK = 0;
  await run(async (mid, d) => {
    await frames(page);
    const m = await get(page), p = toScreen(m, w0);
    worst = Math.max(worst, Math.hypot(p[0] - mid[0], p[1] - mid[1]));
    if (d0) worstK = Math.max(worstK, Math.abs(Math.log(scaleOf(m) / s0 / (d / d0))));
  });
  const mEnd = await get(page);
  const mRest = await steady(page, get);
  const drift = Math.hypot(...toScreen(mRest, w0).map((v, i) => v - toScreen(mEnd, w0)[i])), kDrift = Math.abs(Math.log(scaleOf(mRest) / scaleOf(mEnd)));
  const line = `${what.padEnd(46)} focal point off by ${worst.toFixed(1)} px, scale off by ${(Math.expm1(worstK) * 100).toFixed(1)}%, after release moved ${drift.toFixed(1)} px / ${(Math.expm1(kDrift) * 100).toFixed(1)}%`;
  console.log(line);
  if (worst > 2) fail(`${what}: the point under the fingers moved ${worst.toFixed(1)} px`);
  if (worstK > 0.01) fail(`${what}: the zoom missed the fingers' spread by ${(Math.expm1(worstK) * 100).toFixed(1)}%`);
  if (drift > 2 || kDrift > 0.01) fail(`${what}: the view moved by itself after the hand lifted (${drift.toFixed(1)} px, ${(Math.expm1(kDrift) * 100).toFixed(1)}%)`);
}

async function open(ctx, query = '?preset=cirr-decomp') {
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(server.url + query);
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins') && document.getElementById('world'), null, { timeout: 120000 });
  await page.waitForTimeout(5000);
  await steady(page);
  return page;
}
// A Safari gesture event (scale since the gesture began, at its centre) on whatever is under that point.
const gestureEvent = ([type, scale, x, y]) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { scale: { value: scale }, clientX: { value: x }, clientY: { value: y } });
  document.elementFromPoint(x, y).dispatchEvent(e);
};
const run = (page, on) => page.evaluate((v) => window.pps.host.send({ type: 'run', running: v }), on);

try {
  // ── Phone: touch ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await open(ctx);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const box = await page.locator('.stage-view').boundingBox();
    for (const playing of [false, true]) {
      await run(page, playing);
      await page.evaluate(() => window.pps.stage.fit()); await steady(page);
      // An off-centre pinch out to about twice the spread, with the midpoint drifting a little (as fingers do).
      const c = [box.x + box.width * 0.3, box.y + box.height * 0.32];
      // As Safari on an iPhone or iPad sends it: the touches, and gesture events (scale since the start, at the centre) with them.
      for (const ios of [false, true]) {
        await page.evaluate(() => window.pps.stage.fit()); await steady(page);
        const gesture = (type, scale, [x, y]) => ios && page.evaluate(gestureEvent, [type, scale, x, y]);
        await judge(page, `phone pinch${ios ? ', with Safari gesture events' : ''} (${playing ? 'playing' : 'paused'})`, [c, 60], async (step) => {
          await touch('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
          await gesture('gesturestart', 1, c);
          for (let i = 1; i <= 12; i++) { const d = 60 + i * 5, m = [c[0] + i * 1.5, c[1] + i]; await touch('touchMove', [[m[0] - d / 2, m[1]], [m[0] + d / 2, m[1]]]); await gesture('gesturechange', d / 60, m); await step(m, d); }
          await touch('touchEnd', []);
          await gesture('gestureend', 2, c);
        });
      }
      const p = [box.x + box.width * 0.55, box.y + box.height * 0.4];
      await judge(page, `phone pan (${playing ? 'playing' : 'paused'})`, [p, 0], async (step) => {
        await touch('touchStart', [p]);
        for (let i = 1; i <= 12; i++) { const m = [p[0] - i * 9, p[1] + i * 6]; await touch('touchMove', [m]); await step(m, 0); }
        await page.waitForTimeout(150);   // (held still before lifting: no flick)
        await touch('touchEnd', []);
      });
    }
    // The lobule: a pinch in about an off-centre point, as Safari sends it, then a pan.
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 60000 });
    await page.waitForTimeout(3000); await steady(page, lobuleM);
    for (const ios of [false, true]) {
      const c = [box.x + box.width * 0.35, box.y + box.height * 0.35];
      const gesture = (type, scale, [x, y]) => ios && page.evaluate(gestureEvent, [type, scale, x, y]);
      await judge(page, `lobule pinch${ios ? ', with Safari gesture events' : ''}`, [c, 60], async (step) => {
        await touch('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
        await gesture('gesturestart', 1, c);
        for (let i = 1; i <= 10; i++) { const d = 60 + i * 4; await touch('touchMove', [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]]); await gesture('gesturechange', d / 60, c); await step(c, d); }
        await touch('touchEnd', []);
        await gesture('gestureend', 1.67, c);
      }, lobuleM);
    }
    const lp = [box.x + box.width * 0.5, box.y + box.height * 0.4];
    await judge(page, 'lobule pan', [lp, 0], async (step) => {
      await touch('touchStart', [lp]);
      for (let i = 1; i <= 10; i++) { const m = [lp[0] - i * 8, lp[1] + i * 5]; await touch('touchMove', [m]); await step(m, 0); }
      await page.waitForTimeout(150);
      await touch('touchEnd', []);
    }, lobuleM);
    // With the lymph on and the patient playing, a pan carries the labels along as one layer: the lymph label's live protein
    // figure ('Protein 48%', which moves with the pulse) must not have them all placed again on every frame (that made the pan lag).
    // And the lymph layer, which keeps its eraser and lining as layers moved by whole pixels as the view pans (drawing only the
    // strips a move uncovers, and only what reaches the screen), equals one drawn whole and afresh where the view now stands.
    {
      await page.evaluate(() => window.pps.store.set({ lobuleLayers: { ...window.pps.store.get().lobuleLayers, lymph: true } }));
      await run(page, true);
      await page.waitForTimeout(1500);
      const layouts = () => page.evaluate(() => window.pps.stage.lobuleLabelLayouts());
      await touch('touchStart', [lp]);
      await touch('touchMove', [[lp[0] + 6, lp[1] + 4]]); await frames(page, 3);
      const n0 = await layouts();
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[lp[0] + 6 + i * 6, lp[1] + 4 - i * 4]]); await frames(page, 2); }
      const n1 = await layouts();
      await touch('touchEnd', []);
      console.log(`lobule pan with the lymph on, playing: labels placed ${n1 - n0} times in 12 moves`);
      if (n1 - n0 > 2) fail(`lobule pan with the lymph on: the labels were placed again ${n1 - n0} times in 12 moves instead of riding with the picture`);
      await run(page, false);
      let kept = 0;
      for (const [dx, dy] of [[0, 0], [120, -80], [-160, 60]]) {
        if (dx || dy) { const q = [lp[0], lp[1]]; await touch('touchStart', [q]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[q[0] + dx * i / 6, q[1] + dy * i / 6]]); await frames(page, 1); } await touch('touchEnd', []); await steady(page, lobuleM); }
        const c = await page.evaluate(() => window.pps.stage.lobuleFxCheck());
        console.log(`lobule lymph layer as kept vs drawn whole and afresh (${await page.evaluate(() => window.pps.stage.lobuleViewKey())}): ${c ? `${c.differ} of ${c.bytes} bytes differ` : 'not drawn'}`);
        if (!c || !c.lymph) fail('the lobule lymph layer was not there to check');
        else if (c.differ) fail(`the lobule lymph layer as kept and moved by the pans differs from one drawn whole and afresh in ${c.differ} bytes`);
        kept = c?.kept ?? 0;
      }
      console.log(`lobule lymph layer: the eraser and lining layers were moved ${kept} times by the pans`);
      if (!kept) fail('the lobule lymph layer was drawn whole on every frame of the pans: its kept eraser and lining were never moved');
    }
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click());
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen(), null, { timeout: 60000 });
    await page.waitForTimeout(3000);
    await run(page, false);
    // Turned sideways and back: the gestures still follow the hand.
    await page.setViewportSize({ width: 844, height: 390 }); await steady(page);
    await page.setViewportSize({ width: 390, height: 844 }); await steady(page);
    const box2 = await page.locator('.stage-view').boundingBox();
    const c = [box2.x + box2.width * 0.7, box2.y + box2.height * 0.3];
    await judge(page, 'phone pinch after a turn', [c, 60], async (step) => {
      await touch('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
      for (let i = 1; i <= 10; i++) { const d = 60 + i * 6; await touch('touchMove', [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]]); await step(c, d); }
      await touch('touchEnd', []);
    });
    await ctx.close();
  }
  // ── Mac: trackpad pinch (Ctrl + wheel), Safari's gesture events, mouse drag ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await open(ctx);
    const box = await page.locator('.stage-view').boundingBox();
    for (const playing of [false, true]) {
      await run(page, playing);
      await page.evaluate(() => window.pps.stage.fit()); await steady(page);
      const c = [box.x + box.width * 0.62, box.y + box.height * 0.35];
      await page.mouse.move(c[0], c[1]);
      // A trackpad pinch: Ctrl + wheel, each event's deltaY a zoom of exp(-deltaY / 100). (The spread is judged from the
      // deltaY the page received: headless Chromium divides the one sent by the device pixel ratio.)
      await page.evaluate(() => { if (window.__padDY != null) return; window.__padDY = 0; addEventListener('wheel', (e) => { if (e.ctrlKey) window.__padDY += e.deltaY; }, { capture: true, passive: true }); });
      await judge(page, `trackpad pinch (${playing ? 'playing' : 'paused'})`, [c, 100], async (step) => {
        await page.evaluate(() => { window.__padDY = 0; });
        for (let i = 1; i <= 12; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -12); await page.keyboard.up('Control'); await step(c, 100 * Math.exp(-(await page.evaluate(() => window.__padDY)) / 100)); }
      });
      // Safari's own gesture events (scale since the gesture began), without a Ctrl + wheel of their own.
      await page.evaluate(() => window.pps.stage.fit()); await steady(page);
      const g = [box.x + box.width * 0.4, box.y + box.height * 0.6];
      await judge(page, `Safari gesture pinch (${playing ? 'playing' : 'paused'})`, [g, 100], async (step) => {
        const fire = (type, scale) => page.evaluate(gestureEvent, [type, scale, g[0], g[1]]);
        await fire('gesturestart', 1);
        for (let i = 1; i <= 10; i++) { await fire('gesturechange', 1 + i * 0.06); await frames(page, 2); await step(g, 100 * (1 + i * 0.06)); }
        await fire('gestureend', 1.6);
      });
      const p = [box.x + box.width * 0.5, box.y + box.height * 0.5];
      await judge(page, `mouse drag (${playing ? 'playing' : 'paused'})`, [p, 0], async (step) => {
        await page.mouse.move(p[0], p[1]); await page.mouse.down();
        for (let i = 1; i <= 12; i++) { const m = [p[0] + i * 11, p[1] - i * 5]; await page.mouse.move(m[0], m[1]); await step(m, 0); }
        await page.waitForTimeout(150);
        await page.mouse.up();
      });
    }
    await run(page, false);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('pinch-pan: ok');
