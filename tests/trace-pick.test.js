// LOOK-9 / CHART-2 (bible review 19 Nov 2026): a long pulsatile series is thinned to about two points a pixel column. Keeping every stride-th sample from the window's first
// index changed the kept set as the window slid, so a crest was drawn at one frame and skipped at the next (shimmer). trace-pick.js keeps the lowest and highest of each run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTrace, picked, PEN_UP } from '../src/ui/trace-pick.js';

const N = 3000, STRIDE = 7;
const series = (shift) => { const y = new Float32Array(N); for (let i = 0; i < N; i++) y[i] = Math.sin((i + shift) * 0.31) * 40 + Math.sin((i + shift) * 0.047) * 10; return y; };
const drawnRange = (ys) => {
  const k = pickTrace(ys, ys.length, STRIDE), P = picked();
  let lo = Infinity, hi = -Infinity;
  for (let q = 0; q < k; q++) { const v = ys[P[q]]; if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
};

test('sliding the window one sample at a time keeps the drawn crest and trough steady (within 1%)', () => {
  const his = [], los = [];
  for (let shift = 0; shift < 200; shift++) { const [lo, hi] = drawnRange(series(shift)); los.push(lo); his.push(hi); }
  const spread = (a) => (Math.max(...a) - Math.min(...a)) / 100;
  assert.ok(spread(his) < 0.01, `crest varies ${(spread(his) * 100).toFixed(2)}%`);
  assert.ok(spread(los) < 0.01, `trough varies ${(spread(los) * 100).toFixed(2)}%`);
});

test('the first and the last sample are always drawn, in index order, and the count stays within the buffer', () => {
  const ys = series(3), k = pickTrace(ys, N, STRIDE), P = picked();
  assert.equal(P[0], 0);
  assert.equal(P[k - 1], N - 1);
  for (let q = 1; q < k; q++) assert.ok(P[q] > P[q - 1]);
  assert.ok(k <= N + 4 && k <= 2 * Math.ceil(N / STRIDE) + 2);
});

test('a missing reading lifts the pen and nothing NaN is drawn', () => {
  const ys = series(0);
  for (let i = 500; i < 520; i++) ys[i] = NaN;
  const k = pickTrace(ys, N, STRIDE), P = picked();
  let lifts = 0;
  for (let q = 0; q < k; q++) { if (P[q] === PEN_UP) lifts++; else assert.ok(!Number.isNaN(ys[P[q]])); }
  assert.ok(lifts >= 1);
});

test('stride 1 draws every reading', () => {
  const ys = series(0), k = pickTrace(ys, 50, 1), P = picked();
  assert.equal(k, 50);
  assert.equal(P[49], 49);
});
