// The liver's outline as cirrhosis and congestion reshape it (pure: no DOM, so the tests can check the vessels stay inside it).
import { seeded } from './liver-geo.js?v=977185f80a';
import { EDGE_PATH, LIVER_EDGES, HIDDEN_EDGES, ANAT_HIDDEN, STRANDS } from './anatomy.js?v=c3c8976b67';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth01 = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

// Cirrhosis as picked in the organ mock-ups (20 Oct): the liver shrinks and reshapes (field: the pull toward the hilum and the
// left lobe's growth; scale: the whole organ's shrink), its edge has longer, deeper bumps (lam, nod), and the nodules are larger
// (liver-geo.js NODULE_SIZE), with their gaps in step (sep). Field and scale are gentle (Mohammad, 20 Oct: "don't shrink it that
// much in cirrhosis, to keep the vessels inside it"): the vessels never move, and the edge keeps KEEP clear of them.
export const CIRR = { field: 0.5, scale: 0.8, nod: 5.5, lam: 1.4, sep: 1.6 };

/** v.toFixed(1), the same text, about five times faster (the nodules' path is written with it on every frame of the ease):
 * built from the rounded tenths, except near a tie, a negative or a large value, where toFixed itself decides. */
export function fix1(v) {
  const t = v * 10, f = t - Math.floor(t);
  if (!(v >= 0 && v < 1e9) || Math.abs(f - 0.5) < 1e-6) return v.toFixed(1);
  const r = Math.round(t);
  return `${(r - r % 10) / 10}.${r % 10}`;
}

/** The liver's scale about (560, 350): a cirrhotic liver shrinks a little; a congested one swells. */
export const liverShrink = (c, g) => 1 - 0.035 * c * CIRR.scale + 0.035 * g;

// The displacement of the whole organ (interior and outline): the right lobe atrophies toward
// the hilum and the lateral left lobe hypertrophies with cirrhosis.
export function liverField(x, y, c) {
  c *= CIRR.field;
  const wr = smooth01((610 - x) / 260), wl = smooth01((x - 700) / 140);
  return [x + (600 - x) * 0.15 * c * wr + (x - 720) * 0.12 * c * wl, y + (360 - y) * 0.11 * c * wr + (y - 280) * 0.14 * c * wl];
}

/** The outward normal at each of the outline's points, for either winding. */
export function outlineNormals(pts) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; area += ax * by - bx * ay; }
  const sg = area > 0 ? 1 : -1;
  return pts.map((_, i) => {
    const [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    return [(sg * dy) / l, (-sg * dx) / l];
  });
}

/** Contour nodules: irregular lengths along the edge (L long, n points), fixed per point: [where in its nodule, depth]. */
export function contourNodules(L, n) {
  const rnd = seeded(7);
  let start = 0, lam = (18 + 10 * rnd()) * CIRR.lam;
  const step = L / n, nod = [];
  for (let i = 0; i < n; i++) {
    const acc = i * step;
    if (acc - start > lam) { start = acc; lam = (15 + 12 * rnd()) * CIRR.lam; }
    nod.push([(acc - start) / lam, 0.7 + 0.6 * rnd()]);
  }
  return nod;
}

