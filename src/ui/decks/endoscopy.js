// Presenter talk: The varix changes when you insufflate (Core). Slide fields as documented at the top of decks.js.
// One patient, one scope and the HVPG tile. Endoscopy is of the esophagus only; gastric varices stay on the anatomy (the varices deck).
// The scope's options (tool.air, tool.red, tool.readings) never touch the model: air in the lumen changes how the varix looks and the
// pressure across its wall, not the pressure inside it. The first three slides share one data card, and so do the last three.

const SCOPE = { kind: 'scope', open: true };
const PRESSURES = { kind: 'scope', open: true, readings: true, air: 10 };
const AIR = { label: 'Esophageal air pressure', tool: 'air', min: 0, max: 20, step: 1, unit: 'mmHg' };
// (The same camera, stations and tile on every slide: only the words and the one thing taught change.)
const SAME = { cam: 'gej', labels: ['VAR', 'LGV'], terms: ['varix'], site: 'sin', data: 'tiles', tiles: ['hvpg'], key: ['hvpg'] };

export const ENDOSCOPY = {
  id: 'endoscopy', level: 'core', title: 'The varix changes when you insufflate', minutes: 8,
  objectives: [
    'Tell a small varix (<5 mm) from a large one (≥5 mm)',
    'Explain why air in the esophagus flattens a varix and lowers the pressure across its wall',
    'Say why a flatter varix at endoscopy does not mean less portal hypertension',
  ],
  checks: [
    ['When is a varix called large?', 'At ≥5 mm. At <5 mm it is small. Red wale marks are a separate finding and do not change the size.'],
    ['What does air in the esophagus do to a varix?', 'It raises the pressure outside the varix, so less pressure stretches the wall and the varix looks flatter. The pressure inside it has not changed.'],
    ['The varix looks flatter at endoscopy. Has the portal hypertension improved?', 'No. The air changes how the varix looks, not the portal pressure. The HVPG and the pressure inside the varix are the same.'],
  ],
  summary: 'Small and large varices, red signs as a finding of their own, and what air in the esophagus does to the varix you see and to the pressure across its wall.',
  slides: [
    {
      id: 'size', preset: 'cirr-decomp', ...SAME, tool: SCOPE,
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis has ascites on spironolactone and furosemide. At his surveillance endoscopy, the endoscopist will size the varices.',
      compare: [{ label: 'Small', preset: 'csph' }, { label: 'Large', own: true }],
      kicker: 'Size and signs',
      title: 'A large varix is wider and more twisted than a small one',
      line: 'A varix <5 mm is small and one of ≥5 mm is large, and this one measures {varix}.',
      notes: 'The app grades a varix by size alone: small under 5 mm, large from 5 mm. AASLD 2024 also names a medium grade. A large varix is wider and more tortuous than a small one, and the scope draws it that way. Large varices, or small ones with red wale marks or in Child–Pugh C cirrhosis, are high risk and call for primary prophylaxis (AASLD 2024). The Small button shows the patient with clinically significant portal hypertension; the Large button goes back to the decompensated patient the slide opens on. Every slide in this talk keeps that patient.',
      ask: ['What size separates a small varix from a large one?', 'A small varix is <5 mm and a large one is ≥5 mm.'],
    },
    {
      id: 'red', ...SAME, tool: SCOPE,
      compare: [{ label: 'No red signs', tool: { red: false } }, { label: 'Red signs', own: true }],
      kicker: 'Size and signs',
      title: 'Red wale marks are a separate finding, not another size',
      line: 'Red wale marks raise the risk of bleeding on a varix of any size, and switching them off leaves the size as it was.',
      notes: 'Red wale marks are thin spots in the varix wall; cherry-red spots are another red sign. AASLD 2024 counts a varix of any size with red wale marks as high risk, and the risk of a first bleed rises with the size, the red signs and the Child–Pugh class. In the model the marks appear as the wall stress nears the tear point (70 % of it); the switch overrides that rule only to show that a red sign and a size are two findings.',
      ask: ['A small varix has red wale marks. Does that make it large?', 'No. Size and red signs are separate findings, and a small varix with red signs is already high risk (AASLD 2024).'],
    },
    {
      id: 'air', ...SAME, tool: SCOPE, whatIf: AIR,
      kicker: 'Insufflation',
      title: 'Air flattens the varix you are looking at',
      line: 'Air presses on the varix from outside, so it looks narrower, and at high enough pressure it looks flat.',
      notes: 'The slider is the pressure of the air in the esophagus, from 0 to 20 mmHg. That is a teaching range, not a clinical one, and not a setting on a gastroscope. The varix keeps its grade, because the size at rest does not change; only the size seen does. The pressure inside the varix and the HVPG are held constant, which is a teaching assumption rather than a claim that air never changes the circulation. This is not advice to insufflate until a varix flattens.',
      ask: ['What does air in the esophagus do to a varix you are looking at?', 'It raises the pressure outside the varix, so the varix looks narrower and, at high enough pressure, flat. Its size at rest has not changed.'],
    },
    {
      id: 'across', ...SAME, tool: PRESSURES,
      kicker: 'Insufflation',
      title: 'Air lowers the pressure across the varix wall',
      line: 'Air outside the varix lowers the pressure across its wall, though the pressure inside the varix does not change.',
      notes: 'AASLD 2024 ties the tension in the varix wall to the pressure across it (the transluminal pressure), the diameter and the wall thickness. In this teaching model the pressure in the lumen is taken off the pressure inside the varix, so the wall is stretched less and the varix looks narrower. Around 9 mmHg was reported in one diagnostic study (Ushimaru et al., Sci Rep 2020, PMID 33097772); the spread was wide. That is context, not a dose, and the slider range of 0 to 20 mmHg is a teaching range.',
      ask: ['A varix holds 18 mmHg inside, and the air outside it is 10 mmHg. What pressure stretches the wall?', '8 mmHg: the pressure inside less the pressure outside.'],
    },
    {
      id: 'flat', ...SAME, tool: PRESSURES, whatIf: AIR,
      question: 'If the varix looks flatter, has the portal hypertension improved?',
      kicker: 'Insufflation',
      title: 'A flatter varix does not mean less portal hypertension',
      line: 'A flatter varix can reflect more pressure in the lumen, not less portal hypertension, and the HVPG is still {hvpg}.',
      notes: 'Only the picture changes. The HVPG and the pressure inside the varix are the same at every setting, so the portal hypertension is the same. Compare a varix under the same conditions each time: one that looks smaller at a later scope may only have been seen with more air in the esophagus.',
      ask: ['The varix flattens as you add air. Has the HVPG changed?', 'No. The air changes how the varix looks, not the portal pressure.'],
    },
    {
      id: 'bridge', ...SAME, tool: PRESSURES,
      kicker: 'Pressure',
      title: 'The scope shows the varix, not the pressure behind it',
      line: 'The scope grades the varix, and what lowers the pressure behind it is taught in Preventing the next variceal bleed.',
      notes: 'The scope grades and treats the varix; it does not measure the pressure behind it, which the HVPG does. Beta-blockers, banding and TIPS are taught in Lowering portal pressure and in Preventing the next variceal bleed.',
      ask: ['What does the HVPG tell you that the scope does not?', 'The pressure behind the varix, which stays high however the varix looks.'],
    },
    {
      // (The relation chart: the scope's air across, the varix it sees and the pressure across its wall up, worked out from this
      // slide's varix as the scope works them. The model is untouched, so the HVPG tile holds still.)
      id: 'relation', ...SAME, tool: { kind: 'curve', param: 'scope.air', from: 0, to: 20, step: 1, lines: ['seen', 'across'], cuts: [5] },
      kicker: 'Summary', title: 'Air flattens the varix, not the pressure behind it',
      line: 'As the air pressure rises, the varix seen narrows and the pressure across its wall falls, while the HVPG stays {hvpg}.',
      notes: 'Both lines come from the same varix, at rest about 7 mm across, a large one. The air presses on it from outside, so the pressure across its wall is the pressure inside less the air\'s, and it falls one for one. The size seen falls slowly at first and then quickly as the wall goes slack, and from about 16 mmHg of air the scope would call the varix small (<5 mm). Its grade at rest has not changed, and neither has the HVPG. The range is a teaching one, not a setting on a gastroscope. AASLD 2024 ties the tension in the varix wall to the pressure across it, the diameter and the wall thickness (p. 1193); the shape of the lines is Laplace\'s law worked through the model, and no guideline gives these numbers.',
      ask: ['The same varix looks small at one scope and large at the next. What else should you ask?', 'How much air was in the esophagus each time. Size it with the same insufflation, or the change may be the air.'],
    },
  ],
};
