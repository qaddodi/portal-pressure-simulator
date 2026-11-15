// Presenter talk: albumin in cirrhosis, when it is given (the slide fields are described at the top of decks.js). One man with tense ascites:
// the four indications of short-term albumin, the large-volume tap that comes with it, long-term albumin for ascites that keeps returning when a
// TIPS is not possible, and terlipressin with albumin for HRS-AKI, with what the model shows of the volume it adds. The model has no kidney
// function, no infection and no creatinine, so the slides show the serum albumin, the blood volume and the pressures, and a card carries the rules.
//
// Sources, checked 15 Nov 2026 against the guideline files in guidelines/ (Baveno VIII, AASLD 2024 and the AASLD 2021 ascites guidance):
// - Baveno VIII (J Hepatol 2026) Table 3 (statements of earlier Baveno reports that remain valid): short-term albumin is indicated for SBP, AKI
//   beyond stage 1A, large-volume paracentesis, and combined with terlipressin for HRS-AKI. 6.18: in HRS-AKI, terlipressin and albumin should
//   be considered (LoE 1, strong). 6.19: terlipressin preferably as a continuous infusion starting at 2 to 3 mg/24 h. 6.20: norepinephrine as the
//   alternative. 6.10: in recurrent or refractory ascites, in patients who are not TIPS candidates, long-term albumin may be considered because it
//   can improve ascites control and reduce ascites-related complications (LoE 3, weak). RA4.12 and RA4.13: who benefits, the best starting albumin
//   level, and long-term albumin against TIPS are research questions. 6.3 to 6.11: the recurrent or refractory ascites chart.
// - AASLD 2024 has no albumin dosing; the doses are AASLD 2021 (Biggins, Hepatology 2021;74:1014): LVP of more than 5 L, 6 to 8 g for every liter of
//   ascites removed (expert opinion); SBP, 1.5 g/kg on day 1 and 1 g/kg on day 3; the volume challenge before HRS-AKI is diagnosed, 1 g/kg a day for
//   2 days; with terlipressin in HRS-AKI, 1 g/kg on day 1, then 40 to 50 g a day for the duration of therapy.

const BELLY = { kind: 'abdomen' };
const ALBUMIN = { kind: 'infuse', fluid: 'albumin' };
const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };

