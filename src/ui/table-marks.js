// The summary tables' marks and the readouts' ratings, kept free of the page so a test can recompute every cell:
// each column's cut-offs (CUT, the same as the readouts' status colors), the direction a cell's arrow points against
// normal (dirAbs) or against a reference patient (dirRel), and the colour that goes with it.

import { FLOW_CUTS } from '../engine/flow-cuts.js';
import { PPG_CUTS, hvpgRate, ppgRate } from '../engine/pressure-cuts.js';
import { SSM_CUTS } from '../engine/ssm-cuts.js';
import { KIDNEY_CUTS, rppSev } from '../engine/kidney-cuts.js';

export const NO_ASC = 150;   // mL: below it there is no ascites to tap (ultrasound grade 1 starts here)
// (The ratings are fixed pairs [colour class, word], made once and handed out as the same frozen arrays: a tile's rating is asked for on every
// frame it is drawn, and a caller only reads it.)
const tup = (a, b) => Object.freeze([a, b]);
const T_ok_None = tup('ok', 'None');
const T_mid_Small = tup('mid', 'Small');
const T_hi_Large = tup('hi', 'Large');
const T_hi_Severe = tup('hi', 'Severe');
const T_mid_High = tup('mid', 'High');
const T_ok_Normal = tup('ok', 'Normal');
const T_hi_High = tup('hi', 'High');
const T_null_No_ascites = tup(null, 'No ascites');
const T_hi_Portal_HTN = tup('hi', 'Portal HTN');
const T_ok_Not_portal = tup('ok', 'Not portal');
const T_info_High = tup('info', 'High');
const T_mid_SBP_risk = tup('mid', 'SBP risk');
const T_info_Low = tup('info', 'Low');
const T_mid_Grade_1 = tup('mid', 'Grade 1');
const T_hi_Grade_2 = tup('hi', 'Grade 2');
const T_hi_Grade_3 = tup('hi', 'Grade 3');
const T_mid_Large = tup('mid', 'Large');
const T_mid_Low = tup('mid', 'Low');
const T_hi_Hepatofugal = tup('hi', 'Hepatofugal');
const T_hi_No_flow = tup('hi', 'No flow');
const T_null_Hepatopetal = tup(null, 'Hepatopetal');
const T_hi_Reversed = tup('hi', 'Reversed');
const T_hi_Stasis = tup('hi', 'Stasis');
const T_mid_Slow = tup('mid', 'Slow');
const T_mid_Moderate = tup('mid', 'Moderate');
const T_ok_Small = tup('ok', 'Small');
const T_hi_Low = tup('hi', 'Low');
const T_hi_CSPH = tup('hi', 'CSPH');
const T_mid_Borderline = tup('mid', 'Borderline');
const T_mid_cACLD = tup('mid', 'cACLD');
const T_mid_Gray = tup('mid', 'Gray zone');
const T_info_Slow = tup('info', 'Slow');
const T_hi_Fast = tup('hi', 'Fast');
const T_hi_Complete = tup('hi', 'Complete');
const T_hi_Partial = tup('hi', 'Partial');
const T_mid_Minimal = tup('mid', 'Minimal');
const T_ok_Low = tup('ok', 'Low');
const T_ok_20 = tup('ok', '≥20%');
const T_ok_12_mmHg = tup('ok', '≤12 mmHg');
const T_mid_10 = tup('mid', '≥10%');
const T_hi_10 = tup('hi', '<10%');
const HVPG_T = { hi: tup('hi', 'CSPH'), mid: tup('mid', 'Mild'), ok: tup('ok', 'Normal') };
const PPG_T = { hi: tup('hi', 'Bleed risk'), mid: tup('mid', 'High'), ok: tup('ok', 'Normal') };
const NO_RATE = tup(null, '');
export const vSize = (v) => (v < 2.5 ? T_ok_None : v < 5 ? T_mid_Small : T_hi_Large);

