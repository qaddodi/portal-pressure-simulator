// What the figure shows between the model's frames (combined plan M1): one critically damped filter for the vessels' widths and
// the lumens' colours (display-state.js), so nothing steps when the model does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { follow2, createColourFollow } from '../src/ui/display-state.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const TAU = 0.2;

test('follow2 is the widths\' old cascade, number for number', () => {
  // (stage.js followWidth before M1, written out.)
  const old = (v, w, T, dt) => {
    const u = Math.max(0, dt) / TAU, a = Math.exp(-u), e1 = w - T, e2 = v - T;
    w = T + e1 * a; v = T + (e2 + e1 * u) * a;
    if (Math.abs(T - w) < 0.005 && Math.abs(w - v) < 0.005) w = v = T;
    return [v, w];
  };
  let v = 3, w = 3, a = 3, b = 3;
  for (let i = 0; i < 400; i++) {
    const T = i < 120 ? 9 : i < 200 ? 4.5 : 6, dt = [1 / 60, 1 / 120, 0.03][i % 3];
    const r = follow2(v, w, T, dt, TAU, 0.005); v = r.v; w = r.w;
    [a, b] = old(a, b, T, dt);
    assert.equal(v, a); assert.equal(w, b);
  }
  assert.equal(v, 6, 'lands exactly on its target');
});

test('follow2 traces the same curve at 60 and 120 Hz, with no overshoot and no jump in speed', () => {
  const run = (hz, secs) => { let v = 0, w = 0; for (let i = 0; i < hz * secs; i++) ({ v, w } = follow2(v, w, 1, 1 / hz, TAU, 1e-9)); return v; };
  for (const t of [0.05, 0.2, 0.5]) assert.ok(Math.abs(run(60, t) - run(120, t)) < 1e-9, `${t}`);
  let v = 0, w = 0, last = 0, lastD = 0;
  for (let i = 0; i < 120; i++) {
    ({ v, w } = follow2(v, w, 1, 1 / 60, TAU, 1e-9));
    assert.ok(v <= 1 && v >= last);
    // From rest the first frame moves under 1 % of the way: an ease, not a step.
    if (i === 0) assert.ok(v < 0.01, `${v}`);
    if (i > 0 && i < 10) assert.ok(v - last >= lastD, 'speeds up from rest');
    lastD = v - last; last = v;
  }
});

test('colours: a new key shows its colour at once; a small step at rest snaps; a big one eases and keeps the figure awake', () => {
  const f = createColourFollow({ tau: TAU });
  f.begin();
  const a = f.step(1, [0.2, 0.2, 0.2, 0.4, 0.4, 0.4], 1 / 60);
  assert.deepEqual(a, [0.2, 0.2, 0.2, 0.4, 0.4, 0.4]);
  assert.equal(f.moving, false);
  f.begin();
  const b = f.step(1, [0.2 + 2 / 255, 0.2, 0.2, 0.4, 0.4, 0.4], 1 / 60);
  assert.equal(b[0], 0.2 + 2 / 255, 'a running model\'s own small steps cost no easing frames');
  assert.equal(f.moving, false);
  f.begin();
  const c = f.step(1, [0.8, 0.2, 0.2, 0.4, 0.4, 0.4], 1 / 60);
  assert.ok(c[0] > 0.2 + 2 / 255 && c[0] < 0.21, `${c[0]}`);
  assert.equal(f.moving, true);
  let n = 0;
  while (f.moving && n < 600) { f.begin(); f.step(1, [0.8, 0.2, 0.2, 0.4, 0.4, 0.4], 1 / 60); n++; }
  assert.ok(n > 20 && n < 200, `${n}`);
  assert.equal(f.step(1, [0.8, 0.2, 0.2, 0.4, 0.4, 0.4], 1 / 60)[0], 0.8, 'lands exactly');
});

test('colours: snap (a crossfade, Reduce Motion) shows the target at once; a key no longer drawn is forgotten', () => {
  const f = createColourFollow({ tau: TAU });
  f.step(2, [0, 0, 0, 0, 0, 0], 1 / 60);
  f.begin();
  assert.equal(f.step(2, [1, 1, 1, 1, 1, 1], 1 / 60, true)[0], 1);
  assert.equal(f.moving, false);
  f.begin(); f.step(2, [0, 0, 0, 0, 0, 0], 1 / 60); assert.equal(f.moving, true);
  f.prune(new Set());
  f.begin();
  assert.equal(f.step(2, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 1 / 60)[0], 0.5, 'drawn again, it starts where it is told');
});

test('stage.js: widths and colours share the filter; the crossfade and Reduce Motion bypass it; the loop stays awake while it moves', () => {
  assert.match(stage, /const r = follow2\(x\.width, x\.w1, x\.wT, dt, W_TAU, 0\.005\);/);
  assert.match(stage, /const COL_FOLLOW = !\/\[\?&\]colfollow=0\\b\/\.test\(location\.search\);/);
  assert.match(stage, /colFollow\.step\(it\.row, colT, colDt, !!lensFrom \|\| reduceMotion\.matches\)/);
  // The filter runs before the crossfade, so what it shows is what the next crossfade starts from (shownCol).
  const i = stage.indexOf('colFollow.step(it.row'), j = stage.indexOf('if (lensFrom) {\n        const was = lensFrom.get(it.row)'), k = stage.indexOf('shownCol.set(it.row, [c0, c1]);');
  assert.ok(i > 0 && i < j && j < k);
  assert.match(stage, /colEasing = COL_FOLLOW && colFollow\.moving;/);
  assert.match(stage, /if \(lensFrom \|\| colEasing\) \{ veinsDirty = true; glowSync = true; \}/);
  assert.match(stage, /!lensFrom && !colEasing && ascShown === ascTarget/);
  assert.match(stage, /tubesNew \|\| lensFrom \|\| colEasing \|\|/);
  assert.match(stage, /const colDt = Math\.min\(colEasing \? 0\.1 : 1 \/ 60, /);
});
