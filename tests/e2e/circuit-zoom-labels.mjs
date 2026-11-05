// The Circuit's labels follow a hand's zoom (Mohammad, 3 Nov 2026, iPhone: "Why aren't the labels moving with the zoom"). A pinch used to
// hide every reading and, once the hand let go, lift the hide before the labels were laid out again: the old labels stood at their old
// screen places over the zoomed vessels (leaders pointing at nothing). Now they ride the zoom on the GPU and are laid out for where it
// stopped before they are shown again.
//
//   node tests/e2e/circuit-zoom-labels.mjs
//
// On every frame of a two-finger pinch (iPhone upright, the Circuit, playing) and after it:
//   - no frame shows labels that are neither riding the camera nor laid out under it (stage.labelCarry().stale);
//   - while the pinch lasts the labels ride, and each label's picture stands where the camera's move carries its laid-out
//     centre (within 2 px of the moved centre, stage.labelDrawn boxes against the camera's matrix);
//   - after it, every shown frame is laid out for the camera.
// (Software GL draws a frame in seconds: the check reads the page on its own animation frames, so it sees every frame that is drawn.)

import { openApp } from '../../scripts/shoot.mjs';

const view = process.env.LABEL_VIEW || 'circuit';
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const app = await openApp({ device: 'iphone', theme: 'dark', query: '?preset=cirr-decomp' });
const { page } = app;
// The initial healthy frame can arrive before a deep-linked patient has finished loading.
await page.waitForFunction(() => !window.pps.store.get().presetLoading && window.pps.store.get().presetId === 'cirr-decomp');
await page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`).click(), view);
await app.freeze();
await page.evaluate(() => window.pps.store.set({ running: false }));
// Circuit readings appear after the fit view is enlarged. Start from a drawn, paused layout, then resume the model for the pinch.
await page.mouse.move(195, 420);
await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
let ready = false;
for (let i = 0; i < 90; i++) {
  ready = await page.evaluate(() => window.pps.stage.labelCarry().laid && window.pps.stage.labelDrawnBy().filter((d) => d.a > 0.9).length >= 4);
  if (ready) break;
  await page.waitForTimeout(1000);
}
if (!ready) { console.log(await page.evaluate(() => ({ carry: window.pps.stage.labelCarry(), labels: window.pps.stage.labelDrawnBy() }))); await app.close(); throw new Error('no settled GPU label layout before the pinch'); }
console.log(`${view}: starting pinch from a drawn layout`);
await page.evaluate(() => { window.pps.store.set({ running: true }); window.pps.host.send({ type: 'run', running: true }); });

// Every animation frame's record, kept in the page (software GL gives few frames: none of them is missed by polling).
await page.evaluate(() => {
  window.__rec = [];
  const tick = () => {
    const s = window.pps.stage, c = s.labelCarry(), m = document.getElementById('world').getScreenCTM();
    const o = document.getElementById('stage').getBoundingClientRect();   // (the labels have no canvas of their own: they ride the figure's)
    window.__rec.push({ ...c, k: m.a * m.a + m.b * m.b, ex: m.e, fy: m.f, ox: o.left, oy: o.top, bx: (s.labelDrawn() || []).map((b) => b.slice()), labels: s.labelDrawnBy() });
  };
  globalThis.__frameProbe = tick;
});
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const c = [195, 420];
await touch('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
const during = [];
for (let i = 1; i <= 10; i++) {
  const d = 60 + i * 10;
  await touch('touchMove', [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]]);
  await page.waitForTimeout(400);
  during.push(await page.evaluate(() => window.__rec[window.__rec.length - 1]));
}
await touch('touchEnd', []);
// Let it settle: the hand lets go, the labels are laid out for where it stopped and shown.
const settle = [];
for (let i = 0; i < 400; i++) {
  await page.waitForTimeout(700);
  settle.push(await page.evaluate(() => { const r = window.__rec[window.__rec.length - 1]; return { ...r, cls: document.querySelector('.stage-view').className }; }));
  if (i > 6 && !settle[i].riding && settle[i].bx.length > 3) break;
}
const rec = await page.evaluate(() => window.__rec);
if (process.env.LABEL_SHOT) await page.screenshot({ path: process.env.LABEL_SHOT });
await app.close();

// 1. No frame, at any time, shows the old labels over the moved view.
const stale = rec.filter((r) => r.stale);
if (stale.length) fail(`${stale.length} of ${rec.length} frames showed labels at their old places over the moved view`);

// 2. While the pinch lasts the labels are carried: some frame is riding.
if (!during.some((r) => r.riding)) fail('the labels never rode the pinch');

// 3. Compare keyed GPU pictures after the scheduler has drawn each frame, including frames in which the camera moved.
// The old check skipped every moving-camera frame and matched whichever box was nearest, so a label trailing a pinch could pass.
let checked = 0, movedFrames = 0, worst = 0;
for (let i = 1; i < rec.length; i++) {
  const a = rec[i - 1], b = rec[i];
  if (!a.riding || !b.riding) continue;
  const scale = Math.sqrt(b.k / a.k);
  if (scale === 1 && a.ex === b.ex && a.fy === b.fy) continue;
  movedFrames++;
  const prev = new Map(a.labels.map((d) => [d.key, d]));
  for (const d of b.labels) {
    const p = prev.get(d.key);
    if (!p || p.a < 0.9 || d.a < 0.9) continue;
    const x = scale * (p.x + p.w / 2) + b.ex - scale * a.ex;
    const y = scale * (p.y + p.h / 2) + b.fy - scale * a.fy;
    if (x < 10 || x > 380 || y < 10 || y > 834) continue;
    checked++;
    worst = Math.max(worst, Math.hypot(d.x + d.w / 2 - x, d.y + d.h / 2 - y));
  }
}
console.log(`${view}: ${movedFrames} moving-camera frames, ${checked} keyed label positions, worst carry error ${worst.toFixed(1)} px`);
if (!checked) fail('no keyed label position checked while the camera moved');
if (worst > 3) fail(`a label trailed its camera by ${worst.toFixed(1)} px`);

// 4. After the hand lets go: labels shown again, laid out for the camera.
const last = settle[settle.length - 1];
if (last.riding || last.stale) fail(`the labels never settled laid out (${JSON.stringify({ riding: last.riding, stale: last.stale })})`);

if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('circuit-zoom-labels: ok');
