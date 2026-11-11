// The TIPS stent's anatomic course (Mohammad, 11 Nov 2026: "straight doesn't make any sense for ANY shunt", "the ends are disconnected"). 109116f3e had made it a
// straight run up to the right hepatic vein's start, laid across the vein as a box. It is a curve again: it leaves the right portal vein at a shallow angle to the
// vein's run, bows out into the parenchyma, and comes back to meet the right hepatic vein at a shallow angle, so both ends are branch joins like the figure's others
// (a tube ending at 90 degrees across a vein is a box with a cut end). Pure geometry: the paths as anatomy.js holds them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH } from '../src/ui/anatomy.js';

function sample(d, per = 48) {
  const t = d.match(/[MC]|-?[\d.]+/g), out = [];
  let i = 0, cur = null;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = [+t[i++], +t[i++]]; out.push(cur); } else if (c === 'C') {
      const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]], p3 = [+t[i++], +t[i++]];
      for (let k = 1; k <= per; k++) { const s = k / per, u = 1 - s; out.push([0, 1].map((a) => u * u * u * cur[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); }
      cur = p3;
    }
  }
  return out;
}
const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const deg = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI;
const near = (pts, p) => Math.min(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));

const TIPS = sample(EDGE_PATH.TIPS), RPV = sample(EDGE_PATH.PVH_R)   // (the right portal vein's run into the stent's node, and on from it)
  , RPV_ON = sample(EDGE_PATH.PRE_R), RHV_UP = sample(EDGE_PATH.POST_R_RHV), RHV = sample(EDGE_PATH.RHV_IVC);
const first = TIPS[0], last = TIPS.at(-1);

test('the TIPS is a curve, not a straight run, and so is the DIPS', () => {
  for (const id of ['TIPS', 'DIPS']) {
    const P = sample(EDGE_PATH[id]), a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dev = Math.max(...P.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L));
    assert.ok(dev / L >= 0.1, `${id} bows ${dev.toFixed(1)} off a chord of ${L.toFixed(0)}: ${(dev / L).toFixed(3)}, a straight run under 0.1`);
  }
});

test('the TIPS merges into each vein: under 20 degrees off its run at both ends (the tube renderer makes no corner web under 20, so no wedge), both ends on the veins\' own courses', () => {
  // (The directions over the first eighth of each course, as the join reads a leg's direction over its first samples: the vein's own curve is part of it. tests/tips-merge.test.js asks the renderer itself.)
  const t0 = unit(TIPS[0], TIPS[6]), t1 = unit(TIPS.at(-7), last);
  assert.ok(near([RPV.at(-1)], first) < 1 && near([RPV_ON[0]], first) < 1, 'it starts on the right portal vein, where its two stretches (PVH_R, PRE_R) meet');
  const out = [['the portal vein\'s run into the node', deg(t0, unit(RPV.at(-7), RPV.at(-1)))], ['the portal venules\' run on', deg(t0, unit(RPV_ON[0], RPV_ON[6]))],
    ['the hepatic vein\'s upstream stretch', deg(t1, unit(RHV_UP.at(-7), RHV_UP.at(-1)))]];
  // (The hepatic vein's downstream stretch is not asked here: it leaves the node in a bend of the vein's own, which has its own web (tests/tips-merge.test.js), and the TIPS runs into the upstream stretch at the angle above.)
  // (Against the veins' stretches that run toward the TIPS the angle is the straight chord's; the stretches that curve away over their first eighth read wider here than the renderer sees them: the bound is 30 there. The renderer's own decision is tests/tips-merge.test.js.)
  for (const [what, a] of out) assert.ok(a < (/run on/.test(what) ? 30 : 20), `the TIPS meets ${what} at ${a.toFixed(0)} degrees: a corner the tube renderer fillets, with a wedge of liver between`);
  assert.ok(near(RHV, last) <= 3, `its end is ${near(RHV, last).toFixed(1)} off the right hepatic vein's centre line (inside its wall, under half its width)`);
  assert.ok(Math.hypot(last[0] - 500, last[1] - 246) <= 25, 'and within the reach of the vein\'s node, so the join takes it in');
});

test('the TIPS stays clear of the middle hepatic vein\'s start (its join took the stent in at 15 units, 7 Nov) and crosses the vein upstream of it, not along it', () => {
  const MHV_START = [548, 282];
  assert.ok(near(TIPS, MHV_START) >= 40, `${near(TIPS, MHV_START).toFixed(1)} from the middle hepatic vein's start`);
  assert.ok(near(sample(EDGE_PATH.MHV_IVC), last) >= 30, 'and from the vein after it');
  assert.ok(near(RHV_UP, TIPS[Math.floor(TIPS.length * 0.5)]) >= 15, 'and from the right hepatic vein\'s upstream stretch until it merges into it');
});
