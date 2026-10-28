// Presenter talk: six unnamed patients, each read from the pressure ladder before the answer (the slide fields are described at
// the top of decks.js). Each case is two slides: the case and its readings with the question, then the same patient
// named, with the level on the rail and Pressure / Pressure drop buttons, so one tap lights where the pressure is lost.

const LENS = [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Pressure drop', lens: 'drop' }];
// The six answers in the order of the levels, from the portal vein to the heart.
const SIX = [{ id: 'a2', kicker: 'Case 2', title: 'Portal vein thrombosis' }, { id: 'a5', kicker: 'Case 5', title: 'Schistosomiasis' },
  { id: 'a1', kicker: 'Case 1', title: 'Cirrhosis' }, { id: 'a4', kicker: 'Case 4', title: 'Sinusoidal obstruction', name: 'Sinusoidal obstr. synd.' },
  { id: 'a6', kicker: 'Case 6', title: 'IVC web' }, { id: 'a3', kicker: 'Case 3', title: 'Constrictive pericarditis' }];

export const WHERE = {
  id: 'where-resistance', level: 'advanced', title: 'Where is the resistance?', minutes: 12,
  summary: 'Six unnamed patients. Read each case and its pressure ladder, place the resistance, then one tap shows where the pressure is lost.',
  sections: [['Cases 1 to 3', ['Case 1', 'Case 2', 'Case 3']], ['Cases 4 to 6', ['Case 4', 'Case 5', 'Case 6']], ['Telling them apart', ['Telling them apart']]],
  objectives: ['Place the resistance from a short case and its pressure ladder', 'Tell pre-hepatic from presinusoidal resistance when the HVPG is normal', 'Tell an IVC web from heart disease when both gradients are normal'],
  checks: [
    ['The portal pressure is high, the HVPG is normal and Doppler shows an open portal vein. Where is the resistance?', 'Presinusoidal, in the portal venules, as in schistosomiasis. A clot in the portal vein would show no flow there.'],
    ['The portal pressure is high but the HVPG and the PPG are both normal. Which reading tells an IVC web from heart disease?', 'The right atrial pressure: normal above a web, high in heart disease.'],
    ['Ascites has a SAAG of 1.5 and a protein of 4.2 g/dL. Which levels fit?', 'Postsinusoidal, post-hepatic or cardiac: the sinusoids are congested from behind and leak protein-rich fluid.'],
    ['The HVPG is raised and the ascites has a SAAG of 1.5 with a protein of 4.2 g/dL. Cirrhosis or sinusoidal obstruction syndrome?', 'Sinusoidal obstruction syndrome. In cirrhosis the closed fenestrae keep protein in the blood, so the ascitic protein is <2.5 g/dL; here the sinusoids still leak it.'],
  ],
  slides: [
    {
      id: 'a1', preset: 'csph', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      vignette: 'A 57-year-old man treated for hepatitis C ten years ago has small esophageal varices on EGD. His platelets are 88,000/µL, his liver stiffness is 24 kPa, and there is no ascites.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 1', site: 'sin', title: 'Case 1: the resistance is in the sinusoids',
      line: 'Cirrhosis after hepatitis C. The fall sits inside the HVPG bracket, so the HVPG, {hvpg}, carries almost the whole PPG. Colored by pressure drop, the sinusoids stand out.',
      notes: 'Tap Pressure drop: the sinusoids light up and the veins before and after them stay pale. In cirrhosis the wedged pressure tracks the portal pressure, so the HVPG is a fair measure of the whole gradient. The low platelets, the stiffness and the varices all follow from that one level.',
      ask: ['Why does the wedged pressure track the portal pressure here?', 'The resistance is in the sinusoids, which the wedged catheter reads.'],
    },
    {
      id: 'a2', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 24-year-old woman who had an umbilical vein catheter as a newborn vomits blood. EGD shows esophageal varices. Her spleen is large, her platelets are 76,000/µL, and her liver tests are normal.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 2', site: 'pre', title: 'Case 2: the resistance is before the liver',
      line: 'Portal vein thrombosis with a cavernoma. The fall comes at the clot, before the wedge, so the HVPG stays at {hvpg}. Colored by pressure drop, the clot stands out.',
      notes: 'Umbilical vein catheterization in the newborn is a classic cause of portal vein thrombosis in childhood. The cavernoma carries some blood to the liver, but not enough to bring the pressure down. The liver itself is normal, so its tests are normal and ascites is rare.',
      ask: ['Why does a clot in the portal vein leave the HVPG normal?', 'The wedge reads the sinusoids, which are normal; the fall comes upstream of them, at the clot.'],
    },
    {
      id: 'a3', preset: 'constrictive', cam: 'heart', labels: ['IVCS', 'RA'], compare: LENS, tool: { kind: 'profile' }, key: ['ra', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 61-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has leg edema and ascites. His JVP rises on inspiration. The ascites has a SAAG of 1.5 and protein of 4.1 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 3', site: 'cardiac', title: 'Case 3: the resistance is in the heart',
      line: 'Constrictive pericarditis. The stiff pericardium raises the [right atrial pressure](ra), and every vein behind it rises with it. Colored by pressure drop, no vessel stands out.',
      notes: 'Tap Pressure drop: nothing lights up, because no vessel between the gut and the heart carries the resistance. The heart cannot fill, so the right atrial pressure is high and the liver is congested. The ascites is protein-rich. Varices are rare, because the portal and systemic veins are both high.',
      ask: ['Why are varices rare in this case?', 'Varices need a gradient from the portal to the systemic veins, and both are high.'],
    },
    {
      id: 'a4', preset: 'sos', cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      vignette: 'A 44-year-old woman has drunk a comfrey tea every day for months. Over 3 weeks she has developed tender hepatomegaly, weight gain and ascites, with a SAAG of 1.5 and a protein of 4.2 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 4', site: 'postsin', title: 'Case 4: the resistance is just after the sinusoids',
      line: 'Sinusoidal obstruction syndrome. Comfrey\'s alkaloids damage the sinusoids and small central veins, upstream of the catheter tip, so the HVPG rises. Colored by pressure drop, the central veins stand out.',
      notes: 'Pyrrolizidine alkaloids in some herbal and bush teas injure the sinusoidal endothelium, as myeloablative conditioning does. The congested sinusoids leak protein-rich fluid. The wedged catheter still reads behind the resistance, so the HVPG rises as it does in cirrhosis.',
      ask: ['What separates this case from case 1?', 'A short history after a toxin, and protein-rich ascites; on the ladder the fall also sits one station later.'],
    },
    {
      id: 'a5', preset: 'schisto', cam: 'lobule:triad', terms: { 'portal venules': 'lobule:triad' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 33-year-old man who fished in Lake Victoria as a boy vomits blood. EGD shows large esophageal varices. His spleen is large, his platelets are 70,000/µL, and his liver stiffness is 6.6 kPa.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 5', site: 'presin', title: 'Case 5: the resistance is before the sinusoids',
      line: 'Schistosomiasis. Eggs lodge in the portal venules, before the sinusoids, so the HVPG stays at {hvpg} with an open portal vein. Colored by pressure drop, the venules stand out.',
      notes: 'Schistosoma mansoni is common around Lake Victoria. Its eggs reach the portal venules, and periportal fibrosis follows. The liver cells are spared, so the tests, the stiffness and the albumin stay near normal. Cases 2 and 5 share their HVPG and PPG; at the catheter only the open portal vein tells them apart. The ladder shows the difference: the fall sits at the clot in case 2 and in the portal venules here.',
      ask: ['Cases 2 and 5 share their HVPG and PPG. What tells them apart?', 'The portal vein: occluded in case 2, open in case 5. On the ladder the fall sits at the clot in case 2 and in the portal venules in case 5.'],
    },
    {
      id: 'a6', preset: 'ivc-web', cam: 'hepatic', labels: ['IVCS', 'RA'], mark: { edges: ['IVCS_RA'], label: 'Web' }, compare: LENS, tool: { kind: 'profile' }, key: ['ivc', 'ra', 'ppg'], rail: true,
      vignette: 'A 36-year-old man from Nepal has had swollen legs for a year and now has ascites. Dilated veins run up his flanks. The ascites has a SAAG of 1.4 and a protein of 4.3 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 6', site: 'post', title: 'Case 6: the resistance is after the liver',
      line: 'An IVC web. The fall lies between the IVC and the [right atrium](ra), which the PPG misses. Colored by pressure drop, the narrowed IVC stands out.',
      notes: 'A membranous web of the suprahepatic IVC is a common cause of hepatic venous outflow obstruction in South Asia. The liver drains into a high-pressure IVC, so the sinusoids are congested and the ascites is protein-rich. A normal PPG with a high portal pressure means the resistance lies at or beyond the IVC: compare the IVC with the right atrium.',
      ask: ['Why does the PPG miss the web?', 'The PPG subtracts the IVC pressure, which is measured below the web and is high too.'],
    },
    {
      id: 'ladders', cam: 'fit', visual: 'ladders', of: SIX,
      kicker: 'Telling them apart', title: 'Six ladders, six levels of resistance',
      line: 'From the portal vein to the heart, the largest fall moves one level at a time.',
      notes: 'Read the ladders in order of level. Case 2: the fall comes at the clot, before the liver; case 5: in the portal venules. Both lie before the wedge, so only the PPG sees them, and at the bedside Doppler of the portal vein tells them apart. Cases 1 and 4: the fall lies inside the HVPG bracket, which the HVPG measures. Case 6: the fall lies between the IVC and the atrium, which neither gradient includes. Case 3: there is no fall at all.',
      ask: ['Which two cases did neither gradient find?', 'Case 6, the IVC web, and case 3, the heart.'],
    },
    {
      // (The relation chart before the summary: each case's portal pressure across and its HVPG up. The portal pressure is high in
      // all six; the HVPG only where the resistance lies in the sinusoids or just past them.)
      id: 'relation', cam: 'fit', visual: 'plane',
      plane: { x: { key: 'pv', min: 0, max: 30, ticks: [0, 10, 20, 30], name: 'Portal vein pressure, mmHg', short: 'Portal, mmHg' },
        y: { key: 'hvpg', min: 0, max: 20, ticks: [0, 5, 10, 20], name: 'HVPG, mmHg' },
        zones: [{ when: [['hvpg', '<', 5]], t: 'HVPG normal', tone: 'ok' }, { t: 'HVPG raised', tone: 'hvpg' }], cuts: { y: [5] }, key: 'never' },
      of: [{ preset: 'healthy', name: 'Healthy' }, { id: 'a2', name: 'Portal vein thrombosis', short: 'PVT' }, { id: 'a5', name: 'Schistosomiasis', short: 'Schisto' },
        { id: 'a1', name: 'Cirrhosis' }, { id: 'a4', name: 'Sinusoidal obstruction', short: 'SOS' }, { id: 'a6', name: 'IVC web' }, { id: 'a3', name: 'Constrictive pericarditis', short: 'Pericarditis' }],
      kicker: 'Summary', title: 'The portal pressure is high in all six; the HVPG finds two',
      line: 'Every case sits right of the healthy liver. Only cirrhosis and sinusoidal obstruction reach an HVPG ≥5 mmHg: their resistance lies inside the wedge\'s bracket.',
      notes: 'Each case is a point: its portal vein pressure across, its HVPG up. All six have portal hypertension, but the HVPG reads only the fall between the wedged and the free hepatic pressure. A clot or schistosomiasis lies before the wedge, the IVC web and the pericardium after the hepatic veins, so their HVPG stays normal. A normal HVPG with varices or a high portal pressure sends you to the PPG, the IVC and the right atrium. (AASLD 2024 Table 1 and p. 1181; Baveno VIII Table 3; EASL 2025: the HVPG misses the portal hypertension of PSVD and portal vein thrombosis.)',
      ask: ['A patient has varices and an HVPG of 3 mmHg. Does that rule out portal hypertension?', 'No. The resistance may lie before the sinusoids, in the IVC or in the heart: read the PPG and the right atrium.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: true, of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, ...SIX],
      kicker: 'Summary', title: 'The largest fall on the ladder names the level',
      line: 'The HVPG sees only sinusoidal and postsinusoidal resistance. A high portal pressure with a normal PPG points to the IVC or the heart.',
      notes: 'The HVPG reads the drop across the sinusoids and central veins. The PPG adds the portal vein and the portal venules but stops at the IVC. When both are normal and the portal pressure is high, compare the IVC with the right atrium. The SAAG and protein columns add one more clue: protein-rich ascites comes from congestion behind the sinusoids.',
      ask: ['A patient has varices, a normal HVPG and a high PPG. What test comes next?', 'Doppler of the portal vein: a clot means pre-hepatic, an open vein means presinusoidal.'],
    },
  ],
};
