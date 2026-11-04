import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIdleRest, REST_AFTER_MS } from '../src/ui/idle-rest.js';

// A fake clock and event target: timers fire when the test moves the time on.
function rig({ canRest = () => true } = {}) {
  let t = 0, seq = 0;
  const timers = new Map(), handlers = new Map(), calls = [];
  const target = { addEventListener: (k, f) => handlers.set(k, f), removeEventListener: (k) => handlers.delete(k) };
  const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
  const r = createIdleRest({
    canRest: () => canRest(), onRest: () => calls.push('rest'), onWake: () => calls.push('wake'), target, doc,
    now: () => t, setTimer: (f, ms) => { timers.set(++seq, { f, at: t + ms }); return seq; }, clearTimer: (id) => timers.delete(id),
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]); t = next[1].at; next[1].f();
    }
    t = end;
  };
  const input = (k = 'pointermove') => handlers.get(k)();
  return { r, calls, advance, input, doc, handlers };
}

test('idle rest: 30 s with no input rests once; the first input wakes it, and it rests again only after 30 s more', () => {
  assert.equal(REST_AFTER_MS, 30000);
  const { r, calls, advance, input } = rig();
  advance(29000); input(); advance(29000);
  assert.deepEqual(calls, [], 'an input inside the 30 s starts the count again');
  advance(1500);
  assert.deepEqual(calls, ['rest']);
  assert.equal(r.resting(), true);
  advance(60000);
  assert.deepEqual(calls, ['rest'], 'rests once');
  input('keydown');
  assert.deepEqual(calls, ['rest', 'wake']);
  advance(29000);
  assert.deepEqual(calls, ['rest', 'wake']);
  advance(1500);
  assert.deepEqual(calls, ['rest', 'wake', 'rest']);
});

test('idle rest: never while canRest says no (a talk, a time-lapse); asked again within 5 s once it allows', () => {
  let talk = true;
  const { calls, advance } = rig({ canRest: () => !talk });
  advance(120000);
  assert.deepEqual(calls, []);
  talk = false;
  advance(5000);
  assert.deepEqual(calls, ['rest']);
});

test('idle rest: listens to pointer, key, wheel, touch, scroll and focus', () => {
  const { handlers } = rig();
  for (const k of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'focusin']) assert.ok(handlers.has(k), k);
});

test('idle rest is wired: Explore, or a talk whose slide is idle (presenter.idle); never in a time-lapse; the stage eases the blood and the worker holds', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /presenter\.active\(\) \? presenter\.idle\(\) : st\.mode === 'explore'\) && !st\.lapse/);
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /!keepsMoving\(slides\[shown\.i\]\)/);
  assert.match(main, /onRest: \(\) => \{ setPageRest\(true\); stage\.rest\(true\); host\.send\(\{ type: 'visibility', visible: false \}\); \}/);
  assert.match(main, /onWake: \(\) => \{ setPageRest\(false\); host\.send\(\{ type: 'visibility', visible: !document\.hidden \}\); stage\.rest\(false\); \}/);
  const stage = stageSource();
  assert.match(stage, /const REST_IN_S = 1\.5, REST_OUT_S = 0\.4;/);
  assert.match(stage, /if \(!st\.running \|\| reduceMotion\.matches \|\| restStill\(\)\) return false;/);
  assert.match(stage, /bloodClock = \(bloodClock \+ dt \* restK\) % 10000;/);
});
