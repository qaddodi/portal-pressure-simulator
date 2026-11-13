// Presenter talk: Doppler ultrasound of a TIPS (Advanced): the stent, the portal vein and both intrahepatic branches in a
// working shunt, then the same scan when the stent narrows. Slide fields as documented at the top of decks.js.
// Branch directions checked (14 Oct 2026) against the UT Southwestern and University of Washington TIPS Doppler protocols,
// McNaughton and Abu-Yousef (RadioGraphics 2011) and Nicolas et al. (World J Hepatol 2017): with a working TIPS every
// segment flows toward the stent; the right portal vein is hepatopetal only between the bifurcation and the stent.
// Stent velocities (15 Oct 2026): 90–190 cm/s at each of the three points sampled (portal end, mid stent, hepatic vein end;
// Feldstein et al., Radiology 1996; Kanterman et al., AJR 1997), with a change of more than 50 cm/s from the baseline
// study. Mitchell et al. (Abdom Radiol 2025, patent shunts at venography) found mean peaks of 141 (8 mm) and 147 (10 mm)
// cm/s at the portal end, 185 and 149 mid stent, and 172 and 141 at the hepatic vein end, often highest mid stent in 8 mm
// stents. Neither Baveno VIII nor AASLD 2024 gives Doppler cut-offs. Narrowings form mostly at the hepatic vein end or in the
// hepatic vein beyond it, less often within the stent or at its portal end (Darcy, AJR 2012).

// After TIPS the splanchnic circulation grows more hyperdynamic and the hepatic artery takes up the portal flow the liver
// loses (its buffer response, with some arterioportal shunting): the patch stands for both, so the stent reads 90–190 cm/s,
// the main portal vein over 30 cm/s and the left portal vein clearly reversed, as on a working TIPS.
const STENT = { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5 };

