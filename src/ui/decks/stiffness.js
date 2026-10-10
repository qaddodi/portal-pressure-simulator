// Presenter talk: liver stiffness, the spleen and the platelets (the slide fields are described at the top of decks.js).

// A variable in an equation: set in italic, as in print.
const v = (x) => `<mi style="font-style:italic">${x}</mi>`;

export const STIFFNESS = {
  id: 'stiffness', level: 'core', title: 'Non-invasive assessment: stiffness, spleen and platelets', minutes: 10,
  objectives: [
    'Explain what a FibroScan reading in kPa measures',
    'Apply the Baveno VII stiffness and platelet rule to CSPH',
    'Link a large spleen and low platelets to portal hypertension',
    'Recognise when stiffness misleads: presinusoidal block, congestion, a meal',
  ],
  summary: 'FibroScan, spleen size and the platelet count against the portal gradient: the Baveno VII rule, and where stiffness misleads (presinusoidal block, congestion, a meal).',
  slides: [
    {
      id: 'measure', preset: 'healthy', cam: 'liver', tool: { kind: 'fibroscan' },
      kicker: 'Liver stiffness', site: 'sin', title: 'Measuring stiffness',
      line: 'A probe on the skin sends a shear wave through the liver. The faster it travels, the stiffer the liver. Below about 7 kPa is normal.',
      notes: 'Transient elastography (FibroScan) times a shear wave through the right lobe and reports the stiffness in kPa: the median of ten valid readings, with an interquartile range under 30% of the median. A healthy liver reads 4 to 6 kPa. Obesity, narrow intercostal spaces and ascites make readings fail or less reliable; the XL probe helps in obesity. Shear-wave elastography on an ultrasound machine gives similar values with its own cut-offs.',
      ask: ['What does a FibroScan actually time?', 'A shear wave crossing the liver: the faster it goes, the stiffer the tissue.'],
    },
    {
      id: 'fibrosis', preset: 'cirr-comp', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'measure',
      kicker: 'Liver stiffness', site: 'sin', title: 'Fibrosis stiffens the liver',
      line: 'Collagen and regenerating nodules make the liver stiffer, and the stiffness climbs with the portal gradient.',
      notes: 'Baveno VII: below 10 kPa, compensated advanced chronic liver disease (cACLD) is unlikely without other signs; 10 to 15 kPa suggests it; 15 kPa or more makes it highly likely. Stiffness also rises with inflammation (a hepatitis flare, alcohol), cholestasis and congestion, so a high reading is read against the whole picture. In the model stiffness follows the sinusoidal gradient and the hepatic vein pressure, which is why it climbs with the HVPG.',
      ask: ['Below what stiffness is compensated advanced chronic liver disease unlikely?', 'Below 10 kPa, without other signs of it.'],
    },
    {
      id: 'meal', days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }, cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: true,
      kicker: 'Where stiffness misleads', site: 'sin', title: 'After a meal',
      line: 'A meal raises portal inflow, and the stiffness with it, for about two hours. Scan fasting.',
      notes: 'After eating, the gut arterioles dilate, portal inflow rises and the liver swells with blood; stiffness can rise by a fifth or more for up to two to three hours. Scan after at least two hours of fasting. The model shows the same patient fasting and after a meal: the HVPG rises by about a millimetre of mercury, the stiffness by about 2 kPa.',
      ask: ['Why scan fasting?', 'A meal raises portal inflow and the stiffness reading for up to about two hours.'],
    },
    {
      id: 'rule', visual: 'scale', scale: { key: 'lsm', max: 40, low: 'Rule out', marks: [[15, 'Grey zone'], [25, 'Rule in']], sub: 'hvpg' },
      of: [{ preset: 'healthy', name: 'Healthy' }, { id: 'fibrosis', name: 'Compensated cirrhosis' }, { preset: 'csph', name: 'CSPH by HVPG' }, { preset: 'cirr-decomp', name: 'Decompensated cirrhosis' }],
      kicker: 'Baveno VII', title: 'Stiffness against the gradient',
      eq: [`<mtable><mtr><mtd style="text-align:left;padding:0 .7em .15em 0"><mtext>Rule out</mtext></mtd><mtd style="text-align:left;padding:0 0 .15em">${v('LSM')}<mo>&lt;</mo><mn>15</mn><mtext>&#8201;kPa</mtext></mtd></mtr><mtr><mtd style="text-align:left;padding:0 .7em .15em 0"></mtd><mtd style="text-align:left;padding:0 0 .15em"><mtext>and&#8194;</mtext>${v('PLT')}<mo>≥</mo><mn>150</mn><mo>×</mo><msup><mn>10</mn><mn>9</mn></msup><mtext>/L</mtext></mtd></mtr><mtr><mtd style="text-align:left;padding:.35em .7em .15em 0"><mtext>Rule in</mtext></mtd><mtd style="text-align:left;padding:.35em 0 .15em">${v('LSM')}<mo>≥</mo><mn>25</mn><mtext>&#8201;kPa</mtext></mtd></mtr></mtable>`,
        'CSPH by Baveno VII. LSM: liver stiffness by FibroScan. PLT: platelet count.'],
      line: 'Between 15 and 25 kPa, stiffness alone cannot decide. The patient in the grey zone has CSPH by HVPG at 24 kPa.',
      notes: 'The rule of five: 10, 15, 20 and 25 kPa. At or below 15 kPa with platelets of 150 or more, CSPH is ruled out (under 5% risk) and screening endoscopy can be skipped. At 25 kPa or more, CSPH is ruled in (in viral and alcohol-related disease, and in non-obese MASLD). In the grey zone, 20 to 25 kPa with platelets below 150, or 15 to 20 kPa with platelets below 110, gives a risk of CSPH of 60% or more. The model\'s patient with CSPH (HVPG 11.7 mmHg) sits at 24 kPa, in the grey zone: a reminder that the zone is common, and that there the catheter or the platelets decide.',
      ask: ['Stiffness 13 kPa, platelets 180. Does this patient need a screening endoscopy?', 'No: below 15 kPa with platelets of 150 or more rules out CSPH.'],
    },
    {
      id: 'spleen', preset: 'csph', cam: 'spleen', data: 'tiles', tiles: ['spleen', 'plt', 'hvpg'], key: ['plt'], delta: 'fibrosis',
      kicker: 'The spleen and the platelets', site: 'sin', title: 'The spleen holds back platelets',
      line: 'Portal congestion enlarges the spleen, and a large spleen pools platelets. A falling count is often the first sign in the blood test.',
      notes: 'Splenic congestion and hyperplasia enlarge the spleen; it pools up to a third or more of the platelets, and a lower thrombopoietin from the liver adds to the fall. Spleen length over 13 cm and platelets below 150 support portal hypertension. Spleen stiffness, where available, tracks the portal pressure more closely than liver stiffness, including in presinusoidal disease. The tiles compare with the compensated patient two slides back.',
      ask: ['Give two reasons the platelet count falls in portal hypertension.', 'Splenic pooling in a large congested spleen, and less thrombopoietin from the liver.'],
    },
    {
      id: 'schisto', preset: 'schisto', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Where stiffness misleads', site: 'presin', title: 'Schistosomiasis',
      line: 'The block is in the portal tracts, before the sinusoids. The liver stays soft and the HVPG normal while the portal vein pressure is high.',
      notes: 'In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder) the parenchyma is spared, so the stiffness is normal or only slightly raised, and the wedged pressure, which reads the sinusoids, misses the block too. Varices, a large spleen and low platelets with a soft liver point here. Spleen stiffness stays high, and the diagnosis rests on imaging, the history and often a liver biopsy.',
      ask: ['Large varices, a large spleen and a stiffness of 5 kPa. What is the likely level of the block?', 'Presinusoidal: schistosomiasis or porto-sinusoidal vascular disorder.'],
    },
    {
      id: 'heart', preset: 'rhf', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['ra', 'hvpg'], key: ['ra'],
      kicker: 'Where stiffness misleads', site: 'cardiac', title: 'Congestion',
      line: 'A congested liver is stiff without fibrosis. Look at the right heart before calling it cirrhosis.',
      notes: 'Raised right atrial pressure fills the hepatic veins and sinusoids and stiffens the liver; readings over 25 kPa are common in decompensated heart failure and fall within days of diuresis. The HVPG is normal because the wedged and free pressures rise together. Hepatic outflow block (Budd–Chiari syndrome) does the same. Check the jugular venous pressure and an echocardiogram before reading a high stiffness as fibrosis.',
      ask: ['Stiffness 32 kPa, HVPG 1 mmHg and a raised jugular venous pressure. What is going on?', 'Congestion from the right heart, not cirrhosis.'],
    },
    {
      id: 'year', preset: 'cirr-comp', days: 365, ramp: { cirrhosis: [0.4, 0.85], albumin: [4, 2.8] }, cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'fibrosis',
      kicker: 'Over time', site: 'sin', title: 'A year of progression',
      line: 'As cirrhosis advances, the stiffness and the gradient rise together. Repeat the scan each year.',
      notes: 'Baveno VII advises repeating stiffness and platelets every year in compensated cirrhosis. A clear fall in stiffness after treating the cause (antivirals, abstinence) predicts a lower risk of decompensation; a rise means progression. The tiles compare with the same patient a year earlier.',
      ask: ['How often are stiffness and platelets repeated in compensated cirrhosis?', 'Every year.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['lsm', 'plt', 'ppg'], fine: true, asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'fibrosis', kicker: 'Sinusoidal', title: 'Compensated cirrhosis' }, { id: 'spleen', kicker: 'Sinusoidal', title: 'CSPH' }, { id: 'schisto', kicker: 'Presinusoidal' }, { id: 'heart', kicker: 'Cardiac', title: 'Heart failure' }, { id: 'year', kicker: 'Sinusoidal', title: 'Cirrhosis, a year on' }],
      kicker: 'Summary', title: 'What each test reads',
      foot: 'From the model, against normal (top row; LSM: liver stiffness, kPa). ↑ above normal, ↑↑ well above, ↓ below, • normal. Stiffness reads the liver tissue; the PPG and the platelets read the whole portal system. Hover or tap a cell for its value. Pick a row to go back to it.',
      notes: 'Stiffness reads the tissue between the portal and hepatic veins: high in cirrhosis and in congestion, normal in presinusoidal block. The spleen and platelets follow the portal vein pressure whatever the level of the block. The HVPG misses presinusoidal and pre-hepatic disease; the PPG catches them. When the tests disagree, the disagreement points to the level of the block.',
      ask: ['A high PPG with normal stiffness and a normal HVPG. Where is the block?', 'Before the sinusoids: presinusoidal or pre-hepatic.'],
    },
  ],
};
