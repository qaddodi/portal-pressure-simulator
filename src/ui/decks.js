// The Presenter's built-in presentations: projector-first slide decks on the live model.
// A slide is one idea: a big headline, one line, at most four causes, and a figure that explains it.
// The model state of every slide is computed off screen before it is shown (presenter.js), each from
// the slide before, so forward, back and jump always show the same numbers.
//
// Slide fields:
//   id                       names the slide for a summary's rows
//   preset, presetDays, params, action, days
//                            the model state, applied to the slide before's (preset → params → action → days)
//   view                     'anatomic' (default) or 'circuit'
//   cam                      'fit', a region of REGIONS, [x0, y0, x1, y1] (anatomy world units),
//                            'lobule', 'lobule:triad' | 'lobule:sinusoid' | 'lobule:central' (zoom: × the lobule's
//                            framing), or 'sinusoid'
//   labels                   the stations named on the anatomy (none when absent)
//   mark                     { edges, label }: a ring and a callout on the figure (hidden until a quiz is answered)
//   kicker, site, title, line, causes
//                            the words (site: a level of ladder.js SITES; it colours the kicker)
//   rail                     true: the six levels with this slide's site marked; 'all': every level named
//   data                     'ladder': the pressure ladder and tiles (key: what to highlight; tiles: which)
//   visual                   'ladders' or 'table', over the dimmed figure (of: the slide ids it shows)
//   quiz                     quiz mode (Q) asks this before the answer shows (the camera waits at the whole figure)
//   notes, ask               speaker notes, and [question, expected answer] for the room

// Regions of the anatomy plate the camera frames (world units, x 300-1120, y 0-920).
export const REGIONS = {
  route: [380, 30, 900, 690],       // portal vein to heart
  liver: [360, 170, 830, 490],
  portal: [520, 360, 930, 710],     // confluence, trunk, splenic vein, SMV
  hepatic: [410, 40, 800, 340],     // hepatic veins, IVC, right atrium
  heart: [440, -20, 800, 300],
  varices: [540, -20, 980, 360],
  spleen: [840, 240, 1120, 580],
  rectum: [700, 640, 1010, 950],
  wall: [380, 330, 760, 880],       // paraumbilical vein and the abdominal wall
};

export const LEVELS = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' };

const SIX = ['pvt', 'presin', 'sin', 'postsin', 'post', 'cardiac'];

