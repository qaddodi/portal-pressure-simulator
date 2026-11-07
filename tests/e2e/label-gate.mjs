// THE LABEL GATE (W1 of the unified-label plan, 3 Nov 2026). Labels must stand 100 % on the figure through every motion, in every view.
// Reads what the GPU drew, never the page's model: label-gl's snapshot (Anatomy, Circuit), caption-gl's snapshot with its leaders
// (lobule, sinusoid), against the point each label names, once per frame the app draws (globalThis.__frameProbe, src/ui/frame.js).
//
// Rules (tests/e2e/label-gate-judge.mjs, unit-tested in tests/label-gate-judge.test.js), limits in DEVICE px:
//   1. per-frame anchor error <= 0.5: from frame to frame a label keeps its offset from the point it names (lag and jitter fail);
//   2. its dot (Anatomy/Circuit) stands <= 0.5 on its point in every frame;
//   3. no frame draws a label laid out for another view (0 frames);
//   4. (shown, not failed) the last frames' drift at rest: a landing solve may move a label once, by design.
// Motions: pinch (ctrl+wheel), pan (drag), presenter glide (slide to slide), view switch (Anatomy <-> Circuit, and into the lobule).
//
//   node tests/e2e/label-gate.mjs [dir]
//   ENGINE=webkit|chromium  (default chromium; CI runs both)   DEVICE=iphone|mac (default iphone)   DPR=n (default the device's own: 3 on iphone)
//   GATE_ONLY=anatomic,circuit,lobule,sinusoid,switch,presenter  GATE_LIMIT=0.5
// Exit 1 on a failed rule; exit 2 (INCONCLUSIVE) when too few frames were drawn to judge a motion (never a pass).
import { webkit } from 'playwright';
import { openApp } from '../../scripts/shoot.mjs';
import { anchorError, dotError, foreignFrames, restDrift, pointTravel } from './label-gate-judge.mjs';

const dir = process.argv[2] || '.';
const engine = process.env.ENGINE || 'chromium', device = process.env.DEVICE || 'iphone';
const dpr = process.env.DPR ? +process.env.DPR : undefined;
const limit = +process.env.GATE_LIMIT || 0.5;
const only = (process.env.GATE_ONLY || 'anatomic,circuit,lobule,sinusoid,switch,presenter').split(',');
const MIN = +process.env.GATE_MIN || 3;
let failed = 0, inconclusive = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
const unsure = (m) => { inconclusive++; console.log(`INCONCLUSIVE ${m}`); };

/** One frame's rows, read in the page at the end of every frame the app draws. kind: 'gl' (Anatomy, Circuit), 'lobule', 'sinusoid'. */
const RECORD = (kind) => {
  const st = window.pps.stage, G = window.__gate = { rows: [], last: -1, on: 0, kind };
  globalThis.__frameProbe = () => {
    const L = {}, view = document.querySelector('#viewSeg [aria-pressed="true"]')?.dataset.view || '';
    let seq;
    if (kind === 'gl') {
      const snap = st.labelSnapshot();
      seq = snap.seq;
      if (seq === G.last) return;
      const dots = new Map();
      for (const m of snap.marks || []) if (m.kind !== 'line') dots.set(m.k, m);
      for (const d of snap.items) {
        const id = /^n:([A-Z_0-9]+)$/.exec(d.key)?.[1], a = id && st.labelAnchorOf(id);
        if (!a) continue;
        const m = dots.get(d.key);
        // (A label or dot standing anywhere but on this view's own point was laid out for another view.)
        const foreign = (d.pin && Math.hypot(d.px - a.x, d.py - a.y) > 2) || (m && Math.hypot(m.x0 - a.x, m.y0 - a.y) > 2);
        L[d.key] = { x: d.x, y: d.y, w: d.w, h: d.h, a: d.a, ax: a.x, ay: a.y, dx: m ? m.x0 : null, dy: m ? m.y0 : null, glide: !!d.glide, foreign: !!foreign };
      }
    } else {
      const snap = kind === 'lobule' ? st.lobuleCaptions() : st.sinusoidCaptions();
      if (!snap) return;
      seq = snap.seq;
      if (seq === G.last) return;
      // (The lobule's leaders are drawn by their own layer: their point ends come from stage.lobuleLeaderEnds; the sinusoid's by the names' layer: the snapshot's leads.)
      const pts = new Map(kind === 'lobule' ? st.lobuleLeaderEnds().map((e) => [e.key, { x0: e.px, y0: e.py, a: 1 }]) : (snap.leads || []).map((l) => [l.key, l]));
      // (A label gliding to its new spot after the hand let go is eased on the page's curve, not lagging: judged once it lands. Never during the gesture.)
      const gliding = kind === 'lobule' && !!st.lobuleGliding?.();
      for (const i of snap.items) { const l = pts.get(i.key); if (l) L[i.key] = { x: i.x, y: i.y, w: i.w, h: i.h, a: Math.min(i.a, l.a), ax: l.x0, ay: l.y0, dx: null, dy: null, glide: kind === 'lobule' && gliding, foreign: false }; }
    }
    G.last = seq;
    G.rows.push({ g: G.on, view, seq, L });
  };
};
const stop = (page) => page.evaluate(() => { globalThis.__frameProbe = null; return window.__gate.rows; });
const on = (page, v) => page.evaluate((v) => { window.__gate.on = v; }, v);

