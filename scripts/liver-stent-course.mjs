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
  if (PORTAL_HOST[from]) { const P = sampleD(EDGE_PATH[PORTAL_HOST[from]], 1); for (const t of [0.4, 0.5, 0.6, 0.7]) { const [p, u] = at(P, t); starts.push({ p, u, t, node: false }); } }
  else starts.push({ p: NODE_POS[from][0], u: null, t: 0, node: true });
  const out = [];
  for (const st of starts) for (const te of [0.4, 0.5, 0.6, 0.7]) {
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
      pen += st.node ? 0 : Math.abs(alpha - 34) * 0.4; pen += Math.abs(beta - 50) * 0.4; pen += Math.abs(bow - 0.14) * 100 + chord * 0.15 + (oneWay ? 0 : 200);
      out.push({ id, d: dd, pen, bow, alpha, beta, hk, ts: st.t, te, on: j.on, par: j.par, cx: j.cx, onBy: j.onBy, parBy: j.parBy, oneWay });
    }
  }
  out.sort((a, b) => a.pen - b.pen);
  return out.slice(0, keep);
}
