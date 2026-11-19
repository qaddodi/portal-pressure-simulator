// A state's fingerprint for the ladder, the presenter's data and tables: the pressures from the portal vein to the
// heart, the gradients, the ascites (volume, SAAG, protein, albumin) and the lymph that makes it, the sinusoidal and
// central vein pressures, varices, spleen, flow and shunting.
// The fluid balance (engine.js starling, mL/min): lymphCap, what the lymphatics can carry; lymphOver, the lymph made beyond
// it, which becomes ascites; lymphBack, what the peritoneum takes back; lymphNet, the ascites made (overflow less take-back).
// rih: the resistance inside the liver (mmHg per L/min): each lobe's venules, sinusoids and outflow in series, the
// two lobes in parallel, as the circuit view's liver resistor reads it. (PPG ÷ portal flow also counts the collaterals.)
// The worker builds one for each slide's state (worker-core.js), the presenter one for the live model while a time-lapse plays
// (presenter.js liveFp): both here, so a tile or chart reads the same keys either way.
import { NODES, EDGES } from './topology.js';
import { tenthGap } from '../core/gap.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];

// (The lobes' edges and their end nodes as plain indices, so liverRes reads the network with no lookup and no closure.)
const LOBE_K = LOBES.map((ids) => ids.map((id) => EI[id]));
const EDGE_FROM = EDGES.map((ed) => NI[ed.from]), EDGE_TO = EDGES.map((ed) => NI[ed.to]);
const NO_OPTS = {};

/** The resistance inside the liver (mmHg per L/min) from the network's pressures and flows (smoothed, in the topology's order). */
export function liverRes(P, Q) {
  let g = 0;
  for (let l = 0; l < LOBE_K.length; l++) {
    const ks = LOBE_K[l];
    let s = 0;
    for (let j = 0; j < ks.length; j++) { const k = ks[j]; s += (P[EDGE_FROM[k]] - P[EDGE_TO[k]]) / Math.max(1e-6, Math.abs(Q[k]) * 0.06); }
    g += 1 / Math.max(1e-6, s);
  }
  return 1 / g;
}

// (The stent readings that are a card's own, beside the geometry thread's tipsFlow, tipsDp, tipsVw, tipsFric and tipsLocal (mmHg): null for a stent that is not in.)
const stentTiles = (k, t) => ({
  [`${k}Bench`]: t ? t.bench : null, [`${k}Vel`]: t ? t.vPeak : null, [`${k}Lumen`]: t ? t.dWaist : null,
  [`${k}Stn`]: t ? t.end : null, [`${k}Red`]: t ? t.red : null, [`${k}StnSite`]: t ? t.site : null,   // (its end stenosis and where, and its deliberate waist: whose jet each Doppler gate reads, stent-geom.js gateKindsOf)
  [`${k}D`]: t ? t.d : null,   // (its open diameter in mm: the range its peak velocity is read against follows it, stent-geom.js stentBand)
  // (and the rest of its geometry at that moment, cm: a card pinned to the slide draws the stent the numbers came from, never the live params' next one)
  [`${k}Len`]: t ? t.geom.len : null, [`${k}WaistLen`]: t ? t.geom.waist : null, [`${k}Trans`]: t ? t.geom.trans : null, [`${k}Resid`]: t ? t.resid : null,
  // (The stent cards' own: the three Doppler points as the scanner reads them, and the drop's four parts: tract, wall friction, the two ends, the narrowing's jet.)
  [`${k}G0`]: t ? t.peaks[0] : null, [`${k}G1`]: t ? t.peaks[1] : null, [`${k}G2`]: t ? t.peaks[2] : null,
  [`${k}Tract`]: t ? t.parts.tract : null, [`${k}Wall`]: t ? t.parts.wall : null, [`${k}Ends`]: t ? t.parts.entry : null, [`${k}Jet`]: t ? t.parts.jet + t.parts.inlet : null,
  [`${k}LocalPct`]: t && t.dp > 0.05 ? (100 * (t.parts.entry + t.parts.jet + t.parts.inlet)) / t.dp : t ? 0 : null,
  ...(k === 'dips' ? { dipsFlow: t ? t.flow : null, dipsDp: t ? t.dp : null } : null),
});
/** The fingerprint of model metrics `m` (computeMetrics). `P`, `Q`, `D`: the network as it stood (pressures and flows smoothed,
 *  diameters, in the topology's order), kept as the fingerprint's `at`, so a slide's callouts and figure labels read its numbers as the
 *  tiles do: the same on every screen (`copy`: as copies, for arrays the engine goes on writing). `params`: the patient's settings
 *  (albumin, clot). `fluid`: the engine's starling(); only the engine side has it, and without it the lymph's overflow, take-back and
 *  net are left out (undefined, not null: tool-fluid.js reads a null as 0 and would pin the card to nothing), so the fluid card follows
 *  the live frames. */
