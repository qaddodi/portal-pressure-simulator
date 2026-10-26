// Presenter talk: ascites, why it forms, what the tap shows and how it is treated (the slide fields are described at the top of decks.js).
// One fluid card runs through where it forms (the sinusoids and the ascites as tiles); one belly gauge runs through the treatment
// (the ascites and the portal pressure). The old Paracentesis and albumin talk is its last section (decks.js DECK_ALIAS).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

const FLUID = { kind: 'fluid', window: true, forces: true };
const BELLY = { kind: 'abdomen' };

export const ASCITES = {
  id: 'ascites', level: 'advanced', title: 'Ascites: why it forms and how it is treated', minutes: 18,
  summary: 'How ascites forms in the sinusoids, what the tap shows, and what each treatment does: paracentesis with albumin, diuretics and TIPS.',
  sections: [['Where ascites forms', ['Ascites']], ['Tapping the fluid', ['Tapping the fluid', 'Protein-rich ascites', 'Telling them apart']], ['Treating it', ['Tense ascites', 'Large-volume paracentesis', 'Two weeks later', 'Treatment', 'Refractory ascites', 'Summary']]],
  objectives: [
    'Explain how sinusoidal pressure and lymph make ascites',
    'Interpret the SAAG and ascitic protein, and tell cirrhosis from heart failure and Budd–Chiari by the tap',
    'Give albumin correctly after a large-volume paracentesis',
    'Use diuretics and TIPS for ascites that keeps coming back, and define refractory ascites',
  ],
  checks: [
    ['What SAAG points to portal hypertension?', '1.1 g/dL or more.'],
    ['A high SAAG with ascitic protein of 2.5 g/dL or more. Where is the problem?', 'Post-hepatic or cardiac: Budd–Chiari syndrome or heart failure. The sinusoid wall is still open and lets protein through.'],
    ['The SAAG is 1.8, the ascitic protein 3.1 g/dL and the HVPG normal. Where is the resistance?', 'After the sinusoids, most often a failing right heart: it raises the wedged and free pressures together, so the HVPG stays normal, and the open sinusoids let protein through.'],
    ['How much albumin goes with a large-volume paracentesis?', '6 to 8 g for each liter removed, when more than 5 liters come out.'],
    ['Why does ascites come back after a tap alone?', 'Sinusoidal pressure and the kidneys\' sodium retention are unchanged. Diuretics or a TIPS keep it away.'],
    ['When is ascites called refractory?', 'It returns within 4 weeks of a tap despite the highest diuretic doses and a low-salt diet, or diuretics cannot be given because of kidney injury, low sodium or high potassium.'],
    ['Ten days after a 6 L tap with albumin, the belly is full again on full-dose diuretics. What has not changed?', 'The portal pressure: the tap removes the fluid, not its cause. Ascites that returns on full diuretics is refractory, and TIPS is the next step to consider.'],
  ],
  slides: [
    {
      id: 'start', terms: { 'space of Disse': 'sinusoid:disse', lymphatics: 'sinusoid:lymph' }, glow: ['sinusoid:lumen'], preset: 'csph', cam: 'sinusoid', scales: { lobule: { glow: ['lobule:sinusoid'] }, anatomy: { cam: 'fit' } }, tool: FLUID, data: 'tiles', tiles: ['sin', 'asc'], key: ['sin'],
      kicker: 'Ascites', site: 'sin', title: 'Ascites starts in the sinusoids',
      vignette: 'A 55-year-old woman with MASH cirrhosis comes for a routine visit. She feels well and has no ascites. Her platelets are 88,000/µL, and EGD shows small esophageal varices.',
      line: 'Sinusoidal pressure drives plasma into the space of Disse. Hepatic lymphatics drain it until they cannot keep up.',
      notes: 'Ascites in portal hypertension is mostly lymph, from the liver and, to a lesser degree, the gut. Sinusoidal pressure drives plasma through the open sinusoid wall into the space of Disse, and the hepatic lymphatics return it to the blood through the thoracic duct. Hepatic lymph flow can rise many-fold; once it outruns the lymphatics, lymph weeps from the surface of the liver into the peritoneum. In this case there is clinically significant portal hypertension, and the lymphatics still keep up. Ascites becomes possible from an HVPG of 10 mmHg, the CSPH threshold, and the risk rises with the gradient.',
      ask: ['What carries the sinusoids\' filtrate away before ascites forms?', 'The hepatic lymphatics, to the thoracic duct.'],
    },
    {
      id: 'lymph', terms: { lymphatics: 'lobule:lymph', 'portal tracts': 'lobule:triad' }, cam: 'lobule', scales: { sinusoid: {}, anatomy: { cam: 'fit' } }, layers: ['lymph'],
      tool: FLUID, data: 'tiles', tiles: ['sin', 'asc'], key: ['sin'], delta: 'start',
      kicker: 'Ascites', site: 'sin', title: 'Lymph leaves the liver along the portal tracts',
      line: 'With the sinusoids at {sin}, the lymphatics along the portal tracts carry almost all the fluid away, so almost no ascites forms. They can carry only so much.',
      notes: 'Fluid from the space of Disse runs back against the blood to the lymphatics. Plasma filtered into the space of Disse flows toward the portal tracts, against the direction of the blood, and enters lymphatics that run with the portal vein branches to the hilum, then to the cisterna chyli and the thoracic duct. A smaller share leaves along the hepatic veins and under the capsule. The liver makes a quarter to a half of the body\'s lymph, and its flow rises with sinusoidal pressure. The lymphatics widen and carry many times their usual flow before they are overwhelmed; only then does lymph weep from the liver surface into the peritoneum. In the data card the lymphatics carry almost all of the lymph made, about 10 mL a day leaks and nothing is left to spare, so a further rise in sinusoidal pressure will overflow.',
      ask: ['Where does the fluid filtered in the sinusoids go before ascites forms?', 'Back along the space of Disse to lymphatics in the portal tracts, then to the thoracic duct.'],
    },
    {
      id: 'fill', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 9 }, cam: 'fit', scales: { lobule: { glow: ['lobule:sinusoid'] }, sinusoid: {} }, glow: ['liver'], mark: { organ: 'ascites', label: 'Ascites {asc}' }, tool: FLUID, data: 'tiles', tiles: ['sin', 'asc'], key: ['asc'], delta: 'start',
      kicker: 'Ascites', site: 'sin', title: 'Ascites builds over two months',
      line: 'As fibrosis advances, sinusoidal pressure rises and lymph outruns the lymphatics. The fluid spills into the peritoneum, and the kidneys, retaining sodium and water, keep replacing it.',
      notes: 'The model builds the fluid from pressure and albumin; it does not model the kidneys. The time-lapse runs the model\'s disease clock: cirrhosis advances and serum albumin falls from 4.0 to 2.8 g/dL over 60 days, without diuretics. The sinusoids climb from about 17 to 25 mmHg, hepatic lymph overflows and the ascites reaches several liters. In the data card the lymph made outgrows what the lymphatics can carry, and the leak outruns what the belly reabsorbs, so the difference, in amber, builds up. The strip below it shows the Starling forces, the pressure pushing fluid out of the sinusoids against the pull of the protein. In patients, splanchnic vasodilation lowers the effective blood volume, and the kidneys retain sodium and water through renin–angiotensin–aldosterone, the sympathetic system and vasopressin. High sinusoidal pressure puts the fluid in the peritoneum; renal sodium and water retention keep replacing it. Treatment: less salt, spironolactone with furosemide, large-volume paracentesis with albumin, TIPS.',
      ask: ['Which hormone system drives sodium retention in cirrhotic ascites, and which drug blocks it?', 'Renin–angiotensin–aldosterone; spironolactone.'],
    },
    {
      id: 'saag', preset: 'csph', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['saag', 'tp'], key: ['saag'],
      kicker: 'Tapping the fluid', site: 'sin', title: 'Serum–ascites albumin gradient',
      eq: [mi('SAAG') + mo('=') + sub(mi('Albumin'), 'serum') + mo('−') + sub(mi('Albumin'), 'ascites')],
      line: 'Tapped, the SAAG is {saag}. A value of 1.1 g/dL or more means portal hypertension is the cause.',
      notes: 'Source: AASLD 2021 ascites guidance. The first tap is diagnostic (30 to 60 mL from the left lower quadrant, no need to correct the INR or platelets), and so is every admission with ascites. The serum–ascites albumin gradient uses serum and ascites taken the same day. A SAAG of 1.1 g/dL or more identifies portal hypertension as the cause with about 97% accuracy, whatever causes the portal hypertension. Below 1.1, the fluid comes from a leaky peritoneum or a very low serum albumin: cancer, tuberculosis, pancreatitis, nephrotic syndrome. Send a cell count as well (more than 250 neutrophils per mm³ is spontaneous bacterial peritonitis), the total protein, and a culture in blood-culture bottles at the bedside. Cirrhotic ascites is protein-poor, with a total protein below 2.5 g/dL, because fibrosis closes the sinusoid\'s fenestrae and lays down a basement membrane (capillarization). A protein below 1.5 g/dL means weak opsonic activity and a higher risk of spontaneous bacterial peritonitis, so prophylactic antibiotics are considered.',
      ask: ['The SAAG is 0.8 g/dL. Is portal hypertension the cause?', 'No: below 1.1 portal pressure is not pushing the fluid out. Look for peritoneal disease or a very low serum albumin.'],
    },
    {
      id: 'hf', terms: { lymph: 'sinusoid:lymph', sinusoid: 'sinusoid:lumen' }, preset: 'rhf', cam: 'sinusoid', data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'cardiac', title: 'High protein in heart failure',
      vignette: 'A 74-year-old man with ischemic cardiomyopathy and severe TR has a swollen abdomen and leg edema. His JVP is raised to the earlobes, and his liver tests are only mildly abnormal.',
      line: 'The sinusoid wall is still open. Congestion drives protein-rich lymph through it: SAAG {saag}, 1.1 g/dL or more, and protein {tp}, 2.5 g/dL or more.',
      notes: 'In heart failure and constrictive pericarditis the sinusoids are congested but not scarred: the fenestrae stay open, so the lymph is nearly as rich in protein as plasma. The ascites has a high SAAG (portal hypertension of cardiac origin) and a total protein of 2.5 g/dL or more. A raised jugular venous pressure and a high BNP point to the heart.',
      ask: ['Ascites with a SAAG of 1.5 and protein of 3.8 g/dL. What do you examine next?', 'The heart: the jugular venous pressure, an echocardiogram, BNP.'],
    },
    {
      id: 'bc', terms: ['hv', 'sin'], preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true }, data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'post', title: 'High protein in Budd–Chiari syndrome',
      vignette: 'A 26-year-old woman, 3 months postpartum, has had RUQ pain for 2 months and now has tense ascites. Her liver is large and tender.',
      line: 'Resistance in the hepatic veins congests a liver that is not yet scarred. Its sinusoids are still open, so the SAAG is high and protein is 2.5 g/dL or more.',
      notes: 'Hepatic venous outflow obstruction gives the same high-SAAG, high-protein ascites as heart failure, but with a normal jugular venous pressure. Over months the congested liver can scar and capillarize, and the protein falls toward the cirrhotic range. Ascites with abdominal pain and a large liver, in a patient with a myeloproliferative neoplasm or in pregnancy, calls for a Doppler of the hepatic veins.',
      ask: ['High-SAAG, high-protein ascites and a normal jugular venous pressure. Where do you look?', 'At the hepatic veins and the IVC, for Budd–Chiari syndrome (Doppler ultrasound).'],
    },
    {
      id: 'map', visual: 'quadrant', of: [{ id: 'fill', name: 'Cirrhosis' }, { id: 'hf', name: 'Heart failure' }, { id: 'bc', name: 'Budd–Chiari' }],
      kicker: 'Telling them apart', title: 'Interpreting SAAG and protein',
      line: 'SAAG shows whether portal hypertension is the cause. Ascitic protein shows whether the sinusoid wall is capillarized or still permeable.',
      notes: 'Read the SAAG first: 1.1 g/dL or more is portal hypertension. Then the protein: below 2.5 g/dL fits cirrhosis (sealed, capillarized sinusoids); 2.5 or more with a high SAAG fits the heart or early Budd–Chiari (open, congested sinusoids). A low SAAG with high protein means a leaky peritoneum: peritoneal cancer, tuberculosis, pancreatic ascites. A low SAAG with low protein is rare: nephrotic syndrome. Portal vein thrombosis and presinusoidal disease have no point here, because they rarely cause ascites: the sinusoids lie beyond the resistance at near-normal pressure (see Portal vein clots and Presinusoidal portal hypertension). The points are the model\'s patients.',
      ask: ['SAAG 0.6, protein 4.2 g/dL and weight loss. What is likely, and what next?', 'Peritoneal cancer or tuberculous peritonitis: cytology, adenosine deaminase, peritoneal biopsy.'],
    },
    {
      id: 'tense', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', terms: { 'renal veins': 'lrv' }, tool: BELLY, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'],
      kicker: 'Tense ascites', site: 'sin', title: 'Grade 3 ascites presses on the kidneys',
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. His abdomen is now tense, and he is short of breath lying flat. His albumin is 2.4 g/dL.',
      line: 'Tense ascites raises the pressure inside the abdomen, which presses on the renal veins and the kidneys.',
      notes: 'Decompensated cirrhosis without diuretics for four months, the serum albumin falling. Tense ascites raises intra-abdominal pressure, which lowers kidney perfusion, splints the diaphragm and adds to the pressure on the varices. Breathlessness, early satiety and an umbilical hernia are common. Grade 3 is treated first with large-volume paracentesis.',
      ask: ['Name two effects of tense ascites outside the abdomen.', 'Breathlessness from a splinted diaphragm, and lower kidney perfusion.'],
    },
    {
      id: 'lvp', action: { kind: 'paracentesis', mL: 8000 }, params: { albumin: 2.74 }, cam: 'fit', tool: BELLY,
      // (A third tile, where the slide's point needs it: the albumin given with the tap.)
      data: 'tiles', tiles: ['asc', 'pv', 'salb'], key: ['salb'], delta: 'tense',
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'A large-volume tap comes with albumin',
      line: 'The tap leaves {asc} and the portal pressure falls a little. After more than 5 liters, give {6 to 8 g} of albumin for each liter removed.',
      notes: 'The model has no kidneys or renin: albumin here raises the serum albumin and the plasma oncotic pressure, and the fluid comes back more slowly on "Ascites returns in two weeks". For a 6 L tap, about 40 g of 20% albumin, given during or after the tap; it prevents post-paracentesis circulatory dysfunction better than saline or synthetic colloids. Under 5 L, albumin is optional. Large-volume paracentesis removes all the fluid in one go, safely, in a few hours. Taking off the intra-abdominal pressure lowers the portal and variceal pressure a little. After more than 5 L, splanchnic vessels dilate further and the effective blood volume falls over the next days: post-paracentesis circulatory dysfunction, with renin rising, hyponatremia, kidney injury and faster return of the ascites.',
      ask: ['Why give albumin rather than saline after an 8 L tap, and how much?', 'It prevents post-paracentesis circulatory dysfunction better: less kidney injury, less hyponatremia, slower return. About 50 to 65 g, 6 to 8 g for each liter.'],
    },
    {
      id: 'back', days: 14, lapse: { seconds: 7 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: 'tense',
      kicker: 'Two weeks later', site: 'sin', title: 'Ascites returns in two weeks',
      line: 'Sinusoidal pressure and the kidneys\' sodium retention have not changed, so without diuretics the fluid refills the abdomen to {asc}.',
      notes: 'The liver and gut still make more lymph than the lymphatics carry. The sinusoidal pressure and the kidneys\' sodium retention are unchanged, so lymph keeps weeping from the liver. Here he has had no diuretics at all.',
      ask: ['The fluid is back two weeks after the tap. Is this refractory ascites?', 'No: he has had no diuretics. Refractory means it returns within four weeks despite the highest diuretic doses and salt restriction, or diuretics cannot be taken.'],
    },
    {
      id: 'diuretics', params: { diuretics: true }, days: 28, cam: 'fit', tool: BELLY,
      compare: [{ label: 'No diuretics', params: { diuretics: false } }, { label: 'Diuretics', own: true, params: { diuretics: true } }], data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: 'tense',
      kicker: 'Treatment', site: 'sin', title: 'Diuretics counter the kidneys\' sodium retention',
      line: 'Spironolactone with furosemide, and less salt. The kidneys lose sodium and water follows, so more fluid is reabsorbed from the abdomen and the ascites settles at {asc}.',
      notes: 'The model has no kidneys, so here diuretics simply raise how much fluid the abdomen reabsorbs. Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites; outside the US, EASL starts a first episode on spironolactone alone and adds furosemide if weight loss is slow or the potassium rises. Both rise in a 100:40 ratio to 400 and 160 mg. About 2 g of sodium (5 g of salt) a day; no fluid restriction unless the sodium is below 125. Aim for a weight loss of up to 0.5 kg a day without leg edema, 1 kg with it. Stop or reduce for kidney injury, a sodium below 125, encephalopathy or muscle cramps. Diuretics also concentrate the ascites, so its protein rises.',
      ask: ['Starting doses of spironolactone and furosemide?', 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites (outside the US, EASL starts a first episode on spironolactone alone); both rise in a 100:40 ratio to 400 and 160 mg.'],
    },
    {
      id: 'refractory', cam: 'fit', data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Refractory ascites', short: 'Refractory', ticks: false, rows: ['Back within 4 weeks on top diuretic doses and a low-salt diet', 'Or diuretics cannot be given (kidney injury, sodium, potassium)'] },
      kicker: 'Refractory ascites', site: 'sin', title: 'Refractory ascites, defined',
      line: 'Refractory ascites returns within 4 weeks of a tap despite the highest diuretic doses, or diuretics cannot be given. Here he settles at {asc}, so he is not refractory.',
      notes: 'Source: Baveno VIII 6.3 and 6.4. Refractory ascites returns within 4 weeks of a tap despite the highest diuretic doses and a low-salt diet, or diuretics cannot be given. Patients with recurrent or refractory ascites should be considered for a TIPS, and the TIPS and a liver transplant discussed together. Refractory means the highest diuretic doses (spironolactone 400 mg and furosemide 160 mg a day) and about 2 g of sodium a day fail to keep the fluid away, or diuretics have to stop for kidney injury, a sodium below 125, high potassium or encephalopathy. The definition is the one used elsewhere in this talk; the Baveno VIII statements name refractory ascites without defining it.',
      ask: ['Fluid back three weeks after a tap, on spironolactone 400 mg and furosemide 160 mg. What is the label, and what do you consider?', 'Refractory ascites. Consider a TIPS and discuss transplantation, if there is no recurrent encephalopathy, heart failure or severe pulmonary hypertension.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, days: 28, lapse: { seconds: 7 }, cam: 'liver', tool: BELLY, mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: 'tense',
      kicker: 'Refractory ascites', site: 'sin', title: 'TIPS for refractory ascites',
      line: 'A TIPS lowers the gradient to {ppg} and the sinusoidal pressure with it, so the fluid falls to {asc}. The price is encephalopathy in about one patient in three.',
      notes: 'Less lymph forms, and in exchange the liver gets less portal blood. In recurrent or refractory ascites, a covered TIPS improves survival over repeated paracentesis in selected patients: bilirubin under about 3 mg/dL, no recurrent encephalopathy, no heart failure or severe pulmonary hypertension. The ascites clears over weeks to months, diuretics continued at first. The model clears it faster. No target gradient is agreed for ascites; below 12 mmHg is the bleeding target.',
      ask: ['Name a reason not to place a TIPS for ascites.', 'Recurrent encephalopathy, heart failure or pulmonary hypertension, or advanced liver failure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['asc', 'ppg', 'liver'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'tense', kicker: 'Baseline', title: 'Tense ascites' }, { id: 'lvp', kicker: 'Tap', title: 'Paracentesis with albumin' }, { id: 'back', kicker: 'No treatment', title: 'Two weeks on' }, { id: 'diuretics', kicker: 'Drugs', title: 'Diuretics, 4 weeks' }, { id: 'tips', kicker: 'Shunt', title: 'TIPS, 4 weeks' }],
      kicker: 'Summary', title: 'What each ascites treatment does',
      line: 'The tap empties the abdomen, but only diuretics or TIPS keep the fluid from returning.',
      notes: 'The tap clears the fluid at once but leaves its cause; albumin protects the circulation; diuretics clear it more slowly and keep it away; TIPS clears it by lowering the sinusoidal pressure, at the cost of the liver\'s portal blood. Each patient with refractory ascites is also assessed for transplantation. Avoid NSAIDs, and ACE inhibitors and ARBs, in ascites; long-term albumin is used in some centers for decompensated cirrhosis.',
      ask: ['Which step acts on the mechanism rather than only the fluid?', 'TIPS lowers the sinusoidal pressure and diuretics counter the sodium retention; the tap does neither. Only treating the liver disease removes the cause.'],
    },
  ],
};
