// Presenter talk: acute variceal bleeding as a resuscitation, beat by beat on the live trace, from the tear to the TIPS and on to the
// bleed that will not stop (the slide fields are described at the top of decks.js). Each slide's actions run with the bleed still
// open, so a slide that only lets time pass (action: []) loses a few more minutes of blood. The last section is a second case: a bleed
// that octreotide and bands controlled comes back by day 5, and the bleed stays open until the slide that stops it.

const K = 'The bleed';
const BEATS = { kind: 'trace', range: 'beats' };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' }, UNIT = { kind: 'infuse', fluid: 'prbc' }, BAND = { kind: 'band' };

export const BLEED = {
  id: 'variceal-bleed', level: 'core', title: 'Resuscitating an acute variceal bleed', minutes: 12,
  objectives: [
    'Read early shock from heart rate and blood pressure, not hemoglobin, and know what blunts them',
    'Give octreotide and antibiotics before endoscopy',
    'Transfuse to a hemoglobin of 7 to 8 g/dL and explain why not more',
    'Name who needs a pre-emptive TIPS, and what to do when the bleed will not stop',
  ],
  checks: [
    ['What shows shock early in a variceal bleed?', 'The heart rate and blood pressure. The hemoglobin falls only later, as fluid refills the vessels, and a beta-blocker can blunt the heart rate.'],
    ['Minutes after octreotide starts, the portal pressure falls by about 2 mmHg, with no change in the liver. Which lever moved?', 'Inflow: octreotide constricts the gut arterioles, so less blood enters the portal vein. The resistance in the liver is unchanged.'],
    ['To what hemoglobin do you transfuse in a variceal bleed?', '7 to 8 g/dL, transfusing below 7. More volume raises the portal pressure and the risk of rebleeding.'],
    ['A man is banded on Monday and vomits blood again on Thursday. What is that, and what comes next?', 'Treatment failure, because the rebleed is within 5 days. A covered esophageal stent or a balloon bridges the bleed to a rescue TIPS.'],
  ],
  sections: [['Before the bleed', ['Before']], ['The bleed', ['The bleed']], ['Drugs and volume', ['Before the scope', 'Volume']], ['The scope', ['Endoscopy', 'After the scope']], ['If it does not stop', ['Failure', 'The bridge', 'The rescue']]],
  summary: 'One bleed from tear to TIPS: early shock with a normal hemoglobin, octreotide and volume before the scope, restrictive transfusion, banding and a pre-emptive TIPS; then the bleed that comes back by day 5, the stent or balloon that bridges, and the rescue TIPS.',
  slides: [
    {
      id: 'before', terms: ['varix'], preset: 'cirr-decomp', params: { respiration: false }, cam: 'varices', labels: ['VAR', 'AZY'], mark: { edges: ['C1a', 'C1b'], label: 'Large varix', kind: 'note' }, calipers: ['varix'], tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'],
      kicker: 'Before', site: 'sin', title: 'Large varices under pressure',
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis has ascites on spironolactone and furosemide and large esophageal varices. He was prescribed carvedilol but stopped taking it.',
      line: 'Decompensated cirrhosis with a varix of {varix} and a portal pressure of {pv}. The wall is thin and the stress on it high.',
      notes: 'This case has the features that predict a bleed: large varices, red wale marks on the scope, and Child–Pugh B or C. Prevention would have been a non-selective beta-blocker (carvedilol) or banding. The trace on the right runs live, beat by beat, for the rest of the talk. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Name three features that predict a first variceal bleed.', 'Large varices, red signs on the varix and advanced liver disease (Child–Pugh B or C).'],
    },
    {
      id: 'tear', clock: { at: 0, label: 'The bleed starts' }, action: { kind: 'rupture', tear: 0.35 }, cam: 'bleed', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: K, site: 'sin', title: 'The varix tears',
      line: 'Blood pours into the esophagus. The heart rate usually rises first, unless a beta-blocker blunts it. Blood pressure is still normal at this stage.',
      notes: 'Hematemesis or melena in a patient with cirrhosis is variceal until proved otherwise. Lost volume is replaced first by a faster heart and tighter arterioles, so the blood pressure falls late. A beta-blocker such as carvedilol blunts the rise in heart rate, and admission heart rate is neither sensitive nor specific for a large bleed, so a normal pulse does not reassure. A heart rate over 100 or a systolic pressure below 100 means a large bleed. Place two large cannulas, send blood for cross-match, and call the endoscopist and the intensive care team. Hold the diuretics and any beta-blocker while the bleed is active.',
      ask: ['A man on carvedilol vomits blood. His pulse is 88 and his blood pressure 100/60. Is he stable?', 'Not necessarily. Carvedilol blunts the rise in heart rate, and his usual pressure may be low. Judge by the trend, the blood seen, the lactate and a postural drop.'],
    },
    {
      id: 'minutes', clock: { at: 0.2, label: 'Minutes in' }, question: 'His pulse is racing. Has the hemoglobin fallen yet?', action: [], cam: 'bleed', tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['hb'], delta: 'before',
      kicker: K, site: 'sin', title: 'Shock before anemia',
      line: 'Minutes later the heart rate is {hr} and the blood pressure has fallen to {map}. The hemoglobin has not moved: it falls only as fluid refills the vessels over hours.',
      notes: 'Whole blood is lost, red cells and plasma together, so the first hemoglobin is close to normal even in shock. It falls over the next 24 to 72 hours as fluid moves in from the tissues and from the infusions. Judge the bleed by the pulse, the blood pressure, the urine output and the lactate. Intubate before the scope when encephalopathy clouds consciousness or large amounts of blood keep coming up.',
      ask: ['A hemoglobin of 13.5 g/dL in a patient vomiting blood with a pulse of 140. Is the bleed small?', 'No: the hemoglobin lags. The pulse says the bleed is large.'],
    },
    {
      id: 'oct', clock: { at: 0.5, label: 'Drugs at once' }, params: { drugs: { octreotide: true } }, action: [UNIT, SALINE], cam: 'portal', labels: ['SMV', 'CONF'], ripple: true, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      compare: [{ label: 'No drug', params: { drugs: { octreotide: false, terlipressin: false } } }, { label: 'Octreotide', own: true, params: { drugs: { octreotide: true, terlipressin: false } } }, { label: 'Terlipressin', params: { drugs: { octreotide: false, terlipressin: true } } }],
      kicker: 'Before the scope', site: 'sin', title: 'Octreotide and volume start together',
      line: 'Octreotide (50 µg, then 25 to 50 µg an hour) and ceftriaxone 1 g a day start, but the bleed outpaces the fluids: the blood pressure falls to {map}.',
      notes: 'Start the vasoactive drug, the first unit and the first fluid together, as soon as a variceal bleed is suspected. Octreotide, a somatostatin analogue: a 50 microgram bolus, then 25 to 50 micrograms an hour for 2 to 5 days. Give ceftriaxone 1 g a day as well, for up to 5 days (AASLD stops it at discharge if that comes sooner): antibiotics lower infection, rebleeding and death. Erythromycin 250 mg IV, 30 to 90 minutes before the scope, clears the stomach of blood. Baveno VIII allows stopping the vasoactive drug as early as 24 hours after successful banding once a beta-blocker starts, and a shorter antibiotic course, or none, in Child–Pugh A. Outside the US, terlipressin or somatostatin are used in its place. The portal pressure here falls with the blood loss too; in the model octreotide adds about 1 mmHg of that fall. A unit of blood and a liter of fluid run in.',
      ask: ['In the US, which drugs start before the endoscopy, and what does each do?', 'Octreotide lowers the portal pressure; ceftriaxone cuts infection, rebleeding and death; erythromycin clears the stomach for the scope.'],
    },
    {
      id: 'blood', clock: { at: 2, label: 'Transfuse to 7 to 8' }, action: [UNIT], cam: 'bleed', tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'before',
      kicker: 'Volume', site: 'sin', title: 'Transfuse to a hemoglobin of 7 to 8',
      line: 'A second unit lifts the blood pressure to {map}. The hemoglobin lags the bleed and has barely moved. Once stable, transfuse only below 7 g/dL, aiming for 7 to 8.',
      notes: 'A restrictive transfusion strategy (transfusing below 7 g/dL, to a target of 7 to 9 in the trial, 7 to 8 in Baveno VIII and about 7 in AASLD guidance) lowered rebleeding and death compared with a liberal one (transfusing below 9 g/dL, to a target of 9 to 11). It applies once the patient is stable, and the trial excluded massive bleeding. Volume beyond what the circulation needs pushes the portal pressure back toward its level before the bleed, which makes an early rebleed more likely; it also worsens ascites and can cause pulmonary edema. In cirrhosis saline adds sodium, so a balanced crystalloid, given with care, is a common choice. Patients with heart disease or ongoing massive bleeding may need more. Fresh frozen plasma and platelet transfusion to correct the INR or the count are not advised; they add volume without proven benefit. (Baveno VIII 5.4.)',
      ask: ['What hemoglobin target is used in variceal bleeding, and why not more?', '7 to 8 g/dL, transfusing below 7. Extra volume raises the portal pressure and the risk of an early rebleed.'],
    },
    {
      id: 'band', clock: { at: 10, label: 'Scope by 12 h' }, question: 'Will banding lower his portal pressure?', terms: ['varix'], action: [BAND, BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: { kind: 'scope' }, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: 'blood',
      kicker: 'Endoscopy', site: 'sin', title: 'Bands stop the bleeding',
      line: 'Endoscopy within 12 hours, once the blood pressure holds. The bands close the varix and the bleeding stops, but the portal pressure does not fall.',
      notes: 'Band ligation controls most variceal bleeds. Banding does not lower the portal pressure; over the following days it raises the HVPG slightly as the varix closes. The scope shows the bleed as the slide arrives, and the jet fades as the bands go on. If bleeding cannot be controlled, a covered self-expanding esophageal stent (preferred over a balloon tube where available) buys time as a bridge to a rescue TIPS, which the last section of this talk follows.',
      ask: ['What bridges a bleed that banding cannot control?', 'A covered esophageal stent (preferred) or a balloon tube, as a bridge to a rescue TIPS.'],
    },
    {
      id: 'tips', clock: { at: 24, label: 'TIPS by 72 h' }, params: { tips: { on: true } }, cam: 'liver', ripple: true, data: 'tiles',
      tool: { kind: 'criteria', title: 'Who gets a pre-emptive TIPS', short: 'Who gets it', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31',
        rows: [{ text: 'Child–Pugh C, **10 to 13** points', cut: 'C 10–13', note: 'C 10', met: true, lit: true },
          { text: 'Child–Pugh B, **over 7**, with active bleeding at endoscopy', cut: 'B 8–9', note: 'not B' }, { text: 'HVPG **20 mmHg** or more, where measured', cut: '20 mmHg', note: 'not given' }],
        verdict: 'He qualifies on the first rule: a TIPS within 72 hours.' }, tiles: ['ppg', 'varix'], key: ['ppg'], delta: true,
      kicker: 'After the scope', site: 'sin', title: 'High-risk patients get a TIPS within 72 hours',
      line: 'Child–Pugh C 10 (bilirubin 3.2 mg/dL, INR 1.9, albumin 2.8 g/dL, ascites) qualifies him. A covered TIPS within 24 hours lowers the PPG to {ppg} and cuts rebleeding and death.',
      notes: 'Child–Pugh points in this case: bilirubin 3, INR 2, albumin 2, ascites 2 and no encephalopathy 1, for a total of 10. Baveno VIII: in high-risk patients a pre-emptive TIPS, ideally within 24 hours and no later than 72, reduces rebleeding and death. An HVPG of 20 mmHg or more, where measured, also marks high risk. A patient who misses the 72-hour window can still benefit from a TIPS placed later, up to about 1 week in Child–Pugh B and 2 weeks in Child–Pugh C. For everyone else, after the acute bleed: a non-selective beta-blocker with repeated banding every 2 to 4 weeks until the varices are gone. Rescue TIPS is for bleeding that drugs and banding do not control. (Baveno VIII 5.31.)',
      ask: ['Which patients get a pre-emptive TIPS after a variceal bleed?', 'Child–Pugh C 10 to 13, or Child–Pugh B over 7 with active bleeding at endoscopy.'],
    },
    {
      id: 'controlled', preset: 'cirr-decomp', params: { drugs: { octreotide: true }, respiration: false }, action: [BAND], cam: 'varices', labels: ['VAR'], tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'],
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis vomited blood two days ago. Octreotide, ceftriaxone and band ligation stopped the bleeding, and he is on the ward.',
      kicker: 'Failure', site: 'sin', title: 'The first bleed is controlled, for now',
      line: 'Banding and octreotide stopped the bleed, and the heart rate is {hr}. Until day 5, a new bleed would count as treatment failure, not as a new event.',
      notes: 'The first days after a variceal bleed carry the highest risk of a rebleed. Octreotide continues for 2 to 5 days, ceftriaxone for up to 5 days, and a non-selective beta-blocker starts when the drug stops. Banding is repeated every 2 to 4 weeks until the varices are gone. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Why is a rebleed on day 3 not counted as a new bleed?', 'Baveno VIII defines treatment failure as uncontrolled bleeding or a rebleed within 5 days of the first bleed.'],
    },
    {
      id: 'rebleed', action: { kind: 'rupture', tear: 0.6 }, cam: 'bleed', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'A rebleed within 5 days counts as treatment failure',
      line: 'On day 3 he vomits blood again, on octreotide and with the bands in place. Within minutes the heart rate climbs to {hr} and the blood pressure falls to {map}.',
      notes: 'A varix that bleeds again within 5 days of the first bleed means the first treatment did not work. The heart rate climbs and the blood pressure falls as before, but now the room has less reserve. Resuscitation restarts at once, and the endoscopist and the intensive care team are called. (Baveno VIII 5.16.)',
      ask: ['A patient is banded on Monday and vomits blood on Thursday. Is that treatment failure?', 'Yes: a rebleed within 5 days of the first bleed is treatment failure.'],
    },
    {
      id: 'failure', action: [UNIT, SALINE], cam: 'bleed', labels: ['VAR'], tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'Failure', site: 'sin', title: 'Failure means uncontrolled bleeding or a rebleed by day 5',
      line: 'Failure means bleeding that drugs and endoscopy do not control, or a rebleed within 5 days. Blood and fluid go in: heart rate {hr}, blood pressure {map}.',
      notes: 'Baveno VIII defines treatment failure either as bleeding that stays uncontrolled or as a rebleed within 5 days. Failure, a Child–Pugh class C, and a high MELD score are the main risk factors for death in the next 6 weeks. Keep volume at the level that holds organ perfusion and transfuse to a hemoglobin of 7 to 8 g/dL, because extra volume raises the portal pressure. The model\'s bands always close an esophageal bleed, so this slide leaves the repeat band out to show a bleed that goes on. (Baveno VIII 5.16, 5.17.)',
      ask: ['Name two ways an acute variceal bleed counts as treatment failure.', 'Bleeding that stays uncontrolled despite drugs and endoscopy, or a rebleed within 5 days.'],
    },
    {
      id: 'bridge', params: { balloonEso: true }, action: [UNIT], cam: 'varices', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Tamponade', kind: 'treat' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: 'controlled',
      kicker: 'The bridge', site: 'sin', title: 'A stent or a balloon holds the bleed until a TIPS',
      line: 'A covered esophageal stent is the preferred bridge, a balloon tube the fallback. Pressure on the varix stops the bleed and the blood pressure recovers to {map}.',
      notes: 'In refractory esophageal variceal bleeding a dedicated covered self-expanding metal stent is preferred over balloon tamponade, as a bridge to a TIPS or a transplant. AASLD 2024 notes that a stent can stay in place for up to a week and a balloon for 24 hours at most, and that specialized esophageal stents were not FDA approved in the United States, so many US centers have only the balloon. Intubate before the tube or the stent goes in. The model draws the tamponade of a balloon; it has no stent. (Baveno VIII 5.35; AASLD 2024 34.)',
      ask: ['Why is a balloon tube or a stent a bridge and not a treatment?', 'It presses on the varix but leaves the portal pressure unchanged, so the bleeding returns when it comes out.'],
    },
    {
      id: 'rescue', params: { balloonEso: false, tips: { on: true } }, action: [{ kind: 'stopBleed' }], cam: 'liver', tool: { kind: 'profile', from: 'bridge', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['map', 'liver'], key: ['ppg'], delta: true,
      kicker: 'The rescue', site: 'sin', title: 'A rescue TIPS takes the pressure off the varix',
      line: 'A covered TIPS lowers the PPG to {ppg}, under {<12 mmHg}, and the bleeding stops. The price is the liver\'s blood supply: it keeps {liver} of its normal flow.',
      notes: 'Baveno VIII recommends a salvage TIPS when bleeding cannot be controlled despite drugs and endoscopy, and AASLD 2024 calls it a rescue TIPS when the bleed returns despite vasoactive therapy and banding. The covered stent opens a channel from the portal vein to a hepatic vein, so most portal blood bypasses the liver. The gradient across the liver falls below the level where varices bleed, and the balloon can come out. No age, Child–Pugh class or MELD score rules a rescue TIPS out by itself: it is considered case by case, and transplant candidacy is assessed at once, because death rates stay high at a high MELD. Hepatic encephalopathy is the main risk afterward, and many centers give lactulose or rifaximin from the start. (Baveno VIII 5.36, 5.37; AASLD 2024 35.)',
      ask: ['What does a rescue TIPS change that a stent or a balloon does not?', 'It lowers the portal pressure feeding the varix, so the bleeding stops for good.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'hb', 'pv', 'ppg'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'tear', kicker: K, title: 'The tear' }, { id: 'minutes', kicker: K, title: 'Shock, minutes later' }, { id: 'oct', kicker: 'Drug and volume', title: 'Octreotide, first unit' }, { id: 'blood', kicker: 'Volume', title: 'Second unit' }, { id: 'band', kicker: 'Scope', title: 'Banding' }, { id: 'tips', kicker: 'Shunt', title: 'Pre-emptive TIPS' }, { id: 'rebleed', kicker: 'Day 3', title: 'The rebleed' }, { id: 'rescue', kicker: 'The rescue', title: 'Rescue TIPS' }],
      kicker: 'Summary', title: 'Vital signs and portal pressure through the bleed',
      line: 'Heart rate and blood pressure track the volume; the hemoglobin lags. Portal pressure falls with the bleed and again with a TIPS. A rebleed within 5 days is treatment failure.',
      notes: 'The order of care: airway, volume with octreotide and an antibiotic, restrictive transfusion, endoscopy with banding within 12 hours, and a pre-emptive TIPS for the highest risk. The portal pressure falls with the blood loss and rises as volume returns, so the aim is a stable circulation, not a full one. A bleed that comes back within 5 days is treatment failure: bridge it with a covered stent or a balloon and place a rescue TIPS without waiting for a score to decide. Assess transplant candidacy at once.',
      ask: ['Put these in order: banding, octreotide, transfusion to 7 g/dL, ceftriaxone.', 'Octreotide and ceftriaxone at once, transfusion as needed, banding within 12 hours.'],
    },
  ],
};
