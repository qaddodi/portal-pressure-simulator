// Presenter talk: four patients with the same HVPG and different circulations (the slide fields are described at the top of decks.js).
// The HVPG is the wedged minus the free hepatic vein pressure, so it reads only the pressure lost between those two positions, the sinusoids.
// What lies upstream of the wedge (the PPG), how much blood crosses the liver (the portal flow) and where blood leaves it (the collaterals)
// sit outside it. Each patient is the engine's own, tuned so the rounded HVPG is 12.0 mmHg in all four: `cirrhosis` is the one setting moved
// to match it, on the preset named, and `relax` lets the spleen and the platelets settle to that setting (a preset's years of disease run at
// the preset's own cirrhosis, params set after that leave them where they were). Fingerprints on 14 Nov 2026 (tests/same-gradient.test.js
// keeps the matches and the contrasts):
//   ref    csph, cirrhosis 0.621:                 HVPG 12.0, PPG 13.8, portal flow 1.13 L/min, 20% of the portal blood shunted, liver flow 92%
//   up     masld-csph, cirrhosis 0.655:           HVPG 12.0, PPG 15.2, portal flow 1.00,       39% shunted, liver flow 82%
//   flow   csph, cirrhosis 0.584, tone 0.75:      HVPG 12.0, PPG 14.3, portal flow 1.43,       23% shunted, liver flow 109%
//   shunt  cirr-hepatofugal, cirrhosis 0.925:     HVPG 12.0, PPG 12.0, portal flow -0.54,     100% shunted, liver flow 32%, encephalopathy index 0.83
// Sources, checked 14 Nov 2026 against the files in guidelines/: Baveno VIII 2.5 (in MASLD-related cACLD the HVPG may underestimate the true
// portal pressure gradient, and an HVPG ≥10 mmHg still carries risk); AASLD 2024 guidance statements 3 (the HVPG is the gold standard in
// cirrhosis), 4 (CSPH is an HVPG ≥10 mmHg), 5 (it may underestimate the portal pressure in some obese and NASH cirrhosis) and 6 (decompensation,
// gastroesophageal varices on endoscopy, or portosystemic collaterals or hepatofugal flow on imaging are each enough to diagnose CSPH).
// The model has no cause of cirrhosis, no BMI and no diabetes: they live in the case cards and the notes. The MASLD patient is the model's reading
// of Baveno VIII 2.5 (presinusoidal resistance in the portal tracts), not a proven mechanism. The encephalopathy index is the model's (shunt
// fraction and hepatic blood flow), not a clinical score.

const PROFILE = { kind: 'profile' };   // the pressure ladder from gut to heart, with the HVPG and PPG brackets
const FLOWS = { kind: 'flows' };       // where the portal blood goes
const LIVER = ['CONF', 'SIN_R', 'RHV'];

// The four patients, one per slide, each from its own preset. `cirrhosis` is the setting tuned to an HVPG of 12.0 mmHg.
const REF = { preset: 'csph', params: { cirrhosis: 0.621 }, relax: 365 };
const UP = { preset: 'masld-csph', params: { cirrhosis: 0.655 }, relax: 365 };
const FLOW = { preset: 'csph', params: { cirrhosis: 0.584, splanchnicTone: 0.75 }, relax: 365 };
const SHUNT = { preset: 'cirr-hepatofugal', params: { cirrhosis: 0.925 }, relax: 365 };

