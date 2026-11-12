// Presenter talk: ascites, why it forms, what the tap shows and how it is treated (the slide fields are described at the top of decks.js).
// One fluid card runs through where it forms (the sinusoids and the ascites as tiles); one belly gauge runs through the treatment
// (the ascites and the portal pressure). The old Paracentesis and albumin talk is its last section (decks.js DECK_ALIAS).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

const FLUID = { kind: 'fluid', window: true, forces: true };
const BELLY = { kind: 'abdomen' };
// The relation chart's course: the same patient as the Tense ascites and Large-volume paracentesis slides (tests/relation-ascites-chart.test.js
// keeps them equal), day by day from the tap, two weeks with nothing done, then each treatment from that day for four weeks.
const COURSE = {
  kind: 'course', reading: 'asc',
  from: { preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] } },
  event: { params: { albumin: 2.74 }, action: { kind: 'paracentesis', mL: 5100 } },
  wait: 14, after: 28,
  then: [{ name: 'Diuretics', params: { diuretics: true } }, { name: 'Diuretics + TIPS', params: { diuretics: true, tips: { on: true } } }],
  words: { event: 'Tap', before: 'Tense belly', start: 'Treatment starts', rise: 'Refills', axis: 'Weeks after the tap', label: 'Ascites, liters', title: 'Ascites after the tap', short: 'After the tap' },
};

