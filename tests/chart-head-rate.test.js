// (That flow-time.js and event-graph.js call headStep, and have no per-frame fraction left, is a rule in scripts/rules-lint.mjs.)
// The two chart heads that glide after their goal (flow-time.js, event-graph.js) step by time, not by frame (recs item 16): the old
// `shown += (goal - shown) * 0.16` (and 0.2) per frame settled twice as fast at 120 Hz as at 60 and four times slower at 15.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headStep, HEAD_TAU } from '../src/ui/display-state.js';

/** The tick as the charts run it: a frame every 1/hz s, the first one measured as one 60 Hz frame (HEAD_DT0), the rest by their gap. */
const run = (hz, secs, goal = 1) => {
  let shown = 0, lastT = 0;
  const n = Math.round(hz * secs);
  for (let i = 0; i < n; i++) {
    const t = ((i + 1) * 1000) / hz;
    shown = headStep(shown, goal, lastT ? (t - lastT) / 1000 : 1 / hz);
    lastT = t;
  }
  return shown;
};

test('a head is on the same curve at 15, 30, 60, 120 and 240 Hz', () => {
  for (const secs of [0.2, 0.4, 0.8, 1.2]) {
    const ref = run(60, secs), want = 1 - Math.exp(-secs / HEAD_TAU);
    assert.ok(Math.abs(ref - want) < 1e-12, `${secs} s: ${ref} against ${want}`);
    for (const hz of [15, 30, 120, 240]) assert.ok(Math.abs(run(hz, secs) - ref) < 1e-12, `${hz} Hz at ${secs} s`);
  }
});

test('60 Hz and 120 Hz give the same result, where a fixed fraction per frame did not', () => {
  assert.ok(Math.abs(run(60, 0.1) - run(120, 0.1)) < 1e-12);
  const old = (hz, secs) => { let s = 0; for (let i = 0; i < hz * secs; i++) s += (1 - s) * 0.16; return s; };
  assert.ok(old(120, 0.1) - old(60, 0.1) > 0.1, 'the old per-frame step differed by over a tenth at 0.1 s');
});

test('a head moves toward its goal from either side, never past it, and ignores a negative or huge gap', () => {
  assert.ok(headStep(0, 10, 1 / 60) > 0 && headStep(0, 10, 1 / 60) < 10);
  assert.ok(headStep(10, 0, 1 / 60) < 10 && headStep(10, 0, 1 / 60) > 0);
  assert.equal(headStep(3, 3, 0.05), 3);
  assert.equal(headStep(0, 1, -1), 0, 'a clock that went back moves nothing');
  assert.equal(headStep(0, 1, 60), headStep(0, 1, 0.1), 'a hidden tab\'s gap is capped at 0.1 s');
});
