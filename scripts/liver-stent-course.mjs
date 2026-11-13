// The anatomic course of a stent from the portal vein or one of its two branches (right, left) to a hepatic vein (right, middle, left): drawn the way the TIPS is
// (tests/tips-course.test.js), a side-to-side stent between two trunks. It leaves the portal branch on the centre line of its run, near its middle, a little off its direction
// toward where it is going, bows one way (a C, never an S, between a tenth and a fifth of its chord) and comes into the hepatic vein a hair inside its near wall at about its
// middle, heading the way the blood goes: both ends are side joins on a trunk, not a vessel's end or a node (Mohammad, 13 Nov 2026: "any stent try to curve into the natural
// path of the blood vessel (here RPV RHV is good but LHV LPV is bad)"). The hilum's stents (from the portal vein, PVH) start at its node, as the DIPS does.
// Pure: node only. Found by a small search over the join places, the two angles and the handle lengths, scored by shunt-route-lib's judge (on top of / alongside other
// vessels, crossings), a bend that is one way, and closeness to the TIPS's own angles (34 degrees off the portal run, 52 off the hepatic).
import { EDGE, anatomyLines, anatomyStations, cubicsToD, judge, sampleD } from './shunt-route-lib.mjs';
import { EDGE_PATH, NODE_POS } from '../src/ui/anatomy.js';
import { LIVER_STENT_FROM, LIVER_STENT_TO, isLiverStent } from '../src/engine/topology.js';

export const PORTAL_HOST = { RPV: 'PVH_R', LPV: 'PVH_L' };   // the branch's drawn run, hilum outward
export const HEPATIC_HOST = { RHV: 'RHV_IVC', MHV: 'MHV_IVC', LHV: 'LHV_IVC' };   // the vein's drawn run, toward the cava
export { LIVER_STENT_FROM, LIVER_STENT_TO, isLiverStent };
export const END_IN = 1.4;   // (how far inside the hepatic vein's near wall the stent ends, off its centre line: the TIPS's own)

const rot = (u, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [u[0] * c - u[1] * s, u[0] * s + u[1] * c]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const arc = (P) => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return c; };
/** The point at fraction t of course P (by arc length) and its unit tangent. */
export function at(P, t) {
  const c = arc(P), s = t * c.at(-1);
  let i = 1;
  while (i < P.length - 1 && c[i] < s) i++;
  const u = (s - c[i - 1]) / (c[i] - c[i - 1] || 1), p = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u];
  return [p, norm([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]])];
}
const cubic = (p0, p1, p2, p3, n = 60) => { const o = []; for (let k = 0; k <= n; k++) { const s = k / n, u = 1 - s; o.push([0, 1].map((a) => u * u * u * p0[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); } return o; };
const sagitta = (P) => { const a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = 0, sign = 0, ok = true; for (let i = 0; i < P.length; i++) d = Math.max(d, Math.abs(cross([b[0] - a[0], b[1] - a[1]], [a[0] - P[i][0], a[1] - P[i][1]])) / L); for (let i = 2; i < P.length; i++) { const c = cross([P[i - 1][0] - P[i - 2][0], P[i - 1][1] - P[i - 2][1]], [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]); if (Math.abs(c) < 1e-3) continue; if (sign && Math.sign(c) !== sign) ok = false; sign = Math.sign(c); } return { bow: d / L, oneWay: ok, L }; };

/** Every course of a liver stent, as { d (path text), start, end, ... }, best first, for the custom shunt `id` (from, to). */
export function liverStentCourse(from, to, lines = anatomyLines(), keep = 1) {
  const id = `X_${from}_${to}`, H = sampleD(EDGE_PATH[HEPATIC_HOST[to]], 1);
  const stations = anatomyStations();
  const starts = [];
  if (PORTAL_HOST[from]) { const P = sampleD(EDGE_PATH[PORTAL_HOST[from]], 1); for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) { const [p, u] = at(P, t); starts.push({ p, u, t, node: false }); } }
  else starts.push({ p: NODE_POS[from][0], u: null, t: 0, node: true });
  const out = [];
  for (const st of starts) for (const te of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const [h, uH] = at(H, te);
    const S = st.p, c0 = cross(uH, [S[0] - h[0], S[1] - h[1]]), nrm = norm(rot(uH, c0 > 0 ? 90 : -90));   // (toward the side the stent comes from)
    const E = [h[0] + nrm[0] * END_IN, h[1] + nrm[1] * END_IN], chord = Math.hypot(E[0] - S[0], E[1] - S[1]);
    for (const alpha of st.node ? [-55, -40, -25, 25, 40, 55] : [20, 28, 36, 44, 54, 64]) for (const beta of [35, 45, 55, 65]) for (const hk of [0.25, 0.35, 0.45, 0.55]) {
      const toE = norm([E[0] - S[0], E[1] - S[1]]);
      const d0 = st.node ? rot(toE, alpha) : rot(st.u, Math.sign(cross(st.u, toE)) * alpha);
      const d1 = rot(uH, -Math.sign(c0) * beta);
      const P = cubic(S, [S[0] + d0[0] * chord * hk, S[1] + d0[1] * chord * hk], [E[0] - d1[0] * chord * hk, E[1] - d1[1] * chord * hk], E);
      const { bow, oneWay } = sagitta(P);
      if (bow < 0.06 || bow > (oneWay ? 0.3 : 0.26)) continue;
      const ctl = [[S, [S[0] + d0[0] * chord * hk, S[1] + d0[1] * chord * hk], [E[0] - d1[0] * chord * hk, E[1] - d1[1] * chord * hk], E]];
      const dd = cubicsToD(ctl), Q = sampleD(dd), j = judge(id, Q, lines, 'anat');
      let pen = j.on * 3 + j.par + Object.values(j.cx).reduce((a, b) => a + b, 0) * 14;
      for (const q of stations) { let m = 1e9; for (const p of Q) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); if (m < 11 && Math.hypot(q[0] - S[0], q[1] - S[1]) > 14 && Math.hypot(q[0] - E[0], q[1] - E[1]) > 14) pen += (11 - m) * 12; }
      if (j.on > 22 || j.on + j.par > 130) pen += 500;   // (within the audit's limit, tests/shunt-routes.test.js, with a margin: a stent never lies along a vein for a stretch)
      pen += st.node ? 0 : Math.abs(alpha - 34) * 0.4; pen += Math.abs(beta - 50) * 0.4; pen += Math.abs(bow - 0.14) * 100 + chord * 0.15 + (oneWay ? 0 : 200);
      out.push({ id, d: dd, pen, bow, alpha, beta, hk, ts: st.t, te, on: j.on, par: j.par, cx: j.cx, onBy: j.onBy, parBy: j.parBy, oneWay });
    }
  }
  out.sort((a, b) => a.pen - b.pen);
  if (keep === 1) return out.slice(0, 1);
  // (Several of the best at each pair of join places, for the set's search: the same join places with another angle are a different course, not another join.)
  const per = new Map(), kept = [];
  for (const c of out) { const k = `${c.ts}|${c.te}`, n = per.get(k) || 0; if (n < 24) { per.set(k, n + 1); kept.push(c); } }
  return kept.slice(0, keep);
}

