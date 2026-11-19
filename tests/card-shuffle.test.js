// The shuffle of the words' card and the data card on a screen too short for both (19 Nov 2026, Mohammad: "I like shuffle, let's implement it when the
// vertical screen is not enough. No text scrolling inside cards."). The pure parts run here; the page's behaviour is read from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHUF, shufPose, shufKeyframes, shufDim, spring, shufEnd, shufDrag } from '../src/ui/card-shuffle.js';
import { WORDS_MIN_PX } from '../src/ui/card-type.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('at p = 0 the words are in front and the instrument is a strip behind; at p = 1 it is the other way round', () => {
  const w0 = shufPose('words', 0, 300), d0 = shufPose('data', 0, 340), w1 = shufPose('words', 1, 300), d1 = shufPose('data', 1, 340);
  assert.deepEqual([w0.f, d0.f, w1.f, d1.f], [1, 0, 0, 1]);
  assert.equal(w0.s, 1); assert.equal(d1.s, 1);
  assert.ok(Math.abs(w0.y) < 1e-9 && Math.abs(d1.y) < 1e-9);
  assert.ok(Math.abs(d0.y + SHUF.lift) < 1e-9 && Math.abs(w1.y + SHUF.lift) < 1e-9);
  assert.equal(d0.vis, SHUF.strip); assert.equal(w1.vis, SHUF.strip);
  assert.equal(w0.vis, 300); assert.equal(d1.vis, 340);
  assert.ok(Math.abs(d0.s - SHUF.back) < 1e-9);
});

test('a card behind shows only a strip no taller than the lift above the card in front (it never crosses into it)', () => {
  const g = shufPose('data', 0, 340);
  assert.ok(g.vis * g.s <= SHUF.lift + 4, `a ${g.vis} px strip at ${g.s}`);
  assert.ok(SHUF.strip > 12, 'a strip you can see and tap');
});

test('the words slip out to the side at the middle and are back at the ends; the instrument never moves sideways', () => {
  assert.equal(shufPose('words', 0, 300).x, 0); assert.ok(Math.abs(shufPose('words', 1, 300).x) < 1e-9);
  assert.ok(Math.abs(shufPose('words', 0.5, 300).x - SHUF.side) < 1e-9);
  for (let i = 0; i <= 20; i++) assert.equal(shufPose('data', i / 20, 340).x, 0);
});

test('the top edge of a scaled card is held where the pose says: its translate makes up for the turn about the centre', () => {
  for (const h of [200, 340]) for (const p of [0, 0.3, 0.7, 1]) {
    const g = shufPose('data', p, h);
    const top = g.ty + (1 - g.s) * h / 2;   // where the top edge stands once scaled about the centre
    assert.ok(Math.abs(top - g.y) < 1e-9);
  }
});

