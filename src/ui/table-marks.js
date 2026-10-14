// The summary tables' marks and the readouts' ratings, kept free of the page so a test can recompute every cell:
// each column's cut-offs (CUT, the same as the readouts' status colors), the direction a cell's arrow points against
// normal (dirAbs) or against a reference patient (dirRel), and the colour that goes with it.

export const NO_ASC = 150;   // mL: below it there is no ascites to tap (ultrasound grade 1 starts here)
export const vSize = (v) => (v < 2.5 ? ['ok', 'None'] : v < 5 ? ['mid', 'Small'] : ['hi', 'Large']);

export const RATE = {
  hvpg: (v) => (v >= 10 ? ['hi', 'CSPH'] : v >= 5 ? ['mid', 'Mild'] : ['ok', 'Normal']),
  ppg: (v) => (v >= 12 ? ['hi', 'Bleed risk'] : v >= 6 ? ['mid', 'High'] : ['ok', 'Normal']),
  pv: (v) => (v >= 15 ? ['hi', 'Severe'] : v > 10 ? ['mid', 'High'] : ['ok', 'Normal']),
  sin: (v) => (v >= 12 ? ['hi', 'Severe'] : v >= 9 ? ['mid', 'High'] : ['ok', 'Normal']),
  saag: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 1.1 ? ['hi', 'Portal HTN'] : ['ok', 'Not portal']),
  // (Protein is neither good nor bad, except that below 1.5 g/dL it no longer guards against infection.)
  tp: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 2.5 ? ['info', 'High'] : v < 1.5 ? ['mid', 'SBP risk'] : ['info', 'Low']),
  asc: (v) => (v < NO_ASC ? ['ok', 'None'] : v < 1500 ? ['mid', 'Grade 1'] : v < 5000 ? ['hi', 'Grade 2'] : ['hi', 'Grade 3']),
  varix: vSize, gv: vSize,
  spleen: (v) => (v > 16 ? ['hi', 'Large'] : v > 13 ? ['mid', 'Large'] : ['ok', 'Normal']),
  plt: (v) => (v < 100 ? ['hi', 'Severe'] : v < 150 ? ['mid', 'Low'] : ['ok', 'Normal']),
  pvFlow: (v) => (v < 0 ? ['hi', 'Hepatofugal'] : [null, 'Hepatopetal']),
  // Main portal vein velocity on Doppler: 15 cm/s or more normal, slower is slow, under 9 stasis, below zero reversed.
  pvVel: (v) => (v < 0 ? ['hi', 'Reversed'] : v < 9 ? ['hi', 'Stasis'] : v < 15 ? ['mid', 'Slow'] : ['ok', 'Normal']),
  liver: (v) => (v <= 55 ? ['hi', 'Severe'] : v <= 75 ? ['mid', 'Low'] : ['ok', 'Normal']),
  shunt: (v) => (v >= 0.3 ? ['hi', 'Large'] : v >= 0.1 ? ['mid', 'Moderate'] : ['ok', 'Small']),
  map: (v) => (v < 65 ? ['hi', 'Low'] : ['ok', 'Normal']),
  // Liver stiffness (Baveno VIII): under 10 kPa normal, 10 to 15 suggests cACLD, 15 to 25 borderline (the gray zone), 25 or more
  // CSPH (all suggestive, not proof: the slides' words say "likely").
  lsm: (v) => (v >= 25 ? ['hi', 'CSPH'] : v >= 15 ? ['mid', 'Borderline'] : v >= 10 ? ['mid', 'cACLD'] : ['ok', 'Normal']),
  ra: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  salb: (v) => (v < 3.5 ? ['mid', 'Low'] : ['ok', 'Normal']),
  hr: (v) => [null, v < 60 ? 'Slow' : v > 100 ? 'Fast' : 'Normal'],
  ivc: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  hb: (v) => (v < 7 ? ['hi', 'Severe'] : v < 12 ? ['mid', 'Low'] : ['ok', 'Normal']),
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
  plt: { t: 'Platelets', s: '× 10⁹ per litre', u: '×10⁹/L', d: 0, better: 1 },
  pvFlow: { t: 'Portal vein flow', n: 'Portal flow', s: 'Mean', u: 'L/min' },
  pvVel: { t: 'Portal vein velocity', n: 'PV velocity', s: 'Doppler, main portal vein', u: 'cm/s', d: 0, better: 1 },
  liver: { t: 'Liver blood flow', n: 'Liver flow', s: 'Through the sinusoids, of normal', u: '%', d: 0, better: 1 },
  shunt: { t: 'Shunted', s: 'Portal blood bypassing the liver', u: '%', x: 100, d: 0, better: -1 },
  map: { t: 'Blood pressure', n: 'MAP', s: 'Mean arterial', u: 'mmHg', d: 0 },
  hr: { t: 'Heart rate', n: 'HR', s: 'Beats a minute', u: '/min', d: 0 },
  lsm: { t: 'Liver stiffness', n: 'Stiffness', s: 'FibroScan', u: 'kPa', better: -1 },
  ra: { t: 'Right atrial pressure', n: 'RA', s: 'Pressure', u: 'mmHg', better: -1 },
  salb: { t: 'Serum albumin', n: 'Albumin', s: 'Blood', u: 'g/dL', better: 1 },
  ivc: { t: 'IVC pressure', n: 'IVC', s: 'Pressure', u: 'mmHg', better: -1 },
  hb: { t: 'Hemoglobin', n: 'Hb', s: 'Blood', u: 'g/dL', better: 1 },
};
export const rateOf = (k, f) => (RATE[k] && f && f[k] != null ? RATE[k](f[k], f) : [null, '']);
// Each tile's scale bar, in the units the tile shows: [from, to, the cut-offs between its coloured bands]. The bands take their
// colour from the tile's own rating, so the bar and the status word always agree. (No bar where nothing is rated: WHVP, FHVP, HR.)
export const SCALE = {
  hvpg: [0, 25, [5, 10]], ppg: [0, 25, [6, 12]], pv: [0, 30, [10, 15]], sin: [0, 20, [9, 12]],
  saag: [0, 3, [1.1]], tp: [0, 5, [1.5, 2.5]], asc: [0, 8, [0.15, 1.5, 5]],
  varix: [0, 10, [2.5, 5]], gv: [0, 10, [2.5, 5]], spleen: [8, 22, [13, 16]], plt: [0, 300, [100, 150]],
  pvFlow: [-0.6, 2, [0]], pvVel: [0, 50, [9, 15]], liver: [0, 125, [55, 75]], shunt: [0, 100, [10, 30]], map: [40, 120, [65]],
  lsm: [0, 35, [10, 15, 25]], ra: [0, 20, [8]], ivc: [0, 20, [8]], salb: [1.5, 5.5, [3.5]], hb: [4, 18, [7, 12]],
};
// A bar's bands: each from a to b (shown units), and m, its middle in the model's units (what the rating reads).
export const bandsOf = (k) => {
  const s = SCALE[k]; if (!s) return null;
  const x = TILE[k]?.x ?? 1, e = [s[0], ...s[2], s[1]];
  return e.slice(0, -1).map((a, i) => ({ a, b: e[i + 1], m: (a + e[i + 1]) / 2 / x }));
};
// The figure's "Portal blood" callout: whole-percent shares to the shunts and the liver that always add to 100, and the
// shunt's rating, the same as its data card tile's (ok, mid: amber, hi: red).
export const portalSplit = (sh) => { const v = Math.min(1, Math.max(0, +sh || 0)), s = Math.round(v * 100); return { shunt: s, liver: 100 - s, rate: RATE.shunt(v)[0] }; };

