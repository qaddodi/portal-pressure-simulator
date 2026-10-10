// C2. Big varices on a screening scope: the learner reads a chart that hides the contraindication
// (or has none), chooses carvedilol or banding, then follows the patient through a skip-ahead.

import { DX_HIDDEN, pltRow, esoText, fill } from './kit.js?v=4021282d5c';

const BASE_HX = ['Compensated cirrhosis from fatty liver disease (MASLD), diagnosed 2 years ago. Never decompensated: no ascites, no confusion, no jaundice.', 'Liver stiffness {lsm} kPa. Platelets {plt}.', 'Screening endoscopy today: {eso-}. No bleeding.'];
const PATIENT = { name: 'Aisha Bello', age: 61, sex: 'F', setting: 'Hepatology clinic', problem: 'Large varices on a screening scope. No bleeding yet.' };

export const prevention = {
  id: 'prevention', title: 'Big varices on a screening scope', level: 'Prevention', minutes: 9,
  tests: (c) => (c.cs.contra === 'block' ? ['egd', 'ecg'] : ['egd']),
  summary: 'A woman with compensated cirrhosis has large varices on her screening scope. Read the chart, pick the prevention plan, and see what it does three months later.',
  tools: ['select', 'endoscope'], hidden: DX_HIDDEN, speed: 1, preset: 'csph',
  // Aged to match the story: stiffness above 25 kPa, large varices with red wale, no ascites yet.
  prep: (p) => { p.cirrhosis = 0.8; p.albumin = 4.5; return p; }, afterDays: 270,
  variants: [
    { vid: 'plain', patient: PATIENT, safe: 'any', hx: [...BASE_HX, 'Other conditions: none. Takes no regular medicines.'], contra: null },
    { vid: 'asthma', patient: PATIENT, safe: 'band', hx: [...BASE_HX, 'Other conditions: severe asthma. Uses a steroid and long-acting inhaler twice a day. Two admissions for wheeze last year.'], contra: 'asthma' },
    { vid: 'block', patient: PATIENT, safe: 'band', hx: [...BASE_HX, 'Other conditions: none known. She has felt faint on stairs for a few weeks. Takes no regular medicines.'], contra: 'block', vitalsFn: () => ({ hr: '48' }) },
  ],
  vitals: ['hr', 'bp'],
  intro: () => ['Aisha has come to hear her endoscopy result. She would like to know what happens next and whether she needs to be admitted.'],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: fill(c.cs.hx, c) },
    { id: 'exam', section: 'Exam', title: 'Today', lines: ['Well. Normal sclerae, no ascites, spleen tip palpable.', c.cs.contra === 'block' ? 'Pulse 48 and regular.' : c.cs.contra === 'asthma' ? 'Mild expiratory wheeze at the bases.' : 'No other findings.'] }],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: [pltRow(c.m), ['Bilirubin', '0.9 mg/dL', ''], ['Albumin', `${c.params.albumin.toFixed(1)} g/dL`, ''], ['INR', '1.1', ''], ['Sodium', '140 mmol/L', ''], ['Creatinine', '0.8 mg/dL', '']] }),
    egd: (c) => ({ title: 'Upper endoscopy (today)', lines: [`${esoText(c.m)}. No blood in the stomach.`, 'Fundus normal.'] }),
    ecg: (c) => ({ title: 'ECG', lines: [c.cs.contra === 'block' ? 'Second-degree heart block (Mobitz II).' : 'Sinus rhythm, rate normal. Normal conduction.'] }),
  },
  orders: ['labs', 'egd', 'fibroscan', 'ecg', 'hvpg'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Pressure gradient (HVPG)', 'hvpg', 'mmHg'], ['Varix size', 'varix', 'mm'], ['Varix wall tension', 'tension', '']],
  build: (v) => {
    const best = v.safe === 'any' ? [0, 1] : [1];
    const steps = [
      { id: 'csph', title: 'Portal hypertension?',
        q: 'Does Aisha have clinically significant portal hypertension?',
        options: ['Yes: large varices prove it, so no HVPG is needed', 'Unknown: only an HVPG of 10 or more can prove it', 'No: she has never had ascites, bleeding or confusion', 'No: varices only count once they have bled'],
        answer: 0, why: 'Large varices already prove it. Stiffness above 25 kPa with a low platelet count also makes it near certain without an HVPG.' },
      { id: 'plan', title: 'Prevention plan',
        q: 'What is your plan for Aisha?',
        options: [{ t: 'Start carvedilol', does: ['carvedilol'] }, { t: 'Band ligation until the varices are gone', does: ['evl'] }, { t: 'Carvedilol and banding together', does: ['carvedilol', 'evl'] }, 'Watch, and repeat the scope in a year'],
        answer: best,
        onCommit: async (c, pick) => { c.flag('therapy', pick === 0 ? 'nsbb' : pick === 1 ? 'band' : pick === 2 ? 'both' : 'none'); await c.skip({ label: 'Clinic, 3 months later', days: 90 }); },
        unsafe: {
          when: (pick, c) => !!c.cs.contra && (pick === 0 || pick === 2),
          run: async (c) => {
            c.order('carvedilol'); c.order('evl'); c.flag('therapy', 'band');
            const a = c.read();
            return c.cs.contra === 'asthma'
              ? { title: 'Carvedilol and her asthma', text: 'Within an hour of the first dose she is wheezing and her saturation is 91 %. Non-selective beta blockers block the receptors her inhaler needs. Carvedilol is stopped and she is switched to banding.', rows: [['Portal pressure', `${a.pv.toFixed(0)} mmHg (fell, as the drug intends)`], ['Breathing', 'wheeze, saturation 91 %']] }
              : { title: 'Carvedilol and her heart block', text: 'Her pulse falls and the monitor shows 4-second pauses. Beta blockers slow conduction. Carvedilol is stopped and she is switched to banding.', rows: [['Heart rate', `${a.hr} /min`], ['Rhythm', 'pauses up to 4 seconds']] };
          } },
        why: v.contra ? 'Her chart contained a contraindication to beta blockers (asthma or heart block). Banding is the safe choice.' : 'Carvedilol is preferred in compensated cirrhosis: it lowers portal pressure and the risk of decompensation. Banding is the alternative.' },
      { id: 'follow', title: 'Follow-up', auto: true,
        q: (c) => ({ nsbb: 'Three months on, carvedilol is tolerated and her pressure has fallen. What is the follow-up?', band: 'Three months on, the varices are smaller but still visible. What is the follow-up?', both: 'Three months on, she is on carvedilol and the varices are smaller. What is the follow-up?', none: 'Three months on she has done nothing and large varices with red signs remain. What now?' })[c.flag('therapy')],
        options: (c) => ({ nsbb: ['Continue carvedilol for life; no repeat scope while she takes it', 'Stop carvedilol now that her pressure is lower', 'Keep carvedilol and repeat the scope every 6 months', 'Keep carvedilol and add banding every week'],
          band: ['Band every 2 to 4 weeks until gone, then surveillance scopes', 'Stop banding: one session is enough to protect her', 'Switch to carvedilol alone and stop all scopes', 'No follow-up: the varices are already smaller'],
          both: ['Keep carvedilol and band every 2 to 4 weeks until gone', 'Stop carvedilol now that banding protects her', 'Stop banding and repeat the scope in a year', 'No follow-up: the varices are already smaller'],
          none: ['Start carvedilol or banding now', 'Keep watching: she has not bled', 'Repeat the scope in 6 months', 'Reassure and discharge'] })[c.flag('therapy')],
        answer: 0, why: 'Carvedilol works as long as it is taken, so no repeat scope is needed. Banding removes the varices only after a program of repeated sessions.' },
    ];
    const objectives = [
      { id: 'csph', weight: 20, text: 'Recognized clinically significant portal hypertension', check: (c) => c.met('csph') },
      { id: 'chart', weight: 10, text: 'Read the chart before choosing', check: (c) => c.viewed('chart') },
      { id: 'plan', weight: 40, critical: true, text: v.contra ? 'Spotted the contraindication and chose banding' : 'Chose a guideline plan', check: (c) => c.met('plan') },
      { id: 'follow', weight: 30, text: 'Correct follow-up for the chosen plan', check: (c) => c.met('follow') },
    ];
    return { steps, objectives };
  },
  pearls: ['Large varices, or stiffness above 25 kPa with low platelets, mean clinically significant portal hypertension. No HVPG is needed.', 'Carvedilol is the preferred beta blocker in compensated cirrhosis. Read the chart for asthma and heart block first.', 'Banding removes the varix but not the pressure: it needs repeat sessions until they are gone.'],
  refs: ['Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.', 'de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74.'],
};
