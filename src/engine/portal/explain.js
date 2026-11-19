// "Why?" causal trace (blueprint §9.3): leave-one-out attribution on the quasi-steady solver.
// Each factor that differs from the healthy state is reverted in isolation on a scratch engine;
// its contribution is (current − reverted). Contributions are approximate: they need not sum exactly.

import { lcFirst } from './lc-first.js';
import { HVPG_CUTS, PPG_CUTS } from './pressure-cuts.js';
import { Engine } from './engine.js';
import { computeMetrics } from './metrics.js';
import { defaultParams, DRUGS } from './scenario.js';
import { EDGES, NODES, dMinOf } from './topology.js';
import { whyTarget } from './explain-ids.js';
import { healthyAtBedside } from './bedside-rest.js';
import { wallRead, wallShare } from './wall-read.js';

export const METRICS = {
  pv: { label: 'Portal pressure', unit: 'mmHg', get: (m) => m.pv, digits: 1 },
  hvpg: { label: 'HVPG', unit: 'mmHg', get: (m) => m.hvpg, digits: 1 },
  ppg: { label: 'PPG (PV − IVC)', unit: 'mmHg', get: (m) => m.ppg, digits: 1 },
  pvFlow: { label: 'Portal vein flow', unit: 'L/min', get: (m) => m.pvFlow, digits: 2 },
  liverPerf: { label: 'Liver perfusion', unit: '%', get: (m) => m.liverPerfPct, digits: 0 },
  sinFlow: { label: 'Sinusoidal flow', unit: '% of normal', get: (m) => m.liverPerfPct, digits: 0 },
  portalIn: { label: 'Portal inflow to the liver', unit: '% of normal', get: (m, _e, hm = healthyMetrics()) => (m.pvFlow / hm.pvFlow) * 100, digits: 0 },
  artIn: { label: 'Hepatic artery inflow', unit: '% of normal', get: (m, _e, hm = healthyMetrics()) => (m.arterialIn / hm.arterialIn) * 100, digits: 0 },
  hepLymph: { label: 'Hepatic lymph', unit: 'mL/min', get: (m) => m.ascites.hepLymph, digits: 1 },
  hb: { label: 'Hemoglobin', unit: 'g/dL', get: (m) => m.blood.hb, digits: 1 },
  hr: { label: 'Heart rate', unit: '/min', get: (m) => m.hr, digits: 0 },
  shunt: { label: 'Shunt fraction', unit: '%', get: (m) => m.shuntFraction * 100, digits: 0 },
  varix: { label: 'Varix wall stress (model)', unit: '% of rupture threshold', get: (m) => wallShare(m.varix) * 100, digits: 0 },
  ascites: { label: 'Ascites formation', unit: 'mL/day', get: (m) => m.ascites.ratePerDay, digits: 0 },
  ra: { label: 'Right atrial pressure', unit: 'mmHg', get: (m) => m.ra, digits: 1 },
  map: { label: 'Mean arterial pressure', unit: 'mmHg', get: (m) => m.map, digits: 0 },
  rpp: { label: 'Abdominal perfusion pressure (MAP − IAP)', unit: 'mmHg', get: (m) => m.rpp, digits: 0 },
  co: { label: 'Cardiac output', unit: 'L/min', get: (m) => m.co, digits: 2 },
  spleen: { label: 'Spleen length', unit: 'cm', get: (m) => m.spleen.length, digits: 1 },
};

const edgeLabel = (id) => EDGES.find((e) => e.id === id)?.label || id;

