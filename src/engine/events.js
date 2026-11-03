// Event detectors with hysteresis (blueprint §10.3). Pure functions of engine state.

import { computeMetrics } from './metrics.js';
import { FLOW_CUTS } from './flow-cuts.js';
import { HVPG_CUTS } from './pressure-cuts.js';

const COLLATERAL_NAMES = {
  C1b: ['Esophageal varices', 'VAR'], C3: ['Paraumbilical vein (caput medusae)', 'C3'], C4: ['Anorectal varices', 'C4'],
  C5: ['Gastrorenal shunt', 'C5'], C6: ['Splenorenal shunt', 'C6'], C7: ['Retroperitoneal collaterals', 'C7'],
  C8: ['Periportal cavernoma', 'C8'], C2: ['Short gastric veins → fundal varices', 'GV'],
};

// The conditions, built once (the worker runs this every frame: nothing here is made per call). Each has on(m, eng, splIn)
// and off(m, eng, splIn); only the one its state needs is read.
const Qf = (eng, id) => (eng.Qf ? eng.Qf[eng.ei[id]] : eng.Q[eng.ei[id]]);
const occ = (eng, id) => eng.occlusion(id) >= 0.99;
const caudRef = (eng) => (eng.refQ ? eng.refQ[eng.ei.CAUD] : 0.8);
const DEFS = [
  { id: 'HEPATOFUGAL_PV', on: (m, e) => Qf(e, 'PV_TRUNK') < -0.3 && !occ(e, 'PV_TRUNK'), off: (m, e) => Qf(e, 'PV_TRUNK') > 0, severity: 'danger', anchor: 'PV_TRUNK',
    title: 'Hepatofugal flow in the portal vein', detail: 'Blood now leaves the liver through the portal vein toward the collaterals.' },
  { id: 'SV_REVERSAL', on: (m, e) => Qf(e, 'SV_CONF') < -0.2, off: (m, e) => Qf(e, 'SV_CONF') > 0, severity: 'caution', anchor: 'SV_CONF',
    title: 'Splenic vein flow reversed', detail: 'The splenic vein carries mesenteric blood away from the confluence into a shunt.' },
  { id: 'SMV_REVERSAL', on: (m, e) => Qf(e, 'SMV_CONF') < -0.2, off: (m, e) => Qf(e, 'SMV_CONF') > 0, severity: 'caution', anchor: 'SMV_CONF',
    title: 'SMV flow reversed', detail: 'Portal blood is draining retrograde into the mesenteric veins.' },
  { id: 'INTRAHEPATIC_REVERSAL', on: (m, e) => Qf(e, 'PRE_R') < -0.2 || Qf(e, 'PRE_L') < -0.2 || Qf(e, 'PVH_L') < -0.2, off: (m, e) => Qf(e, 'PRE_R') > 0 && Qf(e, 'PRE_L') > 0 && Qf(e, 'PVH_L') > 0,
    severity: 'info', anchor: 'LPV', title: 'Intrahepatic portal branches reversed', detail: 'Arterial blood entering the sinusoids escapes backward through portal branches (typical after TIPS).' },
  { id: 'PV_STASIS', on: (m, e) => Math.abs(m.pvVel) < FLOW_CUTS.stasis && !occ(e, 'PV_TRUNK'), off: (m) => Math.abs(m.pvVel) > FLOW_CUTS.stasisOff, severity: 'caution', anchor: 'PV_TRUNK',
    title: 'Portal vein stasis', detail: 'Doppler velocity below 9 cm/s: stagnant flow raises the risk of portal vein thrombosis.' },
  { id: 'CSPH', on: (m) => m.hvpg >= HVPG_CUTS.red, off: (m) => m.hvpg < HVPG_CUTS.red - 0.5, severity: 'danger', anchor: 'SIN_R',
    title: 'Clinically significant portal hypertension', detail: 'HVPG ≥ 10 mmHg (in cirrhosis): collaterals and varices can develop.' },
  { id: 'BLEED_RISK', on: (m) => m.hvpg >= HVPG_CUTS.bleed, off: (m) => m.hvpg < HVPG_CUTS.bleed - 0.5, severity: 'danger', anchor: 'VAR',
    title: 'Bleeding more likely', detail: 'HVPG ≥ 12 mmHg. The risk rises with the gradient, but 12 is not a threshold: varices can bleed below it.' },
  { id: 'VARIX_LARGE', on: (m) => m.varix.d >= 5, off: (m) => m.varix.d < 4.5, severity: 'caution', anchor: 'VAR',
    title: 'Large esophageal varices', detail: 'Diameter ≥ 5 mm: high-risk varices.' },
  { id: 'RED_WALE', on: (m) => m.varix.ratioMean > 0.7, off: (m) => m.varix.ratioMean < 0.65, severity: 'danger', anchor: 'VAR',
    title: 'Red wale signs', detail: 'Modeled wall stress is approaching its rupture point (index = ΔP·r / w).' },
  { id: 'ASCITES_FORMING', on: (m) => m.ascites.ratePerDay > 80 && m.ascites.volume > 150, off: (m) => m.ascites.ratePerDay < -50, severity: 'caution', anchor: 'PERITONEUM',
    title: 'Ascites forming', detail: 'Filtration has overwhelmed lymphatic drainage.' },
  { id: 'TENSE_ASCITES', on: (m) => m.ascites.iap >= 12, off: (m) => m.ascites.iap < 11, severity: 'danger', anchor: 'PERITONEUM',
    title: 'Intra-abdominal hypertension', detail: 'IAP ≥ 12 mmHg compresses the IVC and raises variceal pressure.' },
  { id: 'HYPERDYNAMIC', on: (m) => m.co > 6.0 && m.svr < 14, off: (m) => m.co < 5.7 || m.svr > 15, severity: 'info', anchor: 'AO',
    title: 'Hyperdynamic circulation', detail: 'Splanchnic vasodilation: high cardiac output, low systemic resistance.' },
  { id: 'HIGH_SHUNT', on: (m) => m.shuntFraction > 0.5, off: (m) => m.shuntFraction < 0.45, severity: 'caution', anchor: 'TIPS',
    title: 'High portosystemic shunt fraction', detail: 'Much of the gut blood bypasses the liver: encephalopathy risk.' },
  { id: 'LIVER_HYPOPERFUSION', on: (m) => m.liverPerfPct < 60, off: (m) => m.liverPerfPct > 65, severity: 'caution', anchor: 'SIN_R',
    title: 'Liver hypoperfusion', detail: 'Total sinusoidal flow is below 60% of normal.' },
  { id: 'CAUDATE', on: (m, e) => Qf(e, 'CAUD') > 3 * caudRef(e), off: (m, e) => Qf(e, 'CAUD') < 2.5 * caudRef(e), severity: 'info', anchor: 'CAUD',
    title: 'Caudate lobe carries the outflow', detail: 'Its own veins drain directly into the IVC: it is spared and hypertrophies.' },
  { id: 'RA_HIGH', on: (m) => m.ra > 10, off: (m) => m.ra < 9, severity: 'caution', anchor: 'RA',
    title: 'Elevated right atrial pressure', detail: 'Venous congestion is transmitted backward into the liver.' },
  { id: 'SPLENOMEGALY', on: (m) => m.spleen.length > 13, off: (m) => m.spleen.length < 12.7, severity: 'info', anchor: 'SPL',
    title: 'Splenomegaly', detail: 'Congested spleen sequesters platelets (hypersplenism).' },
  { id: 'SHOCK_2', on: (m) => m.blood.shock >= 2, off: (m) => m.blood.shock < 2, severity: 'danger', anchor: 'RA', title: 'Hemorrhagic shock class II', detail: '15–30% blood volume lost.' },
  { id: 'SHOCK_3', on: (m) => m.blood.shock >= 3, off: (m) => m.blood.shock < 3, severity: 'critical', anchor: 'RA', title: 'Hemorrhagic shock class III', detail: '30–40% blood volume lost.' },
];
// (A collateral's share of the splanchnic inflow; its sentence is made only when the event fires.)
const collShare = (e, id, splIn) => Math.max(0, Qf(e, id)) / splIn;
// alloc-rare: only when a collateral event fires (a share crossed its cut and held), never per frame
const collDetail = (e, id, splIn) => `${(collShare(e, id, splIn) * 100).toFixed(0)}% of splanchnic inflow now takes this route.`;
for (const id of Object.keys(COLLATERAL_NAMES)) {
  const [name, anchor] = COLLATERAL_NAMES[id];
  DEFS.push({ id: 'COLL_' + id, coll: id, on: (m, e, splIn) => collShare(e, id, splIn) > 0.05, off: (m, e, splIn) => collShare(e, id, splIn) < 0.03, severity: 'info', anchor,
    title: `Collateral recruited: ${name}`, detail: null });
}

