// Event detectors with hysteresis (blueprint §10.3). Pure functions of engine state.

import { computeMetrics } from './metrics.js?v=1db0ad7ab0';

const COLLATERAL_NAMES = {
  C1b: ['Esophageal varices', 'VAR'], C3: ['Paraumbilical vein (caput medusae)', 'C3'], C4: ['Anorectal varices', 'C4'],
  C5: ['Gastrorenal shunt', 'C5'], C6: ['Splenorenal shunt', 'C6'], C7: ['Retroperitoneal collaterals', 'C7'],
  C8: ['Periportal cavernoma', 'C8'], C2: ['Short gastric veins → fundal varices', 'GV'],
};

function defs(m, eng) {
  const Qf = (id) => (eng.Qf ? eng.Qf[eng.ei[id]] : eng.Q[eng.ei[id]]);
  const occ = (id) => eng.occlusion(id) >= 0.99;
  const splIn = Math.max(1e-6, m.splanchnicIn / 0.06);
  const list = [
    { id: 'HEPATOFUGAL_PV', on: Qf('PV_TRUNK') < -0.3 && !occ('PV_TRUNK'), off: Qf('PV_TRUNK') > 0, severity: 'danger', anchor: 'PV_TRUNK',
      title: 'Hepatofugal flow in the portal vein', detail: 'Blood now leaves the liver through the portal vein toward the collaterals.' },
    { id: 'SV_REVERSAL', on: Qf('SV_CONF') < -0.2, off: Qf('SV_CONF') > 0, severity: 'caution', anchor: 'SV_CONF',
      title: 'Splenic vein flow reversed', detail: 'The splenic vein carries mesenteric blood away from the confluence into a shunt.' },
    { id: 'SMV_REVERSAL', on: Qf('SMV_CONF') < -0.2, off: Qf('SMV_CONF') > 0, severity: 'caution', anchor: 'SMV_CONF',
      title: 'SMV flow reversed', detail: 'Portal blood is draining retrograde into the mesenteric veins.' },
    { id: 'INTRAHEPATIC_REVERSAL', on: Qf('PRE_R') < -0.2 || Qf('PRE_L') < -0.2 || Qf('PVH_L') < -0.2, off: Qf('PRE_R') > 0 && Qf('PRE_L') > 0 && Qf('PVH_L') > 0,
      severity: 'info', anchor: 'LPV', title: 'Intrahepatic portal branches reversed', detail: 'Arterial blood entering the sinusoids escapes backward through portal branches (typical after TIPS).' },
    { id: 'PV_STASIS', on: Math.abs(m.pvVel) < 9 && !occ('PV_TRUNK'), off: Math.abs(m.pvVel) > 12, severity: 'caution', anchor: 'PV_TRUNK',
      title: 'Portal vein stasis', detail: 'Doppler velocity < 9 cm/s: stagnant flow raises the risk of portal vein thrombosis.' },
    { id: 'CSPH', on: m.hvpg >= 10, off: m.hvpg < 9.5, severity: 'caution', anchor: 'SIN_R',
      title: 'Clinically significant portal hypertension', detail: 'HVPG ≥ 10 mmHg (in cirrhosis): collaterals and varices can develop.' },
    { id: 'BLEED_RISK', on: m.hvpg >= 12, off: m.hvpg < 11.5, severity: 'caution', anchor: 'VAR',
      title: 'HVPG ≥ 12 mmHg', detail: 'Bleeding becomes more likely at higher gradients, but 12 is not a threshold: varices can bleed below it.' },
    { id: 'VARIX_LARGE', on: m.varix.d >= 5, off: m.varix.d < 4.5, severity: 'caution', anchor: 'VAR',
      title: 'Large esophageal varices', detail: 'Diameter ≥ 5 mm: high-risk varices.' },
    { id: 'RED_WALE', on: m.varix.ratioMean > 0.7, off: m.varix.ratioMean < 0.65, severity: 'danger', anchor: 'VAR',
      title: 'Red wale signs', detail: 'Modeled wall stress is approaching its rupture point (index = ΔP·r / w).' },
    { id: 'ASCITES_FORMING', on: m.ascites.ratePerDay > 80 && m.ascites.volume > 150, off: m.ascites.ratePerDay < -50, severity: 'caution', anchor: 'PERITONEUM',
      title: 'Ascites forming', detail: 'Filtration has overwhelmed lymphatic drainage.' },
    { id: 'TENSE_ASCITES', on: m.ascites.iap >= 12, off: m.ascites.iap < 11, severity: 'danger', anchor: 'PERITONEUM',
      title: 'Intra-abdominal hypertension', detail: 'IAP ≥ 12 mmHg compresses the IVC and raises variceal pressure.' },
    { id: 'HYPERDYNAMIC', on: m.co > 6.0 && m.svr < 14, off: m.co < 5.7 || m.svr > 15, severity: 'info', anchor: 'AO',
      title: 'Hyperdynamic circulation', detail: 'Splanchnic vasodilation: high cardiac output, low systemic resistance.' },
    { id: 'HIGH_SHUNT', on: m.shuntFraction > 0.5, off: m.shuntFraction < 0.45, severity: 'caution', anchor: 'TIPS',
      title: 'High portosystemic shunt fraction', detail: 'Much of the gut blood bypasses the liver: encephalopathy risk.' },
    { id: 'LIVER_HYPOPERFUSION', on: m.liverPerfPct < 60, off: m.liverPerfPct > 65, severity: 'caution', anchor: 'SIN_R',
      title: 'Liver hypoperfusion', detail: 'Total sinusoidal flow is below 60 % of normal.' },
    { id: 'CAUDATE', on: Qf('CAUD') > 3 * (eng.refQ ? eng.refQ[eng.ei.CAUD] : 0.8), off: Qf('CAUD') < 2.5 * (eng.refQ ? eng.refQ[eng.ei.CAUD] : 0.8), severity: 'info', anchor: 'CAUD',
      title: 'Caudate lobe carries the outflow', detail: 'Its own veins drain directly into the IVC: it is spared and hypertrophies.' },
    { id: 'RA_HIGH', on: m.ra > 10, off: m.ra < 9, severity: 'caution', anchor: 'RA',
      title: 'Elevated right atrial pressure', detail: 'Venous congestion is transmitted backward into the liver.' },
    { id: 'SPLENOMEGALY', on: m.spleen.length > 13, off: m.spleen.length < 12.7, severity: 'info', anchor: 'SPL',
      title: 'Splenomegaly', detail: 'Congested spleen sequesters platelets (hypersplenism).' },
    { id: 'SHOCK_2', on: m.blood.shock >= 2, off: m.blood.shock < 2, severity: 'danger', anchor: 'RA', title: 'Hemorrhagic shock class II', detail: '15–30 % blood volume lost.' },
    { id: 'SHOCK_3', on: m.blood.shock >= 3, off: m.blood.shock < 3, severity: 'critical', anchor: 'RA', title: 'Hemorrhagic shock class III', detail: '30–40 % blood volume lost.' },
  ];
  for (const [id, [name, anchor]] of Object.entries(COLLATERAL_NAMES)) {
    const f = id === 'C2' ? Math.max(0, Qf('C2')) : Math.max(0, Qf(id));
    list.push({ id: 'COLL_' + id, on: f / splIn > 0.05, off: f / splIn < 0.03, severity: 'info', anchor,
      title: `Collateral recruited: ${name}`, detail: `${((f / splIn) * 100).toFixed(0)} % of splanchnic inflow now takes this route.` });
  }
  return list;
}

