// The Baveno VIII stiffness × platelet zones are one picture (Mohammad, 11 Nov 2026: the guideline card "Baveno VIII at a first visit" and
// the instrument card "Stiffness and platelets" must look alike): one geometry, one tint, one type, one axis writing, baveno-zones.js.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAVENO, BAVENO_AXES, bavenoRects, bavenoHatch, zoneArt } from '../src/ui/baveno-zones.js';
import { ZONES } from '../src/ui/tool-criteria.js';
import { planeOf, zoneOf, plotNumbers, frame, scaler } from '../src/ui/visual-plane.js';

const pl = planeOf('csph'), fv = ZONES['first-visit'];
const sv = (tag, attrs, ...kids) => ({ tag, attrs, kids });

test('the cut-offs are Baveno VIII 1.15, 1.16, 1.19: 15 kPa and platelets 150 out, 25 kPa in, the EGD skipped under 20', () => {
  assert.deepEqual(BAVENO, { out: 15, in: 25, egd: 20, plt: 150 });
  assert.equal(zoneOf(pl, { lsm: 15, plt: 150 }).t, 'No CSPH');
  assert.equal(zoneOf(pl, { lsm: 15.1, plt: 150 }).t, 'Indeterminate');
  assert.equal(zoneOf(pl, { lsm: 14, plt: 149 }).t, 'Indeterminate');
  assert.equal(zoneOf(pl, { lsm: 25, plt: 300 }).t, 'CSPH');
  assert.deepEqual(bavenoHatch([5, 35], [50, 250]), { x: [5, 20], y: [150, 250] });
});

test('both charts draw the same rectangles, to the ends of their own ranges, and none overlaps another', () => {
  for (const [x, y] of [[[5, 35], [50, 250]], [[0, 40], [0, 300]]]) {
    const r = bavenoRects(x, y);
    assert.deepEqual(r.map((z) => z.rate), ['ok', 'mid', 'mid', 'hi']);
    assert.deepEqual(r[0], { rate: 'ok', x: [x[0], 15], y: [150, y[1]] });
    assert.deepEqual(r[3], { rate: 'hi', x: [25, x[1]], y: [y[0], y[1]] });
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j];
      assert.ok(a.x[1] <= b.x[0] || b.x[1] <= a.x[0] || a.y[1] <= b.y[0] || b.y[1] <= a.y[0], `zones ${i} and ${j} do not overlap`);
    }
    assert.equal(r.reduce((s, z) => s + (z.x[1] - z.x[0]) * (z.y[1] - z.y[0]), 0), (x[1] - x[0]) * (y[1] - y[0]), 'they tile the plot');
  }
  assert.deepEqual(fv.zones.map(({ rate, x, y }) => ({ rate, x, y })), bavenoRects(fv.x, fv.y));
  assert.equal(pl.rectsOf, bavenoRects, 'the data card\'s plane reads the same function');
  assert.equal(pl.look, 'guide');
});

test('the axes are written the same: 15 20 25 along the foot, 150K up the left, LSM kPa and PLT', () => {
  assert.deepEqual([fv.xTicks, fv.yTick, fv.xName, fv.yName], [BAVENO_AXES.xTicks, BAVENO_AXES.yTick, BAVENO_AXES.xName, BAVENO_AXES.yName]);
  const fr = frame(560, 387), { X, Y } = scaler(pl, fr), nums = plotNumbers(pl, fr, X, Y, 14);
  assert.deepEqual(nums.filter((n) => n.cls.startsWith('pze-t')).map((n) => n.text).sort(), ['15', '150K', '20', '25']);
  assert.deepEqual(nums.filter((n) => n.cls === 'pze-ax').map((n) => n.text).sort(), ['LSM kPa', 'PLT']);
});

test('the zones are the guideline card\'s own tints and hatch, and nothing is drawn as a dashed border', () => {
  const art = zoneArt(sv, { rects: bavenoRects([0, 40], [0, 300]), hatch: bavenoHatch([0, 40], [0, 300]), box: (r) => ({ x: r.x[0], y: r.y[0], width: 1, height: 1 }) });
  assert.deepEqual(art.g.slice(0, 4).map((e) => e.attrs['data-look']), Array(4).fill('crit.zone'));
  assert.deepEqual(art.g.slice(0, 4).map((e) => e.attrs['data-rate']), ['ok', 'mid', 'mid', 'hi']);
  assert.equal(art.defs[0].kids[0].attrs['data-look'], 'crit.hatch');
  assert.match(art.g[4].attrs.fill, /^url\(#pzbz\d+\)$/);
  assert.equal(zoneArt(sv, { rects: [], box: () => ({}) }).defs.length, 0, 'no hatch, no pattern');
});
