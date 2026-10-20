// The vessels drawn inside the liver stay inside it however far cirrhosis or congestion reshapes it (organ picks, 20 Oct: in
// cirrhosis a sinusoid loop poked out of the shrunken right lobe). The vessels stay put; the outline moves (liver-morph.js) and
// shrinks about (560, 350).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH, LIVER_EDGES, HIDDEN_EDGES, ANAT_HIDDEN, STRANDS } from '../src/ui/anatomy.js';
import { LIVER_GEO } from '../src/ui/liver-geo-data.js';
import { outlineNormals, contourNodules, morphOutline, liverShrink, KEEP } from '../src/ui/liver-morph.js';

// A path of M and C commands, sampled evenly in each curve's parameter.
function sample(d, per = 24) {
  const t = d.match(/[MC]|-?\d+(\.\d+)?/g), P = [];
  let cur = null, cmd;
  for (let i = 0; i < t.length;) {
    if (/[MC]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M') { cur = [+t[i], +t[i + 1]]; i += 2; P.push(cur); continue; }
    const a = [+t[i], +t[i + 1]], b = [+t[i + 2], +t[i + 3]], e = [+t[i + 4], +t[i + 5]];
    i += 6;
    for (let k = 1; k <= per; k++) { const s = k / per, u = 1 - s; P.push([0, 1].map((j) => u * u * u * cur[j] + 3 * u * u * s * a[j] + 3 * u * s * s * b[j] + s * s * s * e[j])); }
    cur = e;
  }
  return P;
}
// The sinusoids' strands bow out from their vessel (stage.js braid, with a span): the furthest each reaches, at its widest.
function strands(id, pts) {
  const n0 = pts.length - 1, A = pts[0], B = pts[n0], cl = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
  return (STRANDS[id] || []).flatMap(([off, ph, , ua, ub]) => pts.map((p, i) => {
    const v = (i / n0 - ua) / (ub - ua);
    if (v <= 0 || v >= 1) return p;
    const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
    return [p[0] + nx * o, p[1] + ny * o];
  }));
}
const pts = [];
for (let i = 0; i < LIVER_GEO.pts.length; i += 2) pts.push([LIVER_GEO.pts[i], LIVER_GEO.pts[i + 1]]);
const base = { pts, nm: outlineNormals(pts), nod: contourNodules(LIVER_GEO.L, pts.length) };
function outline(c, g) {
  const k = liverShrink(c, g);
  return morphOutline(base, c, g).out.map(([x, y]) => [560 + (x - 560) * k, 350 + (y - 350) * k]);
}
// Signed distance to the outline: positive inside.
function depth(R, x, y) {
  let w = false, m = Infinity;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const [xi, yi] = R[i], [xj, yj] = R[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) w = !w;
    const dx = xj - xi, dy = yj - yi, t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(xi + dx * t - x, yi + dy * t - y));
  }
  return w ? m : -m;
}
// The hepatic veins' trunks to the cava are drawn in the liver too (they leave its top at the cava).
const drawn = [...LIVER_EDGES, 'RHV_IVC', 'MHV_IVC', 'LHV_IVC'].filter((id) => EDGE_PATH[id] && !HIDDEN_EDGES.has(id) && !ANAT_HIDDEN.has(id));
// The portal venules come in at the hilum, and the hepatic veins leave the liver's top for the cava: those ends sit on the edge.
const AT_EDGE = { POST_R_RHV: 0.6, POST_R_MHV: 0.6, POST_L_LHV: 0.6, CAUD: 0.6, RHV_IVC: 0.75, MHV_IVC: 0.75, LHV_IVC: 0.75 };
const STATES = [[0, 0], [0.4, 0], [0.6, 0], [0.85, 0], [0.95, 0], [1, 0], [0, 0.5], [0, 1], [0.6, 0.5], [1, 1]];

test('every vessel drawn in the liver keeps KEEP.vessel inside its edge at every cirrhosis and congestion', () => {
  const low = [];
  for (const [c, g] of STATES) {
    const R = outline(c, g);
    for (const id of drawn) {
      let P = sample(EDGE_PATH[id]);
      if (AT_EDGE[id]) P = P.slice(0, Math.round(P.length * AT_EDGE[id]));
      for (const [x, y] of P) { const d = depth(R, x, y); if (d < KEEP.vessel) low.push(`${id} ${d.toFixed(1)} at (${x.toFixed(0)}, ${y.toFixed(0)}), cirrhosis ${c} congestion ${g}`); }
    }
  }
  assert.deepEqual(low.slice(0, 8), []);
});

test("the sinusoids' strands stay inside the liver at every cirrhosis and congestion", () => {
  const low = [];
  for (const [c, g] of STATES) {
    const R = outline(c, g);
    for (const id of drawn) for (const [x, y] of strands(id, sample(EDGE_PATH[id]))) {
      const d = depth(R, x, y);
      if (d < KEEP.strand) low.push(`${id} strand ${d.toFixed(1)} at (${x.toFixed(0)}, ${y.toFixed(0)}), cirrhosis ${c} congestion ${g}`);
    }
  }
  assert.deepEqual(low.slice(0, 8), []);
});

