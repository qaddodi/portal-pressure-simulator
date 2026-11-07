// What the lobule shows, read from one model frame: the pressures along it, its flows against the
// healthy patient, the resistance in each zone and what disease has made of it. Shared by the lobule's
// drawing (lobule-zoom.js) and its cards (actions.js), so both read the same numbers.
//
// One representative lobule stands for the whole liver, read from the right lobe (most of the
// liver's flow).

import { NODES, EDGES } from '../engine/topology.js';
import { clamp } from './util.js';
import { oxygenFor } from './blood.js';
import { sinceNow } from './since-ref.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const LOBE = { pv: 'RPV', sin: 'SIN_R', cv: 'CV_R', hv: 'RHV', q: 'SIN_RR', a: 'A_HR', pre: 'PRE_R', post: 'POST_R_RHV' };

/** The lobule's flows against the healthy patient (1 = normal), its hepatic lymph (mL/min) and that lymph's protein (fraction of plasma), from one model frame.
 *  The object returned is one kept by this module and written anew by each call: read it before the next call, copy to keep. */
export function lobuleFlows(f, H) {
  return lobuleFlowsInto(FLOWS, f, H);   // (one kept object, written anew by each call: the dock reads a value of it at once)
}
const FLOWS = {};
// One flow against the healthy patient's: its ratio (1 = normal).
function ratioOf(Q, HQ, id) {
  const e = EI[id], q = Q[e], q0 = HQ?.[e] || Math.abs(q) || 1;
  return q / q0;
}
/** lobuleFlows written into `out` (an object the caller keeps, so a frame makes none); returns out. */
export function lobuleFlowsInto(out, f, H) {
  const Q = f.Qf || f.Q, HQ = H?.Q, asc = f.metrics?.ascites;
  out.flow = ratioOf(Q, HQ, LOBE.q); out.portal = ratioOf(Q, HQ, LOBE.pre); out.portalQ = Q[EI[LOBE.pre]]; out.portalRef = HQ?.[EI[LOBE.pre]] ?? 0;
  out.art = ratioOf(Q, HQ, LOBE.a); out.lymph = asc?.hepLymph ?? 0; out.lyProt = asc?.lymphProt ?? 0.88; out.sigma = asc?.lymphSigma ?? 0.15;
  out.lymph0 = H?.metrics?.ascites?.hepLymph || 0.8;
  return out;
}

/** The lens a store state has the vessels coloured by: the imaging view's neutral, a comparison's change, or the chosen "Colored by". */
export const lensModeOf = (st) => (st.imaging ? 'neutral' : st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode);

/** The network a change-since slide counts from (a Float32Array of node pressures), or null: only that lens, on a slide, takes it. */
export const sinceOf = (st) => (!st.compareSnap && st.presenting && st.colorMode === 'since' ? sinceNow() : null);

/** The lobule's state for frame `f` (store state `st` gives the healthy reference). `since`: the reference a change-since slide counts
 *  from, when the caller eases it (lobule-zoom.js); left out, it is read as the slide has it. The object returned is one kept by this
 *  module and written anew by each call (the cards read it at once); a caller that keeps a model passes its own to lobuleStateInto. */
export function lobuleState(f, st, since = sinceOf(st)) {
  return lobuleStateInto(STATE, f, st, since);   // (one kept object, written anew by each call: the cards read it at once; the lobule view keeps its own, lobuleStateInto)
}
const STATE = {};
// The five nodes the lobule's pressures are read at, in the order of m.H and m.R.
const NODE_IDS = [LOBE.pv, LOBE.sin, LOBE.cv, LOBE.hv, 'IVCS'];
const rBufs = new WeakMap();   // (an output object's own list of reference pressures, when it has them apart from m.H)
// Whether a flow runs backwards past the dead band (the same one velNormal.js flowReversed uses).
const revOf = (q, q0) => q < -Math.max(0.12, 0.02 * Math.abs(q0 ?? 1));
/** lobuleState written into `m`, an object the caller keeps (the lobule's model, its field's): a frame makes no object, array or
 *  closure, and everything it held before is written over, so what a caller took from m earlier (the model's `inks`, which the view
 *  sets on it) stays. `P` is the pressures to read (the eased ones; f.P by default); returns m. */
