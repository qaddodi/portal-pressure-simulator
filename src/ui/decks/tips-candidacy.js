// Presenter talk: who should get a TIPS and who should not (the slide fields are described at the top of decks.js). Seven patients, one
// decision each, in the order a team asks: is there an indication (a controlled bleed, a rebleed, ascites that keeps returning), can the
// liver spare the flow the stent takes, can the right heart take the blood it returns, and do the brain, the age and the frailty change the
// answer. The model draws the stent's cost (the PPG, the sinusoidal flow, the encephalopathy index, the right atrial pressure); the
// guideline thresholds that the model cannot read (Child-Pugh, MELD, bilirubin, age, an old episode of encephalopathy) stand in the case
// cards and the criteria cards, typed from the guideline and never taken from the model.
//
// Sources, checked 15 Nov 2026 against guidelines/: Baveno VIII (J Hepatol 2026) 4.13 (TIPS for bleeding despite carvedilol or an NSBB and
// EVL), 4.15 (liver cancer), 4.19 (frailty and sarcopenia), 5.31 (preemptive TIPS: Child-Pugh C 10 to 13, or B above 7 with active bleeding
// at endoscopy, or an HVPG of 20 mmHg or more; covered stent, within 72 hours, ideally under 24), 5.33 (acute-on-chronic liver failure,
// overt encephalopathy, bilirubin, the MELD score and severe alcohol-associated hepatitis are not absolute contraindications), 5.36 and 5.37
// (salvage TIPS for bleeding not controlled by drugs and EVL, whatever the age, Child-Pugh class or MELD, case by case), 6.3 and 6.4
// (recurrent or refractory ascites: consider TIPS, and discuss TIPS and liver transplant together), 6.5 (smallest adequate stent, to
// limit overshunting: encephalopathy and cardiac failure), 6.8 (age 70 or over, case by case), 6.9 (renal function staged first),
// 6.14 to 6.16 (encephalopathy history reviewed, not an absolute contraindication, rifaximin before an elective TIPS) and Figure 3
// (the preemptive TIPS box: age under 75, creatinine under 3 mg/dL, no heart failure); AASLD 2024 portal hypertension, guidance statements
// 32 and 35 (preemptive TIPS, and the words salvage for uncontrolled bleeding and rescue for a rebleed despite vasoactive drugs and EVL);
// AASLD 2021 ascites, TIPS and LT (a MELD of 18 or more makes a poor candidate; advanced age, cardiopulmonary insufficiency and
// sarcopenia predispose to complications and encephalopathy; a stent of 8 to 10 mm gives less encephalopathy; about 80% clear their
// ascites, over 4 to 6 months). None of the five guidelines in guidelines/ gives a platelet count, a bilirubin level or a right atrial
// pressure above which a TIPS is refused, so no slide teaches one.
//
// The model's numbers (a settled decompensated patient, 15 Nov 2026): a stent of 8 mm takes the PPG from 17 to 9 mmHg and the sinusoidal
// flow from 59% to 27% of normal; in a congested patient (pericardial constraint 0.9, 1,150 mL retained) the right atrium reads 22 mmHg,
// the PPG 11.5 and the portal vein 34, and the stent on its first day lifts the right atrium to 24. Nothing on a slide types a model number.

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };
const TIPS8 = { tips: { on: true, d: 8 } };
const REFRACTORY = { diuretics: false, albumin: 2.5 };
const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
const SQUEEZE = { pericardial: 0.9 };
const FLUID = 1150;
const fibrotic = (cirrhosis) => ({ preset: 'cirr-decomp', params: { ...REFRACTORY, cirrhosis, ...TIPS8 }, days: 60 });

