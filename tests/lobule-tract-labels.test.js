// The portal tract's four labels on the Lobule (Mohammad, 16 Nov 2026, iPhone: "the labels in the lobule are crossing each other, the
// placements seem wrong"): the Arteriole's leader crossed the Portal venule's, the Portal venule's ran over the arteriole's dot, and the
// Arteriole and Ductule labels stood on the far side of the tract. Each tract label now has a spoke out from the venule through what it names
// (lobule-tract-labels.js), and the layout's cost (lobule-zoom-records.js solve) makes a leader over another dot, or a label off its side, a clash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASH, TRIAD_A, TRIAD_D, fanCost, fanSpot, mkFan, tractFan } from '../src/ui/lobule-tract-labels.js';

// The lobule's six corners and their triads, as lobule-zoom.js build lays them out (the venule at the corner; the arteriole, the lymphatic and
// the ductule on an arc TRIAD_D out, the arteriole TRIAD_A one way of the outward ray, the ductule the other).
function triads(R, cx, cy) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI / 6 + (i * Math.PI) / 3, x = cx + Math.cos(a0) * R, y = cy + Math.sin(a0) * R, a = Math.atan2(y - cy, x - cx), d = R * TRIAD_D;
    const at = (t) => [x + Math.cos(t) * d, y + Math.sin(t) * d];
    out.push({ x, y, ha: at(a + TRIAD_A), bd: at(a - TRIAD_A), lv: { pts: [at(a)] } });
  }
  return out;
}
// Typical label sizes on screen (Portal venule with its reading; Lymph with two readings; one-word names).
const SIZE = { triad: [104, 44], lymph: [112, 58], ha: [70, 20], bd: [64, 20] };
const HX = 9, HY = 10;
const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const cut = (p, q, r, t) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
const box = (k, x, y) => ({ l: x - SIZE[k][0] / 2 - HX, r: x + SIZE[k][0] / 2 + HX, t: y - SIZE[k][1] / 2 - HY, b: y + SIZE[k][1] / 2 + HY });
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

// A phone (390 wide, the lobule filling it, as in his screenshot) and a Mac window; the view's zoom k scales world to screen.
const VIEWS = [
  { name: 'phone', W: 390, H: 700, R: 120, k: 2.2 },
  { name: 'phone, zoomed in', W: 390, H: 700, R: 120, k: 3.4 },
  { name: 'desktop', W: 1280, H: 760, R: 300, k: 1 },
  { name: 'desktop, zoomed in', W: 1280, H: 760, R: 300, k: 1.8 },
];

