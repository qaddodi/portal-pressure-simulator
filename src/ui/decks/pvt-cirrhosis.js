// Presenter talk: a partial portal vein clot in a patient with cirrhosis, from the scan that finds it to six months
// of anticoagulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const PVT_CIRRHOSIS = {
  id: 'pvt-cirrhosis', level: 'core', title: 'Portal vein thrombosis in cirrhosis', minutes: 9,
  objectives: [
    'Name the risk factors for portal vein thrombosis in cirrhosis',
    'Explain why the HVPG misses a clot that the PPG finds',
    'Prepare for anticoagulation: variceal prophylaxis that does not delay it',
    'Describe what months of anticoagulation do to the clot and the pressures',
  ],
  checks: [
    ['What is the strongest local risk factor for a portal vein clot in cirrhosis?', 'Slow flow in the portal vein.'],
    ['Why does the HVPG barely change with a portal vein clot?', 'The wedge reads the sinusoids beyond the clot. The PPG rises instead.'],
    ['What comes before anticoagulation?', 'Variceal bleeding prophylaxis, carvedilol if tolerated, without letting it delay the anticoagulant.'],
    ['A partial portal vein clot grows to fill the vein, and the varices enlarge. Which lever moved?', 'Resistance in the portal vein, before the liver: the pressure behind the clot rises and more blood takes the collaterals that feed the varices.'],
  ],
  summary: 'A partial clot in a cirrhotic portal vein: what it does to the portal pressure and the varices, why the HVPG misses it, and how months of anticoagulation reopen the vein.',
  slides: [
    {
      id: 'base', tick: 'Before the clot', preset: 'csph', cam: 'portal', terms: ['pv'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'The clot', site: 'sin', title: 'Cirrhosis sets the stage for a portal vein clot',
      vignette: 'A 61-year-old man with hepatitis C cirrhosis, cured 3 years ago, comes for his six-monthly liver cancer surveillance ultrasound. His platelets are 88,000/µL.',
      line: 'Cirrhosis with CSPH, portal pressure {pv}. Slow flow in the portal vein is the strongest local risk factor for a clot. A high INR does not protect, because the liver also makes less protein C and antithrombin.',
      causesHead: 'Risk of a clot', causes: ['Slow portal flow', 'More advanced liver disease', 'Abdominal surgery, splenectomy above all'],
      notes: 'Portal vein thrombosis becomes more common as cirrhosis advances, and slow portal flow is the strongest local factor. The INR measures only the fall in clotting factors; the liver also makes less protein C and antithrombin, so hemostasis is rebalanced and a high INR does not protect. Abdominal surgery, splenectomy above all, adds to the risk. Many clots are partial and found on a routine scan.',
      ask: ['Does a high INR protect a patient with cirrhosis from portal vein thrombosis?', 'No: the anticoagulant proteins fall too, so clotting is rebalanced.'],
    },
    {
      id: 'clot', lens: 'velocity', tick: 'Partial clot', params: { thrombus: { PV_TRUNK: 0.6 } }, whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, step: 0.05, ends: ['None', 'Occlusive'] }, cam: 'portal', terms: ['pv'], mark: { edges: ['PV_TRUNK'], clot: true },
      tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      kicker: 'The clot', site: 'pre', title: 'A partial clot in the portal vein',
      line: 'The clot fills more than half of the portal vein. Colored by velocity, blood speeds through the channel that is left, and the pressure behind it rises to {pv}.',
      notes: 'On ultrasound the clot is echogenic material in the vein, with color flow around it and a faster jet through the narrowing; an occlusive clot shows no flow at all. Contrast CT or MR comes next: first to rule out tumor thrombus from a liver cancer, which enhances in the arterial phase and expands the vein, then to show how far it extends into the splenic and superior mesenteric veins, which guides treatment. The varices enlarge as the pressure behind the clot rises.',
      ask: ['What does a contrast CT add to the Doppler?', 'First, whether the clot is tumor: an HCC thrombus enhances in the arterial phase and expands the vein. Then how far it extends into the splenic and mesenteric veins, and how much of the lumen it fills.'],
    },
    {
      id: 'gradients', lens: 'drop', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], tool: { kind: 'profile' }, key: ['hvpg', 'ppg'], delta: 'base',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
      kicker: 'The clot', site: 'pre', title: 'HVPG stays flat while PPG rises',
      line: 'The wedge reads the sinusoids, beyond the clot, so the HVPG barely moves at {hvpg}. The PPG rises to {ppg}. Colored by pressure drop, a second large drop appears at the clot, before the sinusoids.',
      notes: 'In cirrhosis the HVPG measures the sinusoidal part of the resistance. A clot adds a second site of resistance before the liver, which only a direct portal pressure shows. So in a patient with portal vein thrombosis the HVPG underestimates the portal pressure, and a TIPS gradient is taken from the portal vein itself.',
      ask: ['A patient with cirrhosis develops a partial portal vein clot. Will the HVPG show it?', 'No: the clot is before the sinusoids. The PPG, from a direct portal reading, shows it.'],
    },
    {
      id: 'scope', cam: 'varices', terms: ['varix'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix'], key: ['varix'], delta: 'base',
      kicker: 'Before anticoagulation', site: 'sin', title: 'The clot enlarges the varices',
      line: 'Behind the clot the varices have grown to {varix}. They need bleeding prophylaxis, but it must not delay the anticoagulant.',
      notes: 'EASL 2025 asks for proper variceal prophylaxis before anticoagulation, but not at the cost of delay, because the vein reopens more often when anticoagulation starts early. In cirrhosis with clinically significant portal hypertension, Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, whatever the varices, and a patient who takes one needs no screening endoscopy. In this case the varices are large.',
      ask: ['Should anticoagulation wait for an endoscopy?', 'No: variceal prophylaxis is needed, but it must not delay anticoagulation.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', params: { drugs: { carvedilol: true } }, ripple: true, cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'hr'], key: ['pv'], delta: true,
      kicker: 'Before anticoagulation', site: 'sin', title: 'Carvedilol, then anticoagulation without delay',
      line: 'Carvedilol lowers the portal pressure to {pv} and protects against a first bleed, so anticoagulation starts without waiting for a course of banding.',
      notes: 'Carvedilol treats the portal hypertension and needs no endoscopy to start. Banding, for a patient who cannot take a beta-blocker, takes several sessions and leaves ulcers that can bleed on an anticoagulant. For the anticoagulant, low molecular weight heparin or a vitamin K antagonist can be used, and a direct oral anticoagulant in Child–Pugh A, with caution in B, and not in C.',
      ask: ['Which variceal prophylaxis suits a patient about to start anticoagulation?', 'Carvedilol, if tolerated: it treats the portal hypertension, and banding ulcers could bleed on the anticoagulant.'],
    },
    {
      id: 'anticoag', tick: 'Anticoagulation', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', terms: ['pv'],
      tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'], delta: 'clot',
      kicker: 'Anticoagulation', site: 'sin', title: 'Months of anticoagulation reopen the vein',
      cite: 'EASL 2025, PVT in cirrhosis',
      line: 'In cirrhosis, about 7 in 10 recanalize on anticoagulation. Here the clot clears over six months, the portal vein flows again and its pressure falls back to {pv}.',
      notes: 'Baveno VIII advises anticoagulation for transplant candidates with any portal vein clot, and considers it for a recent partial or complete clot of the main portal vein and for any clot that causes symptoms. The vein reopens in many patients, more often when treatment starts early. It continues for at least six months, and until transplant in candidates; the clot can recur after it stops. Without treatment many partial clots clear too, and whether a partial clot worsens the outlook is uncertain.',
      ask: ['What makes it more likely that anticoagulation reopens the portal vein?', 'Starting it early, soon after the clot forms.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'The course on one chart', bands: ['carvedilol', 'anticoag'] },
      kicker: 'Anticoagulation', site: 'sin', title: 'Portal pressure followed the clot while HVPG stayed flat',
      line: 'The gap between the portal and wedged pressure lines is the clot. Recanalization is checked by imaging about every three months, not by the HVPG.',
      notes: 'The chart plots the portal, wedged and free pressures and the HVPG at each step. The gap that opens between the portal and the wedged lines is the clot. Recanalization is followed by imaging, Doppler or CT about every three months, not by the HVPG.',
      ask: ['How is recanalization checked during anticoagulation?', 'By repeat imaging, Doppler or CT, about every three months.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'varix'], asc: false, rowHead: 'Step', vs: 'first', calm: ['hvpg'],
      of: [{ id: 'base', kicker: 'Cirrhosis', title: 'Before the clot' }, { id: 'clot', kicker: 'Cirrhosis', title: 'Partial clot' }, { id: 'carv', kicker: 'Cirrhosis', title: 'On carvedilol' }, { id: 'anticoag', kicker: 'Cirrhosis', title: 'Six months on' }],
      kicker: 'Summary', title: 'Portal vein clot, from onset to recanalization',
      line: 'The clot raised the portal pressure and the PPG but not the HVPG; anticoagulation brought both back down.',
      notes: 'A clot before the liver adds to the sinusoidal resistance of cirrhosis without changing what the wedge reads. Look for it on every surveillance scan, protect the varices, and when anticoagulation is indicated, start it early.',
      ask: ['Which gradient rises when a patient with cirrhosis develops a portal vein clot?', 'The PPG; the HVPG stays where it was.'],
    },
  ],
};
