// The view pill keeps its glass through a fold (13 Nov 2026, Mohammad: "When switching from lobular to anatomy to sinusoid the pill that
// selects switch goes transparent and loses its glass").
// Cause: the fold hid the real face (opacity 0) and drew two CSS copies of its look, but a face the GPU draws has no CSS look (app.css takes its
// fill, ring and shadow off, [data-gl] and [data-gl="edge"]), so the pill had no glass for the whole fold. The fix asks the GPU glass to change
// size itself (data-gl-morph, glass-gl.js morphFor), from where it is drawn to the new box, on the fold's own length and curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { morphFor, morphAt, morphAsk } from '../src/ui/glass-gl.js';
import { morphGlass, gpuGlass } from '../src/ui/glass-morph.js';
import { glidePlateOn } from '../src/ui/plate-glide.js';
import { EASE_MOVE, EASE_ARRIVE, D_SMALL } from '../src/ui/ease.js';
import { D_SURFACE } from '../src/ui/ease.js';
import { FOLD_MS } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ASK = morphAsk('');
const box = (left, width) => ({ left, top: 0, width, height: 40, right: left + width, bottom: 40 });

test('the fold is as long as the glass\'s own size change, so the two end together', () => {
  assert.equal(FOLD_MS, D_SURFACE);
});

test('morphFor: nothing asks, nothing moves; asked, the glass leaves from the box it is drawn at to the new one', () => {
  const q = { r0: box(100, 200), morph: null };
  assert.equal(morphFor(q, 1000, box(100, 200), ASK), null, 'the same box: no change');
  assert.equal(morphFor(q, 1000, box(150, 100), null), null, 'a change nobody asked to see: the glass jumps as it always did');
  const m = morphFor(q, 1000, box(150, 100), ASK);
  assert.deepEqual([m.from.left, m.from.width, m.t0, m.ms], [100, 200, 1000, D_SURFACE]);
});

test('morphFor: a read made part way through carries the same change on, never starts it over; a new box starts from where the glass is drawn', () => {
  const q0 = { r0: box(100, 200), morph: null };
  const m = morphFor(q0, 1000, box(150, 100), ASK);
  const q = { r0: box(150, 100), morph: m };
  const mid = 1000 + D_SURFACE / 2;
  assert.equal(morphFor(q, mid, box(150, 100), ASK), m, 'the same target: the same change, its clock untouched');
  const drawn = morphAt(q, mid);
  assert.ok(drawn.width < 200 && drawn.width > 100, 'part way between the two boxes');
  const m2 = morphFor(q, mid, box(100, 200), ASK);
  assert.notEqual(m2, m);
  assert.equal(m2.from.width, drawn.width, 'a new target leaves from the box as drawn then');
  assert.equal(morphFor(q, 1000 + D_SURFACE + 1, box(150, 100), ASK), null, 'over: at rest at the new box');
});

