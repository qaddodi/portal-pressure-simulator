import { stageSource } from './stage-src.js';
// The view pill folds rather than snapping to a new width (17 Oct, Mohammad): into the lobule the Sinusoid button "should slide
// out not just appear snap", and into the sinusoid view Anatomy and Circuit "fold inside the pill" (and come back out of it). The
// face grows or shrinks about the pill's centre, the buttons that stay slide to their places, and a button that comes or goes
// travels with its nearest neighbour that stays, shown only inside the face.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldPlan, faceClip, coverFade, easeIO3, FOLD_MS, FOLD_EASE } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js');
const stage = stageSource();
const motion = read('../src/ui/pill-motion.js');
const css = read('../styles/app.css');

// The pill's buttons in their order, with a 2 px gap and 6 px of face around them, centred on the pill (px from its centre).
const ORDER = ['circuit', 'anatomic', 'lobule', 'sinusoid'];
const W = { circuit: 70, anatomic: 80, lobule: 66, sinusoid: 86 }, GAP = 2, PAD = 6;
const lay = (keys) => {
  const inner = keys.reduce((s, k) => s + W[k], 0) + GAP * (keys.length - 1);
  let x = -inner / 2;
  const btns = keys.map((key) => { const e = { key, l: x, r: x + W[key], o: 1 }; x += W[key] + GAP; return e; });
  return { btns, w: inner + 2 * PAD, seg: { l: -inner / 2, r: inner / 2 } };
};
// Where each button is drawn at a point u of the fold (0 to 1), and the face's half-width then.
const at = (plan, before, after, u) => {
  const e = easeIO3(u), out = {};
  for (const [k, p] of plan) {
    const rest = p.kind === 'out' ? before.btns.find((b) => b.key === k) : after.btns.find((b) => b.key === k);
    const dx = p.dx0 + (p.dx1 - p.dx0) * e;
    out[k] = { l: rest.l + dx, r: rest.r + dx, o: p.o0 + (p.o1 - p.o0) * e };
  }
  return { b: out, half: (before.w + (after.w - before.w) * e) / 2 };
};

test('into the lobule the Sinusoid button slides out from behind Lobule, the pill growing about its centre', () => {
  const before = lay(['circuit', 'anatomic', 'lobule']), after = lay(ORDER), plan = foldPlan(before.btns, after.btns, ORDER);
  assert.equal(plan.get('sinusoid').kind, 'in');
  for (const k of ['circuit', 'anatomic', 'lobule']) assert.equal(plan.get(k).kind, 'stay');
  assert.ok(plan.get('lobule').dx0 > 0, 'the buttons that stay start where they were, right of their new places');
  assert.equal(plan.get('sinusoid').dx0, plan.get('lobule').dx0, 'the Sinusoid button travels with Lobule');
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const { b, half } = at(plan, before, after, u);
    assert.ok(b.sinusoid.l >= b.lobule.r + GAP - 1e-9, 'never drawn over Lobule');
    // Its words (14 px in from its edge) show only once the face's edge has passed them.
    if (u === 0) assert.ok(b.sinusoid.l + 14 >= half, 'at the start its words are all outside the face, so unseen');
  }
  const end = at(plan, before, after, 1);
  for (const k of ORDER) assert.ok(Math.abs(end.b[k].l - after.btns.find((e) => e.key === k).l) < 1e-9, `${k} lands on its place`);
  assert.equal(end.b.sinusoid.o, 1);
});

test('out of the lobule it slides back in behind Lobule and goes', () => {
  const before = lay(ORDER), after = lay(['circuit', 'anatomic', 'lobule']), plan = foldPlan(before.btns, after.btns, ORDER);
  const p = plan.get('sinusoid');
  assert.equal(p.kind, 'out');
  assert.equal(p.dx1, after.btns[2].l - before.btns[2].l, 'it travels with Lobule');
  const end = at(plan, before, after, 1);
  assert.ok(end.b.sinusoid.l + 14 >= end.half, 'it ends outside the face, unseen');
  assert.equal(end.b.sinusoid.o, 0);
});

