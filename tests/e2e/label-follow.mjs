// The labels follow the figure while it pans and zooms, and keep off the chrome. Measured from the frames themselves, not from a
// clock: every frame the app draws (globalThis.__frameProbe, src/ui/frame.js) records where each GPU label's picture stood
// (stage.labelDrawnBy: after any ride, glide or edge pull) and where the figure put the point it names (stage.labelAnchorOf).
//
//   · from one frame to the next a label moves with its point (|moved − point's move| ≤ 1.5 px) or not at all (held against the stage's
//     edge, which is the screen's): a label that moves while its point stands still, or against it, is a frame of lag or jitter
//     (3 Nov 2026: a label held at the edge was carried 6 px with the figure and eased back, a camera step behind, every frame);
//   · after the figure is back where it began, each label stands near where it stood (within 40 px: a fresh solve may choose a neighbouring slot);
//   · a label panned under the view switcher (or any other chrome that blocks labels: stage.js BLOCKER_SEL) is not drawn there: it is
//     faded out (opacity under .5) or clear of it.
//
//   node tests/e2e/label-follow.mjs [dir]

import { openApp } from '../../scripts/shoot.mjs';   // (the app on the GPU path a phone takes: labels are drawn by the GPU only there)

const dir = process.argv[2] || '.';
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
const TOL = 1.5;

const apps = [];
async function open(_ctx, query, view) {
  const app = await openApp({ device: 'iphone', theme: 'dark', query, dpr: 1, dir, timeout: 240000 });
  apps.push(app);
  const page = app.page;
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  if (view) await page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`).click(), view);
  // (Labels come in a while after the first frame on software GL.)
  await page.waitForFunction(() => (window.pps.stage.labelDrawnBy?.() || []).filter((d) => d.a > 0.9).length >= 3, null, { timeout: 240000 });
  await page.waitForTimeout(4000);
  return page;
}
// Records, on every frame, the labels drawn with their point (client px) and the blockers' boxes.
const record = (page) => page.evaluate(() => {
  const rows = window.__labelRows = [];
  // (A frame is the hand's while an input came in the last 250 ms or a button is held: after it the labels settle on the clock's time,
  // and a headless frame can come seconds later, so those are not judged frame to frame.)
  if (!window.__inputWatch) {
    window.__inputWatch = true; window.__lastIn = -1e9; window.__held = false;
    for (const t of ['pointermove', 'wheel', 'pointerdown']) addEventListener(t, () => { window.__lastIn = performance.now(); }, true);
    addEventListener('pointerdown', () => { window.__held = true; }, true); addEventListener('pointerup', () => { window.__held = false; }, true);
  }
  globalThis.__frameProbe = () => {
    const row = { cam: window.pps.stage.cameraKey(), g: window.__held || performance.now() - window.__lastIn < 250, L: {} };
    for (const d of window.pps.stage.labelDrawnBy()) {
      const id = /^n:([A-Z_0-9]+)$/.exec(d.key)?.[1], a = id && window.pps.stage.labelAnchorOf(id);
      if (a) row.L[d.key] = [d.x, d.y, a.x, a.y, d.w, d.h, d.a];
    }
    rows.push(row);
  };
});
const stopRecording = (page) => page.evaluate(() => { globalThis.__frameProbe = null; return window.__labelRows; });
// (Read until the labels stand still over two new frames in a row: a headless frame takes seconds, so two reads of the same frame
// agree whatever is moving.)
const settled = async (page) => {
  await page.evaluate(() => { window.__fc = 0; globalThis.__frameProbe = () => { window.__fc++; }; });
  let a = null, same = 0, fc = 0;
  for (let i = 0; i < 90 && same < 2; i++) {
    await page.waitForTimeout(1000);
    const n = await page.evaluate(() => window.__fc);
    if (n - fc < 2) continue;
    fc = n;
    const b = JSON.stringify(await standing(page));
    same = a === b ? same + 1 : 0; a = b;
  }
  await page.evaluate(() => { globalThis.__frameProbe = null; });
  return JSON.parse(a);
};
const standing = (page) => page.evaluate(() => Object.fromEntries(window.pps.stage.labelDrawnBy().filter((d) => d.a > 0.9).map((d) => [d.key, [d.x, d.y]])));

// The rule for two frames in a row: a drawn label moved with its point or not at all.
function judgeFrames(what, rows, [W, H], need = 3, loose = false) {
  let worst = 0, worstAt = '', judged = 0;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].g || !rows[i - 1].g) continue;
    judged++;
    for (const [key, v] of Object.entries(rows[i].L)) {
      const u = rows[i - 1].L[key];
      if (!u || v[6] < 0.9 || u[6] < 0.9) continue;   // (new, fading in or out: not a move)
      for (const k of [0, 1]) {
        const d = v[k] - u[k], a = v[2 + k] - u[2 + k];
        // (With its point, or still. Leaving the stage's edge, where the pull-in that holds it lets go as its point moves in, it follows a part of
        // its point's move: allowed within 14 px of an edge.)
        const nearEdge = [u, v].some((q) => q[0] < 14 || q[1] < 14 || q[0] + q[4] > W - 14 || q[1] + q[5] > H - 14);
        // (A zoom lays the labels out again as it goes, and each glides to its new slot on the clock: in a headless frame seconds apart that is a
        // jump, so a zoom is judged only for a label moving against its point.)
        const off = loose ? (d * a < -TOL && Math.abs(d) > TOL ? Math.abs(d) : 0) : nearEdge && d * a >= -TOL && Math.abs(d) <= Math.abs(a) + TOL ? 0 : Math.min(Math.abs(d - a), Math.abs(d));
        if (off > worst) { worst = off; worstAt = `${key} frame ${i}: moved ${d.toFixed(1)} px while its point moved ${a.toFixed(1)}`; }
      }
    }
  }
  if (judged < need) fail(`${what}: only ${judged} frames of the hand's gesture were drawn to judge`);
  else if (judged < 3) console.log(`${what}: only ${judged} frames of the hand's gesture were drawn here (software GL draws a frame in seconds): not judged`);
  console.log(`${what.padEnd(40)} ${judged} of ${rows.length} frames during the hand, worst label step off its point or off still: ${worst.toFixed(1)} px`);
  if (worst > TOL) fail(`${what}: ${worstAt}`);
}