export const ALBUMIN_DECK = {
  id: 'albumin', level: 'advanced', title: 'Albumin: when to give it', minutes: 9,
  objectives: [
    'Name the four indications for short-term albumin',
    'Explain why large-volume paracentesis (LVP) is given with albumin',
    'Identify who may be considered for long-term albumin',
    'Pair albumin with terlipressin in HRS-AKI, and give the AASLD 2021 doses',
  ],
  checks: [
    ['Which four situations call for short-term albumin in cirrhosis?', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin (Baveno VIII Table 3).'],
    ['Who may be considered for long-term albumin?', 'A patient with recurrent or refractory ascites who is not a TIPS candidate. The recommendation is weak (Baveno VIII 6.10).'],
    ['Terlipressin raises the MAP of a man with HRS-AKI from 62 to 70 mmHg. What is given with it, and why?', 'Albumin. It expands the circulating volume while terlipressin constricts the arteries (Baveno VIII 6.18).'],
    ['How much albumin goes with a large-volume paracentesis of >5 L?', '6 to 8 g for every liter of ascites removed, which is about 30 to 40 g after 5 L (AASLD 2021, expert opinion).'],
    ['What albumin dose goes with antibiotics for SBP?', '1.5 g/kg on day 1 and 1 g/kg on day 3 (AASLD 2021).'],
    ['What albumin dose goes with terlipressin in HRS-AKI?', '1 g/kg on day 1, then 40 to 50 g a day for the duration of therapy (AASLD 2021).'],
    ['In the model a second and third albumin infusion raise the MAP and the portal pressure. What does that say about the dose?', 'More volume is not more benefit. The portal pressure rises with the blood volume, so the dose follows the indication.'],
  ],
  summary: 'The four indications for short-term albumin, large-volume paracentesis, long-term albumin when a TIPS is not possible, and terlipressin with albumin in HRS-AKI, with what the volume does to the pressures.',
  slides: [
    {
      id: 'ind', preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'],
      tool: { kind: 'criteria', title: 'Short-term albumin', short: 'Albumin', ticks: false, lead: 'Any one of these.',
        rows: ['**Spontaneous bacterial peritonitis**: 1.5 g/kg on day 1, 1 g/kg on day 3', '**AKI** >stage 1A: 1 g/kg a day for 2 days', { text: '**Large-volume paracentesis**: 6 to 8 g per liter removed', lit: true }, '**HRS-AKI**, together with terlipressin: 1 g/kg, then 40 to 50 g a day'], verdict: 'He needs the third: large-volume paracentesis. Doses: AASLD 2021.' },
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis stopped his diuretics 4 months ago. He has tense ascites, and his serum albumin is 2.4 g/dL.',
      kicker: 'Four indications', site: 'sin', title: 'Short-term albumin has four indications',
      line: 'Baveno VIII indicates albumin for SBP, AKI >stage 1A, large-volume paracentesis (LVP) and HRS-AKI with terlipressin. He has {asc} of ascites, so LVP comes first.',
      notes: 'Source: Baveno VIII Table 3, the statements of earlier Baveno reports that remain valid. Short-term albumin is indicated for spontaneous bacterial peritonitis, acute kidney injury beyond stage 1A, large-volume paracentesis, and, together with terlipressin, HRS-AKI (6.18). Baveno VIII and AASLD 2024 give no dose; the doses on the card are AASLD 2021: 1.5 g/kg on day 1 and 1 g/kg on day 3 for SBP, 1 g/kg a day for 2 days as the volume challenge in AKI, 6 to 8 g for every liter of ascites removed at paracentesis, and 1 g/kg on day 1 then 40 to 50 g a day with terlipressin in HRS-AKI. Local protocols vary. The model has no infection and no kidney function, so the slides that follow show what it can: the serum albumin, the blood volume and the pressures.',
      ask: ['Name the four indications for short-term albumin in cirrhosis.', 'SBP, AKI beyond stage 1A, a large-volume paracentesis, and HRS-AKI together with terlipressin.'],
    },
    {
      id: 'tap', action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'ind',
      kicker: 'Large-volume paracentesis', site: 'sin', title: 'Large-volume paracentesis is given with albumin',
      line: 'LVP drains the ascites to {asc}. Albumin goes with it at {6 to 8 g} per liter removed, and his serum albumin is {salb}.',
      notes: 'Source: Baveno VIII Table 3. Albumin maintains the effective arterial blood volume after LVP. Without it, splanchnic vasodilation worsens over the following days, which can cause AKI, hyponatremia and faster reaccumulation of ascites (post-paracentesis circulatory dysfunction). The model has no kidneys, and its circulatory dysfunction needs removal of >5 L without albumin, so it shows the drainage and the serum albumin but no AKI. The guideline step is to give albumin with LVP. AASLD 2021 recommends it when more than 5 L is removed, at 6 to 8 g for every liter removed (expert opinion), which is about 30 to 40 g after the 5.1 L drained here; the risk of post-paracentesis circulatory dysfunction may rise above 8 L in one session. Baveno VIII and AASLD 2024 give no dose.',
      ask: ['Why is albumin given with large-volume paracentesis, and how much?', 'It protects the effective arterial blood volume and renal function after LVP (Baveno VIII Table 3). The dose is 6 to 8 g for every liter removed when >5 L is drained (AASLD 2021).'],
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
      id: 'answer', cam: 'fit', tool: { kind: 'trial', id: 'answer' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'tap',
      kicker: 'Long-term albumin', site: 'sin', title: 'ANSWER tested long-term albumin and measured survival',
      line: 'The model shows the serum albumin and the ascites. ANSWER gave albumin to patients with uncomplicated ascites on diuretics and counted deaths to 18 months.',
      notes: 'ANSWER (Caraceni, Lancet 2018) randomized 440 patients at 33 hospitals in Italy to standard care with or without albumin, 40 g twice weekly for 2 weeks and then 40 g weekly, for up to 18 months. All had uncomplicated ascites on an aldosterone antagonist at 200 mg/day or more and furosemide at 25 mg/day or more. Survival at 18 months was 77% with albumin against 66% (hazard ratio 0.62). The trial was open label. Baveno VIII 6.10 is narrower than the trial: it is for recurrent or refractory ascites in a patient who cannot have a TIPS, and it is weak. The model has no deaths, so it cannot repeat the trial.',
      ask: ['Whom did ANSWER enroll, and how is Baveno VIII 6.10 narrower?', 'Patients with uncomplicated ascites on diuretics. Baveno VIII 6.10 covers only recurrent or refractory ascites when a TIPS is not possible (weak).'],
    },
    {
      id: 'attire', cam: 'fit', tool: { kind: 'trial', id: 'attire' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'tap',
      kicker: 'Short-term albumin', site: 'sin', title: 'ATTIRE raised the serum albumin in hospital and found no benefit',
      line: 'A low serum albumin is not an indication by itself. ATTIRE infused albumin to a serum level of 3.0 g/dL in hospitalized patients, and outcomes did not change.',
      notes: 'ATTIRE (China, N Engl J Med 2021) randomized 777 hospitalized patients with decompensated cirrhosis and a serum albumin under 3.0 g/dL (30 g/L) to albumin infusions aiming for 3.0 g/dL or standard care. A new infection, renal dysfunction or death within days 3 to 15 occurred in 29.7% with albumin and 30.2% with standard care (adjusted odds ratio 0.98), and pulmonary edema or fluid overload occurred in 23 against 8 events. Baveno VIII has no statement that encourages albumin to a target level in hospital; the four indications of the first slide stand.',
      ask: ['Does raising a hospitalized patient\'s serum albumin to 3.0 g/dL improve outcomes?', 'No. Infection, renal dysfunction or death occurred in 29.7% against 30.2% (adjusted OR 0.98), and fluid overload was more frequent with albumin.'],
    },
    {
      id: 'macht', cam: 'fit', tool: { kind: 'trial', id: 'macht' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['salb'], delta: 'tap',
      kicker: 'Long-term albumin', site: 'sin', title: 'MACHT added midodrine to albumin and found no difference',
      line: 'MACHT gave patients with ascites on the transplant list midodrine plus albumin or placebo. Complications and 1-year mortality did not differ.',
      notes: 'MACHT (Solà, J Hepatol 2018) randomized 196 patients with cirrhosis and ascites listed for liver transplantation, double blind, to midodrine 15 to 30 mg a day plus albumin 40 g every 15 days, or to placebos, for up to a year. Renal failure, hyponatremia, infection, hepatic encephalopathy and gastrointestinal bleeding did not differ (P = 0.402), nor did 1-year mortality (P = 0.527). The abstract gives no result per arm, so the card shows none. This regimen is not Baveno VIII 6.10, which concerns albumin alone when a TIPS is not possible.',
      ask: ['Did midodrine plus albumin improve outcomes in patients with ascites awaiting transplant?', 'No. Complications and 1-year mortality did not differ from placebo in MACHT.'],
    },
    {
      id: 'terli', params: { drugs: { terlipressin: true } }, cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'long',
      kicker: 'HRS-AKI', site: 'sin', title: 'Terlipressin raises the MAP in HRS-AKI',
      line: 'Suppose he now has HRS-AKI. Terlipressin constricts the splanchnic arteries: his blood pressure rises to {map} and the portal pressure falls to {pv}. Baveno VIII pairs it with albumin.',
      notes: 'Source: Baveno VIII 6.18 to 6.20. In HRS-AKI, treatment with terlipressin and albumin should be considered (LoE 1, strong). Terlipressin is preferably given as a continuous intravenous infusion starting at 2 to 3 mg/24 h, which causes fewer adverse events than boluses (6.19). Norepinephrine is the alternative when terlipressin is unavailable, contraindicated or not tolerated (6.20). Terlipressin constricts the splanchnic and systemic arteries, so the MAP rises and the portal inflow and pressure fall. The model shows the pressures and cannot show renal recovery.',
      ask: ['What is given with terlipressin in HRS-AKI?', 'Albumin (Baveno VIII 6.18), at 1 g/kg on day 1 and then 40 to 50 g a day (AASLD 2021). Norepinephrine stands in for terlipressin if it cannot be used.'],
    },
    {
      id: 'terli-alb', action: [ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'Albumin expands the circulating volume as terlipressin constricts the arteries',
      line: 'One albumin infusion raises his serum albumin to {salb} and his cardiac output from {co@terli} to {co}. His blood pressure is {map}.',
      notes: 'Source: Baveno VIII 6.18, Table 3. Albumin expands the circulating volume while terlipressin constricts the arteries, which is why they are given together. In the model each infusion raises the serum albumin by about 0.25 g/dL and adds blood volume, so the cardiac output rises. The model cannot show the renal response. The dose is from AASLD 2021, not Baveno VIII or AASLD 2024: 1 g/kg on day 1, then 40 to 50 g a day for the duration of therapy. Watch for pulmonary edema from the albumin.',
      ask: ['Why is albumin given with terlipressin rather than terlipressin alone?', 'It expands the circulating volume while terlipressin constricts the arteries (Baveno VIII 6.18).'],
    },
    {
      id: 'confirm', cam: 'fit', tool: { kind: 'trial', id: 'confirm' }, data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'CONFIRM measured whether terlipressin reverses HRS-AKI',
      line: 'The model shows the pressures. CONFIRM counted verified reversal of type 1 HRS in adults given terlipressin or placebo, albumin in both arms.',
      notes: 'CONFIRM (Wong, N Engl J Med 2021) randomized 300 adults with type 1 hepatorenal syndrome 2 to 1 to terlipressin or placebo, with albumin recommended in both, for up to 14 days. Verified HRS reversal was 32% (63 of 199) with terlipressin against 17% (17 of 101) with placebo (P = 0.006). Deaths from respiratory disorders by day 90 were 11% (22 of 199) against 2% (2 of 101), so oxygenation and volume status are watched. More reversal did not establish a survival benefit. Baveno VIII 6.18: terlipressin and albumin should be considered in HRS-AKI. The model has no kidneys, so it cannot show reversal.',
      ask: ['What did CONFIRM show for terlipressin plus albumin, and what was its main risk?', 'More verified HRS reversal, 32% against 17%, with more deaths from respiratory disorders, 11% against 2%.'],
    },
    {
      id: 'more', action: [ALBUMIN, ALBUMIN], cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['map', 'pv'], key: ['pv'], delta: 'terli',
      kicker: 'HRS-AKI', site: 'sin', title: 'More albumin raises the portal pressure with the blood volume',
      line: 'Two more albumin infusions raise his blood pressure to {map} and the portal pressure back to {pv}. Volume beyond the need has a cost, so the dose follows the indication.',
      notes: 'This is the model\'s behavior, not a guideline statement. Blood volume rises with each infusion, and the portal pressure, which terlipressin had lowered, rises with the volume that reaches the splanchnic circulation. Baveno VIII gives no ceiling, and the AASLD 2021 dose is a weight-based figure, not a count of infusions. At the bedside the dose is set by the indication and the response, and the patient is monitored for volume overload.',
      ask: ['In the model each extra albumin infusion raises the portal pressure. Why?', 'The blood volume rises, and more of it reaches the splanchnic circulation and the portal vein.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['asc', 'map', 'co', 'pv'], asc: false, rowHead: 'Step',
      of: [{ id: 'ind', kicker: 'Baseline', title: 'Tense ascites', ref: true }, { id: 'tap', kicker: 'LVP', title: 'Paracentesis with albumin' }, { id: 'long', kicker: 'Long term', title: 'Long-term albumin, 8 weeks' }, { id: 'terli', kicker: 'HRS-AKI', title: 'Terlipressin' },
        { id: 'terli-alb', kicker: 'HRS-AKI', title: 'Terlipressin and one infusion' }, { id: 'more', kicker: 'HRS-AKI', title: 'Three infusions' }],
      kicker: 'Summary', title: 'What albumin changes',
      line: 'Albumin protects the circulation after LVP, improves ascites control in a patient who cannot have a TIPS, and goes with terlipressin in HRS-AKI. More volume raises the portal pressure.',
      notes: 'Short-term albumin has four indications: SBP, AKI beyond stage 1A, large-volume paracentesis, and HRS-AKI with terlipressin (Baveno VIII Table 3, 6.18). Long-term albumin may be considered for recurrent or refractory ascites in a patient who is not a TIPS candidate (6.10, weak). The doses for the short-term indications are from AASLD 2021: 6 to 8 g per liter removed at LVP, 1.5 g/kg then 1 g/kg for SBP, and 1 g/kg then 40 to 50 g a day with terlipressin in HRS-AKI.',
      ask: ['Which of the four indications does the model show best?', 'LVP and HRS-AKI, through the serum albumin and the pressures. It has no infection and no renal function.'],
    },
  ],
};
