// Presenter talk: the kidney in cirrhosis, as a pressure (the slide fields are described at the top of decks.js). One man follows the
// whole talk: wide arteries and a low MAP, a tense abdomen that takes pressure from the kidneys, the tap that gives it back, carvedilol
// and a bleed that push the MAP toward its line, and the drugs for HRS-AKI. The model has a MAP and an abdominal pressure and nothing
// else of the kidney: no GFR, no creatinine, no urine. So every number here is a pressure (the kidney pressure tile, kidney-cuts.js),
// and what only the bedside can show (HRS-AKI, norepinephrine, the eGFR before a TIPS) sits in criteria cards.
//
// Sources, checked against the guideline files on 7 Nov 2026:
// - Baveno VIII (J Hepatol 2026) 4.6: carvedilol/cNSBBs dose-reduced or discontinued with persistently low blood pressure (systolic
//   arterial pressure <90 mmHg or mean arterial pressure <65 mmHg) and/or HRS-AKI; 4.7: re-initiated and/or re-titrated once the HRS-AKI
//   has resolved and/or the blood pressure has recovered.
// - 6.18: in HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong); 6.19: terlipressin preferably as a
//   continuous intravenous infusion (starting dose 2-3 mg/24 h) to reduce adverse events; 6.20: norepinephrine as an alternative if
//   terlipressin is unavailable, contraindicated or not tolerated (LoE 1, strong).
// - 6.9: in patients undergoing evaluation for TIPS for recurrent/refractory ascites, renal function should be systematically assessed
//   and chronic kidney disease staged (eGFR) for risk stratification (LoE 2, strong).
// - Table 3 (statements of earlier Baveno reports that remain valid): short-term albumin for large-volume paracentesis, and combined
//   with terlipressin for HRS-AKI.
// - AASLD 2024 (introduction, Figure 2): splanchnic and systemic vasodilation, a lower effective arterial blood volume, sodium and
//   water retention and, at late stages, hepatorenal syndrome from compensatory renal vasoconstriction.
// Neither file gives a cut-off for a kidney pressure: the tile's line is the MAP line of 4.6 at the abdomen's resting pressure
// (src/engine/kidney-cuts.js). A deck is one file with no imports (deck-source.js), so the two rules are typed below, 65 and 60 mmHg;
// tests/kidney-pressure.test.js keeps them equal to the module's.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };
const BELLY = { kind: 'abdomen' };
const TAP = { kind: 'paracentesis', mL: 5100, albumin: true };
const BLEED = { kind: 'hemorrhage', mL: 1300 };
const CARV_ON = { drugs: { carvedilol: true } }, CARV_OFF = { drugs: { carvedilol: false } };
const TILES = ['map', 'rpp'];

