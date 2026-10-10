// Optional cases 9 to 11: schistosomiasis varices, reversed portal flow on a routine scan, and
// confusion after a TIPS.

import { DX_HIDDEN, fill } from './kit.js?v=4db57f825c';

const LEVELS = ['The portal vein, before the liver', 'Inside the liver, before the sinusoids', 'Inside the liver, in the sinusoids', 'The hepatic veins, after the liver'];

export const schisto = {
  id: 'schisto', title: 'Varices with a normal liver', level: 'Diagnosis', minutes: 8,
  tests: ['labs', 'doppler', 'egd', 'hvpg'],
  summary: 'A young man from an area where schistosomiasis is common has bled from varices. His liver tests are normal and his HVPG is low. Where is the block?',
  tools: ['select', 'doppler', 'endoscope'], hidden: DX_HIDDEN, speed: 1, preset: 'schisto',
  patient: { name: 'Karim Nasser', age: 34, sex: 'M', setting: 'Gastroenterology ward', problem: 'Bled from varices yesterday. Normal liver tests.' }, variants: [{ vid: 'a' }],
  vitals: ['hr', 'bp'],
  intro: () => ['Karim was banded in the emergency department yesterday and is now stable. The registrar has read his liver tests twice because they look normal.'],
  chart: () => [
    { id: 'hx', section: 'History', title: 'Story', lines: ['Grew up in the Nile delta and swam in the canals as a child. Moved here six years ago.', 'Vomited blood yesterday. Three bands placed at endoscopy. No more bleeding.', 'No alcohol. No known liver disease.'] },
    { id: 'exam', section: 'Exam', title: 'On the ward', lines: ['Well. Spleen palpable 6 cm below the costal margin. No ascites, no jaundice.'] },
  ],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill([['Bilirubin', '0.8 mg/dL', ''], ['Albumin', '4.0 g/dL', ''], ['INR', '1.0', ''], ['Platelets', '{plt} ×10⁹/L', 'warn'], ['Hepatitis B and C', 'negative', ''], ['Schistosoma eggs', 'positive on stool', 'warn']], c) }),
    doppler: (c) => ({ title: 'Doppler of the liver vessels', extra: [fill('Thickened, bright tissue around the portal vein branches. Spleen {spl} cm.', c)] }),
    egd: (c) => ({ title: 'Upper endoscopy', lines: [fill('{eso} left after banding: three bands in place, no red signs now. Large varices in the top of the stomach.', c)] }),
  },
  orders: ['labs', 'doppler', 'hvpg', 'egd', 'carvedilol', 'evl'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Measured gradient (HVPG)', 'hvpg', 'mmHg'], ['Spleen size', 'spleen', 'cm']],
  build: () => {
    const steps = [
      { id: 'level', title: 'The level', needsAny: ['doppler', 'labs'],
        q: 'Large varices, a big spleen and a normal liver. Where is the block?', options: LEVELS, answer: 1,
        why: 'Schistosomiasis scars the small portal branches before the sinusoids. The liver cells keep working, which is why his liver tests are normal.' },
      { id: 'hvpg', title: 'The HVPG', needs: ['hvpg'],
        q: 'His HVPG is 2 mmHg. Is portal hypertension excluded?', options: ['No: the HVPG misses a block before the sinusoids', 'Yes: a normal HVPG rules it out', 'Only if the spleen is also normal', 'No: the HVPG cannot be measured here'], answer: 0,
        why: 'The wedge sees the sinusoids. A block before them is invisible to the HVPG even when the varices are large.' },
      { id: 'plan', title: 'The plan',
        q: 'What is the plan for Karim?',
        options: [{ t: 'Banding, a beta blocker and praziquantel', does: ['carvedilol', 'evl'] }, 'A TIPS now to lower the pressure', 'List him for a liver transplant', 'No treatment: his HVPG is normal'],
        answer: 0,
        onCommit: async (c) => { await c.skip({ label: 'Clinic, 3 months later', days: 90 }); c.snap('Three months of treatment'); },
        why: 'The liver itself is healthy, so banding and a beta blocker are the mainstay. TIPS and transplant are not first steps.' },
    ];
    const objectives = [
      { id: 'level', weight: 30, text: 'Placed the block before the sinusoids', check: (c) => c.met('level') },
      { id: 'hvpg', weight: 30, critical: true, text: 'Did not trust the low HVPG', check: (c) => c.met('hvpg') },
      { id: 'plan', weight: 40, critical: true, text: 'Banding and a beta blocker, with praziquantel', check: (c) => c.met('plan') },
    ];
    return { steps, objectives };
  },
  pearls: ['Large varices with normal liver tests: think of a block before the sinusoids.', 'A low HVPG does not exclude portal hypertension when the block is before the sinusoids.', 'The liver is healthy, so banding and a beta blocker are the mainstay.'],
  refs: ['de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.'],
};

