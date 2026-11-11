// Scenario parameters, presets and drug effects (blueprint §8.4, §10.1, §10.2).

import { EDGES } from './topology.js';

export function defaultParams() {
  return {   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    cirrhosis: 0,                 // macro 0..1 (§8.4)
    fibrosis: {                   // user fibrosis brush multipliers (≥ 1)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
      R: { pre: 1, sin: 1, post: 1 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
      L: { pre: 1, sin: 1, post: 1 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    },
    stenosis: {},                 // edgeId → 0..1 lumen narrowing   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    stenosisSite: {},             // stent edgeId → 'proximal' | 'mid' | 'distal': the segment a stent's narrowing sits in (distal if unset)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    thrombus: {},                 // edgeId → 0..1 occlusion   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    splenicRx: 0,                 // 0 none · 1 partial splenic artery embolization · 2 splenectomy
    splanchnicTone: 1,            // arteriolar resistance multiplier (<1 = vasodilated)
    meal: 0,                      // how far a meal has taken hold, 0..1 (0 fasting); see MEAL_TONE
    systemicTone: 1,
    contractility: 1,
    tr: 0,                        // tricuspid regurgitation 0..1
    pericardial: 0,               // constriction 0..1
    albumin: 4.0,                 // g/dL
    gestation: 0,                 // pregnancy, weeks (0 = not pregnant); see PREGNANCY in engine.js
    habrStrength: 1,
    apShunt: 0,                   // extra arterioportal shunting 0..1
    respiration: true,
    respDepth: 1,
    pulsatile: true,
    spontaneous: { C5: false, C6: false },   // C5: gastrorenal shunt, an anatomical variant: absent by default (a preset or the user adds it); fundal varices need it   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    isolatedGV: false,            // isolated fundal varices (IGV1): the coronary vein never forms esophageal varices
    occluded: {},                 // collateral id → true (BRTO / plug)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    tips: { on: false, d: 8 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    dips: { on: false, d: 8 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    portocaval: false,
    portocavalSide: false,        // the portocaval shunt made side-to-side: the portal trunk is kept, so the liver can drain back out through it (end-to-side divides it)
    customShunts: {},   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    dsrs: false,
    mesocaval: false,
    rex: false,                   // the Meso-Rex bypass: a vein graft from the superior mesenteric vein to the left portal vein (past a clotted trunk)
    balloonEso: false,            // the tamponade tube's esophageal balloon: the second step, filled only on a tube whose gastric balloon is up
    balloonGas: false,            // its gastric balloon, filled in the stomach and drawn up against the cardia: the first step
    anticoag: false,
    diuretics: false,             // spironolactone + furosemide: renal sodium/water loss offsets ascites
    fenestrae: 0,                 // how far the sinusoid lining's pores are opened past what the disease leaves (0: as the disease has it, 1: all open); see starling()
    drugs: { propranolol: false, carvedilol: false, terlipressin: false, octreotide: false },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    nsbbGain: 1,                  // how strongly this patient's portal pressure answers a beta-blocker: 1 the usual (an HVPG fall near 15 to 20%),
                                  // more for a good responder; it scales the splanchnic and sinusoidal parts of propranolol and carvedilol only
    catheter: { vein: null, wedged: false },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    bleeding: false,              // spontaneous variceal rupture (off: varices swell but never tear on their own)
    deterministicRupture: false,
    seed: 1,
  };
}

/** The tube's gastric balloon is up: filled on its own, or carried by the esophageal balloon, which goes on a tube already anchored in the stomach. */
export const gastricUp = (p) => !!(p.balloonGas || p.balloonEso);

export const DRUGS = {
  propranolol: { label: 'Propranolol', hr: 0.8, contr: 0.92, spl: 1.3, sys: 1.0, sin: 1.0, baroHr: 0.4,
    info: 'Non-selective beta-blocker. β1 lowers cardiac output; β2 blockade leaves α-constriction unopposed in splanchnic arterioles, so portal inflow falls.' },
  carvedilol: { label: 'Carvedilol', hr: 0.82, contr: 0.92, spl: 1.25, sys: 0.9, sin: 0.8, baroHr: 0.4,
    info: 'NSBB with α1 blockade: also lowers intrahepatic (sinusoidal) tone, so HVPG falls more than with propranolol, at the cost of lower MAP.' },
  // (The baroreflex gives back most of a systemic vasoconstrictor's rise, so `sys` is well above the rise it yields: 5 to 10 mmHg
  // in cirrhosis, a rise of at least 5 mmHg by day 3 marking a response (Nazar 2010, Hepatology 51:219). `spl` keeps the HVPG
  // fall near 15 %, and `baroSlow` the slowing of the heart under 20 beats/min in decompensated cirrhosis (89 to 72).)
  terlipressin: { label: 'Terlipressin', hr: 0.95, contr: 1.0, spl: 2.4, sys: 1.9, sin: 1.0, baroHr: 1, baroSlow: 0.5,
    info: 'Vasopressin analogue: strong splanchnic vasoconstriction lowers portal inflow and variceal pressure. Raises systemic resistance, so the mean arterial pressure rises by about 5 to 10 mmHg.' },
  octreotide: { label: 'Octreotide', hr: 1.0, contr: 1.0, spl: 1.35, sys: 1.0, sin: 1.0, baroHr: 1,
    info: 'Somatostatin analogue: inhibits vasodilatory gut peptides → splanchnic vasoconstriction.' },
};

/** What the pregnancy setting (gestation) does, for its controls' info. */
export const PREGNANCY_INFO = 'Weeks of pregnancy. Blood volume and cardiac output rise from the first trimester, and splanchnic vasodilation raises portal inflow, so portal pressure and the varices grow. After 20 weeks the uterus also raises the pressure in the abdomen. 0 is before pregnancy.';

const P = (patch) => (p) => deepMerge(p, patch);

// A meal's fall in splanchnic arteriolar tone (params.meal 1): a healthy adult's portal flow rises about 50% (1.1 to 1.65
// L/min) and the velocity about 47%, within the 40 to 80% (flow) and 35 to 100% (velocity) that Doppler studies find at
// the 30-minute peak. A deeper fall would take the healthy PPG to the amber 6 mmHg, the model's healthy resistance not
// recruiting sinusoids as flow rises. Gut arterioles that cirrhosis has already dilated (slow.splTone) have less left to
// give, so the meal is blunted by MEAL_BLUNT for each step of that dilation: CSPH's flow rises about 28% and its HVPG
// about 15% (Sabbà 1991, Albillos 2007), compensated cirrhosis's flow about 40%. A stronger blunting would leave the
// cirrhotic gradient rising less than the healthy one. Every meal slide ramps meal 0 to 1
// (/mnt/project-files/review/meal-response/review.md, engine-options.md).
export const MEAL_TONE = 0.58, MEAL_BLUNT = 1.36;

// Each preset: patch applied to defaultParams(), plus chronic days on the disease clock.
export const PRESETS = [
  { id: 'healthy', group: 'Normal', label: 'Healthy', apply: P({}), days: 0,
    summary: 'Normal adult at rest. HVPG ≈ 3 mmHg, portal flow ≈ 1.1 L/min, no collateral flow.' },
  { id: 'postprandial', group: 'Normal', label: 'Post-prandial', apply: P({ meal: 1 }), days: 0,
    summary: 'Meal-induced splanchnic vasodilation increases portal inflow and pressure slightly.' },
  { id: 'pvt-acute', group: 'Pre-hepatic', label: 'Acute portal vein thrombosis', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 0,
    summary: 'Occlusive clot in the main portal vein. Mesenteric congestion; no collaterals yet (they form over weeks). The hepatic artery buffer keeps the liver perfused. HVPG normal.' },
  { id: 'pvt-chronic', group: 'Pre-hepatic', label: 'Chronic PVT (cavernous transformation)', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 240,
    summary: 'Months after occlusion: periportal collaterals (cavernoma) carry hepatopetal flow around the clot.' },
  { id: 'svt', group: 'Pre-hepatic', label: 'Splenic vein thrombosis (sinistral PH)', apply: P({ thrombus: { SV_CONF: 1 }, spontaneous: { C5: true } }), days: 180,
    summary: 'Left-sided portal hypertension: isolated fundal varices via short gastric veins with a normal portal pressure.' },
  { id: 'schisto', group: 'Presinusoidal', label: 'Schistosomiasis / NCPH', apply: P({ fibrosis: { R: { pre: 70, sin: 2.5 }, L: { pre: 70, sin: 2.5 } } }), days: 365,
    summary: 'Presinusoidal resistance: high portal pressure but a near-normal wedged pressure, so HVPG is normal or mildly raised. Varices yes, ascites rare.' },
  // Porto-sinusoidal vascular disorder: the portal venules narrow and vanish with no cirrhosis (Baveno VIII 8.40 to 8.44), so the resistance sits before the sinusoids as in
  // schistosomiasis, a little less: a high portal pressure, a normal HVPG and stiffness, a big spleen. The deck's second presinusoidal patient.
  { id: 'psvd', group: 'Presinusoidal', label: 'Porto-sinusoidal vascular disorder', apply: P({ fibrosis: { R: { pre: 50, sin: 2.2 }, L: { pre: 50, sin: 2.2 } } }), days: 365,
    summary: 'Narrowed portal venules and no cirrhosis: portal pressure and spleen up, a near-normal wedged pressure and stiffness, so HVPG is normal or mildly raised. Varices yes, ascites rare.' },
  { id: 'cirr-comp', group: 'Sinusoidal', label: 'Compensated cirrhosis', apply: P({ cirrhosis: 0.4 }), days: 365,
    summary: 'Mild sinusoidal portal hypertension (HVPG 6–9). No varices yet.' },
  { id: 'csph', group: 'Sinusoidal', label: 'Clinically significant PH', apply: P({ cirrhosis: 0.6 }), days: 365,
    summary: 'HVPG ≥ 10: collaterals begin to open and small varices form.' },
  // MASLD cirrhosis with CSPH in an obese patient: part of the intrahepatic resistance sits before the sinusoids (the portal
  // venules and the perisinusoidal scar), so the wedged pressure under-reads the portal pressure. The cirrhosis setting gives the
  // sinusoidal block and a presinusoidal multiplier of 4 adds the resistance the catheter cannot see: HVPG about 11 and PPG about
  // 14 mmHg, small varices, no ascites (Baveno VIII 2.5: in MASLD-related cACLD the HVPG may underestimate the true portal gradient).
  { id: 'masld-csph', group: 'Sinusoidal', label: 'MASLD cirrhosis, HVPG under-reads', apply: P({ cirrhosis: 0.6, fibrosis: { R: { pre: 4 }, L: { pre: 4 } } }), days: 365,
    summary: 'Obese MASLD cirrhosis with CSPH: part of the resistance sits before the sinusoids, so the HVPG reads a few mmHg below the portal pressure gradient. Small varices, no ascites.' },
  { id: 'cirr-decomp', group: 'Sinusoidal', label: 'Decompensated cirrhosis', apply: P({ cirrhosis: 0.85, albumin: 2.8, diuretics: true }), days: 540,
    summary: 'HVPG ≥ 16, large varices, ascites, splenomegaly, hyperdynamic circulation.' },
  { id: 'cirr-hepatofugal', group: 'Sinusoidal', label: 'End-stage cirrhosis, hepatofugal flow', apply: P({ cirrhosis: 0.95, apShunt: 1, albumin: 2.6, diuretics: true, spontaneous: { C6: true } }), days: 540,
    summary: 'Very high sinusoidal resistance plus arterioportal shunting: the portal vein reverses and drains the liver into collaterals.' },
  { id: 'gastric-varix', group: 'Sinusoidal', label: 'Cirrhosis with gastrorenal shunt', apply: P({ cirrhosis: 0.9, albumin: 3.0, diuretics: true, spontaneous: { C5: true }, isolatedGV: true }), days: 450,
    summary: 'Isolated fundal varices (IGV1), fed by the short and posterior gastric veins, decompress into the left renal vein through a gastrorenal shunt (the BRTO target); no communication with the coronary vein.' },
  // Compensated cirrhosis with small varices before pregnancy (HVPG about 12); `now` makes her pregnant once the disease
  // clock has run, so moving the gestation back to 0 shows her before pregnancy.
  { id: 'pregnancy', group: 'Sinusoidal', label: 'Cirrhosis in pregnancy', apply: P({ cirrhosis: 0.62 }), days: 365, now: { gestation: 24 },
    summary: 'Compensated cirrhosis at 24 weeks of pregnancy. A larger blood volume, a higher cardiac output and splanchnic vasodilation raise portal inflow, so small varices grow large. Move the weeks on the heart card.' },
  { id: 'sos', group: 'Postsinusoidal', label: 'Sinusoidal obstruction syndrome', apply: P({ fibrosis: { R: { post: 32 }, L: { post: 32 } } }), days: 21,
    summary: 'Central-vein resistance: high wedged pressure and HVPG, hepatomegaly, ascites.' },
  { id: 'budd-chiari', group: 'Post-hepatic', label: 'Budd–Chiari (hepatic vein occlusion)', apply: P({ thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } }), days: 60,
    summary: 'All three hepatic veins occluded: only the caudate veins drain the liver (caudate hypertrophy), massive ascites.' },
  { id: 'ivc-web', group: 'Post-hepatic', label: 'IVC web', apply: P({ stenosis: { IVCS_RA: 0.6 } }), days: 90, volume: 800,
    summary: 'Suprahepatic IVC stenosis: Budd–Chiari physiology plus lower-body venous congestion.' },
  { id: 'rhf', group: 'Cardiac', label: 'Right heart failure + TR', apply: P({ contractility: 0.25, tr: 0.9 }), days: 60, volume: 1300,
    summary: 'High RA pressure is transmitted back: FHVP and WHVP both rise so HVPG stays normal; the portal vein becomes pulsatile.' },
  { id: 'constrictive', group: 'Cardiac', label: 'Constrictive pericarditis', apply: P({ pericardial: 0.9 }), days: 60, volume: 600,
    summary: 'Pericardial constraint raises RA pressure; congestive hepatopathy without an HVPG rise.' },
];

// Allowed range of each numeric parameter (the controls' own ranges). Hand-edited links and console calls
// are clamped to these, so a value no control can reach never turns the model into NaN.
const RANGES = {
  cirrhosis: [0, 1], splenicRx: [0, 2], splanchnicTone: [0.4, 2.5], systemicTone: [0.4, 2.5],
  contractility: [0.15, 1.6], tr: [0, 1], pericardial: [0, 1], albumin: [1.5, 5], habrStrength: [0, 2],
  apShunt: [0, 1], respDepth: [0, 3], gestation: [0, 40], fenestrae: [0, 1], meal: [0, 1],
};
const RANGE_LIST = Object.entries(RANGES), LOBES = ['R', 'L'], ZONES = ['pre', 'sin', 'post'], CLAMPED = ['stenosis', 'thrombus'], SITES = ['proximal', 'mid', 'distal'], SWITCHED = ['tips', 'dips'];
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

/** A copy of params with every value of the wrong type replaced by its default and every number clamped to its range. */
export function sanitizeParams(p) {
  const d = defaultParams();
  const out = isObj(p) ? deepMerge(d, p) : d;
  for (const k of Object.keys(out)) if (!Object.hasOwn(d, k)) delete out[k];   // B7: a key the model has no parameter for is not carried (a renamed or hand-added one)   // alloc-rare: checked when parameters are set, in the simulation worker, never by a drawn frame
  for (const [k, [lo, hi]] of RANGE_LIST) out[k] = num(out[k], lo, hi, d[k]);
  out.splenicRx = Math.round(out.splenicRx);
  for (const k of Object.keys(d)) {   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
    if (typeof d[k] === 'boolean') out[k] = !!out[k];
    else if (isObj(d[k]) && !isObj(out[k])) out[k] = d[k];
  }
  for (const lobe of LOBES) {
    if (!isObj(out.fibrosis[lobe])) out.fibrosis[lobe] = d.fibrosis[lobe];
    for (const z of ZONES) out.fibrosis[lobe][z] = num(out.fibrosis[lobe][z], 1, 80, 1);
  }
  for (const k of CLAMPED) for (const id of Object.keys(out[k])) out[k][id] = num(out[k][id], 0, k === 'stenosis' ? 0.95 : 1, 0);   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
  for (const id of Object.keys(out.stenosisSite)) if (!SITES.includes(out.stenosisSite[id])) delete out.stenosisSite[id];   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
  for (const k of SWITCHED) { out[k].on = !!out[k].on; out[k].d = num(out[k].d, 6, 12, 8); }
  for (const id of Object.keys(out.customShunts)) if (out.customShunts[id]) out.customShunts[id] = num(out.customShunts[id], 4, 16, 10);   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
  for (const k of Object.keys(out.drugs)) out.drugs[k] = !!out.drugs[k];   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
  keepKnown(out.stenosis, ANY_EDGE); keepKnown(out.thrombus, ANY_EDGE); keepKnown(out.stenosisSite, ANY_EDGE); keepKnown(out.occluded, ANY_EDGE);   // B7
  keepKnown(out.customShunts, CUSTOM_EDGE); keepKnown(out.spontaneous, SPONTANEOUS_EDGE);
  out.seed = num(out.seed, 0, 2 ** 31, 1);
  return out;
}

// B7: the ids under stenosis, thrombus, stenosisSite, occluded, customShunts and spontaneous are vessels of the model; a link's other ids are dropped.
const ANY_EDGE = new Set(EDGES.map((e) => e.id));
const CUSTOM_EDGE = new Set(EDGES.filter((e) => e.shunt === 'custom').map((e) => e.id));
const SPONTANEOUS_EDGE = new Set(EDGES.filter((e) => e.variant || e.spontaneous).map((e) => e.id));
function keepKnown(o, ids) { if (isObj(o)) for (const k of Object.keys(o)) if (!ids.has(k)) delete o[k]; }   // alloc-rare: checked when parameters are set, in the simulation worker, never by a drawn frame
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
// (Keys that would reach an object's prototype are skipped, and only the base's own keys are merged into, so a
// hand-made share link cannot change Object.prototype.)
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
export function deepMerge(base, patch) {
  const out = structuredClone(base);
  (function merge(o, p) {
    for (const k of Object.keys(p)) {
      if (UNSAFE.has(k)) continue;
      if (isObj(p[k]) && Object.hasOwn(o, k) && isObj(o[k])) merge(o[k], p[k]);
      else o[k] = structuredClone(p[k]);
    }
  })(out, patch);
  return out;
}

