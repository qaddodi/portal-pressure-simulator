// Presenter talk: one patient with cirrhosis, seen through each test over a year (the slide fields are described at the top of decks.js).

const ramp = (a, b) => ({ cirrhosis: [a, b] });

export const ONE_YEAR = {
  id: 'one-year', level: 'core', title: 'A year of compensated cirrhosis, test by test', minutes: 12,
  objectives: [
    'Follow one patient with cirrhosis through a year of rising portal pressure',
    'Match each test to what it shows: catheter, FibroScan, scope, Doppler, ultrasound',
    'Recognize the HVPG levels at which the risk rises: 10 and 12',
    'Decide when to start carvedilol',
  ],
  checks: [
    ['At what HVPG does CSPH begin?', '10 mmHg.'],
    ['Which endoscopy finding counts as CSPH under Baveno VIII?', 'Any varices, even small ones.'],
    ['Which drug does Baveno VIII prefer before a first bleed or decompensation?', 'Carvedilol, a non-selective beta-blocker.'],
  ],
  summary: 'One patient with compensated cirrhosis followed for a year, seen in turn through the catheter, FibroScan, endoscopy, Doppler and the abdomen. Ends with carvedilol and a chart of the year.',
  slides: [
    {
      id: 'd0', tick: 'Diagnosis, catheter', preset: 'cirr-comp', params: { cirrhosis: 0.5 }, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'lsm', 'plt'],
      kicker: 'Day 0', site: 'sin', title: 'Cirrhosis found on a scan, without symptoms',
      vignette: 'A 56-year-old man with obesity and type 2 diabetes has a nodular liver on an ultrasound done for gallstones. He feels well, and his platelets are 159,000/µL.',
      line: 'Over the next year, each slide shows one test in the same patient. Only the fibrosis progresses, until carvedilol is started at the end.',
      notes: 'One patient, one disease clock: each slide moves the same patient forward and shows one instrument. Fibrosis advances steadily in the model over the year; nothing else is changed until carvedilol at the end. At the start the stiffness and platelets sit in the gray zone, and the catheter decides.',
      ask: ['Which two bedside numbers does Baveno VIII use to rule out CSPH?', 'Liver stiffness and the platelet count.'],
    },
    {
      id: 'cath', cath: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'],
      kicker: 'Day 0', site: 'sin', title: 'At diagnosis the HVPG is just below 10',
      line: 'An HVPG of {hvpg} is portal hypertension, still below the 10 mmHg where CSPH begins.',
      notes: 'HVPG = WHVP − FHVP. Above 5 mmHg is portal hypertension; 10 or more is clinically significant (CSPH), where varices and decompensation become possible, and the risk rises with the gradient. At 9 mmHg the HVPG is close. HVPG is the reference standard, but invasive, so most centers reserve it for trials, uncertain cases and before liver surgery.',
      ask: ['HVPG 9 mmHg. Is this CSPH?', 'No: portal hypertension, but CSPH starts at 10 mmHg.'],
    },
    {
      id: 'd90', tick: 'FibroScan', days: 90, ramp: ramp(0.5, 0.54), cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'd0',
      kicker: 'Day 90', site: 'sin', title: 'Stiffness and platelets make CSPH likely',
      line: 'Stiffness is {lsm} with platelets of {plt}, below 150. In this part of the gray zone, the pair makes CSPH likely without a catheter.',
      notes: 'Between 15 and 25 kPa the stiffness alone does not decide. Baveno VIII calls CSPH present when a validated model (ANTICIPATE, built on the stiffness and the platelets) puts its probability at 75% or more, or when the spleen stiffness is above 55 kPa. The model agrees: the HVPG has just passed 10 mmHg. With CSPH likely, Baveno VIII would start carvedilol here. Stiffness and platelets are cheap and repeatable, which is why they are used to follow patients between endoscopies.',
      ask: ['Stiffness 21 kPa and platelets 115. How likely is CSPH?', 'Likely: in the gray zone, a stiffness over 20 kPa with low platelets gives ANTICIPATE a high probability of CSPH. A spleen stiffness above 55 kPa would settle it.'],
    },
    {
      id: 'd180', terms: ['varix'], tick: 'Endoscopy', days: 90, ramp: ramp(0.54, 0.58), cam: 'varices', tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'd0',
      kicker: 'Day 180', site: 'sin', title: 'Small varices mean CSPH',
      line: 'Under Baveno VIII, varices are generally a sign of CSPH. Here the scope finds small ones in the lower esophagus.',
      caveat: 'Carvedilol would start by now; this case holds it back to show the pressure rising.',
      notes: 'Small varices are under 5 mm and flatten with air. Without red wale signs and in compensated cirrhosis they bleed rarely, but they show that the gradient is very likely past 10 mmHg; below 10 varices are uncommon, not impossible. Varices mean CSPH, so by Baveno VIII carvedilol would start now; this talk holds it back until the last slide only to show the untreated rise. A patient on a non-selective beta-blocker for CSPH needs no screening endoscopy; one who cannot take it has small varices rechecked in one to two years, sooner if the disease is active.',
      ask: ['What do small varices tell you about the HVPG?', 'That CSPH is present: Baveno VIII reads any varices as CSPH. Below 10 mmHg varices are uncommon, not impossible.'],
    },
    {
      id: 'd365', tick: 'Catheter, Doppler', days: 185, ramp: ramp(0.58, 0.66), cath: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], delta: 'd0',
      kicker: 'Day 365', site: 'sin', title: 'At one year, HVPG is above 12',
      line: 'The HVPG is {hvpg}, up from 9 a year ago. At 12 or more, varices can bleed.',
      notes: 'A year on, the gradient has risen by 4 mmHg. Above 12 mmHg varices can bleed, and the risk of ascites and other decompensation rises with each mmHg. Repeat catheter studies are not routine; in practice the stiffness, the platelets and the scope track this rise.',
      ask: ['The HVPG is now 13. What does that change?', 'The varices can now bleed; below 12 mmHg bleeding is rare.'],
    },
    {
      id: 'doppler', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'd0' },
      kicker: 'Day 365', site: 'sin', title: 'Portal flow is starting to slow',
      line: 'As resistance in the liver rises, portal velocity falls. In this case it has fallen a little since day 0 and is still in the usual range; a velocity under {<15 cm/s} supports portal hypertension. Flow runs toward the liver. Later it can become to-and-fro, then reversed.',
      notes: 'The main portal vein normally carries 15 cm/s or more toward the liver, with a gentle respiratory ripple. As resistance rises the velocity falls; under about 15 cm/s supports portal hypertension. Later the flow can become to-and-fro, then reverse (hepatofugal). Doppler also looks for a clot, a large spleen, collaterals and ascites. It is operator-dependent and changes with meals and breathing, so scan fasting.',
      ask: ['What portal vein velocity supports portal hypertension?', 'Under about 15 cm/s, or flow that is to-and-fro or reversed.'],
    },
    {
      id: 'belly', cam: 'fit', glow: ['spleen'], tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'spleen'], key: ['asc'],
      kicker: 'Day 365', site: 'sin', title: 'Ultrasound finds the first fluid',
      line: 'Grade 1 ascites is seen only on ultrasound and needs no treatment itself, but it signals a worse prognosis. The spleen now measures {spleen}.',
      notes: 'Grade 1 ascites is found only on ultrasound and needs no treatment of its own, but it still marks a worse outlook; grade 2 is visible as a symmetric distension; grade 3 is tense. A first episode of clinically evident (grade 2 or 3) ascites marks decompensation: it is tapped, and salt restriction to about 2 g of sodium (5 g of salt) a day and diuretics start.',
      ask: ['How is grade 1 ascites detected?', 'On ultrasound only; it cannot be found by examination.'],
    },
    {
      id: 'carv', tick: 'Carvedilol started', when: 'On carvedilol', params: { drugs: { carvedilol: true } }, cam: 'liver', data: 'ladder', key: ['hvpg'], tiles: ['varix'], delta: true,
      kicker: 'Day 365', site: 'sin', title: 'Carvedilol lowers the gradient',
      line: 'Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, before a first bleed or decompensation. It lowers the gradient by about a fifth, and in most patients it replaces screening endoscopy. Check the blood pressure.',
      notes: 'Baveno VIII: in compensated cirrhosis with CSPH, a non-selective beta-blocker, preferably carvedilol (6.25 mg, then 12.5 mg a day), to prevent decompensation, as in the PREDESCI trial. It replaces screening endoscopy for most patients who take it. A fall in HVPG of 10% or more on drugs predicts benefit in compensated patients. Watch the blood pressure.',
      ask: ['Why start carvedilol before any bleed?', 'In compensated cirrhosis with CSPH it lowers the risk of decompensation (ascites, bleeding).'],
    },
    {
      id: 'summary', tool: { kind: 'trace', range: 'talk', title: 'Pressures over the year' }, cam: 'fit',
      kicker: 'Summary', site: 'sin', title: 'Pressures over the year',
      line: 'The pressures at every slide, from day 0 to carvedilol. The catheter, FibroScan, scope, Doppler and ultrasound each picked up the same rise.',
      notes: 'The catheter measures the gradient; FibroScan and the platelets estimate it; the scope shows its effect on the varices; Doppler shows the slower inflow; ultrasound finds the first fluid. In practice the cheap tests are repeated each year and the catheter is kept for uncertain cases.',
      ask: ['Which test would you repeat each year in the patient, and why?', 'Stiffness and platelets: cheap and repeatable, and a rise warns that the disease is advancing.'],
    },
  ],
};
