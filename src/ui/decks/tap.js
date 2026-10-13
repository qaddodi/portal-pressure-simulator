// Presenter talk: ascites at the bedside, the tap and the albumin (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const TAP = {
  id: 'tap', level: 'advanced', title: 'Paracentesis, albumin and refractory ascites', minutes: 12,
  sections: [['Ascites', ['Ascites']], ['The tap', ['The diagnostic tap', 'Large-volume paracentesis', 'Two weeks later']], ['Treatment', ['Treatment', 'Refractory ascites']], ['Protein-rich fluid', ['Protein-rich fluid']]],
  objectives: [
    'List what to send from a diagnostic tap and how to read the SAAG',
    'Give albumin correctly after a large-volume paracentesis',
    'Use diuretics and TIPS for ascites that keeps coming back',
    'Recognize protein-rich ascites that points to the heart',
  ],
  summary: 'One patient with tense ascites: the diagnostic tap, large-volume paracentesis with albumin, diuretics and TIPS, with the effect of each on the fluid and the pressures.',
  slides: [
    {
      id: 'tense', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', terms: { 'renal veins': 'lrv' }, tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'],
      kicker: 'Ascites', site: 'sin', title: 'Grade 3 ascites',
      line: 'Tense ascites raises the pressure inside the abdomen, which presses on the renal veins and the kidneys.',
      notes: 'Decompensated cirrhosis without diuretics for four months, the serum albumin falling. Tense ascites raises intra-abdominal pressure, which lowers kidney perfusion, splints the diaphragm and adds to the pressure on the varices. Breathlessness, early satiety and an umbilical hernia are common. Grade 3 is treated first with large-volume paracentesis.',
      ask: ['Name two effects of tense ascites outside the abdomen.', 'Breathlessness from a splinted diaphragm, and lower kidney perfusion.'],
    },
    {
      id: 'first', cam: 'fit', data: 'tiles', tiles: ['saag', 'tp'], key: ['saag'],
      kicker: 'The diagnostic tap', site: 'sin', title: 'The first tap is diagnostic',
      eq: [mi('SAAG') + mo('=') + sub(mi('Albumin'), 'serum') + mo('−') + sub(mi('Albumin'), 'ascites')],
      line: 'New ascites, and every admission with ascites, is tapped: cell count, albumin, protein and culture.',
      notes: 'A diagnostic tap of 30 to 60 mL, from the left lower quadrant, with no need to correct the INR or platelets. Neutrophils over 250 per mm³ is spontaneous bacterial peritonitis, treated at once. SAAG 1.1 g/dL or more means portal hypertension. Protein below 1.5 g/dL marks a higher risk of SBP. Culture goes into blood-culture bottles at the bedside.',
      ask: ['Ascitic neutrophils 400 per mm³. What next?', 'Spontaneous bacterial peritonitis: antibiotics now, and albumin. Suspect secondary peritonitis if several organisms grow, or the protein is high and the glucose low.'],
    },
    {
      id: 'lvp', action: { kind: 'paracentesis', mL: 8000 }, params: {}, cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: true,
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'Large-volume paracentesis',
      line: 'The abdomen softens to {asc} and the portal pressure falls a little. Over the next days, the arterial pressure can fall too.',
      notes: 'Large-volume paracentesis removes all the fluid in one go, safely, in a few hours. Taking off the intra-abdominal pressure lowers the portal and variceal pressure a little. After more than 5 L, splanchnic vessels dilate further and the effective blood volume falls over the next days: post-paracentesis circulatory dysfunction, with renin rising, hyponatremia, kidney injury and faster return of the ascites.',
      ask: ['What is post-paracentesis circulatory dysfunction?', 'A fall in effective blood volume after a large tap, with kidney injury, hyponatremia and quick re-accumulation.'],
    },
    {
      id: 'albumin', params: { albumin: 2.74 }, cam: 'fit', data: 'tiles', tiles: ['salb', 'map'], key: ['salb'], delta: true,
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'Albumin with the tap',
      line: '{6 to 8 g} of albumin for each liter removed, when more than 5 liters come out. It fills the circulation, protects the kidneys and slows the fluid\'s return.',
      caveat: 'The model has no kidneys or renin, so albumin here just raises the serum albumin.',
      notes: 'For a 6 L tap, about 40 g of 20% albumin, given during or after the tap. Albumin prevents post-paracentesis circulatory dysfunction better than saline or synthetic colloids. Under 5 L, albumin is optional. The model has no kidneys or renin: here albumin raises the serum albumin and the plasma oncotic pressure, and the fluid comes back more slowly on "Ascites returns in two weeks".',
      ask: ['Why give albumin rather than saline after an 8 L tap, and how much?', 'It prevents post-paracentesis circulatory dysfunction better: less kidney injury, less hyponatremia, slower return. About 50 to 65 g, 6 to 8 g for each liter.'],
    },
    {
      id: 'back', days: 14, cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: true,
      kicker: 'Two weeks later', site: 'sin', title: 'Ascites returns in two weeks',
      line: 'Sinusoidal pressure and renal sodium retention have not changed, so lymph keeps leaking from the liver. Without diuretics, the abdomen holds {asc} again.',
      notes: 'The sinusoidal pressure and the kidneys\' sodium retention are unchanged, so lymph keeps weeping from the liver. Here she has had no diuretics at all.',
      ask: ['The fluid is back two weeks after the tap. Is this refractory ascites?', 'No: she has had no diuretics. Refractory means it returns within four weeks despite the highest diuretic doses and salt restriction, or diuretics cannot be taken.'],
    },
    {
      id: 'diuretics', params: { diuretics: true }, days: 28, cam: 'fit', tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: true,
      kicker: 'Treatment', site: 'sin', title: 'Diuretics counter the kidneys\' sodium retention',
      line: 'Spironolactone with furosemide, and less salt. The kidneys lose sodium, and water follows: the abdomen is down to {asc}.',
      notes: 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites; EASL starts a first episode on spironolactone alone and adds furosemide if weight loss is slow or the potassium rises. Both rise in a 100:40 ratio to 400 and 160 mg. About 2 g of sodium (5 g of salt) a day; no fluid restriction unless the sodium is below 125. Aim for a weight loss of up to 0.5 kg a day without leg edema, 1 kg with it. Stop or reduce for kidney injury, a sodium below 125, encephalopathy or muscle cramps. Diuretics also concentrate the ascites, so its protein rises.',
      ask: ['Starting doses of spironolactone and furosemide?', 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites (EASL starts a first episode on spironolactone alone); both rise in a 100:40 ratio to 400 and 160 mg.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, days: 28, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['asc', 'ppg', 'liver'], key: ['asc'], delta: true,
      kicker: 'Refractory ascites', site: 'sin', title: 'TIPS for refractory ascites',
      line: 'A TIPS lowers the gradient to {ppg}, and the sinusoidal pressure with it, so less lymph forms and the fluid falls to {asc}. In exchange the liver gets less portal blood, and about one in three patients develops encephalopathy.',
      notes: 'In recurrent or refractory ascites, a covered TIPS improves survival over repeated paracentesis in selected patients: bilirubin under about 3 mg/dL, no recurrent encephalopathy, no heart failure or severe pulmonary hypertension. The ascites clears over weeks to months, diuretics continued at first. The model clears it faster. No target gradient is agreed for ascites; below 12 mmHg is the bleeding target. Refractory ascites returns within four weeks of a tap despite the highest diuretic doses and a salt restriction, or needs diuretics the patient cannot take.',
      ask: ['Name a reason not to place a TIPS for ascites.', 'Recurrent encephalopathy, heart failure or pulmonary hypertension, or advanced liver failure.'],
    },
    {
      id: 'heart', terms: ['sinusoid:lumen'], preset: 'rhf', cam: 'sinusoid', data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'],
      kicker: 'Protein-rich fluid', site: 'cardiac', title: 'High-protein ascites: check the heart',
      line: 'SAAG {saag}, 1.1 g/dL or more, with protein {tp}, 2.5 g/dL or more. Protein this high means the sinusoid wall is still open, not capillarized.',
      notes: 'Congestion without scarring gives a high-SAAG, high-protein fluid: heart failure, constrictive pericarditis, early Budd–Chiari syndrome. A raised jugular venous pressure and a high BNP point to the heart; a normal one to the hepatic veins (Doppler). Here the treatment is the heart, not TIPS. The ascites talk covers the four patterns of SAAG and protein.',
      ask: ['SAAG 1.5 g/dL and protein 4 g/dL. What do you examine next?', 'The heart: the jugular venous pressure, BNP and an echocardiogram.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['asc', 'ppg', 'liver'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'tense', kicker: 'Baseline', title: 'Tense ascites' }, { id: 'lvp', kicker: 'Tap', title: 'Paracentesis' }, { id: 'albumin', kicker: 'Tap', title: 'With albumin' }, { id: 'back', kicker: 'No treatment', title: 'Two weeks on' }, { id: 'diuretics', kicker: 'Drugs', title: 'Diuretics, 4 weeks' }, { id: 'tips', kicker: 'Shunt', title: 'TIPS, 4 weeks' }],
      kicker: 'Summary', title: 'What each ascites treatment does',
      line: 'The tap empties the abdomen, but only diuretics or TIPS keep the fluid from returning.',
      notes: 'The tap clears the fluid at once but leaves its cause; albumin protects the circulation; diuretics clear it more slowly and keep it away; TIPS clears it by lowering the sinusoidal pressure, at the cost of the liver\'s portal blood. Each patient with refractory ascites is also assessed for transplantation. Avoid NSAIDs, and ACE inhibitors and ARBs, in ascites; long-term albumin is used in some centers for decompensated cirrhosis.',
      ask: ['Which step acts on the mechanism rather than only the fluid?', 'TIPS lowers the sinusoidal pressure and diuretics counter the sodium retention; the tap does neither. Only treating the liver disease removes the cause.'],
    },
  ],
};
