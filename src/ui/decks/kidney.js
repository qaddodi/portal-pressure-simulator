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

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };
const BELLY = { kind: 'abdomen' };
const TAP = { kind: 'paracentesis', mL: 5100, albumin: true };
const BLEED = { kind: 'hemorrhage', mL: 1300 };
// (Four units of red cells give back the 1.3 L of BLEED; the albumin goes with the terlipressin. The model's bleed is replaced before the HRS-AKI slide.)
const UNIT = { kind: 'infuse', fluid: 'prbc' }, ALBUMIN = { kind: 'infuse', fluid: 'albumin' };
const CARV_ON = { drugs: { carvedilol: true } }, CARV_OFF = { drugs: { carvedilol: false } };
const TILES = ['map', 'rpp'];

export const KIDNEY = {
  id: 'kidney', level: 'advanced', title: 'The kidney in cirrhosis', minutes: 10,
  objectives: [
    'Explain why renal perfusion pressure (RPP) is the MAP minus the intra-abdominal pressure (IAP)',
    'Explain how tense ascites lowers the RPP and large-volume paracentesis (LVP) with albumin raises it',
    'State when carvedilol is dose-reduced or stopped (MAP <65 mmHg or HRS-AKI) and when it is restarted',
    'Name the drugs for HRS-AKI, and the renal assessment before a TIPS',
  ],
  checks: [
    ['A patient\'s MAP is 70 mmHg and the IAP is 15 mmHg. Large-volume paracentesis lowers the IAP to 5 mmHg, and the MAP stays at 70 mmHg. What happens to the RPP?', 'It rises from 55 to 65 mmHg, by the 10 mmHg fall in IAP. The MAP did not change, so the paracentesis alone raised the RPP.'],
    ['When is carvedilol dose-reduced or stopped, and when is it restarted?', 'With persistently low blood pressure (systolic <90 mmHg or MAP <65 mmHg) or HRS-AKI. It is restarted once the HRS-AKI has resolved or the blood pressure has recovered (Baveno VIII 4.6, 4.7).'],
    ['Which drug treats HRS-AKI, how is it given, and what is the alternative?', 'Terlipressin with albumin, preferably as a continuous IV infusion starting at 2 to 3 mg/24 h. Norepinephrine if terlipressin is unavailable, contraindicated or not tolerated (Baveno VIII 6.18 to 6.20).'],
    ['Why is a normal RPP not enough before a TIPS for ascites?', 'The RPP is only a pressure. Baveno VIII 6.9 asks for renal function to be assessed and chronic kidney disease staged by eGFR for risk stratification.'],
  ],
  summary: 'Why renal perfusion pressure is the MAP minus the intra-abdominal pressure, how tense ascites, large-volume paracentesis, carvedilol and hemorrhage change it, and the Baveno VIII steps for HRS-AKI and before a TIPS.',
  slides: [
    {
      id: 'arteries', preset: 'cirr-decomp', cam: 'fit', tool: VITALS,
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis has ascites controlled on spironolactone and furosemide, large esophageal varices and a serum albumin of 2.8 g/dL.',
      kicker: 'Renal perfusion pressure', site: 'sin', title: 'Arterial vasodilation keeps the MAP low in decompensated cirrhosis', cite: 'AASLD 2024, Figure 2',
      line: 'His splanchnic and systemic arteries are dilated and underfilled. His heart rate is {hr} and cardiac output {co}, yet his blood pressure is only {map}, with the MAP in parentheses.',
      notes: 'In decompensated cirrhosis the splanchnic and systemic arteries are dilated, the effective arterial blood volume is low and the kidneys retain sodium and water; at a late stage, compensatory renal vasoconstriction produces hepatorenal syndrome (AASLD 2024, introduction and Figure 2). The cardiac output rises to compensate, yet the arterial pressure still falls. Every RPP in this talk starts from this MAP. The model has the arterial vasodilation and the low MAP, and no kidneys.',
      ask: ['Why is the MAP low in decompensated cirrhosis although the cardiac output is high?', 'Arterial vasodilation lowers the systemic vascular resistance by more than the cardiac output rises.'],
    },
    {
      id: 'pressure', cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'rpp'], key: ['rpp'],
      eq: [mi('RPP') + mo('=') + mi('MAP') + mo('−') + mi('IAP'), 'Renal perfusion pressure: mean arterial pressure minus intra-abdominal pressure'],
      caveat: 'The model shows a pressure, not filtration: it has no GFR, creatinine or urine output.',
      kicker: 'Renal perfusion pressure', site: 'sin', title: 'Renal perfusion pressure is the MAP minus the intra-abdominal pressure',
      line: 'The intra-abdominal pressure (IAP) opposes renal perfusion. At a MAP of {map}, the renal perfusion pressure (RPP) is {rpp}.',
      notes: 'Renal perfusion pressure is the mean arterial pressure minus the intra-abdominal pressure (RPP = MAP − IAP). In health the IAP is about 5 mmHg and lowers the RPP little. The tile turns red below the MAP threshold of Baveno VIII 4.6 carried over to it: a MAP of 65 mmHg minus the resting IAP. Baveno VIII gives no RPP cut-off, so the threshold is the model\'s. The tile is a pressure only: the model has no glomerular filtration, creatinine or urine output, and a normal RPP does not mean normal renal function.',
      ask: ['The MAP is 80 mmHg and the IAP is 15 mmHg. What is the RPP?', '65 mmHg: the MAP minus the IAP.'],
    },
    {
      id: 'tense', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, lapse: { seconds: 8, from: 'On diuretics', to: 'Four months off diuretics' },
      cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['rpp', 'asc'], keepTiles: true, title: 'RPP and ascites over four months' }, data: 'tiles', tiles: ['asc', 'rpp'], key: ['rpp'], delta: 'pressure',
      kicker: 'Renal perfusion pressure', site: 'sin', title: 'Tense ascites raises the IAP and lowers the RPP',
      line: 'He stops his diuretics. Four months later, {asc} of ascites has accumulated, and the RPP falls from {rpp@pressure} to {rpp}.',
      notes: 'The IAP rises with the volume of ascites, and more steeply once the ascites is tense. The MAP falls only slightly, so most of the fall in RPP comes from the rise in IAP. In patients, tense ascites also compresses the renal veins and reduces urine output; the model has the pressure only, and no urine output. The serum albumin falls over the four months, as in the Ascites talk.',
      ask: ['The MAP is unchanged and the ascites has increased to 5 L. What happened to the RPP, and why?', 'It fell, because the IAP rose and the RPP is the MAP minus the IAP.'],
    },
    {
      id: 'tap', action: TAP, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'rpp'], key: ['rpp'], delta: 'tense',
      kicker: 'Renal perfusion pressure', site: 'sin', title: 'Large-volume paracentesis raises the RPP', cite: 'Baveno VIII Table 3',
      line: 'Large-volume paracentesis (LVP) drains the ascites to {asc}, so the IAP falls and the RPP rises to {rpp}. Albumin is given with the LVP.',
      notes: 'Draining the ascites returns the IAP to its resting level and restores the RPP. Short-term albumin is indicated with large-volume paracentesis (Baveno VIII, Table 3, a statement of earlier Baveno reports that remains valid); without it, LVP can lower the effective arterial blood volume further and cause AKI, which the model does not show. In the model the albumin raises the serum albumin, and the RPP follows the IAP. The MAP changes little with the paracentesis.',
      ask: ['Why is albumin given with large-volume paracentesis?', 'It maintains the effective arterial blood volume, so arterial underfilling does not worsen and AKI is prevented. Baveno VIII Table 3 keeps short-term albumin for large-volume paracentesis.'],
    },
    {
      id: 'carv', params: CARV_ON, cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'tap',
      compare: [{ label: 'No beta-blocker', short: 'None', params: CARV_OFF }, { label: 'Carvedilol', own: true, params: CARV_ON }],
      kicker: 'Carvedilol', site: 'sin', title: 'Carvedilol lowers the MAP, and the RPP with it', cite: 'Baveno VIII 4.4, 4.6 · AASLD 2024',
      line: 'Through α1 blockade, carvedilol lowers the arterial as well as the portal pressure. His blood pressure falls to {map} and the RPP to {rpp}, still {>=60 mmHg}.',
      notes: 'Carvedilol lowers the portal pressure and, through α1 blockade, the arterial pressure. In this case the fall is small, and the RPP stays above its threshold. In a patient with a lower baseline MAP, or with hemorrhage or infection, the same fall can take the MAP below 65 mmHg. AASLD 2024 adds that a systolic pressure <90 mmHg may attenuate the survival benefit of a nonselective beta-blocker (NSBB), possibly by lowering the renal perfusion pressure and raising the risk of HRS-AKI, and suggests a switch to propranolol or nadolol for a patient whose blood pressure is low on low-dose carvedilol. Carvedilol is the preferred NSBB (Baveno VIII 4.4), so the question is how to use it safely; the next slide gives the rule (Baveno VIII 4.6, 4.7).',
      ask: ['What does carvedilol do to the MAP, and why does it matter for renal perfusion?', 'It lowers the MAP through α1 blockade, and a lower MAP means a lower RPP.'],
    },
    {
      // (The Baveno VIII rule for carvedilol, lit for the man on the slide before, from the model's own blood pressure (holdcarv.js reads it when
      // the slide types none); the next slide is the same rule with a bleed.)
      id: 'path-carv', cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'tap',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: false, hrs: false } },
      kicker: 'Carvedilol', site: 'sin', title: 'At this MAP, the algorithm continues carvedilol',
      line: 'His blood pressure is {map}: neither a systolic {<90 mmHg} nor a MAP {<65 mmHg}, and he has no HRS-AKI. The algorithm continues carvedilol.',
      notes: 'The Baveno VIII algorithm for carvedilol in decompensated cirrhosis (4.6, 4.7), applied to this case. Carvedilol is dose-reduced or stopped when the blood pressure stays low (systolic <90 mmHg or MAP <65 mmHg) and/or HRS-AKI develops (4.6). It is restarted and re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered (4.7). His blood pressure is about 115/64 mmHg with a MAP of 79 mmHg, from the model, and the model has no kidneys, so the algorithm takes HRS-AKI as absent. Neither criterion is met, so carvedilol continues. A patient whose carvedilol is already held and who has recovered on both counts takes the restart branch. The next slide takes the same patient through a large hemorrhage.',
      ask: ['A man on carvedilol has a blood pressure of 115/64 mmHg (MAP 79 mmHg) and no HRS-AKI. What does the algorithm advise?', 'Continue carvedilol. Dose-reduce or stop it only for a systolic pressure <90 mmHg, a MAP <65 mmHg or HRS-AKI.'],
    },
    {
      id: 'hold', action: BLEED, cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'carv',
      tool: { kind: 'criteria', title: 'Carvedilol: reduce, then restart', short: 'Carvedilol', lead: 'Any one of these.', rule: 'Baveno VIII 4.6, 4.7',
        rows: [{ text: '**Systolic pressure**', key: 'sbp', op: '<', value: 90, cut: '<90 mmHg' }, { text: '**Mean arterial pressure**', key: 'map', op: '<', value: 65, cut: '<65 mmHg' }, '**HRS-AKI**'],
        verdict: 'Restart once HRS-AKI resolves or the blood pressure recovers.' },
      kicker: 'Carvedilol', site: 'sin', title: 'Dose-reduce or stop carvedilol when the MAP is <65 mmHg',
      line: 'A large hemorrhage lowers his blood pressure to {map} and the RPP to {rpp}. Carvedilol is dose-reduced or stopped, then restarted once the blood pressure recovers.',
      notes: 'Baveno VIII 4.6: carvedilol is dose-reduced or discontinued with persistently low blood pressure (systolic <90 mmHg or MAP <65 mmHg) and/or HRS-AKI. Baveno VIII 4.7: it is re-initiated and/or re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered. Hemorrhage is one cause of hypotension; infection and overdiuresis are others. The model reads the systolic pressure and the MAP live in the first two rows; it has no HRS-AKI, so that row states the rule only. The hemorrhage stays in the model and carvedilol is still on here; the next slide holds it.',
      ask: ['A man on carvedilol has a MAP of 62 mmHg after a hemorrhage. What do you do with the carvedilol, and when is it restarted?', 'Dose-reduce or stop it. Restart it once the blood pressure has recovered and any HRS-AKI has resolved.'],
    },
    {
      id: 'terli', params: { drugs: { carvedilol: false, terlipressin: true } }, action: [UNIT, UNIT, UNIT, UNIT, ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: TILES, key: ['rpp'], delta: 'carv',
      compare: [{ label: 'Terlipressin', short: 'Terli.', own: true }, { label: 'Norepinephrine', short: 'Norepi.', params: { drugs: { carvedilol: false, terlipressin: false } } }],
      kicker: 'HRS-AKI', site: 'sin', title: 'Terlipressin with albumin raises the MAP in HRS-AKI', cite: 'Baveno VIII 6.18, 6.19, 6.20',
      line: 'Terlipressin with albumin is considered for HRS-AKI, preferably as a continuous infusion from {2 to 3 mg/24 h}; his blood pressure rises to {map}. Norepinephrine, the alternative, is not modeled.',
      notes: 'Baveno VIII 6.18: in HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong). 6.19: terlipressin is preferably given as a continuous IV infusion, starting at 2 to 3 mg/24 h, to reduce adverse events. Terlipressin constricts the splanchnic and systemic arteries, so the MAP rises; the albumin expands the circulating volume. HRS-AKI is not caused by blood loss, so the 1.3 L hemorrhage of the last slide is replaced first, with four units of packed red blood cells, and the tiles compare with the state before the hemorrhage. Carvedilol is held here, which is why the heart rate is slightly higher than on carvedilol. Baveno VIII 6.20: norepinephrine is the alternative if terlipressin is unavailable, contraindicated or not tolerated (LoE 1, strong). The model has terlipressin but no norepinephrine, so the Norepinephrine button leaves the values where they were before the drug; it shows the rule, not a result. The model shows the rise in the MAP and the RPP and cannot show renal recovery.',
      ask: ['How is terlipressin given in HRS-AKI, and what is given with it?', 'Preferably as a continuous IV infusion, starting at 2 to 3 mg/24 h, with albumin.'],
    },
    {
      id: 'staging', cam: 'fit', data: 'tiles', tiles: TILES, key: ['rpp'],
      tool: { kind: 'criteria', title: 'Evaluating for a TIPS', short: 'Before a TIPS', ticks: false, lead: 'For recurrent or refractory ascites.', rule: 'Baveno VIII 6.9',
        rows: ['**Renal function** assessed in every patient', '**Chronic kidney disease** staged by eGFR'], verdict: 'The CKD stage stratifies the risk.' },
      kicker: 'Before a TIPS', site: 'sin', title: 'Assess renal function before a TIPS for ascites',
      line: 'Before a TIPS for recurrent or refractory ascites, assess renal function in every patient and stage chronic kidney disease by eGFR. The RPP cannot do this.',
      notes: 'Baveno VIII 6.9: in patients undergoing evaluation for TIPS for recurrent or refractory ascites, renal function should be systematically assessed and chronic kidney disease staged (eGFR) for risk stratification (LoE 2, strong). The RPP tile has no filtration behind it, so it cannot replace the eGFR. A TIPS also lowers the effective arterial blood volume further, which is why renal function is assessed first.',
      ask: ['What renal assessment is needed before a TIPS for refractory ascites?', 'Renal function in every patient, with chronic kidney disease staged by eGFR for risk stratification.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['map', 'hr', 'asc', 'rpp'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'arteries', kicker: 'Start', title: 'Ascites on diuretics' }, { id: 'tense', kicker: 'Tense ascites', title: 'Four months off diuretics' }, { id: 'tap', kicker: 'LVP', title: 'Paracentesis with albumin' }, { id: 'carv', kicker: 'Drug', title: 'Carvedilol' }, { id: 'hold', kicker: 'Hemorrhage', title: 'Large hemorrhage on carvedilol' }, { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin, albumin, blood replaced' }],
      kicker: 'Summary', title: 'What changes the renal perfusion pressure',
      line: 'The MAP and the IAP set the RPP. Large-volume paracentesis and terlipressin raise it; carvedilol and hemorrhage lower it.',
      notes: 'The RPP depends on two pressures: the MAP, which arterial vasodilation keeps low and carvedilol and hemorrhage lower further, and the IAP, which tense ascites raises and large-volume paracentesis restores. Terlipressin with albumin raises the MAP. Carvedilol is dose-reduced with a MAP <65 mmHg or HRS-AKI and restarted once these have resolved. Norepinephrine is the alternative to terlipressin, and chronic kidney disease is staged by eGFR before a TIPS. The tile is a pressure and does not measure renal function.',
      ask: ['Which two pressures set the RPP, and which treatment in this talk acts on each?', 'The MAP and the IAP. Terlipressin raises the MAP; large-volume paracentesis lowers the IAP.'],
    },
  ],
};