export const hepatofugal = {
  id: 'hepatofugal', title: 'Reversed flow on a routine scan', level: 'Referral', minutes: 7,
  tests: ['labs', 'doppler'],
  summary: 'A routine ultrasound in a woman with cirrhosis reports hepatofugal portal flow. Read the report, check for a clot, and decide who she needs to see.',
  tools: ['select', 'doppler'], hidden: DX_HIDDEN, speed: 1, preset: 'cirr-hepatofugal',
  patient: { name: 'Gloria Ruiz', age: 63, sex: 'F', setting: 'Hepatology clinic', problem: 'Routine scan report: hepatofugal portal flow.' }, variants: [{ vid: 'a' }],
  vitals: ['hr', 'bp'],
  intro: () => ['Gloria has come for her six-monthly check. The radiologist\'s report says "hepatofugal flow in the main portal vein" and nothing else.'],
  chart: (c) => [
    { id: 'hx', section: 'History', title: 'Story', lines: ['Cirrhosis from hepatitis C, treated and cured eight years ago.', 'Ascites in the past, now gone on diuretics. One episode of confusion last year.', 'Tired, with a little more jaundice than last time.'] },
    { id: 'exam', section: 'Exam', title: 'In clinic', lines: ['Mild jaundice. Spleen palpable. A little ascites.'] },
    { id: 'rep', section: 'Studies', title: 'Report', lines: [fill('Ultrasound: small nodular liver, spleen {spl} cm. Hepatofugal flow in the main portal vein.', c)] },
  ],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill([['Bilirubin', '3.1 mg/dL', 'warn'], ['Albumin', '2.6 g/dL', 'warn'], ['INR', '1.7', 'warn'], ['Platelets', '{plt} ×10⁹/L', 'warn'], ['Creatinine', '1.0 mg/dL', '']], c) }),
    ct: { title: 'CT scan with contrast', lines: ['Portal vein open, no clot. Large spontaneous splenorenal shunts.', 'Nodular liver, a little ascites.'] },
    doppler: { title: 'Doppler of the liver vessels', extra: ['No clot seen in the portal vein.'] },
  },
  orders: ['labs', 'doppler', 'fibroscan', 'ct', 'hvpg'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Direction of portal flow', 'pvdir', '']],
  build: () => {
    const steps = [
      { id: 'meaning', title: 'The report',
        q: 'What does "hepatofugal" mean?', options: ['Flow runs away from the liver: advanced disease', 'Flow runs toward the liver: a normal finding', 'The portal vein is blocked by a clot', 'The Doppler color setting was wrong'], answer: 0,
        why: 'Hepatopetal means toward the liver and is normal. Hepatofugal means away, a sign of advanced disease.' },
      { id: 'check', title: 'What to check', needsAny: ['doppler', 'ct'],
        q: 'What do you check next?', options: ['Look for a clot in the portal vein on Doppler or CT', 'Nothing: it is an incidental finding', 'A liver biopsy', 'Place a TIPS'], answer: 0,
        why: 'Reversed flow is usually advanced disease, but a clot in the portal vein is the treatable thing to exclude.' },
      { id: 'plan', title: 'The plan',
        q: 'What do you do now?', options: ['Refer her for transplant assessment', 'Reassure her and repeat the scan in a year', 'Place a TIPS to restore portal flow', 'Anticoagulate her to prevent a clot'], answer: 0,
        why: 'Hepatofugal flow, rising bilirubin and a past episode of confusion mean advanced disease. Start the transplant referral.' },
    ];
    const objectives = [
      { id: 'meaning', weight: 30, text: 'Read the report correctly', check: (c) => c.met('meaning') },
      { id: 'check', weight: 30, text: 'Excluded a portal vein clot', check: (c) => c.met('check') && (c.did('doppler') || c.did('ct')) },
      { id: 'plan', weight: 40, critical: true, text: 'Referred for transplant evaluation', check: (c) => c.met('plan') },
    ];
    return { steps, objectives };
  },
  pearls: ['Hepatofugal means away from the liver: advanced portal hypertension.', 'Exclude a portal vein clot, then think of transplant.', 'Read the direction from the report, not from the color on the screen.'],
  refs: ['de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.'],
};

