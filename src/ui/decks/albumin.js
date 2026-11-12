// Presenter talk: albumin in cirrhosis, when it is given (the slide fields are described at the top of decks.js). One man with tense ascites:
// the four indications of short-term albumin, the large-volume tap that comes with it, long-term albumin for ascites that keeps returning when a
// TIPS is not possible, and terlipressin with albumin for HRS-AKI, with what the model shows of the volume it adds. The model has no kidney
// function, no infection and no creatinine, so the slides show the serum albumin, the blood volume and the pressures, and a card carries the rules.
//
// Sources, checked 11 Nov 2026 against the guideline files in guidelines/ (the AASLD 2021 ascites guidance and EASL 2025 are not in the folder yet):
// - Baveno VIII (J Hepatol 2026) Table 3 (statements of earlier Baveno reports that remain valid): short-term albumin is indicated for SBP, AKI
//   beyond stage 1A, large-volume paracentesis, and combined with terlipressin for HRS-AKI. 6.18: in HRS-AKI, terlipressin and albumin should
//   be considered (LoE 1, strong). 6.19: terlipressin preferably as a continuous infusion starting at 2 to 3 mg/24 h. 6.20: norepinephrine as the
//   alternative. 6.10: in recurrent or refractory ascites, in patients who are not TIPS candidates, long-term albumin may be considered because it
//   can improve ascites control and reduce ascites-related complications (LoE 3, weak). RA4.12 and RA4.13: who benefits, the best starting albumin
//   level, and long-term albumin against TIPS are research questions. 6.3 to 6.11: the recurrent or refractory ascites chart.
// - AASLD 2024 has no albumin dosing. No dose is quoted here: neither file gives one, and the AASLD 2021 ascites guidance that does is not in the folder.

const BELLY = { kind: 'abdomen' };
const ALBUMIN = { kind: 'infuse', fluid: 'albumin' };
const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };

