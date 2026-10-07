// C6. Rapid ascites in a young patient: Budd–Chiari, sinusoidal obstruction syndrome or a caval web.
// The HVPG is the trap in all three. The model shows the pressure change after anticoagulation or stenting.

import { DX_HIDDEN, fill } from './kit.js?v=010d07460c';

const BC = {
  vid: 'BC', preset: 'budd-chiari', kind: 'bc',
  patient: { name: 'Sara Haddad', age: 29, sex: 'F', setting: 'Emergency department', problem: 'Three weeks of belly pain and swelling.' },
  hx: ['Three weeks of right-sided abdominal pain and increasing swelling.', 'Takes the combined oral contraceptive pill. No alcohol, no known liver disease.', 'No fever, no travel.'],
  exam: ['Tender, enlarged liver. Tense ascites. No spider naevi, no jaundice.', 'Jugular venous pressure normal.'],
  labs: [['Bilirubin', '2.4 mg/dL', 'warn'], ['ALT', '210 U/L', 'warn'], ['INR', '1.5', 'warn'], ['Albumin', '3.0 g/dL', 'warn'], ['Platelets', '460 ×10⁹/L', 'warn'], ['Hemoglobin', '16.8 g/dL', 'warn']],
  tap: [['SAAG', '1.8 g/dL', 'warn'], ['Ascitic protein', '3.8 g/dL', 'warn']],
  ct: ['Hepatic veins not seen. Patchy, uneven enhancement of the liver. Enlarged caudate lobe.', 'Inferior vena cava open. Large-volume ascites.'],
  dopExtra: ['Enlarged caudate lobe with flow in its own vein.'],
  clot: ['JAK2 V617F mutation: positive. A myeloproliferative neoplasm is likely.'],
};
const SOS = {
  vid: 'SOS', preset: 'sos', kind: 'sos',
  patient: { name: 'Tomás Rivera', age: 41, sex: 'M', setting: 'Transplant ward', problem: 'Day 14 after a stem-cell transplant: weight up, jaundice, painful liver.' },
  hx: ['Day 14 after an allogeneic stem-cell transplant for leukemia, after high-dose conditioning chemotherapy.', 'Weight up 6 kg in a week. Right upper abdominal pain.'],
  exam: ['Jaundiced. Tender, enlarged liver. Mild ascites and ankle edema.'],
  labs: [['Bilirubin', '5.8 mg/dL', 'bad'], ['ALT', '95 U/L', 'warn'], ['Platelets', '18 ×10⁹/L', 'bad'], ['Creatinine', '1.3 mg/dL', 'warn']],
  tap: [['SAAG', '1.5 g/dL', 'warn'], ['Ascitic protein', '2.0 g/dL', '']],
  ct: ['Enlarged liver, thickened gallbladder wall, a little ascites.', 'Hepatic veins and inferior vena cava open.'],
  dopExtra: ['Hepatic veins open, with a dampened waveform.'],
  clot: ['Nothing to suggest a clotting disorder.'],
};
const WEB = {
  vid: 'WEB', preset: 'ivc-web', kind: 'web',
  patient: { name: 'Nadia Khan', age: 36, sex: 'F', setting: 'Hepatology clinic', problem: 'Four months of belly and leg swelling.' },
  hx: ['Four months of swelling of the belly and both legs. Tired and breathless on exertion.', 'Born in Nepal. No alcohol, no liver disease known.'],
  exam: ['Dilated veins across the abdominal wall and flanks, with blood flowing upward.', 'Ascites and pitting edema to the thighs. Jugular venous pressure normal.'],
  labs: [['Bilirubin', '1.1 mg/dL', ''], ['ALT', '48 U/L', ''], ['INR', '1.3', ''], ['Albumin', '3.2 g/dL', 'warn'], ['Platelets', '{plt} ×10⁹/L', 'warn']],
  tap: [['SAAG', '1.7 g/dL', 'warn'], ['Ascitic protein', '3.5 g/dL', 'warn']],
  ct: ['A thin membrane narrowing the inferior vena cava just below the right atrium.', 'Hepatic veins open but dilated. Enlarged caudate lobe. Ascites.'],
  dopExtra: ['Inferior vena cava: slow, damped flow below the web.'],
  clot: ['No clotting disorder found.'],
};

