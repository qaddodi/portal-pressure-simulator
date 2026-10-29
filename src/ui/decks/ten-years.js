// Presenter talk: one man followed for ten years, from the tests that find clinically significant portal hypertension in his first year
// to a transplant evaluation, with a decision at each step (the slide fields are described at the top of decks.js). The injury is never
// removed in the model, so every later step can be shown; Baveno VIII 4.2 would treat the cause after the first decompensation.
// Year 0 to 1 is the one-year follow-up (the plane, FibroScan, the HVPG at one year, carvedilol); a year later the chain runs on
// by the same disease clock to the first ascites at year 6, the bleeds of years 8 and 9 and the transplant evaluation at year 10.
// Sources, checked 25 Oct 2026 against the Baveno VIII text in /mnt/project-files/guidelines/: 1.15 and 1.16 (the stiffness and platelet
// rules), 3.15 and 3.16 (carvedilol only with CSPH), 4.1 (further decompensation), 4.3 and 6.1 (transplant evaluation), 4.4 and 4.6
// (carvedilol with ascites and varices, and when to cut it), 4.8 (carvedilol with banding after a first bleed, even after carvedilol as
// primary prophylaxis), 4.13 (TIPS when that fails), 6.16 and 6.17 (rifaximin before an elective TIPS; narrowing the stent for
// encephalopathy that persists).

const BAND = { kind: 'band' };
const BELLY = { kind: 'abdomen' };
const CARV = { drugs: { carvedilol: true } };
const ramp = (a, b) => ({ cirrhosis: [a, b] });