test('the keyframes run from offset 0 to 1 in even steps, and are smooth at their ends (the front card is whole, nothing cut)', () => {
  const k = shufKeyframes('data', 340);
  for (const list of [k.tf, k.clip, k.dim]) {
    assert.equal(list.length, SHUF.steps + 1);
    assert.equal(list[0].offset, 0); assert.equal(list.at(-1).offset, 1);
  }
  assert.match(k.tf[0].transform, /scale\(0\.92/); assert.match(k.tf.at(-1).transform, /scale\(1\.0000\)/);
  // (in front, the clip reaches past the box so the shadow is whole; behind, it leaves the strip)
  assert.match(k.clip.at(-1).clipPath, /^inset\(-40\.0px -40\.0px -40\.0px -40\.0px round 18px\)$/);
  assert.match(k.clip[0].clipPath, new RegExp(`^inset\\(0\\.0px 0\\.0px ${(340 - SHUF.strip).toFixed(1)}px 0\\.0px round 18px\\)$`));
  assert.equal(+k.dim.at(-1).opacity, 0); assert.ok(+k.dim[0].opacity > 0.2);
});

test('the words card is dimmer in two layers than the data card in one (each half the weight)', () => {
  assert.ok(shufDim('words', 1, 2) * 2 <= SHUF.dimWords + 1e-9);
  assert.equal(shufDim('data', 0), SHUF.dimData);
  assert.equal(shufDim('data', 1), 0); assert.equal(shufDim('words', 0), 0);
});

test('the spring settles on its end without passing it, and a release goes the way the finger was going', () => {
  let p = 0, v = 0, over = 0, n = 0;
  for (; n < 400; n++) { const s = spring(p, v, 1, 1 / 60); p = s.p; v = s.v; over = Math.max(over, p - 1); if (s.done) break; }
  assert.ok(n < 100, `${n} frames`);
  assert.equal(p, 1); assert.ok(over < 1e-6, 'no overshoot');
  assert.equal(shufEnd(0.4, 0), 0); assert.equal(shufEnd(0.6, 0), 1);
  assert.equal(shufEnd(0.3, 2), 1, 'a quick throw up carries it'); assert.equal(shufEnd(0.7, -2), 0);
  assert.equal(shufDrag(0, 85), 0.5);
  assert.ok(shufDrag(0, -170) > -0.3 && shufDrag(0, -170) < 0, 'it gives a little past the end');
});

test('layout shuffles only a screen too short for the pair, and a card with readings to tuck is not shuffled', () => {
  const s = src('src/ui/presenter-ladders.js');
  assert.match(s, /if \(!below && sw && !wideSheet\(dd\)\) \{ shuf = true; below = true;/);
  assert.match(s, /live\.shuffle\?\.park\(\);\s*\n\s*try \{ layoutNow\(\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.match(s, /live\.shuffle\?\.sync\(shuf, lockKey \|\| ''\)/);
  assert.match(s, /let y = shuf \? top0 :/);
  assert.match(s, /shift = shuf \? SHUF\.lift \* k :/);
  assert.match(s, /!shuf && !wideSheet\(dd\)\) rise = pairRise/, 'a shuffled pair does not rise');
  assert.match(s, /textLock = \{ key: lockKey, below, shuf,/, 'the shuffle is part of what a slide keeps');
});

test('the fit parks the shuffle while it measures, and nothing scrolls inside a card for want of room', () => {
  const z = src('src/ui/presenter-zoom.js');
  assert.match(z, /live\.shuffle\?\.park\(\);[^\n]*\n\s*try \{ fitEach\(els\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.doesNotMatch(z, /pz-scrolls/);
  assert.doesNotMatch(src('styles/app-05-presenter-cards.css'), /pz-scrolls/);
  assert.match(z, /Math\.min\(1, WORDS_MIN_PX \/ sm\)/, 'the words\' zoom never takes lettering under 12 px');
  assert.equal(WORDS_MIN_PX, 12);
});

test('the swipe up or down moves the stack only once it is clearly up or down, on a card or the figure, and never over a control', () => {
  const p = src('src/ui/presenter.js');
  assert.match(p, /live\.shuffle = createShuffle\(live\)/);
  assert.match(p, /const k = cardSwipe\(t\.clientX - shufT\.x, t\.clientY - shufT\.y\);\s*\n\s*if \(k < 0\) \{ shufT = null; return; \}/);
  assert.match(p, /shufT\.on = true; sw = null;/, 'the slide swipe lets go of it');
  assert.match(p, /ownsTouch\(e\.target\.closest\?\.\('canvas'\)\?\.parentElement \?\? e\.target/);
});

test('the shuffle moves cards only by animations (a transform added to its own, a clip, a veil), scrubbed on the frame scheduler', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.doesNotMatch(m, /requestAnimationFrame/);
  assert.match(m, /frameFor\('shuffle'\)/);
  assert.match(m, /composite: 'add'/);
  assert.match(m, /pseudoElement: '::after'/);
  assert.doesNotMatch(m, /style\.(transform|translate|scale|rotate|clipPath|opacity)\s*=/, 'no inline style is written per frame');
  const css = src('styles/app-05-presenter-cards.css');
  assert.match(css, /\.pz-shade\.pz-shuf::after/);
  assert.match(css, /\.pz\.pz-shuf\.pz-shuf-data \.pz-data \{ z-index: 3; \}/);
});
