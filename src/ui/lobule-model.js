// What the lobule shows, read from one model frame: the pressures along it, its flows against the
// healthy patient, the resistance in each zone and what disease has made of it. Shared by the lobule's
// drawing (lobule-zoom.js) and its cards (actions.js), so both read the same numbers.
//
// One representative lobule stands for the whole liver, read from the right lobe (most of the
// liver's flow).

import { NODES, EDGES } from '../engine/topology.js?v=c9c36d1829';
import { clamp } from './util.js?v=8aa5e5cdf1';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const LOBE = { pv: 'RPV', sin: 'SIN_R', cv: 'CV_R', hv: 'RHV', q: 'SIN_RR', a: 'A_HR', pre: 'PRE_R', post: 'POST_R_RHV' };

/** The lobule's flows against the healthy patient (1 = normal) and its hepatic lymph (mL/min), from one model frame. */
export function lobuleFlows(f, H) {
  const Q = f.Qf || f.Q, Qe = (id) => Q[EI[id]], He = (id) => H?.Q?.[EI[id]];
  const ratio = (id) => { const q = Qe(id), q0 = He(id) || Math.abs(q) || 1; return q / q0; };
  return { flow: ratio(LOBE.q), portal: ratio(LOBE.pre), art: ratio(LOBE.a), lymph: f.metrics?.ascites?.hepLymph ?? 0, lymph0: H?.metrics?.ascites?.hepLymph || 0.8 };
}

/** The lobule's state for frame `f` (store state `st` gives the healthy reference and the case). */
export function lobuleState(f, st) {
  const S = LOBE, p = f.params || f.viewParams || st.params, H = st.healthy;
  const Pn = (id) => f.P[NI[id]], Hn = (id) => H?.P?.[NI[id]];
  const Q = f.Qf || f.Q, Qe = (id) => Q[EI[id]], He = (id) => H?.Q?.[EI[id]];
  const fib = p.fibrosis.R, sc = p.cirrhosis;
  const zone = { pre: (1 + 2 * sc) * fib.pre, sin: (1 + 20 * sc ** 2.5) * fib.sin, post: (1 + 2 * sc) * fib.post };
  const P3 = Pn(S.cv), cong = Math.max(0, P3 - (Hn(S.cv) ?? P3));
  const m = {
    P1: Pn(S.pv), P2: Pn(S.sin), P3, P4: Pn(S.hv), P5: Pn('IVCS'), H: [Hn(S.pv), Hn(S.sin), Hn(S.cv), Hn(S.hv), Hn('IVCS')],
    ...lobuleFlows(f, H), zone, s: sc, cong, hide: !!st.imaging, fib, hvpg: f.metrics?.hvpg,
    fibSin: clamp(Math.log(zone.sin) / 3.2, 0, 1), fibPre: clamp(Math.log(zone.pre) / 5.4, 0, 1) ** 0.6, fibPost: clamp(Math.log(zone.post) / 4.8, 0, 1) ** 0.6,
    congU: clamp(cong / 12, 0, 1), shuntU: clamp((sc - 0.45) / 0.35, 0, 1), septU: clamp((sc - 0.3) / 0.5, 0, 1),
  };
  m.act = clamp(Math.max(m.fibSin, sc * 0.9), 0, 1);
  // What the vessel color encodes, as in the anatomy (the lens, a comparison, or a case's neutral view).
  m.mode = m.hide ? 'neutral' : st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
  const ref = st.compareSnap ? st.compareSnap.P : H?.P;
  // The reference the labels and the card measure change against: the pinned moment while
  // comparing (as the anatomy does), otherwise the healthy patient.
  m.cmp = !!st.compareSnap;
  m.lymphRef = m.cmp ? (st.compareSnap.metrics?.ascites?.hepLymph ?? m.lymph0) : m.lymph0;
  m.R = m.cmp ? [S.pv, S.sin, S.cv, S.hv, 'IVCS'].map((id) => ref[NI[id]]) : m.H;
  const dOf = (id) => (ref ? Pn(id) - ref[NI[id]] : 0);
  m.dP = [dOf(S.pv), dOf(S.sin), dOf(S.cv)];
  m.Qs = { pre: Qe(S.pre), sin: Qe(S.q), post: Qe(S.post) };
  const Q0 = { pre: He(S.pre), sin: He(S.q), post: He(S.post) };
  m.rev = Object.fromEntries(Object.entries(m.Qs).map(([k, q]) => [k, q < -Math.max(0.12, 0.02 * Math.abs(Q0[k] ?? 1))]));
  return m;
}

/** Hepatic lymph as a multiple of the healthy rate. */
export const lymphRate = (m) => m.lymph / (m.lymph0 || 0.8);
