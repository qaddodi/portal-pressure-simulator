// C4. Ascites that keeps coming back: the chart plants one contraindication to TIPS, or none.

import { DX_HIDDEN, fill } from './kit.js?v=010d07460c';

const PT = { name: 'Linda Park', age: 59, sex: 'F', setting: 'Hepatology day unit', problem: 'Needs a large tap every two weeks.' };
const HX = ['Alcohol-related cirrhosis. Abstinent for two years.', 'Ascites for 18 months. Takes spironolactone 400 mg and furosemide 160 mg a day, the maximum doses. The dietitian confirms a low-salt diet and a urine sodium check confirms she follows it.', 'Needs a large tap about every two weeks and is back again today.'];
const LABS = { a: [['Bilirubin', '1.6 mg/dL', ''], ['Albumin', '{alb} g/dL', 'warn'], ['INR', '1.4', 'warn'], ['Sodium', '132 mmol/L', 'warn'], ['Creatinine', '1.2 mg/dL', '']],
  d: [['Bilirubin', '6.5 mg/dL', 'bad'], ['Albumin', '2.5 g/dL', 'warn'], ['INR', '1.9', 'warn'], ['Sodium', '129 mmol/L', 'warn'], ['Creatinine', '1.6 mg/dL', 'warn']] };
const V = {
  a: { hx: HX, labs: LABS.a, echo: 'Normal ejection fraction. Normal right heart. No significant tricuspid regurgitation.', why: 'No heart, brain or bilirubin problem, age 59: TIPS is the right next step.' },
  b: { hx: HX, labs: LABS.a, params: { tr: 0.8, contractility: 0.7 }, echo: 'Severe tricuspid regurgitation. Dilated right atrium. Right ventricular function reduced.', why: 'Severe tricuspid regurgitation: a TIPS sends more blood into a struggling right heart. Keep tapping with albumin and assess the heart.' },
  c: { hx: [...HX, 'Two admissions for hepatic encephalopathy in the last 8 months. The last one was five weeks ago.'], labs: LABS.a, echo: 'Normal ejection fraction. Normal right heart.', why: 'Recurrent encephalopathy: a TIPS would make it worse. Serial taps with albumin, and refer for transplant evaluation.' },
  d: { hx: HX, labs: LABS.d, echo: 'Normal ejection fraction. Normal right heart.', why: 'A bilirubin of 6.5 means the liver is failing. An elective TIPS would push it over. Refer for transplant evaluation.' },
};
const variant = (k) => ({ vid: k, patient: PT, ...V[k], tipsOk: k === 'a' });