// Where each stent starts and ends in the left-to-right order of the liver's trunks (portal: right branch, hilum, left branch; hepatic: right, middle, left; the DIPS
// ends on the cava between the middle and the left hepatic vein). Two stents can be drawn without crossing when neither is the other's reverse in that order (a pair that
// shares an end can always be): those are held apart, so the stents of the figure cross only where the order makes them.
const PORDER = { RPV: 0, PVH: 1, LPV: 2 }, HORDER = { RHV: 0, MHV: 1, LHV: 2 };
const FIXED = { TIPS: [0, 0], DIPS: [1, 1.5] };
const polyCross = (A, B) => {
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let n = 0;
  for (let i = 1; i < A.length; i++) for (let k = 1; k < B.length; k++) if (side(A[i - 1], A[i], B[k - 1]) * side(A[i - 1], A[i], B[k]) < 0 && side(B[k - 1], B[k], A[i - 1]) * side(B[k - 1], B[k], A[i]) < 0) n++;
  return n;
};
/** The course text of every liver stent (id -> d), chosen together so that no two stents that can avoid crossing (and neither the TIPS nor the DIPS) do. */
export function liverStentSet(lines = anatomyLines(), n = 480) {
  const ids = [], cand = [];
  for (const f of LIVER_STENT_FROM) for (const t of LIVER_STENT_TO) {
    if (f === 'RPV' && t === 'RHV') continue;   // (the TIPS)
    ids.push(`X_${f}_${t}`);
    cand.push(liverStentCourse(f, t, lines, n).map((c) => ({ ...c, P: sampleD(c.d, 3) })));
  }
  const key = ids.map((id) => [PORDER[id.split('_')[1]], HORDER[id.split('_')[2]]]);
  const fixed = Object.entries(FIXED).map(([id, o]) => ({ o, P: sampleD(EDGE_PATH[id], 3) }));
  const apart = (a, b) => (a[0] - b[0]) * (a[1] - b[1]) >= 0;   // (not each other's reverse in the order: they can be drawn without crossing)
  const pick = cand.map(() => 0);
  const cost = (i, c) => {
    let v = c.pen;
    for (const f of fixed) if (apart(key[i], f.o)) v += 400 * polyCross(c.P, f.P);
    for (let j = 0; j < ids.length; j++) if (j !== i && apart(key[i], key[j])) v += 400 * polyCross(c.P, cand[j][pick[j]].P);
    return v;
  };
  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      let best = pick[i], bv = cost(i, cand[i][best]);
      for (let k = 0; k < cand[i].length; k++) { const v = cost(i, cand[i][k]); if (v < bv - 1e-9) { bv = v; best = k; } }
      if (best !== pick[i]) { pick[i] = best; moved = true; }
    }
    if (!moved) break;
  }
  // (A pair that still crosses, though it need not, is searched together: one stent's best course alone can be the other's only way across.)
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (!apart(key[i], key[j]) || !polyCross(cand[i][pick[i]].P, cand[j][pick[j]].P)) continue;
    let best = null;
    for (let a = 0; a < cand[i].length; a++) for (let b = 0; b < cand[j].length; b++) {
      const v = cand[i][a].pen + cand[j][b].pen + 400 * polyCross(cand[i][a].P, cand[j][b].P);
      if (!best || v < best.v) best = { v, a, b };
    }
    pick[i] = best.a; pick[j] = best.b;
  }
  return Object.fromEntries(ids.map((id, i) => [id, cand[i][pick[i]].d]));
}