// A vessel's own flow (L/min) and a compartment's own pressure (mmHg), asked as `edge:<id>` and `node:<id>` (explain-ids.js): the vessel's panel and card
// explain the vessel, whichever vessel it is. The value is read off the engine each reading is made from (a settled copy), so the leave-one-out
// differences are the vessel's own.
const SLOW_FLOW = 0.1;   // (L/min: under this a flow reads to three places, as a collateral's does)
const metricOf = (metric) => {
  if (METRICS[metric]) return METRICS[metric];
  const t = whyTarget(metric);
  if (!t) return null;
  if (t.kind === 'edge') {
    const e = EDGES.find((x) => x.id === t.id);
    if (!e || e.kind === 'wedge') return null;   // (the catheter's wedge pieces: no vessel anyone selects, no name)
    const ref = flowOf(healthyOf(false).eng, e);
    return { label: `${e.label} flow`, unit: 'L/min', get: (m, en) => flowOf(en, e), digits: Math.abs(ref) < SLOW_FLOW ? 3 : 2, edge: e };
  }
  const n = NODES.find((x) => x.id === t.id);
  if (!n) return null;
  return { label: `${n.label} pressure`, unit: 'mmHg', get: (m, en) => pressOf(en, n), digits: 1, node: n };
};

/** Enumerate factors that differ from the healthy default, each with a revert function. Each has a short `label` for its
 * bar ("Cirrhosis 85%") and a `say` for the sentence, which reads aloud without nested brackets ("the cirrhosis"). */
