// Scenario parameters, presets and drug effects (blueprint §8.4, §10.1, §10.2).

export function defaultParams() {
  return {
    cirrhosis: 0,                 // macro 0..1 (§8.4)
    fibrosis: {                   // user fibrosis brush multipliers (≥ 1)
      R: { pre: 1, sin: 1, post: 1 },
      L: { pre: 1, sin: 1, post: 1 },
    },
    stenosis: {},                 // edgeId → 0..1 lumen narrowing
    thrombus: {},                 // edgeId → 0..1 occlusion
    splanchnicTone: 1,            // arteriolar resistance multiplier (<1 = vasodilated)
    systemicTone: 1,
    contractility: 1,
    tr: 0,                        // tricuspid regurgitation 0..1
    pericardial: 0,               // constriction 0..1
    albumin: 4.0,                 // g/dL
    habrStrength: 1,
    apShunt: 0,                   // extra arterioportal shunting 0..1
    respiration: true,
    respDepth: 1,
    pulsatile: false,
    spontaneous: { C5: false, C6: false },
    occluded: {},                 // collateral id → true (BRTO / plug)
    tips: { on: false, d: 10 },
    portocaval: false,
    dsrs: false,
    mesocaval: false,
    balloonEso: false,
    balloonGas: false,
    anticoag: false,
    diuretics: false,             // spironolactone + furosemide: renal sodium/water loss offsets ascites
    drugs: { propranolol: false, carvedilol: false, terlipressin: false, octreotide: false },
    catheter: { vein: null, wedged: false },
    deterministicRupture: false,
    seed: 1,
  };
}

export const DRUGS = {
  propranolol: { label: 'Propranolol', hr: 0.8, contr: 0.92, spl: 1.3, sys: 1.0, sin: 1.0, baroHr: 0.4,
    info: 'Non-selective β-blocker. β1 lowers cardiac output; β2 blockade leaves α-constriction unopposed in splanchnic arterioles, so portal inflow falls.' },
  carvedilol: { label: 'Carvedilol', hr: 0.82, contr: 0.92, spl: 1.25, sys: 0.9, sin: 0.8, baroHr: 0.4,
    info: 'NSBB with α1 blockade: also lowers intrahepatic (sinusoidal) tone, so HVPG falls more than with propranolol, at the cost of lower MAP.' },
  terlipressin: { label: 'Terlipressin', hr: 0.95, contr: 1.0, spl: 1.9, sys: 1.15, sin: 1.0, baroHr: 1,
    info: 'Vasopressin analogue: strong splanchnic vasoconstriction lowers portal inflow and variceal pressure. Raises systemic resistance.' },
  octreotide: { label: 'Octreotide', hr: 1.0, contr: 1.0, spl: 1.35, sys: 1.0, sin: 1.0, baroHr: 1,
    info: 'Somatostatin analogue: inhibits vasodilatory gut peptides → splanchnic vasoconstriction.' },
};

const P = (patch) => (p) => deepMerge(p, patch);

