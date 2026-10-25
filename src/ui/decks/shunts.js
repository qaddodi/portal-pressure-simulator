// Presenter talk: TIPS and shunts, spontaneous and made. Slide fields as documented at the top of decks.js. It follows the order a team
// does: the spontaneous shunts, who gets a TIPS and what is checked first (one woman with recurrent ascites), the stent and the flow it
// moves (the catheter route, the stent on Doppler, what it does to the heart, how wide, a blocked stent), and the one surgical shunt that
// keeps portal flow. The old A TIPS from start to finish talk is folded in (decks.js DECK_ALIAS). The rescue TIPS is in the bleed talk,
// the stent's follow-up Doppler in TIPS Doppler, and the fundal-varix shunt and BRTO in Gastric varices.
// Sources, checked 25 Oct 2026 against the Baveno VIII text in /mnt/project-files/guidelines/: 4.13 (bleeding despite secondary
// prophylaxis), 5.31 (pre-emptive TIPS, and the box that names age under 75, creatinine under 3 mg/dL and no heart failure), 5.33,
// 5.34, 6.3 and 6.4 (recurrent or refractory ascites; discuss TIPS and transplant together), 6.5 and 6.6 (smallest adequate stent,
// stepwise dilation; overshunting means encephalopathy and cardiac failure), 6.8 (age 70 or over), 6.9 (renal function), 6.14 and
// 6.16 (encephalopathy history, rifaximin), 4.15 (liver cancer) and 4.19 (frailty). The heart numbers are the model's own
// (decompensated cirrhosis: right atrial pressure and cardiac output both rise with the stent).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