export const buddChiari = {
  id: 'budd-chiari', title: 'Rapid ascites in a young patient', level: 'Referral', minutes: 10,
  summary: 'A young patient with fast ascites and no cirrhosis. Find the level of the block, know when an HVPG lies, and choose the next step in the ladder.',
  tools: ['select', 'doppler'], hidden: DX_HIDDEN, speed: 1,
  variants: [BC, SOS, WEB],
  vitals: ['hr', 'bp'],
  intro: (c) => [`${c.cs.patient.name} has been sent to you with a short story and a lot of fluid. There is no sign of chronic liver disease.`],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx }, { id: 'exam', section: 'Exam', title: 'Examination', lines: c.cs.exam }],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill(c.cs.labs, c) }),
    'tap-dx': (c) => ({ title: 'Ascitic fluid', rows: c.cs.tap }),
    ct: (c) => ({ title: 'CT scan with contrast', lines: c.cs.ct }),
    doppler: (c) => ({ title: 'Doppler of the liver vessels', extra: c.cs.dopExtra }),
    'clot-screen': (c) => ({ title: 'Clotting disorder and JAK2 tests', lines: c.cs.clot }),
  },
  orders: ['doppler', 'ct', 'tap-dx', 'labs', 'hvpg', 'clot-screen', 'anticoag', 'tips8'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Ascites', 'asc', 'mL'], ['Blood flow to the liver', 'hepflow', 'L/min']],
  build: (v) => {
    const k = v.kind;
    const LEVELS = ['The portal vein, before the liver', 'Inside the liver, before the sinusoids', 'The small veins inside the liver', 'The large hepatic veins', 'The inferior vena cava, near the heart'];
    const steps = [
      { id: 'level', title: 'Level of the block', needsAny: ['doppler', 'ct'],
        q: 'Where is the block?', options: LEVELS, answer: { bc: 3, sos: 2, web: 4 }[k],
        why: { bc: 'No hepatic vein flow on Doppler and an enlarged caudate lobe: the large hepatic veins are blocked.', sos: 'The large hepatic veins are open. The injury is in the small veins inside the liver after the conditioning chemotherapy.', web: 'A membrane in the inferior vena cava below the heart, with collateral veins on the abdominal wall.' }[k] },
      { id: 'hvpg', title: 'The HVPG',
        q: { bc: 'Can you trust an HVPG here?', sos: 'His HVPG is raised, about 9 mmHg. Is it reliable here?', web: 'Her HVPG is normal, yet she has moderate ascites. What does that mean?' }[k],
        options: { bc: ['Yes: it measures portal pressure in every liver disease', 'No: with the hepatic veins blocked there is no valid wedge reading', 'Only if you wedge in the left hepatic vein'],
          sos: ['Yes: his large hepatic veins are open, so the wedge works', 'No: SOS always blocks the large hepatic veins', 'No: an HVPG is meaningless after a transplant'],
          web: ['The block is after the liver, so read the free pressure', 'Her ascites cannot be coming from the liver', 'The catheter was wedged in the wrong place'] }[k],
        answer: k === 'bc' ? 1 : 0,
        why: { bc: 'The wedge reading assumes open hepatic veins. With them blocked, the HVPG cannot be trusted.', sos: 'With open veins the wedge is valid, so a raised HVPG is real evidence of a block inside the liver.', web: 'Both the free and the wedged pressure are raised, so their difference is small. Look at the absolute pressure.' }[k] },
      { id: 'treat', title: 'First treatment',
        q: { bc: 'What do you do first?', sos: 'What do you do first?', web: 'What do you do first?' }[k],
        options: { bc: [{ t: 'Anticoagulate, stop the pill, screen for a clotting cause', does: ['anticoag'] }, 'Place a TIPS now, before any anticoagulation', 'List her for liver transplant straight away', 'Start diuretics alone and review in a month'],
          sos: ['Supportive care and defibrotide', 'Full anticoagulation with heparin', 'TIPS', 'Aggressive diuresis for the weight gain'],
          web: ['Angioplasty or a stent across the web', 'A TIPS to bypass the liver', 'Anticoagulation on its own', 'Diuretics on their own'] }[k],
        answer: 0,
        onCommit: async (c, pick) => {
          if (k === 'bc' && pick === 0) { c.story('JAK2 comes back positive: a myeloproliferative neoplasm.'); await c.skip({ label: 'Clinic, 3 months later', days: 90 }); c.snap('Three months of anticoagulation'); }
          if (k === 'web' && pick === 0) { c.patch({ stenosis: { IVCS_RA: 0 } }); await c.skip({ label: 'Clinic, 1 month after the stent', days: 30 }); c.snap('After the stent'); }
        },
        why: { bc: 'Anticoagulation is the first step in Budd–Chiari, with the cause treated. The veins partly reopen over months.', sos: 'SOS is treated with supportive care and defibrotide. Anticoagulation and TIPS are not first steps.', web: 'A web is a mechanical problem: open it with a stent or angioplasty.' }[k] },
    ];
    if (k === 'bc') steps.push({ id: 'ladder', title: 'If she does not improve',
      q: 'If she had not improved on anticoagulation, what is the stepwise plan?',
      options: ['Angioplasty or stent, then TIPS, then transplant', 'TIPS first, then angioplasty, then transplant', 'Transplant first, because she is young and fit', 'Stop the anticoagulant and rely on diuretics'],
      answer: 0, why: 'The ladder runs from the least to the most invasive: anticoagulation, angioplasty or stent, TIPS, then transplant.' });
    const objectives = [
      { id: 'doppler', weight: 15, text: 'Ordered the Doppler first', check: (c) => c.did('doppler') },
      { id: 'level', weight: k === 'bc' ? 20 : 25, text: 'Found the level of the block', check: (c) => c.met('level') },
      { id: 'hvpg', weight: k === 'bc' ? 20 : 25, critical: true, text: 'Judged the HVPG correctly', check: (c) => c.met('hvpg') },
      { id: 'treat', weight: k === 'bc' ? 30 : 35, critical: true, text: 'Chose the right first treatment', check: (c) => c.met('treat') },
    ];
    if (k === 'bc') objectives.push({ id: 'ladder', weight: 15, text: 'Knew the stepwise ladder', check: (c) => c.met('ladder') });
    return { steps, objectives };
  },
  pearls: ['Blocked hepatic veins mean no valid HVPG. A normal HVPG with ascites after the liver still means a problem.', 'Budd–Chiari ladder: anticoagulation, angioplasty or stent, TIPS, then transplant.', 'SOS after a transplant: supportive care and defibrotide. A caval web needs a stent, not a TIPS.'],
  refs: ['Plessier A, et al. Vascular liver diseases: guidance on measurement and management.', 'Mohty M, et al. Diagnosis and severity criteria for hepatic veno-occlusive disease. Bone Marrow Transplant 2016;51:906–12.'],
};
