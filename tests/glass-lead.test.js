// The glass of a card moved by an animation is drawn where the compositor draws the card: a display frame on from the page's time
// (3 Nov 2026, "cards trail behind"). Measured headless: a canvas square drawn each frame from the animation's currentTime stood a
// constant 7 px (one frame at 60 Hz) behind the box the animation moves, and within 1 px when sampled one frame ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clockOf, clockAt, leadFor } from '../src/ui/glass-motion.js';

// (a 1 s linear translate of 1000 px, started at timeline time 0: the card's x is the animation's time, 1 px a ms)
const anim = (extra = {}) => ({
  effect: { getTiming: () => ({ duration: 1000, delay: 0, endDelay: 0, iterations: 1, easing: 'linear', fill: 'both', direction: 'normal' }) },
  playState: 'running', playbackRate: 1, startTime: 0, currentTime: 0, ...extra,
});
const ST = { st: '', has: false, p: 0, end: 0 };

test('a started animation is led by one display frame, at each refresh rate', () => {
  const c = clockOf(anim(), 0);
  assert.ok(Math.abs(leadFor(c, 60) - 1000 / 60) < 1e-9);
  assert.ok(Math.abs(leadFor(c, 120) - 1000 / 120) < 1e-9);
});

test('the glass drawn from the led clock stands where the compositor draws the card, not a frame behind', () => {
  const c = clockOf(anim(), 0), frame = 1000 / 60;
  for (const T of [0, frame, 5 * frame, 30 * frame]) {
    // (the page's time at the frame's start is T; the compositor samples the animation at T + frame when it draws)
    const cardX = 1000 * ((T + frame) / 1000);
    clockAt(c, T + leadFor(c, 60), ST);
    assert.ok(Math.abs(1000 * ST.p - cardX) < 1e-6, `glass ${1000 * ST.p} against card ${cardX} at ${T}`);
    clockAt(c, T, ST);
    assert.ok(Math.abs(cardX - 1000 * ST.p - frame) < 1e-6, 'unled, it was one frame (16.7 px here) behind');
  }
});

test('no lead for an animation that has not started, one that is paused, or an unknown rate', () => {
  assert.equal(leadFor(clockOf(anim({ startTime: null, currentTime: 0 }), 0), 60), 0);
  assert.equal(leadFor(clockOf(anim({ playState: 'paused' }), 0), 60), 0);
  assert.equal(leadFor(clockOf(anim(), 0), 0), 0);
  assert.equal(leadFor(null, 60), 0);
});

test('a reversed animation is led the other way, a faster one by its rate', () => {
  assert.ok(leadFor(clockOf(anim({ playbackRate: -1 }), 0), 60) < 0);
  assert.ok(Math.abs(leadFor(clockOf(anim({ playbackRate: 2 }), 0), 60) - 2000 / 60) < 1e-9);
});

test('glass-gl puts the lead on its animation clock and none on the inline values scripts write in the frame', () => {
  const gl = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /clockAt\(rec\.c, tlNow\(\) \+ leadFor\(rec\.c, refreshHz\(\) \|\| screenHz \|\| 120\), ST\);/);
  assert.match(gl, /clockOf\(an, tlNow\(\)\)/, 'the clock is still taken at the page\'s own time');
});