/** The shared check: rules 1 to 4 on the rows of one motion. */
function judge(what, rows, size, dprNow, need = MIN, hiddenInMotion = false) {
  const a = anchorError(rows, size, dprNow, limit), d = dotError(rows, dprNow), f = foreignFrames(rows);
  const rest = restDrift(rows.slice(-4).map((r) => ({ ...r, g: 1 })), dprNow);
  console.log(`${what.padEnd(34)} ${a.judged} judged frames (${a.frames} with labels), anchor error worst ${a.worst.toFixed(2)} dev px, dots ${d.worst.toFixed(2)} (${d.n}), foreign frames ${f.length}, points moved ${pointTravel(rows).toFixed(0)} px, rest drift ${rest.worst.toFixed(2)}`);
  if (a.worst > limit) fail(`${what}: ${a.worstAt} (limit ${limit})`);
  if (d.worst > limit) fail(`${what}: ${d.worstAt} (limit ${limit})`);
  for (const x of f.slice(0, 5)) fail(`${what}: another view's layout drawn: ${x}`);
  // (Rest drift is shown, not failed: a pinch or pan lands a fresh solve that may move a label once, to its new slot, by design.)
  const travel = pointTravel(rows), landed = rows.some((r) => Object.values(r.L).some((p) => p.a > 0.9));
  // (hiddenInMotion: the app draws no label while the slide glides, by design; they must be there after it, on their points, and none drawn wrongly in between.)
  if (hiddenInMotion && !a.frames && landed) console.log(`${what}: no label drawn during the glide (by design); ${rows.filter((r) => Object.keys(r.L).length).length} frames drew labels after it (dot samples: ${d.n})`);
  else if (!landed && hiddenInMotion) unsure(`${what}: no label was drawn even after the glide`);
  else if (travel < 5 && what.includes(':')) unsure(`${what}: the points moved only ${travel.toFixed(1)} px, so nothing was proven (the gesture did not move this view)`);
  else if (!a.worst && a.frames < need && !f.length) unsure(`${what}: only ${a.frames} frames with a label to judge (need ${need})`);
}

