// The hold-to-strain button (deck slide `strain`, 11 Nov 2026, features item 42): a momentary Valsalva. Held, the chest and belly pressure builds
// over 1.5 s to the Valsalva's 30 mmHg; let go, it falls back over 1.5 s; held too long, it lets go by itself. The timed 10 s strain is as it was.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

const engine = () => { const e = new Engine(); e.loadPreset('cirr-comp'); e.settle(); return e; };
const run = (e, sec) => { for (let t = 0; t < sec; t += 0.05) e.step(0.05); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('holdStrain: builds over 1.5 s while held, falls over 1.5 s when let go', () => {
  const e = engine();
  assert.equal(e.strainLevel(), 0);
  e.holdStrain(true);
  run(e, 0.75); near(e.strainLevel(), 0.5, 0.06, 'half way up');
  run(e, 1.5); near(e.strainLevel(), 1, 1e-9, 'fully built');
  run(e, 5); near(e.strainLevel(), 1, 1e-9, 'held');
  e.holdStrain(false);
  run(e, 0.75); near(e.strainLevel(), 0.5, 0.06, 'half way down');
  run(e, 1.0); assert.equal(e.strainLevel(), 0, 'let go');
});

test('holdStrain: held too long it lets go by itself, and pressing twice does nothing more than once', () => {
  const e = engine();
  e.holdStrain(true); e.holdStrain(true);
  run(e, 29); near(e.strainLevel(), 1, 1e-9, 'still held at 29 s');
  run(e, 2.5); assert.equal(e.strainLevel(), 0, 'let go on its own after 30 s and 1.5 s');
  e.holdStrain(false);   // (letting go with nothing held changes nothing)
  assert.equal(e.strainLevel(), 0);
});

test('holdStrain: pressed again on the way down, it rises from where it is, with no jump', () => {
  const e = engine();
  e.holdStrain(true); run(e, 3); e.holdStrain(false); run(e, 0.6);
  const before = e.strainLevel();
  assert.ok(before > 0.4 && before < 0.8, `on the way down: ${before}`);
  e.holdStrain(true);
  near(e.strainLevel(), before, 1e-9, 'no jump at the second press');
  run(e, 0.3); assert.ok(e.strainLevel() > before, 'rises again');
});

test('the timed Valsalva still ramps over 1.5 s and ends at 10 s', () => {
  const e = engine();
  e.startValsalva(10);
  run(e, 1.5); near(e.strainLevel(), 1, 1e-9, 'built');
  run(e, 8.6); assert.equal(e.strainLevel(), 0, 'over');
});

test('a held strain raises the belly pressure the model reads, and it comes back down', () => {
  const e = engine();
  const iap0 = e.iap;
  e.holdStrain(true); run(e, 3);
  assert.ok(e.iap > iap0 + 15, `belly pressure up: ${iap0.toFixed(1)} to ${e.iap.toFixed(1)}`);
  assert.ok(Number.isFinite(computeMetrics(e).map), 'the metrics stay finite');
  e.holdStrain(false); run(e, 3);
  near(e.iap, iap0, 1.5, 'back to rest');
});

test('the engine survives a snapshot taken mid-hold', () => {
  const e = engine();
  e.holdStrain(true); run(e, 2);
  const f = new Engine(); f.restore(e.snapshot());
  near(f.strainLevel(), 1, 1e-9, 'a restored hold is still held');
  f.holdStrain(false); run(f, 2); assert.equal(f.strainLevel(), 0);
});