export const RATE = {
  hvpg: (v) => HVPG_T[hvpgRate(v)],
  ppg: (v) => PPG_T[ppgRate(v)],
  pv: (v) => (v >= 15 ? T_hi_Severe : v > 10 ? T_mid_High : T_ok_Normal),
  // The wedged and free pressures have no cut-offs of their own in the guidelines, so each reads as the pressure it stands for: the wedged
  // (sinusoidal, in a healthy liver about the portal) pressure as the portal vein's, the free one as the IVC's, which AASLD 2024 (Box 2) says it
  // should match within 2 mmHg. (Their summary-table arrows use the same numbers: RAW.)
  whvp: (v) => (v >= 15 ? T_hi_Severe : v > 10 ? T_mid_High : T_ok_Normal),
  fhvp: (v) => (v > 8 ? T_hi_High : T_ok_Normal),
  sin: (v) => (v >= 12 ? T_hi_Severe : v >= 9 ? T_mid_High : T_ok_Normal),
  saag: (v, f) => (f.asc < NO_ASC ? T_null_No_ascites : v >= 1.1 ? T_hi_Portal_HTN : T_ok_Not_portal),
  // (Protein is neither good nor bad, except that below 1.5 g/dL it no longer guards against infection.)
  tp: (v, f) => (f.asc < NO_ASC ? T_null_No_ascites : v >= 2.5 ? T_info_High : v < 1.5 ? T_mid_SBP_risk : T_info_Low),
  asc: (v) => (v < NO_ASC ? T_ok_None : v < 1500 ? T_mid_Grade_1 : v < 5000 ? T_hi_Grade_2 : T_hi_Grade_3),
  varix: vSize, gv: vSize,
  spleen: (v) => (v > 16 ? T_hi_Large : v > 13 ? T_mid_Large : T_ok_Normal),
  plt: (v) => (v < 100 ? T_hi_Severe : v < 150 ? T_mid_Low : T_ok_Normal),
  // (A flow that reads 0.0 is no flow, as with a clotted portal vein: it has no direction.)
  pvFlow: (v) => (v < 0 ? T_hi_Hepatofugal : v === 0 ? T_hi_No_flow : T_null_Hepatopetal),
  // Main portal vein velocity on Doppler: 15 cm/s or more normal, slower is slow, under 9 stasis, below zero reversed.
  pvVel: (v) => (v < 0 ? T_hi_Reversed : v < FLOW_CUTS.stasis ? T_hi_Stasis : v < 15 ? T_mid_Slow : T_ok_Normal),
  liver: (v) => (v <= 55 ? T_hi_Severe : v <= 75 ? T_mid_Low : T_ok_Normal),
  shunt: (v) => (v >= 0.3 ? T_hi_Large : v >= 0.1 ? T_mid_Moderate : T_ok_Small),
  map: (v) => (v < KIDNEY_CUTS.mapBeta ? T_hi_Low : T_ok_Normal),
  // Kidney pressure (MAP less the abdomen's, kidney-cuts.js): a pressure, not kidney function. Red below the MAP line of Baveno VIII 4.6 carried over to it.
  rpp: (v) => (rppSev(v) === 'danger' ? T_hi_Low : T_ok_Normal),
  // Liver stiffness (Baveno VIII): under 10 kPa normal, 10 to 15 suggests cACLD, 15 to 25 borderline (the gray zone), 25 or more
  // CSPH (all suggestive, not proof: the slides' words say "likely").
  lsm: (v) => (v >= 25 ? T_hi_CSPH : v >= 15 ? T_mid_Borderline : v >= 10 ? T_mid_cACLD : T_ok_Normal),
  // Spleen stiffness (Baveno VIII, the 100 Hz probe; ssm-cuts.js): over 55 kPa CSPH, under 40 low (the screening scope can be spared
  // without a beta-blocker), the gray zone between. (A healthy spleen reads about 17; the bar's tick at 25 is the resolution cut-off.)
  ssm: (v) => (v > SSM_CUTS.ruleIn ? T_hi_CSPH : v >= SSM_CUTS.spareScope ? T_mid_Gray : T_ok_Low),
  ra: (v) => (v > 8 ? T_hi_High : T_ok_Normal),
  salb: (v) => (v < 3.5 ? T_mid_Low : T_ok_Normal),
  // (A slow rate is no warning on its own: beta-blocked patients aim for 55 to 60, so its band is plain gray.)
  hr: (v) => (v < 60 ? T_info_Slow : v > 100 ? T_hi_Fast : T_ok_Normal),
  ivc: (v) => (v > 8 ? T_hi_High : T_ok_Normal),
  // Portal vein clot, the share of the lumen it fills, in EASL 2025's grades (Table 4): minimal up to half, partial past it, complete.
  clot: (v) => (v >= 0.995 ? T_hi_Complete : v > 0.5 ? T_hi_Partial : v >= 0.05 ? T_mid_Minimal : T_ok_None),
  hb: (v) => (v < 7 ? T_hi_Severe : v < 12 ? T_mid_Low : T_ok_Normal),
  // (Where the hemoglobin is heading once the plasma has refilled after a bleed, engine.js RED: read against the same cut-offs, the 7 a transfusion is given at.)
  hbTo: (v) => (v < 7 ? T_hi_Severe : v < 12 ? T_mid_Low : T_ok_Normal),
  // Cardiac output and blood volume (22 Oct, Mohammad: any tile should show its normal where it can). The guideline files give no numbers for
  // either, so these are the standard physiology ranges: a resting adult's cardiac output is 4 to 8 L/min (cardiac index 2.5 to 4 L/min/m²), and
  // the blood volume is about 70 mL/kg, 4.5 to 5.5 L for the model's 70 kg adult (±10% of its 5.0 L). Low is the warning (red). High is only
  // information (gray, like a slow heart rate): pregnancy, fever or cirrhosis's hyperdynamic circulation raise both without anything being wrong
  // with the tile's reading itself, so it never reads as a fault.
  co: (v) => (v < 4 ? T_hi_Low : v > 8 ? T_info_High : T_ok_Normal),
  bv: (v) => (v < 4500 ? T_hi_Low : v > 5500 ? T_info_High : T_ok_Normal),
  // The model's encephalopathy risk index (metrics.heRisk: the shunted share of the portal blood and the liver's lost perfusion, weighted by cirrhosis, 0 to 1): Low under 0.2,
  // Moderate under 0.45, High from there. It is the model's own index, not a clinical score, and its tile says so.
  he: (v) => (v < 0.2 ? T_ok_Low : v < 0.45 ? T_mid_Moderate : T_hi_High),
  // The HVPG response (slide field hvpgResp): the fall from a named slide's HVPG, in percent. A fall of 10% or more marks a response
  // before any bleed, 20% or more, or to 12 mmHg or less, after one (AASLD 2024; the Baveno meetings).
  // (respAt: the HVPG now, as its tile prints it; the bar's bands read the fall alone.)
  hvpgFall: (v, f) => (v >= 20 ? T_ok_20 : f?.respAt != null && f.respAt <= 12 ? T_ok_12_mmHg : v >= 10 ? T_mid_10 : T_hi_10),
};
// Each tile: its name (n: a short one for a narrow tile, three in a row on a tablet or phone), what it is, the unit, the decimals (1 unless d), a scale (x) and which way is better
// (−1 lower, 1 higher) for the colour of a change.
export const TILE = {
  hvpg: { t: 'HVPG', s: 'Wedged − free', u: 'mmHg', better: -1 },
  ppg: { t: 'PPG', s: 'Portal − IVC', u: 'mmHg', better: -1 },
  pv: { t: 'Portal vein pressure', n: 'Portal', s: 'Pressure', u: 'mmHg', better: -1 },
  sin: { t: 'Sinusoidal pressure', n: 'Sinusoids', s: 'Pressure', u: 'mmHg', better: -1 },
  whvp: { t: 'WHVP', s: 'Wedged hepatic vein', u: 'mmHg', better: -1 },
  fhvp: { t: 'FHVP', s: 'Free hepatic vein', u: 'mmHg', better: -1 },
  saag: { t: 'SAAG', s: 'Serum − ascites albumin', u: 'g/dL' },
  tp: { t: 'Ascites protein', n: 'Protein', s: 'Total protein', u: 'g/dL' },
  asc: { t: 'Ascites', s: 'Volume', u: 'L', x: 0.001, better: -1 },
  varix: { t: 'Esophageal varix', n: 'Varix', s: 'Diameter', u: 'mm', better: -1 },
  gv: { t: 'Gastric varix', n: 'Fundal', s: 'Fundal, diameter', u: 'mm', better: -1 },
  spleen: { t: 'Spleen', s: 'Length', u: 'cm', better: -1 },
  plt: { t: 'Platelets', s: 'Thousands per µL', u: '×10³/µL', d: 0, better: 1 },
  pvFlow: { t: 'Portal vein flow', n: 'Portal flow', s: 'Mean', u: 'L/min' },
  pvVel: { t: 'Portal vein velocity', n: 'PV velocity', s: 'Doppler, main portal vein', u: 'cm/s', d: 0, better: 1 },
  liver: { t: 'Sinusoidal flow, % of normal', n: 'Sinusoid flow', s: 'Portal + arterial, of a healthy liver', u: '%', d: 0, better: 1 },
  shunt: { t: 'Shunted', s: 'Portal blood bypassing the liver', u: '%', x: 100, d: 0, better: -1 },
  map: { t: 'Blood pressure', n: 'MAP', s: 'Mean arterial', u: 'mmHg', d: 0 },
  rpp: { t: 'Kidney pressure', n: 'Kidney', s: 'MAP − abdomen', u: 'mmHg', d: 0, better: 1 },
  hr: { t: 'Heart rate', n: 'HR', s: 'Beats a minute', u: '/min', d: 0 },
  lsm: { t: 'Liver stiffness', n: 'Stiffness', s: 'FibroScan', u: 'kPa', better: -1 },
  ssm: { t: 'Spleen stiffness', n: 'SSM', s: 'FibroScan, 100 Hz probe', u: 'kPa', better: -1 },
  clot: { t: 'Portal vein clot', n: 'Clot', s: 'Share of the lumen', u: '%', x: 100, d: 0, better: -1 },
  ra: { t: 'Right atrial pressure', n: 'RA', s: 'Pressure', u: 'mmHg', better: -1 },
  salb: { t: 'Serum albumin', n: 'Albumin', s: 'Blood', u: 'g/dL', better: 1 },
  ivc: { t: 'IVC pressure', n: 'IVC', s: 'Pressure', u: 'mmHg', better: -1 },
  hb: { t: 'Hemoglobin', n: 'Hb', s: 'Blood', u: 'g/dL', better: 1 },
  hbTo: { t: 'Hemoglobin to come', n: 'Hb to come', s: 'Once the plasma refills', u: 'g/dL', better: 1 },
  co: { t: 'Cardiac output', n: 'Output', s: 'Heart', u: 'L/min' },
  bv: { t: 'Blood volume', n: 'Volume', s: 'Whole blood', u: 'L', x: 0.001 },
  he: { t: 'Encephalopathy risk', n: 'HE risk', s: 'Model index from the shunted blood and the liver\'s own flow, high ≥0.45', u: '', d: 2, better: -1 },
};
// Tiles worked out by the presenter rather than read from the live fingerprint: the HVPG response (slide field hvpgResp), the fall
// from a named slide's HVPG.
export const DERIVED_TILE = { scope: { t: 'Endoscopic view', s: '', u: '' }, hvpgFall: { t: 'HVPG fall', s: 'From the slide named', u: '%', d: 0, better: 1 } };
export const tileOf = (k) => TILE[k] ?? DERIVED_TILE[k];
// After TIPS the PPG is read against its target (below 12 mmHg): its tile, and the pill that prints it, never say "High" under a
// line that says the target is reached.
export const tipsGoal = (v) => (v < PPG_CUTS.red ? ['ok', 'Target met'] : ['hi', 'Above target']);
export const rateOf = (k, f) => (RATE[k] && f && f[k] != null ? RATE[k](f[k], f) : NO_RATE);
// A value as its tile prints it (the tile's scale and decimals), back in the model's units: a tile's word judges the number it
// shows, so "5.0 L" is Grade 3 and "2.5 mm" Small, never the unrounded 4.98 L or 2.49 mm behind them.
// (Each tile's last answer is kept with the number it was made from: a frame that asks again for the same reading makes nothing.)
const shownIn = new Map(), shownOut = new Map();
export const tileShown = (k, v) => {
  if (v == null || !Number.isFinite(v)) return v;
  if (shownIn.get(k) === v) return shownOut.get(k);
  const x = tileOf(k)?.x ?? 1;
  const out = +(+(v * x).toFixed(tileOf(k)?.d ?? 1) / x).toPrecision(12) || 0;   // alloc-rare: only when the tile's reading changes (−0 reads as 0: no flow has no direction)
  shownIn.set(k, v); shownOut.set(k, out);
  return out;
};
export const rateShown = (k, f) => (f && f[k] != null ? rateOf(k, { ...f, [k]: tileShown(k, f[k]) }) : rateOf(k, f));
// Each tile's scale bar, in the units the tile shows: [from, to, the cut-offs between its coloured bands]. The bands take their
// colour from the tile's own rating, so the bar and the status word always agree. (Every tile has its bands: a tile is left bare only where no normal exists.)
export const SCALE = {
  hvpg: [0, 25, [5, 10]], ppg: [0, 25, [6, 12]], pv: [0, 30, [10, 15]], sin: [0, 20, [9, 12]], whvp: [0, 30, [10, 15]], fhvp: [0, 20, [8]],
  saag: [0, 3, [1.1]], tp: [0, 5, [1.5, 2.5]], asc: [0, 8, [0.15, 1.5, 5]],
  varix: [0, 10, [2.5, 5]], gv: [0, 10, [2.5, 5]], spleen: [8, 22, [13, 16]], plt: [0, 300, [100, 150]],
  pvFlow: [-0.6, 2, [0]], pvVel: [0, 50, [FLOW_CUTS.stasis, 15]], liver: [0, 125, [55, 75]], shunt: [0, 100, [10, 30]], map: [40, 120, [KIDNEY_CUTS.mapBeta]], rpp: [30, 100, [KIDNEY_CUTS.rpp]],
  lsm: [0, 35, [10, 15, 25]], ssm: [0, 100, [SSM_CUTS.resolved, SSM_CUTS.spareScope, SSM_CUTS.ruleIn]], clot: [0, 100, [5, 50]], ra: [0, 20, [8]], ivc: [0, 20, [8]], salb: [1.5, 5.5, [3.5]], hb: [4, 18, [7, 12]], hbTo: [4, 18, [7, 12]], hr: [30, 200, [60, 100]],
  // (Volume and output were a plain bar until 22 Oct. The model's patients run from 3.0 to 8.4 L/min, which the output's scale holds. The volume's
  // 4.5 and 5.5 are three characters wide and the tile's bar is 88 px on a phone with three tiles in a row, so its scale is kept tight: just
  // over a third of the bar between them, and the first well clear of the bar's start, or the two numbers would crowd each other out (the bars
  // drop them within 8 px). A pregnancy's 7.1 L rests against the end, as a platelet count of 380 does.)
  bv: [4.1, 7, [4.5, 5.5]], co: [2, 11, [4, 8]],
  he: [0, 1, [0.2, 0.45]],
  hvpgFall: [0, 40, [10, 20]],
};
// A bar's bands: each from a to b (shown units), and m, its middle in the model's units (what the rating reads).
export const bandsOf = (k) => {
  const s = SCALE[k]; if (!s) return null;
  if (!s[2].length) return [];   // (no cut-offs: a plain track)
  const x = TILE[k]?.x ?? 1, e = [s[0], ...s[2], s[1]];
  return e.slice(0, -1).map((a, i) => ({ a, b: e[i + 1], m: (a + e[i + 1]) / 2 / x }));
};
// The figure's "Portal blood" callout: whole-percent shares to the shunts and the liver that always add to 100, and the
// shunt's rating, the same as its data card tile's (ok, mid: amber, hi: red).
// (One kept answer, written in place and read by its caller as it is returned.)
const SPLIT = { shunt: 0, liver: 100, rate: 'ok' };
export const portalSplit = (sh) => { const v = Math.min(1, Math.max(0, +sh || 0)), s = Math.round(v * 100); SPLIT.shunt = s; SPLIT.liver = 100 - s; SPLIT.rate = RATE.shunt(v)[0]; return SPLIT; };

