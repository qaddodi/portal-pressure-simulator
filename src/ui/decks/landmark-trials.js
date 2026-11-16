// Presenter talk: the landmark trials of portal hypertension, in the order a patient meets the decisions they settled (rebuilt 16 Nov 2026 on
// Mohammad's picks, /mnt/project-files/recs/landmark-deck-review.md, LT-1 to LT-17). Three stages, each with a new patient: compensated cirrhosis
// with CSPH (PREDESCI, and Groszmann 2005 below the line), the first variceal bleed (restrictive transfusion, then early TIPS: García-Pagán 2010,
// Lv 2019 and the HVPG trial, Monescillo 2004), and recurrent ascites (covered TIPS, then rifaximin before that stent, on the same patient).
// Each trial opens on who it enrolled, tested against the patient's own readings where the model has them (a criteria card, a course chart or the
// HVPG tracing), then the treatment runs on the model beside its control (the compare buttons) with the trial's card in the instrument slot.
// The trial's numbers are on its card (tool: { kind: 'trial' }, src/ui/trials.js), never typed in a line; the line says what the model shows and
// what the trial found, in the words of the approved lesson. The card judges its entry rules on the patient as enrolled (tool.at, or the slide
// the change counts from), never after the treatment (LT-2). After the last trial, the trials that reported a ratio on one scale, then what each
// treatment moved on the model.
//
// Trials, with the paper each statement rests on (abstracts audited 14 and 16 Nov 2026: guidelines/trials.md):
// - PREDESCI: Villanueva C, et al. Lancet 2019. Baveno VIII 3.15. Drug by the acute HVPG response to IV propranolol (the record's note).
// - Timolol to prevent varices: Groszmann RJ, et al. N Engl J Med 2005. Baveno VIII 3.16.
// - Restrictive transfusion: Villanueva C, et al. N Engl J Med 2013. Baveno VIII 5.4. The HVPG rose in the first 5 days only in the liberal arm
//   (audit line 202, from the abstract).
// - Early TIPS: García-Pagán JC, et al. N Engl J Med 2010; Lv Y, et al. Lancet Gastroenterol Hepatol 2019. Baveno VIII 5.31.
// - HVPG-guided early TIPS: Monescillo A, et al. Hepatology 2004. Baveno VIII 5.31 (the HVPG ≥20 mmHg criterion).
// - Covered TIPS for recurrent ascites: Bureau C, et al. Gastroenterology 2017. Baveno VIII 6.3.
// - Rifaximin before TIPS: Bureau C, et al. Ann Intern Med 2021. Baveno VIII 6.16.
// What the model cannot replay: it has no placebo, no rifaximin, no timolol and no survival. It shows the mechanism (the pressure and flow each
// treatment moves); the trial shows the outcome. The first slide's notes and the summary say so once, so no slide has to.

const BLEED = { kind: 'hemorrhage', mL: 1300 };
const UNIT = { kind: 'infuse', fluid: 'prbc' };
const BAND = { kind: 'band' };
const TIPS8 = { tips: { on: true, d: 8 } };
const REFRACTORY = { diuretics: false };
const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
const CARV = { drugs: { propranolol: false, carvedilol: true } };
// (The recurrent-ascites patient, as her slides load her.)
const ASCITES_PT = { preset: 'cirr-decomp', params: REFRACTORY, days: 120, ramp: { albumin: [2.8, 2.5] } };
// (Her ascites after an LVP, day by day: nothing done for a week, then the LVP cycle against a covered TIPS from that day.)
const LVP_COURSE = {
  kind: 'course', reading: 'asc',
  from: { ...ASCITES_PT },
  event: { action: { kind: 'paracentesis', mL: 5000 } },
  wait: 7, after: 21,
  then: [{ name: 'No stent', params: {} }, { name: 'Covered TIPS', params: TIPS8 }],
  words: { event: 'LVP', before: 'Tense ascites', start: 'Stent or not', rise: 'Refills', axis: 'Weeks after LVP', label: 'Ascites, liters', title: 'Ascites after LVP', short: 'After LVP' },
};

