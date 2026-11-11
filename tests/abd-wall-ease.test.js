import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoftFade } from '../src/ui/soft-fade.js';

// The skin tint around the navel (the caput medusae) fades by two soft follows in series: never a jump, never a step back, and a target that
// moves again part-way bends the fade instead of restarting it (the navel's glow popped, 11 Nov 2026).
function rig({ reduce = false } = {}) {
  const wrote = [], queued = [];
  let clock = 1000;
  const fade = createSoftFade({ write: (v) => wrote.push(+v), frame: (cb) => { queued.push(cb); return queued.length; }, cancel: () => { queued.length = 0; }, reduced: () => reduce, now: () => clock });
  // Runs frames of 16 ms until none is asked for (or `max` of them); returns how many ran.
  const play = (max = 400) => { let n = 0; while (queued.length && n < max) { clock += 16; queued.shift()(clock); n++; } return n; };
  return { to: fade.to, wrote, play, queued };
}

test('the tint rises smoothly to its target, never above it, and then asks for no more frames', () => {
  const r = rig();
  r.to('0.90');
  const n = r.play();
  assert.ok(n > 40 && n < 120, `${n} frames (about a second)`);
  assert.equal(r.wrote.at(-1), 0.9);
  assert.equal(r.queued.length, 0);
  let maxStep = 0;
  for (let i = 1; i < r.wrote.length; i++) { assert.ok(r.wrote[i] >= r.wrote[i - 1] && r.wrote[i] <= 0.9, `frame ${i}: ${r.wrote[i]}`); maxStep = Math.max(maxStep, r.wrote[i] - r.wrote[i - 1]); }
  assert.ok(r.wrote[0] < 0.02, `it starts gently: ${r.wrote[0]}`);
  assert.ok(maxStep < 0.04, `no frame moves it by more than 4%: ${maxStep.toFixed(3)}`);
});

test('going out is as gentle as coming in, and a new target part-way bends the fade without a jump', () => {
  const r = rig();
  r.to('0.90'); r.play();
  r.wrote.length = 0;
  r.to('0.00');
  for (let i = 0; i < 20; i++) r.play(1);
  const mid = r.wrote.at(-1);
  r.to('0.45');
  r.play();
  assert.equal(r.wrote.at(-1), 0.45);
  for (let i = 1; i < r.wrote.length; i++) assert.ok(Math.abs(r.wrote[i] - r.wrote[i - 1]) < 0.04, `frame ${i}: ${r.wrote[i - 1]} → ${r.wrote[i]}`);
  assert.ok(mid > 0.1 && mid < 0.9, `part-way: ${mid}`);
});

test('a frame that began before the fade did cannot move it backwards', () => {
  const r = rig();
  r.to('0.90');
  r.queued.shift()(900);   // the frame's own clock, 100 ms before the one the fade began at
  assert.ok(r.wrote.at(-1) >= 0 && r.wrote.at(-1) < 0.01, `${r.wrote.at(-1)}`);
});

test('a target that is already shown asks for no frame, and Reduce Motion shows it at once', () => {
  const r = rig();
  r.to('0.00');
  assert.equal(r.queued.length, 0);
  const q = rig({ reduce: true });
  q.to('0.90');
  assert.equal(q.wrote.at(-1), 0.9); assert.equal(q.queued.length, 0);
});
