// Presenter talk: acute variceal bleeding as a resuscitation, beat by beat on the live trace
// (the slide fields are described at the top of decks.js). Each slide's actions run with the bleed still open,
// so a slide that only lets time pass (action: []) loses a few more minutes of blood.

const K = 'The bleed';
const BEATS = { kind: 'trace', range: 'beats' };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' }, UNIT = { kind: 'infuse', fluid: 'prbc' }, BAND = { kind: 'band' };

export const BLEED = {
  id: 'variceal-bleed', level: 'core', title: 'Resuscitating an acute variceal bleed', minutes: 8,
  objectives: [
    'Read early shock from heart rate and blood pressure, not hemoglobin, and know what blunts them',
    'Give octreotide and antibiotics before endoscopy',
    'Transfuse to a hemoglobin of 7 to 8 g/dL and explain why not more',
    'Name the patients who need a pre-emptive TIPS',
  ],
  checks: [
    ['What shows shock early in a variceal bleed?', 'The heart rate and blood pressure. The hemoglobin falls only later, as fluid refills the vessels, and a beta-blocker can blunt the heart rate.'],
    ['What do you start before the endoscopy?', 'Octreotide, a 50 µg bolus then 50 µg an hour, and ceftriaxone 1 g a day.'],
    ['Within how long does a high-risk patient get a TIPS?', 'Within 72 hours, ideally within 24.'],
  ],
  sections: [['Before the bleed', ['Before']], ['The bleed', ['The bleed']], ['Drugs and volume', ['Before the scope', 'Volume']], ['The scope', ['Endoscopy']], ['After the scope', ['After the scope']]],
  summary: 'One bleed from tear to TIPS: early shock with a normal hemoglobin, octreotide and volume before the scope, restrictive transfusion, banding and a pre-emptive TIPS.',
  slides: [
    {
      id: 'before', terms: ['varix'], preset: 'cirr-decomp', cam: 'varices', labels: ['VAR', 'AZY'], mark: { edges: ['C1a', 'C1b'], label: 'Large varix', kind: 'note' }, tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'],
      kicker: 'Before', site: 'sin', title: 'Large varices under pressure',
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis has ascites on spironolactone and furosemide and large esophageal varices. He was prescribed carvedilol but stopped taking it.',
      line: 'Decompensated cirrhosis with a varix of {varix} and a portal pressure of {pv}. The wall is thin and the tension high.',
      notes: 'The patient has the features that predict a bleed: large varices, red wale marks on the scope, and Child–Pugh B or C. Prevention would have been a non-selective beta-blocker (carvedilol) or banding. The trace on the right runs live, beat by beat, for the rest of the talk.',
      ask: ['Name three features that predict a first variceal bleed.', 'Large varices, red signs on the varix and advanced liver disease (Child–Pugh B or C).'],
    },
    {
      id: 'tear', action: { kind: 'rupture', tear: 0.35 }, cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['hr'], delta: true,
      kicker: K, site: 'sin', title: 'The varix tears',
      line: 'Blood pours into the esophagus. The heart rate usually rises first, unless a beta-blocker blunts it. Blood pressure is still normal at this stage.',
      notes: 'Hematemesis or melena in a patient with cirrhosis is variceal until proved otherwise. Lost volume is replaced first by a faster heart and tighter arterioles, so the blood pressure falls late. A beta-blocker such as carvedilol blunts the rise in heart rate, and admission heart rate is neither sensitive nor specific for a large bleed, so a normal pulse does not reassure. A heart rate over 100 or a systolic pressure below 100 means a large bleed. Place two large cannulas, send blood for cross-match, and call the endoscopist and the intensive care team. Hold the diuretics and any beta-blocker while the bleed is active.',
      ask: ['A man on carvedilol vomits blood. His pulse is 88 and his blood pressure 100/60. Is he stable?', 'Not necessarily. Carvedilol blunts the rise in heart rate, and his usual pressure may be low. Judge by the trend, the blood seen, the lactate and a postural drop.'],
    },
    {
      id: 'minutes', action: [], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['hr', 'hb'], key: ['hb'], delta: true,
      kicker: K, site: 'sin', title: 'Shock before anemia',
      line: 'Minutes later the heart rate is {hr} and the blood pressure has fallen to {map}. The hemoglobin has not moved: it falls only as fluid refills the vessels over hours.',
      notes: 'Whole blood is lost, red cells and plasma together, so the first hemoglobin is close to normal even in shock. It falls over the next 24 to 72 hours as fluid moves in from the tissues and from the infusions. Judge the bleed by the pulse, the blood pressure, the urine output and the lactate. Intubate before the scope when encephalopathy clouds consciousness or large amounts of blood keep coming up.',
      ask: ['A hemoglobin of 13.5 g/dL in a patient vomiting blood with a pulse of 140. Is the bleed small?', 'No: the hemoglobin lags. The pulse says the bleed is large.'],
    },
    {
      id: 'oct', params: { drugs: { octreotide: true } }, action: [UNIT, SALINE], cam: 'portal', labels: ['SMV', 'CONF'], tool: BEATS, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: true,
      kicker: 'Before the scope', site: 'sin', title: 'Octreotide and volume start together',
      line: 'Start octreotide, a 50 µg bolus then 50 µg an hour for 2 to 5 days, with ceftriaxone 1 g a day. The first unit and a liter of fluid run in, but the bleed still outpaces them and the blood pressure falls to {map}.',
      notes: 'Start the vasoactive drug, the first unit and the first fluid together, as soon as a variceal bleed is suspected. Octreotide, a somatostatin analogue: a 50 microgram bolus, then 50 micrograms an hour for 2 to 5 days. Give ceftriaxone 1 g a day as well, for up to 5 days (AASLD stops it at discharge if that comes sooner): antibiotics lower infection, rebleeding and death. Erythromycin 250 mg IV, 30 to 90 minutes before the scope, clears the stomach of blood. Baveno VIII allows stopping the vasoactive drug as early as 24 hours after successful banding once a beta-blocker starts, and a shorter antibiotic course, or none, in Child–Pugh A. Outside the US, terlipressin or somatostatin are used in its place. The portal pressure here falls with the blood loss too; in the model octreotide adds about 1 mmHg of that fall.',
      ask: ['In the US, which drugs start before the endoscopy, and what does each do?', 'Octreotide lowers the portal pressure; ceftriaxone cuts infection, rebleeding and death; erythromycin clears the stomach for the scope.'],
    },
    {
      id: 'blood', action: [UNIT], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['map', 'hb'], key: ['map'], delta: true,
      kicker: 'Volume', site: 'sin', title: 'Transfuse to a hemoglobin of 7 to 8',
      line: 'A second unit brings the blood pressure up to {map}. The hemoglobin has barely moved, because it lags the bleed. Once the circulation is stable, transfuse only below 7 g/dL, to a target of 7 to 8.',
      notes: 'A restrictive transfusion strategy (transfusing below 7 g/dL, to a target of 7 to 9 in the trial, 7 to 8 in Baveno VIII and about 7 in AASLD guidance) lowered rebleeding and death compared with a liberal one (transfusing below 9 g/dL, to a target of 9 to 11). It applies once the patient is stable, and the trial excluded massive bleeding. Volume beyond what the circulation needs pushes the portal pressure back toward its level before the bleed, which makes an early rebleed more likely; it also worsens ascites and can cause pulmonary edema. In cirrhosis saline adds sodium, so a balanced crystalloid, given with care, is a common choice. Patients with heart disease or ongoing massive bleeding may need more. Fresh frozen plasma and platelet transfusion to correct the INR or the count are not advised; they add volume without proven benefit.',
      ask: ['What hemoglobin target is used in variceal bleeding, and why not more?', '7 to 8 g/dL, transfusing below 7. Extra volume raises the portal pressure and the risk of an early rebleed.'],
    },
    {
      id: 'band', terms: ['varix'], action: [BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'Bands stop the bleeding',
      line: 'Endoscopy within 12 hours, as soon as the blood pressure holds. Banding does not lower portal pressure, and the HVPG rises slightly as the varix closes. If bleeding continues, an esophageal stent or a balloon tube bridges to a rescue TIPS.',
      notes: 'Band ligation controls most variceal bleeds. If bleeding cannot be controlled, a covered self-expanding esophageal stent (preferred over a balloon tube where available) buys time as a bridge to a rescue TIPS. Banding does not lower the portal pressure; over the following days it raises the HVPG slightly as the varix closes.',
      ask: ['What bridges a bleed that banding cannot control?', 'A covered esophageal stent (preferred) or a balloon tube, as a bridge to a rescue TIPS.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, cam: 'liver', tool: BEATS, data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'], delta: true,
      kicker: 'After the scope', site: 'sin', title: 'High-risk patients get a TIPS within 72 hours',
      causesHead: 'Who gets it', causes: ['Child–Pugh C, 10 to 13 points', 'Child–Pugh B, over 7, with active bleeding at endoscopy', 'HVPG 20 mmHg or more, where measured'],
      line: 'In this case, bilirubin 3.2 mg/dL, INR 1.9, albumin 2.8 g/dL and ascites give Child–Pugh C 10, so he qualifies. A covered TIPS, ideally within 24 hours, lowers the PPG to {ppg} and reduces rebleeding and death.',
      notes: 'Child–Pugh points in this case: bilirubin 3, INR 2, albumin 2, ascites 2 and no encephalopathy 1, for a total of 10. Baveno VIII: in high-risk patients a pre-emptive TIPS, ideally within 24 hours and no later than 72, reduces rebleeding and death. An HVPG of 20 mmHg or more, where measured, also marks high risk. A patient who misses the 72-hour window can still benefit from a TIPS placed later, up to about 1 week in Child–Pugh B and 2 weeks in Child–Pugh C. For everyone else, after the acute bleed: a non-selective beta-blocker with repeated banding every 2 to 4 weeks until the varices are gone. Rescue TIPS is for bleeding that drugs and banding do not control.',
      ask: ['Which patients get a pre-emptive TIPS after a variceal bleed?', 'Child–Pugh C 10 to 13, or Child–Pugh B over 7 with active bleeding at endoscopy.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'hb', 'pv', 'ppg'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'tear', kicker: K, title: 'The tear' }, { id: 'minutes', kicker: K, title: 'Shock, minutes later' }, { id: 'oct', kicker: 'Drug and volume', title: 'Octreotide, first unit' }, { id: 'blood', kicker: 'Volume', title: 'Second unit' }, { id: 'band', kicker: 'Scope', title: 'Banding' }, { id: 'tips', kicker: 'Shunt', title: 'Pre-emptive TIPS' }],
      kicker: 'Summary', title: 'Vital signs and portal pressure through the bleed',
      line: 'The heart rate and blood pressure track the volume, while the hemoglobin barely moves in the first hours. The portal pressure falls with the bleed, climbs as volume returns and drops with the TIPS.',
      notes: 'The order of care: airway, volume with octreotide and an antibiotic, restrictive transfusion, endoscopy with banding within 12 hours, and a pre-emptive TIPS for the highest risk. The portal pressure falls with the blood loss and rises as volume returns, so the aim is a stable circulation, not a full one.',
      ask: ['Put these in order: banding, octreotide, transfusion to 7 g/dL, ceftriaxone.', 'Octreotide and ceftriaxone at once, transfusion as needed, banding within 12 hours.'],
    },
  ],
};
