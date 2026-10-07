// C8. The beta blocker that became a problem: carvedilol in advanced cirrhosis with low pressure,
// low sodium and a rising creatinine. The chart has the signs; the learner has to see them.

import { DX_HIDDEN } from './kit.js?v=010d07460c';

const PT = { name: 'George Miller', age: 66, sex: 'M', setting: 'Medical ward', problem: 'Ascites that no longer responds. Light-headed on standing.' };

export const nsbb = {
  id: 'nsbb-problem', title: 'The beta blocker that became a problem', level: 'Management', minutes: 8,
  summary: 'A man with advanced cirrhosis has been on carvedilol for two years. Now his pressure is low and his kidneys are failing. What do you do with the drug, and with his varices?',
  tools: ['select', 'endoscope'], hidden: DX_HIDDEN, speed: 1,
  preset: 'cirr-decomp', afterDays: 300, prep: (p) => { p.diuretics = false; return p; }, params: { drugs: { carvedilol: true } },
  patient: PT, variants: [{ vid: 'a' }],
  vitals: ['hr', 'bp'],
  vitalsFn: (c) => (c.flag('stopped') ? { hr: '72', bp: '104/62' } : { hr: '58', bp: '86/54' }),
  intro: () => ['George was admitted for a large tap. The nurse says he nearly fainted getting out of bed and his urine output has dropped.'],
  chart: () => [
    { id: 'hx', section: 'History', title: 'Story', lines: ['Alcohol-related cirrhosis. Abstinent for 18 months.', 'Ascites for a year; now needs a tap every three weeks and does not respond to higher diuretic doses.', 'On carvedilol 12.5 mg twice daily for two years, started for large esophageal varices. Also takes spironolactone 200 mg and furosemide 80 mg.'] },
    { id: 'exam', section: 'Exam', title: 'On the ward', lines: ['Light-headed on standing. Dry mouth. Tense ascites.', 'Alert, no asterixis.'] },
    { id: 'labs0', section: 'Labs', title: 'This morning', rows: [['Sodium', '128 mmol/L', 'bad'], ['Creatinine', '1.9 mg/dL', 'bad'], ['Potassium', '5.2 mmol/L', 'warn'], ['Bilirubin', '2.2 mg/dL', 'warn'], ['Albumin', '2.7 g/dL', 'warn']], note: 'His creatinine was 1.1 mg/dL three months ago.' },
  ],
  results: {
    labs: { title: 'Blood tests (repeat)', rows: [['Sodium', '128 mmol/L', 'bad'], ['Creatinine', '1.9 mg/dL', 'bad'], ['Potassium', '5.2 mmol/L', 'warn']] },
    'tap-dx': { title: 'Ascitic fluid', rows: [['SAAG', '1.9 g/dL', 'warn'], ['Ascitic protein', '0.9 g/dL', 'warn'], ['Neutrophils', '55 /mm³', '']], note: 'No infection.' },
  },
  orders: ['labs', 'tap-dx', 'lvp-alb', 'carvedilol', 'diuretics', 'evl'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Ascites', 'asc', 'mL']],
  build: () => {
    const steps = [
      { id: 'drug', title: 'The carvedilol', auto: true,
        q: 'His blood pressure is 86/54, his sodium is 128 and his creatinine has risen. What do you do with the carvedilol?',
        options: [{ t: 'Reduce it or stop it for now' }, 'Continue it unchanged to protect the varices', 'Double the dose to protect the varices', 'Switch to propranolol 160 mg'],
        answer: 0,
        onCommit: async (c, pick) => {
          if (pick !== 0) return;
          const a = c.read(); c.order('carvedilol'); c.flag('stopped', true);
          await c.skip({ label: 'Ward, 2 days later', days: 2 });
          c.story('Two days later his blood pressure is 104/62 and his creatinine is 1.5 mg/dL.'); c.snap('Carvedilol stopped');
          const b = c.read();
          return { title: 'Carvedilol stopped', text: 'His blood pressure recovers and the kidneys begin to follow. The price is a little more pressure in the portal system, which is why the varices need another protection.', rows: [['Heart rate', `${a.hr} → ${b.hr}`], ['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`]] };
        },
        unsafe: {
          when: (pick) => pick === 1 || pick === 2 || pick === 3,
          run: async (c) => {
            c.order('carvedilol'); c.flag('stopped', true);
            return { title: 'The next morning', text: 'His blood pressure falls to 78/46 and he passes almost no urine. His creatinine is 2.8 mg/dL. The drug that protects his varices is now harming his kidneys. Your attending stops it.', rows: [['Blood pressure', '86/54 → 78/46'], ['Creatinine', '1.9 → 2.8 mg/dL'], ['Urine output', 'almost none']] };
          } },
        why: 'In refractory ascites with low blood pressure, low sodium or kidney injury, reduce or stop the beta blocker. A low pressure to the kidneys is the larger danger.' },
      { id: 'varices', title: 'The varices', 
        q: 'With the carvedilol stopped, how do you protect his varices?',
        options: [{ t: 'A banding program', does: ['evl'] }, 'Switch to propranolol', 'Nothing: the ascites matters more', 'TIPS'],
        answer: 0,
        onCommit: async (c) => { await c.skip({ label: 'Clinic, 6 weeks later', days: 42 }); c.story('Six weeks on: two banding sessions done, his creatinine is 1.3 mg/dL and his blood pressure is 102/60.'); },
        why: 'Banding protects the varix without touching blood pressure or the kidneys.' },
      { id: 'restart', title: 'Restart?',
        q: 'His creatinine is 1.3 and his blood pressure is 102/60. What about the carvedilol?',
        options: [{ t: 'Restart at a lower dose and recheck the kidneys', does: ['carvedilol'] }, 'Restart the original dose straight away', 'Never restart it: banding alone is enough', 'Switch to propranolol 160 mg a day'],
        answer: 0, why: 'Once blood pressure and kidneys recover, restart at a lower dose, with close checks. Many patients can take it again.' },
    ];
    const objectives = [
      { id: 'recognize', weight: 40, critical: true, text: 'Saw the low pressure and kidney strain, and stopped the beta blocker', check: (c) => c.met('drug') },
      { id: 'varices', weight: 25, text: 'Protected the varices another way', check: (c) => c.met('varices') },
      { id: 'restart', weight: 20, text: 'Restarted at a lower dose once recovered', check: (c) => c.met('restart') },
      { id: 'chart', weight: 15, text: 'Read the chart before deciding', check: (c) => c.viewed('chart') },
    ];
    return { steps, objectives };
  },
  pearls: ['In refractory ascites with low pressure, low sodium or a rising creatinine, reduce or stop the beta blocker.', 'Banding protects the varices without the drug.', 'Restart at a lower dose once the pressure and kidneys recover.'],
  refs: ['de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.', 'Biggins SW, et al. Diagnosis, evaluation and management of ascites, SBP and hepatorenal syndrome. Hepatology 2021;74:1014–48.'],
};