const WIDTH = { label: 'Stent width', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' };

export const SHUNTS = {
  id: 'shunts', level: 'advanced', title: 'TIPS and shunts', minutes: 12,
  objectives: [
    'Recognize a large spontaneous shunt by the encephalopathy it causes',
    'Name who is considered for a TIPS and what to check before the stent',
    'Explain what a TIPS does to the portal pressure, the liver and the heart, why it is kept narrow, and how a blocked stent shows',
    'Explain how the selective Warren shunt decompresses the varices while keeping portal flow to the liver',
  ],
  checks: [
    ['An 8 mm TIPS is dilated to 10 mm. The PPG falls a little further and the liver loses more of its portal flow. What did the extra 2 mm buy, and at what price?', 'A small further fall in the gradient, paid for with less portal blood to the liver, so encephalopathy and liver failure become more likely. That is why stents are usually 8 to 10 mm and not wider.'],
    ['A 72-year-old woman has refractory ascites and her bilirubin is 4 mg/dL. Is a TIPS ruled out?', 'No. Age 70 or over is judged case by case, and no bilirubin value alone rules a TIPS out. The heart, the kidneys and her encephalopathy history decide.'],
    ['What does a TIPS do to the right atrial pressure and the cardiac output?', 'Both rise, because part of the portal blood now goes straight to the heart. That is why heart failure comes before the stent.'],
    ['Why does ascites not improve after a Warren shunt?', 'The portal pressure stays high: only the varices drain through the spleen to the renal vein.'],
  ],
  sections: [['Spontaneous shunts', ['Spontaneous']], ['Who gets a TIPS', ['Who gets a TIPS']], ['The stent and the flow', ['The stent']], ['A surgical shunt', ['A surgical shunt']]],
  summary: 'Spontaneous portosystemic shunts, who is considered for a TIPS and what is checked first, what the stent does to the portal pressure, the liver and the heart, how wide to make it, and the Warren shunt. Ends with a comparison of gradient, liver flow and encephalopathy risk.',
  slides: [
    {
      id: 'own', lens: 'flow', preset: 'cirr-decomp', cam: 'fit', sites: ['split'], glow: ['C1a', 'C1b', 'C3'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'],
      kicker: 'Spontaneous', site: 'sin', title: 'Spontaneous collaterals',
      vignette: 'A 56-year-old man with alcohol-associated cirrhosis has ascites despite spironolactone and furosemide, and large esophageal varices. His platelets are 57,000/µL.',
      eq: [frac('<mn>1</mn>', sub(mi('R'), 'total')) + mo('=') + frac('<mn>1</mn>', sub(mi('R'), 'liver')) + mo('+') + frac('<mn>1</mn>', sub(mi('R'), 'shunt')), 'R resistance to portal flow · the liver and the shunt in parallel'],
      line: 'Colored by flow, collaterals carry part of the portal blood around the liver, yet the gradient falls only slightly.',
      notes: 'A shunt is a second path for portal blood, in parallel with the liver. Paths in parallel add their conductances, so any shunt lowers the total resistance, and with it the portal pressure, for the same inflow. In cirrhosis the collaterals open as the pressure rises, but the splanchnic inflow rises too, so the gradient stays high. The blood they carry skips the liver: less portal blood for the liver cells, and gut-derived ammonia and toxins reach the brain.',
      ask: ['Why do collaterals fail to bring the portal pressure down?', 'Portal inflow rises as they open, and they are not wide enough to carry it all at a low gradient.'],
    },
    {
      id: 'srs', lens: 'flow', preset: 'cirr-decomp', params: { spontaneous: { C6: true } }, days: 30, cam: 'splenic', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' },
      tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], delta: 'own',
      kicker: 'Spontaneous', site: 'sin', title: 'A large splenorenal shunt takes portal blood from the liver',
      vignette: 'A 64-year-old woman with MASH cirrhosis has had repeated bouts of confusion despite lactulose and rifaximin. Her ascites has gone, and EGD shows no varices.',
      line: 'A large spontaneous shunt lowers the gradient but diverts portal blood from the liver, and portal flow may reverse toward the shunt.',
      notes: 'A splenorenal shunt joins the splenic vein to the left renal vein; with the retroperitoneal and paraumbilical shunts it is one of the large spontaneous portosystemic shunts seen on CT in up to half of patients with cirrhosis. A large one lowers the gradient and can reduce variceal bleeding, but it diverts portal blood from the liver: liver function worsens, portal flow may turn away from the liver, and ammonia reaches the brain. Large shunts go with recurrent or persistent encephalopathy, and closing one by embolization can control it in selected patients. The tiles compare with the same patient without the shunt. Colored by flow, the portal and splenic veins carry blood toward the shunt. The fundal varices that drain through the gastrorenal shunt, and BRTO, are in the Gastric varices talk.',
      ask: ['A patient with cirrhosis has recurrent encephalopathy despite lactulose and rifaximin. What should you look for?', 'A large spontaneous portosystemic shunt, such as a splenorenal shunt, on CT.'],
    },
    {
      id: 'reasons', lens: 'flow', preset: 'cirr-decomp', params: { diuretics: true }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', tool: { kind: 'criteria', title: 'When a TIPS is considered', short: 'When', ticks: false, rows: ['Bleeding despite carvedilol and banding',
        { text: 'Recurrent or refractory ascites', note: 'this case', lit: true }, 'Pre-emptive, within 72 hours of a high-risk bleed'] }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 66-year-old woman with alcohol-associated cirrhosis, sober for 3 years, has needed a paracentesis every 10 days for three months despite full diuretics. Her bilirubin is 1.6 mg/dL and she has never been confused.',
      kicker: 'Who gets a TIPS', site: 'sin', title: 'Three reasons to consider a stent',
      line: 'A TIPS is considered for bleeding that carvedilol and banding do not stop, for recurrent or refractory ascites, and early after a high-risk bleed. Her ascites is back: {asc}.',
      notes: 'Each reason has its own criteria, taught in the Choose the treatment and Preventing the next bleed talks. Here the reason is recurrent ascites. A TIPS and a transplant should be discussed together from the start, because a TIPS for ascites is a bridge or an alternative, not a cure of the liver; encephalopathy that resists treatment after a TIPS may move a patient up the list. For a patient who cannot have a TIPS, long-term albumin or a tunneled drain or ascites pump may be considered. (Baveno VIII 4.13, 5.31, 5.34, 6.3, 6.4, 6.10, 6.11.)',
      ask: ['Name the three reasons Baveno VIII gives to consider a TIPS.', 'Bleeding despite carvedilol and banding, recurrent or refractory ascites, and a pre-emptive TIPS after a high-risk bleed.'],
    },
    {
      id: 'check', lens: 'flow', cam: 'liver', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Before the stent', short: 'Before', ticks: false, rows: ['No heart failure', 'Kidney function staged (eGFR)', 'Encephalopathy history and medicines reviewed, rifaximin considered', 'No single number rules a TIPS out'] },
      kicker: 'Who gets a TIPS', site: 'sin', title: 'Check the heart, the kidneys and the brain first',
      line: 'A stent sends portal blood straight to the heart and past the liver to the brain, so check those first. No single number rules a TIPS out.',
      notes: 'Baveno VIII lists no heart failure, age under 75 and a creatinine under 3 mg/dL as the box for a pre-emptive TIPS, asks for kidney function to be staged before a TIPS for ascites (6.9), and asks for the encephalopathy history and medicines to be reviewed (6.14). A history of overt encephalopathy is not an absolute contraindication (6.15); rifaximin should be considered before an elective TIPS (6.16). What is not an absolute contraindication: for a pre-emptive TIPS, acute-on-chronic liver failure, overt encephalopathy, a raised bilirubin, the MELD score and severe alcohol-related hepatitis (5.33); liver cancer unless the tumor lies along the stent path (4.15); frailty or sarcopenia alone (4.19); and age 70 or over with refractory ascites, which is judged case by case (6.8). Each item is weighed with the rest, and the heart and the kidneys count for more than any of them.',
      ask: ['A woman with refractory ascites is sent for a TIPS. Which three systems do you check first?', 'The heart, the kidneys and the brain: heart failure, kidney function, and the encephalopathy history, with rifaximin considered.'],
    },
    {
      id: 'play', lens: 'flow', cam: 'liver', labels: ['CONF'], procedure: 'tips', data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      kicker: 'The stent', site: 'sin', title: 'The catheter goes from the neck vein to the portal vein',
      line: 'The catheter enters the right jugular vein and passes the right hepatic vein. A needle crosses the liver into the right portal vein, and a covered stent holds the tract open. Press Play to follow it.',
      notes: 'A TIPS is a tunnel inside the liver between a hepatic vein and a branch of the portal vein. The catheter reaches it from the jugular vein, so there is no incision in the belly. A covered stent keeps the tunnel open: Baveno VIII names polytetrafluoroethylene-covered stents. When the stent opens, the portal pressure falls at once. (Baveno VIII 5.31.)',
      ask: ['Which kind of stent does Baveno VIII name for a pre-emptive TIPS?', 'A polytetrafluoroethylene (PTFE) covered stent.'],
    },
    {
      id: 'tips', lens: 'flow', terms: ['pv', 'hv'], params: { tips: { on: true, d: 8 } }, whatIf: WIDTH, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, calipers: ['TIPS'], spot: ['TIPS', 'PV_TRUNK', 'PVH_R', 'RHV_IVC'],
      tool: { kind: 'doppler', vessel: 'TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], delta: 'reasons',
      kicker: 'The stent', site: 'sin', title: 'A TIPS brings the PPG under 12 mmHg',
      line: 'A covered stent, 8 to 10 mm, from a hepatic vein to the portal vein. The PPG falls to {ppg}, below 12 mmHg.',
      notes: 'The stent runs through the liver from the right hepatic vein to the right portal vein, so portal blood has a low-resistance path back to the heart. The PPG is measured before and after; for bleeding the aim is below 12 mmHg. On Doppler the stent carries steady flow toward the heart along its whole length; a clear fall or rise in velocity from the last scan suggests narrowing. The tiles compare with the same patient before the stent.',
      ask: ['What does Doppler show in a working TIPS?', 'Steady flow toward the heart along the whole stent, at a velocity close to the last scan.'],
    },
    {
      id: 'heart', lens: 'flow', cam: 'liver', tool: { kind: 'profile', from: 'reasons', fromLabel: 'Before' }, data: 'tiles', tiles: ['co', 'ra'], key: ['co'], delta: 'reasons',
      compare: [{ label: 'Before the stent', short: 'Before', slide: 'reasons' }, { label: 'With the stent', short: 'With', own: true }],
      kicker: 'The stent', site: 'sin', title: 'The stent gives the heart more to do',
      line: 'The cardiac output rises from {co@reasons} to {co} and the right atrial pressure to {ra}. A healthy heart copes; a failing one may not, so heart failure comes first.',
      notes: 'Blood that used to pass through the liver now reaches the right atrium at once, so the venous return, the right atrial pressure and the cardiac output all rise. Baveno VIII names cardiac failure, with encephalopathy, as a risk of overshunting (6.5). The model shows the rise in a heart that is normal; it does not draw a failing one.',
      ask: ['Why does a TIPS raise the cardiac output?', 'Part of the portal blood now goes straight to the right atrium, so more blood returns to the heart.'],
    },
    {
      id: 'wide', lens: 'flow', params: { tips: { d: 12 } }, whatIf: WIDTH, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'Stent at 12 mm', kind: 'treat' },
      tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }, data: 'tiles', tiles: ['ppg', 'liver'], delta: 'reasons',
      kicker: 'The stent', site: 'sin', title: 'Dilate only as far as the ascites needs',
      line: 'At 12 mm the PPG is {ppg} and the liver keeps {liver} of its flow; each extra millimeter buys less. Baveno VIII dilates stepwise, and only if the ascites does not clear.',
      notes: 'The same patient with the stent opened to 12 mm. The gradient falls further, but the liver loses more of its portal blood. Encephalopathy after TIPS is commoner with wider stents, older age and earlier encephalopathy; liver failure is the feared complication when reserve is poor, and so is heart failure. Baveno VIII says the stent may be dilated to the smallest diameter that gives an adequate response (6.5), and dilated stepwise when the ascites does not improve (6.6). Many centers place an 8 mm stent, or a stent that is under-dilated and can be widened later if the gradient stays high. Persistent encephalopathy can be treated by narrowing the stent. Under-dilated standard stent grafts tend to widen partly toward their full size over about six months; controlled-expansion grafts are designed to hold the set width. On the figure, colored by flow, the stent carries far more blood than the sinusoids. (Baveno VIII 6.5, 6.6.)',
      ask: ['Why are TIPS stents often left under-dilated?', 'To lower the gradient enough while keeping portal flow to the liver and the risk of encephalopathy and heart failure down.'],
    },
    {
      id: 'occl', lens: 'flow', params: { tips: { d: 8 }, thrombus: { TIPS: 1 } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Occluded stent' },
      tool: { kind: 'doppler', vessel: 'TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], delta: 'tips',
      kicker: 'The stent', site: 'sin', title: 'An occluded stent',
      line: 'The gradient is back to its pre-TIPS level, and bleeding or ascites can return.',
      notes: 'Covered stents stay open far longer than the old bare ones, but dysfunction still happens, from thrombosis early or narrowing at the hepatic vein end later. It shows as a return of the problem the stent treated (rebleeding, ascites) and on Doppler as no flow, or as a clear change in velocity. It is confirmed and treated at venography, with angioplasty or a new stent, and the gradient is measured again. The tiles compare with the working stent.',
      ask: ['How does a blocked TIPS usually present?', 'With the return of what it treated: rebleeding or ascites, and an absent or changed Doppler signal.'],
    },
    {
      id: 'dsrs', lens: 'origin', preset: 'cirr-decomp', params: { dsrs: true }, cam: 'splenic', mark: { edges: ['S_DSR'], label: 'Warren shunt', kind: 'treat' },
      // (Three tiles: the varices drain, the liver keeps its flow and the PPG stays high are the three halves of the point.)
      data: 'tiles', tiles: ['ppg', 'varix', 'liver'], delta: 'own',
      kicker: 'A surgical shunt', site: 'sin', title: 'Distal splenorenal (Warren) shunt',
      line: 'The splenic vein is divided near the portal vein and joined to the left renal vein, so the varices drain through the spleen. Colored by origin, gut blood still reaches the liver, and the PPG stays high at {ppg}.',
      notes: 'The Warren shunt is a selective shunt. The splenic vein is divided close to its junction with the portal vein; the spleen end is sewn to the left renal vein, and the portal end is tied off. Blood from the gastroesophageal varices drains through the short gastric veins and the spleen to the renal vein, so the varices decompress, while SMV blood keeps perfusing the liver at portal pressure. The PPG stays high, so ascites is not relieved and can worsen; refractory ascites is a contraindication. Encephalopathy is less common than after a total shunt or TIPS. Today it is rare: it suits patients with preserved liver function and recurrent variceal bleeding, usually where TIPS is not suitable. The tiles compare with the same patient without the shunt. On the figure, colored by origin, splenic blood leaves through the shunt, while the portal vein carries only gut blood.',
      ask: ['Why is the Warren shunt called selective?', 'It drains the varices through the spleen to the left renal vein, while SMV blood keeps perfusing the liver at portal pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'shunt', 'liver'], asc: false, vs: 'first', note: 'Encephalopathy risk', rowHead: 'Shunt',
      of: [{ id: 'own', kicker: 'Baseline', title: 'Decompensated cirrhosis', note: 'Baseline' }, { id: 'srs', title: 'Splenorenal shunt', note: 'Higher' },
        { id: 'tips', title: 'TIPS, 8 mm', note: 'Higher' }, { id: 'wide', title: 'TIPS, 12 mm', note: 'Highest' }, { id: 'occl', title: 'TIPS, occluded', note: 'Back to baseline' },
        { id: 'dsrs', title: 'Warren shunt', note: 'Lower than TIPS' }],
      kicker: 'Summary', title: 'Gradient and liver flow with each shunt',
      line: 'Every shunt lowers the gradient by diverting portal blood from the liver. The wider the shunt, the less portal blood reaches the liver.',
      notes: 'Every shunt trades the same two things: the more portal blood it carries, the lower the gradient and the less blood reaches the liver. Encephalopathy follows the shunted blood. A spontaneous shunt is uncontrolled; a TIPS is chosen, measured and can be narrowed or widened. A blocked stent gives back the gradient and the liver flow together. The stent rows are the woman with recurrent ascites; the baseline and the Warren shunt are a decompensated patient with varices.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal gradient against less portal blood for the liver and more encephalopathy.'],
    },
  ],
};
