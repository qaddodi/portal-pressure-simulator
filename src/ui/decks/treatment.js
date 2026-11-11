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
      id: 'prop', lens: 'flow', params: PROP, cam: [380, 110, 930, 710],   // (the portal system and the hepatic vein the catheter in the tracing's card sits in)
       labels: ['SMV', 'CONF'], tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Propranolol lowers portal inflow',
      line: 'At a starting dose, β1 blockade lowers cardiac output and β2 blockade lets the gut arterioles constrict. Portal inflow falls to {pvFlow}, the HVPG to {hvpg}.',
      notes: 'Propranolol (or nadolol) is titrated to a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg. It prevents a first bleed from large varices and, with banding, a second one. About a third to a half of patients reach a protective fall in HVPG. In refractory ascites with low blood pressure or kidney injury the dose is reduced or stopped. The model shows a starting dose: the heart rate falls to about 73 a minute, and titration would take it on to 55 to 60. Colored by flow, the gut veins and the portal vein thin. The tile shows the percent fall from the untreated patient: 10% or more marks a response.',
      ask: ['How is propranolol titrated?', 'To a resting heart rate of 55 to 60 a minute, keeping systolic pressure >90 mmHg.'],
    },
    {
      id: 'carv', question: 'Which lever does carvedilol pull?', lens: 'since', since: 'prop', sinceLabel: 'propranolol', params: { drugs: { propranolol: false, carvedilol: true } }, cam: 'liver', glow: ['liver'], tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Carvedilol also lowers resistance in the liver',
      line: 'Its α1 blockade is thought to relax the sinusoids: the HVPG falls further, to {hvpg}, the blood pressure to {map}. Cut the dose if the systolic stays <90 mmHg.',
      notes: 'Carvedilol 6.25 to 12.5 mg a day. Its α1 blockade relaxes the contracted stellate cells and lowers the resistance inside the liver, so it lowers HVPG more than propranolol and brings about half of propranolol non-responders to a protective fall. Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation. Watch the blood pressure, especially with ascites. Both levers move: the inflow falls as with propranolol, and the resistance falls as well.',
      ask: ['Why does carvedilol lower HVPG more than propranolol?', 'Its α1 blockade also lowers the vascular resistance inside the liver.'],
    },
    {
      id: 'carv-sin', lens: 'flow', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, tool: { kind: 'hvpg' }, data: 'tiles', key: ['hvpgFall'], tiles: [], delta: 'target', hvpgResp: 'target',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Carvedilol lowers the HVPG more than propranolol in cirrhosis',
      line: 'Most of the resistance sits in the sinusoids. Carvedilol\'s α1 blockade is thought to relax their stellate cells, so the HVPG falls to {hvpg}.',
      notes: 'Switch between the two drugs: carvedilol acts on both flow and resistance, so it lowers the HVPG more; in trials, by about 2 mmHg more than propranolol. In the model the gap between the two widens as the sinusoidal resistance grows, from under 1 mmHg in mild cirrhosis to about 2 mmHg in advanced disease. Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation, and it remains a choice with ascites and varices. Whenever the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or kidney injury develops, reduce the dose or stop the drug, and restart it once these resolve (Baveno VIII 3.15, 4.6).',
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
      id: 'terli', lens: 'flow', params: { drugs: { octreotide: false, terlipressin: true } }, cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', key: ['map'], tiles: ['map', 'rpp', 'pvFlow'], delta: 'target',
      compare: [{ label: 'Octreotide', params: { drugs: { octreotide: true, terlipressin: false } } }, { label: 'Terlipressin', own: true, params: { drugs: { octreotide: false, terlipressin: true } } }],
      kicker: 'Terlipressin', site: 'sin', title: 'Terlipressin: a bleed drug and the HRS-AKI drug',
      line: 'This vasopressin analogue constricts the dilated splanchnic arterioles. Portal inflow falls to {pvFlow}, which helps in a bleed; with albumin, the kidney pressure rises to {rpp} in HRS-AKI.',
      notes: 'Outside the US, terlipressin is a first-line vasoactive drug for an acute variceal bleed (2 mg IV every 4 to 6 hours for the first 24 to 48 hours, then 1 mg every 4 to 6 hours, AASLD 2024), and it lowers the portal pressure more than octreotide. In the US it is approved for hepatorenal syndrome with a rapid fall in kidney function (HRS-AKI), not for variceal bleeding. It is given with albumin: Baveno VIII advises terlipressin and albumin for HRS-AKI (6.18), and terlipressin preferably as a continuous infusion, starting at 2 to 3 mg in 24 hours, because it causes fewer adverse events than boluses (6.19). It is avoided with hypoxia or volume overload, because of the risk of respiratory failure; ischemia is another risk, and the sodium is watched for hyponatremia (Baveno VIII 5.9). Norepinephrine is the alternative where terlipressin is unavailable or not tolerated (6.20). The model has no kidneys: the kidney pressure tile is the MAP less the pressure in the abdomen, which drives kidney perfusion, not kidney function. Colored by flow, the gut veins and the portal vein thin further.',
      ask: ['What is given with terlipressin for HRS-AKI?', 'Albumin.'],
    },
    {
      id: 'vs', params: { tips: { on: true }, drugs: { propranolol: false, carvedilol: false, octreotide: false, terlipressin: false } }, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', key: ['ppg'], tiles: ['liver'], delta: 'target',
      kicker: 'Compared', site: 'sin', title: 'TIPS versus drug therapy',
      line: 'Drugs lower the gradient by a few mmHg. A TIPS lowers it to {ppg}, but diverts the liver\'s portal blood.',
      notes: 'The same patient on TIPS; each drug alone is taught on the slides before. In the model propranolol lowers the HVPG by about 13% and carvedilol by about 19%, close to what they do in patients; TIPS brings the PPG below 12 mmHg but halves the blood reaching the sinusoids. The TIPS talks follow the stent, its flow and its cost.',
      ask: ['Why does TIPS lower the gradient so much more than any drug?', 'The drugs trim the inflow or the tone; TIPS gives portal blood a low-resistance path around the sinusoids.'],
    },
    {
      // (Ohm's law on a plane, C1 of docs/recommendations/new-features-recs.md: this patient before treatment (ring) and on each drug and the TIPS (dot),
      // portal flow across and the PPG up. A line from the origin is one resistance, PPG ÷ flow.)
      id: 'flowres', cam: 'liver', visual: 'plane',
      plane: { base: 'flow-ppg', x: { key: 'pvFlow', min: 0, max: 1.6, ticks: [0, 0.4, 0.8, 1.2, 1.6], name: 'Portal flow, L/min', short: 'Flow, L/min', abbr: 'Flow' }, iso: { rays: [5, 10, 20, 30, 40] } },
      of: [{ id: 'target', name: 'No treatment', short: 'Before' }, { id: 'prop', from: 'target', name: 'Propranolol', short: 'Prop.' }, { id: 'carv', from: 'target', name: 'Carvedilol', short: 'Carv.' }, { id: 'oct', from: 'target', name: 'Octreotide', short: 'Oct.' },
        { id: 'terli', from: 'target', name: 'Terlipressin', short: 'Terli.' }, { id: 'vs', from: 'target', name: 'TIPS' }],
      kicker: 'Compared', title: 'Each treatment moves the patient along flow or resistance',
      line: 'Each ring is the patient before treatment, each dot on the drug. Drugs that cut the inflow move left; a TIPS drops the dot to a lower line.',
      notes: 'Portal pressure is flow times resistance, so a patient is a point on a plane: portal flow across, the PPG up, and every line from the origin is one resistance (the PPG divided by the flow, in mmHg per L/min). Propranolol, octreotide and terlipressin cut the inflow, so the dot moves left; the pressure falls less than the flow, so it ends on a steeper line. Carvedilol also relaxes the sinusoids, so its dot moves left and stays close to the line it started on. The TIPS opens a channel beside the liver: the flow rises and the pressure falls, so the dot lands on a much lower line. The resistance on this plane is the whole circuit\'s (PPG ÷ flow), not the liver\'s alone. The numbers are the model\'s for this one patient, not trial results.',
      ask: ['Which treatments move the patient left on this plane, and which drop them to a lower line?', 'The drugs that cut the inflow move it left. A TIPS lowers the resistance, so the dot drops to a lower line; carvedilol stays near its line because it lowers resistance as well as flow.'],
    },
    {
      id: 'schisto', preset: 'schisto', params: CARV, caseQ: 'Will carvedilol add much to propranolol here?', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      vignette: 'A 38-year-old woman from the Senegal River region has a large spleen and large esophageal varices on EGD. Her liver tests are normal, and she has never bled.',
      kicker: 'Schistosomiasis', site: 'presin', title: 'Carvedilol adds little when the resistance is before the sinusoids',
      line: 'Scarred portal venules hold the resistance. Carvedilol\'s extra effect acts on the sinusoids beyond them, so the portal pressure falls only as far as on propranolol, to {pv}.',
      notes: 'Schistosome eggs lodge in the small portal venules, and the granulomas heal as periportal fibrosis. The sinusoids are spared, so the wedge reads near-normal sinusoidal pressure and the HVPG underestimates the portal pressure. Porto-sinusoidal vascular disorder gives the same presinusoidal picture without the parasite. Switch between the two drugs: the portal vein pressure barely changes, because carvedilol\'s extra effect acts downstream of the resistance. The HVPG does fall a little more on carvedilol, since the sinusoids relax, but in presinusoidal disease the HVPG never showed the portal pressure, so that fall does nothing for the varices. With the resistance fixed in scarred portal venules, cutting the inflow is the one way left to lower the pressure; most trials in non-cirrhotic portal hypertension used propranolol. For vascular liver disease Baveno VIII finds the evidence insufficient to prefer carvedilol over other beta-blockers (8.9), and no evidence to favor banding over a beta-blocker for primary prophylaxis (8.8). In practice: carvedilol is preferred in cirrhosis with clinically significant portal hypertension; in porto-sinusoidal vascular disorder a beta-blocker or banding, with no drug preferred; with low blood pressure or kidney injury, reduce or stop (Baveno VIII 3.15, 4.6, 8.8, 8.9).',
      ask: ['Switch to propranolol. What happens to the portal vein pressure, and why?', 'It barely changes: carvedilol\'s extra effect acts on the sinusoids, beyond the resistance in the portal venules.'],
    },
    {
      // (The relation chart before the summary: this patient's liver with more or less scarring, the HVPG on each drug read against
      // the HVPG before it. At her own 16.5 mmHg the rings are the Propranolol and Carvedilol slides' readings.)
      id: 'relation', preset: 'cirr-decomp', cam: 'liver', glow: ['liver'],
      tool: { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.05, lines: ['hvpg'], label: 'HVPG before the drug',
        against: [{ label: 'Carvedilol', params: CARV, pair: true, own: 'No change' }, { label: 'Propranolol', params: PROP, pair: true }], zone: { fall: 10, under: 12, label: 'Response' } },
      kicker: 'Summary', site: 'sin', title: 'Carvedilol lowers the HVPG further from any starting point',
      line: 'The dashed diagonal is no change. From {hvpg}, carvedilol takes her to {hvpg@carv} and propranolol to {hvpg@prop}, both inside the response zone.',
      notes: 'Each point is this patient with more or less scarring, the HVPG read before a drug (across) and on it (up). The dashed diagonal is no change. The green zone is a response: a fall of 10% or more from baseline, or to 12 mmHg or less, which Baveno VIII carries from Baveno V and VI. Carvedilol lies below propranolol all the way along, because it also lowers the sinusoidal tone. In the model every patient responds to some degree; in practice about half do not respond to propranolol, which is why the HVPG fall, not the heart rate, is the measure. One model patient per point: real responses vary far more. (Baveno VIII Table 3; AASLD 2024 statement 12, carvedilol at CSPH.)',
      ask: ['Her HVPG falls from 16.5 to 15.5 mmHg on propranolol. Has she responded?', 'No. That is a 6% fall and still >12 mmHg; a response needs a fall of ≥10% or a gradient ≤12 mmHg.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'map', 'liver'], asc: false, vs: 'first', rowHead: 'Treatment', note: 'How it works',
      // (Terlipressin is left out: it treats HRS-AKI, not bleeding, and has its own slide.)
      of: [{ id: 'target', kicker: 'Baseline', title: 'Decompensated cirrhosis', note: 'HVPG 16.5, large varices, ascites' }, { id: 'prop', title: 'Propranolol', note: 'Less inflow' }, { id: 'carv', title: 'Carvedilol', note: 'Less inflow and resistance' }, { id: 'oct', kicker: 'Vasoactive drug', title: 'Octreotide', note: 'Less inflow, in a bleed' }, { id: 'terli', kicker: 'Vasoactive drug', title: 'Terlipressin', note: 'Less inflow; bleed and HRS-AKI' },
        { id: 'vs', kicker: 'Shunt', title: 'TIPS', note: 'Bypasses the liver' }],
      kicker: 'Summary', title: 'Effect of each treatment on the gradient',
      line: 'Each treatment given alone to the same patient: drugs lower the gradient modestly, TIPS bypasses the resistance. Where the resistance is before the sinusoids, carvedilol adds little.',
      notes: 'Drugs cut the inflow (propranolol, octreotide, terlipressin) or the resistance as well (carvedilol). Stop or reduce a beta-blocker when the systolic pressure stays below 90 mmHg, the mean below 65 mmHg, or kidney injury develops. Banding eradicates varices but leaves the portal pressure high. TIPS lowers the gradient most and clears the ascites, at the price of the liver\'s portal blood and a risk of encephalopathy. In practice they combine: a beta-blocker with banding after a bleed; octreotide or terlipressin, banding and, for those at high risk, pre-emptive TIPS in an acute bleed. In schistosomiasis the HVPG misleads, because the wedge reads the sinusoids, which the scar spares. The table has no varix column: a beta-blocker does not shrink varices within days, but in the model the varix follows the pressure at once. The MAP column shows the pressure to watch on a beta-blocker.',
      ask: ['Which treatment lowers the portal pressure gradient most, and what does it cost?', 'TIPS: less blood for the liver and a risk of encephalopathy.'],
    },
  ],
};
