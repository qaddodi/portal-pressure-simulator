// Presenter talk: presinusoidal portal hypertension (schistosomiasis and porto-sinusoidal vascular disorder),
// resistance in the portal tracts that the wedge and the stiffness both miss (the slide fields are described at the top
// of decks.js).

const BAND = { kind: 'band' };

export const NCPH = {
  id: 'ncph', level: 'core', title: 'Presinusoidal portal hypertension', minutes: 9,
  objectives: [
    'Recognize portal hypertension with a working liver: varices, a big spleen, normal stiffness',
    'Explain why the HVPG is near normal in presinusoidal resistance',
    'Name the two main causes: schistosomiasis and porto-sinusoidal vascular disorder',
    'Treat the varices as in cirrhosis',
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
      kicker: 'Where the resistance sits', site: 'presin', title: 'The resistance is in the portal tracts',
      line: 'Schistosome eggs lodge in the small portal venules; granulomas and scar narrow them, while the sinusoids beyond stay at {sin}. Colored by pressure drop, the large drop sits in the portal venules.',
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
      line: 'Stiffness reflects scar and congestion, not portal pressure, so it stays at {lsm}, under 10 kPa. Varices with a soft liver point to a non-cirrhotic cause.',
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
      id: 'nsbb', params: { drugs: { propranolol: true } }, cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'hr'], key: ['pv'], cite: 'Baveno VIII 8.9',
      kicker: 'Treatment', site: 'presin', title: 'A beta-blocker works here too',
      line: 'Propranolol cuts gut inflow: portal vein pressure falls to {pv}. EASL 2025 and Baveno VIII see no proven advantage for carvedilol when resistance is presinusoidal.',
      caveat: 'In the model, its extra effect is sinusoidal; here it mostly lowers blood pressure.',
      notes: 'Bleeding prophylaxis in non-cirrhotic portal hypertension follows the rules for cirrhosis: a non-selective beta-blocker or banding for large varices, and both after a bleed. In schistosomiasis, praziquantel treats the infection, but established portal hypertension still needs its own treatment.',
      ask: ['Is variceal prophylaxis any different here from cirrhosis?', 'No: a non-selective beta-blocker or banding, as in cirrhosis, because the varices come from the same high portal pressure.'],
    },
    {
      id: 'band', terms: ['varix'], action: [BAND, BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix'], key: ['varix'],
      kicker: 'Treatment', site: 'presin', title: 'Banding closes the varices',
      line: 'Banding is repeated every two to four weeks until the varices are gone. Here they are down to {varix}. The beta-blocker continues. Because liver function is good, survival after a bleed is much better than in cirrhosis.',
      notes: 'After a bleed, banding is repeated until the varices are eradicated and is combined with the beta-blocker. Because the liver works well, survival after a bleed is far better than in cirrhosis. A TIPS or a surgical shunt is kept for bleeding that recurs despite this.',
      ask: ['After a bleed, how often are the bands repeated, and until when?', 'Every two to four weeks until the varices are gone, with the beta-blocker, because banding treats the varix, not the pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'lsm', 'spleen'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'patient', kicker: 'Presinusoidal', title: 'Schistosomiasis' },
        { preset: 'csph', kicker: 'Sinusoidal', title: 'Cirrhosis with CSPH' }, { id: 'band', kicker: 'Presinusoidal', title: 'After treatment' }],
      kicker: 'Summary', title: 'Presinusoidal resistance versus cirrhosis',
      line: 'Both have a high PPG and a big spleen. Only cirrhosis raises the HVPG and liver stiffness.',
      notes: 'Suspect a non-cirrhotic cause when signs of portal hypertension come with normal liver tests, a normal or near-normal stiffness and a low HVPG. Image the portal vein, ask about travel and drugs, and take a biopsy. The varices are treated exactly as in cirrhosis.',
      ask: ['Which two tests are falsely reassuring in presinusoidal portal hypertension?', 'The HVPG and the liver stiffness.'],
    },
  ],
};
