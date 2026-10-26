// Presenter talk: lowering portal pressure with drugs (the slide fields are described at the top of decks.js): propranolol, carvedilol (the
// HVPG tracing and the percent fall run through the beta-blocker slides), octreotide and terlipressin, TIPS against them, and a patient whose
// resistance sits before the sinusoids, where carvedilol adds little. The old Propranolol or carvedilol talk is folded in (decks.js DECK_ALIAS).
// Banding, TIPS and the cost of TIPS have talks of their own.

const PROP = { drugs: { propranolol: true, carvedilol: false } };
const CARV = { drugs: { propranolol: false, carvedilol: true } };

export const TREATMENT = {
  id: 'treatment', level: 'advanced', title: 'Lowering portal pressure', minutes: 10,
  sections: [['The patient', ['Lowering portal pressure']], ['Beta-blockers', ['Non-selective beta-blocker']], ['Bleeding and the kidney', ['Acute variceal bleeding', 'Hepatorenal syndrome']], ['Compared', ['Compared']], ['Before the sinusoids', ['Schistosomiasis']]],
  summary: 'Propranolol, carvedilol, octreotide, terlipressin and TIPS in one patient with decompensated cirrhosis, the HVPG fall each gives, and a patient with schistosomiasis whose resistance sits before the sinusoids, where carvedilol adds little.',
  objectives: ['Explain how each drug lowers portal pressure: inflow, resistance or both', 'Explain why carvedilol lowers the HVPG more than propranolol only where the resistance is sinusoidal', 'Explain how a vasoactive drug lowers the pressure in an acute bleed', 'Judge a drug by the fall in the HVPG, and know when the HVPG misleads'],
  checks: [
    ['Why does carvedilol lower the HVPG more than propranolol?', 'It also blocks α1 receptors, so it lowers the resistance inside the liver as well as the inflow.'],
    ['On propranolol the heart rate falls from 80 to 58, but the HVPG only from 18 to 17.5 mmHg. Has the portal pressure responded?', 'No. The heart rate shows the β1 blockade, not the portal response; a fall <10% marks a non-responder.'],
    ['Why does carvedilol\'s extra effect add little in schistosomiasis?', 'The resistance is scar in the portal venules, before the sinusoids where its extra effect acts.'],
    ['On carvedilol the HVPG falls a little in schistosomiasis. Did the portal pressure fall more?', 'No. The HVPG reads the sinusoids, not the portal vein; the portal pressure fell about as much as on propranolol.'],
  ],
  slides: [
    {
      id: 'target', preset: 'cirr-decomp', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], tool: { kind: 'profile' }, data: 'tiles', key: ['hvpg'], tiles: ['varix'],
      kicker: 'Lowering portal pressure', site: 'sin', title: 'A patient with decompensated cirrhosis',
      vignette: 'A 58-year-old woman with MASH cirrhosis has ascites controlled on spironolactone and furosemide. A surveillance EGD shows large esophageal varices. She has never bled.',
      line: 'In this case the HVPG is {hvpg}, with large varices and ascites. Treatment lowers the inflow or the resistance, or bypasses the liver.',
      notes: 'Portal pressure is flow times resistance. Non-selective beta-blockers and the vasoactive drugs used in bleeding cut the inflow; carvedilol also lowers the resistance inside the liver; TIPS goes around it. Banding treats the varix, not the pressure. Removing the cause (stopping alcohol, treating hepatitis) lowers the resistance over months to years. On drugs, the aim after a bleed is an HVPG fall of 20% or more, or to below 12 mmHg; in compensated patients a fall of 10% already helps.',
      ask: ['Name a treatment that cuts the inflow and one that lowers the resistance.', 'Inflow: propranolol, octreotide, terlipressin. Resistance: carvedilol, treating the cause; TIPS goes around it.'],
    },
    {
      id: 'prop', lens: 'flow', params: PROP, cam: 'portal', labels: ['SMV', 'CONF'], tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Propranolol lowers portal inflow',
      line: 'β1 blockade lowers cardiac output, and β2 blockade lets the gut arterioles constrict. Portal inflow falls to {pvFlow} and the HVPG to {hvpg}.',
      notes: 'Propranolol (or nadolol) is titrated to a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg. It prevents a first bleed from large varices and, with banding, a second one. About a third to a half of patients reach a protective fall in HVPG. In refractory ascites with low blood pressure or kidney injury the dose is reduced or stopped. The model shows a modest fall. Colored by flow, the gut veins and the portal vein thin. The tile shows the percent fall from the untreated patient: 10% or more marks a response.',
      ask: ['How is propranolol titrated?', 'To a resting heart rate of 55 to 60 a minute, keeping systolic pressure >90 mmHg.'],
    },
    {
      id: 'carv', question: 'Which lever does carvedilol pull?', lens: 'flow', params: { drugs: { propranolol: false, carvedilol: true } }, cam: 'liver', glow: ['liver'], tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Carvedilol also lowers resistance in the liver',
      line: 'It also blocks α1 receptors, relaxing the stellate cells in the sinusoids. The HVPG falls further, to {hvpg}, but blood pressure falls too.',
      notes: 'Carvedilol 6.25 to 12.5 mg a day. Its α1 blockade relaxes the contracted stellate cells and lowers the resistance inside the liver, so it lowers HVPG more than propranolol and brings about half of propranolol non-responders to a protective fall. Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation. Watch the blood pressure, especially with ascites. Both levers move: the inflow falls as with propranolol, and the resistance falls as well.',
      ask: ['Why does carvedilol lower HVPG more than propranolol?', 'Its α1 blockade also lowers the vascular resistance inside the liver.'],
    },
    {
      id: 'carv-sin', lens: 'flow', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Carvedilol lowers the HVPG more than propranolol in cirrhosis',
      line: 'Most of the resistance sits in the sinusoids. Carvedilol\'s α1 blockade is thought to relax their stellate cells, so the HVPG falls to {hvpg}. Switch drugs to compare.',
      notes: 'Switch between the two drugs: carvedilol acts on both flow and resistance, so it lowers the HVPG more; in trials, by about 2 mmHg more than propranolol. In the model the gap between the two widens as the sinusoidal resistance grows, from under 1 mmHg in mild cirrhosis to about 2 mmHg in advanced disease. Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation, and so does the choice with ascites and varices. Whenever the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or kidney injury develops, reduce the dose or stop the drug, and restart it once these resolve (Baveno VIII 3.15, 4.6).',
      ask: ['Why does carvedilol lower the HVPG more than propranolol in cirrhosis?', 'Unlike propranolol, it lowers the resistance in the sinusoids, where most of the resistance sits.'],
    },
    {
      id: 'oct', lens: 'flow', params: { drugs: { carvedilol: false, octreotide: true } }, cam: 'portal', labels: ['SMV', 'CONF'], tool: { kind: 'profile' }, data: 'tiles', key: ['pv'], tiles: ['pvFlow'], delta: 'target',
      kicker: 'Acute variceal bleeding', site: 'sin', title: 'Octreotide cuts splanchnic inflow',
      line: 'Octreotide, a somatostatin analogue, blocks the gut\'s vasodilating peptides, so splanchnic inflow falls to {pvFlow}. The effect on portal pressure is modest and partly transient.',
      notes: 'Suspected variceal bleeding: octreotide at once (a 50 µg bolus, then 25 to 50 µg an hour), continued for 2 to 5 days. The full order of care is in the acute variceal bleeding talk. Octreotide is the vasoactive drug used for bleeding in the US; elsewhere terlipressin or somatostatin are alternatives. Its effect on portal pressure is modest and partly transient, so the model gives it a smaller fall than terlipressin (splanchnic resistance × 1.35 against × 1.9), in line with HVPG studies of somatostatin analogues (Escorsell 2001, Baik 2005). Colored by flow, the portal vein thins.',
      ask: ['How does octreotide lower the portal pressure, and why is the effect modest?', 'It cuts splanchnic inflow; the effect is small and partly transient.'],
    },
    {
      id: 'terli', lens: 'flow', params: { drugs: { octreotide: false, terlipressin: true } }, cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', key: ['map'], tiles: ['map', 'pvFlow', 'hvpg'], delta: 'target',
      compare: [{ label: 'Octreotide', params: { drugs: { octreotide: true, terlipressin: false } } }, { label: 'Terlipressin', own: true, params: { drugs: { octreotide: false, terlipressin: true } } }],
      kicker: 'Hepatorenal syndrome', site: 'sin', title: 'Terlipressin for HRS-AKI',
      line: 'Given with albumin, this vasopressin analogue constricts the dilated splanchnic arterioles, so blood pressure and kidney perfusion rise.',
      notes: 'In the US terlipressin is approved for hepatorenal syndrome with a rapid fall in kidney function (HRS-AKI), not for variceal bleeding. It is given with albumin. It is avoided with hypoxia (SpO2 below 90%), volume overload or a creatinine of 5 mg/dL or more, because of the risk of respiratory failure; other risks are ischemia and hyponatremia. Octreotide alone does little for HRS; where terlipressin is not available it is combined with midodrine and albumin, or norepinephrine is used. The model has no kidneys: the tiles show the blood pressure and portal inflow that drive kidney perfusion. Colored by flow, the gut veins and the portal vein thin further.',
      ask: ['What is given with terlipressin for HRS-AKI?', 'Albumin.'],
    },
    {
      id: 'vs', params: { tips: { on: true }, drugs: { propranolol: false, carvedilol: false, octreotide: false, terlipressin: false } }, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['ppg'], tiles: ['liver'], delta: 'target',
      // (short: the compact label a phone's one row of buttons takes where the full names would wrap; presenter.js abShort.)
      compare: [
        { label: 'TIPS', own: true, params: { tips: { on: true }, drugs: { propranolol: false, carvedilol: false, octreotide: false, terlipressin: false } } },
        { label: 'Propranolol', short: 'Prop.', params: { tips: { on: false }, drugs: { propranolol: true, carvedilol: false, octreotide: false, terlipressin: false } } },
        { label: 'Carvedilol', short: 'Carv.', params: { tips: { on: false }, drugs: { propranolol: false, carvedilol: true, octreotide: false, terlipressin: false } } },
        { label: 'Octreotide', short: 'Octr.', params: { tips: { on: false }, drugs: { propranolol: false, carvedilol: false, octreotide: true, terlipressin: false } } },
        { label: 'Terlipressin', short: 'Terl.', params: { tips: { on: false }, drugs: { propranolol: false, carvedilol: false, octreotide: false, terlipressin: true } } },
      ],
      kicker: 'Compared', site: 'sin', title: 'TIPS versus drug therapy',
      line: 'Drugs lower the gradient by a few mmHg. A TIPS lowers it to {ppg}, but diverts the liver\'s portal blood.',
      notes: 'The same patient, switched between TIPS and each drug alone. In the model the drugs lower the PPG by 1 to 2 mmHg, carvedilol most, which is less than they do in patients (carvedilol lowers the HVPG by about a fifth); TIPS brings it below 12 mmHg but halves the blood reaching the sinusoids. The model\'s drugs lower the gradient less than they do in patients. The TIPS talks follow the stent, its flow and its cost.',
      ask: ['Why does TIPS lower the gradient so much more than any drug?', 'The drugs trim the inflow or the tone; TIPS gives portal blood a low-resistance path around the sinusoids.'],
    },
    {
      id: 'schisto', preset: 'schisto', params: CARV, caseQ: 'Will carvedilol add much to propranolol here?', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      vignette: 'A 38-year-old woman from the Senegal River region has a large spleen and large esophageal varices on EGD. Her liver tests are normal, and she has never bled.',
      kicker: 'Schistosomiasis', site: 'presin', title: 'Carvedilol adds little when the resistance is before the sinusoids',
      line: 'Egg granulomas and scar narrow the portal venules, and the pressure is lost there. Carvedilol\'s extra effect acts on the sinusoids beyond them, so the portal vein pressure stays {pv}.',
      notes: 'Schistosome eggs lodge in the small portal venules, and the granulomas heal as periportal fibrosis. The sinusoids are spared, so the wedge reads near-normal sinusoidal pressure and the HVPG underestimates the portal pressure. Porto-sinusoidal vascular disorder gives the same presinusoidal picture without the parasite. Switch between the two drugs: the portal vein pressure barely changes, because carvedilol\'s extra effect acts downstream of the resistance. The HVPG does fall a little more on carvedilol, since the sinusoids relax, but in presinusoidal disease the HVPG never showed the portal pressure, so that fall does nothing for the varices. With the resistance fixed in scarred portal venules, cutting the inflow is the one way left to lower the pressure; most trials in non-cirrhotic portal hypertension used propranolol. Baveno VIII and EASL 2025 find no proven advantage for carvedilol in porto-sinusoidal vascular disorder, and small schistosomiasis studies found none. In practice: carvedilol is preferred in cirrhosis with clinically significant portal hypertension; in porto-sinusoidal vascular disorder a beta-blocker or banding, with no drug preferred; with low blood pressure or kidney injury, reduce or stop (Baveno VIII 3.15, 4.6, 8.8, 8.9).',
      ask: ['Switch to propranolol. What happens to the portal vein pressure, and why?', 'It barely changes: carvedilol\'s extra effect acts on the sinusoids, beyond the resistance in the portal venules.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'varix', 'liver'], asc: false, vs: 'first', rowHead: 'Treatment', note: 'How it works',
      // (Terlipressin is left out: it treats HRS-AKI, not bleeding, and has its own slide.)
      of: [{ id: 'target', kicker: 'Baseline', title: 'Decompensated cirrhosis', note: 'HVPG 17, large varices, ascites' }, { id: 'prop', title: 'Propranolol', note: 'Less inflow' }, { id: 'carv', title: 'Carvedilol', note: 'Less inflow and resistance' }, { id: 'oct', kicker: 'Vasoactive drug', title: 'Octreotide', note: 'Less inflow, in a bleed' },
        { id: 'vs', kicker: 'Shunt', title: 'TIPS', note: 'Bypasses the liver' }],
      kicker: 'Summary', title: 'Effect of each treatment on the gradient',
      line: 'Each treatment given alone to the same patient: drugs lower the gradient modestly, TIPS bypasses the resistance. Where the resistance is before the sinusoids, carvedilol adds little.',
      notes: 'Drugs cut the inflow (propranolol, octreotide, terlipressin) or the resistance as well (carvedilol). Banding eradicates varices but leaves the portal pressure high. TIPS lowers the gradient most and clears the ascites, at the price of the liver\'s portal blood and a risk of encephalopathy. In practice they combine: a beta-blocker with banding after a bleed; octreotide, banding and, for those at high risk, pre-emptive TIPS in an acute bleed. In schistosomiasis the HVPG misleads, because the wedge reads the sinusoids, which the scar spares.',
      ask: ['Which treatment lowers the portal pressure gradient most, and what does it cost?', 'TIPS: less blood for the liver and a risk of encephalopathy.'],
    },
  ],
};
