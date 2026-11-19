import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcPath, arcNumsInto, waveRecInto, WAVE_STRIDE, WAVE_ARCS } from '../src/ui/scan-waves.js';

// SF-2 (full app review, 15 Nov 2026): the probe's waves reach the labels' GPU pass as numbers, not as path text written on up to 36 elements and parsed back.
// The record must hold what the path text did, number for number: the pass drew from the parsed text before. Node only (the wiring: scripts/rules-lint.mjs).
const TIP = [66, 48], HALF = 0.62;
const parse = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);   // (what label-gl's readNums gave: x, y, r, r, 0, 0, 1, x2, y2)

test('the arc as numbers is the arc as path text, number for number, at every radius a packet has', () => {
  const rec = new Float64Array(5);
  let ties = 0;
  for (let r = 1; r <= 400; r += 0.37) {
    const n = parse(arcPath(TIP, HALF, r));
    arcNumsInto(rec, 0, TIP, HALF, r);
    // (toFixed(1) and Math.round(v * 10) / 10 part only where v sits on a tie in binary, 36.15: one tenth of a unit, under a hundredth of a pixel on screen.)
    const want = [n[0], n[1], n[2], n[7], n[8]];
    for (let i = 0; i < 5; i++) { if (Math.abs(rec[i] - want[i]) > 0.1 + 1e-9) assert.fail(`r ${r.toFixed(2)} number ${i}: ${rec[i]} against ${want[i]}`); if (Math.abs(rec[i] - want[i]) > 1e-9) ties++; }
  }
  assert.ok(ties < 40, `${ties} numbers on a rounding tie in 1000 radii: rare`);
});

test('a packet is WAVE_STRIDE floats: the opacity then three arcs; an idle packet is opacity 0 and its arcs are not written', () => {
  assert.equal(WAVE_STRIDE, 1 + 5 * WAVE_ARCS);
  const rec = new Float32Array(2 * WAVE_STRIDE).fill(-7);
  waveRecInto(rec, 0, 0, null);
  assert.equal(rec[0], 0); assert.equal(rec[1], -7, 'nothing written for an idle packet');
  let asked = 0;
  waveRecInto(rec, 1, 0.5, (j, r, o) => { asked++; r[o] = j; r[o + 4] = j * 2; });
  assert.equal(asked, WAVE_ARCS);
  const o = WAVE_STRIDE;
  assert.equal(rec[o], 0.5);
  assert.deepEqual([rec[o + 1], rec[o + 5], rec[o + 6], rec[o + 10], rec[o + 11]], [0, 0, 1, 2, 2], 'arc j writes its five at 1 + 5 j: first at +1, the second arc starts at +6, the third at +11');
});