test('into the sinusoid Anatomy and Circuit fold away behind the face\'s edge, and come back out of it on the way out', () => {
  const four = lay(ORDER), two = lay(['lobule', 'sinusoid']);
  const inPlan = foldPlan(four.btns, two.btns, ORDER);
  assert.equal(inPlan.get('circuit').kind, 'out'); assert.equal(inPlan.get('anatomic').kind, 'out');
  assert.equal(inPlan.get('lobule').kind, 'stay'); assert.equal(inPlan.get('sinusoid').kind, 'stay');
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const { b } = at(inPlan, four, two, u);
    assert.ok(b.anatomic.r + GAP <= b.lobule.l + 1e-9 && b.circuit.r + GAP <= b.anatomic.l + 1e-9, 'never drawn over the buttons that stay');
  }
  const end = at(inPlan, four, two, 1);
  assert.ok(end.b.anatomic.r - 14 <= -end.half, 'Anatomy ends outside the face');
  const outPlan = foldPlan(two.btns, four.btns, ORDER), start = at(outPlan, two, four, 0);
  assert.equal(outPlan.get('anatomic').kind, 'in');
  assert.ok(start.b.anatomic.r - 14 <= -start.half, 'coming back, it starts outside the face');
  assert.equal(start.b.anatomic.o, 0);
});

test('a fold that takes over from another starts from what is drawn, its ghost included', () => {
  // Out of the lobule half way (Sinusoid's ghost at half opacity), and back in: the real button picks up from the ghost.
  const ghost = { key: 'sinusoid', l: 40, r: 126, o: 0.5 }, before = { btns: [...lay(['circuit', 'anatomic', 'lobule']).btns, ghost] };
  const plan = foldPlan(before.btns, lay(ORDER).btns, ORDER);
  assert.deepEqual(plan.get('sinusoid'), { kind: 'stay', dx0: 40 - lay(ORDER).btns[3].l, dx1: 0, o0: 0.5, o1: 1 });
});

test('the row is cut to the face, which at rest is the pill itself', () => {
  const p = lay(ORDER), c = faceClip(p.w, p.seg);
  assert.equal(c.l, -PAD); assert.equal(c.r, -PAD);
  const narrow = faceClip(p.w - 100, p.seg);
  assert.equal(narrow.l, 50 - PAD); assert.equal(narrow.r, 50 - PAD);
});

