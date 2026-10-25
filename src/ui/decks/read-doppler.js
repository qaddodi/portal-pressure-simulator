// Presenter talk: reading the Doppler (Advanced), a capstone after the Doppler talk. Five cases, each shown twice: first the
// trace alone, with no name and no level tab, for the room to read; then the same patient with the finding named. The
// Doppler facts follow the Doppler and TIPS Doppler talks (McNaughton and Abu-Yousef, RadioGraphics 2011); EASL 2025 makes
// Doppler the first test for portal vein thrombosis and Budd–Chiari syndrome (the slide fields are described at the top of
// decks.js).

const ASK = 'Read it in order: which way the blood runs, how fast, and whether it pulses.';
const STENT = { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: { TIPS: 0.6 } };

export const READ_DOPPLER = {
  id: 'read-doppler', level: 'advanced', title: 'Read the Doppler', minutes: 10,
  objectives: [
    'Read a Doppler trace in order: direction, speed, then shape',
    'Tell a portal vein clot, reversed portal flow and a failing heart apart on the portal vein trace',
    'Recognize Budd–Chiari syndrome from the hepatic vein trace',
    'Spot a narrowed TIPS from the left portal vein and the stent',
  ],
  checks: [
    ['In what order do you read a Doppler trace?', 'Direction (above or below the baseline), then speed (the velocity), then shape (steady, pulsing or flat).'],
    ['The main portal vein trace sits below the baseline. What does that mean?', 'Hepatofugal flow: portal blood runs away from the liver, out through collaterals, in advanced cirrhosis.'],
    ['The portal vein pulses with each beat and the HVPG is normal. Where is the problem?', 'In the heart: a high right atrial pressure reaches back through the sinusoids to the portal vein.'],
    ['A year after a TIPS, the left portal vein flows toward the liver. What do you suspect?', 'The stent is narrowing. Sample the stent at its three points and confirm with venography and a pressure gradient.'],
  ],
  sections: [['The method', ['The method']], ['Portal inflow', ['Portal inflow']], ['Outflow', ['Outflow']], ['After TIPS', ['After TIPS']]],
  summary: 'Five Doppler traces to read before the answer: reversed portal flow, a clotted portal vein, Budd–Chiari syndrome, a failing heart and a narrowed TIPS, each read by direction, speed and shape.',
  slides: [
    {
      id: 'normal', terms: ['pv'], preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvVel'], key: ['pvVel'],
      kicker: 'The method', title: 'Read every trace in the same order',
      line: 'Direction first, then speed, then shape. The healthy portal vein flows toward the liver, above the baseline, at {pvVel}, steady with a gentle ripple from breathing.',
      notes: 'Above the baseline is flow toward the probe, which for the main portal vein means toward the liver. Normal portal velocity is 15 cm/s or more, usually 20 to 40 cm/s. The trace is steady with a slight rise and fall as the patient breathes. Every case that follows is read the same way: direction, speed, then shape.',
      ask: ['Describe the normal main portal vein trace.', 'Above the baseline (hepatopetal), 15 cm/s or more, steady with a gentle ripple from breathing.'],
    },
    {
      id: 'q1', hold: true, preset: 'cirr-hepatofugal', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' },
      vignette: 'A 63-year-old man with hepatitis C cirrhosis has had two admissions for encephalopathy this year. He comes fasting for an ultrasound before a TIPS is considered.',
      kicker: 'Portal inflow', title: 'Case 1: the main portal vein',
      line: `The probe samples the main portal vein. ${ASK}`,
      notes: 'Look first at which side of the baseline the spectrum sits on. Then read the velocity, and last the shape of the trace.',
      ask: ['Which way does the portal blood run in this trace?', 'Away from the liver: the spectrum sits below the baseline.'],
    },
    {
      id: 'a1', lens: 'direction', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: ['dir'], vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow'],
      kicker: 'Portal inflow', site: 'sin', title: 'Below the baseline: the portal vein has reversed',
      line: 'The spectrum sits below the baseline, so portal blood runs away from the liver, at {pvFlow}, out through a splenorenal shunt. Colored by direction, the portal and splenic veins are reversed.',
      notes: 'Hepatofugal flow appears in advanced cirrhosis, usually with large spontaneous shunts, when the liver resists more than the collaterals do. The liver then depends on the hepatic artery. It raises the risk of portal vein thrombosis and of encephalopathy, and it is a warning before a TIPS. To-and-fro flow is the step before full reversal.',
      ask: ['What does hepatofugal portal flow tell you about the liver?', 'Its resistance is higher than the collaterals\', so portal blood leaves through them: advanced cirrhosis.'],
    },
    {
      id: 'q2', hold: true, preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' },
      vignette: 'A 41-year-old woman with a JAK2-positive myeloproliferative neoplasm has had 5 days of constant abdominal pain. Her liver tests are normal.',
      kicker: 'Portal inflow', title: 'Case 2: the main portal vein',
      line: `The gate sits in the middle of the main portal vein, at a good angle and with the gain up. What is missing?`,
      notes: 'An empty trace is a finding only once the technique is right: the angle under 60 degrees, the gain and scale set low enough for slow flow, and the gate inside the lumen.',
      ask: ['The trace is empty with the angle and gain set right. What does that suggest?', 'No flow in the vein: an occlusive clot.'],
    },
    {
      id: 'a2', terms: ['pv'], cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'doppler', grid: true, vessel: 'A_HEP' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      cite: 'EASL 2025, portal vein thrombosis',
      kicker: 'Portal inflow', site: 'pre', title: 'No signal: a clot fills the portal vein',
      line: 'An occlusive clot leaves nothing to read in the portal vein. The hepatic artery, sampled here, carries more blood to make up for it, and the HVPG stays {hvpg} because the resistance is before the liver.',
      notes: 'Doppler ultrasound is usually the first test for portal vein thrombosis: echogenic material in the lumen with no color or spectral signal. An acute clot may be nearly anechoic, so the missing flow matters more than the gray-scale picture. When portal flow falls, the hepatic artery dilates and carries more (the hepatic arterial buffer response). CT or MR then shows how far the clot reaches into the splenic and mesenteric veins.',
      ask: ['Why does the hepatic artery speed up when the portal vein clots?', 'The hepatic arterial buffer response: the artery dilates to make up for the lost portal flow.'],
    },
    {
      id: 'q3', hold: true, preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], tool: { kind: 'doppler', grid: true, vessel: 'RHV_IVC' },
      vignette: 'A 29-year-old woman who takes an OCP has had 6 weeks of right upper quadrant pain and a growing abdomen. Her liver is large and tender.',
      kicker: 'Outflow', title: 'Case 3: the right hepatic vein',
      line: `The probe samples the right hepatic vein, which normally pulses in time with the right atrium. Where are the waves?`,
      notes: 'A normal hepatic vein trace runs mostly below the baseline, toward the heart, in two waves each beat (S and D) with a brief reversal as the atrium contracts. Compare this trace with that pattern.',
      ask: ['What does a normal hepatic vein trace look like?', 'Mostly below the baseline, toward the heart, with S and D waves and a brief reversal (the a wave) each beat.'],
    },
    {
      id: 'a3', terms: ['hv'], cam: 'hepatic', labels: ['RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true }, tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvVel', 'asc'], key: ['pvVel'],
      cite: 'EASL 2025, Budd–Chiari syndrome',
      kicker: 'Outflow', site: 'post', title: 'No waves in the hepatic veins: Budd–Chiari syndrome',
      line: 'The hepatic veins are clotted, so their trace is absent or flat. The portal vein, sampled here, runs at {pvVel}, about half its healthy speed, as the outflow backs up, and ascites builds.',
      notes: 'Doppler ultrasound is the first test for Budd–Chiari syndrome: absent, reversed or flat flow in the hepatic veins, comma-shaped intrahepatic collaterals and a large caudate lobe. The portal vein slows and may reverse. It is the mirror image of portal vein thrombosis, where the portal vein is empty and the hepatic veins are normal.',
      ask: ['How does Doppler tell Budd–Chiari syndrome from portal vein thrombosis?', 'In Budd–Chiari the hepatic veins have no flow; in portal vein thrombosis the portal vein has none.'],
    },
    {
      id: 'q4', hold: true, preset: 'rhf', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', grid: true, vessel: 'PV_TRUNK' },
      vignette: 'A 72-year-old woman with severe tricuspid regurgitation has ascites and leg edema. Her liver tests are mildly raised.',
      kicker: 'Outflow', title: 'Case 4: the main portal vein',
      line: `The probe samples the main portal vein again. Watch its shape over three beats.`,
      notes: 'Here the direction and the speed may look close to normal. The answer is in the shape of the trace.',
      ask: ['What is unusual about the shape of this portal vein trace?', 'It rises and falls with every heartbeat instead of staying steady.'],
    },
    {
      id: 'a4', terms: ['pv'], cam: 'route', labels: ['CONF', 'RHV', 'RA'], tool: { kind: 'doppler', grid: ['shape'], vessel: 'PV_TRUNK', pair: true, calipers: true }, data: 'tiles', tiles: ['ra', 'hvpg'], key: ['ra'],
      kicker: 'Outflow', site: 'cardiac', title: 'A pulsing portal vein: the heart',
      line: 'The portal vein pulses with each beat, in step with the right hepatic vein traced under it. A pulsatility of {>=30%} or more is abnormal. The right atrial pressure is {ra}, and the HVPG stays {hvpg}.',
      notes: 'In right heart failure, tricuspid regurgitation and constrictive pericarditis, the high right atrial pressure crosses the sinusoids and the portal vein pulses; with severe regurgitation it may reverse in systole. The pulsatility, (Vmax − Vmin) / Vmax, is abnormal at 30% or more and severe at 50% or more. The HVPG is normal because the wedged and free pressures rise together. A dilated IVC and hepatic veins point to the heart, not the liver.',
      ask: ['A pulsing portal vein with a normal HVPG: where is the resistance?', 'Beyond the liver, in the heart: a high right atrial pressure reaches back through the sinusoids.'],
    },
    {
      id: 'q5', hold: true, preset: 'cirr-decomp', params: STENT, days: 180, cam: 'liver', labels: ['LPV'], tool: { kind: 'doppler', grid: true, vessel: 'PVH_L' },
      vignette: 'A 60-year-old man had a covered TIPS for refractory ascites a year ago. Over the last month his ascites has come back.',
      kicker: 'After TIPS', title: 'Case 5: the left portal vein after TIPS',
      line: `The probe samples the left portal vein, which a working stent draws toward itself. Which way does it run now?`,
      notes: 'With a working TIPS, the intrahepatic portal branches flow toward the stent, away from the liver. Compare the direction in this trace with that expectation.',
      ask: ['Which way should the left portal vein flow with a working TIPS?', 'Toward the stent, away from the liver (hepatofugal).'],
    },
    {
      id: 'a5', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Narrowing', seg: 'site' }, tool: { kind: 'doppler', grid: ['dir'], vessel: 'TIPS', gate: 'site', points: true }, data: 'tiles', tiles: ['ppg'], key: ['ppg'],
      kicker: 'After TIPS', site: 'sin', title: 'Toward the liver again: the stent has narrowed',
      line: 'The left portal vein flows toward the liver, so the stent no longer draws it. At the narrowing a jet runs over {>190 cm/s}, the rest of the stent runs slow, and the PPG is back to {ppg}.',
      notes: 'Signs of TIPS stenosis: a stent velocity under 90 or over 190 cm/s at the proximal, mid or distal stent, a change of more than 50 cm/s from the baseline study, a main portal vein under 30 cm/s, and an intrahepatic portal branch that turns hepatopetal. Narrowings form mostly at the hepatic vein end. TIPS venography with a pressure gradient confirms it, and angioplasty or a new stent reopens it.',
      ask: ['Name three Doppler signs of a narrowed TIPS.', 'A stent velocity under 90 or over 190 cm/s, a main portal vein under 30 cm/s, and a portal branch that flows toward the liver again.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'hvpg', 'wave'], asc: false, wave: 'PV_TRUNK', note: 'What the trace shows', rowHead: 'Case',
      of: [{ id: 'normal', kicker: 'Reference', title: 'Healthy', note: 'Steady, toward the liver', ref: true }, { id: 'a1', title: 'Reversed portal flow', note: 'Below the baseline' },
        { id: 'a2', title: 'Portal vein clot', note: 'No signal' }, { id: 'a3', title: 'Budd–Chiari', note: 'Flat hepatic veins' },
        { id: 'a4', title: 'Failing heart', note: 'Portal vein pulses' }, { id: 'a5', title: 'Narrowed TIPS', note: 'Jet in the stent' }],
      kicker: 'Summary', title: 'Five traces, five places',
      line: 'Direction, speed and shape place the problem: before the liver, in it, after it, in the heart or in a stent, often before any pressure is measured.',
      notes: 'No portal signal: a clot. Below the baseline: reversed flow in advanced cirrhosis. Flat hepatic veins: Budd–Chiari syndrome. A pulsing portal vein: the heart. A portal branch flowing toward the liver after a TIPS: a narrowing in the stent.',
      ask: ['A portal vein trace that pulses with each beat and an HVPG of 3 mmHg. Which row fits?', 'The failing heart.'],
    },
  ],
};
