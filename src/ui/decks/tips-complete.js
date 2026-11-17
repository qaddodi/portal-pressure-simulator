// Presenter talk: TIPS from the indication to the follow-up (the slide fields are described at the top of decks.js). The hub for everything
// TIPS in the app: who is offered a stent and why (preemptive, rescue and salvage, recurrent ascites, the others), who should be prepared or
// turned away (the liver, the heart, the brain), the placement and the gradient read through the stent, how wide, what the stent costs,
// what to do when encephalopathy follows, the follow-up Doppler and the stent that narrows, then the DIPS and the choice against BRTO.
// Its slides are the other TIPS talks' slides tightened and set in order (shunts, tips-candidacy, tips-doppler, ten-years, encephalopathy,
// budd-chiari, gastric-varices); the older talks stay as they are. Plan and slide-by-slide outline:
// /mnt/project-files/tips-geometry/tips-deck-outline.md.
//
// Not here yet: the bench tube against the patient (waits for the curve's bench option) and the long-waist button on the reduction slide.
//
// Sources, checked 16 Nov 2026 against guidelines/: Baveno VIII (J Hepatol 2026) 4.13, 4.15, 4.19, 5.31 to 5.37, 5.41, 6.3 to 6.9, 6.14 to 6.17,
// 7.8, 8.34, 9.26, 9.27 and Table 3; AASLD 2024 portal hypertension, guidance statements 32, 35, 38, 39 and the text on TIPS against BRTO;
// AASLD 2021 ascites (patient selection, 8 to 10 mm and under-10 mm covered stents, the venogram and Doppler guidance); AASLD 2020 vascular
// liver disorders (TIPS or DIPS in Budd–Chiari). After a TIPS no slide shows an HVPG: the reading is the PPG across the stent (portal vein minus
// IVC), target below 12 mmHg. The numbers the model produces stand as live values; the typed ones are the guidelines' own.

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };
const TIPS8 = { tips: { on: true, d: 8 } };
const REFRACTORY = { diuretics: false, albumin: 2.5 };
const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
const WIDTH = { label: 'Stent diameter', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' };
// The TIPS Doppler talk's patient: a 10 mm stent, a hyperdynamic splanchnic bed (so the stent reads 90 to 190 cm/s at each point).
const DOPPLER = { cirrhosis: 0.92, tips: { on: true, d: 10 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5 };
const TUBE = { kind: 'stent', vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' };
const fibrotic = (cirrhosis) => ({ preset: 'cirr-decomp', params: { ...REFRACTORY, cirrhosis, ...TIPS8 }, days: 60 });

export const TIPS_COMPLETE = {
  id: 'tips-complete', level: 'advanced', title: 'TIPS: indication to follow-up', minutes: 24,
  objectives: [
    'Name who is offered a preemptive, a rescue, a salvage and an elective TIPS, and the other indications',
    'Explain why a failing liver, a congested heart and a past episode of encephalopathy change the decision',
    'Read the gradient after a TIPS as the PPG across the stent, and say what the stent costs the liver',
    'Interpret the follow-up Doppler and a narrowing stent, and say what confirms it',
  ],
  checks: [
    ['A man bleeds from varices and banding controls it. He is Child–Pugh C 11 with a bilirubin of 6 mg/dL. Does the bilirubin rule out a preemptive TIPS?', 'No. Once he meets the criteria, a high bilirubin and the MELD score are not absolute contraindications (Baveno VIII 5.33). Place the stent within 72 hours, ideally within 24.'],
    ['A TIPS is placed for recurrent ascites. Which gradient confirms the result, and what is the target?', 'The PPG across the stent, the portal vein pressure minus the IVC pressure, <12 mmHg (Baveno VIII Table 3). It is not the HVPG.'],
    ['Two months after a TIPS a patient has overt encephalopathy. What comes before reducing the stent?', 'Look for and treat the precipitant, give lactulose, and add rifaximin after a recurrence. Reduce or occlude the stent only if it persists (Baveno VIII 6.17).'],
    ['Ascites returns six months after a TIPS and the Doppler is unremarkable. What is the next step?', 'TIPS venography with the gradient across the stent. Doppler can miss a stenosis (AASLD 2021).'],
  ],
  summary: 'TIPS from the indication to the follow-up: preemptive, rescue, salvage and elective stents, who should be prepared or turned away, the placement and the PPG across the stent, the width, encephalopathy and its reduction, the follow-up Doppler, a stent that narrows, the DIPS and TIPS against BRTO. Ends on a table of what each state does to the PPG and the liver.',
  sections: [['Choosing the patient', ['Choosing the patient']], ['Before the stent', ['Before the stent']], ['Placing the stent', ['Placing the stent', 'The stent as a tube']], ['After the stent', ['After the stent']], ['Other shunts', ['Other shunts']]],
  slides: [
    {
      id: 'path', lens: 'flow', preset: 'cirr-decomp', params: TIPS8, days: 30, cam: 'fit', sites: ['split'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'shunt'], key: ['ppg'],
      compare: [{ label: 'No stent', params: { tips: { on: false } }, title: 'Without a stent every liter of portal blood crosses the sinusoids', line: 'Without the stent the PPG is {ppg} and all of the portal blood must cross the sinusoids, whose resistance holds the pressure up.' }, { label: 'TIPS 8 mm', short: '8 mm', own: true }],
      vignette: 'A 56-year-old man with alcohol-associated cirrhosis has large esophageal varices and is being considered for a stent.',
      kicker: 'Choosing the patient', site: 'sin', title: 'A stent gives portal blood a second path past the liver',
      line: 'Blood leaving the gut can cross the sinusoids or cross the stent. Two paths in parallel offer less resistance than the liver alone, so the PPG falls to {ppg}.',
      notes: 'A covered stent joins a hepatic vein to a portal vein branch inside the liver. Paths in parallel add their conductances, so the stent lowers the total resistance and the portal pressure for the same inflow, and the stent carries most of the portal flow. The price is the blood that no longer crosses the sinusoids: hepatic portal perfusion falls, and ammonia and other gut-derived substances reach the systemic circulation. The next slides say who should have the stent and what it costs. The circuit view of the same idea is in the Portal pressure as a circuit talk. The buttons compare the same patient with and without the stent.',
      ask: ['Why does a stent lower the portal pressure?', 'It is a second, low-resistance path in parallel with the liver, so the total resistance falls and most portal blood takes it.'],
    },
    {
      id: 'indications', lens: 'flow', cam: 'fit', data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      tool: { kind: 'criteria', title: 'When TIPS is considered', short: 'Indications', ticks: false, lead: 'Four points, each with its own criteria.', rule: 'Baveno VIII 5.31, 4.13, 5.36, 6.3',
        rows: ['**Preemptive**: a high-risk bleed, within **72 hours**', '**Rescue**: a **rebleed** despite carvedilol and **banding**', '**Salvage**: bleeding **not controlled** by drugs and banding', '**Elective**: **recurrent or refractory ascites**'] },
      kicker: 'Choosing the patient', site: 'sin', title: 'TIPS is considered at four points: a high-risk bleed, a rebleed, an uncontrolled bleed and returning ascites',
      line: 'Preemptive after a high-risk bleed, rescue after a rebleed on carvedilol and banding, salvage when bleeding will not stop, and elective for recurrent or refractory ascites.',
      notes: 'The words follow AASLD 2024: rescue TIPS for a rebleed despite vasoactive therapy and band ligation, salvage TIPS for bleeding that is uncontrolled. Baveno VIII 5.31 sets the criteria for a preemptive TIPS, 4.13 and 5.36 to 5.37 the rescue and the salvage, and 6.3 recurrent or refractory ascites. TIPS as the first treatment to prevent rebleeding is kept for patients who have another indication, such as refractory ascites (AASLD 2024 statement 39). Each of the next slides takes one.',
      ask: ['Name the four points at which TIPS is considered.', 'Preemptive after a high-risk bleed, rescue after a rebleed, salvage for uncontrolled bleeding, and elective for recurrent or refractory ascites.'],
    },
    {
      id: 'pre', preset: 'cirr-decomp', action: BAND, cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis bled from varices; banding controlled it. Child–Pugh C 11, bilirubin 5.2 mg/dL, MELD 23, creatinine 1.1 mg/dL, no heart failure.',
      caseQ: 'Is he too sick for a TIPS?',
      tool: { kind: 'criteria', title: 'Preemptive TIPS', short: 'Preemptive', lead: 'One of the first three, and the last row.', rule: 'Baveno VIII 5.31, 5.33',
        rows: [{ text: 'Child–Pugh C', cut: 'C 10–13', note: 'C 11', met: true, lit: true }, { text: 'Child–Pugh B, active bleeding at endoscopy', cut: 'B 8–9', note: 'not B' }, { text: 'HVPG, where measured', cut: '≥20 mmHg', note: 'not given' },
          { text: 'Also **age** <75, creatinine <3 mg/dL, no heart failure', note: '54, 1.1, none' }],
        verdict: 'He qualifies. His bilirubin and MELD do not exclude him.' },
      kicker: 'Choosing the patient', site: 'sin', title: 'A high bilirubin and MELD do not rule out a preemptive TIPS',
      line: 'Place a covered TIPS within 72 hours, ideally within 24, to lower the PPG of {ppg}. Once he meets the criteria, his bilirubin and MELD do not exclude it.',
      notes: 'Baveno VIII 5.31 sets the criteria for a preemptive TIPS after esophageal or GOV1 bleeding: Child–Pugh C 10 to 13, or Child–Pugh B above 7 with active bleeding at the first endoscopy, or an HVPG of 20 mmHg or more at the time of the bleed, with a PTFE-covered stent within 72 hours, ideally within 24. Figure 3 adds three conditions: age under 75, creatinine under 3 mg/dL and no heart failure, so a woman of 79 with the same Child–Pugh score is past the age limit and receives carvedilol with banding instead. In a patient who meets the criteria, acute-on-chronic liver failure, overt encephalopathy, a high bilirubin, the MELD score and severe alcohol-associated hepatitis are not absolute contraindications (5.33). If the window is missed, a TIPS within 2 weeks for Child–Pugh C or within 1 week for Child–Pugh B may still help (5.32). AASLD 2024 statement 32 gives the same Child–Pugh criteria; its text adds that mortality after an early TIPS is high when the MELD score is above 19, but still lower than with standard therapy. The HVPG is a criterion here because it is measured before the stent; after the stent the reading is the PPG.',
      ask: ['Which findings do not exclude a preemptive TIPS in a patient who meets the criteria?', 'Acute-on-chronic liver failure, overt encephalopathy, a high bilirubin, the MELD score and severe alcohol-associated hepatitis (Baveno VIII 5.33).'],
    },
    {
      id: 'rescue', preset: 'cirr-decomp', params: CARV, action: [BAND, BAND, BAND], days: 30, cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      vignette: 'A 68-year-old woman with alcohol-associated cirrhosis bled again from esophageal varices on carvedilol and banding. Child–Pugh B 9, creatinine 1.1 mg/dL, no heart failure.',
      caseQ: 'Is a TIPS now an option for her?',
      tool: { kind: 'criteria', title: 'TIPS after a bleed', short: 'After a bleed', lead: 'Either one is an indication.', rule: 'Baveno VIII 4.13, 5.36, 5.37',
        rows: [{ text: '**Rebleeding** despite carvedilol and **banding**', note: 'rebled', met: true, lit: true }, { text: 'Bleeding **not controlled** by drugs and banding', note: 'not this' }],
        verdict: 'She rebled on both: a rescue TIPS is considered.' },
      kicker: 'Choosing the patient', site: 'sin', title: 'Rescue TIPS follows a rebleed, and salvage TIPS follows a bleed that cannot be controlled',
      line: 'On carvedilol with three bands her PPG is {ppg}. A rebleed despite both is a rescue indication. Uncontrolled bleeding needs a covered esophageal stent as a bridge, then salvage TIPS.',
      notes: 'Baveno VIII 4.13: TIPS should be considered for portal hypertensive bleeding despite secondary prophylaxis with carvedilol or a nonselective beta-blocker plus banding (strong). AASLD 2024 calls this a rescue TIPS and calls a TIPS for bleeding that drugs and banding do not control a salvage TIPS (statement 35). Baveno VIII 5.36 and 5.37: salvage TIPS for refractory bleeding, regardless of age, Child–Pugh class or MELD score, case by case; 5.35 prefers a dedicated covered self-expanding metal esophageal stent to balloon tamponade as the bridge to TIPS or transplant. AASLD 2024 notes that these stents are not FDA approved in the United States, so balloon tamponade or an off-label stent serves as the temporary measure. The bridge itself is in the Acute variceal bleeding talk. AASLD 2024 recommends TIPS as the first treatment to prevent rebleeding only in patients who have another indication, and in those who rebleed despite adequate prophylaxis, especially within the first 6 weeks.',
      ask: ['What is the difference between a rescue and a salvage TIPS?', 'Rescue: a rebleed despite vasoactive drugs and banding. Salvage: bleeding that drugs and banding do not control.'],
    },
    {
      id: 'ascites', preset: 'cirr-decomp', params: REFRACTORY, relax: 200, cam: 'fit', tool: { kind: 'trial', id: 'covered' }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 61-year-old woman with alcohol-associated cirrhosis needs a 5 L paracentesis every two weeks on full diuretics. MELD 11, no encephalopathy, normal echocardiogram.',
      caseQ: 'Is she a candidate for TIPS?',
      kicker: 'Choosing the patient', site: 'sin', title: 'Ascites that returns after every paracentesis is an indication for TIPS', cite: 'Baveno VIII 6.3, 6.4',
      line: 'Her ascites is {asc} with a PPG of {ppg}. Her liver, heart and kidneys pass the checks, so TIPS is considered, and discussed together with liver transplant.',
      notes: 'Baveno VIII 6.3: patients with recurrent or refractory ascites should be considered for TIPS (level 1, strong), and TIPS and liver transplant should be discussed together (6.4). Renal function is staged first (6.9). The covered TIPS trial enrolled patients who needed repeated large-volume paracentesis; the card gives its numbers. AASLD 2021 says careful selection is the key to success: the benefit is largest in younger patients with a low MELD score, with a smaller covered stent and a complete response.',
      ask: ['What does Baveno VIII advise for recurrent ascites, and what is discussed with it?', 'Consider TIPS, and discuss TIPS and liver transplant together (6.3, 6.4).'],
    },
    {
      id: 'price', params: TIPS8, days: 60, lapse: { seconds: 8, from: 'Before the stent', to: 'Two months later' }, lens: 'flow', cam: 'liver', mark: STENT, tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'liver'], keepTiles: true, title: 'Ascites and sinusoidal flow over two months' }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      kicker: 'Choosing the patient', site: 'sin', title: 'The stent clears the ascites but diverts most of the sinusoidal flow',
      line: 'Two months on, the ascites is {asc} and the PPG {ppg}, but sinusoidal flow has fallen to {liver} of normal.',
      notes: 'The stent gives portal blood a low-resistance path to the right heart. The pressure behind the liver falls, the fluid stops forming and the ascites drains, but the blood that takes the stent no longer passes through the sinusoids. The model clears the ascites in weeks. In patients it takes 4 to 6 months, about 80% clear it, and diuretics are used with caution meanwhile (AASLD 2021). A patient who has not cleared the ascites at 12 months despite a widely patent TIPS is referred for transplant evaluation. A covered stent of 8 to 10 mm gives less encephalopathy than a wider one without losing control of the ascites (AASLD 2021; Baveno VIII 6.5).',
      ask: ['What does a TIPS give up to clear ascites?', 'Sinusoidal flow: part of the portal blood bypasses the liver.'],
    },
    {
      // (Criteria only: the model has no chest for a hydrothorax, and the Budd–Chiari, portal vein thrombosis and gastric varix patients each have their own talk.)
      id: 'beyond', lens: 'flow', cam: 'fit', data: 'tiles', tiles: ['ppg', 'asc'], key: ['ppg'],
      tool: { kind: 'criteria', title: 'Other indications', short: 'Other indications', ticks: false, lead: 'Each has its own talk.', rule: 'Baveno VIII 6.7, 8.34, 9.26, 5.41',
        rows: ['**Refractory hepatic hydrothorax**', '**Budd–Chiari**: recanalization fails or is not possible', '**Main portal vein thrombosis** that does not improve on anticoagulation', '**Gastric varix** bleed (GOV2 or IGV1), with or without embolization'] },
      kicker: 'Choosing the patient', site: 'sin', title: 'TIPS also treats refractory hydrothorax, Budd–Chiari syndrome, selected portal vein thrombosis and fundal bleeding',
      line: 'Baveno VIII considers TIPS for refractory hydrothorax, Budd–Chiari syndrome when recanalization fails, main portal vein thrombosis that does not improve on anticoagulation, and a fundal bleed.',
      notes: 'Baveno VIII 6.7: hepatic hydrothorax refractory to standard medical treatment (the model draws no chest). 8.34: in Budd–Chiari syndrome, when medical management is not enough and recanalization is not an option or has failed, TIPS is the recommended next step; the Budd–Chiari talk shows the DIPS used when no hepatic vein can be reached. 9.26: in cirrhosis with main portal vein thrombosis that does not improve on anticoagulation and who have complications of portal hypertension or are potential transplant candidates; 9.27: TIPS may be first-line in main portal vein thrombosis with complications and a contraindication to anticoagulation (weak). 5.41: TIPS with or without variceal embolization as soon as possible after a GOV2 or IGV1 bleed; the last slides compare it with BRTO.',
      ask: ['Name three indications for TIPS other than a variceal bleed or ascites.', 'Refractory hepatic hydrothorax, Budd–Chiari syndrome when recanalization fails, and main portal vein thrombosis that does not improve on anticoagulation.'],
    },
    {
      id: 'workup', lens: 'flow', cam: 'liver', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Pre-TIPS evaluation', short: 'Pre-TIPS', ticks: false, rows: ['No **heart failure**', '**Renal function** staged (eGFR)', 'Prior **hepatic encephalopathy** reviewed, **rifaximin** considered', '**Age** ≥70 or **frailty**: a relative, not absolute, contraindication'] },
      kicker: 'Before the stent', site: 'sin', title: 'Assess cardiac function, renal function and encephalopathy risk first',
      line: 'A TIPS raises preload and diverts ammonia-rich portal blood past the liver. Assess the heart, kidneys and prior encephalopathy. Age ≥70 or frailty alone does not exclude it.',
      notes: 'Baveno VIII asks for renal function to be staged before TIPS for ascites (6.9) and for the history of hepatic encephalopathy and its medicines to be reviewed (6.14). A history of overt hepatic encephalopathy is not an absolute contraindication (6.15); rifaximin should be considered before an elective TIPS (6.16). Not absolute contraindications: for a preemptive TIPS, acute-on-chronic liver failure, overt hepatic encephalopathy, a high bilirubin, the MELD score and severe alcohol-associated hepatitis (5.33); a liver tumor, unless it lies along the planned TIPS tract (4.15); frailty or sarcopenia alone (4.19); and age 70 or over with refractory ascites, judged case by case (6.8). Cardiac and renal function carry the most weight, and TIPS and liver transplant are discussed together (6.4).',
      ask: ['A woman with refractory ascites is referred for TIPS. Which three areas do you assess first?', 'The heart, the kidneys and the brain: heart failure, renal function, and the history of hepatic encephalopathy, with rifaximin considered.'],
    },
    {
      id: 'liver', lens: 'flow', preset: 'cirr-decomp', params: { ...REFRACTORY, ...TIPS8 }, days: 60, cam: 'liver', mark: STENT, data: 'tiles', tiles: ['liver', 'he'], key: ['liver'],
      compare: [{ label: 'Less fibrosis', short: 'Less', ...fibrotic(0.7), title: 'The same stent leaves more sinusoidal flow in a less fibrotic liver', line: 'In a less fibrotic liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A more fibrotic liver keeps less flow.' }, { label: 'This liver', short: 'This', own: true }, { label: 'More fibrosis', short: 'More', ...fibrotic(0.95), title: 'The same stent leaves less sinusoidal flow in a more fibrotic liver', line: 'In a more fibrotic liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A less fibrotic liver keeps more flow.' }],
      kicker: 'Before the stent', site: 'sin', title: 'The same stent leaves less sinusoidal flow in a more fibrotic liver',
      line: 'In this liver the stent leaves {liver} of normal sinusoidal flow and an encephalopathy index of {he}. A less fibrotic liver keeps more flow, a more fibrotic one keeps less.',
      notes: 'The model has no MELD score or bilirubin; it has the fibrosis, and the fibrosis sets how much flow the liver keeps once part of the portal blood takes the stent. The encephalopathy index is the model\'s own, built from the share of portal blood that bypasses the liver and the flow that still reaches it; it is not a clinical score. AASLD 2021: patients with a MELD score of 18 or more are in general poor candidates for TIPS for ascites, advanced age, cardiopulmonary insufficiency and sarcopenia predispose to complications and encephalopathy, and the survival benefit is largest in patients with a low MELD score; those with liver dysfunction that precludes TIPS are considered for transplant. Baveno VIII 5.33 points the other way for a bleed that meets the preemptive criteria, because there the stent is lifesaving and the alternative is worse: the stakes, not the MELD, differ.',
      ask: ['Why does the same stent leave less flow in a more fibrotic liver?', 'The fibrotic liver offers more resistance, so more of the portal blood takes the stent and less is left for the sinusoids.'],
    },
    {
      id: 'heart', lens: 'flow', preset: 'cirr-decomp', params: { diuretics: false, pericardial: 0.9 }, action: { kind: 'retain', mL: 1150 }, days: 60, cam: 'route', labels: ['CONF', 'RHV', 'RA'], sites: ['ra'], data: 'tiles', tiles: ['ra', 'co'], key: ['ra'],
      compare: [{ label: 'Before the stent', short: 'Before', own: true }, { label: 'With the stent', short: 'Stent', params: TIPS8, days: 1, title: 'A stent sends more blood to a right atrium that is already full', line: 'With the stent the right atrium reads {ra} and cardiac output {co}: more blood returns to a heart that is already full, and the cause of the ascites is untouched.' }],
      vignette: 'A 66-year-old man with MASLD cirrhosis has ascites that returns after every paracentesis. His jugular veins are distended and the echocardiogram shows a thickened pericardium.',
      caseQ: 'Will a TIPS clear it?',
      kicker: 'Before the stent', site: 'cardiac', title: 'A raised right atrial pressure points to the heart, not the liver, as the cause of the ascites',
      line: 'His right atrial pressure is {ra} and cardiac output {co}. Congestion, not sinusoidal resistance, drives the ascites, so the stent would add load to a heart that is already full.',
      notes: 'A raised right atrial pressure lifts the free and wedged hepatic vein pressures together, so the gradients fall and understate the portal pressure; the right atrium shows it. The same constriction is the Constrictive pericarditis patient of the model. With the stent the model shows the first day: portal blood now reaches the right atrium without passing the liver, so the preload of a heart that is already congested rises. In the weeks after, the ascites drains and the right atrium falls, but it stays high. A congested heart is treated first, and for constrictive pericarditis that is pericardiectomy (EASL 2025 asks for a hemodynamic study when constriction is suspected). Baveno VIII 6.5 names cardiac failure with encephalopathy as the risk of overshunting, Figure 3 lists no heart failure among the conditions for a preemptive TIPS, and AASLD 2021 lists cardiopulmonary insufficiency among the risks of complications. In a normal heart the first days with the stent also raise the right atrial pressure and the cardiac output, and both settle as the ascites clears. None of the guidelines gives a right atrial pressure above which a TIPS is refused; the tile\'s rating is the app\'s own.',
      ask: ['Why does a TIPS add load to a failing heart?', 'It returns portal blood straight to the right atrium, so venous return and preload rise.'],
    },
    {
      id: 'brain', preset: 'cirr-decomp', params: { ...REFRACTORY, ...TIPS8 }, relax: 200, days: 30, lens: 'flow', cam: 'liver', mark: STENT, tool: { kind: 'trial', id: 'rifaximin', at: 'ascites' }, data: 'tiles', tiles: ['he', 'liver'], key: ['he'],
      vignette: 'A 63-year-old woman with refractory ascites had one episode of overt encephalopathy after a GI bleed two years ago. She takes lactulose. MELD 12.',
      caseQ: 'Does that rule out a TIPS?',
      kicker: 'Before the stent', site: 'sin', title: 'A past episode of overt encephalopathy is a reason to prepare, not to refuse', cite: 'Baveno VIII 6.14 to 6.16',
      line: 'Baveno VIII asks for her encephalopathy history and medicines to be reviewed, and for rifaximin to be considered before the stent. The model\'s encephalopathy index with the stent is {he}.',
      notes: 'Baveno VIII 6.14: before an elective TIPS, review the history of overt encephalopathy and the medicines used for it. 6.15: a past episode is not an absolute contraindication, and the decision is individualized. 6.16: rifaximin should be considered before an elective TIPS (strong recommendation). The card is the rifaximin trial, which enrolled patients scheduled for TIPS for ascites or to prevent rebleeding. A smaller stent also lowers the risk (6.5; AASLD 2021). If encephalopathy returns after the stent despite treatment, reducing or occluding it may be considered (6.17).',
      ask: ['Is a past episode of overt encephalopathy an absolute contraindication to an elective TIPS?', 'No. It is reviewed, rifaximin is considered, and the decision is individualized (6.14 to 6.16).'],
    },
    {
      id: 'play', lens: 'flow', preset: 'cirr-decomp', params: REFRACTORY, relax: 200, cam: 'liver', labels: ['CONF'], procedure: 'tips', tool: { kind: 'evgraph', title: 'PPG and sinusoidal flow after TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      kicker: 'Placing the stent', site: 'sin', title: 'TIPS is placed through transjugular access to the portal vein',
      line: 'Through right internal jugular access, the catheter reaches the right hepatic vein. A needle traverses the parenchyma to the right portal vein, and a covered stent lines the tract.',
      notes: 'A TIPS is an intrahepatic tract between a hepatic vein and a portal vein branch. Access is transjugular, so there is no abdominal incision. A covered stent keeps the tract patent: Baveno VIII specifies polytetrafluoroethylene (PTFE)-covered stents (5.31), and AASLD 2024 recommends a PTFE-covered stent for the emergent TIPS. Once the stent is deployed, portal pressure falls immediately.',
      ask: ['Which type of stent does Baveno VIII specify for preemptive TIPS?', 'A polytetrafluoroethylene (PTFE)-covered stent.'],
    },
    {
      id: 'gradient', lens: 'flow', params: { tips: { on: true, d: 8 } }, days: 1, procedure: 'tipsgrad', cam: 'liver', tool: { kind: 'reading' },   // (no tiles: the readings are the monitor's, each only once it is taken)
      kicker: 'Placing the stent', site: 'sin', title: 'After a TIPS, the PPG across the stent is the number, and the target is <12 mmHg',
      line: 'The catheter reads the portal pressure through the 8 mm stent, then the IVC pressure. The target after a TIPS is {<12 mmHg}.',
      notes: 'Press Next to take the measurement. With the stent in, the catheter is advanced through it into the portal vein, where the portal pressure is read, then drawn back to the IVC for the second reading; the PPG is the portal vein pressure minus the IVC pressure. After a TIPS this is the gradient that is read; the HVPG is not. The target after a TIPS is a PPG below 12 mmHg (AASLD 2024: a nonselective beta-blocker is not required once the portosystemic gradient is below 12 mmHg). Baveno VIII Table 3 adds that the immediate reading can be changed by anesthesia, vasoactive drugs or hemodynamic instability, so a measurement in a stable, nonsedated patient better reflects the long-term value.',
      ask: ['After a TIPS placed for variceal bleeding, which gradient is read, and what is the target?', 'The PPG, the portal vein pressure minus the IVC pressure across the stent: <12 mmHg.'],
    },
    {
      id: 'diameter', lens: 'flow', params: { tips: { d: 12 } }, days: 30, whatIf: WIDTH, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'Stent at 12 mm', kind: 'treat' },
      tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }, data: 'tiles', tiles: ['ppg', 'liver'],
      kicker: 'Placing the stent', site: 'sin', title: 'Dilate the stent only as far as the ascites requires',
      line: 'At 12 mm the PPG is {ppg} and sinusoidal flow is {liver} of normal, with diminishing returns per millimeter. Baveno VIII advises stepwise dilation only if ascites persists.',
      notes: 'The same patient with the stent dilated to 12 mm. The gradient falls further, but hepatic portal perfusion falls further too. Post-TIPS hepatic encephalopathy is more common with larger stents, older age and prior encephalopathy; liver failure is the feared complication when hepatic reserve is poor, as is heart failure. Baveno VIII says the stent may be dilated to the smallest diameter that gives an adequate response (6.5), and dilated stepwise when the ascites does not improve (6.6). AASLD 2021 prefers a small-diameter covered stent, under 10 mm, to lower the risk of encephalopathy; stents of 8 to 10 mm gave less encephalopathy without losing control of the ascites. Persistent hepatic encephalopathy can be treated by TIPS reduction. On the figure, colored by flow, the stent carries far more blood than the sinusoids. (Baveno VIII 6.5, 6.6.)',
      ask: ['Why are TIPS stents often left at 8 to 10 mm?', 'To lower the gradient enough while preserving hepatic portal perfusion and limiting the risk of hepatic encephalopathy and heart failure.'],
    },
    {
      id: 'cost', preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'menu' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      kicker: 'Placing the stent', site: 'sin', title: 'Every shunt trades a lower PPG for less sinusoidal flow',
      line: 'From {ppg}, a drug lowers the PPG slightly and preserves sinusoidal flow. Each shunt lowers the PPG further and diverts more of that flow.',
      notes: 'Each dot is this patient after one treatment, calculated by the model from the current state; the ring is his current position. The drugs move him a little, down and slightly to the left. A TIPS, a mesocaval shunt and a portocaval shunt lower the PPG well below the 12 mmHg line and sinusoidal flow to <55% of normal, with almost all portal flow bypassing the liver. A larger stent lies further down and to the left than a smaller one. Dot size reflects the share of portal flow that bypasses the liver. These are the model\'s numbers for one patient, not trial results. The surgical shunts are in the TIPS and shunts talk.',
      ask: ['Which treatment on the chart lowers the PPG the most, and what does it cost?', 'The portocaval shunt lowers the PPG to about 3 mmHg, and all portal flow bypasses the liver.'],
    },
    {
      id: 'tube', lens: 'velocity', preset: 'cirr-decomp', params: DOPPLER, days: 30, cam: { on: ['RHV_IVC', 'TIPS'] }, mark: STENT, tool: TUBE, data: 'tiles', tiles: ['tipsFlow', 'tipsDp'], key: ['tipsDp'],
      kicker: 'The stent as a tube', site: 'sin', title: 'Flow through the stent follows the pressure across it',
      line: 'Here {tipsFlow} crosses the stent with {tipsDp} across it. The card shows where that pressure goes and the peak velocity Doppler would read.',
      notes: 'The stent is a tube, and a tube moves flow in proportion to the pressure across it: part of that pressure is lost along the stent and the tract (friction), part where the blood enters and leaves it and where it jets through a narrowing (local losses). The side view draws the stent to scale in centimeters, with the narrowest lumen in millimeters and the peak velocity at each of the three Doppler points, the same numbers the Doppler card prints. The bar below it shows the pressure across the stent split into its parts, and, with the PPG, the part that falls outside the stent. The drop across the stent is smaller than the PPG because the portal vein pressure is read against the IVC, not against the stent\'s own end. The heart, hepatic vein and IVC respond to the stent; the model holds no pressure fixed. These are the model\'s numbers for one patient, not measurements.',
      ask: ['What does the flow through a stent depend on?', 'The pressure across it and its resistance: friction along its length and the local losses at its ends and at any narrowing.'],
    },
    {
      id: 'waist', question: 'The narrowest point stays the same. Does the length of the narrowed segment matter?', lens: 'velocity', params: { stentGeom: { TIPS: { red: 0.4, waist: 1, trans: 0 } } }, cam: { on: ['RHV_IVC', 'TIPS'] }, mark: STENT, tool: TUBE, data: 'tiles', tiles: ['tipsFlow', 'tipsDp'], key: ['tipsDp'],
      compare: [{ label: 'Short, 1 cm', short: '1 cm', own: true, params: { stentGeom: { TIPS: { red: 0.4, waist: 1, trans: 0 } } } },
        { label: 'Long, 4 cm', short: '4 cm', params: { stentGeom: { TIPS: { waist: 4 } } }, title: 'A long narrowed segment resists more than a short one', line: 'With a 4 cm waist {tipsFlow} crosses the stent with {tipsDp} across it: more friction along the waist than a short one has.' },
        { label: 'Short, tapered', short: 'Taper', params: { stentGeom: { TIPS: { trans: 1 } } }, title: 'Tapered ends lose less where the jet leaves the waist', line: 'With tapered ends the same 1 cm waist drops {tipsDp} across the stent, and {tipsFlow} crosses it: the jet loses less where it leaves the waist.' }],
      kicker: 'The stent as a tube', site: 'sin', title: 'In the model, a longer narrowed segment raises the pressure across the stent at the same narrowest lumen',
      line: 'With a short waist {tipsFlow} crosses the stent with {tipsDp} across it. A longer waist adds friction to the jet\'s loss, and the drop across the stent rises.',
      notes: 'A 10 mm stent narrowed to 6 mm. The minimum diameter sets the jet, and the length of the narrowed segment adds friction along it; where the stent narrows or widens, an abrupt step loses more than a taper. The minimum diameter matters, but the length of the narrowed segment also changes the resistance, and the resulting flow depends on the rest of the portal circulation: the portal pressure rises and pushes harder, so in the patient the flow falls by less than it would in the tube alone. This is the model\'s mechanism, not a prediction: its coefficients are provisional, and no clinical data gives a pressure change for a given length. The buttons move the same patient between a short waist, a long one and tapered ends; the drawn stent does not stretch.',
      ask: ['At the same narrowest diameter, what does a longer narrowed segment do?', 'It adds friction along the narrowing, so the pressure across the stent rises, and the portal pressure with it.'],
    },
    {
      id: 'he', lens: 'flow', preset: 'cirr-decomp', params: { ...REFRACTORY, tips: { on: true, d: 10 } }, days: 60, cam: 'liver', mark: STENT, data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'],
      tool: { kind: 'criteria', title: 'Encephalopathy after TIPS', short: 'After TIPS', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 6.17', rows: ['Find and treat the **precipitant** first', '**Lactulose**, and **rifaximin** after a recurrence',
        { text: 'Reduce or occlude the stent only if it persists', lit: true }] },
      vignette: 'A 63-year-old woman had a TIPS for refractory ascites two months ago. She is awake at night, sleepy by day and slow to answer.',
      caseQ: 'Do you narrow the stent?',
      kicker: 'After the stent', site: 'sin', title: 'Treat the precipitant and give lactulose before reducing the stent',
      line: 'Look for infection, GI bleeding, constipation, sedatives, hyponatremia and hypokalemia, and give lactulose. Add rifaximin after a recurrence. Reduce the stent only if encephalopathy persists.',
      notes: 'Overt hepatic encephalopathy is a recognized complication of TIPS: more portal blood reaches the systemic circulation without first-pass hepatic clearance. Baveno VIII 6.17 considers narrowing or closing the TIPS for encephalopathy that comes back or persists after a TIPS despite removal of precipitants and standard medical treatment (weak recommendation); 6.12 adds embolization of a large spontaneous portosystemic shunt when encephalopathy persists despite optimal drug therapy, and 5.34 says refractory encephalopathy after a TIPS may raise a patient\'s transplant priority. TIPS reduction is last because it reverses part of the portal decompression. The model has no ammonia or brain; the fraction of portal blood that bypasses the liver stands in for the risk.',
      ask: ['When is the TIPS reduced for hepatic encephalopathy?', 'Only when it persists or recurs despite removing the precipitant and giving lactulose and rifaximin.'],
    },
    {
      id: 'reduce', lens: 'flow', params: { tips: { d: 6 } }, days: 30, cam: 'liver', mark: STENT, tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'],
      compare: [{ label: '10 mm', params: { tips: { d: 10 } } }, { label: 'Reduced to 6 mm', short: '6 mm', own: true }],
      kicker: 'After the stent', site: 'sin', title: 'When encephalopathy persists, reducing the stent returns portal blood to the liver at the price of a higher PPG',
      line: 'Reducing the stent to 6 mm lifts sinusoidal flow to {liver} of normal, and the PPG rises to {ppg}. Baveno VIII makes reduction a weak recommendation.',
      notes: 'Encephalopathy that persists after a TIPS despite lactulose and rifaximin can be treated by reducing the stent diameter, with a smaller stent placed coaxially inside it, or by occluding the stent (Baveno VIII 6.17, weak recommendation). Either way, part of the portal hypertension that the TIPS was placed to treat returns, so the ascites or the variceal bleeding can recur. The buttons compare the same patient with the stent at 10 mm and reduced to 6 mm.',
      ask: ['What does reducing the stent diameter cost?', 'The portal pressure rises, so the ascites or variceal bleeding the TIPS treated can recur.'],
    },
    {
      id: 'baseline', lens: 'velocity', preset: 'cirr-decomp', params: DOPPLER, days: 30, cam: { on: ['PVH_R'] }, beats: [{ cam: { on: ['RHV_IVC', 'TIPS'] } }, { cam: 'liver' }], tool: { kind: 'doppler', vessel: 'TIPS', gate: 'mid', points: true }, data: 'tiles', tiles: ['ppg', 'asc'],
      compare: [{ label: 'Proximal', gate: 'proximal' }, { label: 'Mid', gate: 'mid', own: true }, { label: 'Distal', gate: 'distal' }],
      vignette: 'The same woman six weeks after her TIPS has her first Doppler study. It is the baseline for every study that follows.',
      kicker: 'After the stent', title: 'Doppler samples the stent at three points, and a baseline study anchors the follow-up',
      line: 'Sample the portal end, the middle and the hepatic vein end. A velocity {<90 cm/s} or {>190 cm/s}, or a change of 50 cm/s from baseline, suggests stenosis.',
      notes: 'A baseline Doppler study is done in the first weeks after placement, and every follow-up study is compared with it. Doppler samples the stent at its portal end (proximal), mid stent (mid) and its hepatic vein end (distal); each normally measures 90 to 190 cm/s. In shunts confirmed patent at venography, mean peak velocities were about 140 cm/s at the portal end, 150 to 185 cm/s mid stent and 140 to 170 cm/s at the hepatic vein end (Mitchell et al., 2025). A velocity outside 90 to 190 cm/s, or a change of more than 50 cm/s from the baseline study, suggests stenosis. These cut-offs were derived from bare stents; covered stents develop stenosis far less often, so the change from the baseline study carries more weight. Neither Baveno VIII nor AASLD 2024 gives Doppler cut-offs. AASLD 2021: the follow-up Doppler of an asymptomatic patient with a covered stent probably has little therapeutic impact, and surveillance is suggested after a revision or in a prothrombotic state. Tap Proximal, Mid or Distal to move the Doppler gate. The aliasing, the main portal vein and the branch directions are in the Doppler after TIPS talk.',
      ask: ['Where along the stent is the velocity measured?', 'At the portal end (proximal), in the middle (mid) and at the hepatic vein end (distal).'],
    },
    {
      id: 'jet', question: 'Ascites returns after a TIPS. Where would you look?', params: { stenosis: { TIPS: 0.65 } }, days: 180, cam: 'liver', lens: 'velocity',
      mark: { edges: ['TIPS'], label: 'Stenosis', seg: 'site' }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['ppg'], delta: 'baseline',
      // (Mid is the same 1 cm narrowing mid stent: on the stent card a stenosis sits at an end and a narrowing mid stent is the Waist, stent-geom.js.)
      compare: [{ label: 'Proximal', params: { stenosis: { TIPS: 0.65 }, stenosisSite: { TIPS: 'proximal' }, stentGeom: { TIPS: { red: 0 } } } }, { label: 'Mid', params: { stenosis: { TIPS: 0 }, stentGeom: { TIPS: { red: 0.65 } } } },
        { label: 'Distal', own: true, params: { stenosis: { TIPS: 0.65 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { red: 0 } } } }, { label: 'Dilated', params: { stenosis: { TIPS: 0 }, stentGeom: { TIPS: { red: 0 } } } }],
      kicker: 'After the stent', title: 'A stenosed stent shows low velocity with a focal jet, and venography with a gradient decides',
      line: 'At 6 months, {asc} of ascites has reaccumulated. The jet at the stenosis is {>190 cm/s}, the rest of the stent {<90 cm/s}, and the PPG has risen to {ppg}.',
      notes: 'Stenosis usually develops at the hepatic vein end of the stent, or in the hepatic vein beyond it, often from intimal hyperplasia at the junction of the stent and the hepatic vein. Along most of the stent the velocity falls, often <90 cm/s, while a short jet at the stenosis itself can exceed 190 cm/s. Doppler localizes the stenosis by its jet: the highest of the three velocities, with low velocity on either side, which is why all three points are sampled. The gradient rises again and the indication for the TIPS recurs: ascites, or varices that can bleed. Doppler raises the suspicion; it does not settle it. AASLD 2021: if ascites recurs after initial clearance, a TIPS venogram should be considered and the stent revised if a stenosis is found, with periodic Doppler surveillance in those patients; because Doppler can miss a stenosis, venography is considered in persistent or recurrent ascites even when the Doppler is unremarkable. A stenosed stent is treated with balloon angioplasty or a new stent, and the gradient is measured again. The model draws the stenosis as one short segment, about 1 cm long; in patients it can be longer or lie in the hepatic vein beyond the stent. Tap Proximal, Mid or Distal to move the stenosis along the stent; Dilated shows the stent after angioplasty.',
      ask: ['TIPS velocities are 60 cm/s proximally, 240 cm/s mid stent and 65 cm/s distally. Where is the stenosis?', 'Mid stent, where the jet is.'],
    },
    {
      id: 'dysfunction', lens: 'velocity', cam: 'liver', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' },
      tool: { kind: 'curve', param: 'stenosis.TIPS', from: 0, to: 0.8, step: 0.05, lines: ['ppg', 'pvVel'], cuts: [12] },
      kicker: 'After the stent', title: 'As the stent narrows, the PPG climbs back and the original indication returns',
      line: 'As the stent narrows the PPG passes {>=12 mmHg} and the ascites or bleeding returns. At 65% stenosis the PPG is {ppg}. Doppler screens; venography confirms.',
      notes: 'Each point is the same patient with slightly more stenosis, the PPG and mean main portal vein velocity plotted against the degree of stenosis. The ring is the 65% stenosis of the slide before. Dysfunction presents as the return of the indication: ascites or variceal bleeding, with a PPG above the target, and on Doppler a change from the baseline study. Covered stents have lessened the incidence of TIPS dysfunction significantly (AASLD 2021); it is confirmed and treated at TIPS venography, with angioplasty or a new stent. After a TIPS, a PPG <12 mmHg means a beta-blocker is no longer needed (AASLD 2024). The velocities are the model\'s means. (AASLD 2024; AASLD 2021; McNaughton and Abu-Yousef 2011.)',
      ask: ['In a patient with a TIPS, ascites recurs. What returns to the stent, and what confirms the cause?', 'The PPG climbs as the stent narrows; TIPS venography with the gradient confirms it, and Doppler only screens.'],
    },
    {
      // (Budd–Chiari's own talk teaches the DIPS in four steps; this is its slide with the TIPS beside it.)
      id: 'dips', lens: 'flow', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, cam: 'dips', terms: ['pv', 'ivc'], mark: { edges: ['DIPS'], label: 'DIPS', kind: 'treat' },
      compare: [{ label: 'TIPS', preset: 'budd-chiari', params: { tips: { on: true }, dips: { on: false } }, days: 60, title: 'A TIPS cannot decompress the liver when no hepatic vein can be recanalized', line: 'A TIPS starts in a hepatic vein, and none can be used, so the portal pressure stays at {pv}.' }, { label: 'DIPS', own: true }],
      tool: { kind: 'flows' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'],
      vignette: 'A 31-year-old woman with Budd–Chiari syndrome has worsening symptoms despite anticoagulation. Imaging shows no hepatic vein that can be recanalized.',
      kicker: 'Other shunts', site: 'post', title: 'When no hepatic vein can be used, a DIPS from the IVC decompresses the liver',
      line: 'A TIPS needs a hepatic vein, and none can be used. A DIPS runs from the IVC through the caudate lobe to the portal vein, lowering the pressure to {pv}.',
      notes: 'Source: Baveno VIII 8.34. When medical management alone is insufficient and recanalization is not an option or has failed, TIPS is the recommended next step. A standard TIPS runs from a hepatic vein to the portal vein, so when all three hepatic veins are occluded the stent runs from the IVC through the caudate lobe to the portal vein, a direct intrahepatic portosystemic shunt (DIPS). AASLD 2020: a TIPS or DIPS with PTFE-covered stents is the treatment of choice when medical therapy or angioplasty fail or are not feasible, and in more than 40% of patients a direct puncture from the IVC to the right portal vein is needed. EASL 2025: placement belongs in experienced referral centers, and dysfunction is managed by angioplasty or additional stenting with close follow-up. None of the five guidelines gives a DIPS recommendation outside hepatic vein outflow obstruction. The buttons compare the TIPS and the DIPS in the same patient.',
      ask: ['Why can a standard TIPS not be placed when all three hepatic veins are occluded?', 'It needs a hepatic vein to start from; the stent goes from the IVC instead (a DIPS).'],
    },
    {
      id: 'gastric', lens: 'flow', preset: 'gastric-varix', params: TIPS8, days: 60, cam: 'fundus', terms: ['gv'], data: 'tiles', tiles: ['ppg', 'gv'], key: ['gv'],
      compare: [{ label: 'TIPS', own: true }, { label: 'BRTO', params: { tips: { on: false }, occluded: { C5: true } }, days: 60, title: 'BRTO shrinks the fundal varix but raises the PPG', line: 'Occluding the shunt shrinks the fundal varix to {gv}, but the PPG rises to {ppg}, so ascites and esophageal varices can worsen.' }],
      kicker: 'Other shunts', site: 'sin', title: 'For a gastric varix, choose between TIPS and BRTO by liver function, encephalopathy and ascites',
      line: 'A TIPS lowers the PPG to {ppg} and the fundal varix to {gv}. BRTO shrinks the varix but raises the PPG. Liver function, encephalopathy and ascites decide.',
      notes: 'Sources: Baveno VIII 5.41; AASLD 2024. A TIPS, with or without embolization of the varix, as soon as possible after a bleed from a GOV2 or IGV1 varix is the preferred definitive treatment in Baveno VIII; transvenous obliteration is kept for patients in whom a TIPS is not suitable. AASLD 2024: a TIPS may be preferred with preserved liver function (MELD-sodium under 20) and large esophageal varices, significant ascites or portal vein thrombosis, without encephalopathy; BRTO may be preferred with encephalopathy, a MELD-sodium above 20 or a Freiburg index of post-TIPS survival above 0.92. Occluding the gastrorenal shunt raises the portal pressure, so ascites and esophageal varices can worsen and surveillance endoscopy follows. The Gastric varices talk plays both procedures. The buttons compare the two in the same patient.',
      ask: ['A patient with encephalopathy bleeds from an IGV1 that drains through a gastrorenal shunt. Which treatment may fit, and why?', 'BRTO: it keeps portal blood in the liver, and a TIPS adds to the encephalopathy risk.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'liver', 'shunt', 'he'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ preset: 'cirr-decomp', kicker: 'Reference', title: 'Decompensated cirrhosis, no stent', ref: true }, { id: 'path', title: 'TIPS, 8 mm' }, { id: 'diameter', title: 'TIPS, 12 mm' },
        { id: 'reduce', title: 'TIPS reduced to 6 mm' }, { id: 'jet', title: 'TIPS, 65% stenosis' }],
      kicker: 'Summary', title: 'A stent trades PPG for sinusoidal flow, and every later decision moves one against the other',
      line: 'Every shunt lowers the gradient by diverting portal flow from the liver. A wider stent diverts more; a reduced or narrowed one gives flow back and the PPG returns.',
      notes: 'Five states of one decompensated patient. An 8 mm stent lowers the PPG below 12 mmHg and diverts much of the sinusoidal flow; a 12 mm stent lowers the PPG a little more and diverts more; reducing the stent to 6 mm gives some flow back and lifts the PPG; a narrowed stent lets the PPG climb toward where it started. The last column is the model\'s index of encephalopathy risk, not a clinical score. The DIPS patient has Budd–Chiari syndrome and a table of her own in that talk.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal pressure gradient against less hepatic portal perfusion and more hepatic encephalopathy.'],
    },
  ],
};