export const TIPS_DOPPLER = {
  id: 'tips-doppler', level: 'advanced', title: 'Doppler ultrasound of TIPS', minutes: 8,
  objectives: [
    'Describe Doppler of a patent TIPS: proximal, mid and distal stent velocities and flow direction in each portal branch',
    'Explain why the intrahepatic portal branches flow toward the stent',
    'Recognize Doppler signs of TIPS dysfunction wherever stenosis forms along the stent, including a hepatopetal left portal vein',
    'Distinguish aliasing from reversed flow, and correct it by shifting the baseline or raising the velocity scale',
  ],
  summary: 'TIPS Doppler: the pre-TIPS baseline, a patent stent, aliasing, and a stenosed stent with its velocity jet, with the vessels colored by velocity and direction.',
  checks: [
    ['Which velocities suggest TIPS stenosis?', 'A velocity <90 or >190 cm/s at the proximal, mid or distal stent, a change of >50 cm/s from the baseline study, or a main portal vein velocity <30 cm/s.'],
    ['The baseline study measured 140 cm/s mid stent. Six months later: 85 cm/s proximally, 230 cm/s distally, and 22 cm/s in the main portal vein. What happened?', 'Stenosis at the hepatic vein end: the jet is there, and velocity in the rest of the stent and in the portal vein has fallen upstream of it. A single mid-stent sample could have missed it.'],
    ['A follow-up study shows hepatopetal flow in the left portal vein. Why is that a concern?', 'With a patent TIPS, flow should be directed toward the stent. Hepatopetal flow suggests TIPS stenosis.'],
    ['What confirms a suspected stenosis?', 'TIPS venography with a portosystemic pressure gradient, followed by angioplasty or a new stent if it is stenosed.'],
  ],
  slides: [
    {
      id: 'before', preset: 'cirr-decomp', params: { cirrhosis: 0.92 }, cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      vignette: 'A 53-year-old woman with HCV cirrhosis, SVR 4 years ago, has recurrent esophageal variceal bleeding despite band ligation and a beta-blocker. She has a fasting Doppler study before planned TIPS.',
      kicker: 'Before TIPS', title: 'Before TIPS, portal vein velocity is low',
      line: 'Sinusoidal resistance slows the main portal vein to {<15 cm/s}, so the portal veins are pale on the velocity map. Every follow-up study is compared with this one.',
      notes: 'The pre-TIPS study confirms portal vein patency and records flow direction and velocity. In decompensated cirrhosis main portal vein velocity is low, often <15 cm/s, and flow may be bidirectional or hepatofugal. Colored by velocity, each vessel is compared with its own normal range: pale sand when slower, teal when normal and violet when faster. Record these values: after TIPS they should rise.',
      ask: ['Why study the portal vein with Doppler before TIPS?', 'To confirm patency and to record flow direction and velocity for comparison.'],
    },
    {
      // The gate moves along the stent with the buttons; its third glows (white on the dark themes) and the probe's gate sits on it.
      id: 'jet', params: STENT, days: 30, cam: { on: ['PVH_R'] }, beats: [{ cam: { on: ['RHV_IVC', 'TIPS'] } }, { cam: 'liver' }], lens: 'velocity', tool: { kind: 'doppler', vessel: 'TIPS', gate: 'mid', points: true },
      compare: [{ label: 'Proximal', gate: 'proximal' }, { label: 'Mid', gate: 'mid', own: true }, { label: 'Distal', gate: 'distal' }],
      kicker: 'A patent TIPS', title: 'The stent is sampled at three points',
      line: 'The stent lowers the PPG from {ppg@before} to {ppg}. Sample it at three points: {<90 cm/s} or {>190 cm/s} at any one suggests stenosis.',
      caveat: 'In the model the patent stent reads about 10% lower at its portal end than mid stent; in patients the three often differ by a few tens of cm/s.',
      notes: 'A covered stent, here 9 mm in diameter, traverses the liver from the right portal vein to the right hepatic vein. This low-resistance pathway diverts most portal flow directly to the systemic circulation, so the gradient falls. A baseline Doppler study is done in the first weeks after placement, and every follow-up study is compared with it. Velocity rises as blood enters the stent, which is narrower than the portal vein, and flow is directed toward the heart along its whole length. Doppler samples the stent at its portal end (proximal), mid stent (mid) and its hepatic vein end (distal); each normally measures 90 to 190 cm/s. In shunts confirmed patent at venography, mean peak velocities were about 140 cm/s at the portal end, 150 to 185 cm/s mid stent and 140 to 170 cm/s at the hepatic vein end, often highest mid stent in 8 mm stents (Mitchell et al., 2025). A velocity outside 90 to 190 cm/s, or a change of >50 cm/s from the baseline study, suggests stenosis. These cut-offs were derived from bare stents; covered stents develop stenosis far less often, so the change from the baseline study carries more weight. Tap Proximal, Mid or Distal to move the Doppler gate; that third of the stent is lit. The figure steps along the stent with Next: the portal end, the hepatic vein end, then the whole stent.',
      ask: ['Where along the stent is the velocity measured?', 'At the portal end (proximal), in the middle (mid) and at the hepatic vein end (distal).'],
    },
    {
      // Aliasing (Ferraioli, EFSUMB; Meola et al., J Vasc Access 2021): the scale is fixed at 150 cm/s each way, the Nyquist
      // limit, below this working stent's peak (150 to 215 cm/s), so the peaks of its spectrum run off the top and come back at the bottom, as they do on a scanner.
      // The baseline down reaches 0.88 × 300 = 264 cm/s above it, so the whole spectrum then fits.
      // The button moves the baseline in place (the instrument's own option), not the model.
      id: 'alias', cam: 'liver', tool: { kind: 'doppler', vessel: 'TIPS', scale: 150 },
      compare: [{ label: 'As scanned', own: true }, { label: 'Baseline down', tool: { baseline: 0.88 } }],
      kicker: 'A patent TIPS', title: 'Velocities above the Nyquist limit alias',
      line: 'The velocity scale reaches 150 cm/s each way and stent velocity is higher, so the peaks wrap below the baseline. That is aliasing, not reversed flow.',
      notes: 'Pulsed-wave Doppler samples echoes intermittently, so it can measure a frequency shift only up to half the pulse repetition frequency (PRF), the Nyquist limit, which the scanner displays as the velocity scale. Higher velocities are displayed on the opposite side of the baseline, as if flow were reversed. In a TIPS, where velocity is high, aliasing can mimic reversed flow and obscures the true peak. Tap Baseline down: shifting the baseline gives the direction of flow more of the scale without changing the Nyquist limit, so the whole spectrum fits above it. Raising the velocity scale (a higher PRF) raises the limit itself, and a lower-frequency transducer helps too. Measure the peak velocity only once the whole spectrum is displayed without aliasing.',
      ask: ['Name two ways to correct aliasing on a spectral Doppler tracing.', 'Shift the baseline away from the direction of flow, or raise the velocity scale (PRF).'],
    },
    {
      id: 'mpv', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'before' },
      kicker: 'A patent TIPS', title: 'Main portal vein velocity rises',
      line: 'With the stent patent, main portal vein velocity rises above baseline, usually {>30 cm/s}. A later fall to {<30 cm/s} is one sign of TIPS stenosis.',
      notes: 'The stent increases flow through the main portal vein, so its velocity rises well above the pre-TIPS study, shown as the ghost reading. Flow remains hepatopetal: toward the liver and into the stent. A main portal vein velocity that falls again on follow-up points to stenosis downstream.',
      ask: ['What happens to main portal vein velocity after TIPS?', 'It rises, because the stent increases flow through it.'],
    },
    {
      id: 'left', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', vessel: 'PVH_L' },
      kicker: 'A patent TIPS', title: 'Every intrahepatic portal branch flows toward the stent',
      line: 'With a patent TIPS every branch flows toward the stent, so the [left portal vein](lpv) is hepatofugal. Only the right portal segment before the stent is hepatopetal.',
      notes: 'The stent is the lowest-resistance outflow from the liver, so blood in the left portal vein, much of it hepatic arterial blood that has entered the sinusoids, flows back to the bifurcation and into the stent. Before TIPS this branch was hepatopetal. Here hepatofugal flow is the expected finding, a sign of a patent stent, not of advanced disease. Colored by direction, reversed flow is orange. The stent starts in the right portal vein, close to the bifurcation, so the short segment between the bifurcation and the stent remains hepatopetal, on its way into the stent. Beyond the stent the right portal branches drain back toward it, hepatofugal like the left. The rule is the same for every segment: flow is directed toward the stent. (Lechowicz 2015, Polish Ultrasound Society standards.)',
      ask: ['With a patent TIPS, what is the direction of left portal vein flow?', 'Away from the liver, toward the stent (hepatofugal).'],
    },
    {
      // A 60 % pinch in the distal third (stenosisSite unset: distal), sampled there: the jet runs over 190 cm/s, the rest under 90.
      // The buttons move the same pinch along the stent: the flow is the same wherever it sits, and the gate ('site') follows it.
      id: 'narrow', params: { stenosis: { TIPS: 0.6 } }, days: 180, cam: 'liver', lens: 'velocity',
      mark: { edges: ['TIPS'], label: 'Stenosis', seg: 'site' }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['ppg'], delta: 'jet',
      compare: [{ label: 'Proximal', params: { stenosisSite: { TIPS: 'proximal' } } }, { label: 'Mid', params: { stenosisSite: { TIPS: 'mid' } } },
        { label: 'Distal', own: true, params: { stenosisSite: { TIPS: 'distal' } } }],
      kicker: 'TIPS stenosis', title: 'A stenosed stent shows low velocity with a focal jet',
      line: 'At 6 months, {asc} of ascites has reaccumulated. The jet at the stenosis is {>190 cm/s}, the rest of the stent {<90 cm/s}, and the PPG is back to {ppg}.',
      notes: 'Stenosis usually develops at the hepatic vein end of the stent, or in the hepatic vein beyond it, often from intimal hyperplasia at the junction of the stent and the hepatic vein, or from a stent that does not extend to the IVC. Within the stent, pseudointimal hyperplasia or a kink can narrow it, and at the portal end the stent can be too short or angled against the vein wall. Along most of the stent the velocity falls, often <90 cm/s, while a short jet at the stenosis itself can exceed 190 cm/s. Doppler localizes the stenosis by its jet: the highest of the three velocities, with low velocity on either side. That is why all three points are sampled: a gate away from the stenosis measures only the low velocity. The gradient rises again and the indication for the TIPS recurs: ascites, or varices that can bleed. The tile compares with the patent stent. Tap Proximal, Mid or Distal to move the stenosis along the stent; the gate follows it. The model draws the stenosis as one short segment, about 1 cm long; in patients it can be longer or lie in the hepatic vein beyond the stent.',
      ask: ['TIPS velocities are 60 cm/s proximally, 240 cm/s mid stent and 65 cm/s distally. Where is the stenosis?', 'Mid stent, where the jet is.'],
    },
    {
      id: 'warn', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', vessel: 'PVH_L' },
      whatIf: { label: 'Stent stenosis', param: 'stenosis.TIPS', min: 0, max: 0.8, step: 0.05, ends: ['Patent', 'Stenosed'] },
      kicker: 'TIPS stenosis', title: 'Hepatopetal left portal vein flow signals TIPS dysfunction',
      line: 'Hepatopetal flow looks normal, but with a TIPS the [left portal vein](lpv) should flow toward the stent. Hepatopetal flow here suggests stenosis.',
      notes: 'When the stent stenoses, it no longer draws flow from the intrahepatic branches, and left portal vein flow becomes hepatopetal again. In isolation the waveform looks normal, which is why it is easily missed. Reversal of branch flow is a late and insensitive sign, so it is interpreted with the stent and portal vein velocities and the change from the baseline study. Drag Stent stenosis toward Patent and watch the branch turn back toward the stent.',
      ask: ['Why is a hepatopetal left portal vein abnormal after TIPS?', 'A patent stent draws branch flow toward it; hepatopetal flow means it no longer does, which suggests stenosis.'],
    },
    {
      id: 'backup', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'mpv' },
      kicker: 'TIPS stenosis', title: 'Main portal vein velocity falls again',
      line: 'Upstream of the stenosed stent, main portal vein velocity falls to {<30 cm/s}, toward its pre-TIPS value, and the varices refill.',
      notes: 'The ghost reading is the main portal vein with the patent stent. With the stent stenosed, portal flow is again directed through the liver and the collaterals, so velocity falls and the varices refill.',
      ask: ['A patient with a TIPS has rebleeding, and main portal vein velocity has fallen since the baseline study. What do you suspect?', 'TIPS stenosis.'],
    },
    {
      id: 'fix', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true },
      data: 'tiles', tiles: ['ppg'], key: ['ppg'],
      compare: [{ label: 'Stenosed', own: true, params: { stenosis: { TIPS: 0.6 } } }, { label: 'Dilated', params: { stenosis: { TIPS: 0 } } }],
      kicker: 'TIPS stenosis', title: 'TIPS venography confirms stenosis, and the stent is dilated',
      line: 'Doppler raises the suspicion. TIPS venography measures the gradient, and angioplasty or a new stent lowers the PPG from {ppg}.',
      notes: 'A Doppler study that suggests stenosis is followed by TIPS venography, with the portosystemic gradient measured across the stent. A stenosed stent is treated with balloon angioplasty or relined with a new stent, and the gradient is measured again. Afterward stent velocity returns toward baseline, and both portal branches flow toward the stent again. Tap the buttons to compare the stenosed and the dilated stent.',
      ask: ['What is the next step for hepatopetal left portal vein flow after TIPS?', 'TIPS venography with a portosystemic gradient, and angioplasty or a new stent if the stent is stenosed.'],
    },
    {
      // (The relation chart before the summary, the narrowed stent of the slides before it: the PPG and the main portal vein's velocity read against the
      // stent's narrowing, 0 to 80%, the patient otherwise as it stands. The ring is the 60% narrowing.)
      id: 'relation', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' },
      tool: { kind: 'curve', param: 'stenosis.TIPS', from: 0, to: 0.8, step: 0.05, lines: ['ppg', 'pvVel'], cuts: [12] },
      kicker: 'Summary', title: 'Progressive TIPS stenosis raises the PPG and lowers portal vein velocity',
      line: 'The PPG exceeds 12 mmHg at about 33% stenosis, and main portal vein velocity drops {<30 cm/s} at about 50%. At 60% stenosis the PPG is {ppg}.',
      notes: 'Each point is the same patient with slightly more stenosis, the PPG and mean main portal vein velocity plotted against the degree of stenosis. The PPG exceeds the 12 mmHg target at about 33% stenosis, and portal vein velocity drops <30 cm/s at about 50%, one of the Doppler signs of stenosis. The ring is the 60% stenosis of the preceding slides. After TIPS, a PPG <12 mmHg means a beta-blocker is no longer needed (AASLD 2024). The velocities are the model\'s means. (AASLD 2024; McNaughton and Abu-Yousef 2011.)',
      ask: ['In a patient with a TIPS, ascites recurs and main portal vein velocity has fallen to 25 cm/s. What do you suspect?', 'TIPS stenosis: the gradient rises as the stent narrows, and portal vein velocity falls with it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'pvVel'], asc: false, vs: 'first', note: ['Stent', 'Left portal vein'], rowHead: 'Scan',
      of: [{ id: 'before', kicker: 'Reference', title: 'Before TIPS', note: ['No stent', 'Hepatopetal'], ref: true },
        { id: 'jet', title: 'Patent TIPS', note: ['90 to 190 cm/s at each point', 'Toward the stent'] },
        { id: 'narrow', title: 'Stenosed TIPS', note: ['>190 cm/s at the stenosis, <90 elsewhere', 'Hepatopetal again'] }],
      kicker: 'Summary', title: 'Doppler after TIPS',
      line: 'Stenosis shows as a stent velocity outside 90 to 190 cm/s, a main portal vein velocity <30 cm/s, or hepatopetal left portal vein flow.',
      notes: 'Interpret every TIPS Doppler against the baseline study. In a patent stent the velocity is 90 to 190 cm/s at the proximal, mid and distal stent, main portal vein velocity is higher than before, and the intrahepatic branches flow toward the stent. Stenosis shows as a velocity outside that range at any point or a change of >50 cm/s, a main portal vein velocity <30 cm/s, and branches that become hepatopetal again. The PV velocity column is the main portal vein: it rises after TIPS and falls again, below 30 cm/s, with stenosis.',
      ask: ['Name three Doppler signs of TIPS stenosis.', 'A stent velocity <90 or >190 cm/s (or a change of >50 cm/s), a main portal vein <30 cm/s, and hepatopetal flow in the intrahepatic branches.'],
    },
  ],
};
