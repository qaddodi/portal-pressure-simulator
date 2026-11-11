// The TIPS merges into the two veins it joins: at each end the tube renderer finds no corner to fill (Mohammad, 11 Nov 2026, his pick of "bend the TIPS so it leaves and enters
// each vein under 20 degrees"): every pair of legs at its two joins is under WEB_MIN_DEG apart (the plain union of the two tubes is the join: no wedge of liver between them) or a
// straight run (WEB_MAX_DEG and over), so webInstances makes no web with the TIPS in it. The rows are the figure's real courses (anatomy.js) and radii (as captured from the stage,
// 11 Nov: right portal vein 11.4, its run on 2, the right hepatic vein's two stretches 3.9 and 2.7, the TIPS 4 narrowing to 2.2), with the joins the stage has (a three-leg join at each end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { webInstances } from '../src/ui/tube-data.js';
import { WEB_FLOATS, WEB_MAX_DEG, WEB_MIN_DEG, webGeometry } from '../src/ui/tube-joint.js';
import { polyline, scene } from './tube-web-helpers.js';

function bez(d, per = 60) {
  const t = d.match(/[MC]|-?[\d.]+/g), out = [];
  let i = 0, cur = null;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = [+t[i++], +t[i++]]; out.push(cur); } else {
      const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]], p3 = [+t[i++], +t[i++]];
      for (let k = 1; k <= per; k++) { const s = k / per, u = 1 - s; out.push([0, 1].map((a) => u * u * u * cur[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); }
      cur = p3;
    }
  }
  return out;
}
const TIER_NET = 16, TIER_FRONT = 17, F_SHUNT = 1024;
const figure = () => scene([
  { ...polyline(bez(EDGE_PATH.PVH_R), 11.4), tier: TIER_FRONT },
  { ...polyline(bez(EDGE_PATH.PRE_R), 2), tier: TIER_NET },
  { ...polyline(bez(EDGE_PATH.POST_R_RHV), 3.9), tier: TIER_NET },
  { ...polyline(bez(EDGE_PATH.RHV_IVC), 2.7), tier: TIER_NET },
  { ...polyline(bez(EDGE_PATH.TIPS), (i) => 4 - (1.8 * i) / 63), tier: TIER_FRONT, flags: F_SHUNT },
], [
  { x: 505, y: 398, reach: 22, k: 3.6, fillet: 1, members: [0, 1, 4], trunk: 0 },
  { x: 502.8, y: 246.5, reach: 27, k: 3.6, fillet: 1, members: [2, 3, 4], trunk: 2 },
]);
const TIPS = 4;
const websOf = (sc) => {
  const w = webInstances(sc.ent, sc.tube, sc.pts, {}), list = [];
  for (let p = 0; p < w.count; p++) list.push(Array.from(w.data.subarray(p * WEB_FLOATS, (p + 1) * WEB_FLOATS)));
  return { w, list };
};

test('at both of its joins the TIPS makes no corner with a vein: every pair of legs is under 20 degrees apart or a straight run', () => {
  const sc = figure(), { w, list } = websOf(sc);
  assert.ok(w.joins >= 2, `the two joins are read (${w.joins})`);
  const mine = list.filter((i) => i[0] === TIPS || i[4] === TIPS);
  assert.equal(mine.length, 0, `${mine.length} corner webs have the TIPS in them (legs ${mine.map((i) => `${i[0]}/${i[4]}`).join(', ')}): a wedge of liver between the shunt and the vein`);
  // the corner between the hepatic vein's two stretches is its own (a bend), unchanged
  assert.ok(list.some((i) => (i[0] === 2 && i[4] === 3) || (i[0] === 3 && i[4] === 2)), 'the right hepatic vein\'s own bend still has its web');
});

test('the same joins with the old, steep TIPS (39 degrees off the portal run, 44 off the hepatic vein) do make corners: the test would have seen the wedge', () => {
  const steep = scene([
    { ...polyline(bez(EDGE_PATH.PVH_R), 11.4), tier: TIER_FRONT }, { ...polyline(bez(EDGE_PATH.PRE_R), 2), tier: TIER_NET },
    { ...polyline(bez(EDGE_PATH.POST_R_RHV), 3.9), tier: TIER_NET }, { ...polyline(bez(EDGE_PATH.RHV_IVC), 2.7), tier: TIER_NET },
    { ...polyline(bez('M505 398 C 478 350 487 286 508 245'), (i) => 4 - (1.8 * i) / 63), tier: TIER_FRONT, flags: F_SHUNT },
  ], [
    { x: 505, y: 398, reach: 22, k: 3.6, fillet: 1, members: [0, 1, 4], trunk: 0 },
    { x: 502.8, y: 246.5, reach: 27, k: 3.6, fillet: 1, members: [2, 3, 4], trunk: 2 },
  ]);
  const { list } = websOf(steep);
  assert.ok(list.filter((i) => i[0] === TIPS || i[4] === TIPS).length >= 2, 'the steep TIPS has corner webs');
});

test('the renderer\'s own decision at those corners, by the join geometry: no corner has an angle in the fillet range', () => {
  const sc = figure(), { list } = websOf(sc);
  for (const inst of list) {
    if (inst[0] !== TIPS && inst[4] !== TIPS) continue;
    const g = webGeometry(sc.P[inst[0]], sc.R[inst[0]], sc.P[inst[4]], sc.R[inst[4]], inst, 0.6), deg = (g.theta * 180) / Math.PI;
    assert.ok(deg < WEB_MIN_DEG || deg >= WEB_MAX_DEG || g.empty, `a corner of ${deg.toFixed(0)} degrees`);
  }
});