export const postTips = {
  id: 'post-tips', title: 'Confused after a TIPS', level: 'Management', minutes: 7,
  tests: ['labs', 'tap-dx'],
  summary: 'A man three weeks after a TIPS becomes drowsy. Treat the encephalopathy, and know what to do when it keeps coming back.',
  tools: ['select', 'stent'], hidden: DX_HIDDEN, speed: 1,
  preset: 'cirr-decomp', params: { diuretics: true, tips: { on: true, d: 8 } },
  patient: { name: 'Walter Hughes', age: 63, sex: 'M', setting: 'Medical admissions unit', problem: 'Drowsy and muddled. TIPS three weeks ago.' }, variants: [{ vid: 'a' }],
  vitals: ['hr', 'bp'],
  intro: () => ['Walter is brought in by his daughter. For four days he has been sleepy, mixing up day and night, and he dropped a cup this morning.'],
  chart: () => [
    { id: 'hx', section: 'History', title: 'Story', lines: ['TIPS with an 8 mm stent three weeks ago for refractory ascites. The ascites is much better.', 'Four days of increasing sleepiness, day-night reversal and a hand tremor. No vomiting, no black stool, constipated for three days.', 'Takes spironolactone and furosemide.'] },
    { id: 'exam', section: 'Exam', title: 'On arrival', lines: ['Drowsy, oriented to person only. Flapping tremor of both hands.', 'Afebrile. Abdomen soft, small ascites, no tenderness. No focal weakness.'] },
  ],
  results: {
    labs: { title: 'Blood tests', rows: [['Sodium', '131 mmol/L', 'warn'], ['Potassium', '3.2 mmol/L', 'warn'], ['Creatinine', '1.2 mg/dL', ''], ['Glucose', '5.6 mmol/L', ''], ['Ammonia', 'raised', 'warn'], ['Bilirubin', '2.0 mg/dL', 'warn']] },
    'tap-dx': { title: 'Ascitic fluid', rows: [['Neutrophils', '40 /mm³', '']], note: 'No infection.' },
    ct: { title: 'CT scan of the head', lines: ['No bleed, no stroke.'] },
  },
  orders: ['labs', 'tap-dx', 'ct'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Blood flow to the liver', 'hepflow', 'L/min']],
  build: () => {
    const steps = [
      { id: 'cause', title: 'The cause',
        q: 'What is the most likely cause of his confusion?', options: ['Hepatic encephalopathy from the shunt', 'A stroke during the procedure', 'Alcohol withdrawal after admission', 'Low blood sugar from poor intake'], answer: 0,
        why: 'Shunting blood past the liver lets gut toxins reach the brain. Look for a trigger: infection, bleeding, constipation, low potassium, diuretics.' },
      { id: 'treat', title: 'Treatment',
        q: 'How do you treat it?', options: ['Lactulose, then add rifaximin to prevent recurrence', 'Stop the diuretics and restrict protein', 'Remove the TIPS at once', 'A sedative for the agitation'], answer: 0,
        onCommit: (c) => c.story('Walter improves over two days on lactulose. A hard stool clears and his potassium is replaced.'),
        why: 'Lactulose is first line, and rifaximin is added to prevent the next episode. Do not sedate, and do not restrict protein.' },
      { id: 'reduce', title: 'If it keeps coming back',
        q: 'Two months later he has had three more episodes despite lactulose and rifaximin. What next?', options: ['Reduce the diameter of the TIPS stent', 'Double the lactulose forever', 'Stop the rifaximin', 'Tell him nothing else can be done'], answer: 0,
        onCommit: async (c, pick) => {
          if (pick !== 0) return;
          const a = c.read(); c.order('tips-reduce'); await c.advance(60); const b = c.read();
          return { title: 'The shunt is made smaller', text: 'A narrower shunt sends more blood back through the liver, which clears more toxins.', rows: [['Blood flow to the liver', `${a.hepflow.toFixed(2)} → ${b.hepflow.toFixed(2)} L/min`], ['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`]] };
        },
        why: 'Persistent encephalopathy after a TIPS can be treated by reducing the stent. It trades some of the pressure benefit for more blood through the liver.' },
    ];
    const objectives = [
      { id: 'cause', weight: 30, text: 'Recognized encephalopathy after TIPS', check: (c) => c.met('cause') },
      { id: 'treat', weight: 40, critical: true, text: 'Lactulose first, then rifaximin', check: (c) => c.met('treat') },
      { id: 'reduce', weight: 30, text: 'Shunt reduction for recurrent episodes', check: (c) => c.met('reduce') },
    ];
    return { steps, objectives };
  },
  pearls: ['A TIPS lets blood bypass the liver, so encephalopathy is the main price.', 'Look for a trigger, then lactulose, then add rifaximin.', 'If it keeps coming back, reduce the shunt.'],
  refs: ['Vilstrup H, et al. Hepatic encephalopathy in chronic liver disease: AASLD and EASL guidance. Hepatology 2014;60:715–35.'],
};
