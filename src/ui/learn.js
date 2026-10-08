// Learn mode (blueprint §11): lessons as step sequences with Predict → Observe → Explain.

import { store, updateParams } from './store.js?v=f469aaac6e';
import { host } from './host.js?v=5e48797f55';
import { h, fmt, toast, svgIcon } from './util.js?v=86153645a3';
import { createAnswerSheet, ASSESSMENT_VERSION, CONTENT_VERSION, MASTERY } from './assess.js?v=7f4afcf446';
import { addRecord } from './records.js?v=50fb9dd463';
import { runSequence } from './sequence.js?v=8a54baa3f6';
import { EDGES } from '../engine/topology.js?v=dc393aabea';
import { trustLine, teachChip, blindOn, blindOff, isBlind, optionList, compareChip, bindQuestionKeys, mirrorMarker } from './learning-kit.js?v=f250e2f3cd';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.lessons') || '{}'); } catch { return {}; } })();
const save = () => { try { localStorage.setItem('pps.lessons', JSON.stringify(saved)); } catch { /* storage unavailable */ } };

// Step bindings (all optional): preset/presetDays (native pre-aging), params, afterDays (extra disease days after the patch),
// tab (pane), probe, invert, endo ('eso'), focus, data (labeled metric row); a do-step goal(frame, params, log)
// also receives the actions the learner has taken since the step began (store.logAction).
// Step types: frame | predict (mcq | draw | direction) | do (goal) | observe (seconds / days) | explain (metric) | check (quiz)
// Each lesson runs: vignette (frame) → prediction → action (do) → reveal (observe) → explanation → new-patient questions (check).
// Text is clinical voice only: no vessel codes, no equations. `pearls` are the lesson’s takeaways.
// A 'direction' prediction is answered with two buttons under the question ('labels' override
// the default [toward the liver, away from the liver]; the first is the vessel's forward flow). The
// figure mirrors the choice and the answer is compared with the model's flow at once.
// Predict steps (not 'draw') are blind by default: numbers stay hidden until the student answers.
// Set `blind: false` on a step to keep them, `blind: true` to hide them on any other step.
export const LESSONS = [
  {
    id: 'portal-flow', title: 'Where portal blood goes', minutes: 4,
    summary: 'Portal veins have no valves: blood follows pressure, and a block raises pressure behind it.',
    pearls: ['Portal hypertension is pressure building up behind a block.', 'There are no valves, so flow follows pressure.', 'A big spleen and low platelets are back-pressure signs.'],
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', path: 'main', focus: ['SV_CONF', 'PV_TRUNK', 'RHV_IVC'], focusLabel: 'Splenic, portal and hepatic veins',
        text: 'A 40-year-old has a clot in his portal vein, and his spleen has grown. Blood from the gut and spleen normally travels through the portal vein into the liver, then out through the hepatic veins.' },
      { type: 'predict', mode: 'direction', edge: 'SV_CONF', q: 'In a healthy person, which way does blood flow in the splenic vein: toward the liver or away from it?' },
      { type: 'observe', seconds: 6, tools: ['select'], view: 'anatomic', tab: 'profile', focus: ['SV_CONF'], focusLabel: 'Splenic vein',
        text: 'Toward the liver, along a steady pressure slope from spleen to liver to heart.' },
      { type: 'do', tools: ['select', 'thrombus'], focus: ['PV_TRUNK'], focusLabel: 'Portal vein', text: 'Put a **clot in the portal vein** that blocks it completely. Then watch the pressure on each side.',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Liver side', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => (p.thrombus.PV_TRUNK || 0) >= 0.99, hint: 'Tap the portal vein on the figure, then drag Clot to 100 %.' },
      { type: 'observe', seconds: 8, tools: ['select'], tab: 'profile', focus: ['SV_CONF', 'PV_TRUNK'], focusLabel: 'Spleen side and liver side',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Liver side', metric: 'pv', unit: 'mmHg' }],
        text: 'Pressure piles up on the gut and spleen side of the clot, while the liver side stays low. Blood now searches for other ways out.' },
      { type: 'explain', metric: 'pv', text: 'Portal veins have no valves, so blood goes wherever the pressure is lowest. A block raises pressure behind it, never beyond it. That is why this patient’s spleen enlarged and his platelets fell.' },
      { type: 'check', quiz: [
        { q: 'A patient’s portal vein is blocked where it enters the liver. Where do you expect the pressure to be highest?', options: ['In the veins of the spleen and bowel', 'In the liver’s sinusoids', 'In the hepatic veins and cava', 'Equally high everywhere'], answer: 0, why: 'Pressure builds up behind a block, in the veins that drain into it, not beyond it.' },
        { q: 'A woman has a large spleen, platelets of 70 and a normal liver ultrasound. Which finding would best explain the platelets?', options: ['A big spleen from back-pressure, trapping them', 'Leaking valves in the portal vein', 'Reduced bile flow from the liver', 'Too much blood reaching the liver'], answer: 0, why: 'Back-pressure enlarges the spleen, and a big spleen holds on to platelets (hypersplenism).' },
      ] },
    ],
  },
  {
    id: 'which-level', title: 'Before, in, or after the liver', minutes: 6,
    summary: 'Find the level of the block first: before the liver, inside it, or after it.',
    pearls: ['Find the level of the block before you name the disease.', 'Ascites with high protein points to a block after the liver.', 'Big varices with normal liver tests point to a block before the sinusoids.'],
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', path: 'main', focus: ['PV_TRUNK', 'SIN_RR', 'RHV_IVC'], focusLabel: 'Portal vein, liver, hepatic vein',
        text: 'Three patients have varices: one from schistosomiasis, one with alcohol-related cirrhosis, one with blocked hepatic veins. The varices look the same, but the problems are not. Blood runs from the gut, through the portal vein and the liver, out the hepatic veins and back to the heart.' },
      { type: 'predict', q: 'In alcohol-related cirrhosis, where does the main block to flow sit?',
        options: ['In the portal vein before the liver', 'Inside the liver, in the sinusoids', 'In the hepatic veins after the liver', 'In the heart'], answer: 1,
        why: 'Scarring stiffens the sinusoids, so the main drop in pressure happens inside the liver.' },
      { type: 'observe', seconds: 8, preset: 'cirr-comp', tools: ['select'], tab: 'profile', zoom: 'fit', path: 'main', focus: ['PV_TRUNK', 'SIN_RR', 'RHV_IVC'], focusLabel: 'Portal vein, liver, hepatic vein',
        data: [{ label: 'Portal vein', metric: 'pv', unit: 'mmHg' }, { label: 'Hepatic vein', metric: 'fhvp', unit: 'mmHg' }],
        text: 'Cirrhosis: the pressure falls steeply inside the liver. This patient has impaired liver function and may form ascites with low protein.' },
      { type: 'observe', seconds: 8, preset: 'schisto', tools: ['select'], tab: 'profile', zoom: 'fit', path: 'main', focus: ['PRE_R', 'PRE_L', 'PV_TRUNK'], focusLabel: 'Small portal branches',
        data: [{ label: 'Portal vein', metric: 'pv', unit: 'mmHg' }, { label: 'Hepatic vein', metric: 'fhvp', unit: 'mmHg' }],
        text: 'Schistosomiasis: the block is in the small portal branches, before the sinusoids. Portal pressure is high, yet the liver works well and ascites is uncommon.' },
      { type: 'observe', seconds: 8, preset: 'budd-chiari', tools: ['select'], tab: 'profile', zoom: 'fit', path: 'main', focus: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], focusLabel: 'Hepatic veins',
        data: [{ label: 'Portal vein', metric: 'pv', unit: 'mmHg' }, { label: 'Hepatic vein', metric: 'fhvp', unit: 'mmHg' }],
        text: 'Budd–Chiari: the hepatic veins are blocked, so the whole liver backs up. Ascites is common, and it is protein-rich.' },
      { type: 'explain', metric: 'pv', text: 'Block **before** the liver (portal vein clot): normal liver tests, little ascites. Block **in** the liver before the sinusoids (schistosomiasis): normal liver function, big varices. Block **in** the sinusoids (cirrhosis): sick liver, ascites with low protein. Block **after** the liver (hepatic veins, heart): ascites with high protein.' },
      { type: 'check', quiz: [
        { q: 'A 30-year-old from Egypt has large varices, normal bilirubin and no ascites. Where is the block most likely?', options: ['Before the sinusoids, in small portal branches', 'In the sinusoids, from cirrhosis', 'After the liver, in the hepatic veins', 'In the heart, from right heart failure'], answer: 0, why: 'Schistosome eggs block the small portal branches. The liver cells are spared, so bilirubin is normal and ascites is unusual.' },
        { q: 'A woman has painful hepatomegaly, rapid ascites with high protein, and varices. Where do you look for the block?', options: ['After the liver: hepatic veins and cava', 'In the portal vein', 'In the sinusoids, from cirrhosis', 'In the splenic vein'], answer: 0, why: 'Painful liver, fast ascites with high protein: think Budd–Chiari. Doppler the hepatic veins and cava.' },
      ] },
    ],
  },
  {
    id: 'measuring-pressure', title: 'Measuring portal pressure, and when the number lies', minutes: 6,
    summary: 'The wedged-minus-free gradient reads the sinusoids, and misleads when the block is before or after them.',
    pearls: ['A gradient of 10 or more is clinically significant; 12 or more carries bleeding risk.', 'A normal gradient does not rule out portal hypertension.', 'With blocked hepatic veins the gradient cannot be trusted.'],
    steps: [
      { type: 'frame', preset: 'cirr-comp', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['RHV_IVC', 'PRE_R', 'SIN_RR'], focusLabel: 'Hepatic vein and sinusoids',
        data: [{ label: 'Free pressure', metric: 'fhvp', unit: 'mmHg' }, { label: 'Wedged pressure', metric: 'whvp', unit: 'mmHg' }],
        text: 'This patient has early cirrhosis. How do you put a number on her portal pressure? The hepatic venous pressure gradient (**HVPG**) is the wedged pressure minus the free pressure in a hepatic vein. Normal is up to 5, clinically significant is 10 or more, and bleeding risk rises from 12.' },
      { type: 'predict', q: 'A traveller with schistosomiasis has large varices. Will his HVPG be high?', options: ['Yes, large varices mean a high gradient', 'No, it can be normal or only mildly raised', 'It cannot be measured in schistosomiasis', 'Yes, the liver is cirrhotic'], answer: 1,
        why: 'The wedge reads the sinusoids, and in schistosomiasis the block lies before them.' },
      { type: 'observe', seconds: 8, preset: 'schisto', tools: ['select'], tab: 'profile', zoom: 'fit', focus: ['PV_TRUNK', 'PRE_R', 'RHV_IVC'], focusLabel: 'Portal vein and liver outlet',
        data: [{ label: 'Portal vein to cava', metric: 'ppg', unit: 'mmHg' }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'The portal pressure is high but the gradient is low, because the block sits before the sinusoids and the wedge cannot see it.' },
      { type: 'observe', seconds: 8, preset: 'rhf', params: { pulsatile: true }, tools: ['select'], tab: 'profile', zoom: 'fit', focus: ['IVCS_RA', 'RHV_IVC'], focusLabel: 'Cava and hepatic vein',
        data: [{ label: 'Free pressure', metric: 'fhvp', unit: 'mmHg' }, { label: 'Wedged pressure', metric: 'whvp', unit: 'mmHg' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'In right heart failure both pressures are high, so their difference stays small.' },
      { type: 'explain', metric: 'hvpg', text: 'The wedge sees the sinusoids. A block before them is invisible, and a failing heart raises both readings together. A low gradient therefore never excludes portal hypertension.' },
      { type: 'check', quiz: [
        { q: 'A patient with Budd–Chiari has a low gradient. Can you trust it?', options: ['No: blocked hepatic veins make the wedge invalid', 'Yes: a low number means no portal hypertension', 'Yes, as long as the free pressure is also low', 'Only if the patient is on a beta blocker'], answer: 0, why: 'The wedge needs an open hepatic vein to read the sinusoids. With the outflow blocked, the number means nothing.' },
        { q: 'A patient with cirrhosis has a gradient of 11 mmHg. What does this tell you?', options: ['Clinically significant portal hypertension', 'Normal pressure', 'Portal hypertension is excluded', 'A block after the liver'], answer: 0, why: '10 or more is clinically significant portal hypertension: the threshold for varices, ascites and preventive treatment.' },
        { q: 'A patient with severe tricuspid regurgitation has high free and wedged pressures and a gradient of 3. What is the best explanation?', options: ['Congestion from the failing right heart', 'A normal liver', 'A block before the sinusoids', 'A reversed portal vein'], answer: 0, why: 'The failing heart raises both pressures together, so their difference stays small even though the liver is congested.' },
      ] },
    ],
  },
  {
    id: 'inflow-and-drugs', title: 'Why the gut sends more blood, and how drugs help', minutes: 5,
    summary: 'Cirrhosis opens the gut’s arteries, so more blood pours into a stiff liver; beta blockers turn the inflow down.',
    pearls: ['Portal hypertension is a stiff liver plus too much inflow.', 'Carvedilol is the preferred beta blocker to prevent decompensation.', 'Watch blood pressure in advanced disease.'],
    steps: [
      { type: 'frame', preset: 'csph', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['A_SMA', 'SIN_RR', 'PV_TRUNK'], focusLabel: 'Gut inflow, liver, portal vein',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }],
        text: 'Why does a heart drug, a beta blocker, prevent variceal bleeding? Here is a patient with compensated cirrhosis and a gradient above 10. Note the starting numbers.' },
      { type: 'predict', q: 'In cirrhosis, what are the arteries that supply the gut doing?', options: ['Wide open, sending more blood to the liver', 'Normal', 'Constricted, sending less blood to the liver', 'Closed in the area of the varices'], answer: 0,
        why: 'Cirrhosis dilates the gut’s arteries, so inflow rises on top of the stiff liver.' },
      { type: 'do', tools: ['select'], text: 'Start **carvedilol** and keep propranolol off. Watch the pressure and the heart.', controls: ['drugs', 'drug:carvedilol', 'drug:propranolol', 'drug:terlipressin', 'drug:octreotide'],
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }],
        goal: (f, p) => p.drugs.carvedilol && !p.drugs.propranolol && !p.drugs.terlipressin && !p.drugs.octreotide },
      { type: 'observe', seconds: 8, preset: 'csph', params: { drugs: { carvedilol: true, propranolol: false, terlipressin: false, octreotide: false } }, tools: ['select'], tab: 'profile', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and liver',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }],
        text: 'Carvedilol: the portal pressure falls, the heart slows, and the blood pressure drops a little. It also relaxes the liver slightly.' },
      { type: 'observe', seconds: 8, preset: 'csph', params: { drugs: { propranolol: true, carvedilol: false, terlipressin: false, octreotide: false } }, tools: ['select'], tab: 'profile', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and liver',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }],
        text: 'Propranolol on the same patient: it lowers the pressure through slower inflow alone, and a little less than carvedilol.' },
      { type: 'explain', metric: 'hvpg', text: 'Cirrhosis opens the gut’s arteries, so more blood pours into a stiff liver. Beta blockers turn the inflow down. Carvedilol also relaxes the liver, which is why it is preferred.' },
      { type: 'check', quiz: [
        { q: 'A 58-year-old has compensated cirrhosis, a gradient of 14, no varices that have bled, and no asthma. What is the best next step?', options: ['Start carvedilol', 'Band ligation now', 'Place a TIPS', 'Observe and repeat the scope in 3 years'], answer: 0, why: 'With clinically significant portal hypertension, carvedilol lowers the risk of a first decompensation. Banding is for those who cannot take it.' },
        { q: 'A man with decompensated cirrhosis and refractory ascites has a blood pressure of 88/52 on carvedilol. What do you do?', options: ['Reduce or stop the beta blocker', 'Double the dose to protect his varices', 'Add a second beta blocker', 'Continue unchanged because the pressure is expected'], answer: 0, why: 'Low blood pressure on a beta blocker puts the kidneys at risk. Reduce or stop it, and protect the varices with banding.' },
      ] },
    ],
  },
  {
    id: 'varices', title: 'Varices: where they form and why they bleed', minutes: 6,
    summary: 'Large varices with red signs and a sick liver bleed; bands remove the varix, drugs treat the pressure behind it.',
    pearls: ['Size, red signs and Child–Pugh class predict bleeding.', 'Bands treat the varix; drugs treat the pressure.', 'Collaterals take months to grow.'],
    steps: [
      { type: 'frame', preset: 'csph', tools: ['select', 'endoscope'], view: 'anatomic', zoom: 'fit', tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }],
        text: 'A 55-year-old with cirrhosis has a screening scope. Portal blood that cannot get through the stiff liver is rerouted through collateral veins, and the ones under the lining of the esophagus swell into **varices**. His are still thin (size below). Which varices go on to bleed?' },
      { type: 'predict', q: 'Which varix is most likely to bleed?', options: ['Small, flat, no red signs, mild liver disease', 'Large, red wale signs, advanced liver disease', 'Large, no red signs, mild liver disease', 'Small with red signs, mild liver disease'], answer: 1,
        why: 'Size, red signs and a sicker liver together carry the highest risk.' },
      { type: 'observe', days: 180, params: { cirrhosis: 0.85 }, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1a', 'C1b', 'C3', 'C6'], focusLabel: 'Collateral veins',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Varix wall tension', metric: (m) => m.varix.ratio, fmt: (r) => (r < 0.6 ? 'Low' : r < 1 ? 'Moderate' : 'High') }, { label: 'Portal pressure', metric: 'pv', unit: 'mmHg' }],
        text: 'Six months on, his liver has scarred further. Watch the scope: the varix has grown, its wall has thinned and red marks have appeared. The collaterals ease the pressure a little, but it stays high.' },
      { type: 'do', tools: ['select', 'band', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        text: '**Band** the esophageal varix and watch the endoscopy view and the pressure.',
        data: [{ label: 'Varix wall tension', metric: (m) => m.varix.ratio, fmt: (r) => (r < 0.6 ? 'Low' : r < 1 ? 'Moderate' : 'High') }, { label: 'Portal pressure', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'band') },
      { type: 'observe', seconds: 8, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'Varix wall tension', metric: (m) => m.varix.ratio, fmt: (r) => (r < 0.6 ? 'Low' : r < 1 ? 'Moderate' : 'High') }, { label: 'Portal pressure', metric: 'pv', unit: 'mmHg' }],
        text: 'The banded varix is treated, yet the pressure behind it has not changed.' },
      { type: 'explain', metric: 'varix', tools: ['select'], text: 'A big, thin-walled varix under high pressure is a balloon about to pop. Banding removes the balloon but does not lower the pressure that made it.' },
      { type: 'check', quiz: [
        { q: 'A patient has had banding and the varices are gone. What still needs treatment?', options: ['The portal pressure, with a beta blocker', 'Nothing, banding cures portal hypertension', 'Repeat banding every week for life', 'The platelet count'], answer: 0, why: 'Bands remove the varix, not the pressure. A beta blocker treats the pressure and stops new varices forming.' },
        { q: 'During endoscopy you see a varix that is 10 mm across with red wale signs in a Child–Pugh C patient. How do you read this?', options: ['High risk of bleeding: treat now', 'Low risk: observe', 'Risk depends only on bilirubin', 'A bleed is excluded if the stool is normal'], answer: 0, why: 'Large size, red signs and Child–Pugh C each raise the risk, and together they make bleeding likely.' },
      ] },
    ],
  },
  {
    id: 'ascites', title: 'Ascites: where the fluid comes from', minutes: 6,
    summary: 'Tap every new ascites: the gradient says portal hypertension and the protein says where the block is.',
    pearls: ['Tap every new ascites.', 'High gradient means portal hypertension; protein tells you where.', 'Give albumin with large taps; diuretics and salt restriction keep the fluid from returning.'],
    steps: [
      { type: 'frame', preset: 'cirr-decomp', params: { diuretics: false }, afterDays: 300, tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'abdomen', focus: ['SIN_RR', 'IVC_IS'], focusLabel: 'Liver and abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }],
        text: 'A man with cirrhosis has a swollen belly: about 4 litres of new ascites (below). Fluid leaks from congested vessels faster than the lymph can drain it.' },
      { type: 'predict', q: 'What is the one test you always do in a patient with new ascites?', options: ['A diagnostic tap of the fluid', 'A CT of the abdomen', 'An albumin infusion', 'A trial of diuretics, then reassess'], answer: 0,
        why: 'The fluid tells you whether the pressure is portal, and where the block lies.' },
      { type: 'observe', seconds: 8, tools: ['select'], tab: 'abdomen', zoom: 'fit', focus: ['SIN_RR', 'IVC_IS'], focusLabel: 'Liver and abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Cirrhosis. The tap shows a serum–ascites albumin gradient (**SAAG**) of 1.1 or more and **low** protein. A high SAAG means portal hypertension. In heart failure the SAAG is also high, but the protein is **high**. In schistosomiasis there is little ascites, because the sinusoids are spared.' },
      { type: 'do', tools: ['select', 'needle'], tab: 'abdomen', focus: ['IVC_IS'], focusLabel: 'Abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Remove **5 litres** with albumin (**Drain**, albumin on). Watch the belly and the pressure.',
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'paracentesis'), hint: 'The volume removed is the smaller of 5 L and the fluid present.' },
      { type: 'observe', days: 90, tools: ['select'], zoom: 'fit', tab: 'abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Three months later, without diuretics, the fluid has come back. The tap relieved the belly but not the liver.' },
      { type: 'explain', metric: 'ascites', text: 'Draining fluid relieves the belly but does not treat the liver’s resistance. Diuretics and salt restriction keep the fluid from returning, and albumin protects the kidneys during large taps.' },
      { type: 'check', quiz: [
        { q: 'A patient has a SAAG of 1.6, ascitic protein of 3.2 g/dL and a raised JVP. What is the next test?', options: ['An echocardiogram', 'A repeat tap with cultures', 'A CT of the liver', 'A liver biopsy'], answer: 0, why: 'High SAAG with high protein means the block is after the liver. A raised JVP points to the heart.' },
        { q: 'A patient with cirrhosis has 6 litres of ascites tapped, with no albumin. What is the main risk?', options: ['Kidney injury from the fluid shift', 'The fluid never returns', 'Immediate variceal bleeding', 'Low sodium from the diuretics'], answer: 0, why: 'Taking off more than 5 L without albumin can drop the circulating volume and injure the kidneys.' },
      ] },
    ],
  },
  {
    id: 'doppler-report', title: 'Reading the Doppler report', minutes: 5,
    summary: 'Direction of portal flow, the Invert button and a pulsatile portal vein, each read in the right vessel.',
    pearls: ['Flow away from the liver means advanced disease.', 'Color is not direction.', 'Pulsatile portal flow: look at the heart.'],
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'doppler'], view: 'anatomic', zoom: 'fit', tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal vein',
        text: 'The ultrasound report says “hepatofugal portal flow”. What does it mean, and should you worry? **Hepatopetal** is toward the liver, as in health. **Hepatofugal** is away from it.' },
      { type: 'predict', mode: 'direction', edge: 'PV_TRUNK', preset: 'cirr-hepatofugal', q: 'In end-stage cirrhosis, in which direction can the portal vein flow: toward the liver or away from it?' },
      { type: 'observe', seconds: 8, preset: 'cirr-hepatofugal', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK', 'C6', 'AP_R', 'AP_L'], focusLabel: 'Portal vein and the routes that drain it',
        data: [{ label: 'Portal vein flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'In this patient with very advanced disease the portal vein flows away from the liver, because blood finds an easier exit elsewhere.' },
      { type: 'do', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', text: 'Tap **Invert** once. The colors swap sides.',
        goal: (f, p, log) => log.some((a) => a.type === 'invert'), hint: 'The Invert button is on the Doppler pane.' },
      { type: 'observe', seconds: 8, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal vein',
        data: [{ label: 'Portal vein flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'The blood did not change direction. Read the direction from the report and the anatomy, never from the color.' },
      { type: 'observe', seconds: 12, preset: 'rhf', params: { pulsatile: true }, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK', 'RHV_IVC'], focusLabel: 'Portal vein',
        text: 'A different patient, with a failing right heart and a leaking tricuspid valve. The portal vein now pulses with every heartbeat.' },
      { type: 'explain', metric: 'pvFlow', text: 'Away from the liver means advanced disease, with a risk of portal vein clot. A pulsatile portal vein is a heart clue. Always name the vessel you are describing.' },
      { type: 'check', quiz: [
        { q: 'After a TIPS, the left portal branch flows away from the liver. What does this mean?', options: ['Expected: the flow is heading toward the shunt', 'The shunt has failed', 'The main portal vein has reversed', 'The patient has a new clot'], answer: 0, why: 'Blood heads to the low-pressure shunt, so the branches beside it can reverse. That is expected, not failure.' },
        { q: 'The report calls the portal vein flow hepatofugal and the spectrum appears below the baseline. A colleague says the Doppler is simply inverted. What do you do?', options: ['Check the vessel, probe angle and Invert setting', 'Treat it as reversed flow and act on it', 'Ignore the report: color is unreliable', 'Repeat the scan only if there is ascites'], answer: 0, why: 'Above or below the baseline depends on the probe angle and the Invert setting. Direction comes from the vessel and the anatomy.' },
      ] },
    ],
  },
  {
    id: 'left-sided', title: 'Left-sided portal hypertension', minutes: 4,
    summary: 'A blocked splenic vein raises pressure in the spleen’s territory alone, and TIPS does not help.',
    pearls: ['Isolated gastric varices with a normal liver: think splenic vein.', 'Pancreatitis and pancreatic tumors are the usual causes.', 'TIPS does not fix it.'],
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'thrombus', 'endoscope'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['SV_CONF', 'C2', 'PV_TRUNK'], focusLabel: 'Splenic vein, gastric veins, portal vein',
        text: 'A 52-year-old with past pancreatitis has gastric varices, a big spleen and a normal liver. Where is the block?' },
      { type: 'predict', q: 'Where is the block most likely to be?', options: ['In the splenic vein', 'In the main portal vein', 'Inside the liver', 'In the heart'], answer: 0,
        why: 'The spleen is enlarged and the liver is normal, which points to the vein that drains the spleen.' },
      { type: 'do', tools: ['select', 'thrombus'], focus: ['SV_CONF'], focusLabel: 'Splenic vein', text: 'Put a **clot in the splenic vein** that blocks it completely.',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Main portal vein', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.99, hint: 'Tap the splenic vein on the figure, then drag Clot to 100 %.' },
      { type: 'observe', seconds: 8, preset: 'svt', tools: ['select', 'endoscope', 'doppler'], tab: 'endoscopy', focus: ['C2', 'C5', 'SV_CONF'], focusLabel: 'Gastric varices',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Main portal vein', metric: 'pv', unit: 'mmHg' }],
        text: 'Months later, the spleen drains through the stomach wall, so gastric varices form. The pressure in the main portal vein stays normal.' },
      { type: 'explain', metric: 'pv', text: 'Only the spleen’s side is under pressure. TIPS will not help, because the main portal vein is not under pressure. The fix is at the spleen, with splenectomy or splenic artery embolization, and only if it bleeds.' },
      { type: 'check', quiz: [
        { q: 'A patient has isolated gastric varices and normal liver tests. Which imaging do you order first?', options: ['A contrast CT to look at the splenic vein', 'A liver biopsy', 'Hepatic venous pressure measurement', 'A repeat scope in 3 months'], answer: 0, why: 'A contrast CT shows the splenic vein, and a clot there explains varices in the stomach with a healthy liver.' },
        { q: 'A patient with splenic vein thrombosis bleeds from gastric varices. Which treatment is least likely to help?', options: ['TIPS', 'Splenectomy', 'Splenic artery embolization', 'Endoscopic glue'], answer: 0, why: 'TIPS lowers pressure in the main portal vein, which is already normal. The problem is on the spleen’s side.' },
      ] },
    ],
  },
  {
    id: 'toolbox', title: 'The toolbox: what each treatment fixes and costs', minutes: 6,
    summary: 'Bands treat the varix, drugs treat inflow, TIPS bypasses the liver, and closing a route has its own price.',
    pearls: ['Each tool treats a different part of the problem.', 'TIPS sends blood past the liver and onto the heart.', 'Check the heart, the brain and the bilirubin before TIPS.'],
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'stent'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['PVH_R', 'RHV_IVC', 'C1b'], focusLabel: 'Portal vein, hepatic vein, varices',
        data: [{ label: 'Portal-to-cava gradient', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'A patient with decompensated cirrhosis has varices and ascites. Drugs turn the inflow down, bands remove a varix, and a TIPS gives portal blood a new route. Note the starting numbers.' },
      { type: 'predict', q: 'After a TIPS, what happens to blood flow through the liver?', options: ['It falls', 'It rises', 'It stays the same', 'It reverses'], answer: 0,
        why: 'The shunt gives blood an easier way back to the heart, so less goes through the liver.' },
      { type: 'do', tools: ['select', 'stent'], focus: ['PVH_R', 'RHV_IVC'], focusLabel: 'Portal vein to hepatic vein', text: 'Create a **TIPS** between the right portal vein and the right hepatic vein, 8 mm wide. Compare the gradient, the blood reaching the liver, and the load on the heart.',
        data: [{ label: 'Portal-to-cava gradient', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        goal: (f, p) => p.tips.on && Math.abs(p.tips.d - 8) <= 0.1, hint: 'Tap the right portal vein, choose Create shunt, tap the right hepatic vein, then set the diameter.' },
      { type: 'observe', seconds: 8, tools: ['select'], tab: 'profile', focus: ['TIPS', 'PVH_R', 'RHV_IVC'], focusLabel: 'The new shunt',
        data: [{ label: 'Portal-to-cava gradient', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'The gradient falls, but less blood goes through the liver and more returns to the heart. This is why TIPS can cause encephalopathy or heart strain.' },
      { type: 'frame', preset: 'gastric-varix', tools: ['select', 'occlude'], tab: 'profile', focus: ['C2', 'C5', 'PV_TRUNK'], focusLabel: 'Gastric varices and their draining shunt',
        text: 'Another patient has gastric varices draining through a large shunt to the left renal vein. You can close that shunt, as in a BRTO.' },
      { type: 'do', tools: ['select', 'occlude'], focus: ['C5'], focusLabel: 'Gastrorenal shunt', text: '**Close the shunt** and confirm that the flow stops.',
        data: [{ label: 'Flow through the shunt', metric: (m) => m.collateralFlows.C5 * 0.06, d: 3, unit: 'L/min' }],
        goal: (f, p) => !!p.occluded.C5, inline: ['brto'] },
      { type: 'explain', metric: 'shunt', text: 'Bands fix the varix, not the pressure. Beta blockers and vasoactive drugs lower inflow, the latter only for an acute bleed. TIPS lowers pressure and treats varices and ascites, but less blood reaches the liver and the heart works harder. Closing a gastric shunt may worsen esophageal varices and ascites.' },
      { type: 'check', quiz: [
        { q: 'Which patient should NOT receive a TIPS?', options: ['A patient with severe tricuspid regurgitation', 'A 55-year-old with refractory ascites and a bilirubin of 1.5', 'A patient with rebleeding despite bands and a beta blocker', 'A patient who needs a rescue procedure after a bleed'], answer: 0, why: 'A TIPS returns more blood to the right heart. Severe tricuspid regurgitation or heart failure can decompensate.' },
        { q: 'Which pairing is correct?', options: ['Bands: the varix; vasoactive drug: inflow; TIPS: bypass of the liver', 'Bands: the pressure; vasoactive drug: the clot; TIPS: scarring', 'Bands: inflow; vasoactive drug: the varix; TIPS: the kidney', 'All three lower the portal pressure by the same route'], answer: 0, why: 'Each tool works on a different part: bands on the varix, drugs on the inflow, TIPS on the route past the liver.' },
      ] },
    ],
  },
];

const STEP = {
  frame: ['book', 'Context'], predict: ['bulb', 'Predict'], do: ['tools', 'Your turn'], observe: ['explore', 'Observe'], explain: ['bulb', 'Explain'], check: ['check', 'Check'],
};
// Lesson steps name locked-control keys; these are the matching controls to embed in the card.
const INLINE = { cirrhosis: 'cirrhosis', splanchnicTone: 'splanchnicTone', 'drug:propranolol': 'drug:propranolol', 'drug:terlipressin': 'drug:terlipressin', 'drug:octreotide': 'drug:octreotide', 'drug:carvedilol': 'drug:carvedilol', apShunt: 'apShunt', spontaneous: 'srShunt', diuretics: 'diuretics', brto: 'brto' };

export function createLearn({ host: hostEl, coach, stage, panel, dock, inspector, beginSession, endSession, onEnd, loadPreset, action, setTool, setAllowedTools, showPane, setProbe, openPanel, setBanner }) {
  let lesson = null, idx = 0, state = {};
  // The step card never covers the figure. Where the side panel sits beside the figure (wide
  // screens) it heads the panel; below that it is a bottom sheet under the figure, which gives up
  // its own height to it.
  const asSheet = matchMedia('(max-width: 1279px)');
  let sheetMin = false;
  const snaps = [];             // starting state of each step, for Replay
  let answers = createAnswerSheet(), t0 = 0, mirror = null, unbindKeys = null, cardEl = null;
  let pollTimer = null, inline = null;
  // Options appear in a shuffled order, fixed for the attempt, so the right answer is not always first.
  let perms = {};
  const permOf = (key, n) => {
    if (perms[key]?.length !== n) { const o = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } perms[key] = o; }
    return perms[key];
  };
  /** optionList for an authored question, shown shuffled; picks and answers stay in authored indexes. */
  function shuffledList(key, { options, picked, answer, onPick }) {
    const o = permOf(key, options.length), at = (i) => (i == null ? null : o.indexOf(i));
    return optionList({ options: o.map((i) => options[i]), picked: at(picked), answer: at(answer), reveal: picked != null, locked: picked != null, onPick: (k) => onPick(o[k]) });
  }

  // A small labeled data row (F2): live paired metrics for a step, each { label, metric, d, unit }.
  // `metric` is a dotted path into the metrics frame (e.g. 'varix.d') or a function of it.
  let dataTimer = 0;
  function dataRow(items) {
    const val = (it, m) => (typeof it.metric === 'function' ? it.metric(m) : it.metric.split('.').reduce((a, k) => a?.[k], m));
    const cells = items.map((it) => h('span', { class: 'dr-v' }, '—'));
    const show = (it, v) => (v == null ? '—' : it.fmt ? it.fmt(v) : `${fmt(v, it.d ?? 1)} ${it.unit || ''}`.trim());
    // On a step where something happens (do, observe), each number also says where it started, so the
    // change is read off the card instead of remembered.
    const st = lesson.steps[idx], base = (st.type === 'do' || st.type === 'observe') ? (state.base ||= {}) : null;
    const upd = () => {
      const m = store.get().frame?.metrics; if (!m) return;
      items.forEach((it, i) => {
        const v = val(it, m), now = show(it, v);
        if (base && v != null && !(it.label in base)) base[it.label] = v;
        const b = base?.[it.label], was = b == null ? now : show(it, b);
        const moved = was !== now && (typeof v !== 'number' || it.fmt || Math.abs(v - b) >= Math.max(0.5, 0.05 * Math.abs(b)));
        cells[i].replaceChildren(now, moved ? h('small', { class: 'dr-was' }, `${v > b ? '↑' : '↓'} from ${was}`) : '');
      });
    };
    clearInterval(dataTimer); upd(); dataTimer = setInterval(upd, 400);
    return h('dl', { class: 'kv data-row', 'aria-live': 'off' }, items.flatMap((it, i) => [h('dt', {}, it.label), h('dd', {}, cells[i])]));
  }

  function openList() { render(); }

  async function start(id) {
    await beginSession?.('lesson');
    lesson = LESSONS.find((l) => l.id === id);
    idx = 0; state = {}; perms = {}; snaps.length = 0; answers = createAnswerSheet(); t0 = Date.now();
    unbindKeys?.(); unbindKeys = bindQuestionKeys(() => cardEl);
    sheetMin = false;
    await enter();
    if (!asSheet.matches) openPanel?.('chart');
    panel.scrollTop = 0;
  }
  function stop() {
    lesson = null;
    mirror?.el.remove(); mirror = null; blindOff(); unbindKeys?.(); unbindKeys = null; cardEl = null;
    coach?.replaceChildren();
    clearInterval(pollTimer); clearInterval(dataTimer);
    store.set({ locked: null, hiddenReadouts: null });
    setAllowedTools(null);
    dock.profile.clearPredict();
    store.set({ focus: null });
    setBanner?.(null);
    render();
    endSession?.('lesson');
    onEnd?.();
  }

  async function enter({ replay = false } = {}) {
    const st = lesson.steps[idx];
    clearInterval(pollTimer); clearInterval(dataTimer);
    mirror?.el.remove(); mirror = null; blindOff();
    // An observe step that watches the result of the step before it keeps that step's starting numbers.
    const carry = st.type === 'observe' && !st.preset && lesson.steps[idx - 1]?.type === 'do' ? { ...(state.base || {}) } : undefined;
    state = { answered: null, quizAns: {}, observed: false, met: false, base: carry };
    // One executor for the whole step state (sequence.js): reset → patch → settle → snapshot, then
    // the step is exposed. The snapshot Replay returns to is taken after the worker acknowledged
    // the patch, so it carries the patch with it.
    const seq = await runSequence({ preset: st.preset, presetDays: st.presetDays, params: st.params, days: st.afterDays, label: st.title }, { loadPreset, action }, { reset: !replay });
    if (!lesson || lesson.steps[idx] !== st) return;
    if (!replay) snaps[idx] = { snap: seq.snap, params: seq.params };
    state.logStart = store.get().actionLog?.length || 0;
    if (st.tools) setAllowedTools(st.tools);
    if (st.hide) store.set({ hiddenReadouts: new Set(st.hide) });
    store.set({ locked: new Set(st.controls || ['*']) });
    if (st.layers) store.set({ layers: { ...store.get().layers, ...st.layers } });
    if (st.view && st.view !== store.get().view) store.set({ view: st.view });
    if (st.zoom) store.set({ lobule: st.zoom === 'lobule' });
    if (st.lobuleLayers) store.set({ lobuleLayers: { ...store.get().lobuleLayers, ...st.lobuleLayers } });
    // One surface: a question never has an instrument open beside it, unless the student has to draw on one.
    const asking = (st.type === 'predict' && st.mode !== 'draw') || st.type === 'check';
    if (asking) dock.close?.(); else if (st.tab) showPane(st.tab);
    // The figure glides into the space the closed (or opened) instrument leaves.
    setTimeout(() => { if (lesson?.steps[idx] === st) stage?.refit?.(); }, 380);
    if (st.blind ?? (st.type === 'predict' && st.mode !== 'draw')) blindOn();
    if (st.path) dock.profile.setPath(st.path);
    if (st.probe) setProbe(st.probe);
    if (st.invert != null) dock.pane('doppler')?.setInvert?.(st.invert);
    if (st.endo) { showPane('endoscopy'); dock.pane('endoscopy')?.setView?.(st.endo); }
    store.set({ focus: st.focus ? { edges: st.focus, label: st.focusLabel } : null });
    if (st.type === 'predict' || st.type === 'frame' || st.type === 'check') host.send({ type: 'run', running: st.type === 'frame' });
    if (st.type === 'predict' && st.mode === 'draw') { dock.profile.startPredict(() => render()); showPane('profile'); }
    if (st.type === 'predict' && st.mode === 'direction') setTimeout(() => showMirror(st), 120);
    if (st.type === 'do') {
      host.send({ type: 'run', running: true });
      pollTimer = setInterval(() => {
        const f = store.get().frame;
        if (f && st.goal(f, store.get().params, (store.get().actionLog || []).slice(state.logStart))) { state.met = true; clearInterval(pollTimer); render(); setTimeout(() => { if (lesson && lesson.steps[idx] === st) next(); }, 1100); }
      }, 300);
    }
    if (st.type === 'observe') {
      host.send({ type: 'run', running: true, clock: 'hemo' });
      if (st.reveal) dock.profile.endPredict(true);
      if (st.days) { host.send({ type: 'advance', days: st.days }); state.observed = true; }
      else setTimeout(() => { if (lesson?.steps[idx] === st) { state.observed = true; render(); } }, st.seconds * 1000);
    }
    if (st.type === 'explain' && !st.text) {
      state.loading = true;
      render();
      const { result } = await host.request('explain', { metric: st.metric });
      state.loading = false; state.explain = result;
    }
    render();
  }
  function next() {
    if (!lesson) return;
    const st = lesson.steps[idx];
    // First answer per stable key only: stepping back and forward again never adds points.
    const key = (suffix) => `lesson:${lesson.id}:step-${String(idx + 1).padStart(2, '0')}:${suffix}`;
    if (st.type === 'predict' && st.options && state.answered != null) answers.record(key('q1'), state.answered === st.answer);
    if (st.type === 'check') st.quiz.forEach((qq, qi) => { if (state.quizAns[qi] != null) answers.record(key(`q${qi + 1}`), state.quizAns[qi] === qq.answer); });
    if (idx < lesson.steps.length - 1) { idx++; enter(); panel.scrollTop = 0; }
    else {
      const { score, right, total, mastered } = answers.score();
      saved[lesson.id] = { score: Math.max(score, saved[lesson.id]?.score || 0), date: new Date().toISOString() }; save();
      addRecord({ kind: 'lesson', id: lesson.id, title: lesson.title, score, assessment: ASSESSMENT_VERSION, contentVersion: CONTENT_VERSION, completed: true, mastered, wallDuration: (Date.now() - t0) / 1000, duration: (Date.now() - t0) / 1000, met: right, total,
        answers: answers.entries().map(([k, ok]) => `${k}: ${ok ? 'correct' : 'incorrect'}`) });
      toast(`Lesson complete: ${lesson.title} · ${score} %${mastered ? ' · mastered' : ` · mastery is ${MASTERY} %`}`); stop();
    }
  }
  // Replay: back to the state this step started from (it is also a timeline entry).
  function replay() {
    const s0 = snaps[idx];
    if (!s0) return;
    host.send({ type: 'restore', snap: s0.snap });
    updateParams(s0.params, { history: false });
    enter({ replay: true });
  }
  // The figure mirrors the question: a pulsing "?" on the vessel, then the student's arrow and the real one.
  function showMirror(st) {
    mirror?.el.remove(); mirror = null;
    const wrap = document.getElementById('stageView');
    const a = stage?.anchorFor({ type: 'edge', id: st.edge });
    if (!wrap || !a || lesson?.steps[idx] !== st) return;
    mirror = mirrorMarker(a);
    wrap.append(mirror.el);
    // The figure may still glide or be panned and zoomed: the marker stays on its vessel.
    const m0 = mirror, follow = () => {
      if (mirror !== m0 || !m0.el.isConnected) return;
      const b = stage?.anchorFor({ type: 'edge', id: st.edge });
      if (b) { m0.el.style.left = `${b.x}px`; m0.el.style.top = `${b.y}px`; }
      setTimeout(follow, 100);
    };
    setTimeout(follow, 100);
    if (state.answered != null) { mirror.pick(state.answered); mirror.reveal(state.actual); }
  }
  function pickDirection(st, i) {
    if (state.answered != null) return;
    const dir = i === 0 ? 1 : -1, actual = flowSign(st.edge);
    state.answered = dir; state.actual = actual;
    answers.record(`lesson:${lesson.id}:step-${String(idx + 1).padStart(2, '0')}:dir`, dir === actual);
    mirror?.pick(dir); mirror?.reveal(actual);
    blindOff(); stage?.flash([st.edge]); render();
  }
  function back() { if (lesson && idx > 0) { idx--; enter(); } }
  const flowSign = (id) => { const f = store.get().frame; const q = f ? (f.Qf || f.Q)[EI[id]] : 0; return q >= 0 ? 1 : -1; };

  const plain = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  function bannerText(st) {
    if (st.type === 'predict') return st.q ? plain(st.q) : 'Draw your prediction on the pressure profile';
    if (st.type === 'do') return state.met ? 'Done: moving on' : plain(st.text);
    if (st.type === 'observe') return state.observed ? 'Now read what changed on the figure' : plain(st.text).split('. ')[0];
    if (st.type === 'explain') return `Why? ${lesson.title}`;
    if (st.type === 'check') return 'Check your understanding in the panel';
    return lesson.title;
  }
  const md = (t) => { const span = h('span'); span.innerHTML = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); return span; };
  

  function render() {
    inline?.dispose?.(); inline = null;
    const inLearn = store.get().mode === 'learn';
    if (!inLearn || !lesson) { hostEl.replaceChildren(); coach?.replaceChildren(); return; }
    const st = lesson.steps[idx];
    const body = [];
    if (idx === 0) body.push(trustLine());
    if (st.text) body.push(h('p', {}, md(st.text)));
    if (st.data && !isBlind()) body.push(dataRow(st.data), teachChip());
    let canNext = true, asking = false;
    if (st.type === 'predict' && !st.mode) {
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null; asking = !canNext;
      body.push(shuffledList(`${idx}`, { options: st.options, picked: state.answered, answer: st.answer, onPick: (i) => { state.answered = i; blindOff(); render(); } }));
      if (state.answered != null) body.push(h('div', { class: 'feedback ' + (state.answered === st.answer ? 'right' : 'wrong') }, h('b', {}, state.answered === st.answer ? 'Correct. ' : 'Not quite. '), st.why || 'Now let’s see what the model does.'));
    }
    if (st.type === 'predict' && st.mode === 'draw') body.push(h('div', { class: 'feedback' }, 'Draw on the pressure profile below the anatomy. When you have at least four points, continue.'));
    if (st.type === 'predict' && st.mode === 'direction') {
      const labels = st.labels || ['Toward the liver', 'Away from the liver'], said = state.answered == null ? null : state.answered > 0 ? 0 : 1;
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null; asking = !canNext;
      body.push(optionList({ options: labels, dir: true, picked: said, locked: said != null, onPick: (i) => pickDirection(st, i) }));
      if (said != null) body.push(compareChip({ said: labels[said], showed: labels[state.actual > 0 ? 0 : 1], ok: state.answered === state.actual }));
    }
    if (st.type === 'do') {
      canNext = state.met;
      const ids = [...(st.inline || []), ...(st.controls || []).map((k) => INLINE[k]).filter(Boolean)];
      if (ids.length) {
        inline = inspector.buildControls([...new Set(ids)]);
        body.push(h('div', { class: 'inline-controls' }, inline.els));
      }
      if (st.presetButton) body.push(h('button', { class: 'btn block', style: { marginBottom: '12px' }, onclick: () => loadPreset(st.presetButton) }, `Load: ${store.get().presetList?.find((p) => p.id === st.presetButton)?.label || st.presetButton}`));
      body.push(h('div', { class: 'goal ' + (state.met ? 'met' : 'waiting') }, h('span', { class: 'chk' }, svgIcon('check')), state.met ? 'Done. Moving on…' : 'Waiting for you…'));
      if (st.hint) body.push(h('p', { class: 'ctl-sub' }, st.hint));
    }
    if (st.type === 'observe') {
      canNext = state.observed;
      if (!state.observed) body.push(h('div', { class: 'goal waiting' }, h('span', { class: 'chk' }, svgIcon('check')), st.days ? `Running ${st.days} simulated days…` : 'Watching the model…'));
      else if (st.reveal) { const err = dock.profile.predictionError(); if (err != null) body.push(h('div', { class: 'feedback' }, `Your prediction was off by `, h('b', {}, `${fmt(err, 1)} mmHg`), ' on average.')); }
    }
    if (st.type === 'explain') {
      if (st.text) { /* the authored text above is the explanation */ }
      else if (state.loading) body.push(h('div', { class: 'skeleton', style: { width: '95%' } }), h('div', { class: 'skeleton', style: { width: '75%' } }));
      else if (state.explain) body.push(h('div', { class: 'feedback', style: { color: 'var(--text)', fontSize: 'var(--fs-14)' } }, state.explain.sentence), state.explain.formula ? h('div', { class: 'formula', style: { marginBottom: '12px' } }, state.explain.formula) : null);
    }
    if (st.type === 'check') {
      canNext = st.quiz.every((_, qi) => state.quizAns[qi] != null); asking = !canNext;
      st.quiz.forEach((qq, qi) => {
        const got = state.quizAns[qi];
        body.push(h('p', { class: 'q' }, qq.q));
        body.push(shuffledList(`${idx}:${qi}`, { options: qq.options, picked: got, answer: qq.answer, onPick: (i) => { state.quizAns[qi] = i; render(); } }));
        if (got != null) body.push(h('div', { class: 'feedback ' + (got === qq.answer ? 'right' : 'wrong') }, h('b', {}, got === qq.answer ? 'Correct. ' : `Not quite: the answer is “${qq.options[qq.answer]}”. `), qq.why || ''));
      });
    }
    // The takeaways close the lesson: shown on the last step once its questions are answered.
    if (idx === lesson.steps.length - 1 && lesson.pearls?.length && canNext) body.push(h('div', { class: 'pearls' }, h('p', { class: 'step-label' }, 'Pearls'), h('ul', {}, lesson.pearls.map((t) => h('li', {}, t)))));
    const [, typeLabel] = STEP[st.type], stepLabel = `${typeLabel} · ${idx + 1} of ${lesson.steps.length}`;
    const bt = bannerText(st);
    setBanner?.({ tag: `Lesson · ${idx + 1}/${lesson.steps.length}`, text: bt === lesson.title ? lesson.title : `${lesson.title}: ${bt}` });
    const sheet = asSheet.matches && coach;
    const card = h('section', { class: 'lesson', 'aria-label': `Lesson: ${lesson.title}` },
      // Progress: a dot per step, with only the current step named.
      h('div', { class: 'lesson-top' },
        h('div', { class: 'phase-rail', role: 'img', 'aria-label': stepLabel }, lesson.steps.map((s0, i) => h('span', { class: i < idx ? 'on' : i === idx ? 'cur' : '' }, h('i'), i === idx ? h('b', {}, stepLabel) : null))),
        h('span', { class: 'lt-act' }, h('button', { class: 'link', title: 'Back to the state this step started from', onclick: replay, disabled: !snaps[idx] }, 'Replay'), h('button', { class: 'link', onclick: stop }, 'Exit'),
          sheet ? h('button', { class: 'ib sheet-min', 'aria-label': sheetMin ? 'Expand the lesson' : 'Minimize the lesson', 'aria-expanded': String(!sheetMin), onclick: () => { sheetMin = !sheetMin; render(); } }, svgIcon('chev-down')) : null)),
      h('h3', {}, lesson.title), ...body,
      h('div', { class: 'lesson-foot' }, idx > 0 ? h('button', { class: 'btn ghost', onclick: back }, 'Back') : h('span'),
        h('button', { class: 'btn primary', disabled: !canNext, onclick: () => { if (st.type === 'predict' && st.mode === 'draw') dock.profile.endPredict(false); next(); } }, idx === lesson.steps.length - 1 ? 'Finish lesson' : 'Continue', svgIcon('chev-right'))));
    const target = sheet ? coach : hostEl;
    (target === coach ? hostEl : coach)?.replaceChildren();
    target.replaceChildren(card);
    cardEl = card;
    card.classList.toggle('q-active', asking && st.mode !== 'draw');
    card.classList.toggle('sheet', !!sheet);
    card.classList.toggle('min', !!sheet && sheetMin);
    // The figure gives up (or takes back) the sheet's height.
    requestAnimationFrame(() => { stage?.relayout(); if (sheet) dispatchEvent(new Event('resize')); });
  }

  store.on('mode', (m) => { if (m !== 'learn' && lesson) stop(); render(); });
  asSheet.addEventListener('change', () => { render(); if (lesson && !asSheet.matches) openPanel?.('chart'); });
  return { openList, start, stop, render, active: () => !!lesson };
}
