// Scenario parameters, presets and drug effects (blueprint §8.4, §10.1, §10.2).

import { EDGES } from './topology.js';
import { GEOM_RANGE, geomFix, kindOf } from './stent-geom.js';

export function defaultParams() {
  return {   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    cirrhosis: 0,                 // macro 0..1 (§8.4)
    fibrosis: {                   // user fibrosis brush multipliers (≥ 1)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
      R: { pre: 1, sin: 1, post: 1 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
      L: { pre: 1, sin: 1, post: 1 },   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    },
    stenosis: {},                 // edgeId → 0..1 lumen narrowing   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    stentGeom: {},                // stent edgeId → { len, waist, trans, red }: its hydraulic length, its mid waist's length and tapered ends (cm), and the waist's diameter reduction red (0–0.8; 0: no waist) (stent-geom.js; defaults if unset)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
    stenosisSite: {},             // stent edgeId → 'proximal' | 'distal': the end a stent's stenosis sits at (distal if unset; a waist mid stent is stentGeom.red)   // alloc-rare: builds the parameter record the engine is handed (callers edit their copy); asked when a parameter changes, in the simulation worker, never by a drawn frame
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
    info: 'Nonselective beta-blocker. β1 lowers cardiac output; β2 blockade leaves α-constriction unopposed in splanchnic arterioles, so portal inflow falls.' },
  carvedilol: { label: 'Carvedilol', hr: 0.82, contr: 0.92, spl: 1.25, sys: 0.9, sin: 0.8, baroHr: 0.4,
    info: 'NSBB with α1 blockade: also lowers intrahepatic (sinusoidal) tone, so HVPG falls more than with propranolol, at the cost of lower MAP.' },
  // (The baroreflex gives back most of a systemic vasoconstrictor's rise, so `sys` is well above the rise it yields: 5 to 10 mmHg
  // in cirrhosis, a rise of at least 5 mmHg by day 3 marking a response (Nazar 2010, Hepatology 51:219). `spl` keeps the HVPG
  // fall near 15 %, and `baroSlow` the slowing of the heart under 20 beats/min in decompensated cirrhosis (89 to 72).)
  terlipressin: { label: 'Terlipressin', hr: 0.95, contr: 1.0, spl: 2.4, sys: 1.9, sin: 1.0, baroHr: 1, baroSlow: 0.5,
    info: 'Vasopressin analog: strong splanchnic vasoconstriction lowers portal inflow and variceal pressure. Raises systemic resistance, so the mean arterial pressure rises by about 5 to 10 mmHg.' },
  octreotide: { label: 'Octreotide', hr: 1.0, contr: 1.0, spl: 1.35, sys: 1.0, sin: 1.0, baroHr: 1,
    info: 'Somatostatin analog: inhibits vasodilatory splanchnic peptides, causing splanchnic vasoconstriction.' },
};

/** What the pregnancy setting (gestation) does, for its controls' info. */
export const PREGNANCY_INFO = 'Weeks of pregnancy. Blood volume and cardiac output rise from the first trimester, and splanchnic vasodilation raises portal inflow, so portal pressure rises and varices enlarge. After 20 weeks the gravid uterus also raises the intra-abdominal pressure. 0 is before pregnancy.';

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

// Each preset: patch applied to defaultParams(), plus chronic days on the disease clock. `facts`: the case's history the model does not hold
// (trial-fit.js), so far only whether the patient has ever decompensated (ascites, a variceal bleed): the Tests card's trials read it (TC-fit-3).
export const PRESETS = [
  { id: 'healthy', group: 'Normal', label: 'Healthy', apply: P({}), days: 0,
    summary: 'Normal adult at rest. HVPG in the normal 1 to 5 mmHg, portal flow ≈ 1.1 L/min, no collateral flow.',
    note: 'Normal adult at rest. HVPG in the normal 1 to 5 mmHg, portal flow about 1.1 L/min.' },
  { id: 'postprandial', group: 'Normal', label: 'Postprandial', apply: P({ meal: 1 }), days: 0,
    summary: 'Meal-induced splanchnic vasodilation increases portal inflow and pressure slightly.',
    note: 'Postprandial splanchnic vasodilation raises portal inflow, so the portal pressure rises slightly.' },
  // (volume 300: the congested mesenteric bed gives back blood to the central circulation by venoconstriction and the sympathetic reflex, so cardiac output stays near normal
  // (4.9 L/min, MAP 92 mmHg, heart rate 63) instead of falling to 3.5 with the splanchnic return blocked; 13 Nov 2026.)
  { id: 'pvt-acute', group: 'Pre-hepatic', label: 'Acute portal vein thrombosis', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 0, volume: 300,
    summary: 'Occlusive thrombus in the main portal vein. Mesenteric congestion, with part of the blood already leaving by small preformed collaterals; the cavernoma takes weeks to form. The hepatic arterial buffer response maintains liver perfusion. HVPG normal.',
    note: 'Occlusive thrombus in the main portal vein. Small preformed collaterals carry some blood; the cavernoma takes weeks to form.' },
  { id: 'pvt-chronic', group: 'Pre-hepatic', label: 'Chronic PVT (cavernous transformation)', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 240,
    summary: 'Months after occlusion: periportal collaterals (cavernoma) carry hepatopetal flow around the thrombus.',
    note: 'Months after occlusion, a cavernoma of periportal collaterals carries hepatopetal flow around the thrombus.' },
  { id: 'svt', group: 'Pre-hepatic', label: 'Splenic vein thrombosis (sinistral PH)', apply: P({ thrombus: { SV_CONF: 1 }, spontaneous: { C5: true } }), days: 180,
    summary: 'Left-sided portal hypertension: isolated fundal varices via short gastric veins with a normal portal pressure.',
    note: 'Splenic vein thrombosis. Isolated fundal varices via the short gastric veins, with a normal portal pressure.' },
  { id: 'schisto', group: 'Presinusoidal', label: 'Schistosomiasis / NCPH', apply: P({ fibrosis: { R: { pre: 70, sin: 2.5 }, L: { pre: 70, sin: 2.5 } } }), days: 365,
    summary: 'Presinusoidal resistance: high portal pressure but a near-normal wedged pressure, so HVPG is normal or mildly raised. Varices common, ascites rare.',
    note: 'Presinusoidal resistance. Portal pressure is high, HVPG normal or near normal. Varices; ascites is rare.' },
  // Porto-sinusoidal vascular disorder: the portal venules narrow and vanish with no cirrhosis (Baveno VIII 8.40 to 8.44), so the resistance sits before the sinusoids as in
  // schistosomiasis, a little less: a high portal pressure, a normal HVPG and stiffness, a big spleen. The deck's second presinusoidal patient.
  { id: 'psvd', group: 'Presinusoidal', label: 'Porto-sinusoidal vascular disorder', apply: P({ fibrosis: { R: { pre: 50, sin: 2.2 }, L: { pre: 50, sin: 2.2 } } }), days: 365,
    summary: 'Narrowed portal venules and no cirrhosis: high portal pressure and splenomegaly, a normal or only mildly raised WHVP and liver stiffness, so HVPG is normal or mildly raised. Varices common, ascites rare.',
    note: 'Narrowed portal venules without cirrhosis. Splenomegaly, near-normal HVPG. Varices can form; ascites is rare.' },
  { id: 'cirr-comp', facts: { decompensated: false }, group: 'Sinusoidal', label: 'Compensated cirrhosis', apply: P({ cirrhosis: 0.4 }), days: 365,
    summary: 'Mild sinusoidal portal hypertension (HVPG over 5 and under 10 mmHg). No varices yet.',
    note: 'Mild sinusoidal portal hypertension. HVPG over 5 and under 10 mmHg, no varices yet.' },
  { id: 'csph', facts: { decompensated: false }, group: 'Sinusoidal', label: 'Clinically significant PH', apply: P({ cirrhosis: 0.6 }), days: 365,
    summary: 'HVPG ≥10 mmHg: collaterals begin to open and small varices form.',
    note: 'HVPG ≥10 mmHg. Collaterals open and small varices appear.' },
  // MASLD cirrhosis with CSPH in an obese patient: part of the intrahepatic resistance sits before the sinusoids (the portal
  // venules and the perisinusoidal scar), so the wedged pressure under-reads the portal pressure. The cirrhosis setting gives the
  // sinusoidal block and a presinusoidal multiplier of 4 adds the resistance the catheter cannot see: HVPG about 10.5 and PPG about
  // 14 mmHg (until 15 Nov 2026 the breath moved them, 10.3 to 10.9 and 13.6 to 14.3; the readings are now its means), small varices, no ascites (Baveno VIII 2.5: in MASLD-related cACLD the HVPG may underestimate the true portal gradient).
  { id: 'masld-csph', facts: { decompensated: false }, group: 'Sinusoidal', label: 'MASLD cirrhosis, HVPG underestimates', apply: P({ cirrhosis: 0.6, fibrosis: { R: { pre: 4 }, L: { pre: 4 } } }), days: 365,
    summary: 'Obese MASLD cirrhosis with CSPH: part of the resistance is presinusoidal, so the HVPG underestimates the portal pressure gradient by a few mmHg. Small varices, no ascites.',
    note: 'Obese MASLD cirrhosis. HVPG underestimates the portal pressure gradient by a few mmHg. Small varices, no ascites.' },
  { id: 'cirr-decomp', facts: { decompensated: true }, group: 'Sinusoidal', label: 'Decompensated cirrhosis', apply: P({ cirrhosis: 0.85, albumin: 2.8, diuretics: true }), days: 540,
    summary: 'HVPG ≥15 mmHg, large varices, ascites, splenomegaly, hyperdynamic circulation.',
    note: 'HVPG ≥15 mmHg. Large varices, ascites, splenomegaly and a hyperdynamic circulation.' },
  // The patient the TIPS slides and the Tests card start from: the sickest cirrhosis the model has (severity 100%) with the default stent (8 mm, uniform, covered) in
  // place from the first day, so the 540 days are the years on a shunt and the readings are settled (a stent switched on after them would leave the ascites and the
  // right atrium mid-transient: 1.3 L still to clear). No pressure is tuned for it: it is the cirr-decomp patient's rule at severity 1 with `tips` on (17 Nov 2026).
  { id: 'cirr-decomp-tips', facts: { decompensated: true }, group: 'Sinusoidal', label: 'Decompensated cirrhosis + TIPS', apply: P({ cirrhosis: 1, albumin: 2.8, diuretics: true, tips: { on: true, d: 8 } }), days: 540,
    summary: 'Decompensated cirrhosis at full severity with an 8 mm covered TIPS in place for good: the portal pressure falls and the ascites clears, with the hyperdynamic circulation and the low albumin left.',
    note: 'Severity 100% with an 8 mm covered TIPS: portal pressure down, ascites cleared, hyperdynamic circulation remains.' },
  // (Cirrhosis 0.84, not 0.95: at 0.95 the PPG rested on the red line at 12, 11.8 at the bedside and 12.1 settled, so the tile and the
  // slides' tables could rate it differently. At 0.84: HVPG 11.1 and PPG 11.2 at the bedside, 11.4 and 11.5 settled, and the portal flow
  // stays reversed (no higher setting clears 12 at the bedside: 1.0 reads 12.0). ENG-5.)
  { id: 'cirr-hepatofugal', facts: { decompensated: true }, group: 'Sinusoidal', label: 'Cirrhosis with reversed portal flow', apply: P({ cirrhosis: 0.84, apShunt: 1, albumin: 2.6, diuretics: true, spontaneous: { C6: true } }), days: 540,
    summary: 'Cirrhosis with raised sinusoidal resistance and arterioportal shunting: the portal vein reverses and drains the liver into collaterals.',
    note: 'Raised sinusoidal resistance plus arterioportal shunting. Portal flow reverses into collaterals.' },
  { id: 'gastric-varix', facts: { decompensated: true }, group: 'Sinusoidal', label: 'Cirrhosis with gastrorenal shunt', apply: P({ cirrhosis: 0.9, albumin: 3.0, diuretics: true, spontaneous: { C5: true }, isolatedGV: true }), days: 450,
    summary: 'Isolated fundal varices (IGV1), fed by the short and posterior gastric veins, decompress into the left renal vein through a gastrorenal shunt (the BRTO target); no communication with the coronary vein.',
    note: 'Isolated fundal varices (IGV1) drain through a gastrorenal shunt into the left renal vein: the BRTO target.' },
  // Compensated cirrhosis with small varices before pregnancy (HVPG about 12); `now` makes her pregnant once the disease
  // clock has run, so moving the gestation back to 0 shows her before pregnancy.
  { id: 'pregnancy', facts: { decompensated: false }, group: 'Sinusoidal', label: 'Cirrhosis in pregnancy', apply: P({ cirrhosis: 0.65 }), days: 365, now: { gestation: 24 },
    summary: 'Compensated cirrhosis at 24 weeks of pregnancy. A larger blood volume, a higher cardiac output and splanchnic vasodilation raise portal inflow, so small varices grow large. Move the weeks on the heart card.',
    note: 'Compensated cirrhosis at 24 weeks. Higher blood volume and portal inflow enlarge small varices.' },
  // (Central-vein resistance 34, not 32: at 32 SOS rested at HVPG 10.2 and PPG 12.1 at the bedside, on both red lines, and read amber or red with
  // the last tenth (full app review ENG-5, 15 Nov 2026). At 34: about 10.4 and 12.4 at the bedside, 10.9 and 12.7 settled (the slides' states).
  // No preset rests within 0.3 of a cut-off: tests/steady-readings.test.js.)
  { id: 'sos', group: 'Postsinusoidal', label: 'Sinusoidal obstruction syndrome', apply: P({ fibrosis: { R: { post: 34 }, L: { post: 34 } } }), days: 21,
    summary: 'Central-vein resistance: high WHVP and HVPG, hepatomegaly, ascites.',
    note: 'Resistance at the central veins. High WHVP and HVPG, hepatomegaly, ascites.' },
  { id: 'budd-chiari', group: 'Post-hepatic', label: 'Budd–Chiari (hepatic vein occlusion)', apply: P({ thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } }), days: 60,
    summary: 'All three hepatic veins occluded: only the caudate veins drain the liver (caudate hypertrophy), massive ascites.',
    note: 'All three hepatic veins occluded. Only the caudate veins drain the liver; massive ascites.' },
  { id: 'ivc-web', group: 'Post-hepatic', label: 'IVC web', apply: P({ stenosis: { IVCS_RA: 0.6 } }), days: 90, volume: 800,
    summary: 'Suprahepatic IVC stenosis: Budd–Chiari physiology plus lower-body venous congestion.',
    note: 'Suprahepatic IVC stenosis. Budd–Chiari physiology plus lower-body venous congestion.' },
  { id: 'rhf', group: 'Cardiac', label: 'Right heart failure + TR', apply: P({ contractility: 0.25, tr: 0.9 }), days: 60, volume: 1300,
    summary: 'High RA pressure is transmitted back: FHVP and WHVP both rise so HVPG stays normal; the portal vein becomes pulsatile.',
    note: 'High right atrial pressure is transmitted back. FHVP and WHVP both rise, so HVPG stays normal; portal flow is pulsatile.' },
  // (volume 1150 with the pericardium limiting the heart's filling (engine.js PERICARDIAL_FILL): RA about 16 mmHg, cardiac output 3.9, MAP 89, ascites about 3 L, HVPG normal; 13 Nov 2026.)
  { id: 'constrictive', group: 'Cardiac', label: 'Constrictive pericarditis', apply: P({ pericardial: 0.9 }), days: 60, volume: 1150,
    summary: 'Pericardial constraint raises RA pressure; congestive hepatopathy without an HVPG rise.',
    note: 'Pericardial constriction raises RA pressure. Congestive hepatopathy without a rise in HVPG.' },
];

