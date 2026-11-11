// Presenter talk: resistance to outflow after the sinusoids: in the central veins (sinusoidal obstruction syndrome), in the heart and
// in the IVC, what the catheter and the Doppler read in each (the slide fields are described at the top of decks.js). Budd–Chiari
// syndrome has its own talk (budd-chiari.js).

export const OUTFLOW = {
  id: 'outflow', level: 'advanced', title: 'After the sinusoids: central veins and the heart', minutes: 14,
  sections: [['Sinusoidal obstruction', ['Sinusoidal obstruction']], ['The heart', ['Normal heart', 'Heart failure', 'Constrictive pericarditis']], ['The IVC', ['The IVC']]],
  objectives: [
    'Name the causes of sinusoidal obstruction',
    'Explain why the wedge works in sinusoidal obstruction',
    'Tell heart failure, constriction and an IVC web apart on Doppler and the right atrial pressure',
  ],
  checks: [
    ['Why can the HVPG be measured in sinusoidal obstruction syndrome?', 'The hepatic veins are open, and the resistance sits upstream of the free reading, so the wedged pressure rises.'],
    ['Which reading separates an IVC web from heart failure?', 'The right atrial pressure: normal with a web, high in heart failure and constriction.'],
  ],
  summary: 'Sinusoidal obstruction syndrome, heart failure, constriction and an IVC web: a liver that cannot drain, and what the catheter and the Doppler read in each.',
  slides: [
    {
      id: 'sos', lens: 'heat', preset: 'sos', cam: 'lobule:central', callout: { at: 'cv', label: 'Resistance' }, terms: { 'central veins': 'lobule:central' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'],
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'Chemotherapy injures the sinusoid lining',
      vignette: 'A 52-year-old man with AML, three weeks after busulfan and cyclophosphamide conditioning for HSCT, has RUQ pain, a 6% weight gain and new ascites. His bilirubin is 2.6 mg/dL.',
      line: 'Debris from the injured lining raises resistance in the central veins, and within weeks the liver swells and ascites collects.',
      causesHead: 'Causes', causes: ['Stem cell transplant conditioning', 'Oxaliplatin', 'Thiopurines', 'Pyrrolizidine alkaloids'],
      notes: 'Sinusoidal obstruction syndrome (veno-occlusive disease) starts in the sinusoidal endothelium, injured by conditioning with busulfan, cyclophosphamide or total body irradiation, by oxaliplatin, by thiopurines or by pyrrolizidine alkaloids in herbal teas. It presents with jaundice, painful hepatomegaly, ascites and weight gain, usually within three weeks of a transplant, although late forms occur.',
      ask: ['Two weeks after a stem cell transplant a patient has gained 5 kg and has a tender liver. What is the likely diagnosis?', 'Sinusoidal obstruction syndrome: weight gain, a tender liver and the timing after conditioning fit it.'],
    },
    {
      id: 'soswedge', lens: 'heat', cath: 'result', tool: { kind: 'profile' }, key: ['whvp', 'hvpg'],
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'In sinusoidal obstruction the HVPG can be measured',
      line: 'The hepatic veins are open, so the wedge works and the HVPG is {hvpg}, {>=10 mmHg}. A raised HVPG supports sinusoidal obstruction; it does not prove it alone.',
      notes: 'In sinusoidal obstruction a transjugular catheter can enter the hepatic veins and wedge, and the resistance lies between the wedged and the free readings, so the HVPG rises. A raised HVPG supports the diagnosis after a stem cell transplant; the 10 mmHg line on the chart is the CSPH cut-off (Baveno VIII Table 3), and neither Baveno VIII nor AASLD 2024 gives a separate cut-off for sinusoidal obstruction. A transjugular liver biopsy can be taken at the same time, without crossing the liver capsule, which matters with low platelets and ascites.',
      ask: ['Why can the wedge be read here but not when the hepatic veins are clotted?', 'Here the veins are open, so the catheter can wedge, and the resistance lies between the wedge and the free reading.'],
    },
    {
      id: 'recover', lens: 'heat', days: 30, ramp: { 'fibrosis.R.post': [32, 1], 'fibrosis.L.post': [32, 1] }, lapse: { seconds: 6 }, cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over the month' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'sos',
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'Most patients recover',
      line: 'As the lining heals the central veins clear; over the following weeks the ascites drains away and the HVPG falls to {hvpg}.',
      notes: 'Mild and moderate disease resolves with careful fluid balance, diuretics and pain relief. Severe disease, with kidney or lung failure, carries a high mortality, and defibrotide is the treatment for it. Prevention matters: gentler conditioning where possible, and ursodeoxycholic acid in many centers.',
      ask: ['Which drug treats severe sinusoidal obstruction syndrome?', 'Defibrotide, which protects the injured sinusoidal lining.'],
    },
    {
      id: 'normal', lens: 'heat', preset: 'healthy', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true },
      kicker: 'Normal heart', site: 'cardiac', title: 'Normal hepatic vein flow follows the right atrium',
      line: 'Flow runs toward the heart in two waves each beat (S and D). Atrial contraction briefly reverses it (a), with a small turn between the waves (v).',
      notes: 'The hepatic veins sit next to the right atrium, so their Doppler trace follows its pressure. Flow away from the probe, toward the heart, is drawn below the baseline: the S wave as the atrium relaxes and the tricuspid ring moves down in systole, then the D wave as the tricuspid valve opens. Between them the small v wave turns toward the baseline as the atrium fills against a closed valve. The a wave above the baseline is the atrial kick pushing blood back. The pattern is called triphasic.',
      ask: ['Which wave of the hepatic vein trace goes above the baseline, and why?', 'The a wave: atrial contraction pushes blood back toward the liver.'],
    },
    {
      id: 'tr', lens: 'heat', terms: ['hv'], preset: 'rhf', cam: 'hepatic', whatIf: { label: 'Tricuspid leak', param: 'tr', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] }, labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Tricuspid regurgitation reverses the S wave',
      vignette: 'A 72-year-old woman with long-standing atrial fibrillation has leg edema, ascites and a raised JVP with large v waves. Her liver pulses under the examining hand.',
      line: 'Severe tricuspid regurgitation drives blood back into the hepatic veins in systole; the [right atrium](ra) reads {ra}, and every vein back to the gut is congested.',
      notes: 'With a leaking tricuspid valve the ventricle ejects into the atrium and the hepatic veins as well as the lungs, so the S wave shrinks, then reverses. At the bedside this is the large v wave in the jugular vein and a pulsatile liver. A high right atrial pressure without regurgitation makes the trace more pulsatile, with a tall a wave; a flat trace points to the liver, not the heart.',
      ask: ['What happens to the S wave of the hepatic vein in severe tricuspid regurgitation?', 'It reverses: flow goes back toward the liver in systole.'],
    },
    {
      id: 'pulse', lens: 'heat', terms: ['pv'], cam: 'portal', labels: ['CONF'], glow: ['heart', 'ivc', 'hv', 'sin', 'pv'], glowSeq: 550, tool: { kind: 'doppler', vessel: 'PV_TRUNK', pair: true, calipers: true }, data: 'tiles', tiles: ['pvVel', 'ra'], key: ['ra'],
      kicker: 'Heart failure', site: 'cardiac', title: 'A high atrial pressure makes the portal vein pulse',
      line: 'With no resistance in the sinusoids, right atrial pressure passes back to the portal vein. A pulsatile portal flow usually points to the heart, not the liver.',
      notes: 'Normal portal flow is steady, with a small change on breathing. When the right atrial pressure is high and the sinusoids are normal, its swings reach the portal vein: the trace pulses with each beat and may briefly reverse. In cirrhosis the stiff sinusoids damp these swings, so a pulsatile portal vein argues against cirrhosis. The pulsatility index falls as the heart failure is treated.',
      ask: ['A pulsatile portal vein on ultrasound. Where do you look next?', 'The right heart: tricuspid regurgitation or a raised right atrial pressure.'],
    },
    {
      id: 'constrict', lens: 'heat', preset: 'constrictive', cam: 'heart', labels: ['RHV', 'RA'], whatIf: { label: 'Breathing depth', param: 'respDepth', min: 0, max: 3, step: 0.25, ends: ['Shallow', 'Deep'] }, tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'Constrictive pericarditis', site: 'cardiac', title: 'Constriction congests the liver with a normal-sized heart',
      vignette: 'A 58-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has a swollen abdomen and fatigue. His JVP is raised and rises further on inspiration.',
      line: 'The heart cannot fill, and the [right atrial pressure](ra) rises to {ra}. Ascites often forms before the legs swell.',
      notes: 'Constriction follows tuberculosis, cardiac surgery, radiotherapy or viral pericarditis. It is often first seen as ascites or a stiff liver and mistaken for cirrhosis; the liver stiffness rises with the congestion. The neck veins are high and rise on inspiration (Kussmaul sign); there may be a pericardial knock. On Doppler the hepatic vein reversal grows in expiration; drag the breathing depth to see the trace swing with each breath. Echocardiography, CT or MRI of the pericardium and right heart catheterization make the diagnosis; pericardiectomy treats it.',
      ask: ['Ascites with a high SAAG and high protein, a JVP that rises on inspiration and a normal ejection fraction. What is the likely cause, and how do you confirm it?', 'Constrictive pericarditis: a thick pericardium on CT or MRI.'],
    },
    {
      id: 'web', lens: 'heat', terms: ['hv', 'ivc', 'ra'], preset: 'ivc-web', cam: 'hepatic', whatIf: { label: 'Web narrowing', param: 'stenosis.IVCS_RA', min: 0, max: 0.9, step: 0.05, ends: ['Open', 'Tight'] }, labels: ['RHV'], mark: { edges: ['IVCS_RA'], label: 'Web in the IVC' }, tool: { kind: 'doppler', vessel: 'IVCS_RA' }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'The IVC', site: 'post', title: 'An IVC web congests the liver while the atrium stays normal',
      vignette: 'A 36-year-old man who grew up in Nepal has ascites, leg swelling and dilated veins over his back and flanks. His JVP is normal.',
      caseQ: 'Where is the resistance?',
      line: 'A membrane in the IVC above the hepatic veins adds resistance to outflow: below it the pressure is {ivc}, but the right atrium stays at {ra}.',
      notes: 'Membranous obstruction of the IVC is a form of Budd–Chiari syndrome, common in South and East Asia and southern Africa. The liver congests as in heart failure, but the jugular venous pressure is normal and the echocardiogram is too. Doppler shows fast or turbulent flow at the web and slow or reversed flow below it. The PPG, read against the IVC below the web, looks normal; the portal vein against the right atrium shows the full gradient. Angioplasty, with or without a stent, treats it. On the figure, colored by congestion, the veins below the web are backed up, while the upper body’s veins stay clear.',
      ask: ['Congested liver, ascites, normal JVP and a normal echocardiogram. Where does the resistance lie?', 'Between the liver and the heart: the hepatic veins or the IVC.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from none to severe, each point settled for a year, the HVPG read
      // against the stiffness. A CSPH liver is a point on it, named Cirrhosis; heart failure, constriction and the IVC web of the slide
      // before are points far under it.)
      id: 'relation', lens: 'heat', terms: ['hv', 'ivc', 'ra'], preset: 'ivc-web', cam: 'hepatic', labels: ['RHV'], mark: { edges: ['IVCS_RA'], label: 'Web in the IVC' },
      tool: { kind: 'curve', x: 'lsm', xCuts: [15, 25], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['hvpg'], ring: false,
        dots: [{ preset: 'csph', name: 'Cirrhosis' }, { preset: 'rhf', name: 'Heart failure' }, { preset: 'constrictive', name: 'Constriction' }, { slide: 'web', name: 'IVC web' }] },
      kicker: 'Summary', site: 'post', title: 'Congestion stiffens the liver while the HVPG stays flat',
      line: 'In cirrhosis the HVPG climbs with the stiffness. Congestion stiffens the liver without raising it: the IVC web reads {lsm} with an HVPG of {hvpg}.',
      notes: 'The line is the model\'s cirrhosis from none to severe, each point settled for a year: stiffness on the x axis, the HVPG against it. In cirrhosis the two climb together (the CSPH liver sits on the line): the HVPG passes 10 mmHg at about 20 kPa, and a stiffness of 25 kPa or more rules CSPH in (Baveno VIII). Heart failure, constriction and the IVC web sit far under the line. Congestion lifts the free and the wedged hepatic vein pressures together, so their difference stays under 2 mmHg, while the blood held in the sinusoids stiffens the liver past 15 and even 25 kPa without any scarring. In the model stiffness rises about 2 kPa for each mmHg of free hepatic vein pressure above about 6, whatever the cause; that slope is the model\'s own estimate, not a published figure. A high stiffness overestimates portal hypertension in a congested liver: check the jugular venous pressure and an echocardiogram before calling it cirrhosis. Neither guideline file gives a figure for how much congestion raises the stiffness. (Baveno VIII Table 3; AASLD 2024 Table 1 lists congestive hepatopathy and Budd–Chiari syndrome as post-hepatic.) One model patient per point; real patients vary far more.',
      ask: ['A liver reads 30 kPa and the HVPG is 1 mmHg. What do you check before calling it cirrhosis?', 'The right atrial and jugular venous pressure, and an echocardiogram: congestion stiffens the liver without raising the HVPG.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'sos', kicker: 'Central veins', title: 'Sinusoidal obstruction' }, { id: 'recover', kicker: 'Central veins', title: 'Recovered' },
        { id: 'tr', kicker: 'Cardiac', title: 'Heart failure with TR' }, { id: 'constrict', kicker: 'Cardiac', title: 'Constriction' }, { id: 'web', kicker: 'Post-hepatic', title: 'IVC web' }],
      kicker: 'Summary', title: 'What the HVPG shows after the sinusoids',
      line: 'Sinusoidal obstruction raises the HVPG. Heart failure and constriction raise every pressure together, so the HVPG stays normal.',
      notes: 'With clotted hepatic veins the wedged and free readings are taken behind the same resistance, so the HVPG is meaningless; the PPG and imaging make the diagnosis. With resistance in the central veins the hepatic veins are open, the resistance sits between the two readings, and the HVPG is raised. Reopening one hepatic vein, or a shunt to the IVC, drains the liver. Each of the cardiac causes congests the liver from above: the stiffness rises and the ascites is rich in protein, while the HVPG stays normal. The right atrial pressure and the jugular vein tell the heart from resistance in the IVC or the hepatic veins. Doppler adds the waveform: reversal in tricuspid regurgitation and a pulsatile portal vein when the right atrium is high.',
      ask: ['Which bedside sign separates heart failure from an IVC web?', 'The jugular venous pressure: high in heart failure, normal with a web.'],
    },
  ],
};
