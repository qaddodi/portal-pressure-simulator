// The chrome around the figure on the compositor (1 Nov 2026, "move everything to GPU"): the view pill's face changes width by two
// halves that only translate (face-split.js), and the focus ring fades as a copy on its own layer (focus-ring.js ringBox). (The top
// bar's plates and the lens key are topbar-motion.js plateGlide and legend-morph.js, their own tests.) Here: the pure parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seamOf, splitPlan } from '../src/ui/face-split.js';
import { ringBox } from '../src/ui/focus-ring.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('face-split: the seam sits where both edges leave the face covered, clear of the corners; too narrow is null (the width animates)', () => {
  assert.equal(seamOf({ a0: 0, b0: 200, a1: 40, b1: 160 }, 15), 100);
  assert.equal(seamOf({ a0: 0, b0: 40, a1: 0, b1: 200 }, 15), 20);
  assert.equal(seamOf({ a0: 0, b0: 30, a1: 0, b1: 200 }, 15), null, 'narrower than its two corners at the start');
});

test('face-split: each copy draws its edge where the width animation drew it, at the start and at the end', () => {
  for (const span of [{ a0: 10, b0: 190, a1: 40, b1: 160 }, { a0: 60, b0: 260, a1: 0, b1: 260 }, { a0: 0, b0: 120, a1: 0, b1: 300 }]) {
    const p = splitPlan(span, 15);
    assert.ok(p, 'drawn split');
    // left copy: its box's x plus its translate is the face's left edge
    assert.equal(p.left.x + p.left.tx0, span.a0); assert.equal(p.left.x + p.left.tx1, span.a1);
    // right copy: its left edge plus its width is the face's right edge
    assert.equal(p.right.x + p.right.tx0 + p.w, span.b0); assert.equal(p.right.x + p.right.tx1 + p.w, span.b1);
    // the boxes meet at the seam and never overlap
    assert.equal(p.left.x + p.left.w, p.c); assert.equal(p.right.x, p.c);
    // each copy reaches past the seam by more than a corner, so the straight run crosses it in both
    for (const t of [0, 1]) {
      const a = t ? span.a1 : span.a0, b = t ? span.b1 : span.b0;
      assert.ok(a + p.w >= p.c + 15, 'the left copy runs past the seam');
      assert.ok(b - p.w <= p.c - 15, 'the right copy starts before it');
    }
  }
});

test('face-split carries every width change of the view pill: no width animation is left', () => {
  const fs = read('src/ui/face-split.js');
  assert.match(fs, /export const FACE_SPLIT = true;/);
  const pm = read('src/ui/pill-motion.js');
  assert.match(pm, /const sp = splitFace\(face, \{ a0: cx - before\.w \/ 2, b0: cx \+ before\.w \/ 2, a1: cx - after\.w \/ 2, b1: cx \+ after\.w \/ 2 \}, opt\);/);
  assert.doesNotMatch(pm, /animate\(\[\{[^\]]*\bwidth:/, 'no width animation');
  assert.match(fs, /box\.dataset\.ghost = '';/, 'the top bar never measures a half');
  // Only translate and opacity animate.
  const anim = fs.match(/\.animate\(\[[^\]]*\]/g) || [];
  assert.ok(anim.length >= 2 && anim.every((a) => !/width|left|clip/.test(a)), anim.join(' | '));
});

test('focus ring: the copy is the control\'s box grown by the ring\'s offset and width, at the scale it is drawn', () => {
  assert.deepEqual(ringBox({ left: 10, top: 20, width: 100, height: 30 }, 1, 2, 2, 8), { x: 6, y: 16, w: 108, h: 38, bw: 2, rad: 12 });
  assert.deepEqual(ringBox({ left: 0, top: 0, width: 40, height: 20 }, 2, 2, -2, 999), { x: 0, y: 0, w: 40, h: 20, bw: 4, rad: 10 }, 'a ring worn inside, a round control, at 2×');
});

test('selection pill and menu veils: compositor rules behind their classes', () => {
  const css = read('styles/app.css');
  assert.match(css, /\.seg-glide\.glide-gpu::before \{ left: 0; top: 0; translate: var\(--gx\) var\(--gy\); scale: var\(--gsx, 1\) var\(--gsy, 1\); transform-origin: 0 0;\s*transition: translate var\(--d-small\) var\(--ease-move\), scale var\(--d-small\) var\(--ease-move\); \}/);
  assert.match(css, /:root\.se-gpu \.menu\.se \{ transition: none; \}/);
  assert.match(read('src/ui/scroll-edges.js'), /\n\s+document\.documentElement\.classList\.add\('se-gpu'\);/);
});