function factors(eng, metricId) {
  const p = eng.params, d = defaultParams(), s = eng.slow;
  const out = [];
  const add = (label, say, revert, kind = 'param') => out.push({ label, say, revert, kind });
  const lc = lcFirst;
  if (p.cirrhosis > 0) add(`Cirrhosis ${Math.round(p.cirrhosis * 100)}%`, 'the cirrhosis', (e) => { e.params.cirrhosis = 0; });
  for (const lobe of ['R', 'L']) for (const z of ['pre', 'sin', 'post']) {
    if ((p.fibrosis[lobe][z] ?? 1) !== 1) {
      const zone = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' }[z], side = lobe === 'R' ? 'right' : 'left';
      add(`${zone} fibrosis, ${side} lobe ×${p.fibrosis[lobe][z].toFixed(0)}`, `${lc(zone)} fibrosis in the ${side} lobe`, (e) => { e.params.fibrosis[lobe][z] = 1; });
    }
  }
  for (const [id, v] of Object.entries(p.stenosis)) if (v > 0) add(`Stenosis of ${edgeLabel(id)} ${Math.round(v * 100)}%`, `the narrowed ${lc(edgeLabel(id))}`, (e) => { delete e.params.stenosis[id]; });
  for (const [id, v] of Object.entries(p.thrombus)) if (v > 0) add(`Clot in ${edgeLabel(id)} ${Math.round(v * 100)}%`, `the thrombus in the ${lc(edgeLabel(id))}`, (e) => { delete e.params.thrombus[id]; });
  if (p.splenicRx) add(p.splenicRx === 2 ? 'Splenectomy' : 'Partial splenic embolization', p.splenicRx === 2 ? 'the splenectomy' : 'the partial splenic embolization', (e) => { e.params.splenicRx = 0; });
  if (p.splanchnicTone !== 1) add(p.splanchnicTone < 1 ? 'Splanchnic vasodilation, set' : 'Splanchnic vasoconstriction, set', p.splanchnicTone < 1 ? 'the splanchnic vasodilation you set' : 'the splanchnic vasoconstriction you set', (e) => { e.params.splanchnicTone = 1; });
  if (p.meal > 0) add('Splanchnic vasodilation after a meal', 'the meal', (e) => { e.params.meal = 0; });
  if (Math.abs(s.splTone - 1) > 0.01) add('Chronic splanchnic vasodilation', 'the chronic splanchnic vasodilation', (e) => { e.slow.splTone = 1; });
  if (p.systemicTone !== 1) add('Systemic arteriolar tone', 'the systemic arteriolar tone', (e) => { e.params.systemicTone = 1; });
  if (p.contractility !== 1) add('Right-heart contractility', 'the right-heart contractility', (e) => { e.params.contractility = 1; });
  if (p.tr > 0) add('Tricuspid regurgitation', 'the tricuspid regurgitation', (e) => { e.params.tr = 0; });
  if (p.pericardial > 0) add('Pericardial constraint', 'the pericardial constraint', (e) => { e.params.pericardial = 0; });
  if (p.gestation > 0) add(`Pregnancy ${Math.round(p.gestation)} weeks`, 'the pregnancy', (e) => { e.params.gestation = 0; });
  if (p.apShunt > 0) add('Arterioportal shunting', 'the arterioportal shunting', (e) => { e.params.apShunt = 0; });
  for (const [k, on] of Object.entries(p.drugs)) if (on) add(DRUGS[k].label, lc(DRUGS[k].label), (e) => { e.params.drugs[k] = false; });
  if (p.tips.on) add(`TIPS ${p.tips.d} mm`, 'the TIPS', (e) => { e.params.tips.on = false; });
  if (p.dips.on) add(`DIPS ${p.dips.d} mm`, 'the DIPS', (e) => { e.params.dips.on = false; });
  if (p.portocaval) add('Portocaval shunt', 'the portocaval shunt', (e) => { e.params.portocaval = false; });
  if (p.dsrs) add('Distal splenorenal shunt', 'the distal splenorenal shunt', (e) => { e.params.dsrs = false; });
  if (p.mesocaval) add('Mesocaval shunt', 'the mesocaval shunt', (e) => { e.params.mesocaval = false; });
  if (p.rex) add('Meso-Rex bypass', 'the Meso-Rex bypass', (e) => { e.params.rex = false; });
  if (p.balloonEso || p.balloonGas) add('Balloon tamponade', 'the balloon tamponade', (e) => { e.params.balloonEso = false; e.params.balloonGas = false; });
  for (const id of Object.keys(p.occluded)) if (p.occluded[id]) add(`Occluded ${edgeLabel(id)}`, `the occluded ${lc(edgeLabel(id))}`, (e) => { delete e.params.occluded[id]; });
  if (p.albumin !== d.albumin) add(`Serum albumin ${p.albumin.toFixed(1)} g/dL`, `the serum albumin of ${p.albumin.toFixed(1)} g/dL`, (e) => { e.params.albumin = d.albumin; });
  const collOpen = EDGES.filter((e) => e.kind === 'collateral').some((e) => s.d[e.id] > dMinOf(e) * 1.15);
  if (collOpen) add('Collaterals', 'the collaterals', (e) => {
    for (const x of EDGES) if (x.kind === 'collateral') e.slow.d[x.id] = dMinOf(x);
  }, 'slow');
  if (s.ascites > 200) add(`Ascites ${(s.ascites / 1000).toFixed(1)} L`, 'the intra-abdominal pressure from the ascites', (e) => { e.slow.ascites = 0; }, 'slow');
  const dv = eng.bloodVolume() - 5000 - (eng.blood.preg || 0);   // (the pregnancy's own volume goes with the pregnancy)
  // Hemoglobin is red cells over blood volume, so for it the red cells lost or given and the plasma that followed are one
  // change: reverted together, the bars add up to the whole difference instead of two large halves that cancel.
  // (A healthy red cell mass, engine.js BLOOD_BASE × HCT_BASE, plus the red cells in the pregnancy's own volume, added at
  // HCT_BASE × 0.7.)
  const rbc0 = 5000 * 0.42 + (eng.blood.preg || 0) * 0.42 * 0.7, drbc = eng.blood.rbc - rbc0;
  if (metricId === 'hb') {
    if (Math.abs(drbc) > rbc0 * 0.02 || Math.abs(dv) > 150) {
      // Named for what moved it: a bleed, extra plasma that dilutes the red cells, or red cells given.
      const thinner = drbc / rbc0 < dv / 5000;
      const [label, say] = eng.blood.lost > 50 ? ['Blood loss', 'the blood loss'] : thinner ? (dv > 0 ? ['Extra plasma volume', 'the extra plasma volume'] : ['Fewer red cells', 'fewer red cells'])
        : drbc > 0 ? ['Transfused red cells', 'the transfused red cells'] : ['Smaller plasma volume', 'the smaller plasma volume'];
      add(label, say, (e) => { e.addVolume(-dv, 0, true); e.blood.rbc = rbc0; }, 'slow');
    }
    // The anemia of the disease itself (engine.js RED): a marrow that keeps less than a healthy red cell mass, with the spleen holding
    // and breaking down more of it.
    if (eng.marrow() < 0.98) {
      const liver = eng.params.cirrhosis > 0.1;
      add(liver ? 'Anemia of liver disease' : 'Large spleen', liver ? 'the anemia of liver disease' : 'the large spleen', (e) => { e.slow.marrow = 1; }, 'slow');
    }
  } else if (Math.abs(dv) > 150) add(dv > 0 ? `Extra blood volume +${Math.round(dv)} mL` : `Blood loss ${Math.round(-dv)} mL`, dv > 0 ? 'the extra blood volume' : 'the blood loss', (e) => { e.addVolume(-dv, 0.42, true); }, 'slow');
  if (eng.bleed.active) add('Active bleeding', 'the active bleeding', (e) => { e.bleed.active = false; }, 'slow');
  return out;
}