export const TIPS_CANDIDACY = {
  id: 'tips-candidacy', level: 'advanced', title: 'Who should get a TIPS', minutes: 14,
  objectives: [
    'Name who qualifies for a preemptive, a rescue and an elective TIPS',
    'Explain why a failing liver and a congested heart weigh against an elective TIPS',
    'Say which findings do not exclude a TIPS on their own: bilirubin, MELD, an old episode of encephalopathy, age and frailty',
    'Read the gradients with the right atrial pressure before deciding',
  ],
  checks: [
    ['A man bleeds from varices and banding controls it. He is Child–Pugh C 11 with a bilirubin of 6 mg/dL. Does the bilirubin rule out a preemptive TIPS?', 'No. Once he meets the criteria, a high bilirubin and the MELD score are not absolute contraindications (Baveno VIII 5.33). Place the stent within 72 hours, ideally within 24.'],
    ['A woman with refractory ascites has a MELD of 22. Is she a candidate for an elective TIPS?', 'A poor one: AASLD 2021 considers a MELD ≥18 a marker of poor outcome after TIPS. Evaluate her for liver transplant, with LVP and albumin meanwhile.'],
    ['In constrictive pericarditis with ascites, the PPG is 11 mmHg and the right atrial pressure 22 mmHg. Why is a TIPS the wrong first move?', 'Congestion, not sinusoidal resistance, drives the ascites, and a stent adds preload to a right atrium that is already overloaded. Treat the pericardial disease first.'],
    ['Which findings alone neither indicate nor exclude a TIPS?', 'Frailty or sarcopenia (4.19), an age ≥70 in refractory ascites (judged case by case, 6.8), a liver tumor off the stent tract (4.15) and an old episode of encephalopathy (6.15).'],
  ],
  summary: 'Seven patients, one decision each: a bleed that qualifies and one that does not, a rebleed, ascites that returns, a failing liver, a congested heart, a past episode of encephalopathy, and an older, frail patient. Ends on a table of what the stent did and what was decided.',
  slides: [
    {
      id: 'pre', preset: 'cirr-decomp', action: BAND, cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis bled from varices; banding controlled it. Child–Pugh C 11, bilirubin 5.2 mg/dL, MELD 23, creatinine 1.1 mg/dL.',
      caseQ: 'Is he too sick for a TIPS?',
      tool: { kind: 'criteria', title: 'Preemptive TIPS', short: 'Preemptive', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31, 5.33',
        rows: [{ text: 'Child–Pugh C', cut: 'C 10–13', note: 'C 11', met: true, lit: true }, { text: 'Child–Pugh B, active bleeding at endoscopy', cut: 'B 8–9', note: 'not B' }, { text: 'HVPG, where measured', cut: '≥20 mmHg', note: 'not given' }],
        verdict: 'He qualifies. His bilirubin and MELD do not exclude him.' },
      kicker: 'Bleeding', site: 'sin', title: 'A high bilirubin and MELD do not rule out a preemptive TIPS',
      line: 'Place a covered TIPS within 72 hours, ideally within 24, to lower the PPG of {ppg}. Once he meets the criteria, his bilirubin and MELD do not exclude it.',
      notes: 'Baveno VIII 5.31 sets the criteria for a preemptive TIPS after esophageal or GOV1 bleeding: Child–Pugh C 10 to 13, or Child–Pugh B above 7 with active bleeding at the first endoscopy, or an HVPG of 20 mmHg or more at the time of the bleed. In a patient who meets them, acute-on-chronic liver failure, overt encephalopathy, a high bilirubin, the MELD score and severe alcohol-associated hepatitis are not absolute contraindications (5.33). AASLD 2024 (statement 32) gives the same Child–Pugh criteria. Its text adds that mortality after an early TIPS is high when the MELD score is above 19, but still lower than with standard therapy, and that transplant candidacy is assessed promptly.',
      ask: ['Which findings do not exclude a preemptive TIPS in a patient who meets the criteria?', 'Acute-on-chronic liver failure, overt encephalopathy, a high bilirubin, the MELD score and severe alcohol-associated hepatitis (Baveno VIII 5.33).'],
    },
    {
      id: 'pre-age', preset: 'cirr-decomp', action: BAND, cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      vignette: 'A 79-year-old woman with MASLD cirrhosis bled from varices; banding controlled it. Child–Pugh C 12, creatinine 1.3 mg/dL, no heart failure.',
      caseQ: 'Does she get the same TIPS?',
      tool: { kind: 'criteria', title: 'Before a preemptive TIPS', short: 'Also required', lead: 'Beside the Child–Pugh criteria.', rule: 'Baveno VIII 5.31',
        rows: [{ text: 'Age', cut: '<75 yr', note: '79', met: false, lit: true }, { text: 'Creatinine', cut: '<3 mg/dL', note: '1.3' }, { text: 'No heart failure', note: 'none' }],
        verdict: 'Past the age limit: carvedilol with banding instead.' },
      kicker: 'Bleeding', site: 'sin', title: 'The preemptive TIPS also has limits on age, kidney function and the heart',
      line: 'Her Child–Pugh score qualifies and she meets the renal and cardiac criteria, but at 79 she is past the age limit. She receives carvedilol and banding; her PPG is {ppg}.',
      notes: 'Figure 3 of Baveno VIII adds three conditions to the preemptive TIPS of statement 5.31: age under 75, creatinine under 3 mg/dL and no heart failure. AASLD 2024 notes that the trials of early TIPS left out older patients, severe kidney disease and heart failure. A patient who does not meet the criteria receives secondary prophylaxis, a beta-blocker with banding (carvedilol preferred), and TIPS is considered if she rebleeds (Baveno VIII 4.8, 4.13). The age limit belongs to the preemptive TIPS and does not follow her into the next decision.',
      ask: ['Name the three conditions beside the Child–Pugh criteria for a preemptive TIPS.', 'Age <75 years, creatinine <3 mg/dL and no heart failure (Baveno VIII Figure 3).'],
    },
    {
      id: 'rescue', question: 'She rebleeds on carvedilol and banding. Is her age still a barrier?', params: CARV, action: [BAND, BAND, BAND], days: 30, cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      tool: { kind: 'criteria', title: 'TIPS after a bleed', short: 'After a bleed', lead: 'Either one is an indication.', rule: 'Baveno VIII 4.13, 5.36, 5.37',
        rows: [{ text: '**Rebleeding** despite carvedilol and **banding**', note: 'rebled', met: true, lit: true }, { text: 'Bleeding **not controlled** by drugs and banding', note: 'not this' }],
        verdict: 'She rebled on both: a rescue TIPS is considered.' },
      kicker: 'Bleeding', site: 'sin', title: 'A rebleed despite carvedilol and banding is an indication for a rescue TIPS',
      line: 'On carvedilol with three bands her PPG is {ppg}; bleeding risk is high at {>=12 mmHg}. The bleed returned, and Baveno VIII 4.13 sets no age limit.',
      notes: 'Baveno VIII 4.13: TIPS should be considered in patients with portal hypertensive bleeding despite secondary prophylaxis with carvedilol or a nonselective beta-blocker plus banding (strong recommendation). AASLD 2024 calls this a rescue TIPS and calls a TIPS for bleeding that drugs and banding do not control a salvage TIPS (statement 35); Baveno VIII 5.36 and 5.37 would place a salvage TIPS regardless of age, Child–Pugh class or MELD score, case by case. A preemptive TIPS is decided in the first 72 hours and a rescue TIPS only after prophylaxis has failed, which is why the same woman is turned down for the first and offered the second.',
      ask: ['What is the difference between a rescue and a salvage TIPS in AASLD 2024?', 'Rescue: a rebleed despite vasoactive drugs and banding. Salvage: bleeding that drugs and banding do not control.'],
    },
    {
      id: 'ascites', preset: 'cirr-decomp', params: REFRACTORY, relax: 200, cam: 'fit', tool: { kind: 'trial', id: 'covered' }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 61-year-old woman with alcohol-associated cirrhosis needs a 5 L paracentesis every two weeks on full diuretics. MELD 11, no encephalopathy, normal echocardiogram.',
      caseQ: 'Is she a candidate for TIPS?',
      kicker: 'Ascites', site: 'sin', title: 'Ascites that returns after every paracentesis is an indication for TIPS', cite: 'Baveno VIII 6.3, 6.4',
      line: 'Her ascites is {asc} with a PPG of {ppg}. Her liver, heart and kidneys pass the checks, so TIPS is considered, and discussed together with liver transplant.',
      notes: 'Baveno VIII 6.3: patients with recurrent or refractory ascites should be considered for TIPS (level 1, strong), and TIPS and liver transplant should be discussed together (6.4). Renal function is staged first (6.9). The covered TIPS trial enrolled patients who needed repeated large-volume paracentesis; the card gives its numbers. AASLD 2021 says careful selection is the key to success: the benefit is largest in younger patients with a low MELD score, with a smaller covered stent and a complete response.',
      ask: ['What does Baveno VIII advise for recurrent ascites, and what is discussed with it?', 'Consider TIPS, and discuss TIPS and liver transplant together (6.3, 6.4).'],
    },
    {
      id: 'price', params: TIPS8, days: 60, lapse: { seconds: 8, from: 'Before the stent', to: 'Two months later' }, lens: 'flow', cam: 'liver', mark: STENT, tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'liver'], keepTiles: true, title: 'Ascites and sinusoidal flow over two months' }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      kicker: 'Ascites', site: 'sin', title: 'The stent clears the ascites but diverts most of the sinusoidal flow',
      line: 'Two months on, the ascites is {asc} and the PPG {ppg}, but sinusoidal flow has fallen to {liver} of normal.',
      notes: 'The stent gives portal blood a low-resistance path to the right heart. The pressure behind the liver falls, the fluid stops forming and the ascites drains, but the blood that takes the stent no longer passes through the sinusoids. The model clears the ascites in weeks. In patients it takes 4 to 6 months, about 80% clear it, and diuretics are used with caution meanwhile (AASLD 2021). A stent of 8 to 10 mm gives less encephalopathy than a wider one without losing control of the ascites (AASLD 2021; Baveno VIII 6.5).',
      ask: ['What does a TIPS give up to clear ascites?', 'Sinusoidal flow: part of the portal blood bypasses the liver.'],
    },
    {
      id: 'reserve', lens: 'flow', cam: 'liver', mark: STENT, data: 'tiles', tiles: ['liver', 'he'], key: ['liver'],
      compare: [{ label: 'Less fibrosis', short: 'Less', ...fibrotic(0.7), title: 'The same stent leaves more sinusoidal flow in a less fibrotic liver', line: 'In a less fibrotic liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A more fibrotic liver keeps less flow.' }, { label: 'This liver', short: 'This', own: true }, { label: 'More fibrosis', short: 'More', ...fibrotic(0.95), title: 'The same stent leaves less sinusoidal flow in a more fibrotic liver', line: 'In a more fibrotic liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A less fibrotic liver keeps more flow.' }],
      kicker: 'The liver', site: 'sin', title: 'How much sinusoidal flow a stent leaves depends on how fibrotic the liver is',
      line: 'In this liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A less fibrotic liver keeps more flow, a more fibrotic one keeps less.',
      notes: 'The model has no MELD score or bilirubin; it has the fibrosis, and the fibrosis sets how much flow the liver keeps once part of the portal blood takes the stent. The encephalopathy index is the model\'s own, built from the share of portal blood that bypasses the liver and the flow that still reaches it; it is not a clinical score. AASLD 2021: the survival benefit of TIPS in refractory ascites is largest in patients with a low MELD score, and a high MELD makes a poor candidate (next slide).',
      ask: ['Why does the same stent leave less flow in a more fibrotic liver?', 'The fibrotic liver offers more resistance, so more of the portal blood takes the stent and less is left for the sinusoids.'],
    },
    {
      id: 'meld', preset: 'cirr-decomp', params: { ...REFRACTORY, cirrhosis: 0.95 }, relax: 200, cam: 'fit', data: 'tiles', tiles: ['asc', 'liver'], key: ['liver'],
      vignette: 'A 59-year-old man with alcohol-associated cirrhosis has refractory ascites. Bilirubin 4.1 mg/dL, INR 1.8, creatinine 1.4 mg/dL: MELD 22.',
      caseQ: 'Should he get an elective TIPS?',
      tool: { kind: 'criteria', title: 'Before an elective TIPS', short: 'Elective', lead: 'Each makes a poor result more likely.',
        rows: [{ text: 'MELD score ≥18', note: 'MELD 22', met: true, lit: true }, { text: 'Advanced age, **cardiopulmonary insufficiency** or **sarcopenia**', note: 'none' }, { text: '**Renal function** staged', note: 'creatinine 1.4' }],
        verdict: 'A poor candidate: evaluate for liver transplant first.' },
      kicker: 'The liver', site: 'sin', title: 'For ascites, a MELD ≥18 marks a poor TIPS candidate',
      line: 'A MELD that does not exclude a preemptive TIPS argues against an elective one: before any stent, his sinusoidal flow is only {liver} of normal.',
      notes: 'AASLD 2021: patients with high MELD scores, 18 or more, are in general poor candidates for TIPS; advanced age, cardiopulmonary insufficiency and sarcopenia predispose to more complications and to encephalopathy; patients with refractory ascites and liver dysfunction that precludes TIPS should be considered for liver transplant. Baveno VIII 5.33 points the other way for a bleed that meets the preemptive criteria, because there the stent is lifesaving and the alternative is worse; the stakes, not the MELD, differ. Baveno VIII 6.4: TIPS and transplant are discussed together; 6.9: renal function is staged.',
      ask: ['Why can the same MELD allow a preemptive TIPS and argue against an elective one?', 'In a bleed that meets the criteria the stent saves lives and waiting is worse; in ascites the survival benefit is smaller and not urgent, and a failing liver is harmed by the lost portal perfusion.'],
    },
    {
      id: 'heart', preset: 'cirr-decomp', params: { diuretics: false, ...SQUEEZE }, action: { kind: 'retain', mL: FLUID }, days: 60, lens: 'heat', cam: 'route', labels: ['CONF', 'RHV', 'RA'], sites: ['ra'], data: 'tiles', tiles: ['ra', 'pv'], key: ['ra'],
      vignette: 'A 66-year-old man with MASLD cirrhosis has ascites that returns after every paracentesis. His jugular veins are distended and the echocardiogram shows a thickened pericardium.',
      caseQ: 'Will a TIPS clear it?',
      kicker: 'The heart', site: 'cardiac', title: 'A raised right atrial pressure lowers both gradients and points to the heart',
      line: 'His right atrial pressure is {ra}. The HVPG is {hvpg} and the PPG {ppg}, yet the portal vein pressure is {pv}: congestion, not sinusoidal resistance, drives the ascites.',
      notes: 'A raised right atrial pressure lifts the free and wedged hepatic vein pressures together, so the HVPG falls, and it lowers portal inflow, so the PPG falls too. The two gradients understate the portal pressure; the portal vein pressure and the right atrium show it. The same constriction is the Constrictive pericarditis patient of the model. Baveno VIII 6.5 names cardiac failure with encephalopathy as the risk of overshunting, and AASLD 2021 lists cardiopulmonary insufficiency among the risks of complications after TIPS. None of the guidelines here gives a right atrial pressure above which a TIPS is refused; the tile\'s rating (above 8 mmHg is high) is the app\'s own.',
      ask: ['In ascites, which reading beside the gradients tells you the heart is the cause?', 'The right atrial pressure: it lifts the FHVP and WHVP together and lowers both gradients.'],
    },
    {
      id: 'heart-stent', params: TIPS8, lens: 'heat', cam: 'route', labels: ['CONF', 'RHV', 'RA'], sites: ['ra'], mark: STENT, data: 'tiles', tiles: ['ra', 'co'], key: ['ra'], delta: 'heart',
      kicker: 'The heart', site: 'cardiac', title: 'A stent sends more blood to a right atrium that is already full',
      line: 'With the stent, the right atrium rises from {ra@heart} to {ra} and cardiac output from {co@heart} to {co}. The HVPG falls to {hvpg}, and the heart is no better.',
      notes: 'The model shows the first day after the stent. Portal blood now reaches the right atrium without passing the liver, so the preload of a heart that is already congested rises. The gradient reads as a success while the cause of the ascites is untouched. In the weeks after, the ascites drains and the right atrium falls, but it stays high. A congested heart is treated first, and for constrictive pericarditis that is pericardiectomy (EASL 2025 asks for a hemodynamic study when constriction is suspected). Baveno VIII lists no heart failure among the conditions for a preemptive TIPS (Figure 3).',
      ask: ['Why does a TIPS add load to a failing heart?', 'It returns portal blood straight to the right atrium, so venous return and preload rise.'],
    },
    {
      id: 'he', preset: 'cirr-decomp', params: { ...REFRACTORY, ...TIPS8 }, relax: 200, days: 30, lens: 'flow', cam: 'liver', mark: STENT, tool: { kind: 'trial', id: 'rifaximin', at: 'ascites' }, data: 'tiles', tiles: ['he', 'liver'], key: ['he'],
      vignette: 'A 63-year-old woman with refractory ascites had one episode of overt encephalopathy after a GI bleed two years ago. She takes lactulose. MELD 12.',
      caseQ: 'Does that rule out a TIPS?',
      kicker: 'The brain and age', site: 'sin', title: 'A past episode of overt encephalopathy is a reason to prepare, not to refuse', cite: 'Baveno VIII 6.14 to 6.16',
      line: 'Baveno VIII asks for her encephalopathy history and medicines to be reviewed, and for rifaximin to be considered before the stent. The model\'s encephalopathy index with the stent is {he}.',
      notes: 'Baveno VIII 6.14: before an elective TIPS, review the history of overt encephalopathy and the medicines used for it. 6.15: a past episode is not an absolute contraindication, and the decision is individualized. 6.16: rifaximin should be considered before an elective TIPS (strong recommendation). The card is the rifaximin trial, which enrolled patients scheduled for TIPS for ascites or to prevent rebleeding. A smaller stent also lowers the risk (6.5; AASLD 2021). If encephalopathy returns after the stent despite treatment, reducing or occluding it may be considered (6.17).',
      ask: ['Is a past episode of overt encephalopathy an absolute contraindication to an elective TIPS?', 'No. It is reviewed, rifaximin is considered, and the decision is individualized (6.14 to 6.16).'],
    },
    {
      id: 'age', preset: 'cirr-decomp', params: REFRACTORY, relax: 200, cam: 'fit', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 72-year-old man has cirrhosis and refractory ascites. He is frail and has lost muscle mass. MELD 13, creatinine 1.2 mg/dL, no heart failure, no encephalopathy.',
      caseQ: 'Do age and frailty exclude a TIPS?',
      tool: { kind: 'criteria', title: 'Age, frailty and cancer', short: 'Age and frailty', ticks: false, rule: 'Baveno VIII 4.15, 4.19, 6.8',
        rows: [{ text: 'Age ≥70, refractory ascites: **case by case**', note: 'age 72', met: true, lit: true }, { text: '**Frailty** or sarcopenia alone: neither indicates nor excludes', note: 'frail' }, { text: '**Liver cancer**: only a tumor on the stent tract excludes', note: 'none' }],
        verdict: 'A candidate to discuss, not a refusal.' },
      kicker: 'The brain and age', site: 'sin', title: 'Age and frailty alone neither indicate nor exclude a TIPS',
      line: 'At 72 he is judged case by case, and frailty alone does not decide. What counts is the whole picture, with TIPS and liver transplant discussed together.',
      notes: 'Baveno VIII 6.8: TIPS may be considered for recurrent or refractory ascites or hydrothorax in selected older adults, 70 years or more, on a case-by-case basis weighing benefit and risk (weak recommendation). 4.19: sarcopenia and frailty can improve after TIPS but also predict poor outcomes; alone they should neither indicate nor contraindicate TIPS and are weighed in the work-up. 4.15: a liver tumor is not an absolute contraindication unless it lies along the TIPS tract. The age under 75 of the preemptive TIPS is a separate rule for a different decision.',
      ask: ['Do an age ≥70 and frailty exclude a TIPS for refractory ascites?', 'No. Age is judged case by case (6.8) and frailty alone neither indicates nor excludes it (4.19).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'liver', 'ra', 'he'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'pre', kicker: 'Bleeding', title: 'Controlled bleed, Child–Pugh C 11', note: 'Preemptive TIPS' },
        { id: 'rescue', kicker: 'Bleeding', title: 'Rebleed on carvedilol and banding', note: 'Rescue TIPS' }, { id: 'ascites', kicker: 'Ascites', title: 'Recurrent ascites, MELD 11', note: 'TIPS' },
        { id: 'meld', kicker: 'Ascites', title: 'Refractory ascites, MELD 22', note: 'Transplant evaluation' }, { id: 'heart', kicker: 'Ascites', title: 'Constrictive pericarditis', note: 'Treat the heart' }],
      kicker: 'Summary', title: 'The decision rests on the indication, the liver, the heart and the brain',
      line: 'The indication comes first; hepatic, cardiac, renal and neurologic status then decide whether the benefit outweighs the risk.',
      notes: 'Six states of the model against a healthy reference. Each stent trades a lower PPG for sinusoidal flow and a heavier right heart. A failing liver cannot spare the flow and a congested heart cannot take the blood, so an elective TIPS for ascites is weighed against both; a preemptive or rescue TIPS for a bleed goes ahead more readily. An old episode of encephalopathy, age and frailty are weighed with the rest and decide alone only when the guideline says so.',
      ask: ['Which two organs does an elective TIPS for ascites ask the most of?', 'The liver, which loses portal perfusion, and the heart, which receives the shunted blood as added preload.'],
    },
  ],
};
