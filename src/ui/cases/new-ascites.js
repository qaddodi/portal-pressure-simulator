// C3. New ascites, whose fault? The fluid test is mandatory; the heart variants must not get a TIPS.

import { DX_HIDDEN, fill } from './kit.js?v=4021282d5c';

const PT = { name: 'Tom Alvarez', age: 68, sex: 'M', setting: 'Medical admissions unit', problem: 'Six weeks of belly and ankle swelling.' };

const VARIANTS = {
  liver: {
    preset: 'cirr-decomp', afterDays: 180, prep: (p) => { p.diuretics = false; return p; }, heart: false,
    hx: ['Six weeks of increasing belly swelling and ankle swelling.', 'Heavy drinking for 25 years: about a bottle of wine a day until last year.', 'Takes no regular medicines.'],
    exam: ['Spider naevi and palmar erythema. Firm liver edge, spleen tip palpable.', 'Distended abdomen with shifting dullness. Jugular venous pressure not raised.', 'Ankle edema to the shins.'],
    tap: [['SAAG', '1.6 g/dL', 'warn'], ['Ascitic protein', '1.1 g/dL', 'warn'], ['Neutrophils', '80 /mm³', '']],
    labs: [['Bilirubin', '2.1 mg/dL', 'warn'], ['Albumin', '{alb} g/dL', 'warn'], ['INR', '1.5', 'warn'], ['Platelets', '{plt} ×10⁹/L', 'warn'], ['Sodium', '133 mmol/L', ''], ['Creatinine', '1.0 mg/dL', '']],
    us: 'Small nodular liver, spleen {spl} cm, ascites. Hepatic veins normal.', echo: 'Normal ejection fraction. No significant valve disease. Right atrium and ventricle normal.', dopExtra: ['Hepatic veins open and collapsing normally.'],
  },
  // SBP: the same cirrhotic patient, with an infected fluid (neutrophils of 250/mm³ or more).
  sbp: {
    preset: 'cirr-decomp', afterDays: 180, prep: (p) => { p.diuretics = false; return p; }, heart: false, sbp: true,
    hx: ['Six weeks of increasing belly swelling and ankle swelling; two days of a low fever and a sore belly.', 'Heavy drinking for 25 years: about a bottle of wine a day until last year.', 'Takes no regular medicines.'],
    exam: ['Temperature 37.9 °C. Spider naevi and palmar erythema. Spleen tip palpable.', 'Distended abdomen, diffusely tender, with shifting dullness. Jugular venous pressure not raised.', 'Ankle edema to the shins. Mildly drowsy.'],
    tap: [['SAAG', '1.6 g/dL', 'warn'], ['Ascitic protein', '0.9 g/dL', 'warn'], ['Neutrophils', '480 /mm³', 'bad']], tapNote: 'Cloudy fluid. No organisms on the Gram stain; culture in blood-culture bottles sent.',
    labs: [['Bilirubin', '2.4 mg/dL', 'warn'], ['Albumin', '{alb} g/dL', 'warn'], ['INR', '1.6', 'warn'], ['Platelets', '{plt} ×10⁹/L', 'warn'], ['Sodium', '131 mmol/L', 'warn'], ['Creatinine', '1.1 mg/dL', ''], ['CRP', '64 mg/L', 'warn']],
    us: 'Small nodular liver, spleen {spl} cm, ascites. Hepatic veins normal.', echo: 'Normal ejection fraction. No significant valve disease. Right atrium and ventricle normal.', dopExtra: ['Hepatic veins open and collapsing normally.'],
  },
  tr: {
    preset: 'rhf', params: { pulsatile: true }, heart: true,
    hx: ['Six weeks of increasing belly swelling and ankle swelling.', 'Mitral valve replaced 12 years ago. Short of breath on stairs for months.', 'Takes warfarin and furosemide.'],
    exam: ['Jugular venous pressure up to the angle of the jaw, with large v waves.', 'Pulsatile liver. Systolic murmur at the left sternal edge.', 'Distended abdomen, pitting edema to the thighs.'],
    tap: [['SAAG', '1.7 g/dL', 'warn'], ['Ascitic protein', '3.4 g/dL', 'warn'], ['Neutrophils', '40 /mm³', '']],
    labs: [['Bilirubin', '1.9 mg/dL', 'warn'], ['Albumin', '3.3 g/dL', ''], ['INR', '2.4 (on warfarin)', ''], ['Platelets', '{plt} ×10⁹/L', 'warn'], ['Sodium', '136 mmol/L', ''], ['Creatinine', '1.3 mg/dL', 'warn'], ['BNP', '640 pg/mL', 'warn']],
    us: 'Large smooth liver. Dilated hepatic veins and inferior vena cava that do not collapse. Ascites.', echo: 'Severe tricuspid regurgitation. Dilated right atrium and ventricle. Moderately reduced right ventricular function.', dopExtra: ['Portal vein flow is pulsatile, rising and falling with each heartbeat.', 'Hepatic veins and inferior vena cava dilated.'],
  },
  constrict: {
    preset: 'constrictive', heart: true,
    hx: ['Six weeks of increasing belly swelling and ankle swelling.', 'Radiotherapy to the chest for lymphoma at age 40. Breathless on exertion.', 'Takes no regular medicines.'],
    exam: ['Jugular venous pressure up, and it rises on inspiration.', 'Quiet heart sounds with an early diastolic knock.', 'Mild abdominal fullness with shifting dullness. Pitting edema to the thighs.'],
    tap: [['SAAG', '1.5 g/dL', 'warn'], ['Ascitic protein', '3.1 g/dL', 'warn'], ['Neutrophils', '60 /mm³', '']],
    labs: [['Bilirubin', '1.2 mg/dL', ''], ['Albumin', '3.5 g/dL', ''], ['INR', '1.2', ''], ['Platelets', '{plt} ×10⁹/L', ''], ['Sodium', '137 mmol/L', ''], ['Creatinine', '1.1 mg/dL', ''], ['BNP', '480 pg/mL', 'warn']],
    us: 'Normal-sized liver. Dilated inferior vena cava and hepatic veins. A small amount of ascites.', echo: 'Thickened pericardium. Septal bounce with breathing. Dilated inferior vena cava.', dopExtra: ['Dilated inferior vena cava with little change on breathing.'],
  },
};
const variant = (k) => ({ vid: k, patient: PT, ...VARIANTS[k] });

