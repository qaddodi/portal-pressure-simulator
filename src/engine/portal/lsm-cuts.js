// Liver stiffness (VCTE, kPa) and the platelet count: Baveno VIII's rule of 5 and its Fig. 1, in one place (review FS-1, 15 Nov 2026). Read by the
// FibroScan card's bar (fibroscan.js), the tiles (table-marks.js). No imports, so the worker loads it too.
// - below 10: cACLD is unlikely (1.3); 10 to 15: suggests cACLD; above 15: highly likely (1.3);
// - each further 5 kPa from 10 to 25 carries a higher risk of decompensation (1.8, the rule of 5);
// - ≤15 with platelets ≥150 ×10⁹/L rules CSPH out (1.15); ≥25 rules CSPH in (1.16 b; BMI <30 for MASLD).
import { PPG_CUTS } from './pressure-cuts.js';
export const LSM_CUTS = Object.freeze({ unlikely: 10, likely: 15, ruleIn: 25, ruleOutPlt: 150 });
/** The steps of the rule of five the bar prints a tick at. */
export const LSM_STEPS = Object.freeze([5, 10, 15, 20, 25]);

/** Where Baveno VIII's stiffness rules for CSPH (1.15 to 1.17, 1.19) can be read: they are written for compensated advanced chronic liver disease, a liver stiff from scar.
 *  Two states are outside them, told from the model's own state, never from a patient's name (so every preset and every patient built by hand is judged alike):
 *  - 'congested': a liver stiff from the pressure in its veins (right heart failure, constrictive pericarditis, an IVC web, Budd–Chiari). The free hepatic vein
 *    pressure (mmHg, as printed) is CONGESTION_FHVP or more: 4 mmHg above the hepatic vein's normal 4 (engine.js CONGESTED_FROM), where the sinusoids stop dilating
 *    and stiffness climbs (metrics.js lsmOf adds 2 kPa per mmHg from 6);
 *  - 'vascular': portal hypertension or a raised stiffness with no sinusoidal scar (the model's cirrhosis slider under SCAR_MIN): sinusoidal obstruction syndrome,
 *    portal vein thrombosis, schistosomiasis, porto-sinusoidal vascular disease. A normal stiffness does not exclude portal hypertension there, and a raised one is not fibrosis. */
export const CONGESTION_FHVP = 8;
export const SCAR_MIN = 0.3;
/** The portal pressure gradient (mmHg) from which portal hypertension is present without a scar: the model's amber PPG line (pressure-cuts.js PPG_CUTS.amber). */
const PH_PPG = PPG_CUTS.amber;
/** The context of a state's stiffness: 'congested', 'vascular' or null (the rules apply, or there is no liver disease to apply them to). Takes the fingerprint's or the metrics' own
 *  fields { fhvp, scar, ppg, lsm }; a missing one rules nothing out (no scar given: the liver is read as the rules expect). */
export function lsmContext(s) {
  if (!s) return null;
  if (Number.isFinite(s.fhvp) && s.fhvp >= CONGESTION_FHVP) return 'congested';
  if (Number.isFinite(s.scar) && s.scar < SCAR_MIN && ((Number.isFinite(s.ppg) && s.ppg >= PH_PPG) || (Number.isFinite(s.lsm) && s.lsm >= LSM_CUTS.unlikely))) return 'vascular';
  return null;
}
/** Whether a free hepatic vein pressure (mmHg, as printed; null when unknown) marks a congested liver. */
export const congestedLiver = (fhvp) => lsmContext({ fhvp }) === 'congested';

/** What the stiffness and the platelets say about CSPH (Baveno VIII 1.15, 1.16 b): 'out' at ≤15 kPa with platelets ≥150, 'in' from 25 kPa,
 *  else 'open'. A missing platelet count rules nothing out. Read as printed (the caller passes the values as the card shows them).
 *  The rules' eligibility check: with a context (lsmContext) none of them applies, and the answer is that context, 'congested' or 'vascular'. */
export function csphVerdict(lsm, plt, ctx = null) {
  if (!Number.isFinite(lsm)) return null;
  if (ctx === 'congested' || ctx === 'vascular') return ctx;
  if (lsm >= LSM_CUTS.ruleIn) return 'in';
  return lsm <= LSM_CUTS.likely && Number.isFinite(plt) && plt >= LSM_CUTS.ruleOutPlt ? 'out' : 'open';
}
