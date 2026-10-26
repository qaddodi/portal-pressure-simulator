// Presenter talk: sites and causes of portal hypertension (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const HVPG_EQ = mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>';
// (The six-case grid's first row holds the site and the cause on one line, 12 px or more: sinusoidal obstruction syndrome is `name`d short there, in full
// on its own slide, the table and every other line.)
const SIX = ['pvt', 'presin', 'sin', { id: 'postsin', name: 'Sinusoidal obstr. synd.' }, 'post', 'cardiac'];   // the six levels of portal hypertension, one patient each
const PROFILE = { kind: 'profile' };   // the pressure from gut to heart, in place of the ladders

export const SITES = {
  id: 'sites', level: 'core', title: 'Sites and causes of portal hypertension', minutes: 15,
  summary: 'Six levels of resistance, each with its pressure profile from gut to heart and its HVPG. Ends with a comparison table.',
  sections: [['Portal hypertension', ['Portal hypertension', 'Reference']], ['Before the liver', ['Pre-hepatic']], ['In the liver', ['Intrahepatic · presinusoidal', 'Intrahepatic · sinusoidal', 'Intrahepatic · postsinusoidal']], ['After the liver', ['Post-hepatic', 'Cardiac']], ['Telling them apart', ['How to tell them apart']]],
  objectives: ['Place a cause of portal hypertension at one of six levels', 'Predict the HVPG for resistance at each level', 'Read a pressure profile to find where the largest drop is'],
  checks: [
    ['Portal vein thrombosis raises the portal pressure. What happens to the HVPG?', 'It stays normal. The catheter wedges beyond the clot, in normal sinusoids.'],
    ['Cirrhosis raises the portal pressure. Does the HVPG rise too?', 'Yes. The resistance is in the sinusoids, and the wedged pressure reads the sinusoids.'],
    ['Right heart failure and cirrhosis both raise the portal pressure. Which readings tell them apart?', 'In right heart failure the right atrial pressure is high and the HVPG is normal. In cirrhosis the right atrial pressure is normal and the HVPG is high.'],
  ],
  slides: [
    {
      id: 'overview', preset: 'healthy', lens: 'system', cam: 'fit', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], rail: 'all',
      glow: [['V_INT', 'V_SPL', 'V_IMV'], ['PVH_R', 'PVH_L'], ['SIN_RR', 'SIN_LL'], ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], 'IVCS_RA'], glowSeq: 550, steps: true,   // (1: the gut and spleen's veins; 2: the portal vein into both lobes; 3: both lobes' sinusoids; 4: the three hepatic veins)
      kicker: 'Portal hypertension', title: 'Portal hypertension is named for the site of resistance',
      line: 'Blood runs from the gut {#1} through the portal veins {#2} and the liver\'s sinusoids {#3} to the systemic veins {#4} and the heart {#5}. Resistance at any point raises the pressure upstream of it.',
      notes: 'The figure is colored by vein system: portal veins in one colour, systemic veins in another, collaterals and shunts in a third. The numbers light in turn along the route: the veins of the gut and spleen (the SMV, splenic vein and IMV), the portal vein into both lobes, the sinusoids of both lobes, the three hepatic veins, and the IVC to the heart. Portal hypertension is named for the level of resistance. Two levels lie before the sinusoids (pre-hepatic and presinusoidal), one is the sinusoids themselves, and three come after them (postsinusoidal, post-hepatic and cardiac). The level decides which pressures rise, what HVPG shows, whether varices form and whether ascites follows. Portal hypertension is a portal pressure gradient above 5 mmHg; 10 mmHg or more is clinically significant.',
      ask: ['Name one cause of portal hypertension at each level.', 'Portal vein thrombosis; schistosomiasis; cirrhosis; sinusoidal obstruction syndrome; Budd–Chiari syndrome; right heart failure.'],
    },
    {
      id: 'healthy', lens: 'drop', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], tool: PROFILE, data: 'tiles', tiles: ['whvp', 'fhvp', 'hvpg'], key: ['hvpg'],
      kicker: 'Reference', title: 'In a healthy liver each pressure drop is small',
      eq: [HVPG_EQ],
      line: 'HVPG is wedged [sinusoidal pressure](sin) minus free [hepatic vein](fhvp) pressure, normally 1 to 5 mmHg, {hvpg} here. Colored by pressure drop, veins from [portal vein](pv) to [right atrium](ra) stay pale.',
      notes: 'The wedged hepatic venous pressure (WHVP) is taken with a balloon catheter wedged in a hepatic vein: with the flow stopped, the still column of blood reads the sinusoidal pressure. The free hepatic venous pressure (FHVP) is taken with the balloon down. HVPG = WHVP − FHVP. Normal is 1 to 5 mmHg; above 5 is portal hypertension; from 10, clinically significant portal hypertension, varices and decompensation become possible, and the risk rises with the gradient; from about 12 the risk of variceal bleeding rises. The portal pressure gradient (PPG) is the portal vein minus the IVC, measured directly. The profile in the data card runs from the gut to the right atrium: the HVPG bracket under the names runs from the sinusoids, which the wedge reads, to the hepatic vein.',
      ask: ['What does the wedged pressure measure?', 'The sinusoidal pressure: with the vein occluded, the still column of blood reads the pressure upstream.'],
    },
    {
      id: 'pvt', lens: 'drop', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF', 'SV'], terms: { 'portal pressure': 'pv', 'wedged pressure': 'whvp' }, mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      tool: PROFILE, key: ['hvpg', 'ppg'],
      kicker: 'Pre-hepatic', site: 'pre', title: 'Portal vein thrombosis',
      vignette: 'A 38-year-old man with a JAK2-positive myeloproliferative neoplasm has splenomegaly and small esophageal varices on EGD. His liver tests are normal, and there is no ascites.',
      line: 'Portal pressure is high, yet the wedged pressure and HVPG are normal: the catheter wedges downstream of the clot. Colored by pressure drop, the clotted portal vein stands out.',
      notes: 'Chronic thrombosis turns the portal vein into a cavernoma: a web of small collaterals around the occluded trunk that still carries portal blood to the liver. The liver itself is normal, so its function is preserved and ascites is uncommon, while varices and a large spleen are common. Doppler ultrasound or CT shows the clot or the cavernoma. HVPG is normal because the wedged catheter reads the sinusoids, downstream of the clot; the portal pressure gradient (PPG) is high. On the profile the fall comes between the gut and the portal venules, before the sinusoids the wedge reads. The usual causes are cirrhosis, a myeloproliferative neoplasm or another thrombophilia, pancreatitis or abdominal sepsis, and liver or pancreatic cancer.',
      ask: ['Why is HVPG normal when the portal pressure is about 20 mmHg?', 'The wedge reads the sinusoids, which lie downstream of the clot and are at normal pressure.'],
    },
    {
      id: 'presin', lens: 'drop', terms: { 'portal venules': 'lobule:triad', sinusoids: 'lobule:sinusoid' }, preset: 'schisto', cam: 'lobule:triad', tool: PROFILE, key: ['pv', 'hvpg', 'ppg'], callout: { at: 'triad', label: 'Resistance' },
      kicker: 'Intrahepatic · presinusoidal', site: 'presin', title: 'Schistosomiasis',
      vignette: 'A 26-year-old man who grew up in the Nile Delta presents with hematemesis. EGD shows large esophageal varices. His spleen is enlarged, his liver tests are normal, and there is no ascites.',
      line: 'Eggs lodge in the portal venules and cause fibrosis upstream of the sinusoids, so the HVPG stays near normal. Colored by pressure drop, the portal venules stand out.',
      notes: 'Schistosoma mansoni and japonicum eggs reach the presinusoidal portal venules, where granulomas form and periportal (Symmers) fibrosis follows. The sinusoids and liver cells are spared: liver function is preserved, ascites is rare and liver stiffness is near normal. The portal vein is open on imaging, which separates it from a portal vein clot. HVPG is normal or mildly raised and underestimates the portal pressure. On the profile the fall comes between the portal venules and the sinusoids, still before the sinusoids the wedge reads. The same picture comes from porto-sinusoidal vascular disorder, early primary biliary cholangitis, sarcoidosis and congenital hepatic fibrosis.',
      ask: ['A patient bleeds from varices. Doppler shows an open portal vein; the HVPG is 3 mmHg and the free hepatic and right atrial pressures are normal. Where does the resistance lie?', 'Presinusoidal, in the portal tracts (schistosomiasis or porto-sinusoidal vascular disorder): the wedge reads normal sinusoids, and the normal free and atrial pressures rule out an outflow or cardiac cause.'],
    },
    {
      id: 'sin', lens: 'drop', terms: { sinusoids: 'lobule:sinusoid' }, preset: 'cirr-decomp', cam: 'lobule:sinusoid', callout: { at: 'sin', label: 'Resistance' }, tool: PROFILE, key: ['whvp', 'hvpg'],
      kicker: 'Intrahepatic · sinusoidal', site: 'sin', title: 'Cirrhosis',
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis has ascites despite spironolactone and furosemide. His albumin is 2.8 g/dL, his platelets are 57,000/µL, and EGD shows large esophageal varices.',
      line: 'Fibrosis, nodules and stellate cell contraction narrow the sinusoids. The wedged pressure reflects sinusoidal pressure, so HVPG rises with portal pressure. Colored by pressure drop, the sinusoids stand out.',
      notes: 'In cirrhosis the resistance is in the sinusoids: fibrosis, regenerative nodules, a capillarized endothelium and contracted stellate cells, the dynamic part that drugs can relax. Splanchnic vasodilation then raises portal inflow and sustains the pressure. The wedged pressure closely tracks the portal pressure, so HVPG estimates the portal gradient: 10 mmHg or more is clinically significant portal hypertension, and the risk of bleeding rises from about 12. In MASLD cirrhosis the wedge can read low, so an HVPG under 10 does not rule out CSPH. On the profile the fall now lies between the sinusoids and the hepatic vein, inside the HVPG bracket. The usual causes are alcohol, fatty liver disease (MASLD), hepatitis B and C, and autoimmune, cholestatic and metabolic disease.',
      ask: ['Why does the wedged pressure track the portal pressure in cirrhosis?', 'The resistance lies in the sinusoids the wedge reads, so the wedged pressure rises with the portal pressure.'],
    },
    {
      id: 'postsin', lens: 'drop', terms: { 'central veins': 'lobule:central', sinusoids: 'lobule:sinusoid' }, preset: 'sos', cam: 'lobule:central', callout: { at: 'cv', label: 'Resistance' }, tool: PROFILE, key: ['whvp', 'hvpg'],
      kicker: 'Intrahepatic · postsinusoidal', site: 'postsin', title: 'Sinusoidal obstruction syndrome',
      vignette: 'A 45-year-old woman, 21 days after myeloablative conditioning for allogeneic HSCT, has tender hepatomegaly, a 4% weight gain and new ascites. Her bilirubin is 2.1 mg/dL.',
      line: 'Damaged endothelium raises resistance in the sinusoids and central veins, upstream of the wedge, so the HVPG rises. Colored by pressure drop, the central veins stand out.',
      notes: 'Formerly veno-occlusive disease. Toxic injury sheds sinusoidal endothelial cells, which raise resistance in the sinusoids and the terminal hepatic venules. It presents within weeks of myeloablative conditioning with tender hepatomegaly, weight gain, ascites and jaundice. An HVPG of 10 mmHg or more, measured with a transjugular biopsy, strongly supports the diagnosis. The model shows an earlier stage, with an HVPG of about 9 mmHg: raised, but under 10. Causes: conditioning for stem cell transplant, oxaliplatin and pyrrolizidine alkaloids (bush teas).',
      ask: ['Why does HVPG rise here but not in schistosomiasis?', 'Here the resistance is in the sinusoids and central veins the wedge reads; in schistosomiasis it is in the portal tracts, upstream of them.'],
    },
    {
      id: 'post', lens: 'drop', preset: 'budd-chiari', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true },
      tool: PROFILE, key: ['fhvp', 'ra', 'hvpg'],
      kicker: 'Post-hepatic', site: 'post', title: 'Budd–Chiari syndrome',
      vignette: 'A 29-year-old woman taking OCPs has had RUQ pain for 2 months and now has tense ascites. Paracentesis shows a SAAG of 1.4 and a total protein of 4.3 g/dL.',
      line: 'Where a catheter gets behind the clotted veins, the wedged and free pressures are both high, so the HVPG is near zero while the [right atrium](ra) stays at {ra}.',
      notes: 'Hepatic venous outflow obstruction, anywhere from the small hepatic veins to the IVC at the right atrium. The liver is congested and enlarged; the caudate lobe, which drains straight into the IVC, hypertrophies. Ascites is common, protein-rich (2.5 g/dL or more) and with a SAAG of 1.1 or more. In practice the clotted veins often cannot be catheterized; when one can be entered, both readings lie behind the resistance. The model shows the pressures there. Doppler ultrasound, CT or MR venography make the diagnosis. On the profile the fall comes after the hepatic vein, between it and the IVC, outside the HVPG bracket. Colored by pressure drop, the clotted veins stand out. Causes: a myeloproliferative neoplasm (JAK2), thrombophilia, pregnancy or OCP use, an IVC web, and tumor invading the veins.',
      ask: ['Why is HVPG near zero although the portal pressure is about 26 mmHg?', 'Where the catheter reaches behind the resistance, both the wedged and the free pressures are measured there, so both are high and their difference is small.'],
    },
    {
      id: 'cardiac', lens: 'drop', terms: ['hv', 'sin'], preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], glow: ['ivc', 'hv'], glowSeq: 550,
      compare: [{ label: 'Normal heart', preset: 'healthy' }, { label: 'Failing heart', own: true }],
      tool: PROFILE, key: ['fhvp', 'hvpg', 'ppg'],
      kicker: 'Cardiac', site: 'cardiac', title: 'Right heart failure',
      vignette: 'A 67-year-old man with severe TR from pulmonary hypertension has a raised JVP, leg edema and ascites. Paracentesis shows a SAAG of 1.4 and a total protein of 4.3 g/dL, and EGD shows no varices.',
      line: 'Raised [right atrial pressure](ra) passes back through the hepatic veins to the sinusoids, so all stations rise together and HVPG stays normal. Colored by pressure drop, no vessel stands out.',
      notes: 'Congestive hepatopathy. The jugular venous pressure is raised, the hepatojugular reflux is positive and Doppler shows a pulsatile portal vein. The ascites is protein-rich with a SAAG of 1.1 or more. Varices are rare: they need a gradient between the portal and the systemic veins, and here both are high, so the PPG is normal. Constrictive pericarditis gives the same pattern with a normal-sized heart. No vessel stands out because the resistance is in the heart. Causes: tricuspid regurgitation, pulmonary hypertension, left heart failure and constrictive pericarditis. Tap Normal heart and the whole profile sinks back to the dashed healthy line.',
      ask: ['Why are varices rare in heart failure despite a portal pressure of about 20 mmHg?', 'Varices need a portal-to-systemic gradient; the systemic veins are high too, so the gradient (PPG) is normal.'],
    },
    {
      id: 'ladders', cam: 'fit', visual: 'ladders', of: SIX, question: 'Which of the six raised the HVPG?',
      kicker: 'How to tell them apart', title: 'The biggest pressure drop shows where the resistance is',
      notes: 'Read each ladder from left to right. Pre-hepatic and presinusoidal: the fall comes before the sinusoids the wedge reads, so HVPG is normal and only a direct portal pressure (or the PPG) shows it. Sinusoidal and postsinusoidal: the fall lies inside the HVPG bracket, exactly what HVPG measures. Post-hepatic: the fall comes after the hepatic vein. Cardiac: there is no fall at all; every station is high.',
      ask: ['Which two levels raise the HVPG?', 'Sinusoidal and postsinusoidal: only there does the resistance lie between the wedge and the free reading.'],
    },
    {
      // (The relation chart before the summary: each site as a point on the HVPG against PPG plane.)
      id: 'relation', cam: 'fit', visual: 'plane', plane: 'hvpg-ppg',
      of: [{ id: 'healthy', name: 'Healthy' }, { id: 'pvt', name: 'Portal vein thrombosis', short: 'PVT' }, { id: 'presin', name: 'Schistosomiasis', short: 'Schisto' },
        { id: 'sin', name: 'Cirrhosis' }, { id: 'postsin', name: 'Sinusoidal obstruction', short: 'SOS' }, { id: 'post', name: 'Budd–Chiari' }, { id: 'cardiac', name: 'Heart failure' }],
      kicker: 'Summary', title: 'Each site sits in its own corner of the two gradients',
      line: 'A clot, schistosomiasis and Budd–Chiari raise the PPG and leave the HVPG normal. Cirrhosis and sinusoidal obstruction raise both. Right heart failure raises neither.',
      notes: 'Each point is one patient from this talk, placed by the HVPG across and the PPG up, with the app\'s cut-offs (HVPG 5 and 10, PPG 6 and 12 mmHg). The HVPG 10 line marks clinically significant portal hypertension (CSPH: an HVPG of 10 mmHg or more, Baveno VIII and AASLD 2024), and the corner beyond both lines is named for it. The PPG 12 line marks the risk of bleeding, and a TIPS aims under it; it is not a CSPH cut-off. Pre-hepatic and presinusoidal resistance lies before the wedge, so the HVPG stays normal while the PPG rises. Sinusoidal and postsinusoidal resistance lies inside the HVPG bracket, so both rise. In Budd–Chiari the hepatic veins cannot be wedged at all; the model\'s HVPG there is a number no catheter takes. In right heart failure every station is high, so neither gradient is. (AASLD 2024 Table 1; Baveno VIII Table 3; EASL 2025: the HVPG misses the portal hypertension of portal vein thrombosis and PSVD.)',
      ask: ['A patient has varices, an HVPG of 3 mmHg and a PPG of 15 mmHg. Which sites fit?', 'Pre-hepatic or presinusoidal (a portal vein clot, schistosomiasis), or Budd–Chiari.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc: true, of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, ...SIX],
      kicker: 'Summary', title: 'HVPG rises only with sinusoidal and postsinusoidal resistance',
      line: 'Portal pressure is high at every site. For the other levels, read the PPG, the free hepatic pressure and the right atrium.',
      notes: 'Portal pressure is high at every level. HVPG is raised only when the resistance lies between the wedge and the free hepatic vein (sinusoidal, postsinusoidal). A SAAG of 1.1 or more confirms portal hypertension as the cause of ascites; the ascites protein then separates cirrhosis (low, under 2.5 g/dL) from hepatic vein and heart disease (high). Pre-hepatic and presinusoidal disease rarely cause ascites, because the sinusoids, where ascites starts, are at normal pressure. The model gives sinusoidal obstruction syndrome a protein-rich ascites; reports in patients vary.',
      ask: ['A patient has ascites with a SAAG of 1.6 and a protein of 4 g/dL before any diuretic. Which levels fit best?', 'Post-hepatic or cardiac (Budd–Chiari, heart failure); sinusoidal obstruction syndrome too.'],
    },
  ],
};
