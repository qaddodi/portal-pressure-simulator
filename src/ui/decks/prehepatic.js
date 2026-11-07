// Presenter talk: a clot in the portal vein, first in a patient with a normal liver and then in cirrhosis, from the scan that
// finds it to months of anticoagulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const PREHEPATIC = {
  id: 'prehepatic', level: 'core', title: 'Portal vein clots', minutes: 10,
  sections: [['The clot without cirrhosis', ['Acute thrombosis', 'Months later']], ['The clot in cirrhosis', ['Clot in cirrhosis', 'Before anticoagulation']], ['Anticoagulation in cirrhosis', ['Anticoagulation']]],
  objectives: [
    'Recognize acute portal vein thrombosis on Doppler',
    'Explain why the HVPG is normal and the PPG is high',
    'Describe a cavernoma and its varices with a soft liver',
    'Start anticoagulation in cirrhosis after variceal prophylaxis, without delay',
  ],
  checks: [
    ['Why is the HVPG normal with a portal vein clot?', 'The clot is before the liver. The wedge reads the normal sinusoids beyond it.'],
    ['Which measurement shows the resistance?', 'The PPG, portal vein minus IVC.'],
    ['What comes before anticoagulation in cirrhosis?', 'Variceal bleeding prophylaxis, carvedilol if tolerated, without letting it delay the anticoagulant.'],
    ['After six months of anticoagulation the PPG falls from 27 to 4 mmHg and the HVPG stays at 2. What moved?', 'The clot cleared, so the resistance in the portal vein, before the liver, fell. The sinusoids never carried it, so the HVPG did not change.'],
  ],
  summary: 'A clot before the liver: the acute clot on Doppler, the normal HVPG and high PPG, the cavernoma months later, and a partial clot in cirrhosis from the scan to six months of anticoagulation.',
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], terms: { 'portal pressure': 'pv', 'superior mesenteric vein': 'smv' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, step: 0.05, ends: ['None', 'Occlusive'] },
      kicker: 'Acute thrombosis', site: 'pre', title: 'An acute clot stops portal flow on Doppler',
      vignette: 'A 39-year-old woman with factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. Her liver tests and platelets are normal.',
      caseQ: 'Will her HVPG be raised?',
      line: 'Portal pressure rises steeply behind the clot; contrast CT confirms it and shows whether it reaches the superior mesenteric vein, where bowel ischemia is the danger.',
      notes: 'Acute portal vein thrombosis presents with abdominal pain, sometimes fever, or is found on a scan. Look for a cause: a myeloproliferative neoplasm (test for JAK2), an inherited thrombophilia, local inflammation (pancreatitis, appendicitis, diverticulitis), abdominal surgery or cirrhosis. Contrast CT confirms the clot and shows whether it reaches the superior mesenteric vein, where bowel ischemia is the danger: persistent pain, bloody diarrhea, a rising lactate or organ failure mean urgent CT and surgical review. Without cirrhosis, anticoagulation starts at once and continues for at least six months; the earlier it starts, the more often the vein reopens.',
      ask: ['What does Doppler show in an acute portal vein clot?', 'No flow in the trunk; a fresh clot can be nearly anechoic, so the missing color signal matters more than the gray scale.'],
    },
    {
      // (The grade of the clot from the lumen left, Baveno VIII 9.3. The acute clot of the model fills the vein, so the remnant lumen is 0%: a case fact the chart
      // is given, not a model reading. tool-path.js.)
      id: 'path-pvtocc', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], glow: ['PV_TRUNK'],
      tool: { kind: 'path', of: 'pvtocc', short: 'Occlusion grade', patient: { rl: 0 } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'CT grades the clot by the lumen left',
      line: 'On CT the clot is graded by the lumen left in the vein. Here none is left, a complete occlusion; a remnant lumen {>=50%} would be minimal.',
      notes: 'Doppler suggests the clot and multiphase CT confirms it (Baveno VIII 9.2). By the VALDIG portal vein thrombosis criteria the degree of occlusion is then the percentage of remnant portal lumen (RL) against the vein\'s largest diameter, read on CT or MRI in the portal venous phase, in a plane strictly perpendicular to the main portal vein (9.3). Minimal occlusion is an RL of 50% or more, partial occlusion an RL under 50% but not 0%, and complete occlusion an RL of 0%. The acute clot of this patient fills the vein in the model, so no lumen is left and the occlusion is complete; the percentage is the scan\'s reading, which the model does not draw. Drag Clot size on the previous slide to see the Doppler change as the lumen narrows.',
      ask: ['A CT shows a portal vein with 40% of its lumen left. How is the occlusion graded?', 'Partial: the remnant lumen is <50% but not 0%. Minimal is ≥50%; complete is 0%.'],
    },
    {
      id: 'cath', cath: 'result', tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'Acute thrombosis', site: 'pre', title: 'HVPG is normal with a portal vein clot',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
      line: 'The clot is before the liver, so the wedged and free pressures stay normal and the HVPG is {hvpg}, while the PPG of {ppg} shows the resistance.',
      notes: 'The wedged catheter reads the sinusoids, which sit downstream of the clot, so the HVPG is normal however high the portal vein pressure. The PPG compares the portal vein itself with the IVC and catches the resistance; it needs a direct portal vein reading (transhepatic, at TIPS, or by EUS). In practice the diagnosis is made on imaging, and the catheter is rarely needed. A normal HVPG with varices is the clue that the resistance is not in the sinusoids.',
      ask: ['Varices, a large spleen and an HVPG of 3 mmHg. What does the HVPG tell you?', 'The resistance is not sinusoidal: look before the sinusoids, in the portal vein or the portal tracts.'],
    },
    {
      id: 'anticoag', lens: 'velocity', preset: 'pvt-acute', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', labels: ['CONF'],
      tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'], delta: 'clot',
      compare: [{ label: 'Anticoagulation', own: true }, { label: 'No anticoagulation', short: 'None', preset: 'pvt-acute', params: {}, days: 180 }],
      kicker: 'Acute thrombosis', site: 'pre', title: 'Early anticoagulation can reopen the portal vein',
      line: 'Anticoagulation starts at once and continues for ≥6 months; here, as in about 4 in 10 patients, the vein reopens, flow returns and the PPG falls to {ppg}.',
      notes: 'In recent portal vein thrombosis without cirrhosis, EASL 2025 starts anticoagulation as soon as possible, because early treatment lowers the risk of bowel ischemia and makes recanalization more likely, and continues it for at least six months. The workup for a thrombophilia should not delay it. In a European prospective study the portal vein reopened in 39% of treated patients (about 4 in 10), the splenic vein in 80% and the superior mesenteric vein in 73%; ascites and a clotted splenic vein made recanalization less likely. In the model the clot clears completely over six months; with no treatment it stays, and within six months the varices grow, the spleen enlarges and the platelets fall, the cavernoma of the next slide.',
      ask: ['How long is anticoagulation continued for a recent portal vein clot without cirrhosis?', '≥6 months, started as soon as possible; long term when a permanent prothrombotic risk factor remains.'],
    },
    {
      // (Six months on from the anticoagulation slide, the vein open: the chart of how long to treat a recent clot, Baveno VIII 9.6 to 9.10. Her factor V Leiden is a
      // permanent risk factor and the contraceptive, a reversible one, is stopped: case facts, not the model's. tool-path.js.)
      id: 'path-pvtdur', lens: 'velocity', cam: 'portal', labels: ['CONF'],
      tool: { kind: 'path', of: 'pvtdur', short: 'How long', patient: { at: '6', rec: true, rev: true, perm: true, ext: false } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'After six months, her risk factors decide',
      line: 'Treatment began at once and ran ≥6 months. With the vein open, whether to go on depends on her risk factors, not on the scan.',
      notes: 'Baveno VIII advises anticoagulation at once, at a therapeutic dose, for a recent portal vein clot without cirrhosis (9.6), and a search for intestinal ischemia when the clot has reached the superior mesenteric vein (9.7). Treatment lasts at least 6 months (9.8, strong). Stopping may be considered, as a weak recommendation, only when the vein is fully open at 3 months, the reversible risk factor has resolved and there is no permanent one. This patient has factor V Leiden, a permanent factor, so that exit is closed and she is treated for the 6 months. If the clot had reached the superior mesenteric or splenic vein and the vein were still blocked at 6 months, full-dose treatment may continue for 6 more months, because late recanalization can still happen (9.9, weak). Here the vein is open at 6 months, so the next step is the long-term plan, which depends on the type of risk factor (9.10): the grid on the next slide. Recanalization, the permanent factor and the reversible one are the case\'s own facts; the model supplies only the reopened vein.',
      ask: ['At 3 months the vein is fully open and the oral contraceptive is stopped, but she carries factor V Leiden. Can anticoagulation be stopped?', 'No. Stopping is considered only with no permanent risk factor. She completes ≥6 months, then the long-term plan is set by her risk factors.'],
    },
    {
      // (Fig. 5 of Baveno VIII, lit for the same patient: a reversible factor (the contraceptive) and a permanent major one (factor V Leiden). Case facts. tool-path.js.)
      id: 'path-pvtgrid', lens: 'velocity', cam: 'portal', labels: ['CONF'],
      tool: { kind: 'path', of: 'pvtgrid', short: 'Long-term grid', patient: { r: 'yes', c: 'maj' } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'A permanent major factor means long-term anticoagulation',
      line: 'Her contraceptive was reversible, but factor V Leiden is a permanent, major risk factor. In that column the answer is full-dose anticoagulation, long term.',
      notes: 'This is Fig. 5 of Baveno VIII, for a portal vein clot without cirrhosis. Two questions place the patient in one cell: was the clot provoked, by a reversible risk factor in the last 3 months, and is there a permanent risk factor, and if so is it major? Thrombophilia and myeloproliferative neoplasm are the examples of major permanent factors the guideline gives (9.5); the supplement (Table S4) lists the factors. A permanent major factor calls for long-term anticoagulation at a therapeutic dose (9.10a, strong). Without one, long-term DOACs at a lower dose can be considered (9.10b, weak). After complete resolution of a reversible factor and with no permanent factor, stopping can be considered (9.10c, weak). In the figure the cells are blue for a low risk of recurrence, grey for an intermediate or undetermined risk and red for a high risk. This patient\'s oral contraceptive was a reversible factor, but factor V Leiden is permanent, so she sits in the red cell whether or not the clot was provoked.',
      ask: ['A clot with no reversible factor and no permanent factor found. What does Fig. 5 offer?', 'A lower-dose DOAC can be considered for the long term (weak recommendation). Stopping is considered only after a reversible factor has resolved.'],
    },
    {
      id: 'cavernoma', lens: 'velocity', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'], delta: 'clot',
      kicker: 'Months later', site: 'pre', title: 'Without recanalization, collaterals grow around the clot',
      line: 'A cavernoma, a web of small collaterals, grows around the clotted vein and carries the blood the trunk cannot. Varices form.',
      notes: 'Cavernous transformation is a web of collaterals around the occluded portal vein, seen within weeks to months. It does not carry enough blood to bring the portal pressure down, so varices, a large spleen and low platelets follow. Screen for varices with endoscopy and treat them as in cirrhosis: a non-selective beta-blocker or banding. Long-term anticoagulation is advised when a thrombophilia persists. Large collaterals around the bile duct can narrow it (portal cholangiopathy). In children the clot often follows umbilical vein catheterization or sepsis in infancy.',
      ask: ['A child bleeds from varices with normal liver tests. What is the likely cause?', 'Chronic portal vein thrombosis with a cavernoma: varices with a normal liver point to resistance before the sinusoids.'],
    },
    {
      id: 'liver', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ssm'], key: ['lsm', 'ssm'], delta: false,
      kicker: 'Months later', site: 'pre', title: 'The liver itself is normal',
      line: 'Stiffness is {lsm} and the HVPG normal, yet the spleen stiffness is {ssm}: varices with a soft liver point to resistance before the sinusoids.',
      notes: 'The liver tissue is spared, so the stiffness, albumin and clotting are usually normal and the patient rarely decompensates. A soft liver with varices and a large spleen means pre-hepatic or presinusoidal disease: portal vein thrombosis, schistosomiasis or porto-sinusoidal vascular disorder. Doppler or CT tells the first from the others. Spleen stiffness stays high, because it follows the portal vein pressure.',
      ask: ['Varices, platelets of 70 and a stiffness of 5 kPa. What two causes do you consider first?', 'Portal vein thrombosis and presinusoidal resistance such as schistosomiasis.'],
    },
    {
      id: 'base', tick: 'Before the clot', preset: 'csph', cam: 'portal', terms: ['pv'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      kicker: 'Clot in cirrhosis', site: 'sin', title: 'Cirrhosis sets the stage for a portal vein clot',
      vignette: 'A 61-year-old man with hepatitis C cirrhosis, cured 3 years ago, comes for his six-monthly liver cancer surveillance ultrasound. His platelets are 88,000/µL.',
      line: 'Cirrhosis with CSPH, portal pressure {pv}: slower portal vein flow raises the local risk of a clot, most when it falls <15 cm/s, and a high INR does not protect.',
      causesHead: 'Risk of a clot', causes: ['Slow portal flow', 'More advanced liver disease', 'Abdominal surgery, splenectomy above all'],
      notes: 'Portal vein thrombosis becomes more common as cirrhosis advances, and slow portal flow is the strongest local factor. The INR measures only the fall in clotting factors; the liver also makes less protein C and antithrombin, so hemostasis is rebalanced and a high INR does not protect. Abdominal surgery, splenectomy above all, adds to the risk. Many clots are partial and found on a routine scan.',
      ask: ['Does a high INR protect a patient with cirrhosis from portal vein thrombosis?', 'No: the anticoagulant proteins fall too, so clotting is rebalanced.'],
    },
    {
      id: 'gradients', question: 'Will a partial portal vein clot raise the HVPG, the PPG or both?', tick: 'Partial clot', params: { thrombus: { PV_TRUNK: 0.6 } }, cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], mark: { edges: ['PV_TRUNK'], clot: true }, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'], delta: 'base',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
      kicker: 'Clot in cirrhosis', site: 'pre', title: 'HVPG stays flat while PPG rises',
      line: 'A clot fills over half of the vein. The wedge reads the sinusoids beyond it, so the HVPG stays near {hvpg}; the model\'s PPG rises to {ppg}, more than usual.',
      notes: 'On ultrasound the clot is echogenic material in the vein, with color flow around it and a faster jet through the narrowing; an occlusive clot shows no flow at all. Contrast CT or MR comes next: first to rule out tumor thrombus from a liver cancer, which enhances in the arterial phase and expands the vein, then to show how far it extends into the splenic and superior mesenteric veins, which guides treatment. In cirrhosis the HVPG measures the sinusoidal part of the resistance. A clot adds a second site of resistance before the liver, which only a direct portal pressure shows, so the HVPG underestimates the portal pressure and a TIPS gradient is taken from the portal vein itself. Colored by pressure drop, a second large drop would appear at the clot. The varices enlarge as the pressure behind the clot rises.',
      ask: ['A patient with cirrhosis has a partial portal vein clot and an HVPG that has not changed. Does that rule the clot out?', 'No: the clot is before the sinusoids, so the HVPG cannot show it. The PPG, from a direct portal reading, does.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', params: { drugs: { carvedilol: true } }, ripple: true, cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'hr'], key: ['pv'], delta: true,
      kicker: 'Before anticoagulation', site: 'sin', title: 'Carvedilol, then anticoagulation without delay',
      line: 'Carvedilol lowers the portal pressure to {pv} and protects against a first bleed, so anticoagulation starts without waiting for a course of banding.',
      notes: 'EASL 2025 asks for proper variceal prophylaxis before anticoagulation, but not at the cost of delay, because the vein reopens more often when anticoagulation starts early. In cirrhosis with clinically significant portal hypertension, Baveno VIII recommends a non-selective beta-blocker, preferably carvedilol, whatever the varices, and a patient who takes one needs no screening endoscopy. Carvedilol treats the portal hypertension and needs no endoscopy to start. Banding, for a patient who cannot take a beta-blocker, takes several sessions and leaves ulcers that can bleed on an anticoagulant. For the anticoagulant, low molecular weight heparin or a vitamin K antagonist can be used, and a direct oral anticoagulant in Child–Pugh A, with caution in B, and not in C.',
      ask: ['Which variceal prophylaxis suits a patient about to start anticoagulation?', 'Carvedilol, if tolerated: it treats the portal hypertension, and banding ulcers could bleed on the anticoagulant.'],
    },
    {
      id: 'pvt-anticoag', lens: 'velocity', tick: 'Anticoagulation', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', terms: ['pv'],
      tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'], delta: 'gradients',
      kicker: 'Anticoagulation', site: 'sin', title: 'Months of anticoagulation reopen the vein',
      line: 'About 7 in 10 clots in cirrhosis recanalize on anticoagulation; here the portal vein reopens over six months and its pressure falls to {pv}, faster than in patients.',
      notes: 'About 7 in 10 patients with cirrhosis recanalize on anticoagulation (EASL 2025). Baveno VIII advises anticoagulation for transplant candidates with any portal vein clot, and considers it for a recent partial or complete clot of the main portal vein and for any clot that causes symptoms. The vein reopens in many patients, more often when treatment starts early. It continues for at least six months, and until transplant in candidates; the clot can recur after it stops. Without treatment many partial clots clear too, and whether a partial clot worsens the outlook is uncertain.',
      ask: ['What makes it more likely that anticoagulation reopens the portal vein?', 'Starting it early, soon after the clot forms.'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', since: 'base', title: 'The course on one chart', bands: ['carvedilol', 'anticoag'], gap: 'clot' },
      kicker: 'Anticoagulation', site: 'sin', title: 'Portal pressure followed the clot while HVPG stayed flat',
      line: 'The gap between the portal and wedged pressure lines is the clot, and recanalization is checked by imaging about every three months, not by the HVPG.',
      notes: 'The chart plots the portal, wedged and free pressures and the HVPG at each step. The gap that opens between the portal and the wedged lines is the clot. Recanalization is followed by imaging, Doppler or CT about every three months, not by the HVPG.',
      ask: ['How is recanalization checked during anticoagulation?', 'By repeat imaging, Doppler or CT, about every three months.'],
    },
    {
      // (The relation chart before the summary: a healthy liver as a clot fills more of the portal vein, the PPG and the HVPG on one
      // scale. The ring is the acute clot of the first slide, the vein closed.)
      id: 'relation', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], clot: true },
      tool: { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, xCuts: [50], patient: { preset: 'healthy' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.05, lines: ['ppg', 'hvpg'], oneScale: true },
      kicker: 'Summary', site: 'pre', title: 'The clot raises the PPG, never the HVPG',
      line: 'Once the clot fills more than half the vein, the PPG climbs steeply, to {ppg} when the vein is closed. The HVPG stays near {hvpg} all the way.',
      notes: 'Each point is a healthy liver with the clot filling more of the portal vein, the PPG and the HVPG on the same scale. Below half the lumen the gradient barely moves; above it the narrowing takes most of the pressure, and a closed vein raises the PPG about sixfold. The HVPG stays flat because the wedged catheter reads the sinusoids, beyond the clot. Baveno VIII separates a recent partial clot that leaves less than half the lumen open, or a complete one, from a minor one (9.19). EASL 2025: the HVPG does not reflect the portal hypertension of portal vein thrombosis. The model has no collaterals yet at this point, as in a recent clot. (Baveno VIII 9.19; EASL 2025, vascular liver diseases.)',
      ask: ['A patient with a portal vein clot has an HVPG of 3 mmHg. Does that rule out portal hypertension?', 'No. The clot sits before the sinusoids, so the wedged catheter does not see the pressure behind it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt', 'wave'], wave: 'PV_TRUNK', asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'No cirrhosis', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'No cirrhosis', title: 'Cavernoma' },
        { id: 'base', kicker: 'Cirrhosis', title: 'Before the clot' }, { id: 'gradients', kicker: 'Cirrhosis', title: 'Partial clot' }, { id: 'pvt-anticoag', kicker: 'Cirrhosis', title: 'Six months on' }],
      kicker: 'Summary', title: 'The clot raises the PPG, not the HVPG',
      line: 'The clot is before the liver, so the HVPG barely moves; the PPG rises when the portal vein itself carries the resistance.',
      notes: 'A clot before the liver raises the pressure upstream of it and leaves the sinusoids alone: the HVPG does not show it, the stiffness is normal without cirrhosis and the liver works. In cirrhosis the clot adds to the sinusoidal resistance without changing what the wedge reads. Look for it on every surveillance scan, protect the varices, treat the clot with early anticoagulation, and the varices as in cirrhosis.',
      ask: ['A clot in the portal vein of a normal liver: which reading stays normal?', 'The HVPG, because the sinusoids are downstream of the clot. In cirrhosis the clot adds to the PPG, not the HVPG.'],
    },
  ],
};