// Each preset: patch applied to defaultParams(), plus chronic days on the disease clock.
export const PRESETS = [
  { id: 'healthy', group: 'Normal', label: 'Healthy', apply: P({}), days: 0,
    summary: 'Normal adult at rest. HVPG ≈ 3 mmHg, portal flow ≈ 1.1 L/min, no collateral flow.' },
  { id: 'postprandial', group: 'Normal', label: 'Post-prandial', apply: P({ splanchnicTone: 0.72 }), days: 0,
    summary: 'Meal-induced splanchnic vasodilation increases portal inflow and pressure slightly.' },
  { id: 'pvt-acute', group: 'Prehepatic', label: 'Acute portal vein thrombosis', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 0,
    summary: 'Occlusive clot in the main portal vein. Mesenteric congestion; the hepatic artery buffer keeps the liver perfused. HVPG normal.' },
  { id: 'pvt-chronic', group: 'Prehepatic', label: 'Chronic PVT (cavernous transformation)', apply: P({ thrombus: { PV_TRUNK: 1 } }), days: 240,
    summary: 'Months after occlusion: periportal collaterals (cavernoma) carry hepatopetal flow around the clot.' },
  { id: 'svt', group: 'Prehepatic', label: 'Splenic vein thrombosis (sinistral PH)', apply: P({ thrombus: { SV_CONF: 1 } }), days: 180,
    summary: 'Left-sided portal hypertension: isolated fundal varices via short gastric veins with a normal portal pressure.' },
  { id: 'schisto', group: 'Presinusoidal', label: 'Schistosomiasis / NCPH', apply: P({ fibrosis: { R: { pre: 70 }, L: { pre: 70 } } }), days: 365,
    summary: 'Presinusoidal block: high portal pressure but normal wedged pressure, so HVPG is normal. Varices yes, ascites rare.' },
  { id: 'cirr-comp', group: 'Sinusoidal', label: 'Compensated cirrhosis', apply: P({ cirrhosis: 0.4 }), days: 365,
    summary: 'Mild sinusoidal portal hypertension (HVPG 6–9). No varices yet.' },
  { id: 'csph', group: 'Sinusoidal', label: 'Clinically significant PH', apply: P({ cirrhosis: 0.6 }), days: 365,
    summary: 'HVPG ≥ 10: collaterals begin to open and small varices form.' },
  { id: 'cirr-decomp', group: 'Sinusoidal', label: 'Decompensated cirrhosis', apply: P({ cirrhosis: 0.85, albumin: 2.8, diuretics: true }), days: 540,
    summary: 'HVPG ≥ 16, large varices, ascites, splenomegaly, hyperdynamic circulation.' },
  { id: 'cirr-hepatofugal', group: 'Sinusoidal', label: 'End-stage cirrhosis, hepatofugal flow', apply: P({ cirrhosis: 0.95, apShunt: 1, albumin: 2.6, diuretics: true, spontaneous: { C6: true } }), days: 540,
    summary: 'Very high sinusoidal resistance plus arterioportal shunting: the portal vein reverses and drains the liver into collaterals.' },
  { id: 'gastric-varix', group: 'Sinusoidal', label: 'Cirrhosis with gastrorenal shunt', apply: P({ cirrhosis: 0.8, albumin: 3.0, diuretics: true, spontaneous: { C5: true } }), days: 450,
    summary: 'Fundal varices decompress into the left renal vein through a gastrorenal shunt (the BRTO target).' },
  { id: 'sos', group: 'Postsinusoidal', label: 'Sinusoidal obstruction syndrome', apply: P({ fibrosis: { R: { post: 20 }, L: { post: 20 } } }), days: 21,
    summary: 'Central-vein obstruction: high wedged pressure and HVPG, hepatomegaly, ascites.' },
  { id: 'budd-chiari', group: 'Posthepatic', label: 'Budd–Chiari (hepatic vein occlusion)', apply: P({ thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } }), days: 60,
    summary: 'All three hepatic veins occluded: only the caudate veins drain the liver (caudate hypertrophy), massive ascites.' },
  { id: 'ivc-web', group: 'Posthepatic', label: 'IVC web', apply: P({ stenosis: { IVCS_RA: 0.6 } }), days: 90,
    summary: 'Suprahepatic IVC stenosis: Budd–Chiari physiology plus lower-body venous congestion.' },
  { id: 'rhf', group: 'Cardiac', label: 'Right heart failure + TR', apply: P({ contractility: 0.25, tr: 0.9 }), days: 60, volume: 1300,
    summary: 'High RA pressure is transmitted back: FHVP and WHVP both rise so HVPG stays normal; the portal vein becomes pulsatile.' },
  { id: 'constrictive', group: 'Cardiac', label: 'Constrictive pericarditis', apply: P({ pericardial: 0.9 }), days: 60, volume: 600,
    summary: 'Pericardial constraint raises RA pressure; congestive hepatopathy without an HVPG rise.' },
];

export function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
export function deepMerge(base, patch) {
  const out = structuredClone(base);
  (function merge(o, p) {
    for (const k of Object.keys(p)) {
      if (isObj(p[k]) && isObj(o[k])) merge(o[k], p[k]);
      else o[k] = structuredClone(p[k]);
    }
  })(out, patch);
  return out;
}

export function presetParams(id) {
  const pr = PRESETS.find((p) => p.id === id) || PRESETS[0];
  return pr.apply(defaultParams());
}
