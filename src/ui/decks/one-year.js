// Presenter talk: one patient with cirrhosis, seen through each test over a year (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const ramp = (a, b) => ({ cirrhosis: [a, b] });
const HVPG_EQ = mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>';

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
    ['Over the year the HVPG crossed 10 mmHg, varices appeared and the platelets fell. What changed?', 'The resistance inside the liver rose as fibrosis advanced. The portal pressure rose behind it, the spleen grew and held back more platelets.'],
  ],
  summary: 'One patient with compensated cirrhosis followed for a year, seen in turn through the catheter, FibroScan, endoscopy, Doppler and the abdomen, with Baveno VIII\'s stiffness and platelet zones. Ends with carvedilol and a chart of the year.',
  slides: [
    {
      id: 'd0', tick: 'Diagnosis, catheter', milestone: 'Dx', preset: 'cirr-comp', params: { cirrhosis: 0.5 }, cam: 'fit', tool: { kind: 'plane', plane: 'csph' }, data: 'tiles', tiles: ['hvpg', 'lsm', 'plt'], key: ['lsm', 'plt'],
      kicker: 'Day 0', site: 'sin', title: 'Cirrhosis found on a scan, without symptoms',
      vignette: 'A 56-year-old man with obesity and type 2 diabetes has a nodular liver on an ultrasound done for gallstones. He feels well, and his platelets are 159,000/µL.',
      line: 'Over the next year, each slide shows one test in the same patient. Only the fibrosis progresses, until carvedilol is started at the end.',
      notes: 'One patient, one disease clock: each slide moves the same patient forward and shows one instrument. Fibrosis advances steadily in the model over the year; nothing else is changed until carvedilol at the end. At the start the stiffness and platelets sit in the gray zone, shown as the ring on the plane in the data card, and the catheter decides.',
      ask: ['Which two bedside numbers does Baveno VIII use to rule out CSPH?', 'Liver stiffness and the platelet count.'],
    },
    {
      id: 'cath', cath: 'result', data: 'tiles', tiles: ['whvp', 'fhvp', 'hvpg'], key: ['hvpg'],
      kicker: 'Day 0', site: 'sin', title: 'At diagnosis the HVPG is just below 10',
      eq: [HVPG_EQ],
      line: 'An HVPG of {hvpg} is portal hypertension, still below the 10 mmHg where CSPH begins.',
      notes: 'HVPG = WHVP − FHVP. Above 5 mmHg is portal hypertension; 10 or more is clinically significant (CSPH), where varices and decompensation become possible, and the risk rises with the gradient. Here the HVPG is close to 10. HVPG is the reference standard, but invasive, so most centers reserve it for trials, uncertain cases and before liver surgery.',
      ask: ['HVPG 9 mmHg. Is this CSPH?', 'No: portal hypertension, but CSPH starts at 10 mmHg.'],
    },
    {
      id: 'd90', tick: 'FibroScan', days: 90, ramp: ramp(0.5, 0.54), cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'd0',
      kicker: 'Day 90', site: 'sin', title: 'Stiffness and platelets make CSPH likely',
      line: 'Stiffness is {lsm} with platelets of {plt}, below 150. In this part of the gray zone, the pair makes CSPH likely without a catheter.',
      cite: 'Baveno VIII 1.15, 1.16',
      notes: 'Between 15 and 25 kPa the stiffness alone does not decide. Baveno VIII calls CSPH present when a validated model (ANTICIPATE-NASH in obese MASLD, built on the stiffness, the platelets and the BMI) puts its probability at 75% or more, or when the spleen stiffness on the 100 Hz probe is above 55 kPa. The model agrees: the HVPG has just passed 10 mmHg. With CSPH likely, Baveno VIII would start carvedilol here. Stiffness and platelets are cheap and repeatable, which is why they are used to follow patients between endoscopies.',
      ask: ['Stiffness 21 kPa and platelets 115. How likely is CSPH?', 'Likely: in the gray zone, a stiffness over 20 kPa with low platelets gives ANTICIPATE a high probability of CSPH. A spleen stiffness above 55 kPa on the 100 Hz probe would settle it.'],
    },
    {
      id: 'd180', terms: ['varix'], tick: 'Endoscopy', milestone: 'Varices', days: 90, ramp: ramp(0.54, 0.58), cam: 'varices', calipers: ['varix'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'd0',
      kicker: 'Day 180', site: 'sin', title: 'Small varices mean CSPH',
      line: 'Under Baveno VIII, varices are generally a sign of CSPH. Here the scope finds small ones in the lower esophagus.',
      caveat: 'Carvedilol would start by now; this case holds it back to show the pressure rising.',
      notes: 'Small varices are under 5 mm and flatten with air. Without red wale signs and in compensated cirrhosis they bleed rarely, but they show that the gradient is very likely past 10 mmHg; below 10 varices are uncommon, not impossible. Varices mean CSPH, so by Baveno VIII carvedilol would start now; this talk holds it back until the last slide only to show the untreated rise. A patient on a non-selective beta-blocker for CSPH needs no screening endoscopy; one who cannot take it has small varices rechecked in one to two years, sooner if the disease is active.',
      ask: ['What do small varices tell you about the HVPG?', 'That CSPH is present: Baveno VIII reads any varices as CSPH. Below 10 mmHg varices are uncommon, not impossible.'],
    },
    {
      id: 'd365', tick: 'Catheter, Doppler', days: 185, ramp: ramp(0.58, 0.66), cath: 'result', tool: { kind: 'profile', from: 'd0', fromLabel: 'Day 0' }, key: ['whvp', 'fhvp', 'hvpg'], delta: 'd0',
      compare: [{ label: 'Day 0', slide: 'd0' }, { label: 'Day 90', slide: 'd90' }, { label: 'Day 180', slide: 'd180' }, { label: 'Day 365', own: true }],
      kicker: 'Day 365', site: 'sin', title: 'At one year, HVPG is above 12',
      line: 'The HVPG is {hvpg}, up from 8.8 a year ago. From about 12, the risk of a variceal bleed rises steeply.',
      notes: 'A year on, the gradient has risen by about 4 mmHg. The faint line on the ladder, labelled Day 0, is day 0. Above about 12 mmHg a variceal bleed becomes more likely, and the risk of ascites and other decompensation rises with each mmHg. Repeat catheter studies are not routine; in practice the stiffness, the platelets and the scope track this rise.',
      ask: ['The HVPG is now 13. What does that change?', 'The varices are now more likely to bleed; below about 12 mmHg bleeding is rare.'],
    },
    {
      id: 'doppler', lens: 'velocity', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'd0' },
      kicker: 'Day 365', site: 'sin', title: 'Portal flow is starting to slow',
      line: 'As resistance in the liver rises, portal velocity falls; here it has fallen a little since day 0 but is still in the usual range. Colored by velocity, the portal vein still reads normal. A velocity under {<15 cm/s} supports portal hypertension.',
      notes: 'The main portal vein normally carries 15 cm/s or more toward the liver, with a gentle respiratory ripple. As resistance rises the velocity falls; under about 15 cm/s supports portal hypertension. Later the flow can become to-and-fro, then reverse (hepatofugal). Doppler also looks for a clot, a large spleen, collaterals and ascites. It is operator-dependent and changes with meals and breathing, so scan fasting.',
      ask: ['What portal vein velocity supports portal hypertension?', 'Under about 15 cm/s, or flow that is to-and-fro or reversed.'],
    },
    {
      id: 'belly', milestone: 'Ascites', cam: 'fit', glow: ['spleen'], normalOutline: ['spleen'], calipers: ['spleen'], tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'spleen'], key: ['asc'],
      kicker: 'Day 365', site: 'sin', title: 'Ultrasound finds the first fluid',
      line: 'Grade 1 ascites is seen only on ultrasound and needs no treatment itself, but it signals a worse prognosis. The spleen now measures {spleen}; the thin line inside it marks its normal size.',
      notes: 'Grade 1 ascites is found only on ultrasound and needs no treatment of its own, but it still marks a worse outlook; grade 2 is visible as a symmetric distension; grade 3 is tense. A first episode of clinically evident (grade 2 or 3) ascites marks decompensation: it is tapped, and salt restriction to about 2 g of sodium (5 g of salt) a day and diuretics start. The thin line inside the spleen is its normal size in the model (11 cm); the caliper along its long axis reads its length now.',
      ask: ['How is grade 1 ascites detected?', 'On ultrasound only; it cannot be found by examination.'],
    },
    {
      id: 'carv', tick: 'Carvedilol started', milestone: 'Carvedilol', when: 'On carvedilol', params: { drugs: { carvedilol: true } }, cam: 'liver', tool: { kind: 'profile', from: 'd365', fromLabel: 'No Rx' }, data: 'tiles', key: ['hvpg'], tiles: ['map', 'hr'], delta: true, hvpgResp: 'd365',
      kicker: 'Day 365', site: 'sin', title: 'Carvedilol lowers the gradient',
      line: 'Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, before a first bleed or decompensation. It lowers the gradient by about a fifth, and in most patients it replaces screening endoscopy. Check the blood pressure.',
      notes: 'Baveno VIII: in compensated cirrhosis with CSPH, a non-selective beta-blocker, preferably carvedilol (6.25 mg, then 12.5 mg a day), to prevent decompensation, as in the PREDESCI trial. It replaces screening endoscopy for most patients who take it. A fall in HVPG of 10% or more on drugs predicts benefit in compensated patients. Watch the blood pressure. The faint line on the ladder, labelled No Rx, is the patient just before carvedilol.',
      ask: ['Why start carvedilol before any bleed?', 'In compensated cirrhosis with CSPH it lowers the risk of decompensation (ascites, bleeding).'],
    },
    {
      id: 'plane', visual: 'plane', plane: 'csph',
      of: [{ id: 'd0', name: 'Day 0' }, { id: 'd90', name: 'Day 90' }, { id: 'd180', name: 'Day 180' }, { id: 'd365', name: 'Day 365' }],
      kicker: 'Summary', title: 'Stiffness and platelets followed the rise',
      line: 'Each point is the patient at one visit: as the HVPG rose, the stiffness climbed past 25 kPa and the platelets fell. In obese MASLD, as here, the 25 kPa cut-off does not rule CSPH in; the ANTICIPATE model, which adds the BMI, decides.',
      notes: 'The zones are Baveno VIII\'s: 15 kPa or less with platelets of 150 or more rules CSPH out (1.15); 25 kPa or more rules it in, outside obese MASLD (1.16), so in this patient with obesity the day 365 point counts only through ANTICIPATE-NASH or the spleen stiffness; between them is the gray zone, where a validated model or the spleen stiffness decides. Stiffness and platelets are cheap and repeatable, so they are rechecked every year.',
      ask: ['Which two readings would you repeat each year in this patient?', 'Liver stiffness and the platelet count.'],
    },
    {
      id: 'summary', tool: { kind: 'trace', range: 'talk', style: 'milestones', title: 'The HVPG over the year', bands: ['carvedilol'] }, cam: 'fit',
      kicker: 'Summary', site: 'sin', title: 'The HVPG over the year',
      line: 'The HVPG at every slide, from day 0 to carvedilol. The catheter, FibroScan, scope, Doppler and ultrasound each picked up the same rise.',
      notes: 'The catheter measures the gradient; FibroScan and the platelets estimate it; the scope shows its effect on the varices; Doppler shows the slower inflow; ultrasound finds the first fluid. The chart names four milestones: diagnosis, the first varices, the first fluid and carvedilol; the shaded band under it is carvedilol. In practice the cheap tests are repeated each year and the catheter is kept for uncertain cases.',
      ask: ['Which test would you repeat each year in this case, and why?', 'Stiffness and platelets: cheap and repeatable, and a rise warns that the disease is advancing.'],
    },
  ],
};
