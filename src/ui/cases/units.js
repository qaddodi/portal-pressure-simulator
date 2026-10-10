// Course units 6–8 (Part B, clinic): a case run on the unit surface. Each unit is one patient from an
// existing case (caseId + variant), with a short order list (choose up to three), then decisions asked
// as stems (five options A–E, one best answer, one line per option), then a Result step that plays the
// chosen management on the model, then a scored debrief. Pure data and functions; cases.js runs it.
//
// A stem: { sid, type: 'stem', title, stem, q, options[5], answer, explain[5], enter?(c), play?(c, pick) }.
//   `stem` is plain text that stands on its own (the review card reuses it). `enter` runs when the step
//   opens; `play` runs the chosen option on the model and may return a consequence { title, text, rows, unsafe }.
// A watch step: { sid, type: 'watch', title, text, run(c) → { cols, rows } } (a side-by-side table).
// result(c, picks) → { title, text, table? } after advancing the clock; the change tables come from c.skip.
// `over` overrides the case variant (its `results` merge into the case's own).

import { pltRow } from './kit.js?v=4db57f825c';

const f0 = (x) => x.toFixed(0), f2 = (x) => x.toFixed(2);
const arrow = (a, b, fmt = f0) => `${fmt(a)} → ${fmt(b)}`;
// Rows the model gives, before → after, for a consequence box.
const delta = (a, b, keys) => keys.map(([label, k, unit, fmt]) => [label, `${typeof a[k] === 'number' ? arrow(a[k], b[k], fmt) : `${a[k]} → ${b[k]}`}${unit ? ` ${unit}` : ''}`]);

// ── Unit 6 · New-onset ascites ─────────────────────────
const U6 = {
  caseId: 'new-ascites', variant: 0, seed: 6006,
  over: { afterDays: 100, vitals: ['hr', 'bp', 'abd'], inside: [['Ascites', 'asc', 'mL'], ['Portal pressure', 'pv', 'mmHg']] },
  orders: ['tap-dx', 'labs', 'abd-us', 'doppler', 'echo'], need: ['tap-dx', 'labs', 'abd-us'],
  orderNote: 'The tap, the blood tests and the ultrasound answer the question; an echo is for a raised neck vein or high-protein fluid.',
  steps: [
    { sid: 'fluid', type: 'stem', title: 'Read the tap',
      stem: 'A 68-year-old man has six weeks of increasing abdominal and ankle swelling. He drank heavily for 25 years. He has spider naevi and shifting dullness; the jugular venous pressure is not raised. Ascitic fluid: SAAG 1.6 g/dL, protein 1.1 g/dL, neutrophils 80/mm³.',
      q: 'Which is the best interpretation of the fluid?',
      options: ['Exudate from peritoneal disease', 'Portal hypertension with a post-sinusoidal or cardiac cause', 'Portal hypertension with a sinusoidal cause', 'Spontaneous bacterial peritonitis', 'Low albumin without portal hypertension'],
      answer: 2,
      explain: ['A SAAG of 1.1 g/dL or more means portal hypertension, not peritoneal disease.', 'A heart or hepatic vein cause gives protein of 2.5 g/dL or more; his is 1.1.', 'SAAG 1.1 or more is portal hypertension; protein under 2.5 points to the sinusoids of a cirrhotic liver.', 'SBP needs 250 neutrophils/mm³ or more; he has 80.', 'Ascites from low albumin alone (nephrotic syndrome) has a SAAG below 1.1.'] },
    { sid: 'cause', type: 'stem', title: 'Find the cause',
      stem: 'The same man’s ultrasound shows a small nodular liver, a large spleen and ascites; the hepatic veins are open. Albumin is low and the INR is raised. The jugular venous pressure is normal.',
      q: 'What is the most likely cause of his ascites?',
      options: ['Heart failure', 'Alcohol-related cirrhosis', 'Budd–Chiari syndrome', 'Peritoneal carcinomatosis', 'Portal vein thrombosis'],
      answer: 1,
      explain: ['The neck veins are normal and the protein is low, so the heart is not the source.', 'A nodular liver, a big spleen, low-protein fluid and a failing liver: cirrhosis.', 'The hepatic veins are open; Budd–Chiari gives a large tender liver and high-protein fluid.', 'Cancer in the peritoneum gives a SAAG below 1.1.', 'A portal vein clot alone rarely causes ascites, and the liver itself would be normal.'] },
    { sid: 'treat', type: 'stem', title: 'Start treatment',
      stem: 'A 68-year-old man with alcohol-related cirrhosis has moderate ascites for the first time. Sodium 133 mmol/L, creatinine 1.0 mg/dL. He agrees to stop drinking.',
      q: 'What is the best initial treatment?',
      options: ['Fluid restriction to 1 L a day', 'Spironolactone 100 mg and furosemide 40 mg daily, with a 2 g sodium diet', 'Furosemide 40 mg daily alone', 'Large-volume paracentesis every two weeks', 'TIPS'],
      answer: 1,
      explain: ['Fluid restriction is only for sodium below 125 mmol/L, and it does not clear ascites.', 'Salt restriction plus spironolactone and furosemide (100:40) is first line, with no alcohol.', 'A loop diuretic alone works poorly: aldosterone drives the salt retention in cirrhosis.', 'Serial large taps are for tense or refractory ascites, not a first presentation.', 'TIPS is for refractory ascites; at first presentation it adds encephalopathy for no gain.'],
      play: async (c, pick) => {
        if (pick === 1) c.order('diuretics');
        else if (pick === 3) c.order('lvp-alb');
        else if (pick === 4) c.order('tips8');
        return null;
      } },
  ],
  result: async (c, picks) => {
    await c.skip({ label: 'Clinic, 4 weeks later', days: 28 });
    const p = picks.treat;
    return p === 1 ? { title: 'Four weeks later', text: 'He has stopped drinking. His weight is down 4 kg, the belly is soft and the ankles are dry. Sodium and creatinine are unchanged.' }
      : p === 3 ? { title: 'Four weeks later', text: 'The tap emptied the belly, but with no diuretic the fluid has come straight back. He still needs salt restriction and spironolactone with furosemide.' }
      : p === 4 ? { title: 'Four weeks later', text: 'The shunt lowered the pressure and the fluid, but he is drowsy and muddled: encephalopathy, a price he did not need to pay. Diuretics would have done it.' }
      : { title: 'Four weeks later', text: 'The fluid has hardly changed. Salt restriction with spironolactone and furosemide is what clears it.' };
  },
  keyPoints: ['Tap every new ascites: a SAAG of 1.1 g/dL or more means portal hypertension; 250 neutrophils/mm³ or more means SBP.', 'Ascitic protein below 2.5 g/dL points to the sinusoids (cirrhosis); 2.5 or more points to the heart or the hepatic veins.', 'First line: a 2 g sodium diet, spironolactone 100 mg with furosemide 40 mg, and no alcohol.'],
};

