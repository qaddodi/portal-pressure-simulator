// Presenter talk: six unnamed patients, each read from the pressure ladder before the answer (the slide fields are described at
// the top of decks.js). Each case is two slides: the case and its readings with the question, then the same patient
// named, with the level on the rail and Pressure / Pressure drop buttons, so one tap lights where the pressure is lost.

const LENS = [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Pressure drop', lens: 'drop' }];
const ROUTE = ['CONF', 'SIN_R', 'RHV', 'IVCS', 'RA'];
// The six answers in the order of the levels, from the portal vein to the heart.
const SIX = [{ id: 'a2', kicker: 'Case 2', title: 'Portal vein thrombosis' }, { id: 'a5', kicker: 'Case 5', title: 'Schistosomiasis' },
  { id: 'a1', kicker: 'Case 1', title: 'Cirrhosis' }, { id: 'a4', kicker: 'Case 4', title: 'Sinusoidal obstruction', name: 'Sinusoidal obstr. synd.' },
  { id: 'a6', kicker: 'Case 6', title: 'IVC web' }, { id: 'a3', kicker: 'Case 3', title: 'Constrictive pericarditis' }];

export const WHERE = {
  id: 'where-resistance', level: 'advanced', title: 'Where is the resistance?', minutes: 15,
  summary: 'Six unnamed patients. Read each case and its pressure ladder, place the resistance, then one tap shows where the pressure is lost.',
  sections: [['Cases 1 to 3', ['Case 1', 'Case 2', 'Case 3']], ['Cases 4 to 6', ['Case 4', 'Case 5', 'Case 6']], ['Telling them apart', ['Telling them apart']]],
  objectives: ['Place the resistance from a short case and its pressure ladder', 'Tell pre-hepatic from presinusoidal resistance when the HVPG is normal', 'Tell an IVC web from heart disease when both gradients are normal'],
  checks: [
    ['The portal pressure is high, the HVPG is normal and Doppler shows an open portal vein. Where is the resistance?', 'Presinusoidal, in the portal venules, as in schistosomiasis. A clot in the portal vein would show no flow there.'],
    ['The portal pressure is high but the HVPG and the PPG are both normal. Which reading tells an IVC web from heart disease?', 'The right atrial pressure: normal above a web, high in heart disease.'],
    ['Ascites has a SAAG of 1.5 and a protein of 4.2 g/dL. Which levels fit?', 'Postsinusoidal, post-hepatic or cardiac: the sinusoids are congested from behind and leak protein-rich fluid.'],
  ],
  slides: [
    {
      id: 'q1', hold: true, preset: 'csph', cam: 'route', labels: ROUTE, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      vignette: 'A 57-year-old man treated for hepatitis C ten years ago has small esophageal varices on EGD. His platelets are 88,000/µL, his liver stiffness is 24 kPa, and there is no ascites.',
      kicker: 'Case 1', title: 'Where is the resistance in case 1?',
      line: 'The portal pressure is {pv}. Read the ladder from the portal vein to the right atrium and find the largest fall: the HVPG is {hvpg} and the PPG is {ppg}.',
      notes: 'Give the room a minute with the ladder before moving on. Ask where the pressure falls most steeply, and which of the two gradients carries that fall. The case points one way; the ladder should agree.',
      ask: ['Which two stations is the largest fall between?', 'The sinusoids and the central veins: the fall lies inside the HVPG bracket, so almost all of the PPG is HVPG.'],
    },
    {
      id: 'a1', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      kicker: 'Case 1', site: 'sin', title: 'Case 1: the resistance is in the sinusoids',
      line: 'Cirrhosis after hepatitis C. The fall runs from the sinusoids to the central veins, inside the HVPG bracket, so the HVPG, {hvpg}, carries almost the whole PPG. Colored by pressure drop, the sinusoids stand out.',
      notes: 'Tap Pressure drop: the sinusoids light up and the veins before and after them stay pale. In cirrhosis the wedged pressure tracks the portal pressure, so the HVPG is a fair measure of the whole gradient. The low platelets, the stiffness and the varices all follow from that one level.',
      ask: ['Why does the wedged pressure track the portal pressure here?', 'The resistance is in the sinusoids, which the wedged catheter reads.'],
    },
    {
      id: 'q2', hold: true, preset: 'pvt-chronic', cam: 'route', labels: ROUTE, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'],
      vignette: 'A 24-year-old woman who had an umbilical vein catheter as a newborn vomits blood. EGD shows esophageal varices. Her spleen is large, her platelets are 76,000/µL, and her liver tests are normal.',
      kicker: 'Case 2', title: 'Where is the resistance in case 2?',
      line: 'Look at the Doppler of the main portal vein. The HVPG is {hvpg}, but the PPG is {ppg}.',
      notes: 'The two gradients alone show the fall comes before the wedge, so the HVPG cannot see it. The Doppler decides between the two levels that fit. Keep this case in mind for case 5.',
      ask: ['The HVPG is normal and the PPG is high. Which two levels fit?', 'Pre-hepatic or presinusoidal: the fall lies before the wedge.'],
    },
    {
      id: 'a2', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      kicker: 'Case 2', site: 'pre', title: 'Case 2: the resistance is before the liver',
      line: 'Portal vein thrombosis with a cavernoma. The fall lies between the portal vein and the portal venules, at the clot, before the wedge, so the HVPG stays at {hvpg}. Colored by pressure drop, the clotted portal vein stands out.',
      notes: 'Umbilical vein catheterization in the newborn is a classic cause of portal vein thrombosis in childhood. The cavernoma carries some blood to the liver, but not enough to bring the pressure down. The liver itself is normal, so its tests are normal and ascites is rare.',
      ask: ['Why is the Doppler of the main portal vein flat?', 'The vein is occluded; the cavernoma carries the blood around it.'],
    },
    {
      id: 'q3', hold: true, preset: 'constrictive', cam: 'route', labels: ROUTE, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      vignette: 'A 61-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has leg edema and ascites. His JVP rises on inspiration. The ascites has a SAAG of 1.5 and a protein of 4.1 g/dL.',
      kicker: 'Case 3', title: 'Where is the resistance in case 3?',
      line: 'Every station on the ladder is high, from the portal vein at {pv} to the right atrium at {ra}. The HVPG is {hvpg} and the PPG is {ppg}.',
      notes: 'There is no single fall on this ladder: every station is raised by about the same amount. A JVP that rises on inspiration is Kussmaul\'s sign. Ask the room where pressure would have to be lost for that pattern.',
      ask: ['If every station is high and no gradient is raised, where must the resistance be?', 'At or beyond the right atrium: in the heart.'],
    },
    {
      id: 'a3', cam: 'heart', labels: ['IVCS', 'RA'], compare: LENS, tool: { kind: 'profile' }, key: ['ra', 'hvpg', 'ppg'], rail: true,
      kicker: 'Case 3', site: 'cardiac', title: 'Case 3: the resistance is in the heart',
      line: 'Constrictive pericarditis. The stiff pericardium raises the [right atrial pressure](ra), and every vein behind it rises with it. Colored by pressure drop, no vessel stands out.',
      notes: 'Tap Pressure drop: nothing lights up, because no vessel between the gut and the heart carries the resistance. The heart cannot fill, so the right atrial pressure is high and the liver is congested. The ascites is protein-rich. Varices are rare, because the portal and systemic veins are both high.',
      ask: ['Why are varices rare in this case?', 'Varices need a gradient from the portal to the systemic veins, and both are high.'],
    },
    {
      id: 'q4', hold: true, preset: 'sos', cam: 'route', labels: ROUTE, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      vignette: 'A 44-year-old woman has drunk a comfrey tea every day for months. Over 3 weeks she has developed tender hepatomegaly, weight gain and ascites, with a SAAG of 1.5 and a protein of 4.2 g/dL.',
      kicker: 'Case 4', title: 'Where is the resistance in case 4?',
      line: 'The HVPG is {hvpg} and the PPG is {ppg}, yet the ascites is rich in protein. Which two stations is the fall between, and what lies between them?',
      notes: 'The fall lies inside the HVPG bracket, as in case 1, so the resistance lies somewhere the wedge reads. Here it runs from the central veins to the hepatic vein. The protein-rich ascites and the short history point away from cirrhosis.',
      ask: ['The HVPG is raised. Which two levels can that be?', 'Sinusoidal or postsinusoidal.'],
    },
    {
      id: 'a4', cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      kicker: 'Case 4', site: 'postsin', title: 'Case 4: the resistance is just after the sinusoids',
      line: 'Sinusoidal obstruction syndrome. The alkaloids in comfrey damage the lining of the sinusoids and the small central veins, upstream of the catheter tip, so the HVPG rises. Colored by pressure drop, the central veins stand out.',
      notes: 'Pyrrolizidine alkaloids in some herbal and bush teas injure the sinusoidal endothelium, as myeloablative conditioning does. The congested sinusoids leak protein-rich fluid. The wedged catheter still reads behind the resistance, so the HVPG rises as it does in cirrhosis.',
      ask: ['What separates this case from case 1?', 'A short history after a toxin, and protein-rich ascites; on the ladder the fall also sits one station later.'],
    },
    {
      id: 'q5', hold: true, preset: 'schisto', cam: 'route', labels: ROUTE, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'],
      vignette: 'A 33-year-old man who fished in Lake Victoria as a boy vomits blood. EGD shows large esophageal varices. His spleen is large, his platelets are 70,000/µL, and his liver stiffness is 6.6 kPa.',
      kicker: 'Case 5', title: 'Where is the resistance in case 5?',
      line: 'The HVPG is {hvpg} and the PPG is {ppg}, as in case 2. Compare the Doppler of the main portal vein.',
      notes: 'The gradients match case 2: a high portal pressure with a normal wedge. This time the main portal vein carries flow toward the liver, so it is open. The near-normal stiffness says the liver tissue itself is soft.',
      ask: ['The portal vein is open and the HVPG is normal. Where is the fall?', 'In the portal venules, before the sinusoids.'],
    },
    {
      id: 'a5', cam: 'lobule:triad', terms: { 'portal venules': 'lobule:triad' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      kicker: 'Case 5', site: 'presin', title: 'Case 5: the resistance is before the sinusoids',
      line: 'Schistosomiasis. Eggs lodge in the portal venules, upstream of the sinusoids, so the wedge reads a normal pressure and the HVPG stays at {hvpg}. Colored by pressure drop, the portal venules stand out.',
      notes: 'Schistosoma mansoni is common around Lake Victoria. Its eggs reach the portal venules, and periportal fibrosis follows. The liver cells are spared, so the tests, the stiffness and the albumin stay near normal. Cases 2 and 5 share their HVPG and PPG; at the catheter only the open portal vein tells them apart. The ladder shows the difference: the fall sits at the clot in case 2 and in the portal venules here.',
      ask: ['Cases 2 and 5 share their HVPG and PPG. What tells them apart?', 'The portal vein: occluded in case 2, open in case 5. On the ladder the fall sits at the clot in case 2 and in the portal venules in case 5.'],
    },
    {
      id: 'q6', hold: true, preset: 'ivc-web', cam: 'route', labels: ROUTE, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      vignette: 'A 36-year-old man from Nepal has had swollen legs for a year and now has ascites. Dilated veins run up his flanks. The ascites has a SAAG of 1.4 and a protein of 4.3 g/dL.',
      kicker: 'Case 6', title: 'Where is the resistance in case 6?',
      line: 'The portal pressure is {pv}, yet the HVPG is {hvpg} and even the PPG is {ppg}. Compare the IVC, {ivc}, with the right atrium, {ra}.',
      notes: 'Both gradients are normal, as in case 3, but this ladder has a fall: between the IVC and the right atrium. The flank veins carry blood from the legs around the IVC.',
      ask: ['Both gradients are normal. How does this ladder differ from case 3?', 'The right atrium is normal here; the fall is between the IVC and the atrium.'],
    },
    {
      id: 'a6', cam: 'hepatic', labels: ['IVCS', 'RA'], mark: { edges: ['IVCS_RA'], label: 'Web' }, compare: LENS, tool: { kind: 'profile' }, key: ['ivc', 'ra', 'ppg'], rail: true,
      kicker: 'Case 6', site: 'post', title: 'Case 6: the resistance is after the liver',
      line: 'An IVC web. The fall lies between the IVC and the [right atrium](ra). The PPG reads the IVC below the web, so it misses the fall too. Colored by pressure drop, the narrowed IVC stands out.',
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
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: true, of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, ...SIX],
      kicker: 'Summary', title: 'The largest fall on the ladder names the level',
      line: 'The HVPG sees only sinusoidal and postsinusoidal resistance. A high portal pressure with a normal PPG points to the IVC or the heart.',
      notes: 'The HVPG reads the drop across the sinusoids and central veins. The PPG adds the portal vein and the portal venules but stops at the IVC. When both are normal and the portal pressure is high, compare the IVC with the right atrium. The SAAG and protein columns add one more clue: protein-rich ascites comes from congestion behind the sinusoids.',
      ask: ['A patient has varices, a normal HVPG and a high PPG. What test comes next?', 'Doppler of the portal vein: a clot means pre-hepatic, an open vein means presinusoidal.'],
    },
  ],
};
