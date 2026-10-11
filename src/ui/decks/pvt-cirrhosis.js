// Presenter talk: a partial portal vein clot in a patient with cirrhosis, from the scan that finds it to six months
// of anticoagulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const BAND = { kind: 'band' };

export const PVT_CIRRHOSIS = {
  id: 'pvt-cirrhosis', level: 'core', title: 'Portal vein thrombosis in cirrhosis', minutes: 9,
  objectives: [
    'Name the risk factors for portal vein thrombosis in cirrhosis',
    'Explain why the HVPG misses a clot that the PPG finds',
    'Prepare for anticoagulation: variceal prophylaxis first, without delay',
    'Describe what months of anticoagulation do to the clot and the pressures',
  ],
  summary: 'A partial clot in a cirrhotic portal vein: what it does to the portal pressure and the varices, why the HVPG misses it, and how months of anticoagulation reopen the vein.',
  slides: [
    {
      id: 'base', preset: 'csph', cam: 'portal', terms: ['pv'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'The clot', site: 'sin', title: 'Slow flow toward a stiff liver',
      line: 'Cirrhosis with CSPH: blood moves slowly up the portal vein toward a stiff liver, at a pressure of {pv}.',
      causesHead: 'Risk of a clot', causes: ['Slow portal flow', 'More advanced liver disease', 'A high INR does not protect', 'Recent abdominal surgery'],
      notes: 'Portal vein thrombosis becomes more common as cirrhosis advances, and slow portal flow is the strongest local factor. The INR measures only the fall in clotting factors; the liver also makes less protein C and antithrombin, so hemostasis is rebalanced and a high INR does not protect. Abdominal surgery, splenectomy above all, adds to the risk. Many clots are partial and found on a routine scan.',
      ask: ['Does a high INR protect a patient with cirrhosis from portal vein thrombosis?', 'No: the anticoagulant proteins fall too, so clotting is rebalanced.'],
    },
    {
      id: 'clot', params: { thrombus: { PV_TRUNK: 0.6 } }, cam: 'portal', terms: ['pv'], mark: { edges: ['PV_TRUNK'], label: 'Partial clot' },
      tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'base' }, data: 'tiles', tiles: ['pv', 'varix'], key: ['pv'],
      kicker: 'The clot', site: 'pre', title: 'A partial clot in the portal vein',
      line: 'The clot fills more than half of the portal vein. Blood speeds through the channel that is left, and the pressure behind it rises to {pv}.',
      notes: 'On ultrasound the clot is echogenic material in the vein, with color flow around it and a faster jet through the narrowing; an occlusive clot shows no flow at all. Contrast CT or MR shows how far it extends into the splenic and superior mesenteric veins, which guides treatment. The varices enlarge as the pressure behind the clot rises.',
      ask: ['What does a contrast CT add to the Doppler?', 'The extent of the clot into the splenic and mesenteric veins, and how much of the lumen it fills.'],
    },
    {
      id: 'gradients', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], data: 'ladder', key: ['hvpg', 'ppg'], tiles: ['hvpg', 'ppg'], brackets: { hvpg: 'misleads', ppg: 'works' }, delta: 'base',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC'), 'Portal pressure gradient: the whole fall from the portal vein to the IVC'],
      kicker: 'The clot', site: 'pre', title: 'The HVPG misses the clot',
      line: 'The wedge reads the sinusoids, beyond the clot, so the HVPG barely moves at {hvpg}. The PPG rises to {ppg}.',
      notes: 'In cirrhosis the HVPG measures the sinusoidal part of the resistance. A clot adds a second block before the liver, which only a direct portal pressure shows. So in a patient with portal vein thrombosis the HVPG underestimates the portal pressure, and a TIPS gradient is taken from the portal vein itself.',
      ask: ['A patient with cirrhosis develops a partial portal vein clot. Will the HVPG show it?', 'No: the clot is before the sinusoids. The PPG, from a direct portal reading, shows it.'],
    },
    {
      id: 'scope', cam: 'varices', terms: ['varix'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix'], key: ['varix'], delta: 'base',
      kicker: 'Before anticoagulation', site: 'sin', title: 'Check the varices first',
      line: 'The varices have grown to {varix}. Give bleeding prophylaxis before the anticoagulant, but do not let the endoscopy delay it.',
      notes: 'Baveno VII advises screening for varices and prophylaxis as in any patient with cirrhosis before anticoagulation starts, but the endoscopy should not hold it up: the chance of reopening the vein falls the longer treatment waits. This patient has large varices.',
      ask: ['Should anticoagulation wait for the endoscopy?', 'No: give variceal prophylaxis, but do not let the endoscopy delay anticoagulation.'],
    },
    {
      id: 'band', action: [BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix'], key: ['varix'],
      kicker: 'Before anticoagulation', site: 'sin', title: 'Bands, then the anticoagulant',
      line: 'Banding shrinks the varices to {varix}. With prophylaxis in place, anticoagulation starts.',
      notes: 'A non-selective beta-blocker or band ligation are both acceptable prophylaxis for large varices; carvedilol also lowers the portal pressure. For the anticoagulant, low molecular weight heparin or a vitamin K antagonist can be used, and a direct oral anticoagulant in Child–Pugh A and with caution in B.',
      ask: ['Name two acceptable forms of variceal prophylaxis before anticoagulation.', 'A non-selective beta-blocker or band ligation.'],
    },
    {
      id: 'anticoag', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', terms: ['pv'],
      tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: 'clot' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'], delta: 'clot',
      kicker: 'Anticoagulation', site: 'sin', title: 'Months of anticoagulation reopen the vein',
      line: 'Over six months the clot shrinks and clears. The portal vein flows freely again, and its pressure falls back to {pv}.',
      notes: 'Baveno VII advises anticoagulation for a recent complete or near-complete clot of the main portal vein, with or without extension into the superior mesenteric vein, and for transplant candidates. The vein reopens in many patients, more often when treatment starts early. It continues for at least six months, and until transplant in candidates; the clot can recur after it stops.',
      ask: ['What makes it more likely that anticoagulation reopens the portal vein?', 'Starting it early, soon after the clot forms.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'The course on one chart' },
      kicker: 'Anticoagulation', site: 'sin', title: 'The portal pressure moved; the HVPG did not',
      line: 'Every step of the talk on one chart: the portal pressure rose with the clot and fell as it cleared, while the HVPG hardly moved.',
      notes: 'The chart plots the portal, wedged and free pressures and the HVPG at each step. The gap that opens between the portal and the wedged lines is the clot. Recanalization is followed by imaging, Doppler or CT about every three months, not by the HVPG.',
      ask: ['How is recanalization checked during anticoagulation?', 'By repeat imaging, Doppler or CT, about every three months.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'varix'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'base', kicker: 'Cirrhosis', title: 'Before the clot' }, { id: 'clot', kicker: 'Cirrhosis', title: 'Partial clot' }, { id: 'band', kicker: 'Cirrhosis', title: 'After banding' }, { id: 'anticoag', kicker: 'Cirrhosis', title: 'Six months on' }],
      kicker: 'Summary', title: 'One clot, start to finish',
      line: 'The clot raised the portal pressure and the PPG but not the HVPG; anticoagulation brought both back down.',
      notes: 'A clot before the liver adds to the sinusoidal block of cirrhosis without changing what the wedge reads. Look for it on every surveillance scan, protect the varices, and anticoagulate early.',
      ask: ['Which gradient rises when a patient with cirrhosis develops a portal vein clot?', 'The PPG; the HVPG stays where it was.'],
    },
  ],
};
