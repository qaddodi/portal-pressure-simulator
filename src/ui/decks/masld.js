// Presenter talk: fatty liver and the portal pressure. In obese MASLD cirrhosis the HVPG can read below the portal gradient
// (Baveno VIII 2.5, checked 7 Nov 2026 against guidelines/baveno-viii-2026.pdf); then the stiffness rule at a BMI ≥30 (1.14, 1.16),
// what a fall in stiffness may mean without CSPH (2.6, 2.13), the drugs (2.17, 2.19) and alcohol on top (2.1, 2.2, Table 3).
// The slide fields are described at the top of decks.js. The model has no BMI and no alcohol: both live in the case cards and the
// notes. Part of the resistance sits before the sinusoids in the `masld-csph` preset, which is the model's reading of 2.5, not a
// proven mechanism. Weight loss and abstinence are drawn as the scar easing back over a year, as the Treating the cause talk does.

const SCAN = { kind: 'fibroscan' };
const PROFILE = { kind: 'profile' };
const CAUSES = { kind: 'causes', metric: 'ppg' };
// (The two gradients on one plane, with the line where the wedge reads the portal pressure: a dot above it is the HVPG under-reading.)
const PLANE = { kind: 'plane', plane: { base: 'hvpg-ppg', diag: { label: 'HVPG = PPG' } } };
const GAPS = 'The two gradients', STIFF = 'Stiffness and weight', MORE = 'Drugs and alcohol';

