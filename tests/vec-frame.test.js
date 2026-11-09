import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVecFrame, D, REFUSED, MAX_BOXES, WHOLE_SHARE, addBox } from '../src/ui/vec-frame.js';

// vec-frame.js (workstream E): the change table of docs/recommendations/vector-renderer-plan.md section 7, as a planner. The tests drive it
// the way the renderer does: plan() then done() each frame, with a stand-in for the compiled grid's row boxes.

const W = 1000, H = 800, N = 20;
const M0 = [1, 0, 0, 1, 0, 0];
const look = () => ({ reach: 4, shOff: [1, 1], casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0.2], sheen: [1, 1, 1, 0.1], shade: [0, 0, 0, 0.1], ring: [1, 1, 1, 1], light: [0, -1], netAlpha: 1, fx: true, tierAlpha: [1, 1], tierGroup: [1, 1], organs: 0 });
const calm = () => ({ on: true, bt: 5, clock: 1, streakA: 1, chevA: 1, originA: 1, alpha: 1 });
// A row's cells are a 100 × 100 px box at (row × 40, 100).
const boxes = (marks, m, out) => {
  let n = 0;
  for (let r = 0; r < N; r++) if (marks[r]) n = addBox(out, n, r * 40, 100, r * 40 + 100, 200);
  return n;
};
const run = (f, m = M0, lk = look(), bl = calm(), whole = false) => { const P = f.plan(m, W, H, lk, bl, false, whole, boxes); const o = { full: P.full, base: P.base, blood: P.blood, writesBase: P.writesBase, passes: P.passes, nFull: P.nFull, nBase: P.nBase, why: P.why }; f.done(); return o; };

test('the first frame is a whole FULL; the next, with nothing changed, draws nothing', () => {
  const f = createVecFrame(N);
  const a = run(f);
  assert.equal(a.full, 1);
  assert.equal(a.base, 0, 'the first picture writes no base');
  assert.equal(f.baseOk, false);
  const b = run(f, M0, look(), calm());
  assert.equal(b.passes, 0, 'nothing drawn');
  assert.equal(b.why, 'nothing changed');
});

test('a pan draws FULL every frame and never writes the base', () => {
  const f = createVecFrame(N);
  run(f);
  for (let i = 1; i <= 10; i++) {
    const o = run(f, [1, 0, 0, 1, i * 3, i], look(), calm());
    assert.equal(o.full, 1);
    assert.equal(o.base, 0);
    assert.equal(o.writesBase, false);
    assert.equal(o.blood, 0, 'FULL carries the blood');
    assert.equal(f.baseOk, false);
  }
});

test('the frame where motion ends writes the base once; then blood frames draw the blood alone', () => {
  const f = createVecFrame(N);
  run(f);
  run(f, [1, 0, 0, 1, 9, 3]);   // a pan frame
  const still = (bt) => { const b = calm(); b.bt = bt; return run(f, [1, 0, 0, 1, 9, 3], look(), b); };
  const end = still(6);
  assert.equal(end.writesBase, true, 'the base is written when the blood first needs it');
  assert.equal(end.base, 1);
  assert.equal(end.blood, 1);
  assert.equal(end.full, 0, 'the picture stands as the last FULL left it');
  assert.equal(end.passes, 2);
  assert.equal(f.baseOk, true);
  for (let i = 0; i < 5; i++) {
    const o = still(7 + i);
    assert.deepEqual([o.full, o.base, o.blood, o.writesBase], [0, 0, 1, false], 'one pass: the blood');
    assert.equal(o.passes, 1);
  }
});

test('a colour change at rest redraws the rows\' boxes in the picture and the base, and the blood only if it moved', () => {
  const f = createVecFrame(N);
  run(f); run(f, M0, look(), Object.assign(calm(), { bt: 6 }));   // base written
  assert.equal(f.baseOk, true);
  f.noteRow(3, D.TUBES); f.noteRow(4, D.TUBES);
  const o = run(f, M0, look(), Object.assign(calm(), { bt: 6 }));
  assert.equal(o.full, 2); assert.equal(o.base, 2); assert.equal(o.blood, 0);
  assert.ok(o.nFull >= 1 && o.nFull <= MAX_BOXES);
  assert.equal(o.nBase, o.nFull, 'the base follows the same boxes');
  assert.equal(f.rowsMarked, 0, 'the marks are cleared by done()');
});

test('rows whose boxes cover most of the picture are one whole FULL', () => {
  const f = createVecFrame(N);
  run(f);
  const big = (marks, m, out) => { out[0] = 0; out[1] = 0; out[2] = W; out[3] = H * (WHOLE_SHARE + 0.1); return 1; };
  f.noteRow(1, D.TUBES);
  const P = f.plan(M0, W, H, look(), calm(), false, false, big);
  assert.equal(P.full, 1); assert.match(P.why, /most of the picture/);
});

