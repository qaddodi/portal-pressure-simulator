// Steps never block navigation (Mohammad, 13 Nov 2026, the direct PPG slide, three reports: Next stalled on step 3, "Needle in", and would not reach the portal vein, the PPG or the
// next slide, however often he pressed it). Next is counted by the ring (proc-nav.js): each press moves it exactly one step and the press after the last moves on, whatever the
// animation is doing. Here the real slide (the Gradients deck) and the real procedure specs are pressed against every state the animation can be in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playProcedure, specOf, PROC_KINDS, procKindOf } from '../src/ui/proc-anim.js';
import { procNavPlan } from '../src/ui/proc-nav.js';
import { DECKS } from '../src/ui/decks.js';

const slideOf = (deckId, slideId) => DECKS.find((d) => d.id === deckId).slides.find((s) => s.id === slideId);
const thenOf = (proc) => (typeof proc === 'object' && proc ? proc.then : null);
const stepsOf = (proc) => [...specOf(procKindOf(proc)).steps, ...(thenOf(proc) ? specOf(thenOf(proc)).steps : [])];
const stopsOf = (k) => specOf(k).stops.length;

test('the direct PPG slide lists five steps, and every procedure lists one step per stop', () => {
  const s = slideOf('gradients', 'how-ppg');
  assert.deepEqual(stepsOf(s.procedure).map((x) => x[1]), ['Catheter in', 'IVC', 'Needle in', 'Portal vein', 'PPG']);
  for (const k of PROC_KINDS) assert.equal(specOf(k).steps.length, stopsOf(k), `${k}: a Next per step needs a stop per step`);
  assert.equal(stopsOf('irivc') + stopsOf('irpv'), 5);
});

// What the animation may be doing when Next is pressed, for the direct PPG slide: nothing started, the figure turning, the IVC run playing (before and after its last step),
// the reading's run starting, held at a stop, or stuck for ever (a shot that never lands, a route never drawn).
const STATES = {
  'nothing running': () => ({}),
  'figure turning': () => ({ waiting: true }),
  'IVC run on its first step': () => ({ run: { reading: false, at: 0 } }),
  'IVC run on its last step (playing out)': () => ({ run: { reading: false, at: 1 } }),
  'reading pending': () => ({ readingPending: true }),
  'reading run held at its first step': () => ({ run: { reading: true, at: 0 } }),
  'reading run stuck at 0': () => ({ run: { reading: true, at: 0 } }),
};
for (const [name, mk] of Object.entries(STATES)) {
  test(`direct PPG slide, ${name}: each Next moves the ring one step, 1 to 5, and the sixth moves on`, () => {
    const proc = slideOf('gradients', 'how-ppg').procedure, steps = stepsOf(proc).length, nMain = specOf(procKindOf(proc)).steps.length;
    let ring = -1;
    const seen = [];
    for (let press = 1; press <= 7; press++) {
      const plan = procNavPlan({ ring, steps, nMain, hasThen: true, ...mk() });
      if (plan.to < 0) { seen.push('on'); break; }
      assert.equal(plan.to, ring + 1, 'exactly one step per press, whatever the animation does');
      ring = plan.to; seen.push(ring + 1);
    }
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 'on']);
  });
}

test('what the animation is told: the main run is jumped to the step, the IVC run\'s last step chains the reading, a reading\'s run jumps to its own step, nothing running starts one', () => {
  const base = { steps: 5, nMain: 2, hasThen: true };
  assert.deepEqual(procNavPlan({ ...base, ring: -1 }), { to: 0, how: 'start', reading: false, at: 0 });
  assert.deepEqual(procNavPlan({ ...base, ring: 0, run: { reading: false, at: 0 } }), { to: 1, how: 'jump', at: 1 });
  assert.deepEqual(procNavPlan({ ...base, ring: 1, run: { reading: false, at: 1 } }), { to: 2, how: 'chain', at: 1 });
  assert.deepEqual(procNavPlan({ ...base, ring: 2, run: { reading: false, at: 1 } }), { to: 3, how: 'chain', at: 1 }, 'a second press while the IVC plays out: the ring still moves');
  assert.deepEqual(procNavPlan({ ...base, ring: 1, readingPending: true }), { to: 2, how: 'start', reading: true, at: 0 });
  assert.deepEqual(procNavPlan({ ...base, ring: 2, run: { reading: true, at: 0 } }), { to: 3, how: 'jump', at: 1 });
  assert.deepEqual(procNavPlan({ ...base, ring: 3, run: { reading: true, at: 1 } }), { to: 4, how: 'jump', at: 2 });
  assert.deepEqual(procNavPlan({ ...base, ring: 4, run: { reading: true, at: 2 } }), { to: -1 });
  assert.deepEqual(procNavPlan({ steps: 4, nMain: 4, hasThen: false, ring: 3 }), { to: -1 }, 'a procedure with no reading moves on after its last step');
});

test('every procedure slide of every deck: Next counts its steps and then moves on, with a run that is stuck or not', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (!s.procedure) continue;
    n++;
    const steps = stepsOf(s.procedure).length, nMain = specOf(procKindOf(s.procedure)).steps.length, hasThen = !!thenOf(s.procedure);
    for (const run of [null, { reading: false, at: 0 }, { reading: hasThen, at: 0 }]) {
      let ring = -1, presses = 0;
      while (presses++ < steps + 2) { const plan = procNavPlan({ ring, steps, nMain, hasThen, run }); if (plan.to < 0) break; assert.equal(plan.to, ring + 1); ring = plan.to; }
      assert.equal(ring, steps - 1, `${d.id}/${s.id}: ring reaches the last step`);
      assert.equal(presses, steps + 1, `${d.id}/${s.id}: the press after the last moves on`);
    }
  }
  assert.ok(n > 10, 'the decks have procedure slides');
});

// The run that was left at 0 for ever, with its camera never landing: it plays after a moment and Next goes on through it (proc-anim.js STILL_MAX_MS).
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
  test(`a step whose shot cannot land still plays after a moment, and the run can be jumped to any step: ${name}`, () => {
    const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
    try {
      const R = rig(opts), steps = [];
      const play = playProcedure(R.stage, 'irpv', { stepped: true, onStep: (k) => steps.push(k) });
      R.run(2000);
      assert.ok(R.cats.every((c) => !c || c.u === 0), 'held while the camera has its moment');
      R.run(30000);
      assert.ok(R.cats.some((c) => c && c.u > 0), 'the catheter then moves with no camera of its own: the run never sits at 0 for ever');
      assert.ok(play.to(2), 'a Next jumps the run to the PPG step');
      R.run(60000);
      assert.equal(play.at, 2);
      assert.equal(play.running, false, 'it plays out and ends: the slide is then done');
    } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
  });
}
