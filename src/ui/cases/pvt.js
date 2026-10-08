// C7. Abdominal pain and a clot: acute portal vein thrombosis (anticoagulate, watch for ischaemia)
// and chronic cavernoma (treat the varices; an HVPG will be normal and still mislead).

import { DX_HIDDEN, fill } from './kit.js?v=4021282d5c';

const A = {
  vid: 'acute', preset: 'pvt-acute', acute: true,
  patient: { name: 'James Okafor', age: 38, sex: 'M', setting: 'Emergency department', problem: 'Five days of belly pain. A clot in the portal vein.' },
  hx: ['Five days of increasing abdominal pain and a low fever. No jaundice, no vomiting blood.', 'Appendicectomy three weeks ago. No known liver disease, no alcohol excess.'],
  exam: ['Mild tenderness across the upper abdomen. No guarding, no ascites, spleen not palpable.'],
  labs: [['Bilirubin', '1.0 mg/dL', ''], ['Albumin', '3.8 g/dL', ''], ['INR', '1.1', ''], ['Platelets', '330 ×10⁹/L', 'warn'], ['CRP', '80 mg/L', 'warn'], ['Lactate', '1.4 mmol/L', '']],
  ct: ['Occlusive thrombus in the main portal vein, extending into the superior mesenteric vein.', 'Liver enhances normally. No thickened bowel wall. No ascites.'],
  egd: ['No varices. Normal stomach.'],
  clot: ['JAK2 V617F mutation: negative. Other clotting tests pending. Recent surgery and abdominal infection are the likely triggers.'],
};
const C = {
  vid: 'chronic', preset: 'pvt-chronic', acute: false,
  patient: { name: 'Mei Chen', age: 45, sex: 'F', setting: 'Hepatology clinic', problem: 'Big spleen and low platelets found on a routine check.' },
  hx: ['Found at a routine check: low platelets. No symptoms. No bleeding.', 'No known liver disease. As a newborn she needed an umbilical vein catheter.'],
  exam: ['Spleen 5 cm below the costal margin. No ascites, no jaundice, no spider naevi.'],
  labs: [['Platelets', '{plt} ×10⁹/L', 'warn'], ['Hemoglobin', '11.2 g/dL', 'warn'], ['Bilirubin', '0.7 mg/dL', ''], ['Albumin', '4.1 g/dL', ''], ['INR', '1.0', '']],
  ct: ['The main portal vein is replaced by a tangle of small veins (cavernous transformation).', 'Liver normal in size and outline. Spleen {spl} cm.'],
  egd: ['{eso}, and large varices running into the top of the stomach (GOV2). No bleeding.'],
  clot: ['No inherited clotting disorder. JAK2 V617F: negative.'],
};