export const ALBUMIN_DECK = {
  id: 'albumin', level: 'advanced', title: 'Albumin: when to give it', minutes: 9,
  objectives: [
    'Name the four indications for short-term albumin',
    'Say why a large-volume tap comes with albumin',
    'Say who may be considered for long-term albumin',
    'Pair albumin with terlipressin in HRS-AKI',
  ],
  checks: [
    ['Which four situations call for short-term albumin in cirrhosis?', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin (Baveno VIII Table 3).'],
    ['Who may be considered for long-term albumin?', 'A patient with recurrent or refractory ascites who is not a TIPS candidate. The recommendation is weak (Baveno VIII 6.10).'],
    ['Terlipressin lifts the MAP of a man with HRS-AKI from 62 to 70 mmHg. What goes with it, and why?', 'Albumin. It fills the circulation while terlipressin narrows the arteries (Baveno VIII 6.18).'],
    ['In the model a second and third bag of albumin raise the MAP and the portal pressure. What does that say about the dose?', 'More volume is not more benefit. The portal pressure rises with the blood volume, so the dose follows the indication.'],
  ],
  summary: 'The four indications for short-term albumin, the large-volume tap, long-term albumin when a TIPS is not possible, and terlipressin with albumin in HRS-AKI, with what the volume does to the pressures.',
  slides: [
    {
      id: 'ind', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'],
      tool: { kind: 'criteria', title: 'Short-term albumin', short: 'Albumin', ticks: false, lead: 'Any one of these.',
        rows: ['**Spontaneous bacterial peritonitis**', '**AKI** >stage 1A', { text: '**Large-volume paracentesis**', lit: true }, '**HRS-AKI**, together with terlipressin'], verdict: 'He is about to need the third: a tap.' },
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. His abdomen is tense and his albumin is 2.4 g/dL.',
      kicker: 'Four indications', site: 'sin', title: 'Short-term albumin has four indications',
      line: 'Baveno VIII keeps albumin for an SBP, an AKI >stage 1A, a large-volume paracentesis and HRS-AKI with terlipressin. He has {asc} of ascites, so the tap comes first.',
      notes: 'Source: Baveno VIII Table 3, the statements of earlier Baveno reports that remain valid. Short-term albumin is indicated for spontaneous bacterial peritonitis, acute kidney injury beyond stage 1A, large-volume paracentesis, and, together with terlipressin, HRS-AKI (6.18). Neither Baveno VIII nor AASLD 2024 gives a dose, so take it from your unit\'s ascites protocol. The model has no infection and no kidney function, so the slides that follow show what it can: the serum albumin, the blood volume and the pressures.',
      ask: ['Name the four indications for short-term albumin in cirrhosis.', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin.'],
    },
    {
      id: 'tap', action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'ind',
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'A large-volume tap comes with albumin',
      line: 'The tap drains the abdomen to {asc}. Albumin goes with it, and his serum albumin reads {salb}. Without it, a large tap can lower the effective blood volume.',
      notes: 'Source: Baveno VIII Table 3. Albumin guards the effective blood volume after a large drain. Without it the splanchnic vessels dilate further over the next days, which can bring kidney injury, a low sodium and a faster return of the ascites (post-paracentesis circulatory dysfunction). The model has no kidneys, and its circulatory dysfunction needs a tap of more than 5 L without albumin, so it shows the drain and the serum albumin but no kidney injury. The guideline step is to give albumin with the tap. Neither guideline file gives the dose.',
      ask: ['Why does albumin go with a large-volume tap?', 'It protects the effective blood volume and the kidneys after a large drain (Baveno VIII Table 3).'],
    },
    {
      id: 'long', params: { diuretics: true, albumin: 3.6 }, days: 56, lapse: { seconds: 7, from: 'After the tap', to: 'Eight weeks on' }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'salb'], keepTiles: true, title: 'Ascites and albumin over eight weeks' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'tap',
      compare: [{ label: 'No albumin', short: 'None', params: { albumin: 2.7 } }, { label: 'Long-term albumin', short: 'Albumin', own: true, params: { albumin: 3.6 } }],
      kicker: 'Long-term albumin', site: 'sin', title: 'A higher serum albumin holds the fluid back',
      line: 'Say his ascites keeps returning and he cannot have a TIPS. With long-term albumin his serum albumin stays at {salb} and the ascites settles at {asc}.',
      notes: 'Source: Baveno VIII 6.10, RA4.12, RA4.13. In recurrent or refractory ascites, in a patient who is not a TIPS candidate, long-term albumin may be considered because it can improve ascites control and reduce ascites-related complications (LoE 3, a weak recommendation). Who benefits, the best albumin level to start at, and long-term albumin against TIPS are research questions in the same report. In the model a higher serum albumin raises the oncotic pull, so more fluid is reabsorbed. The model has no kidneys and its timing is not a patient\'s, so no speed here is a promise.',
      ask: ['Who may be considered for long-term albumin?', 'A patient with recurrent or refractory ascites who is not a TIPS candidate (Baveno VIII 6.10, a weak recommendation).'],
    },
    {
      id: 'path', cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'tap',
      tool: { kind: 'path', of: 'ascites', short: 'Ascites path', patient: { tips: false, lt: true } },
      kicker: 'Long-term albumin', site: 'sin', title: 'Without a TIPS, the chart adds long-term albumin',
      line: 'For recurrent or refractory ascites the chart starts with a TIPS. When one is not possible, long-term albumin may help while a transplant is discussed.',
      notes: 'Source: Baveno VIII 6.3 to 6.11. Patients with recurrent or refractory ascites should be considered for a TIPS (6.3), with TIPS and liver transplant discussed together (6.4) and renal function checked first (6.9). If a TIPS is not possible or not enough, long-term albumin may be considered (6.10). A patient who is not a transplant candidate may have a home drainage device, a tunneled peritoneal catheter or a low-flow pump, instead of repeated large-volume taps (6.11). The chart is lit for a man who cannot have a TIPS and is a transplant candidate.',
      ask: ['A man with refractory ascites cannot have a TIPS and is not a transplant candidate. What does the chart offer?', 'A home drainage device instead of repeated taps, and long-term albumin may help (Baveno VIII 6.10, 6.11).'],
    },
    {
      id: 'terli', params: { drugs: { terlipressin: true } }, cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'long',
      kicker: 'HRS-AKI', site: 'sin', title: 'Terlipressin lifts the MAP in HRS-AKI',
      line: 'Say he now has HRS-AKI. Terlipressin narrows the splanchnic arteries: his blood pressure rises to {map} and the portal pressure falls to {pv}. Baveno VIII pairs it with albumin.',
      notes: 'Source: Baveno VIII 6.18 to 6.20. In HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong). Terlipressin is preferably given as a continuous intravenous infusion starting at 2 to 3 mg in 24 hours, which causes fewer adverse events than boluses (6.19). Norepinephrine is the alternative when terlipressin is unavailable, contraindicated or not tolerated (6.20). Terlipressin narrows the splanchnic and systemic arteries, so the MAP rises and the portal inflow and pressure fall. The model shows the pressures and cannot show the kidney recovering.',
      ask: ['What is given with terlipressin in HRS-AKI?', 'Albumin (Baveno VIII 6.18). Norepinephrine stands in for terlipressin if it cannot be used.'],
    },
    {
      id: 'terli-alb', action: [ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'Albumin fills the circulation as terlipressin narrows the arteries',
      line: 'One bag of albumin raises his serum albumin to {salb} and his cardiac output from {co@terli} to {co}. His blood pressure is {map}.',
      notes: 'Source: Baveno VIII 6.18, Table 3. The albumin expands the circulating volume while terlipressin narrows the arteries, which is why they are given together. In the model a bag raises the serum albumin by about 0.25 g/dL and adds blood volume, so the cardiac output rises. The model cannot show the kidney response, and neither guideline file gives the dose.',
      ask: ['Why is albumin given with terlipressin rather than terlipressin alone?', 'It fills the circulation while terlipressin narrows the arteries (Baveno VIII 6.18).'],
    },
    {
      id: 'more', action: [ALBUMIN, ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['pv'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'More albumin raises the portal pressure with the volume',
      line: 'Two more bags push his blood pressure to {map} and the portal pressure back up to {pv}. Filling past the need has a cost, so the dose follows the indication.',
      notes: 'This is the model\'s behavior, not a guideline statement. Blood volume rises with each bag, and the portal pressure rises with the volume that reaches the splanchnic bed, which the terlipressin had lowered. Baveno VIII gives no ceiling and neither guideline file gives a dose. At the bedside the dose is set by the indication and the response, and the patient is watched for volume overload.',
      ask: ['In the model each extra bag of albumin raises the portal pressure. Why?', 'The blood volume rises, and more of it reaches the splanchnic bed and the portal vein.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['asc', 'map', 'co', 'pv'], asc: false, rowHead: 'Step',
      of: [{ id: 'ind', kicker: 'Baseline', title: 'Tense ascites', ref: true }, { id: 'tap', kicker: 'Tap', title: 'Paracentesis with albumin' }, { id: 'long', kicker: 'Long term', title: 'Long-term albumin, 8 weeks' }, { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin' },
        { id: 'terli-alb', kicker: 'HRS-AKI', title: 'Terlipressin and one bag' }, { id: 'more', kicker: 'HRS-AKI', title: 'Three bags' }],
      kicker: 'Summary', title: 'What albumin changes',
      line: 'Albumin guards the circulation after a tap, holds ascites back in a patient without a TIPS, and goes with terlipressin in HRS-AKI. More volume raises the portal pressure.',
      notes: 'Short-term albumin has four indications: SBP, AKI beyond stage 1A, a large-volume tap, and HRS-AKI with terlipressin (Baveno VIII Table 3, 6.18). Long-term albumin may be considered for recurrent or refractory ascites in a patient who is not a TIPS candidate (6.10, weak). Doses are not in either guideline file.',
      ask: ['Which of the four indications does the model show best?', 'The tap and HRS-AKI, through the serum albumin and the pressures. It has no infection and no kidney function.'],
    },
  ],
};
