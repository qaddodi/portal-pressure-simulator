// The kidney pressure tile's cut-offs, in one place. Kidney pressure (metrics.rpp, renal perfusion pressure) = the mean arterial pressure
// less the pressure inside the abdomen, in mmHg. It is a pressure, not kidney function: the model has no GFR, no creatinine and no renal
// blood flow, so nothing here may be worded as filtration or as an injury to the kidney. Read by the readout tile (dock.js), the data card
// tile and the summary tables (table-marks.js), the beta-blocker rows of the vitals (vital-read.js) and the kidney deck's words, so a number
// is the same colour wherever it is shown. tests/kidney-pressure.test.js keeps any other file from writing them again.
// No imports, so the worker loads it too.
//
// Checked against Baveno VIII (J Hepatol 2026), 7 Nov 2026:
// - mapBeta: 4.6, carvedilol/cNSBBs are dose-reduced or discontinued with persistently low blood pressure (systolic <90 mmHg or mean
//   arterial pressure <65 mmHg) and/or HRS-AKI; 4.7, re-initiated and/or re-titrated once the HRS-AKI has resolved and/or the blood
//   pressure has recovered. The guideline's number is on the MAP, so the tile's red line is that MAP at the abdomen's resting pressure.
// - iapRest: the model's resting intra-abdominal pressure (physiology.js iapFromAscites, 5 mmHg with no ascites). It is the model's, not a
//   guideline number.
// - rpp: mapBeta less iapRest. Baveno VIII gives no cut-off for a kidney pressure: this is the MAP line carried over to the tile, so a
//   tense abdomen (a higher IAP) takes a patient across it at a higher MAP than 65.
// - sbpBeta: the other half of 4.6, the systolic pressure (engine.js bpNow).
export const MAP_BETA_CUT = 65;
export const SBP_BETA_CUT = 90;
export const IAP_REST = 5;
export const KIDNEY_CUTS = Object.freeze({ mapBeta: MAP_BETA_CUT, sbpBeta: SBP_BETA_CUT, iapRest: IAP_REST, rpp: MAP_BETA_CUT - IAP_REST });

/** The kidney pressure's status as the colour tokens name it: 'ok' (green) or 'danger' (red, below the line). */
export const rppSev = (v) => (v < KIDNEY_CUTS.rpp ? 'danger' : 'ok');
export const RPP_WORDS = Object.freeze({ ok: 'Normal', danger: 'Low' });
