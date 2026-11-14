// Presenter talk: six unnamed patients, each read from the pressure ladder before the answer (the slide fields are described at
// the top of decks.js). Each case opens on its case card and question; the slide behind it names the patient, with the level on the
// rail and Pressure / Pressure drop buttons, so one tap lights where the pressure is lost. (Titles state the findings, not the answer.)

const LENS = [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Pressure drop', lens: 'drop' }];
// The six answers in the order of the levels, from the portal vein to the heart.
const SIX = [{ id: 'a2', kicker: 'Case 2', title: 'Portal vein thrombosis' }, { id: 'a5', kicker: 'Case 5', title: 'Schistosomiasis' },
  { id: 'a1', kicker: 'Case 1', title: 'Cirrhosis' }, { id: 'a4', kicker: 'Case 4', title: 'Sinusoidal obstruction', name: 'Sinusoidal obstr. synd.' },
  { id: 'a6', kicker: 'Case 6', title: 'IVC web' }, { id: 'a3', kicker: 'Case 3', title: 'Constrictive pericarditis' }];

export const WHERE = {
  id: 'where-resistance', level: 'advanced', title: 'Where is the resistance?', minutes: 12,
  summary: 'Six unnamed patients. Read each case and its pressure ladder and locate the resistance; one tap then shows where the pressure is lost.',
  sections: [['Cases 1 to 3', ['Case 1', 'Case 2', 'Case 3']], ['Cases 4 to 6', ['Case 4', 'Case 5', 'Case 6']], ['Telling them apart', ['Telling them apart']]],
  objectives: ['Locate the resistance from a short case and its pressure ladder', 'Distinguish prehepatic from presinusoidal resistance when the HVPG is normal', 'Distinguish an IVC web from cardiac disease when both gradients are normal'],
  checks: [
    ['The portal pressure is high, the HVPG is normal and Doppler shows a patent portal vein. Where is the resistance?', 'Presinusoidal, in the portal venules, as in schistosomiasis. Portal vein thrombosis would show no flow in the trunk.'],
    ['The portal pressure is high but the HVPG and the PPG are both normal. Which measurement distinguishes an IVC web from cardiac disease?', 'The right atrial pressure: normal above a web, elevated in cardiac disease.'],
    ['Ascites has a SAAG of 1.5 and a total protein of 4.2 g/dL. Which levels fit?', 'Postsinusoidal, post-hepatic or cardiac: downstream resistance congests the sinusoids, which leak protein-rich fluid.'],
    ['The HVPG is raised and the ascites has a SAAG of 1.5 with a total protein of 4.2 g/dL. Cirrhosis or sinusoidal obstruction syndrome?', 'Sinusoidal obstruction syndrome. In cirrhosis the loss of fenestrae (capillarization) keeps protein in the plasma, so the ascitic total protein is <2.5 g/dL; in sinusoidal obstruction syndrome the sinusoids still leak it.'],
  ],
  slides: [
    {
      id: 'a1', preset: 'csph', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      vignette: 'A 57-year-old man treated for hepatitis C ten years ago has small esophageal varices on EGD. His platelets are 90,000/µL, his liver stiffness is 24 kPa, and there is no ascites.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 1', site: 'sin', title: 'Case 1: small varices and high liver stiffness',
      line: 'Cirrhosis after hepatitis C. The pressure drop is in the sinusoids, inside the HVPG bracket, so the HVPG, {hvpg}, accounts for almost the whole PPG.',
      notes: 'Tap Pressure drop: the sinusoids light up and the veins upstream and downstream of them stay pale. In cirrhosis the wedged pressure tracks the portal pressure, so the HVPG is a reliable estimate of the whole gradient. The thrombocytopenia, the high liver stiffness and the varices all follow from that one level.',
      ask: ['Why does the wedged pressure track the portal pressure in cirrhosis?', 'The resistance is in the sinusoids, which the WHVP reflects.'],
    },
    {
      id: 'a2', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 24-year-old woman who had an umbilical vein catheter as a neonate presents with hematemesis. EGD shows esophageal varices, with splenomegaly, platelets 77,000/µL and normal liver tests.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 2', site: 'pre', title: 'Case 2: varices after neonatal umbilical vein catheterization',
      line: 'Portal vein thrombosis with a cavernoma. The pressure drop is at the thrombus, upstream of the wedged position, so the HVPG stays at {hvpg}.',
      notes: 'Neonatal umbilical vein catheterization is a classic cause of portal vein thrombosis in childhood. The cavernoma carries some portal flow to the liver but does not decompress the portal system. The liver parenchyma is normal, so liver tests are normal and ascites is rare.',
      ask: ['Why does portal vein thrombosis leave the HVPG normal?', 'The WHVP reflects the sinusoids, which are normal; the pressure drop is upstream of them, at the thrombus.'],
    },
    {
      id: 'a3', preset: 'constrictive', cam: 'heart', labels: ['IVCS', 'RA'], compare: LENS, tool: { kind: 'profile' }, key: ['ra', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 61-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has leg edema and ascites. His JVP rises on inspiration. Ascitic fluid: SAAG 1.5 g/dL, total protein 4.1 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 3', site: 'cardiac', title: 'Case 3: ascites, and a JVP that rises on inspiration',
      line: 'Constrictive pericarditis. The noncompliant pericardium raises the [right atrial pressure](ra), and every venous pressure upstream rises with it.',
      notes: 'Tap Pressure drop: nothing lights up, because no vessel between the splanchnic bed and the heart carries the resistance. Diastolic filling is restricted, so the right atrial pressure is high and the liver is congested. The ascites is protein-rich. Varices are rare, because the portal and systemic venous pressures are both high.',
      ask: ['Why are varices rare in this case?', 'Varices require a portal pressure gradient, and both pressures are high.'],
    },
    {
      id: 'a4', preset: 'sos', cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, compare: LENS, tool: { kind: 'profile' }, key: ['whvp', 'hvpg'], rail: true,
      vignette: 'A 44-year-old woman has drunk comfrey tea daily for months. Over 3 weeks she has developed tender hepatomegaly, weight gain and ascites, with a SAAG of 1.4 and a total protein of 4.3 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 4', site: 'postsin', title: 'Case 4: tender hepatomegaly and ascites after comfrey tea',
      line: 'Sinusoidal obstruction syndrome. Pyrrolizidine alkaloids in comfrey injure the sinusoids and small central veins, upstream of the catheter tip, so the HVPG rises.',
      notes: 'Pyrrolizidine alkaloids in some herbal and bush teas injure the sinusoidal endothelium, as myeloablative conditioning does. The congested sinusoids leak protein-rich fluid. The WHVP is still measured upstream of the resistance, so the HVPG rises as it does in cirrhosis.',
      ask: ['What distinguishes this case from case 1?', 'A short history after a toxin exposure and protein-rich ascites; on the ladder the pressure drop is one station further downstream.'],
    },
    {
      id: 'a5', preset: 'schisto', cam: 'lobule:triad', terms: { 'portal venules': 'lobule:triad' }, compare: LENS, tool: { kind: 'profile' }, key: ['pv', 'hvpg', 'ppg'], rail: true,
      vignette: 'A 33-year-old man who fished in Lake Victoria as a boy presents with hematemesis. EGD shows large esophageal varices, with splenomegaly, platelets 71,000/µL and LSM 6.1 kPa.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 5', site: 'presin', title: 'Case 5: large varices and normal liver stiffness',
      line: 'Schistosomiasis. Eggs lodge in the portal venules, upstream of the sinusoids, so the HVPG stays at {hvpg} with a patent portal vein.',
      notes: 'Schistosoma mansoni is endemic around Lake Victoria. Its eggs reach the portal venules, and periportal fibrosis follows. Hepatocytes are spared, so liver tests, liver stiffness and albumin stay near normal. Cases 2 and 5 have the same HVPG and PPG; at catheterization the pressures match, and only portal vein patency distinguishes them. The ladder shows the difference: the pressure drop is at the thrombus in case 2 and in the portal venules in case 5.',
      ask: ['Cases 2 and 5 have the same HVPG and PPG. What distinguishes them?', 'The portal vein: occluded in case 2, patent in case 5. On the ladder the pressure drop is at the thrombus in case 2 and in the portal venules in case 5.'],
    },
    {
      id: 'a6', preset: 'ivc-web', cam: 'hepatic', labels: ['IVCS', 'RA'], mark: { edges: ['IVCS_RA'], label: 'Web' }, compare: LENS, tool: { kind: 'profile' }, key: ['ivc', 'ra', 'ppg'], rail: true,
      vignette: 'A 36-year-old man from Nepal has had leg edema for a year and now has ascites. Dilated collateral veins run up his flanks. The ascites has a SAAG of 1.4 and a total protein of 4.3 g/dL.',
      caseQ: 'Where is the resistance?',
      kicker: 'Case 6', site: 'post', title: 'Case 6: ascites and dilated flank veins',
      line: 'An IVC web. The pressure drop lies between the IVC and the [right atrium](ra), outside the span of the PPG.',
      notes: 'A membranous web of the suprahepatic IVC is a common cause of hepatic venous outflow obstruction in South Asia. The hepatic veins drain into a high-pressure IVC, so the sinusoids are congested and the ascites is protein-rich. A normal PPG with a high portal pressure means the resistance lies at or downstream of the IVC: compare the IVC pressure with the right atrial pressure.',
      ask: ['Why does the PPG miss the web?', 'The PPG subtracts the IVC pressure, which is measured below the web and is elevated as well.'],
    },
    {
      id: 'ladders', cam: 'fit', visual: 'ladders', of: SIX, question: 'Which cases will neither gradient detect?',
      kicker: 'Telling them apart', title: 'Six ladders, six levels of resistance',
      line: 'From the portal vein to the right atrium, the largest pressure drop moves one level at a time.',
      notes: 'Read the ladders in order of level. Case 2: the pressure drop is at the thrombus, before the liver; case 5: in the portal venules. Both lie upstream of the wedged position, so only the PPG detects them, and portal vein Doppler distinguishes them, as the next slide shows. Cases 1 and 4: the drop lies inside the HVPG bracket, which the HVPG measures. Case 6: the drop lies between the IVC and the right atrium, which neither gradient includes. Case 3: there is no focal drop.',
      ask: ['Which two cases did neither gradient detect?', 'Case 6, the IVC web, and case 3, constrictive pericarditis.'],
    },
    {
      // (Cases 2 and 5 share their HVPG and PPG; the Doppler of the portal trunk tells them apart. Case 5 is the slide's own patient and a button eases to case 2.)
      id: 'doppler', preset: 'schisto', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvVel', 'ppg'], key: ['pvVel'],
      compare: [{ label: 'Case 5', own: true }, { label: 'Case 2', preset: 'pvt-chronic' }],
      kicker: 'Telling them apart', title: 'Doppler of the portal vein tells cases 2 and 5 apart',
      line: 'Cases 2 and 5 have the same HVPG and PPG. The portal vein has flow in case 5 (schistosomiasis) and none in case 2 (portal vein thrombosis).',
      notes: 'Source: Baveno VIII 9.2; AASLD 2024 Table 1. Doppler ultrasound is the first-line test for portal vein thrombosis: solid material in the vein, or a network of porto-portal collaterals that suggests a cavernoma (Baveno VIII 9.2). In case 2 the trunk is thrombosed, so Doppler shows no flow and a cavernoma carries portal flow around it. In case 5 the trunk is patent and the resistance lies in the portal venules. AASLD 2024 Table 1 places portal vein thrombosis at the prehepatic level and schistosomiasis at the presinusoidal level. Neither Baveno VIII nor AASLD 2024 gives Doppler cut-offs for this.',
      ask: ['Cases 2 and 5 have the same HVPG and PPG. What does portal vein Doppler show in each?', 'Case 2: no flow in the trunk, thrombosis with a cavernoma. Case 5: a patent vein with flow, so the resistance lies in the portal venules.'],
    },
    {
      // (The PPG of each case split into its causes, as the Why? panel works them out: patient buttons run through the six cases. The IVC web and the heart step left.)
      id: 'causes', preset: 'csph', cam: 'fit', tool: { kind: 'causes' }, data: 'tiles', tiles: ['ppg', 'hvpg'], key: ['ppg'],
      compare: [{ label: 'Clot', preset: 'pvt-chronic' }, { label: 'Schistosomiasis', short: 'Schisto', preset: 'schisto' }, { label: 'Cirrhosis', own: true }, { label: 'Sinusoidal obstruction', short: 'SOS', preset: 'sos' },
        { label: 'IVC web', preset: 'ivc-web' }, { label: 'Pericarditis', short: 'Heart', preset: 'constrictive' }],
      kicker: 'Telling them apart', title: 'Each case builds its PPG from different steps',
      line: 'Resistance adds to the PPG and collaterals offset part of it. In the IVC web and constrictive pericarditis the only large step goes left: the PPG misses them.',
      notes: 'Each bar is one cause of the case\'s PPG, calculated by the model by removing that cause. Tap a case to see its steps. In cirrhosis and sinusoidal obstruction the resistance in or after the sinusoids is the largest step to the right. In schistosomiasis it is resistance in the portal venules, and in portal vein thrombosis it is the thrombus, with collaterals offsetting part of the gradient in both. The IVC web and constrictive pericarditis raise the IVC pressure that the PPG subtracts, so their steps go left and the PPG is normal. AASLD 2024 Table 1 sorts portal hypertension by where the resistance lies. The sizes of the steps are the model\'s own, not published figures.',
      ask: ['Which step is largest in cirrhosis, and which cases step left?', 'Resistance in the sinusoids is the largest step. The IVC web and constrictive pericarditis step left: the elevated pressure downstream of the liver is subtracted, so the PPG misses them.'],
    },
    {
      // (The relation chart before the summary: each case's portal pressure across and its HVPG up. The portal pressure is high in
      // all six; the HVPG only where the resistance lies in the sinusoids or just past them.)
      id: 'relation', cam: 'fit', visual: 'plane', question: 'In which cases will the HVPG be raised?',
      plane: { x: { key: 'pv', min: 0, max: 30, ticks: [0, 10, 20, 30], name: 'Portal vein pressure, mmHg', short: 'Portal, mmHg' },
        y: { key: 'hvpg', min: 0, max: 20, ticks: [0, 5, 10, 20], name: 'HVPG, mmHg' },
        zones: [{ when: [['hvpg', '<', 5]], t: 'HVPG normal', tone: 'ok' }, { t: 'HVPG raised', tone: 'hvpg' }], cuts: { y: [5] }, key: 'never' },
      of: [{ preset: 'healthy', name: 'Healthy' }, { id: 'a2', name: 'Portal vein thrombosis', short: 'PVT' }, { id: 'a5', name: 'Schistosomiasis', short: 'Schisto' },
        { id: 'a1', name: 'Cirrhosis' }, { id: 'a4', name: 'Sinusoidal obstruction', short: 'SOS' }, { id: 'a6', name: 'IVC web' }, { id: 'a3', name: 'Constrictive pericarditis', short: 'Pericarditis' }],
      kicker: 'Summary', title: 'Portal pressure against HVPG in all six cases',
      line: 'Every case plots to the right of the healthy liver. Only cirrhosis and sinusoidal obstruction syndrome reach an HVPG ≥5 mmHg: their resistance lies inside the HVPG bracket.',
      notes: 'Each case is a point: portal vein pressure on the x-axis, HVPG on the y-axis. All six have portal hypertension, but the HVPG measures only the pressure drop between the WHVP and the FHVP. Portal vein thrombosis and schistosomiasis lie upstream of the wedged position, and the IVC web and constrictive pericarditis downstream of the hepatic veins, so their HVPG stays normal. A normal HVPG with varices or a high portal pressure calls for the PPG, the IVC pressure and the right atrial pressure. (AASLD 2024 Table 1 and p. 1181; Baveno VIII Table 3. That portal vein thrombosis or schistosomiasis leaves the HVPG normal is the model\'s own result, from the site of the resistance.)',
      ask: ['A patient has varices and an HVPG of 3 mmHg. Does that rule out portal hypertension?', 'No. The resistance may be prehepatic or presinusoidal, in the IVC or cardiac: measure the PPG and the right atrial pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: true, focusRow: 'a6', of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, ...SIX],
      kicker: 'Summary', title: 'The largest pressure drop on the ladder identifies the level',
      line: 'The HVPG detects only sinusoidal and postsinusoidal resistance. A high portal pressure with a normal PPG points to the IVC or the heart.',
      notes: 'The HVPG measures the pressure drop across the sinusoids and central veins. The PPG adds the portal vein and the portal venules but ends at the IVC. When both are normal and the portal pressure is high, compare the IVC pressure with the right atrial pressure. The SAAG and Prot. columns add one more clue: protein-rich ascites comes from sinusoidal congestion caused by downstream resistance. A row with no ascites shows None. The Sites and causes talk teaches the same six sites in order, one per slide; this talk is its case-based counterpart.',
      ask: ['A patient has varices, a normal HVPG and a high PPG. What test comes next?', 'Portal vein Doppler: thrombosis means prehepatic, a patent vein means presinusoidal.'],
    },
  ],
};