// The table's columns: the raw pressures shade above normal, the rest by their tile's rating.
// Headers match the pressure chart's axis (PV, WHVP, FHVP, IVC, RA). res: the resistance inside the liver, as the model has it (rih). (PPG ÷ portal flow would also count the collaterals,
// whose resistance rises as propranolol lowers the pressure, and read as if the drug raised the liver's.)
export const COLS = { pv: 'PV', whvp: 'WHVP', fhvp: 'FHVP', ivc: 'IVC', ra: 'RA', hvpg: 'HVPG', ppg: 'PPG', sin: 'Sinusoids', varix: 'Varix', gv: 'Fundal', asc: 'Ascites', liver: 'Liver flow', shunt: 'Shunted', saag: 'SAAG', tp: 'Protein', plt: 'Platelets', lsm: 'LSM', ssm: 'SSM', spleen: 'Spleen', map: 'MAP', rpp: 'Kidney P', hr: 'HR', hb: 'Hb', hbTo: 'Hb to come', co: 'Output', bv: 'Volume', he: 'HE risk', pvFlow: 'Flow (Q)', pvVel: 'PV velocity', res: 'Liver R' };
// Each column's cut-offs (the same as the readouts' status colors), shown on its heading (hover, or a tap under the table) so the legend can stay short.
export const CUT = { pv: '↑ >10, ↑↑ ≥15 mmHg', whvp: '↑ >10, ↑↑ ≥15 mmHg', fhvp: '↑ >8, ↑↑ >16 mmHg', ivc: '↑ >8, ↑↑ >16 mmHg', ra: '↑ >8, ↑↑ >16 mmHg',
  hvpg: '↑ ≥5, ↑↑ ≥10 mmHg', ppg: '↑ ≥6, ↑↑ ≥12 mmHg', sin: '↑ ≥9, ↑↑ ≥12 mmHg', varix: '↑ 2.5 to 5 mm, ↑↑ ≥5 mm', gv: '↑ 2.5 to 5 mm, ↑↑ ≥5 mm (fundal varix)',
  plt: '↓ <150, ↓↓ <100 × 10³/µL', lsm: '↑ 10 to 25, ↑↑ ≥25 kPa', ssm: `↑ ${SSM_CUTS.spareScope} to ${SSM_CUTS.ruleIn}, ↑↑ >${SSM_CUTS.ruleIn} kPa`, spleen: '↑ >13, ↑↑ >16 cm', liver: '↓ ≤75%, ↓↓ ≤55%', shunt: '↑ ≥10%, ↑↑ ≥30%', map: `↓↓ <${KIDNEY_CUTS.mapBeta} mmHg`, rpp: `↓↓ <${KIDNEY_CUTS.rpp} mmHg (pressure, not kidney function)`, hr: '↑↑ >100 beats/min (slow, <60, is not flagged)', hb: '↓ <12, ↓↓ <7 g/dL', hbTo: '↓ <12, ↓↓ <7 g/dL, once the plasma refills', co: '↓↓ <4 L/min (high, >8, is not flagged)', bv: '↓↓ <4.5 L (high, >5.5, is not flagged)', he: '↑ 0.2 to 0.45, ↑↑ ≥0.45 (the model\'s index, not a clinical score)',
  asc: '↑ grade 1, ↑↑ grade 2 or 3', saag: '↑ ≥1.1 g/dL: portal hypertension; ↓ <1.1', tp: '↑ ≥2.5 g/dL, ↓ <2.5 (ascites protein)', pvFlow: '↓ <0.9 L/min, ↓↓ stasis or reversed; ↑ >1.3 L/min (fasting normal)', pvVel: '↓ <15 cm/s (slow), ↓↓ stasis or reversed (main portal vein, Doppler)' };
