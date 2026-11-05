import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackOf, trackAt, settleUnder, easingOf, mixColour } from '../src/ui/label-track.js';

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
  assert.equal(trackAt(m, 600).op, null);   // (past it, no forwards fill: no contribution, the label's own opacity)
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
  // (2 Nov 2026: taken where the page is up to date, in the event that announced them or just after a frame; the frame only takes them.)
  assert.match(src, /el\.getAnimations\(\{ subtree: true \}\)/);
  assert.match(src, /try \{ list = takeAnims\(g, true\); \} catch \{ list = \[\]; \}/);
  assert.match(src, /const hold = \(ev, ms = 700\) => \{ const g = labelOf\(ev\.target\); if \(g\) \{ keepAnims\(g, true\);/);
  assert.doesNotMatch(src, /labeltrack=0\\b/);
  // (Styles are kept by what decides them and read in a task after the frame; the eases are followed meanwhile.)
  assert.match(src, /try \{ d = given \|\| \(lk != null \? lookStyles\.describe\(g, lk, lookSrc, ringBoxOf\) : describeBlock\(g, styleOf, ringBoxOf\)\); \}/);   // (a label of a kept look: its styles as kept, L3 P3)
  assert.match(src, /describeMark\(el, styleOf\)/);
  assert.match(src, /if \(!fillT\) fillT = setTimeout\(fillStyles, 0\);/);
  const fn = src.slice(src.indexOf('function styleOf('), src.indexOf('function fillStyles('));
  assert.doesNotMatch(fn, /getComputedStyle/);
  // (The canvas is the figure's: its place is never read here, no hole being cut.)
  assert.doesNotMatch(src, /getBoundingClientRect/);
  assert.match(src, /if \(\(needRepack && !stuck\) \|\| rp \|\| todo\.size\) settleSoon\(\);/);   // (R12: a repack goes on beside the old atlas, a few copies a frame, mid-move too)
  assert.match(src, /if \(!moving && !pageTex\[1\] && packer\.maxPages > 1/);
});

// (R10: the opacity beneath the animations is not invented from a keyframe.)
const fade = [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '0' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '1' }];
const fade2 = [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: '0.2' }, { offset: 1, computedOffset: 1, easing: 'linear', opacity: '0.6' }];

test('a delayed fill:none fade contributes nothing before its start or after its end (the caller keeps its own opacity)', () => {
  const m = trackOf([anim({ target: g, kf: fade, delay: 200, fill: 'none' })], g, () => false, 0);
  assert.equal(trackAt(m, 100).op, null);
  assert.ok(Math.abs(trackAt(m, 350).op - 0.5) < 1e-9);
  assert.equal(trackAt(m, 600).op, null);
  // (With the real underlying opacity passed in, that is what shows outside the animation.)
  const u = trackOf([anim({ target: g, kf: fade, delay: 200, fill: 'none' })], g, () => false, 0, 0.4);
  assert.equal(trackAt(u, 100).op, 0.4);
  assert.equal(trackAt(u, 600).op, 0.4);
});

test('fill modes: backwards holds the first keyframe in the delay, forwards the last after the end, both do both, none neither', () => {
  const at = (fill, t) => trackAt(trackOf([anim({ target: g, kf: fade, delay: 200, fill })], g, () => false, 0, 0.4), t).op;
  assert.equal(at('backwards', 100), 0);
  assert.equal(at('backwards', 600), 0.4);
  assert.equal(at('forwards', 100), 0.4);
  assert.equal(at('forwards', 600), 1);
  assert.equal(at('both', 100), 0);
  assert.equal(at('both', 600), 1);
  assert.equal(at('none', 100), 0.4);
  assert.equal(at('none', 600), 0.4);
});

test('two replace animations: the topmost that contributes wins, the one below shows where it does not', () => {
  const low = anim({ target: g, kf: fade2, fill: 'both' });
  const top = anim({ target: g, kf: fade, delay: 200, fill: 'none' });
  const m = trackOf([low, top], g, () => false, 0, 0.4);
  assert.ok(Math.abs(trackAt(m, 100).op - 0.2 - 0.4 * (100 / 300)) < 1e-9);   // top waiting: the lower one
  assert.ok(Math.abs(trackAt(m, 350).op - 0.5) < 1e-9);   // top running: it wins
  assert.equal(trackAt(m, 600).op, 0.6);   // top over (fill none), lower held forwards
});

test('a read of the page taken while no fade has an effect becomes the opacity under it; one taken mid-fade does not', () => {
  const m = trackOf([anim({ target: g, kf: fade, delay: 100, fill: 'none' })], g, () => false, 0);
  assert.equal(settleUnder(m, 50, 0.6), true);
  assert.equal(trackAt(m, 50).op, 0.6);
  assert.equal(trackAt(m, 450).op, 0.6);
  const mid = trackOf([anim({ target: g, kf: fade, fill: 'none', ct: 100 })], g, () => false, 0);
  assert.equal(settleUnder(mid, 0, 0.3), false);
  assert.equal(mid.under, null);
});