const browser = engine === 'webkit' ? await webkit.launch() : undefined;
const apps = [];
async function open(view, kind) {
  const app = await openApp({ device, theme: 'dark', query: '?preset=healthy', dpr, dir, timeout: 240000, ...(browser ? { browser } : {}) });
  apps.push(app);
  const page = app.page;
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  if (view) await page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`).click(), view);
  if (kind === 'gl') await page.waitForFunction(() => (window.pps.stage.labelSnapshot().items || []).filter((d) => d.a > 0.9).length >= 3, null, { timeout: 240000 });
  else {
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 240000, polling: 1000 });
    if (kind === 'sinusoid') {
      await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
      await page.waitForFunction(() => window.pps.stage.sinusoidOpen(), null, { timeout: 240000, polling: 1000 });
    }
    const cap = kind === 'lobule' ? 'lobuleCaptions' : 'sinusoidCaptions';
    await page.waitForFunction((c) => (window.pps.stage[c]()?.items || []).filter((i) => i.a > 0.9).length >= 3, cap, { timeout: 240000, polling: 1000 });
  }
  await page.waitForTimeout(4000);
  const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
  return { page, size: [W, H], dpr: await page.evaluate(() => devicePixelRatio) };
}
const stable = async (page, ms = 4000) => { await page.waitForTimeout(ms); };

async function pinchAndPan(name, view, kind) {
  const { page, size, dpr: r } = await open(view, kind);
  const cx = size[0] / 2, cy = size[1] * 0.5;
  await page.evaluate(RECORD, kind);
  // Pan: a drag, a step each.
  await on(page, 1);
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(cx + i * 6, cy - i * 5);
  await page.mouse.up();
  await stable(page, 600); await on(page, 0); await stable(page, 5000);
  judge(`${name}: pan`, await stop(page), size, r);
  // Pinch: the trackpad's pinch (ctrl + wheel).
  await page.evaluate(RECORD, kind);
  await on(page, 1);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 10; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -14); await page.keyboard.up('Control'); await page.waitForTimeout(80); }
  await stable(page, 600); await on(page, 0); await stable(page, 5000);
  judge(`${name}: pinch`, await stop(page), size, r);
  await apps.pop().close();
}

async function viewSwitch() {
  const { page, size, dpr: r } = await open('anatomic', 'gl');
  const click = (v) => page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`).click(), v);
  for (const [from, to] of [['anatomic', 'circuit'], ['circuit', 'anatomic']]) {
    await page.evaluate(RECORD, 'gl');
    await on(page, 1);
    await click(to);
    await page.waitForFunction(() => { const s = window.pps.stage; return !s.gliding() && !s.drifting() && !s.labelSolving(); }, null, { timeout: 120000, polling: 250 }).catch(() => {});
    await stable(page, 3000); await on(page, 0); await stable(page, 3000);
    judge(`switch ${from} -> ${to}`, await stop(page), size, r, 2);
  }
  await apps.pop().close();
}

async function presenterGlide() {
  const { page, size, dpr: r } = await open('anatomic', 'gl');
  await page.evaluate(() => window.pps.presenter.start('circulation', 0));
  await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 240000 });
  await page.waitForFunction(() => !window.pps.presenter.busy(), null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  // (The circulation deck's first slides draw no labels; slide 3 is the first that does. Walk to slide 2 unrecorded, then judge the glide into slide 3.)
  for (const k of [1, 2]) { await page.evaluate((k) => window.pps.presenter.go(k), k); await page.waitForFunction(() => !window.pps.presenter.busy(), null, { timeout: 240000 }); }
  await page.waitForTimeout(2000);
  await page.evaluate(RECORD, 'gl');
  await on(page, 1);
  await page.evaluate(() => window.pps.presenter.go(3));
  await page.waitForFunction(() => !window.pps.presenter.busy(), null, { timeout: 240000 });
  await page.waitForFunction(() => window.pps.stage.labelSnapshot().items.length >= 3, null, { timeout: 240000, polling: 500 }).catch(() => {});
  await stable(page, 3000); await on(page, 0); await stable(page, 3000);
  judge('presenter glide into slide 3', await stop(page), size, r, 2, true);
  await apps.pop().close();
}

try {
  if (only.includes('anatomic')) await pinchAndPan('anatomic', 'anatomic', 'gl');
  if (only.includes('circuit')) await pinchAndPan('circuit', null, 'gl');
  if (only.includes('switch')) await viewSwitch();
  if (only.includes('presenter')) await presenterGlide();
  if (only.includes('lobule')) await pinchAndPan('lobule', 'lobule', 'lobule');
  if (only.includes('sinusoid')) await pinchAndPan('sinusoid', 'lobule', 'sinusoid');
} finally {
  for (const a of apps) await a.close().catch(() => {});
  await browser?.close();
}
if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
if (inconclusive) { console.log(`\n${inconclusive} INCONCLUSIVE (too few frames to judge): not a pass`); process.exit(2); }
console.log('\nlabels stand on the figure through every motion');
