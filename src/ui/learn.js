// Learn mode (blueprint §11): lessons as step sequences with Predict → Observe → Explain.

import { store, updateParams } from './store.js?v=49dc9cdf15';
import { host } from './host.js?v=e8897fe2f3';
import { h, fmt, toast, svgIcon } from './util.js?v=e803df99cd';
import { createAnswerSheet, ASSESSMENT_VERSION, CONTENT_VERSION, MASTERY } from './assess.js?v=7f4afcf446';
import { addRecord } from './records.js?v=50fb9dd463';
import { runSequence } from './sequence.js?v=2435d65d60';
import { EDGES } from '../engine/topology.js?v=dc393aabea';
import { SNAPSHOTS } from './snapshots.js?v=34d1578d5f';
import { createRoute, ladder } from './ladder.js?v=d0e8d913b4';
import { CASES } from './cases/index.js?v=78c53e6b35';
import { UNITS, course, setUnitSurface, unitBar, exploreButton } from './course.js?v=4e4bcc6304';
import { trustLine, teachChip, blindOn, blindOff, isBlind, optionList, compareChip, bindQuestionKeys, mirrorMarker } from './learning-kit.js?v=4c9e07a876';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.lessons') || '{}'); } catch { return {}; } })();
const save = () => { try { localStorage.setItem('pps.lessons', JSON.stringify(saved)); } catch { /* storage unavailable */ } };

