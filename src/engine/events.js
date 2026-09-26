// Event detectors with hysteresis (blueprint §10.3). Pure functions of engine state.

import { computeMetrics } from './metrics.js?v=1ac11c1460';

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
    { id: 'PV_STASIS', on: Math.abs(m.pvVel) < 5 && !occ('PV_TRUNK'), off: Math.abs(m.pvVel) > 7, severity: 'caution', anchor: 'PV_TRUNK',
      title: 'Portal vein stasis', detail: 'Mean velocity < 5 cm/s: stagnant flow raises the risk of portal vein thrombosis.' },
    { id: 'CSPH', on: m.hvpg >= 10, off: m.hvpg < 9.5, severity: 'caution', anchor: 'SIN_R',
      title: 'Clinically significant portal hypertension', detail: 'HVPG ≥ 10 mmHg: collaterals and varices can develop.' },
    { id: 'BLEED_RISK', on: m.hvpg >= 12, off: m.hvpg < 11.5, severity: 'danger', anchor: 'VAR',
      title: 'HVPG ≥ 12 mmHg', detail: 'Above this gradient, varices can bleed.' },
    { id: 'VARIX_LARGE', on: m.varix.d >= 5, off: m.varix.d < 4.5, severity: 'caution', anchor: 'VAR',
      title: 'Large esophageal varices', detail: 'Diameter ≥ 5 mm: high-risk varices.' },
    { id: 'RED_WALE', on: m.varix.ratio > 0.7, off: m.varix.ratio < 0.65, severity: 'danger', anchor: 'VAR',
      title: 'Red wale signs', detail: 'Wall tension is approaching rupture (Laplace: T = ΔP·r / w).' },
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

export function detectEvents(eng, init = false) {
  const m = computeMetrics(eng);
  for (const d of defs(m, eng)) {
    const s = eng.evState[d.id] || (eng.evState[d.id] = { active: false });
    // Hold: the condition must persist for 3 consecutive evaluations before firing or clearing.
    if (!s.active && d.on) {
      s.n = (s.n || 0) + 1;
      if (init || s.n >= 3) {
        s.active = true; s.n = 0;
        if (!init) eng.pushEvent({ id: d.id, severity: d.severity, title: d.title, detail: d.detail, anchor: d.anchor });
      }
    } else if (s.active && d.off) {
      s.n = (s.n || 0) + 1;
      if (s.n >= 3) { s.active = false; s.n = 0; }
    } else s.n = 0;
  }
  return m;
}

export function activeEvents(eng) {
  return Object.entries(eng.evState).filter(([, s]) => s.active).map(([id]) => id);
}