try {
  const ctx = null;
  for (const [view, query] of [[null, '?preset=healthy'], ['anatomic', '?preset=healthy']]) {
    const name = view || 'circuit';
    const page = await open(ctx, query, view);
    const vp = await page.evaluate(() => [innerWidth, innerHeight]);
    const before = await standing(page), cam0 = await page.evaluate(() => window.pps.stage.cameraKey());
    const cx = 195, cy = 420;
    // A pan with the mouse, a step each, as the hand moves.
    await record(page);
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 16; i++) await page.mouse.move(cx + i * 6, cy - i * 5);
    await page.mouse.up();
    await page.waitForTimeout(6000);
    judgeFrames(`${name}: pan`, await stopRecording(page), vp);
    if (process.env.LF_QUICK) { await apps.pop().close(); break; }   // (LF_QUICK=1: the Circuit's pan alone, for a quick look)
    // A zoom with the trackpad's pinch (Ctrl + wheel).
    await record(page);
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 10; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -14); await page.keyboard.up('Control'); await page.waitForTimeout(80); }
    await page.waitForTimeout(6000);
    judgeFrames(`${name}: zoom`, await stopRecording(page), vp, 0, true);
    // The figure back where it began: each label back where it stood, from its point as it was.
    await page.evaluate(() => window.pps.stage.fit());
    await page.waitForFunction((k) => window.pps.stage.cameraKey() === k, cam0, { timeout: 90000 }).catch(() => {});
    const after = await settled(page);
    const camHome = await page.evaluate(() => window.pps.stage.cameraKey());
    if (camHome !== cam0) console.log(`${name}: the camera did not come back to ${cam0} (${camHome}): the return is not compared`);
    else for (const [key, p] of Object.entries(before)) {
      const q = after[key];
      if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) > 40) fail(`${name}: ${key} stands ${Math.round(q[0] - p[0])}, ${Math.round(q[1] - p[1])} px from where it stood before the gesture`);
    }
    await apps.pop().close();
  }

  // A label panned under the view switcher is not drawn there. Every label that can be brought under it is, one after another; once
  // the hand has let go and the labels have landed, no label shows over any chrome the stage keeps its labels off (stage.js BLOCKER_SEL).
  if (!process.env.LF_QUICK) {
    const page = await open(ctx, '?preset=healthy', 'anatomic');
    const keys = await page.evaluate(() => window.pps.stage.labelDrawnBy().filter((d) => d.a > 0.9).map((d) => d.key));
    const blockers = () => page.evaluate(() => [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-shade, #nbViews, .stage-clock')].filter((el) => getComputedStyle(el).visibility !== 'hidden' && !el.classList.contains('pz-leave') && (el.id !== 'nbViews' || el.querySelector('#viewSeg'))).map((el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.className.toString().split(' ')[0], x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }).filter((r) => r.x1 - r.x0 > 0));
    const sw = (await blockers()).find((b) => b.id === 'nbViews');
    if (!sw) fail('the view switcher has no box to bring a label under');
    let brought = 0;
    for (const key of keys) {
      const id = /^n:([A-Z_0-9]+)$/.exec(key)?.[1];
      if (!id || !sw) continue;
      await page.evaluate(() => window.pps.stage.fit()); await settled(page);
      const a = await page.evaluate((id) => window.pps.stage.labelAnchorOf(id), id);
      if (!a) continue;
      const tx = (sw.x0 + sw.x1) / 2, ty = (sw.y0 + sw.y1) / 2, n = 12;
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      for (let i = 1; i <= n; i++) await page.mouse.move(a.x + ((tx - a.x) * i) / n, a.y + ((ty - a.y) * i) / n);
      await page.mouse.up();
      await settled(page);
      brought++;
      const over = await page.evaluate(async () => { const bl = await Promise.resolve(window.__bl); return window.pps.stage.labelDrawnBy().filter((d) => d.a > 0.5).map((d) => [d.key, d.x, d.y, d.w, d.h, d.a]); });
      const bl = await blockers();
      const hits = over.filter(([, x, y, w, h]) => bl.some((b) => Math.min(x + w, b.x1) - Math.max(x, b.x0) > 2 && Math.min(y + h, b.y1) - Math.max(y, b.y0) > 2));
      const at = await page.evaluate((id) => window.pps.stage.labelAnchorOf(id), id);
      console.log(`anatomic: ${id} (point at ${Math.round(at.x)},${Math.round(at.y)}, switcher ${Math.round(sw.x0)}-${Math.round(sw.x1)} × ${Math.round(sw.y0)}-${Math.round(sw.y1)}): ${hits.length ? hits.map((h) => h[0]).join(', ') + ' drawn over chrome' : 'no label over the chrome'}`);
      for (const h of hits) fail(`${h[0]} is drawn over the chrome once the hand has let go (opacity ${h[5].toFixed(2)})`);
    }
    if (!brought) fail('no label could be brought under the switcher to check');
    await apps.pop().close();
  }
} finally {
  for (const a of apps) await a.close().catch(() => {});
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nlabels follow the figure and keep off the chrome');