export const MASLD = {
  id: 'masld', level: 'advanced', title: 'Fatty liver and the portal pressure', minutes: 9,
  sections: [[GAPS, [GAPS]], [STIFF, [STIFF]], [MORE, [MORE]]],
  objectives: [
    'Explain why the HVPG can read below the portal gradient in obese MASLD cirrhosis, and why an HVPG ≥10 mmHg still counts',
    'Use ANTICIPATE-NASH instead of the 25 kPa rule at a BMI ≥30',
    'Say when a fall in stiffness after weight loss may mean fibrosis regression',
    'State which drugs are safe in MASLD cirrhosis, which are approved for it, and what is asked of a patient who also drinks',
  ],
  summary: 'Obese MASLD cirrhosis, where part of the resistance sits before the sinusoids and the HVPG reads below the portal gradient: what to measure, how a BMI ≥30 changes the stiffness rule, what weight loss may do, and which drugs and alcohol advice apply.',
  checks: [
    ['A woman with MASLD cirrhosis and a BMI of 35 has an HVPG of 11 mmHg and a PPG of 14 mmHg. Which reading is nearer the true gradient, and does the HVPG still count?', 'The PPG: in MASLD cirrhosis the HVPG can read low. An HVPG ≥10 mmHg still goes with a higher risk of decompensation.'],
    ['Why is a stiffness of 27 kPa not enough to rule CSPH in at a BMI of 34?', 'The 25 kPa rule is for viral, alcohol-related and non-obese (BMI <30) MASLD cirrhosis. At a BMI ≥30, ANTICIPATE-NASH decides: a probability ≥75% means CSPH.'],
    ['A man with MASLD cirrhosis and no CSPH loses 12% of his weight, and two scans show his stiffness falling from 15 to 10 kPa. What may that mean?', 'A confirmed fall ≥30% may mean the fibrosis has regressed by ≥1 stage. The statement is for patients without CSPH.'],
    ['A man with MASLD cirrhosis and type 2 diabetes asks about a GLP-1 drug or an SGLT2 inhibitor. Can he take one, and does either treat the cirrhosis?', 'Yes, for their approved indications (diabetes; obesity for GLP-1 drugs). No drug is approved for MASLD cirrhosis itself.'],
  ],
  slides: [
    {
      id: 'under', preset: 'masld-csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV'], tool: PROFILE, key: ['hvpg', 'ppg'],
      vignette: 'A 57-year-old woman with MASH, type 2 diabetes and a BMI of 36 has a nodular liver, a large spleen and platelets of 82,000/µL. She has no ascites and has never bled.',
      caseQ: 'Will her HVPG show the whole portal gradient?',
      kicker: GAPS, site: 'sin', title: 'In obese MASLD cirrhosis the HVPG can read below the portal gradient', cite: 'Baveno VIII 2.5',
      line: 'Her HVPG is {hvpg}, yet the PPG is {ppg}. Resistance before the sinusoids lies upstream of the wedge, so the wedged pressure does not see it.',
      notes: 'Baveno VIII (2.5) says that in MASLD-related cACLD the HVPG may underestimate the true portal pressure gradient. The model reads that as extra resistance before the sinusoids, in the portal venules and the periportal scar: the wedged catheter reads the sinusoids and everything downstream of them, so it misses that part and the HVPG falls short of the PPG. That placement is the model\'s explanation, not a proven mechanism, and it exaggerates the case: in patients the gap is smaller and varies. The BMI and the diabetes are in the case only; the model has neither.',
      ask: ['Her HVPG is 11 mmHg and the PPG, read in the portal vein, is 14 mmHg. Why do they differ?', 'Part of the resistance lies before the sinusoids, which the wedged catheter does not read. The HVPG then under-reads the portal gradient.'],
    },
    {
      // (Her PPG split into its causes, as the Why? panel works them out: the step for resistance before the sinusoids is the part the wedge leaves out.)
      id: 'parts', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV'], tool: CAUSES, data: 'tiles', tiles: ['ppg', 'hvpg'], key: ['ppg', 'hvpg'],
      kicker: GAPS, site: 'sin', title: 'Part of her PPG is resistance the wedge cannot see', cite: 'Baveno VIII 2.5',
      line: 'Most of her PPG of {ppg} is the cirrhosis itself. The step for resistance before the sinusoids lies upstream of the wedge, so her HVPG of {hvpg} leaves it out.',
      notes: 'Each bar is one cause of her PPG, worked out by the model by taking that cause away. The largest step is the cirrhosis, the resistance in the sinusoids that the wedge reads. Baveno VIII (2.5) says that in MASLD-related cACLD the HVPG may underestimate the true portal pressure gradient. The model reads that as the step for presinusoidal fibrosis in the portal venules and the periportal scar: it adds to the PPG and the wedged catheter does not read it. That step is small beside the cirrhosis, and its placement is the model\'s reading of the statement, not a proven mechanism. The sizes of the steps are the model\'s own, not published figures.',
      ask: ['Which step of her PPG does the HVPG leave out?', 'The resistance before the sinusoids, in the portal venules and the periportal scar. The wedged catheter reads the sinusoids and everything downstream of them.'],
    },
    {
      id: 'still',
      cam: 'route', labels: ['CONF', 'SIN_R', 'RHV'], tool: PLANE, key: ['hvpg', 'ppg'],
      kicker: GAPS, site: 'sin', title: 'An HVPG ≥10 mmHg still carries the risk', cite: 'Baveno VIII 2.5',
      line: 'An HVPG of {hvpg} is {>=10 mmHg}, which goes with a clearly higher risk of decompensation. A lower HVPG carries a lower risk, but not none.',
      notes: 'Baveno VIII (2.5) adds that an HVPG of 10 mmHg or more remains associated with a significantly higher risk of decompensation than the lower, though still present, risk seen below 10 mmHg. Because the HVPG can under-read in MASLD, a measured value is the least the portal gradient can be, so a value just under 10 mmHg does not clear a patient. In a milder cirrhosis the HVPG can fall under 10 mmHg while the PPG stays high. On the plane, a dot above the dashed line is a PPG higher than the HVPG, and a dot to the right of the HVPG 10 line is CSPH whatever the PPG.',
      ask: ['In obese MASLD cirrhosis the HVPG is 8 mmHg. Does that exclude a raised portal gradient?', 'No. The HVPG can under-read, and the risk at an HVPG <10 mmHg is lower but still present.'],
    },
    {
      id: 'bmi', cam: 'liver', tool: SCAN, data: 'tiles', tiles: ['plt', 'ssm'], key: ['plt', 'ssm'],
      kicker: STIFF, site: 'sin', title: 'At a BMI ≥30, a model that adds the BMI decides, not the 25 kPa rule', cite: 'Baveno VIII 1.14, 1.16',
      line: 'Her stiffness is {lsm} and her platelets {plt}. The 25 kPa rule needs a BMI <30; a model that adds the BMI estimates the probability, and ≥75% means CSPH.',
      notes: 'The 25 kPa rule-in covers viral and alcohol-related disease and non-obese (BMI under 30) MASLD. In MASLD with obesity (BMI 30 or more) Baveno VIII uses ANTICIPATE-NASH, built on the stiffness, the platelets and the BMI, or NICER, to estimate the probability of CSPH, and calls it present at 75% or more. The model has no BMI, so it shows the stiffness and platelets and leaves the probability to the calculator. Stiffness 15 to 25 kPa is the indeterminate zone, where a model or a spleen stiffness settles it: a spleen stiffness above 55 kPa rules CSPH in (1.16). Hers is under that line, so the spleen stiffness tile does not settle her case.',
      ask: ['A man with MASH, a BMI of 36 and a stiffness of 27 kPa. Is CSPH ruled in?', 'Not by the 25 kPa rule, which is for a BMI <30. ANTICIPATE-NASH decides: ≥75% means CSPH.'],
    },
    {
      id: 'start', preset: 'cirr-comp', params: { cirrhosis: 0.45 }, cam: 'liver', tool: SCAN, data: 'tiles', tiles: ['plt', 'ssm'], key: ['plt'],
      vignette: 'A 50-year-old man with MASH cirrhosis and a BMI of 34 has a stiffness of 15 kPa and platelets of 160,000/µL. He has never had ascites or bleeding, and begins a diet and exercise program.',
      kicker: STIFF, site: 'sin', title: 'Without CSPH, a falling stiffness can be followed', cite: 'Baveno VIII 1.15, 2.6',
      line: 'In another patient, stiffness {lsm} with platelets {plt} rules CSPH out. Without CSPH, Baveno VIII reads a large, confirmed fall in stiffness as possible fibrosis regression.',
      notes: 'A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out (Baveno VIII 1.15). The statement on regression applies only in patients without CSPH: with CSPH, a falling stiffness is not read this way. Stiffness is measured fasting and confirmed on a repeat scan (1.4).',
      ask: ['Which patients does the regression statement cover?', 'Patients with MASLD-related cACLD without CSPH.'],
    },
    {
      id: 'regress', cutouts: ['lobule', 'sinusoid'], days: 365, ramp: { cirrhosis: [0.45, 0.35] }, lapse: { seconds: 8, from: 'Diet starts', to: 'One year later' }, cam: 'liver',
      tool: { kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 }, title: 'Body weight and stiffness over the year' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      kicker: STIFF, site: 'sin', title: 'Losing 12% of his weight can lower the stiffness by 30%', cite: 'Baveno VIII 2.13, 2.6',
      line: 'A year on, his stiffness has fallen from {lsm@start} to {lsm}. A confirmed fall of ≥30% may mean the fibrosis has regressed by ≥1 stage.',
      notes: 'In MASLD-related cACLD, a weight loss of 10% or more goes with a fall in stiffness of 30% or more (Baveno VIII 2.13). In patients without CSPH, a confirmed relative fall of 30% or more may indicate fibrosis regression of at least one stage (2.6), and combining it with an improving second test such as the ELF score makes the call more accurate (2.7). Baveno VIII prefers to read these changes as a change in the risk of liver-related events, not as a fibrosis stage (2.8, 2.9). In the model the scar eases evenly over the year; in patients the course is less regular. The 12% is the slide\'s own figure.',
      ask: ['His stiffness falls from 15 to 10 kPa on two scans, and he has no CSPH. What may that mean?', 'A confirmed fall of ≥30% may mean the fibrosis has regressed by ≥1 stage.'],
    },
    {
      // (Baveno VIII 2.14 to 2.16 on the flow-and-pressure plane: three of the model's patients, as they stand, from no CSPH to decompensated.)
      id: 'surgery', cam: 'fit', visual: 'plane', plane: 'flow-ppg',
      of: [{ preset: 'cirr-comp', name: 'No CSPH', short: 'No CSPH' }, { preset: 'masld-csph', name: 'CSPH', short: 'CSPH' }, { preset: 'cirr-decomp', name: 'Decompensated', short: 'Decomp.' }],
      kicker: STIFF, title: 'Weight-loss surgery gets riskier as the portal pressure rises', cite: 'Baveno VIII 2.14, 2.15, 2.16',
      line: 'Surgery adds only a modest risk without CSPH, needs an expert center with CSPH, and is generally contraindicated once the cirrhosis has decompensated.',
      notes: 'Baveno VIII 2.14: in MASLD-related cACLD without CSPH, metabolic and bariatric surgery adds only a modest risk of complications and may improve histology and liver-related events. That makes MASLD cACLD an obesity-associated condition that justifies considering surgery at a lower BMI threshold. 2.15: complications are more frequent with CSPH, so a patient with features of CSPH who is being considered for surgery goes to a multidisciplinary team in an expert center. 2.16: surgery is generally contraindicated in decompensated cirrhosis, except in highly specialized settings such as together with a liver transplant, and again the team and the center matter. The three dots are the model\'s patients on the flow-and-pressure plane as they stand; the plane does not predict surgical risk.',
      ask: ['A woman with MASLD cirrhosis and a BMI of 38 has varices and an HVPG of 12 mmHg. Can she have bariatric surgery?', 'Only after a multidisciplinary team in an expert center weighs it. Complications are more frequent with CSPH (Baveno VIII 2.15).'],
    },
    {
      id: 'drugs', cam: 'liver',
      tool: { kind: 'criteria', title: 'GLP-1 and SGLT2 drugs in cACLD', short: 'Drugs', ticks: false, lead: 'Safe for their approved indications.', rule: 'Baveno VIII 2.17, 2.19',
        rows: ['**Type 2 diabetes**: SGLT2 inhibitors and GLP-1 drugs', '**Obesity**: GLP-1 drugs', { text: '**MASLD cirrhosis**: no drug is approved', lit: true }], verdict: 'Lifestyle and the comorbidities come first.' },
      kicker: MORE, site: 'sin', title: 'The new drugs are safe in cACLD, but none treats the cirrhosis',
      line: 'SGLT2 inhibitors and GLP-1 drugs can be used safely in cACLD for their approved indications. No drug is approved for MASLD cirrhosis itself.',
      notes: 'Baveno VIII (2.19) says SGLT2 inhibitors and GLP-1-based therapies can be used safely in cACLD, absent contraindications, for their approved indications: type 2 diabetes, and obesity for the GLP-1 drugs. No regulator has approved a drug for MASLD with established cirrhosis, and efficacy data from patients without cirrhosis should not be carried over to it (2.17). Management therefore rests on lifestyle, the metabolic comorbidities, preventing decompensation and referral for trials (2.18). The model has no drug for this, so the card holds the rules. (Baveno VIII 2.17, 2.18, 2.19.)',
      ask: ['A patient with MASLD cirrhosis and type 2 diabetes is offered a GLP-1 drug. Is it safe, and is it a treatment for the cirrhosis?', 'It is safe for the diabetes. No drug is approved for MASLD cirrhosis itself.'],
    },
    {
      id: 'alcohol', preset: 'csph', params: { cirrhosis: 0.62 }, cam: 'liver', data: 'tiles', tiles: ['hvpg', 'lsm'], key: ['hvpg'],
      vignette: 'A 52-year-old man with MASH, type 2 diabetes and a BMI of 31 drinks four beers most evenings. He has compensated cirrhosis with small varices, no ascites and no history of bleeding.',
      kicker: MORE, site: 'sin', title: 'With alcohol on top, the advice is to stop, not to cut down', cite: 'Baveno VIII 2.1, 2.2, Table 3',
      line: 'In another patient with CSPH, drinking adds to the fatty liver disease. In alcohol-related disease Baveno VIII favors complete abstinence over reduction, and encourages it in all cirrhosis.',
      notes: 'Return to or continuation of alcohol use is a major driver of liver-related events in alcohol-related cACLD (Baveno VIII 2.1), and in that setting complete abstinence is favored over reduction (2.2). The statement is written for alcohol-related disease. For cirrhosis of any cause, a consensus statement that still stands from earlier Baveno meetings encourages abstinence (Table 3), so a man with MASH who drinks heavily is advised to stop. The model has no alcohol, so the numbers show his cirrhosis only.',
      ask: ['A man with MASH cirrhosis drinks four beers a night. Is cutting down enough?', 'No. Complete abstinence is favored over reduction, and encouraged in all cirrhosis.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'lsm', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'under', kicker: 'MASLD', title: 'Obese, HVPG under-reads' }, { id: 'start', kicker: 'MASLD', title: 'No CSPH, before weight loss' },
        { id: 'regress', kicker: 'MASLD', title: 'A year after 12% weight loss', vs: 'start' }, { id: 'alcohol', kicker: 'MASLD', title: 'With alcohol' }],
      kicker: 'Summary', title: 'In fatty liver the gradients, the rules and the habits change',
      line: 'The HVPG can read below the PPG, a BMI ≥30 changes the stiffness rule, and weight loss lowers the stiffness. Abstinence matters more than cutting down.',
      notes: 'In the first patient the PPG is higher than the HVPG because part of the resistance lies before the sinusoids. The second patient has no CSPH and loses weight, and his stiffness falls by more than 30%. The last patient drinks as well, and stopping is the advice. The BMI, the drugs and the alcohol are not in the model.',
      ask: ['Which reading in obese MASLD cirrhosis can be higher than the HVPG?', 'The PPG, read in the portal vein.'],
    },
  ],
};
