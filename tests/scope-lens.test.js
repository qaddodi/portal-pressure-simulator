// The scope view on the figure (mock C1, Mohammad 6 Nov 2026: "C1 is perfect; let's do it and add it to the decks ... everywhere where we
// have scopes; also some slides have scope in their actual data card; perhaps use this instead"): which slides get the ring, that the ring
// stays off the bleed, that its shapes are ones the figure's GPU marks reader takes, and where its lens opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { SITES } from '../src/ui/anatomy.js';
import { RING, BADGE_R, BLEED_BOX, badgeAt, scopeLensFor, ringShapes, ringHit, placeLens, coneLines } from '../src/ui/scope-lens-rule.js';

const slide = (deck, id) => DECKS.find((d) => d.id === deck).slides.find((s) => s.id === id);

test('the varix slides get the ring; a slide whose card already shows the scope, or that is not on the varices, does not', () => {
  assert.equal(scopeLensFor(slide('variceal-bleed', 'blood')), true, 'Variceal bleed 6 (his screenshot): cam bleed');
  assert.equal(scopeLensFor(slide('variceal-bleed', 'before')), true);
  assert.equal(scopeLensFor(slide('variceal-bleed', 'band')), true);
  assert.equal(scopeLensFor(slide('variceal-bleed', 'bridge')), true, 'the balloon slide\'s box holds the lower esophagus');
  assert.equal(scopeLensFor(slide('variceal-bleed', 'tips')), false, 'on the liver');
  for (const s of DECKS.find((d) => d.id === 'endoscopy').slides) if (s.tool?.kind === 'scope') assert.equal(scopeLensFor(s), false, `endoscopy/${s.id}: the card is the scope`);
  assert.equal(scopeLensFor({ cam: 'liver', scopeLens: true }), true, 'an author may put it on');
  assert.equal(scopeLensFor({ cam: 'varices', scopeLens: false }), false, 'or take it off');
  assert.equal(scopeLensFor({ cam: 'varices', visual: 'x' }), false);
});

test('outside the Endoscopy talk no data card shows the scope: the ring does, and the card shows something else', () => {
  const bad = [];
  for (const d of DECKS) for (const s of d.slides) if (d.id !== 'endoscopy' && (s.tool?.kind === 'scope' || s.scopeTile)) bad.push(`${d.id}/${s.id}`);
  assert.deepEqual(bad, []);
  for (const [d, id] of [['variceal-bleed', 'band'], ['ten-years', 'bleed'], ['ten-years', 'bands'], ['next-bleed', 'after'], ['next-bleed', 'slough'], ['pregnancy', 'scope'], ['varices', 'lapse']]) {
    assert.ok(slide(d, id), `${d}/${id} exists`);
    assert.equal(scopeLensFor(slide(d, id)), true, `${d}/${id}: the ring shows the scope`);
  }
});

test('the ring sits on the varices above the tear, clear of the bleed (owner: "the circle is actually covering the bleed")', () => {
  const tear = [SITES.varix[0] + 8, SITES.varix[1] + 12];   // (blood.js bleedShapesInto: where the stream leaves)
  assert.ok(RING.y + RING.r < tear[1] - 15, 'its lowest point stands well above the tear');
  assert.ok(RING.y + RING.r < BLEED_BOX.t, 'and above the bleed\'s patch');
  assert.ok(RING.x > 776 && RING.x < 813, 'centred on the esophagus');
  const b = badgeAt();
  assert.ok(b.y + BADGE_R < tear[1] - 20 && b.x > RING.x, 'the badge on its upper-right edge');
});

test('the ring\'s shapes are ones the figure\'s GPU marks reader takes: M/L/Z paths and circles, no dash pattern', () => {
  for (const open of [false, true]) {
    const sh = ringShapes(open);
    for (const [tag, a] of sh) {
      assert.ok(tag === 'path' || tag === 'circle', tag);
      assert.equal(a['stroke-dasharray'], undefined);
      if (tag === 'path') assert.match(a.d, /^[MLZ\d\s.-]+$/, 'M, L and Z only');
    }
    const ink = sh.find(([t, a]) => t === 'path' && a.stroke === 'var(--text)');
    assert.ok(ink, 'the ring in the theme\'s ink over the labels\' halo');
    const subpaths = ink[1].d.split('M').length - 1;
    assert.equal(subpaths, open ? 1 : 16, open ? 'solid while its lens is up' : 'dashed: sixteen strokes');
  }
});

test('a tap takes the ring with a finger\'s margin, however small it is drawn', () => {
  const ring = { x: 100, y: 100, r: 6, bx: 105, by: 95, br: 2 };
  assert.equal(ringHit(118, 100, ring), true, '22 px at the least');
  assert.equal(ringHit(140, 100, ring), false);
  assert.equal(ringHit(100, 100, null), false);
});

test('the lens opens in free space beside the ring: inside the stage, off the cards and the bleed', () => {
  const bounds = { l: 0, t: 0, r: 1600, b: 1000 };
  const card = { l: 0, t: 0, r: 700, b: 1000 }, bleed = { l: 1130, t: 395, r: 1300, b: 600 };
  const ring = { x: 1118, y: 300, r: 50 };
  const L = placeLens(ring, bounds, [card, bleed], 150);
  assert.equal(L.r, 150);
  assert.ok(L.x - L.r >= 10 && L.x + L.r <= 1590 && L.y - L.r >= 10 && L.y + L.r <= 990, 'on the stage');
  for (const q of [card, bleed]) {
    const cx = Math.max(q.l, Math.min(L.x, q.r)), cy = Math.max(q.t, Math.min(L.y, q.b));
    assert.ok(Math.hypot(L.x - cx, L.y - cy) >= L.r, 'covers neither');
  }
  assert.ok(Math.hypot(L.x - ring.x, L.y - ring.y) >= ring.r + L.r, 'clear of the ring');
  // A strip too small for it: the smallest cover wins, kept on the stage.
  const tight = placeLens({ x: 200, y: 200, r: 20 }, { l: 0, t: 0, r: 390, b: 400 }, [{ l: 0, t: 300, r: 390, b: 400 }], 150);
  assert.ok(tight && tight.r <= 150 && tight.x - tight.r >= 10 && tight.x + tight.r <= 380, 'still on the stage');
});

test('the cone runs along the two outer tangents', () => {
  const a = { x: 0, y: 0, r: 10 }, b = { x: 100, y: 0, r: 40 };
  const ls = coneLines(a, b);
  assert.equal(ls.length, 2);
  for (const [x0, y0, x1, y1] of ls) {
    assert.ok(Math.abs(Math.hypot(x0 - a.x, y0 - a.y) - a.r) < 1e-6 && Math.abs(Math.hypot(x1 - b.x, y1 - b.y) - b.r) < 1e-6);
    const ux = x1 - x0, uy = y1 - y0, l = Math.hypot(ux, uy);
    assert.ok(Math.abs((ux * (x0 - a.x) + uy * (y0 - a.y)) / l) < 1e-6, 'tangent to the ring');
  }
  assert.equal(coneLines(a, { x: 1, y: 0, r: 40 }), null);
});
