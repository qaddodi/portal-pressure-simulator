// Three scales on one plate (slide field cutouts, cutouts.js): what a slide offers, the plate's layouts, the dive's corner windows, the
// magnifier's cone, who runs blood, and only the adopted built-in slides using the field, each with a valid list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { cutoutKinds, cutoutSubject, bloodShare, offeredCutouts, cutoutsProblems, columnOf, plateRects, lerpShape, shapeRadius, coneTangents } from '../src/ui/cutouts.js';
import { adopted } from './deck-adopted.js';

const slideLens = (s) => s.lens || 'pressure';
const FREE = { l: 12, t: 70, r: 1180, b: 760 };

test('a slide names its windows, in plate order, and the subject that runs blood', () => {
  assert.deepEqual(cutoutKinds({ cutouts: ['sinusoid', 'lobule'] }), ['lobule', 'sinusoid']);
  assert.deepEqual(cutoutKinds({ cutouts: ['lobule', 'wall'] }), ['lobule']);
  assert.deepEqual(cutoutKinds({}), []);
  assert.equal(cutoutSubject({ cutouts: ['lobule'] }), 'anatomy');
  assert.equal(cutoutSubject({ cutouts: ['lobule'], cutoutSubject: 'lobule' }), 'lobule');
  assert.equal(cutoutSubject({ cutouts: ['lobule'], cutoutSubject: 'sinusoid' }), 'anatomy', 'a subject with no window falls back to the anatomy');
});

test('only the subject runs its blood', () => {
  for (const subject of ['anatomy', 'lobule', 'sinusoid'])
    assert.deepEqual(['anatomy', 'lobule', 'sinusoid'].map((k) => bloodShare(k, subject)), ['anatomy', 'lobule', 'sinusoid'].map((k) => (k === subject ? 1 : 0)));
});

test('Mac and iPad landscape only, on an anatomy slide that is not a visual, question or Circuit', () => {
  const s = { cam: 'liver', cutouts: ['lobule', 'sinusoid'] };
  assert.deepEqual(offeredCutouts(s), ['lobule', 'sinusoid']);
  assert.deepEqual(offeredCutouts(s, { landscape: false }), []);
  assert.deepEqual(offeredCutouts({ cutouts: ['lobule'] }), ['lobule'], 'a slide with no cam shows the anatomy');
  for (const extra of [{ visual: 'table' }, { question: 'Why?' }, { view: 'circuit' }, { cam: 'lobule:triad' }, { cam: 'sinusoid' }])
    assert.deepEqual(offeredCutouts({ ...s, ...extra }), [], JSON.stringify(extra));
  // (a catheter, a Doppler probe or calipers draw on the anatomy, which stays on screen beside the windows)
  for (const extra of [{ cath: 'wedge' }, { tool: { kind: 'doppler' } }, { calipers: [] }]) assert.deepEqual(offeredCutouts({ ...s, ...extra }), ['lobule', 'sinusoid'], JSON.stringify(extra));
});

test('the sinusoid is offered only on a pressure-lens slide, and only where the device draws it', () => {
  const s = { cam: 'liver', cutouts: ['lobule', 'sinusoid'] };
  for (const lens of ['drop', 'origin', 'since', 'oxygen', 'heat']) assert.deepEqual(offeredCutouts(s, { lens }), ['lobule'], lens);
  assert.deepEqual(offeredCutouts(s, { sinusoid: false }), ['lobule']);
  assert.ok(cutoutsProblems(s, 'drop').some((p) => /pressure-lens/.test(p)));
  assert.deepEqual(cutoutsProblems(s, 'pressure'), []);
});

test('the deck check names what is wrong with a list', () => {
  assert.deepEqual(cutoutsProblems({}), []);
  assert.deepEqual(cutoutsProblems({ cutouts: [] }).length, 1);
  assert.deepEqual(cutoutsProblems({ cutouts: 'lobule' }).length, 1);
  assert.equal(cutoutsProblems({ cutouts: ['lobule', 'lobule', 'wall'] }).length, 2);
  assert.ok(cutoutsProblems({ cutouts: ['lobule'], cutoutSubject: 'sinusoid' }).some((p) => /no window/.test(p)));
  assert.ok(cutoutsProblems({ cutouts: ['lobule'], cutoutSubject: 'liver' }).length);
  assert.deepEqual(cutoutsProblems({ cutouts: ['lobule'], cutoutSubject: 'anatomy' }), []);
  assert.ok(cutoutsProblems({ cutoutSubject: 'lobule' }).length, 'a subject needs windows');
  assert.ok(cutoutsProblems({ cutouts: ['lobule'], cam: 'lobule:central' }).length);
  assert.ok(cutoutsProblems({ cutouts: ['lobule'], question: 'x' }).length);
});