/**
 * A patient made at run time ("Yours", from Work backward), as a PRESETS entry: a params patch, the disease days and the volume a failing heart keeps.
 * Read from storage or a link, so the patch is sanitized as it is applied: a value no control can reach never gets into the model.
 */
export function presetFromPatch({ id, label = '', group = 'Yours', patch = {}, days = 0, volume = 0, now = null, summary = '', note = '' }) {
  const d = Math.min(1500, Math.max(0, Number.isFinite(days) ? days : 0)), v = Math.min(3000, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return { id, group, label, apply: (p) => sanitizeParams(deepMerge(p, patch)), days: d, volume: v, ...(now ? { now } : {}), summary, note };
}
/** Put a run-time patient in the list the menu, the worker and a deck read (the same id replaces its older entry); forgetPreset takes one out. Never a built-in. */
export function registerPreset(def) {
  const pr = presetFromPatch(def), i = PRESETS.findIndex((x) => x.id === pr.id);
  if (i >= 0 && PRESETS[i].group !== 'Yours') return null;
  if (i >= 0) PRESETS[i] = pr; else PRESETS.push(pr);
  return pr;
}
export function forgetPreset(id) {
  const i = PRESETS.findIndex((x) => x.id === id && x.group === 'Yours');
  if (i >= 0) PRESETS.splice(i, 1);
  return i >= 0;
}

// Allowed range of each numeric parameter (the controls' own ranges). Hand-edited links and console calls
// are clamped to these, so a value no control can reach never turns the model into NaN.
const RANGES = {
  cirrhosis: [0, 1], splenicRx: [0, 2], splanchnicTone: [0.4, 2.5], systemicTone: [0.4, 2.5],
  contractility: [0.15, 1.6], tr: [0, 1], pericardial: [0, 1], albumin: [1.5, 5], habrStrength: [0, 2],
  apShunt: [0, 1], respDepth: [0, 3], gestation: [0, 40], fenestrae: [0, 1], meal: [0, 1],
};
const RANGE_LIST = Object.entries(RANGES), LOBES = ['R', 'L'], ZONES = ['pre', 'sin', 'post'], CLAMPED = ['stenosis', 'thrombus'], SITES = ['proximal', 'mid', 'distal'], SWITCHED = ['tips', 'dips'];
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
// A switch is a real boolean or nothing: `!!'false'` is true, and a hand-edited link or an imported scenario must never turn a procedure or a drug on
// because a non-empty string, an array or a 1 arrived (R07, external production review, 15 Nov 2026). Anything else takes the parameter's own default.
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

/** A copy of params with every value of the wrong type replaced by its default and every number clamped to its range. Only real booleans switch a
 *  treatment, a drug or a procedure on; a key the model has no parameter for is dropped, at every depth the model's own records have. */
export function sanitizeParams(p) { return sanitize(p, null); }

/** Like sanitizeParams, and the list of what it repaired: { params, repairs: [{ path, was, now }] }, each path a readable field ("tips.on", "drugs.carvedilol")
 *  so a caller can say what an imported scenario lost. `was` is the value as it came (an object or array is named by its type, not copied). */
export function sanitizeParamsReport(p) { const repairs = []; return { params: sanitize(p, repairs), repairs }; }

const seen = (v) => (Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'object' : v);   // alloc-rare: only while a repair is being reported
function sanitize(p, rep) {
  const d = defaultParams();
  const fixed = (path, was, now) => { if (rep) rep.push({ path, was: seen(was), now }); return now; };   // alloc-rare: only while a repair is being reported
  const out = isObj(p) ? deepMerge(d, p) : d;
  if (rep && !isObj(p) && p != null) fixed('', p, 'defaults');
  for (const k of Object.keys(out)) if (!Object.hasOwn(d, k)) { fixed(k, out[k], 'dropped'); delete out[k]; }   // B7: a key the model has no parameter for is not carried (a renamed or hand-added one)   // alloc-rare: checked when parameters are set, in the simulation worker
  for (const [k, [lo, hi]] of RANGE_LIST) { const v = out[k], n = num(v, lo, hi, d[k]); out[k] = n; if (rep && n !== v) fixed(k, v, n); }
  out.splenicRx = Math.round(out.splenicRx);
  for (const k of Object.keys(d)) {   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
    if (typeof d[k] === 'boolean') { if (typeof out[k] !== 'boolean') out[k] = fixed(k, out[k], d[k]); }
    else if (isObj(d[k]) && !isObj(out[k])) out[k] = fixed(k, out[k], d[k]);
  }
  for (const lobe of LOBES) {
    if (!isObj(out.fibrosis[lobe])) out.fibrosis[lobe] = fixed(`fibrosis.${lobe}`, out.fibrosis[lobe], d.fibrosis[lobe]);
    for (const z of ZONES) { const v = out.fibrosis[lobe][z], n = num(v, 1, 80, 1); out.fibrosis[lobe][z] = n; if (rep && n !== v) fixed(`fibrosis.${lobe}.${z}`, v, n); }
    pruneTo(out.fibrosis[lobe], d.fibrosis[lobe], `fibrosis.${lobe}`, fixed);
  }
  pruneTo(out.fibrosis, d.fibrosis, 'fibrosis', fixed);
  for (const k of CLAMPED) for (const id of Object.keys(out[k])) { const v = out[k][id], n = num(v, 0, k === 'stenosis' ? 0.95 : 1, 0); out[k][id] = n; if (rep && n !== v) fixed(`${k}.${id}`, v, n); }   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists)
  // (A stent's stenosis is at an end, proximal or distal; a narrowing mid stent is its waist, stentGeom.red: stent-geom.js. A saved state from
  // before 17 Nov 2026 may hold a stenosis 'mid': it is the same focal narrowing as a waist of PINCH of the length, so it is carried over as one.)
  for (const id of Object.keys(out.stenosisSite)) if (out.stenosisSite[id] === 'mid' && STENT_EDGE.has(id)) {   // alloc-rare: checked when parameters are set (a few tiny key lists)
    const kind = kindOf(STENT_EDGE.get(id)), sten = num(out.stenosis[id], 0, 0.95, 0), g = isObj(out.stentGeom[id]) ? out.stentGeom[id] : {};
    if (sten > 0) out.stentGeom[id] = { ...geomFix(g, kind), red: Math.max(num(g.red, 0, 1, 0), Math.min(GEOM_RANGE.red[1], sten)) };   // alloc-rare: the same check
    fixed(`stenosisSite.${id}`, 'mid', sten > 0 ? 'waist' : 'dropped');
    delete out.stenosis[id]; delete out.stenosisSite[id];
  }
  for (const id of Object.keys(out.stenosisSite)) if (!SITES.includes(out.stenosisSite[id])) { fixed(`stenosisSite.${id}`, out.stenosisSite[id], 'dropped'); delete out.stenosisSite[id]; }   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists),
  // A stent's geometry is a record of three lengths (cm), clamped, with the waist and its ends fitted inside the stent (stent-geom.js geomFix).
  for (const id of Object.keys(out.stentGeom)) {   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
    const v = out.stentGeom[id], kind = kindOf(STENT_EDGE.get(id));
    if (!kind || !isObj(v)) { fixed(`stentGeom.${id}`, v, 'dropped'); delete out.stentGeom[id]; continue; }
    const n = geomFix(v, kind);
    for (const f of ['len', 'waist', 'trans', 'red']) if (rep && v[f] !== undefined && n[f] !== v[f]) fixed(`stentGeom.${id}.${f}`, v[f], n[f]);
    out.stentGeom[id] = n;
  }
  for (const k of SWITCHED) {
    pruneTo(out[k], d[k], k, fixed);
    out[k].on = typeof out[k].on === 'boolean' ? out[k].on : fixed(`${k}.on`, out[k].on, d[k].on);
    const v = out[k].d, n = num(v, 6, 12, 8); out[k].d = n; if (rep && n !== v) fixed(`${k}.d`, v, n);
  }
  // A custom shunt is a diameter: a number of 4 to 16 mm. A string, a true or anything else that merely reads as "on" is not a diameter, so there is no shunt.
  for (const id of Object.keys(out.customShunts)) {   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
    const v = out.customShunts[id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.customShunts[id] = num(v, 4, 16, 10);
    else { if (v) fixed(`customShunts.${id}`, v, 'dropped'); delete out.customShunts[id]; }
  }
  pruneTo(out.catheter, d.catheter, 'catheter', fixed);
  out.catheter.wedged = typeof out.catheter.wedged === 'boolean' ? out.catheter.wedged : fixed('catheter.wedged', out.catheter.wedged, false);
  if (out.catheter.vein != null && typeof out.catheter.vein !== 'string') out.catheter.vein = fixed('catheter.vein', out.catheter.vein, null);
  pruneTo(out.drugs, d.drugs, 'drugs', fixed);
  for (const k of Object.keys(out.drugs)) if (typeof out.drugs[k] !== 'boolean') out.drugs[k] = fixed(`drugs.${k}`, out.drugs[k], d.drugs[k]);   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists), never by a drawn frame
  keepKnown(out.stenosis, ANY_EDGE); keepKnown(out.thrombus, ANY_EDGE); keepKnown(out.stenosisSite, ANY_EDGE); keepKnown(out.occluded, ANY_EDGE);   // B7
  keepKnown(out.customShunts, CUSTOM_EDGE); keepKnown(out.spontaneous, SPONTANEOUS_EDGE);
  // A vessel switched by id (a plug, an anatomical variant) is true or false; a truthy string would close a collateral or add a shunt (the engine reads these as switches).
  for (const k of ['occluded', 'spontaneous']) for (const id of Object.keys(out[k])) {   // alloc-rare: checked when parameters are set, in the simulation worker (a few tiny key lists)
    if (typeof out[k][id] === 'boolean') continue;
    fixed(`${k}.${id}`, out[k][id], Object.hasOwn(d[k], id) ? d[k][id] : 'dropped');
    if (Object.hasOwn(d[k], id)) out[k][id] = d[k][id]; else delete out[k][id];
  }
  out.seed = num(out.seed, 0, 2 ** 31, 1);
  return out;
}
// A record the model owns keeps only the keys it defines: an extra one is not a parameter, and must not ride along to be read as a switch.
function pruneTo(o, tpl, path, fixed) { for (const k of Object.keys(o)) if (!Object.hasOwn(tpl, k)) { fixed(`${path}.${k}`, o[k], 'dropped'); delete o[k]; } }   // alloc-rare: checked when parameters are set, in the simulation worker, never by a drawn frame

// B7: the ids under stenosis, thrombus, stenosisSite, occluded, customShunts and spontaneous are vessels of the model; a link's other ids are dropped.
const ANY_EDGE = new Set(EDGES.map((e) => e.id));
const STENT_EDGE = new Map(EDGES.filter((e) => kindOf(e)).map((e) => [e.id, e]));
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