export const refractory = {
  id: 'refractory', title: 'Ascites that keeps coming back', level: 'Management', minutes: 10,
  summary: 'A woman needs a large tap every two weeks despite maximum diuretics. Relieve her today, then read the chart to decide whether she should have a TIPS.',
  tools: ['select', 'needle', 'stent'], hidden: DX_HIDDEN, speed: 1,
  preset: 'cirr-decomp', afterDays: 400, prep: (p) => { p.diuretics = false; return p; },
  variants: ['a', 'b', 'c', 'd'].map(variant),
  vitals: ['hr', 'bp', 'abd'],
  intro: () => ['Linda is back in the day unit for her fourth large tap this year. She is uncomfortable and breathless lying flat.', 'She asks: "Is there anything that will stop this coming back?"'],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx }, { id: 'exam', section: 'Exam', title: 'Today', lines: ['Tense abdomen. Mild ankle edema. Alert and oriented.', 'Weight 71 kg, up 4 kg since the last tap.'] }],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill(c.cs.labs, c) }),
    echo: (c) => ({ title: 'Echocardiogram', lines: [c.cs.echo] }),
    'tap-dx': { title: 'Ascitic fluid', rows: [['SAAG', '1.8 g/dL', 'warn'], ['Ascitic protein', '1.0 g/dL', 'warn'], ['Neutrophils', '60 /mm³', '']], note: 'No infection.' },
  },
  orders: ['labs', 'echo', 'tap-dx', 'lvp-alb', 'tips8', 'tips10'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Blood flow to the liver', 'hepflow', 'L/min'], ['Ascites', 'asc', 'mL']],
  build: (v) => {
    const best = { a: 0, b: 1, c: 2, d: 2 }[v.vid];
    const steps = [
      { id: 'define', title: 'Is it refractory?',
        q: 'Is this refractory ascites?',
        options: ['Yes: it returns despite full-dose diuretics and low salt', 'No: her diuretic doses can still be pushed higher', 'No: it needs a six-month trial of diuretics first', 'No: it is a low albumin problem, not pressure'],
        answer: 0, why: 'Refractory means ascites that needs repeated large taps despite maximum diuretics and a low-salt diet she is following.' },
      { id: 'today', title: 'Today',
        q: 'She is tense and uncomfortable. What do you do today?',
        options: [{ t: 'A large tap with IV albumin', does: ['lvp-alb'] }, 'A large tap, no albumin', 'Increase the diuretic doses again', 'Fluid restriction only'],
        answer: 0,
        unsafe: {
          when: (pick) => pick === 1,
          run: async (c) => {
            const a = c.read(); c.order('lvp-noalb'); await c.advance(60); const b = c.read();
            return { title: 'A large tap without albumin', text: 'The belly is soft, but taking this much fluid without albumin drops her circulating volume. By day 3 her creatinine has climbed from 1.4 to 2.1.',
              rows: [['Ascites', `${Math.round(a.asc)} → ${Math.round(b.asc)} mL`], ['Blood pressure', `${a.bp} → ${b.bp}`]] };
          } },
        why: 'Give albumin with a large tap. Without it the kidneys and the circulation suffer.' },
      { id: 'plan', title: 'Long-term plan',
        q: 'Read her chart again. What is the long-term plan?',
        options: ['Place a TIPS', 'Keep serial large taps with albumin, and assess the heart first', 'Keep serial large taps with albumin, and refer for liver transplant evaluation', 'Start a stronger diuretic combination'],
        answer: best,
        onCommit: async (c, pick) => { if (pick === 0 && !v.tipsOk) c.order('tips8'); },
        unsafe: {
          when: (pick) => pick === 0 && !v.tipsOk,
          run: async (c) => {
            const a = c.read(); await c.advance(60); const b = c.read();
            const late = { b: 'Ten days later she is short of breath and her ankles are swollen again: the right heart cannot take the extra blood.', c: 'Ten days later she is confused and drowsy: another episode of encephalopathy, now with the shunt feeding it.', d: 'Ten days later she is deeply jaundiced and drowsy: her bilirubin has climbed to 9.8 and her liver is failing.' }[v.vid];
            return { title: 'TIPS was not the right choice for her', text: `The pressure fell, which looks like success, but ${late}`,
              rows: [['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`], ['Blood flow to the liver', `${a.hepflow.toFixed(2)} → ${b.hepflow.toFixed(2)} L/min`], ['Right atrial pressure', `${a.ra.toFixed(0)} → ${b.ra.toFixed(0)} mmHg`]] };
          } },
        why: V[v.vid].why },
      { id: 'stent', title: 'Stent size', show: (c) => v.tipsOk && c.pick('plan') === 0,
        q: 'Which stent will you place?',
        options: [{ t: 'A covered stent dilated to 8 mm' }, { t: 'A covered stent dilated to 10 mm' }, 'A bare metal stent', 'The size does not matter'],
        answer: 0,
        onCommit: async (c, pick) => {
          c.order(pick === 1 ? 'tips10' : 'tips8');
          await c.skip({ label: 'Clinic, 1 month later', days: 30 }); c.snap('One month after TIPS');
          await c.skip({ label: 'Clinic, 3 months later', days: 60 });
        },
        why: 'An 8 mm covered stent controls ascites with less encephalopathy than 10 mm. A bare stent blocks more often.' },
    ];
    const objectives = [
      { id: 'define', weight: 15, text: 'Confirmed this is refractory ascites', check: (c) => c.met('define') },
      { id: 'today', weight: 20, text: 'Relieved the fluid today, with albumin', check: (c) => c.met('today') },
      { id: 'plan', weight: 40, critical: true, text: v.tipsOk ? 'TIPS: no contraindication in the chart' : 'Spotted the contraindication and avoided TIPS', check: (c) => c.met('plan') },
      { id: 'follow', weight: 25, text: v.tipsOk ? 'Chose the 8 mm covered stent' : 'No TIPS placed', check: (c) => (v.tipsOk ? c.met('stent') : c.pick('plan') !== 0) },
    ];
    return { steps, objectives };
  },
  pearls: ['Refractory ascites: repeated large taps despite maximum diuretics and a low-salt diet.', 'Give albumin with every large tap.', 'Before a TIPS check the heart, the brain (encephalopathy) and the bilirubin. Use an 8 mm covered stent.'],
  refs: ['Bureau C, et al. Transjugular intrahepatic portosystemic shunts with covered stents increase transplant-free survival of patients with cirrhosis and recurrent ascites. Gastroenterology 2017;152:157–63.', 'Wang Q, et al. Comparison of 8 mm vs 10 mm covered TIPS stents. J Hepatol 2017;67:508–16.'],
};
