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
//   eq                       [MathML, legend?]: an equation under the title (see mi, mo, sub and frac)
//   kicker, site, title, line, causes
//                            the words (site: a level of ladder.js SITES; it colours the kicker)
//   rail                     true: the six levels with this slide's site marked; 'all': every level named
//   data                     'ladder': the pressure ladder and tiles; 'tiles': tiles only (tiles: which, key: what
//                            to highlight, delta: true or a slide id to show each tile's change from that state)
//   cath                     the HVPG catheter instead of a camera: 'route', 'free', 'wedge', 'result' or 'blocked'
//   lapse                    { seconds, from?, to? }: the slide's days (ramp: { param: [from, to] } eased over them) play on the
//                            live figure as a time-lapse, from the slide before's state (from/to: words for the
//                            start and end in place of a day counter, e.g. 'Fasting' and 'After a meal'; keep the
//                            days at least the seconds, or the live clock runs sub-day and skips the ramp)
//   visual                   over the dimmed figure: 'ladders', 'table' (cols, asc, note, fine, vs: 'first' to show arrows against the first row; a row's ref: true keeps its numbers), 'scale' (scale), 'quadrant'
//                            (SAAG × protein) or 'walls'; of: the rows, slide ids or { id | preset, name, title, note, blank: [columns] }
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
  rectum: [560, 600, 1020, 960],    // inferior mesenteric to the rectal and iliac veins
  wall: [380, 330, 760, 880],       // paraumbilical vein and the abdominal wall
  fundus: [740, 220, 1110, 690],    // fundal varices, the gastrorenal shunt, the left renal vein
  splenic: [660, 230, 1110, 640],   // splenic vein to the confluence, the spleen, the fundus
};

// Equations as MathML (shown under a slide's title): italic single-letter symbols, upright names, real fraction bars.
const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

export const LEVELS = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' };

const SIX = ['pvt', 'presin', 'sin', 'postsin', 'post', 'cardiac'];