// The vessels never move (Mohammad, 20 Oct): the liver is drawn round them, moved to the patient's right and shrunken less in
// cirrhosis, so every vessel drawn inside it keeps this much of the liver round it (world units) at every cirrhosis and
// congestion (tests/liver-vessels.test.js measures it over the whole morph). Each is a fixed number, not a nudge of the edge.
export const KEEP = { vessel: 13, strand: 8 };
// Mohammad's own liver outline (20 Oct) sits closer to the sinusoids on the right than the wedge did, so the edge is held off
// the vessels again wherever cirrhosis or congestion would bring it within KEEP of one.
// Where a vessel reaches the edge by design (the hepatic veins leave the top for the cava; the caudate's veins the cava's wall),
// its last stretch is not held in.
const AT_EDGE = { POST_R_RHV: 0.6, POST_R_MHV: 0.6, POST_L_LHV: 0.6, CAUD: 0.6 };
const sampleCurve = (d, per = 24) => {
  const t = d.match(/[MC]|-?\d+(\.\d+)?/g), P = [];
  let cur = null, cmd;
  for (let i = 0; i < t.length;) {
    if (/[MC]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M') { cur = [+t[i], +t[i + 1]]; i += 2; P.push(cur); continue; }
    const a = [+t[i], +t[i + 1]], b = [+t[i + 2], +t[i + 3]], e = [+t[i + 4], +t[i + 5]];
    i += 6;
    for (let k = 1; k <= per; k++) { const u = k / per, v = 1 - u; P.push([0, 1].map((j) => v * v * v * cur[j] + 3 * v * v * u * a[j] + 3 * v * u * u * b[j] + u * u * u * e[j])); }
    cur = e;
  }
  return P;
};
// The sinusoids' strands as the stage braids them (stage.js braid, with a span): one normal across the vessel's chord.
const strandPts = (id, pts) => {
  const n0 = pts.length - 1, A = pts[0], B = pts[n0], cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
  return (STRANDS[id] || []).flatMap(([off, ph, , ua, ub]) => ua == null ? [] : pts.map((p, i) => {
    const v = (i / n0 - ua) / (ub - ua);
    if (v <= 0 || v >= 1) return p;
    const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
    return [p[0] + nx * o, p[1] + ny * o];
  }));
};
let keepOut = null;
/** The points the liver's edge keeps clear of: [x, y, clearance], every drawn vessel in the liver and the sinusoids' strands. */
export function liverKeepOut() {
  if (keepOut) return keepOut;
  keepOut = [];
  for (const id of LIVER_EDGES) {
    if (!EDGE_PATH[id] || HIDDEN_EDGES.has(id) || ANAT_HIDDEN.has(id)) continue;
    let P = sampleCurve(EDGE_PATH[id]);
    for (const p of strandPts(id, P)) keepOut.push([p[0], p[1], KEEP.strand]);
    if (AT_EDGE[id]) P = P.slice(0, Math.round(P.length * AT_EDGE[id]));
    for (const p of P) keepOut.push([p[0], p[1], KEEP.vessel]);
  }
  return keepOut;
}
// The keep-out points binned in KEEP_CELL squares (keyed x * 4096 + y), built once.
const KEEP_CELL = 60;
let keepCells = null;
function keepGrid() {
  if (keepCells) return keepCells;
  keepCells = new Map();
  for (const p of liverKeepOut()) {
    const key = Math.floor(p[0] / KEEP_CELL) * 4096 + Math.floor(p[1] / KEEP_CELL);
    if (keepCells.has(key)) keepCells.get(key).push(p); else keepCells.set(key, [p]);
  }
  return keepCells;
}
// How far out each edge point must be held so the vessels keep their clearance: measured on the edge as drawn (world frame:
// after liverShrink), eased along the edge (a plateau, then a soft shoulder: no corner, no flat spot), so it reads as part of
// the lobe. The sampled edge runs about 2.3 apart, so 1.5 covers the stretch between two points.
function holdBack(out, nm, k) {
  const n = out.length, hold = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = 560 + (out[i][0] - 560) * k, y = 350 + (out[i][1] - 350) * k, [nx, ny] = nm[i];
    let h = 0;
    // (Only the points in the 3 x 3 grid cells round this one can be within 60 of it: the same points the test below keeps,
    // so the hold is exactly what a pass over all of them gives, without that pass on every frame of the ease.)
    const gx = Math.floor(x / KEEP_CELL), gy = Math.floor(y / KEEP_CELL);
    for (let ci = gx - 1; ci <= gx + 1; ci++) for (let cj = gy - 1; cj <= gy + 1; cj++) for (const K of keepGrid().get(ci * 4096 + cj) || []) {
      // The point's offset from this edge point, out along the edge's normal (a) and along the edge (t): the edge here must move
      // out to a plus what is left of the clearance across t.
      const need = K[2] + 1.5, dx = K[0] - x, dy = K[1] - y;
      if (Math.abs(dx) > 60 || Math.abs(dy) > 60) continue;
      const a = dx * nx + dy * ny, t = Math.abs(dx * ny - dy * nx);
      if (t >= need || a < -need) continue;
      const d = a + Math.sqrt(need * need - t * t);
      if (d > h) h = d;
    }
    hold[i] = h;
  }
  const W = 5, wide = new Float64Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = -W; j <= W; j++) m = Math.max(m, hold[(i + j + n) % n]); wide[i] = m; }
  const soft = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let j = -W; j <= W; j++) { const t = W + 1 - Math.abs(j); a += wide[(i + j + n) % n] * t; w += t; } soft[i] = a / w; }
  return soft;
}


/** The reshaped outline (in the liver's own frame, before liverShrink) and the same without its nodular bumps (`dome`). */
export function morphOutline({ pts, nm, nod }, c, g) {
  const out = [], dome = [];
  pts.forEach((p0, i) => {
    const [x, y] = liverField(p0[0], p0[1], c);
    const [nx, ny] = nm[i], inf = clamp(ny, 0, 1);
    // Cirrhosis: the inferior edge draws up and rounds off; the thin left lobe tip thickens.
    const tip = smooth01((p0[0] - 750) / 70);
    let push = -8 * c * inf + 5 * c * tip;
    // Congestion: the organ swells, most along its free inferior edge, and its tip rounds. Its top stays where it is (sup:
    // the swelling and liverShrink's lift cancel there), held under the diaphragm the heart rests on (20 Oct review).
    const sup = clamp(-ny, 0, 1);
    push += g * (5 + 9 * inf + 4 * tip - 11 * sup);
    dome.push([x + nx * push, y + ny * push]);
    // Nodular contour: rounded bulges with notches between them (a cusp at each notch).
    const [u, a] = nod[i];
    push += (Math.pow(Math.sin(Math.PI * u), 0.5) - 0.72) * CIRR.nod * a * smooth01(c / 0.7) * (0.45 + 0.55 * c);
    out.push([x + nx * push, y + ny * push]);
  });
  // The edge held off the vessels (the hold is in world units; the outline is in the liver's own frame, scaled by liverShrink).
  if (c + g > 0) {
    const k = liverShrink(c, g), hold = holdBack(out, nm, k);
    for (let i = 0; i < out.length; i++) if (hold[i] > 0) {
      const [nx, ny] = nm[i], h = hold[i] / k;
      out[i] = [out[i][0] + nx * h, out[i][1] + ny * h];
      dome[i] = [dome[i][0] + nx * h, dome[i][1] + ny * h];
    }
  }
  return { out, dome };
}