// The readings an event compares, averaged over two breaths (8 s of model time): breathing and the heartbeat swing
// cardiac output, ascites filtration, IAP and the portal velocity across a cut-off several times a breath, which fired
// "Ascites forming" or "Hyperdynamic circulation" again every few seconds. The average starts over from the reading
// itself on a new day (the disease clock settles each day), a jump in the model's clock or a restored state; a paused
// model keeps it. (It lives outside the snapshot: a restored state starts it from its own reading.)
// The averaged readings are written into one kept view (VIEW), which the conditions read in place of the metrics (the
// metrics' own fields for everything not averaged). It is used inside one detectEvents call and kept by no one.
const TAU = 8;
const VIEW = { co: 0, svr: 0, ra: 0, hvpg: 0, pvVel: 0, liverPerfPct: 0, shuntFraction: 0, splanchnicIn: 0, varix: null, spleen: null, blood: null,
  ascites: { ratePerDay: 0, volume: 0, iap: 0 } };
const avg = (v, key, x, fresh, k) => { const p = v[key]; return fresh || !Number.isFinite(p) ? x : p + (x - p) * k; };
function breathAveraged(m, eng, init) {
  let a = eng.evAvg;
  const day = (eng.day || 0) + (eng.dayFrac || 0), dt = a ? eng.t - a.t : 0;
  const fresh = init || !a || a.day !== day || dt < 0 || dt > 30;
  const k = fresh ? 1 : Math.min(1, dt / TAU);
  // (The average object is kept and written in place; it is made only when the average starts over.)
  // alloc-rare: only when the average starts over (a new engine, a reset or a restored state clears evAvg)
  if (!a) a = eng.evAvg = { t: 0, day: 0, v: { co: 0, svr: 0, ra: 0, hvpg: 0, pvVel: 0, perf: 0, shunt: 0, rate: 0, iap: 0 } };
  const v = a.v, A = m.ascites;
  const co = avg(v, 'co', m.co, fresh, k), svr = avg(v, 'svr', m.svr, fresh, k), ra = avg(v, 'ra', m.ra, fresh, k);
  const hvpg = avg(v, 'hvpg', m.hvpg, fresh, k), pvVel = avg(v, 'pvVel', m.pvVel, fresh, k), perf = avg(v, 'perf', m.liverPerfPct, fresh, k);
  const shunt = avg(v, 'shunt', m.shuntFraction, fresh, k), rate = avg(v, 'rate', A.ratePerDay, fresh, k), iap = avg(v, 'iap', A.iap, fresh, k);
  v.co = co; v.svr = svr; v.ra = ra; v.hvpg = hvpg; v.pvVel = pvVel; v.perf = perf; v.shunt = shunt; v.rate = rate; v.iap = iap;
  a.t = eng.t; a.day = day;
  const s = VIEW, sa = s.ascites;
  s.co = Number.isFinite(co) ? co : m.co; s.svr = Number.isFinite(svr) ? svr : m.svr; s.ra = Number.isFinite(ra) ? ra : m.ra;
  s.hvpg = Number.isFinite(hvpg) ? hvpg : m.hvpg; s.pvVel = Number.isFinite(pvVel) ? pvVel : m.pvVel;
  s.liverPerfPct = Number.isFinite(perf) ? perf : m.liverPerfPct; s.shuntFraction = Number.isFinite(shunt) ? shunt : m.shuntFraction;
  sa.ratePerDay = Number.isFinite(rate) ? rate : A.ratePerDay; sa.iap = Number.isFinite(iap) ? iap : A.iap; sa.volume = A.volume;
  s.splanchnicIn = m.splanchnicIn; s.varix = m.varix; s.spleen = m.spleen; s.blood = m.blood;
  return s;
}

