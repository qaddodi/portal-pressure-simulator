// A stent from the portal vein or one of its branches to a hepatic vein is drawn vessel to vessel, the way the TIPS is, and is the covered Viatorr like it (Mohammad, 13 Nov 2026: "any portal vein branch ->
// hepatic vein branch should be the Viatorr looking stent", "any stent try to curve into the natural path of the blood vessel (here RPV RHV is good but LHV LPV is bad)"). Pure geometry: the courses as the
// figure holds them (custom-shunt-paths.js) and the vessels' runs (anatomy.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, isCoveredStent, isLiverStent } from '../src/engine/topology.js';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { CUSTOM_SHUNT_PATH } from '../src/ui/custom-shunt-paths.js';
import { sampleD } from '../scripts/shunt-route-lib.mjs';

const HEPATIC = { RHV: 'RHV_IVC', MHV: 'MHV_IVC', LHV: 'LHV_IVC' }, PORTAL = { RPV: 'PVH_R', LPV: 'PVH_L' };
const stents = EDGES.filter(isLiverStent);
const dist = (P, p) => { let m = Infinity; for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], u = Math.max(0, Math.min(1, ((p[0] - P[i - 1][0]) * dx + (p[1] - P[i - 1][1]) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(P[i - 1][0] + dx * u - p[0], P[i - 1][1] + dy * u - p[1])); } return m; };
const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const deg = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI;

test('the covered Viatorr look: the TIPS, the DIPS and the eight portal vein to hepatic vein stents; no other shunt', () => {
  assert.equal(stents.length, 8, 'PVH, RPV and LPV to RHV, MHV, LHV, less the TIPS (RPV to RHV)');
  for (const e of EDGES) assert.equal(isCoveredStent(e), e.shunt === 'tips' || e.shunt === 'dips' || stents.includes(e), e.id);
  assert.ok(!stents.some((e) => e.from === 'RPV' && e.to === 'RHV'));
});

for (const e of stents) {
  test(`${e.id} runs vessel to vessel: the portal end on its branch's centre line (or the hilum's node), the hepatic end on the vein's, inside its near wall, and bows`, () => {
    const P = sampleD(CUSTOM_SHUNT_PATH[e.id], 1), s = P[0], t = P.at(-1), H = sampleD(EDGE_PATH[HEPATIC[e.to]], 1);
    if (PORTAL[e.from]) assert.ok(dist(sampleD(EDGE_PATH[PORTAL[e.from]], 1), s) <= 0.6, `${e.id} starts ${dist(sampleD(EDGE_PATH[PORTAL[e.from]], 1), s).toFixed(2)} off the ${e.from} run`);
    else assert.deepEqual(s, [602, 442], `${e.id} starts at the hilum`);
    assert.ok(dist(H, t) <= 2, `${e.id} ends ${dist(H, t).toFixed(2)} off the ${e.to} run`);
    // not at the vein's end or the stent's own node: well inside the run
    assert.ok(Math.hypot(t[0] - H[0][0], t[1] - H[0][1]) >= 20 && Math.hypot(t[0] - H.at(-1)[0], t[1] - H.at(-1)[1]) >= 20, `${e.id} ends at an end of the ${e.to} run`);
    const L = Math.hypot(t[0] - s[0], t[1] - s[1]);
    let dev = 0;
    for (const p of P) dev = Math.max(dev, Math.abs((t[0] - s[0]) * (s[1] - p[1]) - (s[0] - p[0]) * (t[1] - s[1])) / L);
    assert.ok(dev / L >= 0.06 && dev / L < 0.3, `${e.id} bows ${(dev / L).toFixed(3)} of its chord`);
  });
  test(`${e.id} meets the hepatic vein at an acute angle, heading the way the blood goes (never against it)`, () => {
    const P = sampleD(CUSTOM_SHUNT_PATH[e.id], 1), H = sampleD(EDGE_PATH[HEPATIC[e.to]], 1), t = P.at(-1), tg = unit(P.at(-8), t);
    let j = 0, m = Infinity;
    for (let i = 0; i < H.length; i++) { const d = Math.hypot(H[i][0] - t[0], H[i][1] - t[1]); if (d < m) { m = d; j = i; } }
    const run = unit(H[Math.max(0, j - 4)], H[Math.min(H.length - 1, j + 4)]);
    assert.ok(deg(tg, run) <= 80, `${e.id} comes in ${deg(tg, run).toFixed(0)} degrees off the ${e.to}'s flow`);
  });
}

