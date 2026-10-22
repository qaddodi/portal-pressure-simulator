// Presenter talk: secondary prophylaxis after a first esophageal variceal bleed. Banding closes the varix but leaves the
// pressure behind it, so the bands slough and the varix regrows; carvedilol lowers the pressure, the two together are first
// line, and a TIPS follows when they fail (the slide fields are described at the top of decks.js).

const BAND = { kind: 'band' };
const SCOPE = { kind: 'scope' };
const NONE = { drugs: { propranolol: false, carvedilol: false } };
const PROP = { drugs: { propranolol: true, carvedilol: false } };
const CARV = { drugs: { propranolol: false, carvedilol: true } };
const BANDED = { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' };

export const NEXT_BLEED = {
  id: 'next-bleed', level: 'core', title: 'Preventing the next variceal bleed', minutes: 8,
  objectives: [
    'Explain why varices come back after banding alone',
    'Combine carvedilol with banding after a first variceal bleed',
    'Judge a beta-blocker response from the fall in HVPG',
    'Name when a TIPS follows failed prevention',
  ],
  checks: [
    ['Four banding sessions cleared the varices, yet a year later they are back. Why?', 'Banding closes the varix but leaves the portal pressure behind it as it was, so new varices form as the bands slough. Endoscopy at 6 months and then every 12 months finds them and bands them again.'],
    ['What is first-line prevention after a first esophageal variceal bleed?', 'A non-selective beta-blocker with banding, carvedilol preferred over propranolol (Baveno VIII 4.8).'],
    ['On carvedilol the HVPG falls from 18 to 15 mmHg. Is that a response?', 'Yes. A fall of about 17% is more than the 10% that marks a response, even though 15 mmHg is still above 12.'],
    ['He bleeds again despite carvedilol and banding. What comes next?', 'A covered TIPS, with rifaximin considered beforehand to lower the risk of encephalopathy.'],
  ],
  summary: 'After a first variceal bleed: why bands alone let the varices return, how carvedilol lowers the pressure behind them, why the two together are first line, and the TIPS that follows when they fail.',
  slides: [
    {
      id: 'after', terms: ['varix'], preset: 'cirr-decomp', action: BAND, cam: 'varices', labels: ['VAR'], tool: SCOPE, data: 'tiles', tiles: ['varix', 'ppg'], key: ['ppg'],
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis and ascites bled from esophageal varices five days ago. Octreotide, ceftriaxone and one band stopped it. He did not qualify for a pre-emptive TIPS.',
      cite: 'AASLD 2024, prevention of rebleeding',
      kicker: 'After the bleed', site: 'sin', title: 'The bleed is over, the pressure is not',
      line: 'One band stopped the bleeding, but the varices are still {varix} and the PPG is {ppg}. Without prevention up to 60% bleed again within a year, and the risk is highest in the first 6 weeks.',
      notes: 'Secondary prophylaxis starts before discharge, within 7 days of admission, because the risk of a rebleed is highest in the first 6 weeks. Nothing about the bleed lowered the portal pressure: the octreotide stops when the bleeding is controlled, and the band treats one varix, not the pressure behind it. Patients who had a pre-emptive TIPS need no further prophylaxis; everyone else needs a plan before they go home.',
      ask: ['Within how long of a variceal bleed should secondary prophylaxis start, and why?', 'Within 7 days of admission, because the rebleeding risk is highest in the first 6 weeks.'],
    },
    {
      id: 'bands', terms: ['varix'], action: [BAND, BAND, BAND], cam: 'varices', mark: BANDED, tool: SCOPE, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: true,
      cite: 'AASLD 2024 statement 20',
      kicker: 'Banding alone', site: 'sin', title: 'Banding shrinks the varices, not the pressure',
      line: 'Banding every 2 to 4 weeks shrinks the varices to {varix}. The pressure behind them does not fall: with the collateral closed, the HVPG creeps up to {hvpg}.',
      notes: 'Each band strangles a column of the varix, which scars and sloughs over the next days. Sessions are repeated every 2 to 4 weeks (AASLD favours 4, to let the banding ulcers heal) until the varices are gone. Closing the collateral takes away an escape route for portal blood, so the portal pressure, if anything, rises a little.',
      ask: ['How often is banding repeated after a variceal bleed, and until when?', 'Every 2 to 4 weeks until the varices are gone.'],
    },
    {
      id: 'slough', days: 300, lapse: { seconds: 8, from: 'Varices banded', to: '10 months later' }, terms: ['varix'], cam: 'varices', labels: ['VAR'], tool: SCOPE, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'bands',
      cite: 'AASLD 2024 statement 20',
      caveat: 'The model loses one banding session\'s effect about every 50 days, a simplification of how varices return.',
      kicker: 'Banding alone', site: 'sin', title: 'Bands slough and the varices come back',
      line: 'Ten months on, the varices are back to {varix}. The pressure that made them never fell, so after the varices are gone, endoscopy is repeated at 6 months and then every 12 months.',
      notes: 'Banding is a local treatment. As long as the portal pressure stays high, blood keeps finding the coronary vein and the esophageal collaterals, and new varices grow where the old ones were. Surveillance endoscopy finds them and bands them again. This is the reason banding alone is not enough after a bleed.',
      ask: ['Why do varices return after they have been banded away?', 'The portal pressure that made them has not changed, so blood keeps opening the same collaterals.'],
    },
    {
      id: 'nsbb', preset: 'cirr-decomp', params: CARV, action: BAND, cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', tiles: ['hvpg', 'hr', 'map'], key: ['hvpg'], delta: 'after',
      compare: [{ label: 'No drug', params: NONE }, { label: 'Propranolol', short: 'Prop.', params: PROP }, { label: 'Carvedilol', short: 'Carv.', own: true, params: CARV }],
      cite: 'Baveno VIII 4.8, Table 3',
      kicker: 'Carvedilol', site: 'sin', title: 'Carvedilol lowers the pressure behind the varices',
      line: 'Back at discharge, carvedilol lowers the HVPG from {hvpg@after} to {hvpg} and the heart rate to {hr}. A fall of 10% or more, or to {<=12 mmHg} or less, marks a response.',
      notes: 'Carvedilol starts at 6.25 mg a day and rises to 12.5 mg a day if the blood pressure allows. It cuts the portal inflow, as propranolol does, and also relaxes the resistance inside the liver, so it lowers the HVPG more; Baveno VIII prefers it after a bleed. The 10% response comes from the earlier Baveno meetings and stays valid in Baveno VIII; HVPG is rarely measured in practice, so the response is usually assumed. Reduce or stop carvedilol if the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or kidney injury develops.',
      ask: ['What fall in HVPG marks a response to a beta-blocker?', 'A fall of at least 10% from baseline, or to 12 mmHg or less.'],
    },
    {
      id: 'both', terms: ['varix'], action: [BAND, BAND, BAND], cam: 'varices', mark: BANDED, tool: SCOPE, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'bands',
      cite: 'Baveno VIII 4.8; AASLD 2024 statement 38',
      kicker: 'Both together', site: 'sin', title: 'Carvedilol and bands together come first',
      line: 'After a first bleed, carvedilol and banding together are first line. The bands shrink the varices to {varix}, and with carvedilol the HVPG is {hvpg}, against {hvpg@bands} with bands alone.',
      notes: 'Compared with banding alone, adding a beta-blocker lowered rebleeding in every group of patients and improved survival in Child–Pugh B and C. The two work on different things: the bands close the varix, the drug lowers the pressure that refills it. A patient who cannot take either one keeps the one he tolerates.',
      ask: ['Why combine a beta-blocker with banding instead of banding alone?', 'Banding closes the varix; the beta-blocker lowers the pressure that refills it. Together they cut rebleeding further.'],
    },
    {
      id: 'held', days: 300, lapse: { seconds: 8, from: 'Varices banded', to: '10 months later' }, terms: ['varix'], cam: 'varices', labels: ['VAR'], tool: SCOPE, data: 'tiles', tiles: ['varix', 'ppg'], key: ['varix'], delta: 'slough',
      kicker: 'Both together', site: 'sin', title: 'With carvedilol the varices stay smaller',
      line: 'Ten months on, the varices have grown back only to {varix}, against {varix@slough} with bands alone, because carvedilol keeps the pressure behind them lower. Surveillance endoscopy bands whatever returns.',
      notes: 'The same 10 months as the bands-alone slide, now on carvedilol. The bands still slough, but with a lower portal pressure less blood refills the collaterals. The comparison is against the same time point with bands alone.',
      ask: ['After the same 10 months, why are the varices smaller on carvedilol than with bands alone?', 'Carvedilol keeps the portal pressure lower, so less blood refills the collaterals once the bands slough.'],
    },
    {
      id: 'tips', params: { tips: { on: true }, ...NONE }, cam: 'liver', labels: ['CONF', 'IVCS'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'held',
      cite: 'Baveno VIII 4.13, 6.16; AASLD 2024 statement 39',
      kicker: 'When it fails', site: 'sin', title: 'A rebleed despite both means a TIPS',
      line: 'Bleeding again on carvedilol and bands is failure of secondary prophylaxis. A covered TIPS lowers the PPG to {ppg}, but the liver now gets {liver} of its normal flow, so encephalopathy is the price.',
      notes: 'TIPS is recommended when bleeding recurs despite carvedilol and banding, especially within the first 6 weeks. A TIPS can come earlier, as the plan after the first bleed, when there is another reason for one, such as refractory ascites. Before an elective TIPS, ask about past encephalopathy and consider rifaximin to prevent it. In the model carvedilol is stopped with the TIPS.',
      ask: ['Who gets a TIPS for secondary prophylaxis?', 'Patients who rebleed despite a beta-blocker and banding, and those with another reason for a TIPS, such as refractory ascites.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['varix', 'hvpg', 'ppg', 'liver'], asc: false, rowHead: 'Plan',
      of: [{ id: 'after', kicker: 'Baseline', title: 'After the bleed', ref: true }, { id: 'bands', kicker: 'Bands', title: 'Bands alone' }, { id: 'slough', kicker: 'Bands', title: 'Bands, 10 months on' },
        { id: 'nsbb', kicker: 'Drug', title: 'Carvedilol alone' }, { id: 'both', kicker: 'Both', title: 'Carvedilol and bands' }, { id: 'held', kicker: 'Both', title: 'Both, 10 months on' }, { id: 'tips', kicker: 'Shunt', title: 'TIPS' }],
      kicker: 'Summary', title: 'Bands treat the varix, carvedilol and TIPS treat the pressure',
      line: 'Bands close the varices but leave the pressure, so the varices return. Carvedilol lowers the pressure and slows the return. A TIPS lowers it most, at the cost of the liver\'s flow.',
      notes: 'After a first esophageal variceal bleed: carvedilol (or propranolol) with banding every 2 to 4 weeks until the varices are gone, then surveillance endoscopy. A TIPS follows a rebleed despite both, or comes first when another reason for it exists.',
      ask: ['Which row has the lowest PPG, and what does it cost?', 'The TIPS row. The liver gets much less of its normal portal flow, which raises the risk of encephalopathy.'],
    },
  ],
};
