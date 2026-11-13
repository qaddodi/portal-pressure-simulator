// Presenter talk: six landmark trials replayed. For each, a slide with the patient the trial enrolled, then the treatment arm run on the
// model beside the control (the compare button goes back to the patient slide). The trial's own numbers are on the trial card
// (tool: { kind: 'trial' }, src/ui/trials.js), never typed in a line.
//
// Trials, with the paper each statement rests on (the abstracts were read on 11 Nov 2026; guidelines/trials.md says where each number came from):
// - PREDESCI: Villanueva C, et al. Lancet 2019 (AASLD 2024 reference list). Baveno VIII 3.15 (NSBBs, particularly carvedilol, in CSPH).
// - Early TIPS: García-Pagán JC, et al. N Engl J Med 2010 (AASLD 2024 reference 181); Lv Y, et al. Lancet Gastroenterol Hepatol 2019
//   (AASLD 2024 reference list). Baveno VIII 5.31 (pTIPS criteria).
// - Restrictive transfusion: Villanueva C, et al. N Engl J Med 2013 (AASLD 2024 reference 166). Baveno VIII 5.4 (target Hb 7-8 g/dL).
// - Rifaximin before TIPS: Bureau C, et al. Ann Intern Med 2021 (AASLD 2024 reference list). Baveno VIII 6.16.
// - Covered TIPS for recurrent ascites: Bureau C, et al. Gastroenterology 2017 (AASLD 2024 reference list). Baveno VIII 6.3.
// What the model cannot replay: it has no placebo, no rifaximin, no tap-and-refill cycle and no survival. Where a trial's control arm is a
// treatment the model has, the compare button shows the model's own control (the patient as enrolled); where it has none (rifaximin),
// the arms slide shows what the stent does and the notes say rifaximin is only on the card. The model's beta-blocker is carvedilol; PREDESCI
// gave propranolol or carvedilol according to the acute response to propranolol.

const BLEED = { kind: 'hemorrhage', mL: 1300 };
const UNIT = { kind: 'infuse', fluid: 'prbc' };
const TIPS8 = { tips: { on: true, d: 8 } };
const REFRACTORY = { diuretics: false };

