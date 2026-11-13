import { stageSource } from './stage-src.js';
// The ascending lumbar collateral (C9) runs up behind the liver, faded there, and joins the azygos the way a tributary joins a vein
// (Mohammad, 31 Oct, Budd–Chiari: "the ascending lumbar vein is intersecting with hepatic vein and also doesn't look good at
// azygous junction"; then, of the lane behind the liver: "I like behind the liver fade"). In the body it climbs the posterior
// abdominal wall beside the spine, behind the liver, into the azygos. So it may pass behind the hepatic veins, but only where the
// liver covers it and the stage fades it, away from every node and joint (a crossing near one reads as a junction), and it
// comes out above the dome to join the trunk smoothly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { EDGE_PATH, NODE_POS, FEEDERS, HIDDEN_EDGES, ANAT_HIDDEN, ORGANS, BACK_EDGES } from '../src/ui/anatomy.js';
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

// The liver as the stage draws it in each state: swollen by congestion, or shrunk by cirrhosis (liver-morph.js).
const at = (P, k) => P.map(([x, y]) => [560 + (x - 560) * k, 350 + (y - 350) * k]);
const organ = (id) => sample(ORGANS.find((o) => o.id === id).d, 12);
const STATES = [0, 1].flatMap((g) => [0, 1].map((c) => ({ c, g, k: liverShrink(c, g) })));
const livers = STATES.map((s) => ({ ...s, liver: at(organ('liver'), s.k) }));
// How far a point lies inside a polygon (negative outside).
const depth = (pt, poly) => (inside(pt, poly) ? 1 : -1) * near([pt], poly);

test('C9 crosses only what the liver covers: every crossing is behind the liver, in every state, and never the cava or the azygos', () => {
  for (const id of JOINED) if (id !== 'C9') assert.deepEqual(crossings(c9, drawn[id]), [], `C9 crosses ${id} instead of joining it`);
  let behind = 0;
  for (const [id, P] of others) {
    for (const pt of crossings(c9, P)) {
      behind++;
      for (const { c, g, liver } of livers) assert.ok(depth(pt, liver) > 12, `C9 crosses ${id} at ${pt}, ${depth(pt, liver).toFixed(0)} inside the liver (cirrhosis ${c}, congestion ${g})`);
    }
  }
  assert.ok(behind >= 3, 'it passes behind the hepatic veins (that is the route)');
});

test('C9 keeps clear of every node and joint, so a crossing behind the liver never reads as a junction', () => {
  // The ends of every other vessel are its nodes and the joints other vessels make with it (the TIPS ends on the right hepatic vein).
  const ends = others.flatMap(([id, P]) => [[id, P[0]], [id, P.at(-1)]]);
  // (15.0 from the new hepatic artery's right end, 4 Nov 2026: the clearance is about 15 px, a hair under at times, so the check allows 14.5.)
  for (const [id, pt] of ends) assert.ok(near(c9, [pt]) >= 14.5, `C9 passes ${near(c9, [pt]).toFixed(1)} from an end of ${id} at ${pt.map(Math.round)}`);
  for (const [id, P] of others) assert.ok(near(c9, P) > 8 || crossings(c9, P).length, `${id} lies ${near(c9, P).toFixed(1)} from C9`);
  assert.ok(near(c9, drawn.EPI_SVC) > 15, 'the epigastric vein');
});

test('C9 leaves the cava below the liver, climbs behind it, and comes out above the dome', () => {
  const [x0, y0] = c9[0], cava = drawn.IVC_IS;
  assert.ok(Math.abs(x0 - cava[0][0]) < 0.5, 'it starts on the cava\'s axis');
  assert.ok(y0 > 520 && y0 < 600, `it starts at y ${y0}, below the liver and above the paraumbilical vein's crossing (y 600)`);
  for (const { c, g, liver } of livers) {
    const dome = diaphragmLine([liver, organ('stomach'), organ('spleen')]);
    const ins = c9.filter((p) => inside(p, liver));
    assert.ok(ins.length > 40, `C9 runs behind the liver (cirrhosis ${c}, congestion ${g})`);
    // The stretch behind the liver is one run, from the liver's lower edge to its top, with nothing of it drawn inside the liver's edge twice.
    const first = c9.findIndex((p) => inside(p, liver)), lastIn = c9.length - 1 - [...c9].reverse().findIndex((p) => inside(p, liver));
    assert.ok(c9.slice(first, lastIn + 1).every((p) => inside(p, liver)), `C9 goes in and out of the liver more than once (cirrhosis ${c}, congestion ${g})`);
    assert.ok(c9[first][1] > 440, `it goes behind the liver at its lower edge, y ${c9[first][1].toFixed(0)}`);
    assert.ok(Math.max(...ins.map((p) => p[1])) - Math.min(...ins.map((p) => p[1])) > 250, 'it is behind the liver for most of its height');
    // It is above the liver, in the open, before it reaches the trunk, and the diaphragm is crossed once, where it comes out.
    assert.ok(c9.at(-1)[1] < Math.min(...ins.map((p) => p[1])) - 50, 'it joins the azygos well above the liver');
    assert.equal(crossings(c9, dome).length, 1, `C9 crosses the diaphragm once, going up into the chest (cirrhosis ${c}, congestion ${g})`);
  }
});