// ── Unit 7 · Acute variceal bleeding ───────────────────
const HB0 = 6.9, HB_PER_UNIT = 0.75;
// Five minutes with the pressure behind the varix still high: the clot does not hold.
async function rebleed(c, title, text) {
  const a = c.read(); await c.advance(120); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.8 }); await c.advance(180); const b = c.read();
  return { unsafe: true, title, text, rows: [...delta(a, b, [['Heart rate', 'hr', '/min'], ['Blood pressure', 'bp', '']]), ['Blood lost', `+${Math.max(0, Math.round(b.lost - a.lost))} mL`]] };
}
// Bleeding controlled: the volume is made up and the circulation settles.
async function recover(c) { c.api.action({ kind: 'stopBleed' }); c.order('prbc'); c.order('crystalloid'); await c.advance(900); }
// The shunt's effect at the same moment: without it (tried and put back) and with it.
async function shuntTable(c) {
  const keys = [['PPG (portal vein − IVC)', (m) => m.ppg, 'mmHg', f0], ['Blood to the liver', (m) => m.hepaticFlow, 'L/min', f2], ['Right atrium', (m) => m.ra, 'mmHg', f0]];
  const now = { ...c.m }, d = c.params.tips?.d || 8, off = await c.trial(() => c.patch({ tips: { on: false, d } }));
  return { cols: ['', 'Without TIPS', `With TIPS ${d} mm`], rows: keys.map(([l, g, u, fmt]) => [l, `${fmt(g(off))} ${u}`, `${fmt(g(now))} ${u}`]) };
}
const U7 = {
  caseId: 'bleed', variant: 1, seed: 7007,
  over: {
    patient: { name: 'Marcus Webb', age: 49, sex: 'M', setting: 'Emergency department', problem: 'Vomiting blood. Hepatitis C cirrhosis.' },
    hx: ['Hepatitis C cirrhosis, diagnosed 8 months ago. Never had an endoscopy.', 'Two large vomits of fresh blood in the last hour, about 500 mL.', 'No regular medicines, no aspirin or anticoagulant, no drug allergies.'],
    exam: ['Pale and sweaty, alert. Airway protected.', 'No jaundice, no ascites, no confusion. A few spider naevi; spleen palpable.'],
    vitals: ['hr', 'bp'], inside: [['Portal pressure', 'pv', 'mmHg'], ['Blood flow to the liver', 'hepflow', 'L/min'], ['Right atrial pressure', 'ra', 'mmHg']],
    hbLab: (c) => HB0 + HB_PER_UNIT * c.count('prbc'),
    results: {
      labs: (c) => ({ title: 'Blood tests', rows: [['Hemoglobin', `${c.hbLab().toFixed(1)} g/dL`, 'bad'], pltRow(c.m), ['INR', '1.3', ''], ['Bilirubin', '1.4 mg/dL', ''], ['Albumin', `${c.params.albumin.toFixed(1)} g/dL`, ''], ['Creatinine', '0.9 mg/dL', ''], ['Lactate', '2.4 mmol/L', 'warn']],
        note: 'Child–Pugh A (5 points): no ascites, no encephalopathy, normal bilirubin and albumin.' }),
      xmatch: { title: 'Type and crossmatch', lines: ['Group O positive. Four units crossmatched and ready.'] },
      doppler: { title: 'Ultrasound with Doppler', extra: ['Nodular liver, spleen enlarged. No ascites. Portal vein open, no clot.'] },
      cxr: { title: 'Chest X-ray', lines: ['Clear lungs. No aspiration.'] },
      ecg: { title: 'ECG', lines: ['Sinus tachycardia. No ischemic change.'] },
    },
  },
  orders: ['labs', 'xmatch', 'doppler', 'cxr', 'ecg'], need: ['labs', 'xmatch'],
  orderNote: 'Blood tests and a crossmatch come first; imaging and the ECG do not change the first hour.',
  steps: [
    { sid: 'transfuse', type: 'stem', title: 'Transfusion',
      stem: 'A 49-year-old man with hepatitis C cirrhosis has vomited about 500 mL of fresh blood. He is pale and tachycardic. Hemoglobin 6.9 g/dL, INR 1.3.',
      q: 'Which transfusion strategy is most appropriate?',
      options: ['Transfuse to keep the hemoglobin above 10 g/dL', 'Transfuse below 7 g/dL, aiming for 7 to 9 g/dL', 'Transfuse only if the hemoglobin falls below 6 g/dL', 'Fresh frozen plasma to correct the INR', 'Platelets to above 100 ×10⁹/L'],
      answer: 1,
      explain: ['Filling the veins raises portal pressure; over-transfusion increases rebleeding and death.', 'A restrictive strategy lowers rebleeding and death (Villanueva, NEJM 2013).', 'Waiting for 6 leaves a bleeding patient under-perfused.', 'The INR does not measure bleeding risk in cirrhosis; plasma adds volume and raises portal pressure.', 'Platelets do not stop a variceal bleed, and they add volume.'],
      play: async (c, pick) => {
        if (pick === 1) { c.order('prbc'); c.order('prbc'); await c.advance(60); return null; }
        if (pick === 0) {
          for (let i = 0; i < 4; i++) c.order('prbc');
          const a = c.read(); await c.advance(360); const b = c.read(); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.6 }); await c.advance(30);
          return { unsafe: true, title: 'Too much blood, too fast', text: 'Filling the veins raises the pressure in the portal system, and the varix tears again. Over-transfusion is a common cause of early rebleeding.',
            rows: [['Portal pressure', `${arrow(a.pv, b.pv)} mmHg`], ['Blood pressure', `${a.bp} → ${b.bp}`], ['Bleeding', 'slowed → active again']] };
        }
        const a = c.read(); if (pick > 2) c.order('crystalloid'); await c.advance(240); const b = c.read(); c.order('prbc'); c.order('prbc');
        return { unsafe: true, title: pick === 2 ? 'Waiting costs him' : 'Volume, not blood', text: `${pick === 2 ? 'Ten minutes later he is greyer and more tachycardic.' : 'The bleeding carries on, and the extra volume raises the pressure behind the varix.'} Your attending gives two units of red cells.`,
          rows: delta(a, b, [['Heart rate', 'hr', '/min'], ['Blood pressure', 'bp', ''], ['Portal pressure', 'pv', 'mmHg']]) };
      } },
    { sid: 'drugs', type: 'stem', title: 'Drugs before the scope',
      stem: 'A 49-year-old man with cirrhosis is vomiting blood. Two large cannulas are in, blood is running and endoscopy is being arranged.',
      q: 'Which two drugs should be started now, before endoscopy?',
      options: ['IV pantoprazole and tranexamic acid', 'Propranolol and IV ceftriaxone', 'Terlipressin and IV ceftriaxone', 'Terlipressin and vitamin K', 'Octreotide and IV pantoprazole'],
      answer: 2,
      explain: ['Neither lowers portal pressure; tranexamic acid does not cut deaths from GI bleeding (HALT-IT) and adds clots.', 'The antibiotic is right, but a beta blocker drops the blood pressure in shock; it is for after the bleed.', 'A vasoactive drug lowers portal inflow; ceftriaxone prevents infection and reduces rebleeding and death.', 'Terlipressin is right, but vitamin K does nothing for a variceal bleed, and he needs an antibiotic.', 'Octreotide is a fine vasoactive drug, but he still needs an antibiotic; a PPI does not treat varices.'],
      play: async (c, pick) => {
        if (pick >= 2) { c.order('vaso'); if (pick === 2) c.order('ceftriaxone'); await c.advance(120); return null; }
        const k = await rebleed(c, 'No vasoactive drug', 'The pressure behind the varix stays high, so the clot does not hold and he vomits blood again. Your attending starts terlipressin and ceftriaxone.');
        c.order('vaso'); c.order('ceftriaxone'); return k;
      } },
    { sid: 'timing', type: 'stem', title: 'Timing of the scope',
      stem: 'A 49-year-old man with cirrhosis and a variceal bleed is on terlipressin and ceftriaxone after two units of blood. His heart rate is settling.',
      q: 'When should endoscopy be performed?',
      options: ['Immediately, before resuscitation is complete', 'Within 12 hours, once resuscitated', 'Within 24 hours', 'Within 48 hours', 'Once the INR is below 1.5'],
      answer: 1,
      explain: ['Scoping a shocked patient risks aspiration and arrest; resuscitate first.', 'Within 12 hours of presentation, once resuscitated, is the standard for a suspected variceal bleed.', 'Twenty-four hours is the target for a non-variceal bleed; varices need it sooner.', 'Forty-eight hours is far too late; early rebleeding peaks in the first days.', 'The INR does not predict bleeding in cirrhosis; do not delay for it.'],
      play: async (c, pick) => {
        if (pick === 2 || pick === 3 || pick === 4) { const k = await rebleed(c, 'He bleeds while he waits', 'Overnight he vomits blood again before anyone has looked. The team scopes him that night.'); await c.skip({ label: 'Endoscopy suite, that night', seconds: 300, clockAdd: 8 * 3600 }); c.order('egd'); return k; }
        await c.skip({ label: 'Endoscopy suite, 4 hours later', seconds: 600, clockAdd: 4 * 3600 }); c.order('egd');
        return pick === 0 ? { unsafe: true, title: 'Too soon', text: 'The anaesthetist stops you: he is still shocked and his stomach is full of blood. The team resuscitates first and scopes him 4 hours later.' } : null;
      } },
    { sid: 'band', type: 'stem', title: 'At endoscopy',
      stem: 'A 49-year-old man with cirrhosis has endoscopy for hematemesis. There are large esophageal varices with red wale signs, and one column is spurting. The stomach has no varices.',
      q: 'What is the best endoscopic treatment?',
      options: ['Sclerotherapy', 'Band ligation', 'Cyanoacrylate glue injection', 'Balloon tamponade', 'No endoscopic treatment; arrange a TIPS'],
      answer: 1,
      explain: ['Sclerotherapy controls bleeding less well and causes more ulcers and strictures than bands.', 'Band ligation is the treatment of choice for bleeding esophageal varices.', 'Glue is for gastric (fundal) varices; he has none.', 'A balloon is a short bridge when bleeding cannot be controlled, not a treatment at a working scope.', 'TIPS is for failure of drugs and bands, or pre-emptive in high-risk Child–Pugh C or B; he is Child–Pugh A.'],
      play: async (c, pick) => {
        c.order('evl'); await recover(c);
        return pick === 1 ? { title: 'Bands on', text: 'Four bands are placed and the spurting stops.' }
          : { title: 'Your attending bands him', text: `${['Sclerotherapy', '', 'Glue', 'A balloon', 'Waiting for a TIPS'][pick]} is not the best tool here. Your attending places four bands and the spurting stops.` };
      } },
    { sid: 'prevent', type: 'stem', title: 'Preventing a rebleed',
      stem: 'Day 3 after a variceal bleed treated with bands. A 49-year-old man with Child–Pugh A cirrhosis has not bled again, and terlipressin stops today.',
      q: 'What is the best plan to prevent rebleeding?',
      options: ['A beta blocker alone', 'Repeat band ligation alone', 'A beta blocker plus repeat band ligation until the varices are gone', 'Pre-emptive TIPS within 72 hours', 'A proton pump inhibitor, with endoscopy only if he bleeds again'],
      answer: 2,
      explain: ['A beta blocker alone leaves the varices; after a bleed both are needed.', 'Bands alone leave the pressure high; after a bleed both are needed.', 'A non-selective beta blocker (propranolol or carvedilol) with banding every 2 to 4 weeks is the standard.', 'Pre-emptive TIPS is for Child–Pugh C (10 to 13) or B above 7 with active bleeding; he is Child–Pugh A.', 'A PPI does not prevent variceal bleeding, and waiting for a rebleed risks his life.'],
      play: async (c, pick) => { await c.skip({ label: 'Ward, day 3', seconds: 120, clockAdd: 68 * 3600 }); await recover(c); if (pick === 0 || pick === 2) c.order('carvedilol'); return null; } },
    { sid: 'rebleed', type: 'stem', title: 'He bleeds again',
      enter: async (c) => { await c.skip({ label: 'Ward, day 4', seconds: 60, clockAdd: 24 * 3600 }); c.api.action({ kind: 'rupture', site: 'VAR', tear: 0.9 }); await c.advance(150); },
      stem: 'Day 4 after band ligation for a variceal bleed. Despite a vasoactive drug and bands, a 49-year-old man with cirrhosis suddenly vomits a large amount of fresh blood and becomes hypotensive.',
      q: 'What is the best next step?',
      options: ['Double the beta-blocker dose', 'Stop the vasoactive drug, since the varices are banded', 'Rescue TIPS, with balloon tamponade as a bridge if needed', 'Balloon tamponade for 72 hours as the definitive treatment', 'Surgical portocaval shunt tonight'],
      answer: 2,
      explain: ['More beta blocker drops the blood pressure in shock; hold it now.', 'Stopping the drug raises the pressure behind the varix; keep it running.', 'A large rebleed despite drugs and bands is treatment failure: rescue TIPS, bridged by a balloon if needed.', 'A balloon is a bridge of 24 hours at most; it rebleeds when deflated and can perforate the esophagus.', 'Surgical shunts carry a high operative risk and have been replaced by TIPS.'],
      play: async (c, pick) => {
        c.order('balloon'); await c.skip({ label: 'Interventional radiology, 3 hours later', seconds: 300, clockAdd: 3 * 3600 }); c.order('tips8'); c.order('balloon'); await c.advance(60);
        return pick === 2 ? { title: 'Rescue TIPS', text: 'A balloon holds the bleeding while radiology places an 8 mm covered TIPS. The balloon comes out; no further bleeding.' }
          : { unsafe: true, title: 'Your attending steps in', text: 'He keeps bleeding. Your attending places a balloon as a bridge and calls radiology for a rescue TIPS, which stops it.' };
      } },
  ],
  result: async (c) => {
    await recover(c);
    return { table: await shuntTable(c), title: 'Four weeks later', text: 'No more bleeding. The shunt keeps the gradient low, so the beta blocker and further banding are no longer needed. The price: less blood reaches the liver, so he is watched for confusion (encephalopathy).' };
  },
  keyPoints: ['First hour: transfuse below a hemoglobin of 7 g/dL (aim 7 to 9), and start a vasoactive drug and IV ceftriaxone before the scope.', 'Endoscopy within 12 hours, once resuscitated; band ligation for bleeding esophageal varices.', 'Afterwards a beta blocker plus repeat banding; TIPS for failure (rescue) or for Child–Pugh C, or B with active bleeding (pre-emptive).'],
};

