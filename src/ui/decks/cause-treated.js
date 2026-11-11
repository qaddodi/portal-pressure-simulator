// Presenter talk: what treating the cause does to portal hypertension, in four patients: hepatitis C cured early,
// hepatitis C cured with a higher HVPG, MASH cirrhosis with weight loss, and alcohol-associated cirrhosis after the last drink (the slide fields are described at the top
// of decks.js). Carvedilol stays out of the params: on a beta-blocker the varix and the stiffness would fall at once
// (engine.js), so the time-lapses show the cure alone, and a caveat says so.

const SCAN = { kind: 'fibroscan' };
// The stiffness and platelets plane on the cure slide: the dot crosses into No CSPH as the lapse plays. The words keep the
// slide's own cut-off (under 10 kPa); the plane's zones are the rule for untreated disease, and both agree here. The
// obese MASLD slide charts its stiffness over the year instead, where the 25 kPa rule does not strictly apply (Baveno VIII 1.16).
const PLANE = { kind: 'plane', plane: 'csph' };
// The MASLD and alcohol patients open on a scar worse than their preset's (params set after the preset's years), so they first live a year at it, as the
// higher-start patient does (her slide runs 365 days): the spleen and the platelets settle to it, and the year after does not open with a dip (relax, decks.js).
const RELAX = 365;
const HCV = 'Hepatitis C cured', HIGH = 'A higher start', MASLD = 'MASLD', ALC = 'Alcohol stopped';