export function lobuleStateInto(m, f, st, since = sinceOf(st), P = f.P) {
  const S = LOBE, p = f.params || f.viewParams || st.params, H = st.healthy, HP = H?.P, HQ = H?.Q;
  const Q = f.Qf || f.Q;
  const fib = p.fibrosis.R, sc = p.cirrhosis;
  const zone = m.zone ||= { pre: 0, sin: 0, post: 0 };   // alloc-rare: only the first time an output object is filled (then written in place)
  zone.pre = (1 + 2 * sc) * fib.pre; zone.sin = (1 + 20 * sc ** 2.5) * fib.sin; zone.post = (1 + 2 * sc) * fib.post;
  const P3 = P[NI[S.cv]], cong = Math.max(0, P3 - (HP?.[NI[S.cv]] ?? P3));
  m.P1 = P[NI[S.pv]]; m.P2 = P[NI[S.sin]]; m.P3 = P3; m.P4 = P[NI[S.hv]]; m.P5 = P[NI['IVCS']];
  const Hs = m.H ||= [0, 0, 0, 0, 0];   // alloc-rare: only the first time an output object is filled (then written in place)
  for (let i = 0; i < 5; i++) Hs[i] = HP?.[NI[NODE_IDS[i]]];
  lobuleFlowsInto(m, f, H);
  m.zone = zone; m.s = sc; m.cong = cong; m.hide = !!st.imaging; m.fib = fib; m.hvpg = f.metrics?.hvpg;
  m.fibSin = clamp(Math.log(zone.sin) / 3.2, 0, 1); m.fibPre = clamp(Math.log(zone.pre) / 5.4, 0, 1) ** 0.6; m.fibPost = clamp(Math.log(zone.post) / 4.8, 0, 1) ** 0.6;
  m.congU = clamp(cong / 12, 0, 1); m.shuntU = clamp((sc - 0.45) / 0.35, 0, 1); m.septU = clamp((sc - 0.3) / 0.5, 0, 1);
  m.act = clamp(Math.max(m.fibSin, sc * 0.9), 0, 1);
  // What the vessel color encodes, as in the anatomy (the lens, a comparison, or the imaging view's neutral one).
  m.mode = lensModeOf(st);
  // A "change since" slide (lens 'since', stage.js REF): change counts from the network the slide counts from, not from healthy.
  // Only that lens on a slide takes it; every other lens and Patients' pinned moment read as before.
  const ref = st.compareSnap ? st.compareSnap.P : since || HP;
  // The reference the labels and the card measure change against: the pinned moment while
  // comparing (as the anatomy does), otherwise the healthy patient (the slide's reference on a change-since slide).
  m.cmp = !!st.compareSnap;
  m.since = !!since;
  m.lymphRef = m.cmp ? (st.compareSnap.metrics?.ascites?.hepLymph ?? m.lymph0) : m.lymph0;
  if (m.cmp || m.since) {
    let R = rBufs.get(m);
    if (!R) rBufs.set(m, (R = [0, 0, 0, 0, 0]));   // alloc-rare: only the first time an output object is filled with a comparison or a change-since slide
    for (let i = 0; i < 5; i++) R[i] = ref[NI[NODE_IDS[i]]];
    m.R = R;
  } else m.R = Hs;
  const dP = m.dP ||= [0, 0, 0];   // alloc-rare: only the first time an output object is filled (then written in place)
  dP[0] = ref ? P[NI[S.pv]] - ref[NI[S.pv]] : 0; dP[1] = ref ? P[NI[S.sin]] - ref[NI[S.sin]] : 0; dP[2] = ref ? P[NI[S.cv]] - ref[NI[S.cv]] : 0;
  const Qs = m.Qs ||= { pre: 0, sin: 0, post: 0 }, Q0 = m.Q0 ||= { pre: 0, sin: 0, post: 0 };   // alloc-rare: only the first time an output object is filled (then written in place)
  Qs.pre = Q[EI[S.pre]]; Qs.sin = Q[EI[S.q]]; Qs.post = Q[EI[S.post]];
  Q0.pre = HQ?.[EI[S.pre]]; Q0.sin = HQ?.[EI[S.q]]; Q0.post = HQ?.[EI[S.post]];
  // Colored by oxygen: saturation in the portal venule, where portal and arterial blood meet at the sinusoids' inlet,
  // and at the central vein after the liver cells have taken their share.
  if (m.mode === 'oxygen') {
    const { node } = oxygenFor(EDGES, NODES, f), oxy = m.oxy ||= [0, 0, 0];   // alloc-rare: only the first time an output object is filled in the oxygen lens (then written in place)
    oxy[0] = node[NI[S.pv]]; oxy[1] = node[NI[S.sin]]; oxy[2] = node[NI[S.cv]];
  } else if (m.oxy) m.oxy = undefined;
  const rev = m.rev ||= { pre: false, sin: false, post: false };   // alloc-rare: only the first time an output object is filled (then written in place)
  rev.pre = revOf(Qs.pre, Q0.pre); rev.sin = revOf(Qs.sin, Q0.sin); rev.post = revOf(Qs.post, Q0.post);
  return m;
}

/** Hepatic lymph as a multiple of the healthy rate. */
export const lymphRate = (m) => m.lymph / (m.lymph0 || 0.8);