// The table's columns: the raw pressures shade above normal, the rest by their tile's rating.
// Headers match the pressure chart's axis (PV, WHVP, FHVP, IVC, RA). res: the resistance inside the liver, as the model has it (rih). (PPG ÷ portal flow would also count the collaterals,
// whose resistance rises as propranolol lowers the pressure, and read as if the drug raised the liver's.)
export const COLS = { pv: 'PV', whvp: 'WHVP', fhvp: 'FHVP', ivc: 'IVC', ra: 'RA', hvpg: 'HVPG', ppg: 'PPG', sin: 'Sinusoids', varix: 'Varix', asc: 'Ascites', liver: 'Liver flow', shunt: 'Shunted', saag: 'SAAG', tp: 'Protein', plt: 'Platelets', lsm: 'LSM', spleen: 'Spleen', map: 'MAP', hr: 'HR', pvFlow: 'Flow (Q)', res: 'Liver R' };
// Each column's cut-offs (the same as the readouts' status colors), shown on its heading (hover, or a tap under the table) so the legend can stay short.
export const CUT = { pv: '↑ over 10, ↑↑ 15 or more mmHg', whvp: '↑ over 10, ↑↑ 15 or more mmHg', fhvp: '↑ over 8, ↑↑ over 16 mmHg', ivc: '↑ over 8, ↑↑ over 16 mmHg', ra: '↑ over 8, ↑↑ over 16 mmHg',
  hvpg: '↑ 5 or more, ↑↑ 10 or more mmHg', ppg: '↑ 6 or more, ↑↑ 12 or more mmHg', sin: '↑ 9 or more, ↑↑ 12 or more mmHg', varix: '↑ 2.5 to 5 mm, ↑↑ 5 mm or more',
  plt: '↓ under 150, ↓↓ under 100 × 10⁹/L', lsm: '↑ 10 to 25, ↑↑ 25 kPa or more', spleen: '↑ over 13, ↑↑ over 16 cm', liver: '↓ 75% or less, ↓↓ 55% or less', shunt: '↑ 10% or more, ↑↑ 30% or more', map: '↓↓ under 65 mmHg',
  asc: '↑ grade 1, ↑↑ grade 2 or 3', saag: '↑ 1.1 g/dL or more: portal hypertension; ↓ under 1.1', tp: '↑ 2.5 g/dL or more, ↓ under 2.5 (ascites protein)', pvFlow: '↓ under 0.9 L/min, ↓↓ stasis or reversed; ↑ over 1.3 L/min (fasting normal)' };