export const CAUSE_TREATED = {
  id: 'cause-treated', level: 'core', title: 'Treating the cause', minutes: 10,
  objectives: [
    'Explain why curing hepatitis C or B, stopping alcohol or losing weight lowers the portal pressure over months to years',
    'Use stiffness to judge whether CSPH has resolved after cure',
    'Recognize that CSPH can persist after cure when the HVPG starts high',
    'Read stiffness in obese MASLD, and describe what weight loss does to it',
  ],
  checks: [
    ['After hepatitis C is cured, which stiffness shows that CSPH has resolved?', '<10 kPa, or <15 kPa with a spleen stiffness <25 kPa (Baveno VIII).'],
    ['Does a cure always remove CSPH?', 'No: when the HVPG starts high, CSPH often persists, and the beta-blocker continues.'],
    ['Why does the 25 kPa rule-in not apply at a BMI ≥30?', 'A high stiffness often overstates the portal pressure in obesity, so ANTICIPATE-NASH, which adds the BMI, is used instead.'],
    ['Two years after hepatitis C cure, his stiffness has fallen from 15 to 9 kPa and his platelets have risen to 180. Has CSPH resolved, and what continues?', 'Yes: by Baveno VIII, a stiffness <10 kPa after cure means CSPH has resolved. Liver cancer surveillance continues every 6 months in anyone who had cirrhosis.'],
  ],
  sections: [[HCV, [HCV]], [HIGH, [HIGH]], [MASLD, [MASLD]], [ALC, [ALC]]],
  summary: 'Four patients whose cause is treated: hepatitis C cured early, hepatitis C cured with CSPH that persists, MASH cirrhosis with weight loss, and alcohol-associated cirrhosis after the last drink. Stiffness shows whether CSPH has resolved.',
  slides: [
    {
      id: 'before', preset: 'csph', cam: 'liver', tool: SCAN, data: 'tiles', tiles: ['lsm', 'plt', 'hvpg'], key: ['hvpg'],
      kicker: HCV, site: 'sin', title: 'Hepatitis C cirrhosis with CSPH, before treatment',
      vignette: 'A 52-year-old man with hepatitis C cirrhosis, found when he gave blood, starts sofosbuvir and velpatasvir. He feels well and has never had ascites or bleeding.',
      line: 'A stiffness of {lsm} with platelets of {plt} puts him in the gray zone, and an HVPG, here measured at {hvpg}, confirms CSPH, so carvedilol starts with the antivirals.',
      notes: 'Curing hepatitis C does not lower the portal pressure at once, so a patient with CSPH starts carvedilol with the antivirals. In the gray zone between 15 and 25 kPa, Baveno VIII calls CSPH present when a validated model such as ANTICIPATE puts its probability at 75% or more. Here the HVPG settles it. Note: The model shows the patient off carvedilol, so the changes that follow come from treating the cause alone.',
      ask: ['Why start carvedilol now, if the virus will soon be cured?', 'The portal pressure falls only slowly after cure, and carvedilol lowers the risk of decompensation in the meantime.'],
    },
    {
      id: 'year1', cutouts: ['lobule'], lens: 'since', days: 365, ramp: { cirrhosis: [0.6, 0.45] }, lapse: { seconds: 8, from: 'Cure', to: 'One year later' }, cam: 'liver',
      tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over the year' }, data: 'tiles', tiles: ['hvpg', 'varix', 'lsm', 'plt'], key: ['lsm'], delta: 'before',
      kicker: HCV, site: 'sin', title: 'A year after cure, the pressure and the stiffness fall',
      line: 'The stiffness reads {lsm}, the platelets have risen to {plt} and the HVPG has fallen to {hvpg}.',
      notes: 'After cure, inflammation settles first, so the stiffness falls faster than the scar regresses, and an early fall overstates how much fibrosis has gone. The HVPG falls more slowly and less completely, and in some patients with CSPH before treatment it stays at 10 mmHg or more. Whether carvedilol can stop once CSPH resolves is not settled.',
      ask: ['The stiffness falls fast in the first year after cure. Has the fibrosis regressed as fast?', 'No: much of the early fall is inflammation settling, so the stiffness overstates the regression.'],
    },
    {
      id: 'year2', cutouts: ['lobule', 'sinusoid'], days: 365, ramp: { cirrhosis: [0.45, 0.32] }, lapse: { seconds: 8, from: 'One year', to: 'Two years after cure' }, cam: 'liver',
      // (His trail on the plane: where he stood before cure and a year after, a line on to the dot as it moves. Mohammad, 1 Nov, mock B.)
      tool: { ...PLANE, trail: [{ slide: 'before', name: 'Before cure' }, { slide: 'year1', name: '1 year' }] },
      data: 'tiles', tiles: ['hvpg', 'ssm'], key: ['hvpg'], delta: 'before',
      kicker: HCV, site: 'sin', title: 'Two years after cure, CSPH has resolved',
      line: 'The stiffness reads {lsm}, which is {<10 kPa}, and the platelets {plt}: by Baveno VIII, CSPH has resolved.',
      notes: 'After treating the cause, Baveno VIII advises reassessing CSPH, and counts it as resolved when the HVPG is under 10 mmHg, the stiffness under 10 kPa, or the stiffness under 15 kPa with a spleen stiffness under 25 kPa; his spleen stiffness tile, the model\'s, has fallen below 25 kPa with the pressure and the smaller spleen. Liver cancer surveillance every 6 months continues, because cirrhosis was present before the cure. Recheck the stiffness and the platelets if a new cause of liver injury appears.',
      ask: ['Does he still need liver cancer surveillance?', 'Yes, every 6 months: cirrhosis was present before the cure, and the cancer risk remains.'],
    },
    {
      // (The same man, on carvedilol since the cure: his stiffness is under 10 kPa, so the chart for stopping it lights Resolved. Baveno VIII 7.15 to 7.19 are written
      // for recompensated patients; he was never decompensated, and 3.14b has CSPH reassessed after cure, so the card applies by extension.)
      id: 'path-stopcarv', cam: 'liver',
      tool: { kind: 'path', of: 'stopcarv', short: 'Stopping carvedilol', patient: { hv: 'none' } },
      kicker: HCV, site: 'sin', title: 'With CSPH resolved, carvedilol may stop',
      line: 'His stiffness is {lsm}, which is {<10 kPa}: CSPH is ruled out without a catheter, so the chart lets carvedilol stop. Surveillance does not.',
      notes: 'Source: Baveno VIII 3.14, 7.15 to 7.19. After aetiological treatment CSPH can persist and should be reassessed (3.14b). Carvedilol may be stopped only if the resolution is confirmed (7.18, weak): by an HVPG under 10 mmHg measured off carvedilol (7.16), or by stiffness, which is what his chart uses: under 10 kPa, or under 15 kPa with a spleen stiffness under 25 kPa (7.19). A stiffness of 9.1 kPa meets the first. Varices and collaterals may persist after CSPH has resolved, so they are no reason to keep the drug (7.17). Statements 7.15 to 7.19 are written for recompensated patients; he was never decompensated, so the chart applies by extension, as the guideline\'s 3.14b asks for CSPH to be reassessed after cure. His stiffness falls faster than the scar regresses, so many centers repeat it, or measure an HVPG off carvedilol, before stopping. The model shows him off carvedilol throughout.',
      ask: ['His stiffness is 12 kPa and his spleen stiffness 30 kPa. May carvedilol stop?', 'No: 12 kPa is not <10, and <15 kPa counts only with a spleen stiffness <25 kPa. Measure the HVPG off carvedilol, or repeat the stiffness later.'],
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
      id: 'high2', days: 730, ramp: { cirrhosis: [0.75, 0.57] }, lapse: { seconds: 10, from: 'Cure', to: 'Two years later' }, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['lsm', 'varix'], delta: 'high',
      kicker: HIGH, site: 'sin', title: 'Two years after cure, CSPH persists',
      line: 'The HVPG is still {hvpg}, which is {>=10 mmHg}, so CSPH persists and she keeps carvedilol.',
      notes: 'When the HVPG starts well above 10 mmHg, CSPH often persists after cure, and so does the risk of decompensation. She keeps carvedilol and liver cancer surveillance every 6 months. Her stiffness, still in the gray zone, cannot tell on its own whether CSPH has gone.',
      ask: ['Should she stop carvedilol now that the virus is gone?', 'No: CSPH persists, so carvedilol continues.'],
    },
    {
      id: 'masld', preset: 'cirr-comp', params: { cirrhosis: 0.45 }, relax: RELAX, days: 365, ramp: { cirrhosis: [0.45, 0.35] }, lapse: { seconds: 8, from: 'Weight loss starts', to: 'One year later' }, cam: 'liver',
      // The weight line is the slide's own 12% loss, drawn as body weight from 100% down to 88% (the model has no weight), spread evenly over the year as the scar eases back; the stiffness line is the model's.
      tool: { kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 }, title: 'Body weight and stiffness over the year' },
      data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      kicker: MASLD, site: 'sin', title: 'Losing 12% of her weight lowers the stiffness',
      vignette: 'A 54-year-old woman with MASH cirrhosis and a BMI of 34 has a liver stiffness of 15 kPa on FibroScan. Her platelets are 138,000/µL, and she has never had ascites or bleeding.',
      line: 'Losing 12% of her weight over a year lowers the stiffness from the gray zone to {lsm} and lifts the platelets to {plt}, which now rules CSPH out.',
      notes: 'At the start her stiffness sits in the gray zone, and at a BMI of 30 or more a stiffness of 25 kPa or more no longer rules CSPH in, because it often overstates the portal pressure in obesity. Baveno VIII then uses ANTICIPATE-NASH, which adds the BMI, and calls CSPH present at a probability of 75% or more. In MASLD-related cACLD, Baveno VIII (2.13) links a weight loss of 10% or more with a fall in stiffness of 30% or more. A confirmed change of 30% or more goes with a meaningful change in the risk of liver-related events, particularly when the stiffness crosses 15 kPa (2.9). Diet and exercise come first; GLP-1–based drugs can be used for their approved indications, obesity included, and bariatric surgery suits selected patients without CSPH, with CSPH only at expert centers. A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out, whatever the cause. Note: The model has no fat or weight. On the chart, body weight falls from 100% to 88%, the 12% named on the slide, spread evenly over the year with the scar easing back in step, and the stiffness line comes from the model.',
      ask: ['How much weight loss changes the stiffness meaningfully?', '≥10% of body weight, which goes with a fall in stiffness of ≥30%.'],
    },
    {
      // (Alcohol stopped: the scar eases back over the year as the inflammation settles. Carvedilol stays out of the params, as for the others.)
      id: 'alcohol', preset: 'csph', params: { cirrhosis: 0.7 }, relax: RELAX, days: 365, ramp: { cirrhosis: [0.7, 0.55] }, lapse: { seconds: 8, from: 'Last drink', to: 'One year sober' }, cam: 'liver',
      tool: SCAN, data: 'tiles', tiles: ['hvpg', 'lsm'], key: ['hvpg'],
      kicker: ALC, site: 'sin', title: 'A year without alcohol lowers the pressure',
      vignette: 'A 49-year-old man with alcohol-associated cirrhosis and CSPH, Child–Pugh A 6, stops drinking after his first clinic visit. He has medium esophageal varices and no ascites.',
      line: 'A year sober, his HVPG has fallen to {hvpg} and his stiffness to {lsm}. Drinking again would push the pressure back up.',
      notes: 'Abstinence is the cause treatment in alcohol-associated cirrhosis, and the HVPG falls within months of the last drink, more in those who stop completely than in those who cut down; continued drinking raises it. Much of the early fall in stiffness is inflammation settling, so the stiffness is best read after some months sober. Support to stay abstinent is part of the treatment: counseling, and drugs such as baclofen or acamprosate, which are safe in cirrhosis; disulfiram and naltrexone are avoided in advanced disease. Carvedilol continues while CSPH persists, and liver cancer surveillance every 6 months continues for life. In the model the scar eases back evenly over the year, without the drinking days between.',
      ask: ['How soon after stopping alcohol does the portal pressure fall?', 'Within months, more with complete abstinence; drinking again raises it.'],
    },
    {
      // (All four patients on one chart: his mock E1, 7 Nov 2026. Each is the deck's own slides run again with a reading on every day, sampled every three months (allpatients-model.js);
      // the MASLD and alcohol patients have one year in the deck, so the model gives them a second at year one's pace, drawn dotted.)
      id: 'allpatients', cam: 'fit', visual: 'allpatients',
      cohort: [{ name: 'Hepatitis C', c: 's1', slides: ['before', 'year1', 'year2'] }, { name: 'Higher start', c: 's2', slides: ['high', 'high2'] },
        { name: 'MASLD', c: 's3', slides: ['masld'], pace: true, clear: 'Ruled out' }, { name: 'Alcohol', c: 's7', slides: ['alcohol'], pace: true }],
      kicker: 'Summary', title: 'Where each patient started decides where they end',
      line: 'Two years on, only the patient who started at {hvpg@high} is still {>=10 mmHg}; the other three are {<10 mmHg}.',
      chartFoot: ['* Dotted: a second year the deck has no slide for, the model with year one\u2019s pace kept.', 'LSM is liver stiffness in kPa, Plt platelets in \u00d710\u00b3/\u00b5L. All four are off carvedilol.'],
      notes: 'The four patients on one chart, the HVPG over two years with the CSPH line at 10 mmHg. The 1 and 2 year values stand on the lines, and the key gives the HVPG, the stiffness and the platelets before treatment, at 1 year and at 2 years, the patient with the highest pressure first. The hepatitis C patients are the deck\u2019s own slides. The MASLD and alcohol patients have one year in the deck; their second year is the model with the scar easing at the same pace as in the first, which takes the alcohol patient under 10 mmHg too. Patients vary far more than the model does, and the pressure can stop falling. The one who starts highest, at 14.7 mmHg, is still over the line after two years, so she keeps carvedilol.',
      ask: ['Which of the four still has CSPH at two years, and why?', 'The woman who started at 14.7 mmHg: cure lowered her HVPG only to 10.8 mmHg, which is ≥10. The others fell to <10.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, read stiffness
      // against the HVPG and the platelets. The dots are the two hepatitis C patients' visits, one walk each; the ring is the second
      // patient two years on, in the same state as that slide.)
      id: 'relation', preset: 'csph', params: { cirrhosis: 0.75 }, days: 730, ramp: { cirrhosis: [0.75, 0.57] }, cam: 'liver',
      tool: { kind: 'curve', x: 'lsm', xCuts: [10], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 0.85, step: 0.05, days: 365, lines: ['hvpg', 'plt'],
        dots: [{ slide: 'before', name: 'First patient', on: [0], walk: 'first' }, { slide: 'year1', on: [0], walk: 'first' }, { slide: 'year2', name: 'CSPH gone', on: [0], walk: 'first' },
          { slide: 'high', name: 'Higher start', on: [0], walk: 'second' }, { slide: 'high2', name: 'CSPH persists', on: [0], walk: 'second' }] },
      kicker: 'Summary', site: 'sin', title: 'Where the HVPG starts decides whether CSPH resolves',
      line: 'Cure took the first patient from {hvpg@before} to {hvpg@year2}, which is {<10 mmHg}. The second starts at {hvpg@high} and is at {hvpg} two years on, still {>=10 mmHg}.',
      notes: 'Stiffness across, the HVPG and the platelets up: the model\'s cirrhosis from mild to severe, each point settled for a year. Curing the cause moves a patient down this line, not off it. Both patients are cured of hepatitis C, but the second starts higher, at an HVPG of 14.7 mmHg against 11.6, and in the model her scar regresses less over the two years, so she ends at 10.8 mmHg while he ends at 4.8, under 10 and under 10 kPa. Baveno VIII counts CSPH as resolved at an HVPG under 10 mmHg, a stiffness under 10 kPa, or a stiffness under 15 kPa with a spleen stiffness under 25 kPa (Fig. 2): the dashed lines mark 10 on both axes. Removing the cause lowers the HVPG in most patients, and how far it must fall to prevent decompensation is not yet established (Table 3). One model patient per point; real recoveries vary far more. The MASLD patient is left off: at a BMI of 30 or more the stiffness overstates the pressure, so the line does not describe her (1.16). (Baveno VIII Fig. 2, Table 3, 1.16.)',
      ask: ['Both patients were cured of hepatitis C. Why has CSPH resolved in the man but not in the woman?', 'She started higher, at an HVPG of 14.7 mmHg, and the pressure falls only part of the way in two years, so she stays ≥10 mmHg; he started at 11.6 mmHg and fell to <10 mmHg.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'lsm', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ id: 'before', kicker: 'Hepatitis C', title: 'Before cure' }, { id: 'year1', kicker: 'Hepatitis C', title: 'One year after cure', vs: 'before' }, { id: 'year2', kicker: 'Hepatitis C', title: 'Two years after cure', vs: 'before' },
        { id: 'high', kicker: 'Higher start', title: 'Before cure', ref: true }, { id: 'high2', kicker: 'Higher start', title: 'Two years after cure', vs: 'high' },
        { preset: 'cirr-comp', params: { cirrhosis: 0.45 }, relax: RELAX, key: 'masld0', kicker: 'MASLD', title: 'Before weight loss', ref: true }, { id: 'masld', kicker: 'MASLD', title: 'After 12% weight loss', vs: 'masld0' },
        { preset: 'csph', params: { cirrhosis: 0.7 }, relax: RELAX, key: 'alc0', kicker: 'Alcohol', title: 'Still drinking', ref: true }, { id: 'alcohol', kicker: 'Alcohol', title: 'A year sober', vs: 'alc0' }],
      kicker: 'Summary', title: 'How far the pressure falls depends on where it started',
      line: 'Treating the cause lowers the HVPG in most patients, but CSPH persists when it starts high.',
      notes: 'Curing hepatitis C, suppressing hepatitis B, stopping alcohol or losing weight is the most effective long-term treatment of portal hypertension, but the pressure falls over years, not weeks. Patients who start with a high HVPG often keep CSPH and keep their beta-blocker. Liver cancer surveillance continues after any cure in a patient who had cirrhosis. Hepatitis B behaves like hepatitis C here: entecavir or tenofovir, taken long term, suppresses the virus, and the stiffness and the HVPG fall over years; the cancer risk falls but does not go.',
      ask: ['After cure, who still needs carvedilol?', 'Anyone in whom CSPH persists, as shown by the HVPG or by stiffness and platelets.'],
    },
  ],
};
