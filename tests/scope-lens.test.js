// The scope view on the figure (mock C1, Mohammad 6 Nov 2026: "C1 is perfect; let's do it and add it to the decks ... everywhere where we
// have scopes; also some slides have scope in their actual data card; perhaps use this instead"): which slides get the ring, that the ring
// stays off the bleed, that its shapes are ones the figure's GPU marks reader takes, and where its lens opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { SITES } from '../src/ui/anatomy.js';
import { RING, BADGE_R, BLEED_BOX, badgeAt, scopeLensFor, scopeGrows, ringShapes, ringHit, placeLens, coneLines, lensFits, lensCentre, ringInto, LENS_GAP } from '../src/ui/scope-lens-rule.js';

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

test('the ring stands from a slide\'s first frame where the varices grow while it plays (a time-lapse, a ramp, days passing)', () => {
  // (Mohammad 6 Nov 2026: "as the slide is playing i can't click on the scope ... we should see the varices growing in the scope".)
  const lapse = slide('varices', 'lapse');
  assert.equal(scopeLensFor(lapse), true);
  assert.equal(scopeGrows(lapse), true, 'Collaterals and varices, the time-lapse');
  assert.equal(scopeGrows(slide('varices', 'eso')), false, 'a still slide keeps the ring for a patient who has varices');
  assert.equal(scopeGrows(slide('varices', 'nograd')), false, 'heart failure: no ring on an esophagus without varices');
  const grow = [];
  for (const d of DECKS) for (const s of d.slides) if (scopeLensFor(s) && (s.lapse || s.ramp || s.days)) grow.push(`${d.id}/${s.id}`);
  assert.ok(grow.length >= 4, 'every playing slide with a ring: ' + grow.join(', '));
  for (const d of DECKS) for (const s of d.slides) if (scopeLensFor(s)) assert.equal(scopeGrows(s), !!(s.lapse || s.ramp || s.days), `${d.id}/${s.id}`);
});

test('a lens moves with its ring: the same direction, the same gap past its edge, whatever the zoom', () => {
  const ring0 = { x: 400, y: 300, r: 30 }, L = placeLens(ring0, { l: 0, t: 0, r: 1600, b: 1000 }, [], 120);
  const d = Math.hypot(L.x - ring0.x, L.y - ring0.y), a = { ux: (L.x - ring0.x) / d, uy: (L.y - ring0.y) / d, R: L.r, gap: d - ring0.r - L.r };
  assert.ok(Math.abs(a.gap - LENS_GAP) < 1, 'the gap it opened with (to the pixel it was rounded to)');
  const o = { x: 0, y: 0 };
  lensCentre(o, ring0, a); assert.ok(Math.abs(o.x - L.x) < 1 && Math.abs(o.y - L.y) < 1, 'at the opening it is where it was put');
  for (const ring of [{ x: 520, y: 260, r: 30 }, { x: 380, y: 310, r: 75 }, { x: 900, y: 120, r: 12 }]) {
    lensCentre(o, ring, a);
    const dist = Math.hypot(o.x - ring.x, o.y - ring.y);
    assert.ok(Math.abs(dist - (ring.r + a.R + a.gap)) < 1e-6, 'its edge stands the gap from the ring\'s edge');
    assert.ok(Math.abs((o.x - ring.x) / dist - a.ux) < 1e-9 && Math.abs((o.y - ring.y) / dist - a.uy) < 1e-9, 'in its own direction');
  }
});

test('a lens that has moved is kept while it fits, and found a new place (its size kept) when a card has come over it', () => {
  const bounds = { l: 0, t: 0, r: 1600, b: 1000 }, ring = { x: 500, y: 300, r: 40 };
  assert.equal(lensFits(700, 200, 100, bounds, []), true);
  assert.equal(lensFits(700, 200, 100, bounds, [{ l: 650, t: 150, r: 900, b: 400 }]), false, 'under a card');
  assert.equal(lensFits(20, 200, 100, bounds, []), false, 'off the stage');
  const L = placeLens(ring, bounds, [{ l: 0, t: 0, r: 800, b: 200 }], 100, true);
  assert.equal(L.r, 100, 'its size is kept');
  assert.equal(lensFits(L.x, L.y, L.r, bounds, [{ l: 0, t: 0, r: 800, b: 200 }]), true);
  const squeezed = placeLens(ring, { l: 0, t: 0, r: 330, b: 330 }, [], 100, true);
  assert.equal(squeezed.r, 100, 'never shrunk while it is open, even where it cannot fit');
});

test('the ring\'s place for a camera step is written into a kept record', () => {
  const o = { x: 0, y: 0, r: 0 }, tmp = [0, 0];
  const toLocal = (out, x, y) => { out[0] = 2 * x + 5; out[1] = 2 * y - 7; return out; };
  assert.equal(ringInto(o, toLocal, { sc: 2 }, tmp), true);
  assert.deepEqual(o, { x: 2 * RING.x + 5, y: 2 * RING.y - 7, r: RING.r * 2 });
  assert.equal(ringInto(o, toLocal, { sc: 0 }, tmp), false, 'no scale, no ring');
});