/** A cut-off as the words write it: a comparison is always a symbol (> < ≥ ≤), never "more than" or "150,000+" (Mohammad, 26 Oct); "{>=10 mmHg}" reads "≥10 mmHg". */
export const cutText = (c) => String(c).replace(/^>=\s*/, '≥').replace(/^<=\s*/, '≤').replace(/^([<>≥≤])\s+/, '$1');
// Raw pressures, in whole mmHg: ↑ over the first, ↑↑ over the second. PV and WHVP follow the portal pressure readout (normal 10 or less, high from 15).
export const RAW = { pv: [10, 14], whvp: [10, 14], fhvp: [8, 16], ivc: [8, 16], ra: [8, 16] };
export const UP_GOOD = new Set(['liver', 'plt', 'map', 'rpp', 'salb', 'hb', 'hbTo', 'pvVel']);   // (higher is better: a low one rates amber or red, an arrow down)
export const PRESS = new Set(['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg', 'sin', 'map', 'rpp']);
export const fpv = (k, f) => (k === 'ivc' ? f.ivc ?? f.ra : k === 'res' ? f.rih ?? null : f[k]);
// A cell's direction: against the normal range ('abs': ↑ above, ↑↑ well above or past the red cut-off, ↓ below, a dash within),
// or against a reference patient's value ('rel': the treatments table's baseline, or the row a row names).
// Both read the value as the table prints it, so two cells showing the same number always carry the same arrow.
export function dirAbs(k, f) {
  const v = atShown(k, fpv(k, f));
  if (RAW[k]) return v > RAW[k][1] ? 2 : v > RAW[k][0] ? 1 : 0;
  // Portal flow: reduced under 0.9 L/min; stasis (under 9 cm/s) or reversed is past the red line; above the fasting range after a meal or a TIPS.
  if (k === 'pvFlow') return v < -0.02 || (f.pvVel != null && Math.abs(f.pvVel) < FLOW_CUTS.stasis) ? -2 : v < 0.9 ? -1 : v > 1.3 ? 1 : 0;
  if (k === 'asc') return v < NO_ASC ? 0 : rateOf(k, f)[0] === 'hi' ? 2 : 1;
  // Output and volume: only a low one is flagged (↓↓); a high one is information, as its tile's gray reads it, like a slow heart rate.
  if (k === 'co' || k === 'bv') return rateOf(k, { ...f, [k]: tileShown(k, fpv(k, f)) })[0] === 'hi' ? -2 : 0;
  const r = rateOf(k, { ...f, [k]: v })[0], sign = UP_GOOD.has(k) ? -1 : 1;
  return r === 'hi' ? 2 * sign : r === 'mid' ? sign : 0;
}
// Against the baseline every real change shows (octreotide's half-millimetre, banding's slight rise), so the steps are small.
export const STEP_REL = { pv: .5, whvp: .5, fhvp: .5, ivc: .5, ra: .5, hvpg: .5, ppg: .5, sin: .5, varix: .3, gv: .3, asc: 100, liver: 2, shunt: .05, pvFlow: .15, pvVel: 2, res: 1.5, map: 2, rpp: 2, hr: 2, co: .3, bv: 100, he: .05, hb: 1, hbTo: 1 };   // (hemoglobin: about one unit's worth)
export function dirRel(k, f, ref) {
  const a = atShown(k, fpv(k, f)), b = atShown(k, fpv(k, ref));
  if (a == null || b == null) return 0;
  const d = a - b, r = Math.abs(d) / Math.max(Math.abs(b), 1e-6);
  return Math.abs(d) < (STEP_REL[k] ?? 1) ? 0 : (d > 0 ? 1 : -1) * (r >= 0.4 ? 2 : 1);
}
export const DP = { varix: 1, gv: 1, asc: 1, lsm: 1, ssm: 1, spleen: 1, pvFlow: 1, res: 1, liver: 0, shunt: 2, plt: 0, map: 0, rpp: 0, hr: 0, he: 2, pvVel: 0 };
export const atShown = (k, v) => { if (v == null) return v; if (k === 'asc') return Math.round(v / 100) * 100; const d = PRESS.has(k) ? 0 : DP[k] ?? 1, m = 10 ** d; return Math.round(v * m) / m; };

