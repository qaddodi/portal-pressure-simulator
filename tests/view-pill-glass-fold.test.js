// The view pill keeps its glass through a fold (13 Nov 2026, Mohammad: "When switching from lobular to anatomy to sinusoid the pill that
// selects switch goes transparent and loses its glass").
// Cause: the fold hid the real face (opacity 0) and drew two CSS copies of its look, but a face the GPU draws has no CSS look (app.css takes its
// fill, ring and shadow off, [data-gl] and [data-gl="edge"]), so the pill had no glass for the whole fold. The fix asks the GPU glass to change
// size itself (data-gl-morph, glass-gl.js morphFor), from where it is drawn to the new box, on the fold's own length and curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { morphFor, morphAt } from '../src/ui/glass-gl.js';
import { D_SURFACE } from '../src/ui/ease.js';
import { FOLD_MS } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const box = (left, width) => ({ left, top: 0, width, height: 40, right: left + width, bottom: 40 });

test('the fold is as long as the glass\'s own size change, so the two end together', () => {
  assert.equal(FOLD_MS, D_SURFACE);
});

test('morphFor: nothing asks, nothing moves; asked, the glass leaves from the box it is drawn at to the new one', () => {
  const q = { r0: box(100, 200), morph: null };
  assert.equal(morphFor(q, 1000, box(100, 200), true), null, 'the same box: no change');
  assert.equal(morphFor(q, 1000, box(150, 100), false), null, 'a change nobody asked to see: the glass jumps as it always did');
  const m = morphFor(q, 1000, box(150, 100), true);
  assert.deepEqual([m.from.left, m.from.width, m.t0, m.ms], [100, 200, 1000, D_SURFACE]);
});

test('morphFor: a read made part way through carries the same change on, never starts it over; a new box starts from where the glass is drawn', () => {
  const q0 = { r0: box(100, 200), morph: null };
  const m = morphFor(q0, 1000, box(150, 100), true);
  const q = { r0: box(150, 100), morph: m };
  const mid = 1000 + D_SURFACE / 2;
  assert.equal(morphFor(q, mid, box(150, 100), true), m, 'the same target: the same change, its clock untouched');
  const drawn = morphAt(q, mid);
  assert.ok(drawn.width < 200 && drawn.width > 100, 'part way between the two boxes');
  const m2 = morphFor(q, mid, box(100, 200), true);
  assert.notEqual(m2, m);
  assert.equal(m2.from.width, drawn.width, 'a new target leaves from the box as drawn then');
  assert.equal(morphFor(q, 1000 + D_SURFACE + 1, box(150, 100), true), null, 'over: at rest at the new box');
});

test('the pill\'s fold hands a GPU-drawn face to the glass and keeps the CSS halves for a face the page draws', () => {
  const pm = read('../src/ui/pill-motion.js');
  const m = /if \(face\.hasAttribute\('data-gl'\)\) \{([^}]*)\} else \{([^]*?)\n {2}\}/.exec(pm);
  assert.ok(m, 'the fold branches on the face being drawn by the GPU');
  assert.match(m[1], /face\.setAttribute\('data-gl-morph', ''\)/);
  assert.doesNotMatch(m[1], /splitFace/, 'a GPU face is not hidden and copied');
  assert.match(m[2], /splitFace\(face,/, 'a face the page draws (no WebGL2, Blur effect off) keeps the halves');
  assert.equal(pm.match(/splitFace\(/g).length, 1, 'one call only, on the fallback: no second route that hides the face');
  // The mark is never left on: any end of a fold takes it off (it would ease every later layout move of the pill, trailing its words).
  assert.match(pm, /export function stopFold\(\) \{\s*unmorph\(\);/);
  assert.match(pm, /function unmorph\(\) \{[^}]*removeAttribute\('data-gl-morph'\)/);
});

test('why the halves cannot carry the glass: a GPU face has no CSS fill, ring or shadow to copy', () => {
  const css = read('../styles/app.css'), fs = read('../src/ui/face-split.js');
  assert.match(css, /\.nb-views > \.vp-face, \.sv-legend\)\[data-gl\] \{ background: none; \}/);
  assert.match(css, /\[data-gl="edge"\]:not\(\.pal, \.modal\) \{ box-shadow: none !important;/);
  assert.match(fs, /const LOOK = \['backgroundColor'/, 'the halves copy the computed look');
});
