// Presenter talk: presinusoidal portal hypertension (schistosomiasis and porto-sinusoidal vascular disorder),
// resistance in the portal tracts that the wedge and the stiffness both miss (the slide fields are described at the top
// of decks.js).

export const NCPH = {
  id: 'ncph', level: 'core', title: 'Presinusoidal portal hypertension', minutes: 7,
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
      line: 'Schistosome eggs lodge in the portal venules; granulomas and scar narrow them, while the sinusoids beyond stay at {sin}. Colored by pressure drop, the drop sits in the portal venules.',
      notes: 'Schistosoma mansoni and japonicum live in the mesenteric veins, and their eggs are carried to the liver and trapped in the portal venules. Granulomas form around them and heal as periportal (pipestem) fibrosis. The sinusoids and the liver cells are spared, which is why liver function lasts and ascites is rare.',
      ask: ['Why does liver function last for years in schistosomiasis?', 'The resistance is in the portal venules; the sinusoids and liver cells are spared.'],
    },
    {
      id: 'wedge', cath: 'result', tool: { kind: 'profile' }, key: ['pv', 'whvp', 'hvpg'],
      compare: [{ label: 'Schistosomiasis', own: true }, { label: 'Cirrhosis', preset: 'cirr-comp' }],
      kicker: 'Where the resistance sits', site: 'presin', title: 'The wedge reads normal sinusoids',
      line: 'The resistance lies before the sinusoids, so the HVPG is {hvpg}. Only a direct portal reading shows the gradient, a PPG of {ppg}.',
      notes: 'In presinusoidal resistance the HVPG is normal or only mildly raised and underestimates the portal pressure, often by a wide margin. A normal HVPG in a patient with varices or a large spleen points to a presinusoidal or pre-hepatic cause. The portal pressure itself can be measured directly, through the liver at TIPS or with an endoscopic ultrasound needle.',
      ask: ['Varices and a 17 cm spleen; Doppler shows an open portal vein. At the transjugular study the HVPG is 3 mmHg. What do you do before the catheter comes out?', 'Take a transjugular liver biopsy: clear portal hypertension with a normal HVPG points to a presinusoidal cause such as porto-sinusoidal vascular disorder.'],
    },
    {
      id: 'stiff', cam: 'liver', terms: ['liver'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm'], key: ['lsm'],
      kicker: 'Where the resistance sits', site: 'presin', title: 'Stiffness stays low despite high portal pressure',
      line: 'Stiffness reflects scar and congestion, not portal pressure, so it stays at {lsm}, which is <10 kPa. Varices with a soft liver point to a non-cirrhotic cause.',
      notes: 'Liver stiffness rises with scar and with congestion in the liver, so it stays normal or only slightly raised in presinusoidal and pre-hepatic disease. Stiffness below 10 kPa with clear signs of portal hypertension should prompt a search for a non-cirrhotic cause. Spleen stiffness, where it is measured, is high, because it follows the portal pressure. The stiffness and platelet rules that spare a scope do not apply in porto-sinusoidal vascular disorder: screen with endoscopy at diagnosis.',
      ask: ['Stiffness 6 kPa with large varices. Does that rule out portal hypertension?', 'No: it argues against cirrhosis. Portal hypertension with a normal stiffness points to a non-cirrhotic cause.'],
    },
    {
      id: 'psvd', cam: 'lobule:triad', terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['hvpg', 'lsm'],
      kicker: 'Where the resistance sits', site: 'presin', title: 'Porto-sinusoidal vascular disorder narrows the portal venules',
      line: 'Without schistosomes, the same picture comes from portal venules that narrow and vanish. A liver biopsy makes the diagnosis.',
      causesHead: 'Linked to', causes: ['Immune disorders', 'Thiopurines, oxaliplatin', 'HIV, didanosine', 'Thrombophilia'],
      notes: 'Porto-sinusoidal vascular disorder replaces older names such as idiopathic non-cirrhotic portal hypertension and hepatoportal sclerosis. It is linked to immune disorders and immunodeficiency, to thiopurines, oxaliplatin and didanosine, to HIV and to thrombophilia. The biopsy shows no cirrhosis, with obliterative portal venopathy, nodular regenerative hyperplasia or incomplete septal fibrosis. As in schistosomiasis, the HVPG and the stiffness are lower than the portal hypertension suggests, and portal vein thrombosis is a common complication.',
      ask: ['How is porto-sinusoidal vascular disorder diagnosed?', 'An adequate liver biopsy without cirrhosis, plus a specific sign of portal hypertension (varices, collaterals), or a specific lesion (obliterative portal venopathy, nodular regenerative hyperplasia, incomplete septal cirrhosis), or one non-specific sign with one non-specific lesion.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from none to severe, each point settled for a year, the PPG and the spleen
      // read against the stiffness. The ring is the schistosomiasis patient, far above the line; the point is cirrhosis with CSPH.)
      id: 'relation', preset: 'schisto', cam: 'fit', terms: ['varix', 'spleen'],
      tool: { kind: 'curve', x: 'lsm', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['ppg', 'spleen'],
        dots: [{ preset: 'csph', name: 'Cirrhosis, CSPH' }] },
      kicker: 'Summary', site: 'presin', title: 'Stiffness and the PPG rise together only in cirrhosis',
      line: 'Along the line, cirrhosis raises stiffness, PPG and spleen together. The schistosomiasis patient has a PPG of {ppg} and a spleen of {spleen}, yet a stiffness of only {lsm}.',
      notes: 'The line is the model\'s cirrhosis from none to severe, each point settled for a year: stiffness on the x axis, the PPG and the spleen length against it. In cirrhosis the three rise together; the point marks cirrhosis with CSPH. The ring is the schistosomiasis patient: a PPG of 16 mmHg and a spleen of 17 cm at a stiffness of 6 kPa, where the cirrhosis line has a PPG of about 5 mmHg and a spleen of about 11 cm. The resistance sits before the sinusoids, so the liver stays soft while the pressure behind the portal tracts climbs. Porto-sinusoidal vascular disorder gives the same picture. The dashes mark 10 kPa: a stiffness <10 kPa with signs of portal hypertension points to vascular liver disease. (Baveno VIII 1.6; EASL 2025: stiffness normal or only slightly raised in porto-sinusoidal vascular disorder and chronic portal vein thrombosis.)',
      ask: ['A patient has large varices, a spleen of 17 cm and a stiffness of 6 kPa. Is that cirrhosis?', 'No. The stiffness is far from the cirrhosis line. Portal hypertension with a soft liver points to resistance before the sinusoids.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'lsm', 'spleen'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'patient', kicker: 'Presinusoidal', title: 'Schistosomiasis' },
        { preset: 'csph', kicker: 'Sinusoidal', title: 'Cirrhosis with CSPH' }],
      kicker: 'Summary', title: 'Presinusoidal resistance versus cirrhosis',
      line: 'Both have a high PPG and a big spleen. Only cirrhosis raises the HVPG and liver stiffness.',
      notes: 'Suspect a non-cirrhotic cause when signs of portal hypertension come with normal liver tests, a normal or near-normal stiffness and a low HVPG. Image the portal vein, ask about travel and drugs, and take a biopsy. The varices are treated exactly as in cirrhosis.',
      ask: ['Which two tests are falsely reassuring in presinusoidal portal hypertension?', 'The HVPG and the liver stiffness.'],
    },
  ],
};