test('the plate: the anatomy left, round windows in a column right, the sinusoid hung off the lobule, all inside the free room', () => {
  const r = plateRects(FREE, ['lobule', 'sinusoid']);
  const col = columnOf(FREE, ['lobule', 'sinusoid']);
  assert.equal(r.lobule.w, r.lobule.h); assert.equal(r.lobule.r, r.lobule.w / 2);
  assert.equal(r.sinusoid.w, r.sinusoid.h);
  assert.ok(r.sinusoid.w < r.lobule.w, 'the sinusoid is the smaller window');
  assert.ok(Math.abs(r.sinusoid.w / r.lobule.w - 0.663) < 0.02);
  assert.equal(r.lobule.x + r.lobule.w, r.sinusoid.x + r.sinusoid.w, 'both hang from the column\'s right edge');
  assert.ok(r.sinusoid.y >= r.lobule.y + r.lobule.h, 'the sinusoid is below the lobule');
  assert.ok(r.anatomy.x + r.anatomy.w <= r.lobule.x, 'the figure fits the room the windows leave');
  assert.equal(r.anatomy.x, FREE.l); assert.equal(r.anatomy.h, FREE.b - FREE.t);
  for (const k of ['lobule', 'sinusoid']) {
    assert.ok(r[k].x >= FREE.l && r[k].x + r[k].w <= FREE.r && r[k].y >= FREE.t && r[k].y + r[k].h <= FREE.b, k);
  }
  assert.ok(col.colW >= 140 && col.colW <= 560);
  // (a lone window takes the lobule's place, at its size)
  const one = plateRects(FREE, ['sinusoid']);
  assert.deepEqual(Object.keys(one), ['anatomy', 'sinusoid']);
  assert.ok(one.sinusoid.w > r.sinusoid.w);
  // (a short screen still keeps both windows inside it)
  const low = plateRects({ l: 0, t: 60, r: 1000, b: 560 }, ['lobule', 'sinusoid']);
  assert.ok(low.sinusoid.y + low.sinusoid.h <= 560);
});

test('a dive: the window grows to fill the room, the scales it left become small round windows in the corner', () => {
  const kinds = ['lobule', 'sinusoid'];
  const lob = plateRects(FREE, kinds, 'lobule'), plate = plateRects(FREE, kinds, 'plate');
  assert.equal(lob.lobule.w, FREE.r - FREE.l - 16);
  assert.equal(lob.anatomy.w, lob.anatomy.h); assert.equal(lob.anatomy.r, lob.anatomy.w / 2);
  assert.deepEqual(lob.sinusoid, plate.sinusoid, 'the other window stays where the plate had it');
  assert.ok(lob.anatomy.x < 40 && lob.anatomy.y + lob.anatomy.h <= FREE.b, 'the way back sits in the bottom left corner');
  const sin = plateRects(FREE, kinds, 'sinusoid');
  assert.equal(sin.anatomy.w, sin.lobule.w);
  assert.ok(sin.lobule.y + sin.lobule.h <= sin.anatomy.y, 'the lobule\'s corner window stands above the anatomy\'s');
  assert.deepEqual(plateRects(FREE, ['lobule'], 'sinusoid'), plateRects(FREE, ['lobule'], 'plate'), 'a view with no window is the plate');
});

test('a shape eases to another, and never rounder than half its short side', () => {
  const a = { x: 0, y: 0, w: 100, h: 100, r: 50 }, b = { x: 100, y: 40, w: 300, h: 200, r: 16 };
  assert.deepEqual(lerpShape(a, b, 0), a);
  assert.deepEqual(lerpShape(a, b, 1), b);
  assert.deepEqual(lerpShape(a, b, 0.5), { x: 50, y: 20, w: 200, h: 150, r: 33 });
  assert.equal(shapeRadius({ x: 0, y: 0, w: 100, h: 60, r: 50 }), 30);
});

test('the cone: two tangents from the ring to the window, none from inside it', () => {
  const c = [300, 0], R = 50, p = [0, 0];
  const t = coneTangents(p, c, R);
  for (const q of [t.a, t.b]) {
    assert.ok(Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - R) < 1e-9, 'each tangent point lies on the window\'s rim');
    assert.ok(Math.abs((q[0] - p[0]) * (q[0] - c[0]) + (q[1] - p[1]) * (q[1] - c[1])) < 1e-6, 'the line is square to the radius');
  }
  assert.ok(t.a[1] * t.b[1] < 0, 'one tangent each side of the line to the centre');
  assert.equal(coneTangents([290, 0], c, R), null);
});

test('built-in slides use cutouts only where adopted, each with a valid list and something to show', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (s.cutouts === undefined) continue;
    n++;
    const at = `${d.id}/${s.id}`;
    assert.ok(adopted(d, s, 'cutouts'), `${at} uses cutouts without being listed in tests/deck-adopted.js`);
    assert.deepEqual(cutoutsProblems(s, slideLens(s)), [], at);
    assert.ok(offeredCutouts(s, { lens: slideLens(s) }).length > 0, `${at} offers no window`);
  }
  assert.ok(n > 0);
});
