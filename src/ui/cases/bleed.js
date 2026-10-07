// C1. Hematemesis in the emergency department. The one acute case: a real clock, a patient who is
// actually unstable, and two safety-critical choices whose effect the model shows at once.

import { DX_HIDDEN, pltRow } from './kit.js?v=010d07460c';

const PATIENTS = {
  A: { name: 'Daniel Reyes', age: 54, sex: 'M', setting: 'Emergency department', problem: 'Vomiting blood. Known cirrhosis.' },
  B: { name: 'Marcus Webb', age: 49, sex: 'M', setting: 'Emergency department', problem: 'Vomiting blood. Hepatitis C cirrhosis, never scoped.' },
};

const HX = {
  A: ['Alcohol-related cirrhosis, known for 3 years. Still drinks about six beers a day.', 'Two large episodes of bright red vomit in the last hour, and a black stool this morning.', 'Takes spironolactone 100 mg and furosemide 40 mg. No aspirin, no anticoagulant. No drug allergies.', 'Last endoscopy 14 months ago: medium-sized varices, no treatment started.'],
  B: ['Hepatitis C, diagnosed with cirrhosis 8 months ago. Attends clinic irregularly and has never had an endoscopy.', 'One large bright red vomit at home and a second in the ambulance.', 'Takes no regular medicines. No aspirin, no anticoagulant. Penicillin allergy: rash only, as a child.'],
};
const EXAM = {
  A: ['Pale, sweaty, drowsy but rousable. Gives his name, not the date.', 'Airway protected, no stridor. Blood on his shirt.', 'Jaundice, spider naevi, mild ascites, spleen tip palpable.'],
  B: ['Anxious and pale, fully alert. Airway protected.', 'No jaundice. A few spider naevi. No ascites. Spleen palpable.'],
};
const LABS = {
  A: { inr: 1.8, bili: 3.4, na: 134, cr: 1.1, lac: 3.1, asc: 'Mild, controlled on diuretics', he: 'None' },
  B: { inr: 1.3, bili: 1.4, na: 139, cr: 0.9, lac: 2.4, asc: 'None', he: 'None' },
};

const HB0 = 6.4, HB_PER_UNIT = 0.75;