export const KIDNEY = {
  id: 'kidney', level: 'advanced', title: 'The kidney in cirrhosis', minutes: 10,
  objectives: [
    'Explain why the kidney pressure is the MAP less the pressure inside the abdomen',
    'Say how a tense abdomen lowers it and a large-volume tap with albumin raises it',
    'State when carvedilol is cut back (a MAP <65 mmHg or HRS-AKI) and when it restarts',
    'Name the drugs for HRS-AKI, and the kidney check before a TIPS',
  ],
  checks: [
    ['A patient\'s MAP is 70 mmHg and the pressure in the abdomen is 15 mmHg. A tap brings the abdomen to 5 mmHg and the MAP stays at 70. What happens to the kidney pressure?', 'It rises from 55 to 65 mmHg, by the 10 mmHg the abdomen gives back. The MAP did not change, so the tap alone raised it.'],
    ['When is carvedilol cut back or stopped, and when does it restart?', 'With a persistently low blood pressure (systolic <90 mmHg or MAP <65 mmHg) or HRS-AKI. It restarts once the HRS-AKI has resolved or the blood pressure has recovered (Baveno VIII 4.6, 4.7).'],
    ['Which drug treats HRS-AKI, how is it given, and what stands in for it?', 'Terlipressin with albumin, preferably as a continuous infusion starting at 2 to 3 mg/24 h. Norepinephrine if terlipressin is unavailable, contraindicated or not tolerated (Baveno VIII 6.18 to 6.20).'],
    ['Why is a normal kidney pressure not enough before a TIPS for ascites?', 'It is only a pressure. Baveno VIII 6.9 asks for renal function to be assessed and chronic kidney disease staged by eGFR for risk stratification.'],
  ],
  summary: 'Why the kidney pressure is the MAP less the abdomen\'s pressure, how tense ascites, a tap, carvedilol and a bleed move it, and the Baveno VIII steps for HRS-AKI and before a TIPS.',
  slides: [
    {
      id: 'arteries', preset: 'cirr-decomp', cam: 'fit', tool: VITALS,
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis has ascites on spironolactone and furosemide, large esophageal varices and an albumin of 2.8 g/dL.',
      kicker: 'Kidney pressure', site: 'sin', title: 'Wide arteries leave the MAP low in decompensated cirrhosis',
      line: 'His arteries are wide and underfilled. The heart beats at {hr} and pumps {co}, yet the mean arterial pressure is only {map}.',
      notes: 'In decompensated cirrhosis the splanchnic and systemic arteries are wide, the effective arterial blood volume is low and the kidneys hold sodium and water; at a late stage compensatory renal vasoconstriction produces hepatorenal syndrome (AASLD 2024, introduction and Figure 2). The heart works harder to make up for it, so the output rises and the arterial pressure still falls. This is the starting point for the talk: every kidney pressure that follows begins from this MAP. The model has the wide arteries and the low MAP, and it has no kidneys.',
      ask: ['Why is the MAP low in decompensated cirrhosis although the cardiac output is high?', 'The arteries are wide, so the resistance has fallen by more than the output has risen.'],
    },
    {
      id: 'pressure', cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'],
      eq: [sub(mi('P'), 'kidney') + mo('=') + mi('MAP') + mo('−') + sub(mi('P'), 'abdomen'), 'Kidney pressure: the mean arterial pressure less the pressure inside the abdomen'],
      caveat: 'The model shows a pressure, not filtration: it has no GFR, creatinine or urine.',
      kicker: 'Kidney pressure', site: 'sin', title: 'The kidneys are fed at the MAP less the abdomen\'s pressure',
      line: 'The abdomen pushes back against the arteries. From a MAP of {map}, the kidneys are left a pressure of {rpp}.',
      notes: 'The kidney pressure is the mean arterial pressure less the pressure inside the abdomen. In health the abdomen sits at about 5 mmHg and takes little from the MAP. The tile turns red below the MAP line of Baveno VIII 4.6 carried over to it: a MAP of 65 mmHg less the abdomen\'s resting pressure. Baveno VIII gives no cut-off for a kidney pressure, so the line is the model\'s. The tile is a pressure and nothing more: the model has no glomerular filtration, creatinine or urine output, and a normal reading does not mean the kidneys work.',
      ask: ['The MAP is 80 mmHg and the pressure in the abdomen is 15 mmHg. What is the kidney pressure?', '65 mmHg: the MAP less the abdomen\'s pressure.'],
    },
    {
      id: 'tense', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, lapse: { seconds: 8, from: 'On diuretics', to: 'Four months off' },
      cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'rpp'], key: ['rpp'], delta: 'pressure',
      kicker: 'Kidney pressure', site: 'sin', title: 'A tense abdomen takes pressure from the kidneys',
      line: 'He stops his diuretics. Four months on, {asc} of fluid fills the abdomen, and the kidney pressure falls from {rpp@pressure} to {rpp}.',
      notes: 'The pressure inside the abdomen rises with the volume of ascites, slowly at first and steeply once the belly is tense. The MAP barely moves, so the whole fall in the kidney pressure comes from the abdomen. In patients a tense abdomen also compresses the renal veins and cuts the urine output. The model keeps to the pressure and has no urine. The serum albumin falls over the four months, as it did in the Ascites talk.',
      ask: ['The MAP is unchanged and the ascites has grown to 5 L. What happened to the kidney pressure, and why?', 'It fell, because the pressure inside the abdomen rose and the kidneys are fed at the MAP less that pressure.'],
    },
    {
      id: 'tap', action: TAP, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'rpp'], key: ['rpp'], delta: 'tense',
      kicker: 'Kidney pressure', site: 'sin', title: 'A large-volume tap raises the kidney pressure',
      line: 'The tap drains the abdomen to {asc}, so the abdomen pushes back less and the kidney pressure rises to {rpp}. Albumin goes with the tap.',
      notes: 'Draining the fluid takes the abdomen back to its resting pressure and gives the pressure back to the kidneys. Short-term albumin is indicated with a large-volume paracentesis (Baveno VIII, Table 3, a statement that remains valid from earlier Baveno reports); without it a large tap can lower the effective blood volume further and injure the kidneys, which the model does not show. In the model the albumin raises the serum albumin and the kidney pressure follows the abdomen. The MAP dips a little with the tap.',
      ask: ['Why does albumin go with a large-volume tap?', 'It guards the effective blood volume so the arteries do not fall further and the kidneys are not injured. Baveno VIII Table 3 keeps short-term albumin for large-volume paracentesis.'],
    },
    {
      id: 'carv', params: CARV_ON, cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'tap',
      compare: [{ label: 'No beta-blocker', short: 'None', params: CARV_OFF }, { label: 'Carvedilol', own: true, params: CARV_ON }],
      kicker: 'Carvedilol', site: 'sin', title: 'Carvedilol lowers the MAP, and the kidney pressure with it',
      line: 'Carvedilol relaxes the arteries as well as the liver. The MAP falls to {map} and the kidney pressure to {rpp}, which is still {>=60 mmHg}.',
      notes: 'Carvedilol lowers the portal pressure and, through its α1 blockade, the arterial pressure. In this man the fall is small, and the kidney pressure stays clear of its line. In a patient with a lower MAP to begin with, or a bleed or an infection, the same fall can take the MAP across 65 mmHg. Carvedilol is preferred over the other non-selective beta-blockers (Baveno VIII 4.4), so the question is how to use it safely, and the next slide gives the rule (Baveno VIII 4.6, 4.7).',
      ask: ['What does carvedilol do to the MAP, and why does it matter for the kidneys?', 'It lowers it, because it relaxes the arteries. A lower MAP leaves the kidneys a lower pressure.'],
    },
    {
      id: 'hold', action: BLEED, cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'carv',
      tool: { kind: 'criteria', title: 'Carvedilol: cut back, then restart', short: 'Carvedilol', lead: 'Any one of these.', rule: 'Baveno VIII 4.6, 4.7',
        rows: [['**Mean arterial pressure**', 'map', '<', 65], 'Systolic pressure **<90 mmHg**', '**HRS-AKI**'],
        verdict: 'Restart: once the HRS-AKI has resolved or the pressure has recovered.' },
      kicker: 'Carvedilol', site: 'sin', title: 'Cut back carvedilol when the MAP is <65 mmHg',
      line: 'A large bleed takes the MAP to {map} and the kidney pressure to {rpp}. Carvedilol is cut back or stopped, then restarted once the pressure recovers.',
      notes: 'Baveno VIII 4.6: carvedilol is dose-reduced or discontinued with a persistently low blood pressure (systolic <90 mmHg or MAP <65 mmHg) and/or HRS-AKI. Baveno VIII 4.7: it is re-initiated and/or re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered. A large bleed is one way to get there; infection and over-diuresis are others. The model shows the MAP and the kidney pressure and has no HRS-AKI, so that row is a rule. The bleed stays in the model and carvedilol is still on here; the next slide puts it on hold.',
      ask: ['A man on carvedilol has a MAP of 62 mmHg after a bleed. What do you do with the carvedilol, and when does it restart?', 'Reduce the dose or stop it. Restart once the blood pressure has recovered and any HRS-AKI has resolved.'],
    },
    {
      id: 'terli', params: { drugs: { carvedilol: false, terlipressin: true } }, action: { kind: 'infuse', fluid: 'albumin' }, cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'hold',
      kicker: 'HRS-AKI', site: 'sin', title: 'Terlipressin with albumin lifts the MAP in HRS-AKI',
      line: 'For HRS-AKI, consider terlipressin with albumin, preferably as a continuous infusion starting at {2 to 3 mg/24 h}. The MAP rises to {map}, the kidney pressure to {rpp}.',
      notes: 'Baveno VIII 6.18: in HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong). 6.19: terlipressin is preferably given as a continuous intravenous infusion, starting at 2 to 3 mg/24 h, to reduce adverse events. Terlipressin narrows the splanchnic and systemic arteries, so the MAP rises; the albumin fills the circulation. Carvedilol is on hold in this state. The model shows the rise in the MAP and the kidney pressure and cannot show the kidney recovering. The heart rate is faster than before because carvedilol is off and the bleed has not been replaced.',
      ask: ['How is terlipressin given in HRS-AKI, and what goes with it?', 'Preferably as a continuous infusion, starting at 2 to 3 mg/24 h, with albumin.'],
    },
    {
      id: 'norepi', cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'],
      tool: { kind: 'criteria', title: 'If terlipressin cannot be used', short: 'Instead of terlipressin', ticks: false, lead: 'Any one of these.', rule: 'Baveno VIII 6.20',
        rows: ['**Unavailable**', '**Contraindicated**', '**Not tolerated**'], verdict: 'Norepinephrine is the alternative.' },
      kicker: 'HRS-AKI', site: 'sin', title: 'Norepinephrine stands in when terlipressin cannot be used',
      line: 'Norepinephrine is the alternative if terlipressin is unavailable, contraindicated or not tolerated. The model has no norepinephrine, so its numbers stay as they were.',
      notes: 'Baveno VIII 6.20: norepinephrine can be used as an alternative to terlipressin if terlipressin is unavailable, contraindicated or not tolerated (LoE 1, strong). The model has terlipressin but no norepinephrine, so this slide gives the rule and the tiles keep the last state. Baveno VIII lists the titration of terlipressin by the mean arterial pressure as a question for research, so the rise in the MAP on the last slide is not a target.',
      ask: ['When is norepinephrine used for HRS-AKI?', 'As the alternative to terlipressin, when terlipressin is unavailable, contraindicated or not tolerated.'],
    },
    {
      id: 'staging', cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'],
      tool: { kind: 'criteria', title: 'Evaluating for a TIPS', short: 'Before a TIPS', ticks: false, lead: 'For recurrent or refractory ascites.', rule: 'Baveno VIII 6.9',
        rows: ['**Renal function** assessed in every patient', '**Chronic kidney disease** staged by eGFR'], verdict: 'The stage stratifies the risk.' },
      kicker: 'Before a TIPS', site: 'sin', title: 'Stage the kidneys before a TIPS for ascites',
      line: 'Before a TIPS for recurrent or refractory ascites, assess renal function in every patient and stage chronic kidney disease by eGFR. Kidney pressure cannot do this.',
      notes: 'Baveno VIII 6.9: in patients undergoing evaluation for TIPS for recurrent or refractory ascites, renal function should be systematically assessed and chronic kidney disease staged (eGFR) for risk stratification (LoE 2, strong). The kidney pressure tile has no filtration behind it, so it cannot stand in for the eGFR. A TIPS also lowers the effective arterial volume further, which is why the kidneys are staged first.',
      ask: ['What is checked about the kidneys before a TIPS for refractory ascites?', 'Renal function in every patient, with chronic kidney disease staged by eGFR for risk stratification.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['map', 'asc', 'rpp'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'arteries', kicker: 'Start', title: 'Ascites on diuretics' }, { id: 'tense', kicker: 'Tense abdomen', title: 'Four months off diuretics' }, { id: 'tap', kicker: 'Tap', title: 'Paracentesis with albumin' }, { id: 'carv', kicker: 'Drug', title: 'Carvedilol' }, { id: 'hold', kicker: 'Bleed', title: 'Large bleed on carvedilol' }, { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin with albumin' }],
      kicker: 'Summary', title: 'What moves the kidney pressure',
      line: 'The MAP and the abdomen\'s pressure set the kidney pressure. A tap and terlipressin raise it, and carvedilol and a bleed lower it.',
      notes: 'The kidney pressure follows two things: the MAP, which the wide arteries hold low and carvedilol and a bleed lower further, and the pressure in the abdomen, which tense ascites raises and a tap brings back. Terlipressin with albumin lifts the MAP. Carvedilol is cut back with a MAP <65 mmHg or HRS-AKI and restarted once they have resolved. Norepinephrine is the alternative to terlipressin, and the kidneys are staged by eGFR before a TIPS. The tile is a pressure and does not measure kidney function.',
      ask: ['Which two numbers set the kidney pressure, and which treatment in this talk acts on each?', 'The MAP and the pressure in the abdomen. Terlipressin raises the MAP; a large-volume tap lowers the abdomen\'s pressure.'],
    },
  ],
};
