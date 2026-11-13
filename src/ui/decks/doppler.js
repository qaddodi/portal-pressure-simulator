// Presenter talk: Doppler of the portal system (Core). Slide fields as documented at the top of decks.js. The last half is Read the
// Doppler's five cases (deck rebuild plan D1, 25 Oct 2026): each case is one slide, the case card asking before the slide answers. The Doppler facts follow McNaughton and Abu-Yousef (RadioGraphics 2011);
// Baveno VIII 9.2 makes Doppler the first-line test for portal vein thrombosis (8.25 gives the diagnosis of Budd–Chiari syndrome).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const STENT = { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: { TIPS: 0.6 } };

export const DOPPLER = {
  id: 'doppler', level: 'core', title: 'Doppler of the portal system', minutes: 14,
  sections: [['Doppler basics', ['Doppler']], ['Reading a waveform', ['Cirrhosis', 'The method']], ['Portal inflow', ['Portal inflow']], ['Outflow', ['Outflow']], ['After TIPS', ['After TIPS']]],
  objectives: [
    'Interpret normal portal and hepatic vein Doppler: direction, velocity and waveform',
    'Read every waveform in the same order: direction, then velocity, then shape',
    'Distinguish hepatofugal portal flow, portal vein thrombosis, Budd–Chiari syndrome and right heart failure',
    'Recognize TIPS stenosis from the direction of left portal vein flow',
  ],
  checks: [
    ['In what order do you read a Doppler waveform, and what does a main portal vein waveform below the baseline mean?', 'Direction (above or below the baseline), then velocity, then shape (continuous, pulsatile or flat). Below the baseline is hepatofugal flow: portal blood flows away from the liver, out through portosystemic collaterals, in advanced cirrhosis.'],
    ['Portal flow is pulsatile with each cardiac cycle and the HVPG is normal. Where is the problem?', 'In the heart: elevated right atrial pressure is transmitted through the sinusoids to the portal vein.'],
    ['Six months after TIPS, left portal vein flow is hepatopetal. What do you suspect?', 'TIPS stenosis. Sample the stent at its proximal, mid and distal points and confirm with TIPS venography and a portosystemic gradient.'],
    ['Within 2 years, portal vein velocity falls from 25 to 12 cm/s with no thrombus. What moved?', 'Intrahepatic resistance rose, so less flow passes through the main portal vein and more is diverted through collaterals.'],
  ],
  summary: 'What Doppler measures in the portal and hepatic veins, and how to read a waveform in order: direction, velocity, shape. Five cases to interpret before the answer, from hepatofugal portal flow to TIPS stenosis, then a table that compares them.',
  slides: [
    {
      id: 'probe', terms: ['pv'], preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'color' },
      kicker: 'Doppler', title: 'Doppler measures portal vein velocity',
      eq: [mi('Q') + mo('=') + mi('\u{1D463}̄') + mo('×') + mi('A'), 'Q flow · v̄ mean velocity · A cross-sectional area of the vein'],
      line: 'The spectral display plots velocity over time. Portal vein flow is toward the transducer and the liver, so the waveform is above the baseline, at {>=15 cm/s}.',
      notes: 'The transducer insonates the vein and measures the Doppler frequency shift of echoes from moving red cells. The spectrum plots velocity against time: above the baseline is flow toward the transducer, displayed in orange-red, which for the portal vein is toward the liver. Normal portal flow is hepatopetal and continuous (monophasic) with mild respiratory phasicity, at ≥15 cm/s, usually 20 to 40 cm/s, as this monitor reads it. Mean velocity × cross-sectional area gives flow, about 1 L/min in health. The angle of insonation should be <60°, or the velocity is inaccurate.',
      ask: ['What are the normal direction and velocity of portal flow?', 'Toward the liver (hepatopetal), at ≥15 cm/s, usually 20 to 40 cm/s.'],
    },
    {
      id: 'hepatic', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true, mode: 'color' },
      kicker: 'Doppler', title: 'Hepatic vein flow is phasic with the cardiac cycle',
      line: 'Flow toward the heart lies below the baseline: S and D waves each cardiac cycle. Atrial contraction briefly reverses flow (a wave), with a small v wave between.',
      notes: 'The hepatic veins drain into the right atrium through a short segment of IVC, so their waveform reflects right atrial pressure. Flow toward the heart is displayed below the baseline in blue, and the reversal in orange-red. The normal waveform has four components: the a wave (atrial contraction) briefly reverses flow, the S wave carries blood toward the heart in ventricular systole, the small v wave turns toward the baseline as the atrium fills, and the D wave carries blood forward again in diastole. Tricuspid regurgitation enlarges the v wave. A noncompliant cirrhotic liver dampens the waveform to biphasic or monophasic. A tall a wave and S-wave reversal point to tricuspid regurgitation or an elevated right atrial pressure.',
      ask: ['What causes the brief reversal in the normal hepatic vein waveform?', 'Atrial contraction (the a wave).'],
    },
    {
      // (The same meal as the Circuit talk's, eased in over 8 days, as a time-lapse from fasting, on the seconds clock so the Doppler records the rise.)
      id: 'meal', params: { respiration: false }, days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal', clock: 'seconds' }, graph: false,   // (the Doppler record is this slide's time graph)
      cam: 'gut', lapseGlow: ['bowel'], labels: ['SMV', 'CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      data: 'tiles', tiles: ['pvFlow'], key: ['pvFlow'], delta: true,
      kicker: 'Doppler', title: 'Portal flow rises after a meal',
      line: 'Within 30 minutes of a meal, the splanchnic arterioles dilate and portal flow rises by 40 to 80%. Scan fasting, or velocity is overestimated and slow flow missed.',
      notes: 'Digestion dilates the splanchnic arterioles (postprandial hyperemia). Portal flow rises by about 40 to 80% and velocity by up to 100%, peaking about 30 minutes after eating and still elevated at 1 hour; the rise is blunted in cirrhosis. A normal liver accommodates the extra flow with little rise in pressure. Portal Doppler should be done fasting, or the velocity is overestimated and slow flow in early cirrhosis is missed. Liver stiffness also rises after a meal, which is why VCTE (FibroScan) is also done fasting.',
      ask: ['Why is portal Doppler done fasting?', 'A meal raises portal flow and velocity, which can mask the slow flow of portal hypertension.'],
    },
    {
      id: 'slow', lens: 'velocity', preset: 'cirr-decomp', params: { cirrhosis: 0.92 }, cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      data: 'tiles', tiles: ['pvVel'], key: ['pvVel'],
      kicker: 'Cirrhosis', site: 'sin', title: 'Cirrhosis lowers portal vein velocity',
      vignette: 'A 62-year-old man with alcohol-associated cirrhosis has large esophageal varices, and his ascites is controlled on diuretics. He comes fasting for a Doppler ultrasound.',
      caseQ: 'What will his portal vein velocity be?',
      line: 'Sinusoidal resistance slows portal flow to {pvVel}. A velocity {<15 cm/s} is abnormal.',
      notes: 'As intrahepatic resistance rises, portal vein velocity falls and the vein dilates (a main portal vein diameter >13 mm is a supportive but nonspecific sign). The congestion index, cross-sectional area divided by mean velocity, is about 0.07 cm × s in health; >0.1 suggests portal hypertension. These signs are specific but insensitive: a normal Doppler does not exclude clinically significant portal hypertension. Splenomegaly, portosystemic collaterals and hepatofugal flow in a recanalized paraumbilical vein support the diagnosis.',
      ask: ['What portal vein velocity is abnormal?', 'A velocity <15 cm/s.'],
    },
    {
      id: 'normal', terms: ['pv'], preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvVel'], key: ['pvVel'],
      kicker: 'The method', title: 'Read every waveform in the same order',
      line: 'Read direction first, then velocity, then shape. Normally the portal vein is hepatopetal, above the baseline, at {pvVel}, continuous with mild respiratory variation.',
      notes: 'Above the baseline is flow toward the transducer, which for the main portal vein means toward the liver. Normal portal vein velocity is ≥15 cm/s, usually 20 to 40 cm/s. The waveform is continuous with mild respiratory variation. Every case that follows is read the same way: direction, velocity, then shape.',
      ask: ['Describe the normal main portal vein waveform.', 'Above the baseline (hepatopetal), ≥15 cm/s, continuous with mild respiratory variation.'],
    },
    {
      id: 'a1', lens: 'direction', preset: 'cirr-hepatofugal', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'color' },
      vignette: 'A 63-year-old man with HCV cirrhosis has had two admissions for hepatic encephalopathy this year. He comes fasting for Doppler ultrasound before TIPS is considered.',
      caseQ: 'What direction will his portal flow be?',
      kicker: 'Portal inflow', site: 'sin', title: 'Below the baseline: hepatofugal portal flow',
      line: 'The spectrum is below the baseline: portal flow is hepatofugal, out through a splenorenal shunt. It signals a large spontaneous shunt and a worse prognosis.',
      notes: 'Hepatofugal flow appears in advanced cirrhosis, usually with large spontaneous shunts, when intrahepatic resistance exceeds that of the collaterals. The liver then depends on the hepatic artery. It raises the risk of portal vein thrombosis and of hepatic encephalopathy, and it is a caution before TIPS. Bidirectional (to-and-fro) flow precedes full reversal. Colored by direction, the portal and splenic veins show the reversed flow draining through the splenorenal shunt. On the color map the reversed vein is blue, the color of flow away from the transducer.',
      ask: ['What does hepatofugal portal flow tell you about the liver?', 'Intrahepatic resistance exceeds that of the collaterals, so portal blood leaves through them: advanced cirrhosis.'],
    },
    {
      id: 'a2', terms: ['pv'], preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'color' }, cite: 'Baveno VIII 9.2',
      vignette: 'A 41-year-old woman with a JAK2-positive myeloproliferative neoplasm has had 5 days of constant abdominal pain. Her liver tests are normal.',
      caseQ: 'What will the portal vein waveform show?',
      kicker: 'Portal inflow', site: 'pre', title: 'No signal: occlusive portal vein thrombosis',
      line: 'An occlusive thrombus leaves no Doppler signal in the portal vein, and the HVPG stays {hvpg} because the resistance is prehepatic.',
      notes: 'Baveno VIII 9.2 makes Doppler ultrasound the first-line test for portal vein thrombosis: solid material in the lumen, or a network of porto-portal collaterals suggesting cavernous transformation. On color Doppler the thrombosed segment shows no color fill and no spectral signal. Absent flow counts only with correct technique: angle <60°, gain and velocity scale low enough for slow flow, and the sample volume within the lumen. An acute thrombus may be nearly anechoic, so absent flow matters more than the grayscale image. When portal flow falls, the hepatic artery dilates and its flow rises (the hepatic arterial buffer response). Multiphase CT then confirms the thrombus and shows its extension into the splenic and mesenteric veins (9.2).',
      ask: ['No spectral signal despite correct angle and gain settings. What does that suggest?', 'No flow in the vein: occlusive thrombosis.'],
    },
    {
      id: 'a3', terms: ['hv', 'caudate'], preset: 'budd-chiari', cam: 'liver', labels: ['RHV', 'RA'], marks: [{ edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Hepatic vein thrombosis', free: true }, { organ: 'caudate', label: 'Caudate lobe', kind: 'note' }], tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['pvVel'], key: ['pvVel'],
      vignette: 'A 29-year-old woman who takes an OCP has had 6 weeks of right upper quadrant pain and increasing abdominal girth. She has tender hepatomegaly.',
      caseQ: 'What will her right hepatic vein waveform show?',
      kicker: 'Outflow', site: 'post', title: 'Absent hepatic vein flow: Budd–Chiari syndrome',
      line: 'The hepatic veins are thrombosed, so flow is absent or flat. Portal vein velocity falls to {pvVel}, about half of normal, and ascites accumulates.',
      notes: 'A normal hepatic vein waveform is mostly below the baseline, toward the heart, in two waves each cardiac cycle with a brief reversal as the atrium contracts. Doppler ultrasound is the usual first test for Budd–Chiari syndrome. It looks for absent, reversed or flat flow in the hepatic veins, comma-shaped intrahepatic collaterals (spider-web veins) and caudate lobe hypertrophy. Baveno VIII 8.25 makes the diagnosis by showing obstruction of the venous lumen, or hepatic vein collaterals with no patent hepatic veins. Portal flow slows and may become hepatofugal. It is the mirror image of portal vein thrombosis, where the portal vein has no flow and the hepatic veins are normal.',
      ask: ['How does Doppler tell Budd–Chiari syndrome from portal vein thrombosis?', 'In Budd–Chiari the hepatic veins have no flow; in portal vein thrombosis the portal vein has none.'],
    },
    {
      id: 'a4', terms: ['pv'], preset: 'rhf', cam: 'route', labels: ['CONF', 'RHV', 'RA'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', pair: true, calipers: true },
      vignette: 'A 72-year-old woman with severe tricuspid regurgitation has ascites and lower-extremity edema. Her liver tests are mildly elevated.',
      caseQ: 'What will her portal vein waveform look like?',
      kicker: 'Outflow', site: 'cardiac', title: 'Pulsatile portal flow: the heart',
      line: 'Portal vein flow is pulsatile, in phase with the hepatic vein below it. A pulsatility index {>=30%} is abnormal. Right atrial pressure is {ra} and the HVPG stays {hvpg}.',
      notes: 'In right heart failure, tricuspid regurgitation and constrictive pericarditis, elevated right atrial pressure is transmitted through the sinusoids and portal flow becomes pulsatile; with severe regurgitation it may reverse in systole. The pulsatility index, (Vmax − Vmin) / Vmax, is abnormal at ≥30% and severe at ≥50%. The HVPG is normal because the wedged and free hepatic venous pressures (WHVP, FHVP) rise together. A dilated IVC and hepatic veins point to the heart, not the liver. The narrow trace below the portal vein is the right hepatic vein: each portal pulsation coincides with its waves.',
      ask: ['Pulsatile portal flow with a normal HVPG: where is the resistance?', 'Downstream of the liver, in the heart: elevated right atrial pressure is transmitted back through the sinusoids.'],
    },
    {
      id: 'a5', lens: 'direction', preset: 'cirr-decomp', params: STENT, days: 180, cam: 'liver', labels: ['LPV'], mark: { edges: ['TIPS'], label: 'Stenosis', seg: 'site' }, tool: { kind: 'doppler', vessel: 'PVH_L' }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['ppg'],
      vignette: 'A 60-year-old man had a covered TIPS for refractory ascites 6 months ago. Over the last month his ascites has recurred.',
      caseQ: 'What direction will his left portal vein flow be?',
      kicker: 'After TIPS', site: 'sin', title: 'Hepatopetal again: TIPS stenosis',
      line: 'Left portal vein flow is hepatopetal again: the stent no longer draws flow toward it. The TIPS has stenosed, and the PPG is back to {ppg}.',
      notes: 'With a patent TIPS, flow in the intrahepatic portal branches is directed toward the stent (hepatofugal). Signs of TIPS stenosis: a stent velocity <90 or >190 cm/s at the proximal, mid or distal stent, a change of >50 cm/s from the baseline study, a main portal vein velocity <30 cm/s, and an intrahepatic portal branch that becomes hepatopetal. Stenoses form mostly at the hepatic vein end, where a jet exceeds 190 cm/s while velocity in the rest of the stent is low. TIPS venography with a portosystemic gradient confirms it, and angioplasty or a new stent treats it. The Doppler ultrasound of TIPS talk covers the stent itself.',
      ask: ['Name three Doppler signs of TIPS stenosis.', 'A stent velocity <90 or >190 cm/s, a main portal vein velocity <30 cm/s, and an intrahepatic portal branch that is hepatopetal again.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, the main portal vein's
      // velocity and the portal flow read against the HVPG. The ring is the CSPH patient: a clinically significant gradient, a normal velocity.)
      id: 'relation', preset: 'csph', cam: 'portal', labels: ['CONF'],
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['pvVel', 'pvFlow'] },
      kicker: 'Summary', site: 'sin', title: 'A normal portal velocity does not rule out CSPH',
      line: 'CSPH at an HVPG of {hvpg}, yet main portal vein velocity is still {pvVel}. In the model velocity falls {<15 cm/s} only at an HVPG of about 16 mmHg.',
      notes: 'Each point is the model\'s cirrhosis from mild to severe, settled for a year: main portal vein velocity and portal flow, plotted against the HVPG. The velocity stays near 26 cm/s up to an HVPG of 10 mmHg, is still 24 cm/s at 11.6 mmHg, and falls <15 cm/s only at about 16 mmHg. The portal flow first rises with the hyperdynamic circulation, then falls as the collaterals carry more of the inflow. So the Doppler signs are specific but insensitive: a normal portal velocity does not exclude CSPH. The model\'s velocity is the mean along the vein; the published cut-offs use the peak velocity, <16 cm/s together with a dilated vein (Iranpour 2016; McNaughton and Abu-Yousef 2011), and the app marks 15 cm/s. The ring is the CSPH patient. (Iranpour 2016; McNaughton and Abu-Yousef 2011; AASLD 2024 Fig. 2.) One model patient per point; real patients vary far more.',
      ask: ['A patient has an HVPG of 12 mmHg and a portal vein velocity of 24 cm/s. Does the normal Doppler rule out CSPH?', 'No. The velocity usually falls <15 cm/s only at a much higher gradient, so a normal Doppler does not exclude CSPH.'],
    },
    {
      // The Doppler's own findings: portal flow against the healthy row, and what the trace shows.
      id: 'summary', visual: 'table', cols: ['pvFlow', 'hvpg', 'wave'], asc: false, wave: 'PV_TRUNK', note: 'Doppler finding', rowHead: 'Case',
      of: [{ id: 'normal', kicker: 'Reference', title: 'Healthy', note: 'Continuous, hepatopetal', ref: true }, { id: 'a1', title: 'Hepatofugal portal flow', note: 'Below the baseline' },
        { id: 'a2', title: 'Portal vein thrombosis', note: 'No signal' }, { id: 'a3', title: 'Budd–Chiari', note: 'Absent or flat hepatic vein flow' },
        { id: 'a4', title: 'Right heart failure', note: 'Pulsatile portal flow' }, { id: 'a5', title: 'TIPS stenosis', note: 'Hepatopetal left portal vein' }],
      kicker: 'Summary', title: 'Five waveforms localize five lesions',
      line: 'Direction, velocity and shape localize the problem: prehepatic, intrahepatic, posthepatic, cardiac or in the stent, often before any pressure is measured.',
      notes: 'No portal signal: occlusive thrombosis. Below the baseline: hepatofugal flow in advanced cirrhosis. Absent or flat hepatic vein flow: Budd–Chiari syndrome. Pulsatile portal flow: the heart. A hepatopetal intrahepatic portal branch after TIPS: TIPS stenosis. Doppler localizes the problem as prehepatic, intrahepatic or posthepatic, often before any pressure is measured.',
      ask: ['Pulsatile portal flow with each cardiac cycle and an HVPG of 3 mmHg. Which row fits?', 'Right heart failure.'],
    },
  ],
};
