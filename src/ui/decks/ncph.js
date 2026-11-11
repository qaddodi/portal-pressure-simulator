// Presenter talk: presinusoidal portal hypertension (schistosomiasis and porto-sinusoidal vascular disorder),
// resistance in the portal tracts that the wedge and the stiffness both miss (the slide fields are described at the top
// of decks.js).

export const NCPH = {
  id: 'ncph', level: 'core', title: 'Presinusoidal portal hypertension', minutes: 8,
  objectives: [
    'Recognize portal hypertension with a working liver: varices, a big spleen, normal stiffness',
    'Explain why the HVPG is near normal in presinusoidal resistance',
    'Name the two main causes: schistosomiasis and porto-sinusoidal vascular disorder',
  ],
  checks: [
    ['Name the two main causes of presinusoidal portal hypertension.', 'Schistosomiasis and porto-sinusoidal vascular disorder.'],
    ['Why is the HVPG near normal?', 'The resistance lies before the sinusoids, so the wedge reads normal sinusoidal pressure. Only a PPG shows the gradient.'],
    ['Varices with a soft liver. What does that suggest?', 'Resistance before the sinusoids. Stiffness reflects scar and congestion, not portal pressure.'],
    ['Varices have bled, the stiffness is 6 kPa, the HVPG 4 mmHg and the portal vein is open on Doppler. Where is the resistance?', 'Before the sinusoids, in the portal venules: the wedge reads the normal sinusoids beyond them. Think of porto-sinusoidal vascular disorder or schistosomiasis.'],
  ],
  summary: 'Schistosomiasis and porto-sinusoidal vascular disorder: varices and a big spleen with a normal liver stiffness and a normal HVPG, because the resistance sits in the portal tracts.',
  slides: [
    {
      id: 'patient', preset: 'schisto', cam: 'fit', terms: ['varix', 'spleen'], normalOutline: ['spleen'], calipers: ['spleen'], data: 'tiles', tiles: ['varix', 'spleen', 'plt'], key: ['varix'],
      kicker: 'The patient', site: 'presin', title: 'Varices with normal liver function',
      vignette: 'A 27-year-old woman who grew up near Lake Victoria in Uganda is admitted with hematemesis. She has never had jaundice, and she does not drink alcohol.',
      line: 'A young adult with varices of {varix}, a spleen of {spleen} and platelets of {plt}, but no jaundice, no ascites and normal liver tests.',
      notes: 'This is the usual picture of non-cirrhotic portal hypertension: a first variceal bleed, or a large spleen found by chance, in a patient whose liver works normally. The bleed is usually well tolerated because the liver has reserve. Worldwide, schistosomiasis is a leading cause; where it is absent, porto-sinusoidal vascular disorder is the commonest intrahepatic cause.',
      ask: ['A patient bleeds from varices but has normal liver tests and no ascites. What should you think of?', 'Non-cirrhotic portal hypertension: pre-hepatic or presinusoidal resistance.'],
    },
    {
      id: 'tract', lens: 'drop', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad', sinusoids: 'lobule:sinusoid' }, data: 'tiles', tiles: ['pv', 'sin'], key: ['pv'],
      whatIf: { label: 'Periportal fibrosis', param: ['fibrosis.R.pre', 'fibrosis.L.pre'], min: 1, max: 80, step: 1, ends: ['None', 'Severe'] },
      kicker: 'Where the resistance sits', site: 'presin', title: 'The resistance is in the portal tracts',
      line: 'Schistosome eggs lodge in the portal venules; granulomas and scar narrow them, while the sinusoids beyond stay at {sin}.',
      notes: 'Schistosoma mansoni and japonicum live in the mesenteric veins, and their eggs are carried to the liver and trapped in the portal venules. Granulomas form around them and heal as periportal (pipestem) fibrosis. The sinusoids and the liver cells are spared, which is why liver function lasts and ascites is rare.',
      ask: ['Why does liver function last for years in schistosomiasis?', 'The resistance is in the portal venules; the sinusoids and liver cells are spared.'],
    },
    {
      id: 'wedge', cath: 'result', tool: { kind: 'profile' }, key: ['pv', 'whvp', 'hvpg'],
      kicker: 'Where the resistance sits', site: 'presin', title: 'The wedge reads normal sinusoids',
      line: 'The resistance lies before the sinusoids, so the HVPG is {hvpg}. Only a direct portal reading shows the gradient, a PPG of {ppg}.',
      notes: 'In presinusoidal resistance the HVPG is normal or only mildly raised and underestimates the portal pressure, often by a wide margin. A normal HVPG in a patient with varices or a large spleen points to a presinusoidal or pre-hepatic cause. The portal pressure itself can be measured directly, through the liver at TIPS or with an endoscopic ultrasound needle.',
      ask: ['Varices and a 17 cm spleen; Doppler shows an open portal vein. At the transjugular study the HVPG is 3 mmHg. What do you do before the catheter comes out?', 'Take a transjugular liver biopsy: clear portal hypertension with a normal HVPG points to a presinusoidal cause such as porto-sinusoidal vascular disorder.'],
    },
    {
      // (EUS-PPG, played step by step as on the HVPG talk's own slide: proc-anim.js MEASURES.eus. A measurement, so the model does not change;
      // the callouts read the live left portal and left hepatic veins of the patient already on the figure.)
      id: 'eus', procedure: 'eus', cam: 'liver', data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['ppg'],
      kicker: 'Where the resistance sits', site: 'presin', title: 'EUS-PPG reads the portal vein directly',
      line: 'An EUS-guided needle reads the portal and hepatic veins through the stomach. Here the gradient is {ppg}, while the wedge gave an HVPG of {hvpg}.',
      notes: 'Press Next to step through it: the scope in, the portal vein, the hepatic vein, and the gradient. A linear echoendoscope in the proximal stomach images the left lobe; a needle crosses into the left portal vein, then into the left hepatic vein, each read with a manometer, and EUS-PPG is the portal minus the hepatic vein pressure from one needle in one session. Because it reads the portal vein itself, it catches the presinusoidal resistance the wedge misses. The value of EUS-guided portal pressure gradient measurement in PSVD or NCPF is still a research question for Baveno VIII (RA8.18, RA8.24), so it is not a standard test; it is done in expert centers under sedation. The model does not change: the measurement reads the vessels as they are.',
      ask: ['Why can EUS-PPG find a pressure the wedge missed?', 'It reads the portal vein itself, upstream of a presinusoidal resistance; the wedge reads only the sinusoids.'],
    },
    {
      id: 'stiff', cam: 'liver', terms: ['liver'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm'], key: ['lsm'],
      kicker: 'Where the resistance sits', site: 'presin', title: 'Stiffness stays low despite high portal pressure',
      line: 'Stiffness reflects scar and congestion, not portal pressure, so it stays at {lsm}, which is <10 kPa. Varices with a soft liver point to a non-cirrhotic cause.',
      notes: 'Liver stiffness rises with scar and with congestion in the liver, so it stays normal or only slightly raised in presinusoidal and pre-hepatic disease. Stiffness below 10 kPa with clear signs of portal hypertension should prompt a search for a non-cirrhotic cause. Spleen stiffness, where it is measured, is high, because it follows the portal pressure; Baveno VIII counts a spleen stiffness >40 kPa as a specific sign of portal hypertension here (8.44). The liver stiffness and platelet rules that spare a scope do not apply in porto-sinusoidal vascular disorder: screen with endoscopy at diagnosis, unless the spleen stiffness is <40 kPa with a bilirubin <1 mg/dL (8.46, 8.47).',
      ask: ['Stiffness 6 kPa with large varices. Does that rule out portal hypertension?', 'No: it argues against cirrhosis. Portal hypertension with a normal stiffness points to a non-cirrhotic cause.'],
    },
    {
      id: 'psvd', preset: 'psvd', cam: 'lobule:triad', terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['hvpg', 'lsm'],
      kicker: 'Another patient', site: 'presin', title: 'Porto-sinusoidal vascular disorder narrows the portal venules',
      vignette: 'A 34-year-old man who has never left Europe has a large spleen and platelets of 76,000/µL. His liver tests are normal, his liver stiffness is 6 kPa, and he takes no drugs.',
      line: 'In another patient, with no schistosomes, the same picture comes from portal venules that narrow and vanish. A liver biopsy makes the diagnosis.',
      causesHead: 'Linked to', causes: ['Immune disorders', 'Thiopurines, oxaliplatin', 'HIV, didanosine', 'Thrombophilia'],
      notes: 'Porto-sinusoidal vascular disorder replaces older names such as idiopathic non-cirrhotic portal hypertension and hepatoportal sclerosis. It is linked to immune disorders and immunodeficiency, to thiopurines, oxaliplatin and didanosine, to HIV and to thrombophilia. The biopsy shows no cirrhosis, with obliterative portal venopathy, nodular regenerative hyperplasia or incomplete septal fibrosis. A new patient starts here, because schistosomiasis with hepatosplenic disease excludes the diagnosis (Baveno VIII Table S2). As in schistosomiasis, the HVPG and the stiffness are lower than the portal hypertension suggests. Portal vein thrombosis can coexist (8.40), so Doppler ultrasound is advised every 6 months once there are signs of portal hypertension (8.50).',
      ask: ['How is porto-sinusoidal vascular disorder diagnosed?', 'An adequate liver biopsy without cirrhosis, plus a specific sign of portal hypertension (varices, collaterals), or a specific lesion (obliterative portal venopathy, nodular regenerative hyperplasia, incomplete septal cirrhosis), or one non-specific sign with one non-specific lesion.'],
    },
    {
      // (The chart of the screening rules in PSVD or NCPF, lit for the PSVD patient of the slide before: Baveno VIII 8.46 to 8.48. The spleen stiffness is the model's; the bilirubin and
      // what the scope finds are the case's own. tool-path.js.)
      id: 'path-psvdscope', cam: 'liver', glow: ['liver'],
      tool: { kind: 'path', of: 'psvdscope', short: 'Scope path', patient: { bili: 0.8, v: 'small' } },
      kicker: 'Another patient', site: 'presin', title: 'In PSVD, spleen stiffness decides who needs a scope',
      line: 'A spleen stiffness of {ssm} calls for a scope at diagnosis. Only {<40 kPa} with a bilirubin {<1 mg/dL} spares it; the cirrhosis stiffness rules do not apply.',
      notes: 'In porto-sinusoidal vascular disorder (PSVD) and non-cirrhotic portal fibrosis (NCPF) the liver stiffness and platelet rules that spare a screening scope in cirrhosis must not be used (Baveno VIII 8.48). Screening for gastroesophageal varices is advised at diagnosis (8.46). It can be skipped, at diagnosis and in follow-up, only when the spleen stiffness is <40 kPa and the bilirubin is <1 mg/dL (<17 µmol/L), because varices are then unlikely (8.47); a patient at exactly 40 kPa or 1 mg/dL is not spared. When a scope is done, it is repeated every 2 years if it found no varices and every year if it found small ones (8.46). This patient has a spleen stiffness of about 60 kPa in the model, so the scope is due whatever the bilirubin. The bilirubin of 0.8 mg/dL and the small varices on the lower row are the slide\'s own assumptions, not the model\'s; the lower row only names the follow-up of a scope that found no varices or small ones.',
      ask: ['A patient with PSVD has a spleen stiffness of 35 kPa and a bilirubin of 1.3 mg/dL. Does he need a screening scope?', 'Yes. Sparing the scope takes both a spleen stiffness <40 kPa and a bilirubin <1 mg/dL.'],
    },
    {
      // (The diagnostic score of Baveno VIII Fig. 4, lit for this patient: a specific sign of portal hypertension (3) and a minor biopsy lesion (2) make 5, a definite
      // diagnosis. The biopsy and the associated conditions are the case's own, not the model's. tool-path.js.)
      id: 'path-psvdscore', cam: 'lobule:triad', glow: ['lobule:triad'],
      tool: { kind: 'path', of: 'psvdscore', short: 'Diagnostic score', patient: { sg: 0, hi: 1, ac: 1, cc: 1 } },
      kicker: 'Another patient', site: 'presin', title: 'A score of 5 makes the diagnosis',
      line: 'A spleen stiffness of {ssm} is a specific sign, worth 3. A minor lesion on the biopsy adds 2: a total of {>=5 points} is a definite diagnosis.',
      notes: 'This is the diagnostic score of Baveno VIII (Fig. 4, 8.42 to 8.44). It applies only when cirrhosis has been ruled out on an adequate liver biopsy (a specimen of 15 mm or more with a fragment of 10 mm or more, or one an expert pathologist finds adequate, 8.41) and no exclusion criterion is present. Clinical signs of portal hypertension score 3 if specific (medium or large esophageal varices, gastric varices, spontaneous portosystemic collaterals, or a spleen stiffness >40 kPa without a myeloproliferative neoplasm), 2 if non-specific (clinical ascites, small esophageal varices, platelets <150 × 10⁹/L, splenomegaly) and 0 if there is none. Histology scores 5 for a major lesion (nodular regenerative hyperplasia, muscularized portal venules, or stenosis of the portal venules in 50% or more of the portal tracts), 2 for a minor lesion (an abnormal distribution of the vascular structures, stenosis in 25% to 49% of the tracts, or regenerative changes without clear nodules) and 0 if normal; all three minor criteria together count as a major one (8.43). A condition known to be associated with PSVD adds 1, and a concomitant cause of cirrhosis takes away 1. A total of 5 or more is a definite PSVD or NCPF; 3 or 4 is possible, which calls for further tests such as a new biopsy or a stiffness, referral to an expert center in vascular liver disease and follow-up for new signs. On the slide the model gives the spleen stiffness; the biopsy and the associated conditions are the case\'s own facts.',
      ask: ['A patient has small varices and platelets of 120 × 10⁹/L, and his biopsy shows a major lesion. Is the diagnosis definite?', 'Yes. Non-specific signs score 2 and a major lesion 5, a total of 7, which is ≥5. A score of 3 or 4 would be only possible.'],
    },
    {
      // (Baveno VIII 8.12, 8.13, 8.49, 8.50 and 8.53: what is done for the PSVD patient of the slide before.)
      id: 'psvd-care', cam: 'liver', glow: ['liver'], data: 'tiles', tiles: ['ssm', 'plt'], key: ['ssm'],
      tool: { kind: 'criteria', title: 'Caring for PSVD', short: 'PSVD care', ticks: false, lead: 'After the diagnosis.', rule: 'Baveno VIII 8.12, 8.13, 8.49, 8.53',
        rows: ['A bleed: **same care** as in cirrhosis', '**TIPS** for bleeding that recurs or will not stop', '**Imaging** of the portal veins at diagnosis', '**Transplant** for severe, refractory complications'], verdict: 'Every 6 months: Doppler for a clot (8.50).' },
      kicker: 'Another patient', site: 'presin', title: 'If a PSVD varix bleeds, care follows the cirrhosis rules',
      line: 'If he bleeds, acute care and prevention follow the cirrhosis rules. A TIPS is for bleeding that recurs or will not stop, and a transplant for severe complications.',
      notes: 'Baveno VIII 8.12: in vascular liver disease with acute portal-hypertensive bleeding, the first care and the secondary prophylaxis follow the guidelines for cirrhosis. 8.8 and 8.9: there is no evidence to favor banding over a beta-blocker, or carvedilol over another non-selective beta-blocker. 8.13: a TIPS should be considered for bleeding that is refractory or recurrent. 8.14: there are no data for a pre-emptive TIPS. 8.49: at diagnosis, contrast-enhanced cross-sectional imaging shows the portal veins, any collaterals or hepatic veno-venous communications and any nodules. 8.50: with signs of portal hypertension, a Doppler every 6 months looks for a portal vein clot. 8.53: consider a transplant for severe, refractory complications of portal hypertension, hepatopulmonary syndrome, liver cancer or advanced liver dysfunction, discussed in a center with vascular liver disease expertise.',
      ask: ['A man with PSVD bleeds from varices again despite a beta-blocker and banding. What comes next?', 'A TIPS should be considered for bleeding that recurs or is refractory (Baveno VIII 8.13).'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from none to severe, each point settled for a year, the PPG and the spleen
      // read against the stiffness. The ring is the schistosomiasis patient, far above the line; the point is cirrhosis with CSPH.)
      id: 'relation', preset: 'schisto', cam: 'fit', terms: ['varix', 'spleen'],
      tool: { kind: 'curve', x: 'lsm', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['ppg', 'spleen'],
        dots: [{ preset: 'csph', name: 'Cirrhosis, CSPH' }] },
      kicker: 'Summary', site: 'presin', title: 'Stiffness and the PPG rise together only in cirrhosis',
      line: 'Along the line, cirrhosis raises stiffness, PPG and spleen together. The schistosomiasis patient has a PPG of {ppg} and a spleen of {spleen}, yet a stiffness of only {lsm}.',
      notes: 'The line is the model\'s cirrhosis from none to severe, each point settled for a year: stiffness on the x axis, the PPG and the spleen length against it. In cirrhosis the three rise together; the point marks cirrhosis with CSPH. The ring is the schistosomiasis patient: a PPG of 16 mmHg and a spleen of 17 cm at a stiffness of 6 kPa, where the cirrhosis line has a PPG of about 5 mmHg and a spleen of about 11 cm. The resistance sits before the sinusoids, so the liver stays soft while the pressure behind the portal tracts climbs. Porto-sinusoidal vascular disorder gives the same picture. The dashes mark 10 kPa: a stiffness <10 kPa with signs of portal hypertension points to vascular liver disease. (Baveno VIII 1.6; EASL 2025: stiffness normal or only slightly raised in porto-sinusoidal vascular disorder and chronic portal vein thrombosis.) One model patient per point; real patients vary far more.',
      ask: ['A patient has large varices, a spleen of 17 cm and a stiffness of 6 kPa. Is that cirrhosis?', 'No. The stiffness is far from the cirrhosis line. Portal hypertension with a soft liver points to resistance before the sinusoids.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'lsm', 'spleen'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'patient', kicker: 'Presinusoidal', title: 'Schistosomiasis' },
        { preset: 'csph', kicker: 'Sinusoidal', title: 'Cirrhosis with CSPH' }],
      kicker: 'Summary', title: 'Presinusoidal resistance versus cirrhosis',
      line: 'Both have a high PPG and a big spleen. Only cirrhosis raises the HVPG and liver stiffness.',
      notes: 'Suspect a non-cirrhotic cause when signs of portal hypertension come with normal liver tests, a normal or near-normal stiffness and a low HVPG. Image the portal vein, ask about travel and drugs, and take a biopsy. Variceal bleeding is managed as in cirrhosis (Baveno VIII 8.12), and TIPS should be considered for bleeding that recurs or does not stop (8.13).',
      ask: ['Which two tests are falsely reassuring in presinusoidal portal hypertension?', 'The HVPG and the liver stiffness.'],
    },
  ],
};
