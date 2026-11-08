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
    'Read early shock from heart rate and blood pressure, not hemoglobin, and know what blunts them',
    'Give a vasoactive drug, antibiotics and lactulose before endoscopy',
    'Transfuse to a hemoglobin of 7 to 8 g/dL and explain why not more',
    'Name who needs a pre-emptive TIPS, and what to do when the bleed will not stop',
  ],
  checks: [
    ['What shows shock early in a variceal bleed?', 'The heart rate and blood pressure. The hemoglobin falls only later, as fluid refills the vessels, and a beta-blocker can blunt the heart rate.'],
    ['Minutes after octreotide starts, the portal pressure falls by about 2 mmHg, with no change in the liver. Which lever moved?', 'Inflow: octreotide constricts the gut arterioles, so less blood enters the portal vein. The resistance in the liver is unchanged.'],
    ['To what hemoglobin do you transfuse in a variceal bleed?', '7 to 8 g/dL, transfusing <7. More volume raises the portal pressure and the risk of rebleeding.'],
    ['A man is banded on Monday and vomits blood again on Thursday. What is that, and what comes next?', 'Treatment failure, because the rebleed is within 5 days. A covered esophageal stent or a balloon bridges the bleed to a rescue TIPS.'],
  ],
  sections: [['Before the bleed', ['Before']], ['The bleed', ['The bleed']], ['Drugs and volume', ['Before the scope', 'Volume']], ['The scope', ['Endoscopy', 'After the scope']], ['If it does not stop', ['Failure', 'The bridge', 'The rescue']]],
  summary: 'One bleed from tear to TIPS: early shock with a normal hemoglobin, octreotide and volume before the scope, restrictive transfusion, banding and a pre-emptive TIPS; then the bleed that comes back by day 5, the stent or balloon that bridges, and the rescue TIPS.',
  slides: [
    {
      id: 'before', terms: ['varix'], preset: 'cirr-decomp', params: { respiration: false }, cam: 'varices', labels: ['VAR', 'AZY'], mark: { edges: ['C1a', 'C1b'], label: 'Large varix', kind: 'note' }, calipers: ['varix'], tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'],
      kicker: 'Before', site: 'sin', title: 'Large varices under pressure',
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis has ascites controlled on diuretics and large esophageal varices, and stopped his carvedilol. Bilirubin 3.2 mg/dL, INR 1.9, albumin 2.8 g/dL: Child–Pugh C 10.',
      line: 'Decompensated cirrhosis with a varix of {varix} and a portal pressure of {pv}. The wall is thin and the stress on it high.',
      notes: 'This case has the features that predict a bleed: large varices, red wale marks on the scope, and Child–Pugh B or C. Prevention would have been a non-selective beta-blocker (carvedilol) or banding. The trace on the right runs live, beat by beat, for the rest of the talk. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Name three features that predict a first variceal bleed.', 'Large varices, red signs on the varix and advanced liver disease (Child–Pugh B or C).'],
    },
    {
      id: 'tear', action: { kind: 'rupture', tear: 0.35 }, cam: 'bleed', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: K, site: 'sin', title: 'The varix tears',
      line: 'Blood pours into the esophagus. The heart rate usually rises first, unless a beta-blocker blunts it. Blood pressure has fallen only a little so far.',
      notes: 'Hematemesis or melena in a patient with cirrhosis is variceal until proved otherwise. Lost volume is replaced first by a faster heart and tighter arterioles, so the blood pressure falls late. A beta-blocker such as carvedilol blunts the rise in heart rate, and admission heart rate is neither sensitive nor specific for a large bleed, so a normal pulse does not reassure. A fast pulse or a low blood pressure points to a large bleed. Place two large cannulas, send blood for cross-match, and call the endoscopist and the intensive care team. Hold the diuretics and any beta-blocker while the bleed is active.',
      ask: ['A man on carvedilol vomits blood. His pulse is 88 and his blood pressure 100/60. Is he stable?', 'Not necessarily. Carvedilol blunts the rise in heart rate, and his usual pressure may be low. Judge by the trend, the blood seen, the lactate and a postural drop.'],
    },
    {
      id: 'minutes', question: 'His pulse is racing. Has the hemoglobin fallen yet?', action: [], cam: 'bleed', tool: BEATS, data: 'tiles', tiles: ['map', 'hb', 'hbTo'], key: ['hb', 'hbTo'], delta: 'before',
      kicker: K, site: 'sin', title: 'Shock before anemia',
      line: 'Minutes later the heart rate is {hr} and the blood pressure has fallen to {map}. The hemoglobin has not moved; it falls to about {hbTo} over hours.',
      notes: 'Whole blood is lost, red cells and plasma together, so the first hemoglobin is close to normal even in shock. It falls over the next 24 to 72 hours as fluid moves in from the tissues and from the infusions. Judge the bleed by the pulse, the blood pressure, the urine output and the lactate. Intubate before the scope when encephalopathy clouds consciousness or blood keeps coming up (Baveno VIII 5.5).',
      ask: ['A hemoglobin of 13.5 g/dL in a patient vomiting blood with a pulse of 140. Is the bleed small?', 'No: the hemoglobin lags. The pulse says the bleed is large.'],
    },
    {
      // (Baveno VIII 5.7 to 5.22 as one ordered list, for the drug-and-volume slide; the beat-by-beat card returns on the slide that bands. 4 rows is the card's limit, so
      // 5.30, 5.14, 5.12 and 5.27, which come after the scope, are in the notes of the slides that follow.)
      id: 'oct', params: { drugs: { octreotide: true } }, action: [UNIT, SALINE], cam: 'portal', labels: ['SMV', 'CONF'], ripple: true,
      tool: { kind: 'criteria', title: 'Before the scope', short: 'Before the scope', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 5.7, 5.10, 5.22',
        rows: ['**Vasoactive drug** and a third-generation **cephalosporin**, at once', '**Transfuse** at <7 g/dL, aiming for 7 to 8', '**Lactulose**, by mouth or as an enema', '**Erythromycin** before the scope; **intubate** if confused or vomiting blood'],
        verdict: 'Throughout: ICU or intermediate care; sodium checked on terlipressin.' },
      data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: 'Before the scope', site: 'sin', title: 'Drugs, antibiotics and the first unit start before the scope',
      line: 'Octreotide or terlipressin, and ceftriaxone, start with the first unit, before the scope. The bleed outpaces the fluids: the blood pressure falls to {map}.',
      notes: 'Start the vasoactive drug, the antibiotic and the first unit together, as soon as a variceal bleed is suspected, in an intensive or intermediate care unit (Baveno VIII 5.21). Baveno VIII 5.7 says to continue the drug for 2 to 5 days or until a TIPS. Octreotide, a somatostatin analogue: a 50 microgram bolus, then 25 to 50 micrograms an hour (AASLD 2024 Table 5). Terlipressin is the first-line choice in Europe and much of the world: 2 mg IV every 4 to 6 hours for the first 24 to 48 hours, then 1 mg every 4 to 6 hours (AASLD 2024 Table 5; not approved in North America). Watch the sodium on terlipressin, which can fall (5.9). Somatostatin is the other choice; all three work by cutting the inflow. Give a third-generation cephalosporin such as ceftriaxone 1 g a day (5.10, 5.11), for up to 5 days (AASLD 2024), stopping at discharge if that comes sooner: antibiotics lower infection, rebleeding and death. Baveno VIII allows a shorter course, or none, in Child–Pugh A (5.10). Lactulose, by mouth or as an enema, is recommended for every bleed to prevent or treat overt encephalopathy, because it clears blood from the gut faster (5.22, strong). Erythromycin 250 mg IV, 30 to 90 minutes before the scope, clears the stomach of blood when the QT interval allows (5.20). Intubate before the scope for altered consciousness or active hematemesis (5.5). Baveno VIII allows stopping the vasoactive drug as early as 24 hours after successful banding once a beta-blocker starts (5.8). The portal pressure here falls with the blood loss too; in the model octreotide adds about 1 mmHg of that fall. A unit of blood and a liter of fluid run in. The order of the card is a usual bedside sequence, not a ranking by the guideline.',
      ask: ['Which drugs start before the endoscopy, and what does each do?', 'Octreotide or terlipressin lowers the portal pressure; ceftriaxone cuts infection, rebleeding and death; lactulose guards against encephalopathy; erythromycin clears the stomach for the scope.'],
    },
    {
      id: 'blood', action: [UNIT], cam: 'bleed', tool: { kind: 'vitals', show: ['hr', 'map', 'hb'] }, data: 'tiles', tiles: ['hbTo'], key: ['map', 'hbTo'], delta: 'before', cite: 'Baveno VIII 5.4, 5.23',
      kicker: 'Volume', site: 'sin', title: 'Transfuse to a hemoglobin of 7 to 8',
      line: 'A second unit lifts the blood pressure to {map}. The hemoglobin lags: {hb} now, near {hbTo} once refilled. Once stable, transfuse only <7 g/dL, aiming for 7 to 8.',
      notes: 'A restrictive transfusion strategy (transfusing below 7 g/dL, to a target of 7 to 9 in the trial, 7 to 8 in Baveno VIII and about 7 in AASLD guidance) lowered rebleeding and death compared with a liberal one (transfusing below 9 g/dL, to a target of 9 to 11). It applies once the patient is stable, and the trial excluded massive bleeding. Volume beyond what the circulation needs pushes the portal pressure back toward its level before the bleed, which makes an early rebleed more likely; it also worsens ascites and can cause pulmonary edema. In cirrhosis saline adds sodium, so a balanced crystalloid, given with care, is a common choice. Patients with heart disease or ongoing massive bleeding may need more. Fresh frozen plasma is not routinely recommended, because it does not correct the coagulopathy and adds volume (5.23), and a platelet count or fibrinogen level does not predict failure to control the bleed, so transfusing to correct them is not routine either (5.24). The monitor shows the pulse, the blood pressure and the hemoglobin as they are now; the tile gives the hemoglobin they are heading for. (Baveno VIII 5.4.)',
      ask: ['What hemoglobin target is used in variceal bleeding, and why not more?', '7 to 8 g/dL, transfusing <7. Extra volume raises the portal pressure and the risk of an early rebleed.'],
    },
    {
      id: 'band', question: 'Will banding lower his portal pressure?', terms: ['varix'], action: [BAND, BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: BEATS, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: 'blood', cite: 'Baveno VIII 5.18, 5.29',
      kicker: 'Endoscopy', site: 'sin', title: 'Bands stop the bleeding',
      line: 'Endoscopy within 12 hours, once the blood pressure holds. The bands close the varix and the bleeding stops, but the portal pressure does not fall.',
      notes: 'Band ligation controls most variceal bleeds. Banding does not lower the portal pressure; over the following days it raises the HVPG slightly as the varix closes. The ring on the varices opens the scope: it shows the bleed as the slide arrives, and the jet fades as the bands go on, while the beat-by-beat card shows the portal pressure holding. If bleeding cannot be controlled, a covered self-expanding esophageal stent (preferred over a balloon tube where available) buys time as a bridge to a rescue TIPS, which the last section of this talk follows. Once the bleed is controlled, oral nutrition starts as soon as possible (Baveno VIII 5.12), and a PPI started before the scope is stopped once the bleed is shown to come from portal hypertension, unless there is a strong reason to continue it (5.14). Every patient has abdominal imaging, preferably a contrast CT or MRI, to exclude portal or splanchnic vein thrombosis and HCC and to map the collaterals (5.30). (Baveno VIII 5.18, 5.29.)',
      ask: ['What bridges a bleed that banding cannot control?', 'A covered esophageal stent (preferred) or a balloon tube, as a bridge to a rescue TIPS.'],
    },
    {
      // (The algorithm of Baveno VIII Fig. 3, lit for this patient: banding controlled the bleed and Child–Pugh C 10 meets the pre-emptive TIPS criteria. The
      // Child–Pugh score, active bleeding, control and fitness are the case's own, not the model's; tool-path.js.)
      id: 'path', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'path', of: 'bleed', short: 'Bleed path', patient: { src: 'ov', cp: 10, active: false, ctrl: true, fit: true, hvpg: null } },
      kicker: 'After the scope', site: 'sin', title: 'The algorithm: band, then decide on a TIPS',
      line: 'Banding controlled the bleed. Child–Pugh C 10 meets a pre-emptive TIPS criterion, so his path ends in a TIPS within 72 hours.',
      notes: 'This is the acute variceal bleeding algorithm of Baveno VIII (Fig. 3), lit for the patient on the slide. Every patient gets a vasoactive drug, antibiotics and restrictive transfusion, and an endoscopy within 12 hours (5.18). A bleed from an esophageal varix or a GOV1 is banded. If banding controls it, a pre-emptive TIPS within 72 hours, ideally 24, is for a Child–Pugh C score of 10 to 13, a Child–Pugh B score of 8 or 9 with active bleeding at endoscopy, or an HVPG of 20 mmHg or more, in a patient under 75 with a creatinine under 3 mg/dL and no heart failure (5.31). Everyone else takes carvedilol and has banding every 2 to 4 weeks. If banding does not control the bleed, a dedicated covered stent, preferred over a balloon, bridges to a salvage TIPS (5.35 to 5.37). A GOV2 or an IGV1 bleed is high risk and runs two phases at once (5.39): the acute one, an EUS-guided coil with cyanoacrylate in experienced centers or else cyanoacrylate injection (5.40), and the definitive one, TIPS with or without embolization as soon as possible for Child–Pugh C below 14, or other options after a team discussion (5.41). The Child–Pugh score, active bleeding, control of the bleed and fitness for TIPS are facts of the case, so the chart takes them from the slide; this patient is Child–Pugh C 10.',
      ask: ['After banding controls the bleed, what decides between a pre-emptive TIPS and carvedilol with banding?', 'The pTIPS criteria: Child–Pugh C 10–13, or B 8–9 with active bleeding at endoscopy, or an HVPG ≥20 mmHg, in a patient aged <75 with a creatinine <3 mg/dL and no heart failure. Otherwise carvedilol and banding every 2–4 weeks.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, procedure: 'tips', cam: 'liver', ripple: true, data: 'tiles',
      // (The who-gets-it table is the algorithm's, on the slide before; this card is what the stent does, second by second, drawn live as it opens: event-graph.js.)
      tool: { kind: 'evgraph', title: 'PPG and varix after the stent' }, tiles: ['ppg', 'varix'], key: ['ppg'], delta: true,
      kicker: 'After the scope', site: 'sin', title: 'High-risk patients get a TIPS within 72 hours',
      line: 'Child–Pugh C 10 qualifies him for a covered TIPS. It lowers the PPG to {ppg} and cuts rebleeding and death.',
      notes: 'Child–Pugh points in this case: bilirubin 3.2 mg/dL 3, INR 1.9 2, albumin 2.8 g/dL 2, ascites 2 and no encephalopathy 1, for a total of 10. Baveno VIII: in high-risk patients a pre-emptive TIPS, ideally within 24 hours and no later than 72, reduces rebleeding and death. An HVPG of 20 mmHg or more, where measured, also marks high risk. A patient who misses the 72-hour window can still benefit from a TIPS placed later, up to about 1 week in Child–Pugh B and 2 weeks in Child–Pugh C. For everyone else, after the acute bleed: a non-selective beta-blocker with repeated banding every 2 to 4 weeks until the varices are gone. Rescue TIPS is for bleeding that drugs and banding do not control. A raised bilirubin, a high MELD, ACLF, overt encephalopathy or severe alcohol-related hepatitis are not absolute contraindications to a pre-emptive TIPS (5.33). (Baveno VIII 5.31, 5.32.)',
      ask: ['Which patients get a pre-emptive TIPS after a variceal bleed?', 'Child–Pugh C 10 to 13, Child–Pugh B >7 with active bleeding at endoscopy, or an HVPG ≥20 mmHg, in a patient aged <75 with a creatinine <3 mg/dL and no heart failure.'],
    },
    {
      // (Two days on from a bleed of about a quarter of her blood: the plasma has refilled, so the hemoglobin has fallen to where the tiles of the first
      // case said it was heading.)
      id: 'controlled', preset: 'cirr-decomp', params: { drugs: { octreotide: true }, respiration: false }, action: [{ kind: 'hemorrhage', mL: 1200 }, BAND], days: 2, cam: 'varices', labels: ['VAR'], tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'],
      vignette: 'Another patient: a 61-year-old woman with alcohol-associated cirrhosis, Child–Pugh B 8, banded two days ago for a variceal bleed. No active bleeding at the scope, so no pre-emptive TIPS.',
      kicker: 'Failure', site: 'sin', title: 'The first bleed is controlled, for now',
      line: 'Banding stopped the bleed. Her heart rate is {hr}; with the plasma refilled, her hemoglobin is {hb}. A new bleed before day 5 counts as treatment failure.',
      notes: 'The first days after a variceal bleed carry the highest risk of a rebleed. Octreotide continues for 2 to 5 days, ceftriaxone for up to 5 days (AASLD 2024), and a non-selective beta-blocker starts when the drug stops. Iron is considered before discharge for anemia from the blood lost (Baveno VIII 5.27). Child–Pugh B 8 with no active bleeding at endoscopy does not meet the pre-emptive TIPS criteria, which is why she has none. Banding is repeated every 2 to 4 weeks until the varices are gone. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Why is a rebleed on day 3 not counted as a new bleed?', 'Baveno VIII defines treatment failure as uncontrolled bleeding or a rebleed within 5 days of the first bleed.'],
    },
    {
      id: 'rebleed', action: { kind: 'rupture', tear: 0.6 }, cam: 'bleed', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'A rebleed within 5 days counts as treatment failure',
      line: 'On day 3 she vomits blood again, on octreotide and with the bands in place. Within minutes the heart rate climbs to {hr} and the blood pressure falls to {map}.',
      notes: 'A varix that bleeds again within 5 days of the first bleed means the first treatment did not work. The heart rate climbs and the blood pressure falls as before, but now the room has less reserve. Resuscitation restarts at once, and the endoscopist and the intensive care team are called. (Baveno VIII 5.16.)',
      ask: ['A patient is banded on Monday and vomits blood on Thursday. Is that treatment failure?', 'Yes: a rebleed within 5 days of the first bleed is treatment failure.'],
    },
    {
      id: 'failure', action: [UNIT, SALINE], cam: 'bleed', labels: ['VAR'], tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'Failure means uncontrolled bleeding or a rebleed by day 5',
      line: 'Failure means bleeding that drugs and endoscopy do not control, or a rebleed within 5 days. Blood and fluid go in: heart rate {hr}, blood pressure {map}.',
      notes: 'Baveno VIII defines treatment failure either as bleeding that stays uncontrolled or as a rebleed within 5 days. Failure, a Child–Pugh class C, and a high MELD score are the main risk factors for death in the next 6 weeks. Keep volume at the level that holds organ perfusion and transfuse to a hemoglobin of 7 to 8 g/dL, because extra volume raises the portal pressure. The model\'s bands always close an esophageal bleed, so this slide leaves the repeat band out to show a bleed that goes on. (Baveno VIII 5.16, 5.17.)',
      ask: ['Name two ways an acute variceal bleed counts as treatment failure.', 'Bleeding that stays uncontrolled despite drugs and endoscopy, or a rebleed within 5 days.'],
    },
    {
      // (The same algorithm for the second patient: her bleed is not controlled, so the path turns to the covered stent and the salvage TIPS.)
      id: 'path2', cam: 'bleed', labels: ['VAR'],
      tool: { kind: 'path', of: 'bleed', short: 'Bleed path', patient: { src: 'ov', cp: 8, active: false, ctrl: false, fit: true, hvpg: null } },
      kicker: 'Failure', site: 'sin', title: 'Her bleed is not controlled, so the path turns',
      line: 'The bands did not hold the bleed. The chart sends her to a covered stent as a bridge, then a salvage TIPS.',
      notes: 'The same algorithm, lit for the second patient. When banding and the drugs do not control a bleed from an esophageal varix, the pre-emptive TIPS criteria no longer apply: a dedicated covered self-expanding metal stent is preferred over a balloon tamponade as a bridge to TIPS or liver transplantation (5.35), and a failure to control the bleeding despite drugs and endoscopy is managed by a salvage TIPS (5.36). Salvage TIPS should be considered in every patient with refractory bleeding, whatever the age, Child–Pugh class or MELD score, case by case (5.37). The next slides show the bridge and the rescue.',
      ask: ['Where does the algorithm send a bleed that banding does not control?', 'To a dedicated covered stent, preferred over a balloon, as a bridge, and then to a salvage TIPS.'],
    },
    {
      id: 'bridge', params: { balloonGas: true }, action: [UNIT], cam: BALLOON_CAM, labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Tamponade', kind: 'treat' }, tool: REBEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'The bridge', site: 'sin', title: 'A stent or a balloon holds the bleed until a TIPS',
      line: 'A stent is the preferred bridge, a balloon tube the fallback. The gastric balloon goes up first, drawn against the cardia, and the bleed stops. Blood pressure recovers to {map}.',
      notes: 'In refractory esophageal variceal bleeding a dedicated covered self-expanding metal stent is preferred over balloon tamponade, as a bridge to a TIPS or a transplant. AASLD 2024 notes that a stent can stay in place for up to a week and a balloon for 24 hours at most, and that specialized esophageal stents were not FDA approved in the United States, so many US centers have only the balloon. Intubate before the tube or the stent goes in. A tube has two balloons. The gastric balloon is filled first, in the stomach, and the tube is pulled up so the balloon presses against the cardia; the esophageal balloon is filled only if the bleeding goes on. The model draws the tube, the gastric balloon first and the esophageal one a second step on the varices card; it has no stent. (Baveno VIII 5.35; AASLD 2024 34.)',
      ask: ['Why is a balloon tube or a stent a bridge and not a treatment?', 'It presses on the varix but leaves the portal pressure unchanged, so the bleeding returns when it comes out.'],
    },
    {
      id: 'rescue', params: { balloonGas: false, balloonEso: false, tips: { on: true } }, action: [{ kind: 'stopBleed' }], cam: 'liver', tool: { kind: 'profile', from: 'bridge', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['map', 'liver'], key: ['ppg'], delta: true, cite: 'Baveno VIII 5.36, 5.37',
      kicker: 'The rescue', site: 'sin', title: 'A rescue TIPS takes the pressure off the varix',
      line: 'A covered TIPS lowers the PPG to {ppg}, {<12 mmHg}, and the bleeding stops. Sinusoidal flow falls to {liver} of normal, mostly from the hepatic artery now.',
      notes: 'Baveno VIII recommends a salvage TIPS when bleeding cannot be controlled despite drugs and endoscopy, and AASLD 2024 calls it a rescue TIPS when the bleed returns despite vasoactive therapy and banding. The covered stent opens a channel from the portal vein to a hepatic vein, so most portal blood bypasses the liver. The gradient across the liver falls below the level where varices bleed, and the balloon can come out. Baveno VIII 5.37 says a salvage TIPS should be considered in every patient with refractory variceal bleeding, whatever the age, Child–Pugh class or MELD score, decided case by case; transplant candidacy is assessed at once. Hepatic encephalopathy is the main risk afterward, and many centers give lactulose or rifaximin from the start. (Baveno VIII 5.36, 5.37; AASLD 2024 35.)',
      ask: ['What does a rescue TIPS change that a stent or a balloon does not?', 'It lowers the portal pressure feeding the varix, so the bleeding stops for good.'],
    },
    {
      // (The relation chart before the summary: the patient before the bleed, blood taken away or given, each point read at once.
      // The hemoglobin lags the bleed in the model as in a patient, so the blood volume runs across rather than the hemoglobin.)
      id: 'relation', preset: 'cirr-decomp', cam: 'portal', labels: ['SMV', 'CONF'],
      tool: { kind: 'curve', x: 'bv', lines: ['pv', 'map'],
        points: [{ action: { kind: 'hemorrhage', mL: 1500 } }, { action: { kind: 'hemorrhage', mL: 1000 } }, { action: { kind: 'hemorrhage', mL: 500 } }, { action: [] },
          { action: [UNIT] }, { action: [UNIT, UNIT] }, { action: [UNIT, UNIT, UNIT] }] },
      kicker: 'Summary', title: 'Volume refills the portal pressure',
      line: 'Blood lost lowers the portal pressure along with the blood pressure. Given back past where he started, it raises the portal pressure while the blood pressure barely moves.',
      notes: 'The ring is the patient before the bleed. Leftward, blood is taken away; rightward, units of red cells are given on top of a full circulation. The portal pressure follows the volume both ways: the bleed lowers it, which is part of why bleeding slows, and every extra unit raises it again. The arterial pressure flattens past the start, so overfilling buys little blood pressure for a higher portal pressure and a higher risk of rebleeding. That is the case for a restrictive target: transfuse at a hemoglobin of 7 g/dL and aim for 7 to 8 (Baveno VIII 5.4; AASLD 2024 statement 28, about 7). Baveno VIII 5.23 adds that plasma for the clotting tests brings volume of its own and can raise the portal pressure. The hemoglobin is not on the axis because it lags: it falls only as fluid refills the vessels, hours after the blood is lost.',
      ask: ['His blood pressure is back to normal after two units, and his hemoglobin is 7.5 g/dL. Do you give a third?', 'No. He is at target; more volume raises the portal pressure and the risk of rebleeding for little gain in blood pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'hb', 'hbTo', 'pv', 'ppg'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'tear', kicker: K, title: 'The tear' }, { id: 'minutes', kicker: K, title: 'Shock, minutes later' }, { id: 'oct', kicker: 'Drug and volume', title: 'Octreotide, first unit' }, { id: 'blood', kicker: 'Volume', title: 'Second unit' }, { id: 'band', kicker: 'Scope', title: 'Banding' }, { id: 'tips', kicker: 'Shunt', title: 'Pre-emptive TIPS' }, { id: 'rebleed', kicker: 'Second patient, day 3', title: 'The rebleed' }, { id: 'rescue', kicker: 'Second patient', title: 'Rescue TIPS' }],
      kicker: 'Summary', title: 'Vital signs and portal pressure through the bleed',
      line: 'Heart rate and blood pressure track the volume; the hemoglobin lags. Portal pressure falls with the bleed and again with a TIPS. Her day 3 rebleed is treatment failure.',
      notes: 'The order of care: airway, volume with octreotide and an antibiotic, restrictive transfusion, endoscopy with banding within 12 hours, and a pre-emptive TIPS for the highest risk. The portal pressure falls with the blood loss and rises as volume returns, so the aim is a stable circulation, not a full one. A bleed that comes back within 5 days is treatment failure: bridge it with a covered stent or a balloon and consider a salvage TIPS in every patient, whatever the age, Child–Pugh class or MELD score, case by case (Baveno VIII 5.37). Assess transplant candidacy at once.',
      ask: ['Put these in order: banding, octreotide, transfusion to 7 g/dL, ceftriaxone.', 'Octreotide (or terlipressin) and ceftriaxone at once, transfusion as needed, banding within 12 hours.'],
    },
  ],
};
