// Clinical readouts derived from engine state (blueprint §9.1).

import { PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES, EDGES } from './topology.js?v=3fdc1306dd';
import { clamp } from './physiology.js?v=8b006eefeb';

export const BASE_HEPATIC_FLOW = 25; // mL/s (≈1.5 L/min), overwritten by engine baseline at first call

export function varixGrade(d) {
  if (d < 2.5) return { code: '—', label: 'None' };
  if (d < 5) return { code: 'F1', label: 'Small' };
  if (d < 10) return { code: 'F2', label: 'Large' };
  return { code: 'F3', label: 'Large, coil-shaped' };
}

export function ascitesGrade(V) {
  if (V < 150) return { grade: 0, label: 'None' };
  if (V < 1500) return { grade: 1, label: 'Grade 1 (ultrasound only)' };
  if (V < 5000) return { grade: 2, label: 'Grade 2 (moderate)' };
  return { grade: 3, label: 'Grade 3 (tense)' };
}

export function computeMetrics(eng) {
  const P = eng.Pf || eng.P, Q = eng.Q, ni = eng.ni, ei = eng.ei, p = eng.params;
  const q = (id) => Q[ei[id]];
  const qf = (id) => (eng.Qf ? eng.Qf[ei[id]] : Q[ei[id]]);
  if (!eng.baseHepFlow) eng.baseHepFlow = eng.refQ ? eng.refQ[ei.SIN_RR] + eng.refQ[ei.SIN_LL] : 25;

  const hv = eng.hvpgTrue(P);
  const splIn = SPLANCHNIC_ARTERIES.reduce((s, id) => s + qf(id), 0);
  const apIn = Math.max(0, qf('AP_R')) + Math.max(0, qf('AP_L'));
  let shunted = 0;
  const collateralFlows = {};
  for (const id of PORTOSYSTEMIC_EDGES) {
    const v = qf(id);
    shunted += Math.max(0, v);
    collateralFlows[id] = v;
  }
  for (const e of EDGES) if (e.kind === 'collateral') collateralFlows[e.id] = qf(e.id);
  const shuntFraction = clamp(shunted / Math.max(1e-6, splIn + apIn), 0, 1);

  const hepFlow = qf('SIN_RR') + qf('SIN_LL') + qf('CAUD') * 0;
  const portalIn = Math.max(0, qf('PRE_R')) + Math.max(0, qf('PRE_L'));
  const arterialIn = qf('A_HR') + qf('A_HL');

  const varE = eng.varix('VAR', P), varG = eng.varix('GV', P);
  const st = eng.starling();
  const asc = ascitesGrade(eng.slow.ascites);
  const co = (eng.COf ?? 83.3) * 0.06;
  const map = eng.MAPf;
  const ra = P[ni.RA];
  const bv = eng.bloodVolume();
  const lossPct = clamp((5000 + eng.blood.infused - bv) / 5000 * 100, -50, 100);
  const shock = eng.blood.lost > 0 ? (lossPct >= 40 ? 4 : lossPct >= 30 ? 3 : lossPct >= 15 ? 2 : 1) : 0;
  const hct = eng.hct();
  const heIdx = shuntFraction * (0.6 + 0.8 * p.cirrhosis);

  const cath = p.catheter;
  let measured = null;
  if (cath.vein) {
    const hvId = { R: 'RHV', M: 'MHV', L: 'LHV' }[cath.vein];
    measured = { vein: cath.vein, fhvp: P[ni[hvId]], wedged: cath.wedged, whvp: cath.wedged ? P[ni['W_' + cath.vein]] : null };
  }

  return {
    t: eng.t, day: eng.day,
    hvpg: hv.hvpg, whvp: hv.whvp, fhvp: hv.fhvp,
    measured,
    ppg: P[ni.CONF] - P[ni.IVCS],
    pv: P[ni.CONF],
    pvh: P[ni.PVH],
    sv: P[ni.SV],
    ra, ivc: P[ni.IVCS],
    pvFlow: qf('PV_TRUNK') * 0.06,
    pvVel: eng.velocity('PV_TRUNK'),
    pvPI: p.pulsatile ? eng.pi.value : null,
    hepaticFlow: hepFlow * 0.06,
    liverPerfPct: (hepFlow / eng.baseHepFlow) * 100,
    portalIn: portalIn * 0.06,
    arterialIn: arterialIn * 0.06,
    splanchnicIn: splIn * 0.06,
    shuntFraction,
    collateralFlows,
    varix: { ...varE, d: 2 * varE.r, grade: varixGrade(2 * varE.r), redWale: varE.ratio > 0.7 },
    gastricVarix: { ...varG, d: 2 * varG.r, grade: varixGrade(2 * varG.r), redWale: varG.ratio > 0.7 },
    ascites: { volume: eng.slow.ascites, ratePerDay: st.net * 1440, iap: eng.iap ?? 5, ...asc, highProtein: st.highProtein, hepLymph: st.hep, splLymph: st.spl, lymphCap: eng.slow.lymphCap },
    spleen: { length: eng.slow.spleen, platelets: clamp(250 * Math.pow(11 / eng.slow.spleen, 3), 25, 400) },
    map, co, hr: eng.hr, svr: (map - ra) / Math.max(0.5, co),
    heRisk: { index: heIdx, label: heIdx < 0.2 ? 'Low' : heIdx < 0.45 ? 'Moderate' : 'High' },
    blood: { volume: bv, lossPct, lost: eng.blood.lost, hct, hb: (hct * 100) / 3, shock },
    bleeding: eng.bleed.active ? { site: eng.bleed.site, rate: eng.Qbleed * 60, total: eng.bleed.total } : null,
    habr: eng.habr, baro: eng.baro,
    splTone: eng.slow.splTone,
  };
}
