// A state's fingerprint for the ladder, the presenter's data and tables: the pressures from the portal vein to the
// heart, the gradients, the ascites (volume, SAAG, protein, albumin) and the lymph that makes it, the sinusoidal and
// central vein pressures, varices, spleen, flow and shunting.
// The fluid balance (engine.js starling, mL/min): lymphCap, what the lymphatics can carry; lymphOver, the lymph made beyond
// it, which becomes ascites; lymphBack, what the peritoneum takes back; lymphNet, the ascites made (overflow less take-back).
// rih: the resistance inside the liver (mmHg per L/min): each lobe's venules, sinusoids and outflow in series, the
// two lobes in parallel, as the circuit view's liver resistor reads it. (PPG ÷ portal flow also counts the collaterals.)
// The worker builds one for each slide's state (worker-core.js), the presenter one for the live model while a time-lapse plays
// (presenter.js liveFp): both here, so a tile or chart reads the same keys either way.
import { NODES, EDGES } from './topology.js?v=4044766e96';
import { tenthGap } from './gap.js?v=3aabfbb29b';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];

/** The resistance inside the liver (mmHg per L/min) from the network's pressures and flows (smoothed, in the topology's order). */
export function liverRes(P, Q) {
  const r = (id) => { const k = EI[id], ed = EDGES[k]; return (P[NI[ed.from]] - P[NI[ed.to]]) / Math.max(1e-6, Math.abs(Q[k]) * 0.06); };
  return 1 / LOBES.reduce((g, ids) => g + 1 / Math.max(1e-6, ids.reduce((s, id) => s + r(id), 0)), 0);
}

/** The fingerprint of model metrics `m` (computeMetrics). `P`, `Q`, `D`: the network as it stood (pressures and flows smoothed,
 *  diameters, in the topology's order), kept as the fingerprint's `at`, so a slide's callouts and figure labels read its numbers as the
 *  tiles do: the same on every screen (`copy`: as copies, for arrays the engine goes on writing). `params`: the patient's settings
 *  (albumin, clot). `fluid`: the engine's starling(); only the engine side has it, and without it the lymph's overflow, take-back and
 *  net are left out (undefined, not null: tool-fluid.js reads a null as 0 and would pin the card to nothing), so the fluid card follows
 *  the live frames. */
export function fingerprintOf(m, { P = null, Q = null, D = null, copy = false, params = null, fluid = null } = {}) {
  const a = m.ascites;
  return {
    pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg), ra: m.vitals?.ra ?? m.ra, ivc: m.ivc, ppg: tenthGap(m.pv, m.ivc, m.ppg),
    asc: a.volume, saag: a.saag, tp: a.totalProtein, aalb: a.albumin, salb: params?.albumin, sigma: a.lymphSigma, hepLymph: a.hepLymph, splLymph: a.splLymph,
    sin: P ? P[NI.SIN_R] : null, cv: P ? P[NI.CV_R] : null, int: P ? P[NI.INT] : null, varix: m.varix.d, wall: m.varix.ratioShown, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, he: m.heRisk?.index, liver: m.liverPerfPct, lsm: m.lsm, pvVel: m.pvVelMean, map: m.map, hr: m.hr, hb: m.blood?.hb, co: m.co, bv: m.blood?.volume,
    rih: P && Q ? liverRes(P, Q) : null,
    lymphCap: a.lymphCap, lymphOver: fluid?.excess, lymphBack: fluid ? fluid.bulk + fluid.water : undefined, lymphNet: fluid?.net,
    clot: +params?.thrombus?.PV_TRUNK || 0,
    at: P && Q && D ? (copy ? { P: Float32Array.from(P), Q: Float32Array.from(Q), D } : { P, Q, D }) : null };
}
