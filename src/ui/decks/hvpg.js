// Presenter talk: measuring portal pressure: HVPG and PPG (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HVPG = {
  id: 'hvpg', level: 'core', title: 'Measuring HVPG and PPG', minutes: 15,
  summary: 'How the HVPG is measured and what it means. Then where it misleads, and how the PPG helps.',
  objectives: ['Describe how free and wedged hepatic pressures are recorded', 'Calculate the HVPG and state its 5, 10 and 12 mmHg cut-offs', 'Recognize when the HVPG misleads', 'Use the portal pressure gradient when it does'],
  checks: [
    ['How is the HVPG calculated?', 'Wedged hepatic vein pressure minus free hepatic vein pressure (WHVP − FHVP).'],
    ['At which HVPG levels does the risk rise?', 'Above 5 mmHg is portal hypertension, 10 mmHg or more is CSPH, and from 12 mmHg varices can bleed.'],
    ['When does the HVPG miss a high portal pressure, and what do you measure instead?', 'When the block lies before the sinusoids, as with a portal vein clot or schistosomiasis. Measure the PPG, portal vein minus IVC.'],
  ],
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
      kicker: 'Measuring portal pressure', title: 'The free pressure reads the hepatic vein',
      terms: { 'hepatic vein pressure': 'fhvp', IVC: 'ivc' },
      line: 'The free hepatic vein pressure is measured 2 to 4 cm from the IVC and should be within about 2 mmHg of IVC pressure. Subtracting it from the wedge cancels the abdominal pressure that ascites adds to both readings.',
      notes: 'The free hepatic venous pressure (FHVP) is read with the tip free in the hepatic vein, 2 to 4 cm from where it opens into the IVC. It should be within about 2 mmHg of the IVC pressure; a bigger difference suggests the tip is badly placed or the vein is obstructed. Subtracting the free pressure, not the right atrial one, cancels the abdominal pressure that tense ascites adds to both readings.',
      ask: ['Why subtract the free pressure rather than the right atrial pressure?', 'The free pressure carries the same abdominal and venous pressure as the wedge, so subtracting it cancels them.'],
    },
    {
      id: 'wedge', cath: 'wedge', monitor: 'wedge',
      kicker: 'Measuring portal pressure', title: 'The wedged pressure reads the sinusoids',
      terms: { sinusoids: 'whvp' },
      line: 'Inflating the balloon stops flow, so the column of blood ahead of it settles at the pressure of the sinusoids that feed it. Record it once the tracing is stable, after at least 40 seconds.',
      notes: 'With the balloon inflated, flow in the hepatic vein stops and the still column of blood carries the pressure of the sinusoids that feed it. A little contrast confirms the wedge: it stays still, with no washout through collaterals. The wedged hepatic venous pressure (WHVP) is read once stable, after at least 40 seconds. In cirrhosis the sinusoids no longer communicate freely with each other, so the WHVP closely matches the portal pressure.',
      ask: ['How do you check that the balloon has truly wedged the vein?', 'Inject a little contrast: it stays in the vein with no washout, and the tracing loses its pulse.'],
    },
    {
      id: 'hvpg', cath: 'result', monitor: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Measuring portal pressure', site: 'sin', title: 'HVPG measures the pressure drop across the sinusoids',
      eq: [mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>'],
      line: 'The patient we just measured has an HVPG of {hvpg}: clinically significant portal hypertension.',
      notes: 'The hepatic venous pressure gradient is the pressure drop across the sinusoids. The patient we just measured has an HVPG of about 12 mmHg, which is clinically significant. HVPG predicts outcome: from 10 mmHg varices and decompensation become possible, and the risk rises with the gradient; from 12 varices can bleed. After a variceal bleed, a fall on treatment to below 12 mmHg, or by 20% or more, protects against rebleeding. Before any bleed, a fall of 10% or more already predicts benefit. Without a catheter, liver stiffness (25 kPa or more) rules clinically significant portal hypertension in; stiffness of 15 kPa or less with platelets of 150 or more rules it out.',
      ask: ['After a variceal bleed, on carvedilol, the HVPG falls from 18 to 13 mmHg. Is that a response?', 'Yes: a fall of 20% or more protects against rebleeding even above 12. Before any bleed, a fall of 10% already predicts benefit.'],
    },
    {
      id: 'grades', visual: 'scale', scale: { key: 'hvpg', max: 20, legend: true, low: 'Normal', marks: [[5, 'Portal\nhypertension', 'Raised'], [10, 'Clinically significant\nportal hypertension\n(CSPH)', 'CSPH'], [12, 'Varices\ncan bleed', 'Bleeding risk']] },
      of: [{ preset: 'healthy', name: 'Healthy' }, { preset: 'cirr-comp', name: 'Compensated cirrhosis' }, { id: 'hvpg', name: 'Our patient' }, { preset: 'cirr-decomp', name: 'Decompensated cirrhosis' }],
      kicker: 'Thresholds', title: 'Four patients on the HVPG scale',
      line: 'A healthy liver, compensated cirrhosis, the patient we just measured and decompensated cirrhosis, each placed by its HVPG.',
      notes: 'HVPG 1 to 5 mmHg is normal. 6 to 9: portal hypertension, still subclinical. 10 or more: clinically significant portal hypertension, where varices, ascites and decompensation become possible, and the risk rises with the gradient; Baveno VIII advises a non-selective beta-blocker, preferably carvedilol, at this stage to prevent decompensation. 12 or more: varices can bleed, although size, red signs and liver function decide how likely that is. Higher values carry a worse outlook; in an acute bleed an HVPG of 20 or more predicts failure to control it.',
      ask: ['At what HVPG can varices bleed?', '12 mmHg or more.'],
    },
    {
      id: 'presin', terms: ['lobule:triad', 'lobule:sinusoid'], preset: 'schisto', cam: 'lobule:triad', callout: { at: 'triad', label: 'Block is here, before the sinusoids' }, data: 'ladder', key: ['pv', 'whvp', 'hvpg'], brackets: { hvpg: 'misleads', ppg: 'works' }, tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'presin', title: 'Normal HVPG, high portal pressure',
      line: 'In schistosomiasis the block is in the portal tracts, upstream of the sinusoids. HVPG is {hvpg} while the portal pressure is {pv}.',
      notes: 'The wedged catheter reads only what lies downstream of a block. In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder, early primary biliary cholangitis) the sinusoids are near normal, so the WHVP and the HVPG are normal or only mildly raised and underestimate the portal pressure. A normal HVPG in a patient with varices or a large spleen points to a presinusoidal or pre-hepatic cause.',
      ask: ['A 30-year-old from Egypt has varices and a normal HVPG. What is the likely cause?', 'Schistosomiasis: a presinusoidal block that the wedge does not see.'],
    },
    {
      id: 'ppg', terms: ['pv', 'sin'], preset: 'pvt-chronic', cam: 'route', labels: [], sites: ['pv', 'ivc'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'ladder', key: ['pv', 'ivc'], brackets: { hvpg: 'misleads', ppg: 'works' }, tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'pre', title: 'The PPG finds a block the HVPG misses',
      eq: [mi('PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>' + mo('−') + '<msub class="eq-ivc"><mi>P</mi><mtext>IVC</mtext></msub>'],
      line: 'This portal vein clot lies before the sinusoids, so only a direct portal reading shows it. The PPG is {ppg}.',
      notes: 'Portal pressure can be measured directly: during TIPS, through a needle into a portal branch (transhepatic or transjugular), or by an endoscopic ultrasound-guided needle. A PPG above 5 mmHg is portal hypertension, as for HVPG, and after TIPS the aim is a PPG below 12 mmHg. In the model the portal pressure is read at the confluence, upstream of the clot, so the PPG is high while the HVPG, read downstream, is normal.',
      ask: ['A patient with varices has a normal HVPG. Which reading finds the block, and where is it taken?', 'The PPG, read in the portal vein itself (at TIPS, transhepatically, or by an EUS-guided needle), upstream of the block.'],
    },
    {
      id: 'heart', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], data: 'ladder', block: 'ra', key: ['fhvp', 'ra', 'hvpg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Where HVPG misleads', site: 'cardiac', title: 'In heart failure every pressure is high',
      line: '[Wedged](whvp) {whvp} and [free](fhvp) {fhvp} pressures are both high, so HVPG is normal. The raised free pressure points to the heart.',
      notes: 'HVPG is a difference, so it cancels whatever the wedged and the free readings share. In right heart failure and constrictive pericarditis every station from the portal vein to the right atrium is high: the HVPG and the PPG are normal, but the absolute pressures are not. Always read the free hepatic and the right atrial pressures as well. The same pattern with a normal right atrial pressure points to a block between the hepatic veins and the heart, such as an IVC web.',
      ask: ['WHVP 21, FHVP 20, right atrium 19 mmHg. What is the HVPG, and where is the problem?', 'HVPG 1 mmHg, normal. The problem is the heart: every station is high.'],
    },
    {
      id: 'bc', terms: ['hv', 'ivc'], preset: 'budd-chiari', cath: 'blocked',
      kicker: 'Where HVPG misleads', site: 'post', title: 'In Budd–Chiari the catheter cannot enter',
      line: 'The hepatic veins, or the IVC above them, are clotted or webbed, and often only a stump is left. If the catheter does wedge, both readings are taken behind the block, so the HVPG is near zero and misleading.',
      notes: 'In Budd–Chiari syndrome the hepatic veins, or the IVC above them, are thrombosed or webbed. The catheter often cannot enter the vein, or enters only a stump. If a wedge is achieved, both the wedged and the free readings lie behind the block, so the HVPG is near zero and misleading. Doppler ultrasound, CT or MR venography make the diagnosis; venography shows a spider-web of collaterals. Treatment is stepwise: anticoagulation, angioplasty or a stent for short stenoses, TIPS, then transplantation.',
      ask: ['Why can the HVPG not be measured here, and what shows the block instead?', 'The catheter cannot enter the clotted veins; Doppler and CT or MR show the block.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: false, note: 'What HVPG shows', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true }, { id: 'hvpg', title: 'Cirrhosis', note: 'Reliable' }, { id: 'presin', title: 'Schistosomiasis', note: 'Normal despite the obstruction' },
        { id: 'ppg', title: 'Portal vein thrombosis', note: 'Normal despite the obstruction' }, { id: 'heart', title: 'Right heart failure', note: 'Normal, all pressures high' }, { id: 'bc', title: 'Budd–Chiari', note: 'Cannot be measured', blank: ['whvp', 'fhvp', 'hvpg'] }],
      kicker: 'Summary', title: 'When HVPG is reliable',
      line: 'HVPG tracks the portal pressure gradient only when the block lies between the wedge and the free hepatic vein: in the sinusoids or the small central veins. Elsewhere, read the PPG and the absolute pressures.',
      notes: 'HVPG is reliable when the block lies between the wedge and the free hepatic vein: in the sinusoids, as in cirrhosis, the commonest cause, or in the small central veins, as in sinusoidal obstruction syndrome, where above 10 mmHg supports the diagnosis. In cirrhosis it is the standard for diagnosis, prognosis and following treatment. It is normal with pre-hepatic and presinusoidal blocks, and near zero when the pressures behind the hepatic veins rise together (post-hepatic, cardiac). The PPG and the absolute pressures complete the picture. The model\'s pressures for Budd–Chiari are those behind the block.',
      ask: ['Which numbers would you read to place a block?', 'The HVPG with the free hepatic and right atrial pressures, and the PPG when it can be measured.'],
    },
  ],
};
