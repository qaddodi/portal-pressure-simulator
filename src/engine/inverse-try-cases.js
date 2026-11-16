// "Try a case" (review T1, 15 Nov 2026): readings a learner can load into From readings to see the search recover a known patient. Each is a textbook set of
// readings (not the model's own output) that the search puts among its leaders with all of them entered; the same numbers are cases C01 to C19 of
// scripts/inverse-cases.mjs, and tests/inverse-cases.test.js ranks them. `leads` is what the search lists first, `note` the one thing the case teaches.
export const TRY_CASES = Object.freeze([
  { id: 'normal', label: 'Normal liver', leads: ['none'], note: 'Every reading is normal, so no lesion is needed.',
    readings: { whvp: 7, fhvp: 4, ra: 3, lsm: 4.5, plt: 260, spleen: 10, asc: 0, varix: 0 } },
  { id: 'compensated', label: 'Compensated cirrhosis with portal hypertension', leads: ['sinus'], note: 'A raised WHVP with a normal FHVP places the resistance in the sinusoids.',
    readings: { whvp: 18, fhvp: 6, ra: 5, lsm: 28, plt: 95, spleen: 14, varix: 1 } },
  { id: 'decompensated', label: 'Decompensated cirrhosis', leads: ['sinus'], note: 'Ascites with a high SAAG, splenomegaly and a high WHVP: one lesion explains all of it.',
    readings: { whvp: 24, fhvp: 7, ra: 6, lsm: 45, plt: 60, spleen: 16, asc: 2, saag: 1.9, varix: 2 } },
  { id: 'psvd', label: 'Porto-sinusoidal vascular disorder', leads: ['presin'], note: 'A near-normal HVPG and LSM with a large spleen and a high SSM point to presinusoidal resistance.',
    readings: { whvp: 9, fhvp: 5, ra: 4, lsm: 7, ssm: 55, spleen: 18, plt: 70, varix: 2 } },
  { id: 'pvt', label: 'Chronic portal vein thrombosis', leads: ['pvt'], note: 'No flow in the portal vein, with normal hepatic venous pressures and a normal LSM.',
    readings: { whvp: 8, fhvp: 5, lsm: 5.5, spleen: 15, plt: 100, pvVel: 0, varix: 2 } },
  { id: 'ivcweb', label: 'IVC web', leads: ['ivcweb'], note: 'The hepatic venous pressures are high because the suprahepatic IVC is stenosed; the RA pressure is normal.',
    readings: { whvp: 20, fhvp: 18, ivc: 17, ra: 4, asc: 2, lsm: 30 } },
  { id: 'rhf', label: 'Right heart failure', leads: ['rhf', 'constr'], note: 'The FHVP rises with the RA pressure. The model cannot separate heart failure from constriction.',
    readings: { whvp: 21, fhvp: 18, ra: 18, lsm: 25, asc: 3, saag: 1.5, plt: 180, spleen: 12 } },
  { id: 'cirrhosis-rhf', label: 'Cirrhosis with right heart failure', leads: ['sinus+rhf'], note: 'A WHVP far above the FHVP, and both high: two lesions are needed.',
    readings: { whvp: 28, fhvp: 15, ra: 14, lsm: 50, plt: 80, spleen: 15, asc: 2 } },
]);
