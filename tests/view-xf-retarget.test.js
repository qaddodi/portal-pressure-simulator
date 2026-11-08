// Push B, item 3, on the real change code (stage-view.js createView) with the stage's parts stubbed: a change between the views is one clock; a
// framing asked for while it runs becomes its end (the camera goes on from where it stands, on the change's clock, landing as it lands); a hand
// on the view takes the camera from it; the length it reports is VIEW_CHANGE_S, not the 700 ms of the 0.6 s change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const page = installPage();
for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!globalThis[k]) globalThis[k] = page.dom.window[k].bind(page.dom.window);
const { createView } = await import('../src/ui/stage-view.js');
const { VIEW_CHANGE_S, VIEW_CHANGE_MS, viewXfCamU, viewXfDetach } = await import('../src/ui/view-xf.js');
const { lerpVT } = await import('../src/ui/cam-arc.js');

const same = (a, b) => Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
const eq = (a, b) => Math.abs(a.k - b.k) < 1e-9 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

// The stage's frame for the change, as stage.js animate writes it: the morph steps by dt / VIEW_CHANGE_S, the camera is the change's share.
function world(from = { k: 1, x: 0, y: 0 }) {
  const calls = { applied: 0, ended: 0 };
  const ghosts = { freezeGhosts() {}, dropGhosts() {}, crossfade() {}, check() {} };
  const live = { vt: { ...from }, morph: 0, morphTarget: 1, lastMorph: 0, rotU: 0, easeInOut: (t) => t, viewXf: null, F: null, labelGL: ghosts, labelGlSync() {}, handRide: false, drifting: false, xfHold: false, stats: { layouts: 0 }, vtAnim: 0, solvedFor: null };
  const st = { sameView: same, EV: [], geo: {}, CIRC_C: [0, 0], VB_CIRC_R: [0, 0, 1, 1], vbBox: { x: 0, y: 0, width: 1, height: 1 }, rotEase: (u) => u, circTurn: () => ({ on: false, c: 1, s: 0 }),
    applyVT() { calls.applied++; }, refreshCTM() {}, driftEnd() {}, handRideEnd() {}, labelJobDrop() {}, labelSliceRun: () => true, labelTail() {}, updateLabels() {}, sitesPaint() {}, stageBox: () => ({ width: 1, height: 1 }) };
  const v = createView(st, live);
  const frame = (dt) => {   // (one frame of the change)
    const x = live.viewXf;
    live.morph = Math.min(1, live.morph + dt / VIEW_CHANGE_S);
    if (x && !x.same) { const u = viewXfCamU(x, v.viewXfP()); live.vt = u >= 1 ? { ...x.to } : lerpVT(x.from, x.to, u); }
    if (x) v.viewXfStep();
  };
  return { live, v, frame, calls };
}

test('the change reports its own length: VIEW_CHANGE_S from the tap, the camera on its clock', () => {
  const w = world();
  const t0 = performance.now();
  w.v.viewXfStart({ k: 2, x: -100, y: 0 });
  assert.ok(w.live.viewXf && !w.live.viewXf.same);
  assert.equal(w.live.vtMs, VIEW_CHANGE_MS);
  assert.ok(Math.abs(w.live.vtUntil - t0 - VIEW_CHANGE_MS) < 50, `lands ${w.live.vtUntil - t0} ms on, not 700`);
  assert.equal(w.live.vtGliding, true);
  // (a change begun from half way (the learner turned back) has half the length left)
  const h = world(); h.live.morph = 0.5; h.live.morphTarget = 0;
  const t1 = performance.now();
  h.v.viewXfStart({ k: 2, x: -100, y: 0 });
  assert.ok(Math.abs(h.live.vtUntil - t1 - VIEW_CHANGE_MS / 2) < 50);
});

