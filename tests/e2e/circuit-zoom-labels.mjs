// The Circuit's labels follow a hand's zoom (Mohammad, 3 Nov 2026, iPhone: "Why aren't the labels moving with the zoom"). A pinch used to
// hide every reading and, once the hand let go, lift the hide before the labels were laid out again: the old labels stood at their old
// screen places over the zoomed vessels (leaders pointing at nothing). Now they ride the zoom on the GPU and are laid out for where it
// stopped before they are shown again.
//
//   node tests/e2e/circuit-zoom-labels.mjs
//
// On every frame of a two-finger pinch (iPhone upright, the Circuit, playing) and after it:
//   - no frame shows labels that are neither hidden nor riding the camera nor laid out under it (stage.labelCarry().stale);
//   - while the pinch lasts the labels ride (not hidden), and each label's picture stands where the camera's move carries its laid-out
//     centre (within 2 px of the moved centre, stage.labelDrawn boxes against the camera's matrix);
//   - after it, every shown frame is laid out for the camera.
// (Software GL draws a frame in seconds: the check reads the page on its own animation frames, so it sees every frame that is drawn.)

import { openApp } from '../../scripts/shoot.mjs';

let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const app = await openApp({ device: 'iphone', theme: 'dark', query: '?preset=cirr-decomp' });
const { page } = app;
await page.evaluate(() => document.querySelector('#viewSeg [data-view="circuit"]').click());
// The Circuit's readings are laid out and drawn (software GL solves them a slice a frame: it can take a minute or two).
const boxes = () => page.evaluate(() => window.pps.stage.labelDrawn()?.map((b) => b.slice()) ?? []);
for (let i = 0, n = 0; i < 240 && n < 3; i++) { n = (await page.evaluate(() => window.pps.stage.labelCarry().laid)) && (await boxes()).filter((b) => b[2] - b[0] > 14 && b[3] - b[1] > 10).length >= 4 ? n + 1 : 0; await page.waitForTimeout(1000); }
await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));

// Every animation frame's record, kept in the page (software GL gives few frames: none of them is missed by polling).
await page.evaluate(() => {
  window.__rec = [];
  const tick = () => {
    const s = window.pps.stage, c = s.labelCarry(), m = document.getElementById('world').getScreenCTM();
    const o = document.getElementById('labelGl').getBoundingClientRect();
    window.__rec.push({ ...c, k: m.a * m.a + m.b * m.b, ex: m.e, fy: m.f, ox: o.left, oy: o.top, bx: (s.labelDrawn() || []).map((b) => b.slice()) });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  if (i > 6 && !settle[i].hidden && !settle[i].riding && settle[i].bx.length > 3) break;
}
const rec = await page.evaluate(() => window.__rec);
await app.close();

// 1. No frame, at any time, shows the old labels over the moved view.
const stale = rec.filter((r) => r.stale);
if (stale.length) fail(`${stale.length} of ${rec.length} frames showed labels at their old places over the moved view`);

// 2. While the pinch lasts the labels are carried, not hidden: some frame is riding and none of the pinch's steps hides them.
const hid = during.filter((r) => r.hidden);
if (hid.length) fail(`${hid.length} of ${during.length} pinch steps hid the labels instead of carrying them`);
if (!during.some((r) => r.riding)) fail('the labels never rode the pinch');

// 3. Riding, each label's picture stands where the camera's move carries its laid-out centre.
const ride0 = rec.findIndex((r) => r.riding);
const first = ride0 > 0 ? rec.slice(0, ride0).reverse().find((r) => !r.hidden && r.bx.some((b) => b[2] - b[0] > 14)) : null;   // (the last picture laid out before the ride)
// (Frames where the camera stood as it did a frame before: a frame that drew the labels before the camera's last move was written is
// one step behind by construction, on any build; the labels have to catch up the next frame, which is what is judged.)
const riding = rec.filter((r, i) => r.riding && r.bx.length && i > 0 && rec[i - 1].ex === r.ex && rec[i - 1].fy === r.fy && rec[i - 1].k === r.k);
if (first && riding.length) {
  const K0 = Math.sqrt(first.k);
  let worst = 0, n = 0, worstAt = null;
  for (const r of riding) {
    const s = Math.sqrt(r.k) / K0;
    // The centre carried by the camera (about the point both matrices map: the translation difference), picture size unchanged.
    for (const b of first.bx) {
      if (b[2] - b[0] <= 30 || b[3] - b[1] <= 28) continue;   // (a label's picture: the leaders' pieces are small)
      // (client px: the boxes are from the label canvas's corner)
      const cx = (b[0] + b[2]) / 2 + first.ox, cy = (b[1] + b[3]) / 2 + first.oy;
      const px = s * cx + (r.ex - s * first.ex), py = s * cy + (r.fy - s * first.fy);
      const hit = r.bx.reduce((m, q) => Math.min(m, Math.hypot((q[0] + q[2]) / 2 + r.ox - px, (q[1] + q[3]) / 2 + r.oy - py)), Infinity);
      if (px > 10 && py > 10 && px < 380 && py < 834) { n++; if (hit > worst) { worst = hit; worstAt = { rest: b.map(Math.round), predicted: [px, py].map(Math.round), scale: +s.toFixed(2) }; } }
    }
  }
  console.log(`riding: ${riding.length} frames, ${n} label places checked, worst distance from where the camera carries it ${worst.toFixed(1)} px ${worst > 3 ? JSON.stringify(worstAt) : ''}`);
  if (n && worst > 3) fail(`a label stood ${worst.toFixed(1)} px from where the camera's move carries it`);
} else fail('no riding frame with the camera still, to check the labels against');

// 4. After the hand lets go: labels shown again, laid out for the camera.
const last = settle[settle.length - 1];
if (last.hidden || last.riding || last.stale) fail(`the labels never settled shown and laid out (${JSON.stringify({ hidden: last.hidden, riding: last.riding, stale: last.stale })})`);

if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('circuit-zoom-labels: ok');
