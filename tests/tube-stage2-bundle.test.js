// The Tube's stage 2 record is kept with a geometry bundle (brief "Anatomy to Circuit switch", 10 Nov 2026): a morph set's record is made once, ahead (stage2Prepare), and a set change
// inside the switch swaps references and bins nothing; the entries a swept set lists many times are read once; a second call in a frame with nothing changed uploads nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stage2Prepare, createStage2Data } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';
import { straight, ray } from './tube-web-helpers.js';

const bundleOf = (h, repeat = 1) => {
  const view = Int32Array.from({ length: h.MG.jl.view.length * repeat }, (_, i) => h.MG.jl.view[i % h.MG.jl.view.length]);
  return { ent: h.MG.ent, jl: { n: view.length, view }, pts: h.MG.pts, gen: 1, s2: null };
};
const calls = (h, name) => h.log.filter((c) => c.call === name).length;

test('stage2Prepare makes one record a bundle, once a binning, and reads each listed entry once', () => {
  const h = makeHarness();
  const one = bundleOf(h), many = bundleOf(h, 40);
  const a = stage2Prepare(one, h.E.tubeNow, h.E.nTubes, -1), b = stage2Prepare(many, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(one.s2, a);
  assert.equal(stage2Prepare(one, h.E.tubeNow, h.E.nTubes, -1), a, 'the same record, not made again');
  assert.equal(b.n, a.n, 'a swept set lists each entry many times: read once');
  assert.deepEqual(Array.from(b.R.rows), Array.from(a.R.rows));
  assert.equal(b.W.count, a.W.count);
  assert.deepEqual(Array.from(b.W.data.subarray(0, b.W.count * 12)), Array.from(a.W.data.subarray(0, a.W.count * 12)));
  one.gen++;
  assert.equal(a.gen, 1);
  stage2Prepare(one, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(one.s2.gen, 2, 'a new binning of the bundle: its record is made again, in place');
});

test('a set change swaps the bundle and bins nothing: the records were made ahead', () => {
  const h1 = makeHarness(), h2 = makeHarness({ rows: [{ ...straight(0, 0, 80, 0, 5), tier: 0 }, { ...ray(40, 0, 70, 60, 3), tier: 0 }], joins: [{ x: 40, y: 0, reach: 20, k: 0.3, fillet: 1, members: [0, 1], trunk: 0 }] });
  const A = bundleOf(h1), B = bundleOf(h2);
  stage2Prepare(A, h1.E.tubeNow, h1.E.nTubes, -1); stage2Prepare(B, h2.E.tubeNow, h2.E.nTubes, -1);
  const MG = h1.MG;
  const D = createStage2Data(h1.E.gl, MG);
  MG.B = A; D.frame({}, h1.E.tubeNow, h1.E.nTubes, -1);
  const rowsA = D.tb.count[0], websA = D.wb.n;
  assert.equal(D.binnings, 0, 'nothing binned in a frame: the bundle had its record');
  MG.B = B; D.frame({}, h2.E.tubeNow, h2.E.nTubes, -1);
  assert.equal(D.binnings, 0);
  assert.equal(D.tb.count[0], 2); assert.notEqual(D.tb.count[0], rowsA);
  assert.ok(D.wb.n > 0 && D.wb.n !== websA);
  MG.B = A; D.frame({}, h1.E.tubeNow, h1.E.nTubes, -1);
  assert.equal(D.tb.count[0], rowsA); assert.equal(D.binnings, 0);
  const none = { ent: h1.MG.ent, jl: h1.MG.jl, pts: h1.MG.pts, gen: 1, s2: null };
  MG.B = none; D.frame({}, h1.E.tubeNow, h1.E.nTubes, -1);
  assert.equal(D.binnings, 1, 'a bundle with no record is binned in its first frame, as before');
});

test('a second call in a frame with the tube rows\' stamp unchanged buckets and uploads nothing', () => {
  const h = makeHarness();
  const A = bundleOf(h);
  h.MG.B = A; h.MG.tv = 3;
  const D = createStage2Data(h.E.gl, h.MG);
  h.log.length = 0;
  D.frame({}, h.E.tubeNow, h.E.nTubes, -1);
  const first = calls(h, 'bufferSubData');
  assert.ok(first > 0);
  D.frame({}, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(calls(h, 'bufferSubData'), first, 'the lumen pass after the layer pass: no second upload');
  h.MG.tv = 4;
  D.frame({}, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(calls(h, 'bufferSubData'), first * 2, 'the rows changed: uploaded again');
  const B2 = bundleOf(h);
  h.MG.B = B2;
  D.frame({}, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(calls(h, 'bufferSubData'), first * 3, 'another bundle: uploaded again');
});
