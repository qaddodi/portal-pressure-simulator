// Presenter talk: gastric varices, from the Sarin classes through the bleed, TIPS and BRTO to the
// clotted splenic vein: EUS-guided coils and glue for the varix, then the spleen treated (carvedilol before a first bleed is in the first slide's notes; Lowering portal pressure teaches the drug) (the slide fields are described at the top of decks.js).

const BEATS = { kind: 'trace', range: 'beats', deltaLabel: 'before the bleed' };

export const GASTRIC = {
  id: 'gastric-varices', level: 'core', title: 'Gastric varices', minutes: 9,
  objectives: [
    'Name the four Sarin classes of gastric varices',
    'Treat fundal varices that have not bled with carvedilol, not cyanoacrylate, BRTO or a TIPS',
    'Explain why a TIPS is preferred after a fundal variceal bleed, and what BRTO does to the portal pressure',
    'Recognize left-sided portal hypertension: obliterate the varix with EUS-guided coils and cyanoacrylate, then treat the spleen',
  ],
  checks: [
    ['Which gastric varices are managed like esophageal varices?', 'GOV1, which extend along the lesser curvature from the esophagus.'],
    ['What is the first treatment for fundal varices that have never bled?', 'A nonselective beta-blocker (NSBB), preferably carvedilol. Cyanoacrylate glue, BRTO or a TIPS is not used to prevent a first bleed; cyanoacrylate is reserved for high-risk varices when an NSBB cannot be taken.'],
    ['After BRTO the fundal varix shrinks, but the PPG rises and esophageal varices grow. Which lever moved?', 'The gastrorenal shunt, an outflow for portal blood, was occluded. That flow stays in the portal system, so the portal pressure rises and the esophageal collaterals enlarge.'],
    ['Fundal varices, a normal liver and splenomegaly: what do you look for, and what treats it?', 'Splenic vein thrombosis on contrast-enhanced CT. Splenectomy, a splenic vein stent or splenic artery embolization treats it.'],
  ],
  summary: 'The Sarin classes, carvedilol before a first bleed, cyanoacrylate and TIPS after one, what BRTO does to the portal pressure, and splenic vein thrombosis: EUS-guided coils and cyanoacrylate for the varix, then splenectomy cures it.',
  slides: [
    {
      id: 'classes', preset: 'gastric-varix', cam: 'fundus', terms: ['gv'], data: 'tiles',
      tool: { kind: 'criteria', title: 'Sarin classes', ticks: false, lead: 'Classified by location.', rule: 'Baveno VIII 5.38', rows: ['**GOV1**, along the lesser curvature', '**GOV2**, toward the fundus', { text: 'IGV1, isolated in the fundus', note: 'Her varix', lit: true },
        '**IGV2**, elsewhere in the stomach'] }, tiles: ['gv', 'varix'], key: ['gv'],
      vignette: 'A 58-year-old woman with primary biliary cholangitis (PBC) cirrhosis and mild ascites has an 8 to 9 mm fundal varix and no esophageal varices on screening EGD. She has never bled, and she starts carvedilol.',
      kicker: 'Where they lie', site: 'sin', title: 'The Sarin classification sorts gastric varices into four types',
      line: 'Gastric varices are classified by location and by continuity with esophageal varices. This one, isolated in the fundus (IGV1), measures {gv}; there are no esophageal varices.',
      notes: 'Source: Baveno VIII 5.38; AASLD 40 to 42. She starts carvedilol to prevent a first bleed; cyanoacrylate glue, BRTO and a TIPS are not used for that. AASLD calls a cardiofundal varix high risk at ≥10 mm, with red wale signs, or in Child–Pugh B or C. Her varix is just <10 mm, but her ascites makes her Child–Pugh B (9, as the bleed algorithm later in this talk says), so she is high risk. That does not change the plan: she can take an NSBB, and cyanoacrylate is reserved for high-risk varices when an NSBB cannot be taken. The model\'s endoscope stays in the esophagus, so the fundal varix shows only as its tile. Baveno VIII recommends the Sarin classification for every gastric varix, to report them the same way, judge the bleeding risk and choose the treatment. GOV1 extend along the lesser curvature from the esophagus and are managed like esophageal varices. GOV2 and IGV1 are the cardiofundal varices: they bleed less often than esophageal varices, but when they bleed, treatment failure, rebleeding and death are more common. Gastric varices are more common in prehepatic portal hypertension, above all with splenic vein thrombosis, so finding one calls for contrast-enhanced CT or MRI. Before a first bleed (Baveno VIII 3.21, written for compensated cirrhosis; AASLD 40 to 42, which covers her ascites too): patients with gastric varices have CSPH and benefit from an NSBB, particularly carvedilol. Local therapy (endoscopic cyanoacrylate, EUS-guided therapy or transvenous obliteration) may be considered for high-risk GOV2 or IGV1 varices only when an NSBB cannot be taken, in centers with expertise; there is little evidence for adding it to an NSBB. AASLD recommends neither TIPS nor BRTO to prevent a first bleed. In the model the varix shrinks with the gradient within seconds; in patients it does not, so this slide shows the pressures.',
      ask: ['Which gastric varices behave like esophageal varices?', 'GOV1, along the lesser curvature.'],
    },
    {
      id: 'shunt', lens: 'flow', cam: 'fundus', terms: ['gv', 'lrv'], mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }, tool: { kind: 'flows' }, data: 'tiles', tiles: ['gv', 'liver'], key: ['gv'],
      kicker: 'Where they lie', site: 'sin', title: 'Fundal varices drain through a gastrorenal shunt',
      line: 'Most fundal varices drain through a gastrorenal shunt into the [left renal vein](lrv). The shunt diverts portal flow from the cirrhotic liver, whose sinusoidal flow is {liver} of normal.',
      notes: 'Source: AASLD 2024. The short and posterior gastric veins feed the fundal varices, and a spontaneous gastrorenal shunt, often by way of the left inferior phrenic vein, drains them into the left renal vein. AASLD notes that gastric varices form and bleed at a lower portal pressure than esophageal varices, and that this system competes with the portal vein for blood. The wide varix has a high wall stress even at a modest gradient. A large shunt also diverts portal flow from the liver, which raises the risk of hepatic encephalopathy (HE). The shunt is the route BRTO uses, later in this talk.',
      ask: ['Into which vein does a gastrorenal shunt drain?', 'The left renal vein.'],
    },
    {
      id: 'bleed', params: { respiration: false, drugs: { carvedilol: true } }, action: { kind: 'rupture', site: 'GV', tear: 0.4 }, cam: 'fundus', mark: { edges: ['C2'], label: 'Bleeding fundal varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      kicker: 'After a bleed', site: 'sin', title: 'A fundal varix bleeds',
      line: 'As for any variceal bleed: octreotide or terlipressin, ceftriaxone, restrictive transfusion and endoscopy within 12 hours. Carvedilol blunts the heart rate ({hr}) as blood pressure falls to {map}.',
      notes: 'Source: Baveno VIII 5.30, 5.39; AASLD 43, 44. She was already taking carvedilol when she bled, which is why her heart rate rises so little for the volume lost; a normal heart rate can mask a large bleed. Outside the US, terlipressin is an alternative to octreotide. Baveno VIII calls a bleed from GOV2 or IGV1 a high-risk event that needs a team: one phase stops the bleeding, the other gives lasting control, and the two start in parallel or as close together as possible. Hold the beta-blocker while the bleeding is active and the blood pressure is low. Every variceal bleed warrants contrast-enhanced CT or MRI (Baveno VIII 5.30, a strong recommendation; AASLD 44) to map the shunts and look for thrombosis, which guides the choice of treatment. If the first measures fail, a gastric balloon (Linton–Nachlas or the gastric balloon of a Minnesota tube) bridges to definitive treatment. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modeled ECG.',
      ask: ['Why image the abdomen with contrast after a fundal variceal bleed?', 'To map the shunts and look for portal or splenic vein thrombosis; the anatomy decides between TIPS and BRTO.'],
    },
    {
      // (The gastric half of Baveno VIII Fig. 3, lit for her: an IGV1 bleed runs two phases at once, and Child-Pugh B 9 with no contraindication
      // takes the TIPS branch. The Child-Pugh score and fitness for TIPS are the case's own, not the model's; path-algos/gastric.js. The TIPS slide
      // after this one carries it out, so the chart is not shown twice.)
      id: 'gastric', cam: 'fundus', mark: { edges: ['C2'], label: 'Bleeding fundal varix' },
      tool: { kind: 'path', of: 'gastric', short: 'Gastric bleed path', patient: { cp: 9, fit: true } },
      kicker: 'After a bleed', site: 'sin', title: 'A fundal bleed runs two phases at once',
      line: 'An IGV1 bleed is high risk. EUS-guided coils with cyanoacrylate, or cyanoacrylate alone, control it; at Child–Pugh B 9 with no contraindication, the algorithm leads to an early TIPS.',
      notes: 'This is the gastric half of the acute variceal bleeding algorithm of Baveno VIII (Fig. 3), lit for the patient on the slide. A bleed from a GOV2 or an IGV1 is a high-risk event that needs a team (5.39). Treatment has two phases that start in parallel, or as close together as possible: the acute phase stops the bleeding, with conventional cyanoacrylate injection or, in experienced centers, EUS-guided coils with cyanoacrylate (5.40, a weak recommendation), and the definitive phase gives lasting control. TIPS, with or without embolization of the varix, as soon as possible is the preferred definitive treatment (5.41); the figure sets the limits as Child–Pugh C <14 (so A and B too), age <75, creatinine <3 mg/dL and no heart failure. When a TIPS is contraindicated, transvenous obliteration, endoscopic (including EUS-guided) or surgical methods follow after a team discussion that weighs the anatomy and the bleeding site; a Child–Pugh score of 14 or 15, or heart failure, sends a patient there. The Child–Pugh score and fitness for TIPS are facts of the case, so the chart takes them from the slide: she is Child–Pugh B 9, younger than 75 and fit. The next slide carries out the TIPS. (Baveno VIII 5.39 to 5.41.)',
      ask: ['A patient bleeds from an IGV1 varix and is Child–Pugh C 14. Does the chart send him to a TIPS?', 'No. A TIPS needs Child–Pugh C <14, age <75, creatinine <3 mg/dL and no heart failure. Transvenous obliteration, endoscopic or surgical options follow after a team discussion.'],
    },
    {
      id: 'tips', preset: 'gastric-varix', params: { tips: { on: true } }, procedure: 'tips', cam: 'liver', terms: ['gv'], tool: { kind: 'evgraph', title: 'PPG and fundal varix after the stent' }, data: 'tiles', tiles: ['ppg', 'gv', 'liver'], graph: ['ppg', 'gv'], key: ['ppg'], delta: 'classes',
      kicker: 'After a bleed', site: 'sin', title: 'Cyanoacrylate controls the bleeding, a TIPS prevents rebleeding',
      line: 'EUS-guided coils with cyanoacrylate, or cyanoacrylate alone, control the bleeding. An early TIPS prevents rebleeding: the PPG falls to {ppg} and the fundal varix to {gv}.',
      notes: 'Source: Baveno VIII 5.40, 5.41. Baveno VIII: conventional cyanoacrylate injection and EUS-guided therapy achieve hemostasis about equally well; EUS-guided coils with cyanoacrylate may obliterate more varices and reduce late rebleeding in experienced centers. A TIPS, with or without embolization of the varix, as soon as possible, is the preferred definitive treatment. Embolizing the varix at the same time lowers rebleeding and encephalopathy (AASLD). The model shows why: the PPG falls well below 12 mmHg, but the fundal varix shrinks only a little, because it drains through its own gastrorenal shunt and fills at a lower pressure than esophageal varices; the shunt competes with the stent for portal flow. Once the PPG is <12 mmHg the beta-blocker is not needed. The cost is portal perfusion of the liver: the sinusoidal flow tile falls to about a quarter of normal, which is why HE follows some shunts.',
      ask: ['After a TIPS that brings the PPG <12 mmHg, is a beta-blocker still needed?', 'No, according to AASLD.'],
    },
    {
      id: 'brto', lens: 'flow', preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', terms: ['gv'], tool: { kind: 'evgraph', title: 'PPG and fundal varix after shunt occlusion' }, procedure: 'brto',
      data: 'tiles', tiles: ['gv', 'varix', 'ppg'], graph: ['ppg', 'gv'], key: ['gv'], delta: 'classes',
      kicker: 'After a bleed', site: 'sin', title: 'BRTO occludes the shunt retrograde, from the left renal vein',
      line: 'When a TIPS is not suitable, occluding the shunt shrinks the fundal varix to {gv}, but the PPG rises to {ppg}. Esophageal varices can grow to {varix}; repeat endoscopy follows.',
      notes: 'Source: Baveno VIII 5.41; AASLD 45. A balloon in the left renal vein occludes the shunt, and sclerosant fills the fundal varix. In balloon-occluded retrograde transvenous obliteration (BRTO) the shunt and the varices behind it thrombose. Baveno VIII keeps transvenous obliteration for patients in whom a TIPS is contraindicated, after a team discussion; AASLD 45 lists it with cyanoacrylate and TIPS as a first-line option, prefers retrograde obliteration when a TIPS is contraindicated, and favors it with HE, a MELD-Na >20 or a FIPS >0.92. A TIPS is favored instead with ascites, large esophageal varices or portal vein thrombosis, so for her, with ascites, BRTO is the second choice. The variants occlude the shunt differently: in classic BRTO the balloon stays inflated for hours while the sclerosant sets; PARTO leaves a vascular plug and CARTO leaves coils in the shunt, so no indwelling balloon is needed. Occluding the shunt raises the portal pressure, so ascites and esophageal varices can worsen and surveillance endoscopy follows. In case series esophageal varices worsen in about a third, over months to years; the model shows the end state at once. The buttons compare the shunt open and closed.',
      ask: ['A patient with HE bleeds from an IGV1 that drains through a gastrorenal shunt. Which treatment fits, and what do you watch for afterward?', 'BRTO; then worsening ascites and enlarging esophageal varices.'],
    },
    {
      id: 'bato', lens: 'flow', preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', terms: ['gv'], tool: { kind: 'evgraph', title: 'PPG and fundal varix after obliteration' }, procedure: 'bato',
      data: 'tiles', tiles: ['gv', 'varix', 'ppg'], graph: ['ppg', 'gv'], key: ['gv'], delta: 'classes',
      kicker: 'After a bleed', site: 'sin', title: 'BATO obliterates the varices antegrade, from the portal side',
      line: 'Obliterated from the portal side, the fundal varix shrinks to {gv}, as after BRTO. The PPG rises to {ppg} and esophageal varices can grow to {varix}.',
      notes: 'Source: AASLD 2024. AASLD names balloon-occluded antegrade transvenous obliteration (BATO) among the variants of BRTO, with CARTO and PARTO, and refers to Abraldes et al. for the techniques. BATO reaches the varices from the portal side. Here the catheter is passed transhepatically into the right portal vein, along the portal and splenic veins and into the feeding short gastric vein; a balloon occludes the feeding vein and sclerosant fills the varices. It is used when the gastrorenal shunt cannot be catheterized retrograde, because it is too large, too tortuous or has no usable outflow. The model shows a patient whose shunt is present but treated as inaccessible retrograde. The result matches BRTO: the shunt and the varices are obliterated, portal flow stays in the portal system, and the PPG rises. Ascites and esophageal varices can worsen, so a surveillance endoscopy follows.',
      ask: ['Why choose BATO over BRTO, and what does it do to the portal pressure?', 'BATO is for a shunt that cannot be catheterized retrograde; the catheter reaches the feeding vein transhepatically through the portal vein. Like BRTO it occludes an outflow for portal blood, so the PPG rises.'],
    },
    {
      id: 'svt', lens: 'origin', preset: 'svt', cam: 'splenic', terms: ['sv', 'gv', 'spleen'], mark: { edges: ['SV_CONF'], label: 'Clot' }, tool: { kind: 'doppler', vessel: 'SV_CONF' }, data: 'tiles', tiles: ['gv', 'pv', 'ssm'], key: ['gv'],
      vignette: 'A 36-year-old man with a pancreatic pseudocyst after gallstone pancreatitis bleeds from a fundal varix. His liver stiffness (LSM) is 5 kPa, and CT shows splenic vein thrombosis and splenomegaly.',
      kicker: 'Splenic vein thrombosis', site: 'pre', title: 'Splenic vein thrombosis causes left-sided portal hypertension',
      line: 'With the [splenic vein](sv) thrombosed, outflow from the spleen is diverted through the short gastric veins into fundal varices of {gv}; the portal vein pressure remains {pv}.',
      notes: 'Source: AASLD 40, 47. Pancreatitis, a pseudocyst or a pancreatic tumor can cause splenic vein thrombosis. Only the splenic side of the portal system is hypertensive, so this is called left-sided or sinistral portal hypertension: fundal varices with a normal liver, a normal portal vein pressure and often no esophageal varices. AASLD advises looking for splenic vein thrombosis whenever gastric varices are found. Doppler of the splenic vein at the thrombus shows no flow, and spleen stiffness is high because splenic venous outflow is obstructed; the LSM is normal. The pancreatic cause is treated as well.',
      ask: ['Fundal varices with an LSM of 5 kPa. What is the likely cause?', 'Splenic vein thrombosis (left-sided portal hypertension).'],
    },
    {
      // (EUS-guided coils and glue, played step by step (proc-anim.js ENDO.eusglue): Next plays each step and the varix closes. His asks,
      // 7 Nov 2026: "add EUS guided coiling and glue injection ... before embolizing and removing the spleen as a step"; 8 Nov 2026: "the EUS
      // gastric variceal treatment slide should be its own slide, and the following slide will have to talk about embolizing and treating the
      // spleen". The glued varix (C2 occluded) carries on to the spleen's slide.)
      id: 'eusglue', params: { occluded: { C2: true } }, cam: 'splenic', terms: ['gv'], procedure: 'eusglue',
      // (The instrument card is the varix's own Doppler, with the varix tile in its header: the trace runs through steps 1 to 4 and falls to "No flow" when the model closes C2 at step 5. The scope is the probe, so none is drawn on the figure: Mohammad, 10 Nov 2026, "do it except 10", eus-glue-steps.md item 3.)
      tool: { kind: 'doppler', vessel: 'C2', probe: 'scope' },
      data: 'tiles', tiles: ['gv'], key: ['gv'], delta: 'svt',
      kicker: 'Splenic vein thrombosis', site: 'pre', title: 'EUS-guided coils and cyanoacrylate obliterate the varix',
      line: 'Transgastric EUS guides coils and cyanoacrylate into the bleeding fundal varix, which is obliterated, now {gv}. The splenic vein remains thrombosed, so the splenic venous pressure stays high.',
      notes: 'Next plays the EUS-guided coils and cyanoacrylate step by step. Source: Baveno VIII 5.40; AASLD 2024. Baveno VIII: for a bleed from GOV2 or IGV1, conventional cyanoacrylate injection and EUS-guided therapy achieve hemostasis about equally well; in experienced centers EUS-guided coils with cyanoacrylate may obliterate more varices and reduce late rebleeding (a weak recommendation). The echoendoscope locates the varix transgastrically with color Doppler; a 19-gauge needle enters it, the coils are deployed through the needle and coil within the varix, and the cyanoacrylate injected over them forms a cast. Doppler then shows no flow in the varix. In the model the varix is obliterated and the gastrorenal shunt stays open; the portal vein pressure does not change. Cyanoacrylate treats the varix, not its cause: with the splenic vein still thrombosed the splenic bed stays hypertensive, so the spleen is treated next.',
      ask: ['Why are coils placed before the cyanoacrylate?', 'The coils hold the cyanoacrylate in the varix, so less is needed and less escapes into the shunt (glue embolism).'],
    },
    {
      // (The spleen's own treatment, with the varix already glued on the slide before: the buttons compare the spleen left, embolized or removed.)
      id: 'splenectomy', params: { splenicRx: 0 }, cam: 'splenic', terms: ['spleen', 'gv'],
      compare: [{ label: 'Spleen in place', short: 'None', own: true, params: { splenicRx: 0 } }, { label: 'Partial embolization', short: 'Embolized', params: { splenicRx: 1 } }, { label: 'Splenectomy', short: 'Removed', params: { splenicRx: 2 } }],
      data: 'tiles', tiles: ['spleen', 'plt'], key: ['plt'], delta: 'eusglue',
      kicker: 'Splenic vein thrombosis', site: 'pre', title: 'Splenectomy or splenic embolization treats the cause',
      line: 'Cyanoacrylate obliterated the varix, not its cause. Removing or partially embolizing the spleen decompresses the splenic bed, so fundal varices do not recur and the platelet count, {plt} now, rises.',
      notes: 'Leave the spleen, embolize part of it, or remove it: the presenter chooses. The varix obliterated on the previous slide stays occluded. Source: AASLD 47. AASLD: bleeding gastric varices from isolated splenic vein thrombosis should be considered for splenectomy, a splenic vein stent or splenic artery embolization. The hypertension is confined to the splenic venous outflow, so a TIPS, which decompresses the portal vein, does not relieve it. Partial splenic embolization infarcts half to two thirds of the splenic parenchyma through a catheter in the splenic artery; pain and fever for a few days are common afterward, and splenic abscess and portal vein thrombosis are rarer. Splenectomy carries real risk, and splenic and portal vein thrombosis is common after it because of stasis in the splenic vein stump, so imaging for thrombosis follows in the weeks after it.',
      ask: ['Why does a TIPS not help a fundal variceal bleed caused by splenic vein thrombosis?', 'The portal vein pressure is normal; the hypertension is on the splenic side of the thrombus, which a TIPS does not decompress.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis with a gastrorenal shunt from moderate to severe, each point settled for 120
      // days, the fundal varix with the shunt open and with it closed, and the esophageal varix with it closed, against the HVPG. The ring is the
      // first slide's patient, shunt open; the other two rings read what closing the shunt would do at the same HVPG.)
      id: 'relation', preset: 'gastric-varix', cam: 'fundus', terms: ['gv'], mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' },
      // (Colour says which varix, fundal pink and esophageal green; solid is the GRS open, dashed the GRS closed, named once in the key row.)
      tool: { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.0625, days: 120, lines: ['gv'], reading: 'Varix', cuts: 'ticks', styles: ['GRS open', 'GRS closed'],
        against: [{ label: 'Fundal', params: { occluded: { C5: true } }, own: 'Fundal', dash: true }, { label: 'Esophageal', of: 'varix', params: { occluded: { C5: true } }, dash: true }] },
      kicker: 'Summary', site: 'sin', title: 'Occluding the gastrorenal shunt moves varices to the esophagus',
      line: 'With the gastrorenal shunt (GRS) open, the fundal varix grows with the HVPG, here to {gv}. Once the GRS is occluded, it stays small and the esophageal varix grows instead.',
      notes: 'Each point is a patient with cirrhosis and a gastrorenal shunt, settled for 120 days, the varix diameters read against the HVPG. With the gastrorenal shunt (GRS) open, the solid pink line, part of portal flow leaves through it and the fundal varix enlarges as the pressure rises. BRTO occludes the shunt (the dashed lines): the fundal varix falls to about 2.4 mm at every HVPG, but the flow stays in the portal system and the esophageal varix grows with the pressure instead, from 2.0 to 8.5 mm in the model. The ring is the patient of the first slide, shunt open; the other two rings show what closing the shunt would do at the same HVPG. A surveillance endoscopy follows BRTO. (AASLD 2024: BRTO can bring more ascites and bleeding from esophageal varices; Baveno VIII 5.41.) One model patient per point; real patients vary far more.',
      ask: ['Why does the PPG rise and the esophageal varix grow after BRTO?', 'The shunt was an outflow for portal blood. Once it is occluded, that flow stays in the portal system, so the portal pressure rises and the esophageal collaterals enlarge.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['gv', 'varix', 'ppg', 'liver', 'he', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'classes', kicker: 'Cirrhosis', title: 'Fundal varices' }, { id: 'tips', kicker: 'Cirrhosis', title: 'TIPS' }, { id: 'brto', kicker: 'Cirrhosis', title: 'BRTO' }, { id: 'svt', kicker: 'Splenic vein', title: 'Splenic vein thrombosis', site: 'pre' }, { id: 'eusglue', kicker: 'Splenic vein', title: 'EUS coils and cyanoacrylate', site: 'pre' }, { preset: 'svt', params: { occluded: { C2: true }, splenicRx: 2 }, kicker: 'Splenic vein', title: 'Splenectomy', site: 'pre' }],
      kicker: 'Summary', title: 'Gastric varices, treatment by treatment',
      line: 'Cyanoacrylate controls a fundal bleed. A TIPS prevents rebleeding but raises the HE risk; BRTO obliterates the varix and preserves portal perfusion of the liver, but raises the portal pressure.',
      notes: 'The class of the varix and the anatomy of its shunt decide the treatment. GOV1 follow the esophageal rules. Cardiofundal varices are treated with an NSBB before a bleed, and with cyanoacrylate then a TIPS after one, with BRTO when a TIPS is not suitable. The TIPS and BRTO rows show the trade-off: the TIPS lowers every pressure and diverts portal flow from the liver, so the HE risk rises; BRTO preserves that flow and lowers the risk, but the PPG and the esophageal varix rise. A normal liver with fundal varices points to splenic vein thrombosis, which is treated at the spleen.',
      ask: ['Which treatment raises the portal pressure, and which lowers it?', 'BRTO raises it; a TIPS lowers it.'],
    },
  ],
};