// Step bindings (all optional): preset/presetDays (native pre-aging), params, afterDays (extra disease days after the patch),
// tab (pane), probe, invert, endo ('eso'), focus, data (labeled metric row); a do-step goal(frame, params, log)
// also receives the actions the learner has taken since the step began (store.logAction).
// Step types: frame | predict (mcq | draw | direction) | do (goal) | observe (seconds / days) | explain (metric) | check (quiz)
// | route (tap the level of the block for `patient`, a preset; the ladder then eases in)
// | stem (a clinical vignette: `stem` text, lead-in `q`, five `options` A–E in authored order, `answer`,
//   `explain` one line per option; feedback is immediate) | keypoints (the unit's `keyPoints` as bullets).
// A step's `next` renames its Continue button (a unit's opening stem says "Show me").
// Course units (course.js) are lessons with `unit` set: they run on the unit surface and save progress there.
// `sid` is a stable step id for deep links (?lesson=id&step=sid; lesson-step-ids.md); keep it once published.
// A do-step may offer `dye` (a vessel to inject), `stay` (wait for Continue instead of moving on) and `after`
// (shown once the goal is met); its goal(frame, params, log, state) can read state.dyed. `view`: anatomic | circuit;
// `zoom: 'lobule'` with `sinusoid: true` goes one level further down. A lesson's `caseId` is its "Now try it" case.
// Each lesson runs: vignette (frame) → prediction → action (do) → reveal (observe) → explanation → new-patient questions (check).
// Text is clinical voice only: no vessel codes, no equations. `pearls` are the lesson’s takeaways.
// A 'direction' prediction is answered with two buttons under the question ('labels' override
// the default [toward the liver, away from the liver]; the first is the vessel's forward flow). The
// figure mirrors the choice and the answer is compared with the model's flow at once.
// Predict steps (not 'draw') are blind by default: numbers stay hidden until the student answers.
// Set `blind: false` on a step to keep them, `blind: true` to hide them on any other step.
export const LESSONS = [
  {
    id: 'portal-flow', title: 'Where portal blood goes', minutes: 5, caseId: 'pvt',
    summary: 'Portal veins have no valves: blood follows pressure, and a block raises pressure behind it.',
    pearls: ['Portal hypertension is pressure building up behind a block.', 'There are no valves, so flow follows pressure.', 'Past a block, blood takes collateral veins, given time.', 'A big spleen and low platelets are back-pressure signs.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'healthy', tools: ['select'], view: 'circuit', zoom: 'fit', focus: ['SV_CONF', 'PV_TRUNK', 'RHV_IVC'], focusLabel: 'Splenic, portal and hepatic veins',
        text: 'A 40-year-old has a clot in his portal vein, and his spleen has grown. This is the **Circuit** view: the same veins drawn as a map. Blood from the gut and spleen travels through the portal vein into the liver, then out through the hepatic veins to the heart.' },
      { sid: 'direction', type: 'predict', mode: 'direction', edge: 'SV_CONF', q: 'In a healthy person, which way does blood flow in the splenic vein: toward the liver or away from it?' },
      { sid: 'dye', type: 'do', preset: 'healthy', tools: ['select'], view: 'circuit', dye: 'SV_CONF', dyeLabel: 'Inject dye into the splenic vein', focus: ['SV_CONF', 'PV_TRUNK'], focusLabel: 'Splenic and portal veins',
        text: 'Check your answer with dye. **Inject dye into the splenic vein** and follow it.',
        after: 'The dye runs toward the liver, spreads through it, and leaves through the hepatic veins for the heart: downhill, along the pressure slope.', stay: true, goal: (f, p, log, s) => s.dyed },
      { sid: 'clot', type: 'do', preset: 'healthy', tools: ['select', 'thrombus'], view: 'circuit', focus: ['PV_TRUNK'], focusLabel: 'Portal vein', text: 'Put a **clot in the portal vein** that blocks it completely. Then watch the pressure on each side.',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Liver side', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => (p.thrombus.PV_TRUNK || 0) >= 0.99, hint: 'Tap the portal vein on the figure, then drag Clot to 100 %.' },
      { type: 'observe', seconds: 8, tools: ['select'], focus: ['SV_CONF', 'PV_TRUNK'], focusLabel: 'Spleen side and liver side',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Liver side', metric: 'pv', unit: 'mmHg' }],
        text: 'Pressure piles up on the gut and spleen side of the clot, while the liver side stays low. Blood now searches for other ways out.' },
      { type: 'predict', q: 'Months later the clot is still there. Where will dye from the spleen go now?', options: ['Around the clot, through new collateral veins', 'Through the clot into the liver', 'Back into the spleen, where it stops', 'Into the hepatic artery'], answer: 0,
        why: 'Back-pressure slowly opens small veins around the block. Given months, they carry the blood the portal vein cannot.' },
      { sid: 'collaterals', type: 'do', preset: 'pvt-chronic', tools: ['select'], view: 'circuit', dye: 'SV_CONF', dyeLabel: 'Inject dye into the splenic vein', focus: ['SV_CONF', 'PV_TRUNK'], focusLabel: 'Splenic vein and the clotted portal vein',
        text: 'Months on, the portal vein is still blocked. **Inject dye into the splenic vein** again.',
        after: 'The dye cannot cross the clot. It detours: some through a web of small veins around the portal vein into the liver (a cavernoma), and some through collaterals such as varices, straight to the heart.', stay: true, goal: (f, p, log, s) => s.dyed },
      { type: 'explain', metric: 'pv', text: 'Portal veins have no valves, so blood goes wherever the pressure is lowest. A block raises pressure behind it, never beyond it. That is why this patient’s spleen enlarged and his platelets fell, and why, over months, collateral veins open around the block.' },
      { type: 'check', quiz: [
        { q: 'A patient’s portal vein is blocked where it enters the liver. Where do you expect the pressure to be highest?', options: ['In the veins of the spleen and bowel', 'In the liver’s sinusoids', 'In the hepatic veins and cava', 'Equally high everywhere'], answer: 0, why: 'Pressure builds up behind a block, in the veins that drain into it, not beyond it.' },
        { q: 'A woman has a large spleen, platelets of 70 and a normal liver ultrasound. Which finding would best explain the platelets?', options: ['A big spleen from back-pressure, trapping them', 'Leaking valves in the portal vein', 'Reduced bile flow from the liver', 'Too much blood reaching the liver'], answer: 0, why: 'Back-pressure enlarges the spleen, and a big spleen holds on to platelets (hypersplenism).' },
      ] },
    ],
  },
  {
    id: 'which-level', title: 'Before, in, or after the liver', minutes: 6, caseId: 'budd-chiari',
    summary: 'Find the level of the block first: before the liver, inside it, or after it.',
    pearls: ['Find the level of the block before you name the disease.', 'Ascites with high protein points to a block after the liver.', 'Big varices with normal liver tests point to a block before the sinusoids.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'healthy', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', path: 'main', focus: ['PV_TRUNK', 'SIN_RR', 'RHV_IVC'], focusLabel: 'Portal vein, liver, hepatic vein',
        text: 'Four patients have portal hypertension, and their varices look alike. Before you name a disease, find the **level** of the block on the route blood takes: before the liver, in the portal tracts, in the sinusoids, just after them, in the hepatic veins or cava, or at the heart. For each patient, tap the level; the pressure ladder then shows where the pressure drops.' },
      { sid: 'level-presin', type: 'route', preset: 'healthy', patient: 'schisto', site: 'presin', focus: ['PRE_R', 'PRE_L'], focusLabel: 'Small portal branches',
        story: 'A 28-year-old who grew up near the Nile has large varices and a big spleen.',
        clues: ['Bilirubin, albumin and clotting are normal. No ascites.', 'Doppler: the portal vein is open, with flow toward the liver. Thick, bright bands surround the portal branches.', (fp) => `Liver stiffness ${fmt(fp.lsm, 0)} kPa: soft, for a patient this sick.`],
        why: 'Schistosome eggs lodge in the small portal branches, before the sinusoids. Portal pressure is high, yet the liver cells are spared, so the liver works and ascites is uncommon. A soft liver (stiffness under 10 kPa) with signs of portal hypertension should make you think of a vascular liver disease such as this, or porto-sinusoidal vascular disorder (PSVD).' },
      { sid: 'level-sin', type: 'route', preset: 'healthy', patient: 'cirr-decomp', site: 'sin', focus: ['SIN_RR', 'SIN_RL'], focusLabel: 'Sinusoids',
        story: 'A 52-year-old with years of heavy drinking has new jaundice and a swollen abdomen.',
        clues: ['Doppler: slow portal flow toward the liver. The liver is small and nodular, the spleen big.', (fp) => `Ascitic tap: SAAG ${fmt(fp.saag, 1)} g/dL, protein ${fmt(fp.tp, 1)} g/dL.`],
        why: 'Scarring stiffens the sinusoids, so the main drop in pressure happens inside the liver. The scarred sinusoid holds protein back, so the ascites is low in protein.' },
      { sid: 'level-post', type: 'route', preset: 'healthy', patient: 'budd-chiari', site: 'post', focus: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], focusLabel: 'Hepatic veins',
        story: 'A 26-year-old on the pill has ascites that came on over two weeks, and a painful, enlarged liver.',
        clues: ['Doppler: the hepatic veins cannot be seen. The caudate lobe is enlarged.', (fp) => `Ascitic tap: SAAG ${fmt(fp.saag, 1)} g/dL, protein ${fmt(fp.tp, 1)} g/dL.`, 'Neck veins are not raised.'],
        why: 'Clot in the hepatic veins backs up the whole liver. The sinusoids stay leaky, so the ascites is rich in protein, and the heart is normal.' },
      { sid: 'level-cardiac', type: 'route', preset: 'healthy', patient: 'rhf', site: 'cardiac', focus: ['IVCS_RA', 'RHV_IVC'], focusLabel: 'Cava and right atrium',
        story: 'A 70-year-old has breathlessness, swollen legs and ascites.',
        clues: ['The neck veins are full to the jaw.', 'Doppler: the portal vein pulses with each heartbeat. The hepatic veins and cava are wide.', (fp) => `Ascitic tap: SAAG ${fmt(fp.saag, 1)} g/dL, protein ${fmt(fp.tp, 1)} g/dL.`],
        why: 'Pressure backs up from the failing heart into every vein below it. Like Budd–Chiari, the ascites is high in protein; the full neck veins point to the heart.' },
      { sid: 'summary', type: 'explain', metric: 'pv', text: 'Block **before** the liver (portal vein clot): normal liver tests, little ascites. Block **in** the liver before the sinusoids (schistosomiasis; porto-sinusoidal vascular disorder, PSVD, behaves alike): normal liver function, big varices. Block **in** the sinusoids (cirrhosis): sick liver, ascites with low protein. Block **after** the liver (hepatic veins, heart): ascites with high protein.' },
      { type: 'check', quiz: [
        { q: 'A 30-year-old from Egypt has large varices, normal bilirubin and no ascites. Where is the block most likely?', options: ['Before the sinusoids, in small portal branches', 'In the sinusoids, from cirrhosis', 'After the liver, in the hepatic veins', 'In the heart, from right heart failure'], answer: 0, why: 'Schistosome eggs block the small portal branches. The liver cells are spared, so bilirubin is normal and ascites is unusual.' },
        { q: 'A woman has painful hepatomegaly, rapid ascites with high protein, and varices. Where do you look for the block?', options: ['After the liver: hepatic veins and cava', 'In the portal vein', 'In the sinusoids, from cirrhosis', 'In the splenic vein'], answer: 0, why: 'Painful liver, fast ascites with high protein: think Budd–Chiari. Doppler the hepatic veins and cava.' },
      ] },
    ],
  },
  {
    id: 'measuring-pressure', title: 'Measuring portal pressure, and when the number lies', minutes: 7, caseId: 'schisto',
    summary: 'The wedged-minus-free gradient reads the sinusoids, and misleads when the block is before or after them.',
    pearls: ['A gradient of 10 or more is clinically significant portal hypertension.', 'A normal gradient does not rule out portal hypertension (schistosomiasis, PSVD).', 'With blocked hepatic veins the gradient cannot be measured or trusted.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'csph', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'hvpg', focus: ['RHV_IVC', 'SIN_RR'], focusLabel: 'Hepatic vein and sinusoids',
        text: 'This patient has compensated cirrhosis. How do you put a number on her portal pressure? A catheter goes in from the neck to a hepatic vein. It reads the **free** pressure there; then a balloon blocks the vein, and the still blood in front of it reads the **wedged** pressure, which stands in for the sinusoids. Wedged minus free is the hepatic venous pressure gradient (**HVPG**). Normal is up to 5; 10 or more is clinically significant portal hypertension, the level at which varices, ascites and bleeding become likely.' },
      { sid: 'hvpg-run', type: 'do', preset: 'csph', tools: ['select'], tab: 'hvpg', text: 'Tap **Measure HVPG** and watch the catheter, the balloon and the tracing.', hint: 'The button is at the top of the HVPG card.',
        after: 'Wedged minus free: this gradient is clinically significant.', stay: true, goal: (f, p, log) => log.some((a) => a.type === 'hvpg') },
      { type: 'predict', q: 'A traveller with schistosomiasis has large varices. Will his HVPG be high?', options: ['Yes, large varices mean a high gradient', 'No, it can be normal or only mildly raised', 'It cannot be measured in schistosomiasis', 'Yes, the liver is cirrhotic'], answer: 1,
        why: 'The wedge reads the sinusoids, and in schistosomiasis the block lies before them.' },
      { sid: 'hvpg-schisto', type: 'do', preset: 'schisto', tools: ['select'], tab: 'hvpg', focus: ['PRE_R', 'PRE_L'], focusLabel: 'Small portal branches',
        text: 'Now the traveller with schistosomiasis. **Measure his HVPG**.', stay: true, goal: (f, p, log) => log.some((a) => a.type === 'hvpg'),
        after: 'A normal gradient, in a man with large varices.' },
      { type: 'observe', seconds: 6, tools: ['select'], tab: 'profile', path: 'main', focus: ['PV_TRUNK', 'PRE_R', 'RHV_IVC'], focusLabel: 'Portal vein and liver outlet',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'The pressure profile shows why: the portal pressure is high, but it drops before the sinusoids, where the wedge cannot see it. The portosystemic gradient (**PPG**, portal vein minus cava) catches it. Porto-sinusoidal vascular disorder (**PSVD**) fools the HVPG the same way: it is often below 10 despite varices.' },
      { type: 'predict', q: 'A young woman has Budd–Chiari: her hepatic veins are blocked by clot. What happens when the catheter tries to measure her HVPG?', options: ['It cannot enter the hepatic vein, so there is no reading', 'It reads a very high gradient', 'It reads a normal gradient you can trust', 'It reads the portal vein directly'], answer: 0,
        why: 'The wedge needs an open hepatic vein. With the veins clotted the catheter cannot get in, and the measurement is abandoned.' },
      { sid: 'hvpg-budd-chiari', type: 'do', preset: 'budd-chiari', tools: ['select'], tab: 'hvpg', focus: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], focusLabel: 'Hepatic veins',
        text: '**Measure the HVPG** in Budd–Chiari and watch the catheter.', stay: true, goal: (f, p, log) => log.some((a) => a.type === 'hvpg'),
        after: 'The catheter cannot enter the clotted vein, so there is no free or wedged pressure to read. Her portal pressure is high all the same.' },
      { sid: 'hvpg-heart', type: 'observe', seconds: 8, preset: 'rhf', params: { pulsatile: true }, tools: ['select'], tab: 'profile', path: 'main', zoom: 'fit', focus: ['IVCS_RA', 'RHV_IVC'], focusLabel: 'Cava and hepatic vein',
        data: [{ label: 'Free pressure', metric: 'fhvp', unit: 'mmHg' }, { label: 'Wedged pressure', metric: 'whvp', unit: 'mmHg' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'In right heart failure the catheter gets in, but both pressures are high, so their difference stays small.' },
      { type: 'explain', metric: 'hvpg', text: 'The wedge sees the sinusoids. A block before them is invisible, a clotted hepatic vein cannot be entered, and a failing heart raises both readings together. A low gradient therefore never excludes portal hypertension.' },
      { type: 'check', quiz: [
        { q: 'A patient with Budd–Chiari has a low gradient on an outside report. Can you trust it?', options: ['No: blocked hepatic veins make the wedge invalid', 'Yes: a low number means no portal hypertension', 'Yes, as long as the free pressure is also low', 'Only if the patient is on a beta blocker'], answer: 0, why: 'The wedge needs an open hepatic vein to read the sinusoids. With the outflow blocked, the number means nothing.' },
        { q: 'A patient with cirrhosis has a gradient of 11 mmHg. What does this tell you?', options: ['Clinically significant portal hypertension', 'Normal pressure', 'Portal hypertension is excluded', 'A block after the liver'], answer: 0, why: '10 or more is clinically significant portal hypertension: the threshold for varices, ascites and preventive treatment.' },
        { q: 'A patient with severe tricuspid regurgitation has high free and wedged pressures and a gradient of 3. What is the best explanation?', options: ['Congestion from the failing right heart', 'A normal liver', 'A block before the sinusoids', 'A reversed portal vein'], answer: 0, why: 'The failing heart raises both pressures together, so their difference stays small even though the liver is congested.' },
      ] },
    ],
  },
  {
    id: 'inflow-and-drugs', title: 'Why the gut sends more blood, and how drugs help', minutes: 5, caseId: 'prevention',
    summary: 'Cirrhosis opens the gut’s arteries, so more blood pours into a stiff liver; beta blockers turn the inflow down.',
    pearls: ['Portal hypertension is a stiff liver plus too much inflow.', 'Carvedilol is the preferred beta blocker to prevent decompensation.', 'A fall in HVPG of 20 % or more, or to 12 or below, is a good response.', 'Watch blood pressure in advanced disease.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'csph', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'scope', focus: ['A_SMA', 'SIN_RR', 'PV_TRUNK'], focusLabel: 'Gut inflow, liver, portal vein',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }],
        text: 'Why does a heart drug, a beta blocker, prevent variceal bleeding? Here is a patient with compensated cirrhosis and a gradient above 10. The **Over time** chart traces her pressures as they go; note where they start.' },
      { type: 'predict', q: 'In cirrhosis, what are the arteries that supply the gut doing?', options: ['Wide open, sending more blood to the liver', 'Normal', 'Constricted, sending less blood to the liver', 'Closed in the area of the varices'], answer: 0,
        why: 'Cirrhosis dilates the gut’s arteries, so inflow rises on top of the stiff liver.' },
      { sid: 'carvedilol', type: 'do', preset: 'csph', tools: ['select'], tab: 'scope', text: 'Start **carvedilol** and keep the other drugs off. Watch the Over time chart.', controls: ['drugs', 'drug:carvedilol', 'drug:propranolol', 'drug:terlipressin', 'drug:octreotide'],
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }],
        goal: (f, p) => p.drugs.carvedilol && !p.drugs.propranolol && !p.drugs.terlipressin && !p.drugs.octreotide },
      { sid: 'hvpg-response', type: 'observe', seconds: 8, tools: ['select'], tab: 'scope', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and liver',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg', pct: true }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }],
        text: 'Read the response on the chart: the gradient falls, the heart slows and the blood pressure dips a little. A fall of **20 % or more**, or to **12 or below**, counts as a response and goes with fewer bleeds. Carvedilol is usually started without measuring this.' },
      { sid: 'propranolol', type: 'observe', seconds: 8, preset: 'csph', params: { drugs: { propranolol: true, carvedilol: false, terlipressin: false, octreotide: false } }, tools: ['select'], tab: 'scope', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and liver',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }],
        text: 'Propranolol on the same patient: it lowers the pressure through slower inflow alone, and a little less than carvedilol.' },
      { type: 'explain', metric: 'hvpg', text: 'Cirrhosis opens the gut’s arteries, so more blood pours into a stiff liver. Beta blockers turn the inflow down. Carvedilol also relaxes the liver, which is why it is preferred.' },
      { type: 'check', quiz: [
        { q: 'A 58-year-old has compensated cirrhosis, a gradient of 14, no varices that have bled, and no asthma. What is the best next step?', options: ['Start carvedilol', 'Band ligation now', 'Place a TIPS', 'Observe and repeat the scope in 3 years'], answer: 0, why: 'With clinically significant portal hypertension, carvedilol lowers the risk of a first decompensation. Banding is for those who cannot take it.' },
        { q: 'On carvedilol, a patient’s gradient falls from 18 to 13 mmHg. How do you read it?', options: ['A response: it fell by more than 20 %', 'No response: it is still above 12', 'A response only if it falls below 5', 'The drug has failed and should be stopped'], answer: 0, why: 'A fall of 20 % or more from the start, or to 12 or below, is a response. 18 to 13 is a 28 % fall.' },
        { q: 'A man with decompensated cirrhosis and refractory ascites has a blood pressure of 88/52 on carvedilol. What do you do?', options: ['Reduce or stop the beta blocker', 'Double the dose to protect his varices', 'Add a second beta blocker', 'Continue unchanged because the pressure is expected'], answer: 0, why: 'Low blood pressure on a beta blocker puts the kidneys at risk. Reduce or stop it, and protect the varices with banding.' },
      ] },
    ],
  },
  {
    id: 'varices', title: 'Varices: where they form and why they bleed', minutes: 6, caseId: 'prevention',
    summary: 'Large varices with red signs and a sick liver bleed; bands remove the varix, lowering the pressure shrinks them.',
    pearls: ['Size, red signs and Child–Pugh class predict bleeding.', 'Bands treat the varix; drugs and treating the cause treat the pressure.', 'Varices grow and shrink with the gradient, over months.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'csph', tools: ['select', 'endoscope'], view: 'anatomic', zoom: 'fit', tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }],
        text: 'A 55-year-old with cirrhosis has a screening scope. Portal blood that cannot get through the stiff liver is rerouted through collateral veins, and the ones under the lining of the esophagus swell into **varices**. His are still thin. The dial reads the tension in the varix wall. Which varices go on to bleed?' },
      { sid: 'bleed-risk', type: 'predict', q: 'Which varix is most likely to bleed?', options: ['Small, flat, no red signs, mild liver disease', 'Large, red wale signs, advanced liver disease', 'Large, no red signs, mild liver disease', 'Small with red signs, mild liver disease'], answer: 1,
        why: 'Size, red signs and a sicker liver together carry the highest risk.' },
      { sid: 'grow', type: 'observe', preset: 'csph', lapse: { days: 180, speed: 15, ramp: { cirrhosis: [0.6, 0.85] } }, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1a', 'C1b', 'C3', 'C6'], focusLabel: 'Collateral veins',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'Time-lapse: six months while his liver scars further and the gradient climbs. Watch the scope: the varix grows, its wall thins, red marks appear, and the tension dial swings toward red.' },
      { sid: 'band', type: 'do', preset: 'cirr-decomp', tools: ['select', 'band', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        text: 'His varices are now large, with red signs. **Band** the esophageal varix and watch the endoscopy view and the pressure.',
        data: [{ label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'band') },
      { type: 'observe', seconds: 8, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'The banded varix is treated, yet the gradient behind it has not changed. New varices can form while it stays high.' },
      { sid: 'shrink', type: 'observe', preset: 'cirr-decomp', params: { cirrhosis: 0.85 }, lapse: { days: 360, speed: 30, ramp: { cirrhosis: [0.85, 0.5] } }, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1a', 'C1b'], focusLabel: 'Esophageal varices',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'Another patient, whose cause was removed: he stopped drinking. Time-lapse a year as his liver slowly softens. The gradient falls, and here the varices shrink with it. In real patients varices and collaterals can persist even once the gradient is below 10, so carvedilol is stopped only after that is confirmed.' },
      { type: 'explain', metric: 'varix', tools: ['select'], text: 'A big, thin-walled varix under high pressure is a balloon about to pop. Banding removes the balloon but does not lower the pressure that made it. Lowering the gradient, with a beta blocker or by treating the cause, takes the tension off the wall and keeps new varices from forming.' },
      { type: 'check', quiz: [
        { q: 'After a variceal bleed, a patient’s varices have been banded away. What still needs treatment?', options: ['The portal pressure, with a beta blocker', 'Nothing, banding cures portal hypertension', 'Repeat banding every week for life', 'The platelet count'], answer: 0, why: 'Bands remove the varix, not the pressure. After a bleed, a beta blocker is combined with banding to lower the pressure and stop new varices forming.' },
        { q: 'During endoscopy you see a varix that is 10 mm across with red wale signs in a Child–Pugh C patient. How do you read this?', options: ['High risk of bleeding: treat now', 'Low risk: observe', 'Risk depends only on bilirubin', 'A bleed is excluded if the stool is normal'], answer: 0, why: 'Large size, red signs and Child–Pugh C each raise the risk, and together they make bleeding likely.' },
      ] },
    ],
  },
  {
    id: 'ascites', title: 'Ascites: where the fluid comes from', minutes: 7, caseId: 'new-ascites',
    summary: 'Tap every new ascites: the gradient says portal hypertension and the protein says where the block is.',
    pearls: ['Tap every new ascites.', 'High SAAG means portal hypertension; protein tells you where.', 'A scarred sinusoid holds protein back; a congested, healthy one lets it through.', 'Give albumin with large taps; diuretics and salt restriction keep the fluid from returning.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'cirr-decomp', params: { diuretics: false }, afterDays: 300, tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'abdomen', focus: ['SIN_RR', 'IVC_IS'], focusLabel: 'Liver and abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }],
        text: 'A man with cirrhosis has a swollen belly: about 4 litres of new ascites (below). Fluid leaks from congested vessels faster than the lymph can drain it.' },
      { sid: 'tap', type: 'predict', q: 'What is the one test you always do in a patient with new ascites?', options: ['A diagnostic tap of the fluid', 'A CT of the abdomen', 'An albumin infusion', 'A trial of diuretics, then reassess'], answer: 0,
        why: 'The fluid tells you whether the pressure is portal, and where the block lies.' },
      { sid: 'sinusoid-scarred', type: 'observe', seconds: 10, preset: 'cirr-decomp', tools: ['select'], zoom: 'lobule', sinusoid: true,
        text: 'Inside one sinusoid of his liver. Normally its lining is full of pores, and albumin passes freely into the space around it. Scar has sealed most of them: water still seeps out, but albumin (amber) is turned back at the wall. So the fluid that reaches his belly is **low in protein**.' },
      { type: 'predict', q: 'A woman has Budd–Chiari: her hepatic veins are blocked, but her liver is not scarred. Will her ascites be high or low in protein?', options: ['High: the open pores let albumin through', 'Low, like cirrhosis', 'There is no ascites when the veins are blocked', 'It has no protein at all'], answer: 0,
        why: 'Congestion drives fluid out of sinusoids whose pores are still open, and albumin goes with it.' },
      { sid: 'sinusoid-outflow', type: 'observe', seconds: 10, preset: 'budd-chiari', tools: ['select'], zoom: 'lobule', sinusoid: true,
        text: 'Her sinusoid: congested from the blocked outflow, with its pores still open. Water and albumin pour into the space around it, so her ascites is **rich in protein**. Heart failure looks the same from here.' },
      { sid: 'read-fluid', type: 'frame', preset: 'cirr-decomp', tools: ['select'], zoom: 'fit', tab: 'abdomen', fluids: ['cirr-decomp', 'budd-chiari', 'rhf'],
        text: 'Read the tap in two steps. The **SAAG** compares albumin in the blood with albumin in the fluid: a gap of 1.1 g/dL or more means portal hypertension, as in all three patients below. Then the **protein** says where: low (under 2.5 g/dL) in cirrhosis, high when the block is after the liver or at the heart.' },
      { sid: 'drain', type: 'do', preset: 'cirr-decomp', params: { diuretics: false }, afterDays: 300, tools: ['select', 'needle'], tab: 'abdomen', focus: ['IVC_IS'], focusLabel: 'Abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Back to the man with cirrhosis. Remove **5 litres** with albumin (**Drain**, albumin on). Watch the belly and the pressure.',
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'paracentesis'), hint: 'The volume removed is the smaller of 5 L and the fluid present.' },
      { type: 'observe', days: 90, tools: ['select'], zoom: 'fit', tab: 'abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Three months later, without diuretics, the fluid has come back. The tap relieved the belly but not the liver.' },
      { type: 'explain', metric: 'ascites', text: 'Draining fluid relieves the belly but does not treat the liver’s resistance. Diuretics and salt restriction keep the fluid from returning, and albumin protects the kidneys during large taps.' },
      { type: 'check', quiz: [
        { q: 'A patient has a SAAG of 1.6, ascitic protein of 3.2 g/dL and a raised JVP. What is the next test?', options: ['An echocardiogram', 'A repeat tap with cultures', 'A CT of the liver', 'A liver biopsy'], answer: 0, why: 'High SAAG with high protein means the block is after the liver. A raised JVP points to the heart.' },
        { q: 'Why is ascitic protein low in cirrhosis?', options: ['Scarred sinusoids hold albumin back', 'The liver makes no albumin at all', 'Diuretics remove the protein', 'The fluid comes from the bowel'], answer: 0, why: 'Scar seals the pores of the sinusoid lining, so water leaks out but albumin stays in the blood.' },
        { q: 'A patient with cirrhosis has 6 litres of ascites tapped, with no albumin. What is the main risk?', options: ['Kidney injury from the fluid shift', 'The fluid never returns', 'Immediate variceal bleeding', 'Low sodium from the diuretics'], answer: 0, why: 'Taking off more than 5 L without albumin can drop the circulating volume and injure the kidneys.' },
      ] },
    ],
  },
  {
    id: 'doppler-report', title: 'Reading the Doppler report', minutes: 5, caseId: 'hepatofugal',
    summary: 'Direction of portal flow, the Invert button and a pulsatile portal vein, each read in the right vessel.',
    pearls: ['Flow away from the liver means advanced disease.', 'Color is not direction.', 'Pulsatile portal flow: look at the heart.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'cirr-decomp', tools: ['select', 'doppler'], view: 'anatomic', zoom: 'fit', tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal vein',
        text: 'The ultrasound report says “hepatofugal portal flow”. What does it mean, and should you worry? **Hepatopetal** is toward the liver, as in health. **Hepatofugal** is away from it.' },
      { type: 'predict', mode: 'direction', edge: 'PV_TRUNK', preset: 'cirr-hepatofugal', q: 'In end-stage cirrhosis, in which direction can the portal vein flow: toward the liver or away from it?' },
      { sid: 'hepatofugal', type: 'do', preset: 'cirr-hepatofugal', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', dye: 'PV_TRUNK', dyeLabel: 'Inject dye into the portal vein', focus: ['PV_TRUNK', 'C6', 'AP_R', 'AP_L'], focusLabel: 'Portal vein and the routes that drain it',
        data: [{ label: 'Portal vein flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'This patient has very advanced disease. See it with dye: **inject dye into the portal vein** and watch which way it goes, while the Doppler traces the same vessel.',
        after: 'The dye runs out of the liver and away into the collaterals: blood finds an easier exit than the stiff liver. The negative flow on the card is the same thing in numbers.', stay: true, goal: (f, p, log, s) => s.dyed },
      { sid: 'invert', type: 'do', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', text: 'Tap **Invert** once. The colors swap sides.',
        goal: (f, p, log) => log.some((a) => a.type === 'invert'), hint: 'The Invert button is on the Doppler pane.' },
      { type: 'observe', seconds: 8, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal vein',
        data: [{ label: 'Portal vein flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'The blood did not change direction. Read the direction from the report and the anatomy, never from the color.' },
      { sid: 'pulsatile', type: 'observe', seconds: 12, preset: 'rhf', params: { pulsatile: true }, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK', 'RHV_IVC'], focusLabel: 'Portal vein',
        text: 'A different patient, with a failing right heart and a leaking tricuspid valve. The portal vein now pulses with every heartbeat.' },
      { type: 'explain', metric: 'pvFlow', text: 'Away from the liver means advanced disease, with a risk of portal vein clot. A pulsatile portal vein is a heart clue. Always name the vessel you are describing.' },
      { type: 'check', quiz: [
        { q: 'After a TIPS, the left portal branch flows away from the liver. What does this mean?', options: ['Expected: the flow is heading toward the shunt', 'The shunt has failed', 'The main portal vein has reversed', 'The patient has a new clot'], answer: 0, why: 'Blood heads to the low-pressure shunt, so the branches beside it can reverse. That is expected, not failure.' },
        { q: 'The report calls the portal vein flow hepatofugal and the spectrum appears below the baseline. A colleague says the Doppler is simply inverted. What do you do?', options: ['Check the vessel, probe angle and Invert setting', 'Treat it as reversed flow and act on it', 'Ignore the report: color is unreliable', 'Repeat the scan only if there is ascites'], answer: 0, why: 'Above or below the baseline depends on the probe angle and the Invert setting. Direction comes from the vessel and the anatomy.' },
      ] },
    ],
  },
  {
    id: 'left-sided', title: 'Left-sided portal hypertension', minutes: 5, caseId: 'gastric',
    summary: 'A blocked splenic vein raises pressure in the spleen’s territory alone, and TIPS does not help.',
    pearls: ['Isolated gastric varices with a normal liver: think splenic vein.', 'Pancreatitis and pancreatic tumors are the usual causes.', 'TIPS does not fix it; treatment at the spleen does.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'healthy', tools: ['select'], view: 'circuit', zoom: 'fit', focus: ['SV_CONF', 'C2', 'PV_TRUNK'], focusLabel: 'Splenic vein, gastric veins, portal vein',
        text: 'A 52-year-old with past pancreatitis has gastric varices, a big spleen and a normal liver. In the Circuit view, find the splenic vein: it runs from the spleen behind the pancreas to join the portal vein. Where is the block?' },
      { type: 'predict', q: 'Where is the block most likely to be?', options: ['In the splenic vein', 'In the main portal vein', 'Inside the liver', 'In the heart'], answer: 0,
        why: 'The spleen is enlarged and the liver is normal, which points to the vein that drains the spleen.' },
      { sid: 'clot', type: 'do', preset: 'healthy', tools: ['select', 'thrombus'], view: 'circuit', focus: ['SV_CONF'], focusLabel: 'Splenic vein', text: 'Put a **clot in the splenic vein** that blocks it completely.',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Main portal vein', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.99, hint: 'Tap the splenic vein on the figure, then drag Clot to 100 %.' },
      { sid: 'fundal', type: 'observe', seconds: 8, preset: 'svt', tools: ['select'], view: 'circuit', focus: ['C2', 'C5', 'SV_CONF'], focusLabel: 'Gastric veins',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Main portal vein', metric: 'pv', unit: 'mmHg' }, { label: 'Gastric varix', metric: (m) => m.gastricVarix?.d, fmt: (d) => `${Math.round(d)} mm` }],
        text: 'Months later, the spleen drains through the short gastric veins in the stomach wall, so varices fill in the gastric fundus. The pressure in the main portal vein stays normal.' },
      { type: 'predict', q: 'She bleeds from the fundal varices. Will a TIPS lower the pressure in them?', options: ['No: the main portal vein is not under pressure', 'Yes: TIPS lowers all portal pressures', 'Yes, but only an 8 mm stent', 'Only if the liver is also scarred'], answer: 0,
        why: 'TIPS drains the main portal vein into the hepatic vein. The high pressure sits upstream, on the spleen’s side of the clot.' },
      { sid: 'tips', type: 'do', preset: 'svt', tools: ['select'], view: 'circuit', controls: ['tips'], focus: ['C2', 'SV_CONF'], focusLabel: 'Gastric veins and splenic vein',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Gastric varix', metric: (m) => m.gastricVarix?.d, fmt: (d) => `${Math.round(d)} mm` }],
        text: 'Switch on a **TIPS** and watch the spleen side and the fundal varix.', stay: true, goal: (f, p) => p.tips.on,
        after: 'Almost nothing changes. The shunt drains a portal vein that was never under pressure.' },
      { sid: 'embolize', type: 'do', preset: 'svt', tools: ['select'], view: 'circuit', controls: ['splenicRx'], focus: ['SV_CONF', 'C2'], focusLabel: 'Splenic vein and gastric veins',
        data: [{ label: 'Spleen side', metric: 'sv', unit: 'mmHg' }, { label: 'Gastric varix', metric: (m) => m.gastricVarix?.d, fmt: (d) => `${Math.round(d)} mm` }],
        text: 'Now treat the spleen instead: set **partial embolization** of the splenic artery.', stay: true, goal: (f, p) => p.splenicRx >= 1,
        after: 'Less arterial blood enters the spleen, so less has to escape through the stomach wall: the spleen-side pressure falls and the fundal varix shrinks.' },
      { type: 'explain', metric: 'pv', text: 'Only the spleen’s side is under pressure. TIPS will not help, because the main portal vein is not under pressure. The fix is at the spleen, with splenic artery embolization or splenectomy, and is needed only if the varices bleed; endoscopic glue can control the bleed itself.' },
      { type: 'check', quiz: [
        { q: 'A patient has isolated gastric varices and normal liver tests. Which imaging do you order first?', options: ['A contrast CT to look at the splenic vein', 'A liver biopsy', 'Hepatic venous pressure measurement', 'A repeat scope in 3 months'], answer: 0, why: 'A contrast CT shows the splenic vein, and a clot there explains varices in the stomach with a healthy liver.' },
        { q: 'A patient with splenic vein thrombosis bleeds from gastric varices. Which treatment is least likely to help?', options: ['TIPS', 'Splenectomy', 'Splenic artery embolization', 'Endoscopic glue'], answer: 0, why: 'TIPS lowers pressure in the main portal vein, which is already normal. The problem is on the spleen’s side.' },
      ] },
    ],
  },
  {
    id: 'toolbox', title: 'The toolbox: what each treatment fixes and costs', minutes: 7, caseId: 'post-tips',
    summary: 'Bands treat the varix, drugs treat inflow, TIPS bypasses the liver, and closing a route has its own price.',
    pearls: ['Each tool treats a different part of the problem.', 'TIPS lowers the gradient most, but sends blood past the liver and onto the heart.', 'Check the heart, the brain and the bilirubin before TIPS.'],
    steps: [
      { sid: 'intro', type: 'frame', preset: 'cirr-decomp', record: 'base', tools: ['select', 'stent'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['PVH_R', 'RHV_IVC', 'C1b'], focusLabel: 'Portal vein, hepatic vein, varices',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'A patient with decompensated cirrhosis has varices and ascites. You will treat him twice, two different ways, and compare. Note the starting numbers.' },
      { type: 'predict', q: 'After a TIPS, what happens to blood flow through the liver?', options: ['It falls', 'It rises', 'It stays the same', 'It reverses'], answer: 0,
        why: 'The shunt gives blood an easier way back to the heart, so less goes through the liver.' },
      { sid: 'tips', type: 'do', preset: 'cirr-decomp', tools: ['select', 'stent'], focus: ['PVH_R', 'RHV_IVC'], focusLabel: 'Portal vein to hepatic vein', text: 'First way: create a **TIPS** between the right portal vein and the right hepatic vein, 8 mm wide. Compare the gradient, the blood reaching the liver, and the load on the heart.',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        goal: (f, p) => p.tips.on && Math.abs(p.tips.d - 8) <= 0.1, hint: 'Tap the right portal vein, choose Create shunt, tap the right hepatic vein, then set the diameter.' },
      { type: 'observe', seconds: 8, record: 'tips', tools: ['select'], tab: 'profile', focus: ['TIPS', 'PVH_R', 'RHV_IVC'], focusLabel: 'The new shunt',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'The gradient falls, but less blood goes through the liver and more returns to the heart. This is why TIPS can cause encephalopathy or heart strain.' },
      { sid: 'drugs-bands', type: 'do', preset: 'cirr-decomp', tools: ['select', 'band', 'endoscope'], tab: 'endoscopy', controls: ['drugs', 'drug:carvedilol'], focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }],
        text: 'Second way, same patient from the start: turn on **carvedilol** and **band** the esophageal varix.',
        goal: (f, p, log) => p.drugs.carvedilol && log.some((a) => a.type === 'action' && a.target === 'band'), hint: 'Carvedilol is in the card; the band tool is in the toolbar.' },
      { type: 'observe', seconds: 8, record: 'drugs', tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'PPG (portal vein − IVC)', metric: 'ppg', unit: 'mmHg' }, { label: 'Blood to the liver', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Blood pressure', metric: 'map', d: 0, unit: 'mmHg' }],
        text: 'The gradient falls less, the varix is gone, and the liver keeps its blood. The price is a little blood pressure.' },
      { sid: 'compare', type: 'frame', preset: 'cirr-decomp', tools: ['select'], tab: 'profile', compare: [['Before', 'base'], ['TIPS', 'tips'], ['Carvedilol + bands', 'drugs']],
        text: 'Side by side: what each way fixed, and what it cost.' },
      { sid: 'brto', type: 'frame', preset: 'gastric-varix', tools: ['select', 'occlude'], tab: 'profile', focus: ['C2', 'C5', 'PV_TRUNK'], focusLabel: 'Gastric varices and their draining shunt',
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
  frame: ['book', 'Context'], predict: ['bulb', 'Predict'], do: ['tools', 'Your turn'], observe: ['explore', 'Observe'], explain: ['bulb', 'Explain'], check: ['check', 'Check'], route: ['route', 'Level'], stem: ['bulb', 'Question'], keypoints: ['check', 'Key points'],
};
// Lesson steps name locked-control keys; these are the matching controls to embed in the card.
const INLINE = { cirrhosis: 'cirrhosis', splanchnicTone: 'splanchnicTone', 'drug:propranolol': 'drug:propranolol', 'drug:terlipressin': 'drug:terlipressin', 'drug:octreotide': 'drug:octreotide', 'drug:carvedilol': 'drug:carvedilol', apShunt: 'apShunt', spontaneous: 'srShunt', diuretics: 'diuretics', brto: 'brto', tips: 'tips', splenicRx: 'splenicRx' };

export function createLearn({ host: hostEl, coach, stage, panel, dock, inspector, beginSession, endSession, onEnd, onUnitEnd, loadPreset, action, setTool, setAllowedTools, showPane, setProbe, openPanel, setBanner, startCase }) {
  let lesson = null, idx = 0, state = {}, recs = {};   // recs: numbers saved by `record` steps, for a `compare` step
  // The step card never covers the figure. Where the side panel sits beside the figure (wide
  // screens) it heads the panel; below that it is a bottom sheet under the figure, which gives up
  // its own height to it.
  const asSheet = matchMedia('(max-width: 1279px)'), asPhone = matchMedia('(max-width: 767px)');
  const liftOver = (card) => {
    const wrap = document.getElementById('stageView')?.getBoundingClientRect(), q = card?.getBoundingClientRect();
    const px = card && wrap && q.height ? `${Math.round(wrap.bottom - q.top + 8)}px` : '';
    for (const b of document.querySelectorAll('.stage-credit, .zoom-pill, .stage-clock')) b.style.setProperty('--sheet-h', px);
  };
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
    const cells = items.map((it) => h('span', { class: 'dr-v' + (it.dial ? ' dr-dial' : '') }, '—'));
    const show = (it, v) => (v == null ? '—' : it.fmt ? it.fmt(v) : `${fmt(v, it.d ?? 1)} ${it.unit || ''}`.trim());
    // On a step where something happens (do, observe), each number also says where it started, so the
    // change is read off the card instead of remembered.
    const st = lesson.steps[idx], base = (st.type === 'do' || st.type === 'observe') ? (state.base ||= {}) : null;
    const upd = () => {
      const m = store.get().frame?.metrics; if (!m) return;
      items.forEach((it, i) => {
        const v = val(it, m), now = show(it, v);
        if (it.dial) { paintDial(cells[i], v); return; }
        if (base && v != null && !(it.label in base)) base[it.label] = v;
        const b = base?.[it.label], was = b == null ? now : show(it, b);
        const moved = was !== now && (typeof v !== 'number' || it.fmt || Math.abs(v - b) >= Math.max(0.5, 0.05 * Math.abs(b)));
        const pct = it.pct && b ? ` ${Math.round((Math.abs(v - b) / Math.abs(b)) * 100)} %,` : '';
        cells[i].replaceChildren(now, moved ? h('small', { class: 'dr-was' }, `${v > b ? '↑' : '↓'}${pct} from ${was}`) : '');
      });
    };
    clearInterval(dataTimer); upd(); dataTimer = setInterval(upd, 400);
    return h('dl', { class: 'kv data-row', 'aria-live': 'off' }, items.flatMap((it, i) => [h('dt', {}, it.label), h('dd', {}, cells[i])]));
  }

  // Varix wall tension as a dial: the needle eases between readings (0 to 150 % of the rupture stress).
  const DIAL_ZONES = [[0, 0.6, 'ok'], [0.6, 1, 'mid'], [1, 1.5, 'hi']];
  function paintDial(cell, r) {
    const k = Math.max(0, Math.min(1, (r ?? 0) / 1.5)), word = r == null ? '—' : r < 0.6 ? 'Low' : r < 1 ? 'Moderate' : 'High';
    const arc = (a, b) => { const p = (t) => [50 - 40 * Math.cos(Math.PI * t), 46 - 40 * Math.sin(Math.PI * t)]; const [x0, y0] = p(a / 1.5), [x1, y1] = p(b / 1.5); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A40 40 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    let svg = cell.querySelector('svg');
    if (!svg) {
      cell.innerHTML = `<svg viewBox="0 0 100 54" aria-hidden="true">${DIAL_ZONES.map(([a, b, c]) => `<path class="dz-${c}" d="${arc(a, b)}"/>`).join('')}<line class="dn" x1="50" y1="46" x2="50" y2="12"/><circle cx="50" cy="46" r="3.5"/></svg><b></b>`;
      svg = cell.querySelector('svg');
    }
    svg.querySelector('.dn').style.transform = `rotate(${(k * 180 - 90).toFixed(1)}deg)`;
    cell.querySelector('b').textContent = word;
    cell.dataset.level = r == null ? '' : r < 0.6 ? 'ok' : r < 1 ? 'mid' : 'hi';
  }
  // Ascitic fluid for several patients side by side (the model's own values), read without an equation.
  function fluidTable(ids) {
    const row = (id) => { const f = SNAPSHOTS[id]?.fp; if (!f) return null;
      const name = store.get().presetList?.find((p) => p.id === id)?.label || id;
      return h('tr', {}, h('th', {}, name), h('td', { class: f.saag >= 1.1 ? 'hi' : 'ok' }, `${fmt(f.saag, 1)}`, h('small', {}, f.saag >= 1.1 ? 'portal' : 'not portal')), h('td', { class: f.tp >= 2.5 ? 'hi' : 'lo' }, `${fmt(f.tp, 1)}`, h('small', {}, f.tp >= 2.5 ? 'high' : 'low'))); };
    return h('table', { class: 'fluid-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Patient'), h('th', {}, 'SAAG g/dL'), h('th', {}, 'Protein g/dL'))), h('tbody', {}, ids.map(row)));
  }
  const endLapse = () => { if (store.get().lapse) { store.set({ lapse: 0 }); host.send({ type: 'run', running: true, speed: 1, clock: 'hemo' }); } };
  // A time-lapse: the disease clock runs fast while the step eases its params from one value to the next.
  function runLapse(st) {
    const { days, speed = 15, ramp = {} } = st.lapse, f0 = store.get().frame, d0 = f0?.day ?? 0;
    store.set({ lapse: speed });
    host.send({ type: 'run', running: true, speed, clock: 'disease' });
    let lastK = -1;
    pollTimer = setInterval(() => {
      if (lesson?.steps[idx] !== st) { clearInterval(pollTimer); return; }
      const d = store.get().frame?.day ?? d0, k = Math.min(1, Math.max(0, (d - d0) / days));
      if (k - lastK >= 0.04 || (k >= 1 && lastK < 1)) {
        lastK = k;
        const patch = Object.fromEntries(Object.entries(ramp).map(([key, [a, b]]) => [key, a + (b - a) * k]));
        if (Object.keys(patch).length) updateParams(patch, { history: false });
      }
      const month = Math.floor((d - d0) / 30);
      state.lapseDays = Math.round(d - d0);
      if (month !== state.lapseMonth) { state.lapseMonth = month; render(); }
      if (k >= 1) {
        clearInterval(pollTimer); endLapse();
        state.observed = true; render();
      }
    }, 250);
  }

  // A step's numbers, kept for a later side-by-side comparison of treatments.
  const recordNow = (st) => { const m = store.get().frame?.metrics; if (st.record && m) recs[st.record] = { ppg: m.ppg, liver: m.hepaticFlow, ra: m.ra, varix: m.varix.ratio, map: m.map }; };
  const CMP_ROWS = [['Gradient (PPG), mmHg', 'ppg', (v) => fmt(v, 1), 'Lower is the aim'], ['Blood to the liver, L/min', 'liver', (v) => fmt(v, 2), 'Less risks encephalopathy'],
    ['Right atrium, mmHg', 'ra', (v) => fmt(v, 1), 'Higher loads the heart'], ['Varix wall tension', 'varix', (v) => (v < 0.6 ? 'Low' : v < 1 ? 'Moderate' : 'High'), ''], ['Blood pressure, mmHg', 'map', (v) => fmt(v, 0), '']];
  function compareTable(cols) {
    const have = cols.filter(([, k]) => recs[k]);
    if (have.length < 2) return h('p', { class: 'ctl-sub' }, 'Treat the patient both ways first (the steps before this one) to fill in the comparison.');
    return h('table', { class: 'fluid-table cmp-table' }, h('thead', {}, h('tr', {}, h('th', {}), have.map(([t]) => h('th', {}, t)))),
      h('tbody', {}, CMP_ROWS.map(([label, k, f, note]) => h('tr', {}, h('th', {}, label, note ? h('small', {}, note) : null), have.map(([, key]) => h('td', {}, f(recs[key][k])))))));
  }

  function openList() { render(); }

  async function start(id, step) {
    const found = LESSONS.find((l) => l.id === id) || UNITS.find((u) => u.id === id);
    if (!found) { toast(`No lesson called “${id}”.`, 'bad'); return; }
    await beginSession?.(found.unit ? 'unit' : 'lesson');
    lesson = found;
    if (lesson.unit && step == null && course.resumeAt(id)) step = String(course.resumeAt(id) + 1);
    // A deep link may open on a step: by its stable id, or its number (1-based).
    const at = step == null ? -1 : lesson.steps.findIndex((s0) => s0.sid === step);
    recs = {};
    idx = at >= 0 ? at : /^\d+$/.test(step || '') ? Math.min(lesson.steps.length - 1, Math.max(0, +step - 1)) : 0; state = {}; perms = {}; snaps.length = 0; answers = createAnswerSheet(); t0 = Date.now();
    unbindKeys?.(); unbindKeys = bindQuestionKeys(() => cardEl);
    sheetMin = false;
    if (lesson.unit) setUnitSurface(true);
    await enter({ deep: idx > 0 });
    if (!asSheet.matches && !lesson.unit) openPanel?.('chart');
    panel.scrollTop = 0;
  }
  function stop() {
    const unit = lesson?.unit ? lesson : null;
    if (unit && !finishing) course.saveStep(unit.id, idx);
    finishing = false;
    lesson = null;
    if (unit) setUnitSurface(false);
    mirror?.el.remove(); mirror = null; blindOff(); unbindKeys?.(); unbindKeys = null; cardEl = null;
    coach?.replaceChildren(); if (coach) coach.dataset.safe = 'top'; liftOver(null);
    clearInterval(pollTimer); clearInterval(dataTimer); endLapse();
    store.set({ locked: null, hiddenReadouts: null });
    setAllowedTools(null);
    dock.profile.clearPredict();
    store.set({ focus: null });
    setBanner?.(null);
    render();
    endSession?.(unit ? 'unit' : 'lesson', { keep: !!exploreAfter });
    onEnd?.();
    if (unit) onUnitEnd?.(unit, { explore: exploreAfter, practice: practiceNext });
    exploreAfter = null; practiceNext = false;
  }
  let finishing = false, exploreAfter = null, practiceNext = false;   // practiceNext: the unit closes into its optional practice

  async function enter({ replay = false, deep = false } = {}) {
    const st = lesson.steps[idx];
    // A deep link into a step that builds on the ones before it starts from their patient.
    let src = st;
    if (deep && !st.preset) for (let k = idx - 1; k >= 0; k--) if (lesson.steps[k].preset) { src = lesson.steps[k]; break; }
    clearInterval(pollTimer); clearInterval(dataTimer); endLapse();
    mirror?.el.remove(); mirror = null; blindOff();
    // An observe step that watches the result of the step before it keeps that step's starting numbers.
    const carry = st.type === 'observe' && !st.preset && lesson.steps[idx - 1]?.type === 'do' ? { ...(state.base || {}) } : undefined;
    state = { answered: null, quizAns: {}, observed: false, met: false, base: carry };
    // One executor for the whole step state (sequence.js): reset → patch → settle → snapshot, then
    // the step is exposed. The snapshot Replay returns to is taken after the worker acknowledged
    // the patch, so it carries the patch with it.
    const seq = await runSequence({ preset: src.preset, presetDays: src.presetDays, params: src === st ? st.params : { ...src.params, ...st.params }, days: src.afterDays, label: st.title }, { loadPreset, action }, { reset: !replay });
    if (!lesson || lesson.steps[idx] !== st) return;
    if (!replay) snaps[idx] = { snap: seq.snap, params: seq.params };
    state.logStart = store.get().actionLog?.length || 0;
    if (st.tools) setAllowedTools(st.tools);
    if (st.hide) store.set({ hiddenReadouts: new Set(st.hide) });
    store.set({ locked: new Set(st.controls || ['*']) });
    if (st.layers) store.set({ layers: { ...store.get().layers, ...st.layers } });
    if (st.view && st.view !== store.get().view) store.set({ view: st.view });
    if (st.zoom) store.set({ lobule: st.zoom === 'lobule', sinusoid: st.zoom === 'lobule' && !!st.sinusoid });
    if (st.lobuleLayers) store.set({ lobuleLayers: { ...store.get().lobuleLayers, ...st.lobuleLayers } });
    // One surface: a question never has an instrument open beside it, unless the student has to draw on one.
    const asking = (st.type === 'predict' && st.mode !== 'draw') || st.type === 'check' || st.type === 'route' || st.type === 'stem';
    if (lesson.unit) { setUnitSurface(true, { try: st.type === 'do' }); course.saveStep(lesson.id, idx); }
    if (asking) dock.close?.(); else if (st.tab) showPane(st.tab);
    // A unit shows an instrument only on a step that names one.
    if (lesson.unit && !asking && !st.tab && !st.endo) dock.close?.();
    // The figure glides into the space the closed (or opened) instrument leaves.
    setTimeout(() => { if (lesson?.steps[idx] === st) stage?.refit?.(); }, 380);
    if (st.blind ?? ((st.type === 'predict' && st.mode !== 'draw') || st.type === 'route' || st.type === 'stem')) blindOn();
    if (st.type === 'route') state.route = createRoute({ onPick: (id) => pickRoute(st, id) });
    if (st.path) dock.profile.setPath(st.path);
    if (st.probe) setProbe(st.probe);
    if (st.invert != null) dock.pane('doppler')?.setInvert?.(st.invert);
    if (st.endo) { showPane('endoscopy'); dock.pane('endoscopy')?.setView?.(st.endo); }
    store.set({ focus: st.focus ? { edges: st.focus, label: st.focusLabel } : null });
    if (st.type === 'predict' || st.type === 'frame' || st.type === 'check' || st.type === 'route' || st.type === 'stem' || st.type === 'keypoints') host.send({ type: 'run', running: st.type === 'frame' });
    if (st.type === 'predict' && st.mode === 'draw') { dock.profile.startPredict(() => render()); showPane('profile'); }
    if (st.type === 'predict' && st.mode === 'direction') setTimeout(() => showMirror(st), 120);
    if (st.type === 'do') {
      host.send({ type: 'run', running: true });
      pollTimer = setInterval(() => {
        const f = store.get().frame;
        if (f && st.goal(f, store.get().params, (store.get().actionLog || []).slice(state.logStart), state)) {
          state.met = true; clearInterval(pollTimer); render();
          if (!st.stay) setTimeout(() => { if (lesson && lesson.steps[idx] === st) next(); }, 1100);
        }
      }, 300);
    }
    if (st.type === 'observe') {
      host.send({ type: 'run', running: true, clock: 'hemo' });
      if (st.reveal) dock.profile.endPredict(true);
      if (st.lapse) runLapse(st);
      else if (st.days) { host.send({ type: 'advance', days: st.days }); state.observed = true; }
      else setTimeout(() => { if (lesson?.steps[idx] === st) { state.observed = true; recordNow(st); render(); } }, st.seconds * 1000);
    }
    if (st.type === 'frame' && st.record) setTimeout(() => { if (lesson?.steps[idx] === st) recordNow(st); }, 1500);
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
    if (st.type === 'stem' && state.answered != null) answers.record(key('stem'), state.answered === st.answer);
    if (st.type === 'check') st.quiz.forEach((qq, qi) => { if (state.quizAns[qi] != null) answers.record(key(`q${qi + 1}`), state.quizAns[qi] === qq.answer); });
    if (idx < lesson.steps.length - 1) { idx++; enter(); panel.scrollTop = 0; }
    else finish();
  }
  function finish(opts) {
    {
      exploreAfter = opts?.explore || null;
      const { score, right, total, mastered } = answers.score();
      if (lesson.unit) { course.complete(lesson.id, score); finishing = true; }
      saved[lesson.id] = { score: Math.max(score, saved[lesson.id]?.score || 0), date: new Date().toISOString() }; save();
      addRecord({ kind: 'lesson', id: lesson.id, title: lesson.title, score, assessment: ASSESSMENT_VERSION, contentVersion: CONTENT_VERSION, completed: true, mastered, wallDuration: (Date.now() - t0) / 1000, duration: (Date.now() - t0) / 1000, met: right, total,
        answers: answers.entries().map(([k, ok]) => `${k}: ${ok ? 'correct' : 'incorrect'}`) });
      toast(`${lesson.unit ? `Unit ${lesson.unit} complete` : 'Lesson complete'}: ${lesson.title} · ${score} %${mastered ? ' · mastered' : ` · mastery is ${MASTERY} %`}`); stop();
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
  // The route game: the pick is scored, the strip shows the true level, and only then does the
  // patient appear on the figure (it would give the level away before).
  async function pickRoute(st, id) {
    if (state.answered != null) return;
    state.answered = id;
    answers.record(`lesson:${lesson.id}:step-${String(idx + 1).padStart(2, '0')}:level`, id === st.site);
    state.route.reveal(st.site);
    const fp = SNAPSHOTS[st.patient]?.fp;
    if (fp) state.ladder = ladder(fp, { base: SNAPSHOTS.healthy.fp, reveal: true });
    blindOff(); render();
    requestAnimationFrame(() => {   // only the card scrolls, never the page under it
      const fb = cardEl?.querySelector('.feedback'), box = cardEl?.closest('.coach, .panel-page, #panelChart') || cardEl?.parentElement;
      if (fb && box) box.scrollTo({ top: Math.max(0, fb.offsetTop - 12), behavior: 'smooth' });
    });
    await runSequence({ preset: st.patient }, { loadPreset, action }, { reset: true });
    if (!lesson || lesson.steps[idx] !== st) return;
    store.set({ focus: st.focus ? { edges: st.focus, label: st.focusLabel } : null });
    host.send({ type: 'run', running: true });
  }
  function injectDye(st) {
    stage?.injectDye?.(st.dye);
    state.dyeing = true; render();
    // The goal is met once the dye has had time to travel, so the explanation follows what was seen.
    setTimeout(() => { if (lesson?.steps[idx] === st) { state.dyed = true; state.dyeing = false; render(); } }, 3500);
  }
  const flowSign = (id) => { const f = store.get().frame; const q = f ? (f.Qf || f.Q)[EI[id]] : 0; return q >= 0 ? 1 : -1; };

  const plain = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  function bannerText(st) {
    if (st.type === 'predict') return st.q ? plain(st.q) : 'Draw your prediction on the pressure profile';
    if (st.type === 'do') return state.met ? 'Done: moving on' : plain(st.text);
    if (st.type === 'observe') return state.observed ? 'Now read what changed on the figure' : plain(st.text).split('. ')[0];
    if (st.type === 'explain') return `Why? ${lesson.title}`;
    if (st.type === 'check') return 'Check your understanding in the panel';
    if (st.type === 'route') return state.answered == null ? 'Where is the block?' : 'See where the pressure drops';
    return lesson.title;
  }
  const md = (t) => { const span = h('span'); span.innerHTML = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); return span; };
  

  function render() {
    inline?.dispose?.(); inline = null;
    const inLearn = store.get().mode === 'learn';
    if (!inLearn || !lesson) { hostEl.replaceChildren(); coach?.replaceChildren(); return; }
    const st = lesson.steps[idx];
    const body = [];
    if (idx === 0 && !lesson.unit) body.push(trustLine());
    if (st.text) body.push(h('p', {}, md(st.text)));
    if (st.type === 'keypoints') body.push(h('div', { class: 'pearls keypoints' }, h('p', { class: 'step-label' }, 'Key points'), h('ul', {}, (lesson.keyPoints || []).map((t) => h('li', {}, t)))), exploreButton(lesson, finish));
    if (st.data && !isBlind()) body.push(dataRow(st.data), teachChip());
    // A Watch step's pressure ladder (`ladder`: a preset, or true for the step's own), against the healthy one.
    // Built once per step so it eases in once, not on every redraw.
    if (st.ladder && !isBlind()) {
      const fp = SNAPSHOTS[st.ladder === true ? st.preset : st.ladder]?.fp;
      if (fp) {
        state.stepLadder ||= h('div', { class: 'step-ladder' }, h('div', { class: 'tour-sub' }, 'Pressure along the way', h('span', {}, h('i', { class: 'lg-now' }), 'This patient', h('i', { class: 'lg-base' }), 'Healthy')),
          ladder(fp, { base: SNAPSHOTS.healthy.fp, reveal: true }));
        body.push(state.stepLadder);
      }
    }
    if (st.fluids) body.push(fluidTable(st.fluids));
    if (st.compare) body.push(compareTable(st.compare));
    let canNext = true, asking = false;
    if (st.type === 'stem') {
      canNext = state.answered != null;   // not q-active: the vignette stays in view with its question
      body.push(h('p', { class: 'stem-v' }, md(st.stem)), h('p', { class: 'q' }, st.q));
      body.push(optionList({ options: st.options, picked: state.answered, answer: st.answer, reveal: state.answered != null, locked: state.answered != null, notes: st.explain,
        onPick: (i) => { state.answered = i; blindOff(); render(); requestAnimationFrame(() => cardEl?.querySelector('.opt.sel, .opt.wrong')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); } }));
      if (state.answered != null) body.push(h('div', { class: 'feedback ' + (state.answered === st.answer ? 'right' : 'wrong'), role: 'status' }, h('b', {}, state.answered === st.answer ? 'Correct. ' : `Not quite: the answer is ${'ABCDE'[st.answer]}. `), st.explain?.[st.answer] || ''));
    }
    if (st.type === 'predict' && !st.mode) {
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null; asking = !canNext;
      body.push(shuffledList(`${idx}`, { options: st.options, picked: state.answered, answer: st.answer, onPick: (i) => { state.answered = i; blindOff(); render(); } }));
      if (state.answered != null) body.push(h('div', { class: 'feedback ' + (state.answered === st.answer ? 'right' : 'wrong') }, h('b', {}, state.answered === st.answer ? 'Correct. ' : 'Not quite. '), st.why || 'Now let’s see what the model does.'));
    }
    if (st.type === 'route') {
      const fp = SNAPSHOTS[st.patient]?.fp || {};
      canNext = state.answered != null; asking = !canNext;
      body.push(h('p', { class: 'route-story' }, st.story), h('ul', { class: 'route-clues' }, st.clues.map((c) => h('li', {}, typeof c === 'function' ? c(fp) : c))));
      body.push(h('p', { class: 'q' }, 'Where is the block? Tap its level.'), state.route.el);
      if (state.answered != null) {
        const ok = state.answered === st.site;
        body.push(h('div', { class: 'feedback ' + (ok ? 'right' : 'wrong') }, h('b', {}, ok ? 'Correct. ' : 'Not quite. '), st.why));
        if (state.ladder) body.push(h('div', { class: 'tour-sub' }, 'Pressure along the way', h('span', {}, h('i', { class: 'lg-now' }), 'This patient', h('i', { class: 'lg-base' }), 'Healthy')), state.ladder);
      }
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
      if (st.dye) body.push(h('button', { class: 'btn block dye-btn', disabled: !!state.dyeing, onclick: () => injectDye(st) }, svgIcon('drop'), state.dyed ? 'Inject again' : state.dyeing ? 'Dye on its way…' : st.dyeLabel || 'Inject dye'));
      if (st.presetButton) body.push(h('button', { class: 'btn block', style: { marginBottom: '12px' }, onclick: () => loadPreset(st.presetButton) }, `Load: ${store.get().presetList?.find((p) => p.id === st.presetButton)?.label || st.presetButton}`));
      if (state.met && st.after) body.push(h('div', { class: 'feedback right' }, st.after));
      else body.push(h('div', { class: 'goal ' + (state.met ? 'met' : 'waiting') }, h('span', { class: 'chk' }, svgIcon('check')), state.met ? (st.stay ? 'Done.' : 'Done. Moving on…') : 'Waiting for you…'));
      if (st.hint && !state.met) body.push(h('p', { class: 'ctl-sub' }, st.hint));
    }
    if (st.type === 'observe') {
      canNext = state.observed;
      if (!state.observed) body.push(h('div', { class: 'goal waiting' }, h('span', { class: 'chk' }, svgIcon('check')), st.lapse ? `Time-lapse: month ${Math.min(Math.round(st.lapse.days / 30), Math.floor((state.lapseDays || 0) / 30) + 1)} of ${Math.round(st.lapse.days / 30)}…` : st.days ? `Running ${st.days} simulated days…` : 'Watching the model…'));
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
    // Then a patient to try it on: the lesson is recorded first, then the case opens.
    // A unit's optional practice (unit 3: the drill, five patients) closes the unit and opens it.
    if (lesson.unit && lesson.practice && st.type === 'keypoints') body.push(h('button', { class: 'btn explore-here', title: `Finish the unit and practise: ${lesson.practice}`, onclick: () => { practiceNext = true; finish(); } }, svgIcon('route'), lesson.practice, h('small', {}, 'Optional practice')));
    const tryCase = !lesson.unit && idx === lesson.steps.length - 1 && canNext && startCase && CASES.find((c) => c.id === lesson.caseId);
    if (tryCase) body.push(h('button', { class: 'try-case', onclick: () => { const id = tryCase.id; finish(); startCase(id); } }, h('span', {}, h('small', {}, 'Now try it on a patient'), h('b', {}, tryCase.title)), svgIcon('chev-right')));
    const [, typeLabel] = STEP[st.type], stepLabel = `${typeLabel} · ${idx + 1} of ${lesson.steps.length}`;
    const bt = bannerText(st);
    setBanner?.({ tag: `Lesson · ${idx + 1}/${lesson.steps.length}`, text: bt === lesson.title ? lesson.title : `${lesson.title}: ${bt}` });
    const sheet = (asSheet.matches || !!lesson.unit) && coach;
    const card = h('section', { class: 'lesson', 'aria-label': `Lesson: ${lesson.title}` },
      // Progress: a dot per step, with only the current step named.
      h('div', { class: 'lesson-top' },
        lesson.unit ? unitBar(lesson, idx, lesson.steps.length) : h('div', { class: 'phase-rail', role: 'img', 'aria-label': stepLabel }, lesson.steps.map((s0, i) => h('span', { class: i < idx ? 'on' : i === idx ? 'cur' : '' }, h('i'), i === idx ? h('b', {}, stepLabel) : null))),
        h('span', { class: 'lt-act' }, h('button', { class: 'link', title: 'Back to the state this step started from', onclick: replay, disabled: !snaps[idx] }, 'Replay'), h('button', { class: 'link', onclick: stop }, 'Exit'),
          sheet ? h('button', { class: 'ib sheet-min', 'aria-label': sheetMin ? 'Expand the lesson' : 'Minimize the lesson', 'aria-expanded': String(!sheetMin), onclick: () => { sheetMin = !sheetMin; render(); } }, svgIcon('chev-down')) : null)),
      h('h3', {}, lesson.title), ...body,
      h('div', { class: 'lesson-foot' }, idx > 0 ? h('button', { class: 'btn ghost', onclick: back }, 'Back') : h('span'),
        h('button', { class: 'btn primary', disabled: !canNext, onclick: () => { if (st.type === 'predict' && st.mode === 'draw') dock.profile.endPredict(false); next(); } }, idx === lesson.steps.length - 1 ? (lesson.unit ? 'Finish unit' : 'Finish lesson') : st.next || 'Continue', svgIcon('chev-right'))));
    const target = sheet ? coach : hostEl;
    (target === coach ? hostEl : coach)?.replaceChildren();
    target.replaceChildren(card);
    cardEl = card;
    card.classList.toggle('q-active', asking && st.mode !== 'draw');
    card.classList.toggle('unit', !!lesson.unit);
    card.classList.toggle('sheet', !!sheet);
    card.classList.toggle('min', !!sheet && sheetMin);
    // On a phone the card sits at the bottom (styles), so the figure frames itself above it and lifts its
    // credit and buttons clear of it.
    const bottom = sheet && (asPhone.matches || !!lesson.unit);
    coach.dataset.safe = bottom ? 'bottom' : 'top';
    // The figure gives up (or takes back) the sheet's height.
    requestAnimationFrame(() => { stage?.relayout(); liftOver(bottom ? card : null); if (sheet) dispatchEvent(new Event('resize')); });
  }

  store.on('mode', (m) => { if (m !== 'learn' && lesson) stop(); render(); });
  asSheet.addEventListener('change', () => { render(); if (lesson && !asSheet.matches) openPanel?.('chart'); });
  return { openList, start, stop, render, active: () => !!lesson };
}
