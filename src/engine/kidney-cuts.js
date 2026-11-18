// The blood-pressure cut-offs of the beta-blocker rule (Baveno VIII 4.6), in one place. Read by the readout tile (dock.js), the data card tile
// and the summary tables (table-marks.js), the beta-blocker rows of the vitals (vital-read.js) and the kidney deck's words, so a number is
// the same colour wherever it is shown. tests/kidney-pressure.test.js keeps any other file from writing them again.
// No imports, so the worker loads it too.
//
// Checked against Baveno VIII (J Hepatol 2026), 7 Nov 2026:
// - mapBeta: 4.6, carvedilol/cNSBBs are dose-reduced or discontinued with persistently low blood pressure (systolic <90 mmHg or mean
//   arterial pressure <65 mmHg) and/or HRS-AKI; 4.7, re-initiated and/or re-titrated once the HRS-AKI has resolved and/or the blood
//   pressure has recovered. The guideline's number is on the MAP, so the MAP tile's red line is that number.
// - sbpBeta: the other half of 4.6, the systolic pressure (engine.js bpNow).
// - iapRest: the model's resting intra-abdominal pressure (physiology.js iapFromAscites, 5 mmHg with no ascites). It is the model's, not a
//   guideline number.
//
// There is NO cut-off for MAP − IAP, and none may be derived. metrics.rpp (the key keeps its first name, because saved decks and shared
// links name it) is the abdominal perfusion pressure (APP = MAP − IAP, the WSACS definition; PMID 23673399), not a renal perfusion
// pressure: the model has no GFR, no creatinine and no renal blood flow, and the consensus did not endorse an APP target for
// resuscitation. Subtracting the resting IAP from the MAP line of 4.6 gave a line (60 mmHg) that no guideline states, so the tile reads as
// a number only: no status word, no colour, no tick (R03 of the external production review, 15 Nov 2026).
export const MAP_BETA_CUT = 65;
export const SBP_BETA_CUT = 90;
export const IAP_REST = 5;
export const KIDNEY_CUTS = Object.freeze({ mapBeta: MAP_BETA_CUT, sbpBeta: SBP_BETA_CUT, iapRest: IAP_REST });