export const DECKS = [
  {
    id: 'sites', level: 'core', title: 'Sites and causes of portal hypertension', minutes: 15,
    summary: 'Six levels from the portal vein to the heart: the camera goes to each block, the pressure ladder shows what it does to HVPG, and a closing table compares them.',
    slides: [
      {
        id: 'overview', preset: 'healthy', cam: 'fit', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], rail: 'all',
        kicker: 'Portal hypertension', title: 'Where is the block?',
        line: 'Blood runs from the gut through the liver to the heart. A block anywhere on the way raises the pressure behind it.',
        notes: 'Portal hypertension is named for the level of the block. Two levels lie before the sinusoids (pre-hepatic and presinusoidal), one is the sinusoids themselves, and three come after them (postsinusoidal, post-hepatic and cardiac). The level decides which pressures rise, what HVPG shows, whether varices form and whether ascites follows. Portal hypertension is a portal pressure gradient above 5 mmHg; 10 mmHg or more is clinically significant.',
        ask: ['Name one cause of portal hypertension at each level.', 'Portal vein thrombosis; schistosomiasis; cirrhosis; sinusoidal obstruction syndrome; Budd–Chiari syndrome; right heart failure.'],
      },
      {
        id: 'healthy', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg'],
        kicker: 'Reference', title: 'A healthy liver',
        line: 'Pressure falls a little at each station, from about 8 mmHg in the portal vein to 3 in the right atrium. HVPG is under 5.',
        notes: 'The wedged hepatic venous pressure (WHVP) is taken with a balloon catheter wedged in a hepatic vein: with the flow stopped, the still column of blood reads the sinusoidal pressure. The free hepatic venous pressure (FHVP) is taken with the balloon down. HVPG = WHVP − FHVP. Normal is 1 to 5 mmHg; above 5 is portal hypertension; 10 or more is clinically significant (varices, decompensation); at 12 or more varices can bleed. The portal pressure gradient (PPG) is the portal vein minus the IVC, measured directly.',
        ask: ['What does the wedged pressure measure?', 'The sinusoidal pressure: with the vein occluded, the still column of blood reads the pressure upstream.'],
      },
      {
        id: 'pvt', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF', 'SV'], mark: { edges: ['PV_TRUNK'], label: 'Clot' },
        data: 'ladder', key: ['pv', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Pre-hepatic', site: 'pre', title: 'Portal vein thrombosis',
        line: 'The clot sits before the liver. Portal pressure is high, but the wedged pressure and HVPG are normal: the catheter lies downstream of the block.',
        causes: ['Cirrhosis', 'Myeloproliferative neoplasm, thrombophilia', 'Pancreatitis, abdominal sepsis', 'Liver or pancreatic cancer'],
        notes: 'Chronic thrombosis turns the portal vein into a cavernoma: a web of small collaterals around the occluded trunk that still carries portal blood to the liver. The liver itself is normal, so its function is preserved and ascites is uncommon, while varices and a large spleen are common. Doppler ultrasound or CT shows the clot or the cavernoma. HVPG is normal because the wedged catheter reads the sinusoids, downstream of the clot; the portal pressure gradient (PPG) is high.',
        ask: ['Why is HVPG normal when the portal pressure is about 20 mmHg?', 'The wedge reads the sinusoids, which lie downstream of the clot and are at normal pressure.'],
      },
      {
        id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'ladder', key: ['pv', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Intrahepatic · presinusoidal', site: 'presin', title: 'Schistosomiasis',
        line: 'Eggs lodge in the portal venules and scar the portal tracts. The block is still upstream of the sinusoids, so HVPG misses it again.',
        causes: ['Schistosomiasis', 'Porto-sinusoidal vascular disorder', 'Early primary biliary cholangitis', 'Sarcoidosis, congenital hepatic fibrosis'],
        notes: 'Schistosoma mansoni and japonicum eggs reach the presinusoidal portal venules, where granulomas form and periportal (Symmers) fibrosis follows. The sinusoids and liver cells are spared: liver function is preserved, ascites is rare and liver stiffness is near normal. The portal vein is open on imaging, which separates it from a portal vein clot. HVPG is normal or mildly raised and underestimates the portal pressure.',
        ask: ['A patient bleeds from varices. HVPG is normal and the portal vein is open. Where is the block?', 'Presinusoidal, in the portal tracts: schistosomiasis or porto-sinusoidal vascular disorder.'],
      },
      {
        id: 'sin', preset: 'cirr-decomp', cam: 'lobule:sinusoid', data: 'ladder', key: ['whvp', 'hvpg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Intrahepatic · sinusoidal', site: 'sin', title: 'Cirrhosis',
        line: 'Scar, nodules and contracted stellate cells narrow the sinusoids. The block is now where the wedge reads, so HVPG rises with the portal pressure.',
        causes: ['Alcohol', 'Fatty liver disease (MASLD)', 'Hepatitis B and C', 'Autoimmune, cholestatic, metabolic'],
        notes: 'In cirrhosis the resistance is in the sinusoids: fibrosis, regenerative nodules, a capillarized endothelium and contracted stellate cells, the dynamic part that drugs can relax. Splanchnic vasodilation then raises portal inflow and sustains the pressure. The wedged pressure closely tracks the portal pressure, so HVPG estimates the portal gradient: 10 mmHg or more is clinically significant portal hypertension, and at 12 or more varices can bleed.',
        ask: ['Why does the wedged pressure track the portal pressure in cirrhosis?', 'The resistance lies in the sinusoids the wedge reads, so the wedged pressure rises with the portal pressure.'],
      },
      {
        id: 'postsin', preset: 'sos', cam: 'lobule:central', data: 'ladder', key: ['whvp', 'hvpg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Intrahepatic · postsinusoidal', site: 'postsin', title: 'Sinusoidal obstruction syndrome',
        line: 'Injured endothelium plugs the sinusoids and the small central veins. The block lies behind the wedge, so the wedged pressure and HVPG rise.',
        causes: ['Conditioning for stem cell transplant', 'Oxaliplatin', 'Pyrrolizidine alkaloids (bush teas)'],
        notes: 'Formerly veno-occlusive disease. Toxic injury sheds sinusoidal endothelial cells, which obstruct the sinusoids and the terminal hepatic venules. It presents within weeks of myeloablative conditioning with tender hepatomegaly, weight gain, ascites and jaundice. An HVPG above 10 mmHg, measured with a transjugular biopsy, strongly supports the diagnosis. The model shows an earlier stage, with an HVPG of about 9 mmHg: raised, but under 10.',
        ask: ['Why does HVPG rise here but not in schistosomiasis?', 'Here the block lies behind the wedge; in schistosomiasis it lies upstream of the sinusoids.'],
      },
      {
        id: 'post', preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Blocked hepatic veins' },
        data: 'ladder', key: ['fhvp', 'ra', 'hvpg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Post-hepatic', site: 'post', title: 'Budd–Chiari syndrome',
        line: 'The hepatic veins are blocked as they leave the liver. Wedged and free pressures are both high, so HVPG is near zero, while the right atrium is normal.',
        causes: ['Myeloproliferative neoplasm (JAK2)', 'Thrombophilia, pregnancy, the pill', 'IVC web', 'Tumor invading the veins'],
        notes: 'Hepatic venous outflow obstruction, anywhere from the small hepatic veins to the IVC at the right atrium. The liver is congested and enlarged; the caudate lobe, which drains straight into the IVC, hypertrophies. Ascites is common, protein-rich (2.5 g/dL or more) and with a SAAG of 1.1 or more. In practice the blocked veins often cannot be catheterized: the model shows the pressures behind the block. Doppler ultrasound, CT or MR venography make the diagnosis.',
        ask: ['Why is HVPG near zero although the portal pressure is about 27 mmHg?', 'Both the wedged and the free pressures are measured behind the block, so both are high and their difference is small.'],
      },
      {
        id: 'cardiac', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], mark: { edges: ['IVCS_RA'], label: 'High right atrial pressure' },
        data: 'ladder', key: ['ra', 'fhvp', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the block?',
        kicker: 'Cardiac', site: 'cardiac', title: 'Right heart failure',
        line: 'Pressure backs up from the right atrium into every vein of the liver. Everything rises together, so HVPG stays normal.',
        causes: ['Tricuspid regurgitation', 'Pulmonary hypertension', 'Left heart failure', 'Constrictive pericarditis'],
        notes: 'Congestive hepatopathy. The jugular venous pressure is raised, the hepatojugular reflux is positive and Doppler shows a pulsatile portal vein. The ascites is protein-rich with a SAAG of 1.1 or more. Varices are rare: they need a gradient between the portal and the systemic veins, and here both are high, so the PPG is normal. Constrictive pericarditis gives the same pattern with a normal-sized heart.',
        ask: ['Why are varices rare in heart failure despite a portal pressure of about 20 mmHg?', 'Varices need a portal-to-systemic gradient; the systemic veins are high too, so the gradient (PPG) is normal.'],
      },
      {
        id: 'ladders', cam: 'fit', visual: 'ladders', of: SIX,
        kicker: 'How to tell them apart', title: 'The steepest fall marks the block',
        line: 'Portal pressure alone cannot place it. HVPG sees only the fall from the wedged to the free hepatic vein pressure.',
        notes: 'Read each ladder from left to right. Pre-hepatic and presinusoidal: the fall is between the portal vein and the wedge, so HVPG is normal and only a direct portal pressure (or the PPG) shows it. Sinusoidal and postsinusoidal: the fall is between the wedged and the free pressures, exactly what HVPG measures. Post-hepatic: the fall is between the free hepatic vein and the right atrium. Cardiac: there is no fall at all; every station is high.',
        ask: ['Which two levels raise the HVPG?', 'Sinusoidal and postsinusoidal.'],
      },
      {
        id: 'summary', visual: 'table', of: SIX,
        kicker: 'Summary', title: 'Six levels at a glance',
        notes: 'Portal pressure is high at every level. HVPG is raised only when the block lies between the wedge and the free hepatic vein (sinusoidal, postsinusoidal). A SAAG of 1.1 or more confirms portal hypertension as the cause of ascites; the ascites protein then separates cirrhosis (low, under 2.5 g/dL) from hepatic vein and heart disease (high). Pre-hepatic and presinusoidal disease rarely cause ascites, because the sinusoids, where ascites starts, are at normal pressure. The model gives sinusoidal obstruction syndrome a protein-rich ascites; reports in patients vary.',
        ask: ['A patient has ascites with a SAAG of 1.6 and protein of 4 g/dL. Which levels fit?', 'Post-hepatic or cardiac (Budd–Chiari, heart failure); sinusoidal obstruction syndrome too.'],
      },
    ],
  },
];