export const DECKS = [
  {
    id: 'circulation', level: 'foundation', title: 'The portal circulation', minutes: 12,
    summary: 'Anatomy and pressures of the normal portal system, from the splanchnic veins through the lobule to the right atrium, ending with the definition of portal hypertension.',
    slides: [
      {
        id: 'inflow', preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], data: 'tiles', tiles: ['pvFlow', 'pv'],
        kicker: 'The portal circulation', title: 'Where portal blood comes from',
        line: 'The splenic and superior mesenteric veins join behind the pancreas to form the portal vein. It brings the liver about three quarters of its blood.',
        notes: 'Portal blood drains the gut from the lower esophagus to the upper rectum, and the spleen, pancreas and gallbladder. It carries absorbed nutrients, toxins and bacterial products to the liver first. The inferior mesenteric vein usually joins the splenic vein. Portal flow is about 1 to 1.2 L a minute, three quarters of the liver\'s blood; the hepatic artery brings the rest, and about half of the liver\'s oxygen.',
        ask: ['Which veins form the portal vein?', 'The superior mesenteric vein and the splenic vein, behind the neck of the pancreas.'],
      },
      {
        id: 'series', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'],
        kicker: 'The portal circulation', title: 'Two capillary beds in series',
        line: 'Gut blood crosses the capillaries of the intestine, then the sinusoids of the liver, before it returns to the heart.',
        notes: 'A portal system is a set of veins running between two capillary beds. The first bed is in the gut and spleen, the second is the hepatic sinusoids. Because the beds are in series, anything that raises resistance in the liver, or beyond it, raises the pressure in every vein upstream: the portal vein, the splenic vein and the veins of the gut.',
        ask: ['What makes a circulation a portal system?', 'Blood passes through two capillary beds in series before it returns to the heart.'],
      },
      {
        id: 'ladder', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
        kicker: 'The portal circulation', title: 'Normal pressures, portal vein to heart',
        line: 'About 8 mmHg in the portal vein and 3 in the right atrium. Normal sinusoids offer little resistance, so each drop is small.',
        notes: 'The ladder reads four stations: the portal vein, the wedged hepatic vein (which reads the sinusoids), the free hepatic vein and the right atrium. The dashed line is the healthy reference, used on every slide. In health the whole fall from the portal vein to the IVC, the portal pressure gradient (PPG), is 5 mmHg or less, and the hepatic venous pressure gradient (HVPG), the fall across the sinusoids, is 1 to 5 mmHg.',
        ask: ['What is the normal portal pressure gradient?', '5 mmHg or less.'],
      },
      {
        id: 'lobule', cam: 'lobule:fit',
        kicker: 'Inside the liver', title: 'The lobule',
        line: 'Blood enters at the portal tracts on the edge, runs through the sinusoids and leaves by the central vein.',
        notes: 'The classic lobule is a hexagon about a millimetre across, with a portal tract at its corners and a central vein (terminal hepatic venule) in the middle. Plates of liver cells, one cell thick, line the sinusoids. In the acinus, zone 1 lies near the portal tract and gets the most oxygen; zone 3, around the central vein, gets the least and is the first injured by congestion and low flow.',
        ask: ['Which zone is first injured in heart failure?', 'Zone 3, around the central vein.'],
      },
      {
        id: 'triad', cam: 'lobule:triad',
        kicker: 'Inside the liver', title: 'The portal tract',
        line: 'A portal venule, a hepatic arteriole and a bile duct. Portal and arterial blood mix as they enter the sinusoids.',
        notes: 'The portal tract (portal triad) holds a branch of the portal vein, a branch of the hepatic artery and a bile ductule, with lymphatics, in connective tissue. Lymph made in the liver drains back toward the portal tracts. Presinusoidal diseases (schistosomiasis, porto-sinusoidal vascular disorder) block the portal venules here, upstream of the sinusoids.',
        ask: ['Name the three structures of the portal tract.', 'A portal venule, a hepatic arteriole and a bile ductule.'],
      },
      {
        id: 'wall', cam: 'sinusoid',
        kicker: 'Inside the liver', title: 'The sinusoid wall',
        line: 'Sinusoids have open pores (fenestrae) and no basement membrane. Plasma and its protein pass freely into the space of Disse.',
        notes: 'Sinusoidal endothelial cells have fenestrae about 100 nm across and no basement membrane, so plasma, albumin and other proteins reach the liver cells in the space of Disse. Fluid filtered there leaves as lymph, almost as rich in protein as plasma; the liver makes a quarter to a half of the body\'s lymph. Because protein crosses the wall, oncotic pressure barely opposes filtration: a rise in sinusoidal pressure turns straight into more lymph. Most ascites in portal hypertension begins here. Stellate cells, which store vitamin A and make scar in cirrhosis, sit in the space of Disse.',
        ask: ['Why does a rise in sinusoidal pressure make so much lymph?', 'Protein crosses the wall, so almost no oncotic pressure holds the fluid back.'],
      },
      {
        id: 'central', cam: 'lobule:central',
        kicker: 'Inside the liver', title: 'The central vein',
        line: 'The sinusoids drain into the central vein, then the hepatic veins, the IVC and the right atrium.',
        notes: 'Central veins join into sublobular veins and then the three hepatic veins (right, middle and left), which open into the IVC just below the right atrium. The caudate lobe drains straight into the IVC by its own small veins, which is why it enlarges in Budd–Chiari syndrome. The pressure here follows the right atrium: a high right atrial pressure passes straight back into the sinusoids.',
        ask: ['Why does the caudate lobe enlarge in Budd–Chiari syndrome?', 'It drains into the IVC by its own veins, which escape the block.'],
      },
      {
        id: 'flow', days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }, cam: 'portal', labels: ['SMV', 'CONF'], data: 'ladder', key: ['pv'], tiles: ['pvFlow', 'ppg'], delta: true,
        kicker: 'Hemodynamics', title: 'After a meal: more flow, little more pressure',
        eq: ['<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>' + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop across the liver · Q portal flow · R hepatic resistance'],
        line: 'The gut arterioles open and portal flow climbs by about a quarter. A healthy liver offers so little resistance that the portal pressure barely moves.',
        notes: 'Watch the portal flow tile and the vessels speed up as the meal is digested, while the portal pressure rises by under a millimetre. Pressure is flow times resistance, and normal sinusoids have very little resistance, so even a large rise in flow adds little pressure. In cirrhosis the resistance is high, so the same meal raises the HVPG several mmHg; this is why resistance, not flow, is the starting point of portal hypertension. Later the splanchnic arterioles dilate for good and the extra inflow keeps the pressure high even after collaterals open. Treatments work on one side or the other: beta-blockers and terlipressin cut inflow; TIPS goes around the resistance.',
        ask: ['Name the two ways portal pressure can rise.', 'More resistance to flow, or more inflow (splanchnic vasodilation).'],
      },
      {
        id: 'define', preset: 'csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
        kicker: 'Definition', site: 'sin', title: 'Portal hypertension',
        line: 'Defined as a portal pressure gradient above 5 mmHg. From an HVPG of 10 mmHg, varices and ascites become likely.',
        notes: 'Portal hypertension is a portal pressure gradient above 5 mmHg; in cirrhosis it is measured as the HVPG. An HVPG of 6 to 9 mmHg is subclinical. 10 mmHg or more is clinically significant portal hypertension (CSPH), the threshold for varices and decompensation (ascites, variceal bleeding, encephalopathy); 12 mmHg or more is the threshold for variceal bleeding. In this cirrhotic liver the largest pressure drop is across the sinusoids.',
        ask: ['What HVPG defines clinically significant portal hypertension?', '10 mmHg or more.'],
      },
    ],
  },
  {
    id: 'sites', level: 'core', title: 'Sites and causes of portal hypertension', minutes: 15,
    summary: 'Pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic and cardiac causes, each with its pressure ladder and its effect on the HVPG, followed by a comparison table.',
    slides: [
      {
        id: 'overview', preset: 'healthy', cam: 'fit', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], rail: 'all',
        kicker: 'Portal hypertension', title: 'Classifying portal hypertension by site',
        line: 'Blood runs from the gut through the liver to the heart. Obstruction at any point raises the pressure upstream of it.',
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
        data: 'ladder', key: ['pv', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Pre-hepatic', site: 'pre', title: 'Portal vein thrombosis',
        line: 'Portal pressure is high, yet the wedged pressure and HVPG are normal because the hepatic vein catheter sits downstream of the clot.',
        causes: ['Cirrhosis', 'Myeloproliferative neoplasm, thrombophilia', 'Pancreatitis, abdominal sepsis', 'Liver or pancreatic cancer'],
        notes: 'Chronic thrombosis turns the portal vein into a cavernoma: a web of small collaterals around the occluded trunk that still carries portal blood to the liver. The liver itself is normal, so its function is preserved and ascites is uncommon, while varices and a large spleen are common. Doppler ultrasound or CT shows the clot or the cavernoma. HVPG is normal because the wedged catheter reads the sinusoids, downstream of the clot; the portal pressure gradient (PPG) is high.',
        ask: ['Why is HVPG normal when the portal pressure is about 20 mmHg?', 'The wedge reads the sinusoids, which lie downstream of the clot and are at normal pressure.'],
      },
      {
        id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'ladder', key: ['pv', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Intrahepatic · presinusoidal', site: 'presin', title: 'Schistosomiasis',
        line: 'Eggs lodge in the portal venules and cause periportal fibrosis. The obstruction is upstream of the sinusoids, so HVPG stays near normal.',
        causes: ['Schistosomiasis', 'Porto-sinusoidal vascular disorder', 'Early primary biliary cholangitis', 'Sarcoidosis, congenital hepatic fibrosis'],
        notes: 'Schistosoma mansoni and japonicum eggs reach the presinusoidal portal venules, where granulomas form and periportal (Symmers) fibrosis follows. The sinusoids and liver cells are spared: liver function is preserved, ascites is rare and liver stiffness is near normal. The portal vein is open on imaging, which separates it from a portal vein clot. HVPG is normal or mildly raised and underestimates the portal pressure.',
        ask: ['A patient bleeds from varices. HVPG is normal and the portal vein is open. Where is the block?', 'Presinusoidal, in the portal tracts: schistosomiasis or porto-sinusoidal vascular disorder.'],
      },
      {
        id: 'sin', preset: 'cirr-decomp', cam: 'lobule:sinusoid', data: 'ladder', key: ['whvp', 'hvpg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Intrahepatic · sinusoidal', site: 'sin', title: 'Cirrhosis',
        line: 'Fibrosis, nodules and stellate cell contraction narrow the sinusoids. The wedged pressure reflects sinusoidal pressure, so HVPG rises with portal pressure.',
        causes: ['Alcohol', 'Fatty liver disease (MASLD)', 'Hepatitis B and C', 'Autoimmune, cholestatic, metabolic'],
        notes: 'In cirrhosis the resistance is in the sinusoids: fibrosis, regenerative nodules, a capillarized endothelium and contracted stellate cells, the dynamic part that drugs can relax. Splanchnic vasodilation then raises portal inflow and sustains the pressure. The wedged pressure closely tracks the portal pressure, so HVPG estimates the portal gradient: 10 mmHg or more is clinically significant portal hypertension, and at 12 or more varices can bleed.',
        ask: ['Why does the wedged pressure track the portal pressure in cirrhosis?', 'The resistance lies in the sinusoids the wedge reads, so the wedged pressure rises with the portal pressure.'],
      },
      {
        id: 'postsin', preset: 'sos', cam: 'lobule:central', data: 'ladder', key: ['whvp', 'hvpg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Intrahepatic · postsinusoidal', site: 'postsin', title: 'Sinusoidal obstruction syndrome',
        line: 'Damaged endothelium obstructs the sinusoids and small central veins, upstream of the catheter tip, so the wedged pressure and HVPG rise.',
        causes: ['Conditioning for stem cell transplant', 'Oxaliplatin', 'Pyrrolizidine alkaloids (bush teas)'],
        notes: 'Formerly veno-occlusive disease. Toxic injury sheds sinusoidal endothelial cells, which obstruct the sinusoids and the terminal hepatic venules. It presents within weeks of myeloablative conditioning with tender hepatomegaly, weight gain, ascites and jaundice. An HVPG above 10 mmHg, measured with a transjugular biopsy, strongly supports the diagnosis. The model shows an earlier stage, with an HVPG of about 9 mmHg: raised, but under 10.',
        ask: ['Why does HVPG rise here but not in schistosomiasis?', 'Here the block lies behind the wedge; in schistosomiasis it lies upstream of the sinusoids.'],
      },
      {
        id: 'post', preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Blocked hepatic veins' },
        data: 'ladder', key: ['fhvp', 'ra', 'hvpg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Post-hepatic', site: 'post', title: 'Budd–Chiari syndrome',
        line: 'Hepatic venous outflow is obstructed. Wedged and free pressures are both high, so HVPG is near zero, while right atrial pressure is normal.',
        causes: ['Myeloproliferative neoplasm (JAK2)', 'Thrombophilia, pregnancy, the pill', 'IVC web', 'Tumor invading the veins'],
        notes: 'Hepatic venous outflow obstruction, anywhere from the small hepatic veins to the IVC at the right atrium. The liver is congested and enlarged; the caudate lobe, which drains straight into the IVC, hypertrophies. Ascites is common, protein-rich (2.5 g/dL or more) and with a SAAG of 1.1 or more. In practice the blocked veins often cannot be catheterized: the model shows the pressures behind the block. Doppler ultrasound, CT or MR venography make the diagnosis.',
        ask: ['Why is HVPG near zero although the portal pressure is about 27 mmHg?', 'Both the wedged and the free pressures are measured behind the block, so both are high and their difference is small.'],
      },
      {
        id: 'cardiac', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], mark: { edges: ['IVCS_RA'], label: 'High right atrial pressure' },
        data: 'ladder', key: ['ra', 'fhvp', 'hvpg', 'ppg'], rail: true, quiz: 'Where is the obstruction?',
        kicker: 'Cardiac', site: 'cardiac', title: 'Right heart failure',
        line: 'Raised right atrial pressure is transmitted back through the hepatic veins to the sinusoids. All stations rise together and HVPG stays normal.',
        causes: ['Tricuspid regurgitation', 'Pulmonary hypertension', 'Left heart failure', 'Constrictive pericarditis'],
        notes: 'Congestive hepatopathy. The jugular venous pressure is raised, the hepatojugular reflux is positive and Doppler shows a pulsatile portal vein. The ascites is protein-rich with a SAAG of 1.1 or more. Varices are rare: they need a gradient between the portal and the systemic veins, and here both are high, so the PPG is normal. Constrictive pericarditis gives the same pattern with a normal-sized heart.',
        ask: ['Why are varices rare in heart failure despite a portal pressure of about 20 mmHg?', 'Varices need a portal-to-systemic gradient; the systemic veins are high too, so the gradient (PPG) is normal.'],
      },
      {
        id: 'ladders', cam: 'fit', visual: 'ladders', of: SIX,
        kicker: 'How to tell them apart', title: 'The largest pressure drop locates the obstruction',
        line: 'Portal pressure is high at every site. HVPG measures only the drop between the wedged and free hepatic pressures.',
        notes: 'Read each ladder from left to right. Pre-hepatic and presinusoidal: the fall is between the portal vein and the wedge, so HVPG is normal and only a direct portal pressure (or the PPG) shows it. Sinusoidal and postsinusoidal: the fall is between the wedged and the free pressures, exactly what HVPG measures. Post-hepatic: the fall is between the free hepatic vein and the right atrium. Cardiac: there is no fall at all; every station is high.',
        ask: ['Which two levels raise the HVPG?', 'Sinusoidal and postsinusoidal.'],
      },
      {
        id: 'summary', visual: 'table', of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, ...SIX],
        kicker: 'Summary', title: 'The six sites compared',
        notes: 'Portal pressure is high at every level. HVPG is raised only when the block lies between the wedge and the free hepatic vein (sinusoidal, postsinusoidal). A SAAG of 1.1 or more confirms portal hypertension as the cause of ascites; the ascites protein then separates cirrhosis (low, under 2.5 g/dL) from hepatic vein and heart disease (high). Pre-hepatic and presinusoidal disease rarely cause ascites, because the sinusoids, where ascites starts, are at normal pressure. The model gives sinusoidal obstruction syndrome a protein-rich ascites; reports in patients vary.',
        ask: ['A patient has ascites with a SAAG of 1.6 and protein of 4 g/dL. Which levels fit?', 'Post-hepatic or cardiac (Budd–Chiari, heart failure); sinusoidal obstruction syndrome too.'],
      },
    ],
  },
  {
    id: 'hvpg', level: 'core', title: 'Measuring portal pressure: HVPG and PPG', minutes: 15,
    summary: 'How the free and wedged hepatic pressures are recorded and what the HVPG means, then the conditions in which it misleads (pre-hepatic and presinusoidal disease, heart failure, Budd–Chiari) and how the PPG helps.',
    slides: [
      {
        id: 'route', preset: 'csph', cath: 'route',
        kicker: 'Measuring portal pressure', title: 'Access through the internal jugular vein',
        line: 'A balloon catheter goes down the superior vena cava, through the right atrium and the IVC, into a hepatic vein.',
        notes: 'Under local anesthetic and ultrasound guidance the right internal jugular vein is punctured, and a balloon catheter is passed under fluoroscopy through the right atrium into the IVC and on into a hepatic vein, usually the right. The transducer is zeroed at the mid-axillary line and each reading is taken in triplicate; deep sedation is avoided because it disturbs the readings. A transjugular liver biopsy can be taken in the same session.',
        ask: ['Why the right internal jugular vein?', 'It gives a straight path through the right atrium and the IVC into the hepatic veins.'],
      },
      {
        id: 'free', cath: 'free',
        kicker: 'Measuring portal pressure', title: 'Free hepatic venous pressure',
        line: 'With the balloon deflated, the catheter tip records hepatic vein pressure, normally close to IVC pressure.',
        notes: 'The free hepatic venous pressure (FHVP) is read with the tip free in the hepatic vein, 2 to 4 cm from where it opens into the IVC. It should be within about 2 mmHg of the IVC pressure; a bigger difference suggests the tip is badly placed or the vein is obstructed. Subtracting the free pressure, not the right atrial one, cancels the abdominal pressure that tense ascites adds to both readings.',
        ask: ['Why subtract the free pressure rather than the right atrial pressure?', 'The free pressure carries the same abdominal and venous pressure as the wedge, so subtracting it cancels them.'],
      },
      {
        id: 'wedge', cath: 'wedge',
        kicker: 'Measuring portal pressure', title: 'Wedged hepatic venous pressure',
        line: 'With the balloon inflated, the static column of blood ahead of it transmits sinusoidal pressure.',
        notes: 'With the balloon inflated, flow in the hepatic vein stops and the still column of blood carries the pressure of the sinusoids that feed it. A little contrast confirms the wedge: it stays still, with no washout through collaterals. The wedged hepatic venous pressure (WHVP) is read once stable, after at least 40 seconds. In cirrhosis the sinusoids no longer communicate freely with each other, so the WHVP closely matches the portal pressure.',
        ask: ['How do you check that the balloon has truly wedged the vein?', 'Inject contrast: it stays still, with no washout, and the pressure curve flattens.'],
      },
      {
        id: 'hvpg', cath: 'result', data: 'ladder', key: ['whvp', 'fhvp', 'hvpg'], tiles: ['hvpg', 'ppg'],
        kicker: 'Measuring portal pressure', site: 'sin', title: 'Hepatic venous pressure gradient',
        eq: [mi('HVPG') + mo('=') + mi('WHVP') + mo('−') + mi('FHVP'), 'Wedged minus free hepatic venous pressure'],
        line: 'Normal is 1 to 5 mmHg. Above 5 is portal hypertension, 10 or more is clinically significant portal hypertension (CSPH), and from 12 the variceal bleed risk is high.',
        notes: 'The hepatic venous pressure gradient is the pressure drop across the sinusoids. This patient\'s HVPG of about 12 mmHg is clinically significant. HVPG predicts outcome: varices and decompensation at 10 mmHg or more, bleeding at 12 or more. On treatment, a fall to below 12 mmHg, or by 20% or more, protects against bleeding. Without a catheter, liver stiffness (25 kPa or more) rules clinically significant portal hypertension in; stiffness of 15 kPa or less with platelets of 150 or more rules it out.',
        ask: ['On carvedilol, HVPG falls from 18 to 13 mmHg. Is that a response?', 'Yes: a fall of more than 20% protects against bleeding, although it is still above 12.'],
      },
      {
        id: 'grades', visual: 'scale', scale: { key: 'hvpg', max: 20, low: 'Normal', marks: [[5, 'Portal\nhypertension'], [10, 'Clinically significant\nportal hypertension\n(CSPH)'], [12, 'Variceal bleed risk\nis high']] },
        of: [{ preset: 'healthy', name: 'Healthy' }, { preset: 'cirr-comp', name: 'Compensated cirrhosis' }, { id: 'hvpg', name: 'This patient' }, { preset: 'cirr-decomp', name: 'Decompensated cirrhosis' }],
        kicker: 'Thresholds', title: 'HVPG thresholds',
        line: 'Four patients from the model, plotted on the same scale.',
        notes: 'HVPG 1 to 5 mmHg is normal. 6 to 9: portal hypertension, still subclinical. 10 or more: clinically significant portal hypertension, the threshold for varices, ascites and decompensation; Baveno VII advises a non-selective beta-blocker, preferably carvedilol, at this stage to prevent decompensation. 12 or more: varices can bleed. Higher values carry a worse outlook; in an acute bleed an HVPG of 20 or more predicts failure to control it.',
        ask: ['At what HVPG can varices bleed?', '12 mmHg or more.'],
      },
      {
        id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'ladder', key: ['pv', 'whvp', 'hvpg'], tiles: ['hvpg', 'ppg'],
        kicker: 'Where HVPG fails', site: 'presin', title: 'Normal HVPG, high portal pressure',
        line: 'In schistosomiasis the obstruction is in the portal tracts, upstream of the sinusoids. HVPG is 2 mmHg while portal pressure is 21.',
        notes: 'The wedged catheter reads only what lies downstream of a block. In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder, early primary biliary cholangitis) the sinusoids are near normal, so the WHVP and the HVPG are normal or only mildly raised and underestimate the portal pressure. A normal HVPG in a patient with varices or a large spleen points to a presinusoidal or pre-hepatic cause.',
        ask: ['Varices, a large spleen and an HVPG of 4 mmHg. What next?', 'Look for a presinusoidal or pre-hepatic cause: image the portal vein, and consider a liver biopsy.'],
      },
      {
        id: 'ppg', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'ladder', key: ['pv', 'hvpg'], tiles: ['hvpg', 'ppg'],
        kicker: 'Where HVPG fails', site: 'pre', title: 'The portal pressure gradient',
        eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
        line: 'Measured directly. It detects obstruction anywhere between the two, including this portal vein clot.',
        notes: 'Portal pressure can be measured directly: during TIPS, through a needle into a portal branch (transhepatic or transjugular), or by an endoscopic ultrasound-guided needle. A PPG above 5 mmHg is portal hypertension, as for HVPG, and after TIPS the aim is a PPG below 12 mmHg. In the model the portal pressure is read at the confluence, upstream of the clot, so the PPG is high while the HVPG, read downstream, is normal.',
        ask: ['Which measurement finds a pre-hepatic block: HVPG or PPG?', 'PPG: it is read upstream of the block. HVPG is read downstream and stays normal.'],
      },
      {
        id: 'heart', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], data: 'ladder', key: ['fhvp', 'ra', 'hvpg'], tiles: ['hvpg', 'ppg'],
        kicker: 'Free hepatic pressure', site: 'cardiac', title: 'Right heart failure',
        line: 'Wedged and free pressures are both near 20 mmHg, so HVPG is normal. The raised free pressure points to the heart.',
        notes: 'HVPG is a difference, so it cancels whatever the wedged and the free readings share. In right heart failure and constrictive pericarditis every station from the portal vein to the right atrium is high: the HVPG and the PPG are normal, but the absolute pressures are not. Always read the free hepatic and the right atrial pressures as well. The same pattern with a normal right atrial pressure points to a block between the hepatic veins and the heart, such as an IVC web.',
        ask: ['WHVP 21, FHVP 20, right atrium 19 mmHg. What is the HVPG, and where is the problem?', 'HVPG 1 mmHg, normal. The problem is the heart: every station is high.'],
      },
      {
        id: 'bc', preset: 'budd-chiari', cath: 'blocked',
        kicker: 'Hepatic vein occlusion', site: 'post', title: 'Budd–Chiari syndrome',
        line: 'The hepatic veins are occluded. The catheter reaches the opening but cannot enter, so there is no HVPG to read.',
        notes: 'In Budd–Chiari syndrome the hepatic veins, or the IVC above them, are thrombosed or webbed. The catheter often cannot enter the vein, or enters only a stump. If a wedge is achieved, both the wedged and the free readings lie behind the block, so the HVPG is near zero and misleading. Doppler ultrasound, CT or MR venography make the diagnosis; venography shows a spider-web of collaterals. Treatment is stepwise: anticoagulation, angioplasty or a stent for short stenoses, TIPS, then transplantation.',
        ask: ['Why would a wedged reading mislead in Budd–Chiari syndrome?', 'The wedged and free readings both lie behind the block, so their difference is near zero although portal pressure is very high.'],
      },
      {
        id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: false, note: 'What HVPG shows', rowHead: 'Patient',
        of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true }, { id: 'hvpg', title: 'Cirrhosis', note: 'Reliable' }, { id: 'presin', title: 'Schistosomiasis', note: 'Normal despite the obstruction' },
          { id: 'ppg', title: 'Portal vein thrombosis', note: 'Normal despite the obstruction' }, { id: 'heart', title: 'Right heart failure', note: 'Normal, all pressures high' }, { id: 'bc', title: 'Budd–Chiari', note: 'Cannot be measured', blank: ['whvp', 'fhvp', 'hvpg'] }],
        kicker: 'Summary', title: 'When HVPG is reliable',
        notes: 'HVPG is reliable when the block is in the sinusoids, as in cirrhosis, the commonest cause: it is the standard for diagnosis, prognosis and following treatment. It is normal with pre-hepatic and presinusoidal blocks, and near zero when the pressures behind the hepatic veins rise together (post-hepatic, cardiac). The PPG and the absolute pressures complete the picture. The model\'s pressures for Budd–Chiari are those behind the block.',
        ask: ['Which numbers would you read to place a block?', 'The HVPG with the free hepatic and right atrial pressures, and the PPG when it can be measured.'],
      },
    ],
  },
  {
    id: 'ascites', level: 'advanced', title: 'Ascites: where it comes from and what is in it', minutes: 15,
    summary: 'How ascites forms in the sinusoids, why portal vein thrombosis and presinusoidal disease rarely cause it, and how the SAAG and ascitic protein point to the cause.',
    slides: [
      {
        id: 'start', preset: 'csph', cam: 'sinusoid', data: 'tiles', tiles: ['sin', 'asc'], key: ['sin'],
        kicker: 'Ascites', site: 'sin', title: 'Ascites starts in the sinusoids',
        line: 'Sinusoidal pressure drives plasma into the space of Disse. Hepatic lymphatics drain it until their capacity is exceeded.',
        notes: 'Ascites in portal hypertension is mostly lymph. Sinusoidal pressure drives plasma through the open sinusoid wall into the space of Disse, and the hepatic lymphatics return it to the blood through the thoracic duct. Hepatic lymph flow can rise many-fold; once it outruns the lymphatics, lymph weeps from the surface of the liver into the peritoneum. This patient has clinically significant portal hypertension, and the lymphatics still keep up. Ascites seldom forms below an HVPG of about 12 mmHg.',
        ask: ['What carries the sinusoids\' filtrate away before ascites forms?', 'The hepatic lymphatics, to the thoracic duct.'],
      },
      {
        id: 'fill', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 9 }, cam: 'fit', data: 'tiles', tiles: ['sin', 'asc', 'tp'], key: ['asc'], delta: true,
        kicker: 'Ascites', site: 'sin', title: 'Two months of progression',
        line: 'As fibrosis advances and serum albumin falls, sinusoidal pressure rises and ascites accumulates.',
        notes: 'The time-lapse runs the model\'s disease clock: cirrhosis advances and serum albumin falls from 4.0 to 2.8 g/dL over 60 days, without diuretics. The sinusoids climb from about 17 to 26 mmHg, hepatic lymph overflows and the ascites reaches several litres. In patients, splanchnic vasodilation lowers the effective blood volume, and the kidneys retain sodium and water through renin–angiotensin–aldosterone, the sympathetic system and vasopressin. Portal hypertension decides where the fluid goes; the kidneys keep it coming. Treatment: less salt, spironolactone with furosemide, large-volume paracentesis with albumin, TIPS.',
        ask: ['Which hormone system drives sodium retention in cirrhotic ascites, and which drug blocks it?', 'Renin–angiotensin–aldosterone; spironolactone.'],
      },
      {
        id: 'saag', cam: 'fit', data: 'tiles', tiles: ['saag', 'tp'], key: ['saag'],
        kicker: 'Tapping the fluid', site: 'sin', title: 'Serum–ascites albumin gradient',
        eq: [mi('SAAG') + mo('=') + sub(mi('Albumin'), 'serum') + mo('−') + sub(mi('Albumin'), 'ascites')],
        line: 'A value of 1.1 g/dL or more indicates portal hypertension.',
        notes: 'The serum–ascites albumin gradient uses serum and ascites taken the same day. A SAAG of 1.1 g/dL or more identifies portal hypertension as the cause with about 97% accuracy, whatever causes the portal hypertension. Below 1.1, the fluid comes from a leaky peritoneum or a very low serum albumin: cancer, tuberculosis, pancreatitis, nephrotic syndrome. Send a cell count as well (more than 250 neutrophils per mm³ is spontaneous bacterial peritonitis), the total protein, and a culture in blood-culture bottles.',
        ask: ['The SAAG is 0.8 g/dL. Is portal hypertension the cause?', 'No: below 1.1 the fluid is not pushed out by portal pressure. Look for peritoneal disease or a very low protein state.'],
      },
      {
        id: 'lowprot', cam: 'sinusoid', data: 'tiles', tiles: ['tp', 'saag'], key: ['tp'],
        kicker: 'Tapping the fluid', site: 'sin', title: 'Low protein in cirrhosis',
        line: 'Fibrosis closes the fenestrae and lays down a basement membrane (capillarization). Less protein crosses, so the fluid is protein-poor.',
        notes: 'In cirrhosis the sinusoids capillarize: the fenestrae close and a basement membrane and collagen form in the space of Disse. The wall now holds protein back, so the lymph and the ascites are thin, with a total protein below 2.5 g/dL. Diuretics concentrate the fluid and raise its protein somewhat. A protein below 1.5 g/dL means weak opsonic activity and a higher risk of spontaneous bacterial peritonitis, so prophylactic antibiotics are considered.',
        ask: ['Why does an ascites protein below 1.5 g/dL matter?', 'Weak opsonic activity: a higher risk of spontaneous bacterial peritonitis, so prophylaxis is considered.'],
      },
      {
        id: 'pvt', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'tiles', tiles: ['pv', 'sin', 'asc'], key: ['sin'],
        kicker: 'Pre-hepatic block', site: 'pre', title: 'Portal vein thrombosis',
        line: 'Portal pressure is 20 mmHg, but the sinusoids beyond the clot are at 8, so little or no ascites forms.',
        notes: 'Pre-hepatic portal hypertension raises the pressure in the gut and spleen, so varices and a large spleen are common, but the sinusoids lie downstream of the clot at normal pressure. The gut\'s capillaries hold their fluid (two slides on), and their extra lymph drains away. Ascites is uncommon: it appears briefly in acute thrombosis, after a variceal bleed with fluid loading, or when the serum albumin falls.',
        ask: ['Why does a portal vein clot raise portal pressure but rarely cause ascites?', 'The sinusoids, where ascites starts, lie downstream of the clot at normal pressure.'],
      },
      {
        id: 'presin', preset: 'schisto', cam: 'lobule:triad', data: 'tiles', tiles: ['pv', 'sin', 'asc'], key: ['sin'],
        kicker: 'Presinusoidal block', site: 'presin', title: 'Schistosomiasis',
        line: 'Obstruction in the portal tracts leaves sinusoidal pressure near normal, so ascites is uncommon despite high portal pressure.',
        notes: 'In presinusoidal disease the scar sits around the portal venules and the sinusoids are spared: their pressure is near normal, liver function is preserved and ascites is rare, while varices bleed. When ascites does appear in schistosomiasis or porto-sinusoidal vascular disorder, it usually follows a bleed, an infection or a falling albumin, or marks advanced or mixed disease.',
        ask: ['Bleeding varices, no ascites and normal liver tests in a patient from an endemic area. Where is the block?', 'Presinusoidal, in the portal tracts: schistosomiasis.'],
      },
      {
        id: 'walls', visual: 'walls',
        kicker: 'Starling forces', title: 'Gut capillaries and sinusoids compared',
        line: 'Gut capillaries retain protein, so oncotic pressure limits filtration when their pressure rises. Sinusoids do not, so ascites depends on sinusoidal pressure.',
        notes: 'Starling: filtration = Kf × [(capillary − tissue pressure) − σ × (plasma − tissue oncotic pressure)]. The gut\'s capillary wall is continuous, with a basement membrane, and turns back most protein (σ about 0.9): the plasma\'s oncotic pressure, about 25 mmHg, holds the fluid in, so a raised capillary pressure makes only a little more fluid, which the lymphatics carry away. In the sinusoid σ is near zero: oncotic pressure offers almost no opposition, and each rise in pressure adds to lymph flow. Capillarization in cirrhosis raises σ part of the way, which is why cirrhotic ascites is thin.',
        ask: ['What does a reflection coefficient (σ) near zero mean for the sinusoid wall?', 'Protein crosses freely, so oncotic pressure cannot hold the fluid back, and pressure becomes lymph.'],
      },
      {
        id: 'hf', preset: 'rhf', cam: 'sinusoid', data: 'tiles', tiles: ['tp', 'saag', 'sin'], key: ['tp'],
        kicker: 'Protein-rich ascites', site: 'cardiac', title: 'High protein in heart failure',
        line: 'The sinusoid wall is still open. Congestion drives protein-rich lymph through it: SAAG 1.1 or more, protein 2.5 or more.',
        notes: 'In heart failure and constrictive pericarditis the sinusoids are congested but not scarred: the fenestrae stay open, so the lymph is nearly as rich in protein as plasma. The ascites has a high SAAG (portal hypertension of cardiac origin) and a total protein of 2.5 g/dL or more. A raised jugular venous pressure and a high BNP point to the heart.',
        ask: ['Ascites with a SAAG of 1.5 and protein of 3.8 g/dL. What do you examine next?', 'The heart: the jugular venous pressure, an echocardiogram, BNP.'],
      },
      {
        id: 'bc', preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Blocked hepatic veins' }, data: 'tiles', tiles: ['tp', 'saag', 'sin'], key: ['tp'],
        kicker: 'Protein-rich ascites', site: 'post', title: 'High protein in Budd–Chiari syndrome',
        line: 'Blocked hepatic veins congest a liver that is not yet scarred. Its sinusoids are open, so the fluid is protein-rich too.',
        notes: 'Hepatic venous outflow block gives the same high-SAAG, high-protein ascites as heart failure, but with a normal jugular venous pressure. Over months the congested liver can scar and capillarize, and the protein falls toward the cirrhotic range. Ascites with abdominal pain and a large liver, in a patient with a myeloproliferative neoplasm or in pregnancy, calls for a Doppler of the hepatic veins.',
        ask: ['High-SAAG, high-protein ascites and a normal jugular venous pressure. Where do you look?', 'At the hepatic veins and the IVC, for Budd–Chiari syndrome (Doppler ultrasound).'],
      },
      {
        id: 'map', visual: 'quadrant', of: [{ id: 'fill', name: 'Cirrhosis' }, { id: 'hf', name: 'Heart failure' }, { id: 'bc', name: 'Budd–Chiari' }],
        kicker: 'Summary', title: 'Interpreting SAAG and protein',
        line: 'SAAG indicates whether portal hypertension is the cause. Ascitic protein reflects whether the sinusoid wall is capillarized or still permeable.',
        notes: 'Read the SAAG first: 1.1 g/dL or more is portal hypertension. Then the protein: below 2.5 g/dL fits cirrhosis (sealed, capillarized sinusoids); 2.5 or more with a high SAAG fits the heart or early Budd–Chiari (open, congested sinusoids). A low SAAG with high protein means a leaky peritoneum: peritoneal cancer, tuberculosis, pancreatic ascites. A low SAAG with low protein is rare: nephrotic syndrome. Portal vein thrombosis and presinusoidal disease have no point here, because they rarely cause ascites. The points are the model\'s patients.',
        ask: ['SAAG 0.6, protein 4.2 g/dL and weight loss. What is likely, and what next?', 'Peritoneal cancer or tuberculous peritonitis: cytology, adenosine deaminase, peritoneal biopsy.'],
      },
    ],
  },
  {
    id: 'varices', level: 'core', title: 'Collaterals and varices', minutes: 14,
    summary: 'Six months of progression on the model, then esophageal and fundal varices, bleeding risk, splenic vein thrombosis, other portosystemic routes, and why heart failure rarely produces varices.',
    slides: [
      {
        id: 'collat', preset: 'csph', cam: 'fit', data: 'tiles', tiles: ['hvpg', 'varix', 'spleen', 'plt'],
        kicker: 'Collaterals', site: 'sin', title: 'Portosystemic collaterals',
        line: 'Where portal and systemic veins meet, small connecting veins open and swell, carrying portal blood around the liver.',
        notes: 'Portosystemic collaterals open where the portal and systemic venous beds meet: at the gastroesophageal junction (left gastric and short gastric veins to the azygos), the umbilicus (paraumbilical veins), the rectum (superior to middle and inferior rectal veins), the retroperitoneum (veins of Retzius), and through splenorenal and gastrorenal shunts. They form by reopening existing channels and by new vessel growth, driven by the portal-to-systemic gradient. Even large ones do not relieve portal hypertension: splanchnic inflow rises to fill them.',
        ask: ['Name four places where portosystemic collaterals form.', 'The gastroesophageal junction, the umbilicus, the rectum, the retroperitoneum (and splenorenal and gastrorenal shunts).'],
      },
      {
        id: 'lapse', days: 180, ramp: { cirrhosis: [0.6, 0.85] }, lapse: { seconds: 10 }, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'varix', 'spleen', 'plt'], delta: true,
        kicker: 'Collaterals', site: 'sin', title: 'Six months of progression',
        line: 'HVPG climbs, the varices grow from small to large, the spleen swells and the platelets fall.',
        notes: 'The time-lapse runs the model\'s disease clock for 180 days while the cirrhosis advances. As the gradient rises, collateral flow grows (by the end about three quarters of the portal blood is shunted) and the varices enlarge. The congested spleen enlarges and holds back platelets (hypersplenism): a low platelet count with a stiff liver suggests clinically significant portal hypertension. Baveno advises that screening endoscopy can be skipped when liver stiffness is below 20 kPa and platelets are above 150.',
        ask: ['When can screening endoscopy be skipped in compensated cirrhosis?', 'Liver stiffness below 20 kPa and platelets above 150 (Baveno).'],
      },
      {
        id: 'eso', cam: 'varices', labels: ['VAR', 'AZY'], mark: { edges: ['C1a', 'C1b'], label: 'Esophageal varices' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'],
        kicker: 'Varices', site: 'sin', title: 'Esophageal varices',
        line: 'The left gastric vein carries portal blood up to the lower esophagus. The veins under its lining swell and drain to the azygos.',
        notes: 'Gastroesophageal varices are the collaterals that matter most, because they bleed. Blood runs from the left gastric (coronary) and short gastric veins through veins in the wall of the lower esophagus to the azygos system. At endoscopy small varices are under 5 mm and large ones over 5 mm; red wale marks are thin spots in the wall. About half of patients have varices when cirrhosis is diagnosed.',
        ask: ['Into which systemic vein do esophageal varices drain?', 'The azygos vein.'],
      },
      {
        id: 'burst', cam: [690, -10, 890, 170], kMax: 4.5, labels: ['VAR'], data: 'tiles', tiles: ['varix', 'hvpg'], key: ['hvpg'],
        kicker: 'Varices', site: 'sin', title: 'Bleeding risk above 12 mmHg',
        eq: [mi('T') + mo('=') + frac(mi('P') + mo('⋅') + mi('r'), mi('w')), 'Laplace: T wall tension · P pressure in the varix · r radius · w wall thickness'],
        line: 'Large, thin-walled varices under high pressure are the ones that rupture.',
        notes: 'By Laplace\'s law the tension in a varix wall rises with the pressure inside it and its radius, and falls with the thickness of its wall. Varices do not bleed below an HVPG of 12 mmHg. Large size, red wale marks and poor liver function (Child–Pugh B or C) predict bleeding: about 10 to 15% of patients with varices bleed each year, and a bleed carries a 6-week mortality of about 15 to 20%. Large varices are treated with a non-selective beta-blocker or banding.',
        ask: ['Name three predictors of variceal bleeding.', 'Large size, red wale marks, Child–Pugh B or C (and an HVPG of 12 or more).'],
      },
      {
        id: 'fundal', preset: 'gastric-varix', cam: 'fundus', labels: ['GV', 'LRV'], mark: { edges: ['C5'], label: 'Gastrorenal shunt' }, data: 'tiles', tiles: ['gv', 'varix'], key: ['gv'],
        kicker: 'Gastric varices', site: 'sin', title: 'Fundal varices and the gastrorenal shunt',
        line: 'Gastric veins swell in the fundus of the stomach and drain into the left renal vein through a gastrorenal shunt.',
        notes: 'Isolated fundal varices (IGV1) and those running from the esophagus along the greater curve (GOV2) usually drain through a spontaneous gastrorenal shunt to the left renal vein. They bleed less often than esophageal varices, but more heavily. They are treated with cyanoacrylate glue at endoscopy, by blocking the shunt from below (balloon-occluded retrograde transvenous obliteration, BRTO), or with TIPS. A large shunt also steals portal blood from the liver and raises the risk of encephalopathy.',
        ask: ['Which procedure blocks a gastrorenal shunt from below?', 'BRTO: balloon-occluded retrograde transvenous obliteration, through the left renal vein.'],
      },
      {
        id: 'svt', preset: 'svt', cam: 'splenic', labels: ['SV', 'CONF', 'GV'], mark: { edges: ['SV_CONF'], label: 'Clot' }, data: 'tiles', tiles: ['pv', 'gv', 'spleen'], key: ['pv', 'gv'],
        kicker: 'Left-sided portal hypertension', site: 'pre', title: 'Splenic vein thrombosis',
        line: 'A clot in the splenic vein raises the pressure on the left only. The portal vein stays normal; the spleen swells and gastric varices form.',
        notes: 'Sinistral (left-sided) portal hypertension. Splenic blood goes around the clot through the short gastric and gastroepiploic veins, giving isolated gastric varices with a normal portal pressure and a normal liver; esophageal varices are uncommon. Pancreatitis and pancreatic cancer are the usual causes. Removing the inflow cures it: splenectomy, or splenic artery embolization.',
        ask: ['Gastric varices, a large spleen and normal liver tests after pancreatitis. Diagnosis and cure?', 'Splenic vein thrombosis; splenectomy, or splenic artery embolization.'],
      },
      {
        id: 'umbilical', preset: 'cirr-decomp', cam: 'wall', mark: { edges: ['C3'], label: 'Paraumbilical vein' }, data: 'tiles', tiles: ['shunt', 'liver'],
        kicker: 'Other collaterals', site: 'sin', title: 'Paraumbilical collaterals',
        line: 'The paraumbilical vein reopens from the left portal vein to the veins of the abdominal wall. A caput medusae can spread around the navel.',
        notes: 'The paraumbilical veins run in the falciform ligament from the left portal vein to the abdominal wall. When they enlarge, blood flows away from the liver through them; dilated veins radiating from the umbilicus form a caput medusae, and a venous hum may be heard over them (Cruveilhier–Baumgarten). The flow runs away from the umbilicus, unlike the upward flow of IVC obstruction. These collaterals rarely bleed, but a large one steals portal blood from the liver.',
        ask: ['How do the abdominal wall veins tell portal hypertension from IVC obstruction?', 'In portal hypertension the flow radiates away from the umbilicus; in IVC obstruction it runs upward below it.'],
      },
      {
        id: 'rectal', cam: 'rectum', mark: { edges: ['C4'], label: 'Rectal varices' },
        kicker: 'Other collaterals', site: 'sin', title: 'Rectal varices and shunts behind the gut',
        line: 'The superior rectal vein (portal) meets the middle and inferior rectal veins (systemic). Retroperitoneal and splenorenal shunts open too.',
        notes: 'Rectal varices are portosystemic collaterals; hemorrhoids are vascular cushions and are no more common in portal hypertension. Rectal varices bleed occasionally. The retroperitoneal veins of Retzius and spontaneous splenorenal shunts carry portal blood to the IVC and the renal veins. Together, large spontaneous shunts divert portal blood, and the ammonia it carries from the gut, past the liver, and raise the risk of encephalopathy.',
        ask: ['Are hemorrhoids a sign of portal hypertension?', 'No: rectal varices are; hemorrhoids are no more common in portal hypertension.'],
      },
      {
        id: 'nograd', preset: 'rhf', cam: 'varices', labels: ['AZY'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
        kicker: 'Heart failure', site: 'cardiac', title: 'Why varices are rare in heart failure',
        line: 'Collaterals need a gradient from the portal to the systemic veins. In heart failure both are high, so the PPG is normal and varices are rare.',
        notes: 'Portosystemic collaterals open only where portal pressure exceeds systemic venous pressure. In right heart failure and constrictive pericarditis the systemic veins are as high as the portal vein, so the gradient that drives collateral flow is missing. In Budd–Chiari syndrome the block lies between the liver and the IVC: the portal pressure is high and the IVC normal, so varices do form.',
        ask: ['Why do varices form in Budd–Chiari syndrome but rarely in heart failure?', 'In Budd–Chiari the IVC is normal, so there is a portal-to-systemic gradient; in heart failure there is none.'],
      },
    ],
  },
  {
    id: 'treatment', level: 'advanced', title: 'Lowering portal pressure', minutes: 14,
    summary: 'Propranolol, carvedilol, terlipressin, band ligation and TIPS in one patient with decompensated cirrhosis, with the effect of each on HVPG, varices and ascites, and the cost of TIPS to liver perfusion.',
    slides: [
      {
        id: 'target', preset: 'cirr-decomp', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg'], tiles: ['hvpg', 'varix'],
        kicker: 'Lowering portal pressure', site: 'sin', title: 'The patient',
        line: 'Decompensated cirrhosis with HVPG 17 mmHg, large varices and ascites. Treatment reduces inflow, reduces resistance, or bypasses the liver.',
        notes: 'Portal pressure is flow times resistance. Non-selective beta-blockers and the vasoactive drugs used in bleeding cut the inflow; carvedilol also lowers the resistance inside the liver; TIPS goes around it. Banding treats the varix, not the pressure. Removing the cause (stopping alcohol, treating hepatitis) lowers the resistance over months to years. On drugs, the aim is an HVPG fall of 20% or more, or to below 12 mmHg.',
        ask: ['Name a treatment that cuts the inflow and one that lowers the resistance.', 'Inflow: propranolol, terlipressin, octreotide. Resistance: carvedilol, treating the cause; TIPS goes around it.'],
      },
      {
        id: 'prop', params: { drugs: { propranolol: true } }, cam: 'portal', labels: ['SMV', 'CONF'], data: 'ladder', key: ['pv', 'hvpg'], tiles: ['hvpg', 'varix'], delta: 'target',
        kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Propranolol',
        line: 'β1 blockade lowers cardiac output; β2 blockade lets the gut\'s arterioles constrict. Portal inflow falls, and HVPG with it.',
        notes: 'Propranolol (or nadolol) is titrated to a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg. It prevents a first bleed from large varices and, with banding, a second one. About a third to a half of patients reach a protective fall in HVPG. In refractory ascites with low blood pressure or kidney injury the dose is reduced or stopped. The model shows a modest fall.',
        ask: ['How is propranolol titrated?', 'To a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg.'],
      },
      {
        id: 'carv', params: { drugs: { propranolol: false, carvedilol: true } }, cam: 'liver', data: 'ladder', key: ['whvp', 'hvpg'], tiles: ['hvpg', 'varix'], delta: 'target',
        kicker: 'Non-selective beta-blocker', site: 'sin', title: 'Carvedilol',
        line: 'It also blocks α1 receptors, relaxing the liver\'s own vascular tone. HVPG falls further, at some cost in blood pressure.',
        notes: 'Carvedilol 6.25 to 12.5 mg a day. Its α1 blockade relaxes the contracted stellate cells and lowers the resistance inside the liver, so it lowers HVPG more than propranolol and brings about half of propranolol non-responders to a protective fall. Baveno VII recommends a non-selective beta-blocker, preferably carvedilol, in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation. Watch the blood pressure, especially with ascites.',
        ask: ['Why does carvedilol lower HVPG more than propranolol?', 'Its α1 blockade also lowers the vascular resistance inside the liver.'],
      },
      {
        id: 'terli', params: { drugs: { carvedilol: false, terlipressin: true } }, cam: 'portal', labels: ['SMV', 'CONF'], data: 'ladder', key: ['pv'], tiles: ['hvpg', 'pvFlow'], delta: 'target',
        kicker: 'Acute variceal bleeding', site: 'sin', title: 'Terlipressin',
        line: 'A vasopressin analogue that clamps the splanchnic arterioles. It is started as soon as a variceal bleed is suspected.',
        notes: 'Suspected variceal bleeding: a vasoactive drug at once (terlipressin, somatostatin or octreotide), continued for 2 to 5 days; antibiotics (ceftriaxone); restrictive transfusion, aiming for a hemoglobin of 7 to 8 g/dL, because over-transfusion raises portal pressure; endoscopy with banding within 12 hours. Pre-emptive TIPS within 72 hours for patients at high risk: Child–Pugh C below 14 points, or B above 7 with active bleeding. Terlipressin can cause ischemia and hyponatremia.',
        ask: ['Why transfuse only to a hemoglobin of 7 to 8 g/dL in a variceal bleed?', 'Extra blood volume raises portal pressure and the risk of rebleeding.'],
      },
      {
        id: 'band', params: { drugs: { terlipressin: false } }, action: [{ kind: 'band' }, { kind: 'band' }, { kind: 'band' }], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices' },
        data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'target',
        kicker: 'Endoscopy', site: 'sin', title: 'Band ligation',
        line: 'Ligated varices thrombose and shrink. HVPG is unchanged or slightly higher, so varices can recur.',
        notes: 'Band ligation is repeated every 2 to 4 weeks until the varices are gone, followed by surveillance endoscopy. It stops an acute bleed and prevents rebleeding, but it does nothing for the portal pressure: the collateral closes, its flow is redirected and the pressure can rise slightly, so varices come back. After a bleed, banding is combined with a non-selective beta-blocker.',
        ask: ['Why combine banding with a beta-blocker after a bleed?', 'Banding removes the varices, not the high pressure that makes new ones; the beta-blocker lowers it.'],
      },
      {
        id: 'tips', params: { tips: { on: true } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent' }, data: 'ladder', key: ['pv', 'ppg'], tiles: ['ppg', 'varix'], delta: 'target',
        kicker: 'Shunt', site: 'sin', title: 'TIPS',
        line: 'A covered stent from a hepatic vein to the portal vein. Portal blood bypasses the sinusoids, and the PPG falls below 12 mmHg.',
        notes: 'Transjugular intrahepatic portosystemic shunt: from the jugular vein, a needle is passed from the right hepatic vein through the liver into the right portal vein, and the tract is lined with a covered stent, usually 8 mm wide. The portal pressure gradient is measured before and after; for bleeding the aim is below 12 mmHg. Indications: pre-emptive TIPS in high-risk variceal bleeding, rescue when bleeding cannot be controlled, recurrent bleeding, and recurrent or refractory ascites.',
        ask: ['What portal pressure gradient is the aim after TIPS for bleeding?', 'Below 12 mmHg.'],
      },
      {
        id: 'after', days: 60, lapse: { seconds: 7 }, cam: 'fit', data: 'tiles', tiles: ['asc', 'sin', 'ppg'], key: ['asc'], delta: 'target',
        kicker: 'After TIPS', site: 'sin', title: 'Ascites after TIPS',
        line: 'With the sinusoids decompressed, less lymph is made and the kidneys let go of sodium. The PPG stays below 12 mmHg.',
        notes: 'In patients the ascites usually resolves over weeks to months after TIPS, with diuretics continued at first; the model clears it faster. Sodium excretion and kidney function improve as the effective blood volume recovers. In selected patients with recurrent ascites, TIPS improves survival compared with repeated paracentesis. The spleen may shrink a little, but low platelets often persist. The tiles compare with the patient before treatment.',
        ask: ['Name two benefits of TIPS besides stopping a bleed.', 'The ascites clears as the kidneys excrete sodium again, and the low gradient keeps varices from rebleeding.'],
      },
      {
        id: 'cost', cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent' }, data: 'tiles', tiles: ['liver', 'shunt'], delta: 'target',
        kicker: 'After TIPS', site: 'sin', title: 'Liver perfusion and encephalopathy',
        line: 'Less portal blood reaches the sinusoids, liver perfusion falls and gut-derived toxins enter the systemic circulation. Encephalopathy develops in about a third.',
        notes: 'After TIPS, overt hepatic encephalopathy develops in about a third of patients, mostly in the first months; older age, earlier encephalopathy and a wider stent raise the risk, and an 8 mm covered stent lowers it. The heart receives more venous return and the liver less portal blood, so TIPS is avoided in heart failure, severe pulmonary hypertension, advanced liver failure (a high MELD) and recurrent encephalopathy. Lactulose and rifaximin treat encephalopathy; the shunt can be narrowed if it persists.',
        ask: ['Name two contraindications to TIPS.', 'Heart failure or severe pulmonary hypertension; advanced liver failure (high MELD); recurrent severe encephalopathy.'],
      },
      {
        id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'varix', 'asc', 'liver'], fine: true, asc: false, vs: 'first', rowHead: 'Treatment',
        of: [{ id: 'target', kicker: 'Baseline', title: 'Decompensated cirrhosis' }, 'prop', 'carv', { id: 'terli', kicker: 'Vasoactive drug' }, { id: 'band', title: 'Banding' }, { id: 'tips', title: 'TIPS' }, { id: 'after', kicker: 'Shunt', title: 'TIPS, 60 days on' }],
        kicker: 'Summary', title: 'Treatments compared',
        foot: 'From the model, each drug given alone, against the decompensated baseline (its numbers: pressures in mmHg, varix in mm, ascites in litres, liver blood flow in % of normal): ↑ higher, ↓ lower, doubled for 40% or more; • unchanged. Shaded: abnormal. Hover or tap a cell for its value. Pick a row to go back to it.',
        notes: 'Drugs cut the inflow (propranolol, terlipressin) or the resistance as well (carvedilol). Banding eradicates varices without lowering portal pressure. TIPS lowers the gradient most and clears the ascites, at the price of the liver\'s portal blood and a risk of encephalopathy. In practice they combine: a beta-blocker with banding after a bleed; terlipressin, banding and, for those at high risk, pre-emptive TIPS in an acute bleed.',
        ask: ['Which treatment lowers the portal pressure gradient most, and what does it cost?', 'TIPS: less blood for the liver and a risk of encephalopathy.'],
      },
    ],
  },
];
