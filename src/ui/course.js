// The course (guided-learning rethink, option A): eight units in a fixed order, then a final
// assessment. A unit is a lesson (learn.js runs it) with `unit` set; it runs on the unit surface,
// where the card at the bottom owns the screen and the rest of the chrome is hidden.
// Progress lives on this device in pps.course; plans/course-api.md documents the shapes.

import { store } from './store.js?v=49dc9cdf15';
import { h, svgIcon } from './util.js?v=e803df99cd';
import { CASE_UNITS } from './cases/units.js?v=bde5f54566';

// A unit: id, n (its number), part ('A' mechanism, 'B' clinic), title, objective (what the student
// can do after it), minutes, keyPoints (three margin notes, kept for the summary page) and steps
// (learn.js step types; a unit uses stem, frame/observe for Watch, do for Try and keypoints).
// `draft: true` marks a unit whose content is still a placeholder.
const stub = (objective) => [
  { sid: 'intro', type: 'frame', tools: ['select'], text: `This unit is being written. Its objective: ${objective}` },
  { sid: 'keypoints', type: 'keypoints' },
];
// Part A, mechanism (units 1–5). Each runs: Vignette (stem, "Show me") → Watch (view and pressure
// ladder) → one-control Try → two Check stems → Key points, about 8 minutes. The merged lessons
// sit in them as single steps: the Doppler direction (unit 1), the splenic vein clot (unit 3) and
// carvedilol (unit 4).
const SITE_OPTIONS = ['Splenic vein', 'Main portal vein', 'Presinusoidal portal venules', 'Hepatic sinusoids', 'Hepatic veins'];
// Units 6–8 run a case on the unit surface (cases.js startUnit); their stems also feed the review card.
function caseUnit(id) {
  const d = CASE_UNITS[id];
  return d ? { caseUnit: true, draft: false, keyPoints: d.keyPoints, steps: d.steps.filter((s) => s.type === 'stem') } : {};
}
export const UNITS = [
  { id: 'u1-normal', n: 1, part: 'A', title: 'Normal portal circulation', minutes: 7,
    objective: 'Trace portal flow from gut to heart; state normal portal pressure, HVPG and flow direction on Doppler.',
    keyPoints: ['Gut and spleen drain through the superior mesenteric and splenic veins into the portal vein, then the sinusoids, hepatic veins, IVC and right atrium. There are no valves: flow follows pressure.', 'Normal portal pressure is about 5–10 mmHg; normal HVPG is 1–5 mmHg.', 'Normal portal Doppler: continuous, gently phasic flow toward the liver (hepatopetal). Flow away from it (hepatofugal) means advanced portal hypertension; a pulsatile trace means a congested right heart.'],
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'healthy', view: 'circuit', zoom: 'fit', next: 'Show me',
        stem: 'A 32-year-old man is evaluated as a living kidney donor. He drinks no alcohol, takes no medications and feels well. Examination shows no spleen tip, no ascites and no stigmata of liver disease. Liver tests and platelet count are normal. Abdominal ultrasound with Doppler is performed.',
        q: 'Which of the following findings in the main portal vein is expected?',
        options: ['Continuous, gently phasic flow toward the liver', 'Continuous flow away from the liver', 'Pulsatile flow that reverses with each heartbeat', 'No detectable flow, with echogenic material in the lumen', 'Flow toward the liver at a velocity under 10 cm/s'], answer: 0,
        explain: ['Normal: portal blood runs downhill into the liver (hepatopetal), with mild variation from breathing and the heart.', 'Hepatofugal flow appears when resistance in the liver exceeds that of the collaterals, in advanced cirrhosis.', 'A pulsatile, to-and-fro portal trace reflects a high right atrial pressure, as in tricuspid regurgitation.', 'Absent flow with material in the lumen is portal vein thrombosis.', 'Slow portal flow suggests portal hypertension; normal mean velocity is roughly 15–40 cm/s.'] },
      { sid: 'watch-circuit', type: 'frame', preset: 'healthy', view: 'circuit', zoom: 'fit', tools: ['select'], ladder: true, focus: ['SV_CONF', 'PV_TRUNK', 'RHV_IVC'], focusLabel: 'Splenic, portal and hepatic veins',
        text: 'This is the **Circuit** view. Blood from the gut and spleen joins in the portal vein, crosses the liver through the sinusoids and leaves by the hepatic veins for the cava and right atrium. Pressure falls only a few mmHg along the way: the ladder shows the steps.' },
      { sid: 'try-dye', type: 'do', preset: 'healthy', tools: ['select'], view: 'circuit', dye: 'SV_CONF', dyeLabel: 'Inject dye into the splenic vein', focus: ['SV_CONF', 'PV_TRUNK'], focusLabel: 'Splenic and portal veins',
        text: '**Inject dye into the splenic vein** and follow it.',
        after: 'The dye runs toward the liver, spreads through it and leaves through the hepatic veins for the heart: downhill, along the pressure slope. With no valves, a block anywhere on this route raises pressure behind it.', stay: true, goal: (f, p, log, s) => s.dyed },
      { sid: 'watch-doppler', type: 'frame', preset: 'cirr-hepatofugal', view: 'anatomic', zoom: 'fit', tab: 'doppler', probe: 'PV_TRUNK', tools: ['select', 'doppler'], focus: ['PV_TRUNK'], focusLabel: 'Portal vein',
        text: 'Doppler reads the same direction at the bedside. Healthy portal flow is **hepatopetal**, toward the liver; in this patient with end-stage cirrhosis it runs **hepatofugal**, away from the liver into the collaterals. Read the direction from the report and the anatomy, not the colour: the colour depends on how the probe is set.' },
      { sid: 'check-1', type: 'stem', preset: 'healthy',
        stem: 'A 41-year-old woman undergoes transjugular liver biopsy for unexplained raised aminotransferases. Hepatic vein pressures are recorded before the biopsy. Histology later shows mild steatosis without fibrosis.',
        q: 'Which of the following hepatic venous pressure gradients is most consistent with her histology?',
        options: ['3 mmHg', '7 mmHg', '11 mmHg', '16 mmHg', '22 mmHg'], answer: 0,
        explain: ['Normal HVPG is 1–5 mmHg, as expected without fibrosis.', 'Above 5 is portal hypertension; 6–9 is the subclinical range seen with early fibrosis.', '10 or more is clinically significant portal hypertension: varices and ascites become possible.', 'A gradient this high goes with established cirrhosis.', 'Over 20 is seen in decompensated cirrhosis, often during a bleed.'] },
      { sid: 'check-2', type: 'stem', preset: 'cirr-hepatofugal',
        stem: 'A 63-year-old man with long-standing hepatitis C cirrhosis has a surveillance ultrasound. The liver is small and nodular, the spleen is 16 cm and a large spontaneous splenorenal shunt is seen. Doppler shows continuous flow in the main portal vein directed away from the liver.',
        q: 'Which of the following best explains the direction of portal flow?',
        options: ['Resistance in the liver exceeds that of the portosystemic collaterals', 'Right atrial pressure exceeds portal pressure', 'An occlusive thrombus in the portal vein', 'Increased hepatic arterial inflow from a TIPS', 'Inversion of the colour map by the operator'], answer: 0,
        explain: ['Blood takes the easier exit: when the liver resists more than the collaterals, portal flow reverses (hepatofugal).', 'A high right atrial pressure makes portal flow pulsatile, not continuously reversed.', 'An occlusive thrombus gives no flow in the portal vein.', 'There is no TIPS; a TIPS can reverse flow in the intrahepatic portal branches, not usually in the main portal vein.', 'A colour inversion swaps the colours but not the true direction, which the report states from the anatomy.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u2-hvpg', n: 2, part: 'A', title: 'Measuring portal pressure: HVPG', minutes: 8,
    objective: 'Define WHVP, FHVP and HVPG; apply the 5, 10 and 12 mmHg cut-offs; say when HVPG is falsely normal.',
    keyPoints: ['HVPG = WHVP − FHVP. Normal is up to 5 mmHg; 10 or more is clinically significant portal hypertension.', 'On a beta blocker, a fall in HVPG of 20 % or more, or to 12 mmHg or below, is a response.', 'The wedge reads the sinusoids: a presinusoidal or prehepatic block (schistosomiasis, PSVD, portal vein thrombosis) gives a falsely normal HVPG; a failing heart raises both pressures, and clotted hepatic veins cannot be wedged.'],
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'csph', view: 'anatomic', zoom: 'fit', next: 'Show me',
        stem: 'A 56-year-old man with compensated cirrhosis from metabolic dysfunction-associated steatotic liver disease undergoes hepatic vein catheterization through the right internal jugular vein. Free hepatic venous pressure is 8 mmHg, wedged hepatic venous pressure is 21 mmHg and right atrial pressure is 6 mmHg.',
        q: 'Which of the following is his hepatic venous pressure gradient?',
        options: ['2 mmHg', '8 mmHg', '13 mmHg', '15 mmHg', '21 mmHg'], answer: 2,
        explain: ['2 is free minus right atrial pressure, not the HVPG.', '8 is the free pressure alone.', 'Wedged minus free: 21 − 8 = 13 mmHg, clinically significant portal hypertension.', '15 is wedged minus right atrial pressure; the free hepatic pressure is the right reference.', '21 is the wedged pressure alone, which also carries the abdominal pressure.'] },
      { sid: 'watch-wedge', type: 'frame', preset: 'csph', view: 'anatomic', zoom: 'fit', tools: ['select'], ladder: true, focus: ['RHV_IVC', 'SIN_RR'], focusLabel: 'Hepatic vein and sinusoids',
        text: 'A catheter from the neck reads the **free** pressure in a hepatic vein. A balloon then blocks the vein, and the still column in front of it reads the **wedged** pressure, which stands in for the sinusoids. Wedged minus free is the **HVPG**: the drop across the liver on the ladder.' },
      { sid: 'try-measure', type: 'do', preset: 'csph', tools: ['select'], tab: 'hvpg', text: 'Tap **Measure HVPG** and watch the catheter, the balloon and the tracing.', hint: 'The button is at the top of the HVPG card.',
        after: 'Over 10 mmHg: clinically significant portal hypertension, the level at which varices, ascites and bleeding become likely.', stay: true, goal: (f, p, log) => log.some((a) => a.type === 'hvpg') },
      { sid: 'watch-false-normal', type: 'frame', preset: 'schisto', view: 'anatomic', zoom: 'fit', tools: ['select'], ladder: true, focus: ['PRE_R', 'PRE_L'], focusLabel: 'Small portal branches',
        text: 'Schistosomiasis: portal pressure is high, but it drops in the portal tracts, **before** the sinusoids, where the wedge cannot see it. The HVPG is normal despite large varices; the portosystemic gradient (**PPG**, portal vein minus IVC) catches it. A failing right heart raises wedged and free pressures together, and clotted hepatic veins cannot be wedged at all.' },
      { sid: 'check-1', type: 'stem', preset: 'schisto',
        stem: 'A 47-year-old woman has large esophageal varices and a spleen 18 cm long. Bilirubin, albumin and INR are normal; platelets are 70 ×10⁹/L. Liver stiffness is 7 kPa. HVPG is 6 mmHg. Liver biopsy shows obliterative portal venopathy without cirrhosis.',
        q: 'Which of the following best explains the near-normal HVPG?',
        options: ['The resistance lies upstream of the sinusoids', 'Collaterals have decompressed the portal system', 'The balloon was not fully occluding the vein', 'A high right atrial pressure raised the free pressure', 'Portal hypertension has resolved'], answer: 0,
        explain: ['Porto-sinusoidal vascular disorder (PSVD): the block is in the small portal veins, before the wedge, so HVPG underestimates portal pressure.', 'Collaterals divert flow but do not bring portal pressure back to normal; her large varices show it is high.', 'Incomplete wedging is a technical cause of a low reading, but the biopsy explains it here.', 'Nothing suggests heart failure; that would also bring hepatomegaly and high-protein ascites.', 'Large varices and a big spleen with low platelets show active portal hypertension.'] },
      { sid: 'check-2', type: 'stem', preset: 'csph',
        stem: 'A 60-year-old man with alcohol-related cirrhosis, abstinent for 2 years, has an HVPG of 18 mmHg. He starts carvedilol. Three months later the HVPG is 13 mmHg; heart rate has fallen from 84 to 66/min.',
        q: 'Which of the following best describes his response?',
        options: ['A response: the HVPG fell by more than 20 %', 'No response: the HVPG is still above 12 mmHg', 'No response: the HVPG is still above 10 mmHg', 'A response only because his heart rate fell by 20 %', 'Cannot be judged without a repeat endoscopy'], answer: 0,
        explain: ['18 to 13 is a 28 % fall: a fall of 20 % or more, or to 12 mmHg or below, counts as a response.', 'Reaching 12 mmHg is one way to respond; a 20 % fall is the other.', 'Falling below 10 is not required to call a response.', 'Heart rate does not predict the portal pressure response.', 'The HVPG answers the question directly; the scope does not.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u3-site', n: 3, part: 'A', title: 'Site of obstruction', minutes: 9,
    objective: 'Localise the block from liver tests, SAAG and protein, HVPG and Doppler.',
    keyPoints: ['Prehepatic and presinusoidal blocks: normal liver tests, normal HVPG, big varices.', 'Sinusoidal block (cirrhosis): high HVPG, low-protein ascites, sick liver.', 'Post-sinusoidal and cardiac: high-protein ascites, hepatomegaly; HVPG normal in heart failure.'],
    practice: 'Localise the block in 5 patients',
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'healthy', view: 'anatomic', next: 'Show me',
        stem: 'A 28-year-old man who grew up in rural Egypt presents after an episode of hematemesis. He has no history of alcohol use. The spleen is palpable 6 cm below the costal margin; there is no ascites or jaundice. Bilirubin 0.8 mg/dL, albumin 4.1 g/dL, INR 1.0, platelets 90 ×10⁹/L. Upper endoscopy shows large esophageal varices. HVPG is 4 mmHg.',
        q: 'Which of the following is the most likely site of increased resistance?',
        options: SITE_OPTIONS, answer: 2,
        explain: ['A splenic vein block gives isolated gastric varices, not large esophageal ones.', 'Portal vein thrombosis also keeps HVPG normal, but Doppler would show a cavernoma; his exposure points to schistosomiasis.', 'Schistosomal periportal fibrosis: the block sits before the sinusoids, so the wedged pressure and HVPG stay normal.', 'Sinusoidal disease (cirrhosis) raises the HVPG, and the liver tests would be abnormal.', 'A hepatic vein block gives ascites with high protein and an enlarged liver.'] },
      { sid: 'watch-anatomy', type: 'frame', preset: 'schisto', view: 'anatomic', zoom: 'fit', tools: ['select'], ladder: true, focus: ['PRE_R', 'PRE_L'], focusLabel: 'Small portal branches',
        text: 'Blood falls from the portal vein through the sinusoids to the hepatic veins. A block **before** the sinusoids raises portal pressure, but the wedged pressure, measured beyond the block, stays normal. So the HVPG is normal.' },
      { sid: 'watch-lobule', type: 'frame', preset: 'schisto', zoom: 'lobule', tools: ['select'],
        text: 'The fibrosis sits around the portal tracts; the sinusoids are open. Liver function is preserved: normal albumin, normal INR, no ascites.' },
      { sid: 'try-splenic', type: 'do', preset: 'healthy', view: 'circuit', zoom: 'fit', tools: ['select', 'thrombus'], focus: ['SV_CONF'], focusLabel: 'Splenic vein',
        text: 'Now **put a clot in the splenic vein**. Watch which pressures rise.', hint: 'Tap the splenic vein on the figure, then drag Clot to 100 %.',
        data: [{ label: 'Splenic vein', metric: 'sv', unit: 'mmHg' }, { label: 'Portal vein', metric: 'pv', unit: 'mmHg' }],
        after: 'Only the splenic side rises; portal pressure and HVPG are unchanged. This is left-sided portal hypertension: isolated fundal varices with a normal liver, treated by splenectomy or splenic artery embolisation, not by TIPS.',
        stay: true, goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.99 },
      { sid: 'check-1', type: 'stem', preset: 'budd-chiari',
        stem: 'A 34-year-old woman taking a combined oral contraceptive has had two weeks of right upper quadrant pain and rapidly increasing abdominal girth. The liver is enlarged and tender. Ascitic fluid: SAAG 1.8 g/dL, protein 3.2 g/dL. Doppler shows no flow in the hepatic veins.',
        q: 'Which of the following is the most likely site of increased resistance?',
        options: SITE_OPTIONS, answer: 4,
        explain: ['A splenic vein block does not cause ascites.', 'Portal vein thrombosis seldom causes much ascites, and Doppler would show the clot in the portal vein.', 'A presinusoidal block spares the sinusoids, so ascites is uncommon.', 'Sinusoidal (cirrhotic) ascites has protein under 2.5 g/dL; hers is high.', 'Budd-Chiari: no hepatic vein flow, a big tender liver and high-protein ascites.'] },
      { sid: 'check-2', type: 'stem', preset: 'cirr-decomp',
        stem: 'A 52-year-old man with 20 years of heavy alcohol use presents with ascites. Albumin 2.6 g/dL, INR 1.7, bilirubin 2.4 mg/dL. Ascitic fluid: SAAG 1.6 g/dL, protein 1.1 g/dL. HVPG is 16 mmHg.',
        q: 'Which of the following is the most likely site of increased resistance?',
        options: SITE_OPTIONS, answer: 3,
        explain: ['A splenic vein block leaves the HVPG and the liver normal.', 'A portal vein block keeps the HVPG normal.', 'A presinusoidal block keeps the HVPG normal and the liver working.', 'Cirrhosis: high HVPG, low-protein ascites and a failing liver.', 'A hepatic vein block gives high-protein ascites.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u4-varices', n: 4, part: 'A', title: 'Varices and collaterals', minutes: 9,
    objective: 'Explain why collaterals open, where varices form and who bleeds; choose primary prophylaxis.',
    keyPoints: ['A raised portal pressure opens portosystemic collaterals; esophageal varices fill from the left gastric vein once HVPG reaches about 10 mmHg.', 'Bleeding risk rises with varix size, red wale marks and Child–Pugh B or C: wall tension grows with pressure and diameter.', 'Beta blockers lower gut inflow (carvedilol also lowers resistance in the liver); carvedilol is preferred in compensated cirrhosis with CSPH. Banding treats the varix, not the pressure.'],
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'csph', view: 'anatomic', zoom: 'fit', next: 'Show me',
        stem: 'A 58-year-old woman with compensated alcohol-related cirrhosis (Child–Pugh A), abstinent for a year, has a screening upper endoscopy. She has never bled or had ascites. Liver stiffness is 32 kPa and platelets are 95 ×10⁹/L. Endoscopy shows two large esophageal varices without red signs. Heart rate is 82/min and blood pressure 128/76 mmHg; she has no asthma.',
        q: 'Which of the following is the most appropriate next step?',
        options: ['Carvedilol', 'Isosorbide mononitrate', 'Transjugular intrahepatic portosystemic shunt (TIPS)', 'Repeat endoscopy in 2 years', 'Octreotide infusion'], answer: 0,
        explain: ['Carvedilol lowers portal pressure and the risk of a first bleed and of decompensation; banding is the alternative if she cannot take it.', 'Nitrates alone do not prevent a first bleed and can lower blood pressure.', 'TIPS is not used to prevent a first bleed.', 'Large varices with clinically significant portal hypertension need treatment now, not surveillance.', 'Octreotide is a short-term treatment for an active bleed.'] },
      { sid: 'watch-collaterals', type: 'frame', preset: 'csph', view: 'anatomic', zoom: 'fit', tab: 'endoscopy', tools: ['select', 'endoscope'], ladder: true, focus: ['C1a', 'C1b'], focusLabel: 'Left gastric vein and esophageal varix',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }],
        text: 'Portal blood that cannot get through the stiff liver turns back through the left gastric vein into the veins under the esophageal lining, which swell into **varices**. They open once the HVPG reaches about 10 mmHg. The dial reads the tension in the varix wall.' },
      { sid: 'watch-grow', type: 'observe', preset: 'csph', lapse: { days: 180, speed: 15, ramp: { cirrhosis: [0.6, 0.85] } }, tools: ['select', 'endoscope'], tab: 'endoscopy', focus: ['C1a', 'C1b'], focusLabel: 'Esophageal varices',
        data: [{ label: 'Varix size', metric: (m) => m.varix.d, fmt: (d) => `${Math.round(d)} mm` }, { label: 'Wall tension', metric: (m) => m.varix.ratio, dial: true }, { label: 'HVPG', metric: 'hvpg', unit: 'mmHg' }],
        text: 'Time-lapse: six months as the liver scars and the gradient climbs. The varix widens, its wall thins and the tension swings toward red. Large size, red wale marks and a sicker liver (Child–Pugh B or C) are what predict a bleed.' },
      { sid: 'try-carvedilol', type: 'do', preset: 'csph', tools: ['select'], controls: ['drugs', 'drug:carvedilol'],
        text: 'Start **carvedilol** and watch the gradient.',
        data: [{ label: 'HVPG', metric: 'hvpg', unit: 'mmHg', pct: true }, { label: 'Heart rate', metric: 'hr', d: 0, unit: 'bpm' }],
        after: 'Cirrhosis opens the gut’s arteries, so more blood pours into a stiff liver. Carvedilol turns the inflow down and relaxes the liver a little: the gradient falls, the heart slows. A fall of 20 % or more, or to 12 or below, is a response.',
        stay: true, goal: (f, p) => p.drugs.carvedilol },
      { sid: 'check-1', type: 'stem', preset: 'cirr-decomp',
        stem: 'A 61-year-old man with Child–Pugh C cirrhosis from hepatitis B has a screening upper endoscopy. He has never had gastrointestinal bleeding.',
        q: 'Which of the following endoscopic findings carries the highest risk of a first variceal bleed?',
        options: ['Small varices without red signs', 'Small varices with red wale marks', 'Large varices without red signs', 'Large varices with red wale marks', 'Varices eradicated by previous banding'], answer: 3,
        explain: ['The lowest-risk finding listed.', 'Red marks raise the risk, but a small varix has less wall tension than a large one.', 'Size raises the risk; red marks would raise it further.', 'Large size, red wale marks and Child–Pugh C together carry the highest risk.', 'Once eradicated, the varices need surveillance for recurrence, not urgent treatment.'] },
      { sid: 'check-2', type: 'stem', preset: 'cirr-decomp',
        stem: 'A 49-year-old woman with alcohol-related cirrhosis bled from esophageal varices 3 months ago. Repeated band ligation has since eradicated them. She takes no other medication. Blood pressure is 118/70 mmHg and heart rate 88/min.',
        q: 'Which of the following should be added to reduce her risk of rebleeding?',
        options: ['A non-selective beta blocker', 'A long-term proton pump inhibitor', 'Isosorbide mononitrate alone', 'TIPS now, with no further bleeding', 'Weekly banding indefinitely'], answer: 0,
        explain: ['Bands remove the varix, not the pressure: after a bleed, a non-selective beta blocker is combined with banding.', 'A proton pump inhibitor is given briefly for banding ulcers; it does not lower portal pressure.', 'Nitrates alone are not effective against rebleeding.', 'A pre-emptive TIPS is placed within 72 hours of a high-risk bleed; later, TIPS is for rebleeding despite drugs and banding.', 'Banding is repeated only until the varices are gone, then for recurrence.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u5-ascites', n: 5, part: 'A', title: 'Ascites', minutes: 8,
    objective: 'Explain sinusoidal pressure and albumin; read SAAG and protein; choose first-line treatment.',
    keyPoints: ['A high sinusoidal pressure pushes fluid out of the liver. In cirrhosis, scarred sinusoids hold albumin back, so the ascites is low in protein.', 'Tap every new ascites: SAAG 1.1 g/dL or more means portal hypertension; protein under 2.5 g/dL points to the sinusoids, 2.5 or more to the hepatic veins or the heart.', 'First line is a low-salt diet and spironolactone, with or without furosemide. Drain tense ascites, and give albumin (6–8 g per litre) when more than 5 L is removed.'],
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'cirr-decomp', params: { diuretics: false }, view: 'anatomic', zoom: 'fit', next: 'Show me',
        stem: 'A 57-year-old man with alcohol-related cirrhosis has had 3 weeks of increasing abdominal girth. He has no fever or abdominal pain. The abdomen is distended with shifting dullness but is not tense. Serum sodium 134 mmol/L, creatinine 0.9 mg/dL, serum albumin 2.8 g/dL. Diagnostic paracentesis: albumin 0.9 g/dL, total protein 1.2 g/dL, neutrophils 80/mm³.',
        q: 'Which of the following is the most appropriate initial management?',
        options: ['Sodium restriction and spironolactone', 'Large-volume paracentesis with albumin', 'Fluid restriction to 1 L a day', 'Intravenous ceftriaxone', 'TIPS'], answer: 0,
        explain: ['Moderate ascites from portal hypertension (SAAG 1.9): a low-salt diet and spironolactone, with furosemide added as needed.', 'A large-volume tap is first line for tense ascites; his is not tense.', 'Fluid restriction is only for marked hyponatraemia, around 125 mmol/L or lower.', 'Neutrophils under 250/mm³ exclude spontaneous bacterial peritonitis.', 'TIPS is for refractory ascites, after diuretics have failed.'] },
      { sid: 'watch-sinusoid', type: 'observe', seconds: 10, preset: 'cirr-decomp', tools: ['select'], zoom: 'lobule', sinusoid: true, ladder: true,
        text: 'Inside one sinusoid of his liver. Its high pressure drives water out, but scar has sealed most of the pores in its lining, so albumin (amber) is turned back at the wall. The fluid that reaches his belly is **low in protein**.' },
      { sid: 'watch-fluid', type: 'frame', preset: 'cirr-decomp', tools: ['select'], zoom: 'fit', tab: 'abdomen', fluids: ['cirr-decomp', 'budd-chiari', 'rhf'],
        text: 'Read the tap in two steps. The **SAAG** (serum minus ascitic albumin) of 1.1 g/dL or more means portal hypertension, as in all three patients here. Then the **protein**: under 2.5 g/dL in cirrhosis, higher when the block is in the hepatic veins or at the heart, where the congested sinusoids still have open pores.' },
      { sid: 'try-drain', type: 'do', preset: 'cirr-decomp', params: { diuretics: false }, afterDays: 300, tools: ['select', 'needle'], tab: 'abdomen', focus: ['IVC_IS'], focusLabel: 'Abdomen',
        data: [{ label: 'Ascites', metric: 'ascites.volume', d: 0, unit: 'mL' }, { label: 'Abdominal pressure', metric: 'ascites.iap', d: 1, unit: 'mmHg' }],
        text: 'Months on, his ascites is tense. **Drain** it with albumin on, and watch the belly and its pressure.', hint: 'The volume removed is the smaller of 5 L and the fluid present.',
        after: 'The belly softens and its pressure falls. The tap treats the belly, not the liver: without salt restriction and diuretics the fluid comes back within weeks.',
        stay: true, goal: (f, p, log) => log.some((a) => a.type === 'action' && a.target === 'paracentesis') },
      { sid: 'check-1', type: 'stem', preset: 'rhf',
        stem: 'A 66-year-old woman has 2 months of breathlessness, leg swelling and abdominal distension. Jugular venous pressure is raised to the angle of the jaw and the liver is enlarged and pulsatile. Ascitic fluid: SAAG 1.5 g/dL, total protein 3.4 g/dL, neutrophils 40/mm³.',
        q: 'Which of the following is the most likely cause of her ascites?',
        options: ['Cirrhosis', 'Heart failure', 'Peritoneal carcinomatosis', 'Nephrotic syndrome', 'Tuberculous peritonitis'], answer: 1,
        explain: ['Cirrhotic ascites has a high SAAG but protein under 2.5 g/dL.', 'High SAAG with high protein, a raised JVP and a pulsatile liver: congestion from the heart.', 'Malignant ascites has a SAAG under 1.1 g/dL.', 'Nephrotic ascites has a low SAAG and very low protein.', 'Tuberculous ascites has a low SAAG and is rich in lymphocytes.'] },
      { sid: 'check-2', type: 'stem', preset: 'cirr-decomp',
        stem: 'A 59-year-old man with cirrhosis and tense ascites has 7 L of fluid removed by paracentesis. Blood pressure is 104/62 mmHg and creatinine 1.0 mg/dL.',
        q: 'Which of the following is most appropriate to prevent circulatory dysfunction after the tap?',
        options: ['Intravenous albumin, 6–8 g per litre removed', 'Intravenous 0.9 % saline, 1 L', 'Fresh frozen plasma', 'Intravenous furosemide', 'No replacement'], answer: 0,
        explain: ['Albumin after a tap of more than 5 L keeps the circulating volume up and protects the kidneys.', 'Saline is less effective than albumin after a large-volume tap.', 'Plasma corrects clotting factors, not the circulating volume.', 'A diuretic now would deepen the fall in circulating volume.', 'Without albumin, a tap over 5 L risks kidney injury and hyponatraemia.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u6-new-ascites', n: 6, part: 'B', title: 'New-onset ascites', minutes: 9, draft: true,
    objective: 'Order the right tests, read the tap, localise the cause and start treatment.' },
  { id: 'u7-bleed', n: 7, part: 'B', title: 'Acute variceal bleeding', minutes: 10, draft: true,
    objective: 'Run the first hour, band, prevent rebleeding and know when to use TIPS.' },
  { id: 'u8-refractory', n: 8, part: 'B', title: 'Refractory ascites and TIPS', minutes: 10, draft: true,
    objective: 'Recognise refractory ascites and weigh TIPS against paracentesis and albumin.' },
].map((u) => ({ steps: stub(u.objective), keyPoints: [], ...u, ...caseUnit(u.id), unit: u.n, pearls: null }));
export const FINAL = { id: 'final', title: 'Final assessment', minutes: 15, objective: 'Ten mixed vignettes; pass at 70 %.' };
export const PARTS = { A: 'Mechanism', B: 'Clinic' };

// ── Progress ────────────────────────────────────────
// pps.course = { done: { [unitId]: { score, date } }, at: { [unitId]: stepIndex }, unlockAll }
const KEY = 'pps.course';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { done: v.done || {}, at: v.at || {}, unlockAll: !!v.unlockAll }; } catch { return { done: {}, at: {}, unlockAll: false }; } };
const write = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

export const course = {
  progress: read,
  unit: (id) => UNITS.find((u) => u.id === id) || null,
  /** 'done' | 'open' | 'locked'. A unit opens when the one before it is done, or for an instructor who unlocked all. */
  state(id) {
    const p = read(), i = UNITS.findIndex((u) => u.id === id);
    if (id === FINAL.id) return p.done.final ? 'done' : UNITS.every((u) => p.done[u.id]) || this.allUnlocked() ? 'open' : 'locked';
    if (i < 0) return 'locked';
    if (p.done[id]) return 'done';
    return i === 0 || p.done[UNITS[i - 1].id] || this.allUnlocked() ? 'open' : 'locked';
  },
  /** The unit "Continue" opens: one in progress, else the first open one not done; null when all are done. */
  next() {
    const p = read();
    return UNITS.find((u) => p.at[u.id] > 0 && !p.done[u.id] && this.state(u.id) === 'open') || UNITS.find((u) => this.state(u.id) === 'open') || null;
  },
  doneCount: () => { const p = read(); return UNITS.filter((u) => p.done[u.id]).length; },
  /** The step to resume at (0 when new or finished). */
  resumeAt: (id) => (read().done[id] ? 0 : read().at[id] || 0),
  saveStep(id, idx) { const p = read(); p.at[id] = idx; write(p); },
  complete(id, score) { const p = read(); p.done[id] = { score: Math.max(score ?? 0, p.done[id]?.score ?? 0), date: new Date().toISOString() }; delete p.at[id]; write(p); },
  allUnlocked: () => store.get().role === 'instructor' && read().unlockAll,
  setUnlockAll(on) { const p = read(); p.unlockAll = !!on; write(p); },
  /** Key points of the finished units, in course order (the summary page). */
  keyPoints: () => { const p = read(); return UNITS.filter((u) => p.done[u.id] && u.keyPoints.length).map((u) => ({ unit: u, points: u.keyPoints })); },
};

// ── The unit surface ────────────────────────────────
// One hook for every runner (lessons now; cases and the final assessment later): it hides the top bar,
// readouts, narrator, Why?, zoom, timeline, side panel and cards (styles: .app.unit-on), so the card
// at the bottom owns the screen. `opts.try` lets the figure take input (a Try step).
export function setUnitSurface(on, opts = {}) {
  const app = document.getElementById('app');
  if (!app) return;
  const was = app.classList.contains('unit-on');
  app.classList.toggle('unit-on', !!on);
  app.classList.toggle('unit-try', !!on && !!opts.try);
  if (was !== !!on) { store.set({ unitSurface: !!on }); dispatchEvent(new Event('resize')); }
}
export const unitSurfaceOn = () => !!document.getElementById('app')?.classList.contains('unit-on');

/** "Unit 3 · 4 of 7" and a thin bar: the progress line at the top of a unit's card. */
export function unitBar(unit, idx, total) {
  const pct = Math.round((100 * (idx + 1)) / Math.max(1, total));
  return h('div', { class: 'unit-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(idx + 1), 'aria-label': `Unit ${unit.n}, step ${idx + 1} of ${total}` },
    h('span', { class: 'ub-t' }, h('b', {}, `Unit ${unit.n}`), ` · ${idx + 1} of ${total}`),
    h('span', { class: 'ub-track' }, h('i', { style: { width: `${pct}%` } })));
}

/** "Open this patient in Explore": the end-of-unit action. It shows the patient the unit ends on (or
 *  `unit.explore`, a preset id) and calls `done({ explore: presetId })`; the runner then finishes the unit
 *  and main.js loads that patient through the patient-picker path. Any runner can place it on its last card. */
export function exploreButton(unit, done) {
  const id = unit.explore || store.get().presetId;
  const label = store.get().presetList?.find((p) => p.id === id)?.label;
  return h('button', { class: 'btn explore-here', title: label ? `Finish the unit and open ${label} in Explore` : 'Finish the unit and open this patient in Explore', onclick: () => done({ explore: id }) },
    svgIcon('explore'), 'Open this patient in Explore', label ? h('small', {}, label) : null);
}
