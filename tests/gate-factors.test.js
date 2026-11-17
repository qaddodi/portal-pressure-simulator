// A stent's gated Doppler reading never shows a jet it never had (play-test, 17 Nov 2026, TIPS deck slide 22: 1241 cm/s first, settling to 540).
// Each sample is read under the narrowing of its own time (src/ui/gate-factors.js), so a window holding fast samples from before a distal
// stenosis and slow ones after it reads between the old gate's number and the new one, never above the new one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateFactors } from '../src/ui/gate-factors.js';

// Open-stent velocity 200 cm/s before a 60 % distal narrowing at t = 0, falling to about 86 at once after it (the flow it lets through); the distal gate
// runs 1 / 0.4^2 = 6.25 times faster from then on.
const F = 6.25, open = (t) => (t < 0 ? 200 : 86 + 4 * Math.exp(-t / 0.3));   // (a series narrowing cuts the flow at once: engine.js)
function record(t1) {
  const buf = [], fx = gateFactors();
  for (let t = -6; t <= t1 + 1e-9; t += 0.02) { fx.note(t, 1, 1, t < 0 ? 1 : F); buf.push([t, open(t)]); }
  return { buf, fx };
}
const windowMean = (buf, from, to) => { let s = 0, n = 0; for (const [t, v] of buf) if (t >= from && t <= to) { s += v; n++; } return s / n; };

test('the gated mean eases from the old reading to the new one and never passes it', () => {
  const settled = 86 * F, eff = [0, 0, 0];
  let last = -Infinity, oldWayPeak = 0;
  for (let t1 = 0; t1 <= 8; t1 += 0.1) {
    const { buf, fx } = record(t1), m = windowMean(buf, t1 - 3, t1);
    fx.mean(buf, t1 - 3, t1, eff);
    const gated = m * eff[2];
    let truth = 0; for (const [t, v] of buf) if (t >= t1 - 3) truth = Math.max(truth, v * (t < 0 ? 1 : F));   // (the fastest the gate really ran in the window)
    assert.ok(gated <= truth + 0.5, `at ${t1.toFixed(1)} s the distal gate read ${gated.toFixed(0)}, faster than it ever ran (${truth.toFixed(0)})`);
    assert.ok(gated <= settled * 1.05, `at ${t1.toFixed(1)} s the distal gate read ${gated.toFixed(0)}, over the settled ${settled.toFixed(0)}`);
    assert.ok(gated >= last - 0.01 * settled, `at ${t1.toFixed(1)} s it fell back by more than the flow settling (${gated.toFixed(0)} after ${last.toFixed(0)})`);
    assert.ok(Math.abs(eff[0] - 1) < 1e-12 && Math.abs(eff[1] - 1) < 1e-12, 'the open thirds keep their factor');
    last = gated; oldWayPeak = Math.max(oldWayPeak, m * F);
  }
  assert.ok(Math.abs(last - settled) < 2, `settles at the new reading (${last.toFixed(0)})`);
  assert.ok(oldWayPeak > 2 * settled, `the old way (the window's open mean times the new factor) read ${oldWayPeak.toFixed(0)}: the spike this guards`);
});

test('each sample keeps the factor of its own time; old changes are forgotten with their samples', () => {
  const fx = gateFactors();
  assert.equal(fx.at(5, 2), 1, 'nothing noted: 1');
  fx.note(0, 1, 1, 1); fx.note(0, 1, 1, 1); fx.note(2, 1, 1, 4); fx.note(4, 1, 2, 1);
  assert.equal(fx.size, 3, 'a repeat is not a change');
  assert.equal(fx.at(1, 2), 1); assert.equal(fx.at(3, 2), 4); assert.equal(fx.at(5, 1), 2); assert.equal(fx.at(-1, 2), 1);
  fx.prune(3); assert.equal(fx.size, 2); assert.equal(fx.at(3, 2), 4);
  const eff = fx.mean([[5, 0], [6, 0]], 4, 6, [0, 0, 0]);
  assert.deepEqual(eff, [1, 2, 1], 'no flow in the window: the factors now');
  fx.clear(); assert.equal(fx.size, 0);
});