// Hold: a condition must hold for this much model time before an event fires or clears. (It was three evaluations, which
// are frames: 0.3 s of model time at 1x, 2.4 s at 8x, and a few milliseconds during a slider drag, where every change
// posts a frame of its own. Model time is the same on every device and at every speed.)
const HOLD_S = 0.25;
// How long the condition has held, in model seconds; the clock starts over on a new day, a restored state or a clock set back.
function held(s, eng, day) {
  if (s.since == null || s.sinceDay !== day || eng.t < s.since) { s.since = eng.t; s.sinceDay = day; return 0; }
  return eng.t - s.since;
}
// (Each engine's metrics record, written in place by every call and kept by no one: the worker posts the frame it is in (cloned) before the
// next call, and nothing else keeps it. A reader that wants a record of its own calls computeMetrics(eng) with none.)
const RECS = new WeakMap();
export function detectEvents(eng, init = false) {
  let rec = RECS.get(eng);
  if (!rec) RECS.set(eng, rec = {});   // alloc-rare: once per engine
  const m = computeMetrics(eng, rec);
  const day = (eng.day || 0) + (eng.dayFrac || 0);
  const v = breathAveraged(m, eng, init), splIn = Math.max(1e-6, m.splanchnicIn / 0.06), states = eng.evState;
  for (let i = 0; i < DEFS.length; i++) {
    const d = DEFS[i];
    // alloc-rare: only the first time a condition is seen (and after a reset or a restored state, which clear evState)
    const s = states[d.id] || (states[d.id] = { active: false });
    if (!s.active) {
      if (d.on(v, eng, splIn)) {
        if (init || held(s, eng, day) >= HOLD_S) {
          s.active = true; s.since = null;
          // alloc-rare: only when an event fires (a condition crossed its cut and held), never per frame
          if (!init) eng.pushEvent({ id: d.id, severity: d.severity, title: d.title, detail: d.detail !== null ? d.detail : collDetail(eng, d.coll, splIn), anchor: d.anchor });
        }
      } else s.since = null;
    } else if (d.off(v, eng, splIn)) {
      if (held(s, eng, day) >= HOLD_S) { s.active = false; s.since = null; }
    } else s.since = null;
  }
  return m;
}
