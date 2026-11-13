// Presenter talk: resistance to outflow after the sinusoids: in the central veins (sinusoidal obstruction syndrome), in the heart and
// in the IVC, what the catheter and the Doppler read in each (the slide fields are described at the top of decks.js). Budd–Chiari
// syndrome has its own talk (budd-chiari.js).

export const OUTFLOW = {
  id: 'outflow', level: 'advanced', title: 'After the sinusoids: central veins and the heart', minutes: 14,
  sections: [['Sinusoidal obstruction syndrome', ['Sinusoidal obstruction syndrome']], ['The heart', ['Normal heart', 'Heart failure', 'Constrictive pericarditis']], ['The IVC', ['The IVC']]],
  objectives: [
    'Name the causes of sinusoidal obstruction syndrome (SOS)',
    'Explain why the HVPG can be measured in SOS',
    'Distinguish heart failure, constrictive pericarditis and an IVC web by Doppler and right atrial pressure',
  ],
  checks: [
    ['Why can the HVPG be measured in sinusoidal obstruction syndrome?', 'The hepatic veins are patent, and the resistance lies upstream of the FHVP, so the WHVP rises.'],
    ['Which measurement distinguishes an IVC web from heart failure?', 'Right atrial pressure: normal with a web, elevated in heart failure and constrictive pericarditis.'],
  ],
  summary: 'Sinusoidal obstruction syndrome, heart failure, constrictive pericarditis and an IVC web: hepatic venous outflow obstruction, and what hepatic venous catheterization and Doppler show in each.',
  slides: [
    {
      id: 'sos', lens: 'heat', preset: 'sos', cam: 'lobule:central', callout: { at: 'cv', label: 'Resistance' }, terms: { 'central veins': 'lobule:central' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'],
      kicker: 'Sinusoidal obstruction syndrome', site: 'postsin', title: 'Conditioning chemotherapy injures the sinusoidal endothelium',
      vignette: 'A 52-year-old man with AML, three weeks after busulfan and cyclophosphamide conditioning for HSCT, has RUQ pain, a 6% weight gain and new ascites. His bilirubin is 2.6 mg/dL.',
      line: 'Sloughed endothelial cells and debris raise resistance at the central veins, and within weeks hepatomegaly and ascites develop.',
      causesHead: 'Causes', causes: ['HSCT conditioning', 'Oxaliplatin', 'Thiopurines', 'Pyrrolizidine alkaloids'],
      notes: 'Sinusoidal obstruction syndrome (SOS, also called veno-occlusive disease) begins with injury to the sinusoidal endothelium from conditioning with busulfan, cyclophosphamide or total body irradiation, from oxaliplatin, from thiopurines or from pyrrolizidine alkaloids in herbal teas. It presents with jaundice, painful hepatomegaly, ascites and weight gain, usually within 3 weeks of HSCT, although late-onset forms occur.',
      ask: ['Two weeks after HSCT a patient has gained 5 kg and has tender hepatomegaly. What is the likely diagnosis?', 'SOS: weight gain, tender hepatomegaly and the timing after conditioning fit.'],
    },
    {
      id: 'soswedge', lens: 'heat', cath: 'result', tool: { kind: 'profile' }, key: ['whvp', 'hvpg'],
      kicker: 'Sinusoidal obstruction syndrome', site: 'postsin', title: 'In SOS the HVPG can be measured',
      line: 'The hepatic veins are patent, so the catheter wedges and the HVPG is {hvpg}, {>=10 mmHg}. An elevated HVPG supports SOS but does not prove it alone.',
      notes: 'In SOS a transjugular catheter can enter the hepatic veins and wedge, and the resistance lies between the wedged and free hepatic venous pressures (WHVP, FHVP), so the HVPG rises. An elevated HVPG supports the diagnosis after HSCT; the 10 mmHg line on the chart is the CSPH cut-off (Baveno VIII Table 3), and neither Baveno VIII nor AASLD 2024 gives a separate cut-off for SOS. A transjugular liver biopsy can be obtained in the same procedure without puncturing the liver capsule, which matters with thrombocytopenia and ascites.',
      ask: ['Why can the WHVP be measured here but not when the hepatic veins are thrombosed?', 'Here the veins are patent, so the catheter can wedge, and the resistance lies between the WHVP and the FHVP.'],
    },
    {
      id: 'recover', lens: 'heat', days: 30, ramp: { 'fibrosis.R.post': [32, 1], 'fibrosis.L.post': [32, 1] }, lapse: { seconds: 6 }, cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over the month' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'sos',
      kicker: 'Sinusoidal obstruction syndrome', site: 'postsin', title: 'Most patients recover',
      line: 'As the endothelium heals, the central veins clear; over the following weeks the ascites resolves and the HVPG falls to {hvpg}.',
      notes: 'Mild and moderate SOS resolves with careful fluid management, diuretics and analgesia. Severe SOS, with renal or respiratory failure, carries high mortality, and defibrotide is the treatment. For prevention: reduced-intensity conditioning where possible, and ursodeoxycholic acid prophylaxis in many centers.',
      ask: ['Which drug treats severe sinusoidal obstruction syndrome?', 'Defibrotide, which protects the injured sinusoidal endothelium.'],
    },
    {
      id: 'normal', lens: 'heat', preset: 'healthy', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true },
      kicker: 'Normal heart', site: 'cardiac', title: 'Normal hepatic vein flow reflects right atrial pressure',
      line: 'Antegrade flow toward the heart forms two waves each cardiac cycle (S and D). Atrial contraction briefly reverses it (a), with a small v wave between S and D.',
      notes: 'The hepatic veins drain into the right atrium through a short segment of IVC, so their Doppler waveform reflects right atrial pressure. Flow away from the transducer, toward the heart, is displayed below the baseline: the S wave as the atrium relaxes and the tricuspid annulus descends in ventricular systole, then the D wave as the tricuspid valve opens. Between them the small v wave moves toward the baseline as the atrium fills against a closed tricuspid valve. The a wave above the baseline is retrograde flow from atrial contraction. The pattern is called triphasic.',
      ask: ['Which wave of the hepatic vein waveform goes above the baseline, and why?', 'The a wave: atrial contraction causes brief retrograde flow toward the liver.'],
    },
    {
      id: 'tr', lens: 'heat', terms: ['hv'], preset: 'rhf', cam: 'hepatic', whatIf: { label: 'Tricuspid regurgitation', param: 'tr', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] }, labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Tricuspid regurgitation reverses the S wave',
      vignette: 'A 72-year-old woman with long-standing atrial fibrillation has lower-extremity edema, ascites and an elevated JVP with large v waves. Her liver is pulsatile on palpation.',
      line: 'Severe tricuspid regurgitation drives systolic flow back into the hepatic veins; pressure in the [right atrium](ra) is {ra}, and the venous system is congested back to the splanchnic bed.',
      notes: 'In tricuspid regurgitation the right ventricle ejects backward into the right atrium and hepatic veins as well as into the pulmonary artery, so the S wave diminishes, then reverses. At the bedside: large v waves in the JVP and a pulsatile liver. An elevated right atrial pressure without regurgitation makes the waveform more pulsatile, with a tall a wave; a flat (monophasic) waveform points to the liver, not the heart.',
      ask: ['What happens to the S wave of the hepatic vein in severe tricuspid regurgitation?', 'It reverses: systolic flow is retrograde, toward the liver.'],
    },
    {
      id: 'pulse', lens: 'heat', terms: ['pv'], cam: 'portal', labels: ['CONF'], glow: ['heart', 'ivc', 'hv', 'sin', 'pv'], glowSeq: 550, tool: { kind: 'doppler', vessel: 'PV_TRUNK', pair: true, calipers: true }, data: 'tiles', tiles: ['pvVel', 'ra'], key: ['ra'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Elevated right atrial pressure makes portal flow pulsatile',
      line: 'With normal sinusoids, right atrial pressure is transmitted back to the portal vein. Pulsatile portal flow usually points to the heart, not the liver.',
      notes: 'Normal portal flow is continuous, with mild respiratory variation. When right atrial pressure is elevated and the sinusoids are normal, its pulsations are transmitted to the portal vein: the waveform pulses with each cardiac cycle and may briefly reverse. In cirrhosis the noncompliant sinusoids dampen these pulsations, so a pulsatile portal vein argues against cirrhosis. The pulsatility index falls as the heart failure is treated.',
      ask: ['A pulsatile portal vein on ultrasound. Where do you look next?', 'The right heart: tricuspid regurgitation or an elevated right atrial pressure.'],
    },
    {
      id: 'constrict', lens: 'heat', preset: 'constrictive', cam: 'heart', labels: ['RHV', 'RA'], whatIf: { label: 'Respiratory depth', param: 'respDepth', min: 0, max: 3, step: 0.25, ends: ['Shallow', 'Deep'] }, tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'Constrictive pericarditis', site: 'cardiac', title: 'Constrictive pericarditis congests the liver with a normal-sized heart',
      vignette: 'A 58-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has abdominal distension and fatigue. His JVP is elevated and rises further on inspiration.',
      line: 'Diastolic filling is restricted, and the [right atrial pressure](ra) rises to {ra}. Ascites often precedes peripheral edema.',
      notes: 'Constrictive pericarditis follows tuberculosis, cardiac surgery, radiation therapy or viral pericarditis. It often presents as ascites or an elevated liver stiffness and is mistaken for cirrhosis; liver stiffness rises with the congestion. The JVP is elevated and rises on inspiration (Kussmaul sign); there may be a pericardial knock. On Doppler, hepatic vein flow reversal increases in expiration; drag Respiratory depth to see the waveform vary with each breath. Echocardiography, CT or MRI of the pericardium and right heart catheterization make the diagnosis; pericardiectomy is the treatment.',
      ask: ['Ascites with a high SAAG and high total protein, a JVP that rises on inspiration and a normal ejection fraction. What is the likely cause, and how do you confirm it?', 'Constrictive pericarditis: a thickened pericardium on CT or MRI.'],
    },
    {
      id: 'web', lens: 'heat', terms: ['hv', 'ivc', 'ra'], preset: 'ivc-web', cam: 'hepatic', whatIf: { label: 'Web stenosis', param: 'stenosis.IVCS_RA', min: 0, max: 0.9, step: 0.05, ends: ['Open', 'Tight'] }, labels: ['RHV'], mark: { edges: ['IVCS_RA'], label: 'Web in the IVC' }, tool: { kind: 'doppler', vessel: 'IVCS_RA' }, data: 'tiles', tiles: ['ra'], key: ['ra'],
      kicker: 'The IVC', site: 'post', title: 'An IVC web congests the liver while right atrial pressure stays normal',
      vignette: 'A 36-year-old man who grew up in Nepal has ascites, lower-extremity edema and dilated veins over his back and flanks. His JVP is normal.',
      caseQ: 'Where is the resistance?',
      line: 'A membranous web in the IVC above the hepatic veins adds outflow resistance: IVC pressure below it is {ivc}, but the right atrium stays at {ra}.',
      notes: 'Membranous obstruction of the IVC is a form of Budd–Chiari syndrome, common in South and East Asia and southern Africa. The liver is congested as in heart failure, but the JVP and the echocardiogram are normal. Doppler shows high-velocity or turbulent flow at the web and slow or reversed flow below it. The PPG, measured against the IVC below the web, appears normal; portal pressure minus right atrial pressure shows the full gradient. Angioplasty, with or without stenting, is the treatment. On the figure, colored by congestion, the veins below the web are congested, while the upper-body veins are not.',
      ask: ['Congested liver, ascites, normal JVP and a normal echocardiogram. Where does the resistance lie?', 'Between the liver and the heart: the hepatic veins or the IVC.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from none to severe, each point settled for a year, the HVPG read
      // against the stiffness. A CSPH liver is a point on it, named Cirrhosis; heart failure, constriction and the IVC web of the slide
      // before are points far under it.)
      id: 'relation', lens: 'heat', terms: ['hv', 'ivc', 'ra'], preset: 'ivc-web', cam: 'hepatic', labels: ['RHV'], mark: { edges: ['IVCS_RA'], label: 'Web in the IVC' },
      tool: { kind: 'curve', x: 'lsm', xCuts: [15, 25], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['hvpg'], ring: false,
        dots: [{ preset: 'csph', name: 'Cirrhosis' }, { preset: 'rhf', name: 'Heart failure' }, { preset: 'constrictive', name: 'Constriction' }, { slide: 'web', name: 'IVC web' }] },
      kicker: 'Summary', site: 'post', title: 'Congestion raises liver stiffness while the HVPG stays normal',
      line: 'In cirrhosis the HVPG rises with liver stiffness. Congestion raises stiffness without raising the HVPG: with the IVC web, LSM is {lsm} and the HVPG {hvpg}.',
      notes: 'The line is the model\'s cirrhosis from none to severe, each point settled for a year: liver stiffness (LSM) on the x axis, the HVPG against it. In cirrhosis the two rise together (the CSPH point lies on the line): the HVPG passes 10 mmHg at about 20 kPa, and an LSM ≥25 kPa rules in CSPH (Baveno VIII). Heart failure, constrictive pericarditis and the IVC web lie far below the line. Congestion raises the FHVP and WHVP together, so the HVPG stays <2 mmHg, while sinusoidal congestion raises LSM beyond 15 and even 25 kPa without fibrosis. In the model LSM rises about 2 kPa for each mmHg of FHVP above about 6 mmHg, whatever the cause; that slope is the model\'s own estimate, not a published figure. In a congested liver, LSM overestimates portal hypertension: check the JVP and an echocardiogram before diagnosing cirrhosis. Neither guideline file gives a figure for how much congestion raises LSM. (Baveno VIII Table 3; AASLD 2024 Table 1 lists congestive hepatopathy and Budd–Chiari syndrome as posthepatic.) One model patient per point; real patients vary far more.',
      ask: ['LSM is 30 kPa and the HVPG 1 mmHg. What do you check before diagnosing cirrhosis?', 'The JVP and right atrial pressure, and an echocardiogram: congestion raises liver stiffness without raising the HVPG.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'sos', kicker: 'Central veins', title: 'Sinusoidal obstruction syndrome' }, { id: 'recover', kicker: 'Central veins', title: 'Recovered' },
        { id: 'tr', kicker: 'Cardiac', title: 'Heart failure with TR' }, { id: 'constrict', kicker: 'Cardiac', title: 'Constriction' }, { id: 'web', kicker: 'Posthepatic', title: 'IVC web' }],
      kicker: 'Summary', title: 'What the HVPG shows after the sinusoids',
      line: 'SOS raises the HVPG. Heart failure and constrictive pericarditis raise the WHVP and FHVP together, so the HVPG stays normal.',
      notes: 'With thrombosed hepatic veins (Budd–Chiari syndrome) the WHVP and FHVP are both measured upstream of the same resistance, so the HVPG is not valid; the PPG and imaging make the diagnosis. With resistance at the central veins (SOS) the hepatic veins are patent, the resistance lies between the WHVP and FHVP, and the HVPG is elevated. Recanalizing one hepatic vein, or a shunt to the IVC, decompresses the liver. Each cardiac cause congests the liver from downstream: liver stiffness rises and the ascites has a high total protein, while the HVPG stays normal. Right atrial pressure and the JVP distinguish a cardiac cause from resistance in the IVC or the hepatic veins. Doppler adds the waveform: S-wave reversal in tricuspid regurgitation, and pulsatile portal flow when right atrial pressure is elevated.',
      ask: ['Which bedside sign distinguishes heart failure from an IVC web?', 'The JVP: elevated in heart failure, normal with a web.'],
    },
  ],
};