test('a morph is a whole FULL every frame, and the frame after it ends is whole too', () => {
  const f = createVecFrame(N);
  run(f);
  f.setMorph(true);
  for (let i = 0; i < 4; i++) { const o = run(f); assert.equal(o.full, 1); assert.equal(o.why, 'morph'); }
  f.setMorph(false);
  assert.equal(run(f).full, 1, 'the end of the morph');
  assert.equal(run(f).passes, 0);
});

test('a bleed repaints whole while it lasts and once after', () => {
  const f = createVecFrame(N);
  run(f);
  const bleed = () => Object.assign(calm(), { bleed: [[1]] });
  assert.equal(run(f, M0, look(), bleed()).full, 1);
  assert.equal(run(f, M0, look(), bleed()).full, 1);
  assert.equal(run(f, M0, look(), calm()).full, 1, 'once after');
  assert.equal(run(f, M0, look(), calm()).passes, 0);
});

test('organs and overlays: a box redraws the picture there; only organs and under-overlays touch the base', () => {
  const f = createVecFrame(N);
  run(f); run(f, M0, look(), Object.assign(calm(), { bt: 9 }));
  f.noteBox(D.ORGANS, 10, 10, 60, 60);
  let o = run(f, M0, look(), Object.assign(calm(), { bt: 9 }));
  assert.deepEqual([o.full, o.base, o.nFull, o.nBase], [2, 2, 1, 1]);
  f.noteBox(D.OVER, 200, 200, 260, 260);
  o = run(f, M0, look(), Object.assign(calm(), { bt: 9 }));
  assert.deepEqual([o.full, o.base, o.nFull, o.nBase], [2, 0, 1, 0], 'over-overlays leave the base alone');
  f.noteBox(D.ORGANS);
  assert.equal(run(f, M0, look(), Object.assign(calm(), { bt: 9 })).full, 1, 'no box: everywhere');
});

test('a changed look or a new size is a whole FULL', () => {
  const f = createVecFrame(N);
  run(f);
  const lk = look(); lk.netAlpha = 0.4;
  assert.equal(run(f, M0, lk, calm()).full, 1);
  const P = f.plan(M0, W + 2, H, lk, calm(), false, false, boxes);
  assert.equal(P.full, 1); assert.equal(P.why, 'size changed');
});

test('blood switched off draws the lumens once more without it; blood off and still draws nothing', () => {
  const f = createVecFrame(N);
  run(f); run(f, M0, look(), calm());
  const off = Object.assign(calm(), { on: false });
  const o = run(f, M0, look(), off);
  assert.equal(o.blood, 1);
  assert.equal(run(f, M0, look(), off).passes, 0);
});

test('drawRows\' refusals use veins-gl\'s reasons', () => {
  const f = createVecFrame(N);
  assert.equal(f.refusal(M0, W, H, false, [1]), REFUSED.NO_KEPT);
  run(f);
  assert.equal(f.refusal(M0, W, H, false, [1]), '');
  assert.equal(f.refusal(M0, W, H, true, [1]), REFUSED.LOST);
  assert.equal(f.refusal(M0, W + 1, H, false, [1]), REFUSED.SIZE);
  assert.equal(f.refusal([1, 0, 0, 1, 5, 0], W, H, false, [1]), REFUSED.MOVED);
  f.noteRow(2, D.RADII); f.noteRow(5, D.RADII);
  assert.equal(f.refusal(M0, W, H, false, [2]), REFUSED.RADII, 'a changed row not named');
  assert.equal(f.refusal(M0, W, H, false, [2, 5, 7]), '');
});

test('addBox merges touching boxes and folds into the first past the limit', () => {
  const l = new Int32Array(MAX_BOXES * 4);
  let n = addBox(l, 0, 0, 0, 10, 10);
  n = addBox(l, n, 11, 0, 20, 10);
  assert.equal(n, 1); assert.deepEqual(Array.from(l.subarray(0, 4)), [0, 0, 20, 10]);
  n = addBox(l, n, 100, 100, 110, 110);
  assert.equal(n, 2);
  for (let i = 0; i < MAX_BOXES + 4; i++) n = addBox(l, n, 300 + i * 20, 300, 305 + i * 20, 305);
  assert.equal(n, MAX_BOXES);
});

test('the planner allocates nothing in a frame', () => {
  const f = createVecFrame(N);
  const lk = look(), bl = calm(), m = [1, 0, 0, 1, 0, 0];
  run(f, m, lk, bl);
  for (let i = 0; i < 2000; i++) { bl.bt = i; f.noteRow(i % N, D.TUBES); f.plan(m, W, H, lk, bl, false, false, boxes); f.done(); }   // warm
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 4000; i++) { bl.bt = i; m[4] = i & 1; f.noteRow(i % N, D.TUBES); f.plan(m, W, H, lk, bl, false, false, boxes); f.done(); }
  const grown = process.memoryUsage().heapUsed - h0;
  assert.ok(grown < 200 * 1024, `heap grew ${grown} B over 4000 frames`);
});