// The healthy patient the reading is compared with, in the state the reading is made in. A model at the bedside (its shown means running) is compared
// with the healthy model at the bedside (bedside-rest.js: it sits a little above the settled one, the portal pressure by 0.3 mmHg); a settled copy (a
// test, a scratch engine) with the settled healthy model, so each says "above healthy" only for what the patient adds.
let healthyEng = null, healthyMet = null;
const isLive = (eng) => !!eng._dm?.seeded;
function healthyOf(live) {
  if (live) { const h = healthyAtBedside().eng; return { eng: h, met: computeMetrics(h) }; }
  if (!healthyEng) { healthyEng = new Engine(); healthyMet = computeMetrics(healthyEng); }
  return { eng: healthyEng, met: healthyMet };
}
const healthyMetrics = () => healthyOf(false).met;   // (the settled healthy metrics: artIn and portalIn read it for their own 100%)
// The shown flow of a vessel (L/min) and pressure of a compartment, as the engine has them (the means at the bedside, the steady values of a settled copy).
const flowOf = (en, e) => (en.Qf ?? en.Q)[en.ei[e.id]] * 0.06;
const pressOf = (en, n) => (en.Pf ?? en.P)[en.ni[n.id]];

export function explain(eng, metricId) {
  const def = metricOf(metricId);
  if (!def) return null;
  const live = isLive(eng), hv = healthyOf(live);
  const snap = eng.snapshot();
  const scratch = new Engine({ params: snap.params });
  const at = (mutate) => {
    scratch.restore(snap);
    scratch.bleed.active = false; // attribution in quasi-steady state
    scratch.params.catheter = { vein: null, wedged: false };
    if (mutate) mutate(scratch);
    scratch.settleQuick(); scratch.settleQuick();
    return def.get(computeMetrics(scratch), scratch, hv.met);
  };
  // What the sentence and its line are read from: the model as it stands (the means a bedside shows: the number on the tile above the card), or, for a
  // settled copy, that copy as it settles for the patient as he is, before a factor is reverted on it. Never the model's instant, whose beat and breath would
  // print another portal pressure and resistance than the sentence beside it.
  const current = live ? def.get(computeMetrics(eng), eng, hv.met) : at(null);
  const view = live ? eng : scratch;
  const now = computeMetrics(view);
  const note = def.edge ? edgeNote(view, def.edge) : '';
  const line = def.edge ? edgeFormula(view, def.edge, hv.eng) : def.node ? '' : formula(SETTLED_FORMULA.has(metricId) ? view : eng, metricId, now, hv.eng);
  const base = def.get(hv.met, hv.eng, hv.met);
  const contributions = [];
  for (const f of factors(eng, metricId)) {
    const reverted = at(f.revert);
    contributions.push({ label: f.label, say: f.say, delta: current - reverted, kind: f.kind });
  }
  contributions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const total = current - base;
  const sentence = buildSentence(def, current, base, contributions) + note;
  return { metricId, label: def.label, unit: def.unit, digits: def.digits, current, base, total, contributions, sentence, formula: line };
}

