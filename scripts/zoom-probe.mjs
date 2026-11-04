// The card zoom's start and its interruptions (V-ZOOM-1, V-ZOOM-5, V-ZOOM-6), Mac: frames from the tap to the first change of the card's
// transform, the longest of the first 3 frames, a second tap part way (goes back from where it is) and Next part way (shuts, then the slide).
// A phone gets no zoom: a tap on an empty part of its card does nothing.   node scripts/zoom-probe.mjs [--device mac|iphone]
import { openApp } from './shoot.mjs';
const HOOK = () => {
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) if (P[fn]) P[fn] = function () {};
  const S = (window.__z = { on: false, f: [], tap: 0 });
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!S.on) return;
    const d = document.querySelector('.pz-data');
    S.f.push({ t, k: d ? Math.round(d.drawnBox ? d.drawnBox().width : d.getBoundingClientRect().width) : 0, z: d?.dataset.zoomed ?? null, tf: d ? getComputedStyle(d).transform : '', o: d ? +getComputedStyle(d).opacity : 0, kids: d?.childElementCount || 0 });
  };
  requestAnimationFrame(tick);
};
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const device = arg('device', 'mac');
const app = await openApp({ device, initScript: `(${HOOK})()` });
let bad = 0;
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) bad++; };
try {
  const pg = app.page;
  const fresh = async () => {
    await pg.evaluate(() => window.pps.presenter.start('prehepatic', 1));
    await pg.waitForFunction(() => document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 90000 });
    await pg.waitForTimeout(4000);
  };
  const tapCard = () => pg.evaluate(() => document.querySelector('.pz-zbtn').click());   // (the corner icon: the tap on the card's empty part is the same zoomToggle)
  const frames = async (ms) => { await pg.waitForTimeout(ms); return pg.evaluate(() => window.__z.f); };
  await fresh();
  if (device !== 'mac') {
    await pg.evaluate(() => { window.__z.f.length = 0; window.__z.on = true; });
    await tapCard(); const f = await frames(1200);
    check(!f.some((x) => x.z !== null), 'phone: a tap on an empty part of the card does not zoom it');
  } else {
    // 1: latency and long frames
    await pg.evaluate(() => { window.__z.f.length = 0; window.__z.on = true; });
    const t0 = await pg.evaluate(() => performance.now());
    await tapCard(); let f = await frames(1100);
    const first = f.findIndex((x, i) => i && x.tf !== f[0].tf);
    const gaps = f.slice(1, 5).map((x, i) => Math.round(x.t - f[i].t));
    console.log('  zoomed flag seen', f.some((x) => x.z !== null), 'n', f.length, 'tf', [...new Set(f.map((x) => x.tf))].length, 'frames to first change', first, 'first gaps (ms)', gaps.join(' '));
    check(first > 0 && first <= 3, 'zoom starts within 2 frames of the tap');
    check(Math.max(...gaps.slice(0, 3)) <= 50, 'no frame over 50 ms in the first 3');
    check(f.every((x) => x.kids > 0 && x.o > 0.98), 'the card keeps its content through the zoom');
    // 2: second tap part way goes back from where it is
    await pg.evaluate(() => { window.__z.f.length = 0; });
    await pg.evaluate(() => window.pps.presenter.start('prehepatic', 1)); await pg.waitForTimeout(5000);
    await tapCard(); await pg.waitForTimeout(260);
    const mid = await pg.evaluate(() => document.querySelector('.pz-data').getBoundingClientRect().width);
    await pg.evaluate(() => { window.__z.f.length = 0; }); await tapCard(); f = await frames(700);
    const w = f.map((x) => x.k), ok = w[0] <= mid + 8 && w.at(-1) < mid && w.every((v, i) => !i || v <= w[i - 1] + 2);
    console.log('  width part way', mid, '-> back', w.filter((_, i) => i % 6 === 0).join(' '));
    check(ok, 'a second tap part way goes back from where it is, without a jump');
    // 3: Next part way shuts, then the slide changes
    await pg.evaluate(() => window.pps.presenter.start('prehepatic', 1)); await pg.waitForTimeout(5000);
    await tapCard(); await pg.waitForTimeout(260);
    await pg.evaluate(() => { window.__z.f.length = 0; }); await pg.keyboard.press('ArrowRight'); f = await frames(2500);
    const wd = f.map((x) => x.k);
    check(f.every((x) => x.kids > 0 || x.o === 0), 'Next part way: the card is never left empty');
    check(!f.some((x) => x.z !== null && x.t > f[0].t + 2200), 'Next part way: the zoom is gone after the slide changes');
    console.log('  width through Next', wd.filter((_, i) => i % 6 === 0).join(' '));
  }
} finally { await app.close(); }
if (bad) process.exit(1);