test('the pill\'s fold hands a GPU-drawn face to the glass and keeps the CSS halves for a face the page draws', () => {
  const pm = read('../src/ui/pill-motion.js');
  assert.match(pm, /morphEnd = morphGlass\(face, ms\);/);
  assert.match(pm, /if \(!morphEnd\) \{\s*const sp = splitFace\(face,/, 'a face the page draws (no WebGL2, Blur effect off) keeps the halves');
  assert.equal(pm.match(/splitFace\(/g).length, 1, 'one call only, on the fallback: no second route that hides the face');
  // The mark is never left on: any end of a fold takes it off (it would ease every later layout move of the pill, trailing its words).
  assert.match(pm, /export function stopFold\(\) \{\s*unmorph\(\);/);
  assert.match(pm, /function unmorph\(\) \{ morphEnd\?\.\(\); morphEnd = null; \}/);
});

test('why the halves cannot carry the glass: a GPU face has no CSS fill, ring or shadow to copy', () => {
  const css = read('../styles/app.css'), fs = read('../src/ui/face-split.js');
  assert.match(css, /\.nb-views > \.vp-face, \.sv-legend\)\[data-gl\] \{ background: none; \}/);
  assert.match(css, /\[data-gl="edge"\]:not\(\.pal, \.modal\) \{ box-shadow: none !important;/);
  assert.match(fs, /const LOOK = \['backgroundColor'/, 'the halves copy the computed look');
});

// ── Every glass that changes size keeps its frost (the zoom pill, the Why? card, the top bar's pills) ──
const fakeEl = (attrs = {}) => {
  const a = new Map(Object.entries(attrs));
  return { hasAttribute: (k) => a.has(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null), setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k), attrs: a };
};

test('morphAsk: a plain mark is the surface length on the arrive curve; a value names the length and the move curve; no mark asks nothing', () => {
  assert.equal(morphAsk(null), null);
  assert.deepEqual(morphAsk(''), { ms: D_SURFACE, move: false });
  assert.deepEqual(morphAsk('240 move'), { ms: D_SMALL, move: true });
  assert.deepEqual(morphAsk('300'), { ms: 300, move: false });
  assert.equal(morphAsk('240 move'), morphAsk('240 move'), 'one record per value: a read makes nothing');
});

test('morphFor: the change leaves from where the glass was DRAWN on the screen, not from the old box in a box the page has since moved', () => {
  // A pill that grows to the left: the page moves its whole box back by a translate that eases to 0 (FLIP), which the glass adds each frame.
  // The glass was drawn at 100 with no motion; the new box is at 90 and the page's glide puts +10 on it now.
  const q = { r0: box(100, 200), morph: null, mx: 0, my: 0 };
  const m = morphFor(q, 1000, box(90, 220), morphAsk('240 move'), 10, 0);
  assert.equal(m.from.left + 10, 100, 'drawn at 100 on the first frame, as it stood');
  assert.equal(m.from.width, 200);
  assert.equal(m.move, true);
  assert.equal(m.ms, D_SMALL);
  // A glass last drawn with a motion of its own and none now leaves from where it stood on the screen.
  const q2 = { r0: box(100, 200), morph: null, mx: 7, my: 0 };
  assert.equal(morphFor(q2, 1000, box(90, 220), morphAsk(''), 0, 0).from.left, 107);
});

test('morphGlass: marks a GPU-drawn glass for the length of the change and a little past it, takes the mark off, and leaves the page\'s own glass alone', async () => {
  const page = fakeEl();
  assert.equal(gpuGlass(page), false);
  assert.equal(morphGlass(page, 240, true), null, 'a glass the page draws keeps its stand-in');
  assert.equal(page.attrs.size, 0);
  const g = fakeEl({ 'data-gl': 'edge' });
  const end = morphGlass(g, 240, true);
  assert.equal(g.getAttribute('data-gl-morph'), '240 move');
  const end2 = morphGlass(g, 420);
  assert.equal(g.getAttribute('data-gl-morph'), '420', 'a second ask takes the first over');
  end();   // (the first one's end is spent: it must not take the second one's mark off)
  assert.equal(g.getAttribute('data-gl-morph'), '420');
  end2(); end2();
  assert.equal(g.hasAttribute('data-gl-morph'), false);
});

test('glidePlateOn: a box the GPU draws changes size by its glass, with no pieces; a box the page draws keeps its nine pieces', () => {
  const g = fakeEl({ 'data-gl': '' });
  let done = 0;
  const end = glidePlateOn(g, [], { x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 0, w: 140, h: 40 }, { R: 16, duration: D_SMALL, easing: EASE_MOVE, done: () => { done++; } });
  assert.equal(g.getAttribute('data-gl-morph'), '240 move', 'on its own length and curve');
  end(); end();
  assert.equal(done, 1, 'done runs once, however often it is ended');
  assert.equal(g.hasAttribute('data-gl-morph'), false);
  const src = read('../src/ui/plate-glide.js');
  assert.match(src, /const gpu = morphGlass\(host, duration, easing === EASE_MOVE\);\s*if \(gpu\) \{[^]*?return end;\s*\}\s*R = Math\.max/, 'the stand-in follows, for a glass the page draws');
  assert.equal(EASE_ARRIVE === EASE_MOVE, false);
});

test('the top bar\'s pills: a GPU-drawn face or pill changes size by its glass; the copies, the lent face and the fading old plate are for glass the page draws', () => {
  const tm = read('../src/ui/topbar-motion.js');
  assert.match(tm, /function plateGlide\(face, x0, w0, w1, timing\) \{[^]*?const gl = morphGlass\(face, timing\.duration, timing\.easing === EASE_MOVE\);\s*if \(gl\) return null;/);
  assert.match(tm, /if \(!face && gpuGlass\(el\)\) morphGlass\(el, MOVE_MS, true\);[^\n]*\n\s*else if \(!face\) \{/, 'a pill with its own GPU glass is lent no face');
  assert.match(tm, /else if \(gpuGlass\(el\)\) morphGlass\(el, MOVE_MS, true\);[^\n]*\n\s*else ghost\(el, s, \{ own, tot, next \}, true\);/, 'a narrowing pill with its own GPU glass narrows it, no old plate fades');
});

test('nothing but the glass-morph helper writes the mark', () => {
  for (const f of ['pill-motion.js', 'plate-glide.js', 'topbar-motion.js', 'face-split.js']) {
    assert.doesNotMatch(read(`../src/ui/${f}`), /setAttribute\('data-gl-morph'/, f);
  }
});
