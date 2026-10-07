// C5. Melena with a big spleen: do not assume cirrhosis. Variant L is a blocked splenic vein with a
// normal liver (TIPS is wrong); variant G is cirrhosis with a gastrorenal shunt (BRTO or TIPS).

import { DX_HIDDEN } from './kit.js?v=345f74af3d';

const L = {
  vid: 'L', preset: 'svt', splenic: true,
  patient: { name: 'Mark Davies', age: 46, sex: 'M', setting: 'Gastroenterology clinic', problem: 'Black stool two days ago. Big spleen. Fundal varices.' },
  hx: ['Two days ago a black, tarry stool with dizziness. It has stopped.', 'Severe acute pancreatitis four years ago, with a pseudocyst. No heavy drinking and no known liver disease.', 'Takes no regular medicines.'],
  exam: ['Pale. Spleen palpable 4 cm below the costal margin.', 'No jaundice, no ascites and no stigmata of chronic liver disease.'],
  labs: [['Hemoglobin', '9.2 g/dL', 'warn'], ['Platelets', '95 ×10⁹/L', 'warn'], ['Bilirubin', '0.8 mg/dL', ''], ['Albumin', '4.0 g/dL', ''], ['INR', '1.0', '']],
  egd: ['Isolated fundal varices (IGV1) with a red spot. No esophageal varices.', 'No ulcer.'],
  ct: ['Occluded splenic vein at the pancreatic tail, with collateral veins around the spleen.', 'Portal vein open. Liver normal in size and outline. Spleen 17 cm.'],
  us: 'Large spleen, 17 cm. Normal-looking liver. No ascites.', dopExtra: ['Portal flow runs toward the liver.'],
};
const G = {
  vid: 'G', preset: 'gastric-varix', splenic: false,
  patient: { name: 'Rosa Nunez', age: 63, sex: 'F', setting: 'Gastroenterology clinic', problem: 'Black stool three days ago. Cirrhosis. Fundal varices.' },
  hx: ['Three days ago a black stool with dizziness. It has stopped.', 'Cirrhosis from hepatitis C, now cured. Child–Pugh B (8 points).', 'No encephalopathy. Ascites is small and controlled on diuretics.'],
  exam: ['Pale, alert. Spider naevi. Small ascites. Spleen palpable.', 'No confusion.'],
  labs: [['Hemoglobin', '9.6 g/dL', 'warn'], ['Platelets', '78 ×10⁹/L', 'warn'], ['Bilirubin', '1.9 mg/dL', 'warn'], ['Albumin', '3.1 g/dL', 'warn'], ['INR', '1.4', 'warn'], ['Creatinine', '0.9 mg/dL', '']],
  egd: ['Large fundal varix (IGV1) with a red spot and recent stigmata. Small esophageal varices.', 'No ulcer.'],
  ct: ['Large gastrorenal shunt draining the fundal varix to the left renal vein.', 'Splenic and portal veins open. Nodular liver, small ascites. Spleen 16 cm.'],
  us: 'Nodular liver, spleen 16 cm, a small amount of ascites.', dopExtra: ['Portal flow is slow but runs toward the liver.'],
};