test('C9 is a back-tier vessel, and the stage fades it behind the liver: solid under the liver, a ghost across the hepatic veins, solid above the dome', () => {
  assert.ok(BACK_EDGES.has('C9'), 'the organ covers veil it');
  const src = stageSource();
  const m = src.match(/SIN_FADE\.C9 = \[([^\]]+)\];/);
  assert.ok(m, 'stage.js fades C9 (SIN_FADE.C9)');
  const [x1, y1, x2, y2, off, a0, am, mode] = m[1].split(',').map(Number);
  assert.equal(mode, 3, 'a dip: solid, faintest, solid');
  assert.equal(a0, 1, 'solid at the cava end');
  assert.ok(am >= 0.4 && am <= 0.7, `faintest ${am}: a ghost that can still be followed`);
  assert.ok(x1 === x2 && y1 > y2, 'along y, from below the liver upward');
  const alphaAt = (y) => {   // the dip, as veins-gl draws it
    const v = Math.min(1, Math.max(0, (y1 - y) / (y1 - y2))), ss = (a, b, x) => { const s = Math.min(1, Math.max(0, (x - a) / (b - a))); return s * s * (3 - 2 * s); };
    return v < off ? a0 + (am - a0) * ss(0, off, v) : am + (1 - am) * ss(off, 1, v);
  };
  for (const { c, g, liver } of livers) {
    const ins = c9.filter((p) => inside(p, liver)), lo = Math.max(...ins.map((p) => p[1])), hi = Math.min(...ins.map((p) => p[1]));
    assert.ok(y1 >= lo, `solid from y ${y1}, under the liver's lower edge (y ${lo.toFixed(0)}; cirrhosis ${c}, congestion ${g})`);
    assert.ok(y2 <= hi, `solid again from y ${y2}, above the liver's top (y ${hi.toFixed(0)}; cirrhosis ${c}, congestion ${g})`);
  }
  // Across the hepatic veins it is at its faintest: every crossing is well down the dip.
  for (const [id, P] of others) for (const pt of crossings(c9, P)) assert.ok(alphaAt(pt[1]) < 0.85, `C9 is ${alphaAt(pt[1]).toFixed(2)} where it passes ${id} (y ${pt[1]})`);
  // The faintest point lies between the first and the last crossing.
  const ys = others.flatMap(([, P]) => crossings(c9, P).map((pt) => pt[1])), yMin = y1 + (y2 - y1) * off;
  assert.ok(yMin > Math.min(...ys) && yMin < Math.max(...ys), `its faintest point (y ${yMin.toFixed(0)}) lies among the crossings (y ${Math.min(...ys)}–${Math.max(...ys)})`);
});

test('C9 meets the azygos at the angle of a tributary, not along it', () => {
  const end = c9.at(-1), back = c9[c9.length - 9];   // its last stretch, about 4 units
  const ang = (Math.atan2(end[0] - back[0], -(end[1] - back[1])) * 180) / Math.PI;   // from the trunk's upward course, positive to its right
  assert.ok(ang > 30 && ang < 55, `C9 meets the trunk at ${ang.toFixed(0)}° to its course`);
  // Out of the last stretch it is still well off the trunk's centreline, so it opens a Y with it and not a long sliver beside it.
  const trunk = sample(FEEDERS.AZY_SVC.paths[0], 400);
  const along = (s) => { let acc = 0; for (let i = c9.length - 1; i > 0; i--) { acc += Math.hypot(c9[i][0] - c9[i - 1][0], c9[i][1] - c9[i - 1][1]); if (acc >= s) return near([c9[i - 1]], trunk); } return 0; };
  assert.ok(along(20) > 14, `20 units out C9 is ${along(20).toFixed(1)} from the trunk's centreline`);
  assert.ok(along(40) > along(20), 'it keeps opening away from the trunk');
});

test('C9 is one smooth course: no bend sharper than 10° in 12 units, and it turns the same way throughout', () => {
  const S = [c9[0]];
  let acc = 0;
  for (let i = 1; i < c9.length; i++) { acc += Math.hypot(c9[i][0] - c9[i - 1][0], c9[i][1] - c9[i - 1][1]); if (acc >= 12) { S.push(c9[i]); acc = 0; } }
  let flips = 0, last = 0;
  for (let i = 2; i < S.length; i++) {
    const a = [S[i - 1][0] - S[i - 2][0], S[i - 1][1] - S[i - 2][1]], b = [S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]];
    const turn = (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI;
    assert.ok(Math.abs(turn) < 10, `C9 bends ${turn.toFixed(1)}° at ${S[i - 1].map(Math.round)}`);
    if (Math.abs(turn) > 1.5) { if (last && Math.sign(turn) !== Math.sign(last)) flips++; last = turn; }
  }
  assert.ok(flips <= 2, `C9 changes the way it turns ${flips} times (one long bow from the cava to the azygos, with only the faintest lean)`);
});
