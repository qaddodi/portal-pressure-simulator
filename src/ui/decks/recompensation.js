// Presenter talk: one patient over two years, from CSPH to the first ascites and back to recompensation once the
// cause is removed (the slide fields are described at the top of decks.js).

const OFF = { carvedilol: false };
const BELLY = { kind: 'abdomen' };

export const RECOMPENSATION = {
  id: 'recompensation', level: 'advanced', title: 'Decompensation and recompensation', minutes: 10,
  objectives: [
    'Define decompensation and name its three events',
    'Treat the first ascites: salt, diuretics, and a beta-blocker with care',
    'Explain what removing the cause does to the portal pressure',
    'State the Baveno VIII criteria for recompensation',
  ],
  checks: [
    ['Name the three events that mark decompensation.', 'Ascites, variceal bleeding and hepatic encephalopathy.'],
    ['What lowered the portal pressure most in this case?', 'Removing the cause: stopping alcohol.'],
    ['When has a patient recompensated under Baveno VIII?', 'The cause is removed or controlled, there is no ascites or encephalopathy off treatment and no further variceal bleed for more than 6 months, and the liver is back to Child–Pugh A.'],
  ],
  summary: 'One patient over two years: CSPH, the first ascites, diuretics and carvedilol, then the cause removed and the liver recompensates. The portal pressure falls, but recompensation is not a cure.',
  slides: [
    {
      id: 'csph', tick: 'CSPH', preset: 'csph', cam: 'liver', data: 'ladder', key: ['hvpg'], tiles: ['varix'],
      kicker: 'Compensated', site: 'sin', title: 'Compensated, with CSPH',
      vignette: 'A 47-year-old man with alcohol-associated cirrhosis drinks about eight drinks a day. He has never had ascites or bleeding, and his platelets are 88,000/µL.',
      line: 'In alcohol-associated cirrhosis, an HVPG of {hvpg} is 10 mmHg or more. There is no ascites or bleeding yet, but both are now possible, and the risk rises with the HVPG.',
      notes: 'Clinically significant portal hypertension marks the patients at risk of decompensation. Baveno VIII advises treating the cause and starting a non-selective beta-blocker, preferably carvedilol, at this stage to prevent decompensation. The patient keeps drinking and takes no treatment, so the disease runs its course.',
      ask: ['What does Baveno VIII advise for compensated cirrhosis with CSPH?', 'Treat the cause, and start a non-selective beta-blocker, preferably carvedilol, to prevent decompensation.'],
    },
    {
      id: 'ascites', tick: 'First ascites', days: 365, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'csph',
      kicker: 'Decompensation', site: 'sin', title: 'Ascites: the first decompensation',
      line: 'A year of ongoing injury: the HVPG climbs to {hvpg}, the albumin falls, and {asc} of ascites gathers.',
      notes: 'Decompensation is the first episode of ascites, variceal bleeding or overt encephalopathy, and ascites is the commonest first event. It changes the outlook: median survival falls from more than a decade to about two years. Every new ascites needs a diagnostic tap for the SAAG, the protein and the neutrophil count.',
      ask: ['Name the three events that define decompensation.', 'Ascites, variceal bleeding and overt hepatic encephalopathy.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc'], key: ['asc'],
      kicker: 'Decompensation', site: 'sin', title: 'Salt restriction and diuretics',
      line: 'Spironolactone, furosemide and moderate salt restriction bring the ascites down to {asc} in a month.',
      notes: 'A moderate sodium restriction, about 2 g of sodium (5 g of salt) a day, with spironolactone and furosemide treats grade 2 ascites; the doses rise stepwise to at most 400 mg of spironolactone and 160 mg of furosemide. Weight loss should stay under about 0.5 kg a day without leg edema. Watch the sodium, the potassium and the creatinine.',
      ask: ['What are the maximum daily doses of spironolactone and furosemide?', '400 mg of spironolactone and 160 mg of furosemide.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', params: { drugs: { carvedilol: true } }, cam: 'liver', data: 'ladder', key: ['hvpg'], tiles: ['map'],
      compare: [{ label: 'No beta-blocker', params: { drugs: OFF } }, { label: 'Carvedilol', own: true, params: { drugs: { carvedilol: true } } }],
      kicker: 'Decompensation', site: 'sin', title: 'Carvedilol once ascites is present',
      line: 'Carvedilol lowers the HVPG to {hvpg}. With ascites, lower the dose or stop it if the blood pressure stays low or the kidneys fail.',
      notes: 'With ascites and varices, Baveno VIII recommends a beta-blocker, carvedilol preferred, to prevent a first bleed and to lower the risk of ascites complications. Baveno VIII advises reducing the dose or stopping it when the systolic pressure stays below 90 mmHg (or the mean below 65 mmHg) or acute kidney injury develops, and restarting it when these resolve.',
      ask: ['When is the beta-blocker reduced or stopped in a patient with ascites?', 'When the blood pressure stays low (systolic below 90 mmHg) or acute kidney injury develops.'],
    },
    {
      id: 'cure', tick: 'Cause removed', days: 365, ramp: { cirrhosis: [0.85, 0.6], albumin: [2.8, 3.8] }, lapse: { seconds: 10 }, cam: 'liver', data: 'tiles', tiles: ['hvpg', 'salb', 'asc'], key: ['hvpg'], delta: 'carv',
      kicker: 'Recompensation', site: 'sin', title: 'Stopping alcohol lowers the portal pressure',
      line: 'A year of abstinence: the albumin rises to {salb}, the ascites clears and the HVPG falls to {hvpg}.',
      notes: 'Removing the cause, by stopping alcohol, curing hepatitis C or suppressing hepatitis B, is the most effective long-term treatment of portal hypertension. Inflammation settles and some scar regresses, so the resistance in the liver and the HVPG fall over months to years. The fall is often incomplete: many patients keep CSPH, and they keep the beta-blocker.',
      ask: ['What is the most effective long-term way to lower the portal pressure?', 'Remove the cause of the cirrhosis.'],
    },
    {
      id: 'recomp', tick: 'Off diuretics', params: { diuretics: false }, days: 60, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'],
      kicker: 'Recompensation', site: 'sin', title: 'Baveno VIII criteria for recompensation',
      line: 'Off diuretics the ascites stays away and the albumin holds. If that lasts more than 6 months, with the liver back to Child–Pugh A, this counts as recompensation.',
      causesHead: 'Baveno VIII criteria', causes: ['Cause removed or controlled', 'No ascites or encephalopathy off treatment, and no rebleed, for over 6 months', 'Back to Child–Pugh A'],
      notes: 'Baveno VIII asks for all of: the cause removed, suppressed or cured; no ascites on imaging off diuretics, no encephalopathy off lactulose or rifaximin and, after a variceal bleed, no further bleed (carvedilol may continue), all for more than 6 months in a row; and liver function back to Child–Pugh A (5 or 6 points). Recompensation means the disease behaves as compensated again; it is not a cure. The cirrhosis is still there, still needs a clinic visit every 6 months with surveillance for liver cancer and, while CSPH persists, the beta-blocker. If the cause returns, decompensation can follow.',
      ask: ['After recompensation, does liver cancer surveillance stop?', 'No: the cirrhosis remains, so surveillance continues.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Two years on one chart' },
      kicker: 'Recompensation', site: 'sin', title: 'Two years on one chart',
      line: 'The portal pressure rose with the injury, fell a little with carvedilol and fell further once the cause was gone.',
      notes: 'The chart plots the portal, wedged and free pressures and the HVPG at each step. The drug buys a few mmHg; removing the cause changes the course of the disease. Neither returns the pressures to normal.',
      ask: ['Which lowered the HVPG more in this case, carvedilol or abstinence?', 'Abstinence, over a year.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'plt'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'csph', kicker: 'Compensated', title: 'CSPH' }, { id: 'ascites', kicker: 'Decompensated', title: 'First ascites' }, { id: 'diuretics', kicker: 'Decompensated', title: 'Diuretics' },
        { id: 'carv', kicker: 'Decompensated', title: 'Carvedilol' }, { id: 'cure', kicker: 'Recompensation', title: 'Cause removed' }, { id: 'recomp', kicker: 'Recompensation', title: 'Off diuretics' }],
      kicker: 'Summary', title: 'Two years, from decompensation to recompensation',
      line: 'Removing the cause lowered the portal pressure more than any drug. Carvedilol continues while CSPH persists, and so does liver cancer surveillance.',
      notes: 'The first decompensation is a turning point, but not always a one-way one. Treat the ascites and the portal pressure, and above all the cause: a patient who stops drinking or is cured of a virus can recompensate. Keep the beta-blocker while CSPH lasts, and keep watching for liver cancer.',
      ask: ['Name the three conditions Baveno VIII sets for recompensation.', 'The cause removed, suppressed or cured; no ascites or encephalopathy off treatment and no further variceal bleed for more than 6 months; and liver function back to Child–Pugh A.'],
    },
  ],
};
