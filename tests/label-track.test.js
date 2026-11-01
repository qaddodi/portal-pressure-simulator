import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackOf, trackAt, easingOf, mixColour } from '../src/ui/label-track.js';

const src = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');

// A stand-in for an Animation: its effect's keyframes and timing, its current time.
const anim = ({ target, kf, duration = 300, delay = 0, easing = 'linear', fill = 'both', ct = 0, transition = false }) => {
  const a = { playbackRate: 1, playState: 'running', currentTime: ct, effect: { target, getKeyframes: () => kf, getTiming: () => ({ duration, delay, easing, fill, iterations: 1, direction: 'normal', iterationStart: 0 }) } };
  if (transition) a.transitionProperty = Object.keys(kf[0]).find((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k));
  return a;
};
const g = { tagName: 'g' }, run = { tagName: 'tspan' };

test('a label\'s fade is worked out from its keyframes each frame, with no read of the page', () => {
  const kf = [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '0' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '1' }];
  const m = trackOf([anim({ target: g, kf })], g, () => false, 1000);
  assert.ok(m);
  assert.equal(trackAt(m, 1000).op, 0);
  assert.ok(Math.abs(trackAt(m, 1150).op - 0.5) < 1e-9);
  assert.equal(trackAt(m, 1400).op, 1);
  assert.equal(m.end, 1300);
});

test('a script fade waiting its turn holds its first value (fill backwards), then eases on its curve', () => {
  const kf = [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '0' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '1' }];
  const m = trackOf([anim({ target: g, kf, delay: 200, fill: 'backwards', easing: 'cubic-bezier(.2, .8, .2, 1)' })], g, () => false, 0);
  assert.equal(trackAt(m, 100).op, 0);
  const mid = trackAt(m, 350).op;
  assert.ok(mid > 0.5 && mid < 1, `eased: ${mid}`);
  assert.equal(trackAt(m, 600).op, 1);   // (past it, no forwards fill: the last keyframe, the label's own)
});

test('a colour transition on a run gives the share of its new colour; CSS mixes premultiplied', () => {
  const kf = [{ offset: 0, computedOffset: 0, easing: 'linear', fill: 'rgb(255, 0, 0)' }, { offset: 1, computedOffset: 1, easing: 'linear', fill: 'rgb(0, 0, 255)' }];
  const m = trackOf([anim({ target: run, kf, easing: 'ease', fill: 'backwards', transition: true })], g, (el) => el === run, 0);
  assert.ok(m.paint);
  assert.equal(trackAt(m, 0).w, 0);
  assert.equal(trackAt(m, 400).w, 1);
  assert.equal(mixColour('rgb(255, 0, 0)', 'rgb(0, 0, 255)', 0.5), 'rgba(128, 0, 128, 1)');
  assert.equal(mixColour('rgba(255, 255, 255, 0)', 'rgb(0, 0, 0)', 0.5), 'rgba(0, 0, 0, 0.5)');
});

test('what is not followed exactly is left to be read each frame (null)', () => {
  const size = [{ offset: 0, computedOffset: 0, easing: 'linear', fontSize: '10px' }, { offset: 1, computedOffset: 1, easing: 'linear', fontSize: '12px' }];
  assert.equal(trackOf([anim({ target: run, kf: size })], g, () => true, 0), null);
  const op = [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '0' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '1' }];
  assert.equal(trackOf([anim({ target: g, kf: op, easing: 'steps(4)' })], g, () => false, 0), null);
  const named = [{ offset: 0, computedOffset: 0, easing: 'linear', fill: 'color(srgb 1 0 0)' }, { offset: 1, computedOffset: 1, easing: 'linear', fill: 'rgb(0, 0, 0)' }];
  assert.equal(trackOf([anim({ target: run, kf: named, transition: true })], g, (el) => el === run, 0), null);
  assert.equal(easingOf('linear(0, 1)'), null);
  // (A child's own opacity and a move are not part of the label's look: passed over.)
  const move = [{ offset: 0, computedOffset: 0, easing: 'linear', transform: 'none' }, { offset: 1, computedOffset: 1, easing: 'linear', transform: 'translateX(2px)' }];
  assert.ok(trackOf([anim({ target: run, kf: move })], g, () => false, 0));
});

test('label-gl follows a label\'s own animations, hovers, focus and theme changes included, and reads no style in a frame', () => {
  assert.match(src, /g\.getAnimations\(\{ subtree: true \}\)/);
  assert.doesNotMatch(src, /labeltrack=0\\b/);
  // (Styles are kept by what decides them and read in a task after the frame; the eases are followed meanwhile.)
  assert.match(src, /try \{ d = given \|\| describeBlock\(g, styleOf\); \}/);
  assert.match(src, /describeMark\(el, styleOf\)/);
  assert.match(src, /if \(!fillT\) fillT = setTimeout\(fillStyles, 0\);/);
  const fn = src.slice(src.indexOf('function styleOf('), src.indexOf('function fillStyles('));
  assert.doesNotMatch(fn, /getComputedStyle/);
  // (The canvas's place is read only when the page may have moved it, never in a frame: no ?holecache=0 any more.)
  assert.match(src, /const holeOrigin = \(\) => holeCr;/);
  assert.match(src, /atlasidle=0/);
  assert.match(src, /if \(needRepack && \(!ATLAS_IDLE \|\| !moving\)\) repack\(\);/);
});
