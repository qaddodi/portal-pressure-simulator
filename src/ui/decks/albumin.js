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
    'Explain why large-volume paracentesis (LVP) is given with albumin',
    'Identify who may be considered for long-term albumin',
    'Pair albumin with terlipressin in HRS-AKI',
  ],
  checks: [
    ['Which four situations call for short-term albumin in cirrhosis?', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin (Baveno VIII Table 3).'],
    ['Who may be considered for long-term albumin?', 'A patient with recurrent or refractory ascites who is not a TIPS candidate. The recommendation is weak (Baveno VIII 6.10).'],
    ['Terlipressin raises the MAP of a man with HRS-AKI from 62 to 70 mmHg. What is given with it, and why?', 'Albumin. It expands the circulating volume while terlipressin constricts the arteries (Baveno VIII 6.18).'],
    ['In the model a second and third albumin infusion raise the MAP and the portal pressure. What does that say about the dose?', 'More volume is not more benefit. The portal pressure rises with the blood volume, so the dose follows the indication.'],
  ],
  summary: 'The four indications for short-term albumin, large-volume paracentesis, long-term albumin when a TIPS is not possible, and terlipressin with albumin in HRS-AKI, with what the volume does to the pressures.',
  slides: [
    {
      id: 'ind', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'],
      tool: { kind: 'criteria', title: 'Short-term albumin', short: 'Albumin', ticks: false, lead: 'Any one of these.',
        rows: ['**Spontaneous bacterial peritonitis**', '**AKI** >stage 1A', { text: '**Large-volume paracentesis**', lit: true }, '**HRS-AKI**, together with terlipressin'], verdict: 'He is about to need the third: large-volume paracentesis.' },
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. He has tense ascites, and his serum albumin is 2.4 g/dL.',
      kicker: 'Four indications', site: 'sin', title: 'Short-term albumin has four indications',
      line: 'Baveno VIII indicates albumin for SBP, AKI >stage 1A, large-volume paracentesis (LVP) and HRS-AKI with terlipressin. He has {asc} of ascites, so LVP comes first.',
      notes: 'Source: Baveno VIII Table 3, the statements of earlier Baveno reports that remain valid. Short-term albumin is indicated for spontaneous bacterial peritonitis, acute kidney injury beyond stage 1A, large-volume paracentesis, and, together with terlipressin, HRS-AKI (6.18). Neither Baveno VIII nor AASLD 2024 gives a dose, so follow your institution\'s ascites protocol. The model has no infection and no kidney function, so the slides that follow show what it can: the serum albumin, the blood volume and the pressures.',
      ask: ['Name the four indications for short-term albumin in cirrhosis.', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin.'],
    },
    {
      id: 'tap', action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'ind',
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'Large-volume paracentesis is given with albumin',
      line: 'LVP drains the ascites to {asc}. Albumin is given with it, and his serum albumin is {salb}. Without albumin, LVP can lower the effective arterial blood volume.',
      notes: 'Source: Baveno VIII Table 3. Albumin maintains the effective arterial blood volume after LVP. Without it, splanchnic vasodilation worsens over the following days, which can cause AKI, hyponatremia and faster reaccumulation of ascites (post-paracentesis circulatory dysfunction). The model has no kidneys, and its circulatory dysfunction needs removal of >5 L without albumin, so it shows the drainage and the serum albumin but no AKI. The guideline step is to give albumin with LVP. Neither Baveno VIII nor AASLD 2024 gives the dose.',
      ask: ['Why is albumin given with large-volume paracentesis?', 'It protects the effective arterial blood volume and renal function after LVP (Baveno VIII Table 3).'],
    },
    {
      id: 'long', params: { diuretics: true, albumin: 3.6 }, days: 56, lapse: { seconds: 7, from: 'After LVP', to: 'Eight weeks on' }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'salb'], keepTiles: true, title: 'Ascites and albumin over eight weeks' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'tap',
      compare: [{ label: 'No albumin', short: 'None', params: { albumin: 2.7 } }, { label: 'Long-term albumin', short: 'Albumin', own: true, params: { albumin: 3.6 } }],
      kicker: 'Long-term albumin', site: 'sin', title: 'A higher serum albumin improves ascites control',
      line: 'Suppose his ascites keeps recurring and he cannot have a TIPS. On long-term albumin his serum albumin is {salb} and the ascites stabilizes at {asc}.',
      notes: 'Source: Baveno VIII 6.10, RA4.12, RA4.13. In recurrent or refractory ascites, in a patient who is not a TIPS candidate, long-term albumin may be considered because it can improve ascites control and reduce ascites-related complications (LoE 3, a weak recommendation). Who benefits, the best albumin level to start at, and long-term albumin against TIPS are research questions in the same report. In the model a higher serum albumin raises the plasma oncotic pressure, so peritoneal reabsorption increases. The model has no kidneys, and its time course is not a patient\'s.',
      ask: ['Who may be considered for long-term albumin?', 'A patient with recurrent or refractory ascites who is not a TIPS candidate (Baveno VIII 6.10, a weak recommendation).'],
    },
    {
      id: 'path', cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'tap',
      tool: { kind: 'path', of: 'ascites', short: 'Ascites path', patient: { tips: false, lt: true } },
      kicker: 'Long-term albumin', site: 'sin', title: 'Without a TIPS, the algorithm adds long-term albumin',
      line: 'For recurrent or refractory ascites the algorithm starts with a TIPS. When a TIPS is not possible, long-term albumin may help while liver transplantation is discussed.',
      notes: 'Source: Baveno VIII 6.3 to 6.11. Patients with recurrent or refractory ascites should be considered for a TIPS (6.3), with TIPS and liver transplantation discussed together (6.4) and renal function assessed first (6.9). If a TIPS is not possible or not enough, long-term albumin may be considered (6.10). A patient who is not a transplant candidate may have a home drainage device, a tunneled peritoneal catheter or a low-flow pump, instead of repeated LVP (6.11). The algorithm is applied to a man who cannot have a TIPS and is a transplant candidate.',
      ask: ['A man with refractory ascites cannot have a TIPS and is not a transplant candidate. What does the algorithm offer?', 'A home drainage device instead of repeated LVP, and long-term albumin may help (Baveno VIII 6.10, 6.11).'],
    },
    {
      id: 'terli', params: { drugs: { terlipressin: true } }, cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'long',
      kicker: 'HRS-AKI', site: 'sin', title: 'Terlipressin raises the MAP in HRS-AKI',
      line: 'Suppose he now has HRS-AKI. Terlipressin constricts the splanchnic arteries: his blood pressure rises to {map} and the portal pressure falls to {pv}. Baveno VIII pairs it with albumin.',
      notes: 'Source: Baveno VIII 6.18 to 6.20. In HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong). Terlipressin is preferably given as a continuous intravenous infusion starting at 2 to 3 mg/24 h, which causes fewer adverse events than boluses (6.19). Norepinephrine is the alternative when terlipressin is unavailable, contraindicated or not tolerated (6.20). Terlipressin constricts the splanchnic and systemic arteries, so the MAP rises and the portal inflow and pressure fall. The model shows the pressures and cannot show renal recovery.',
      ask: ['What is given with terlipressin in HRS-AKI?', 'Albumin (Baveno VIII 6.18). Norepinephrine stands in for terlipressin if it cannot be used.'],
    },
    {
      id: 'terli-alb', action: [ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'Albumin expands the circulating volume as terlipressin constricts the arteries',
      line: 'One albumin infusion raises his serum albumin to {salb} and his cardiac output from {co@terli} to {co}. His blood pressure is {map}.',
      notes: 'Source: Baveno VIII 6.18, Table 3. Albumin expands the circulating volume while terlipressin constricts the arteries, which is why they are given together. In the model each infusion raises the serum albumin by about 0.25 g/dL and adds blood volume, so the cardiac output rises. The model cannot show the renal response, and neither Baveno VIII nor AASLD 2024 gives the dose.',
      ask: ['Why is albumin given with terlipressin rather than terlipressin alone?', 'It expands the circulating volume while terlipressin constricts the arteries (Baveno VIII 6.18).'],
    },
    {
      id: 'more', action: [ALBUMIN, ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['pv'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'More albumin raises the portal pressure with the blood volume',
      line: 'Two more albumin infusions raise his blood pressure to {map} and the portal pressure back to {pv}. Volume beyond the need has a cost, so the dose follows the indication.',
      notes: 'This is the model\'s behavior, not a guideline statement. Blood volume rises with each infusion, and the portal pressure, which terlipressin had lowered, rises with the volume that reaches the splanchnic circulation. Baveno VIII gives no ceiling, and neither Baveno VIII nor AASLD 2024 gives a dose. At the bedside the dose is set by the indication and the response, and the patient is monitored for volume overload.',
      ask: ['In the model each extra albumin infusion raises the portal pressure. Why?', 'The blood volume rises, and more of it reaches the splanchnic circulation and the portal vein.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['asc', 'map', 'co', 'pv'], asc: false, rowHead: 'Step',
      of: [{ id: 'ind', kicker: 'Baseline', title: 'Tense ascites', ref: true }, { id: 'tap', kicker: 'LVP', title: 'Paracentesis with albumin' }, { id: 'long', kicker: 'Long term', title: 'Long-term albumin, 8 weeks' }, { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin' },
        { id: 'terli-alb', kicker: 'HRS-AKI', title: 'Terlipressin and one infusion' }, { id: 'more', kicker: 'HRS-AKI', title: 'Three infusions' }],
      kicker: 'Summary', title: 'What albumin changes',
      line: 'Albumin protects the circulation after LVP, improves ascites control in a patient who cannot have a TIPS, and goes with terlipressin in HRS-AKI. More volume raises the portal pressure.',
      notes: 'Short-term albumin has four indications: SBP, AKI beyond stage 1A, large-volume paracentesis, and HRS-AKI with terlipressin (Baveno VIII Table 3, 6.18). Long-term albumin may be considered for recurrent or refractory ascites in a patient who is not a TIPS candidate (6.10, weak). Neither Baveno VIII nor AASLD 2024 gives a dose.',
      ask: ['Which of the four indications does the model show best?', 'LVP and HRS-AKI, through the serum albumin and the pressures. It has no infection and no renal function.'],
    },
  ],
};