/** The healthy liver's resistance (WU), portal vein to hepatic vein, read off the healthy model `h`, so the line never quotes a number the model does not give. */
function healthyPortalR(h) {
  const P = h.Pf ?? h.P, Q = h.Qf ?? h.Q, q = Q[h.ei.SIN_RR] + Q[h.ei.SIN_LL];
  return (P[h.ni.CONF] - P[h.ni.RHV]) / (q * 0.06);
}
const SETTLED_FORMULA = new Set(['pv', 'hvpg', 'ppg']);   // (the metrics whose line reads the engine's own pressures and flows: the view's, as their numbers are)
// (A whole number of a thousand or more takes its comma, as every mL/day does: "1,320 mL/day", lymph-day.js and num.js fmtG.)
const num = (v, d) => { const t = Math.abs(v).toFixed(d); return d === 0 ? t.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : t; };
const signed = (v, d) => (v >= 0 ? '+' : '−') + num(v, d);
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// One or two plain sentences that read aloud: "HVPG is 16.6 mmHg, 12.0 above healthy. Most of that is the cirrhosis (+11.9);
// the collaterals take 1.3 off."
function buildSentence(def, cur, base, cs) {
  const d = def.digits;
  const diff = cur - base;
  // (A percent hugs its number, as everywhere else: "Shunt fraction is 69%", "Varix wall stress is 41% of rupture".)
  // (A reading below zero takes the real minus, as the tiles do (reversed portal flow); one that rounds to zero is a plain 0, never "-0".)
  const here = cur < 0 && Number(num(cur, d)) !== 0 ? `−${num(cur, d)}` : num(cur, d);
  let s = `${def.label} is ${here}${def.unit.startsWith('%') ? '' : ' '}${def.unit}`;
  // (Where healthy is zero, "69%, 69 above healthy" says the same thing twice: the clause is left out.)
  if (Math.abs(diff) >= Math.pow(10, -d) && Math.abs(base) >= Math.pow(10, -d)) s += `, ${num(diff, d)} ${diff > 0 ? 'above' : 'below'} healthy`;
  const sig = cs.filter((c) => Math.abs(c.delta) >= Math.max(Math.pow(10, -d), Math.abs(diff) * 0.05));
  if (!sig.length) return s + '. No factor moves it meaningfully from normal.';
  const dir = Math.sign(diff || 1);
  const up = sig.filter((c) => Math.sign(c.delta) === dir).slice(0, 3);
  const off = sig.filter((c) => Math.sign(c.delta) !== dir).slice(0, 2);
  s += '.';
  if (up.length) s += ` Most of that is ${list(up.map((c) => `${c.say} (${signed(c.delta, d)})`))}`;
  if (off.length) {
    // (Passive, so the verb agrees with any name: "1.3 is taken off by the collaterals and 0.4 by propranolol".)
    const parts = off.map((c, i) => `${num(c.delta, d)}${i ? '' : dir > 0 ? ' is taken off' : ' is added back'} by ${c.say}`);
    const tail = list(parts);
    s += up.length ? `; ${tail}.` : ` ${tail.charAt(0).toUpperCase() + tail.slice(1)}.`;
  } else if (up.length) s += '.';
  return s;
}

/** A vessel's pressures, in and out, under its flow's sentence: the vessel's own pressure beside its own flow. */
function edgeNote(eng, e) {
  const P = eng.Pf ?? eng.P;
  return ` Pressure is ${P[eng.ni[e.from]].toFixed(1)} mmHg going in and ${P[eng.ni[e.to]].toFixed(1)} mmHg coming out.`;
}
/** Q = ΔP / R for one vessel, with the healthy model's resistance (`h`) beside it. */
function edgeFormula(eng, e, h) {
  const wu = (en, ed) => { const P = en.Pf ?? en.P, dp = P[en.ni[ed.from]] - P[en.ni[ed.to]], q = flowOf(en, ed); return Math.abs(q) > 1e-6 ? dp / q : Infinity; };
  const P = eng.Pf ?? eng.P, q = flowOf(eng, e), say = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
  return `Q = ΔP / R = (${P[eng.ni[e.from]].toFixed(1)} − ${P[eng.ni[e.to]].toFixed(1)}) mmHg / ${say(wu(eng, e))} WU = ${q.toFixed(Math.abs(q) < SLOW_FLOW ? 3 : 2)} L/min  (healthy R ≈ ${say(wu(h, e))} WU)`;
}