export function fingerprintOf(m, { P = null, Q = null, D = null, copy = false, params = null, fluid = null } = NO_OPTS) {
  const a = m.ascites;
  // (The network as it stood, kept by the record. alloc-rare below: it is made with the record.)
  // alloc-rare: made with the record: one per slide state in the worker, in the presenter only while a time-lapse plays, polled every 150 ms
  const at = P && Q && D ? (copy ? { P: Float32Array.from(P), Q: Float32Array.from(Q), D } : { P, Q, D }) : null;
  // alloc-rare: a state's fingerprint is a new record by design (callers keep it, e.g. cath.fp): one per slide state in the worker, in the presenter only while a time-lapse or what-if plays, polled every 150 ms (wait(150)), never per frame
  return {
    pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg), ra: m.vitals?.ra ?? m.ra, ivc: m.ivc, ppg: tenthGap(m.pv, m.ivc, m.ppg),
    eus: P ? tenthGap(P[NI.LPV], P[NI.LHV], P[NI.LPV] - P[NI.LHV]) : null,
    lpv: P ? P[NI.LPV] : null, lhv: P ? P[NI.LHV] : null,   // (the EUS needle's two veins: the readings the EUS-PPG takes)
    asc: a.volume, saag: a.saag, tp: a.totalProtein, aalb: a.albumin, salb: params?.albumin, sigma: a.lymphSigma, lymphProt: a.lymphProt, hepLymph: a.hepLymph, splLymph: a.splLymph,
    sin: P ? P[NI.SIN_R] : null, cv: P ? P[NI.CV_R] : null, int: P ? P[NI.INT] : null, varix: m.varix.d, redWale: m.varix.redWale === true, varixAir: m.varix.air, wall: m.varix.ratioShown, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, he: m.heRisk?.index, liver: m.liverPerfPct, lsm: m.lsm, scar: m.scar, ssm: m.ssm, pvVel: m.pvVelMean, map: m.map, sbp: m.sbp, dbp: m.dbp, rpp: m.rpp, hr: m.hr, hb: m.blood?.hb, hbTo: m.blood?.hbSettled, co: m.co, bv: m.blood?.volume,
    svr: m.svr, spl: m.splanchnicIn,   // (the systemic vascular resistance, (MAP − RA) ÷ CO in mmHg·min/L, and the splanchnic arterial inflow in L/min: the change-from-healthy chart, tool-shift.js)
    rih: P && Q ? liverRes(P, Q) : null,
    // The TIPS (metrics tips, engine stentState): its flow (L/min), the pressure across it (mmHg, portal end less hepatic vein end), the waist's
    // mean velocity (cm/s), and the drop its friction (tract and wall) and its local losses (entrance, exit, the waist's jet and inlet) take. null without one.
    tipsFlow: m.tips ? m.tips.flow : null, tipsDp: m.tips ? m.tips.dp : null, tipsVw: m.tips ? m.tips.vWaist : null,
    tipsFric: m.tips ? m.tips.parts.tract + m.tips.parts.wall : null, tipsLocal: m.tips ? m.tips.parts.entry + m.tips.parts.jet + m.tips.parts.inlet : null,
    // The stents as a card or tile reads them (the stent cards, src/ui/tool-stent.js): the highest of the three Doppler points (cm/s, the Doppler card's
    // own reads), the narrowest lumen (mm) and the local losses' share of the pressure across it (%), for the TIPS and for the DIPS.
    ...stentTiles('tips', m.tips), ...stentTiles('dips', m.dips),
    lymphCap: a.lymphCap, lymphOver: fluid?.excess, lymphBack: fluid ? fluid.bulk + fluid.water : undefined, lymphNet: fluid?.net,
    clot: +params?.thrombus?.PV_TRUNK || 0,
    at };
}
