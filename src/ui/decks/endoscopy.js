// Presenter talk: The varix changes when you insufflate (Core). Slide fields as documented at the top of decks.js.
// One patient, one scope and the HVPG tile. Endoscopy is of the esophagus only; gastric varices stay on the anatomy (the varices deck).
// The scope's options (tool.air, tool.red, tool.readings) never touch the model: air in the lumen changes how the varix looks and the
// pressure across its wall, not the pressure inside it. The first three slides share one data card, and so do the last three.

const SCOPE = { kind: 'scope', open: true };
const PRESSURES = { kind: 'scope', open: true, readings: true, air: 10 };
const AIR = { label: 'Insufflation pressure', tool: 'air', min: 0, max: 20, step: 1, unit: 'mmHg' };
// (The same camera, stations and tile on every slide: only the words and the one thing taught change.)
const SAME = { cam: 'gej', labels: ['VAR', 'LGV'], terms: ['varix'], site: 'sin', data: 'tiles', tiles: ['hvpg'], key: ['hvpg'] };

export const ENDOSCOPY = {
  id: 'endoscopy', level: 'core', title: 'The varix changes when you insufflate', minutes: 8,
  objectives: [
    'Distinguish a small varix (<5 mm) from a large one (≥5 mm)',
    'Explain why insufflation flattens a varix and lowers its transmural pressure',
    'Explain why a flatter varix at endoscopy does not mean milder portal hypertension',
  ],
  checks: [
    ['When is a varix called large?', 'At ≥5 mm; a varix <5 mm is small. Red wale marks are a separate finding and do not change the size grade.'],
    ['What does insufflation do to a varix?', 'It raises the intraluminal (esophageal) pressure, so the transmural pressure falls and the varix looks flatter. The intravariceal pressure is unchanged.'],
    ['The varix looks flatter at endoscopy. Has the portal hypertension improved?', 'No. Insufflation changes how the varix looks, not the portal pressure. The HVPG and the intravariceal pressure are unchanged.'],
  ],
  summary: 'Small and large varices, red wale marks as a separate finding, and what insufflation does to the varix seen at endoscopy and to its transmural pressure.',
  slides: [
    {
      id: 'size', preset: 'cirr-decomp', ...SAME, tool: SCOPE,
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis has ascites that is controlled on spironolactone and furosemide. He is undergoing surveillance endoscopy, and his varices are to be sized.',
      compare: [{ label: 'Small', preset: 'csph' }, { label: 'Large', own: true }],
      kicker: 'Size and signs',
      title: 'A large varix is wider and more tortuous than a small one',
      line: 'A varix <5 mm is small and one ≥5 mm is large; this one measures {varix}.',
      notes: 'The app grades a varix by size alone: small <5 mm, large ≥5 mm. AASLD 2024 also names a medium grade. A large varix is wider and more tortuous than a small one, and the endoscopic view draws it that way. Large varices, and small varices with red wale marks or in Child–Pugh C cirrhosis, are high risk and call for primary prophylaxis (AASLD 2024). The Small button shows the patient with clinically significant portal hypertension (CSPH); the Large button returns to the decompensated patient the slide opens on. Every slide in this talk keeps that patient.',
      ask: ['What size separates a small varix from a large one?', 'A small varix is <5 mm and a large one is ≥5 mm.'],
    },
    {
      id: 'red', ...SAME, tool: SCOPE,
      compare: [{ label: 'No red signs', tool: { red: false } }, { label: 'Red signs', own: true }],
      kicker: 'Size and signs',
      title: 'Red wale marks are a separate finding, not another size',
      line: 'Red wale marks raise the bleeding risk of a varix of any size and do not change its size grade.',
      notes: 'Red wale marks are areas of wall thinning on the varix; cherry-red spots are another red sign. AASLD 2024 counts a varix of any size with red wale marks as high risk, and the risk of a first bleed rises with varix size, red signs and Child–Pugh class. In the model the marks appear as wall stress nears the rupture threshold (70% of it); the switch overrides that rule only to show that red signs and size are separate findings.',
      ask: ['A small varix has red wale marks. Does that make it large?', 'No. Size and red signs are separate findings, and a small varix with red signs is already high risk (AASLD 2024).'],
    },
    {
      id: 'air', ...SAME, tool: SCOPE, whatIf: AIR,
      kicker: 'Insufflation',
      title: 'Insufflation flattens the varix seen at endoscopy',
      line: 'Insufflation raises the intraluminal pressure around the varix, so it looks narrower, and at a high enough pressure it looks flat.',
      notes: 'The slider sets the intraluminal (esophageal) pressure from insufflation, from 0 to 20 mmHg. That is a teaching range, not a clinical one, and not a setting on an endoscope. The varix keeps its size grade, because its resting diameter does not change; only its apparent size does. The intravariceal pressure and the HVPG are held constant, a teaching assumption rather than a claim that insufflation never changes the circulation. This is not advice to insufflate until a varix flattens.',
      ask: ['What does insufflation do to the varix seen at endoscopy?', 'It raises the intraluminal pressure, so the varix looks narrower and, at a high enough pressure, flat. Its resting size is unchanged.'],
    },
    {
      id: 'across', ...SAME, tool: PRESSURES,
      kicker: 'Insufflation',
      title: 'Insufflation lowers the transmural pressure of the varix',
      line: 'The pressure inside the varix does not change; insufflation raises the intraluminal pressure, so the transmural pressure falls.',
      notes: 'AASLD 2024 relates variceal wall tension to the transmural (transluminal) pressure, the diameter and the wall thickness. In this teaching model, transmural pressure = intravariceal pressure − intraluminal pressure, so insufflation lowers the wall tension and the varix looks narrower. An insufflation pressure of about 9 mmHg was reported in one diagnostic study (Ushimaru et al., Sci Rep 2020, PMID 33097772), with a wide spread. That is context, not a dose, and the slider range of 0 to 20 mmHg is a teaching range.',
      ask: ['The intravariceal pressure is 18 mmHg and the intraluminal pressure is 10 mmHg. What is the transmural pressure?', '8 mmHg: the intravariceal pressure minus the intraluminal pressure (18 − 10).'],
    },
    {
      id: 'flat', ...SAME, tool: PRESSURES, whatIf: AIR,
      question: 'If the varix looks flatter, has the portal hypertension improved?',
      kicker: 'Insufflation',
      title: 'A flatter varix does not mean milder portal hypertension',
      line: 'A flatter varix can reflect a higher intraluminal pressure, not improved portal hypertension; the HVPG is still {hvpg}.',
      notes: 'Only the endoscopic appearance changes. The HVPG and the intravariceal pressure are the same at every setting, so the portal hypertension is unchanged. Size a varix under the same conditions each time: one that looks smaller at a later endoscopy may only have been examined with more insufflation.',
      ask: ['The varix flattens with insufflation. Has the HVPG changed?', 'No. Insufflation changes how the varix looks, not the portal pressure.'],
    },
    {
      id: 'bridge', ...SAME, tool: PRESSURES,
      kicker: 'Pressure',
      title: 'Endoscopy shows the varix, not the portal pressure behind it',
      line: 'Endoscopy grades the varix; how to lower the portal pressure behind it is taught in Preventing the next variceal bleed.',
      notes: 'Endoscopy grades and treats the varix; it does not measure the portal pressure, which the HVPG does. Nonselective beta-blockers (NSBBs), endoscopic variceal ligation (EVL) and TIPS are taught in Lowering portal pressure and in Preventing the next variceal bleed.',
      ask: ['What does the HVPG tell you that endoscopy does not?', 'The portal pressure behind the varix, which stays high however the varix looks.'],
    },
    {
      // (The relation chart: the scope's air across, the varix it sees and the pressure across its wall up, worked out from this
      // slide's varix as the scope works them. The model is untouched, so the HVPG tile holds still.)
      id: 'relation', ...SAME, tool: { kind: 'curve', param: 'scope.air', from: 0, to: 20, step: 1, lines: ['seen', 'across'], cuts: [5] },
      kicker: 'Summary', title: 'Insufflation flattens the varix, not the portal pressure',
      line: 'As the intraluminal pressure rises, the varix seen at endoscopy narrows and its transmural pressure falls, while the HVPG stays {hvpg}.',
      notes: 'Both lines come from the same varix, about 7 mm across at rest, a large one. Transmural pressure = intravariceal pressure − intraluminal pressure, so it falls 1 mmHg for every 1 mmHg of insufflation. The apparent size falls slowly at first and then quickly as wall tension is lost, and from an intraluminal pressure of about 16 mmHg the varix would be graded small (<5 mm). Its resting grade has not changed, and neither has the HVPG. The range is a teaching one, not a setting on an endoscope. AASLD 2024 relates variceal wall tension to the transmural pressure, the diameter and the wall thickness (p. 1193); the shape of the lines is Laplace\'s law applied in the model, and no guideline gives these numbers.',
      ask: ['The same varix looks small at one endoscopy and large at the next. What else should you ask?', 'How much insufflation was used each time. Size varices at the same insufflation, or the change may reflect the insufflation alone.'],
    },
  ],
};
