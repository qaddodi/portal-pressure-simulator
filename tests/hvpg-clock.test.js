import test from 'node:test';
import assert from 'node:assert/strict';
import { T, balloonAt, timeOfBalloon, pressureAt } from '../src/ui/hvpg-clock.js';

const v = { fhvp: 5, whvp: 17, hvpg: 12 };
// The waves are small and zero-mean-ish; compare against the model with them stripped by averaging a breath.
const mean = (t0) => { let s = 0; for (let i = 0; i < 850; i += 5) s += pressureAt(t0 + i, v); return s / 170; };

test('the pressure does not move until the balloon starts to fill', () => {
  assert.equal(balloonAt(T.inflate), 0);
  assert.equal(balloonAt(T.inflate - 1000), 0);
  // Before inflation the free trace stays near FHVP (waves only).
  for (let t = T.free; t < T.inflate; t += 50) assert.ok(Math.abs(pressureAt(t, v) - v.fhvp) < 1.3, `t=${t}`);
});

test('the pressure rises with the balloon and plateaus once it is up', () => {
  let prev = -1;
  for (let t = T.inflate; t <= T.wedge; t += 25) { const b = balloonAt(t); assert.ok(b >= prev); prev = b; }
  assert.equal(balloonAt(T.wedge), 1);
  // Plateau: after the wedge the level stays at WHVP (waves damped to 15%), however long it runs.
  for (let t = T.wedge; t < T.back; t += 200) assert.ok(Math.abs(pressureAt(t, v) - v.whvp) < 0.2 * 1.25 + 0.01, `t=${t}`);
  // Mid-inflation the level is between the two, in step with the balloon.
  const tm = T.inflate + (T.wedge - T.inflate) / 2;
  assert.ok(Math.abs(balloonAt(tm) - 0.5) < 1e-9);
  assert.ok(Math.abs(mean(tm - 425) - (v.fhvp + 0.5 * (v.whvp - v.fhvp))) < 1.5);
});

test('the balloon value gives back its own time, so deflating runs the pressure back down the same way', () => {
  for (const b of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) assert.ok(Math.abs(balloonAt(timeOfBalloon(b)) - b) < 1e-6, `b=${b}`);
});

test('the sequence stays in order', () => {
  const keys = ['travel0', 'travel1', 'free', 'inflate', 'wedge', 'settle', 'callout', 'result', 'sum', 'back', 'end'];
  for (let i = 1; i < keys.length; i++) assert.ok(T[keys[i]] >= T[keys[i - 1]], keys[i]);
});
