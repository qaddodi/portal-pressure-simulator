// Presenter talk: ascites at the bedside, the tap and the albumin (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const TAP = {
  id: 'tap', level: 'advanced', title: 'Paracentesis, albumin and refractory ascites', minutes: 12,
  sections: [['Ascites', ['Ascites']], ['The tap', ['The diagnostic tap', 'Large-volume paracentesis', 'Two weeks later']], ['Treatment', ['Treatment', 'Refractory ascites']]],
  objectives: [
    'List what to send from a diagnostic tap and how to read the SAAG',
    'Give albumin correctly after a large-volume paracentesis',
    'Use diuretics and TIPS for ascites that keeps coming back',
    'Define refractory ascites and when a TIPS is considered',
  ],
  checks: [
    ['How much albumin goes with a large-volume paracentesis?', '6 to 8 g for each liter removed, when more than 5 liters come out.'],
    ['Why does ascites come back after a tap alone?', 'Sinusoidal pressure and the kidneys\' sodium retention are unchanged. Diuretics or a TIPS keep it away.'],
    ['When is ascites called refractory?', 'It returns within 4 weeks of a tap despite the highest diuretic doses and a low-salt diet, or diuretics cannot be given because of kidney injury, low sodium or high potassium.'],
    ['Ten days after a 6 L tap with albumin, the belly is full again on full-dose diuretics. What has not changed?', 'The portal pressure: the tap removes the fluid, not its cause. Ascites that returns on full diuretics is refractory, and TIPS is the next step to consider.'],
  ],
  summary: 'One patient with tense ascites: the diagnostic tap, large-volume paracentesis with albumin, diuretics and TIPS, with the effect of each on the fluid and the pressures.',
  slides: [
    {
      id: 'tense', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', terms: { 'renal veins': 'lrv' }, tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'],
      kicker: 'Ascites', site: 'sin', title: 'Grade 3 ascites',
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. His abdomen is now tense, and he is short of breath lying flat. His albumin is 2.4 g/dL.',
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
      id: 'back', days: 14, lapse: { seconds: 7 }, cam: 'fit', tool: { kind: 'fluid', window: true }, data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: true,
      kicker: 'Two weeks later', site: 'sin', title: 'Ascites returns in two weeks',
      line: 'Sinusoidal pressure and renal sodium retention have not changed, so the liver and gut still make more lymph than the lymphatics carry. Without diuretics, the fluid that leaks refills the abdomen to {asc}.',
      notes: 'The sinusoidal pressure and the kidneys\' sodium retention are unchanged, so lymph keeps weeping from the liver. Here he has had no diuretics at all.',
      ask: ['The fluid is back two weeks after the tap. Is this refractory ascites?', 'No: he has had no diuretics. Refractory means it returns within four weeks despite the highest diuretic doses and salt restriction, or diuretics cannot be taken.'],
    },
    {
      id: 'diuretics', params: { diuretics: true }, days: 28, cam: 'fit', tool: { kind: 'fluid', window: true },
      compare: [{ label: 'No diuretics', params: { diuretics: false } }, { label: 'Diuretics', own: true, params: { diuretics: true } }], data: 'tiles', tiles: ['asc', 'pv'], key: ['asc'], delta: true,
      kicker: 'Treatment', site: 'sin', title: 'Diuretics counter the kidneys\' sodium retention',
      line: 'Spironolactone with furosemide, and less salt. The kidneys lose sodium and water follows, so more fluid is reabsorbed from the abdomen and the ascites settles at {asc}.',
      caveat: 'The model has no kidneys, so here diuretics simply raise how much fluid the abdomen reabsorbs.',
      notes: 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites; outside the US, EASL starts a first episode on spironolactone alone and adds furosemide if weight loss is slow or the potassium rises. Both rise in a 100:40 ratio to 400 and 160 mg. About 2 g of sodium (5 g of salt) a day; no fluid restriction unless the sodium is below 125. Aim for a weight loss of up to 0.5 kg a day without leg edema, 1 kg with it. Stop or reduce for kidney injury, a sodium below 125, encephalopathy or muscle cramps. Diuretics also concentrate the ascites, so its protein rises.',
      ask: ['Starting doses of spironolactone and furosemide?', 'Spironolactone 100 mg a day, with furosemide 40 mg for recurrent ascites (outside the US, EASL starts a first episode on spironolactone alone); both rise in a 100:40 ratio to 400 and 160 mg.'],
    },
    {
      id: 'refractory', cam: 'fit', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Refractory ascites', short: 'Refractory', ticks: false, rows: ['Back within 4 weeks on top diuretic doses and a low-salt diet', 'Or diuretics cannot be given (kidney injury, sodium, potassium)'] },
      cite: 'Baveno VIII 6.3, 6.4',
      kicker: 'Refractory ascites', site: 'sin', title: 'Refractory ascites, defined',
      line: 'Ascites is refractory when it returns within 4 weeks of a tap on the highest diuretic doses and a low-salt diet, or when diuretics cannot be given. Here the diuretics work: it settles at {asc}, so he is not refractory.',
      notes: 'Baveno VIII 6.3 and 6.4: patients with recurrent or refractory ascites should be considered for a TIPS, and the TIPS and a liver transplant discussed together. Refractory means the highest diuretic doses (spironolactone 400 mg and furosemide 160 mg a day) and about 2 g of sodium a day fail to keep the fluid away, or diuretics have to stop for kidney injury, a sodium below 125, high potassium or encephalopathy. The definition is the one used elsewhere in this talk; the Baveno VIII statements name refractory ascites without defining it.',
      ask: ['Fluid back three weeks after a tap, on spironolactone 400 mg and furosemide 160 mg. What is the label, and what do you consider?', 'Refractory ascites. Consider a TIPS and discuss transplantation, if there is no recurrent encephalopathy, heart failure or severe pulmonary hypertension.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, days: 28, lapse: { seconds: 7 }, cam: 'liver', tool: { kind: 'fluid', window: true }, mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['asc', 'ppg', 'liver'], key: ['asc'], delta: true,
      kicker: 'Refractory ascites', site: 'sin', title: 'TIPS for refractory ascites',
      line: 'A TIPS lowers the gradient to {ppg}, and the sinusoidal pressure with it, so less lymph forms and the fluid falls to {asc}. In exchange the liver gets less portal blood, and about one in three patients develops encephalopathy.',
      notes: 'In recurrent or refractory ascites, a covered TIPS improves survival over repeated paracentesis in selected patients: bilirubin under about 3 mg/dL, no recurrent encephalopathy, no heart failure or severe pulmonary hypertension. The ascites clears over weeks to months, diuretics continued at first. The model clears it faster. No target gradient is agreed for ascites; below 12 mmHg is the bleeding target.',
      ask: ['Name a reason not to place a TIPS for ascites.', 'Recurrent encephalopathy, heart failure or pulmonary hypertension, or advanced liver failure.'],
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
