import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countIn } from '../scripts/reduced-fade-scan.mjs';
import { killedFades } from '../scripts/reduced-css-scan.mjs';
import { fadeMs, fadeStep, reducedMs, D_SMALL, D_SURFACE } from '../src/ui/motion.js';

// Owner, 15 Nov 2026: "Nothing can pop in or out. Every in transitions." Under Reduce Motion nothing travels, but a fade is not motion: a thing
// that comes or goes still cross-fades. motion.js fadeMs / fadeStep give that length; this test keeps new code from answering 0 ms or a step
// of 1 under Reduce Motion, and the stylesheets from killing a fade there: both run in npm run lint (scripts/rules-lint.mjs). These cases check
// that the scanners see what they are meant to.

test('fadeMs keeps a fade under Reduce Motion: never 0, between D_SMALL and D_SURFACE', () => {
  for (const ms of [0, 60, 120, 240, 420, 1100, 5000]) {
    const r = fadeMs(ms, true);
    assert.ok(r >= D_SMALL && r <= D_SURFACE, `${ms} -> ${r}`);
    assert.equal(fadeMs(ms, false), ms);
  }
  assert.ok(reducedMs(1300, true) <= 300, 'movement still shortens (reducedMs)');
});

test('fadeStep never jumps a fade to its end in one frame under Reduce Motion', () => {
  for (const ms of [0, 120, 420, 1100]) {
    const k = fadeStep(16.7, ms, true);
    assert.ok(k > 0 && k < 0.1, `${ms}: ${k}`);
  }
  assert.ok(Math.abs(fadeStep(16.7, 1100, false) - 16.7 / 1100) < 1e-12);
  assert.equal(fadeStep(-5, 420, true), 0);
});

test('the scan sees the instant forms it is meant to catch', () => {
  assert.equal(countIn('const ms = reduce.matches ? 0 : D_SURFACE;'), 1);
  assert.equal(countIn('const step = reduceMotion.matches ? 1 : dt / VST_MS;'), 1);
  assert.equal(countIn('recs.drop(RES_KEYS[k], now, reduceMotion.matches);'), 1);
  assert.equal(countIn('markShade(g, markA.want(key, { host, vessel }, quietFx()));'), 1);
  assert.equal(countIn('const ms = fadeMs(D_SURFACE);'), 0);
  assert.equal(countIn('const way = reduced() ? 1 / RUSH_SPEED : 1;'), 0, 'a speed is not an instant');
  assert.equal(countIn('// reduce.matches ? 0 : 1 in a comment'), 0);
});

test('the stylesheet scan sees a Reduce Motion rule that kills a fade, and lets a movement-only one and an opacity-only one through', () => {
  const css = `.a { opacity: 0; transition: opacity .2s; }
@media (prefers-reduced-motion: reduce) { #labels .lb { transition: none; } }
@media (prefers-reduced-motion: reduce) { .menu-btn .chev { transition: none; } .x { transition-property: opacity; } }
@media (prefers-reduced-motion: reduce) { .y { animation: none; } @keyframes fade-rise { from { opacity: 0; } } }`;
  assert.deepEqual(killedFades(css), ['#labels .lb { transition: none; }', '.y { animation: none; }']);
});
