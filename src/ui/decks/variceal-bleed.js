// Presenter talk: acute variceal bleeding as a resuscitation, beat by beat on the live trace, from the tear to the TIPS and on to the
// bleed that will not stop (the slide fields are described at the top of decks.js). Each slide's actions run with the bleed still
// open, so a slide that only lets time pass (action: []) loses a few more minutes of blood. The last section is a second case: a bleed
// that octreotide and bands controlled comes back by day 5, and the bleed stays open until the slide that stops it.

const K = 'The bleed';
// (deltaLabel: the name of the dotted lines and grey band on the beat-by-beat card, where the patient stood before; beat-card.js)
const BEATS = { kind: 'trace', range: 'beats', deltaLabel: 'before the bleed' }, REBEATS = { ...BEATS, deltaLabel: 'before the rebleed' };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' }, UNIT = { kind: 'infuse', fluid: 'prbc' }, BAND = { kind: 'band' };
// The balloon slide's camera: the lower esophagus round the esophageal balloon (y 170 to 244, balloon-eso.js BALLOON) with the varix up the wall, the tear
// at its foot (SITES.varix 797, 232), the cardia below it and the gastric balloon, the first step, drawn up under the cardia (balloon-gas.js), about twice the
// zoom of 'varices' (tests/tamponade-bleed.test.js holds the box to them).
const BALLOON_CAM = [695, 70, 905, 340];

