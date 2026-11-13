// Presenter talk: one patient over two years, from CSPH to the first ascites and back to recompensation once the
// cause is removed (the slide fields are described at the top of decks.js).


export const RECOMPENSATION = {
  id: 'recompensation', level: 'advanced', title: 'Decompensation and recompensation', minutes: 11,
  objectives: [
    'Define decompensation and name its three defining events',
    'Treat the first episode of ascites with sodium restriction and diuretics',
    'Explain what removing the cause does to the portal pressure',
    'State the Baveno VIII criteria for recompensation',
  ],
  checks: [
    ['Name the three events that mark decompensation.', 'Ascites, variceal bleeding and overt hepatic encephalopathy.'],
    ['What lowered the portal pressure most in this case?', 'Removing the cause: alcohol abstinence.'],
    ['When has a patient recompensated under Baveno VIII?', 'The cause is removed or controlled, there is no ascites or encephalopathy off treatment and no recurrent variceal bleeding for >6 months, and liver function is back to Child–Pugh A.'],
    ['A year after he stops drinking, the HVPG has fallen from 18 to 12 mmHg and the serum albumin has risen. Has he recompensated?', 'Not on the numbers alone. He also needs no ascites, encephalopathy or rebleeding off treatment for >6 months, and liver function back to Child–Pugh A.'],
  ],
  summary: 'One patient over two years: CSPH, the first ascites, diuretics, then removal of the cause and recompensation. The portal pressure falls, but recompensation is not a cure.',
  slides: [
    {
      id: 'csph', tick: 'CSPH', preset: 'csph', cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['varix'],
      kicker: 'Compensated', site: 'sin', title: 'Compensated cirrhosis with CSPH', cite: 'Baveno VIII 3.15',
      vignette: 'A 47-year-old man with alcohol-associated cirrhosis drinks about eight drinks a day. He has never had ascites or variceal bleeding, and his platelets are 90,000/µL.',
      line: 'The HVPG is {hvpg}, which is {>=10 mmHg}: CSPH, with no ascites or variceal bleeding. Baveno VIII would start carvedilol now; this case withholds it to show the natural history.',
      notes: 'Source: Baveno VIII 3.15. Clinically significant portal hypertension identifies the patients at risk of decompensation. Baveno VIII advises treating the cause and starting a nonselective beta-blocker (NSBB), preferably carvedilol, at this stage to prevent decompensation. He continues to drink and receives no treatment, so the disease progresses.',
      ask: ['What does Baveno VIII advise for compensated cirrhosis with CSPH?', 'Treat the cause, and start a nonselective beta-blocker, preferably carvedilol, to prevent decompensation.'],
    },
    {
      // (The stages of Baveno VIII Fig. 2 lit for him: compensated, with CSPH. The ladder is the map of this talk; the next slides walk the steps.)
      id: 'path-ladder', cam: 'liver',
      tool: { kind: 'path', of: 'ladder', short: 'Stages', patient: { s: 1, rc: false } },
      kicker: 'Compensated', site: 'sin', title: 'He is at the second of four stages',
      line: 'An HVPG of {hvpg} is {>=10 mmHg}: compensated cirrhosis with CSPH. Ascites would move him to the third stage, and recompensation is the way back.',
      notes: 'Source: Baveno VIII Fig. 2, 3.1 to 3.3, 4.1, 7.4. Compensated cirrhosis means no decompensation now or before, and it has two stages, without and with CSPH (3.2). An HVPG ≥10 mmHg is enough for the second; so are a liver stiffness measurement (LSM) ≥25 kPa, varices or portosystemic collaterals. The first decompensation is clinically evident ascites, variceal bleeding or overt hepatic encephalopathy (3.3); further decompensation, the fourth stage, is a second event: rebleeding, recurrent ascites requiring ≥3 large-volume paracenteses within 1 year, SBP or HRS-AKI (4.1). Recompensation runs back from the decompensated stages and needs all the criteria of Fig. 2 for >6 months (7.4). He is at the second stage now. The next slides take him down to the third and back.',
      ask: ['What separates the two stages of compensated cirrhosis?', 'Whether clinically significant portal hypertension (CSPH) is present: an HVPG ≥10 mmHg, or an LSM ≥25 kPa, varices or collaterals (Baveno VIII 3.2).'],
    },
    {
      id: 'ascites', tick: 'First ascites', days: 365, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over the year' }, milestone: 'Ascites', data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'csph',
      kicker: 'Decompensation', site: 'sin', title: 'Ascites is the first decompensating event',
      line: 'After a year of ongoing injury, the HVPG rises to {hvpg}, the serum albumin falls and {asc} of ascites accumulates.',
      notes: 'Decompensation is the first episode of ascites, variceal bleeding or overt hepatic encephalopathy, and ascites is the most common first event. It changes the prognosis: median survival falls from >10 years to about 2 years. New-onset ascites needs a diagnostic paracentesis for the SAAG, the total protein and the PMN count.',
      ask: ['Name the three events that define decompensation.', 'Ascites, variceal bleeding and overt hepatic encephalopathy.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over the month' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'ascites',
      kicker: 'Decompensation', site: 'sin', title: 'Sodium restriction and diuretics control the ascites',
      line: 'Spironolactone, furosemide and moderate sodium restriction reduce the ascites to {asc} in a month.',
      notes: 'Moderate sodium restriction, about 2 g/day of sodium (5 g of salt), with spironolactone and furosemide treats grade 2 ascites; the doses are increased stepwise to a maximum of 400 mg/day of spironolactone and 160 mg/day of furosemide. Weight loss should not exceed about 0.5 kg/day without peripheral edema. Monitor the serum sodium, potassium and creatinine. An NSBB, preferably carvedilol, is also advised with ascites and varices, but this case leaves it out. Baveno VIII advises dose reduction or discontinuation when the systolic pressure stays <90 mmHg (or the MAP <65 mmHg) or AKI develops, and restarting it when these resolve.',
      ask: ['What are the maximum daily doses of spironolactone and furosemide?', '400 mg of spironolactone and 160 mg of furosemide.'],
    },
    {
      id: 'cure', lens: 'since', since: 'ascites', sinceLabel: 'the first ascites', tick: 'Cause removed', days: 365, ramp: { cirrhosis: [0.85, 0.6], albumin: [2.8, 3.8] }, lapse: { seconds: 10 }, cam: 'liver', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'salb'], title: 'HVPG and albumin over the year' }, milestone: 'Abstinence', data: 'tiles', tiles: ['hvpg', 'salb'], key: ['salb'], delta: 'diuretics',
      kicker: 'Recompensation', site: 'sin', title: 'Alcohol abstinence lowers the portal pressure',
      line: 'After a year of abstinence, the serum albumin rises to {salb}, the ascites resolves and the HVPG falls to {hvpg}.',
      notes: 'Removing the cause, by alcohol abstinence, cure of hepatitis C or suppression of hepatitis B, is the most effective long-term treatment of portal hypertension. Inflammation resolves and some fibrosis regresses, so intrahepatic resistance and the HVPG fall over months to years. The fall is often incomplete: many patients still have CSPH and stay on the NSBB. The vessel coloring shows the change since the first ascites.',
      ask: ['What is the most effective long-term way to lower the portal pressure?', 'Remove the cause of the cirrhosis.'],
    },
    {
      id: 'recomp', tick: 'Off diuretics', params: { diuretics: false }, days: 60, cam: 'fit', data: 'tiles',
      tool: { kind: 'criteria', title: 'Recompensation', lead: 'All of these, for >6 months.', rule: 'Baveno VIII 7.4', rows: ['**Cause** removed or controlled', ['No **ascites** (<0.15 L) off diuretics', 'asc', '<', 0.15],
        'No **encephalopathy** off treatment, and no **rebleeding**', 'Back to **Child–Pugh A**, 5 or 6 points'] }, tiles: ['asc', 'salb'], key: ['asc'],
      kicker: 'Recompensation', site: 'sin', title: 'Baveno VIII criteria for recompensation',
      line: 'Off diuretics, the ascites does not recur and the serum albumin is stable. If this lasts >6 months, with liver function back to Child–Pugh A, it counts as recompensation.',
      notes: 'Source: Baveno VIII 7.4. Baveno VIII requires all of: the cause removed, suppressed or cured; no ascites on imaging off diuretics, no encephalopathy off lactulose or rifaximin and, after a variceal bleed, no recurrent bleeding (carvedilol may continue), all for >6 consecutive months; and liver function back to Child–Pugh A (5 or 6 points). Recompensation means the disease behaves as compensated cirrhosis again; it is not a cure. The cirrhosis persists and still needs follow-up every 6 months with hepatocellular carcinoma (HCC) surveillance and, while CSPH persists, the NSBB. If the cause recurs, decompensation can follow.',
      ask: ['After recompensation, does HCC surveillance stop?', 'No: the cirrhosis persists, so surveillance continues.'],
    },
    {
      // (The recompensation checklist of Fig. 2 lit for him at the end of the off-diuretics slide: the cause is gone and the albumin is up, but 60 days off
      // diuretics is not the more than 6 months the criteria ask. Child–Pugh A is the case's own, not the model's.)
      id: 'path-recomp', cam: 'fit',
      tool: { kind: 'path', of: 'recomp', short: 'Recompensation', patient: { ca: 0, ev: 1, lf: 0 } },
      kicker: 'Recompensation', site: 'sin', title: 'Two of three criteria are met: he is recompensating',
      line: 'He is abstinent and his serum albumin is {salb}. He has been off diuretics for 60 days; once that lasts >6 months, the card reads Recompensated.',
      notes: 'Source: Baveno VIII 7.4, Fig. 2. Recompensation needs all three together. First, the cause is removed, controlled or suppressed. Second, no ascites on imaging off diuretics, no overt encephalopathy off lactulose or rifaximin and, after a variceal bleed, no recurrent bleeding (carvedilol may continue), for >6 consecutive months. Third, liver function back to Child–Pugh A (5 or 6 points). The first and third are met here: a year of abstinence, a serum albumin of 3.8 g/dL. The second is not yet, because the ascites has stayed away for 60 days only. The model gives the albumin; the Child–Pugh score is the case\'s. The term applies to a patient who has decompensated (7.1), as he has, and it is not cirrhosis regression (7.2).',
      ask: ['Which criterion is still open for him?', 'The duration: no ascites, encephalopathy or rebleeding off treatment must last >6 consecutive months, and he is at 60 days.'],
    },
    {
      // (Baveno VIII 7.6 to 7.8: three ways to look recompensated without being so. The figure is the slide before's.)
      id: 'traps', cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Not recompensation on its own', short: 'Not enough', ticks: false, lead: 'None of these counts by itself.', rule: 'Baveno VIII 7.6, 7.7, 7.8',
        rows: ['Ascites gone **on diuretics**', 'No encephalopathy **on lactulose or rifaximin**', 'Ascites cleared or no rebleeding **after a TIPS alone**'], verdict: 'Next step: consider stopping the drug (7.6, 7.7).' },
      kicker: 'Recompensation', site: 'sin', title: 'Ascites that clears on treatment is not recompensation',
      line: 'Ascites controlled by diuretics, encephalopathy prevented by lactulose, or bleeding prevented by a TIPS does not count alone. Recompensation means the disease behaves as compensated off treatment.',
      notes: 'Baveno VIII 7.6: ascites that has resolved while the patient is still on diuretics is not evidence of recompensation. Once the cause is cured or controlled, the ascites is gone and the liver tests are back to Child–Pugh A, consider withdrawing the diuretics; that is the test. 7.7 says the same for encephalopathy: no episodes on lactulose, rifaximin or LOLA is not evidence, and the drug should be considered for withdrawal once the cause is controlled, the encephalopathy has resolved and the liver tests are back to Child–Pugh A. 7.8: a patient with a TIPS can recompensate if every criterion in 7.4 is met, but ascites cleared by the TIPS alone, or no rebleeding after it, is not enough. These are three ways to call a patient recompensated too early.',
      ask: ['His ascites has cleared on spironolactone and furosemide. Has he recompensated?', 'Not yet. Ascites gone on diuretics is not recompensation (Baveno VIII 7.6). Withdrawal of the diuretics is considered once the cause is controlled and the liver is back to Child–Pugh A.'],
    },
    {
      // (The next question once recompensated: the beta-blocker. His HVPG is the model's, 11.4 mmHg; he has never taken carvedilol, so any HVPG of his is off it.
      // The stiffness and spleen stiffness are the model's, over the case's HVPG. tool-path.js.)
      id: 'path-stopcarv', cam: 'fit',
      tool: { kind: 'path', of: 'stopcarv', short: 'Stopping carvedilol', patient: { hv: 'high' } },
      kicker: 'Recompensation', site: 'sin', title: 'Recompensating, but CSPH has not resolved',
      line: 'Stopping carvedilol requires confirmed resolution of CSPH. His HVPG is {hvpg}, which is {>=10 mmHg}, and his liver stiffness is {lsm}: CSPH persists, so carvedilol is indicated.',
      notes: 'Source: Baveno VIII 7.15 to 7.19. CSPH may resolve over time in a recompensated patient (7.15), but carvedilol may be stopped only if the resolution is confirmed (7.18, weak). It is confirmed by an HVPG <10 mmHg measured off carvedilol (7.16). Noninvasively, an LSM <10 kPa, or <15 kPa with a spleen stiffness measurement (SSM) <25 kPa, may rule CSPH out, and an LSM >25 kPa may rule it in (7.19). Varices and collaterals may stay after CSPH resolves, so they prove nothing either way (7.17). He has never taken carvedilol, so his HVPG of 11.4 mmHg is already an off-drug reading, and it shows that CSPH persists. His LSM of 23.5 kPa and SSM of about 49 kPa do not rule it out. Carvedilol is the drug for him to start, and to continue. The chart that follows shows why the pressure stays high.',
      ask: ['An HVPG measured off carvedilol is 7 mmHg. May the drug stop?', 'Yes: an HVPG <10 mmHg off carvedilol confirms that CSPH has resolved (7.16, 7.18). Varices that remain do not argue against it.'],
    },
    {
      // (Baveno VIII 7.9 to 7.14: who recompensates, and what goes on after. The figure is the slide before's.)
      id: 'who', cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Who recompensates, and then', short: 'Who, and then', ticks: false, lead: 'What helps, and what continues.', rule: 'Baveno VIII 7.9, 7.10, 7.11, 7.13, 7.14',
        rows: ['**Milder** liver disease and portal hypertension at decompensation', '**Sooner** treatment of the cause after decompensation', '**Hepatology** follow-up every 6 months', 'HCC **surveillance** continues'] },
      kicker: 'Recompensation', site: 'sin', title: 'Early treatment of the cause makes recompensation more likely',
      line: 'Milder disease and earlier treatment of the cause make recompensation more likely. The risk persists: hepatology follow-up every 6 months and HCC surveillance continue.',
      notes: 'Baveno VIII 7.9: a higher Child–Pugh or MELD score at decompensation, or a further decompensation, makes recompensation less likely. 7.10: so do high-risk varices (portal hypertension that is more severe). 7.11: a shorter time from decompensation to treating the cause may raise the chance. 7.12: the type and number of events may matter. 7.13: a recompensated patient is still at risk and remains in hepatology follow-up every 6 months. 7.14: the risk of HCC is lower than in decompensated patients but not eliminated, so surveillance continues. None of these makes recompensation a cure.',
      ask: ['A recompensated patient asks whether he can stop his visits every 6 months and his HCC surveillance imaging. What do you say?', 'No. He remains in hepatology follow-up every 6 months, and HCC surveillance continues (Baveno VIII 7.13, 7.14).'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Two years on one chart', style: 'milestones', bands: ['diuretics'] },
      kicker: 'Recompensation', site: 'sin', title: 'Two years on one chart',
      line: 'The HVPG rose with the injury and fell once the cause was removed.',
      notes: 'The chart plots the HVPG at each step, shades the period on diuretics, and names the first ascites and abstinence above the line. Removing the cause changes the course of the disease; a drug such as carvedilol lowers the HVPG by a few mmHg more. Neither returns the pressures to normal.',
      ask: ['What lowered the HVPG in this case?', 'Removing the cause: a year of abstinence.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, read stiffness
      // against the HVPG and the platelets. The dots are his visits, joined in order; the ring is him off diuretics, the slide before's state.)
      id: 'relation', cam: 'liver',
      tool: { kind: 'curve', x: 'lsm', xCuts: [15, 25], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.4, to: 1, step: 0.05, days: 365, lines: ['hvpg', 'plt'], walk: true,
        dots: [{ slide: 'csph', name: 'Compensated', on: [0] }, { slide: 'ascites', name: 'First ascites', on: [0] }, { slide: 'cure', name: 'Cause removed', on: [0] }] },
      kicker: 'Summary', site: 'sin', title: 'He is recompensating, but his HVPG stays ≥10 mmHg',
      line: 'Ascites moved him up the curve and a year of abstinence brought him back: LSM {lsm}, platelets {plt}, HVPG {hvpg}. That is where he began, still {>=10 mmHg}.',
      notes: 'Liver stiffness on the x-axis, the HVPG and the platelets on the y-axis: the model\'s cirrhosis from mild to severe, each point settled for a year. The dots are his visits. The ascites moved him up the curve, to an HVPG of 17.0 mmHg, an LSM of 29.0 kPa and platelets of 56,000/µL; a year of abstinence took him back down the same curve, to 11.2 mmHg, almost where he began at 11.6 mmHg. Recompensation moves the patient back along the curve, not off it, and it does not mean CSPH has resolved. Baveno VIII defines recompensation by the clinical criteria (7.4), and says CSPH may resolve over time (7.15), confirmed by an HVPG <10 mmHg measured off carvedilol (7.16); carvedilol is stopped only once that is confirmed (7.18). In the model he is at 11.4 mmHg off diuretics, so the NSBB would continue. Varices may persist after CSPH has resolved, so their presence does not show that CSPH persists (7.17). (Baveno VIII 7.4, 7.15 to 7.18, Fig. 2.) One model patient per point; real patients vary far more.',
      ask: ['He has recompensated, with an HVPG still ≥10 mmHg. What about the beta-blocker?', 'He never started one, so he starts it now: CSPH persists. Baveno VIII 7.18 stops carvedilol only when CSPH resolution is confirmed: an HVPG <10 mmHg measured off the drug.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'plt'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'csph', kicker: 'Compensated', title: 'CSPH' }, { id: 'ascites', kicker: 'Decompensated', title: 'First ascites' }, { id: 'diuretics', kicker: 'Decompensated', title: 'Diuretics' },
        { id: 'cure', kicker: 'Recompensation', title: 'Cause removed' }, { id: 'recomp', kicker: 'Recompensation', title: 'Off diuretics' }],
      kicker: 'Summary', title: 'Two years, from decompensation to recompensation',
      line: 'Removing the cause lowered the portal pressure more than any drug. CSPH persists, so he starts a beta-blocker now, and HCC surveillance continues.',
      notes: 'The first decompensation is a turning point, but not always an irreversible one. Treat the ascites and the portal pressure, and above all the cause: a patient who becomes abstinent or achieves viral cure can recompensate. Continue the NSBB while CSPH persists, and continue HCC surveillance.',
      ask: ['Name the three conditions Baveno VIII sets for recompensation.', 'The cause removed, suppressed or cured; no ascites or encephalopathy off treatment and no recurrent variceal bleeding for >6 months; and liver function back to Child–Pugh A.'],
    },
  ],
};
