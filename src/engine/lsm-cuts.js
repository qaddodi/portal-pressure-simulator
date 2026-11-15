// Liver stiffness (VCTE, kPa) and the platelet count: Baveno VIII's rule of 5 and its Fig. 1, in one place (review FS-1, 15 Nov 2026). Read by the
// FibroScan card's bar (fibroscan.js), the tiles (table-marks.js). No imports, so the worker loads it too.
// - below 10: cACLD is unlikely (1.3); 10 to 15: suggests cACLD; above 15: highly likely (1.3);
// - each further 5 kPa from 10 to 25 carries a higher risk of decompensation (1.8, the rule of 5);
// - ≤15 with platelets ≥150 ×10⁹/L rules CSPH out (1.15); ≥25 rules CSPH in (1.16 b; BMI <30 for MASLD).
export const LSM_CUTS = Object.freeze({ unlikely: 10, likely: 15, ruleIn: 25, ruleOutPlt: 150 });
/** The steps of the rule of five the bar prints a tick at. */
export const LSM_STEPS = Object.freeze([5, 10, 15, 20, 25]);

/** What the stiffness and the platelets say about CSPH (Baveno VIII 1.15, 1.16 b): 'out' at ≤15 kPa with platelets ≥150, 'in' from 25 kPa,
 *  else 'open'. A missing platelet count rules nothing out. Read as printed (the caller passes the values as the card shows them). */
export function csphVerdict(lsm, plt) {
  if (!Number.isFinite(lsm)) return null;
  if (lsm >= LSM_CUTS.ruleIn) return 'in';
  return lsm <= LSM_CUTS.likely && Number.isFinite(plt) && plt >= LSM_CUTS.ruleOutPlt ? 'out' : 'open';
}
