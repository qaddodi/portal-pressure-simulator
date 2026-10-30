// Presenter talk: gastric varices, from the Sarin classes through the bleed, TIPS and BRTO to the
// clotted splenic vein that a splenectomy cures (carvedilol before a first bleed is in the first slide's notes; Lowering portal pressure teaches the drug) (the slide fields are described at the top of decks.js).

const BEATS = { kind: 'trace', range: 'beats', deltaLabel: 'before the bleed' };

export const GASTRIC = {
  id: 'gastric-varices', level: 'core', title: 'Gastric varices', minutes: 8,
  objectives: [
    'Name the four Sarin classes of gastric varices',
    'Know that fundal varices that have not bled get carvedilol, not glue, BRTO or a TIPS',
    'Explain why a TIPS is preferred after a fundal bleed, and what BRTO does to the portal pressure',
    'Recognize left-sided portal hypertension and treat it at the spleen',
  ],
  checks: [
    ['Which gastric varices are managed like esophageal varices?', 'GOV1, which run down the lesser curve from the esophagus.'],
    ['What is the first treatment for fundal varices that have never bled?', 'A non-selective beta-blocker, preferably carvedilol. Glue, BRTO or a TIPS is not used to prevent a first bleed; glue is kept for high-risk varices when a beta-blocker cannot be taken.'],
    ['After BRTO the fundal varix shrinks, but the PPG rises and esophageal varices grow. Which lever moved?', 'The gastrorenal shunt, an outflow for portal blood, was closed. That blood stays in the portal system, so the pressure rises and the esophageal route opens.'],
    ['Fundal varices, a normal liver and a large spleen: what do you look for, and what treats it?', 'A clotted splenic vein on contrast CT. Splenectomy, a splenic vein stent or splenic artery embolization treats it.'],
  ],
  summary: 'The Sarin classes, carvedilol before a first bleed, glue and TIPS after one, what BRTO does to the portal pressure, and the clotted splenic vein that a splenectomy cures.',
  slides: [
    {
      id: 'classes', preset: 'gastric-varix', cam: 'fundus', terms: ['gv'], data: 'tiles',
      tool: { kind: 'criteria', title: 'Sarin classes', ticks: false, lead: 'Named by where they lie.', rule: 'Baveno VIII 5.38', rows: ['**GOV1**, down the lesser curve', '**GOV2**, toward the fundus', { text: 'IGV1, isolated in the fundus', note: 'Her varix', lit: true },
        '**IGV2**, elsewhere in the stomach'] }, tiles: ['gv', 'varix'], key: ['gv'],
      vignette: 'A 58-year-old woman with cirrhosis from primary biliary cholangitis has a 9 mm fundal varix and no esophageal varices on screening EGD. She has never bled. Her platelets are 63,000/µL.',
      kicker: 'Where they lie', site: 'sin', title: 'Four kinds of gastric varices',
      line: 'Gastric varices are sorted by where they lie and whether they continue from the esophagus. This one, isolated in the fundus (IGV1), measures {gv}; there are no esophageal varices.',
      notes: 'Source: Baveno VIII 5.38; AASLD 2024. Baveno VIII recommends the Sarin classification for every gastric varix, to report them the same way, judge the bleeding risk and choose the treatment. GOV1 run down the lesser curve from the esophagus and are managed like esophageal varices. GOV2 and IGV1 are the cardiofundal varices: they bleed less often than esophageal varices, but when they bleed, treatment fails, rebleeding and death are more common. Gastric varices are commoner in pre-hepatic portal hypertension, above all with a clotted splenic vein, so finding one calls for contrast CT or MRI. Endoscopy in this app stays in the esophagus; the fundal varix is read from its tile. Before a first bleed (Baveno VIII 3.21; AASLD 40 to 42): patients with gastric varices have CSPH and benefit from a non-selective beta-blocker, particularly carvedilol, to prevent decompensation. Local therapy (endoscopic glue, EUS-guided therapy or transvenous obliteration) may be considered for high-risk GOV2 or IGV1 varices only when a beta-blocker cannot be taken, in centers with expertise; there is little evidence for adding it to a beta-blocker. AASLD calls a cardiofundal varix high risk at 10 mm or more, with red wale signs, or in Child–Pugh B or C, and recommends neither TIPS nor BRTO to prevent a first bleed. In the model the varix shrinks with the gradient within seconds; in patients it does not, so this slide shows the pressures.',
      ask: ['Which gastric varices behave like esophageal varices?', 'GOV1, along the lesser curve.'],
    },
    {
      id: 'shunt', lens: 'flow', cam: 'fundus', terms: ['gv', 'lrv'], mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }, tool: { kind: 'flows' }, data: 'tiles', tiles: ['gv', 'liver'], key: ['gv'],
      kicker: 'Where they lie', site: 'sin', title: 'Fundal varices drain through a shunt',
      line: 'Most fundal varices drain through a gastrorenal shunt into the [left renal vein](lrv). Colored by flow, the shunt takes much of the portal blood: the liver gets {liver} of normal.',
      notes: 'Source: AASLD 2024. The short and posterior gastric veins feed the fundal varices, and a spontaneous gastrorenal shunt, often by way of the left inferior phrenic vein, drains them into the left renal vein. AASLD notes that gastric varices form and bleed at a lower portal pressure than esophageal varices, and that this system competes with the portal vein for blood. The wide varix has a high wall stress even at a modest gradient. A large shunt also takes portal blood away from the liver, which raises the risk of encephalopathy. The shunt is the route BRTO uses, later in this talk.',
      ask: ['Into which vein does a gastrorenal shunt drain?', 'The left renal vein.'],
    },
    {
      id: 'bleed', params: { respiration: false, drugs: { carvedilol: true } }, action: { kind: 'rupture', site: 'GV', tear: 0.4 }, cam: 'fundus', mark: { edges: ['C2'], label: 'Bleeding fundal varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      kicker: 'After a bleed', site: 'sin', title: 'A fundal varix bleeds',
      line: 'The first hours follow any variceal bleed: octreotide, ceftriaxone, restrictive transfusion, a scope within 12 hours. Carvedilol blunts the heart rate at {hr} while the blood pressure falls to {map}.',
      notes: 'Source: Baveno VIII 5.39; AASLD 43, 44. Baveno VIII calls a bleed from GOV2 or IGV1 a high-risk event that needs a team: one phase stops the bleeding, the other gives lasting control, and the two start in parallel or as close together as possible. Hold the beta-blocker while the bleed is active. AASLD adds contrast CT or MRI to map the shunts and look for a clot, which guides the choice of treatment. If the first measures fail, a gastric balloon (Linton–Nachlas or the gastric balloon of a Minnesota tube) bridges to definitive treatment. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Why image the abdomen with contrast after a fundal variceal bleed?', 'To map the shunts and look for a clot in the portal or splenic vein; the anatomy decides between TIPS and BRTO.'],
    },
    {
      id: 'tips', preset: 'gastric-varix', params: { tips: { on: true } }, procedure: 'tips', cam: 'liver', terms: ['gv'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'gv', 'liver'], key: ['ppg'], delta: 'classes',
      kicker: 'After a bleed', site: 'sin', title: 'Glue stops the bleeding, a TIPS keeps it stopped',
      line: 'Glue, or EUS-guided coils with glue, stops the bleeding. A TIPS placed as soon as possible keeps it stopped: the PPG falls to {ppg} and the fundal varix to {gv}.',
      notes: 'Source: Baveno VIII 5.40, 5.41. Baveno VIII: conventional cyanoacrylate injection and EUS-guided therapy stop the bleeding about equally well; EUS-guided coils with glue may close more varices and cut late rebleeding in experienced centers. A TIPS, with or without embolization of the varix, as soon as possible, is the preferred definitive treatment. Embolizing the varix at the same time lowers rebleeding and encephalopathy (AASLD). Once the PPG is under 12 mmHg the beta-blocker is not needed. The price is the liver\'s portal blood: the liver flow tile falls to about a quarter of normal, the reason encephalopathy follows some shunts.',
      ask: ['After a TIPS that brings the PPG <12 mmHg, is a beta-blocker still needed?', 'No, according to AASLD.'],
    },
    {
      id: 'brto', lens: 'flow', preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', terms: ['gv'], tool: { kind: 'flows' }, procedure: 'brto',
      data: 'tiles', tiles: ['gv', 'varix', 'ppg'], key: ['gv'], delta: 'classes',
      kicker: 'After a bleed', site: 'sin', title: 'BRTO closes the shunt from below',
      line: 'Plugging the shunt shrinks the fundal varix to {gv}, but the blood stays in the portal system: the PPG rises to {ppg} and esophageal varices grow to {varix}.',
      notes: 'Source: Baveno VIII 5.41; AASLD 45. A balloon in the left renal vein plugs the shunt and sclerosant fills the fundal varix. In balloon-occluded retrograde transvenous obliteration (BRTO) the shunt and the varices behind it thrombose. Baveno VIII keeps transvenous obliteration for patients in whom a TIPS is contraindicated; AASLD lists it with glue and TIPS as a first-line option and prefers it with encephalopathy, a MELD-Na over 20 or a high FIPS score. Closing the shunt raises the portal pressure, so ascites and esophageal varices can worsen and a surveillance endoscopy follows. The buttons compare the shunt open and closed.',
      ask: ['A patient with encephalopathy bleeds from IGV1 that drains through a gastrorenal shunt. Which treatment fits, and what do you watch for afterwards?', 'BRTO; then worsening ascites and growing esophageal varices.'],
    },
    {
      id: 'svt', lens: 'origin', preset: 'svt', cam: 'splenic', terms: ['sv', 'gv', 'spleen'], mark: { edges: ['SV_CONF'], label: 'Clot' }, data: 'tiles', tiles: ['gv', 'pv', 'plt'], key: ['gv'],
      vignette: 'A 36-year-old man with a pancreatic pseudocyst after gallstone pancreatitis bleeds from a fundal varix. His liver stiffness is 5 kPa, and CT shows a clotted splenic vein and a large spleen.',
      kicker: 'A clotted splenic vein', site: 'pre', title: 'Left-sided portal hypertension',
      line: 'With the [splenic vein](sv) clotted, the spleen\'s blood, colored by origin, detours through the short gastric veins into fundal varices of {gv}; the portal vein pressure stays {pv}.',
      notes: 'Source: AASLD 40, 47. Pancreatitis, a pseudocyst or a pancreatic tumor can clot the splenic vein. Only the splenic side of the portal system is under pressure, so this is called left-sided or sinistral portal hypertension: fundal varices with a normal liver, a normal portal vein pressure and often no esophageal varices. AASLD advises looking for a clot whenever gastric varices are found.',
      ask: ['Fundal varices with a liver stiffness of 5 kPa. What is the likely cause?', 'A clotted splenic vein (left-sided portal hypertension).'],
    },
    {
      id: 'splenectomy', params: { splenicRx: 0 }, cam: 'splenic', terms: ['gv'],
      compare: [{ label: 'Spleen in place', short: 'None', own: true, params: { splenicRx: 0 } }, { label: 'Partial embolization', short: 'Embolized', params: { splenicRx: 1 } }, { label: 'Splenectomy', short: 'Removed', params: { splenicRx: 2 } }],
      data: 'tiles', tiles: ['gv', 'plt'], key: ['gv'], delta: 'svt',
      kicker: 'A clotted splenic vein', site: 'pre', title: 'Treat the spleen',
      line: 'The spleen feeds the {gv} fundal varices, and the platelets are {plt}. Leave it, embolize part of it, or remove it: you choose.',
      notes: 'Source: AASLD 47. AASLD: bleeding gastric varices from an isolated splenic vein clot should be considered for splenectomy, a splenic vein stent or splenic artery embolization. The pressure comes from the spleen\'s own outflow, so a TIPS, which decompresses the portal vein, does not reach it. The buttons compare the spleen in place, partial embolization and splenectomy. Partial splenic embolization infarcts half to two thirds of the splenic pulp through a catheter in the splenic artery; pain and fever for a few days are common afterwards, and splenic abscess and portal vein thrombosis are rarer. Splenectomy carries real risk and splenic and portal vein thrombosis is common after it, because blood stagnates in the stump of the splenic vein, so look for a clot in the weeks after it.',
      ask: ['Why does a TIPS not help a fundal bleed caused by a clotted splenic vein?', 'The portal vein pressure is normal; the high pressure is on the splenic side of the clot, which a TIPS does not decompress.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis with a gastrorenal shunt from moderate to severe, each point settled for 120
      // days, the fundal varix with the shunt open and with it closed, and the esophageal varix with it closed, against the HVPG. The ring is the
      // first slide's patient, shunt open; the other two rings read what closing the shunt would do at the same HVPG.)
      id: 'relation', preset: 'gastric-varix', cam: 'fundus', terms: ['gv'], mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' },
      // (Colour says which varix, fundal pink and esophageal green; solid is the GRS open, dashed the GRS closed, named once in the key row.)
      tool: { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.0625, days: 120, lines: ['gv'], reading: 'Varix', cuts: 'ticks', styles: ['GRS open', 'GRS closed'],
        against: [{ label: 'Fundal', params: { occluded: { C5: true } }, own: 'Fundal', dash: true }, { label: 'Esophageal', of: 'varix', params: { occluded: { C5: true } }, dash: true }] },
      kicker: 'Summary', site: 'sin', title: 'Closing the gastrorenal shunt moves varices to the esophagus',
      line: 'With the gastrorenal shunt (GRS) open, the fundal varix grows with the HVPG, here to {gv}. Once the GRS is closed, it stays small and the esophageal varix grows instead.',
      notes: 'Each point is a patient with cirrhosis and a gastrorenal shunt, settled for 120 days, the varix diameters read against the HVPG. With the gastrorenal shunt (GRS) open, the solid pink line, part of the portal blood leaves through it and the fundal varix fills as the pressure rises. BRTO plugs the shunt (the dashed lines): the fundal varix falls to about 2.4 mm at every HVPG, but the blood stays in the portal system and the esophageal varix grows with the pressure instead, from 2.0 to 8.5 mm in the model. The ring is the patient of the first slide, shunt open; the other two rings show what closing the shunt would do at the same HVPG. A surveillance endoscopy follows BRTO. (AASLD 2024: BRTO can bring more ascites and bleeding from esophageal varices; Baveno VIII 5.41.)',
      ask: ['Why does the PPG rise and the esophageal varix grow after BRTO?', 'The shunt was an outlet for portal blood. Closed, the blood stays in the portal system, so the pressure rises and the esophageal route opens.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['gv', 'varix', 'ppg', 'liver', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'classes', kicker: 'Cirrhosis', title: 'Fundal varices' }, { id: 'tips', kicker: 'Cirrhosis', title: 'TIPS' }, { id: 'brto', kicker: 'Cirrhosis', title: 'BRTO' }, { id: 'svt', kicker: 'Splenic vein', title: 'Splenic vein clot', site: 'pre' }, { id: 'splenectomy', kicker: 'Splenic vein', title: 'Splenectomy', site: 'pre' }],
      kicker: 'Summary', title: 'Gastric varices, treatment by treatment',
      line: 'Glue stops a fundal bleed and a TIPS keeps it stopped; BRTO closes the varix but raises the portal pressure. A clotted splenic vein is treated at the spleen.',
      notes: 'The class of the varix and the anatomy of its shunt decide the treatment. GOV1 follow the esophageal rules. Cardiofundal varices take a beta-blocker before a bleed, and glue then a TIPS after one, with BRTO when a TIPS is not suitable. A normal liver with fundal varices points to the splenic vein.',
      ask: ['Which treatment raises the portal pressure, and which lowers it?', 'BRTO raises it; a TIPS lowers it.'],
    },
  ],
};