// Raw pressures, in whole mmHg: ↑ over the first, ↑↑ over the second. PV and WHVP follow the portal pressure readout (normal 10 or less, high from 15).
export const RAW = { pv: [10, 14], whvp: [10, 14], fhvp: [8, 16], ivc: [8, 16], ra: [8, 16] };
export const UP_GOOD = new Set(['liver', 'plt', 'map', 'salb']);   // (higher is better: a low one rates amber or red, an arrow down)
export const PRESS = new Set(['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg', 'sin', 'map']);
export const fpv = (k, f) => (k === 'ivc' ? f.ivc ?? f.ra : k === 'res' ? f.rih ?? null : f[k]);
// A cell's direction: against the normal range ('abs': ↑ above, ↑↑ well above or past the red cut-off, ↓ below, a dash within),
// or against a reference patient's value ('rel': the treatments table's baseline, or the row a row names).
// Both read the value as the table prints it, so two cells showing the same number always carry the same arrow.
export function dirAbs(k, f) {
  const v = atShown(k, fpv(k, f));
  if (RAW[k]) return v > RAW[k][1] ? 2 : v > RAW[k][0] ? 1 : 0;
  // Portal flow: reduced under 0.9 L/min; stasis (under 9 cm/s) or reversed is past the red line; above the fasting range after a meal or a TIPS.
  if (k === 'pvFlow') return v < -0.02 || (f.pvVel != null && Math.abs(f.pvVel) < 9) ? -2 : v < 0.9 ? -1 : v > 1.3 ? 1 : 0;
  if (k === 'asc') return v < NO_ASC ? 0 : rateOf(k, f)[0] === 'hi' ? 2 : 1;
  const r = rateOf(k, { ...f, [k]: v })[0], sign = UP_GOOD.has(k) ? -1 : 1;
  return r === 'hi' ? 2 * sign : r === 'mid' ? sign : 0;
}
// Against the baseline every real change shows (octreotide's half-millimetre, banding's slight rise), so the steps are small.
export const STEP_REL = { pv: .5, whvp: .5, fhvp: .5, ivc: .5, ra: .5, hvpg: .5, ppg: .5, sin: .5, varix: .3, asc: 100, liver: 2, shunt: .05, pvFlow: .15, res: 1.5, map: 2, hr: 2 };
export function dirRel(k, f, ref) {
  const a = atShown(k, fpv(k, f)), b = atShown(k, fpv(k, ref));
  if (a == null || b == null) return 0;
  const d = a - b, r = Math.abs(d) / Math.max(Math.abs(b), 1e-6);
  return Math.abs(d) < (STEP_REL[k] ?? 1) ? 0 : (d > 0 ? 1 : -1) * (r >= 0.4 ? 2 : 1);
}
export const DP = { varix: 1, asc: 1, lsm: 1, spleen: 1, pvFlow: 1, res: 1, liver: 0, shunt: 2, plt: 0, map: 0, hr: 0 };
export const atShown = (k, v) => { if (v == null) return v; if (k === 'asc') return Math.round(v / 100) * 100; const d = PRESS.has(k) ? 0 : DP[k] ?? 1, m = 10 ** d; return Math.round(v * m) / m; };

// In the comparison table a change is coloured by what it means for the patient: green better, red worse.
// Lower is better everywhere except blood flow to the liver, platelets, blood pressure and albumin; portal flow is neither.
// (A portal flow above the fasting range is the gut being fed, not a disease: it keeps neutral ink.)
export const rateAbs = (k, d) => (k === 'pvFlow' && d > 0 ? null : ({ 1: 'mid', 2: 'hi' })[Math.abs(d)] ?? null);
export const effOf = (k, d) => (d === 0 || k === 'pvFlow' ? null : (UP_GOOD.has(k) ? d > 0 : d < 0) ? 'good' : 'bad');
