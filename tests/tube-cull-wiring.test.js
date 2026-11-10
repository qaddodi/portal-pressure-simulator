// The Tube's cull wired in (brief PD part 3, 10 Nov 2026): the world rectangle of the layer, the inside flags kept with the geometry bundle, and the stage 2 buckets that
// leave the rows outside the layer out. Node only; nothing here reads the text of src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerRect, cullUpdate } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';

const out = () => ({ rect: new Float64Array(4), ok: false });

test('layerRect: the layer\'s window one pixel out, taken back through the view; none for a singular view or an empty layer', () => {
  const r = layerRect([2, 0, 0, 2, 10, 20], 0, 0, 100, 60, out());
  assert.ok(r.ok);
  assert.deepEqual([...r.rect], [(-1 - 10) / 2, (-1 - 20) / 2, (101 - 10) / 2, (61 - 20) / 2]);
  const flip = layerRect([1, 0, 0, -1, 0, 100], 50, 10, 20, 30, out());   // (y flipped)
  assert.deepEqual([...flip.rect], [49, 100 - 41, 71, 100 - 9]);
  const rot = layerRect([0, 1, -1, 0, 0, 0], 0, 0, 10, 10, out());   // (a quarter turn: still a box round the corners)
  assert.ok(rot.ok && rot.rect[0] < rot.rect[2] && rot.rect[1] < rot.rect[3]);
  assert.equal(layerRect([0, 0, 0, 0, 0, 0], 0, 0, 10, 10, out()).ok, false);
  assert.equal(layerRect([1, 0, 0, 1, 0, 0], 0, 0, 0, 10, out()).ok, false);
});

// A bundle of three rows along x, each a straight line of N_SAMPLES points: row r at y = 10 r, from x = 100 r to 100 r + 50.
function bundle(n = 3) {
  const N = 64, pts = new Float32Array(n * 32 * 4), on = new Uint8Array(n).fill(1);
  for (let r = 0; r < n; r++) for (let i = 0; i < N; i++) { const o = (r * 32 + (i >> 1)) * 4 + (i & 1) * 2; pts[o] = 100 * r + (50 * i) / (N - 1); pts[o + 1] = 10 * r; }
  return { gen: 1, pts: { pts, on } };
}
const view = (rect, pad = 0, rmax = [1, 1, 1]) => ({ rect, pad, rmax, ok: true });

test('cullUpdate: the mask holds the rows whose box meets the rectangle; the key moves only when the mask does', () => {
  const B = bundle(), v = view([120, -5, 160, 25]);
  const C = cullUpdate(B, 3, v);
  assert.deepEqual([...C.mask.slice(0, 3)], [0, 1, 0]);
  assert.equal(C.total, 3);
  const k = C.key;
  assert.equal(cullUpdate(B, 3, v).key, k, 'the same view: nothing changed');
  v.rect = [120, -5, 400, 25];
  assert.deepEqual([...cullUpdate(B, 3, v).mask.slice(0, 3)], [0, 1, 1]);
  assert.ok(C.key > k);
  v.rect = [-100, -5, 400, 25]; cullUpdate(B, 3, v);
  assert.deepEqual([...C.mask.slice(0, 3)], [1, 1, 1]);
});

test('cullUpdate: pad grows the reach (a row\'s glow), a row without points is never inside, a new binning or a wider lumen makes the boxes again', () => {
  const B = bundle(), v = view([160, -5, 185, 25]);
  const C = cullUpdate(B, 3, v);
  assert.deepEqual([...C.mask.slice(0, 3)], [0, 0, 0], 'row 1 ends at x 150');
  v.pad = 12;
  assert.deepEqual([...cullUpdate(B, 3, v).mask.slice(0, 3)], [0, 1, 0], 'its glow reaches 162');
  B.pts.on[1] = 0;
  B.gen++;
  assert.deepEqual([...cullUpdate(B, 3, v).mask.slice(0, 3)], [0, 0, 0], 'a row with no points: out, after a new binning');
  B.pts.on[1] = 1; B.gen++;
  v.pad = 0; v.rmax = [1, 1, 1];
  assert.deepEqual([...cullUpdate(B, 3, v).mask.slice(0, 3)], [0, 0, 0]);
  v.rmax = [1, 12, 1];   // row 1's lumen is 12 wide now: its box reaches 162, over the rectangle's edge
  assert.deepEqual([...cullUpdate(B, 3, v).mask.slice(0, 3)], [0, 1, 0]);
});

test('cullUpdate keeps its record with the bundle: another bundle has its own, and coming back changes nothing', () => {
  const A = bundle(), B = bundle(), v = view([120, -5, 160, 25]);
  const ca = cullUpdate(A, 3, v), cb = cullUpdate(B, 3, v);
  assert.notEqual(ca, cb);
  const k = ca.key;
  cullUpdate(B, 3, v);
  assert.equal(cullUpdate(A, 3, v).key, k);
});

const strips = (log) => log.filter((c) => c.call === 'strips');
const upload = (log) => log.filter((c) => c.call === 'bufferSubData').length;

test('stage 2 leaves the rows outside the layer out of the buckets, and the gauge says how many are drawn of how many', () => {
  const v = { rect: [96, -10, 200, 10], pad: 0, rmax: [6, 4, 3] };
  const h = makeHarness({ view: v });
  h.run();
  assert.match(h.gauges.map((x) => x[1]).join('\n'), /strips drawn 1 of 3\b/);
  const lean = strips(h.log).filter((c) => /^tubeLean|^tubeDepth/.test(c.prog));
  assert.ok(lean.length > 0 && lean.every((c) => c.n === 1), 'one row drawn in each pass');
  v.rect = [-10, -10, 200, 90];
  h.run();
  assert.match(h.gauges.map((x) => x[1]).join('\n'), /strips drawn 3 of 3\b/);
});

test('a frame with the same view uploads no rows again; a changed set does', () => {
  const v = { rect: [96, -10, 200, 10], pad: 0, rmax: [6, 4, 3] };
  const h = makeHarness({ view: v });
  h.MG.tv = 0;   // (the tube rows' stamp, which veins-gl.js bumps when they change)
  h.run();
  assert.ok(upload(h.log) > 0);
  h.run();
  assert.equal(upload(h.log), 0, 'the second frame sends nothing new to the row buffer');
  v.rect = [-10, -10, 200, 90];
  h.run();
  assert.ok(upload(h.log) > 0 && h.gauges.some((x) => /drawn 3 of 3/.test(x[1])), 'a changed set is bucketed and sent again');
});

test('no view given, a view that is not usable, or the change between the views (joinBase >= 0): nothing is culled', () => {
  for (const make of [() => makeHarness({}), () => makeHarness({ view: { ok: false, rect: [0, 0, 1, 1] } })]) {
    const h = make();
    h.run();
    assert.match(h.gauges.map((x) => x[1]).join('\n'), /strips drawn 3 of 3 \(not culled\)/);
  }
});

test('during the change between the views (a morph set in use, joinBase >= 0) nothing is culled: the points move every frame', () => {
  const h = makeHarness({ view: { rect: [96, -10, 200, 10], pad: 0, rmax: [6, 4, 3] }, morph: { joinBase: 0 } });
  h.run();
  assert.match(h.gauges.map((x) => x[1]).join('\n'), /strips drawn 3 of 3 \(not culled\)/);
});
