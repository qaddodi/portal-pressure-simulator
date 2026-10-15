// Presenter talk: Doppler ultrasound of a TIPS (Advanced): the stent, the portal vein and both intrahepatic branches in a
// working shunt, then the same scan when the stent narrows. Slide fields as documented at the top of decks.js.
// Branch directions checked (14 Oct 2026) against the UT Southwestern and University of Washington TIPS Doppler protocols,
// McNaughton and Abu-Yousef (RadioGraphics 2011) and Nicolas et al. (World J Hepatol 2017): with a working TIPS every
// segment flows toward the stent; the right portal vein is hepatopetal only between the bifurcation and the stent.

export const TIPS_DOPPLER = {
  id: 'tips-doppler', level: 'advanced', title: 'Doppler ultrasound of TIPS', minutes: 10,
  objectives: [
    'Describe the Doppler of a working TIPS: the stent velocity and the flow in each portal branch',
    'Explain why the intrahepatic portal branches flow toward the stent',
    'Recognize the Doppler signs of TIPS stenosis, including a hepatopetal left portal vein',
    'Read the figure colored by velocity, flow, direction, congestion and blood origin',
  ],
  summary: 'Doppler of a TIPS, from the scan before the stent to a working stent and a narrowed one, with the vessels colored by velocity, flow, direction, congestion and blood origin.',
  checks: [
    ['With a working TIPS, which way does the left portal vein flow?', 'Toward the stent, away from the liver (hepatofugal).'],
    ['Which velocities suggest stenosis?', 'A stent velocity under 90 or over 190 cm/s, a change of more than 50 cm/s from the baseline study, or a main portal vein under 30 cm/s.'],
    ['A follow-up scan shows hepatopetal flow in the left portal vein. Why is that a concern?', 'With a working TIPS it should flow toward the stent. Flow toward the liver suggests the stent is narrowing.'],
    ['What confirms a suspected stenosis?', 'TIPS venography with a portosystemic pressure gradient, followed by angioplasty or a new stent if it is narrowed.'],
  ],
  slides: [
    {
      id: 'before', preset: 'cirr-decomp', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      data: 'tiles', tiles: ['pvVel', 'ppg'], key: ['pvVel'],
      vignette: 'A 53-year-old woman with cirrhosis from hepatitis C, cured 4 years ago, has bled again from esophageal varices despite banding and a beta-blocker. She has a fasting Doppler before a planned TIPS.',
      kicker: 'Before TIPS', title: 'Before the stent, portal flow is slow',
      line: 'Resistance in the sinusoids slows the main portal vein, under {<15 cm/s}, so colored by velocity the portal veins look pale. These velocities are the starting point for every later scan.',
      notes: 'The scan before TIPS confirms that the portal vein is patent and records its direction and velocity. In decompensated cirrhosis the main portal vein is slow, often under 15 cm/s, and may be to-and-fro or reversed. Colored by velocity, each vessel is compared with its own normal range: pale sand when slower, teal when normal and violet when faster. Keep these numbers: after the stent they should rise.',
      ask: ['Why scan the portal vein before a TIPS?', 'To confirm that it is patent and to record its direction and velocity for comparison.'],
    },
    {
      // The stent switched on in real time, before the varices shrink over the following weeks (the next slide): about
      // three quarters of the gut and spleen blood already bypasses the liver through collaterals, and the TIPS takes it
      // to almost 90%, while the varices slow from about 270 to 170 cm/s. The buttons carry the next slide's settings.
      id: 'shunted', cam: 'route', lens: 'origin', labels: ['CONF'], data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'],
      compare: [{ label: 'Before TIPS', own: true, params: { tips: { on: false, d: 8 }, splanchnicTone: 1, habrStrength: 1, apShunt: 0 } },
        { label: 'With TIPS', params: { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5 } }],
      kicker: 'Before TIPS', title: 'Most portal blood already bypasses the liver',
      line: 'Colored by blood origin, gut and spleen blood reaches the heart through the varices, and {shunt} of it bypasses the liver before the TIPS. With the stent the share rises only a little, but the route moves from the varices to the stent.',
      notes: 'In decompensated cirrhosis, collaterals already carry about three quarters of the gut and spleen blood past the liver, mostly through the gastroesophageal varices. A TIPS adds a wider route with less resistance, so the shunted share rises only a little, to almost 90%, while flow through the varices falls and the PPG falls with it. More blood now reaches the heart without passing through the liver, which is why hepatic encephalopathy can follow a TIPS. Tap the buttons to compare the circulation before and with the stent; over the following weeks the varices shrink further.',
      ask: ['Why does the shunted share rise only a little after a TIPS?', 'The collaterals were already carrying most of the gut blood past the liver; the stent mainly moves that flow off the varices.'],
    },
    {
      // After TIPS the splanchnic circulation grows more hyperdynamic and the hepatic artery takes up the portal flow the liver
      // loses (its buffer response, with some arterioportal shunting): the patch stands for both, so the stent reads 90–190 cm/s,
      // the main portal vein over 30 cm/s and the left portal vein clearly reversed, as on a working TIPS.
      id: 'stent', params: { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5 }, days: 30, cam: 'liver', lens: 'flow', labels: ['CONF'],
      mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'shunt'], key: ['ppg'], delta: 'before',
      kicker: 'A working TIPS', title: 'The stent carries most of the portal flow',
      line: 'A covered stent joins the [right portal vein](RPV) to the right hepatic vein. Colored by flow, it is the busiest vessel in the liver, and the PPG falls from {ppg@before} before the TIPS to {ppg}.',
      notes: 'A covered stent, here 9 mm wide, runs through the liver from the right portal vein to the right hepatic vein. The low-resistance path takes most of the portal blood straight to the heart, so the gradient falls. Colored by flow, each vessel shows how much blood it carries. A baseline Doppler is done in the first weeks after the procedure, and every later scan is compared with it.',
      ask: ['When is the baseline TIPS Doppler done?', 'In the first weeks after the stent is placed; every later scan is compared with it.'],
    },
    {
      id: 'jet', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, tool: { kind: 'doppler', vessel: 'TIPS' },
      kicker: 'A working TIPS', title: 'Flow in a working stent is fast',
      line: 'Blood speeds up as it enters the stent, which is narrower than the portal vein. Colored by velocity, a working stent shows in the normal colour. The Doppler reports it at the proximal, mid and distal stent. A velocity under {<90 cm/s} or over {>190 cm/s} at any of them suggests narrowing.',
      notes: 'The stent is sampled at its portal end, in the middle and at its hepatic vein end. Flow runs from the portal vein toward the heart along its whole length, typically at 90 to 190 cm/s. A velocity outside that range, or a change of more than 50 cm/s from the baseline study, suggests stenosis. These cut-offs come from bare stents; covered stents narrow far less often, so the change from the baseline study counts for more.',
      ask: ['Where along the stent is the velocity measured?', 'At the portal end, in the middle and at the hepatic vein end.'],
    },
    {
      id: 'mpv', cam: 'portal', lens: 'velocity', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'before' },
      kicker: 'A working TIPS', title: 'The main portal vein speeds up',
      line: 'With the stent open, the main portal vein carries more blood, and faster, than before, usually over {>30 cm/s}. A later fall under {<30 cm/s} is one sign that the stent is narrowing.',
      notes: 'The stent draws portal blood through the main portal vein, so its velocity rises well above the scan before TIPS, shown as the ghost reading. Flow stays hepatopetal: toward the liver and on into the stent. A main portal vein that slows again on a later scan points to a narrowing downstream.',
      ask: ['What happens to main portal vein velocity after a TIPS?', 'It rises, because the stent draws more blood through it.'],
    },
    {
      id: 'left', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', vessel: 'PVH_L' },
      kicker: 'A working TIPS', title: 'The left portal vein flows toward the stent',
      line: 'With a working TIPS, every branch flows toward the stent. The [left portal vein](lpv) turns hepatofugal, drawn below the baseline and in the reversed colour.',
      notes: 'The stent is the easiest way out of the liver, so blood in the left portal vein, much of it hepatic arterial blood that has entered the sinusoids, runs back to the bifurcation and into the stent. Before the TIPS this branch flowed toward the liver. Here hepatofugal flow is the expected finding, a sign that the stent is working, not a sign of advanced disease. Colored by direction, reversed flow is orange.',
      ask: ['With a working TIPS, which way does the left portal vein flow?', 'Away from the liver, toward the stent (hepatofugal).'],
    },
    {
      id: 'right', cam: 'liver', lens: 'direction', labels: ['RPV'], tool: { kind: 'doppler', vessel: 'PVH_R', title: 'Right portal vein, before the stent' },
      mark: { edges: ['PRE_R'], label: 'Hepatofugal beyond the stent', kind: 'note' },
      kicker: 'A working TIPS', title: 'The right portal vein runs into the stent',
      line: 'The [right portal vein](RPV) flows hepatopetal only in the short segment before the stent, and hepatofugal beyond it.',
      notes: 'The stent starts in the right portal vein, close to the bifurcation. The Doppler here samples the short segment between the bifurcation and the stent, where blood flows toward the liver because it is on its way into the stent. Beyond the stent, the right portal branches drain back toward it, so they are hepatofugal like the left, drawn in the reversed colour. The rule is the same for every segment: flow runs toward the stent.',
      ask: ['Why is the right portal vein hepatopetal before the stent but hepatofugal beyond it?', 'Every segment flows toward the stent, and the stent starts in the right portal vein.'],
    },
    {
      id: 'narrow', params: { stenosis: { TIPS: 0.6 } }, days: 180, cam: 'liver', lens: 'velocity',
      mark: { edges: ['TIPS'], label: 'Narrowed stent' }, tool: { kind: 'doppler', vessel: 'TIPS' }, data: 'tiles', tiles: ['ppg'], key: ['ppg'], delta: 'stent',
      kicker: 'TIPS stenosis', title: 'A narrowed stent runs slow',
      line: 'Six months later, fluid reappears around the liver on ultrasound. The proximal and mid stent have slowed under {<90 cm/s}, the distal stent runs over {>190 cm/s} through the narrowing, and the PPG is back to {ppg}.',
      caveat: 'The model draws the narrowing as one short pinch at the hepatic vein end, where it usually forms; the proximal and mid readings share one velocity.',
      notes: 'Stenosis usually develops at the hepatic vein end of the stent, or in the hepatic vein beyond it. Along most of the stent the velocity falls, often under 90 cm/s, while a short jet at the narrowing itself can run over 190 cm/s. The gradient rises again and what the stent treated returns: ascites, or varices that can bleed. The tiles compare with the working stent.',
      ask: ['Where does a TIPS usually narrow?', 'At its hepatic vein end, or in the hepatic vein beyond it.'],
    },
    {
      id: 'warn', cam: 'liver', lens: 'direction', labels: ['LPV'], terms: ['lpv'], tool: { kind: 'doppler', vessel: 'PVH_L' },
      whatIf: { label: 'Stent narrowing', param: 'stenosis.TIPS', min: 0, max: 0.8, step: 0.05, ends: ['Open', 'Narrowed'] },
      kicker: 'TIPS stenosis', title: 'A hepatopetal left portal vein is a warning',
      line: 'Flow toward the liver looks normal, but with a TIPS the [left portal vein](lpv) should flow toward the stent. Hepatopetal flow here suggests stenosis.',
      notes: 'When the stent narrows it no longer draws the intrahepatic branches, and the left portal vein turns back toward the liver. On its own the waveform looks normal, which is why it is easy to miss. Branch reversal is a late and insensitive sign, so it is read with the stent and portal vein velocities and the change from the baseline study. Drag the slider to open the stent and watch the branch turn back toward it.',
      ask: ['Why is a hepatopetal left portal vein abnormal after TIPS?', 'A working stent draws the branch toward it; flow toward the liver means the stent no longer does, which suggests stenosis.'],
    },
    {
      id: 'backup', cam: 'route', lens: 'heat', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'mpv' },
      data: 'tiles', tiles: ['varix'], key: ['varix'], delta: 'stent',
      kicker: 'TIPS stenosis', title: 'The main portal vein slows again',
      line: 'Behind the narrowed stent, the main portal vein slows under {<30 cm/s}, toward its speed before the TIPS. Colored by congestion, the gut veins show pressure backing up, and the varices grow again.',
      notes: 'The ghost reading is the main portal vein with the working stent. With the stent narrowed, portal blood has to find its way through the liver and the collaterals again, so the velocity falls and the varices refill. Colored by congestion, each vessel shows how far its pressure sits above a healthy one.',
      ask: ['A TIPS patient rebleeds and the main portal vein has slowed since the baseline study. What do you suspect?', 'Stenosis of the stent.'],
    },
    {
      id: 'fix', cam: 'liver', lens: 'velocity', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' }, tool: { kind: 'doppler', vessel: 'TIPS' },
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
        { id: 'stent', title: 'Working TIPS', note: ['90 to 190 cm/s', 'Toward the stent'] },
        { id: 'narrow', title: 'Stenosed TIPS', note: ['Under 90 or over 190 cm/s', 'Toward the liver again'] }],
      kicker: 'Summary', title: 'Doppler after TIPS',
      line: 'With a working TIPS, every branch flows toward the stent. A slow or fast stent, a main portal vein under 30 cm/s or a left portal vein that turns hepatopetal suggests stenosis.',
      notes: 'Read every TIPS Doppler against the baseline study. In a working stent the velocity sits between 90 and 190 cm/s, the main portal vein is faster than before, and the intrahepatic branches flow toward the stent. Stenosis shows as a stent velocity outside that range or a change of more than 50 cm/s, a main portal vein under 30 cm/s, and branches that turn back toward the liver.',
      ask: ['Name three Doppler signs of TIPS stenosis.', 'A stent velocity under 90 or over 190 cm/s (or a change of more than 50 cm/s), a main portal vein under 30 cm/s, and hepatopetal flow in the intrahepatic branches.'],
    },
  ],
};
