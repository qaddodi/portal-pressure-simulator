// Presenter talk: what treating the cause does to portal hypertension, in three patients: hepatitis C cured early,
// hepatitis C cured with a higher HVPG, and MASH cirrhosis with weight loss (the slide fields are described at the top
// of decks.js). Carvedilol stays out of the params: on a beta-blocker the varix and the stiffness would fall at once
// (engine.js), so the time-lapses show the cure alone, and a caveat says so.

const SCAN = { kind: 'fibroscan' };
// The stiffness and platelets plane on the cure slide: the dot crosses into No CSPH as the lapse plays. The words keep the
// slide's own cut-off (under 10 kPa); the plane's zones are the rule for untreated disease, and both agree here. The
// obese MASLD slide charts its stiffness over the year instead, where the 25 kPa rule does not strictly apply (Baveno VIII 1.16).
const PLANE = { kind: 'plane', plane: 'csph' };
const HCV = 'Hepatitis C cured', HIGH = 'A higher start', MASLD = 'MASLD';

export const CAUSE_TREATED = {
  id: 'cause-treated', level: 'core', title: 'Treating the cause', minutes: 10,
  objectives: [
    'Explain why treating the cause lowers the portal pressure over months to years',
    'Use stiffness to judge whether CSPH has resolved after cure',
    'Recognize that CSPH can persist after cure when the HVPG starts high',
    'Read stiffness in obese MASLD, and describe what weight loss does to it',
  ],
  checks: [
    ['After hepatitis C is cured, which stiffness shows that CSPH has resolved?', 'Under 10 kPa, or under 15 kPa with a spleen stiffness under 25 kPa (Baveno VIII).'],
    ['Does a cure always remove CSPH?', 'No: when the HVPG starts high, CSPH often persists, and the beta-blocker continues.'],
    ['Why does the 25 kPa rule-in not apply at a BMI of 30 or more?', 'A high stiffness often overstates the portal pressure in obesity, so ANTICIPATE-NASH, which adds the BMI, is used instead.'],
    ['Two years after hepatitis C cure, his stiffness has fallen from 15 to 9 kPa and his platelets have risen to 180. Has CSPH resolved, and what continues?', 'Yes: by Baveno VIII, a stiffness under 10 kPa after cure means CSPH has resolved. Liver cancer surveillance continues every 6 months in anyone who had cirrhosis.'],
  ],
  sections: [[HCV, [HCV]], [HIGH, [HIGH]], [MASLD, [MASLD]]],
  summary: 'Three patients whose cause is treated: hepatitis C cured early, hepatitis C cured with CSPH that persists, and MASH cirrhosis with weight loss. Stiffness shows whether CSPH has resolved.',
  slides: [
    {
      id: 'before', preset: 'csph', cam: 'liver', tool: SCAN, data: 'tiles', tiles: ['lsm', 'plt', 'hvpg'], key: ['hvpg'],
      kicker: HCV, site: 'sin', title: 'Hepatitis C cirrhosis with CSPH, before treatment',
      vignette: 'A 52-year-old man with hepatitis C cirrhosis, found when he gave blood, starts sofosbuvir and velpatasvir. He feels well and has never had ascites or bleeding.',
      line: 'A stiffness of {lsm} with platelets of {plt} puts him in the gray zone, and an HVPG of {hvpg} confirms CSPH, so carvedilol starts with the antivirals.',
      notes: 'Curing hepatitis C does not lower the portal pressure at once, so a patient with CSPH starts carvedilol with the antivirals. In the gray zone between 15 and 25 kPa, Baveno VIII calls CSPH present when a validated model such as ANTICIPATE puts its probability at 75% or more. Here the HVPG settles it. Note: The model shows the patient off carvedilol, so the changes that follow come from treating the cause alone.',
      ask: ['Why start carvedilol now, if the virus will soon be cured?', 'The portal pressure falls only slowly after cure, and carvedilol lowers the risk of decompensation in the meantime.'],
    },
    {
      id: 'year1', days: 365, ramp: { cirrhosis: [0.6, 0.45] }, lapse: { seconds: 8, from: 'Cure', to: 'One year later' }, cam: 'liver',
      tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over the year' }, data: 'tiles', tiles: ['hvpg', 'varix', 'lsm', 'plt'], key: ['lsm'], delta: 'before',
      kicker: HCV, site: 'sin', title: 'A year after cure, the pressure and the stiffness fall',
      line: 'A year after cure the stiffness reads {lsm}, the platelets have risen to {plt} and the HVPG has fallen to {hvpg}.',
      notes: 'After cure, inflammation settles first, so the stiffness falls faster than the scar regresses, and an early fall overstates how much fibrosis has gone. The HVPG falls more slowly and less completely, and in some patients with CSPH before treatment it stays at 10 mmHg or more. Whether carvedilol can stop once CSPH resolves is not settled.',
      ask: ['The stiffness falls fast in the first year after cure. Has the fibrosis regressed as fast?', 'No: much of the early fall is inflammation settling, so the stiffness overstates the regression.'],
    },
    {
      id: 'year2', days: 365, ramp: { cirrhosis: [0.45, 0.32] }, lapse: { seconds: 8, from: 'One year', to: 'Two years after cure' }, cam: 'liver', tool: PLANE,
      data: 'tiles', tiles: ['lsm', 'plt', 'hvpg'], key: ['lsm'], delta: 'before',
      kicker: HCV, site: 'sin', title: 'Two years after cure, CSPH has resolved',
      line: 'Two years after cure the stiffness reads {lsm}, under {<10 kPa}, and the platelets {plt}: by Baveno VIII, CSPH has resolved.',
      notes: 'After treating the cause, Baveno VIII advises reassessing CSPH, and counts it as resolved when the HVPG is under 10 mmHg, the stiffness under 10 kPa, or the stiffness under 15 kPa with a spleen stiffness under 25 kPa. Liver cancer surveillance every 6 months continues, because cirrhosis was present before the cure. Recheck the stiffness and the platelets if a new cause of liver injury appears.',
      ask: ['Does he still need liver cancer surveillance?', 'Yes, every 6 months: cirrhosis was present before the cure, and the cancer risk remains.'],
    },
    {
      id: 'high', preset: 'csph', params: { cirrhosis: 0.75 }, days: 365, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['varix', 'asc'],
      kicker: HIGH, site: 'sin', title: 'A higher HVPG before cure',
      vignette: 'A 58-year-old woman with hepatitis C cirrhosis from a transfusion in 1987 starts sofosbuvir and velpatasvir. EGD shows large varices, and ultrasound shows a little ascites she has not noticed.',
      caseQ: 'Will cure remove her CSPH?',
      line: 'With an HVPG of {hvpg}, large varices and fluid seen only on ultrasound, she starts carvedilol with the antivirals.',
      notes: 'Ascites seen only on ultrasound does not count as decompensation, so she is still compensated, with CSPH and high-risk varices. Carvedilol treats both: it lowers the risk of a first bleed and of decompensation. The higher the HVPG before cure, the more likely CSPH is to persist after it. The model shows her off carvedilol, so the changes that follow come from treating the cause alone.',
      ask: ['Ascites seen only on ultrasound: is she decompensated?', 'No: only clinically evident ascites marks decompensation, though even a little fluid on ultrasound carries a worse outlook.'],
    },
    {
      id: 'high2', days: 730, ramp: { cirrhosis: [0.75, 0.57] }, lapse: { seconds: 10, from: 'Cure', to: 'Two years later' }, cam: 'liver', compare: [{ label: 'First patient', short: 'First', slide: 'year2' }, { label: 'This patient', short: 'This one', own: true }], tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['lsm', 'varix'], delta: 'high',
      kicker: HIGH, site: 'sin', title: 'Two years after cure, CSPH persists',
      line: 'Two years after cure the HVPG is still {hvpg}, at or above {>=10 mmHg}, so CSPH persists and she keeps carvedilol. Switch to the first patient to compare his HVPG.',
      notes: 'When the HVPG starts well above 10 mmHg, CSPH often persists after cure, and so does the risk of decompensation. She keeps carvedilol and liver cancer surveillance every 6 months. Her stiffness, still in the gray zone, cannot tell on its own whether CSPH has gone.',
      ask: ['Should she stop carvedilol now that the virus is gone?', 'No: CSPH persists, so carvedilol continues.'],
    },
    {
      id: 'masld', preset: 'cirr-comp', params: { cirrhosis: 0.45 }, days: 365, ramp: { cirrhosis: [0.45, 0.35] }, lapse: { seconds: 8, from: 'Weight loss starts', to: 'One year later' }, cam: 'liver',
      // The weight line is the slide's own 12% (the model has no weight), spread evenly over the year as the scar eases back; the stiffness line is the model's.
      tool: { kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 }, title: 'Weight lost and stiffness over the year' },
      data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      kicker: MASLD, site: 'sin', title: 'Losing 12% of her weight lowers the stiffness',
      vignette: 'A 54-year-old woman with MASH cirrhosis and a BMI of 34 has a liver stiffness of 15 kPa on FibroScan. Her platelets are 136,000/µL, and she has never had ascites or bleeding.',
      line: 'Losing 12% of her weight over a year lowers the stiffness from the gray zone to {lsm} and lifts the platelets to {plt}, which now rules CSPH out.',
      notes: 'At the start her stiffness sits in the gray zone, and at a BMI of 30 or more a stiffness of 25 kPa or more no longer rules CSPH in, because it often overstates the portal pressure in obesity. Baveno VIII then uses ANTICIPATE-NASH, which adds the BMI, and calls CSPH present at a probability of 75% or more. In MASLD-related cACLD, Baveno VIII (2.13) links a weight loss of 10% or more with a fall in stiffness of 30% or more. A confirmed change of 30% or more goes with a meaningful change in the risk of liver-related events, particularly when the stiffness crosses 15 kPa (2.9). Diet and exercise come first; GLP-1–based drugs can be used for their approved indications, obesity included, and bariatric surgery suits selected patients without CSPH, with CSPH only at expert centers. A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out, whatever the cause. Note: The model has no fat or weight. On the chart, the weight line is the 12% named on the slide, spread evenly over the year with the scar easing back in step, and the stiffness line comes from the model.',
      ask: ['How much weight loss changes the stiffness meaningfully?', 'About 10% of body weight or more, which goes with a fall in stiffness of about 30% or more.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'lsm', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ id: 'before', kicker: 'Hepatitis C', title: 'Before cure' }, { id: 'year1', kicker: 'Hepatitis C', title: 'One year after cure', vs: 'before' }, { id: 'year2', kicker: 'Hepatitis C', title: 'Two years after cure', vs: 'before' },
        { id: 'high', kicker: 'Higher start', title: 'Before cure', ref: true }, { id: 'high2', kicker: 'Higher start', title: 'Two years after cure', vs: 'high' },
        { preset: 'cirr-comp', params: { cirrhosis: 0.45 }, key: 'masld0', kicker: 'MASLD', title: 'Before weight loss', ref: true }, { id: 'masld', kicker: 'MASLD', title: 'After 12% weight loss', vs: 'masld0' }],
      kicker: 'Summary', title: 'How far the pressure falls depends on where it started',
      line: 'Treating the cause lowers the HVPG in every patient, but CSPH persists when it starts high.',
      notes: 'Curing hepatitis C, stopping alcohol or losing weight is the most effective long-term treatment of portal hypertension, but the pressure falls over years, not weeks. Patients who start with a high HVPG often keep CSPH and keep their beta-blocker. Liver cancer surveillance continues after any cure in a patient who had cirrhosis.',
      ask: ['After cure, who still needs carvedilol?', 'Anyone in whom CSPH persists, as shown by the HVPG or by stiffness and platelets.'],
    },
  ],
};
