// "Why?" causal trace (blueprint §9.3): leave-one-out attribution on the quasi-steady solver.
// Each factor that differs from the healthy state is reverted in isolation on a scratch engine;
// its contribution is (current − reverted). Contributions are approximate: they need not sum exactly.

import { Engine } from './engine.js?v=32c0c52424';
import { computeMetrics } from './metrics.js?v=665d045342';
import { defaultParams, DRUGS } from './scenario.js?v=5ce6f00fdc';
import { EDGES, COLLATERAL_DMIN_RATIO } from './topology.js?v=0c370bc4ec';

export const METRICS = {
  pv: { label: 'Portal pressure', unit: 'mmHg', get: (m) => m.pv, digits: 1 },
  hvpg: { label: 'HVPG', unit: 'mmHg', get: (m) => m.hvpg, digits: 1 },
  ppg: { label: 'Portosystemic gradient', unit: 'mmHg', get: (m) => m.ppg, digits: 1 },
  pvFlow: { label: 'Portal vein flow', unit: 'L/min', get: (m) => m.pvFlow, digits: 2 },
  liverPerf: { label: 'Liver perfusion', unit: '%', get: (m) => m.liverPerfPct, digits: 0 },
  shunt: { label: 'Shunt fraction', unit: '%', get: (m) => m.shuntFraction * 100, digits: 0 },
  varix: { label: 'Varix wall tension', unit: '% of rupture', get: (m) => m.varix.ratio * 100, digits: 0 },
  ascites: { label: 'Ascites formation', unit: 'mL/day', get: (m) => m.ascites.ratePerDay, digits: 0 },
  ra: { label: 'Right atrial pressure', unit: 'mmHg', get: (m) => m.ra, digits: 1 },
  map: { label: 'Mean arterial pressure', unit: 'mmHg', get: (m) => m.map, digits: 0 },
  co: { label: 'Cardiac output', unit: 'L/min', get: (m) => m.co, digits: 2 },
  spleen: { label: 'Spleen length', unit: 'cm', get: (m) => m.spleen.length, digits: 1 },
};

const edgeLabel = (id) => EDGES.find((e) => e.id === id)?.label || id;

/** Enumerate factors that differ from the healthy default, each with a revert function. */
function factors(eng) {
  const p = eng.params, d = defaultParams(), s = eng.slow;
  const out = [];
  const add = (label, revert, kind = 'param') => out.push({ label, revert, kind });
  if (p.cirrhosis > 0) add(`Cirrhosis (${Math.round(p.cirrhosis * 100)} %): sinusoidal fibrosis`, (e) => { e.params.cirrhosis = 0; });
  for (const lobe of ['R', 'L']) for (const z of ['pre', 'sin', 'post']) {
    if ((p.fibrosis[lobe][z] ?? 1) !== 1) add(`${{ pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' }[z]} fibrosis (${lobe === 'R' ? 'right' : 'left'} lobe ×${p.fibrosis[lobe][z].toFixed(0)})`, (e) => { e.params.fibrosis[lobe][z] = 1; });
  }
  for (const [id, v] of Object.entries(p.stenosis)) if (v > 0) add(`Stenosis of ${edgeLabel(id)} (${Math.round(v * 100)} %)`, (e) => { delete e.params.stenosis[id]; });
  for (const [id, v] of Object.entries(p.thrombus)) if (v > 0) add(`Thrombus in ${edgeLabel(id)} (${Math.round(v * 100)} %)`, (e) => { delete e.params.thrombus[id]; });
  if (p.splanchnicTone !== 1) add(p.splanchnicTone < 1 ? 'Splanchnic vasodilation (set)' : 'Splanchnic vasoconstriction (set)', (e) => { e.params.splanchnicTone = 1; });
  if (Math.abs(s.splTone - 1) > 0.01) add('Chronic splanchnic vasodilation (NO-mediated)', (e) => { e.slow.splTone = 1; });
  if (p.systemicTone !== 1) add('Systemic arteriolar tone', (e) => { e.params.systemicTone = 1; });
  if (p.contractility !== 1) add('Right-heart contractility', (e) => { e.params.contractility = 1; });
  if (p.tr > 0) add('Tricuspid regurgitation', (e) => { e.params.tr = 0; });
  if (p.pericardial > 0) add('Pericardial constraint', (e) => { e.params.pericardial = 0; });
  if (p.apShunt > 0) add('Arterioportal shunting', (e) => { e.params.apShunt = 0; });
  for (const [k, on] of Object.entries(p.drugs)) if (on) add(DRUGS[k].label, (e) => { e.params.drugs[k] = false; });
  if (p.tips.on) add(`TIPS (${p.tips.d} mm)`, (e) => { e.params.tips.on = false; });
  if (p.portocaval) add('Portocaval shunt', (e) => { e.params.portocaval = false; });
  if (p.dsrs) add('Distal splenorenal shunt', (e) => { e.params.dsrs = false; });
  if (p.mesocaval) add('Mesocaval shunt', (e) => { e.params.mesocaval = false; });
  if (p.balloonEso || p.balloonGas) add('Balloon tamponade', (e) => { e.params.balloonEso = false; e.params.balloonGas = false; });
  for (const id of Object.keys(p.occluded)) if (p.occluded[id]) add(`Occluded ${edgeLabel(id)}`, (e) => { delete e.params.occluded[id]; });
  if (p.albumin !== d.albumin) add(`Serum albumin ${p.albumin.toFixed(1)} g/dL`, (e) => { e.params.albumin = d.albumin; });
  const collOpen = EDGES.filter((e) => e.kind === 'collateral').some((e) => s.d[e.id] > e.dMax * COLLATERAL_DMIN_RATIO * 1.15);
  if (collOpen) add('Collateral network (portosystemic decompression)', (e) => {
    for (const x of EDGES) if (x.kind === 'collateral') e.slow.d[x.id] = x.dMax * COLLATERAL_DMIN_RATIO;
  }, 'slow');
  if (s.ascites > 200) add(`Ascites ${(s.ascites / 1000).toFixed(1)} L (intra-abdominal pressure)`, (e) => { e.slow.ascites = 0; }, 'slow');
  const dv = eng.bloodVolume() - 5000;
  if (Math.abs(dv) > 150) add(dv > 0 ? `Expanded blood volume (+${Math.round(dv)} mL)` : `Blood loss (${Math.round(dv)} mL)`, (e) => { e.addVolume(-dv, 0.42, true); }, 'slow');
  if (eng.bleed.active) add('Active bleeding', (e) => { e.bleed.active = false; }, 'slow');
  return out;
}

