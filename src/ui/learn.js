// Learn mode (blueprint §11): lessons as step sequences with Predict → Observe → Explain.

import { store, updateParams } from './store.js?v=18136433f8';
import { host } from './host.js?v=7e09ccd8cf';
import { h, fmt, toast, svgIcon } from './util.js?v=8aa5e5cdf1';
import { createAnswerSheet, ASSESSMENT_VERSION, CONTENT_VERSION, MASTERY } from './assess.js?v=a4326ba599';
import { addRecord } from './records.js?v=379d033371';
import { runSequence } from './sequence.js?v=7bf7fb864e';
import { EDGES } from '../engine/topology.js?v=80b8d861de';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.lessons') || '{}'); } catch { return {}; } })();
const save = () => { try { localStorage.setItem('pps.lessons', JSON.stringify(saved)); } catch { /* storage unavailable */ } };

// Step bindings (all optional): preset/presetDays (native pre-aging), params, afterDays (extra disease days after the patch),
// tab (pane), probe, invert, endo ('eso'), focus, data (labeled metric row); a do-step goal(frame, params, log)
// also receives the actions the learner has taken since the step began (store.logAction).
// Step types: frame | predict (mcq | draw | direction) | do (goal) | observe (seconds / days) | explain (metric) | check (quiz)
// A 'direction' prediction is made on the figure: two arrows at the vessel, toward or away from
// the liver; the next observe step compares it with the model.
export const LESSONS = [
  {
    id: 'valveless', title: 'Pressure differences drive portal flow', minutes: 5,
    summary: 'Pressure drop = flow × resistance, and a valveless route follows its pressure difference.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'pinch'], view: 'anatomic', zoom: 'fit', tab: 'profile', path: 'main', focus: ['SV_CONF', 'PV_TRUNK', 'RHV_IVC'], focusLabel: 'Splenic, portal and hepatic veins',
        text: 'Blood from the bowel and spleen enters the liver through the portal vein. Across a route, **pressure drop = flow × resistance**. The portal veins do not contain valves that enforce forward flow.' },
      { type: 'predict', mode: 'direction', edge: 'SV_CONF', q: 'Which way does blood flow in this splenic vein at rest? Choose an arrow on the figure.' },
      { type: 'predict', q: 'If the main portal vein is narrowed, what happens first to pressure in the superior mesenteric vein upstream?',
        options: ['It rises.', 'It falls.', 'It must stay unchanged because flow can reroute.'], answer: 0,
        why: 'A new outflow resistance raises upstream pressure.' },
      { type: 'do', tools: ['select', 'pinch'], text: 'Select the **main portal vein** and set **Narrow** to 80 %. Find the pressure on each side.', focus: ['PV_TRUNK'], focusLabel: 'Narrow the portal vein', goal: (f, p) => Math.abs((p.stenosis.PV_TRUNK || 0) - 0.8) <= 0.01, hint: 'Use the slider or type the number. The portal vein runs from the confluence to the liver hilum.' },
      { type: 'observe', seconds: 8, tools: ['select'], view: 'circuit', tab: 'profile', focus: ['SMV_CONF', 'PV_TRUNK'], focusLabel: 'Upstream and hilum',
        data: [{ label: 'Portal confluence', metric: 'pv', unit: 'mmHg' }, { label: 'Portal vein flow', metric: 'pvFlow', d: 2, unit: 'L/min' }],
        text: 'The upstream pressure and the pressure at the liver hilum are different. A high pressure before an obstruction does not mean the same pressure exists beyond it.' },
      { type: 'explain', metric: 'pv', text: 'For an ideal rigid tube, halving radius increases resistance sixteenfold. Real veins also deform, and this simulator adds an extra severe-narrowing factor. The slider is not an exact Poiseuille experiment.' },
      { type: 'check', quiz: [
        { q: 'What can reverse flow?', options: ['Reversal of the pressure difference', 'Failure of portal valves', 'Any low albumin level'], answer: 0 },
        { q: 'In the ideal fixed-length tube, halving radius increases resistance by approximately…', options: ['2', '4', '16'], answer: 2 },
        { q: 'Which relationship describes a steady route?', options: ['Pressure drop = flow × resistance', 'Absolute upstream pressure = flow × resistance regardless of downstream pressure', 'Resistance requires a valve'], answer: 0 },
      ] },
    ],
  },
  {
    id: 'resistance-site', title: 'Locate the resistance', minutes: 6,
    summary: 'Presinusoidal, sinusoidal and postsinusoidal blocks give different pressure patterns.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], view: 'anatomic', zoom: 'lobule', tab: 'profile',
        text: 'Blood crosses portal venules, sinusoids and central venules in sequence. Resistance can rise before, within or after the sinusoids. The location changes the pressure pattern. Identify the inlet venule, sinusoid and central-vein outlet, then continue.' },
      { type: 'predict', mode: 'draw', zoom: 'fit', path: 'main', tab: 'profile',
        text: 'Sketch the pressure profile if sinusoidal resistance rises while the right heart remains normal. Drag across the chart (a higher upstream plateau and a larger fall across the sinusoids).' },
      { type: 'do', tools: ['select', 'fibrosis'], text: 'Set the **Cirrhosis** control to 70 %. This percentage is a model control, not a histologic fibrosis measurement.', goal: (f, p) => Math.abs(p.cirrhosis - 0.7) <= 0.01, controls: ['cirrhosis'] },
      { type: 'observe', seconds: 8, reveal: true, tools: ['select'], zoom: 'fit', tab: 'profile',
        text: 'The larger pressure fall is across the liver’s sinusoidal route. Use the profile to locate the resistance before assigning a diagnosis. Your prediction is the dashed line.' },
      { type: 'frame', preset: 'schisto', tools: ['select'], view: 'anatomic', zoom: 'lobule', tab: 'profile', focus: ['PRE_R', 'PRE_L'], focusLabel: 'Portal venules',
        text: 'Now the resistance lies before the sinusoids. Portal pressure can be high while sinusoidal and wedged pressures remain much lower. This is the presinusoidal pattern.' },
      { type: 'explain', preset: 'sos', metric: 'ascites', tools: ['select'], zoom: 'lobule', tab: 'profile', focus: ['POST_R_RHV', 'POST_L_LHV'], focusLabel: 'Central venules',
        text: 'A central-venule outflow block congests the sinusoids from downstream. This is different from both a portal-venule block and a failing heart.' },
      { type: 'check', quiz: [
        { q: 'Cirrhosis primarily increases resistance at which illustrated segment?', options: ['Portal venules', 'Sinusoids', 'Right atrium'], answer: 1 },
        { q: 'A portal-venule block lies…', options: ['Before the sinusoids', 'After the sinusoids', 'Outside the sinusoids, in the heart'], answer: 0 },
        { q: 'Raised sinusoidal pressure with a central-venule block reflects…', options: ['Inflow through valves', 'Downstream congestion', 'Absent filtration'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'hvpg', title: 'What HVPG measures, and what it misses', minutes: 7,
    summary: 'Free and wedged hepatic venous pressure, and when their difference misleads.',
    steps: [
      { type: 'frame', preset: 'cirr-comp', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['RHV_IVC', 'PRE_R', 'SIN_RR'], focusLabel: 'Hepatic vein and sinusoids',
        data: [{ label: 'FHVP', metric: 'fhvp', unit: 'mmHg' }, { label: 'WHVP', metric: 'whvp', unit: 'mmHg' }],
        text: 'Hepatic venous pressure gradient, or **HVPG**, is wedged minus free hepatic venous pressure. A wedge estimates pressure transmitted from the sinusoidal territory. It is not a direct portal-vein pressure measurement. Read the live values in the **Hepatic vein pressures** card (Pressure pane), then continue.' },
      { type: 'predict', q: 'Which calculation gives HVPG?', options: ['Wedged minus free hepatic venous pressure', 'Portal pressure minus right atrial pressure', 'Wedged pressure alone'], answer: 0,
        why: 'HVPG removes the downstream free-pressure reference.' },
      { type: 'do', tools: ['select', 'catheter'], tab: 'profile', focus: ['RHV_IVC'], focusLabel: 'Right hepatic vein',
        text: 'In the **Hepatic vein pressures** card choose **Free, right hepatic vein**, then **Wedged**. Compare the two readings.',
        goal: (f, p, log) => { const i = log.findIndex((a) => a.type === 'catheter' && a.target === 'R' && !a.value); return i >= 0 && log.slice(i).some((a) => a.type === 'catheter' && a.target === 'R' && a.value); },
        hint: 'Free first, then wedged, in the same vein. The recorded wedged − free may differ slightly from the continuous HVPG estimate.' },
      { type: 'observe', seconds: 8, preset: 'schisto', tools: ['select'], tab: 'profile', zoom: 'fit', focus: ['PV_TRUNK', 'PRE_R', 'RHV_IVC'], focusLabel: 'Portal trunk, venules, hepatic vein',
        data: [{ label: 'Portal − IVC (PPG)', metric: 'ppg', unit: 'mmHg' }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'The block is before the sinusoids. A low HVPG does not exclude important portal hypertension in this setting.' },
      { type: 'observe', seconds: 8, preset: 'rhf', params: { pulsatile: true }, tools: ['select'], tab: 'profile', zoom: 'fit', focus: ['IVCS_RA', 'RHV_IVC'], focusLabel: 'IVC and hepatic vein',
        data: [{ label: 'FHVP', metric: 'fhvp', unit: 'mmHg' }, { label: 'WHVP', metric: 'whvp', unit: 'mmHg' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'Cardiac backpressure raises free and wedged pressures together. Their difference may remain small even though both absolute pressures are high.' },
      { type: 'explain', preset: 'budd-chiari', metric: 'hvpg', tools: ['select'], tab: 'profile', zoom: 'fit', focus: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], focusLabel: 'Hepatic veins',
        text: 'These hepatic veins are obstructed. The app can calculate a pressure difference, but that does not make a clinical HVPG procedure valid. Interpret the anatomy and absolute pressures.' },
      { type: 'check', quiz: [
        { q: 'Which pair gives HVPG 3 mmHg?', options: ['WHVP 18 and FHVP 15', 'WHVP 18 and RA 3', 'Portal pressure 18 and FHVP 3'], answer: 0 },
        { q: 'High portal pressure with a low wedge suggests…', options: ['Exclusively healthy flow', 'A possible presinusoidal block', 'No need for imaging'], answer: 1 },
        { q: 'What must be checked before interpreting a wedge?', options: ['Hepatic-vein patency and adequate occlusion', 'Varix color alone', 'Spleen size alone'], answer: 0 },
        { q: 'Both free and wedged pressures high with a small difference can reflect…', options: ['Cardiac backpressure', 'Absence of all venous congestion', 'Portal valves'], answer: 0 },
      ] },
    ],
  },
  {
    id: 'forward', title: 'Inflow, resistance and preventive therapy', minutes: 7,
    summary: 'More inflow into a resistant liver raises pressure; propranolol and carvedilol compared.',
    steps: [
      { type: 'frame', preset: 'csph', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['A_SMA', 'SIN_RR', 'PV_TRUNK'], focusLabel: 'Inflow, sinusoids, portal vein',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }, { label: 'HR', metric: 'hr', d: 0, unit: 'bpm' }, { label: 'MAP', metric: 'map', d: 0, unit: 'mmHg' }],
        text: 'Portal hypertension reflects resistance and inflow. Splanchnic vasodilation can deliver more blood to a high-resistance liver. We will change one factor at a time. Note the baseline HVPG, portal flow, HR and MAP.' },
      { type: 'predict', q: 'Reducing splanchnic arteriolar tone to 0.60 tends to make portal pressure do what in this state?', options: ['Rise', 'Fall because all dilation lowers venous pressure', 'Remain identical because only fibrosis matters'], answer: 0,
        why: 'Inflow increases, so pressure rises.' },
      { type: 'do', text: 'Set **Splanchnic arteriolar tone** to 0.60. Compare portal flow and HVPG with your baseline.', goal: (f, p) => Math.abs(p.splanchnicTone - 0.6) <= 0.01, controls: ['splanchnicTone'],
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }] },
      { type: 'observe', seconds: 8, preset: 'csph', params: { drugs: { propranolol: true, carvedilol: false, terlipressin: false, octreotide: false } }, tools: ['select'], tab: 'profile', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and sinusoids',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'Portal flow', metric: 'pvFlow', d: 2, unit: 'L/min' }, { label: 'HR', metric: 'hr', d: 0, unit: 'bpm' }],
        text: 'The patient is reset to the clean baseline. Propranolol blocks beta receptors. Its modeled effect reduces cardiac drive and splanchnic inflow. This is an on/off mechanism demonstration, not a dose recommendation.' },
      { type: 'observe', seconds: 8, preset: 'csph', params: { drugs: { carvedilol: true, propranolol: false, terlipressin: false, octreotide: false } }, tools: ['select'], tab: 'profile', focus: ['A_SMA', 'SIN_RR'], focusLabel: 'Inflow and sinusoids',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }, { label: 'MAP', metric: 'map', d: 0, unit: 'mmHg' }, { label: 'HR', metric: 'hr', d: 0, unit: 'bpm' }],
        text: 'Clean reset, propranolol off. Carvedilol also reduces intrahepatic vascular tone in this model. Compare its pressure effect and mean arterial pressure with the propranolol state. Clinical tolerability requires more information than this network provides.' },
      { type: 'explain', metric: 'hvpg', text: 'Nonselective beta blockers can prevent decompensation in compensated cirrhosis with clinically significant portal hypertension. Banding treats varices locally. The simulator shows hemodynamic effects, not a patient’s long-term outcome.' },
      { type: 'check', quiz: [
        { q: 'Why does carvedilol have an additional modeled pressure effect?', options: ['It dissolves collagen', 'It reduces intrahepatic tone through alpha-1 blockade', 'It creates a shunt'], answer: 1 },
        { q: 'For compensated cirrhosis with CSPH, what can preventive NSBB treatment address?', options: ['Only varix size', 'First decompensation risk', 'All causes of liver injury'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'collaterals', title: 'Collateral routes develop over time', minutes: 6,
    summary: 'Potential portosystemic routes open with sustained pressure and remodel over months.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'profile', layers: { collaterals: true }, focus: ['C1a', 'C1b', 'C3', 'C6'], focusLabel: 'Potential collateral routes',
        text: 'Portal blood can reach systemic veins through collateral routes. Some channels are anatomically present before they carry substantial flow. Higher gradients can recruit flow, followed by structural growth.' },
      { type: 'predict', q: 'With sustained portal resistance, what may happen over months?',
        options: ['Collateral routes enlarge and divert more portal blood.', 'No change because all channels are congenital.', 'The hepatic veins become portal valves.'], answer: 0,
        why: 'Sustained gradients recruit and remodel collateral channels.' },
      { type: 'do', tools: ['select'], text: 'Set the model’s **Cirrhosis** control to 65 %. This is a model setting, not a histologic percentage. Note the early flows before the clock advances.', goal: (f, p) => Math.abs(p.cirrhosis - 0.65) <= 0.01, controls: ['cirrhosis'],
        data: [{ label: 'Portal pressure', metric: 'pv', unit: 'mmHg' }, { label: 'Shunt fraction', metric: (m) => m.shuntFraction * 100, d: 0, unit: '%' }] },
      { type: 'observe', days: 180, tools: ['select'], tab: 'scope', focus: ['C1a', 'C1b', 'C3', 'C6'], focusLabel: 'Collateral routes',
        data: [{ label: 'Portal pressure', metric: 'pv', unit: 'mmHg' }, { label: 'Shunt fraction', metric: (m) => m.shuntFraction * 100, d: 0, unit: '%' }],
        text: 'The clock now adds six model months. Compare route size, route flow and portal pressure. Hemodynamic responses are fast. Remodeling takes time.' },
      { type: 'observe', seconds: 6, tools: ['select'], view: 'circuit', tab: 'profile', focus: ['C1a', 'C1b', 'C5', 'C6'], focusLabel: 'Esophageal and splenorenal routes',
        text: 'Trace the esophageal route to the azygos system. Then locate the potential splenorenal route. A visible potential route does not guarantee active flow.',
      },
      { type: 'explain', metric: 'shunt', text: 'Collaterals offer another exit for portal blood. They can partly decompress the circulation while bypassing sinusoidal perfusion. Growth thresholds here are calibration choices, not a universal biological switch.' },
      { type: 'check', quiz: [
        { q: 'Which route reaches the azygos system?', options: ['The esophageal route (C1b)', 'The periportal route (C8)', 'The hepatic artery'], answer: 0 },
        { q: 'Can a collateral lower portal pressure while diverting blood away from the liver?', options: ['Yes', 'No, because decompression improves every flow', 'Only if it contains valves'], answer: 0 },
      ] },
    ],
  },
  {
    id: 'laplace', title: 'Varix wall stress and local bleeding control', minutes: 6,
    summary: 'Wall stress rises with pressure and radius and falls with thickness; drugs and banding act differently.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select'], view: 'anatomic', zoom: 'fit', tab: 'varixwall', focus: ['C1b'], focusLabel: 'Esophageal varix',
        data: [{ label: 'Transmural pressure', metric: 'varix.ptm', unit: 'mmHg' }, { label: 'Radius', metric: 'varix.r', d: 2, unit: 'mm' }, { label: 'Wall thickness', metric: 'varix.w', d: 2, unit: 'mm' }],
        text: 'In a thin cylindrical wall, circumferential wall stress is approximately **transmural pressure × radius ÷ thickness**. The app displays an educational estimate of this wall stress. Transmural means inside pressure minus surrounding pressure.' },
      { type: 'predict', q: 'At unchanged pressure and thickness, a larger radius does what to wall stress?', options: ['Increases it', 'Decreases it', 'Leaves it unchanged'], answer: 0,
        why: 'Radius is in the numerator.' },
      { type: 'do', tools: ['select'], text: 'Start **octreotide** in the model and make sure the other vasoactive and beta-blocker drugs are off. Compare portal inflow and varix wall stress with the baseline.',
        goal: (f, p) => p.drugs.octreotide && !p.drugs.terlipressin && !p.drugs.propranolol && !p.drugs.carvedilol, controls: ['drugs', 'drug:octreotide', 'drug:terlipressin', 'drug:propranolol', 'drug:carvedilol'],
        data: [{ label: 'Portal inflow', metric: 'portalIn', d: 2, unit: 'L/min' }, { label: 'Wall stress', metric: (m) => m.varix.ratio * 100, d: 0, unit: '% of model limit' }] },
      { type: 'observe', seconds: 8, tools: ['select'], tab: 'varixwall', focus: ['C1b', 'A_SMA'], focusLabel: 'Varix and inflow',
        data: [{ label: 'Portal inflow', metric: 'portalIn', d: 2, unit: 'L/min' }, { label: 'Wall stress', metric: (m) => m.varix.ratio * 100, d: 0, unit: '% of model limit' }],
        text: 'The modeled drug reduces inflow. A reduction in wall stress is not proof that a patient has stopped bleeding. Observe the separate bleeding readout in an acute case.' },
      { type: 'do', preset: 'cirr-decomp', tools: ['select', 'band', 'endoscope'], tab: 'endoscopy', focus: ['C1b'], focusLabel: 'Esophageal varix',
        text: 'Band the esophageal varix once. Banding acts locally. It does not remove the underlying sinusoidal resistance.',
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'band') },
      { type: 'explain', metric: 'varix', tools: ['select'], tab: 'varixwall',
        text: 'Large varices and red signs matter clinically, but the displayed stress percentage is illustrative. It does not supply a patient’s probability or date of rupture.' },
      { type: 'check', quiz: [
        { q: 'Banding primarily does what?', options: ['Treats the local esophageal varix', 'Reverses cirrhosis', 'Lowers resistance in every portal vessel'], answer: 0 },
        { q: 'What does a stress value of 90 % establish clinically?', options: ['Certain imminent rupture', 'No patient-specific probability, because the model is illustrative', 'No need for preventive therapy'], answer: 1 },
        { q: 'At fixed radius and thickness, more transmural pressure does what?', options: ['Increases stress', 'Lowers stress', 'Has no effect'], answer: 0 },
        { q: 'At fixed pressure and radius, a thinner wall does what?', options: ['Lowers stress', 'Increases stress', 'Creates a hepatic valve'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'hepatofugal', title: 'Read direction in the correct vessel', minutes: 6,
    summary: 'Anatomical direction, spectral display sign and branch-versus-trunk reversal are different things.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'doppler'], view: 'anatomic', zoom: 'fit', tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal trunk',
        text: '**Hepatopetal** means toward the liver. **Hepatofugal** means away from it. Spectral Doppler shows motion toward or away from the probe. Check the vessel, probe convention and Invert setting before naming the anatomical direction.' },
      { type: 'predict', mode: 'direction', edge: 'PV_TRUNK', q: 'The next state combines severe liver resistance, arterioportal shunting and a large collateral exit. Which way can the portal trunk flow? Choose an arrow on the figure.' },
      { type: 'observe', seconds: 8, preset: 'cirr-hepatofugal', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK', 'C6', 'AP_R', 'AP_L'], focusLabel: 'Trunk, splenorenal route, arterioportal shunts',
        data: [{ label: 'Mean portal-trunk flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'This preset has negative mean portal-trunk flow. Confirm reversal on the anatomy as well as the spectrum. This is a demonstration combination, not a universal necessary cause.' },
      { type: 'do', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', text: 'Toggle **Invert** once. The spectrum changes sides. The blood still flows in the same anatomical direction.',
        goal: (f, p, log) => log.some((a) => a.type === 'invert'), hint: 'The Invert button is on the Doppler pane.' },
      { type: 'observe', seconds: 8, preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PVH_L', focus: ['TIPS', 'PVH_L', 'PV_TRUNK'], focusLabel: 'TIPS, left branch, trunk',
        data: [{ label: 'Portal-trunk flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'After TIPS, a branch can flow toward the shunt. That does not by itself establish reversal of the main portal trunk. Always name the sampled segment. This is a qualitative flow illustration.' },
      { type: 'explain', metric: 'pvFlow', text: 'Direction follows the pressure difference at the sampled route. A branch, a splenic vein and the portal trunk can have different directions at the same time.' },
      { type: 'check', quiz: [
        { q: 'Hepatofugal means…', options: ['Toward the liver', 'Away from the liver', 'Absent flow'], answer: 1 },
        { q: 'Does Invert reverse blood flow?', options: ['Yes', 'No, it changes the display', 'Only in cirrhosis'], answer: 1 },
        { q: 'A reversed left portal branch proves the main trunk is reversed?', options: ['Always', 'No, the segment must be sampled', 'Only if red'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'starling', title: 'Filtration, drainage and ascites', minutes: 7,
    summary: 'Lymph compensates until filtration outruns drainage; removing fluid does not treat the pressure driving it.',
    steps: [
      { type: 'frame', preset: 'schisto', tools: ['select'], view: 'anatomic', zoom: 'lobule', tab: 'abdomen', focus: ['PRE_R', 'SIN_RR'], focusLabel: 'Presinusoidal block and sinusoids', lobuleLayers: { lymph: true },
        data: [{ label: 'Hepatic lymph', metric: 'ascites.hepLymph', d: 2, unit: 'mL/min' }, { label: 'Lymph capacity', metric: 'ascites.lymphCap', d: 2, unit: 'mL/min' }],
        text: 'More fluid can leave congested sinusoids. Lymph drainage initially compensates. Ascites can accumulate when total filtration exceeds drainage and reabsorption, even while lymph flow is increasing.' },
      { type: 'predict', q: 'With the block before the sinusoids, what does this preset show despite high upstream portal pressure?',
        options: ['Little or no ascites', 'Every high portal pressure must cause tense ascites', 'No collateral flow is possible'], answer: 0,
        why: 'Sinusoidal pressure is relatively spared. Real noncirrhotic disease can still have ascites for other reasons.' },
      { type: 'observe', seconds: 8, preset: 'cirr-decomp', params: { diuretics: false }, tools: ['select'], zoom: 'lobule', tab: 'abdomen', focus: ['SIN_RR', 'IVC_IS'], focusLabel: 'Sinusoids and abdomen', lobuleLayers: { lymph: true },
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Net rate', metric: 'ascites.ratePerDay', d: 0, unit: 'mL/day' }, { label: 'Hepatic lymph', metric: 'ascites.hepLymph', d: 2, unit: 'mL/min' }, { label: 'Lymph capacity', metric: 'ascites.lymphCap', d: 2, unit: 'mL/min' }],
        text: 'This cirrhosis state has high sinusoidal pressure and reduced albumin. Diuretics are off. Compare fluid production, drainage capacity and net accumulation.' },
      { type: 'observe', days: 180, tools: ['select'], zoom: 'fit', tab: 'abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Intra-abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'The abdomen reflects accumulated fluid, not only today’s rate. The model allows drainage capacity and reabsorption to adapt. A smaller current accumulation rate does not mean the existing ascites has disappeared.' },
      { type: 'do', tools: ['select', 'needle'], tab: 'abdomen', focus: ['IVC_IS'], focusLabel: 'Abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Intra-abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Drain up to 5 L using the albumin-supported action (**Drain** with albumin on, 5 L). Compare abdominal pressure before and after removal.',
        goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'paracentesis'), hint: 'The volume actually removed is the smaller of 5 L and the fluid present.' },
      { type: 'explain', metric: 'ascites', text: 'Removing fluid relieves volume and abdominal pressure. It does not cure the liver’s resistance. Outside the model: renal sodium retention and neurohormonal responses are central to clinical ascites, but they are not separately represented here.' },
      { type: 'check', quiz: [
        { q: 'Why can ascites grow when lymph flow rises?', options: ['Drainage may still be insufficient for filtration', 'Lymph never returns to blood', 'Higher flow proves cure'], answer: 0 },
        { q: 'Paracentesis directly changes which modeled quantity?', options: ['Cirrhosis severity', 'Ascites volume', 'Thrombus size'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'sinistral', title: 'The splenic territory can be hypertensive alone', minutes: 6,
    summary: 'Splenic-vein obstruction raises pressure upstream of the block; treatment follows anatomy, not the varix location.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'thrombus', 'endoscope'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['SV_CONF', 'C2', 'PV_TRUNK'], focusLabel: 'Splenic vein, short gastric route, portal trunk',
        text: 'Splenic-vein obstruction can raise pressure in the splenic territory while the main portal pressure stays much lower. This is left-sided, or sinistral, portal hypertension. Find the splenic outflow and the gastric route, then continue.' },
      { type: 'predict', q: 'If splenic outflow to the confluence is blocked, which route can carry more blood?',
        options: ['Short gastric veins toward the fundus', 'The right hepatic vein directly from the spleen', 'Portal valves'], answer: 0,
        why: 'The spleen has to drain another way. The next state supplies one existing anatomic configuration.' },
      { type: 'do', tools: ['select', 'thrombus'], focus: ['SV_CONF'], focusLabel: 'Proximal splenic vein', text: 'Clot the **proximal splenic vein** completely (**Clot** 100 %). Compare splenic-side and main portal pressures before any remodeling.',
        data: [{ label: 'Splenic vein', metric: 'sv', unit: 'mmHg' }, { label: 'Portal confluence', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.99, hint: 'Select the vessel in the figure, then drag Clot to 100 %.' },
      { type: 'observe', seconds: 8, preset: 'svt', tools: ['select', 'endoscope', 'doppler'], tab: 'endoscopy', focus: ['C2', 'C5', 'SV_CONF'], focusLabel: 'Short gastric and gastrorenal routes',
        data: [{ label: 'Splenic vein', metric: 'sv', unit: 'mmHg' }, { label: 'Portal confluence', metric: 'pv', unit: 'mmHg' }],
        text: 'This chronic preset shows fundal varices fed by the short gastric route. The main portal pressure is relatively normal. Clinical Doppler may not visualize every splenic segment, so cross-sectional imaging may be needed.' },
      { type: 'observe', seconds: 8, preset: 'gastric-varix', tools: ['select'], tab: 'profile', focus: ['PV_TRUNK', 'C2', 'C5'], focusLabel: 'Portal trunk, short gastric and gastrorenal routes',
        data: [{ label: 'Splenic vein', metric: 'sv', unit: 'mmHg' }, { label: 'Portal confluence', metric: 'pv', unit: 'mmHg' }],
        text: 'Fundal varices also occur with cirrhosis and a gastrorenal route, here with generalized portal-pressure elevation. The same varix location does not establish the same disease or the same treatment.' },
      { type: 'explain', metric: 'pv', text: 'Outside the model: symptomatic splenic-vein obstruction may need splenic inflow or outflow treatment. Splenectomy and splenic artery embolization cannot be performed here. Asymptomatic disease does not automatically need either procedure.' },
      { type: 'check', quiz: [
        { q: 'Fundal varices alone prove cirrhosis?', options: ['Yes', 'No', 'Only with melena'], answer: 1 },
        { q: 'With isolated splenic-vein obstruction, is a main-portal decompression procedure automatically the definitive treatment?', options: ['Yes', 'No, it may not relieve the splenic obstruction', 'Always, if HVPG is low'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'heart', title: 'High downstream pressure can congest the liver', minutes: 6,
    summary: 'Cardiac congestion: high absolute free and wedged pressures, a small HVPG and a pulsatile portal vein.',
    steps: [
      { type: 'frame', preset: 'rhf', params: { pulsatile: true }, tools: ['select', 'doppler'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['IVCS_RA', 'RHV_IVC', 'PV_TRUNK'], focusLabel: 'IVC, hepatic vein, portal trunk',
        data: [{ label: 'Right atrium', metric: 'ra', unit: 'mmHg' }, { label: 'FHVP', metric: 'fhvp', unit: 'mmHg' }, { label: 'WHVP', metric: 'whvp', unit: 'mmHg' }],
        text: 'Right-heart congestion raises the pressure downstream of the liver. Free and wedged hepatic venous pressures can both be high while their difference stays small. Compare RA, FHVP and WHVP.' },
      { type: 'predict', q: 'With severe tricuspid regurgitation, what can happen to portal flow?',
        options: ['It becomes more pulsatile, sometimes with phasic reversal', 'It always disappears', 'It becomes non-pulsatile because HVPG is low'], answer: 0,
        why: 'Phasic reversal and net mean reversal are different things.' },
      { type: 'observe', seconds: 12, tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK', focus: ['PV_TRUNK'], focusLabel: 'Portal trunk',
        data: [{ label: 'Mean portal-trunk flow', metric: 'pvFlowMean', d: 2, unit: 'L/min' }],
        text: 'Cardiac pressure waves reach this portal segment. Describe the pulsatility and the mean direction separately. A wave crossing the baseline need not mean that average flow is hepatofugal.' },
      { type: 'do', tools: ['select', 'doppler'], tab: 'doppler', focus: ['RHV_IVC'], focusLabel: 'Right hepatic vein', text: 'Sample the **right hepatic vein**. Its normal drainage is away from this probe. Compare the venous pattern with the portal spectrum.',
        goal: (f, p, log) => log.some((a) => a.type === 'probe' && a.target === 'RHV_IVC'), hint: 'Choose the right hepatic vein on the Doppler pane or tap it in the figure.' },
      { type: 'observe', seconds: 8, preset: 'constrictive', tools: ['select'], tab: 'profile', focus: ['IVCS_RA', 'RHV_IVC'], focusLabel: 'IVC and hepatic vein',
        data: [{ label: 'Right atrium', metric: 'ra', unit: 'mmHg' }, { label: 'FHVP', metric: 'fhvp', unit: 'mmHg' }, { label: 'WHVP', metric: 'whvp', unit: 'mmHg' }],
        text: 'Pericardial constraint can also raise downstream pressure. The app illustrates congestion but cannot diagnose a real cardiac condition from these pressures alone.' },
      { type: 'explain', metric: 'ra', text: 'A bypass delivers more venous return to the heart. Outside the model: assess cardiac function before elective TIPS. A small HVPG does not establish a safe heart or explain every cause of ascites.' },
      { type: 'check', quiz: [
        { q: 'WHVP and FHVP both high with a low HVPG suggests…', options: ['Possible cardiac backpressure', 'It excludes congestion', 'Presinusoidal disease alone'], answer: 0 },
        { q: 'What is needed before proposing TIPS for this patient’s ascites?', options: ['Varix color alone', 'Cardiac assessment and broader clinical selection', 'Nothing further'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'vascular-patterns', title: 'Vascular obstruction before and after the liver', minutes: 8,
    summary: 'Portal-vein, hepatic-vein and caval obstruction, and when HVPG or PPG labels mislead.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'doppler'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['PV_TRUNK', 'RHV_IVC', 'IVCS_RA'], focusLabel: 'Portal vein, hepatic vein, cava',
        text: 'A vascular block can lie before the liver, in its hepatic-vein outlets, or in the cava. First localize the blocked route. Then decide which pressures can be interpreted.' },
      { type: 'predict', q: 'After acute portal-vein occlusion, what can partially buffer the reduced portal inflow?',
        options: ['Increased hepatic arterial flow', 'Portal-valve opening', 'Immediate disappearance of sinusoidal resistance'], answer: 0,
        why: 'Buffering is partial and does not guarantee normal liver function.' },
      { type: 'observe', seconds: 8, preset: 'pvt-acute', tools: ['select', 'doppler'], tab: 'profile', focus: ['PV_TRUNK', 'A_HR', 'A_HL', 'C8'], focusLabel: 'Portal trunk, hepatic arteries, periportal route',
        data: [{ label: 'Portal inflow', metric: 'portalIn', d: 2, unit: 'L/min' }, { label: 'Hepatic artery inflow', metric: 'arterialIn', d: 2, unit: 'L/min' }, { label: 'Portal-trunk flow', metric: 'pvFlow', d: 2, unit: 'L/min' }],
        text: 'The main portal trunk is blocked. Upstream pressure and liver-hilum pressure separate, and the hepatic artery responds to reduced portal inflow. Zero trunk flow is occlusion, not hepatofugal flow.' },
      { type: 'observe', seconds: 8, preset: 'pvt-chronic', tools: ['select', 'doppler'], tab: 'profile', focus: ['PV_TRUNK', 'C8'], focusLabel: 'Portal trunk, periportal route',
        data: [{ label: 'Periportal route flow', metric: (m) => m.collateralFlows.C8 * 0.06, d: 2, unit: 'L/min' }, { label: 'Portal-trunk flow', metric: 'pvFlow', d: 2, unit: 'L/min' }],
        text: 'A chronic periportal route can carry blood around the obstruction. This cavernoma is a collateral bypass, not proof that the original portal vein recanalized.' },
      { type: 'observe', seconds: 8, preset: 'budd-chiari', tools: ['select', 'doppler'], tab: 'profile', focus: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'CAUD'], focusLabel: 'Hepatic veins, caudate drainage',
        data: [{ label: 'HVPG (calculated)', metric: 'hvpg', unit: 'mmHg' }, { label: 'FHVP', metric: 'fhvp', unit: 'mmHg' }, { label: 'WHVP', metric: 'whvp', unit: 'mmHg' }],
        text: 'Here the hepatic veins are obstructed. The caudate route provides another outlet. A low calculated HVPG is not a normal result from a usable clinical hepatic-vein measurement.' },
      { type: 'observe', seconds: 8, preset: 'ivc-web', tools: ['select', 'doppler'], tab: 'profile', focus: ['IVCS_RA', 'IVC_IS', 'RHV_IVC'], focusLabel: 'Cava and right atrium',
        data: [{ label: 'PPG', metric: 'ppg', unit: 'mmHg' }, { label: 'Suprahepatic IVC', metric: 'ivc', unit: 'mmHg' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }],
        text: 'The obstruction is now between the cava and the right atrium. The app’s PPG subtracts suprahepatic caval pressure, so it can miss the caval-to-heart pressure drop. Look at the absolute pressures and the anatomy.' },
      { type: 'check', quiz: [
        { q: 'C8 flow around an occluded trunk represents…', options: ['A cavernoma bypass', 'A reopened original trunk', 'A systemic artery'], answer: 0 },
        { q: 'Occluded hepatic veins with a low calculated HVPG mean…', options: ['Healthy liver outflow', 'The gradient is not a reliable clinical measurement here', 'Only low albumin'], answer: 1 },
        { q: 'A caval block is best recognized by…', options: ['PPG alone', 'The pressure step between cava and RA, plus imaging', 'Varix diameter alone'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'costs', title: 'Compare inflow reduction, decompression and route closure', minutes: 8,
    summary: 'Banding, inflow reduction, TIPS and route closure treat different things; compare each with the right readout.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'stent'], view: 'anatomic', zoom: 'fit', tab: 'profile', focus: ['PVH_R', 'RHV_IVC', 'C1b'], focusLabel: 'Right portal vein, hepatic vein, varix route',
        data: [{ label: 'PPG', metric: 'ppg', unit: 'mmHg' }, { label: 'Hepatic flow', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }, { label: 'Shunt fraction', metric: (m) => m.shuntFraction * 100, d: 0, unit: '%' }],
        text: 'Inflow reduction, local banding and a bypass solve different parts of portal hypertension. Note PPG, hepatic flow, RA and shunt fraction now. No single displayed number proves a treatment is safe.' },
      { type: 'predict', q: 'Opening a low-resistance portal-to-systemic bypass tends to do what?',
        options: ['Lower the upstream gradient and divert flow', 'Dissolve fibrosis', 'Remove the need for cardiac assessment'], answer: 0,
        why: 'It gives blood an easier exit, bypassing the sinusoids.' },
      { type: 'do', tools: ['select', 'stent'], focus: ['PVH_R', 'RHV_IVC'], focusLabel: 'Right portal to right hepatic vein', text: 'Create a right portal-to-hepatic-vein shunt (**Create shunt…**) and set its diameter to **8 mm**. Compare the gradient, flow through the shunt and total hepatic flow.',
        data: [{ label: 'PPG', metric: 'ppg', unit: 'mmHg' }, { label: 'Hepatic flow', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Shunt fraction', metric: (m) => m.shuntFraction * 100, d: 0, unit: '%' }],
        goal: (f, p) => p.tips.on && Math.abs(p.tips.d - 8) <= 0.1, hint: 'Click the right portal vein, choose Create shunt, click the right hepatic vein, then set the diameter.' },
      { type: 'observe', seconds: 8, preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, tools: ['select'], tab: 'profile', focus: ['TIPS', 'PVH_R', 'PVH_L', 'RHV_IVC'], focusLabel: 'Shunt and portal branches',
        data: [{ label: 'PPG', metric: 'ppg', unit: 'mmHg' }, { label: 'Right atrium', metric: 'ra', unit: 'mmHg' }, { label: 'Hepatic flow', metric: 'hepaticFlow', d: 2, unit: 'L/min' }, { label: 'Shunt fraction', metric: (m) => m.shuntFraction * 100, d: 0, unit: '%' }],
        text: 'Same starting state, now a 10 mm shunt. A larger diameter offers more conductance. The shunt fraction here is clipped and cannot separate the two diameters well, so compare the measured flows and do not label either diameter clinically safe from this comparison.' },
      { type: 'frame', preset: 'gastric-varix', tools: ['select', 'occlude'], tab: 'profile', focus: ['C2', 'C5', 'PV_TRUNK'], focusLabel: 'Short gastric and gastrorenal routes',
        data: [{ label: 'Gastrorenal route flow', metric: (m) => m.collateralFlows.C5 * 0.06, d: 2, unit: 'L/min' }],
        text: 'The gastrorenal route drains fundal varices toward the left renal vein. Closing it is different from opening a TIPS. Outside the model: procedure choice depends on the bleeding site, anatomy, contraindications and expertise.' },
      { type: 'do', tools: ['select', 'occlude'], focus: ['C5'], focusLabel: 'Gastrorenal shunt', text: 'Close the **gastrorenal shunt** (**Occlude**) and confirm that flow through that route stops. This models route closure only. The pressure response here does not reproduce the usual clinical concern of a rise in portal pressure after obliteration.',
        data: [{ label: 'Gastrorenal route flow', metric: (m) => m.collateralFlows.C5 * 0.06, d: 3, unit: 'L/min' }, { label: 'Portal confluence', metric: 'pv', unit: 'mmHg' }],
        goal: (f, p) => !!p.occluded.C5, inline: ['brto'] },
      { type: 'explain', metric: 'shunt', text: 'Outside the model: TIPS can lead to encephalopathy or cardiac decompensation, and shunt fraction is only a mechanistic clue. Route obliteration can worsen other portal-hypertension manifestations. This model cannot predict those outcomes or prove complete varix eradication.' },
      { type: 'check', quiz: [
        { q: 'Does a lower post-TIPS PPG alone prove overall benefit?', options: ['Yes', 'No', 'Only above 10 mmHg'], answer: 1 },
        { q: 'Does a shunt fraction of 70 % diagnose encephalopathy?', options: ['Yes', 'No', 'Only with ascites'], answer: 1 },
        { q: 'What does C5 flow reaching zero demonstrate?', options: ['Complete clinical BRTO success', 'Closure of that modeled route', 'Cure of cirrhosis'], answer: 1 },
        { q: 'Which pairing is correct?', options: ['Banding: local varix; vasoactive drug: inflow; TIPS: bypass', 'Banding: kidney function; vasoactive drug: coagulation; TIPS: fibrosis removal', 'All three dissolve the same clot'], answer: 0 },
        { q: 'Which comparison best isolates shunt diameter?', options: ['8 and 10 mm from the same baseline with matched timing', '8 mm in healthy and 10 mm in decompensated disease', 'One state before and another after 540 days of remodeling'], answer: 0 },
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
  let answers = createAnswerSheet(), t0 = 0, prediction = null, chooser = null;
  let pollTimer = null, inline = null;

  // A small labeled data row (F2): live paired metrics for a step, each { label, metric, d, unit }.
  // `metric` is a dotted path into the metrics frame (e.g. 'varix.d') or a function of it.
  let dataTimer = 0;
  function dataRow(items) {
    const val = (it, m) => (typeof it.metric === 'function' ? it.metric(m) : it.metric.split('.').reduce((a, k) => a?.[k], m));
    const cells = items.map((it) => h('span', { class: 'dr-v' }, '—'));
    const upd = () => { const m = store.get().frame?.metrics; if (m) items.forEach((it, i) => { const v = val(it, m); cells[i].textContent = v == null ? '—' : `${fmt(v, it.d ?? 1)} ${it.unit || ''}`.trim(); }); };
    clearInterval(dataTimer); upd(); dataTimer = setInterval(upd, 400);
    return h('dl', { class: 'kv data-row', 'aria-live': 'off' }, items.flatMap((it, i) => [h('dt', {}, it.label), h('dd', {}, cells[i])]));
  }

  function openList() { render(); }

  async function start(id) {
    await beginSession?.('lesson');
    lesson = LESSONS.find((l) => l.id === id);
    idx = 0; state = {}; snaps.length = 0; answers = createAnswerSheet(); t0 = Date.now(); prediction = null;
    sheetMin = false;
    await enter();
    if (!asSheet.matches) openPanel?.('chart');
    panel.scrollTop = 0;
  }
  function stop() {
    lesson = null;
    chooser?.remove(); chooser = null;
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
    chooser?.remove(); chooser = null;
    state = { answered: null, quizAns: {}, observed: false, met: false };
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
    if (st.tab) showPane(st.tab);
    if (st.path) dock.profile.setPath(st.path);
    if (st.probe) setProbe(st.probe);
    if (st.invert != null) dock.pane('doppler')?.setInvert?.(st.invert);
    if (st.endo) { showPane('endoscopy'); dock.pane('endoscopy')?.setView?.(st.endo); }
    store.set({ focus: st.focus ? { edges: st.focus, label: st.focusLabel } : null });
    if (st.type === 'predict' || st.type === 'frame' || st.type === 'check') host.send({ type: 'run', running: st.type === 'frame' });
    if (st.type === 'predict' && st.mode === 'draw') { dock.profile.startPredict(() => render()); showPane('profile'); }
    if (st.type === 'predict' && st.mode === 'direction') setTimeout(() => showChooser(st), 120);
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
    if (st.type === 'explain') {
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
  // Predict on the figure: two arrow chips beside the vessel. The choice is compared with the
  // model's flow when the lesson next observes.
  function showChooser(st) {
    chooser?.remove(); chooser = null;
    const wrap = document.getElementById('stageView');
    const a = stage?.anchorFor({ type: 'edge', id: st.edge });
    if (!wrap || !a) return;
    const pts = a.path, p0 = pts[0], p1 = pts[pts.length - 1];
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
    const pick = (dir) => { prediction = { edge: st.edge, dir }; state.answered = dir; chooser?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.d) === dir))); render(); };
    const btn = (dir, label) => { const b = h('button', { class: 'dir-chip', 'data-d': dir, 'aria-pressed': 'false', 'aria-label': label, title: label, onclick: () => pick(dir) }, h('span', { class: 'dir-arrow', style: { transform: `rotate(${ang + (dir > 0 ? 0 : 180)}deg)` } }, '➜'), h('span', { class: 'dir-l' }, label)); return b; };
    chooser = h('div', { class: 'dir-chooser stage-blocker', style: { left: `${a.x}px`, top: `${a.y}px` } }, btn(1, 'With the normal flow'), btn(-1, 'Reversed'));
    wrap.append(chooser);
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
  const letter = (i) => h('span', { class: 'letter' }, 'ABCDE'[i]);


  function render() {
    inline?.dispose?.(); inline = null;
    const inLearn = store.get().mode === 'learn';
    if (!inLearn || !lesson) { hostEl.replaceChildren(); coach?.replaceChildren(); return; }
    const st = lesson.steps[idx];
    const body = [];
    if (st.text) body.push(h('p', {}, md(st.text)));
    if (st.data) body.push(dataRow(st.data));
    let canNext = true;
    if (st.type === 'predict' && !st.mode) {
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null;
      body.push(h('div', { class: 'opts' }, st.options.map((o, i) => h('button', { class: 'opt' + (state.answered != null ? (i === st.answer ? ' right' : i === state.answered ? ' wrong' : '') : ''), disabled: state.answered != null,
        onclick: () => { state.answered = i; render(); } }, letter(i), h('span', {}, o)))));
      if (state.answered != null) body.push(h('div', { class: 'feedback' }, h('b', {}, state.answered === st.answer ? 'Correct. ' : 'Not quite. '), st.why || 'Now let’s see what the model does.'));
    }
    if (st.type === 'predict' && st.mode === 'draw') body.push(h('div', { class: 'feedback' }, 'Draw on the pressure profile below the anatomy. When you have at least four points, continue.'));
    if (st.type === 'predict' && st.mode === 'direction') {
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null;
      body.push(h('div', { class: 'feedback' }, state.answered == null ? 'Choose one of the two arrows on the vessel in the figure.' : `Your prediction: ${state.answered > 0 ? 'flow in the normal direction' : 'reversed flow'}. Let’s see what the model does.`));
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
      if (state.observed && prediction) {
        const actual = flowSign(prediction.edge), ok = actual === prediction.dir;
        answers.record(`lesson:${lesson.id}:step-${String(idx + 1).padStart(2, '0')}:dir`, ok);
        body.push(h('div', { class: 'feedback pop ' + (ok ? 'right' : 'wrong') }, h('b', {}, ok ? 'Your prediction was right. ' : 'Not what you predicted. '), `The ${EDGES[EI[prediction.edge]].label.toLowerCase()} now runs ${actual > 0 ? 'in its normal direction' : 'backwards'}: follow the chevrons on the figure.`));
        stage?.flash([prediction.edge]);
        prediction = null;
      }
    }
    if (st.type === 'explain') {
      if (state.loading) body.push(h('div', { class: 'skeleton', style: { width: '95%' } }), h('div', { class: 'skeleton', style: { width: '75%' } }));
      else if (state.explain) body.push(h('div', { class: 'feedback', style: { color: 'var(--text)', fontSize: 'var(--fs-14)' } }, state.explain.sentence), state.explain.formula ? h('div', { class: 'formula', style: { marginBottom: '12px' } }, state.explain.formula) : null);
    }
    if (st.type === 'check') {
      canNext = st.quiz.every((_, qi) => state.quizAns[qi] != null);
      st.quiz.forEach((qq, qi) => {
        body.push(h('p', { class: 'q' }, qq.q));
        body.push(h('div', { class: 'opts' }, qq.options.map((o, i) => h('button', { class: 'opt' + (state.quizAns[qi] != null ? (i === qq.answer ? ' right' : i === state.quizAns[qi] ? ' wrong' : '') : ''), disabled: state.quizAns[qi] != null, onclick: () => { state.quizAns[qi] = i; render(); } }, letter(i), h('span', {}, o)))));
      });
    }
    const [, typeLabel] = STEP[st.type];
    const bt = bannerText(st);
    setBanner?.({ tag: `Lesson · ${idx + 1}/${lesson.steps.length}`, text: bt === lesson.title ? lesson.title : `${lesson.title}: ${bt}` });
    const sheet = asSheet.matches && coach;
    const card = h('section', { class: 'lesson', 'aria-label': `Lesson: ${lesson.title}` },
      // Progress: a dot per step, with only the current step named.
      h('div', { class: 'lesson-top' },
        h('div', { class: 'phase-rail', role: 'img', 'aria-label': `Step ${idx + 1} of ${lesson.steps.length}: ${typeLabel}` }, lesson.steps.map((s0, i) => h('span', { class: i < idx ? 'on' : i === idx ? 'cur' : '' }, h('i'), i === idx ? h('b', {}, typeLabel) : null))),
        h('span', { class: 'lt-act' }, h('button', { class: 'link', title: 'Back to the state this step started from', onclick: replay, disabled: !snaps[idx] }, 'Replay'), h('button', { class: 'link', onclick: stop }, 'Exit'),
          sheet ? h('button', { class: 'ib sheet-min', 'aria-label': sheetMin ? 'Expand the lesson' : 'Minimize the lesson', 'aria-expanded': String(!sheetMin), onclick: () => { sheetMin = !sheetMin; render(); } }, svgIcon('chev-down')) : null)),
      h('h3', {}, lesson.title), ...body,
      h('div', { class: 'lesson-foot' }, idx > 0 ? h('button', { class: 'btn ghost', onclick: back }, 'Back') : h('span'),
        h('button', { class: 'btn primary', disabled: !canNext, onclick: () => { if (st.type === 'predict' && st.mode === 'draw') dock.profile.endPredict(false); next(); } }, idx === lesson.steps.length - 1 ? 'Finish lesson' : 'Continue', svgIcon('chev-right'))));
    const target = sheet ? coach : hostEl;
    (target === coach ? hostEl : coach)?.replaceChildren();
    target.replaceChildren(card);
    card.classList.toggle('sheet', !!sheet);
    card.classList.toggle('min', !!sheet && sheetMin);
    // The figure gives up (or takes back) the sheet's height.
    requestAnimationFrame(() => stage?.relayout());
  }

  store.on('mode', (m) => { if (m !== 'learn' && lesson) stop(); render(); });
  asSheet.addEventListener('change', () => { render(); if (lesson && !asSheet.matches) openPanel?.('chart'); });
  return { openList, start, stop, render, active: () => !!lesson };
}
