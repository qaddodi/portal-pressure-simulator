// Presenter talk: liver stiffness, the spleen and the platelets (the slide fields are described at the top of decks.js).

// A variable in an equation: set in italic, as in print.

export const STIFFNESS = {
  id: 'stiffness', level: 'core', title: 'Liver stiffness, spleen size and platelets', minutes: 10,
  objectives: [
    'Explain what a FibroScan reading in kPa measures',
    'Apply the Baveno VIII stiffness and platelet rule to CSPH',
    'Link a large spleen and low platelets to portal hypertension',
    'Recognize when stiffness misleads: presinusoidal resistance, congestion, a meal',
  ],
  checks: [
    ['Which stiffness means CSPH in compensated cirrhosis under Baveno VIII?', '25 kPa or more.'],
    ['Which stiffness and platelet count rule CSPH out?', 'Stiffness of 15 kPa or less with platelets of 150 or more.'],
    ['Name two situations where stiffness misleads.', 'A recent meal and heart failure congestion raise it. Presinusoidal resistance, such as schistosomiasis, keeps it low despite high portal pressure.'],
  ],
  summary: 'FibroScan, spleen size and the platelet count against the portal gradient: the Baveno VIII rule, and where stiffness misleads (presinusoidal resistance, congestion, a meal).',
  slides: [
    {
      id: 'measure', preset: 'healthy', cam: 'liver', tool: { kind: 'fibroscan' },
      kicker: 'Liver stiffness', site: 'sin', title: 'A shear wave measures stiffness',
      line: 'A probe on the skin sends a shear wave through the liver. The faster it travels, the stiffer the liver. Below about 7 kPa is normal.',
      notes: 'Transient elastography (FibroScan) times a shear wave through the right lobe and reports the stiffness in kPa: the median of ten valid readings, with an interquartile range under 30% of the median. A healthy liver reads 4 to 6 kPa. Obesity, narrow intercostal spaces and ascites make readings fail or less reliable; the XL probe helps in obesity. Shear-wave elastography on an ultrasound machine gives similar values with its own cut-offs.',
      ask: ['What does a FibroScan actually time?', 'A shear wave crossing the liver: the faster it goes, the stiffer the tissue.'],
    },
    {
      id: 'fibrosis', preset: 'cirr-comp', cam: 'liver', glow: ['liver'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'measure',
      kicker: 'Liver stiffness', site: 'sin', title: 'Fibrosis stiffens the liver',
      vignette: 'A 50-year-old man with chronic hepatitis B, lost to follow-up for years, is referred for staging. He feels well, and his platelets are 159,000/µL.',
      line: 'Stiffness is {lsm}, with an HVPG of {hvpg}. By Baveno VIII, under 10 kPa makes advanced disease unlikely and over 15 kPa highly likely. Stiffness tracks the gradient well up to about 12 mmHg and only loosely above that.',
      caveat: 'The model\'s stiffness follows the gradient more closely than patients\' does.',
      notes: 'Baveno VIII: below 10 kPa, compensated advanced chronic liver disease (cACLD) is unlikely without other signs; 10 to 15 kPa suggests it; over 15 kPa makes it highly likely. Stiffness also rises with inflammation (a hepatitis flare, alcohol), cholestasis and congestion, so a high reading is read against the whole picture. In the model stiffness follows the sinusoidal gradient and the hepatic vein pressure, which is why it climbs with the HVPG.',
      ask: ['Why can stiffness rule CSPH in or out, yet not follow a gradient above 12?', 'Above 10 to 12 mmHg the gradient rises mostly with inflow and vascular tone, which stiffness does not see.'],
    },
    {
      id: 'spleen', terms: ['spleen'], preset: 'csph', cam: 'spleen', glow: ['spleen'], calipers: ['spleen'], normalOutline: ['spleen'], data: 'tiles', tiles: ['spleen', 'plt', 'hvpg'], key: ['plt'], delta: 'fibrosis',
      kicker: 'The spleen and the platelets', site: 'sin', title: 'A large spleen sequesters platelets',
      vignette: 'A 63-year-old woman with MASH cirrhosis has had a lower platelet count at each yearly visit. She feels well and has never had ascites or bleeding.',
      line: 'A falling platelet count is often the first sign in the blood tests. Here the spleen is {spleen} and platelets are {plt}.',
      notes: 'Splenic congestion and hyperplasia enlarge the spleen; a normal spleen already holds about a third of the platelets and an enlarged one up to about 90%, and a lower thrombopoietin from the liver adds to the fall. Spleen length over about 12 to 13 cm and platelets below 150 support portal hypertension. Spleen stiffness, where available, tracks the portal pressure more closely than liver stiffness, including in presinusoidal disease. The tiles compare with the compensated patient of "Fibrosis stiffens the liver".',
      ask: ['Give two reasons the platelet count falls in portal hypertension.', 'Splenic pooling in a large congested spleen, and less thrombopoietin from the liver.'],
    },
    {
      id: 'rule', visual: 'plane', plane: 'csph',
      // (Baveno VIII's rules are for compensated disease, so every case here is compensated, without ascites. Schistosomiasis and heart
      // failure stay off: the zones hold only for viral, alcohol-related and non-obese MASLD cirrhosis.)
      of: [{ id: 'fibrosis', name: 'Low stiffness, normal platelets', short: 'Low stiffness' }, { id: 'spleen', name: 'Gray-zone stiffness, low platelets', short: 'Gray zone' }, { preset: 'csph', params: { cirrhosis: 0.75 }, name: 'High stiffness, low platelets', short: 'High stiffness' }],
      kicker: 'Baveno VIII', title: 'Stiffness and platelets rule CSPH in or out',
      line: '25 kPa or more means CSPH in viral, alcohol-related and non-obese MASLD cirrhosis; 15 or less with platelets of 150 or more rules it out. The second case, at {lsm@spleen} with an HVPG of {hvpg@spleen}, falls between. The third is above 25.',
      notes: 'The rule of five: 10, 15, 20 and 25 kPa. At or below 15 kPa with platelets of 150 or more, CSPH is ruled out (sensitivity and negative predictive value over 90%). A separate rule decides the scope: under 20 kPa with platelets of 150 or more spares the screening endoscopy. At 25 kPa or more, CSPH is ruled in (in viral and alcohol-related disease, and in non-obese MASLD). In the gray zone between, Baveno VIII uses a validated model (ANTICIPATE, from the stiffness and the platelets; with BMI in obese MASLD) and calls CSPH present at a probability of 75% or more. A spleen stiffness above 55 kPa on the 100 Hz probe also rules CSPH in. In obese MASLD the 25 kPa rule does not apply; the model decides. The model\'s compensated patient with CSPH (HVPG 12 mmHg, platelets 88) sits at 24 kPa, in the gray zone: a reminder that the zone is common, and that there the catheter or the platelets decide.',
      ask: ['Stiffness 13 kPa, platelets 180. Is CSPH present, and is a scope needed?', 'No CSPH (15 or less with 150 or more), and no scope (under 20 with 150 or more): repeat both in a year.'],
    },
    {
      id: 'meal', preset: 'cirr-comp', params: { splanchnicTone: 1 }, days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }, cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'fibrosis',
      kicker: 'Where stiffness misleads', site: 'sin', title: 'Stiffness rises after a meal',
      line: 'Stiffness stays raised for up to two to three hours after eating, so scan fasting.',
      notes: 'After eating, the gut arterioles dilate, portal inflow rises and the liver swells with blood; stiffness can rise by a fifth or more for up to two to three hours. Scan after at least two hours of fasting. The model shows the same patient fasting and after a meal: the HVPG rises by about a millimeter of mercury, the stiffness by about 2 kPa.',
      ask: ['Why scan fasting?', 'A meal raises portal inflow and the stiffness reading for up to two to three hours.'],
    },
    {
      id: 'schisto', preset: 'schisto', cam: 'liver', glow: ['liver'], sites: ['pv'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'pv', 'hvpg'], key: ['lsm', 'pv'],
      kicker: 'Where stiffness misleads', site: 'presin', title: 'In schistosomiasis the liver stays soft',
      vignette: 'A 33-year-old man who grew up in northeastern Brazil and swam in its rivers as a child has a large spleen and low platelets. His liver tests are normal.',
      line: 'The resistance sits in the portal tracts, upstream of the sinusoids, so the wedge misses it too. The HVPG is normal while portal vein pressure is high. Varices, a large spleen and low platelets with a soft liver suggest it.',
      notes: 'In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder) the parenchyma is spared, so the stiffness is normal or only slightly raised, and the wedged pressure, which reads the sinusoids, misses the resistance too. Varices, a large spleen and low platelets with a soft liver point here. Spleen stiffness stays high, and the diagnosis rests on imaging, the history and often a liver biopsy.',
      ask: ['Large varices, a large spleen and a stiffness of 5 kPa. What is the likely level of the resistance?', 'Presinusoidal: schistosomiasis or porto-sinusoidal vascular disorder.'],
    },
    {
      id: 'heart', preset: 'rhf', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ra', 'hvpg'], key: ['lsm', 'ra'],
      kicker: 'Where stiffness misleads', site: 'cardiac', title: 'Congestion stiffens the liver',
      vignette: 'A 70-year-old woman with severe TR is admitted with heart failure and ascites. A FibroScan done for raised liver enzymes reads in the cirrhosis range.',
      line: 'Readings above 25 kPa are common in decompensated heart failure and fall within days of diuresis. Check the jugular venous pressure and get an echocardiogram before calling it cirrhosis.',
      notes: 'Raised right atrial pressure fills the hepatic veins and sinusoids and stiffens the liver; readings over 25 kPa are common in decompensated heart failure and fall within days of diuresis. The HVPG is normal because the wedged and free pressures rise together. Hepatic outflow resistance (Budd–Chiari syndrome) does the same. Check the jugular venous pressure and an echocardiogram before reading a high stiffness as fibrosis.',
      ask: ['Stiffness 32 kPa and a raised jugular venous pressure. What is going on?', 'Congestion from the right heart, not cirrhosis.'],
    },
    {
      id: 'year', preset: 'cirr-comp', params: { cirrhosis: 0.4 }, days: 365, ramp: { cirrhosis: [0.4, 0.6] }, cam: 'liver', glow: ['liver'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'fibrosis',
      kicker: 'Over time', site: 'sin', title: 'Stiffness rises as cirrhosis advances',
      cite: 'Baveno VIII 1.9',
      line: 'Stiffness is now {lsm}, with a gradient of {hvpg}. A fall after the cause is treated predicts a lower risk of decompensation, and a rise means progression. Baveno VIII advises repeating the scan every year.',
      notes: 'Baveno VIII advises repeating stiffness and platelets every year in compensated cirrhosis. A clear fall in stiffness after treating the cause (antivirals, abstinence) predicts a lower risk of decompensation; a rise means progression. The tiles compare with the same patient a year earlier.',
      ask: ['How often are stiffness and platelets repeated in compensated cirrhosis?', 'Every year.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['lsm', 'plt', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'fibrosis', kicker: 'Sinusoidal', title: 'Compensated cirrhosis' }, { id: 'spleen', kicker: 'Sinusoidal', title: 'CSPH' }, { id: 'schisto', kicker: 'Presinusoidal' }, { id: 'heart', kicker: 'Cardiac', title: 'Heart failure' }, { id: 'year', kicker: 'Sinusoidal', title: 'Cirrhosis, a year on' }],
      kicker: 'Summary', title: 'What each test reads',
      line: 'Stiffness reads the liver tissue. Platelets and the PPG follow pressure across the whole portal system.',
      notes: 'Stiffness reads the tissue between the portal and hepatic veins: high in cirrhosis and in congestion, normal in presinusoidal resistance. The spleen and platelets follow portal pressure whatever the level of resistance; venous congestion from the heart rarely enlarges the spleen or lowers platelets more than mildly. The HVPG misses presinusoidal and pre-hepatic disease; the PPG catches them. When the tests disagree, the disagreement points to the level of resistance.',
      ask: ['A high PPG with normal stiffness and a normal HVPG. Where does the resistance lie?', 'Before the sinusoids: presinusoidal or pre-hepatic.'],
    },
  ],
};