export const newAscites = {
  id: 'new-ascites', title: 'New ascites, whose fault?', level: 'Diagnosis', minutes: 9,
  tests: (c) => ['tap-dx', 'labs', 'abd-us', ...(c.cs.heart ? ['echo'] : [])], trend: ['Ascites', 'asc', 'mL'],
  summary: 'A man has six weeks of belly swelling. Find out whether the liver, the heart or something else is behind the fluid, and choose the right plan.',
  tools: ['select', 'doppler'], hidden: DX_HIDDEN, speed: 1,
  variants: [variant('liver'), variant('tr'), variant('constrict'), variant('sbp')],
  vitals: ['hr', 'bp'],
  intro: () => ['Tom Alvarez has been sent up from the emergency department with a swollen abdomen and swollen legs. The registrar asks what you want to do first.'],
  chart: (c) => [{ id: 'hx', section: 'History', title: 'Story', lines: c.cs.hx }, { id: 'exam', section: 'Exam', title: 'On the ward', lines: fill(c.cs.exam, c) }],
  results: {
    'tap-dx': (c) => ({ title: 'Ascitic fluid', rows: fill(c.cs.tap, c), note: c.cs.tapNote || 'Clear yellow fluid. No bacteria on the Gram stain.' }),
    labs: (c) => ({ title: 'Blood tests', rows: fill(c.cs.labs, c) }),
    'abd-us': (c) => ({ title: 'Ultrasound of the abdomen', lines: [fill(c.cs.us, c)] }),
    doppler: (c) => ({ title: 'Doppler of the liver vessels', extra: c.cs.dopExtra }),
    echo: (c) => ({ title: 'Echocardiogram', lines: [c.cs.echo] }),
  },
  orders: ['tap-dx', 'labs', 'abd-us', 'doppler', 'fibroscan', 'echo'],
  inside: [['Portal pressure', 'pv', 'mmHg'], ['Right atrial pressure', 'ra', 'mmHg'], ['Ascites', 'asc', 'mL']],
  build: (v) => {
    const steps = [
      { id: 'fluid', title: 'Read the fluid', needs: ['tap-dx'],
        q: 'The fluid is back. What does it tell you?',
        options: ['Portal hypertension, and low protein points to the liver itself', 'Portal hypertension, and high protein points to a block after the liver', 'Peritoneal cancer, until the cytology says otherwise', 'Infection: start broad-spectrum antibiotics now'],
        answer: v.heart ? 1 : v.sbp ? [0, 3] : 0,
        why: (v.sbp ? 'Neutrophils of 250/mm³ or more mean an infected fluid (SBP), on top of the portal hypertension. ' : '') + 'A SAAG of 1.1 or more means portal hypertension. The protein says where: low protein, the sinusoids of a cirrhotic liver; high protein, a block after the liver.' },
      { id: 'cause', title: 'The cause',
        q: 'What is the cause of his ascites?',
        options: ['The liver: cirrhosis', 'The heart: a valve or the pericardium', 'The hepatic veins: Budd–Chiari', 'The peritoneum: cancer'],
        answer: v.heart ? 1 : 0,
        why: v.heart ? 'A raised jugular venous pressure, high-protein fluid and a dilated inferior vena cava point to a cardiac cause. An echo confirms it.' : 'A small nodular liver, spider naevi, low-protein fluid and a normal heart point to cirrhosis.' },
      v.sbp ? { id: 'sbp', title: 'The infection',
        q: 'The fluid has 480 neutrophils/mm³. His blood pressure is 102/60 and creatinine 1.1. What do you start?',
        options: [{ t: 'IV ceftriaxone, with albumin 1.5 g/kg today and 1 g/kg on day 3; hold diuretics for now', does: ['ceftriaxone'] }, 'Wait for the culture before starting an antibiotic', 'Oral antibiotics, and start diuretics to clear the fluid', { t: 'A large tap to drain the infected fluid', does: ['lvp-alb'] }],
        answer: 0,
        why: 'Ascitic neutrophils of 250/mm³ or more is spontaneous bacterial peritonitis, whatever the culture shows. Start an IV third-generation cephalosporin at once and give albumin (1.5 g/kg on day 1, 1 g/kg on day 3) to protect the kidneys. Hold diuretics, and any beta blocker, while the blood pressure or kidneys are under strain.' } : null,
      v.sbp ? null : { id: 'plan', title: 'Plan',
        q: 'What is your plan?',
        options: ['Diuretics, a low-salt diet, stop alcohol and follow up in hepatology', 'Cardiology referral for the valve or pericardium, with careful diuretics', { t: 'TIPS to relieve the pressure', does: [] }, 'Repeated large taps only'],
        answer: v.heart ? 1 : 0,
        onCommit: async (c, pick) => { if (pick === 0) c.order('diuretics'); },
        unsafe: {
          when: (pick, c) => c.cs.heart && pick === 2,
          run: async (c) => {
            const a = c.read(); c.order('tips8'); await c.advance(60); const b = c.read();
            return { title: 'TIPS in a heart problem', text: 'The pressure in his portal vein comes from the heart, so a shunt to the heart lowers nothing and sends more blood into a failing right side. He is more breathless by the evening.',
              rows: [['Portal pressure', `${a.pv.toFixed(0)} → ${b.pv.toFixed(0)} mmHg`], ['Right atrial pressure', `${a.ra.toFixed(0)} → ${b.ra.toFixed(0)} mmHg`], ['Ascites', `${Math.round(a.asc)} → ${Math.round(b.asc)} mL`]] };
          } },
        why: v.heart ? 'Treat the heart. A TIPS cannot fix pressure that comes from the right atrium and can make heart failure worse.' : 'Cirrhotic ascites starts with salt restriction, diuretics and stopping alcohol.' },
    ].filter(Boolean);
    const objectives = [
      { id: 'tap', weight: 20, critical: true, text: 'Tapped the fluid', check: (c) => c.did('tap-dx') },
      { id: 'fluid', weight: 20, text: 'Read the fluid correctly: SAAG for portal hypertension, protein for the level', check: (c) => c.met('fluid') },
      { id: 'heart', weight: 10, text: v.heart ? 'Looked at the heart with an echo' : 'Did not need further heart tests', check: (c) => !v.heart || c.did('echo') },
      { id: 'cause', weight: 20, text: 'Named the cause', check: (c) => c.met('cause') },
      v.sbp ? { id: 'sbp', weight: 30, critical: true, text: 'Treated the SBP: ceftriaxone and albumin, diuretics held', check: (c) => c.met('sbp') } : { id: 'plan', weight: 30, critical: true, text: v.heart ? 'Treated the heart and did not place a TIPS' : 'The right first plan', check: (c) => c.met('plan') },
    ];
    return { steps, objectives };
  },
  pearls: ['Tap every new ascites. SAAG of 1.1 or more means portal hypertension.', 'Low ascitic protein points to the liver. High protein points after the liver: the heart or the hepatic veins.', 'Do not place a TIPS when the pressure comes from the heart.'],
  refs: ['Biggins SW, et al. Diagnosis, evaluation and management of ascites, SBP and hepatorenal syndrome. Hepatology 2021;74:1014–48.', 'de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.'],
};