export const bleed = {
  id: 'bleed', title: 'Vomiting blood in the ED', level: 'Acute care', minutes: 10, acute: true,
  summary: 'A man with cirrhosis vomits blood and is already unstable. Run the first hour, decide how much blood to give, and plan what comes after the scope.',
  tools: ['select', 'endoscope', 'balloon'], hidden: DX_HIDDEN, speed: 6,
  preset: 'cirr-decomp', params: {},
  // Each attempt differs: the tear size and how long he bled before arrival vary, so the opening vitals match the story.
  variants: [
    { vid: 'A', patient: PATIENTS.A, preset: 'cirr-decomp', plan: 'tips', hx: HX.A, exam: EXAM.A, lab: LABS.A },
    // B is Child A (no ascites, normal albumin), so it starts from compensated cirrhosis aged to large varices.
    { vid: 'B', patient: PATIENTS.B, preset: 'csph', prep: (p) => { p.cirrhosis = 0.8; p.albumin = 4.5; return p; }, afterDays: 150, plan: 'standard', hx: HX.B, exam: EXAM.B, lab: LABS.B },
    { vid: 'C', patient: { ...PATIENTS.A, name: 'Victor Hale', age: 57 }, preset: 'cirr-decomp', plan: 'rebleed', hx: HX.A.map((s) => s.replace('14 months ago', '9 months ago')), exam: EXAM.A, lab: LABS.A },
  ],
  setup: async (a, c) => { a.action({ kind: 'rupture', site: 'VAR', tear: 0.95 }); await c.advance(330); a.action({ kind: 'rupture', site: 'VAR', tear: 0.9 }); await c.advance(60); },
  vitals: ['hr', 'bp', 'hb'],
  intro: (c) => [`${c.cs.patient.name} arrives by ambulance, vomiting blood. Heart rate ${c.hr}, blood pressure ${c.bp}.`, 'Nurse: "He has one cannula. I can get a second line and the blood bottles. Where do you want to start?"'],
  chart: (c) => [
    { id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx },
    { id: 'exam', section: 'Exam', title: 'On arrival', lines: c.cs.exam },
  ],
  results: {
    labs: (c) => ({ title: 'Blood tests', rows: [
      ['Hemoglobin', `${c.hbLab().toFixed(1)} g/dL`, c.hbLab() < 7 ? 'bad' : ''],
      pltRow(c.m),
      ['INR', `${c.cs.lab.inr}`, c.cs.lab.inr > 1.5 ? 'warn' : ''],
      ['Bilirubin', `${c.cs.lab.bili} mg/dL`, c.cs.lab.bili > 3 ? 'warn' : ''],
      ['Albumin', `${c.params.albumin.toFixed(1)} g/dL`, c.params.albumin < 3.5 ? 'warn' : ''],
      ['Sodium', `${c.cs.lab.na} mmol/L`, ''], ['Creatinine', `${c.cs.lab.cr} mg/dL`, ''],
      ['Lactate', `${c.cs.lab.lac} mmol/L`, c.cs.lab.lac > 2 ? 'warn' : ''],
      ['Ascites (exam)', c.cs.lab.asc, ''], ['Confusion (exam)', c.cs.lab.he, ''],
    ] }),
    egd: { title: 'Upper endoscopy', lines: ['Large esophageal varices with red wale signs. One column is spurting.', 'Fundus normal. No ulcer.'] },
  },
  orders: ['labs', 'crystalloid', 'prbc', 'vaso', 'ceftriaxone', 'egd', 'evl', 'balloon', 'tips8'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Heart rate', 'hr', '/min'], ['Blood pressure', 'bp', ''], ['Blood lost', 'lost', 'mL']],
  hbLab: (c) => HB0 + HB_PER_UNIT * c.count('prbc'),
  build: (v) => {
    const rebleed = v.plan === 'rebleed';
    const steps = [
      { id: 'bundle', title: 'First 15 minutes', auto: true, multi: true,
        q: (c) => `${c.cs.patient.name} is pale and still vomiting. Heart rate ${c.hr}, blood pressure ${c.bp}. What do you do in the first 15 minutes?`,
        options: [
          { t: 'Two large IV lines and a cautious fluid bolus', does: ['crystalloid'] },
          { t: 'A vasoactive drug: terlipressin or octreotide', does: ['vaso'] },
          { t: 'IV ceftriaxone', does: ['ceftriaxone'] },
          { t: 'Blood tests and a crossmatch', does: ['labs'] },
          'FFP to correct the INR',
          'Platelets to bring the count above 100',
          'An IV proton pump inhibitor alone, scope on the morning list',
        ],
        answer: [1, 2], avoid: [4, 5, 6],
        unsafe: {
          when: (pick) => !pick.includes(1),
          run: async (c) => {
            const a = c.read(); await c.advance(120); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.8 }); await c.advance(180); const b = c.read(); c.order('vaso');
            return { title: 'Five minutes without a vasoactive drug', text: 'The pressure behind the varix stays high, so the clot does not hold and he vomits blood again. Your attending starts terlipressin and the bleeding slows.',
              rows: [['Heart rate', `${a.hr} → ${b.hr}`], ['Blood pressure', `${a.bp} → ${b.bp}`], ['Blood lost', `+${Math.max(0, Math.round(b.lost - a.lost))} mL`]] };
          } },
        why: 'A vasoactive drug and an antibiotic start before the scope, whatever the blood count. FFP and platelets do not fix variceal bleeding; they add volume and raise pressure.' },
      { id: 'transfuse', title: 'Transfusion', needs: ['labs'],
        q: (c) => `His hemoglobin is ${c.hbLab().toFixed(1)} g/dL and he is still oozing. How much blood do you give?`,
        options: [
          { t: 'Transfuse to a hemoglobin of 7 to 8 g/dL', does: ['prbc', 'prbc'] },
          { t: 'Transfuse to 10 g/dL so he is safe for the scope', does: ['prbc', 'prbc', 'prbc', 'prbc'] },
          'No blood yet; give FFP for the INR',
          'Wait until the hemoglobin is below 5',
        ],
        answer: 0,
        onCommit: async (c, pick) => { if (pick > 1) { c.story('Ten minutes later he is greyer and his heart rate has climbed. Your attending gives two units.'); c.order('prbc'); c.order('prbc'); } c.story(`Repeat hemoglobin: ${c.hbLab().toFixed(1)} g/dL.`); },
        unsafe: {
          when: (pick) => pick === 1,
          run: async (c) => {
            const a = c.read(); await c.advance(360); const b = c.read(); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.6 }); await c.advance(30);
            return { title: 'Too much blood, too fast', text: 'Filling the veins raises the pressure in the portal system, and the varix tears again. Over-transfusion is a common cause of early rebleeding.',
              rows: [['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`], ['Blood pressure', `${a.bp} → ${b.bp}`], ['Bleeding', 'slowed → active again']] };
          } },
        why: 'Aim for a hemoglobin of 7 to 8. Giving more raises portal pressure and the chance of rebleeding, with no benefit.' },
      { id: 'timing', title: 'Timing of the scope',
        q: 'Resuscitation is under way and the bleeding has slowed. When should he have his endoscopy?',
        options: ['Within 12 hours of arrival, once resuscitated', 'Immediately, before any resuscitation', 'On tomorrow morning\'s list', 'Only if he bleeds again'],
        answer: 0,
        onCommit: async (c) => {
          await c.skip({ label: 'Endoscopy suite, 4 hours later', seconds: 600, clockAdd: 4 * 3600 });
          c.order('evl', { pane: true });
          c.story('Endoscopy: large esophageal varices with red wale signs and one spurting column. Four bands are placed and the bleeding stops.'); },
        why: 'Resuscitate first, then scope within 12 hours. An earlier scope is for the patient who stays unstable.' },
    ];
    if (rebleed) {
      steps.push({ id: 'rebleed', title: 'He bleeds again', auto: true,
        onOpen: async (c) => { await c.skip({ label: 'Ward, day 2', seconds: 120, clockAdd: 44 * 3600 }); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.9 }); await c.advance(120); },
        q: (c) => `Day 2 on the ward, the day after banding. He vomits a large amount of blood. Heart rate ${c.hr}, blood pressure ${c.bp}. What now?`,
        options: [
          { t: 'Balloon tamponade as a bridge, then rescue TIPS', does: ['balloon'] },
          'Band again and observe on the ward',
          'Stop the vasoactive drug, since he has been banded',
          'Take him to theatre for a surgical shunt tonight',
        ],
        answer: 0,
        onCommit: async (c, pick) => { if (pick === 0) { await c.skip({ label: 'Interventional radiology, 3 hours later', seconds: 300, clockAdd: 3 * 3600 }); c.order('tips8'); c.order('balloon'); c.story('The TIPS is placed and the balloon is deflated. No further bleeding.'); } },
        why: 'A rebleed after banding is a rescue situation: control it with a balloon as a short bridge, then place a TIPS.' });
    } else {
      steps.push({ id: 'after', title: 'After the bleed', auto: true,
        onOpen: (c) => c.story('Bleeding is controlled. The chart now has his bilirubin, albumin, INR, ascites and mental state.'),
        q: 'Bleeding is controlled. What is the best step now to prevent early rebleeding and death?',
        options: ['Pre-emptive TIPS within 72 hours', 'A beta blocker and a banding program', 'Stop the vasoactive drug and send him home on a proton pump inhibitor', 'Repeat endoscopy only if he bleeds again'],
        answer: v.plan === 'tips' ? 0 : 1,
        onCommit: async (c, pick) => { if (pick === 0) c.order('tips8'); else if (pick === 1) { c.order('carvedilol'); } },
        why: v.plan === 'tips' ? 'Child–Pugh C (about 11 points) with active bleeding: early TIPS within 72 hours lowers rebleeding and deaths.' : 'Child–Pugh A (5 points): a beta blocker plus banding is the standard. Early TIPS is for Child–Pugh C or high-risk Child–Pugh B.' });
    }
    const last = steps[steps.length - 1].id;
    const objectives = [
      { id: 'vaso', weight: 25, critical: true, text: 'A vasoactive drug started early', check: (c) => c.chose('bundle', 1) },
      { id: 'abx', weight: 10, text: 'Antibiotics given', check: (c) => c.chose('bundle', 2) },
      { id: 'noharm', weight: 10, text: 'No FFP, platelets or PPI-only plan', check: (c) => ![4, 5, 6].some((i) => c.chose('bundle', i)) },
      { id: 'transfusion', weight: 25, critical: true, text: 'Transfused to a hemoglobin of 7 to 8, not above', check: (c) => c.met('transfuse') },
      { id: 'scope', weight: 10, text: 'Endoscopy within 12 hours, after resuscitation', check: (c) => c.met('timing') },
      { id: 'plan', weight: 20, text: rebleed ? 'Balloon as a bridge, then rescue TIPS' : 'The right plan after control', check: (c) => c.met(last) },
    ];
    return { steps, objectives };
  },
  pearls: ['A vasoactive drug, an antibiotic and an endoscopy are the bundle. Start the drug and antibiotic before the scope.', 'Over-transfusing raises portal pressure and the risk of rebleeding. Aim for a hemoglobin of 7 to 8.', 'Child–Pugh C, or B with active bleeding at endoscopy: early TIPS within 72 hours.'],
  refs: ['de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74.', 'Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.', 'Villanueva C, et al. Transfusion strategies for acute upper gastrointestinal bleeding. N Engl J Med 2013;368:11–21.'],
};
