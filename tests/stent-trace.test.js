import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stentTrace as trace, makeTrace, TRACE_N, headOf, HEAD } from '../src/engine/portal/stent-trace.js';

const stentTrace = (inp) => trace(inp, makeTrace());
const waist = (u) => 1 - 0.45 * Math.exp(-((u - 0.5) * (u - 0.5)) / 0.02);
const base = { len: 8, q: 25, d: 10, prof: waist, xa: -4, xb: 12, tract: 1, wall: 2, entry: 0.8, jet: 1.5, inlet: 0, ppg: 14, dp: 5.3 };

test('trace: fixed sample count, the same for any stent', () => {
  const a = stentTrace(base), b = stentTrace({ ...base, len: 6, d: 8 });
  assert.equal(a.x.length, TRACE_N + 1);
  assert.equal(b.P.length, TRACE_N + 1);
});

test('trace: the loss only rises, and the head falls by exactly it', () => {
  const o = stentTrace(base);
  for (let i = 1; i <= TRACE_N; i++) assert.ok(o.loss[i] >= o.loss[i - 1] - 1e-9, `loss falls at ${i}`);
  const H0 = o.head[0];
  for (let i = 0; i <= TRACE_N; i++) assert.ok(Math.abs(o.head[i] - (H0 - o.loss[i])) < 1e-9);
});

test('trace: the portal end reads the PPG and the IVC end reads zero', () => {
  const o = stentTrace(base);
  assert.ok(Math.abs(o.P[0] - base.ppg) < 1e-6, `portal ${o.P[0]}`);
  assert.ok(Math.abs(o.P[TRACE_N]) < 1e-6, `ivc ${o.P[TRACE_N]}`);
  assert.ok(Math.abs(o.loss[TRACE_N] - base.ppg) < 1e-6, `loss ${o.loss[TRACE_N]}`);
});

test('trace: the pressure dips at the waist and recovers part of it', () => {
  const o = stentTrace(base);
  const iN = o.i[2];
  assert.ok(o.D[iN] < base.d * 0.6);
  const pBefore = o.P[o.i[1]], pWaist = o.P[iN], pAfter = o.P[o.i[3]];
  assert.ok(pWaist < pBefore, 'dips');
  assert.ok(pAfter > pWaist, 'recovers');
  assert.ok(pAfter < pBefore, 'not all of it');
});

test('trace: the velocity follows the lumen (continuity) and the five sites run in order', () => {
  const o = stentTrace(base);
  for (let i = 0; i <= TRACE_N; i += 17) assert.ok(Math.abs(o.v[i] * o.D[i] * o.D[i] - o.v[0] * o.D[0] * o.D[0]) < 1e-6 * o.v[i] * o.D[i] * o.D[i]);
  for (let k = 1; k < 5; k++) assert.ok(o.sites[k] >= o.sites[k - 1], `site ${k}`);
  assert.ok(o.sites[0] < 0 && o.sites[4] > base.len);
});

test('trace: a straight stent loses its jet nowhere and still ends at zero', () => {
  const o = stentTrace({ ...base, prof: () => 1, jet: 0, wall: 3, dp: 4.8 });
  assert.ok(Math.abs(o.P[TRACE_N]) < 1e-6);
});

test('trace: a jet with no widening is not lost, it goes to the exit', () => {
  const o = stentTrace({ ...base, prof: () => 1, jet: 1.5, dp: 5.3 });
  assert.ok(Math.abs(o.P[TRACE_N]) < 1e-6);
});

test('trace: the record is reused (nothing made per call)', () => {
  const rec = makeTrace(), o = trace(base, rec);
  assert.equal(o, rec);
  assert.ok(Math.abs(headOf(100) - HEAD) < 1e-12);
});

test('trace: the parts add up to the loss at every sample, each only rises, and the stent\'s own four end at the stent\'s drop', () => {
  const o = stentTrace(base), N = TRACE_N, parts = ['cOut', 'cTract', 'cWall', 'cEnds', 'cJet'];
  for (let i = 0; i <= N; i++) {
    let s = 0;
    for (const p of parts) { s += o[p][i]; if (i) assert.ok(o[p][i] >= o[p][i - 1] - 1e-12, `${p} falls at ${i}`); }
    assert.ok(Math.abs(s - o.loss[i]) < 1e-9);
  }
  assert.ok(Math.abs(o.cTract[N] + o.cWall[N] + o.cEnds[N] + o.cJet[N] - base.dp) < 1e-9, 'the stent\'s four parts are its drop');
  assert.ok(Math.abs(o.cOut[N] - (base.ppg - base.dp)) < 1e-9, 'and the outside is the rest of the PPG');
  assert.ok(o.cEnds[0] === 0 && o.cEnds[N] > 0 && o.cWall[0] === 0);
});

test('trace: a stent with no flow (all parts 0) still holds its gradient, and nothing divides by the flow', () => {
  const o = stentTrace({ ...base, q: 0, tract: 0, wall: 0, entry: 0, jet: 0, dp: 6, ppg: 14 });
  for (let i = 0; i <= TRACE_N; i++) { assert.ok(Number.isFinite(o.P[i]) && Number.isFinite(o.v[i])); assert.equal(o.v[i], 0); }
  assert.ok(Math.abs(o.P[0] - 14) < 1e-9 && Math.abs(o.P[TRACE_N]) < 1e-9, 'the PPG at the portal end, 0 at the IVC');
  assert.ok(Math.abs(o.cEnds[TRACE_N] - 6) < 1e-9, 'the stent holds its 6 mmHg');
});