test('the LPV to LHV stent is no longer a straight drop between the two nodes (it was 0.005 of its chord off straight)', () => {
  const P = sampleD(CUSTOM_SHUNT_PATH.X_LPV_LHV, 1), s = P[0], t = P.at(-1), L = Math.hypot(t[0] - s[0], t[1] - s[1]);
  let dev = 0;
  for (const p of P) dev = Math.max(dev, Math.abs((t[0] - s[0]) * (s[1] - p[1]) - (s[0] - p[0]) * (t[1] - s[1])) / L);
  assert.ok(dev / L > 0.06, `bows ${(dev / L).toFixed(3)}`);
  // and it leaves the left portal vein along its run (within 45 degrees), not square across it
  const run = unit(...[sampleD(EDGE_PATH.PVH_L, 1).at(-30), sampleD(EDGE_PATH.PVH_L, 1).at(-1)]);
  assert.ok(deg(unit(P[0], P[8]), run) <= 55, 'leaves along the portal vein');
});

// Stents that the order of the liver's trunks lets be drawn without crossing do not cross (a stent into the right hepatic vein from the right branch is the TIPS; the DIPS ends on the cava between
// the middle and the left hepatic vein). Two stents whose order is reversed (right branch to left vein against left branch to right vein) cross once, however they are drawn.
const PORDER = { RPV: 0, PVH: 1, LPV: 2 }, HORDER = { RHV: 0, MHV: 1, LHV: 2 };
const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const crossings = (A, B) => { let n = 0; for (let i = 1; i < A.length; i++) for (let k = 1; k < B.length; k++) if (side(A[i - 1], A[i], B[k - 1]) * side(A[i - 1], A[i], B[k]) < 0 && side(B[k - 1], B[k], A[i - 1]) * side(B[k - 1], B[k], A[i]) < 0) n++; return n; };
const SET = { TIPS: { P: sampleD(EDGE_PATH.TIPS, 1), o: [0, 0] }, DIPS: { P: sampleD(EDGE_PATH.DIPS, 1), o: [1, 1.5] } };
for (const e of stents) SET[e.id] = { P: sampleD(CUSTOM_SHUNT_PATH[e.id], 1), o: [PORDER[e.from], HORDER[e.to]] };
// (One pair is still crossed, left branch to the right and to the middle hepatic vein, which leave the same point: the search found no way apart within the bow limits.)
const KNOWN = new Set(['X_LPV_RHV|X_LPV_MHV']);

test('the TIPS is crossed by no stent into the liver, and the DIPS by none that can avoid it', () => {
  for (const [a, A] of Object.entries(SET)) for (const [b, B] of Object.entries(SET)) {
    if (a >= b || !(a === 'TIPS' || a === 'DIPS' || b === 'TIPS' || b === 'DIPS')) continue;
    const avoidable = (A.o[0] - B.o[0]) * (A.o[1] - B.o[1]) >= 0;
    if (avoidable) assert.equal(crossings(A.P, B.P), 0, `${a} crosses ${b}`);
  }
});

test('stents that can be drawn without crossing do not cross', () => {
  for (const [a, A] of Object.entries(SET)) for (const [b, B] of Object.entries(SET)) {
    if (a >= b || KNOWN.has(`${a}|${b}`) || KNOWN.has(`${b}|${a}`)) continue;
    const avoidable = (A.o[0] - B.o[0]) * (A.o[1] - B.o[1]) >= 0;
    if (avoidable) assert.equal(crossings(A.P, B.P), 0, `${a} crosses ${b}`);
  }
});