export const gastric = {
  id: 'gastric', title: 'Melena with a big spleen', level: 'Diagnosis', minutes: 9,
  summary: 'Fundal varices and a big spleen. Find where the block is before you choose a treatment, because the same varices need different answers.',
  tools: ['select', 'doppler', 'endoscope'], hidden: DX_HIDDEN, speed: 1,
  variants: [L, G],
  vitals: ['hr', 'bp'],
  intro: (c) => [`${c.cs.patient.name} has been sent to clinic after a bleed that has now stopped. The scope in hospital showed fundal varices.`],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx }, { id: 'exam', section: 'Exam', title: 'In clinic', lines: c.cs.exam }],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: c.cs.labs }),
    egd: (c) => ({ title: 'Upper endoscopy', lines: c.cs.egd }),
    ct: (c) => ({ title: 'CT scan with contrast', lines: c.cs.ct }),
    'abd-us': (c) => ({ title: 'Ultrasound of the abdomen', lines: [c.cs.us] }),
    doppler: (c) => ({ title: 'Doppler of the liver vessels', extra: c.cs.dopExtra }),
  },
  orders: ['labs', 'abd-us', 'doppler', 'ct', 'egd', 'brto', 'tips8'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Fundal varix tension', 'tension', '']],
  build: (v) => {
    const L1 = v.splenic;
    const steps = [
      { id: 'block', title: 'Where is the block?', needsAny: ['ct', 'doppler'],
        q: (c) => `Look at the imaging. Where is ${c.cs.patient.name}'s block?`,
        options: ['The splenic vein', 'The main portal vein', 'Inside the liver', 'The hepatic veins'],
        answer: L1 ? 0 : 2,
        why: L1 ? 'The splenic vein is clotted. Only the spleen\'s side is under pressure, while the portal vein and the liver are normal.' : 'A nodular liver with open splenic and portal veins puts the block inside the liver.' },
      { id: 'treat', title: 'Treatment',
        q: L1 ? 'What do you offer him?' : 'What do you offer her?',
        options: L1
          ? ['Refer for splenectomy or splenic artery embolization', { t: 'TIPS', does: [] }, 'Band the fundal varices', 'Start carvedilol and discharge']
          : [{ t: 'BRTO to close the gastrorenal shunt', does: ['brto'] }, { t: 'TIPS', does: ['tips8'] }, 'Band the fundal varices', 'Splenectomy'],
        answer: L1 ? 0 : [0, 1],
        onCommit: async (c, pick) => { if (!L1 && pick === 0) { c.story('BRTO in the interventional radiology suite: the shunt is closed with a balloon and the fundal varix fills with sclerosant.'); c.snap('After BRTO'); } },
        unsafe: L1 ? {
          when: (pick) => pick === 1,
          run: async (c) => {
            const a = c.read(); c.order('tips8'); await c.advance(60); const b = c.read();
            return { title: 'TIPS for a blocked splenic vein', text: 'His portal pressure was already normal. A shunt out of the portal vein cannot relieve a block upstream of it, so the fundal varix stays full.',
              rows: [['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`], ['Fundal varix tension', `${a.tension} → ${b.tension}`]] };
          } } : undefined,
        why: L1 ? 'The fix is at the spleen: splenectomy or splenic artery embolization, if he bleeds again. A TIPS does nothing for a blocked splenic vein.' : 'With a gastrorenal shunt and a preserved liver, BRTO is first choice and TIPS is the alternative, especially with ascites. Bands do not work on fundal varices.' },
      { id: 'cause', title: L1 ? 'The cause' : 'Afterwards', auto: false,
        q: L1 ? 'What is the most likely cause of his blocked splenic vein?' : 'Whichever you chose, what follow-up does she need?',
        options: L1
          ? ['Scarring from his past pancreatitis', 'Alcohol-related cirrhosis', 'A clot in the main portal vein', 'Heart failure']
          : ['Repeat endoscopy and imaging. Watch for new esophageal varices and ascites after BRTO, and for encephalopathy after TIPS', 'None: fundal varices do not come back', 'Stop the diuretics', 'Repeat the CT every week'],
        answer: 0, why: L1 ? 'Pancreatitis and pancreatic tumors are the usual causes. Fundal varices with a normal liver should make you think of the splenic vein.' : 'Closing the shunt can push pressure into the esophageal varices and raise ascites. A TIPS can cause encephalopathy.' },
    ];
    const objectives = [
      { id: 'image', weight: 20, critical: true, text: 'Imaged the splenic vein before treating', check: (c) => c.did('ct') || c.did('doppler') },
      { id: 'block', weight: 25, text: 'Found the block', check: (c) => c.met('block') },
      { id: 'treat', weight: 35, critical: true, text: L1 ? 'No TIPS for a splenic vein block' : 'Chose BRTO or TIPS', check: (c) => c.met('treat') },
      { id: 'cause', weight: 20, text: L1 ? 'Named the cause' : 'Knew the follow-up', check: (c) => c.met('cause') },
    ];
    return { steps, objectives };
  },
  pearls: ['Do not assume cirrhosis: isolated fundal varices with a normal liver mean a blocked splenic vein until proven otherwise.', 'TIPS does not help a blocked splenic vein. Treat it at the spleen if it bleeds.', 'In cirrhosis with a gastrorenal shunt, BRTO or TIPS: each has its own price.'],
  refs: ['Köklü S, et al. Left-sided portal hypertension. Dig Dis Sci 2007;52:1141–9.', 'de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.'],
};
