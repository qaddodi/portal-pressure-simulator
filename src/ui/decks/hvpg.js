// Presenter talk: measuring portal pressure: HVPG and PPG (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HVPG = {
  id: 'hvpg', level: 'core', title: 'Measuring portal pressure: HVPG and PPG', minutes: 15,
  summary: 'How the HVPG is measured and what it means. Then where it misleads, and how the PPG helps.',
  objectives: ['Describe how free and wedged hepatic pressures are recorded', 'Calculate the HVPG and know its 5, 10 and 12 mmHg cut-offs', 'Recognise when the HVPG misleads', 'Use the portal pressure gradient when it does'],
  slides: [
    {
      id: 'route', preset: 'csph', cath: 'route',
      kicker: 'Measuring portal pressure', title: 'Access through the internal jugular vein',
      terms: { 'right atrium': 'ra', IVC: 'ivc', 'hepatic vein': 'hv' },
      line: 'A balloon catheter goes down the superior vena cava, through the right atrium and the IVC, into a hepatic vein.',
      notes: 'Under local anesthetic and ultrasound guidance the right internal jugular vein is punctured, and a balloon catheter is passed under fluoroscopy through the right atrium into the IVC and on into a hepatic vein, usually the right. The transducer is zeroed at the mid-axillary line and each reading is taken in triplicate; deep sedation is avoided because it disturbs the readings. A transjugular liver biopsy can be taken in the same session.',
      ask: ['Why the right internal jugular vein?', 'It gives a straight path through the right atrium and the IVC into the hepatic veins.'],
    },
    {
      id: 'free', cath: 'free', monitor: 'free',
      kicker: 'Measuring portal pressure', title: 'Free hepatic venous pressure',
      terms: { 'hepatic vein pressure': 'fhvp', IVC: 'ivc' },
      line: 'With the balloon deflated, the catheter tip records hepatic vein pressure, normally close to IVC pressure.',
      notes: 'The free hepatic venous pressure (FHVP) is read with the tip free in the hepatic vein, 2 to 4 cm from where it opens into the IVC. It should be within about 2 mmHg of the IVC pressure; a bigger difference suggests the tip is badly placed or the vein is obstructed. Subtracting the free pressure, not the right atrial one, cancels the abdominal pressure that tense ascites adds to both readings.',
      ask: ['Why subtract the free pressure rather than the right atrial pressure?', 'The free pressure carries the same abdominal and venous pressure as the wedge, so subtracting it cancels them.'],
    },
    {
      id: 'wedge', cath: 'wedge', monitor: 'wedge',
      kicker: 'Measuring portal pressure', title: 'Wedged hepatic venous pressure',
      terms: { 'sinusoidal pressure': 'whvp' },
      line: 'With the balloon inflated, the static column of blood ahead of it transmits sinusoidal pressure.',
      notes: 'With the balloon inflated, flow in the hepatic vein stops and the still column of blood carries the pressure of the sinusoids that feed it. A little contrast confirms the wedge: it stays still, with no washout through collaterals. The wedged hepatic venous pressure (WHVP) is read once stable, after at least 40 seconds. In cirrhosis the sinusoids no longer communicate freely with each other, so the WHVP closely matches the portal pressure.',
      ask: ['How do you check that the balloon has truly wedged the vein?', 'Inject a little contrast: it stays in the vein with no washout, and the tracing loses its pulse.'],
    },
    {
      id: 'hvpg', cath: 'result', monitor: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Measuring portal pressure', site: 'sin', title: 'Hepatic venous pressure gradient',
      eq: [mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>', 'Wedged minus free hepatic venous pressure'],
      line: 'This patient\'s HVPG is {hvpg}: clinically significant portal hypertension.',
      notes: 'The hepatic venous pressure gradient is the pressure drop across the sinusoids. This patient\'s HVPG of about 12 mmHg is clinically significant. HVPG predicts outcome: varices and decompensation at 10 mmHg or more, bleeding at 12 or more. On treatment, a fall to below 12 mmHg, or by 20% or more, protects against bleeding. Without a catheter, liver stiffness (25 kPa or more) rules clinically significant portal hypertension in; stiffness of 15 kPa or less with platelets of 150 or more rules it out.',
      ask: ['On carvedilol, HVPG falls from 18 to 13 mmHg. Is that a response?', 'Yes: a fall of more than 20% protects against bleeding, although it is still above 12.'],
    },
    {
      id: 'grades', visual: 'scale', scale: { key: 'hvpg', max: 20, legend: true, low: 'Normal', marks: [[5, 'Portal\nhypertension', 'Raised'], [10, 'Clinically significant\nportal hypertension\n(CSPH)', 'CSPH'], [12, 'Variceal bleed risk\nis high', 'Bleeding risk']] },
      of: [{ preset: 'healthy', name: 'Healthy' }, { preset: 'cirr-comp', name: 'Compensated cirrhosis' }, { id: 'hvpg', name: 'This patient' }, { preset: 'cirr-decomp', name: 'Decompensated cirrhosis' }],
      kicker: 'Thresholds', title: 'Four patients on the HVPG scale',
      line: 'A healthy liver, compensated cirrhosis, this patient and decompensated cirrhosis, each placed by its HVPG.',
      notes: 'HVPG 1 to 5 mmHg is normal. 6 to 9: portal hypertension, still subclinical. 10 or more: clinically significant portal hypertension, the threshold for varices, ascites and decompensation; Baveno VII advises a non-selective beta-blocker, preferably carvedilol, at this stage to prevent decompensation. 12 or more: varices can bleed. Higher values carry a worse outlook; in an acute bleed an HVPG of 20 or more predicts failure to control it.',
      ask: ['At what HVPG can varices bleed?', '12 mmHg or more.'],
    },
    {
      id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'ladder', key: ['pv', 'whvp', 'hvpg'], brackets: { hvpg: 'misleads', ppg: 'works' }, tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'presin', title: 'Normal HVPG, high portal pressure',
      line: 'In schistosomiasis the block is in the portal tracts, upstream of the sinusoids. HVPG is {hvpg} while the portal pressure is {pv}.',
      notes: 'The wedged catheter reads only what lies downstream of a block. In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder, early primary biliary cholangitis) the sinusoids are near normal, so the WHVP and the HVPG are normal or only mildly raised and underestimate the portal pressure. A normal HVPG in a patient with varices or a large spleen points to a presinusoidal or pre-hepatic cause.',
      ask: ['Varices, a large spleen and an HVPG of 4 mmHg. What next?', 'Look for a presinusoidal or pre-hepatic cause: image the portal vein, and consider a liver biopsy.'],
    },
    {
      id: 'ppg', preset: 'pvt-chronic', cam: 'route', labels: [], sites: ['pv', 'ivc'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'ladder', key: ['pv', 'ivc'], brackets: { hvpg: 'misleads', ppg: 'works' }, tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'pre', title: 'The portal pressure gradient',
      eq: [mi('PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>' + mo('−') + '<msub class="eq-ivc"><mi>P</mi><mtext>IVC</mtext></msub>'],
      line: 'The PPG is measured directly, so it detects a block anywhere between the two veins, including this portal vein clot. Here it is {ppg}.',
      notes: 'Portal pressure can be measured directly: during TIPS, through a needle into a portal branch (transhepatic or transjugular), or by an endoscopic ultrasound-guided needle. A PPG above 5 mmHg is portal hypertension, as for HVPG, and after TIPS the aim is a PPG below 12 mmHg. In the model the portal pressure is read at the confluence, upstream of the clot, so the PPG is high while the HVPG, read downstream, is normal.',
      ask: ['Which measurement finds a pre-hepatic block: HVPG or PPG?', 'PPG: it is read upstream of the block. HVPG is read downstream and stays normal.'],
    },
    {
      id: 'heart', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], data: 'ladder', key: ['fhvp', 'ra', 'hvpg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'cardiac', title: 'Right heart failure',
      line: '[Wedged](whvp) {whvp} and [free](fhvp) {fhvp} pressures are both high, so HVPG is normal. The raised free pressure points to the heart.',
      notes: 'HVPG is a difference, so it cancels whatever the wedged and the free readings share. In right heart failure and constrictive pericarditis every station from the portal vein to the right atrium is high: the HVPG and the PPG are normal, but the absolute pressures are not. Always read the free hepatic and the right atrial pressures as well. The same pattern with a normal right atrial pressure points to a block between the hepatic veins and the heart, such as an IVC web.',
      ask: ['WHVP 21, FHVP 20, right atrium 19 mmHg. What is the HVPG, and where is the problem?', 'HVPG 1 mmHg, normal. The problem is the heart: every station is high.'],
    },
    {
      id: 'bc', preset: 'budd-chiari', cath: 'blocked',
      kicker: 'Where HVPG misleads', site: 'post', title: 'Budd–Chiari syndrome',
      line: 'The hepatic veins are occluded. The catheter reaches the opening but cannot enter, so there is no HVPG to read.',
      notes: 'In Budd–Chiari syndrome the hepatic veins, or the IVC above them, are thrombosed or webbed. The catheter often cannot enter the vein, or enters only a stump. If a wedge is achieved, both the wedged and the free readings lie behind the block, so the HVPG is near zero and misleading. Doppler ultrasound, CT or MR venography make the diagnosis; venography shows a spider-web of collaterals. Treatment is stepwise: anticoagulation, angioplasty or a stent for short stenoses, TIPS, then transplantation.',
      ask: ['Why would a wedged reading mislead in Budd–Chiari syndrome?', 'The wedged and free readings both lie behind the block, so their difference is near zero although portal pressure is very high.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: false, note: 'What HVPG shows', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true }, { id: 'hvpg', title: 'Cirrhosis', note: 'Reliable' }, { id: 'presin', title: 'Schistosomiasis', note: 'Normal despite the obstruction' },
        { id: 'ppg', title: 'Portal vein thrombosis', note: 'Normal despite the obstruction' }, { id: 'heart', title: 'Right heart failure', note: 'Normal, all pressures high' }, { id: 'bc', title: 'Budd–Chiari', note: 'Cannot be measured', blank: ['whvp', 'fhvp', 'hvpg'] }],
      kicker: 'Summary', title: 'When HVPG is reliable',
      line: 'HVPG reads the portal pressure only when the block sits in the sinusoids. Elsewhere, read the PPG and the absolute pressures.',
      notes: 'HVPG is reliable when the block is in the sinusoids, as in cirrhosis, the commonest cause: it is the standard for diagnosis, prognosis and following treatment. It is normal with pre-hepatic and presinusoidal blocks, and near zero when the pressures behind the hepatic veins rise together (post-hepatic, cardiac). The PPG and the absolute pressures complete the picture. The model\'s pressures for Budd–Chiari are those behind the block.',
      ask: ['Which numbers would you read to place a block?', 'The HVPG with the free hepatic and right atrial pressures, and the PPG when it can be measured.'],
    },
  ],
};