let healthy = null;
function healthyMetrics() {
  if (!healthy) healthy = computeMetrics(new Engine());
  return healthy;
}

export function explain(eng, metricId) {
  const def = METRICS[metricId];
  if (!def) return null;
  const snap = eng.snapshot();
  const scratch = new Engine({ params: snap.params });
  const at = (mutate) => {
    scratch.restore(snap);
    scratch.bleed.active = false; // attribution in quasi-steady state
    scratch.params.catheter = { vein: null, wedged: false };
    if (mutate) mutate(scratch);
    scratch.settleQuick(); scratch.settleQuick();
    return def.get(computeMetrics(scratch));
  };
  const current = at(null);
  const base = def.get(healthyMetrics());
  const contributions = [];
  for (const f of factors(eng)) {
    const reverted = at(f.revert);
    contributions.push({ label: f.label, delta: current - reverted, kind: f.kind });
  }
  contributions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const total = current - base;
  const sentence = buildSentence(def, current, base, contributions);
  return { metricId, label: def.label, unit: def.unit, digits: def.digits, current, base, total, contributions, sentence, formula: formula(eng, metricId) };
}

function fmt(v, d) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d); }

function buildSentence(def, cur, base, cs) {
  const d = def.digits;
  const diff = cur - base;
  let s = `${def.label} is ${cur.toFixed(d)} ${def.unit}`;
  if (Math.abs(diff) >= Math.pow(10, -d)) s += ` (${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(d)} vs. healthy)`;
  const sig = cs.filter((c) => Math.abs(c.delta) >= Math.max(Math.pow(10, -d), Math.abs(diff) * 0.05));
  if (!sig.length) return s + '. Nothing meaningful is pushing it away from normal.';
  const up = sig.filter((c) => Math.sign(c.delta) === Math.sign(diff || 1)).slice(0, 3);
  const off = sig.filter((c) => Math.sign(c.delta) !== Math.sign(diff || 1)).slice(0, 2);
  if (up.length) s += `, mainly because of ${up.map((c) => `${c.label.charAt(0).toLowerCase() + c.label.slice(1)} (${fmt(c.delta, d)})`).join(', ')}`;
  if (off.length) s += `. Offsetting: ${off.map((c) => `${c.label.charAt(0).toLowerCase() + c.label.slice(1)} (${fmt(c.delta, d)})`).join(', ')}`;
  return s + '.';
}

function formula(eng, id) {
  const P = eng.P, ni = eng.ni, Q = eng.Q, ei = eng.ei;
  const wu = (dp, q) => (q > 1e-6 ? dp / (q * 0.06) : Infinity);
  if (id === 'pv' || id === 'hvpg' || id === 'ppg') {
    const q = Q[ei.SIN_RR] + Q[ei.SIN_LL];
    const dp = P[ni.CONF] - P[ni.RHV];
    return `ΔP(portal → hepatic vein) = Q × R = ${(q * 0.06).toFixed(2)} L/min × ${wu(dp, q).toFixed(1)} WU = ${dp.toFixed(1)} mmHg  (healthy R ≈ 2.5 WU)`;
  }
  if (id === 'varix') {
    const v = eng.varix('VAR');
    return `Laplace: T = ΔP·r / w = ${v.ptm.toFixed(1)} mmHg × ${v.r.toFixed(2)} mm / ${v.w.toFixed(2)} mm = ${v.T.toFixed(0)}  (rupture ≈ ${(v.T / v.ratio).toFixed(0)})`;
  }
  if (id === 'ascites') {
    const f = eng.flows;
    return `Ascites = filtration (liver ${f.hep.toFixed(1)} + gut ${f.spl.toFixed(1)} mL/min) − lymph capacity ${eng.slow.lymphCap.toFixed(1)} − reabsorption ${f.reabs.toFixed(2)} mL/min`;
  }
  if (id === 'map') return `MAP = CO × SVR + RA = ${(eng.COf * 0.06).toFixed(2)} L/min × ${((eng.MAPf - P[ni.RA]) / (eng.COf * 0.06)).toFixed(1)} WU + ${P[ni.RA].toFixed(1)}`;
  if (id === 'shunt' || id === 'pvFlow' || id === 'liverPerf') return 'Parallel paths: flow divides in inverse proportion to resistance (liver vs. collaterals/shunts).';
  return '';
}
