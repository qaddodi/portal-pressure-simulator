// C12. Treat the cause: hepatitis C cured in compensated cirrhosis with clinically significant portal
// hypertension. Over the next two years the liver resistance falls and the model shows the pressure,
// the varices and the spleen recede. When can carvedilol stop, and what follow-up stays?
// (Model check, Oct 2026: lowering the cirrhosis parameter from 0.6 to 0.35 takes HVPG 11.8 → 5.4 mmHg,
// varices small → none, spleen 15.8 → 12.3 cm and stiffness 24 → 10 kPa over months.)

import { DX_HIDDEN, fill, esoText, plt, lsm } from './kit.js?v=4db57f825c';

const PT = { name: 'Lena Novak', age: 52, sex: 'F', setting: 'Hepatology clinic', problem: 'Hepatitis C cured. What now for her portal pressure?' };

export const treatCause = {
  id: 'treat-cause', title: 'Cured, and now?', level: 'Management', minutes: 7,
  tests: ['labs', 'fibroscan', 'hvpg'],
  summary: 'Her hepatitis C has just been cured. Follow her liver and her portal pressure over two years, and decide when carvedilol and the checks can change.',
  tools: ['select', 'endoscope'], hidden: DX_HIDDEN, speed: 1,
  preset: 'csph', params: { drugs: { carvedilol: true } },
  patient: PT, variants: [{ vid: 'hcv' }],
  vitals: ['hr', 'bp'],
  intro: () => ['Lena has finished twelve weeks of antiviral tablets. The virus is undetectable: hepatitis C is cured. She asks what happens to her liver and her tablets now.'],
  chart: (c) => [
    { id: 'hx', section: 'History', title: 'Story', lines: ['Hepatitis C cirrhosis, found two years ago. Never drank much alcohol. Body weight normal.', 'Endoscopy two years ago: small varices; on carvedilol 12.5 mg a day since, without side effects.', 'Twelve weeks of antiviral tablets: virus now undetectable (cured).'] },
    { id: 'exam', section: 'Exam', title: 'Today', lines: ['Well. No jaundice, no ascites. Spleen tip palpable.'] },
  ],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: fill([['Platelets', '{plt} ×10⁹/L', plt(c.m) < 150 ? 'warn' : ''], ['Bilirubin', '0.8 mg/dL', ''], ['Albumin', '4.2 g/dL', ''], ['INR', '1.1', ''], ['Hepatitis C RNA', 'Not detected', '']], c) }),
    egd: (c) => ({ title: 'Upper endoscopy', lines: [`${esoText(c.m)}.`] }),
  },
  orders: ['labs', 'fibroscan', 'egd', 'hvpg', 'carvedilol'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Pressure gradient (HVPG)', 'hvpg', 'mmHg'], ['Varix size', 'varix', 'mm'], ['Spleen size', 'spleen', 'cm']],
  trend: ['Portal pressure', 'pv', 'mmHg'],
  build: () => {
    const steps = [
      { id: 'now', title: 'The day of the cure',
        q: 'Her virus is cured today. What changes for her portal hypertension right now?',
        options: ['Nothing yet: keep carvedilol; the pressure falls over months to years', 'Stop carvedilol: the cause is gone', 'Stop all liver checks: she is cured', 'Refer for a TIPS before the scarring sets'],
        answer: 0,
        onCommit: async (c, pick) => {
          if (pick === 1) c.order('carvedilol');
          c.patch((p) => { p.cirrhosis = 0.35; return p; });
          await c.skip({ label: 'Clinic, two years later', days: 730 });
        },
        why: 'Curing the cause starts a slow fall in liver stiffness and portal pressure, over months to years. Until it is shown to be gone, the varices still need protecting.' },
      { id: 'stop', title: 'Two years on',
        q: (c) => `Two years on she feels well. Liver stiffness ${lsm(c.m)} kPa, platelets ${plt(c.m)} ×10⁹/L. She asks to stop carvedilol. What do you do?`,
        options: ['Check whether the pressure is still clinically significant (HVPG): stop only if it is under 10', 'Stop it now: her stiffness has fallen', 'Keep it for life whatever happens', 'Double the dose: the varices could still bleed'],
        answer: 0,
        why: 'Stiffness and platelets suggest the pressure has fallen, but stopping a beta blocker is safest once a measurement shows it is no longer clinically significant (HVPG under 10). Her model HVPG has fallen well below that.' },
      { id: 'follow', title: 'What stays',
        q: 'Her pressure is no longer raised and the varices have gone. What follow-up does she still need?',
        options: ['Liver cancer checks with an ultrasound every six months: some scarring remains', 'None: she is cured', 'An endoscopy every year for life', 'An HVPG every year'],
        answer: 0,
        why: 'Cure lowers but does not remove the risk of liver cancer in someone who had cirrhosis, so six-monthly ultrasound continues.' },
    ];
    const objectives = [
      { id: 'now', weight: 35, critical: true, text: 'Kept carvedilol on the day of the cure', check: (c) => c.met('now') },
      { id: 'stop', weight: 35, text: 'Measured the pressure before stopping carvedilol', check: (c) => c.met('stop') },
      { id: 'follow', weight: 30, text: 'Kept liver cancer surveillance', check: (c) => c.met('follow') },
    ];
    return { steps, objectives };
  },
  pearls: ['Removing the cause (cured hepatitis C, no more alcohol) lowers portal pressure over months to years: the varices and the spleen recede.', 'Stop a beta blocker once the pressure is shown to be no longer clinically significant.', 'Liver cancer surveillance continues after cure in anyone who had cirrhosis.'],
  refs: ['de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74.', 'Lens S, et al. Clinical outcome and hemodynamic changes following HCV eradication with oral antiviral therapy in patients with clinically significant portal hypertension. J Hepatol 2020;73:1415–24.'],
};