export const TEN_YEARS = {
  id: 'ten-years', level: 'advanced', title: 'One patient, ten years', minutes: 15,
  objectives: [
    'Follow one man from compensated cirrhosis to a transplant evaluation, and read his HVPG at 10 and 12 along the way',
    'Pick the treatment at each step: carvedilol, diuretics, banding, TIPS',
    'Name what the model can and cannot show of encephalopathy after a TIPS',
    'Say when further decompensation calls for a transplant evaluation',
  ],
  checks: [
    ['At what point does Baveno VIII start carvedilol in compensated cirrhosis?', 'At CSPH, an HVPG ≥10 mmHg, to prevent decompensation. Without CSPH it should not be used for that purpose.'],
    ['He bled while taking carvedilol. Does he stop it?', 'No. Baveno VIII 4.8 pairs carvedilol with banding after the first bleed, whether or not he took carvedilol before.'],
    ['He bleeds again on carvedilol and repeat banding. What next?', 'A TIPS. Baveno VIII 4.13 says to consider one when secondary prophylaxis fails.'],
    ['Two months after the TIPS he is confused, and the PPG is low. Which comes first, narrowing the stent or lactulose?', 'Lactulose, after a search for the trigger. The stent is narrowed only if the confusion persists, because a narrower stent raises the portal pressure again.'],
  ],
  sections: [['Compensated', ['Year 0', 'Month 3', 'Year 1']], ['Ascites', ['Year 6']], ['Bleeding', ['Year 8', 'Year 9']], ['The end', ['Year 10', 'Summary']]],
  summary: 'One man with cirrhosis over ten years: the first year\'s tests and carvedilol at CSPH, the first ascites and diuretics, a bleed and banding, a rebleed and a TIPS, encephalopathy, and the transplant evaluation, with a decision at each step.',
  slides: [
    {
      id: 'd0', tick: 'Year 0', milestone: 'Cirrhosis', preset: 'cirr-comp', params: { cirrhosis: 0.5 }, cam: 'liver', tool: { kind: 'plane', plane: 'csph' }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      kicker: 'Year 0', site: 'sin', title: 'Year 0: cirrhosis, but not yet CSPH',
      vignette: 'A 56-year-old man with obesity and type 2 diabetes has a nodular liver on an ultrasound done for gallstones. He feels well, and his platelets are 159,000/µL.',
      line: 'His HVPG is {hvpg}, which does not meet {>=10 mmHg}. He has cirrhosis without CSPH, so a beta-blocker would not help him yet.',
      notes: 'Compensated cirrhosis without clinically significant portal hypertension needs follow-up and treatment of the cause, not a beta-blocker; Baveno VIII advises against using one to prevent decompensation at this stage (3.16). His stiffness and platelets sit in the gray zone, shown as the ring on the plane in the data card, so the catheter decides. HVPG = WHVP − FHVP. Above 5 mmHg is portal hypertension; 10 or more is clinically significant (CSPH), where varices and decompensation become possible, and the risk rises with the gradient. HVPG is the reference standard, but invasive, so most centers reserve it for trials, uncertain cases and before liver surgery. In this case the injury is never removed, so every later step over the next ten years can be shown in the same man. Fibrosis advances steadily in the model; nothing else changes until carvedilol.',
      ask: ['Does a man with compensated cirrhosis and an HVPG <10 mmHg need carvedilol?', 'No. Baveno VIII advises against a beta-blocker to prevent decompensation without CSPH.'],
    },
    {
      id: 'd90', tick: 'Month 3', days: 90, ramp: ramp(0.5, 0.54), cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'd0',
      kicker: 'Month 3', site: 'sin', title: 'Stiffness and platelets make CSPH likely',
      line: 'Stiffness is {lsm} with platelets of {plt} (<150). In this part of the gray zone, the pair makes CSPH likely without a catheter.',
      notes: 'Between 15 and 25 kPa the stiffness alone does not decide. Baveno VIII calls CSPH present when a validated model (ANTICIPATE-NASH in obese MASLD, built on the stiffness, the platelets and the BMI) puts its probability at 75% or more, or when the spleen stiffness on the 100 Hz probe is above 55 kPa. The model agrees: the HVPG has just passed 10 mmHg. Stiffness and platelets are cheap and repeatable, which is why they are used to follow patients between catheter studies. (Baveno VIII 1.15, 1.16.)',
      ask: ['Stiffness 21 kPa and platelets 115. How likely is CSPH?', 'Likely: in the gray zone, a stiffness >20 kPa with low platelets gives ANTICIPATE a high probability of CSPH. A spleen stiffness >55 kPa on the 100 Hz probe would settle it.'],
    },
    {
      id: 'd365', tick: 'Year 1', days: 275, ramp: ramp(0.54, 0.66), cam: 'liver', tool: { kind: 'hvpg' }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: 'd0',
      kicker: 'Year 1', site: 'sin', title: 'Year 1: the HVPG is >12',
      line: 'The HVPG is {hvpg}, up from {hvpg@d0} at diagnosis and well past the {>=10 mmHg} where CSPH begins. From about 12, the risk of a variceal bleed rises steeply.',
      notes: 'A year on, the gradient has risen by about 4 mmHg, and small varices would now show on a scope: in compensated cirrhosis they bleed rarely, but they mean the gradient is past 10 mmHg. Above about 12 mmHg a variceal bleed becomes more likely, and the risk of ascites and other decompensation rises with each mmHg. Repeat catheter studies are not routine; in practice the stiffness, the platelets and the scope track this rise, and a small amount of fluid seen only on ultrasound (grade 1 ascites) may already be there, without being decompensation.',
      ask: ['His HVPG is 13 mmHg and he feels well. Does he need a drug?', 'Yes. Baveno VIII recommends carvedilol at CSPH, to prevent decompensation.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', milestone: 'Carvedilol', when: 'On carvedilol', params: CARV, cam: 'liver', tool: { kind: 'hvpg' }, data: 'tiles', tiles: ['map'], key: ['hvpgFall'], delta: 'd365', hvpgResp: 'd365',
      kicker: 'Year 1', site: 'sin', title: 'Carvedilol at CSPH prevents decompensation',
      line: 'Baveno VIII recommends carvedilol in compensated cirrhosis with CSPH, to prevent decompensation and improve survival. It lowers his HVPG from {hvpg@d365} to {hvpg}.',
      notes: 'Carvedilol acts on both flow and resistance: it lowers the portal inflow and relaxes the liver\'s resistance, so it lowers the HVPG more than propranolol. Baveno VIII prefers it in compensated cirrhosis with CSPH (3.15), as in the PREDESCI trial, and it replaces the screening endoscopy for most patients who take it. The dose is raised slowly (6.25 mg, then 12.5 mg a day), and the systolic pressure has to stay above 90 mmHg. A fall in HVPG of 10% or more on drugs predicts benefit in compensated patients; the tile shows the percent fall from the year-1 reading.',
      ask: ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'When CSPH is present, to prevent decompensation and improve survival.'],
    },
    {
      id: 'ascites', tick: 'Year 6', milestone: 'Ascites', days: 1825, ramp: { cirrhosis: [0.66, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'carv',
      compare: [{ label: 'Carvedilol alone', short: 'Carv.', own: true, params: { diuretics: false } }, { label: 'Add diuretics', short: 'Diuretics', params: { diuretics: true } }],
      kicker: 'Year 6', site: 'sin', title: 'Year 6: the first ascites',
      line: 'Five more years of injury: the HVPG is {hvpg}, the albumin has fallen to {salb}, and {asc} of ascites has gathered despite carvedilol. Try adding diuretics.',
      notes: 'The first ascites you can find on examination is the first decompensation, and it changes the outlook. A little fluid seen only on ultrasound (grade 1) comes earlier and is not decompensation; grade 2 shows as a symmetric distension and grade 3 is tense. After the first decompensation, Baveno VIII 4.2 recommends treating the cause, to prevent further decompensation. In this case the injury goes on, so the later steps can follow. What happens to the carvedilol is the next slide.',
      ask: ['What is the first decompensation in this case?', 'Ascites at year 6.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'ascites',
      kicker: 'Year 6', site: 'sin', title: 'Diuretics and salt limit, carvedilol stays',
      line: 'Spironolactone, furosemide and a moderate salt limit bring the ascites down to {asc}. Carvedilol continues unless the systolic pressure stays <90 mmHg or the kidneys fail.',
      notes: 'Ascites with varices is a reason to keep carvedilol, not to stop it: Baveno VIII 4.4 recommends it to prevent a first bleed and to lower the risk of ascites complications. It is cut or stopped if the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or a hepatorenal acute kidney injury develops, and restarted when they recover. (Baveno VIII 4.4, 4.6.)',
      ask: ['When is carvedilol reduced or stopped in a man with ascites?', 'When the systolic pressure stays <90 mmHg (or the mean <65 mmHg), or hepatorenal acute kidney injury develops.'],
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
      kicker: 'Year 8', site: 'sin', title: 'Carvedilol with banding, until the varices are gone',
      line: 'The first-line plan after a bleed from varices is carvedilol with repeat banding. Carvedilol holds the HVPG at {hvpg}, and three sessions of banding take the varix down to {varix}.',
      notes: 'Banding closes the varices but leaves the pressure behind them; carvedilol lowers the pressure but leaves the varices. Baveno VIII 4.8 combines them as first-line prevention of recurrent bleeding, with carvedilol preferred, whether or not the man took carvedilol before the bleed. Banding is repeated every 2 to 4 weeks until the varices are gone.',
      ask: ['What is first-line prevention of a repeat variceal bleed?', 'Carvedilol with banding, whether or not carvedilol was taken before the bleed.'],
    },
    {
      id: 'rebleed', tick: 'Year 9', milestone: 'Rebleed', days: 270, cam: 'liver', tool: { kind: 'profile', from: 'bands', fromLabel: 'Year 8' }, data: 'tiles', tiles: ['varix', 'liver'], key: ['hvpg'], delta: 'bands',
      compare: [{ label: 'Bands and carvedilol', short: 'Bands', own: true, params: { tips: { on: false, d: 8 } } }, { label: 'TIPS', params: { tips: { on: true, d: 8 } } }],
      kicker: 'Year 9', site: 'sin', title: 'Year 9: a second bleed, on both treatments',
      line: 'Nine months on, the varices are back to {varix} and he bleeds again, on carvedilol. Try a TIPS with the buttons and watch the HVPG and the liver flow.',
      notes: 'Two bleeds make this further decompensation. Carvedilol and banding have been given properly and have failed, so more of the same is unlikely to help. The question is what lowers the pressure more, and the guideline answers it: consider a TIPS when bleeding continues despite secondary prophylaxis.',
      ask: ['A man bleeds again on carvedilol and repeat banding. Is a TIPS considered?', 'Yes. Baveno VIII 4.13 says to consider a TIPS when bleeding continues despite secondary prophylaxis.'],
    },
    {
      id: 'tips', tick: 'TIPS', milestone: 'TIPS', params: { tips: { on: true, d: 8 } }, procedure: 'tips', cam: 'liver', tool: { kind: 'profile', from: 'rebleed', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'rebleed',
      kicker: 'Year 9', site: 'sin', title: 'A TIPS when prevention fails',
      line: 'A covered TIPS takes the PPG to {ppg}. The price is the liver\'s blood: it keeps {liver} of its normal flow.',
      notes: 'Baveno VIII advises considering a TIPS for bleeding despite secondary prophylaxis with carvedilol and banding (4.13). The stent opens a channel from the portal vein to a hepatic vein, so the gradient falls under the level where varices bleed. The cost is a share of portal blood that no longer passes through the liver, and with it a risk of encephalopathy.',
      ask: ['What does a TIPS cost the liver?', 'Part of its portal blood supply, because most portal blood now bypasses it through the stent.'],
    },
    {
      id: 'he', tick: 'Confusion', days: 60, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'tips',
      compare: [{ label: '8 mm stent', short: '8 mm', own: true, params: { tips: { d: 8 } } }, { label: 'Narrower stent', short: 'Narrower', params: { tips: { d: 5 } } }],
      kicker: 'Year 9', site: 'sin', title: 'Two months after the TIPS he is confused',
      line: 'He sleeps by day and is slow to answer. {shunt} of the portal blood now bypasses the liver. Narrow the stent with the buttons and watch the PPG.',
      notes: 'Overt encephalopathy is a known price of the TIPS: more portal blood reaches the brain without passing through the liver. The first move is not the stent. The narrower stent lowers the shunted share but raises the portal pressure again, which brings the risk of bleeding back. The model has no ammonia or brain; the share of portal blood that skips the liver stands in for the risk.',
      ask: ['What is the downside of narrowing the stent?', 'The portal pressure rises again, so varices and bleeding come back.'],
    },
    {
      id: 'he-answer', tick: 'Treat first', cam: 'liver', data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'he',
      tool: { kind: 'criteria', title: 'Encephalopathy after a TIPS', short: 'After a TIPS', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 6.17', rows: ['Find and treat the **trigger** first', '**Lactulose**, and **rifaximin** after a recurrence',
        { text: 'Narrow or close the stent only if it persists', lit: true }] },
      kicker: 'Year 9', site: 'sin', title: 'Treat the trigger and give lactulose before touching the stent',
      line: 'Look for infection, bleeding, constipation, sedatives and low sodium or potassium, and give lactulose. Add rifaximin after a recurrence. Narrow the stent only if it persists.',
      notes: 'Baveno VIII 6.17 considers narrowing or closing the TIPS, or embolizing a large spontaneous shunt, for encephalopathy that comes back or persists after a TIPS despite removal of precipitants and standard medical treatment. Before an elective TIPS, rifaximin should be considered (6.16). The stent is last because narrowing it gives back part of what the TIPS bought.',
      ask: ['When is the stent narrowed for encephalopathy after a TIPS?', 'Only when it persists or recurs despite removing the trigger and giving lactulose and rifaximin.'],
    },
    {
      id: 'list', tick: 'Year 10', milestone: 'Transplant', cam: 'liver', data: 'tiles', tiles: ['liver', 'plt'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Further decompensation', short: 'Decompensation', ticks: false, rule: 'Baveno VIII 4.1, 6.1', rows: [{ text: '≥2 events: ascites, bleeding, encephalopathy, jaundice', note: 'Three kinds', met: true, lit: true },
        'Or a **rebleed**, repeat **encephalopathy**, or **≥3** large taps in a year'], verdict: 'He meets the first: evaluate him for a liver transplant.' },
      kicker: 'Year 10', site: 'sin', title: 'Year 10: three decompensating events',
      line: 'He has had ascites, two bleeds and encephalopathy: further decompensation, so Baveno VIII says to evaluate him for a liver transplant. The TIPS fixed the pressure, not the liver.',
      notes: 'Further decompensation means a higher mortality than the first decompensation. Baveno VIII 6.1 says to evaluate these patients for transplant, and 4.3 says to consider it in everyone with decompensated cirrhosis. The TIPS fixed the pressure; it does not fix the liver, which keeps only the share of its blood flow shown in the tile. (Baveno VIII 4.1, 6.1.)',
      ask: ['When does Baveno VIII call for a transplant evaluation?', 'At further decompensation: ≥2 events, or a rebleed, recurrent encephalopathy or repeated large taps.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Ten years on one chart', style: 'milestones', bands: ['carvedilol', 'diuretics', 'tips'] },
      kicker: 'Summary', site: 'sin', title: 'Ten years on one chart',
      line: 'The HVPG climbed with the scar and fell with each treatment. Carvedilol and the TIPS lowered it, but neither stopped the liver from failing.',
      notes: 'The chart plots the HVPG at each step, shades the treatments while they were on, and names the milestones above the line. Each treatment lowered the pressure for a while. The cause was never removed, so the liver kept failing.',
      ask: ['What did the TIPS fix, and what did it leave?', 'It fixed the portal pressure and the bleeding. It left the failing liver.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, read the varix and
      // its wall stress against the HVPG, as on the Varices talk. The dots are his visits, joined in order (years 6 to 9 are one: the
      // HVPG and the varix hardly move between the ascites and the rebleed); the ring is him after the TIPS, the slide before's state.)
      id: 'relation', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'], walk: true,
        dots: [{ slide: 'd0', name: 'Year 0', on: [0] }, { slide: 'd365', name: 'Year 1', on: [0] }, { slide: 'carv', name: 'Carvedilol', on: [0] }, { slide: 'ascites', name: 'Years 6 to 9', on: [0] },
          { slide: 'bands', name: 'Bands', on: [0] }, { slide: 'tips', name: 'TIPS', on: [0] }] },
      kicker: 'Summary', site: 'sin', title: 'Ten years on one line: the varix follows the HVPG',
      line: 'Carvedilol took him from {hvpg@d365} to {hvpg@carv}, and the TIPS from {hvpg@rebleed} to {hvpg@tips}, both along the line. Bands took the varix below it, without lowering the HVPG.',
      notes: 'The line is the model\'s cirrhosis from mild to severe, each point settled for a year, with the varix (left) and its wall stress as a share of the tear point (right) against the HVPG, as on the Varices talk. The dots are this talk\'s visits. Carvedilol at year 1 lowered the HVPG and the varix with it, along the line; the TIPS at year 9 did the same down to the flat part of the line, where the varix stays at its resting 2 mm. Banding closed the varix without changing the pressure behind it, so it sits below the line, and the varix grows back to the line within months (see Preventing the next variceal bleed). The ring is him after the TIPS. The cause was never removed, so each treatment bought time and none ended the climb. Wall stress rises faster than the diameter because it grows with the pressure across the wall and with the radius together (AASLD 2024 p. 1193). Baveno VIII 4.8 pairs carvedilol with banding after a bleed, and 4.13 says to consider a TIPS when bleeding continues. One model patient per point; real patients vary far more.',
      ask: ['Which of his treatments moved the varix without moving the HVPG?', 'Banding: it closes the varix but leaves the pressure behind it, so the varix grows back as the bands slough.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'shunt'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'd0', kicker: 'Year 0', title: 'Compensated' }, { id: 'carv', kicker: 'Year 1', title: 'CSPH, carvedilol' }, { id: 'diuretics', kicker: 'Year 6', title: 'Ascites, diuretics' },
        { id: 'bands', kicker: 'Year 8', title: 'First bleed, bands' }, { id: 'tips', kicker: 'Year 9', title: 'Rebleed, TIPS' }, { id: 'he', kicker: 'Year 9', title: 'Encephalopathy' }],
      kicker: 'Summary', site: 'sin', title: 'Each treatment bought time, none removed the cause',
      line: 'The pressure fell at each step. The decision at each step came from a guideline, and the last one is the transplant evaluation.',
      notes: 'Read the rows from the top. The HVPG, varices and ascites show where each treatment helped, and the shunt column shows what the TIPS cost. Removing the cause would have been the best treatment; in this case it never happened.',
      ask: ['Which treatment lowered the HVPG the most in this case?', 'The TIPS. It also sent the most portal blood past the liver.'],
    },
  ],
};