test('a framing asked for at the tap is the change\'s end: one travel, landing exactly on it as the figure lands', () => {
  const w = world();
  w.v.viewXfStart({ k: 1.2, x: -10, y: 0 });
  const framing = { k: 2.6, x: -260, y: -80 };
  assert.equal(w.v.viewXfRetargetTo(framing), true);
  assert.deepEqual(w.live.vtTarget, framing);
  let last = { ...w.live.vt };
  for (let i = 0; i < 200 && w.live.viewXf; i++) {
    w.frame(1 / 60);
    assert.ok(w.live.vt.k >= last.k - 1e-9, 'never turns back');
    last = { ...w.live.vt };
  }
  assert.equal(w.live.viewXf, null, 'the change landed');
  assert.ok(eq(w.live.vt, framing), `on the framing: ${JSON.stringify(w.live.vt)}`);
  assert.equal(w.live.vtGliding, false);
});

test('a framing asked for mid-change keeps the camera where it is that frame (no jump), then lands on the new end with the figure', () => {
  const w = world();
  w.v.viewXfStart({ k: 1.5, x: -60, y: 0 });
  for (let i = 0; i < 25; i++) w.frame(1 / 60);   // (~0.4 of the way)
  const before = { ...w.live.vt }, p = w.v.viewXfP();
  assert.ok(p > 0.2 && p < 0.7 && before.k > 1);
  const framing = { k: 3, x: -400, y: 30 };
  assert.equal(w.v.viewXfRetargetTo(framing), true);
  assert.ok(eq(w.live.vt, before), 'the retarget itself moves nothing');
  const x = w.live.viewXf, u = viewXfCamU(x, p);
  assert.ok(eq(lerpVT(x.from, x.to, u), before), 'and the next frame continues from the same place');
  // frames to the end: monotone toward the framing, and the speed never doubles back
  let prevD = Infinity;
  while (w.live.viewXf) {
    w.frame(1 / 60);
    const d = Math.abs(w.live.vt.k - framing.k);
    assert.ok(d <= prevD + 1e-9, 'closer every frame'); prevD = d;
  }
  assert.ok(eq(w.live.vt, framing));
});

test('a framing the camera is already at leaves the change alone; one asked again replaces the first', () => {
  const w = world({ k: 1, x: 0, y: 0 });
  w.v.viewXfStart({ k: 1, x: 0, y: 0 });   // (the change has nowhere to take the camera)
  assert.equal(w.live.viewXf.same, true);
  assert.equal(w.live.vtGliding, false);
  assert.equal(w.v.viewXfRetargetTo({ k: 1, x: 0, y: 0 }), true);
  assert.equal(w.live.viewXf.same, true, 'still nowhere to go: the stage writes no camera');
  assert.equal(w.v.viewXfRetargetTo({ k: 2, x: -50, y: 0 }), true);
  assert.equal(w.live.viewXf.same, false, 'a framing elsewhere: it travels on the change\'s clock');
  assert.equal(w.live.vtGliding, true);
  w.v.viewXfRetargetTo({ k: 1.6, x: -20, y: 0 });
  for (let i = 0; i < 200 && w.live.viewXf; i++) w.frame(1 / 60);
  assert.ok(eq(w.live.vt, { k: 1.6, x: -20, y: 0 }), 'the last asked is where it lands');
});

test('a hand on the view takes the camera: the change is not retargeted, and its landing does not put the camera back', () => {
  const w = world();
  w.v.viewXfStart({ k: 2, x: -100, y: 0 });
  for (let i = 0; i < 20; i++) w.frame(1 / 60);
  viewXfDetach(w.live.viewXf);
  const hand = { k: 1.9, x: 33, y: 7 };
  w.live.vt = { ...hand };
  assert.equal(w.v.viewXfRetargetTo({ k: 3, x: 0, y: 0 }), false, 'animateVT then runs its own glide, as it does without a change');
  for (let i = 0; i < 200 && w.live.viewXf; i++) w.frame(1 / 60);
  assert.equal(w.live.viewXf, null, 'the figure still finished its morph');
  assert.ok(eq(w.live.vt, hand), 'and the camera stayed with the hand');
});

test('no change running: nothing to retarget', () => {
  const w = world();
  assert.equal(w.v.viewXfRetargetTo({ k: 2, x: 0, y: 0 }), false);
});
