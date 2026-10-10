// Presenter talk: one patient with cirrhosis, seen through each test over a year (the slide fields are described at the top of decks.js).

const ramp = (a, b) => ({ cirrhosis: [a, b] });

export const ONE_YEAR = {
  id: 'one-year', level: 'core', title: 'One patient, one year: what each test shows', minutes: 12,
  objectives: [
    'Follow one patient with cirrhosis through a year of rising portal pressure',
    'Match each test to what it shows: catheter, FibroScan, scope, Doppler, ultrasound',
    'Recognise the thresholds that change care: HVPG 10 and 12',
    'Know when to start carvedilol',
  ],
  summary: 'One patient with compensated cirrhosis followed for a year, seen in turn through the catheter, FibroScan, endoscopy, Doppler and the abdomen. Ends with carvedilol and the year on one chart.',
  slides: [
    {
      id: 'd0', preset: 'cirr-comp', params: { cirrhosis: 0.5 }, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'lsm', 'plt'],
      kicker: 'Day 0', site: 'sin', title: 'Compensated cirrhosis',
      line: 'The patient has no symptoms; cirrhosis was found on a scan. Over the next year we look at the same patient through each test in turn.',
      notes: 'One patient, one disease clock: each slide moves the same patient forward and shows one instrument. Fibrosis advances steadily in the model over the year; nothing else is changed until carvedilol at the end. At the start the stiffness and platelets sit in the gray zone, and the catheter decides.',
      ask: ['Which two bedside numbers does Baveno VII use to rule out CSPH?', 'Liver stiffness and the platelet count.'],
    },
    {
      id: 'cath', cath: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Day 0', site: 'sin', title: 'The catheter at diagnosis',
      line: 'The HVPG is {hvpg}: portal hypertension, still below the CSPH threshold of 10.',
      notes: 'HVPG = WHVP − FHVP. Above 5 mmHg is portal hypertension; 10 or more is clinically significant (CSPH), the level at which varices form and decompensation becomes likely. At 9 mmHg this patient is close. HVPG is the reference standard, but invasive, so most centers reserve it for trials, uncertain cases and before liver surgery.',
      ask: ['HVPG 9 mmHg. Is this CSPH?', 'No: portal hypertension, but CSPH starts at 10 mmHg.'],
    },
    {
      id: 'd90', days: 90, ramp: ramp(0.5, 0.54), cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'd0',
      kicker: 'Day 90', site: 'sin', title: 'FibroScan',
      line: 'Stiffness is {lsm} with platelets of {plt}, below 150. In this part of the gray zone, the pair makes CSPH likely without a catheter.',
      notes: 'Baveno VII gray zone: 20 to 25 kPa with platelets below 150, or 15 to 20 kPa with platelets below 110, carries a risk of CSPH of 60% or more. The model agrees: the HVPG has just passed 10 mmHg. Stiffness and platelets are cheap and repeatable, which is why they are used to follow patients between endoscopies.',
      ask: ['Stiffness 21 kPa and platelets 115. How likely is CSPH?', 'Likely: 60% or more by the Baveno VII gray-zone rule.'],
    },
    {
      id: 'd180', days: 90, ramp: ramp(0.54, 0.58), cam: 'varices', tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'd0',
      kicker: 'Day 180', site: 'sin', title: 'Endoscopy',
      line: 'Small varices in the lower esophagus. They form at an HVPG of 10 mmHg or more.',
      notes: 'Small varices are under 5 mm and flatten with air. Without red wale signs and in compensated cirrhosis they bleed rarely, but they show that the gradient is past 10 mmHg. A patient already on a non-selective beta-blocker for CSPH does not need a screening endoscopy. Without one, small varices are rechecked in one to two years, sooner if the disease is active.',
      ask: ['What do small varices tell you about the HVPG?', 'It is at least 10 mmHg: varices do not form below that.'],
    },
    {
      id: 'd365', days: 185, ramp: ramp(0.58, 0.66), cath: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], tiles: ['hvpg', 'ppg'], delta: 'd0',
      kicker: 'Day 365', site: 'sin', title: 'The catheter at one year',
      line: 'The HVPG is {hvpg}, up from 9 a year ago. At 12 or more, varices can bleed.',
      notes: 'A year on, the gradient has risen by 4 mmHg. Above 12 mmHg varices can bleed, and the risk of ascites and other decompensation rises with each mmHg. Repeat catheter studies are not routine; in practice the stiffness, the platelets and the scope track this rise.',
      ask: ['Above what HVPG is the variceal bleed risk high?', '12 mmHg.'],
    },
    {
      id: 'doppler', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'd0' },
      kicker: 'Day 365', site: 'sin', title: 'Doppler of the portal vein',
      line: 'Flow still runs toward the liver, but slower than a year ago.',
      notes: 'The main portal vein normally carries 15 cm/s or more toward the liver, with a gentle respiratory ripple. As resistance rises the velocity falls; under about 15 cm/s supports portal hypertension. Later the flow can become to-and-fro, then reverse (hepatofugal). Doppler also looks for a clot, a large spleen, collaterals and ascites. It is operator-dependent and changes with meals and breathing, so scan fasting.',
      ask: ['What portal vein velocity supports portal hypertension?', 'Under about 15 cm/s, or flow that is to-and-fro or reversed.'],
    },
    {
      id: 'belly', cam: 'fit', glow: ['spleen'], tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'spleen'], key: ['asc'],
      kicker: 'Day 365', site: 'sin', title: 'Ultrasound of the abdomen',
      line: 'A thin rim of fluid, seen on ultrasound only: grade 1 ascites. The spleen has grown to {spleen}.',
      notes: 'Grade 1 ascites is found only on ultrasound; grade 2 is visible as a symmetric distension; grade 3 is tense. A first episode of clinically evident ascites marks decompensation, and every new ascites is tapped. Salt restriction to about 5 g a day starts here.',
      ask: ['How is grade 1 ascites detected?', 'On ultrasound only; it cannot be found by examination.'],
    },
    {
      id: 'carv', params: { drugs: { carvedilol: true } }, cam: 'liver', data: 'ladder', key: ['hvpg'], tiles: ['hvpg', 'varix'], delta: true,
      kicker: 'Day 365', site: 'sin', title: 'Carvedilol now',
      line: 'A non-selective beta-blocker before the first bleed or decompensation. Carvedilol lowers the gradient by about a fifth.',
      notes: 'Baveno VII: in compensated cirrhosis with CSPH, a non-selective beta-blocker, preferably carvedilol (6.25 mg, then 12.5 mg a day), to prevent decompensation, as in the PREDESCI trial. It replaces screening endoscopy for most patients who take it. A fall in HVPG of 10% or more on drugs predicts benefit in compensated patients. Watch the blood pressure.',
      ask: ['Why start carvedilol before any bleed?', 'In compensated cirrhosis with CSPH it lowers the risk of decompensation (ascites, bleeding).'],
    },
    {
      id: 'summary', tool: { kind: 'trace', range: 'talk', title: 'The year on one chart' }, cam: 'fit',
      kicker: 'Summary', site: 'sin', title: 'The year on one chart',
      line: 'The pressures at every slide, from day 0 to carvedilol. Each test saw the same rise from its own side.',
      notes: 'The catheter measures the gradient; FibroScan and the platelets estimate it; the scope shows its effect on the varices; Doppler shows the slower inflow; ultrasound finds the first fluid. In practice the cheap tests are repeated each year and the catheter is kept for uncertain cases.',
      ask: ['Which test would you repeat each year in this patient, and why?', 'Stiffness and platelets: cheap, repeatable, and they track the gradient.'],
    },
  ],
};
