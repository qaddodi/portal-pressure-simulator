// The TIPS is a side branch of two veins, and of nothing else (Mohammad, 11 Nov 2026, 21:19: "the TIPS has to be from the vein to the vein, not to the sinusoid, middle of the RPV to middle of the
// RHV, not end to end"). The joins pass the renderer blends by (vein-joins.js) on the figure's real courses (anatomy.js) with the radii the stage gives them (right portal vein 11.4, its run on 2,
// the right hepatic vein's two stretches 3.9 and 2.7, the middle hepatic vein's two stretches the same, the TIPS 4 narrowing to 2.2, and 6 at its widest, a 12 mm stent): the TIPS has exactly two joins,
// its start on the right portal vein's course and its end on the right hepatic vein's, the vein the trunk of each; none with the middle hepatic vein it crosses, none at a node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { veinJoins, newJoinStore } from '../src/ui/vein-joins.js';

const N = 64;
function course(d) {   // the path's text as N points along it
  const t = d.match(/[MC]|-?[\d.]+/g), dense = [];
  let i = 0, cur = null;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = [+t[i++], +t[i++]]; dense.push(cur); } else {
      const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]], p3 = [+t[i++], +t[i++]];
      for (let k = 1; k <= 200; k++) { const s = k / 200, u = 1 - s; dense.push([0, 1].map((a) => u * u * u * cur[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); }
      cur = p3;
    }
  }
  const cum = [0];
  for (let k = 1; k < dense.length; k++) cum.push(cum[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const out = [];
  for (let n = 0, k = 1; n < N; n++) {
    const s = (cum.at(-1) * n) / (N - 1);
    while (k < dense.length - 1 && cum[k] < s) k++;
    const u = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    out.push([dense[k - 1][0] + (dense[k][0] - dense[k - 1][0]) * u, dense[k - 1][1] + (dense[k][1] - dense[k - 1][1]) * u]);
  }
  return out;
}
const VEINS = [   // [id, from node, to node, radius at each sample]
  ['PVH_R', 'PVH', 'RPV', () => 11.4], ['PRE_R', 'RPV', 'SIN_R', () => 2], ['POST_R_RHV', 'CV_R', 'RHV', () => 3.9], ['RHV_IVC', 'RHV', 'IVCS', () => 2.7],
  ['POST_R_MHV', 'CV_R', 'MHV', () => 3.9], ['MHV_IVC', 'MHV', 'IVCS', () => 2.7],
];
function figure(tipsR0) {
  const items = [];
  const add = (id, from, to, rad) => {
    const glR = Float64Array.from({ length: N }, (_, i) => rad(i));
    items.push({ x: { isArt: false, e: { id, from, to } }, obj: { glR, glMaxR: Math.max(...glR) }, row: items.length, kind: 'v', pts: course(EDGE_PATH[id]) });
  };
  for (const [id, from, to, rad] of VEINS) add(id, from, to, rad);
  add('TIPS', 'RPV', 'RHV', (i) => tipsR0 - ((tipsR0 - 2.2) * i) / (N - 1));
  return items;
}
const ROW = Object.fromEntries([...VEINS.map((v) => v[0]), 'TIPS'].map((id, i) => [id, i]));

for (const r0 of [4, 6]) {
  test(`the TIPS (${r0 * 2} mm at its start) has two joins: its start on the right portal vein, its end on the right hepatic vein, each vein the trunk`, () => {
    const items = figure(r0), J = veinJoins(items, N, newJoinStore());
    const mine = J.filter((j) => j.members.includes(ROW.TIPS));
    assert.equal(mine.length, 2, `joins with the TIPS: ${mine.map((j) => j.members.join('+') + '@' + Math.round(j.x) + ',' + Math.round(j.y)).join(' ')}`);
    const at = (row) => mine.find((j) => j.members.includes(row));
    const p = at(ROW.PVH_R), h = at(ROW.RHV_IVC);
    assert.ok(p && h, 'one join on each of the two veins');
    assert.equal(p.trunk, ROW.PVH_R, 'the portal vein is the trunk at the start');
    assert.equal(h.trunk, ROW.RHV_IVC, 'the hepatic vein is the trunk at the end');
    assert.ok(Math.hypot(p.x - 560.8, p.y - 424.6) < 1 && Math.hypot(h.x - 578.4, h.y - 230.5) < 1, 'the joins lie at the two ends of the tract');
    for (const j of mine) assert.equal(j.members.length, 2, 'a plain side join: the TIPS and its trunk, no third vessel');
  });
}

test('no vein ends on the TIPS, and the TIPS ends on no vein\'s node: none of the middle hepatic vein, the run on or the upstream stretch is in a join with it', () => {
  const items = figure(6), J = veinJoins(items, N, newJoinStore());
  for (const id of ['POST_R_MHV', 'MHV_IVC', 'PRE_R', 'POST_R_RHV']) assert.ok(!J.some((j) => j.members.includes(ROW.TIPS) && j.members.includes(ROW[id])), `${id} is in a join with the TIPS`);
});
