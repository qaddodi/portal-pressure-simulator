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
    'Describe the Doppler of a working TIPS: the proximal, mid and distal stent velocities and the flow in each portal branch',
    'Explain why the intrahepatic portal branches flow toward the stent',
    'Recognize the Doppler signs of TIPS stenosis wherever it forms along the stent, including a hepatopetal left portal vein',
    'Tell aliasing from reversed flow, and remove it by moving the baseline or raising the scale',
  ],
  summary: 'Doppler of a TIPS: the scan before the stent, a working stent, aliasing, and a narrowed stent with its jet, with the vessels colored by velocity and direction.',
  checks: [
    ['Which velocities suggest stenosis?', 'A velocity under 90 or over 190 cm/s at the proximal, mid or distal stent, a change of more than 50 cm/s from the baseline study, or a main portal vein under 30 cm/s.'],
    ['The baseline scan read 140 cm/s mid stent. Six months later: 85 cm/s proximally, 230 cm/s distally, and 22 cm/s in the main portal vein. What happened?', 'A narrowing at the hepatic vein end: the jet sits there, and the rest of the stent and the portal vein have slowed behind it. A single mid-stent sample could have missed it.'],
    ['A follow-up scan shows hepatopetal flow in the left portal vein. Why is that a concern?', 'With a working TIPS it should flow toward the stent. Flow toward the liver suggests the stent is narrowing.'],
    ['What confirms a suspected stenosis?', 'TIPS venography with a portosystemic pressure gradient, followed by angioplasty or a new stent if it is narrowed.'],
  ],
  slides: [
    {
      id: 'before', preset: 'cirr-decomp', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      vignette: 'A 53-year-old woman with cirrhosis from hepatitis C, cured 4 years ago, has bled again from esophageal varices despite banding and a beta-blocker. She has a fasting Doppler before a planned TIPS.',
      kicker: 'Before TIPS', title: 'Before the stent, portal flow is slow',
      line: 'Resistance in the sinusoids slows the main portal vein to under {<15 cm/s}, so the portal veins look pale. Every later scan is compared with this one.',
      notes: 'The scan before TIPS confirms that the portal vein is patent and records its direction and velocity. In decompensated cirrhosis the main portal vein is slow, often under 15 cm/s, and may be to-and-fro or reversed. Colored by velocity, each vessel is compared with its own normal range: pale sand when slower, teal when normal and violet when faster. Keep these numbers: after the stent they should rise.',
      ask: ['Why scan the portal vein before a TIPS?', 'To confirm that it is patent and to record its direction and velocity for comparison.'],
    },
    {
      // The gate moves along the stent with the buttons; its third glows (white on the dark themes) and the probe's gate sits on it.
      id: 'jet', params: STENT, days: 30, cam: 'liver', lens: 'velocity', tool: { kind: 'doppler', vessel: 'TIPS', gate: 'mid', points: true },
      compare: [{ label: 'Proximal', gate: 'proximal' }, { label: 'Mid', gate: 'mid', own: true }, { label: 'Distal', gate: 'distal' }],
      kicker: 'A working TIPS', title: 'The stent is sampled at three points',
      line: 'The stent drops the PPG from {ppg@before} to {ppg}. Read it at three points: under {<90 cm/s} or over {>190 cm/s} at any one suggests narrowing.',
      caveat: 'In the model the open stent reads about a tenth slower at its portal end than mid stent; in patients the three often differ by a few tens of cm/s.',
      notes: 'A covered stent, here 9 mm wide, runs through the liver from the right portal vein to the right hepatic vein. The low-resistance path takes most of the portal blood straight to the heart, so the gradient falls. A baseline Doppler is done in the first weeks after the procedure, and every later scan is compared with it. Blood speeds up as it enters the stent, which is narrower than the portal vein, and runs from the portal vein toward the heart along its whole length. The Doppler reads the stent at its portal end (proximal), in the middle (mid) and at its hepatic vein end (distal), and each normally reads 90 to 190 cm/s. In patent shunts confirmed at venography, mean peaks were about 140 cm/s at the portal end, 150 to 185 cm/s mid stent and 140 to 170 cm/s at the hepatic vein end, often highest mid stent in 8 mm stents (Mitchell et al., 2025). A velocity outside 90 to 190 cm/s, or a change of more than 50 cm/s from the baseline study, suggests stenosis. These cut-offs come from bare stents; covered stents narrow far less often, so the change from the baseline study counts for more. Tap Proximal, Mid or Distal to move the Doppler gate; that third of the stent glows green.',
      ask: ['Where along the stent is the velocity measured?', 'At the portal end (proximal), in the middle (mid) and at the hepatic vein end (distal).'],
    },
    {
      // Aliasing (Ferraioli, EFSUMB; Meola et al., J Vasc Access 2021): the scale is fixed at 80 cm/s each way, the Nyquist
      // limit, below this working stent's velocity, so the top of its spectrum wraps round to the other side of the baseline.
      // The button moves the baseline in place (the instrument's own option), not the model.
      id: 'alias', cam: 'liver', tool: { kind: 'doppler', vessel: 'TIPS', scale: 80 },
      compare: [{ label: 'As scanned', own: true }, { label: 'Baseline down', tool: { baseline: 0.85 } }],
      kicker: 'A working TIPS', title: 'Flow faster than the scale wraps round',
      line: 'The scale reaches 80 cm/s each way and the stent\'s flow is faster, so the top of the spectrum wraps below the baseline. That is aliasing, not reversed flow.',
      notes: 'Pulsed Doppler samples the echoes in bursts, so it can measure a velocity only up to half its pulse repetition frequency, the Nyquist limit, which the scanner shows as the velocity scale. Faster flow is drawn on the other side of the baseline, as if it ran the other way. In a TIPS, where flow is fast, aliasing can look like reversed flow and hides the true peak. Tap Baseline down: moving the baseline gives the direction of flow more of the scale without changing the Nyquist limit, so the whole spectrum fits above it. Raising the scale, a higher pulse repetition frequency, lifts the limit itself, and a lower frequency transducer helps too. Read the peak velocity only once the whole spectrum fits.',
      ask: ['Name two ways to remove aliasing from a spectral trace.', 'Move the baseline away from the direction of flow, or raise the velocity scale.'],
    },
    {
      id: 'mpv', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'before' },
      kicker: 'A working TIPS', title: 'The main portal vein speeds up',
      line: 'With the stent open, the main portal vein runs faster than before, usually over {>30 cm/s}. A later fall under {<30 cm/s} is one sign that the stent is narrowing.',
      notes: 'The stent draws portal blood through the main portal vein, so its velocity rises well above the scan before TIPS, shown as the ghost reading. Flow stays hepatopetal: toward the liver and on into the stent. A main portal vein that slows again on a later scan points to a narrowing downstream.',
      ask: ['What happens to main portal vein velocity after a TIPS?', 'It rises, because the stent draws more blood through it.'],
    },
    {
      id: 'left', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', grid: ['dir'], vessel: 'PVH_L' },
      kicker: 'A working TIPS', title: 'Every branch flows toward the stent',
      line: 'With a working TIPS every branch flows toward the stent, so the [left portal vein](lpv) is hepatofugal, below the baseline. The right portal vein is hepatopetal only before the stent.',
      notes: 'The stent is the easiest way out of the liver, so blood in the left portal vein, much of it hepatic arterial blood that has entered the sinusoids, runs back to the bifurcation and into the stent. Before the TIPS this branch flowed toward the liver. Here hepatofugal flow is the expected finding, a sign that the stent is working, not a sign of advanced disease. Colored by direction, reversed flow is orange. The stent starts in the right portal vein, close to the bifurcation, so the short segment between the bifurcation and the stent still flows toward the liver, on its way into the stent. Beyond the stent the right portal branches drain back toward it, hepatofugal like the left. The rule is the same for every segment: flow runs toward the stent. (Lechowicz 2015, Polish Ultrasound Society standards.)',
      ask: ['With a working TIPS, which way does the left portal vein flow?', 'Away from the liver, toward the stent (hepatofugal).'],
    },
    {
      // A 60 % pinch in the distal third (stenosisSite unset: distal), sampled there: the jet runs over 190 cm/s, the rest under 90.
      // The buttons move the same pinch along the stent: the flow is the same wherever it sits, and the gate ('site') follows it.
      id: 'narrow', params: { stenosis: { TIPS: 0.6 } }, days: 180, cam: 'liver', lens: 'velocity',
      mark: { edges: ['TIPS'], label: 'Narrowing', seg: 'site' }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true }, data: 'tiles', tiles: ['ppg'], key: ['ppg'], delta: 'jet',
      compare: [{ label: 'Proximal', params: { stenosisSite: { TIPS: 'proximal' } } }, { label: 'Mid', params: { stenosisSite: { TIPS: 'mid' } } },
        { label: 'Distal', own: true, params: { stenosisSite: { TIPS: 'distal' } } }],
      kicker: 'TIPS stenosis', title: 'A narrowed stent runs slow, with a jet',
      line: 'Six months on, fluid has returned. A jet runs over {>190 cm/s} at the narrowing, the rest reads under {<90 cm/s}, and the PPG is back to {ppg}.',
      notes: 'Stenosis usually develops at the hepatic vein end of the stent, or in the hepatic vein beyond it, often from intimal hyperplasia where the stent meets the hepatic vein, or from a stent that stops short of the cava. Within the stent, pseudointimal hyperplasia or a kink can narrow it, and at the portal end the stent can be too short or angled against the vein wall. Along most of the stent the velocity falls, often under 90 cm/s, while a short jet at the narrowing itself can run over 190 cm/s. The Doppler finds the site by its jet: the fastest of the three readings, with slow flow on either side. That is why all three points are sampled: a gate away from the narrowing reads only the slow flow. The gradient rises again and what the stent treated returns: ascites, or varices that can bleed. The tile compares with the working stent. Tap Proximal, Mid or Distal to move the narrowing along the stent; the gate follows it. The model draws the narrowing as one short pinch, about 1 cm long; in patients it can be longer or lie in the hepatic vein beyond the stent.',
      ask: ['A TIPS reads 60 cm/s proximally, 240 cm/s mid stent and 65 cm/s distally. Where is the narrowing?', 'Mid stent, where the jet is.'],
    },
    {
      id: 'warn', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', grid: ['dir'], vessel: 'PVH_L' },
      whatIf: { label: 'Stent narrowing', param: 'stenosis.TIPS', min: 0, max: 0.8, step: 0.05, ends: ['Open', 'Narrowed'] },
      kicker: 'TIPS stenosis', title: 'A hepatopetal left portal vein is a warning',
      line: 'Flow toward the liver looks normal, but with a TIPS the [left portal vein](lpv) should flow toward the stent. Hepatopetal flow here suggests stenosis.',
      notes: 'When the stent narrows it no longer draws the intrahepatic branches, and the left portal vein turns back toward the liver. On its own the waveform looks normal, which is why it is easy to miss. Branch reversal is a late and insensitive sign, so it is read with the stent and portal vein velocities and the change from the baseline study. Drag the slider to open the stent and watch the branch turn back toward it.',
      ask: ['Why is a hepatopetal left portal vein abnormal after TIPS?', 'A working stent draws the branch toward it; flow toward the liver means the stent no longer does, which suggests stenosis.'],
    },
    {
      id: 'backup', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'mpv' },
      kicker: 'TIPS stenosis', title: 'The main portal vein slows again',
      line: 'Behind the narrowed stent, the main portal vein slows under {<30 cm/s}, toward its speed before the TIPS, and the varices fill again.',
      notes: 'The ghost reading is the main portal vein with the working stent. With the stent narrowed, portal blood has to find its way through the liver and the collaterals again, so the velocity falls and the varices refill.',
      ask: ['A TIPS patient rebleeds and the main portal vein has slowed since the baseline study. What do you suspect?', 'Stenosis of the stent.'],
    },
    {
      id: 'fix', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true },
      data: 'tiles', tiles: ['ppg'], key: ['ppg'],
      compare: [{ label: 'Narrowed', own: true, params: { stenosis: { TIPS: 0.6 } } }, { label: 'Dilated', params: { stenosis: { TIPS: 0 } } }],
      kicker: 'TIPS stenosis', title: 'Venography confirms it, and the stent is reopened',
      line: 'Doppler raises the suspicion. TIPS venography measures the gradient, and angioplasty or a new stent lowers the PPG from {ppg}.',
      notes: 'A Doppler that suggests stenosis is followed by TIPS venography, with the portosystemic gradient measured across the stent. A narrowed stent is dilated with a balloon or relined with a new stent, and the gradient is measured again. Afterward the stent velocity returns toward the baseline, and both portal branches flow toward the stent again. Tap the buttons to compare the narrowed and the dilated stent.',
      ask: ['What does a hepatopetal left portal vein lead to after TIPS?', 'TIPS venography with a gradient, and angioplasty or a new stent if the stent is narrowed.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg'], asc: false, vs: 'first', note: ['Stent', 'Left portal vein'], rowHead: 'Scan',
      of: [{ id: 'before', kicker: 'Reference', title: 'Before TIPS', note: ['No stent', 'Toward the liver'], ref: true },
        { id: 'jet', title: 'Working TIPS', note: ['90 to 190 cm/s at each point', 'Toward the stent'] },
        { id: 'narrow', title: 'Stenosed TIPS', note: ['Over 190 cm/s at the narrowing, under 90 elsewhere', 'Toward the liver again'] }],
      kicker: 'Summary', title: 'Doppler after TIPS',
      line: 'Narrowing shows as a stent velocity outside 90 to 190 cm/s, a main portal vein under 30 cm/s, or a left portal vein that flows toward the liver again.',
      notes: 'Read every TIPS Doppler against the baseline study. In a working stent the velocity sits between 90 and 190 cm/s at the proximal, mid and distal stent, the main portal vein is faster than before, and the intrahepatic branches flow toward the stent. Stenosis shows as a velocity outside that range at any point or a change of more than 50 cm/s, a main portal vein under 30 cm/s, and branches that turn back toward the liver.',
      ask: ['Name three Doppler signs of TIPS stenosis.', 'A stent velocity under 90 or over 190 cm/s (or a change of more than 50 cm/s), a main portal vein under 30 cm/s, and hepatopetal flow in the intrahepatic branches.'],
    },
  ],
};
