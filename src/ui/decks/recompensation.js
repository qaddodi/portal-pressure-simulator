// Presenter talk: one patient over two years, from CSPH to the first ascites and back to recompensation once the
// cause is removed (the slide fields are described at the top of decks.js).

const BELLY = { kind: 'abdomen' };

export const RECOMPENSATION = {
  id: 'recompensation', level: 'advanced', title: 'Decompensation and recompensation', minutes: 9,
  objectives: [
    'Define decompensation and name its three events',
    'Treat the first ascites with salt restriction and diuretics',
    'Explain what removing the cause does to the portal pressure',
    'State the Baveno VIII criteria for recompensation',
  ],
  checks: [
    ['Name the three events that mark decompensation.', 'Ascites, variceal bleeding and hepatic encephalopathy.'],
    ['What lowered the portal pressure most in this case?', 'Removing the cause: stopping alcohol.'],
    ['When has a patient recompensated under Baveno VIII?', 'The cause is removed or controlled, there is no ascites or encephalopathy off treatment and no further variceal bleed for >6 months, and the liver is back to Child–Pugh A.'],
    ['A year after stopping alcohol, the HVPG has fallen from 18 to 12 mmHg and the albumin has risen. Has he recompensated?', 'Not on the numbers alone. He also needs no ascites, encephalopathy or rebleed off treatment for >6 months, and the liver back to Child–Pugh A.'],
  ],
  summary: 'One patient over two years: CSPH, the first ascites, diuretics, then the cause removed and the liver recompensates. The portal pressure falls, but recompensation is not a cure.',
  slides: [
    {
      id: 'csph', tick: 'CSPH', preset: 'csph', cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['varix'],
      kicker: 'Compensated', site: 'sin', title: 'Compensated, with CSPH',
      vignette: 'A 47-year-old man with alcohol-associated cirrhosis drinks about eight drinks a day. He has never had ascites or bleeding, and his platelets are 88,000/µL.',
      line: 'The HVPG is {hvpg}, which is {>=10 mmHg}: CSPH, with no ascites or bleeding. Baveno VIII would start carvedilol now; this case holds it back to show what follows.',
      notes: 'Source: Baveno VIII 3.15. Clinically significant portal hypertension marks the patients at risk of decompensation. Baveno VIII advises treating the cause and starting a non-selective beta-blocker, preferably carvedilol, at this stage to prevent decompensation. The patient keeps drinking and takes no treatment, so the disease runs its course.',
      ask: ['What does Baveno VIII advise for compensated cirrhosis with CSPH?', 'Treat the cause, and start a non-selective beta-blocker, preferably carvedilol, to prevent decompensation.'],
    },
    {
      id: 'ascites', tick: 'First ascites', days: 365, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: BELLY, milestone: 'Ascites', data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'csph',
      kicker: 'Decompensation', site: 'sin', title: 'Ascites: the first decompensation',
      line: 'A year of ongoing injury: the HVPG climbs to {hvpg}, the albumin falls, and {asc} of ascites gathers.',
      notes: 'Decompensation is the first episode of ascites, variceal bleeding or overt encephalopathy, and ascites is the commonest first event. It changes the outlook: median survival falls from more than a decade to about two years. Every new ascites needs a diagnostic tap for the SAAG, the protein and the neutrophil count.',
      ask: ['Name the three events that define decompensation.', 'Ascites, variceal bleeding and overt hepatic encephalopathy.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'ascites',
      kicker: 'Decompensation', site: 'sin', title: 'Salt restriction and diuretics',
      line: 'Spironolactone, furosemide and moderate salt restriction bring the ascites down to {asc} in a month.',
      notes: 'A moderate sodium restriction, about 2 g of sodium (5 g of salt) a day, with spironolactone and furosemide treats grade 2 ascites; the doses rise stepwise to at most 400 mg of spironolactone and 160 mg of furosemide. Weight loss should stay under about 0.5 kg a day without leg edema. Watch the sodium, the potassium and the creatinine. A beta-blocker, carvedilol preferred, is also advised with ascites and varices, but this case leaves it out. Baveno VIII advises reducing the dose or stopping it when the systolic pressure stays below 90 mmHg (or the mean below 65 mmHg) or acute kidney injury develops, and restarting it when these resolve.',
      ask: ['What are the maximum daily doses of spironolactone and furosemide?', '400 mg of spironolactone and 160 mg of furosemide.'],
    },
    {
      id: 'cure', tick: 'Cause removed', days: 365, ramp: { cirrhosis: [0.85, 0.6], albumin: [2.8, 3.8] }, lapse: { seconds: 10 }, cam: 'liver', tool: { kind: 'hvpg' }, milestone: 'Abstinence', data: 'tiles', tiles: ['salb', 'asc'], key: ['salb'], delta: 'diuretics',
      kicker: 'Recompensation', site: 'sin', title: 'Stopping alcohol lowers the portal pressure',
      line: 'A year of abstinence: the albumin rises to {salb}, the ascites clears and the HVPG falls to {hvpg}.',
      notes: 'Removing the cause, by stopping alcohol, curing hepatitis C or suppressing hepatitis B, is the most effective long-term treatment of portal hypertension. Inflammation settles and some scar regresses, so the resistance in the liver and the HVPG fall over months to years. The fall is often incomplete: many patients keep CSPH, and they keep the beta-blocker.',
      ask: ['What is the most effective long-term way to lower the portal pressure?', 'Remove the cause of the cirrhosis.'],
    },
    {
      id: 'recomp', tick: 'Off diuretics', params: { diuretics: false }, days: 60, cam: 'fit', data: 'tiles',
      tool: { kind: 'criteria', title: 'Recompensation', lead: 'All of these, for >6 months.', rule: 'Baveno VIII 7.4', rows: ['**Cause** removed or controlled', ['No **ascites** off diuretics', 'asc', '<', 0.15],
        'No **encephalopathy** off treatment, and no **rebleed**', 'Back to **Child–Pugh A**, 5 or 6 points'] }, tiles: ['asc', 'salb'], key: ['asc'],
      kicker: 'Recompensation', site: 'sin', title: 'Baveno VIII criteria for recompensation',
      line: 'Off diuretics the ascites stays away and the albumin holds. If that lasts >6 months, with the liver back to Child–Pugh A, this counts as recompensation.',
      notes: 'Source: Baveno VIII 7.4. Baveno VIII asks for all of: the cause removed, suppressed or cured; no ascites on imaging off diuretics, no encephalopathy off lactulose or rifaximin and, after a variceal bleed, no further bleed (carvedilol may continue), all for more than 6 months in a row; and liver function back to Child–Pugh A (5 or 6 points). Recompensation means the disease behaves as compensated again; it is not a cure. The cirrhosis is still there, still needs a clinic visit every 6 months with surveillance for liver cancer and, while CSPH persists, the beta-blocker. If the cause returns, decompensation can follow.',
      ask: ['After recompensation, does liver cancer surveillance stop?', 'No: the cirrhosis remains, so surveillance continues.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Two years on one chart', style: 'milestones', bands: ['diuretics'] },
      kicker: 'Recompensation', site: 'sin', title: 'Two years on one chart',
      line: 'The HVPG rose with the injury and fell once the cause was gone.',
      notes: 'The chart plots the HVPG at each step, shades the diuretics while they were on, and names the first ascites and abstinence above the line. Removing the cause changes the course of the disease; a drug such as carvedilol buys a few mmHg more. Neither returns the pressures to normal.',
      ask: ['What lowered the HVPG in this case?', 'Removing the cause: a year of abstinence.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, read stiffness
      // against the HVPG and the platelets. The dots are his visits, joined in order; the ring is him off diuretics, the slide before's state.)
      id: 'relation', cam: 'liver',
      tool: { kind: 'curve', x: 'lsm', xCuts: [15, 25], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.4, to: 1, step: 0.05, days: 365, lines: ['hvpg', 'plt'], walk: true,
        dots: [{ slide: 'csph', name: 'Compensated', on: [0] }, { slide: 'ascites', name: 'First ascites', on: [0] }, { slide: 'cure', name: 'Cause removed', on: [0] }] },
      kicker: 'Summary', site: 'sin', title: 'He recompensates, but his HVPG stays ≥10',
      line: 'Ascites took him up the line and a year without alcohol brought him back: {lsm}, platelets of {plt}, HVPG {hvpg}. That is where he began, still {>=10 mmHg}.',
      notes: 'Stiffness across, the HVPG and the platelets up: the model\'s cirrhosis from mild to severe, each point settled for a year. The dots are his visits. The ascites took him up the line, to an HVPG of 17.0 mmHg, a stiffness of 29.0 kPa and platelets of 56,000/µL; a year without alcohol took him back down the same line, to 11.2 mmHg, almost where he began at 11.6. Recompensation moves the patient back along the line, not off it, and it does not mean CSPH is gone. Baveno VIII defines recompensation by the clinical criteria (7.4), and says CSPH may resolve over time (7.15), confirmed by an HVPG under 10 mmHg measured off carvedilol (7.16); carvedilol stops only once that is confirmed (7.18). In the model he is at 11.4 mmHg off diuretics, so the beta-blocker would continue. Varices may persist after CSPH has resolved, so they are no sign that it has not (7.17). (Baveno VIII 7.4, 7.15 to 7.18, Fig. 2.)',
      ask: ['He has recompensated, with an HVPG still ≥10 mmHg. What about the beta-blocker?', 'It continues. Baveno VIII 7.18 stops carvedilol only when CSPH resolution is confirmed: an HVPG <10 mmHg measured off the drug.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'plt'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'csph', kicker: 'Compensated', title: 'CSPH' }, { id: 'ascites', kicker: 'Decompensated', title: 'First ascites' }, { id: 'diuretics', kicker: 'Decompensated', title: 'Diuretics' },
        { id: 'cure', kicker: 'Recompensation', title: 'Cause removed' }, { id: 'recomp', kicker: 'Recompensation', title: 'Off diuretics' }],
      kicker: 'Summary', title: 'Two years, from decompensation to recompensation',
      line: 'Removing the cause lowered the portal pressure more than any drug. A beta-blocker continues while CSPH persists, and so does liver cancer surveillance.',
      notes: 'The first decompensation is a turning point, but not always a one-way one. Treat the ascites and the portal pressure, and above all the cause: a patient who stops drinking or is cured of a virus can recompensate. Keep the beta-blocker while CSPH lasts, and keep watching for liver cancer.',
      ask: ['Name the three conditions Baveno VIII sets for recompensation.', 'The cause removed, suppressed or cured; no ascites or encephalopathy off treatment and no further variceal bleed for >6 months; and liver function back to Child–Pugh A.'],
    },
  ],
};
