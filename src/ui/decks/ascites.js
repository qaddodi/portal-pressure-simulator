// Presenter talk: ascites: where it comes from and what is in it (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const ASCITES = {
  id: 'ascites', level: 'advanced', title: 'Ascites: where it comes from and what is in it', minutes: 15,
  summary: 'How ascites forms in the sinusoids and why presinusoidal disease rarely causes it. Ends with SAAG and protein.',
  sections: [['Where ascites forms', ['Ascites']], ['Tapping the fluid', ['Tapping the fluid']], ['Blocks before the sinusoids', ['Pre-hepatic block', 'Presinusoidal block', 'Starling forces']], ['Protein-rich ascites', ['Protein-rich ascites']]],
  objectives: ['Explain how sinusoidal pressure and lymph make ascites', 'Interpret the SAAG and ascitic protein', 'Explain why pre-hepatic and presinusoidal blocks rarely cause ascites', 'Tell cirrhosis from heart failure and Budd–Chiari by the tap'],
  slides: [
    {
      id: 'start', terms: { 'space of Disse': 'sinusoid:disse', lymphatics: 'sinusoid:lymph' }, preset: 'csph', cam: 'sinusoid', data: 'tiles', tiles: ['sin', 'asc'], key: ['sin'],
      kicker: 'Ascites', site: 'sin', title: 'Ascites starts in the sinusoids',
      line: 'Sinusoidal pressure drives plasma into the space of Disse. Hepatic lymphatics drain it until their capacity is exceeded.',
      notes: 'Ascites in portal hypertension is mostly lymph. Sinusoidal pressure drives plasma through the open sinusoid wall into the space of Disse, and the hepatic lymphatics return it to the blood through the thoracic duct. Hepatic lymph flow can rise many-fold; once it outruns the lymphatics, lymph weeps from the surface of the liver into the peritoneum. This patient has clinically significant portal hypertension, and the lymphatics still keep up. Ascites seldom forms below an HVPG of about 12 mmHg.',
      ask: ['What carries the sinusoids\' filtrate away before ascites forms?', 'The hepatic lymphatics, to the thoracic duct.'],
    },
    {
      id: 'fill', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 9 }, cam: 'fit', glow: ['liver'], tool: { kind: 'trace' }, data: 'tiles', tiles: ['sin', 'asc', 'tp'], key: ['asc'], delta: true,
      kicker: 'Ascites', site: 'sin', title: 'Ascites builds over two months',
      line: 'As fibrosis advances and serum albumin falls, sinusoidal pressure rises, lymph outruns the lymphatics and fluid collects.',
      notes: 'The time-lapse runs the model\'s disease clock: cirrhosis advances and serum albumin falls from 4.0 to 2.8 g/dL over 60 days, without diuretics. The sinusoids climb from about 17 to 26 mmHg, hepatic lymph overflows and the ascites reaches several liters. In patients, splanchnic vasodilation lowers the effective blood volume, and the kidneys retain sodium and water through renin–angiotensin–aldosterone, the sympathetic system and vasopressin. Portal hypertension decides where the fluid goes; the kidneys keep it coming. Treatment: less salt, spironolactone with furosemide, large-volume paracentesis with albumin, TIPS.',
      ask: ['Which hormone system drives sodium retention in cirrhotic ascites, and which drug blocks it?', 'Renin–angiotensin–aldosterone; spironolactone.'],
    },
    {
      id: 'saag', cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['saag', 'tp'], key: ['saag'],
      kicker: 'Tapping the fluid', site: 'sin', title: 'Serum–ascites albumin gradient',
      eq: [mi('SAAG') + mo('=') + sub(mi('Albumin'), 'serum') + mo('−') + sub(mi('Albumin'), 'ascites')],
      line: 'This patient\'s SAAG is {saag}. A value of {>=1.1 g/dL} or more indicates portal hypertension.',
      notes: 'The serum–ascites albumin gradient uses serum and ascites taken the same day. A SAAG of 1.1 g/dL or more identifies portal hypertension as the cause with about 97% accuracy, whatever causes the portal hypertension. Below 1.1, the fluid comes from a leaky peritoneum or a very low serum albumin: cancer, tuberculosis, pancreatitis, nephrotic syndrome. Send a cell count as well (more than 250 neutrophils per mm³ is spontaneous bacterial peritonitis), the total protein, and a culture in blood-culture bottles.',
      ask: ['The SAAG is 0.8 g/dL. Is portal hypertension the cause?', 'No: below 1.1 the fluid is not pushed out by portal pressure. Look for peritoneal disease or a very low protein state.'],
    },
    {
      id: 'lowprot', terms: { fenestrae: 'sinusoid:fenestrae' }, cam: 'sinusoid', data: 'tiles', tiles: ['tp', 'saag'], key: ['tp'],
      kicker: 'Tapping the fluid', site: 'sin', title: 'Low protein in cirrhosis',
      line: 'Fibrosis closes the fenestrae and lays down a basement membrane (capillarization). Less protein crosses, so the fluid is protein-poor.',
      notes: 'In cirrhosis the sinusoids capillarize: the fenestrae close and a basement membrane and collagen form in the space of Disse. The wall now holds protein back, so the lymph and the ascites are thin, with a total protein below 2.5 g/dL. Diuretics concentrate the fluid and raise its protein somewhat. A protein below 1.5 g/dL means weak opsonic activity and a higher risk of spontaneous bacterial peritonitis, so prophylactic antibiotics are considered.',
      ask: ['Why does an ascites protein below 1.5 g/dL matter?', 'Weak opsonic activity: a higher risk of spontaneous bacterial peritonitis, so prophylaxis is considered.'],
    },
    {
      id: 'pvt', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'tiles', tiles: ['pv', 'sin', 'asc'], key: ['sin'],
      kicker: 'Pre-hepatic block', site: 'pre', title: 'Portal vein thrombosis',
      line: 'Portal pressure is {pv}, but the sinusoids beyond the clot are at {sin}, so little or no ascites forms.',
      notes: 'Pre-hepatic portal hypertension raises the pressure in the gut and spleen, so varices and a large spleen are common, but the sinusoids lie downstream of the clot at normal pressure. The gut\'s capillaries hold their fluid (see "Gut capillaries and sinusoids compared"), and their extra lymph drains away. Ascites is uncommon: it appears briefly in acute thrombosis, after a variceal bleed with fluid loading, or when the serum albumin falls.',
      ask: ['Why does a portal vein clot raise portal pressure but rarely cause ascites?', 'The sinusoids, where ascites starts, lie downstream of the clot at normal pressure.'],
    },
    {
      id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'tiles', tiles: ['pv', 'sin', 'asc'], key: ['sin'],
      kicker: 'Presinusoidal block', site: 'presin', title: 'Schistosomiasis',
      line: 'Obstruction in the portal tracts leaves sinusoidal pressure near normal, so ascites is uncommon despite high portal pressure.',
      notes: 'In presinusoidal disease the scar sits around the portal venules and the sinusoids are spared: their pressure is near normal, liver function is preserved and ascites is rare, while varices bleed. When ascites does appear in schistosomiasis or porto-sinusoidal vascular disorder, it usually follows a bleed, an infection or a falling albumin, or marks advanced or mixed disease.',
      ask: ['Bleeding varices, no ascites and normal liver tests in a patient from an endemic area. Where is the block?', 'Presinusoidal, in the portal tracts: schistosomiasis.'],
    },
    {
      id: 'walls', visual: 'walls',
      kicker: 'Starling forces', title: 'Gut capillaries and sinusoids compared',
      line: 'Gut capillaries retain protein, so oncotic pressure limits filtration when their pressure rises. Sinusoids do not, so ascites depends on sinusoidal pressure.',
      notes: 'Starling: filtration = Kf × [(capillary − tissue pressure) − σ × (plasma − tissue oncotic pressure)]. The gut\'s capillary wall is continuous, with a basement membrane, and turns back most protein (σ about 0.9): the plasma\'s oncotic pressure, about 25 mmHg, holds the fluid in, so a raised capillary pressure makes only a little more fluid, which the lymphatics carry away. In the sinusoid σ is near zero: oncotic pressure offers almost no opposition, and each rise in pressure adds to lymph flow. Capillarization in cirrhosis raises σ part of the way, which is why cirrhotic ascites is thin.',
      ask: ['What does a reflection coefficient (σ) near zero mean for the sinusoid wall?', 'Protein crosses freely, so oncotic pressure cannot hold the fluid back, and any rise in pressure becomes lymph.'],
    },
    {
      id: 'hf', terms: { lymph: 'sinusoid:lymph' }, preset: 'rhf', cam: 'sinusoid', data: 'tiles', tiles: ['tp', 'saag', 'sin'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'cardiac', title: 'High protein in heart failure',
      line: 'The sinusoid wall is still open. Congestion drives protein-rich lymph through it: SAAG {saag}, at least {>=1.1 g/dL}, and protein {tp}, at least {>=2.5 g/dL}.',
      notes: 'In heart failure and constrictive pericarditis the sinusoids are congested but not scarred: the fenestrae stay open, so the lymph is nearly as rich in protein as plasma. The ascites has a high SAAG (portal hypertension of cardiac origin) and a total protein of 2.5 g/dL or more. A raised jugular venous pressure and a high BNP point to the heart.',
      ask: ['Ascites with a SAAG of 1.5 and protein of 3.8 g/dL. What do you examine next?', 'The heart: the jugular venous pressure, an echocardiogram, BNP.'],
    },
    {
      id: 'bc', preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Blocked hepatic veins' }, data: 'tiles', tiles: ['tp', 'saag', 'sin'], key: ['tp'],
      kicker: 'Protein-rich ascites', site: 'post', title: 'High protein in Budd–Chiari syndrome',
      line: 'Blocked hepatic veins congest a liver that is not yet scarred. Its sinusoids are open, so the fluid is protein-rich too.',
      notes: 'Hepatic venous outflow block gives the same high-SAAG, high-protein ascites as heart failure, but with a normal jugular venous pressure. Over months the congested liver can scar and capillarize, and the protein falls toward the cirrhotic range. Ascites with abdominal pain and a large liver, in a patient with a myeloproliferative neoplasm or in pregnancy, calls for a Doppler of the hepatic veins.',
      ask: ['High-SAAG, high-protein ascites and a normal jugular venous pressure. Where do you look?', 'At the hepatic veins and the IVC, for Budd–Chiari syndrome (Doppler ultrasound).'],
    },
    {
      id: 'map', visual: 'quadrant', of: [{ id: 'fill', name: 'Cirrhosis' }, { id: 'hf', name: 'Heart failure' }, { id: 'bc', name: 'Budd–Chiari' }],
      kicker: 'Summary', title: 'Interpreting SAAG and protein',
      line: 'SAAG indicates whether portal hypertension is the cause. Ascitic protein reflects whether the sinusoid wall is capillarized or still permeable.',
      notes: 'Read the SAAG first: 1.1 g/dL or more is portal hypertension. Then the protein: below 2.5 g/dL fits cirrhosis (sealed, capillarized sinusoids); 2.5 or more with a high SAAG fits the heart or early Budd–Chiari (open, congested sinusoids). A low SAAG with high protein means a leaky peritoneum: peritoneal cancer, tuberculosis, pancreatic ascites. A low SAAG with low protein is rare: nephrotic syndrome. Portal vein thrombosis and presinusoidal disease have no point here, because they rarely cause ascites. The points are the model\'s patients.',
      ask: ['SAAG 0.6, protein 4.2 g/dL and weight loss. What is likely, and what next?', 'Peritoneal cancer or tuberculous peritonitis: cytology, adenosine deaminase, peritoneal biopsy.'],
    },
  ],
};