for (const v of VIEWS) {
  test(`${v.name}: at every corner, the four tract labels' spots are on their own side, their leaders cross nothing, and the boxes are clear of each other and of the tract`, () => {
    const cx = 500, cy = 500, V = { k: v.k, x: v.W / 2 - cx * v.k, y: v.H / 2 - cy * v.k }, fr = { l: -1e4, r: 1e4, t: -1e4, b: 1e4 };
    const keepR = Math.max(14, v.R * 0.1 * 1.3 * v.k);   // (lobule-zoom-labels.js keepDiscs: the tract's kept disc, rt = 0.1 R, TRACT_KEEP 1.3)
    for (const [ti, tri] of triads(v.R, cx, cy).entries()) {
      const S = (p) => [p[0] * v.k + V.x, p[1] * v.k + V.y];
      const anchors = { triad: S([tri.x, tri.y]), ha: S(tri.ha), bd: S(tri.bd), lymph: S(tri.lv.pts[0]) };
      const items = Object.keys(anchors).map((k) => ({ k, a: anchors[k], edge: null, w: SIZE[k][0], hh: SIZE[k][1] }));
      const fan = tractFan(mkFan(), tri, S([cx, cy]), V, v.R, keepR, items, true, fr, HX, HY);
      assert.ok(fan.on, `corner ${ti}: no spokes`);
      const spot = {}, o = { px: 0, py: 0 };
      for (const k of Object.keys(anchors)) {
        assert.ok(fanSpot(fan, k, o), `corner ${ti}: ${k} has no spoke`);
        spot[k] = [o.px, o.py];
        assert.equal(fanCost(fan, k, anchors[k], spot[k]), 0, `corner ${ti}: ${k}'s leader runs over another dot, or its label is off its side`);
        const b = box(k, o.px, o.py);
        // (clear of the tract's kept disc: no label covers the triad)
        const nx = Math.max(b.l, Math.min(fan.px, b.r)), ny = Math.max(b.t, Math.min(fan.py, b.b));
        assert.ok(Math.hypot(nx - fan.px, ny - fan.py) >= keepR - 1e-6, `corner ${ti}: ${k}'s box is on the tract`);
      }
      const ks = Object.keys(spot);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        assert.ok(!cut(anchors[ks[i]], spot[ks[i]], anchors[ks[j]], spot[ks[j]]), `corner ${ti}: the ${ks[i]} and ${ks[j]} leaders cross`);
      }
      // round the tract the names run in the order of what they name: arteriole, venule, lymphatic, ductule (the venule's between the arteriole's and the
      // lymphatic's: Mohammad, 16 Nov 2026), so no leader crosses another
      const ang = (k) => Math.atan2(spot[k][1] - fan.py, spot[k][0] - fan.px), rel = (k) => { let d = ang(k) - ang('lymph'); while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; return d; };
      const sHa = Math.sign(rel('ha'));
      assert.ok(sHa !== 0 && Math.sign(rel('triad')) === sHa && Math.abs(rel('triad')) < Math.abs(rel('ha')), `corner ${ti}: the venule's name is not between the arteriole's and the lymphatic's`);
      assert.ok(Math.sign(rel('bd')) === -sHa, `corner ${ti}: the ductule's name is not on the far side of the lymphatic's`);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        assert.equal(overlap(box(ks[i], ...spot[ks[i]]), box(ks[j], ...spot[ks[j]])), 0, `corner ${ti}: the ${ks[i]} and ${ks[j]} labels overlap`);
      }
    }
  });
}

test('his iPhone layout is a clash: the Portal venule leader over the arteriole, the Arteriole label beyond the ductule', () => {
  // (Screen points read off his screenshot, Healthy, Dark, b2f97441: the lower right corner of the lobule.)
  const v = { k: 1 }, V = { k: 1, x: 0, y: 0 }, cvS = [90, 435], pv = [510, 1170];
  const R = Math.hypot(pv[0] - cvS[0], pv[1] - cvS[1]), a = Math.atan2(pv[1] - cvS[1], pv[0] - cvS[0]), d = R * TRIAD_D;
  const at = (t) => [pv[0] + Math.cos(t) * d, pv[1] + Math.sin(t) * d];
  const tri = { x: pv[0], y: pv[1], ha: at(a + TRIAD_A), bd: at(a - TRIAD_A), lv: { pts: [at(a)] } };
  const items = ['triad', 'ha', 'bd', 'lymph'].map((k) => ({ k, a: k === 'triad' ? pv : k === 'lymph' ? tri.lv.pts[0] : tri[k], w: SIZE[k][0] * 2.4, hh: SIZE[k][1] * 2.4 }));
  const fan = tractFan(mkFan(), tri, cvS, V, R, R * 0.13 * v.k, items, true, { l: 0, r: 921, t: 130, b: 1600 }, HX, HY);
  assert.ok(fanCost(fan, 'triad', pv, [400, 1350]) >= CLASH, 'the Portal venule leader over the arteriole\'s dot is not a clash');
  assert.ok(fanCost(fan, 'ha', tri.ha, [718, 1141]) >= CLASH, 'the Arteriole label beyond the ductule is not a clash');
  assert.ok(fanCost(fan, 'bd', tri.bd, [590, 1007]) >= CLASH, 'the Ductule label up inside the lobule is not a clash');
  assert.equal(fanCost(fan, 'lymph', tri.lv.pts[0], [680, 1340]), 0, 'the Lymph label below its lymphatic was fine');
  // and the spots set now keep every rule there
  const o = { px: 0, py: 0 };
  for (const it of items) { assert.ok(fanSpot(fan, it.k, o)); assert.equal(fanCost(fan, it.k, it.a, [o.px, o.py]), 0, `${it.k}'s spot breaks a rule`); }
});
