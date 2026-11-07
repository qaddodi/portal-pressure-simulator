// The cross-section follows the model's clot at the screen's rate (6 Nov 2026, Mohammad on iPhone: "This cross section animation is
// super laggy"): a stream of small steps (a time-lapse's days, a slider) is followed in straight lines over the stream's own interval,
// a jump glides, and while it moves the scheduler never carries its frame over (frameAnimating).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFollow, FOLLOW_JUMP, FOLLOW_GLIDE_MS, FOLLOW_MAX_MS } from '../src/ui/tool-lumen.js';

test('a time-lapse\'s steps are followed straight, at the model\'s speed, with no tail after the last', () => {
  const f = createFollow();
  f.snap(0, 0.96);
  // A day every 33 or 66 ms (the worker's 33 ms tick at 22.5 days a second), 0.5 % of the lumen a day.
  let t = 1000, v = 0.96;
  const steps = [];
  for (let i = 0; i < 60; i++) { t += i % 3 === 2 ? 66 : 33; v -= 0.005; steps.push([t, v]); }
  let prev = f.b, maxJump = 0, behind = 0, s = 0;
  for (let now = 1000; now <= t + 400; now += 1000 / 120) {
    while (s < steps.length && steps[s][0] <= now) { f.goal(0, steps[s][1], steps[s][0]); s++; }
    f.at(now);
    maxJump = Math.max(maxJump, Math.abs(f.b - prev)); prev = f.b;
    if (s && s < steps.length) behind = Math.max(behind, f.b - steps[s - 1][1]);
    assert.ok(f.b <= 0.96 + 1e-9 && f.b >= v - 1e-9, 'never past the model\'s values');
  }
  assert.ok(maxJump < 0.004, `each 120 Hz frame moves a sliver, never a whole step (${maxJump.toFixed(4)})`);
  assert.ok(behind <= 0.0101, `the picture is never more than about two steps behind the model (${behind.toFixed(4)})`);
  assert.equal(f.b, v, 'it lands on the last value');
  assert.equal(f.at(t + 400), false, 'and stops: no tail');
});

test('a jump (a compare button, a new slide\'s clot) glides on the arrival curve, and a step mid-glide carries on from where it stands', () => {
  const f = createFollow();
  f.snap(0, 0);
  assert.equal(f.goal(0, 0.6, 0), true);
  assert.ok(0.6 >= FOLLOW_JUMP && f.glide, 'a jump glides');
  f.at(FOLLOW_GLIDE_MS / 2);
  assert.ok(f.b > 0.3 && f.b < 0.6, 'past halfway at half time (it arrives quickly and settles)');
  const mid = f.b;
  f.goal(0, 0.2, FOLLOW_GLIDE_MS / 2);
  f.at(FOLLOW_GLIDE_MS / 2);
  assert.ok(Math.abs(f.b - mid) < 1e-9, 'a new goal starts from the picture as it stands, never a jump');
  assert.equal(f.at(FOLLOW_GLIDE_MS / 2 + FOLLOW_GLIDE_MS + 1), false);
  assert.equal(f.b, 0.2);
});

test('a lone small change glides; the stream\'s interval is held to its bounds', () => {
  const f = createFollow();
  f.snap(0.1, 0);
  f.goal(0.15, 0, 5000);
  assert.ok(f.glide, 'a lone 5 % slider step glides, it does not snap');
  for (let i = 1; i < 20; i++) f.goal(0.15 + i * 0.01, 0, 5000 + i * 900);   // (steps far apart: each lone)
  const g = createFollow();
  g.snap(0, 0);
  for (let i = 1; i < 30; i++) g.goal(0, i * 0.01, i * 250);   // (a morph's params, 4 a second)
  assert.ok(!g.glide && g.ms <= FOLLOW_MAX_MS && g.ms > 200, `a 4 Hz stream is followed over its own interval (${g.ms.toFixed(0)} ms)`);
});