export const SAME_GRADIENT = {
  id: 'same-gradient', level: 'advanced', title: 'Same gradient, different patient', minutes: 11,
  summary: 'Four patients with the same HVPG and different PPGs, portal flow and collaterals: what the wedged pressure leaves out, and what to read beside it.',
  objectives: [
    'Explain why one HVPG can go with different PPGs and different portal flow',
    'Recognize the three things the HVPG does not read: resistance upstream of the wedge, the flow, and a collateral',
    'Name what to add to the HVPG when the case does not fit its number',
  ],
  checks: [
    ['Two men have cirrhosis and an HVPG of 12 mmHg. The first has a PPG of 14 mmHg, the second 16 mmHg. Where does the second man\'s extra resistance lie?', 'Upstream of the wedge, in the portal tracts or the portal vein branches. The WHVP does not reflect it, so the HVPG leaves it out.'],
    ['The portal flow rises from 1.1 to 1.4 L/min and the HVPG stays at 12 mmHg. What changed in the liver?', 'The sinusoidal resistance fell by about a fifth. The same gradient at a higher flow means less resistance.'],
    ['A man with cirrhosis and an HVPG of 12 mmHg has had two admissions for overt hepatic encephalopathy. His PPG is also 12 mmHg and the Doppler shows hepatofugal portal flow. What do you look for?', 'A large spontaneous portosystemic shunt, on contrast-enhanced CT or MRI. The portal vein drains into the shunt, so the PPG falls to meet the HVPG.'],
    ['Without an HVPG, what does AASLD 2024 accept as enough to diagnose CSPH?', 'Clinical decompensation, gastroesophageal varices on endoscopy, or portosystemic collaterals or hepatofugal flow on imaging (statement 6).'],
  ],
  slides: [
    {
      id: 'ref', ...REF, lens: 'drop', cam: 'route', labels: LIVER, tool: PROFILE, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'],
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis, abstinent for two years, has small esophageal varices on EGD, platelets of 87,000/µL and no ascites.',
      kicker: 'Reference', site: 'sin', title: 'In sinusoidal cirrhosis the PPG runs close to the HVPG',
      line: 'All of his resistance lies in the sinusoids, so the HVPG, {hvpg}, accounts for nearly all of the PPG, {ppg}. The portal vein carries {pvFlow}.',
      notes: 'The first of four men whose HVPG is the same. His resistance is sinusoidal, between the wedged and the free hepatic vein positions, so the HVPG captures nearly all of it (AASLD 2024 statement 3, the HVPG as the gold standard in cirrhosis). The PPG is a little higher because it also includes the small drop along the portal vein and from the hepatic vein to the IVC. An HVPG of 10 mmHg or more is clinically significant portal hypertension (AASLD 2024 statement 4). The model sets the cirrhosis of each of the four patients so that the HVPG reads the same, to one decimal; every other number on the next slides is what the model then gives.',
      ask: ['In cirrhosis with all the resistance in the sinusoids, how do the HVPG and the PPG compare?', 'They are close, with the PPG slightly higher: the HVPG captures nearly all of the portal pressure gradient.'],
    },
    {
      id: 'up', ...UP, lens: 'drop', cam: 'route', labels: LIVER, tool: PROFILE, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['ppg'], delta: 'ref',
      vignette: 'A 61-year-old man with MASH, type 2 diabetes and a BMI of 34 has large esophageal varices on EGD and platelets of 75,000/µL. No ascites.',
      caseQ: 'His HVPG matches the first man\'s. Will his PPG?',
      kicker: 'Upstream resistance', site: 'sin', title: 'Resistance upstream of the wedge raises the PPG and leaves the HVPG alone',
      line: 'In another patient with CSPH, part of the resistance lies in the portal tracts. The HVPG is {hvpg}, as before. The PPG is {ppg}, against {ppg@ref}.',
      notes: 'Baveno VIII 2.5 and AASLD 2024 statement 5: in obese and MASLD-related cirrhosis the HVPG may underestimate the true portal pressure gradient, and an HVPG of 10 mmHg or more still carries a higher risk of decompensation. The model puts the missing part of the resistance in the portal venules and the periportal fibrosis, upstream of the sinusoids that the wedged pressure reflects. That placement is the model\'s explanation, not a proven mechanism, and it overstates the effect: in patients the difference is smaller and varies. More of his portal blood bypasses the liver than in the first man, and the liver receives less of its normal flow, although the HVPG is the same. The BMI and the diabetes are in the case only; the model has neither.',
      ask: ['Two men have an HVPG of 12 mmHg. One has a PPG of 14 mmHg and the other 16 mmHg. Which has resistance upstream of the wedge?', 'The second. The extra PPG is resistance in the portal tracts, which the WHVP does not reflect.'],
    },
    {
      id: 'flow', ...FLOW, cam: 'portal', labels: ['SMV', 'CONF'], tool: FLOWS, data: 'tiles', tiles: ['hvpg', 'pvFlow'], key: ['pvFlow'], delta: 'ref',
      vignette: 'A 52-year-old man with hepatitis C cirrhosis has small esophageal varices on EGD, mild ascites and platelets of 75,000/µL.',
      caseQ: 'Same HVPG. Will his portal flow match?',
      kicker: 'Portal flow', site: 'sin', title: 'The same HVPG can mean more portal flow through a less resistant liver',
      line: 'In another patient with CSPH, the portal vein carries {pvFlow}, against {pvFlow@ref} in the first. The HVPG is {hvpg}, so the sinusoidal resistance must be lower.',
      notes: 'The HVPG is a pressure drop, and a pressure drop is flow times resistance. The same HVPG can therefore come from a high flow through a liver that resists less, or a low flow through a liver that resists more. In this man splanchnic vasodilation, the hyperdynamic circulation of cirrhosis, sends more blood through the portal vein, and the model needs a lower cirrhosis setting than in the first man to give the same HVPG. With more flow the PPG is a little higher and the model gives him more ascites. The HVPG cannot separate flow from resistance: that takes the portal vein Doppler or a measured flow, and it is why a drug that lowers inflow can lower the pressure without touching the sinusoids.',
      ask: ['Two men have the same HVPG. One has 1.1 L/min of portal flow and the other 1.4 L/min. Which has the lower sinusoidal resistance?', 'The second: the same pressure drop at a higher flow means less resistance.'],
    },
    {
      id: 'shunt', ...SHUNT, lens: 'direction', cam: ['splenic', 'portal'],
      marks: [{ edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, { edges: ['PV_TRUNK'], label: 'Portal vein, reversed', kind: 'note' }],
      tool: FLOWS, data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['pvFlow'], delta: 'ref',
      vignette: 'A 63-year-old man with cirrhosis on diuretics has had two admissions for overt hepatic encephalopathy. Platelets are 141,000/µL and EGD shows no large varices.',
      caseQ: 'His HVPG is the same. What will his PPG be?',
      kicker: 'Collaterals', site: 'sin', title: 'A large splenorenal shunt brings the PPG down to the HVPG and reverses the portal flow',
      line: 'The shunt carries the portal blood away from the liver. The PPG is {ppg}, level with the HVPG, and the portal flow is {pvFlow}: hepatofugal.',
      notes: 'A large spontaneous splenorenal shunt, as in end-stage cirrhosis, decompresses the portal vein: the blood leaves through the shunt, the portal vein drains the sinusoids, and the portal pressure is set by them. The PPG then meets the HVPG, and the flow in the portal vein runs away from the liver. The catheter reads the same 12 mmHg as in the first man and cannot see any of this. Imaging does: AASLD 2024 statement 6 counts portosystemic collaterals or hepatofugal flow on imaging as enough to diagnose CSPH, with or without an HVPG. The colors on the figure show the direction of flow: the usual direction in teal, reversed flow in orange.',
      ask: ['A man with an HVPG of 12 mmHg has a PPG of 12 mmHg and hepatofugal portal flow. What explains it?', 'A large spontaneous portosystemic shunt, such as a splenorenal shunt, that drains the portal vein.'],
    },
    {
      id: 'cost', cam: 'route', labels: LIVER, data: 'tiles', tiles: ['he', 'varix'], key: ['he'], delta: 'ref',
      kicker: 'Collaterals', site: 'sin', title: 'The shunt shrinks the varices and spares the platelets, and costs the liver its blood',
      line: 'The varices are {varix} and the platelets {plt}, better than in the first man. The liver gets {liver} of its normal flow, and the encephalopathy risk is high.',
      notes: 'In the model the shunt lowers the portal vein pressure, so the spleen is smaller, the platelets higher and the varices smaller than in the first man. Those are the markers a clinic watches, and here they flatter him. The liver receives about a third of its normal blood flow, and the model\'s encephalopathy index, built from the shunt fraction and the hepatic blood flow, is the highest of the four: it is the model\'s index, not a clinical score. The overt encephalopathy in the case is the clue that a catheter reading would not give.',
      ask: ['A man with an HVPG of 12 mmHg has small varices, a platelet count of 141,000/µL and recurrent encephalopathy. Is that reassuring?', 'No. The same gradient can hide a shunt that spares the varices and the platelets while the liver loses its blood.'],
    },
    {
      id: 'ladders', cam: 'fit', visual: 'ladders', of: [{ id: 'ref', name: 'Sinusoidal' }, { id: 'up', name: 'Upstream share' }, { id: 'flow', name: 'High inflow' }, { id: 'shunt', name: 'Shunt' }],
      kicker: 'Side by side', title: 'Four patients share one HVPG and differ in the rest of the pressure from gut to heart',
      notes: 'Read each ladder from the gut at the left to the right atrium at the right. The HVPG bracket, the drop between the wedged and the free hepatic vein positions, is the same size in all four. What differs is the pressure upstream of it: highest in the man with resistance in the portal tracts, a little above the reference in the man with a high inflow, and lowest in the man whose portal blood leaves through the shunt.',
      ask: ['Which part of the ladder does the HVPG read?', 'Only the drop between the wedged and the free hepatic vein positions, the sinusoids. Everything upstream of the wedge is outside it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'pvFlow', 'liver', 'varix', 'he'], asc: false, note: 'What the HVPG leaves out', rowHead: 'Patient',
      of: [{ id: 'ref', kicker: 'Sinusoidal', title: 'Sinusoidal cirrhosis', note: 'Nothing: it tracks the PPG' },
        { id: 'up', kicker: 'Upstream', title: 'MASLD cirrhosis', note: 'Resistance in the portal tracts', missPart: ['hvpg'] },
        { id: 'flow', kicker: 'Flow', title: 'High inflow', note: 'The flow, not the resistance' },
        { id: 'shunt', kicker: 'Collateral', title: 'Splenorenal shunt', note: 'The shunt and the reversed flow' }],
      kicker: 'Summary', title: 'One HVPG, four circulations: read the PPG, the flow and the imaging beside it',
      line: 'The HVPG reads the sinusoids. Upstream resistance, the portal flow and a shunt sit outside it, so a case that does not fit its HVPG needs the rest.',
      notes: 'Read across a row: the same HVPG in every patient, and everything else different. The HVPG misses part of the resistance when some of it lies in the portal tracts (Baveno VIII 2.5, AASLD 2024 statement 5). It cannot tell a high flow through a lower resistance from a low flow through a higher one. It does not see a collateral at all, which imaging shows (AASLD 2024 statement 6). A PPG, a portal vein Doppler and cross-sectional imaging read what the wedged pressure leaves out. In each patient the model\'s cirrhosis was tuned to match the HVPG; in patients the HVPG, the PPG and the flow vary together and with the cause.',
      ask: ['A man has an HVPG of 12 mmHg. What do you add to know whether the HVPG tells the whole story?', 'The PPG, from a direct portal vein pressure, for resistance upstream of the wedge; a portal vein Doppler for the flow; contrast-enhanced CT or MRI for collaterals.'],
    },
  ],
};
