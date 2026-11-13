// Steps never block navigation (Mohammad, 13 Nov 2026, the direct PPG slide: Next stalled on step 3, "Needle in", and would not reach the portal vein, the PPG or the next slide).
// Two ways a Next used to be swallowed for good: a run whose shot never landed held its clock at 0 (proc-anim.js STILL_MAX_MS), and a Next waiting on a run that was not going to
// start or end was swallowed with it (presenter.js procNext, proc-patience.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { playProcedure } from '../src/ui/proc-anim.js';
import { createPatience } from '../src/ui/proc-patience.js';

function rig({ focus, gliding }) {
  const q = [];
  let now = 0;
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (fn) => { q.push(fn); return q.length; };
  globalThis.cancelAnimationFrame = () => {};
  const cats = [];
  const stage = { setCatheter: (st) => cats.push(st && { ...st }), cathStops: () => null, gliding: () => gliding, cathFocus: () => focus };
  const run = (ms, step = 16) => { for (let t = 0; t < ms; t += step) { now += step; const f = q.splice(0); for (const fn of f) fn(now); } };
  return { stage, run, cats };
}

for (const [name, opts] of [['a route the figure has not drawn (cathFocus never says yes)', { focus: false, gliding: false }], ['a glide that never reports it is over', { focus: true, gliding: true }]]) {
  test(`a step whose shot cannot land still plays after a moment, and Next goes on: ${name}`, () => {
    const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
    try {
      const R = rig(opts), steps = [];
      const play = playProcedure(R.stage, 'irpv', { stepped: true, onStep: (k) => steps.push(k) });
      R.run(2000);
      assert.ok(R.cats.every((c) => !c || c.u === 0), 'held while the camera has its moment');
      R.run(30000);
      assert.ok(R.cats.some((c) => c && c.u > 0), 'the catheter then moves with no camera of its own: the run never sits at 0 for ever');
      assert.ok(play.next() && play.next(), 'Next steps through the reading');
      R.run(60000);
      assert.equal(play.at, 2, 'the portal vein, then the PPG');
      assert.equal(play.next(), false, 'on the last step the caller moves on');
    } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
  });
}

test('patience: a wait swallows Nexts for its time, then lets one through and starts over', () => {
  const p = createPatience(1000);
  assert.equal(p.ok(100), true); assert.equal(p.ok(900), true); assert.equal(p.ok(1100), true);
  assert.equal(p.ok(1200), false, 'past maxMs from the first Next');
  assert.equal(p.ok(1300), true, 'the next wait counts afresh');
  p.reset(); assert.equal(p.ok(99999), true);
  assert.equal(createPatience(50).ok(0), true, 'a first Next at time 0 is still the first');
});