export const ASCITES = {
  id: 'ascites', level: 'advanced', title: 'Ascites: why it forms and how it is treated', minutes: 18,
  summary: 'How ascites forms in the sinusoids, what the tap shows, and what each treatment does: paracentesis with albumin, diuretics and TIPS.',
  sections: [['Where ascites forms', ['Ascites']], ['Tapping the fluid', ['Tapping the fluid', 'Protein-rich ascites', 'Telling them apart']], ['Treating it', ['Tense ascites', 'Large-volume paracentesis', 'Two weeks later', 'Treatment', 'Refractory ascites', 'Complications', 'Summary']]],
  objectives: [
    'Explain how sinusoidal pressure and lymph make ascites',
    'Interpret the SAAG and ascitic protein, and tell cirrhosis from heart failure and Budd–Chiari by the tap',
    'Give albumin correctly after a large-volume paracentesis',
    'Use diuretics and TIPS for ascites that keeps coming back, and define refractory ascites',
  ],
  checks: [
    ['What SAAG points to portal hypertension?', '≥1.1 g/dL.'],
    ['A high SAAG with ascitic protein of ≥2.5 g/dL. Where is the problem?', 'Post-hepatic or cardiac: Budd–Chiari syndrome or heart failure. The sinusoid wall is still open and lets protein through.'],
    ['How much albumin goes with a large-volume paracentesis?', '6 to 8 g for each liter removed, when >5 liters come out.'],
    ['When is ascites called refractory?', 'It returns within 4 weeks of a tap despite the highest diuretic doses and a low-salt diet, or diuretics cannot be given because of kidney injury, low sodium or high potassium.'],
    ['Ten days after a 6 L tap with albumin, the belly is full again on full-dose diuretics. What has not changed?', 'The portal pressure: the tap removes the fluid, not its cause. Ascites that returns on full diuretics is refractory, and TIPS is the next step to consider.'],
  ],
  slides: [
    {
      id: 'start', terms: { 'space of Disse': 'sinusoid:disse', lymphatics: 'sinusoid:lymph' }, glow: ['sinusoid:lumen'], preset: 'csph', cam: 'sinusoid', scales: { lobule: { glow: ['lobule:sinusoid'] }, anatomy: { cam: 'fit' } }, tool: FLUID, data: 'tiles', tiles: ['sin', 'asc'], key: ['sin'],
      kicker: 'Ascites', site: 'sin', title: 'Ascites starts in the sinusoids',
      vignette: 'A 55-year-old woman with MASH cirrhosis comes for a routine visit. She feels well and has no ascites. Her platelets are 90,000/µL, and EGD shows small esophageal varices.',
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
      id: 'fill', cutouts: ['lobule', 'sinusoid'], days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 9 }, cam: 'fit', scales: { lobule: { glow: ['lobule:sinusoid'] }, sinusoid: {} }, glow: ['liver'], mark: { organ: 'ascites', label: 'Ascites {asc}' }, tool: { kind: 'flowtime', clock: 'days', lines: ['sin', 'asc'], keepTiles: true, title: 'Sinusoids and ascites over two months' }, data: 'tiles', tiles: ['sin', 'asc'], key: ['asc'], delta: 'start',
      kicker: 'Ascites', site: 'sin', title: 'Ascites builds over two months',
      line: 'As fibrosis advances, sinusoidal pressure rises and lymph outruns the lymphatics. The fluid spills into the peritoneum, and the kidneys, retaining sodium and water, keep replacing it.',
      notes: 'The model builds the fluid from pressure and albumin; it does not model the kidneys. The time-lapse runs the model\'s disease clock: cirrhosis advances and serum albumin falls from 4.0 to 2.8 g/dL over 60 days, without diuretics. The sinusoids climb from about 17 to 25 mmHg, hepatic lymph overflows and the ascites reaches several liters. The chart in the card follows the sinusoidal pressure and the ascites day by day; the next slide shows where the fluid goes. In patients, splanchnic vasodilation lowers the effective blood volume, and the kidneys retain sodium and water through renin–angiotensin–aldosterone, the sympathetic system and vasopressin. High sinusoidal pressure puts the fluid in the peritoneum; renal sodium and water retention keep replacing it. Treatment: less salt, spironolactone with furosemide, large-volume paracentesis with albumin, TIPS.',
      ask: ['Which hormone system drives sodium retention in cirrhotic ascites, and which drug blocks it?', 'Renin–angiotensin–aldosterone; spironolactone.'],
    },
    {
      // (The fluid balance moved here from the time-lapse slide before it: that slide's instrument card is now its chart, 12 Nov 2026. Same state, nothing runs.)
      id: 'balance', glow: ['liver'], cam: 'fit', tool: FLUID, data: 'tiles', tiles: ['sin', 'asc'], key: ['asc'], delta: 'start',
      kicker: 'Ascites', site: 'sin', title: 'The fluid the lymphatics cannot carry stays in the belly',
      line: 'After two months the liver makes more lymph than the lymphatics can carry. What leaks past them, less what the belly takes back, adds to the ascites every day.',
      notes: 'The same patient as the slide before, held at two months. The card splits the lymph made (liver and gut) into what the lymphatics carry, up to their capacity, and what leaks past them. The belly takes some of that leak back, and the difference, in amber, is the ascites that builds each day. The strip below it shows the Starling forces across the sinusoid wall: the pressure pushing fluid out against the pull of the protein. These are the model\'s own terms.',
      ask: ['Why does ascites keep building when the belly takes some of the fluid back?', 'The leak past the lymphatics is larger than what the belly reabsorbs, so the difference stays behind each day.'],
    },
    {
      id: 'saag', preset: 'csph', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['saag', 'tp'], key: ['saag'],
      kicker: 'Tapping the fluid', site: 'sin', title: 'Serum–ascites albumin gradient',
      eq: [mi('SAAG') + mo('=') + sub(mi('Albumin'), 'serum') + mo('−') + sub(mi('Albumin'), 'ascites')],
      line: 'Tapped, the SAAG is {saag}. A value ≥1.1 g/dL means portal hypertension is the cause.',
      notes: 'Source: AASLD 2021 ascites guidance. The first tap is diagnostic (30 to 60 mL from the left lower quadrant, no need to correct the INR or platelets), and so is every admission with ascites. The serum–ascites albumin gradient uses serum and ascites taken the same day. A SAAG of 1.1 g/dL or more identifies portal hypertension as the cause with about 97% accuracy, whatever causes the portal hypertension. Below 1.1, the fluid comes from a leaky peritoneum or a very low serum albumin: cancer, tuberculosis, pancreatitis, nephrotic syndrome. Send a cell count as well (more than 250 neutrophils per mm³ is spontaneous bacterial peritonitis), the total protein, and a culture in blood-culture bottles at the bedside. Cirrhotic ascites is protein-poor, with a total protein below 2.5 g/dL, because fibrosis closes the sinusoid\'s fenestrae and lays down a basement membrane (capillarization). A protein below 1.5 g/dL means weak opsonic activity and a higher risk of spontaneous bacterial peritonitis, so prophylactic antibiotics are considered.',
      ask: ['The SAAG is 0.8 g/dL. Is portal hypertension the cause?', 'No: a SAAG <1.1 means portal pressure is not pushing the fluid out. Look for peritoneal disease or a very low serum albumin.'],
    },
    {
      // (Why the tap's protein tells them apart: the gut capillary wall keeps protein in, an open sinusoid lets it out. The next two slides are the cases.)
      id: 'walls', visual: 'walls',
      kicker: 'Protein-rich ascites', title: 'Open sinusoid pores let protein into the ascites',
      line: 'A gut capillary wall holds protein back. A congested sinusoid has open pores, so heart failure and Budd–Chiari ascites carry protein. Fibrosis closes those pores in cirrhosis.',
      notes: 'The wall of a gut capillary is continuous and sits on a basement membrane, so plasma protein stays in the vessel and the fluid that leaks out is protein-poor. The healthy liver sinusoid has open pores (fenestrae) and no basement membrane, so protein crosses freely into the space of Disse and the lymph is nearly as rich in protein as plasma. In cirrhosis the sinusoid is capillarized: the pores close and a basement membrane forms, so the lymph and the ascites become protein-poor. In heart failure and early Budd–Chiari syndrome the sinusoids are congested but not yet scarred, so the pores stay open and the ascites is protein-rich.',
      ask: ['Why is ascites in heart failure rich in protein when ascites in cirrhosis is not?', 'The congested sinusoid still has open pores that let protein through; in cirrhosis fibrosis has closed them and laid down a basement membrane.'],
    },
    {
      id: 'hf', terms: { lymph: 'sinusoid:lymph', sinusoid: 'sinusoid:lumen' }, preset: 'rhf', cam: 'sinusoid', data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'cardiac', title: 'High protein in heart failure',
      vignette: 'A 74-year-old man with ischemic cardiomyopathy and severe TR has a swollen abdomen and leg edema. His JVP is raised to the earlobes, and his liver tests are only mildly abnormal.',
      line: 'The sinusoid wall is still open. Congestion drives protein-rich lymph through it: SAAG {saag}, >1.1, and protein {tp}, >2.5.',
      notes: 'In heart failure and constrictive pericarditis the sinusoids are congested but not scarred: the fenestrae stay open, so the lymph is nearly as rich in protein as plasma. The ascites has a high SAAG (portal hypertension of cardiac origin) and a total protein of 2.5 g/dL or more. A raised jugular venous pressure and a high BNP point to the heart.',
      ask: ['Ascites with a SAAG of 1.5 and protein of 3.8 g/dL. What do you examine next?', 'The heart: the jugular venous pressure, an echocardiogram, BNP.'],
    },
    {
      id: 'bc', terms: ['hv', 'sin'], preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true }, tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'post', title: 'High protein in Budd–Chiari syndrome',
      vignette: 'A 26-year-old woman, 3 months postpartum, has had RUQ pain for 2 months and now has tense ascites. Her liver is large and tender.',
      line: 'Resistance in the hepatic veins congests a liver that is not yet scarred. Its sinusoids are still open, so the SAAG is high and protein is ≥2.5 g/dL.',
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
      id: 'tense', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', terms: { 'renal veins': 'lrv' }, tool: BELLY, data: 'tiles', tiles: ['asc', 'rpp'], key: ['asc'],
      kicker: 'Tense ascites', site: 'sin', title: 'Grade 3 ascites presses on the kidneys',
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. His abdomen is now tense, and he is short of breath lying flat. His albumin is 2.4 g/dL.',
      line: 'Tense ascites raises the pressure inside the abdomen, which presses on the renal veins and the kidneys.',
      notes: 'Decompensated cirrhosis without diuretics for four months, the serum albumin falling; about 5 L of fluid fills the abdomen. Tense ascites raises intra-abdominal pressure, which lowers kidney perfusion, splints the diaphragm and adds to the pressure on the varices. Breathlessness, early satiety and an umbilical hernia are common. Grade 3 is treated first with large-volume paracentesis.',
      ask: ['Name two effects of tense ascites outside the abdomen.', 'Breathlessness from a splinted diaphragm, and lower kidney perfusion.'],
    },
    {
      id: 'lvp', action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 }, cam: 'fit', tool: BELLY,
      // (A third tile, where the slide's point needs it: the albumin given with the tap.)
      data: 'tiles', tiles: ['asc', 'pv', 'salb'], key: ['salb'], delta: 'tense',
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'A large-volume tap comes with albumin',
      line: 'The tap drains the whole 5 L, and the portal pressure falls a little. After >5 liters, give {6 to 8 g} of albumin for each liter removed.',
      notes: 'The model has no kidneys or renin: albumin here raises the serum albumin and the plasma oncotic pressure, and the fluid comes back more slowly on "Ascites returns in two weeks". The model shows only the albumin: the serum albumin tile rises from 2.4 g/dL. It has no renin, sodium or kidney value, which is where post-paracentesis circulatory dysfunction shows, and in patients the pulse and blood pressure barely move, so there is no button to compare with and without albumin. For this tap of just over 5 L, about 30 to 40 g of 20% albumin, given during or after the tap; it prevents post-paracentesis circulatory dysfunction better than saline or synthetic colloids. Under 5 L, albumin is optional. Large-volume paracentesis removes all the fluid in one go, safely, in a few hours. Taking off the intra-abdominal pressure lowers the portal and variceal pressure a little. After more than 5 L, splanchnic vessels dilate further and the effective blood volume falls over the next days: post-paracentesis circulatory dysfunction, with renin rising, hyponatremia, kidney injury and faster return of the ascites.',
      ask: ['Why give albumin rather than saline after a 5 L tap, and how much?', 'It prevents post-paracentesis circulatory dysfunction better: less kidney injury, less hyponatremia, slower return. About 30 to 40 g, 6 to 8 g for each liter.'],
    },
    {
      id: 'back', days: 14, lapse: { seconds: 7 }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over two weeks' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: 'tense',
      kicker: 'Two weeks later', site: 'sin', title: 'Ascites returns in two weeks',
      line: 'Sinusoidal pressure and the kidneys\' sodium retention have not changed, so without diuretics the fluid refills the abdomen to {asc}.',
      notes: 'The liver and gut still make more lymph than the lymphatics carry. The sinusoidal pressure and the kidneys\' sodium retention are unchanged, so lymph keeps weeping from the liver. Here he has had no diuretics at all.',
      ask: ['The fluid is back two weeks after the tap. Is this refractory ascites?', 'No: he has had no diuretics. Refractory means it returns within four weeks despite the highest diuretic doses and salt restriction, or diuretics cannot be taken.'],
    },
    {
      id: 'diuretics', params: { diuretics: true }, days: 28, cam: 'fit', tool: FLUID,
      compare: [{ label: 'No diuretics', params: { diuretics: false } }, { label: 'Diuretics', own: true, params: { diuretics: true } }],
      kicker: 'Treatment', site: 'sin', title: 'Diuretics counter the kidneys\' sodium retention',
      line: 'Spironolactone with furosemide, and less salt. The kidneys lose sodium and water follows, so more fluid is reabsorbed from the abdomen and the ascites settles at {asc}.',
      notes: 'The model has no kidneys, so here diuretics simply raise how much fluid the abdomen reabsorbs. Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites; outside the US, EASL starts a first episode on spironolactone alone and adds furosemide if weight loss is slow or the potassium rises. Both rise in a 100:40 ratio to 400 and 160 mg. About 2 g of sodium (5 g of salt) a day; no fluid restriction unless the sodium is below 125. Aim for a weight loss of up to 0.5 kg a day without leg edema, 1 kg with it. Stop or reduce for kidney injury, a sodium below 125, encephalopathy or muscle cramps. Diuretics also concentrate the ascites, so its protein rises.',
      ask: ['Starting doses of spironolactone and furosemide?', 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites (outside the US, EASL starts a first episode on spironolactone alone); both rise in a 100:40 ratio to 400 and 160 mg.'],
    },
    {
      id: 'refractory', cam: 'fit', data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Refractory ascites', short: 'Refractory', ticks: false, lead: 'Either one makes it refractory.', rows: ['Back **within 4 weeks** on **top diuretic doses** and a **low-salt diet**', 'Or **diuretics cannot be given** (kidney injury, sodium, potassium)'] },
      kicker: 'Refractory ascites', site: 'sin', title: 'Refractory ascites, defined',
      line: 'Refractory ascites returns within 4 weeks of a tap despite the highest diuretic doses, or diuretics cannot be given. Here he settles at {asc}, so he is not refractory.',
      notes: 'Sources: the International Ascites Club definition of refractory ascites, which EASL and AASLD use; Baveno VIII 6.3 and 6.4 for the TIPS. Refractory ascites returns within 4 weeks of a tap despite the highest diuretic doses and a low-salt diet, or diuretics cannot be given. Patients with recurrent or refractory ascites should be considered for a TIPS, and the TIPS and a liver transplant discussed together. Refractory means the highest diuretic doses (spironolactone 400 mg and furosemide 160 mg a day) and about 2 g of sodium a day fail to keep the fluid away, or diuretics have to stop for kidney injury, a sodium below 125, high potassium or encephalopathy. Baveno VIII names refractory ascites without defining it, so the definition here is the International Ascites Club\'s.',
      ask: ['Fluid back three weeks after a tap, on spironolactone 400 mg and furosemide 160 mg. What is the label, and what do you consider?', 'Refractory ascites. Consider a TIPS and discuss transplantation, if there is no recurrent encephalopathy, heart failure or severe pulmonary hypertension.'],
    },
    {
      // (The Baveno VIII chart for recurrent or refractory ascites, lit for the patient who could have a TIPS. The figure stays as on the slide before.)
      id: 'path-asc', cam: 'fit',
      tool: { kind: 'path', of: 'ascites', short: 'Ascites path', patient: { tips: true, lt: true } },
      kicker: 'Refractory ascites', site: 'sin', title: 'If he were refractory, the chart would send him to a TIPS',
      line: 'For recurrent or refractory ascites the chart starts with a TIPS, and a transplant is discussed alongside. The other branches are for a patient who cannot have one.',
      notes: 'This is the Baveno VIII approach to recurrent or refractory ascites (statements 6.3 to 6.11), lit for the patient on the slide. Patients with recurrent or refractory ascites should be considered for a TIPS (6.3), and the TIPS and a liver transplant discussed together (6.4). Renal function is assessed and chronic kidney disease staged by eGFR first (6.9). To limit overshunting, with encephalopathy and heart failure, the stent may be dilated only to the smallest diameter that gives an adequate response (6.5), and dilated stepwise if the ascites does not improve (6.6). If a TIPS is not possible, or is not enough, long-term albumin may be considered (6.10). A patient who is a transplant candidate goes on to the transplant discussion; one who is not, and who cannot have a TIPS, may have a home drainage device, a tunneled peritoneal catheter or a low-flow pump, in place of repeated large-volume paracentesis (6.11). Here a TIPS is possible and he is a transplant candidate, so the lit path ends at the TIPS. The model has no transplant list and no drainage device, so only the TIPS is shown on the figure, on a later slide.',
      ask: ['A patient with refractory ascites cannot have a TIPS and is not a transplant candidate. What does the chart offer?', 'Long-term albumin, and a home drainage device (a tunneled peritoneal catheter or a low-flow pump) instead of repeated large-volume paracentesis.'],
    },
    {
      // (The complications the model cannot show, because it has no kidneys, no infection and no sodium: one criteria card with the first step of each.)
      id: 'complications', cam: 'fit', data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], cite: 'Baveno VIII 5.9, 6.18, 6.19, 6.21, 6.22, 6.24',
      tool: { kind: 'criteria', title: 'Complications of ascites', short: 'Complications', ticks: false, lead: 'Each has its own first step.',
        rows: ['**SBP**: tap every admission; antibiotics, albumin, then **prophylaxis**', '**HRS-AKI**: **terlipressin** infusion with albumin (6.18, 6.19)',
          '**Hyponatremia**: sodium is watched, most of all on terlipressin (5.9)', '**Hepatic hydrothorax**: treat as ascites; a TIPS if refractory'] },
      kicker: 'Complications', site: 'sin', title: 'Every patient with ascites is watched for four complications',
      line: 'Tap every admission for SBP. Kidney injury in ascites calls for terlipressin with albumin. The model has no kidneys, infection or sodium, so this card lists them instead.',
      notes: 'Spontaneous bacterial peritonitis: a diagnostic paracentesis in every patient admitted with decompensation, to rule out infection (Baveno VIII Table 3); antibiotics are started promptly and short-term albumin is given in SBP, in AKI above stage 1A and after large-volume paracentesis (Table 3). The ascitic cell count and the albumin doses come from the AASLD ascites guidance, which is not yet in the guidelines folder, so no number is given here. Hepatorenal syndrome with acute kidney injury (HRS-AKI): its diagnostic criteria are likewise not in the folder, so the card gives the treatment only; terlipressin with albumin is the treatment (Baveno VIII 6.18), preferably as a continuous infusion starting at 2 to 3 mg in 24 hours, which causes fewer adverse events than boluses (6.19), and norepinephrine is the alternative when terlipressin is unavailable, contraindicated or not tolerated (6.20); transplant assessment follows. Serum sodium is monitored on terlipressin because of the risk of hyponatremia (5.9); the thresholds for holding diuretics are not in the folder either. After an episode of SBP, antibiotic prophylaxis should be considered to prevent a recurrence (6.21), and it is stopped if the patient recompensates (6.22). In further decompensation a PPI is withdrawn unless there is a clear indication (6.24). Hepatic hydrothorax, usually right-sided, is treated as ascites, with a TIPS when it is refractory; a chest drain is avoided. Beta-blockers are reduced or stopped when the systolic pressure stays below 90 mmHg or an AKI develops. Any of these is a reason to consider transplant. The model has no kidneys, no infection and no serum sodium, so none of these can be shown on the figure.',
      ask: ['A man with ascites is admitted with confusion. What is the first test?', 'A diagnostic tap, to rule out spontaneous bacterial peritonitis and other infection.'],
    },
    {
      // (Baveno VIII 4.16 to 4.18: a short card about the patient, not the pressure. The figure is the slide before's.)
      id: 'frailty', cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc'], key: ['asc'], cite: 'Baveno VIII 4.16, 4.17, 4.18',
      kicker: 'Complications', site: 'sin', title: 'Frailty, muscle loss and poor nutrition shorten survival with ascites',
      line: 'Frailty, malnutrition and muscle loss shorten survival in decompensated cirrhosis. Every patient gets a nutrition assessment, a plan and advice on regular exercise.',
      notes: 'Baveno VIII 4.16: frailty, malnutrition, sarcopenia and myosteatosis affect survival in patients with decompensated cirrhosis, and they should be assessed with a standardized tool. 4.17: every patient with decompensated cirrhosis gets a structured nutritional assessment, an individual nutrition plan and counseling on regular physical activity. 4.18: when a patient is frail or sarcopenic, add targeted interventions to that counseling, because muscle can improve and outcomes with it; whether they change the course of further decompensation is not yet known. The model has no muscle or diet, so the figure only shows the abdomen.',
      ask: ['A man with ascites has lost muscle and weight. What does Baveno VIII advise?', 'A standardized frailty and nutrition assessment, an individual nutrition plan and exercise counseling, with targeted interventions if he is frail or sarcopenic (4.16 to 4.18).'],
    },
    {
      // (The Baveno VIII rule for carvedilol, from the complications slide: a low pressure or HRS-AKI. The kidney talk has the same chart beside the MAP.)
      // (The systolic of 84 is typed, not read from the model: this man's own pressure is not low, and the case needs a low one with HRS-AKI.)
      id: 'path-hold', cam: 'fit',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: false, sbp: 84, hrs: true } },
      kicker: 'Complications', site: 'sin', title: 'Carvedilol is cut back when the pressure falls or the kidneys fail',
      line: 'Say he takes carvedilol and develops HRS-AKI, with a systolic pressure of {84 mmHg}. The chart says reduce the dose or stop, and restart once both have recovered.',
      notes: 'Baveno VIII 4.6: in decompensated cirrhosis carvedilol, or another non-selective beta-blocker, should be dose-reduced or discontinued when the blood pressure stays low (systolic below 90 mmHg or mean arterial pressure below 65 mmHg) and/or there is HRS-AKI. 4.7: it should be restarted and re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered. The chart is lit for a man on carvedilol with an AKI and a systolic pressure of 84 mmHg, which is under 90, so the path ends at reduce or stop. Either problem is enough. A patient whose carvedilol is already held and who still has either one stays off it. The model has no kidneys and no systolic pressure, so the patient is typed, not read from the figure; the Kidney in cirrhosis talk shows the mean arterial pressure and the kidney pressure that carvedilol and a bleed move.',
      ask: ['A man with ascites on carvedilol develops HRS-AKI. What do you do with the carvedilol, and when does it restart?', 'Reduce the dose or stop it. Restart and re-titrate once the HRS-AKI has resolved and the pressure has recovered.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, days: 28, lapse: { seconds: 7 }, cam: 'liver', tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over four weeks' }, mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['asc', 'pv', 'he'], key: ['asc', 'he'], delta: 'tense', cite: 'Baveno VIII 6.3, 6.5, 6.16; Bureau, Gastroenterology 2017',
      kicker: 'Refractory ascites', site: 'sin', title: 'TIPS for refractory ascites',
      line: 'A TIPS lowers the gradient to {ppg} and the sinusoidal pressure with it, and the ascites clears over weeks. The price is encephalopathy, so rifaximin is considered beforehand.',
      notes: 'Less lymph forms, and in exchange the liver gets less portal blood. In recurrent or refractory ascites, a covered TIPS improves survival over repeated paracentesis in selected patients (Baveno VIII 6.3). In Bureau\'s trial (Gastroenterology 2017, 62 patients with recurrent ascites), one-year transplant-free survival was 93% with a covered TIPS and 52% with paracentesis and albumin, with a stent dilated only as far as it needs to be (6.5). The usual exclusions are recurrent encephalopathy, heart failure, pulmonary hypertension and advanced liver failure. Before the stent the history of overt encephalopathy and the medicines for it are reviewed (6.14), a prior episode is not an absolute contraindication (6.15), and rifaximin should be considered to prevent encephalopathy (6.16, strong). The ascites clears over weeks to months, diuretics continued at first. The model clears it faster. No target gradient is agreed for ascites; below 12 mmHg is the bleeding target.',
      ask: ['Name a reason not to place a TIPS for ascites.', 'Recurrent encephalopathy, heart failure or pulmonary hypertension, or advanced liver failure.'],
    },
    {
      // (The relation chart before the summary: the model's scarring from 0.45 to 0.85, the albumin falling with it as on the two-month
      // time-lapse (4.0 g/dL at 0.6, 2.8 at 0.85), each point settled for a year, the ascites read against the HVPG.
      // The dots are this talk's own patient, joined in order by arrows; no ring (the slide has no state of its own: he after the TIPS is the last dot).
      // One line, the ascites: the blood volume and its second axis made the chart too busy to read, so it stays in the notes only. The axis runs on to
      // 22 so the names of the dots at 16.8 have room on their right, and the grades' numbers (1.5 and 5) are the axis.)
      id: 'relation', cam: 'fit',
      tool: COURSE,
      kicker: 'Summary', site: 'sin', title: 'The fluid comes back after the tap unless it is treated',
      line: 'The tap empties the belly, but the fluid is back at {asc@back} by week 2. Diuretics bring it down to {asc@diuretics} by week 6, and adding a TIPS clears it.',
      notes: 'The chart follows the model\'s own patient day by day. Day 0 is the tap: 5 L out with albumin, from the tense belly he had after four months without diuretics. The gray line is the two weeks with nothing done: the fluid fills again because the pressure that makes it, and the kidneys\' hold on salt and water, are unchanged. From week 2 each treatment starts from that same day: diuretics alone, and diuretics with a TIPS. The zones are the app\'s own grades (its data card uses them too): grade 1 ≥0.15 L, grade 2 ≥1.5 L, grade 3 ≥5 L; at the bedside the grade comes from the examination, not from the volume. The timing is the model\'s, not a patient\'s, so no speed here is a promise; the model has no kidneys, and the chart shows the order of events and the size of each effect. One model patient; real patients vary far more.',
      ask: ['The tap emptied his belly, yet the fluid is back in two weeks. What did the tap leave unchanged?', 'The pressure that makes the fluid. Diuretics clear what has formed; a TIPS lowers the pressure itself, and the fluid stays away.'],
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