// In the comparison table a change is coloured by what it means for the patient: green better, red worse.
// Lower is better everywhere except blood flow to the liver, platelets, blood pressure, albumin and hemoglobin; portal flow is neither.
// (A portal flow above the fasting range is the gut being fed, not a disease: it keeps neutral ink.)
export const rateAbs = (k, d) => (k === 'pvFlow' && d > 0 ? null : ({ 1: 'mid', 2: 'hi' })[Math.abs(d)] ?? null);
export const effOf = (k, d) => (d === 0 || k === 'pvFlow' ? null : (UP_GOOD.has(k) ? d > 0 : d < 0) ? 'good' : 'bad');

// A what-if (a compare button or slider) follows the live model until the readings it shows have held still for
// LIVE_STEADY ms, never less than LIVE_MIN ms and at most LIVE_MAX: the slow parts of the model (the arterial buffer,
// the baroreflex) take tens of seconds, and a fixed 7 s left the tiles frozen mid-ease (two inflows, "Buffer off").
export const LIVE_MIN = 7000, LIVE_STEADY = 2000, LIVE_MAX = 60000;
export const liveSettled = (elapsed, steady) => elapsed >= LIVE_MAX || (elapsed >= LIVE_MIN && steady >= LIVE_STEADY);
// The readings as a what-if's card prints them (its tiles, and the ladder's stations), so a drift too small to show counts as still.
export const shownSig = (f, keys) => keys.map((k) => (f[k] == null ? '—' : (f[k] * (TILE[k]?.x ?? 1)).toFixed(TILE[k]?.d ?? 1))).join('|'); // alloc-rare: polled every 150 ms while a slide settles, never per frame
/** The heading a summary row shows over its name (a site's "Intrahepatic · " is left off: its colour says it). */
export const headOf = (r) => (r.kicker || '').replace('Intrahepatic · ', '');
/** A row's heading is a repeat when the row above shows the same words in the same site's colour: the table draws it once, over the first (presenter.js summaryTable). */
export const sameHead = (a, b) => !!a && !!b && !!headOf(a) && headOf(a) === headOf(b) && (a.site || '') === (b.site || '');
/** The decimals a scale bar's cut-off number prints: the ones the cut-off has (0.15 L, 0.45, 2.5), so it never reads "0.1" or "0.5" beside a tile that says 0.12 or 0.47. */
export const cutDp = (c) => (Math.abs((c * 10) % 1) > 1e-9 ? 2 : Math.abs(c % 1) > 1e-9 ? 1 : 0);