export const LANDMARK_TRIALS = {
  id: 'landmark-trials', level: 'advanced', title: 'Landmark trials, replayed on the model', minutes: 14,
  sections: [
    ['Compensated, with CSPH', ['Compensated, with CSPH']],
    ['The first variceal bleed', ['Variceal bleeding']],
    ['Recurrent ascites', ['Recurrent ascites']],
    ['After the stent', ['After the stent']],
  ],
  objectives: [
    'For each trial, name the decision it settled and the patient it applies to',
    'Test a patient against a trial\'s entry rules from the readings (HVPG, varices, ascites), and say which rules the model cannot check',
    'Explain why a fall in HVPG or PPG is a mechanism and not a trial\'s result, and when Baveno VIII accepts it as a surrogate',
    'Name the Baveno VIII statement each trial supports',
  ],
  summary: 'The trials behind beta-blockers in CSPH, restrictive transfusion, early TIPS, TIPS for recurrent ascites and rifaximin before a TIPS, in the order a patient meets them. For each, who was enrolled, the treatment on the model, and what the trial found.',
  checks: [
    ['Which trial supports a beta-blocker in compensated cirrhosis with CSPH, and what did it prevent?', 'PREDESCI (Lancet 2019): fewer patients on a beta-blocker decompensated or died than on placebo, mostly because fewer developed ascites. Baveno VIII 3.15.'],
    ['Why did a beta-blocker help in PREDESCI but not in the 2005 timolol trial?', 'PREDESCI enrolled patients with CSPH (HVPG ≥10 mmHg); the timolol trial enrolled patients from an HVPG of 6 mmHg, before varices. Below CSPH there was nothing to prevent and more adverse events (Baveno VIII 3.16).'],
    ['After a variceal bleed, three more units take a man\'s portal vein pressure from 17 to 20 mmHg with no change in his liver. Which lever moved, and what did the trial find?', 'Intravascular volume. In the transfusion trial the HVPG rose in the first 5 days only in the liberal arm, and survival was better with a restrictive threshold of 7 g/dL.'],
    ['Name the three ways a patient qualifies for a preemptive TIPS.', 'Child–Pugh C 10–13, Child–Pugh B >7 with active bleeding at endoscopy, or an HVPG ≥20 mmHg at the bleed (Baveno VIII 5.31).'],
  ],
  slides: [
    // ---- Compensated cirrhosis with CSPH
    {
      id: 'predesci', preset: 'csph', cam: 'fit',
      tool: { kind: 'criteria', title: 'Who PREDESCI enrolled', short: 'PREDESCI entry', lead: 'Every one of these.', rows: [
        ['**HVPG** ≥10 mmHg', 'hvpg', '>=', 10],
        ['No high-risk **varices**', 'varix', '<', 5],
        ['No **ascites**', 'asc', '<', 0.15],
        { text: 'Never **decompensated**', note: 'case history', met: true },
      ] },
      vignette: 'A 50-year-old man has compensated cirrhosis with small esophageal varices. He has never had ascites, variceal bleeding or hepatic encephalopathy.',
      kicker: 'Compensated, with CSPH', site: 'sin', title: 'CSPH and small varices: the patient PREDESCI enrolled',
      line: 'His HVPG is {hvpg} and his varices are small. PREDESCI randomized patients like him to a beta-blocker or placebo and counted who decompensated or died.',
      notes: 'PREDESCI (Villanueva, Lancet 2019) randomized 201 patients with compensated cirrhosis and CSPH (HVPG ≥10 mmHg), without high-risk varices, to a nonselective beta-blocker or placebo. The card ticks each entry rule the model can read from this man: his HVPG, his varix size and the absence of ascites; that he has never decompensated is his history, which the model cannot know. Throughout this talk the model shows the mechanism, the pressure and flow each treatment changes. A trial shows the outcome: who decompensates, bleeds, develops HE or dies. Each trial\'s own numbers are on its card.',
      ask: ['Which patients did PREDESCI enroll?', 'Compensated cirrhosis with CSPH (HVPG ≥10 mmHg) and no high-risk varices.'],
    },
    {
      id: 'predesci-test', params: { drugs: { propranolol: true } }, cath: 'result', cam: 'liver', tool: { kind: 'hvpg', catheter: true }, data: 'tiles', tiles: ['map'], key: ['hvpgFall'], delta: 'predesci', hvpgResp: 'predesci', response: true,
      kicker: 'Compensated, with CSPH', site: 'sin', title: 'In PREDESCI, the HVPG chose the beta-blocker',
      line: 'Propranolol lowers his HVPG from {hvpg@predesci} to {hvpg}. A fall of ≥10% on IV propranolol meant propranolol in the trial; a smaller fall meant carvedilol.',
      notes: 'In PREDESCI the HVPG was measured at baseline, then again after IV propranolol. Patients whose HVPG fell by ≥10% were given propranolol; the rest were given carvedilol, which also lowers intrahepatic resistance. So PREDESCI was not a carvedilol-only trial. Baveno VIII (HVPG response table) accepts an acute fall of 10% on IV propranolol as identifying a responder. The model\'s propranolol is its steady effect, not the acute IV dose. The three buttons set how strongly this patient responds: as a non-responder his HVPG falls <10%, and he would have been given carvedilol.',
      ask: ['How did PREDESCI choose between propranolol and carvedilol?', 'By the acute HVPG response to IV propranolol: a fall of ≥10% meant propranolol, a smaller fall carvedilol.'],
    },
    {
      id: 'predesci-arms', params: CARV, cam: 'fit', lens: 'since', since: 'predesci', sinceLabel: 'placebo', ripple: true,
      tool: { kind: 'trial', id: 'predesci', at: 'predesci', facts: { decompensated: false } }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: 'predesci',
      compare: [{ label: 'Placebo', slide: 'predesci' }, { label: 'Beta-blocker', own: true }],
      kicker: 'Compensated, with CSPH', site: 'sin', title: 'In CSPH, a beta-blocker prevented decompensation, mostly ascites', cite: 'Baveno VIII 3.15',
      line: 'Carvedilol lowers his HVPG from {hvpg@predesci} to {hvpg}. In PREDESCI, fewer patients on a beta-blocker decompensated, and most of the difference was ascites.',
      notes: 'Colored by the change since placebo, the portal tree cools as carvedilol lowers splanchnic inflow and intrahepatic resistance. The model has no placebo and no decompensation, so the result is the trial\'s: decompensation or death in 16% on a beta-blocker against 27% on placebo (hazard ratio 0.51), and for ascites alone a hazard ratio of 0.44. Baveno VIII 3.15: NSBBs, particularly carvedilol, are recommended in compensated cirrhosis with CSPH to prevent decompensation and improve survival.',
      ask: ['What did PREDESCI find, and which decompensation did the beta-blocker mostly prevent?', 'Fewer patients decompensated or died on a beta-blocker than on placebo; most of the difference was ascites.'],
    },
    {
      id: 'groszmann', preset: 'cirr-comp', cam: 'fit', tool: { kind: 'trial', id: 'groszmann' }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      vignette: 'A 54-year-old woman has compensated cirrhosis from hepatitis C. Screening endoscopy showed no varices.',
      kicker: 'Compensated, with CSPH', site: 'sin', title: 'With an HVPG <10 mmHg, a beta-blocker prevented neither varices nor bleeding', cite: 'Baveno VIII 3.16',
      line: 'In another patient, the HVPG is {hvpg}: portal hypertension, but {<10 mmHg}. In this range timolol did not prevent varices or bleeding, and serious adverse events were more common.',
      notes: 'The timolol trial (Groszmann, N Engl J Med 2005) randomized 213 patients with cirrhosis, an HVPG ≥6 mmHg and no varices to timolol or placebo. Varices or variceal bleeding developed as often on either, and serious adverse events were more common on timolol. Varices formed less often when the baseline HVPG was <10 mmHg. Read beside PREDESCI, it is why the line is CSPH: below it there is little for a beta-blocker to prevent. The model lowers the HVPG by about the same share at any HVPG, so it does not show the drug working less here; what differs is how far she is from the pressure at which varices and ascites form. Baveno VIII 3.16: without CSPH, NSBBs should not be used to prevent decompensation or death.',
      ask: ['What did the 2005 timolol trial find in patients without varices?', 'No fewer varices or variceal bleeds than placebo, and more serious adverse events; it is the basis of not treating below CSPH.'],
    },
    // ---- The first variceal bleed
    {
      id: 'bleed', preset: 'cirr-decomp', action: [BLEED, UNIT], cam: 'fit', tool: { kind: 'vitals', show: ['hr', 'map'] }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      vignette: 'A 61-year-old man with alcohol-associated cirrhosis, Child–Pugh C 11, presented with hematemesis this morning. A bleeding varix was banded and octreotide is infusing.',
      kicker: 'Variceal bleeding', site: 'sin', title: 'After a variceal bleed, how much blood to give is a trial question',
      line: 'One unit of packed red cells brings his blood pressure to {map}. His portal vein pressure is {pv}. The transfusion trial asked when to give the next unit.',
      notes: 'The transfusion trial (Villanueva, N Engl J Med 2013) randomized 921 adults with severe acute upper GI bleeding of any cause, with or without cirrhosis. One arm was transfused when the hemoglobin fell below 7 g/dL (restrictive), the other below 9 g/dL (liberal). The model\'s hemoglobin does not fall at the moment of the bleed; it falls over hours as plasma refills the circulation (the variceal bleeding talk shows it), so this slide shows his blood pressure and heart rate instead.',
      ask: ['Which two transfusion thresholds did the trial compare?', 'A hemoglobin <7 g/dL (restrictive) and <9 g/dL (liberal).'],
    },
    {
      id: 'transfusion-arms', action: [UNIT, UNIT], cam: 'fit', lens: 'since', since: 'bleed', sinceLabel: 'one unit', ripple: true,
      tool: { kind: 'trial', id: 'transfusion', at: 'bleed' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], delta: 'bleed',
      compare: [{ label: 'One unit', slide: 'bleed' }, { label: 'Three units', own: true }],
      kicker: 'Variceal bleeding', site: 'sin', title: 'A liberal transfusion raised the portal pressure, and survival was lower', cite: 'Baveno VIII 5.4',
      line: 'Two more units raise his portal vein pressure from {pv@bleed} to {pv}. In the trial, the HVPG rose in the first 5 days only in the liberal arm.',
      notes: 'Each unit expands the intravascular volume while intrahepatic resistance stays the same, so the portal pressure rises; colored by the change since one unit, the whole portal tree warms. The trial measured the same thing: the HVPG rose during the first 5 days in the liberal arm and not in the restrictive arm. Survival at 6 weeks was higher with the restrictive strategy (95% against 91%), and further bleeding was less common. In cirrhosis the benefit was in Child–Pugh A and B; in Child–Pugh C there was no difference (hazard ratio 1.04). Baveno VIII 5.4: transfuse restrictively, to a hemoglobin of 7 to 8 g/dL, individualized to the patient.',
      ask: ['Why does a liberal transfusion raise the portal pressure?', 'It expands the intravascular volume while intrahepatic resistance is unchanged; the trial saw the HVPG rise in the liberal arm.'],
    },
    {
      // (Back in him with one unit given, the restrictive way, then banded and a day on: three units were the slide before's other arm.)
      id: 'who-tips', preset: 'cirr-decomp', action: [BLEED, UNIT, BAND], days: 1, cam: 'fit',
      tool: { kind: 'criteria', title: 'Preemptive TIPS', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31', rows: [
        { text: 'Child–Pugh C', cut: 'C 10–13', note: 'C 11', met: true, lit: true },
        { text: 'Child–Pugh B, active bleeding at endoscopy', cut: 'B 8–9', note: 'not B' },
        ['**HVPG** at the bleed ≥20 mmHg', 'hvpg', '>=', 20],
      ], verdict: 'He qualifies on the first rule: a covered TIPS within 72 hours.' }, data: 'tiles', tiles: ['ppg'], key: ['ppg'],
      kicker: 'Variceal bleeding', site: 'sin', title: 'Three ways into an early TIPS, and one of them is a pressure',
      line: 'Child–Pugh C qualifies him for an early TIPS. His HVPG of {hvpg} would not: that criterion needs {>=20 mmHg} at the bleed.',
      notes: 'Baveno VIII 5.31: a preemptive covered TIPS within 72 hours, ideally within 24, for Child–Pugh C 10–13, Child–Pugh B >7 with active bleeding at endoscopy, or an HVPG ≥20 mmHg at the time of the bleed. The first two come from the 2010 early TIPS trial, the third from an earlier trial in which the HVPG alone selected the patients. The model reads only the HVPG; Child–Pugh is his history.',
      ask: ['Name the three criteria for a preemptive TIPS.', 'Child–Pugh C 10–13; Child–Pugh B >7 with active bleeding at endoscopy; an HVPG ≥20 mmHg at the bleed.'],
    },
    {
      id: 'earlytips', params: TIPS8, cam: 'liver', mark: STENT, lens: 'since', since: 'who-tips', sinceLabel: 'no stent', ripple: true,
      tool: { kind: 'trial', id: 'earlytips', at: 'who-tips' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'who-tips',
      compare: [{ label: 'Drugs and EVL', short: 'Standard', slide: 'who-tips' }, { label: 'Early TIPS', own: true }],
      kicker: 'Variceal bleeding', site: 'sin', title: 'After a high-risk bleed, an early TIPS improved one-year survival', cite: 'Baveno VIII 5.31',
      line: 'The stent drops his PPG from {ppg@who-tips} to {ppg}, {<12 mmHg}, the target after a TIPS. Sinusoidal flow falls from {liver@who-tips} to {liver}.',
      notes: 'The early TIPS trial (García-Pagán, N Engl J Med 2010) randomized 63 high-risk patients, Child–Pugh C or B with active bleeding, within 24 hours of admission, after vasoactive drugs and endoscopic therapy: a covered TIPS within 72 hours, or continued drugs with EVL. Rebleeding or failure to control bleeding fell from 14 of 31 to 1 of 32, and 1-year survival was 86% against 61%. In the model the stent takes the portal pressure under the target that stops varices bleeding (AASLD 2024 gives <12 mmHg after a TIPS) at the cost of portal perfusion of the sinusoids, the reason it is kept for high-risk patients.',
      ask: ['What did the 2010 early TIPS trial find?', 'In high-risk patients after a controlled variceal bleed, an early covered TIPS improved 1-year survival over drugs and EVL.'],
    },
    {
      id: 'lvtips', cam: 'liver', mark: STENT, tool: { kind: 'trial', id: 'lvtips', at: 'who-tips' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'who-tips',
      kicker: 'Variceal bleeding', site: 'sin', title: 'A larger trial in Child–Pugh B and C found the same', cite: 'Baveno VIII 5.31',
      line: 'This trial took a wider group than today\'s criteria, any Child–Pugh B or C. Transplant-free survival was again better with an early covered TIPS.',
      notes: 'The second early TIPS trial (Lv, Lancet Gastroenterol Hepatol 2019) randomized 132 patients with Child–Pugh B or C cirrhosis and acute variceal bleeding, two to an early covered TIPS for each to standard care, after vasoactive drugs and endoscopic therapy. Transplant-free survival was better with the stent (hazard ratio 0.50). Not every Child–Pugh B patient in it would meet the Baveno VIII 5.31 criteria. The figure is the same stent: the model\'s mechanism does not change with the trial.',
      ask: ['What did the 2019 early TIPS trial add to the 2010 one?', 'It enrolled any Child–Pugh B or C patient and again found better transplant-free survival with an early covered TIPS.'],
    },
    {
      id: 'monescillo', cam: 'liver', mark: STENT, tool: { kind: 'trial', id: 'monescillo', at: 'who-tips' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'who-tips',
      kicker: 'Variceal bleeding', site: 'sin', title: 'Where the HVPG criterion came from', cite: 'Baveno VIII 5.31',
      line: 'In this earlier trial the HVPG alone picked who was randomized: {>=20 mmHg} within 24 hours of admission. An early TIPS lowered treatment failure.',
      notes: 'Monescillo (Hepatology 2004) measured the HVPG within 24 hours of admission in 116 patients with acute variceal bleeding treated with sclerotherapy. The 52 with an HVPG ≥20 mmHg were randomized, 26 to a TIPS within 24 hours. Treatment failure was 50% without an early TIPS and 12% with it. The stents were uncovered and the control was sclerotherapy, so the trial is the origin of the HVPG criterion in Baveno VIII 5.31 rather than a model of today\'s care. This man\'s HVPG, read before his stent, was under the line.',
      ask: ['Which trial gave Baveno VIII its HVPG criterion for an early TIPS?', 'Monescillo 2004: an HVPG ≥20 mmHg within 24 hours of admission selected the patients, and an early TIPS lowered treatment failure.'],
    },
    // ---- Recurrent ascites, and after the stent
    {
      id: 'covered', ...ASCITES_PT, cam: 'fit', tool: LVP_COURSE, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 60-year-old woman has cirrhosis with ascites that needs large-volume paracentesis (LVP) every two weeks despite diuretics. She has no hepatic encephalopathy.',
      kicker: 'Recurrent ascites', site: 'sin', title: 'Ascites that refills within a week of every LVP',
      line: 'Her ascites is back within a week of each LVP. The covered TIPS trial enrolled patients who needed ≥2 LVPs over ≥3 weeks.',
      notes: 'The chart is the model\'s: her ascites after an LVP, a week with nothing done, then the LVP cycle against a covered TIPS from that day. Paracentesis drains the ascites and leaves the portal hypertension that makes it. The covered TIPS trial (Bureau, Gastroenterology 2017) randomized 62 patients with recurrent ascites in France, 29 to a covered TIPS and 33 to repeated LVP with albumin, and followed them for a year. Its outcome was transplant-free survival.',
      ask: ['Which patients did the covered TIPS trial enroll?', 'Cirrhosis with recurrent ascites: ≥2 large-volume paracenteses over ≥3 weeks.'],
    },
    {
      id: 'covered-arms', ...ASCITES_PT, params: { ...REFRACTORY, ...TIPS8 }, cam: 'fit', mark: STENT, lens: 'since', since: 'covered', sinceLabel: 'no stent', ripple: true,
      tool: { kind: 'trial', id: 'covered', at: 'covered' }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'], delta: 'covered',
      compare: [{ label: 'No stent', slide: 'covered' }, { label: 'Covered TIPS', short: 'TIPS', own: true }],
      kicker: 'Recurrent ascites', site: 'sin', title: 'In recurrent ascites, a covered TIPS improved transplant-free survival', cite: 'Baveno VIII 6.3',
      line: 'The stent lowers her PPG from {ppg@covered} to {ppg}, and the ascites stops reforming: {asc} now.',
      notes: 'With the portal pressure down, the sinusoids stop filtering more than the lymphatics carry, and the ascites does not come back. The model does not simulate survival, so the result is the trial\'s: 1-year transplant-free survival 93% after a covered TIPS against 52% with repeated LVP and albumin. A small, selected group with recurrent ascites, not all refractory ascites. Baveno VIII 6.3: patients with recurrent or refractory ascites should be considered for TIPS.',
      ask: ['Why does ascites reaccumulate after paracentesis but not after a TIPS?', 'Paracentesis drains it and leaves the portal hypertension that caused it; a TIPS lowers the portal pressure.'],
    },
    {
      id: 'rifaximin', lens: 'flow', cam: 'liver', mark: STENT, tool: { kind: 'trial', id: 'rifaximin', at: 'covered' }, data: 'tiles', tiles: ['shunt', 'he'], key: ['he'], delta: 'covered',
      compare: [{ label: 'Before the TIPS', short: 'Before', slide: 'covered' }, { label: 'After the TIPS', short: 'After', own: true }],
      kicker: 'After the stent', site: 'sin', title: 'The stent sends portal blood past the liver; rifaximin beforehand cut overt HE', cite: 'Baveno VIII 6.16',
      line: 'Now {shunt} of her portal flow bypasses the sinusoids, and her HE risk rises to {he}. In the trial, rifaximin started 14 days before the TIPS lowered overt HE.',
      notes: 'Colored by flow, the stent carries most of the portal blood straight to the hepatic vein, so ammonia and other gut-derived toxins that the liver would clear reach the brain. The model has no rifaximin, so the result is the trial\'s (Bureau, Ann Intern Med 2021): rifaximin 600 mg twice daily from 14 days before the TIPS to 168 days after it, against placebo; overt HE within 168 days in 34% against 53%. Baveno VIII 6.16: rifaximin should be considered to prevent HE in candidates for an elective TIPS.',
      ask: ['Why does a TIPS raise the risk of hepatic encephalopathy, and what is given first?', 'It diverts portal blood around the liver, so gut-derived toxins reach the brain; rifaximin, started 14 days before an elective TIPS.'],
    },
    // ---- Summary
    {
      id: 'forest', cam: 'fit', tool: { kind: 'forest', ids: ['predesci', 'lvtips', 'transfusion', 'rifaximin'] },
      kicker: 'Summary', title: 'Hazard and odds ratios from the trials',
      line: 'Each row is one trial\'s ratio and 95% CI; <1 favors the treatment. The 2010 early TIPS and covered TIPS trials gave none, so they are not here.', pill: false,
      notes: 'Each row is one trial that reported a ratio: the mark is the ratio, the line its confidence interval, and the upright line a ratio of 1, no difference between the arms. The rows are hazard ratios and an odds ratio, each as its abstract reported it. They measure different things, so the chart never pools them into one number. Two of the largest differences in this talk are missing because their trials reported none: the 2010 early TIPS trial (1-year survival 86% against 61%) and the covered TIPS trial (93% against 52%). The timolol and HVPG-guided trials reported no ratio either.',
      ask: ['How do you read a ratio on this chart?', 'A ratio <1 favors the treatment and >1 the control; an interval that crosses 1 shows no clear difference.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'pv', 'liver', 'he'], asc: false, vs: 'first', rowHead: 'Arm',
      of: [
        { id: 'predesci', kicker: 'PREDESCI', title: 'Placebo', ref: true }, { id: 'predesci-arms', kicker: 'PREDESCI', title: 'Carvedilol', vs: 'predesci' },
        { id: 'bleed', kicker: 'Transfusion', title: 'One unit', ref: true }, { id: 'transfusion-arms', kicker: 'Transfusion', title: 'Three units', vs: 'bleed' },
        { id: 'who-tips', kicker: 'Early TIPS', title: 'Drugs and EVL', ref: true }, { id: 'earlytips', kicker: 'Early TIPS', title: 'Covered TIPS', vs: 'who-tips' },
        { id: 'covered', kicker: 'Ascites', title: 'No stent', ref: true }, { id: 'covered-arms', kicker: 'Ascites', title: 'Covered TIPS', vs: 'covered' },
      ],
      kicker: 'Summary', title: 'What each treatment moved, and what each trial counted',
      line: 'The model shows the pressure and flow each treatment changes. Only the trials show who decompensated, bled, developed HE or died.',
      notes: 'Each pair is a control and its treatment on the model. Carvedilol lowers the HVPG; three units of red cells raise the portal vein pressure; a covered TIPS lowers the portal pressure and the sinusoidal flow and raises the risk of HE. A fall in pressure is a mechanism, not a trial result. Baveno VIII accepts an HVPG response to an NSBB, a fall of ≥10% or to ≤12 mmHg, as a surrogate in primary prophylaxis; every other outcome here is a count of patients over weeks to years, and those numbers are on the trial cards.',
      ask: ['What can the model show about a trial, and what can it not?', 'It shows the mechanism, such as the fall in pressure; it cannot show how many patients decompensate, bleed or die.'],
    },
  ],
};
