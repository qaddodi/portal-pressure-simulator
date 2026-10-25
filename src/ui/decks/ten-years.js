// Presenter talk: one man followed for ten years, from compensated cirrhosis to a transplant evaluation, with a decision at each
// step (the slide fields are described at the top of decks.js). Each decision is two slides with the same kicker: the question,
// with the live options where the model can show them, and the answer the guidelines give. The injury is never removed in
// the model, so every later step can be shown; Baveno VIII 4.2 would treat the cause after the first decompensation.
// Sources, checked 25 Oct 2026 against the Baveno VIII text in /mnt/project-files/guidelines/: 3.15 and 3.16 (carvedilol only
// with CSPH), 4.1 (further decompensation), 4.3 and 6.1 (transplant evaluation), 4.4 and 4.6 (carvedilol with ascites and varices,
// and when to cut it), 4.8 (carvedilol with banding after a first bleed, even after carvedilol as primary prophylaxis), 4.13 (TIPS
// when that fails), 6.16 and 6.17 (rifaximin before an elective TIPS; narrowing the stent for encephalopathy that persists).

const BAND = { kind: 'band' };
const BELLY = { kind: 'abdomen' };
const CARV = { drugs: { carvedilol: true } };
const OFF = { carvedilol: false };

export const TEN_YEARS = {
  id: 'ten-years', level: 'advanced', title: 'One patient, ten years', minutes: 14,
  objectives: [
    'Follow one man from compensated cirrhosis to a transplant evaluation',
    'Pick the treatment at each step: carvedilol, diuretics, banding, TIPS',
    'Name what the model can and cannot show of encephalopathy after a TIPS',
    'Say when further decompensation calls for a transplant evaluation',
  ],
  checks: [
    ['At what point does Baveno VIII start carvedilol in compensated cirrhosis?', 'At CSPH, to prevent decompensation. Without CSPH it should not be used for that purpose.'],
    ['He bled while taking carvedilol. Does he stop it?', 'No. Baveno VIII 4.8 pairs carvedilol with banding after the first bleed, whether or not he took carvedilol before.'],
    ['He bleeds again on carvedilol and repeat banding. What next?', 'A TIPS. Baveno VIII 4.13 says to consider one when secondary prophylaxis fails.'],
    ['Two months after the TIPS he is confused, and the PPG is low. Which comes first, narrowing the stent or lactulose?', 'Lactulose, after a search for the trigger. The stent is narrowed only if the confusion persists, because a narrower stent raises the portal pressure again.'],
  ],
  sections: [['Compensated', ['Year 0', 'Year 3']], ['Ascites', ['Year 6']], ['Bleeding', ['Year 8', 'Year 9']], ['The end', ['Year 10', 'Summary']]],
  summary: 'One man with cirrhosis over ten years: CSPH and carvedilol, the first ascites and diuretics, a bleed and banding, a rebleed and a TIPS, encephalopathy, and the transplant evaluation, with a decision at each step.',
  slides: [
    {
      id: 'start', tick: 'Year 0', milestone: 'Cirrhosis', preset: 'cirr-comp', cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['hvpg'],
      vignette: 'A 48-year-old man with MASH cirrhosis is found on a scan for abnormal liver tests. He has no symptoms, and an endoscopy shows no varices.',
      kicker: 'Year 0', site: 'sin', title: 'Year 0: compensated cirrhosis, no varices',
      line: 'The HVPG is {hvpg}, below {>=10 mmHg}. He has cirrhosis without CSPH, so a beta-blocker would not help him yet. The next ten years follow what happens when the injury goes on.',
      cite: 'Baveno VIII 3.16',
      notes: 'Compensated cirrhosis without clinically significant portal hypertension needs follow-up and treatment of the cause, not a beta-blocker. Baveno VIII advises against using one to prevent decompensation at this stage. In this case the injury is never removed, so every later step can be shown in the same man.',
      ask: ['Does a man with compensated cirrhosis and an HVPG under 10 mmHg need carvedilol?', 'No. Baveno VIII advises against a beta-blocker to prevent decompensation without CSPH.'],
    },
    {
      id: 'rise', tick: 'Year 3', days: 1000, ramp: { cirrhosis: [0.4, 0.6] }, lapse: { seconds: 10 }, cam: 'liver', tool: { kind: 'profile', from: 'start', fromLabel: 'Year 0' }, data: 'tiles', tiles: ['varix', 'plt'], key: ['hvpg'], delta: 'start',
      compare: [{ label: 'No drug', own: true, params: { drugs: OFF } }, { label: 'Carvedilol', short: 'Carv.', params: CARV }],
      kicker: 'Year 3', site: 'sin', title: 'Year 3: the HVPG has crossed 10 mmHg',
      line: 'Three years on, the HVPG is {hvpg}, at or above {>=10 mmHg}, and small varices have appeared. He still feels well. Try carvedilol with the buttons. Does he need a drug now?',
      notes: 'The pressure has risen with the scar, and nothing on his exam has changed. Clinically significant portal hypertension is the point where decompensation becomes likely, so the question is whether to treat before anything happens.',
      ask: ['His HVPG has risen to 11 mmHg and he feels well. Does he need a drug?', 'Yes. Baveno VIII recommends carvedilol at CSPH, to prevent decompensation.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', milestone: 'Carvedilol', params: CARV, cam: 'liver', tool: { kind: 'profile', from: 'rise', fromLabel: 'No drug' }, data: 'tiles', tiles: ['map', 'varix'], key: ['hvpg'], delta: 'rise',
      cite: 'Baveno VIII 3.15',
      kicker: 'Year 3', site: 'sin', title: 'Carvedilol at CSPH prevents decompensation',
      line: 'Baveno VIII recommends carvedilol in compensated cirrhosis with CSPH, to prevent decompensation and improve survival. It lowers his HVPG from {hvpg@rise} to {hvpg}.',
      notes: 'Carvedilol acts on both flow and resistance: it lowers the portal inflow and relaxes the liver\'s resistance, so it lowers the HVPG more than propranolol. Baveno VIII prefers it in compensated cirrhosis with CSPH. The dose is raised slowly, and the systolic pressure has to stay above 90 mmHg.',
      ask: ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'When CSPH is present, to prevent decompensation and improve survival.'],
    },
    {
      id: 'ascites', tick: 'Year 6', milestone: 'Ascites', days: 1100, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'carv',
      compare: [{ label: 'Carvedilol alone', short: 'Carv.', own: true, params: { diuretics: false } }, { label: 'Add diuretics', short: 'Diuretics', params: { diuretics: true } }],
      kicker: 'Year 6', site: 'sin', title: 'Year 6: the first ascites',
      line: 'Three more years of injury: the HVPG is {hvpg}, the albumin has fallen to {salb}, and {asc} of ascites has gathered despite carvedilol. Try adding diuretics. What happens to the carvedilol?',
      notes: 'The first ascites is the first decompensation, and it changes the outlook. After it, Baveno VIII 4.2 recommends treating the cause, to prevent further decompensation. In this case the injury goes on, so the later steps can follow.',
      ask: ['What is the first decompensation in this case?', 'Ascites at year 6.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'map'], key: ['asc'], delta: 'ascites',
      cite: 'Baveno VIII 4.4, 4.6',
      kicker: 'Year 6', site: 'sin', title: 'Diuretics and salt limit, carvedilol stays',
      line: 'Spironolactone, furosemide and a moderate salt limit bring the ascites down to {asc}. Carvedilol continues unless the systolic pressure stays under 90 mmHg or the kidneys fail.',
      notes: 'Ascites with varices is a reason to keep carvedilol, not to stop it: Baveno VIII 4.4 recommends it to prevent a first bleed and to lower the risk of ascites complications. It is cut or stopped if the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or a hepatorenal acute kidney injury develops, and restarted when they recover.',
      ask: ['When is carvedilol reduced or stopped in a man with ascites?', 'When the systolic pressure stays under 90 mmHg (or the mean under 65 mmHg), or hepatorenal acute kidney injury develops.'],
    },
    {
      id: 'bleed', tick: 'Year 8', milestone: 'Bleed', days: 700, action: [BAND], cam: 'varices', labels: ['VAR'], calipers: ['varix'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'diuretics',
      kicker: 'Year 8', site: 'sin', title: 'Year 8: a first bleed, on carvedilol',
      line: 'He vomits blood from a {varix} varix. Octreotide, ceftriaxone and a band stop it. He was already taking carvedilol. What prevents the next bleed?',
      notes: 'The bleed itself is managed as in the Variceal bleed talk: vasoactive drugs, antibiotics and endoscopy within 12 hours. The decision here comes after it, once he is stable. He bled despite carvedilol, so the question is whether carvedilol has failed him.',
      ask: ['A man bleeds from varices while taking carvedilol. Has carvedilol failed?', 'Not on that fact alone. Baveno VIII 4.8 pairs carvedilol with banding whether or not he took carvedilol before.'],
    },
    {
      id: 'bands', tick: 'Carvedilol and bands', action: [BAND, BAND, BAND], cam: 'varices', labels: ['VAR'], calipers: ['varix'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'bleed',
      cite: 'Baveno VIII 4.8',
      kicker: 'Year 8', site: 'sin', title: 'Carvedilol with banding, until the varices are gone',
      line: 'The first-line plan after a bleed from varices is carvedilol with repeat banding. Carvedilol holds the HVPG at {hvpg}, and three sessions of banding take the varix down to {varix}.',
      notes: 'Banding closes the varices but leaves the pressure behind them; carvedilol lowers the pressure but leaves the varices. Baveno VIII 4.8 combines them as first-line prevention of recurrent bleeding, with carvedilol preferred, whether or not the man took carvedilol before the bleed. Banding is repeated every 2 to 4 weeks until the varices are gone.',
      ask: ['What is first-line prevention of a repeat variceal bleed?', 'Carvedilol with banding, whether or not carvedilol was taken before the bleed.'],
    },
    {
      id: 'rebleed', tick: 'Year 9', milestone: 'Rebleed', days: 270, cam: 'liver', tool: { kind: 'profile', from: 'bands', fromLabel: 'Year 8' }, data: 'tiles', tiles: ['varix', 'liver'], key: ['hvpg'], delta: 'bands',
      compare: [{ label: 'Bands and carvedilol', short: 'Bands', own: true, params: { tips: { on: false, d: 8 } } }, { label: 'TIPS', params: { tips: { on: true, d: 8 } } }],
      kicker: 'Year 9', site: 'sin', title: 'Year 9: a second bleed, on both treatments',
      line: 'Nine months later the varices are back to {varix} and he bleeds again, on carvedilol. The HVPG is {hvpg}. Try a TIPS with the buttons and watch the HVPG and the liver flow. What does the guideline say?',
      notes: 'Two bleeds make this further decompensation. Carvedilol and banding have been given properly and have failed, so more of the same is unlikely to help. The question is what lowers the pressure more.',
      ask: ['A man bleeds again on carvedilol and repeat banding. Is a TIPS considered?', 'Yes. Baveno VIII 4.13 says to consider a TIPS when bleeding continues despite secondary prophylaxis.'],
    },
    {
      id: 'tips', tick: 'TIPS', milestone: 'TIPS', params: { tips: { on: true, d: 8 } }, cam: 'liver', tool: { kind: 'profile', from: 'rebleed', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'rebleed',
      cite: 'Baveno VIII 4.13',
      kicker: 'Year 9', site: 'sin', title: 'A TIPS when prevention fails',
      line: 'A covered TIPS takes the PPG to {ppg}. The price is the liver\'s blood: it keeps {liver} of its normal flow.',
      notes: 'Baveno VIII advises considering a TIPS for bleeding despite secondary prophylaxis with carvedilol and banding. The stent opens a channel from the portal vein to a hepatic vein, so the gradient falls under the level where varices bleed. The cost is a share of portal blood that no longer passes through the liver, and with it a risk of encephalopathy.',
      ask: ['What does a TIPS cost the liver?', 'Part of its portal blood supply, because most portal blood now bypasses it through the stent.'],
    },
    {
      id: 'he', tick: 'Year 9', days: 60, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'tips',
      compare: [{ label: '8 mm stent', short: '8 mm', own: true, params: { tips: { d: 8 } } }, { label: 'Narrower stent', short: 'Narrower', params: { tips: { d: 5 } } }],
      caveat: 'The model has no ammonia or brain; the share of portal blood that skips the liver stands in for the risk.',
      kicker: 'Year 9', site: 'sin', title: 'Two months after the TIPS he is confused',
      line: 'He sleeps by day and is slow to answer. {shunt} of the portal blood now bypasses the liver. Narrow the stent with the buttons and watch the PPG. What should he get first?',
      notes: 'Overt encephalopathy is a known price of the TIPS: more portal blood reaches the brain without passing through the liver. The first move is not the stent. The narrower stent lowers the shunted share but raises the portal pressure again, which brings the risk of bleeding back.',
      ask: ['What is the downside of narrowing the stent?', 'The portal pressure rises again, so varices and bleeding come back.'],
    },
    {
      id: 'he-answer', tick: 'Treat first', cam: 'liver', data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'he',
      tool: { kind: 'criteria', title: 'Encephalopathy after a TIPS', short: 'After a TIPS', ticks: false, rows: ['Find and treat the trigger first', 'Lactulose, and rifaximin after a recurrence',
        { text: 'Narrow or close the stent only if it persists', note: 'last', lit: true }] },
      cite: 'Baveno VIII 6.17',
      kicker: 'Year 9', site: 'sin', title: 'Treat the trigger and give lactulose before touching the stent',
      line: 'Look for infection, bleeding, constipation, sedatives and low sodium or potassium, and give lactulose. Add rifaximin after a recurrence. Only encephalopathy that persists despite all that justifies narrowing the stent.',
      notes: 'Baveno VIII 6.17 considers narrowing or closing the TIPS, or embolizing a large spontaneous shunt, for encephalopathy that comes back or persists after a TIPS despite removal of precipitants and standard medical treatment. Before an elective TIPS, rifaximin should be considered (6.16). The stent is last because narrowing it gives back part of what the TIPS bought.',
      ask: ['When is the stent narrowed for encephalopathy after a TIPS?', 'Only when it persists or recurs despite removing the trigger and giving lactulose and rifaximin.'],
    },
    {
      id: 'list', tick: 'Year 10', milestone: 'Transplant', cam: 'liver', data: 'tiles', tiles: ['liver', 'plt'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Further decompensation', short: 'Decompensation', ticks: false, rows: [{ text: 'Two or more events: ascites, bleeding, encephalopathy, jaundice', note: 'he has had three kinds', lit: true },
        'Or a rebleed, repeat encephalopathy, or 3 or more large taps in a year'] },
      cite: 'Baveno VIII 4.1, 6.1',
      kicker: 'Year 10', site: 'sin', title: 'Year 10: three decompensating events',
      line: 'He has had ascites, two bleeds and encephalopathy. Baveno VIII calls that further decompensation and says to evaluate him for a liver transplant. The TIPS fixed the pressure, but the liver keeps only {liver} of its flow.',
      notes: 'Further decompensation means a higher mortality than the first decompensation. Baveno VIII 6.1 says to evaluate these patients for transplant, and 4.3 says to consider it in everyone with decompensated cirrhosis. The TIPS fixed the pressure; it does not fix the liver.',
      ask: ['When does Baveno VIII call for a transplant evaluation?', 'At further decompensation: two or more events, or a rebleed, recurrent encephalopathy or repeated large taps.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Ten years on one chart', style: 'milestones', bands: ['carvedilol', 'diuretics', 'tips'] },
      kicker: 'Summary', site: 'sin', title: 'Ten years on one chart',
      line: 'The HVPG climbed with the scar and fell with each treatment. Carvedilol and the TIPS lowered it, but neither stopped the liver from failing.',
      notes: 'The chart plots the HVPG at each step, shades the treatments while they were on, and names the milestones above the line. Each treatment lowered the pressure for a while. The cause was never removed, so the liver kept failing.',
      ask: ['What did the TIPS fix, and what did it leave?', 'It fixed the portal pressure and the bleeding. It left the failing liver.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'shunt'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'start', kicker: 'Year 0', title: 'Compensated' }, { id: 'carv', kicker: 'Year 3', title: 'CSPH, carvedilol' }, { id: 'diuretics', kicker: 'Year 6', title: 'Ascites, diuretics' },
        { id: 'bands', kicker: 'Year 8', title: 'First bleed, bands' }, { id: 'tips', kicker: 'Year 9', title: 'Rebleed, TIPS' }, { id: 'he', kicker: 'Year 9', title: 'Encephalopathy' }],
      kicker: 'Summary', site: 'sin', title: 'Each treatment bought time, none removed the cause',
      line: 'The pressure fell at each step. The decision at each step came from a guideline, and the last one is the transplant evaluation.',
      notes: 'Read the rows from the top. The HVPG, varices and ascites show where each treatment helped, and the shunt column shows what the TIPS cost. Removing the cause would have been the best treatment; in this case it never happened.',
      ask: ['Which treatment lowered the HVPG the most in this case?', 'The TIPS. It also sent the most portal blood past the liver.'],
    },
  ],
};