// ── Unit 8 · Refractory ascites and TIPS ───────────────
const U8 = {
  caseId: 'refractory', variant: 0, seed: 8008,
  over: { vitals: ['hr', 'bp', 'abd'], inside: null,
    results: { doppler: { title: 'Ultrasound with Doppler', extra: ['Portal vein open, no clot. Hepatic veins open.'] }, ecg: { title: 'ECG', lines: ['Sinus rhythm, normal.'] } } },
  orders: ['labs', 'tap-dx', 'echo', 'doppler', 'ecg'], need: ['labs', 'echo'], ok: ['tap-dx', 'doppler'],
  orderNote: 'Before a TIPS: blood tests (bilirubin, kidneys) and an echo for the heart. A tap or a Doppler of the portal vein are reasonable third picks.',
  steps: [
    { sid: 'define', type: 'stem', title: 'Is it refractory?',
      stem: 'A 59-year-old woman has alcohol-related cirrhosis and has not drunk for two years. Despite spironolactone 400 mg and furosemide 160 mg a day and a confirmed low-salt diet, she needs a large-volume paracentesis every two weeks.',
      q: 'Which best describes her ascites?',
      options: ['Grade 1 ascites', 'Grade 2 ascites that responds to diuretics', 'Refractory ascites', 'Ascites from a high-salt diet', 'Malignant ascites'],
      answer: 2,
      explain: ['Grade 1 is only seen on ultrasound; hers needs repeated large taps.', 'Her ascites comes back despite the maximum doses, so it does not respond.', 'Ascites that recurs despite maximum diuretics and a low-salt diet is refractory.', 'Her urine sodium confirms she keeps to the diet.', 'Her fluid has a high SAAG and low protein: portal hypertension, not cancer.'] },
    { sid: 'today', type: 'stem', title: 'Today',
      stem: 'A 59-year-old woman with cirrhosis and refractory ascites is tense and breathless lying flat. Blood pressure is normal and creatinine 1.2 mg/dL.',
      q: 'What do you do today?',
      options: ['Large-volume paracentesis with IV albumin, 8 g per litre removed', 'Large-volume paracentesis without albumin', 'Increase spironolactone to 600 mg', 'Restrict fluids to 1 L a day', 'Admit for IV furosemide'],
      answer: 0,
      explain: ['A large tap gives relief today; albumin (6 to 8 g per litre over 5 L) protects the circulation and kidneys.', 'Without albumin, a large tap drops the circulating volume and injures the kidneys.', 'She is already on the maximum dose; more adds side effects, not relief.', 'Fluid restriction does not remove ascites and is only for a sodium below 125.', 'IV furosemide does not shift tense ascites and risks the kidneys.'],
      play: async (c, pick) => {
        if (pick === 0) { c.order('lvp-alb'); await c.advance(60); return null; }
        if (pick === 1) {
          const a = c.read(); c.order('lvp-noalb'); await c.advance(60); const b = c.read();
          return { unsafe: true, title: 'A large tap without albumin', text: 'The belly is soft, but taking this much fluid without albumin drops her circulating volume. By day 3 her creatinine has climbed from 1.2 to 2.0.',
            rows: [['Ascites', `${Math.round(a.asc)} → ${Math.round(b.asc)} mL`], ['Blood pressure', `${a.bp} → ${b.bp}`]] };
        }
        c.order('lvp-alb'); await c.advance(60);
        return { title: 'She stays tense', text: 'Nothing changes by the afternoon and she is still breathless. Your attending drains 5 L with albumin.' };
      } },
    { sid: 'toolbox', type: 'watch', title: 'What a TIPS fixes and what it costs',
      text: 'Before you decide, the model tries a TIPS on her and puts it back: an 8 mm and a 10 mm stent. The gradient falls, but less blood goes through the liver (encephalopathy) and more returns to the right heart.',
      run: async (c) => {
        const keys = [['PPG (portal vein − IVC)', (m) => m.ppg, 'mmHg', f0], ['Blood to the liver', (m) => m.hepaticFlow, 'L/min', f2], ['Right atrium', (m) => m.ra, 'mmHg', f0]];
        const now = c.m, a = await c.trial(() => c.patch({ tips: { on: true, d: 8 } })), b = await c.trial(() => c.patch({ tips: { on: true, d: 10 } }));
        return { cols: ['', 'Now', 'TIPS 8 mm', 'TIPS 10 mm'], rows: keys.map(([l, g, u, fmt]) => [l, ...[now, a, b].map((m) => `${fmt(g(m))} ${u}`)]) };
      } },
    { sid: 'plan', type: 'stem', title: 'Long-term plan',
      stem: 'A 59-year-old woman with refractory ascites needs a large tap every two weeks. Her echocardiogram is normal, bilirubin is 1.6 mg/dL, and she has never had hepatic encephalopathy.',
      q: 'What is the best long-term plan?',
      options: ['Serial large-volume paracentesis with albumin, indefinitely', 'A peritoneovenous shunt', 'TIPS, and refer for liver transplant assessment', 'Weekly albumin infusions alone', 'Add tolvaptan to the diuretics'],
      answer: 2,
      explain: ['Right when TIPS is not possible; she has no contraindication, and TIPS does better.', 'Peritoneovenous shunts block and clot; they are hardly used now.', 'With a sound heart, no encephalopathy and a bilirubin under 3, a covered TIPS controls the fluid and improves survival.', 'Albumin alone does not stop the need for taps.', 'Vaptans are not recommended for ascites; tolvaptan can injure the liver.'] },
    { sid: 'stent', type: 'stem', title: 'Stent',
      stem: 'A 59-year-old woman with refractory ascites is having a TIPS. The radiologist asks which stent to place.',
      q: 'Which stent is best?',
      options: ['10 mm bare-metal stent', '8 mm covered stent', '10 mm covered stent', '12 mm covered stent', '8 mm bare-metal stent'],
      answer: 1,
      explain: ['Bare stents block far more often, and 10 mm diverts more blood from the liver.', 'A covered stent stays open; 8 mm lowers the gradient enough with less encephalopathy.', 'Covered is right, but 10 mm diverts more blood past the liver: more encephalopathy.', 'Too wide: more encephalopathy and more load on the heart.', 'The size is right, but bare stents block far more often.'],
      play: async (c, pick) => { const d = [10, 8, 10, 12, 8][pick]; c.patch({ tips: { on: true, d } }); await c.advance(30); return null; } },
    { sid: 'risk', type: 'stem', title: 'After the TIPS',
      stem: 'Two weeks after an uncomplicated TIPS for refractory ascites, a 59-year-old woman’s ascites is settling.',
      q: 'Which complication is she most at risk of over the next months?',
      options: ['Hepatic encephalopathy', 'Variceal bleeding', 'Acute kidney injury', 'Spontaneous bacterial peritonitis', 'Portal vein thrombosis'],
      answer: 0,
      explain: ['Gut blood now bypasses the liver: encephalopathy affects about a third, so warn her and her family.', 'The shunt lowers the pressure that drives varices; bleeding risk falls.', 'Kidney function usually improves after TIPS as the circulation fills.', 'SBP becomes less likely as the ascites clears.', 'Flow through the portal vein rises with a shunt; a clot is uncommon.'] },
  ],
  result: async (c, picks) => {
    await c.skip({ label: 'Clinic, 3 months later', days: 90 });
    const d = c.params.tips?.d || 8, a = c.flag('start'), b = c.read();
    const rows = [['Ascites', (r) => `${Math.round(r.asc)} mL`], ['PPG (portal vein − IVC)', (r) => `${f0(r.ppg)} mmHg`], ['Blood to the liver', (r) => `${f2(r.hepflow)} L/min`], ['Right atrium', (r) => `${f0(r.ra)} mmHg`]];
    return { table: { cols: ['', 'First visit', `3 months, TIPS ${d} mm`], rows: rows.map(([l, g]) => [l, g(a), g(b)]) }, title: 'Three months later', text: d > 8 ? `No more taps, but with a ${d} mm shunt more blood bypasses the liver: she has had an episode of confusion and is on lactulose and rifaximin.` : 'No more taps, she is eating better and her weight is stable. One episode of mild confusion settled with lactulose. She is on the transplant waiting list.' };
  },
  keyPoints: ['Refractory ascites keeps coming back despite maximum diuretics (spironolactone 400 mg, furosemide 160 mg) and a low-salt diet, or the doses cannot be tolerated.', 'With a large tap (over 5 L), give albumin, 6 to 8 g per litre removed.', 'An 8 mm covered TIPS controls the fluid, but costs liver blood flow (encephalopathy) and loads the right heart: check the heart, the brain and the bilirubin first.'],
};

/** Units 6–8 by course unit id. */
export const CASE_UNITS = { 'u6-new-ascites': U6, 'u7-bleed': U7, 'u8-refractory': U8 };