export const LANDMARK_TRIALS = {
  id: 'landmark-trials', level: 'advanced', title: 'Landmark trials, replayed on the model', minutes: 14,
  sections: [['Preventing decompensation', ['Preventing decompensation']], ['Acute bleeding', ['Acute bleeding']], ['After a TIPS', ['After a TIPS']], ['Ascites', ['Ascites']]],
  objectives: [
    'Describe the patient each of six landmark trials enrolled',
    'State what the model shows for each trial\'s treatment, and what only the trial can show',
    'Name the trial behind carvedilol in CSPH, early TIPS, restrictive transfusion, rifaximin before TIPS and covered TIPS for ascites',
    'State each trial\'s main result and the size of the trial',
  ],
  summary: 'PREDESCI, two early TIPS trials, restrictive transfusion, rifaximin before TIPS and covered TIPS for recurrent ascites. For each, the patient who was enrolled, the treatment on the model, and the trial\'s result.',
  checks: [
    ['Which trial supports a beta-blocker for compensated patients with CSPH, and what did it find?', 'PREDESCI (Lancet 2019): 201 patients with compensated cirrhosis, CSPH and no high-risk varices were given propranolol or carvedilol, or placebo. Decompensation or death occurred in 16% on the beta-blocker and 27% on placebo.'],
    ['What did the 2010 early TIPS trial find at one year?', 'Survival was 86% after an early covered TIPS against 61% on drugs and endoscopic variceal ligation (EVL), in high-risk patients after a controlled variceal bleed (García-Pagán, N Engl J Med 2010).'],
    ['Before an elective TIPS, which drug lowered overt hepatic encephalopathy (HE), and by how much?', 'Rifaximin, started 14 days before the TIPS: overt HE within 168 days occurred in 34% on rifaximin and 53% on placebo (Bureau, Ann Intern Med 2021).'],
    ['After a bleed, a man\'s portal vein pressure is 24 mmHg after one unit of packed red cells and 25 mmHg after three, with no change in his liver disease. Which lever moved?', 'Intravascular volume. Transfusion raised the portal pressure while intrahepatic resistance stayed the same, which is one reason a restrictive transfusion strategy is preferred.'],
  ],
  slides: [
    {
      id: 'predesci', preset: 'csph', cam: 'fit', data: 'tiles', tiles: ['hvpg', 'varix'], key: ['hvpg'],
      vignette: 'A 50-year-old man has compensated cirrhosis with CSPH and no high-risk varices. He has never had ascites, variceal bleeding or hepatic encephalopathy.',
      kicker: 'Preventing decompensation', site: 'sin', title: 'PREDESCI enrolled compensated patients with CSPH and no high-risk varices',
      line: 'PREDESCI enrolled patients like him: compensated cirrhosis, an HVPG of {hvpg} and no high-risk varices. Half were given a nonselective beta-blocker (NSBB) and half placebo.',
      notes: 'PREDESCI (Villanueva, Lancet 2019) randomized 201 patients with compensated cirrhosis and CSPH, without high-risk varices, to a nonselective beta-blocker or placebo (AASLD 2024). The beta-blocker was propranolol or carvedilol, chosen by the acute hemodynamic response to propranolol. This man is typical of the patients who were enrolled. The trial\'s own numbers are on the trial card on the next slide.',
      ask: ['Which patients did PREDESCI enroll?', 'Patients with compensated cirrhosis and CSPH who had no high-risk varices.'],
    },
    {
      id: 'predesci-arms', params: { drugs: { carvedilol: true } }, cam: 'fit', tool: { kind: 'trial', id: 'predesci' }, data: 'tiles', tiles: ['hvpg', 'map'], key: ['hvpg'], delta: 'predesci',
      compare: [{ label: 'Placebo', slide: 'predesci' }, { label: 'Beta-blocker', own: true }],
      kicker: 'Preventing decompensation', site: 'sin', title: 'The model shows what the beta-blocker does; the trial shows what it prevents', cite: 'Baveno VIII 3.15',
      line: 'On carvedilol, the model lowers his HVPG from {hvpg@predesci} to {hvpg}. The card gives the trial\'s result.',
      notes: 'In the model carvedilol lowers the portal pressure and slightly lowers the arterial pressure, so the HVPG falls. The model has no placebo and no decompensation, so it cannot reproduce the trial\'s result: decompensation or death in 16% of the patients on a beta-blocker against 27% on placebo (hazard ratio 0.51), over a median follow-up of about three years. The model\'s drug is carvedilol; PREDESCI gave propranolol or carvedilol. Baveno VIII 3.15: NSBBs, particularly carvedilol, are recommended in compensated cirrhosis with CSPH to prevent decompensation and improve survival.',
      ask: ['What does the model show for carvedilol in CSPH, and what does the trial add?', 'The model shows the HVPG falling. The trial shows that the fall goes with fewer patients decompensating or dying.'],
    },
    {
      id: 'earlytips', preset: 'cirr-decomp', cam: 'fit', data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      vignette: 'A 58-year-old man with alcohol-associated cirrhosis, Child-Pugh class C, had an esophageal variceal bleed yesterday, controlled with octreotide and EVL.',
      kicker: 'Acute bleeding', site: 'sin', title: 'The first early TIPS trial enrolled high-risk patients after a controlled bleed',
      line: 'The trial enrolled patients like him: Child-Pugh C, or B with active bleeding. Drugs and EVL came first, then half were given a covered TIPS within 72 hours.',
      notes: 'The early TIPS trial (García-Pagán, N Engl J Med 2010) enrolled patients with cirrhosis and acute variceal bleeding who were at high risk of treatment failure: Child-Pugh class C, or class B with active bleeding at endoscopy. All had vasoactive drugs and endoscopic therapy first. Half were then randomized to a covered TIPS within 72 hours, and half to propranolol or nadolol with EVL. Baveno VIII 5.31 now recommends a preemptive covered TIPS within 72 hours, ideally within 24 hours, for patients who meet these criteria.',
      ask: ['Which patients did the 2010 early TIPS trial enroll?', 'Patients with a variceal bleed that drugs and EVL had controlled, at high risk of treatment failure: Child-Pugh class C, or class B with active bleeding.'],
    },
    {
      id: 'earlytips-arms', preset: 'cirr-decomp', params: TIPS8, cam: 'liver', tool: { kind: 'trial', id: 'earlytips' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'earlytips',
      compare: [{ label: 'Drugs and EVL', short: 'Standard', slide: 'earlytips' }, { label: 'Early TIPS', own: true }],
      kicker: 'Acute bleeding', site: 'sin', title: 'In the model an early TIPS lowers the PPG at the cost of sinusoidal flow', cite: 'Baveno VIII 5.31',
      line: 'A covered stent lowers his PPG from {ppg@earlytips} to {ppg} and reduces sinusoidal flow from {liver@earlytips} to {liver}. The card gives the trial\'s result.',
      notes: 'In the model the stent creates a channel from the portal vein to the hepatic vein, so the portal pressure falls and less portal flow perfuses the liver. That is the cost of the stent, and the reason it is reserved for high-risk patients. The model does not simulate survival, so it cannot replay the trial: the card gives the 1-year survival of 86% after an early TIPS against 61% on drugs and EVL, in 63 patients.',
      ask: ['What does an early TIPS do to the portal pressure and sinusoidal flow in the model?', 'It lowers the PPG and reduces sinusoidal flow, because the stent diverts most portal flow around the liver.'],
    },
    {
      id: 'lvtips', preset: 'csph', params: {}, days: 60, ramp: { cirrhosis: [0.6, 0.75], albumin: [4, 3.2] }, cam: 'fit', data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      vignette: 'A 49-year-old man has cirrhosis, Child-Pugh class B, and had an esophageal variceal bleed two days ago, controlled with vasoactive drugs and EVL.',
      kicker: 'Acute bleeding', site: 'sin', title: 'A second early TIPS trial enrolled Child-Pugh B and C patients',
      line: 'This trial enrolled patients like him after a controlled bleed, in Child-Pugh class B or C, and randomized them to an early covered TIPS or standard care.',
      notes: 'The second early TIPS trial (Lv, Lancet Gastroenterol Hepatol 2019) enrolled adults with cirrhosis in Child-Pugh class B or C and acute variceal bleeding, after vasoactive drugs and endoscopic therapy. Twice as many were randomized to an early covered TIPS as to standard care. This man is typical of those enrolled: advancing cirrhosis and a falling albumin.',
      ask: ['What did the second early TIPS trial add to the first?', 'It enrolled patients in Child-Pugh class B as well as C, and again compared an early covered TIPS with standard care.'],
    },
    {
      id: 'lvtips-arms', params: TIPS8, cam: 'liver', tool: { kind: 'trial', id: 'lvtips' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'lvtips',
      compare: [{ label: 'Standard care', short: 'Standard', slide: 'lvtips' }, { label: 'Early TIPS', own: true }],
      kicker: 'Acute bleeding', site: 'sin', title: 'The model again lowers the PPG; the trial measured transplant-free survival', cite: 'Baveno VIII 5.31',
      line: 'Early TIPS lowers his PPG from {ppg@lvtips} to {ppg}, as in the first trial. The card gives the result as transplant-free survival.',
      notes: 'The model shows the same effect as in the first trial: the stent lowers the PPG and reduces sinusoidal flow. The trial\'s outcome was transplant-free survival, which the model does not simulate. The card gives the numbers.',
      ask: ['What was the main outcome of the second early TIPS trial?', 'Transplant-free survival.'],
    },
    {
      id: 'transfusion', preset: 'cirr-decomp', action: BLEED, cam: 'fit', data: 'tiles', tiles: ['pv', 'map'], key: ['pv'],
      vignette: 'A 61-year-old man with cirrhosis presented with hematemesis this morning. At endoscopy a bleeding varix was banded, and octreotide is infusing. His hemoglobin is 7.5 g/dL.',
      kicker: 'Acute bleeding', site: 'sin', title: 'The transfusion trial enrolled adults with acute upper GI bleeding',
      line: 'The trial enrolled patients with acute upper gastrointestinal bleeding, with or without cirrhosis. Half were transfused at a hemoglobin {<7 g/dL}, half at {<9 g/dL}.',
      notes: 'The transfusion trial (Villanueva, N Engl J Med 2013) randomized 921 adults with acute upper gastrointestinal bleeding. One group was given red cells when the hemoglobin fell below 7 g/dL, with a target of 7 to 9 g/dL (restrictive); the other when it fell below 9 g/dL, with a target of 9 to 11 g/dL (liberal). The trial included patients with cirrhosis, which is why the guidelines apply it to variceal bleeding. In this case the bleeding has just been controlled and he has not yet been transfused.',
      ask: ['Which two transfusion thresholds did the trial compare?', 'Red cells at a hemoglobin <7 g/dL (restrictive) and at <9 g/dL (liberal).'],
    },
    {
      id: 'transfusion-res', preset: 'cirr-decomp', action: [BLEED, UNIT], cam: 'fit', data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: 'transfusion',
      compare: [{ label: 'No blood yet', short: 'None', slide: 'transfusion' }, { label: 'Restrictive: one unit', short: 'Restrictive', own: true }],
      kicker: 'Acute bleeding', site: 'sin', title: 'One unit of packed red cells raises the MAP and the portal pressure together',
      line: 'In the same man, one unit of packed red cells raises his blood pressure from {map@transfusion} to {map}. His portal vein pressure rises from {pv@transfusion} to {pv}.',
      notes: 'The restrictive arm transfuses only when the hemoglobin is low, and gives the minimum needed. One unit partly restores the MAP and raises the portal pressure, because it expands the intravascular volume. The model\'s hemoglobin does not fall with the bleed, so the trial\'s thresholds cannot be run on it; the units are only the volume of blood given.',
      ask: ['Why does transfusing red cells raise the portal pressure?', 'Transfusion expands the intravascular volume, so portal venous pressure rises while intrahepatic resistance is unchanged.'],
    },
    {
      id: 'transfusion-arms', preset: 'cirr-decomp', action: [BLEED, UNIT, UNIT, UNIT], cam: 'fit', tool: { kind: 'trial', id: 'transfusion' }, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'], delta: 'transfusion-res',
      compare: [{ label: 'Restrictive: one unit', short: 'Restrictive', slide: 'transfusion-res' }, { label: 'Liberal: three units', short: 'Liberal', own: true }],
      kicker: 'Acute bleeding', site: 'sin', title: 'A liberal transfusion raises the portal pressure further', cite: 'Baveno VIII 5.4',
      line: 'Three units bring his blood pressure to {map} and his portal vein pressure to {pv}, against {pv@transfusion-res} after one. The card gives the trial\'s survival.',
      notes: 'Three units give more volume than one, so the portal pressure is higher in the model, and a higher portal pressure in a patient with a bleeding varix can worsen bleeding. This is the rationale for a restrictive target. The trial found higher 6-week survival with the restrictive strategy (95% against 91%, in 921 patients with acute upper gastrointestinal bleeding). Baveno VIII 5.4 recommends a restrictive transfusion strategy with a target hemoglobin of 7 to 8 g/dL, individualized for heart disease, age, instability and ongoing bleeding.',
      ask: ['Why is a liberal transfusion strategy not used in variceal bleeding?', 'It raises the portal pressure and was linked to worse survival; the target is a hemoglobin of 7 to 8 g/dL (Baveno VIII 5.4).'],
    },
    {
      id: 'rifaximin', preset: 'cirr-decomp', params: REFRACTORY, days: 120, ramp: { albumin: [2.8, 2.5] }, cam: 'fit', data: 'tiles', tiles: ['asc', 'he'], key: ['he'],
      vignette: 'A 63-year-old man with alcohol-associated cirrhosis has recurrent ascites despite diuretics. He is scheduled for an elective TIPS and has never had overt hepatic encephalopathy.',
      kicker: 'After a TIPS', site: 'sin', title: 'The rifaximin trial enrolled patients scheduled for an elective TIPS',
      line: 'The trial enrolled patients like him, scheduled for a TIPS for ascites or to prevent rebleeding. Half started rifaximin 14 days before the TIPS, half placebo.',
      notes: 'The rifaximin trial (Bureau, Ann Intern Med 2021) randomized patients with cirrhosis who were to have a TIPS for intractable ascites or to prevent variceal rebleeding. Rifaximin 600 mg twice daily or placebo was started 14 days before the TIPS and continued for 168 days after it. The primary outcome was overt hepatic encephalopathy within 168 days.',
      ask: ['When was rifaximin started in the trial?', '14 days before the TIPS, and it was continued for 168 days after it.'],
    },
    {
      id: 'rifaximin-arms', params: TIPS8, cam: 'liver', tool: { kind: 'trial', id: 'rifaximin' }, data: 'tiles', tiles: ['shunt', 'he'], key: ['he'], delta: 'rifaximin',
      compare: [{ label: 'Before the TIPS', short: 'Before', slide: 'rifaximin' }, { label: 'After the TIPS', short: 'After', own: true }],
      kicker: 'After a TIPS', site: 'sin', title: 'The model shows the risk the stent adds; rifaximin is only on the card', cite: 'Baveno VIII 6.16',
      line: 'After the stent, {shunt} of his portal flow bypasses the liver and the model\'s encephalopathy risk rises from {he@rifaximin} to {he}. The model does not simulate rifaximin.',
      notes: 'The model cannot replay this trial: it has no rifaximin and no placebo. It shows what the trial was about, which is the stent. Once portal flow bypasses the liver, ammonia and other gut-derived toxins reach the systemic circulation and the brain, and the model\'s HE risk rises. The card gives the result: overt encephalopathy within 168 days in 34% of patients on rifaximin and 53% on placebo. Baveno VIII 6.16: rifaximin should be considered for prophylaxis of hepatic encephalopathy in patients who are candidates for an elective TIPS.',
      ask: ['Why does a TIPS raise the risk of hepatic encephalopathy?', 'It diverts portal flow around the liver, so gut-derived ammonia and other toxins that the liver would clear reach the brain.'],
    },
    {
      id: 'covered', preset: 'cirr-decomp', params: REFRACTORY, days: 120, ramp: { albumin: [2.8, 2.5] }, cam: 'fit', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 60-year-old woman has cirrhosis with ascites that requires large-volume paracentesis (LVP) every two weeks despite diuretics. She has no hepatic encephalopathy.',
      kicker: 'Ascites', site: 'sin', title: 'The covered TIPS trial enrolled patients who need repeated LVP',
      line: 'The trial enrolled patients like her, with recurrent ascites despite diuretics. Half were given a covered TIPS, half repeated LVP with albumin.',
      notes: 'The covered TIPS trial (Bureau, Gastroenterology 2017) randomized 62 patients with cirrhosis and recurrent ascites in France: 29 to a covered TIPS and 33 to large-volume paracentesis with albumin as needed. Patients were followed for a year. The primary outcome was transplant-free survival.',
      ask: ['What did the trial compare in recurrent ascites?', 'A covered TIPS against repeated large-volume paracentesis with albumin.'],
    },
    {
      id: 'covered-arms', preset: 'cirr-decomp', params: { ...REFRACTORY, ...TIPS8 }, days: 120, ramp: { albumin: [2.8, 2.5] }, cam: 'liver', tool: { kind: 'trial', id: 'covered' }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'], delta: 'covered',
      compare: [{ label: 'LVP with albumin', short: 'LVP', slide: 'covered' }, { label: 'Covered TIPS', short: 'TIPS', own: true }],
      kicker: 'Ascites', site: 'sin', title: 'In the model a TIPS resolves the ascites that LVP only drains', cite: 'Baveno VIII 6.3',
      line: 'Without the stent, her ascites is {asc@covered} and recurs after every paracentesis. With the stent, the ascites falls to {asc}.',
      notes: 'In the model the stent lowers the portal pressure, so ascites stops accumulating; paracentesis drains the ascites but does not treat the cause, so it reaccumulates, which is the state shown on the LVP button. The model does not simulate survival, so it cannot replay the trial: the card gives 1-year transplant-free survival, 93% after a covered TIPS and 52% after LVP with albumin. Baveno VIII 6.3: patients with recurrent or refractory ascites should be considered for TIPS.',
      ask: ['Why does ascites reaccumulate after paracentesis but not after a TIPS?', 'Paracentesis drains the ascites and leaves the portal hypertension that caused it; a TIPS lowers the portal pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'liver', 'shunt'], asc: false, vs: 'first', rowHead: 'Arm',
      of: [{ id: 'predesci', kicker: 'Placebo', title: 'Compensated, CSPH' }, { id: 'predesci-arms', kicker: 'PREDESCI', title: 'Carvedilol' }, { id: 'earlytips', kicker: 'Early TIPS', title: 'Drugs and EVL' }, { id: 'earlytips-arms', kicker: 'Early TIPS', title: 'Covered TIPS' }, { id: 'covered', kicker: 'Ascites', title: 'No stent' }, { id: 'covered-arms', kicker: 'Ascites', title: 'Covered TIPS' }],
      kicker: 'Summary', title: 'What the model shows, and what only the trials show',
      line: 'The model shows the pressure and flow each treatment changes. Only the trials show who decompensates, bleeds, develops hepatic encephalopathy or dies.',
      notes: 'For each trial the model reproduces the mechanism: carvedilol lowers the HVPG, a covered TIPS lowers the PPG and sinusoidal flow, transfusion raises the portal pressure, and a stent diverts portal flow around the liver. It cannot reproduce a trial\'s result, which is a count of patients over months or years. Those numbers are on the trial cards, each read against the paper it comes from.',
      ask: ['What can the model show about a trial, and what can it not?', 'It shows the mechanism, such as the fall in pressure; it cannot show the number of patients who decompensate, bleed or die.'],
    },
  ],
};