// Each reading gets its own line: HVPG and PPG are the differences of their two readings, as the sentence above reads them
// (m: the same settled metrics), and portal pressure is the flow through the liver times its resistance.
export function formula(eng, id, m = null, h = null) {
  const P = eng.Pf ?? eng.P, ni = eng.ni, Q = eng.Qf ?? eng.Q, ei = eng.ei;
  const wu = (dp, q) => (q > 1e-6 ? dp / (q * 0.06) : Infinity);
  if (m && id === 'hvpg') {
    // (The figure's sinusoid label less its hepatic vein label can read a few tenths above the HVPG in a liver with open sinusoids: the wedged catheter also reads the central
    // vein that drains them, which sits lower. Said where the two meet, not left as a mismatch: play-test A9, 16 Nov 2026.)
    const d = P[ni.SIN_R] - P[ni.RHV];
    return `HVPG = WHVP − FHVP = ${m.whvp.toFixed(1)} − ${m.fhvp.toFixed(1)} = ${m.hvpg.toFixed(1)} mmHg  (normal ≤${HVPG_CUTS.amber})${d - m.hvpg >= 0.2 ? `. The sinusoid label minus the hepatic vein label reads ${d.toFixed(1)}: the wedged catheter also reads the central vein that drains the sinusoids, so with open sinusoids the HVPG sits a little under that difference.` : ''}`;
  }
  if (m && id === 'ppg') return `PPG = portal vein − IVC = ${m.pv.toFixed(1)} − ${m.ivc.toFixed(1)} = ${m.ppg.toFixed(1)} mmHg  (normal <${PPG_CUTS.amber})`;
  if (id === 'pv' || id === 'hvpg' || id === 'ppg') {
    const q = Q[ei.SIN_RR] + Q[ei.SIN_LL];
    const dp = P[ni.CONF] - P[ni.RHV];
    return `ΔP(portal → hepatic vein) = Q × R = ${(q * 0.06).toFixed(2)} L/min × ${wu(dp, q).toFixed(1)} WU = ${dp.toFixed(1)} mmHg  (healthy R ≈ ${healthyPortalR(h ?? healthyOf(false).eng).toFixed(1)} WU)`;
  }
  if (id === 'varix') {
    const v = eng.varix('VAR');
    const t = wallRead(v);
    return `Laplace: σ = ΔP·r / w = ${t.ptm} mmHg × ${t.r} mm / ${t.w} mm = ${t.index}  (rupture ≈ ${(v.T / v.ratio).toFixed(0)})`;
  }
  if (id === 'ascites') {
    const f = eng.flows;
    return `Ascites = lymph formation (hepatic ${f.hep.toFixed(1)} + splanchnic ${f.spl.toFixed(1)} mL/min) beyond lymphatic capacity ${eng.slow.lymphCap.toFixed(1)} (${(f.excess ?? 0).toFixed(2)}) − peritoneal reabsorption ${f.reabs.toFixed(2)} mL/min`;
  }
  if (id === 'map') return `MAP = CO × SVR + RA = ${(eng.COf * 0.06).toFixed(2)} L/min × ${((eng.MAPf - P[ni.RA]) / (eng.COf * 0.06)).toFixed(1)} WU + ${P[ni.RA].toFixed(1)} mmHg = ${eng.MAPf.toFixed(0)} mmHg`;
  if (id === 'shunt' || id === 'pvFlow' || id === 'liverPerf' || id === 'sinFlow' || id === 'portalIn') return 'Parallel paths: flow divides in inverse proportion to resistance (liver vs. collaterals/shunts).';
  return '';
}
