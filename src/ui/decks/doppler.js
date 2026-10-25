// Presenter talk: Doppler of the portal system (Core). Slide fields as documented at the top of decks.js. The last half is Read the
// Doppler's five cases (deck rebuild plan D1, 25 Oct 2026): each case is one slide, the case card asking before the slide answers,
// with the reading grid under the trace the room reads. The Doppler facts follow McNaughton and Abu-Yousef (RadioGraphics 2011);
// EASL 2025 makes Doppler the first test for portal vein thrombosis and Budd–Chiari syndrome.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const STENT = { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: { TIPS: 0.6 } };

export const DOPPLER = {
  id: 'doppler', level: 'core', title: 'Doppler of the portal system', minutes: 14,
  sections: [['The probe', ['Doppler']], ['Reading a trace', ['Cirrhosis', 'The method']], ['Portal inflow', ['Portal inflow']], ['Outflow', ['Outflow']], ['After TIPS', ['After TIPS']]],
  objectives: [
    'Read normal portal and hepatic vein Doppler: direction, speed and shape',
    'Read any trace in the same order, direction first, then speed, then shape',
    'Tell reversed portal flow, a portal vein clot, Budd–Chiari syndrome and a failing heart apart',
    'Spot a narrowed TIPS from the left portal vein',
  ],
  checks: [
    ['In what order do you read a Doppler trace, and what does a main portal vein trace below the baseline mean?', 'Direction (above or below the baseline), then speed (the velocity), then shape (steady, pulsing or flat). Below the baseline is hepatofugal flow: portal blood runs away from the liver, out through collaterals, in advanced cirrhosis.'],
    ['The portal vein pulses with each beat and the HVPG is normal. Where is the problem?', 'In the heart: a high right atrial pressure reaches back through the sinusoids to the portal vein.'],
    ['A year after a TIPS, the left portal vein flows toward the liver. What do you suspect?', 'The stent is narrowing. Sample the stent at its three points and confirm with venography and a pressure gradient.'],
    ['Over two years, portal velocity falls from 25 to 12 cm/s with no clot. What moved?', 'The resistance inside the liver rose, so less blood runs through the portal trunk and more takes the collaterals.'],
  ],
  summary: 'What the Doppler probe reads in the portal and hepatic veins, and how to read a trace in order: direction, speed, shape. Five cases to read before the answer, from reversed portal flow to a narrowed TIPS, then a table that compares them.',
  slides: [
    {
      id: 'probe', terms: ['pv'], preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK', mode: 'color' },
      kicker: 'Doppler', title: 'The probe measures portal velocity',
      eq: [mi('Q') + mo('=') + mi('\u{1D463}̄') + mo('×') + mi('A'), 'Q flow · v̄ mean velocity · A cross-sectional area of the vein'],
      line: 'The probe plots velocity over time. Blood in the portal vein runs toward the probe and the liver, so the trace sits above the baseline, at {>=15 cm/s} or more.',
      notes: 'The probe sends ultrasound into the vein and reads the frequency shift of the echoes from moving red cells. The spectrum plots velocity against time: above the baseline is flow toward the probe, drawn in orange-red, which for the portal vein is toward the liver. Normal portal flow is hepatopetal, steady (monophasic) with gentle respiratory phasicity, with a velocity of 15 cm/s or more, usually 20 to 40 cm/s, as this monitor reads it. Velocity times the cross-sectional area gives flow, about 1 L a minute in health. The angle of insonation should be under 60 degrees, or the velocity is misread.',
      ask: ['Which way does normal portal flow run, and how fast?', 'Toward the liver (hepatopetal), at 15 cm/s or more, usually 20 to 40 cm/s.'],
    },
    {
      id: 'hepatic', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', grid: ['shape'], vessel: 'RHV_IVC', waves: true, mode: 'color' },
      kicker: 'Doppler', title: 'The hepatic veins pulse with the right atrium',
      line: 'Blood flows toward the heart, below the baseline, in two waves each beat (S and D). The atrium\'s contraction briefly reverses it (a), with a small turn between (v).',
      notes: 'The hepatic veins are close to the right atrium, so their waveform follows it. Flow toward the heart is drawn below the baseline in blue, and the reversal in orange-red. The normal trace has four parts: the a wave (atrial contraction) briefly reverses flow, the S wave carries blood toward the heart in ventricular systole, the small v wave turns toward the baseline as the atrium fills, and the D wave carries blood forward again in diastole. Tricuspid regurgitation enlarges the v wave. A stiff, cirrhotic liver damps the wave to biphasic or monophasic. A tall a wave and S-wave reversal point to tricuspid regurgitation or a high right atrial pressure.',
      ask: ['What causes the brief reversal in the normal hepatic vein waveform?', 'Atrial contraction (the a wave).'],
    },
    {
      // (The same meal as the Circuit talk's, eased in over 8 days, as a time-lapse from fasting, on the seconds clock so the Doppler records the rise.)
      id: 'meal', params: { respiration: false }, days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal', clock: 'seconds' },
      cam: 'portal', labels: ['SMV', 'CONF'], tool: { kind: 'doppler', grid: ['speed'], vessel: 'PV_TRUNK' },
      data: 'tiles', tiles: ['pvFlow'], key: ['pvFlow'], delta: true,
      kicker: 'Doppler', title: 'Portal flow rises after a meal',
      line: 'Within half an hour of eating, the gut arterioles open and portal flow rises by 40 to 80%. Scan fasting, or you will overestimate the velocity and miss slow flow.',
      notes: 'Digestion dilates the gut arterioles. Portal flow rises by about 40 to 80% and the velocity by up to 100%, peaking about 30 minutes after eating and still raised at an hour; the rise is blunted in cirrhosis. A normal liver takes the extra flow with little rise in pressure. Portal Doppler should be done fasting, or the velocity is overestimated and slow flow in early cirrhosis is missed. Liver stiffness also rises after a meal, which is why FibroScan is done fasting too.',
      ask: ['Why is portal Doppler done fasting?', 'A meal raises portal flow and velocity, which can hide the slow flow of portal hypertension.'],
    },
    {
      id: 'slow', lens: 'velocity', preset: 'cirr-decomp', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: ['speed'], vessel: 'PV_TRUNK' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      kicker: 'Cirrhosis', site: 'sin', title: 'Cirrhosis slows the portal vein',
      vignette: 'A 62-year-old man with alcohol-associated cirrhosis has ascites on spironolactone and furosemide and large esophageal varices. He comes fasting for a Doppler ultrasound.',
      caseQ: 'How fast will his portal vein run?',
      line: 'Resistance in the sinusoids slows portal flow. A velocity under {<15 cm/s} is abnormal. Colored by velocity, the whole portal vein turns pale.',
      notes: 'As intrahepatic resistance rises, portal velocity falls and the vein widens (a main portal vein over 13 mm is a soft sign). The congestion index, cross-sectional area over mean velocity, is about 0.07 cm × s in health; above 0.1 suggests portal hypertension. These signs are specific but insensitive: a normal Doppler does not exclude clinically significant portal hypertension. Splenomegaly, collaterals and reversed flow in the paraumbilical vein add to the picture.',
      ask: ['What portal vein velocity is abnormal?', 'A velocity under 15 cm/s.'],
    },
    {
      id: 'normal', terms: ['pv'], preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvVel'], key: ['pvVel'],
      kicker: 'The method', title: 'Read every trace in the same order',
      line: 'Read direction first, then speed, then shape. In a healthy person the portal vein flows toward the liver, above the baseline, at {pvVel}, steady with a gentle ripple from breathing.',
      notes: 'Above the baseline is flow toward the probe, which for the main portal vein means toward the liver. Normal portal velocity is 15 cm/s or more, usually 20 to 40 cm/s. The trace is steady with a slight rise and fall as the patient breathes. Every case that follows is read the same way: direction, speed, then shape.',
      ask: ['Describe the normal main portal vein trace.', 'Above the baseline (hepatopetal), 15 cm/s or more, steady with a gentle ripple from breathing.'],
    },
    {
      id: 'a1', lens: 'direction', preset: 'cirr-hepatofugal', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: ['dir'], vessel: 'PV_TRUNK' },
      vignette: 'A 63-year-old man with hepatitis C cirrhosis has had two admissions for encephalopathy this year. He comes fasting for an ultrasound before a TIPS is considered.',
      caseQ: 'Which way will his portal blood run?',
      kicker: 'Portal inflow', site: 'sin', title: 'Below the baseline: the portal vein has reversed',
      line: 'The spectrum sits below the baseline, so portal blood runs away from the liver at {pvFlow}, out through a splenorenal shunt. Hepatofugal flow marks advanced cirrhosis.',
      notes: 'Hepatofugal flow appears in advanced cirrhosis, in about 8% of patients, usually with large spontaneous shunts, when the liver resists more than the collaterals do. The liver then depends on the hepatic artery. It raises the risk of portal vein thrombosis and of encephalopathy, and it is a warning before a TIPS. To-and-fro flow is the step before full reversal. Colored by direction, the portal and splenic veins show the reversed flow draining away through the splenorenal shunt.',
      ask: ['What does hepatofugal portal flow tell you about the liver?', 'Its resistance is higher than the collaterals\', so portal blood leaves through them: advanced cirrhosis.'],
    },
    {
      id: 'a2', terms: ['pv'], preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' },
      vignette: 'A 41-year-old woman with a JAK2-positive myeloproliferative neoplasm has had 5 days of constant abdominal pain. Her liver tests are normal.',
      caseQ: 'What will the portal vein trace show?',
      kicker: 'Portal inflow', site: 'pre', title: 'No signal: a clot fills the portal vein',
      line: 'An occlusive clot leaves nothing to read in the portal vein, and the HVPG stays {hvpg} because the resistance lies before the liver.',
      notes: 'EASL 2025 makes Doppler ultrasound the first test for portal vein thrombosis: echogenic material in the lumen with no color or spectral signal. An empty trace counts only once the technique is right: the angle under 60 degrees, the gain and scale low enough for slow flow, and the gate inside the lumen. An acute clot may be nearly anechoic, so the missing flow matters more than the gray-scale picture. When portal flow falls, the hepatic artery dilates and carries more (the hepatic arterial buffer response). CT or MR then shows how far the clot reaches into the splenic and mesenteric veins.',
      ask: ['The trace is empty with the angle and gain set right. What does that suggest?', 'No flow in the vein: an occlusive clot.'],
    },
    {
      id: 'a3', terms: ['hv'], preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true }, tool: { kind: 'doppler', grid: true, vessel: 'RHV_IVC' },
      vignette: 'A 29-year-old woman who takes an OCP has had 6 weeks of right upper quadrant pain and a growing abdomen. Her liver is large and tender.',
      caseQ: 'What will her right hepatic vein trace show?',
      kicker: 'Outflow', site: 'post', title: 'No waves in the hepatic veins: Budd–Chiari syndrome',
      line: 'The hepatic veins are clotted, so the trace is absent or flat. The portal vein slows to {pvVel}, about half its healthy speed, and ascites builds.',
      notes: 'A normal hepatic vein trace runs mostly below the baseline, toward the heart, in two waves each beat with a brief reversal as the atrium contracts. EASL 2025 makes Doppler ultrasound the first test for Budd–Chiari syndrome: absent, reversed or flat flow in the hepatic veins, comma-shaped intrahepatic collaterals (spider-web veins) and a large caudate lobe. The portal vein slows and may reverse. It is the mirror image of portal vein thrombosis, where the portal vein is empty and the hepatic veins are normal.',
      ask: ['How does Doppler tell Budd–Chiari syndrome from portal vein thrombosis?', 'In Budd–Chiari the hepatic veins have no flow; in portal vein thrombosis the portal vein has none.'],
    },
    {
      id: 'a4', terms: ['pv'], preset: 'rhf', cam: 'route', labels: ['CONF', 'RHV', 'RA'], tool: { kind: 'doppler', grid: ['shape'], vessel: 'PV_TRUNK', pair: true, calipers: true },
      vignette: 'A 72-year-old woman with severe tricuspid regurgitation has ascites and leg edema. Her liver tests are mildly raised.',
      caseQ: 'What shape will her portal vein trace have?',
      kicker: 'Outflow', site: 'cardiac', title: 'A pulsing portal vein: the heart',
      line: 'The portal vein pulses in step with the hepatic vein below it. Pulsatility of {>=30%} or more is abnormal. The right atrial pressure is {ra} and the HVPG stays {hvpg}.',
      notes: 'In right heart failure, tricuspid regurgitation and constrictive pericarditis, the high right atrial pressure crosses the sinusoids and the portal vein pulses; with severe regurgitation it may reverse in systole. The pulsatility, (Vmax − Vmin) / Vmax, is abnormal at 30% or more and severe at 50% or more. The HVPG is normal because the wedged and free pressures rise together. A dilated IVC and hepatic veins point to the heart, not the liver. The slim trace under the portal vein is the right hepatic vein: each portal pulse lines up with its waves.',
      ask: ['A pulsing portal vein with a normal HVPG: where is the resistance?', 'Beyond the liver, in the heart: a high right atrial pressure reaches back through the sinusoids.'],
    },
    {
      id: 'a5', lens: 'direction', preset: 'cirr-decomp', params: STENT, days: 180, cam: 'liver', labels: ['LPV'], mark: { edges: ['TIPS'], label: 'Narrowing', seg: 'site' }, tool: { kind: 'doppler', grid: ['dir'], vessel: 'PVH_L' },
      vignette: 'A 60-year-old man had a covered TIPS for refractory ascites a year ago. Over the last month his ascites has come back.',
      caseQ: 'Which way will his left portal vein flow?',
      kicker: 'After TIPS', site: 'sin', title: 'Toward the liver again: the stent has narrowed',
      line: 'The left portal vein flows toward the liver again, so the stent no longer draws it. The stent has narrowed, and the PPG is back to {ppg}.',
      notes: 'With a working TIPS, the intrahepatic portal branches flow toward the stent, away from the liver. Signs of TIPS stenosis: a stent velocity under 90 or over 190 cm/s at the proximal, mid or distal stent, a change of more than 50 cm/s from the baseline study, a main portal vein under 30 cm/s, and an intrahepatic portal branch that turns hepatopetal. Narrowings form mostly at the hepatic vein end, where a jet runs over 190 cm/s while the rest of the stent runs slow. TIPS venography with a pressure gradient confirms it, and angioplasty or a new stent reopens it. The Doppler after TIPS talk reads the stent itself.',
      ask: ['Name three Doppler signs of a narrowed TIPS.', 'A stent velocity under 90 or over 190 cm/s, a main portal vein under 30 cm/s, and a portal branch that flows toward the liver again.'],
    },
    {
      // The Doppler's own findings: portal flow against the healthy row, and what the trace shows.
      id: 'summary', visual: 'table', cols: ['pvFlow', 'hvpg', 'wave'], asc: false, wave: 'PV_TRUNK', note: 'What the trace shows', rowHead: 'Case',
      of: [{ id: 'normal', kicker: 'Reference', title: 'Healthy', note: 'Steady, toward the liver', ref: true }, { id: 'a1', title: 'Reversed portal flow', note: 'Below the baseline' },
        { id: 'a2', title: 'Portal vein clot', note: 'No signal' }, { id: 'a3', title: 'Budd–Chiari', note: 'Flat hepatic veins' },
        { id: 'a4', title: 'Failing heart', note: 'Portal vein pulses' }, { id: 'a5', title: 'Narrowed TIPS', note: 'Left portal vein toward the liver' }],
      kicker: 'Summary', title: 'Five traces, five places',
      line: 'Direction, speed and shape place the problem: before the liver, in it, after it, in the heart or in a stent, often before any pressure is measured.',
      notes: 'No portal signal: a clot. Below the baseline: reversed flow in advanced cirrhosis. Flat hepatic veins: Budd–Chiari syndrome. A pulsing portal vein: the heart. A portal branch flowing toward the liver after a TIPS: a narrowing in the stent. The Doppler places the problem before, in or after the liver, often before any pressure is measured.',
      ask: ['A portal vein trace that pulses with each beat and an HVPG of 3 mmHg. Which row fits?', 'The failing heart.'],
    },
  ],
};