test('the fold is wired to every change of the pill\'s buttons, on the zoom\'s clock', () => {
  // (17 Oct, Mohammad: the folding "should be faster and eased".) Quicker than the zoom out (950 ms) and the dive, on the app's ease.
  assert.ok(FOLD_MS >= 300 && FOLD_MS <= 500, `${FOLD_MS} ms`);
  assert.ok(FOLD_MS < +read('../src/ui/lobule-zoom.js').match(/ms = \(reduce\.matches \? 280 : on \? \d+ : (\d+)\)/)[1] / 2 && FOLD_MS < +stage.match(/RISE_MS = (\d+)/)[1] / 2);
  assert.equal(FOLD_EASE, read('../styles/tokens.css').match(/--ease-arrive: (cubic-bezier\([^)]*\))/)[1]);
  assert.match(read('../styles/tokens.css'), /--ease: var\(--ease-arrive\);/);
  assert.match(motion, /const opt = \{ duration: ms, easing: FOLD_EASE \}/);
  assert.match(main, /if \(before && box1\) foldPill\(seg, box1, before\);/);
  assert.match(main, /const viewChange = \(\) => \{ viewSinBtn\.hidden = viewSinHide; app\.classList\.toggle\('sin-focus', viewInSin\); \};/);
  assert.match(main, /pillChange\(viewChange\);/);
  // Only compositor work on the buttons: transform, opacity and the row's clip; the face is a box with nothing in it.
  assert.doesNotMatch(motion.match(/export function foldPill[\s\S]*$/)[0], /\b(left|width|margin|padding)\b[^\n]*animate|animate\(\[\{ (left|margin|padding)/);
  assert.match(css, /\.nb-views > \.vp-face \{ position: absolute; z-index: -1;[^}]*background: var\(--glass\);/);
  assert.match(main, /h\('span', \{ class: 'vp-face', 'aria-hidden': 'true' \}\)/);
  // A going button's ghost is nothing the page finds (no data-view, so neither the sinusoid view's rule nor any lookup sees it).
  assert.match(motion, /for \(const at of \['data-view', 'title', 'hidden'\]\) g\.removeAttribute\(at\);/);
  assert.match(motion, /g\.inert = true;/);
  assert.match(main, /viewBtns \|\|= \$\$\('#viewSeg button\[data-view\]'\);/);
  assert.match(main, /viewBtns\[i\]\.setAttribute\('aria-pressed'/);
  // In the top bar (presenting) the bar's own motion plays it (topbar-motion.js): the fold stops there.
  assert.match(main, /if \(home && seg\.parentElement !== home\) \{ if \(pres\) stopFold\(\); home\.append\(seg\); \}/, 'the same element, moved');
});

test('a coming button shows only as the face covers it, by opacity (no clip-path on the row)', () => {
  // A button 40 px wide at 60..100 from the centre, the face's half width growing 50 → 110: hidden at first, whole at the end.
  const k = coverFade({ l: 60, r: 100, dx0: -40, dx1: 0, o0: 0, o1: 1, e0: 50, e1: 110 });
  assert.equal(k[0].opacity, 0); assert.equal(k.at(-1).opacity, 1);
  for (let i = 1; i < k.length; i++) assert.ok(k[i].opacity >= k[i - 1].opacity - 1e-9, 'it only grows');
  // A going button (face shrinking over it) is gone by the end.
  const g = coverFade({ l: 60, r: 100, dx0: 0, dx1: -40, o0: 1, o1: 0, e0: 110, e1: 50 });
  assert.equal(g[0].opacity, 1); assert.equal(g.at(-1).opacity, 0);
  assert.doesNotMatch(motion.match(/export function foldPill[\s\S]*$/)[0], /clipPath/);
});

test('a coming or going word is never drawn past the face: wherever its keyframes give it any opacity, all of its word is inside', () => {
  // (The fold's opacity between two keyframes is linear in the eased progress; the word's edges and the face's are too.)
  const cases = [
    // (Sinusoid to Lobule: the two-button pill, half width 87, grows to four, 170; Lobule moves 81 px right, and Circuit and Anatomy with it.)
    { l: -164, r: -76, pl: 14, pr: 14, dx0: -81, dx1: 0, o0: 0, o1: 1, e0: 87, e1: 170, inset: 1.2 },   // (Circuit coming)
    { l: -74, r: 2, pl: 14, pr: 14, dx0: -81, dx1: 0, o0: 0, o1: 1, e0: 87, e1: 170, inset: 1.2 },      // (Anatomy coming)
    { l: -164, r: -76, pl: 14, pr: 14, dx0: 0, dx1: -81, o0: 1, o1: 0, e0: 170, e1: 87, inset: 1.2 },   // (Circuit going, Lobule to Sinusoid)
    // (Anatomy to Lobule: three buttons, half width 127, to four; Lobule moves 40 px left and Sinusoid comes out with it.)
    { l: 78, r: 164, pl: 14, pr: 14, dx0: 40, dx1: 0, o0: 0, o1: 1, e0: 127, e1: 170, inset: 1.2 },
  ];
  for (const c of cases) {
    const k = coverFade(c);
    const opAt = (p) => { let i = 1; while (i < k.length - 1 && k[i].offset < p) i++; const a = k[i - 1], b = k[i]; return a.opacity + (b.opacity - a.opacity) * ((p - a.offset) / Math.max(1e-9, b.offset - a.offset)); };
    for (let n = 0; n <= 2000; n++) {
      const p = n / 2000, dx = c.dx0 + (c.dx1 - c.dx0) * p, e = c.e0 + (c.e1 - c.e0) * p - c.inset;
      const inside = c.l + c.pl + dx >= -e - 1e-6 && c.r - c.pr + dx <= e + 1e-6;
      if (!inside) assert.ok(opAt(p) < 1e-4, `drawn at ${opAt(p).toFixed(3)} past the face at ${p}`);
    }
    // At rest it is the word itself: the coming word ends at its full strength, the going one starts at it.
    if (c.o1 > c.o0) assert.equal(k.at(-1).opacity, 1); else assert.equal(k[0].opacity, 1);
    for (let i = 1; i < k.length; i++) assert.ok(k[i].offset > k[i - 1].offset, 'offsets in order');
  }
});
