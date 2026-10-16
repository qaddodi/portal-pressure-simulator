// Presenter talk: the right heart and the liver, read on Doppler of the hepatic veins, the portal vein and the IVC
// (the slide fields are described at the top of decks.js).

export const RIGHT_HEART = {
  id: 'right-heart', level: 'core', title: 'The right heart and the liver', minutes: 7,
  objectives: [
    'Describe the normal hepatic vein waveform',
    'Recognize systolic reversal and a pulsatile portal vein in heart failure',
    'Explain why the HVPG is normal when the right atrium is high',
    'Tell constriction and an IVC web from heart failure',
  ],
  checks: [
    ['What does severe tricuspid regurgitation do to the hepatic vein S wave?', 'It reverses it: blood is driven back into the hepatic veins in systole.'],
    ['Why is the HVPG normal in heart failure?', 'Wedged and free pressures rise together, so their difference stays small.'],
    ['Which reading separates an IVC web from heart failure?', 'The right atrial pressure: normal with a web, high in heart failure and constriction.'],
  ],
  summary: 'Heart failure, constrictive pericarditis and an IVC web on Doppler: the hepatic vein waveform, the pulsatile portal vein, and why the HVPG stays normal while every pressure is high.',
  slides: [
    {
      id: 'normal', preset: 'healthy', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true },
      kicker: 'The hepatic veins', site: 'cardiac', title: 'Normal hepatic vein flow follows the right atrium',
      line: 'Flow runs toward the heart in two waves each beat (S and D). Atrial contraction briefly reverses it (a), with a small turn between the waves (v).',
      notes: 'The hepatic veins sit next to the right atrium, so their Doppler trace follows its pressure. Flow away from the probe, toward the heart, is drawn below the baseline: the S wave as the atrium relaxes and the tricuspid ring moves down in systole, then the D wave as the tricuspid valve opens. Between them the small v wave turns toward the baseline as the atrium fills against a closed valve. The a wave above the baseline is the atrial kick pushing blood back. The pattern is called triphasic.',
      ask: ['Which wave of the hepatic vein trace goes above the baseline, and why?', 'The a wave: atrial contraction pushes blood back toward the liver.'],
    },
    {
      id: 'tr', lens: 'heat', terms: ['hv'], preset: 'rhf', cam: 'hepatic', whatIf: { label: 'Tricuspid leak', param: 'tr', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] }, labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['ra', 'hvpg'], key: ['ra'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Tricuspid regurgitation reverses the S wave',
      vignette: 'A 72-year-old woman with long-standing atrial fibrillation has leg edema, ascites and a raised JVP with large v waves. Her liver pulses under the examining hand.',
      line: 'Severe tricuspid regurgitation drives blood back into the hepatic veins in systole. The [right atrium](ra) reads {ra}. With the vessels colored by congestion, every vein from the heart back to the gut is backed up.',
      notes: 'With a leaking tricuspid valve the ventricle ejects into the atrium and the hepatic veins as well as the lungs, so the S wave shrinks, then reverses. At the bedside this is the large v wave in the jugular vein and a pulsatile liver. A high right atrial pressure without regurgitation makes the trace more pulsatile, with a tall a wave; a flat trace points to the liver, not the heart.',
      ask: ['What happens to the S wave of the hepatic vein in severe tricuspid regurgitation?', 'It reverses: flow goes back toward the liver in systole.'],
    },
    {
      id: 'pulse', terms: ['pv'], cam: 'portal', labels: ['CONF'], glow: ['heart', 'ivc', 'hv', 'sin', 'pv'], glowSeq: 550, tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      kicker: 'Heart failure', site: 'cardiac', title: 'A high atrial pressure makes the portal vein pulse',
      line: 'With no resistance in the sinusoids, right atrial pressure passes back to the portal vein. A pulsatile portal flow usually points to the heart, not the liver.',
      notes: 'Normal portal flow is steady, with a small change on breathing. When the right atrial pressure is high and the sinusoids are normal, its swings reach the portal vein: the trace pulses with each beat and may briefly reverse. In cirrhosis the stiff sinusoids damp these swings, so a pulsatile portal vein argues against cirrhosis. The pulsatility index falls as the heart failure is treated.',
      ask: ['A pulsatile portal vein on ultrasound. Where do you look next?', 'The right heart: tricuspid regurgitation or a raised right atrial pressure.'],
    },
    {
      id: 'cath', cath: 'result', data: 'ladder', block: 'ra', key: ['ra', 'hvpg'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Catheter readings in heart failure',
      line: 'Every station from the portal vein to the atrium sits near {ra}. The HVPG and the PPG are both normal.',
      notes: 'The gradients subtract what the stations share, so a high right atrial pressure raises the wedged and the free readings together. Portal pressure is high, but collaterals do not open because the systemic veins they would drain into are just as high; varices are rare. The liver congests, stiffens and leaks a protein-rich ascites. Treating the heart (diuretics, and the cause) lowers every station.',
      ask: ['Portal vein 21 mmHg and HVPG 1 mmHg. Why so few varices?', 'The systemic veins are as high as the portal vein, so there is no gradient to open collaterals.'],
    },
    {
      id: 'constrict', preset: 'constrictive', cam: 'heart', labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['ra', 'lsm'], key: ['ra'],
      kicker: 'Constrictive pericarditis', site: 'cardiac', title: 'Constriction congests the liver with a normal-sized heart',
      vignette: 'A 58-year-old man who had mediastinal radiation for Hodgkin lymphoma 20 years ago has a swollen abdomen and fatigue. His JVP is raised and rises further on inspiration.',
      line: 'The heart cannot fill, and the [right atrial pressure](ra) rises to {ra}. Ascites often forms before the legs swell.',
      notes: 'Constriction follows tuberculosis, cardiac surgery, radiotherapy or viral pericarditis. It is often first seen as ascites or a stiff liver and mistaken for cirrhosis. The neck veins are high and rise on inspiration (Kussmaul sign); there may be a pericardial knock. On Doppler the hepatic vein reversal grows in expiration. Echocardiography, CT or MRI of the pericardium and right heart catheterization make the diagnosis; pericardiectomy treats it.',
      ask: ['Ascites with a high SAAG and high protein, a JVP that rises on inspiration and a normal ejection fraction. What is the likely cause, and how do you confirm it?', 'Constrictive pericarditis: a thick pericardium on CT or MRI.'],
    },
    {
      id: 'web', lens: 'heat', terms: ['hv', 'ivc', 'ra'], preset: 'ivc-web', cam: 'hepatic', whatIf: { label: 'Web narrowing', param: 'stenosis.IVCS_RA', min: 0, max: 0.9, step: 0.05, ends: ['Open', 'Tight'] }, labels: ['RHV'], sites: ['web', 'ra'], mark: { edges: ['IVCS_RA'], label: 'Web in the IVC' }, tool: { kind: 'doppler', vessel: 'IVCS_RA' }, data: 'tiles', tiles: ['ivc', 'ra'], key: ['ivc'],
      kicker: 'The IVC', site: 'post', title: 'An IVC web congests the liver while the atrium stays normal',
      vignette: 'A 36-year-old man who grew up in Nepal has ascites, leg swelling and dilated veins over his back and flanks. His JVP is normal.',
      line: 'A membrane in the IVC above the hepatic veins adds resistance to outflow. Below it the pressure is {ivc}, and the right atrium is {ra}.',
      notes: 'Membranous obstruction of the IVC is a form of Budd–Chiari syndrome, common in South and East Asia and southern Africa. The liver congests as in heart failure, but the jugular venous pressure is normal and the echocardiogram is too. Doppler shows fast or turbulent flow at the web and slow or reversed flow below it. The PPG, read against the IVC below the web, looks normal; the portal vein against the right atrium shows the full gradient. Angioplasty, with or without a stent, treats it. On the figure, colored by congestion, the veins below the web are backed up, while the upper body’s veins stay clear.',
      ask: ['Congested liver, ascites, normal JVP and a normal echocardiogram. Where does the resistance lie?', 'Between the liver and the heart: the hepatic veins or the IVC.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ra', 'ivc', 'hvpg', 'lsm'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'tr', kicker: 'Cardiac', title: 'Heart failure with TR' }, { id: 'constrict', kicker: 'Cardiac', title: 'Constriction' }, { id: 'web', kicker: 'Post-hepatic', title: 'IVC web' }],
      kicker: 'Summary', title: 'Heart failure, constriction or IVC web',
      line: 'Right atrial pressure separates heart failure and constriction from an IVC web. HVPG is normal in all three.',
      notes: 'Each of these congests the liver from above: the stiffness rises and the ascites is rich in protein, while the HVPG stays normal. The right atrial pressure and the jugular vein tell the heart from resistance in the IVC or the hepatic veins. Doppler adds the waveform: reversal in tricuspid regurgitation and a pulsatile portal vein when the right atrium is high.',
      ask: ['Which bedside sign separates heart failure from an IVC web?', 'The jugular venous pressure: high in heart failure, normal with a web.'],
    },
  ],
};
