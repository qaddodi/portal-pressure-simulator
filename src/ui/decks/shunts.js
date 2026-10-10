// Presenter talk: shunts, made and spontaneous. Slide fields as documented at the top of decks.js.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

export const SHUNTS = {
  id: 'shunts', level: 'advanced', title: 'Shunts: made and spontaneous', minutes: 10,
  objectives: [
    'Explain why a shunt lowers the portal pressure and what it costs the liver',
    'Recognise gastrorenal and splenorenal shunts and their links to fundal varices and encephalopathy',
    'Describe TIPS, why it is kept narrow, and how a blocked stent shows',
    'Predict what closing a shunt (BRTO) does to the portal pressure',
  ],
  summary: 'Spontaneous portosystemic shunts, TIPS, and what closing a shunt does. Ends with a comparison of gradient, liver flow and encephalopathy risk.',
  slides: [
    {
      id: 'own', preset: 'cirr-decomp', cam: 'fit', sites: ['split'], data: 'tiles', tiles: ['ppg', 'shunt', 'liver'],
      kicker: 'Shunts', site: 'sin', title: 'The body\'s own shunts',
      eq: [frac('<mn>1</mn>', sub(mi('R'), 'total')) + mo('=') + frac('<mn>1</mn>', sub(mi('R'), 'liver')) + mo('+') + frac('<mn>1</mn>', sub(mi('R'), 'shunt')), 'R resistance to portal flow · the liver and the shunt in parallel'],
      line: 'Collaterals already carry part of the portal blood around the liver. They lower the gradient a little, never enough.',
      notes: 'A shunt is a second path for portal blood, in parallel with the liver. Paths in parallel add their conductances, so any shunt lowers the total resistance, and with it the portal pressure, for the same inflow. In cirrhosis the collaterals open as the pressure rises, but the splanchnic inflow rises too, so the gradient stays high. The blood they carry skips the liver: less portal blood for the liver cells, and gut-derived ammonia and toxins reach the brain.',
      ask: ['Why do collaterals fail to bring the portal pressure down?', 'Portal inflow rises as they open, and they are not wide enough to carry it all at a low gradient.'],
    },
    {
      id: 'grs', preset: 'gastric-varix', cam: 'fundus', mark: { edges: ['C5'], label: 'Gastrorenal shunt' }, data: 'tiles', tiles: ['gv', 'ppg'],
      kicker: 'Spontaneous', site: 'sin', title: 'Gastrorenal shunt',
      line: 'Fundal varices drain through the gastrorenal shunt to the left renal vein.',
      notes: 'Isolated fundal varices (IGV1) and those continuous with the esophageal varices along the lesser curve (GOV2) are fed by the short and posterior gastric veins, and most drain through a gastrorenal shunt, often via the left inferior phrenic vein, into the left renal vein. Because the shunt decompresses them, fundal varices bleed at a lower HVPG than esophageal varices, and bleed more heavily. The shunt is the route used to close them from below (BRTO), later in this talk. Endoscopy in this app stays in the esophagus; fundal varices are read from the tile.',
      ask: ['Where does a gastrorenal shunt drain?', 'Into the left renal vein.'],
    },
    {
      id: 'srs', preset: 'cirr-decomp', params: { spontaneous: { C6: true } }, days: 30, cam: 'splenic', mark: { edges: ['C6'], label: 'Splenorenal shunt' },
      data: 'tiles', tiles: ['ppg', 'shunt', 'liver'], delta: 'own',
      kicker: 'Spontaneous', site: 'sin', title: 'Splenorenal shunt',
      line: 'A large spontaneous shunt lowers the gradient, and starves the liver. Portal flow may reverse.',
      notes: 'A splenorenal shunt joins the splenic vein to the left renal vein; with the retroperitoneal and paraumbilical shunts it is one of the large spontaneous portosystemic shunts seen on CT in up to half of patients with cirrhosis. A large one lowers the gradient and can reduce variceal bleeding, but it diverts portal blood from the liver: liver function worsens, portal flow may turn away from the liver, and ammonia reaches the brain. Large shunts go with recurrent or persistent encephalopathy, and closing one by embolization can control it in selected patients. The tiles compare with the same patient without the shunt.',
      ask: ['A patient with cirrhosis has recurrent encephalopathy despite lactulose and rifaximin. What should you look for?', 'A large spontaneous portosystemic shunt, such as a splenorenal shunt, on CT.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'Covered stent' },
      tool: { kind: 'doppler', vessel: 'TIPS' }, data: 'tiles', tiles: ['ppg', 'shunt', 'liver'], delta: 'own',
      kicker: 'Made', site: 'sin', title: 'TIPS',
      line: 'A covered stent, 8 to 10 mm, from a hepatic vein to the portal vein. The gradient falls below 12 mmHg.',
      notes: 'The stent runs through the liver from the right hepatic vein to the right portal vein, so portal blood has a low-resistance path back to the heart. The PPG is measured before and after; for bleeding the aim is below 12 mmHg, or a fall of half. On Doppler the stent carries steady flow toward the heart along its whole length; a clear fall or rise in velocity from the last scan suggests narrowing. The tiles compare with the same patient before the stent.',
      ask: ['What does Doppler show in a working TIPS?', 'Steady flow toward the heart along the whole stent, at a velocity close to the last scan.'],
    },
    {
      id: 'wide', params: { tips: { d: 12 } }, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'Stent at 12 mm' }, data: 'tiles', tiles: ['ppg', 'liver'],
      kicker: 'Made', site: 'sin', title: 'A 12 mm stent takes too much',
      line: 'A wider stent lowers the gradient further and takes more blood from the liver: more encephalopathy, and a risk of liver failure.',
      notes: 'The same patient with the stent opened to 12 mm. The gradient falls further, but the liver loses more of its portal blood. Encephalopathy after TIPS is commoner with wider stents, older age and earlier encephalopathy; liver failure is the feared complication when reserve is poor. Many centers place an 8 mm stent, or a stent that is under-dilated and can be widened later if the gradient stays high. Persistent encephalopathy can be treated by narrowing the stent.',
      ask: ['Why are TIPS stents often left under-dilated?', 'To lower the gradient enough while keeping portal flow to the liver and the risk of encephalopathy down.'],
    },
    {
      id: 'occl', params: { tips: { d: 8 }, thrombus: { TIPS: 1 } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Occluded stent' },
      tool: { kind: 'doppler', vessel: 'TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], delta: 'tips',
      kicker: 'Made', site: 'sin', title: 'An occluded stent',
      line: 'No flow in the stent: the gradient is back where it started.',
      notes: 'Covered stents stay open far longer than the old bare ones, but dysfunction still happens, from thrombosis early or narrowing at the hepatic vein end later. It shows as a return of the problem the stent treated (rebleeding, ascites) and on Doppler as no flow, or as a clear change in velocity. It is confirmed and treated at venography, with angioplasty or a new stent, and the gradient is measured again. The tiles compare with the working stent.',
      ask: ['How does a blocked TIPS usually present?', 'With the return of what it treated: rebleeding or ascites, and an absent or changed Doppler signal.'],
    },
    {
      id: 'brto', preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', mark: { edges: ['C5'], label: 'Shunt closed' },
      data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'], delta: 'grs',
      kicker: 'Closing a shunt', site: 'sin', title: 'BRTO closes the gastrorenal shunt',
      line: 'Occluding the gastrorenal shunt treats the fundal varix it drains, and raises the portal pressure: esophageal varices grow.',
      notes: 'In balloon-occluded retrograde transvenous obliteration (BRTO), a balloon is inflated in the gastrorenal shunt from the left renal vein, and a sclerosant fills the shunt and the fundal varices behind it, which thrombose. It controls fundal variceal bleeding with little rebleeding. The portal blood that left by the shunt now stays in the portal system, so the portal pressure rises and esophageal varices and ascites can worsen; surveillance endoscopy follows, and some centers combine BRTO with TIPS. In the model the fundal varix keeps its size because the sclerosant is not modelled; only the pressure effect is shown. The tiles compare with the patient before the shunt was closed.',
      ask: ['What must you watch for after BRTO?', 'Worsening esophageal varices and ascites, from the rise in portal pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'shunt', 'liver'], asc: false, vs: 'first', note: 'Encephalopathy risk', rowHead: 'Shunt',
      of: [{ id: 'own', kicker: 'Baseline', title: 'Decompensated cirrhosis', note: 'Baseline' }, { id: 'srs', title: 'Splenorenal shunt', note: 'Higher' },
        { id: 'tips', title: 'TIPS, 8 mm', note: 'Higher' }, { id: 'wide', title: 'TIPS, 12 mm', note: 'Highest' }, { id: 'occl', title: 'TIPS, occluded', note: 'Back to baseline' }],
      kicker: 'Summary', title: 'Shunts compared',
      line: 'Every shunt lowers the gradient by taking blood from the liver; the wider the shunt, the less the liver gets.',
      notes: 'Every shunt trades the same two things: the more portal blood it carries, the lower the gradient and the less blood reaches the liver. Encephalopathy follows the shunted blood. A spontaneous shunt is uncontrolled; a TIPS is chosen, measured and can be narrowed or widened. A blocked stent gives back the gradient and the liver flow together.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal gradient against less portal blood for the liver and more encephalopathy.'],
    },
  ],
};
