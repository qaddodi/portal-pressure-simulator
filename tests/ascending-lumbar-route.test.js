// The ascending lumbar collateral (C9) never crosses another vessel, and joins the azygos the way a tributary joins a vein
// (Mohammad, 31 Oct, Budd–Chiari: "the ascending lumbar vein is intersecting with hepatic vein and also doesn't look good at
// azygous junction"). Every lane through the liver crosses the hepatic veins, which span it from the cava to its lateral
// margin, so the vein goes round the liver, between the diaphragm's foot and the epigastric vein, and arches over the dome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { EDGE_PATH, NODE_POS, FEEDERS, HIDDEN_EDGES, ANAT_HIDDEN, ORGANS } from '../src/ui/anatomy.js';
import { diaphragmLine } from '../src/ui/diaphragm.js';
import { liverShrink } from '../src/ui/liver-morph.js';

// Points along a path of M / C / L segments.
function sample(d, n = 60) {
  const t = d.match(/[MCL]|-?[\d.]+/g);
  let i = 0, cmd = null, cur = null;
  const out = [], num = () => +t[i++];
  while (i < t.length) {
    if (/[MCL]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M' || cmd === 'L') { cur = [num(), num()]; out.push(cur); cmd = 'L'; continue; }
    const b = [num(), num()], c = [num(), num()], e = [num(), num()];
    for (let k = 1; k <= n; k++) { const s = k / n, u = 1 - s; out.push([0, 1].map((j) => u * u * u * cur[j] + 3 * u * u * s * b[j] + 3 * u * s * s * c[j] + s * s * s * e[j])); }
    cur = e;
  }
  return out;
}
const ccw = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const cross = (a, b, c, d) => ccw(c, d, a) * ccw(c, d, b) < 0 && ccw(a, b, c) * ccw(a, b, d) < 0;
function crossings(P, Q) {
  const hits = [];
  for (let i = 1; i < P.length; i++) for (let j = 1; j < Q.length; j++) if (cross(P[i - 1], P[i], Q[j - 1], Q[j])) hits.push(P[i].map((v) => Math.round(v)));
  return hits;
}
const near = (P, Q) => { let m = Infinity; for (const p of P) for (const q of Q) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); return m; };
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > pt[1]) !== (poly[j][1] > pt[1]) && pt[0] < ((poly[j][0] - poly[i][0]) * (pt[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };

// Every vessel the anatomy can draw, as the stage draws it: its own course, or node to node; the azygos trunk as a feeder.
const drawn = {};
for (const e of EDGES) {
  if (e.kind === 'wedge' || e.id.startsWith('X_') || HIDDEN_EDGES.has(e.id) || ANAT_HIDDEN.has(e.id)) continue;
  if (EDGE_PATH[e.id]) drawn[e.id] = sample(EDGE_PATH[e.id]);
  else if (NODE_POS[e.from] && NODE_POS[e.to]) drawn[e.id] = [NODE_POS[e.from][0], NODE_POS[e.to][0]];
}
for (const [id, f] of Object.entries(FEEDERS)) (f.paths || []).forEach((d, i) => { drawn[`${id} feeder ${i}`] = sample(d); });
const c9 = sample(EDGE_PATH.C9);
// The two it is drawn onto: the cava at its start and the azygos trunk at its end.
const JOINED = new Set(['C9', 'IVC_IS', 'AZY_SVC feeder 0']);
const others = Object.entries(drawn).filter(([id]) => !JOINED.has(id));

test('C9 crosses no other vessel the anatomy draws, in any state', () => {
  for (const [id, P] of others) assert.deepEqual(crossings(c9, P), [], `C9 crosses ${id}`);
  for (const id of JOINED) if (id !== 'C9') assert.deepEqual(crossings(c9, drawn[id]), [], `C9 crosses ${id} instead of joining it`);
});

test('C9 stays well clear of every hepatic vein, and keeps a vein\'s width from the rest', () => {
  const hepatic = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'POST_R_RHV', 'POST_R_MHV', 'POST_L_LHV', 'TIPS', 'DIPS'];
  for (const id of hepatic) assert.ok(near(c9, drawn[id]) > 40, `${id} is ${near(c9, drawn[id]).toFixed(0)} from C9`);
  for (const [id, P] of others) assert.ok(near(c9, P) > 8, `${id} lies ${near(c9, P).toFixed(1)} from C9`);
  assert.ok(near(c9, drawn.EPI_SVC) > 15, 'the epigastric vein beside its flank lane');
});

test('C9 runs round the liver, outside it at every size congestion makes it, between the diaphragm\'s foot and the epigastric vein', () => {
  const at = (P, k) => P.map(([x, y]) => [560 + (x - 560) * k, 350 + (y - 350) * k]);
  const organ = (id) => sample(ORGANS.find((o) => o.id === id).d, 12);
  for (const g of [0, 1]) for (const c of [0, 1]) {
    const k = liverShrink(c, g), liver = at(organ('liver'), k);
    assert.ok(!c9.some((p) => inside(p, liver)), `a point of C9 is inside the liver (cirrhosis ${c}, congestion ${g})`);
    assert.ok(near(c9, liver) > 20, `C9 is ${near(c9, liver).toFixed(1)} from the liver (cirrhosis ${c}, congestion ${g})`);
    const dome = diaphragmLine([liver, organ('stomach'), organ('spleen')]);
    assert.deepEqual(crossings(c9, dome), [], `C9 crosses the diaphragm (cirrhosis ${c}, congestion ${g})`);
    assert.ok(near(c9, dome.filter((p) => p[0] < 600)) > 12, `C9 is ${near(c9, dome.filter((p) => p[0] < 600)).toFixed(1)} from the diaphragm`);
  }
});

test('C9 leaves the cava below the liver, above where the paraumbilical vein crosses it, and ends on the azygos trunk', () => {
  const [x0, y0] = c9[0], cava = drawn.IVC_IS;
  assert.ok(Math.abs(x0 - cava[0][0]) < 0.5, 'it starts on the cava\'s axis');
  assert.ok(y0 > 520 && y0 < 600, `it starts at y ${y0}, below the liver and above the paraumbilical vein's crossing (y 600)`);
  const end = c9.at(-1), trunk = sample(FEEDERS.AZY_SVC.paths[0], 400);
  assert.ok(near([end], trunk) < 0.5, 'it ends on the azygos trunk');
});

test('C9 meets the azygos at the angle of a tributary, not along it', () => {
  const end = c9.at(-1), back = c9[c9.length - 9];   // its last stretch, about 4 units
  const ang = (Math.atan2(end[0] - back[0], -(end[1] - back[1])) * 180) / Math.PI;   // from the trunk's upward course, positive to its right
  assert.ok(ang > 30 && ang < 55, `C9 meets the trunk at ${ang.toFixed(0)}° to its course`);
  // Out of the last stretch it is still well off the trunk's centreline, so it opens a Y with it and not a long sliver beside it.
  const trunk = drawn['AZY_SVC feeder 0'];
  const along = (s) => { let acc = 0; for (let i = c9.length - 1; i > 0; i--) { acc += Math.hypot(c9[i][0] - c9[i - 1][0], c9[i][1] - c9[i - 1][1]); if (acc >= s) return near([c9[i - 1]], trunk); } return 0; };
  assert.ok(along(20) > 14, `20 units out C9 is ${along(20).toFixed(1)} from the trunk's centreline`);
  assert.ok(along(40) > along(20), 'it keeps opening away from the trunk');
});

test('C9 is one smooth course: no bend sharper than 14° in 12 units, and no wiggle', () => {
  const S = [c9[0]];
  let acc = 0;
  for (let i = 1; i < c9.length; i++) { acc += Math.hypot(c9[i][0] - c9[i - 1][0], c9[i][1] - c9[i - 1][1]); if (acc >= 12) { S.push(c9[i]); acc = 0; } }
  let flips = 0, last = 0;
  for (let i = 2; i < S.length; i++) {
    const a = [S[i - 1][0] - S[i - 2][0], S[i - 1][1] - S[i - 2][1]], b = [S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]];
    const turn = (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI;
    assert.ok(Math.abs(turn) < 14, `C9 bends ${turn.toFixed(1)}° at ${S[i - 1].map(Math.round)}`);
    if (Math.abs(turn) > 1.5) { if (last && Math.sign(turn) !== Math.sign(last)) flips++; last = turn; }
  }
  assert.ok(flips <= 2, `C9 changes the way it turns ${flips} times (the cava end, then the one gentle S before the azygos)`);
});