export const pvt = {
  id: 'pvt', title: 'Abdominal pain and a clot', level: 'Referral', minutes: 9,
  summary: 'A clot in the portal vein, new or old. Know when to anticoagulate, what to watch for, and why a normal HVPG does not mean normal pressure.',
  tools: ['select', 'doppler', 'endoscope'], hidden: DX_HIDDEN, speed: 1,
  variants: [A, C],
  vitals: ['hr', 'bp'],
  intro: (c) => [`${c.cs.patient.name} is in front of you. The liver blood tests are almost normal, which is not what you would expect from cirrhosis.`],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx }, { id: 'exam', section: 'Exam', title: 'Examination', lines: c.cs.exam }],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill(c.cs.labs, c) }),
    ct: (c) => ({ title: 'CT scan with contrast', lines: fill(c.cs.ct, c) }),
    doppler: (c) => ({ title: 'Doppler of the liver vessels', extra: c.cs.acute ? ['Echogenic material in the main portal vein.'] : ['Hepatopetal flow inside the cavernoma.'] }),
    egd: (c) => ({ title: 'Upper endoscopy', lines: fill(c.cs.egd, c) }),
    'clot-screen': (c) => ({ title: 'Clotting disorder and JAK2 tests', lines: c.cs.clot }),
  },
  orders: ['labs', 'doppler', 'ct', 'egd', 'clot-screen', 'hvpg', 'anticoag', 'carvedilol'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Measured gradient (HVPG)', 'hvpg', 'mmHg'], ['Spleen size', 'spleen', 'cm']],
  build: (v) => {
    const acute = v.acute;
    const steps = [];
    if (acute) steps.push(
      { id: 'first', title: 'First treatment',
        q: 'What is the first treatment for James?',
        options: [{ t: 'Start anticoagulation now', does: ['anticoag'] }, 'Wait and watch for spontaneous recanalization', 'TIPS', 'Catheter-directed thrombolysis for everyone'],
        answer: 0, onCommit: (c) => c.snap('Clot in the portal vein'),
        why: 'Acute portal vein thrombosis is anticoagulated at once. Early treatment reopens the vein in most patients.' },
      { id: 'bowel', title: 'Day 3',
        q: 'On day 3 his pain is worse, he has a fever and his lactate has risen. What does it mean?',
        options: ['Possible bowel ischaemia: urgent CT and surgical review', 'Expected: anticoagulation causes pain', 'The clot is growing into the liver, which cannot be treated', 'Stop the anticoagulant'],
        answer: 0,
        onCommit: async (c) => {
          c.story('CT shows no bowel ischaemia. The pain settles on day 4.');
          await c.skip({ label: 'Clinic, 3 months later', days: 90 }); c.snap('Three months of anticoagulation');
          await c.skip({ label: 'Clinic, 6 months later', days: 90 }); c.snap('Six months of anticoagulation');
        },
        why: 'Worsening pain with a rising lactate means the clot may have spread into the bowel veins. That needs urgent imaging and a surgical opinion.' });
    else steps.push(
      { id: 'first', title: 'The varices',
        q: 'What is the best first step for her varices?',
        options: [{ t: 'A beta blocker or banding, as in cirrhosis', does: ['carvedilol'] }, 'Anticoagulate and repeat the CT first', 'A TIPS through the old clot', 'Observe: the liver itself is normal'],
        answer: 0, onCommit: (c) => c.snap('Cavernoma and varices'),
        why: 'Varices from a portal vein block bleed just as in cirrhosis, and they are managed the same way.' },
      { id: 'platelets', title: 'Platelets',
        q: 'Why are her platelets low and her spleen big when her liver is normal?',
        options: ['A big spleen from back-pressure, trapping them', 'Cirrhosis that the scans have missed', 'A bone marrow disease making too few', 'Alcohol suppressing the marrow'],
        answer: 0, why: 'The pressure behind the block backs up into the spleen. A normal liver does not rule out portal hypertension.' });
    steps.push({ id: 'hvpg', title: 'The HVPG',
      q: (c) => `${c.cs.patient.name}'s HVPG is normal. Does ${acute ? 'he' : 'she'} have portal hypertension?`,
      options: ['Yes: the HVPG cannot see a block before the liver', 'No: a normal HVPG excludes portal hypertension', 'Only once the clot is 6 months old', 'No: the HVPG cannot be measured with a clot'],
      answer: 0, why: 'The wedge sees the sinusoids. A block before them leaves the HVPG normal while the pressure behind the block is high.' });
    const objectives = [
      { id: 'first', weight: acute ? 30 : 35, critical: true, text: acute ? 'Anticoagulated now' : 'Treated the varices like cirrhosis', check: (c) => c.met('first') },
      { id: 'cause', weight: 15, text: 'Looked for a cause', check: (c) => c.did('clot-screen') },
      { id: 'screen', weight: 15, text: 'Planned varices screening', check: (c) => c.did('egd') },
      { id: acute ? 'bowel' : 'platelets', weight: acute ? 20 : 15, text: acute ? 'Recognised the warning signs of bowel ischaemia' : 'Explained the low platelets and the spleen', check: (c) => c.met(acute ? 'bowel' : 'platelets') },
      { id: 'hvpg', weight: 20, text: 'Did not trust a normal HVPG', check: (c) => c.met('hvpg') },
    ];
    return { steps, objectives };
  },
  pearls: ['Acute portal vein thrombosis: anticoagulate at once, and watch for bowel ischaemia.', 'A chronic cavernoma with varices is treated like cirrhosis: beta blocker or banding.', 'A normal HVPG does not exclude portal hypertension when the block is before the liver.'],
  refs: ['de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.', 'Plessier A, et al. Vascular liver diseases: guidance on measurement and management.', 'Northup PG, et al. Vascular liver disorders, portal vein thrombosis, and procedural bleeding in patients with liver disease. Hepatology 2021;73:366–413.'],
};