export const BLEED = {
  id: 'variceal-bleed', level: 'core', title: 'Resuscitating an acute variceal bleed', minutes: 12,
  objectives: [
    'Recognize early shock from heart rate and blood pressure, not hemoglobin, and know what blunts them',
    'Give a vasoactive drug, antibiotic prophylaxis and lactulose before endoscopy',
    'Transfuse to a hemoglobin of 7 to 8 g/dL and explain why not higher',
    'Name who needs a preemptive TIPS, and how to manage bleeding that does not stop',
  ],
  checks: [
    ['What shows shock early in acute variceal bleeding?', 'The heart rate and blood pressure. The hemoglobin falls only later, with hemodilution, and a beta-blocker can blunt the heart rate.'],
    ['Minutes after octreotide starts, the portal pressure falls by about 2 mmHg, with no change in the liver. Which lever moved?', 'Splanchnic inflow: octreotide causes splanchnic vasoconstriction, so portal venous inflow falls. Intrahepatic resistance is unchanged.'],
    ['To what hemoglobin do you transfuse in acute variceal bleeding?', '7 to 8 g/dL, transfusing at <7 g/dL. More volume raises the portal pressure and the risk of rebleeding.'],
    ['A man undergoes band ligation on Monday and has hematemesis again on Thursday. What is that, and what comes next?', 'Treatment failure, because rebleeding is within 5 days. A covered esophageal stent or balloon tamponade bridges him to a rescue TIPS.'],
  ],
  sections: [['Before the bleed', ['Before']], ['The bleed', ['The bleed']], ['Drugs and volume', ['Before endoscopy', 'Volume']], ['Endoscopy', ['Endoscopy', 'After endoscopy']], ['If it does not stop', ['Failure', 'The bridge', 'The rescue']]],
  summary: 'One acute variceal bleed from rupture to TIPS: early shock with a normal hemoglobin, octreotide and volume before endoscopy, restrictive transfusion, band ligation and a preemptive TIPS; then rebleeding by day 5, the stent or balloon bridge, and the rescue TIPS.',
  slides: [
    {
      id: 'before', terms: ['varix'], preset: 'cirr-decomp', params: { respiration: false }, cam: 'varices', labels: ['VAR', 'AZY'], mark: { edges: ['C1a', 'C1b'], label: 'Large varix', kind: 'note' }, calipers: ['varix'], tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'],
      kicker: 'Before', site: 'sin', title: 'Large varices under pressure',
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis has ascites controlled on diuretics and large esophageal varices, and stopped his carvedilol. Bilirubin 3.2 mg/dL, INR 1.9, albumin 2.8 g/dL: Child–Pugh C 10.',
      line: 'Decompensated cirrhosis with a varix of {varix} and a portal pressure of {pv}. The variceal wall is thin and wall stress is high.',
      notes: 'This case has the features that predict a bleed: large varices, red wale marks at endoscopy, and Child–Pugh B or C. Primary prophylaxis would have been a nonselective beta-blocker (carvedilol) or endoscopic variceal ligation (EVL). The trace on the right runs live, beat by beat, for the rest of the talk. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modeled ECG.',
      ask: ['Name three features that predict a first variceal bleed.', 'Large varices, red signs on the varix and advanced liver disease (Child–Pugh B or C).'],
    },
    {
      id: 'tear', action: { kind: 'rupture', tear: 0.35 }, cam: 'bleed', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: K, site: 'sin', title: 'The varix ruptures',
      line: 'Blood fills the esophageal lumen. The heart rate usually rises first, unless a beta-blocker blunts it. Blood pressure has fallen only slightly so far.',
      notes: 'Hematemesis or melena in a patient with cirrhosis is variceal until proved otherwise. Tachycardia and arteriolar vasoconstriction compensate for the lost volume first, so hypotension is a late sign. A beta-blocker such as carvedilol blunts the rise in heart rate, and admission heart rate is neither sensitive nor specific for a large bleed, so a normal heart rate does not reassure. Tachycardia or hypotension points to a large bleed. Place two large-bore IVs, send a type and crossmatch, and call the endoscopist and the ICU team. Hold diuretics and any beta-blocker while the bleeding is active.',
      ask: ['A man on carvedilol has hematemesis. His heart rate is 88/min and his blood pressure 100/60 mmHg. Is he stable?', 'Not necessarily. Carvedilol blunts the rise in heart rate, and his baseline blood pressure may be low. Judge by the trend, the volume of hematemesis, the lactate and orthostatic changes.'],
    },
    {
      id: 'minutes', question: 'He is tachycardic. Has the hemoglobin fallen yet?', action: [], cam: 'bleed', tool: BEATS, data: 'tiles', tiles: ['map', 'hb', 'hbTo'], key: ['hb', 'hbTo'], delta: 'before',
      kicker: K, site: 'sin', title: 'Shock before anemia',
      line: 'Minutes later the heart rate is {hr} and the blood pressure has fallen to {map}. The hemoglobin has not moved; it falls to about {hbTo} over hours.',
      notes: 'Whole blood is lost, red cells and plasma together, so the first hemoglobin is close to normal even in shock. It falls over the next 24 to 72 hours as interstitial fluid and infusions restore the plasma volume (hemodilution). Judge severity by the heart rate, blood pressure, urine output and lactate. Intubate before endoscopy for altered consciousness, as with hepatic encephalopathy, or ongoing hematemesis (Baveno VIII 5.5).',
      ask: ['A hemoglobin of 13.5 g/dL in a patient with hematemesis and a heart rate of 140/min. Is the bleed small?', 'No: the hemoglobin lags. The tachycardia indicates a large bleed.'],
    },
    {
      // (Baveno VIII 5.7 to 5.22 as one ordered list, for the drug-and-volume slide; the beat-by-beat card returns on the slide that bands. 4 rows is the card's limit, so
      // 5.30, 5.14, 5.12 and 5.27, which come after the scope, are in the notes of the slides that follow.)
      id: 'oct', params: { drugs: { octreotide: true } }, action: [UNIT, SALINE], cam: 'portal', labels: ['SMV', 'CONF'], ripple: true,
      tool: { kind: 'criteria', title: 'Before endoscopy', short: 'Before EGD', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 5.7, 5.10, 5.22',
        rows: ['**Vasoactive drug** and a third-generation **cephalosporin**, at once', '**Transfuse** at <7 g/dL, aiming for 7 to 8', '**Lactulose**, oral or by enema', '**Erythromycin** before EGD; **intubate** if obtunded or with hematemesis'],
        verdict: 'Throughout: ICU or step-down unit; monitor sodium on terlipressin.' },
      data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: 'Before endoscopy', site: 'sin', title: 'Octreotide, antibiotics and the first unit start before endoscopy',
      line: 'Octreotide or terlipressin, and ceftriaxone, start with the first unit of packed red cells, before endoscopy. The bleeding outpaces resuscitation: the blood pressure falls to {map}.',
      notes: 'Start the vasoactive drug, the antibiotic and the first unit together, as soon as variceal bleeding is suspected, in an ICU or step-down unit (Baveno VIII 5.21). Baveno VIII 5.7 says to continue the vasoactive drug for 2 to 5 days or until a TIPS. Octreotide, a somatostatin analogue: a 50 µg IV bolus, then 25 to 50 µg/h (AASLD 2024 Table 5). Terlipressin is the first-line choice in Europe and much of the world: 2 mg IV every 4 to 6 hours for the first 24 to 48 hours, then 1 mg every 4 to 6 hours (AASLD 2024 Table 5; not approved in North America). Monitor sodium on terlipressin, because hyponatremia can develop (5.9). Somatostatin is the other choice; all three lower portal pressure by reducing splanchnic inflow. Give a third-generation cephalosporin such as ceftriaxone 1 g/day IV (5.10, 5.11), for up to 5 days (AASLD 2024), stopping at discharge if that comes sooner: antibiotic prophylaxis lowers infection, rebleeding and mortality. Baveno VIII allows a shorter course, or none, in Child–Pugh A (5.10). Lactulose, oral or by enema, is recommended for every variceal bleed to prevent or treat overt hepatic encephalopathy, because it speeds clearance of blood from the bowel (5.22, strong). Erythromycin 250 mg IV, 30 to 90 minutes before endoscopy, clears blood from the stomach in the absence of QT prolongation (5.20). Intubate before endoscopy for altered consciousness or active hematemesis (5.5). Baveno VIII allows stopping the vasoactive drug as early as 24 hours after successful band ligation once a beta-blocker starts (5.8). The portal pressure here falls with the blood loss too; in the model octreotide adds about 1 mmHg of that fall. One unit of packed red cells and 1 L of crystalloid are infused. The order of the card is a usual bedside sequence, not a ranking by the guideline.',
      ask: ['Which drugs start before endoscopy, and what does each do?', 'Octreotide or terlipressin lowers the portal pressure; ceftriaxone lowers infection, rebleeding and mortality; lactulose prevents hepatic encephalopathy; erythromycin clears the stomach for endoscopy.'],
    },
    {
      id: 'blood', action: [UNIT], cam: 'bleed', tool: { kind: 'vitals', show: ['hr', 'map', 'hb'] }, data: 'tiles', tiles: ['hbTo'], key: ['map', 'hbTo'], delta: 'before', cite: 'Baveno VIII 5.4, 5.23; Villanueva, NEJM 2013',
      kicker: 'Volume', site: 'sin', title: 'Transfuse to a hemoglobin of 7 to 8 g/dL',
      line: 'A second unit raises the blood pressure to {map}. The hemoglobin lags: {hb} now, near {hbTo} after hemodilution. Once stable, transfuse only at <7 g/dL, aiming for 7 to 8.',
      notes: 'A restrictive transfusion strategy (transfusing below 7 g/dL, to a target of 7 to 9 in the trial, 7 to 8 in Baveno VIII and about 7 in AASLD guidance) lowered rebleeding and death compared with a liberal one (transfusing below 9 g/dL, to a target of 9 to 11). That was Villanueva\'s trial (NEJM 2013, 921 patients with upper gastrointestinal bleeding): survival at 6 weeks was 95% with the restrictive strategy and 91% with the liberal one. It applies once the patient is stable, and the trial excluded massive bleeding. Overtransfusion returns the portal pressure toward its prebleed level, which makes early rebleeding more likely; it also worsens ascites and can cause pulmonary edema. In cirrhosis normal saline adds sodium, so a balanced crystalloid, given with care, is a common choice. Patients with heart disease or ongoing massive bleeding may need more. Fresh frozen plasma is not routinely recommended, because it does not correct the coagulopathy and adds volume (5.23), and a platelet count or fibrinogen level does not predict failure to control the bleed, so transfusing to correct them is not routine either (5.24). The monitor shows the current heart rate, blood pressure and hemoglobin; the tile gives the hemoglobin expected after hemodilution. (Baveno VIII 5.4.)',
      ask: ['What hemoglobin target is used in variceal bleeding, and why not higher?', '7 to 8 g/dL, transfusing at <7 g/dL. Extra volume raises the portal pressure and the risk of early rebleeding.'],
    },
    {
      // (Baveno VIII 5.25, 5.26 and 5.28, the things left out of an acute bleed; the 5.23 and 5.24 plasma and platelet statements are on the slide before.)
      id: 'donts', cam: 'bleed', data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      tool: { kind: 'criteria', title: 'Not recommended in variceal bleeding', short: 'Not in AVB', ticks: false, lead: 'Not recommended in acute variceal bleeding.', rule: 'Baveno VIII 5.25, 5.26, 5.28',
        rows: ['No **factor VIIa** or **tranexamic acid**', '**Hold anticoagulants** until the bleeding is controlled', 'No **clips**, **hemostatic powder** or **fibrin** as first-line therapy'], verdict: 'First-line: band ligation (5.29).' },
      kicker: 'Volume', site: 'sin', title: 'Several standard hemostatic measures have no role in variceal bleeding',
      line: 'Factor VIIa and tranexamic acid are not recommended, anticoagulants are held until the bleeding is controlled, and band ligation comes before clips or hemostatic powder.',
      notes: 'Baveno VIII 5.25 advises against recombinant factor VIIa and tranexamic acid in acute variceal bleeding (AVB) (strong recommendation, level 2). 5.26: hold any anticoagulant until the bleeding is controlled, then restart it when the indication justifies it; the timing is individualized. 5.28: hemoclips, over-the-scope clips, topical hemostatic agents and fibrin are not recommended as the first endoscopic treatment. Band ligation is (5.29, for esophageal varices and GOV1). Plasma and platelets are not given routinely either (5.23, 5.24, on the slide before).',
      ask: ['A man taking a DOAC for portal vein thrombosis has variceal hematemesis. What happens to the anticoagulant?', 'It is held until the bleeding is controlled. When to restart depends on the strength of the indication (Baveno VIII 5.26).'],
    },
    {
      id: 'band', question: 'Will banding lower his portal pressure?', terms: ['varix'], action: [BAND, BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: BEATS, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: 'blood', cite: 'Baveno VIII 5.18, 5.29',
      kicker: 'Endoscopy', site: 'sin', title: 'Band ligation stops the bleeding',
      line: 'Endoscopy within 12 hours, once hemodynamically stable. Band ligation obliterates the varix and the bleeding stops, but the portal pressure does not fall.',
      notes: 'Band ligation controls most variceal bleeds. It does not lower the portal pressure; over the following days it raises the HVPG slightly as the varix is obliterated. The ring on the varices opens the endoscopic view: it shows the bleeding as the slide arrives, and the jet fades as the bands are placed, while the beat-by-beat card shows the portal pressure unchanged. If bleeding cannot be controlled, a covered self-expanding esophageal stent (preferred over balloon tamponade where available) serves as a bridge to a rescue TIPS, which the last section of this talk follows. Once the bleed is controlled, oral nutrition starts as soon as possible (Baveno VIII 5.12), and a PPI started before endoscopy is stopped once the bleed is shown to come from portal hypertension, unless there is a strong reason to continue it (5.14). Every patient has abdominal imaging, preferably contrast-enhanced CT or MRI, to exclude portal or splanchnic vein thrombosis and HCC and to map the collaterals (5.30). (Baveno VIII 5.18, 5.29.)',
      ask: ['What bridges bleeding that band ligation cannot control?', 'A covered esophageal stent (preferred) or balloon tamponade, as a bridge to a rescue TIPS.'],
    },
    {
      // (The algorithm of Baveno VIII Fig. 3, lit for this patient: banding controlled the bleed and Child–Pugh C 10 meets the preemptive TIPS criteria. The
      // Child–Pugh score, active bleeding, control and fitness are the case's own, not the model's; tool-path.js.)
      id: 'path', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'path', of: 'bleed', short: 'Bleed path', patient: { src: 'ov', cp: 10, active: false, ctrl: true, fit: true, hvpg: null } },
      kicker: 'After endoscopy', site: 'sin', title: 'The algorithm: band ligation, then decide on a TIPS',
      line: 'Band ligation controlled the bleeding. Child–Pugh C 10 meets a preemptive TIPS criterion, so the algorithm leads to a TIPS within 72 hours.',
      notes: 'This is the acute variceal bleeding algorithm of Baveno VIII (Fig. 3), lit for the patient on the slide. Every patient gets a vasoactive drug, antibiotics and restrictive transfusion, and an endoscopy within 12 hours (5.18). A bleed from an esophageal varix or a GOV1 is banded. If banding controls it, a preemptive TIPS within 72 hours, ideally 24, is for a Child–Pugh C score of 10 to 13, a Child–Pugh B score of 8 or 9 with active bleeding at endoscopy, or an HVPG of 20 mmHg or more, in a patient aged <75 with a creatinine <3 mg/dL and no heart failure (5.31). Everyone else receives carvedilol plus EVL every 2 to 4 weeks. If banding does not control the bleed, a dedicated covered stent, preferred over a balloon, bridges to a salvage TIPS (5.35 to 5.37). A GOV2 or an IGV1 bleed is high risk and runs two phases at once (5.39): the acute one, an EUS-guided coil with cyanoacrylate in experienced centers or else cyanoacrylate injection (5.40), and the definitive one, TIPS with or without embolization as soon as possible for Child–Pugh C below 14, or other options after a team discussion (5.41). The Child–Pugh score, active bleeding, control of the bleed and fitness for TIPS are facts of the case, so the chart takes them from the slide; in this case, Child–Pugh C 10.',
      ask: ['After band ligation controls the bleeding, what decides between a preemptive TIPS and carvedilol with EVL?', 'The pTIPS criteria: Child–Pugh C 10–13, or B 8–9 with active bleeding at endoscopy, or an HVPG ≥20 mmHg, in a patient aged <75 with a creatinine <3 mg/dL and no heart failure. Otherwise carvedilol plus EVL every 2–4 weeks.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, procedure: { kind: 'tips', then: 'tipsgrad' }, cam: 'liver', ripple: true, data: 'tiles',
      // (The who-gets-it table is the algorithm's, on the slide before; this card is what the stent does, second by second, drawn live as it opens: event-graph.js.)
      tool: { kind: 'evgraph', title: 'PPG and varix after the stent' }, tiles: ['ppg', 'varix'], key: ['ppg'], delta: true, cite: 'Baveno VIII 5.31, 5.32; García-Pagán, NEJM 2010',
      kicker: 'After endoscopy', site: 'sin', title: 'High-risk patients get a TIPS within 72 hours',
      line: 'Child–Pugh C 10 qualifies him for a covered TIPS, which lowers the PPG to {ppg} and reduces rebleeding and mortality.',
      notes: 'Child–Pugh points in this case: bilirubin 3.2 mg/dL 3, INR 1.9 2, albumin 2.8 g/dL 2, ascites 2 and no encephalopathy 1, for a total of 10. Baveno VIII: in high-risk patients a preemptive TIPS, ideally within 24 hours and no later than 72, reduces rebleeding and mortality. In the trial behind it (García-Pagán, NEJM 2010, 63 patients, Child–Pugh B with active bleeding or C), one-year survival was 86% with an early TIPS and 61% with drugs and EVL. An HVPG ≥20 mmHg, where measured, also marks high risk. A patient who misses the 72-hour window can still benefit from a TIPS placed later, up to about 1 week in Child–Pugh B and 2 weeks in Child–Pugh C. For everyone else, after the acute bleed: an NSBB with EVL every 2 to 4 weeks until the varices are eradicated. Rescue TIPS is for bleeding that drugs and banding do not control. A raised bilirubin, a high MELD, ACLF, overt encephalopathy or severe alcohol-related hepatitis are not absolute contraindications to a preemptive TIPS (5.33). (Baveno VIII 5.31, 5.32.) Step 5 measures the gradient across the new stent: the same catheter records the portal pressure through the stent, is withdrawn to the IVC at the hepatic vein confluence, and records again. With a PPG <12 mmHg, a beta-blocker is not required after the TIPS (AASLD 2024). The reading just after the procedure can be skewed by general anesthesia and vasoactive drugs (Baveno VIII), so it may not reflect the long-term gradient.',
      ask: ['Which patients get a preemptive TIPS after a variceal bleed?', 'Child–Pugh C 10 to 13, Child–Pugh B >7 with active bleeding at endoscopy, or an HVPG ≥20 mmHg, in a patient aged <75 with a creatinine <3 mg/dL and no heart failure.'],
    },
    {
      // (Two days on from a bleed of about a quarter of her blood: the plasma has refilled, so the hemoglobin has fallen to where the tiles of the first
      // case said it was heading.)
      id: 'controlled', preset: 'cirr-decomp', params: { drugs: { octreotide: true }, respiration: false }, action: [{ kind: 'hemorrhage', mL: 1200 }, BAND], days: 2, cam: 'varices', labels: ['VAR'], tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'],
      vignette: 'In another patient, a 61-year-old woman with alcohol-associated cirrhosis, Child–Pugh B 8, band ligation two days ago controlled a variceal bleed. There was no active bleeding at endoscopy, so no preemptive TIPS.',
      kicker: 'Failure', site: 'sin', title: 'The first bleed is controlled, for now',
      line: 'Band ligation stopped the bleeding. Her heart rate is {hr}; after hemodilution, her hemoglobin is {hb}. Rebleeding before day 5 counts as treatment failure.',
      notes: 'The first days after a variceal bleed carry the highest risk of rebleeding. Octreotide continues for 2 to 5 days, ceftriaxone for up to 5 days (AASLD 2024), and an NSBB starts when octreotide stops. Iron replacement is considered before discharge for anemia from blood loss (Baveno VIII 5.27). Child–Pugh B 8 with no active bleeding at endoscopy does not meet the preemptive TIPS criteria, which is why she has none. EVL is repeated every 2 to 4 weeks until the varices are eradicated. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modeled ECG.',
      ask: ['Why is rebleeding on day 3 not counted as a new bleed?', 'Baveno VIII defines treatment failure as uncontrolled bleeding or rebleeding within 5 days of the index bleed.'],
    },
    {
      id: 'rebleed', action: { kind: 'rupture', tear: 0.6 }, cam: 'bleed', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'Rebleeding within 5 days counts as treatment failure',
      line: 'On day 3 she has hematemesis again, on octreotide and with the bands in place. Within minutes the heart rate climbs to {hr} and the blood pressure falls to {map}.',
      notes: 'Rebleeding within 5 days of the index bleed means the initial treatment has failed. The heart rate climbs and the blood pressure falls as before, but she now has less physiologic reserve. Resuscitation restarts at once, and the endoscopist and the ICU team are called. (Baveno VIII 5.16.)',
      ask: ['A patient undergoes band ligation on Monday and has hematemesis on Thursday. Is that treatment failure?', 'Yes: rebleeding within 5 days of the index bleed is treatment failure.'],
    },
    {
      id: 'failure', action: [UNIT, SALINE], cam: 'bleed', labels: ['VAR'], tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'Failure means uncontrolled bleeding or rebleeding by day 5',
      line: 'Failure means bleeding that drugs and endoscopy do not control, or rebleeding within 5 days. Packed red cells and crystalloid are given: heart rate {hr}, blood pressure {map}.',
      notes: 'Baveno VIII defines treatment failure either as persistent uncontrolled bleeding or as rebleeding within 5 days. Failure, Child–Pugh class C and a high MELD score are the main risk factors for death within 6 weeks. Give enough volume to maintain organ perfusion and transfuse to a hemoglobin of 7 to 8 g/dL, because extra volume raises the portal pressure. The model\'s bands always control an esophageal bleed, so this slide omits the repeat banding to show ongoing bleeding. (Baveno VIII 5.16, 5.17.)',
      ask: ['Name two ways acute variceal bleeding counts as treatment failure.', 'Bleeding that stays uncontrolled despite drugs and endoscopy, or rebleeding within 5 days.'],
    },
    {
      // (The same algorithm for the second patient: her bleed is not controlled, so the path turns to the covered stent and the salvage TIPS.)
      id: 'path2', cam: 'bleed', labels: ['VAR'],
      tool: { kind: 'path', of: 'bleed', short: 'Bleed path', patient: { src: 'ov', cp: 8, active: false, ctrl: false, fit: true, hvpg: null } },
      kicker: 'Failure', site: 'sin', title: 'Her bleeding is not controlled, so the algorithm changes course',
      line: 'Band ligation did not control the bleeding. The algorithm sends her to a covered esophageal stent as a bridge, then a salvage TIPS.',
      notes: 'The same algorithm, lit for the second patient. When banding and the drugs do not control a bleed from an esophageal varix, the preemptive TIPS criteria no longer apply: a dedicated covered self-expanding metal stent is preferred over a balloon tamponade as a bridge to TIPS or liver transplantation (5.35), and a failure to control the bleeding despite drugs and endoscopy is managed by a salvage TIPS (5.36). Salvage TIPS should be considered in every patient with refractory bleeding, whatever the age, Child–Pugh class or MELD score, case by case (5.37). The next slides show the bridge and the rescue.',
      ask: ['Where does the algorithm send bleeding that band ligation does not control?', 'To a dedicated covered stent, preferred over balloon tamponade, as a bridge, and then to a salvage TIPS.'],
    },
    {
      id: 'bridge', params: { balloonGas: true }, action: [UNIT], cam: BALLOON_CAM, labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Tamponade', kind: 'treat' }, tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'The bridge', site: 'sin', title: 'A covered stent or balloon tamponade bridges to a TIPS',
      line: 'A covered esophageal stent is the preferred bridge, balloon tamponade the alternative. The gastric balloon is inflated first, against the cardia, and the bleeding stops. Blood pressure recovers to {map}.',
      notes: 'In refractory esophageal variceal bleeding a dedicated covered self-expanding metal stent is preferred over balloon tamponade, as a bridge to a TIPS or a transplant. AASLD 2024 notes that a stent can stay in place for up to a week and a balloon for 24 hours at most, and that specialized esophageal stents were not FDA approved in the United States, so many US centers have only balloon tamponade. Intubate before the tube or the stent is placed. The tube has a gastric and an esophageal balloon. The gastric balloon is inflated first, in the stomach, and the tube is put under traction so the balloon compresses the cardia; the esophageal balloon is inflated only if bleeding continues. The model draws the tube, the gastric balloon first and the esophageal one as a second step on the varices card; it has no stent. (Baveno VIII 5.35; AASLD 2024 34.)',
      ask: ['Why is balloon tamponade or a stent a bridge and not a definitive treatment?', 'It compresses the varix but leaves the portal pressure unchanged, so bleeding recurs after removal.'],
    },
    {
      id: 'rescue', params: { balloonGas: false, balloonEso: false, tips: { on: true } }, action: [{ kind: 'stopBleed' }], cam: 'liver', tool: { kind: 'profile', from: 'bridge', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['map', 'liver'], key: ['ppg'], delta: true, cite: 'Baveno VIII 5.36, 5.37',
      kicker: 'The rescue', site: 'sin', title: 'A rescue TIPS decompresses the varix',
      line: 'A covered TIPS lowers the PPG to {ppg}, {<12 mmHg}, and the bleeding stops. Sinusoidal flow falls to {liver} of normal, now mostly hepatic arterial.',
      notes: 'Baveno VIII recommends a salvage TIPS when bleeding cannot be controlled despite drugs and endoscopy, and AASLD 2024 calls it a rescue TIPS when the bleed returns despite vasoactive therapy and banding. The covered stent creates a channel from the portal vein to a hepatic vein, so most portal flow bypasses the liver. The PPG falls below the level at which varices bleed, and the balloon can be removed. Baveno VIII 5.37 says a salvage TIPS should be considered in every patient with refractory variceal bleeding, whatever the age, Child–Pugh class or MELD score, decided case by case; transplant candidacy is assessed at once. Hepatic encephalopathy is the main risk afterward, and many centers give lactulose or rifaximin from the start. (Baveno VIII 5.36, 5.37; AASLD 2024 35.)',
      ask: ['What does a rescue TIPS change that a stent or balloon tamponade does not?', 'It lowers the portal pressure that feeds the varix, so hemostasis is durable.'],
    },
    {
      // (The relation chart before the summary: the patient before the bleed, blood taken away or given, each point read at once.
      // The hemoglobin lags the bleed in the model as in a patient, so the blood volume runs across rather than the hemoglobin.)
      id: 'relation', preset: 'cirr-decomp', cam: 'portal', labels: ['SMV', 'CONF'],
      tool: { kind: 'curve', x: 'bv', lines: ['pv', 'map'],
        points: [{ action: { kind: 'hemorrhage', mL: 1500 } }, { action: { kind: 'hemorrhage', mL: 1000 } }, { action: { kind: 'hemorrhage', mL: 500 } }, { action: [] },
          { action: [UNIT] }, { action: [UNIT, UNIT] }, { action: [UNIT, UNIT, UNIT] }] },
      kicker: 'Summary', title: 'Volume expansion raises the portal pressure',
      line: 'Blood loss lowers the portal pressure along with the blood pressure. Transfusion beyond his prebleed volume raises the portal pressure while the blood pressure barely changes.',
      notes: 'The ring is the patient before the bleed. To the left, blood is removed; to the right, units of packed red cells are given to an already euvolemic circulation. The portal pressure follows the volume both ways: blood loss lowers it, which is part of why bleeding slows, and every extra unit raises it again. The arterial pressure plateaus beyond baseline, so overtransfusion adds little blood pressure at the cost of a higher portal pressure and a higher risk of rebleeding. That is the case for a restrictive target: transfuse at a hemoglobin of 7 g/dL and aim for 7 to 8 (Baveno VIII 5.4; AASLD 2024 statement 28, about 7). Baveno VIII 5.23 adds that plasma given to correct coagulation tests adds volume of its own and can raise the portal pressure. The hemoglobin is not on the axis because it lags: it falls only with hemodilution, hours after the blood is lost.',
      ask: ['His blood pressure is back to normal after two units, and his hemoglobin is 7.5 g/dL. Do you give a third unit?', 'No. He is at target; more volume raises the portal pressure and the risk of rebleeding for little gain in blood pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'hb', 'hbTo', 'pv', 'ppg'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'tear', kicker: K, title: 'The tear' }, { id: 'minutes', kicker: K, title: 'Shock, minutes later' }, { id: 'oct', kicker: 'Drug and volume', title: 'Octreotide, first unit' }, { id: 'blood', kicker: 'Volume', title: 'Second unit' }, { id: 'band', kicker: 'Endoscopy', title: 'Band ligation' }, { id: 'tips', kicker: 'Shunt', title: 'Preemptive TIPS' }, { id: 'rebleed', kicker: 'Second patient, day 3', title: 'The rebleed' }, { id: 'rescue', kicker: 'Second patient', title: 'Rescue TIPS' }],
      kicker: 'Summary', title: 'Vital signs and portal pressure through the bleed',
      line: 'Heart rate and blood pressure track the volume; the hemoglobin lags. Portal pressure falls with the bleed and again with a TIPS. Her day 3 rebleeding is treatment failure.',
      notes: 'The order of care: airway, volume with octreotide and an antibiotic, restrictive transfusion, endoscopy with band ligation within 12 hours, and a preemptive TIPS for the highest risk. The portal pressure falls with blood loss and rises as volume is restored, so the aim is hemodynamic stability, not volume expansion. Rebleeding within 5 days is treatment failure: bridge with a covered stent or balloon tamponade and consider a salvage TIPS in every patient, whatever the age, Child–Pugh class or MELD score, case by case (Baveno VIII 5.37). Assess transplant candidacy at once.',
      ask: ['Put these in order: band ligation, octreotide, transfusion at 7 g/dL, ceftriaxone.', 'Octreotide (or terlipressin) and ceftriaxone at once, transfusion as needed, band ligation within 12 hours.'],
    },
  ],
};
