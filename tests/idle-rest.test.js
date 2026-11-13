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

// 13 Nov 2026 (Mohammad: the chevrons "slow down randomly when nothing has changed"): the blood never eases to a stop, in Explore either.
// Idle rest only hears the inputs for the rest pacing (noteInput), which draws fewer frames, never slower blood.
test('idle rest is wired for the inputs only: it never rests, so the blood keeps its speed and the model runs', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /idleRest = createIdleRest\(\{ after: REST_AFTER_MS, canRest: \(\) => false, onInput: noteInput \}\);/);
  assert.doesNotMatch(main, /TALK_REST_MS|presenter\.idle|stage\.rest\(true\)|visible: false \}\); \}/);
  const stage = stageSource();
  assert.match(stage, /const REST_IN_S = 1\.5, REST_OUT_S = 0\.4;/);
  assert.match(stage, /if \(!st\.running \|\| reduceMotion\.matches \|\| (?:live\.)?restStill\(\)\) return false;/);
  assert.match(stage, /(?:live\.)?(?:live\.)?bloodClock = \((?:live\.)?(?:live\.)?bloodClock \+ dt \* (?:live\.)?(?:live\.)?restK\) % 10000;/);
});

// Mohammad, 5 Nov 2026: slide 12 of the variceal bleed froze about 15 s in (the 8 s talk rest of 4 Nov). No slide stops, and since 13 Nov
// nothing in Explore stops either: main.js's own canRest, run on the fake clock, never rests in two minutes, in a talk or in Explore.
test('nothing rests: a settled slide and Explore keep animating past 30 s (variceal bleed slide 12)', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  const src = main.match(/canRest: (\(\) => false),/)?.[1];
  assert.ok(src, 'main.js canRest found');
  const canRest = new Function(`return ${src};`)();
  const { r, calls, advance } = rig({ canRest });
  advance(15000);
  assert.deepEqual(calls, [], 'still moving at 15 s');
  advance(105000);
  assert.deepEqual(calls, [], 'still moving at 2 min');
  assert.equal(r.resting(), false);
});