// The readings an event compares, averaged over two breaths (8 s of model time): breathing and the heartbeat swing
// cardiac output, ascites filtration, IAP and the portal velocity across a cut-off several times a breath, which fired
// "Ascites forming" or "Hyperdynamic circulation" again every few seconds. The average starts over from the reading
// itself on a new day (the disease clock settles each day), a jump in the model's clock or a restored state; a paused
// model keeps it. (It lives outside the snapshot: a restored state starts it from its own reading.)
const TAU = 8;
const AVG = {
  co: [(m) => m.co, (s, v) => { s.co = v; }], svr: [(m) => m.svr, (s, v) => { s.svr = v; }], ra: [(m) => m.ra, (s, v) => { s.ra = v; }],
  hvpg: [(m) => m.hvpg, (s, v) => { s.hvpg = v; }], pvVel: [(m) => m.pvVel, (s, v) => { s.pvVel = v; }],
  perf: [(m) => m.liverPerfPct, (s, v) => { s.liverPerfPct = v; }], shunt: [(m) => m.shuntFraction, (s, v) => { s.shuntFraction = v; }],
  rate: [(m) => m.ascites.ratePerDay, (s, v) => { s.ascites.ratePerDay = v; }], iap: [(m) => m.ascites.iap, (s, v) => { s.ascites.iap = v; }],
};
function breathAveraged(m, eng, init) {
  const a = eng.evAvg, day = (eng.day || 0) + (eng.dayFrac || 0), dt = a ? eng.t - a.t : 0;
  const fresh = init || !a || a.day !== day || dt < 0 || dt > 30;
  const k = fresh ? 1 : Math.min(1, dt / TAU);
  const v = {};
  for (const [key, [get]] of Object.entries(AVG)) { const x = get(m); v[key] = fresh || !Number.isFinite(a.v[key]) ? x : a.v[key] + (x - a.v[key]) * k; }
  eng.evAvg = { t: eng.t, day, v };
  const s = { ...m, ascites: { ...m.ascites } };
  for (const [key, [, set]] of Object.entries(AVG)) if (Number.isFinite(v[key])) set(s, v[key]);
  return s;
}

// Hold: a condition must hold for this much model time before an event fires or clears. (It was three evaluations, which
// are frames: 0.3 s of model time at 1x, 2.4 s at 8x, and a few milliseconds during a slider drag, where every change
// posts a frame of its own. Model time is the same on every device and at every speed.)
const HOLD_S = 0.25;
export function detectEvents(eng, init = false) {
  const m = computeMetrics(eng);
  const day = (eng.day || 0) + (eng.dayFrac || 0);
  // How long the condition has held, in model seconds; the clock starts over on a new day, a restored state or a clock set back.
  const held = (s) => {
    if (s.since == null || s.sinceDay !== day || eng.t < s.since) { s.since = eng.t; s.sinceDay = day; return 0; }
    return eng.t - s.since;
  };
  for (const d of defs(breathAveraged(m, eng, init), eng)) {
    const s = eng.evState[d.id] || (eng.evState[d.id] = { active: false });
    if (!s.active && d.on) {
      if (init || held(s) >= HOLD_S) {
        s.active = true; s.since = null;
        if (!init) eng.pushEvent({ id: d.id, severity: d.severity, title: d.title, detail: d.detail, anchor: d.anchor });
      }
    } else if (s.active && d.off) {
      if (held(s) >= HOLD_S) { s.active = false; s.since = null; }
    } else s.since = null;
  }
  return m;
}

