// Spleen stiffness (SSM, transient elastography on the spleen-dedicated 100 Hz probe, kPa): the model's reading and the guideline
// cut-offs, in one place. Read by the metrics (metrics.js ssmOf), the FibroScan card (fibroscan.js), the tiles (table-marks.js) and
// the decks' words, so a number is the same wherever it is shown. No imports, so the worker loads it too.
//
// How the model reads it (metrics.js ssmOf), from two things it already has, so it is not a number of its own:
// - congestion: the red pulp's transmural pressure (the spleen node's pressure less the abdomen's, engine.js ext) above its normal
//   12 mmHg. A congested, encapsulated organ stiffens with its distending pressure, as the liver does in heart failure; this part
//   moves within minutes, so it falls at once when a TIPS opens and with a beta-blocker (Baveno VIII does not use the SSM to judge a
//   beta-blocker's effect: the model only lets the pressure through);
// - remodeling: red pulp hyperplasia and fibrosis, which follow the spleen's size (slow state, a time constant of 45 model days)
//   above a normal 11 cm. This part stays for months after the pressure falls.
// Calibrated to a healthy spleen of about 17 kPa, about 50 at an HVPG of 11 to 12 in cirrhosis, ≥55 from an HVPG of about 13,
// 70 and over in decompensated disease, and the probe's ceiling of 100. Pre-hepatic and presinusoidal disease (portal or splenic
// vein thrombosis, schistosomiasis) read high with a soft liver, because the spleen sees the portal pressure the liver does not.
//
// Checked against Baveno VIII (J Hepatol 2026, the statements and Figs. 1 and 2) and AASLD 2024, 6 Nov 2026:
// - ruleIn: 1.16c, cACLD of any cause: "SSM (100 Hz) >55 kPa" establishes CSPH (Figs. 1 and 2 print it as ≥55; the statement's >55 is used).
// - spareScope: 1.19, a patient who cannot take a beta-blocker skips the screening EGD at SSM <40 kPa (or LSM <20 kPa with platelets
//   ≥150). In PSVD/NCPF, SSM >40 kPa is a specific sign of portal hypertension (8.44), and EGD is not needed at SSM <40 kPa with a
//   bilirubin <1 mg/dL (8.47).
// - resolved, resolvedLsm: 7.19b, recompensated cirrhosis: LSM <15 kPa plus SSM <25 kPa may rule CSPH out (LoE 4, weak).
// - Baveno VIII gives no SSM rule-out of its own. Baveno VII's (50 Hz probe, viral hepatitis) were <21 kPa to rule out and
//   >50 kPa to rule in; kept here as BAVENO7_SSM for the notes, not drawn as zones.
// - AASLD 2024: above an HVPG of 10 mmHg SSM correlates with the HVPG better than LSM; neither has a role in monitoring the HVPG
//   (so the model's SSM following a beta-blocker is physiology, not a test of response).
// - normal: a healthy spleen's reading on the 100 Hz probe, about 15 to 20 kPa in published controls (not a guideline number); the model's is 17.
export const SSM_CUTS = Object.freeze({ ruleIn: 55, spareScope: 40, resolved: 25, resolvedLsm: 15, normal: 17, max: 100 });
export const BAVENO7_SSM = Object.freeze({ ruleOut: 21, ruleIn: 50 });

/** The model's coefficients (metrics.js ssmOf): kPa per mmHg of pulp pressure above normal (and a small square term: a
 *  capsule stiffens faster as it fills), and kPa per cm of spleen above normal. */
export const SSM_MODEL = Object.freeze({ base: 17, pulp0: 12, perMmHg: 2.0, perMmHg2: 0.04, len0: 11, perCm: 2.6 });

/** The reading for a pulp transmural pressure (mmHg) and a spleen length (cm); null without a spleen (splenectomy). */
export function ssmOf(pulpTm, lengthCm) {
  if (!(lengthCm > 0)) return null;
  const k = SSM_MODEL, dP = Math.max(0, pulpTm - k.pulp0), dL = Math.max(0, lengthCm - k.len0);
  return Math.min(SSM_CUTS.max, k.base + k.perMmHg * dP + k.perMmHg2 * dP * dP + k.perCm * dL);
}

/** A reading's zone against the cut-offs: 'in' (CSPH ruled in), 'gray', or 'spare' (scope spared, under spareScope). */
export const ssmZone = (v) => (v == null ? null : v > SSM_CUTS.ruleIn ? 'in' : v < SSM_CUTS.spareScope ? 'spare' : 'gray');
