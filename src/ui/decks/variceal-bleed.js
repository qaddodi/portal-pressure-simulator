// Presenter talk: acute variceal bleeding as a resuscitation, beat by beat on the live trace
// (the slide fields are described at the top of decks.js). Each slide's actions run with the bleed still open,
// so a slide that only lets time pass (action: []) loses a few more minutes of blood.

const K = 'The bleed';
const BEATS = { kind: 'trace', range: 'beats' };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' }, UNIT = { kind: 'infuse', fluid: 'prbc' }, BAND = { kind: 'band' };

export const BLEED = {
  id: 'variceal-bleed', level: 'core', title: 'Acute variceal bleeding as a resuscitation', minutes: 8,
  objectives: [
    'Read early shock from the heart rate and blood pressure, not the hemoglobin',
    'Give octreotide and antibiotics before endoscopy',
    'Transfuse to a hemoglobin of 7 to 8 g/dL and explain why not more',
    'Name the patients who need a pre-emptive TIPS',
  ],
  sections: [['Before the bleed', ['Before']], ['The bleed', ['The bleed']], ['Drugs and the scope', ['Before the scope', 'Endoscopy']], ['Volume', ['Volume']], ['After the scope', ['After the scope']]],
  summary: 'One bleed from tear to TIPS: early shock with a normal hemoglobin, octreotide before the scope, banding, restrictive transfusion and why overfilling raises the portal pressure.',
  slides: [
    {
      id: 'before', preset: 'cirr-decomp', cam: 'varices', labels: ['AZY'], tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['varix'],
      kicker: 'Before', site: 'sin', title: 'Large varices under pressure',
      line: 'Decompensated cirrhosis with an 8 mm varix and a portal pressure of 23 mmHg. The wall is thin and the tension high.',
      notes: 'This patient has the features that predict a bleed: large varices, red wale marks on the scope, Child–Pugh B or C, and an HVPG of 12 mmHg or more. Prevention would have been a non-selective beta-blocker (carvedilol) or banding. The trace on the right runs live, beat by beat, for the rest of the talk.',
      ask: ['Name three features that predict a first variceal bleed.', 'Large varices, red signs on the varix and advanced liver disease (Child–Pugh B or C).'],
    },
    {
      id: 'tear', action: { kind: 'rupture', tear: 0.3 }, cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['hr'], delta: true,
      kicker: K, site: 'sin', title: 'The varix tears',
      line: 'Blood pours into the esophagus. The heart rate rises first; the blood pressure is still holding.',
      notes: 'Hematemesis or melena in a patient with cirrhosis is variceal until proved otherwise. Lost volume is replaced first by a faster heart and tighter arterioles, so the blood pressure falls late. A heart rate over 100 or a systolic pressure below 100 means a large bleed. Two large cannulas, blood for cross-match, and a call to the endoscopist and the intensive care team.',
      ask: ['Which sign of blood loss comes first?', 'A rising heart rate. The blood pressure is held until much more blood is lost.'],
    },
    {
      id: 'minutes', action: [], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['hr', 'hb'], key: ['hb'], delta: true,
      kicker: K, site: 'sin', title: 'Shock before anemia',
      line: 'Minutes later the heart rate is over 150 and the blood pressure has fallen. The hemoglobin has not moved: it falls only as fluid refills the vessels over hours.',
      notes: 'Whole blood is lost, red cells and plasma together, so the first hemoglobin is close to normal even in shock. It falls over the next 24 to 72 hours as fluid moves in from the tissues and from the infusions. Judge the bleed by the pulse, the blood pressure, the urine output and the lactate. Protect the airway when the patient is confused or vomiting blood.',
      ask: ['A hemoglobin of 13.5 g/dL in a patient vomiting blood with a pulse of 140. Is the bleed small?', 'No: the hemoglobin lags. The pulse says the bleed is large.'],
    },
    {
      id: 'oct', params: { drugs: { octreotide: true } }, cam: 'portal', labels: ['SMV', 'CONF'], tool: BEATS, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: true,
      kicker: 'Before the scope', site: 'sin', title: 'Octreotide at once',
      line: 'Start it as soon as a variceal bleed is suspected, before endoscopy. It narrows the gut arterioles and cuts the inflow to the varices.',
      notes: 'Octreotide, a somatostatin analogue: a 50 microgram bolus, then 50 micrograms an hour for 2 to 5 days. Give ceftriaxone 1 g a day as well, for up to 7 days: antibiotics lower infection, rebleeding and death. Erythromycin before the scope clears the stomach. The portal pressure here falls with the blood loss too; in the model octreotide adds about 1 mmHg of that fall.',
      ask: ['Which two drugs start before the endoscopy?', 'Octreotide and an antibiotic, usually ceftriaxone.'],
    },
    {
      id: 'band', action: [BAND, BAND, BAND], cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Banded varices' }, tool: BEATS, data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'Bands stop the bleeding',
      line: 'Endoscopy within 12 hours, once the patient is stable. Bands on the bleeding varix stop the loss, but the blood pressure stays low until volume is given.',
      notes: 'Band ligation controls most variceal bleeds. If bleeding cannot be controlled, a balloon tube or a self-expanding esophageal stent buys time as a bridge to a rescue TIPS. Banding does not lower the portal pressure; over the following days it raises the HVPG slightly as the varix closes.',
      ask: ['What bridges a bleed that banding cannot control?', 'A balloon tube or an esophageal stent, as a bridge to a rescue TIPS.'],
    },
    {
      id: 'blood', action: [UNIT, SALINE], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: true,
      kicker: 'Volume', site: 'sin', title: 'Restrictive transfusion',
      line: 'One unit and a liter of saline bring the blood pressure back to about 64. Transfuse when the hemoglobin falls below {7 g/dL}, to a target of 7 to 8.',
      notes: 'A restrictive transfusion strategy (a threshold of 7 g/dL, a target of 7 to 8) lowered rebleeding and death compared with transfusing to 9 g/dL. Patients with heart disease or ongoing massive bleeding may need more. Fresh frozen plasma and platelet transfusion to correct the INR or the count are not advised; they add volume without proven benefit.',
      ask: ['What hemoglobin target is used in variceal bleeding?', '7 to 8 g/dL, transfusing below 7.'],
    },
    {
      id: 'over', action: [SALINE, SALINE, SALINE, UNIT, UNIT, UNIT], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['pv', 'varix'], key: ['pv'], delta: true,
      kicker: 'Volume', site: 'sin', title: 'Over-transfusion raises the portal pressure',
      line: 'Three more liters and three more units push the portal pressure back to about {23 mmHg}, where it was before the bleed. The banded varix is under pressure again.',
      notes: 'Portal pressure follows the blood volume. Refilling beyond what the circulation needs raises it back up and with it the tension in the varices and the risk of an early rebleed. It also worsens ascites and can push the patient into pulmonary edema. Aim for a mean arterial pressure of about 65 and good urine output, not a normal blood pressure at any cost.',
      ask: ['Why can over-transfusion cause a rebleed?', 'Extra volume raises the portal pressure and the tension in the varix wall.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, cam: 'liver', tool: BEATS, data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'], delta: true,
      kicker: 'After the scope', site: 'sin', title: 'Pre-emptive TIPS',
      line: 'Child–Pugh C 10 to 13, or B over 7 with active bleeding at endoscopy, get a covered TIPS within 72 hours. The PPG falls below 12.',
      notes: 'Baveno VII: in high-risk patients a pre-emptive TIPS, ideally within 24 hours and no later than 72, reduces rebleeding and death. An HVPG over 20 mmHg, where measured, also marks high risk. For everyone else, after the acute bleed: a non-selective beta-blocker with repeated banding every 2 to 4 weeks until the varices are gone. Rescue TIPS is for bleeding that drugs and banding do not control.',
      ask: ['Which patients get a pre-emptive TIPS after a variceal bleed?', 'Child–Pugh C 10 to 13, or Child–Pugh B over 7 with active bleeding at endoscopy.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'pv', 'ppg'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'tear', kicker: K, title: 'The tear' }, { id: 'minutes', kicker: K, title: 'Shock, minutes later' }, { id: 'oct', kicker: 'Drug', title: 'Octreotide' }, { id: 'band', kicker: 'Scope', title: 'Banding' }, { id: 'blood', kicker: 'Volume', title: 'Restrictive transfusion' }, { id: 'over', kicker: 'Volume', title: 'Over-transfusion' }, { id: 'tips', kicker: 'Shunt', title: 'Pre-emptive TIPS' }],
      kicker: 'Summary', title: 'One bleed, step by step',
      line: 'The heart rate and blood pressure track the volume; the portal pressure falls with the bleed and returns with every liter given back.',
      notes: 'The order of care: volume and airway, octreotide and an antibiotic, endoscopy with banding within 12 hours, restrictive transfusion, and a pre-emptive TIPS for the highest risk. The portal pressure falls with the blood loss and rises with every liter given back, so the aim is a stable circulation, not a full one.',
      ask: ['Put these in order: banding, octreotide, transfusion to 7 g/dL, ceftriaxone.', 'Octreotide and ceftriaxone at once, transfusion as needed, banding within 12 hours.'],
    },
  ],
};
