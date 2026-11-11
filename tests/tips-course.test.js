// The TIPS stent's anatomic course (Mohammad, 11 Nov 2026: "straight doesn't make any sense for ANY shunt"; at 21:19, after the build that ran it into the end of a vein: "the TIPS has to be
// from the vein to the vein, not to the sinusoid, middle of the RPV to middle of the RHV, not end to end"). It is a gentle curve that starts ON the centre line of the right portal vein
// (PVH_R, the wide run the figure labels) near the middle of its run and ends ON the centre line of the right hepatic vein (RHV_IVC, the wide stretch that carries its name) near the middle
// of its run, so each end is a side branch on a trunk, not a vessel's end or a node. Pure geometry: the paths as anatomy.js holds them.
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
const arc = (P) => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return c; };
/** The nearest point of course P to p (on its segments): [distance, fraction of the course's length there]. */
function onCourse(P, p) {
  const c = arc(P);
  let best = [Infinity, 0];
  for (let i = 1; i < P.length; i++) {
    const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], u = Math.max(0, Math.min(1, ((p[0] - P[i - 1][0]) * dx + (p[1] - P[i - 1][1]) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(P[i - 1][0] + dx * u - p[0], P[i - 1][1] + dy * u - p[1]);
    if (d < best[0]) best = [d, (c[i - 1] + u * (c[i] - c[i - 1])) / c.at(-1)];
  }
  return best;
}
const dist = (P, p) => onCourse(P, p)[0];

const TIPS = sample(EDGE_PATH.TIPS), RPV = sample(EDGE_PATH.PVH_R), RPV_ON = sample(EDGE_PATH.PRE_R), RHV = sample(EDGE_PATH.RHV_IVC), RHV_UP = sample(EDGE_PATH.POST_R_RHV);
const first = TIPS[0], last = TIPS.at(-1);

test('the TIPS is a curve, not a straight run, and so is the DIPS', () => {
  for (const id of ['TIPS', 'DIPS']) {
    const P = sample(EDGE_PATH[id]), a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dev = Math.max(...P.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L));
    assert.ok(dev / L >= 0.1, `${id} bows ${dev.toFixed(1)} off a chord of ${L.toFixed(0)}: ${(dev / L).toFixed(3)}, a straight run under 0.1`);
  }
});

test('the TIPS is a gentle curve: one bend the one way (no S), under a fifth of its length off its chord', () => {
  const L = Math.hypot(last[0] - first[0], last[1] - first[1]);
  let sign = 0, dev = 0;
  for (let i = 2; i < TIPS.length; i++) {
    const c = (TIPS[i - 1][0] - TIPS[i - 2][0]) * (TIPS[i][1] - TIPS[i - 1][1]) - (TIPS[i - 1][1] - TIPS[i - 2][1]) * (TIPS[i][0] - TIPS[i - 1][0]);
    if (Math.abs(c) < 0.01) continue;
    if (sign) assert.equal(Math.sign(c), sign, `the course turns the other way at sample ${i}: an S, not a C`);
    sign = Math.sign(c);
  }
  for (const p of TIPS) dev = Math.max(dev, Math.abs((last[0] - first[0]) * (first[1] - p[1]) - (first[0] - p[0]) * (last[1] - first[1])) / L);
  assert.ok(dev / L < 0.2, `it bows ${(dev / L).toFixed(3)} of its chord: not a gentle curve`);
});

test('the TIPS runs from the middle of the right portal vein to the middle of the right hepatic vein, side to side: both ends on a trunk\'s centre line, away from every end of a vessel', () => {
  const [dp, fp] = onCourse(RPV, first), [dh, fh] = onCourse(RHV, last);
  assert.ok(dp <= 0.5, `the portal end is ${dp.toFixed(2)} off the right portal vein's centre line`);
  assert.ok(dh <= 2, `the hepatic end is ${dh.toFixed(2)} off the right hepatic vein's centre line (a hair inside the near wall, so its rounded end stays inside the far wall)`);
  assert.ok(fp >= 0.35 && fp <= 0.65, `the portal end is ${fp.toFixed(2)} of the way along the right portal vein: not the middle of its run`);
  assert.ok(fh >= 0.5 && fh <= 0.7, `the hepatic end is ${fh.toFixed(2)} of the way along the right hepatic vein: not the middle of its run`);
  // not at an end of any vessel: well clear of the two trunks' ends and of the nodes, the thin tributaries and the thin run-on that end there
  const ends = [RPV[0], RPV.at(-1), RHV[0], RHV.at(-1), RPV_ON.at(-1), RHV_UP[0]];
  for (const e of ends) for (const [what, p] of [['portal', first], ['hepatic', last]]) assert.ok(Math.hypot(p[0] - e[0], p[1] - e[1]) >= 40, `the ${what} end is ${Math.hypot(p[0] - e[0], p[1] - e[1]).toFixed(0)} from a vessel's end at ${e.map((v) => v.toFixed(0))}`);
  // and not on the thin vessels that are not the trunks: the portal venules' run on, the hepatic vein's upstream stretch (the sinusoid side)
  assert.ok(dist(RPV_ON, first) >= 40, 'the portal end is on the portal venules\' run on');
  assert.ok(dist(RHV_UP, last) >= 40, 'the hepatic end is on the hepatic vein\'s upstream stretch, the sinusoid side');
});

test('the TIPS leaves and enters each trunk as a side branch: at a clear angle off its run (a fillet joins it), not along it and not across it', () => {
  const at = (P, p) => { let k = 0; for (let i = 1; i < P.length; i++) if (Math.hypot(P[i][0] - p[0], P[i][1] - p[1]) < Math.hypot(P[k][0] - p[0], P[k][1] - p[1])) k = i; return k; };
  const kp = at(RPV, first), kh = at(RHV, last);
  const a0 = deg(unit(TIPS[0], TIPS[6]), unit(RPV[kp], RPV[kp + 6])), a1 = deg(unit(TIPS.at(-7), last), unit(RHV[kh], RHV[kh + 6]));   // (the trunk's run: its way on, along the flow)
  assert.ok(a0 >= 25 && a0 <= 90, `it leaves the portal vein ${a0.toFixed(0)} degrees off its run`);
  assert.ok(a1 >= 25 && a1 <= 90, `it enters the hepatic vein ${a1.toFixed(0)} degrees off its run`);
});

test('the TIPS keeps clear of the middle hepatic vein\'s node (a pass nearer than the stent\'s reach ties the vein into the stent, 7 Nov) and crosses the vein once, on its stretch to the cava, over it', () => {
  const MHV_NODE = [548, 282];
  assert.ok(dist(TIPS, MHV_NODE) >= 11, `${dist(TIPS, MHV_NODE).toFixed(1)} from the middle hepatic vein's node`);
  const seg = (a, b, c, d) => { const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0; };
  const MHV = [...sample(EDGE_PATH.POST_R_MHV), ...sample(EDGE_PATH.MHV_IVC)];
  let n = 0;
  for (let i = 1; i < TIPS.length; i++) for (let k = 1; k < MHV.length; k++) if (seg(TIPS[i - 1], TIPS[i], MHV[k - 1], MHV[k])) n++;
  assert.equal(n, 1, `it crosses the middle hepatic vein ${n} times`);
});
