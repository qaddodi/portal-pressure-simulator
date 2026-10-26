// Presenter talk: choosing the treatment (Advanced), a capstone for the treatment talks. Five cases, one slide each: the case
// card brings the patient in and asks what to do, and the slide behind it plays the choice the guidelines make (Baveno VIII;
// AASLD 2024; EASL 2025 for the vascular liver diseases). Four of the five are time-lapses, so the case card covers the patient
// at the time-lapse's start and the days play after it lifts. The slide fields are described at the top of decks.js.

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };

export const CHOOSE_TREATMENT = {
  id: 'choose-treatment', level: 'advanced', title: 'Choose the treatment', minutes: 12,
  objectives: [
    'Apply the pre-emptive TIPS criteria after a variceal bleed',
    'Choose between repeated paracentesis and TIPS for refractory ascites',
    'Explain why a TIPS does not help bleeding from splenic vein thrombosis',
    'Start anticoagulation in portal vein thrombosis and Budd–Chiari syndrome, and know what follows it',
  ],
  checks: [
    ['Child–Pugh B 8, variceal bleed controlled by bands, no active bleeding at endoscopy. Pre-emptive TIPS?', 'No. Child–Pugh B qualifies only with active bleeding at endoscopy (or an HVPG ≥20 mmHg). She gets carvedilol and repeat banding.'],
    ['Fundal varices bleed with a normal PPG and a clotted splenic vein. Why not a TIPS?', 'The portal pressure is normal; the high pressure is on the splenic side. Splenectomy, splenic vein stenting or splenic artery embolization treats it.'],
    ['How long does anticoagulation continue after a recent portal vein clot without cirrhosis?', '≥6 months, and longer when a lasting prothrombotic cause is found.'],
    ['In Budd–Chiari syndrome, what follows anticoagulation when the ascites does not respond?', 'Angioplasty of a short stenosis if there is one, then a TIPS (often a DIPS straight to the IVC), then transplant.'],
  ],
  sections: [['Bleeding', ['Bleeding']], ['Ascites', ['Ascites']], ['Clots', ['Clots']], ['Outflow', ['Outflow']]],
  summary: 'Five cases, one slide each: a variceal bleed, refractory ascites, splenic vein thrombosis, a recent portal vein clot and Budd–Chiari syndrome, each with the choice the guidelines make and why.',
  slides: [
    {
      id: 'a1', clock: { at: 24, label: 'TIPS by 72 h' }, preset: 'cirr-decomp', action: BAND, params: CARV, cam: 'liver', labels: ['CONF', 'VAR'], data: 'tiles',
      vignette: 'A 61-year-old woman with alcohol-associated cirrhosis vomited blood yesterday. One band stopped it, with no active bleeding at endoscopy. She is Child–Pugh B 8.',
      caseQ: 'Does she meet the criteria for a pre-emptive TIPS?',
      tool: { kind: 'criteria', title: 'Pre-emptive TIPS', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31',
        rows: [{ text: 'Child–Pugh C, **10 to 13** points', cut: 'C 10–13', note: 'not C' }, { text: 'Child–Pugh B, **>7**, with active bleeding at endoscopy', cut: 'B 8–9', note: 'B 8, not bleeding', met: false, lit: true },
          { text: 'HVPG **≥20 mmHg**', cut: '≥20 mmHg', note: 'not given' }],
        verdict: 'She does not qualify: carvedilol and bands.' }, tiles: ['ppg', 'hr'], key: ['ppg'],
      kicker: 'Bleeding', site: 'sin', title: 'Carvedilol and bands, not a pre-emptive TIPS',
      line: 'Child–Pugh B 8 without active bleeding at endoscopy misses the criteria. She starts carvedilol, which lowers the PPG to {ppg}, with banding every 2 to 4 weeks.',
      notes: 'A pre-emptive TIPS, placed within 72 hours and ideally within 24, lowers rebleeding and death only in the highest-risk patients. Everyone else gets secondary prophylaxis: a non-selective beta-blocker, carvedilol preferred, with banding until the varices are gone. A TIPS follows if she bleeds again despite both. The Preventing the next bleed talk follows this plan step by step. Both options lower the pressure, the TIPS much more, at the cost of the liver\'s portal flow; the question is which she qualifies for. (Baveno VIII 4.8, 5.31.)',
      ask: ['Name the three criteria for a pre-emptive TIPS.', 'Child–Pugh C 10 to 13; Child–Pugh B >7 with active bleeding at endoscopy; an HVPG ≥20 mmHg.'],
    },
    {
      id: 'a2', preset: 'cirr-decomp', params: { diuretics: true, tips: { on: true } }, days: 28, lapse: { seconds: 7 }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, tool: { kind: 'fluid', window: true }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      vignette: 'A 57-year-old man with MASH cirrhosis needs a 6 L paracentesis every two weeks despite full-dose diuretics. His bilirubin is 1.8 mg/dL and he has no encephalopathy.',
      caseQ: 'What stops ascites that keeps coming back?',
      kicker: 'Ascites', site: 'sin', title: 'TIPS for recurrent ascites',
      line: 'He has no encephalopathy and a low bilirubin, so he gets a TIPS. Four weeks on the ascites is {asc}, but the liver gets {liver} of its normal flow.',
      notes: 'Refractory ascites returns within four weeks despite the highest diuretic doses and a low-salt diet, or the diuretics cannot be given. Large-volume paracentesis with albumin, 6 to 8 g for each liter drained, treats it but must be repeated, because the fluid comes from the sinusoids and only a lower sinusoidal pressure stops it at its source. Baveno VIII: patients with recurrent or refractory ascites should be considered for a TIPS, discussed together with liver transplant. The stent may be dilated to the smallest diameter that controls the ascites, to lower the risk of encephalopathy and heart failure. Past encephalopathy, a high bilirubin, heart failure or pulmonary hypertension weigh against a TIPS. (Baveno VIII 6.3 to 6.5.)',
      ask: ['What lowers the risk of encephalopathy after a TIPS for ascites?', 'The smallest stent diameter that controls the ascites, rifaximin in selected patients, and choosing patients without past encephalopathy.'],
    },
    {
      id: 'a3', preset: 'svt', params: { splenicRx: 2 }, days: 30, lapse: { seconds: 7, from: 'Before surgery', to: 'A month after splenectomy' }, cam: 'splenic', lens: 'heat', labels: ['SV', 'GV', 'CONF'], data: 'tiles', tiles: ['gv', 'plt'], key: ['gv'],
      vignette: 'A 49-year-old man had necrotizing pancreatitis last year and now bleeds from fundal varices. His liver tests are normal and his spleen is large.',
      caseQ: 'What stops his fundal varices?',
      kicker: 'Clots', site: 'pre', title: 'Splenectomy, not a TIPS',
      line: 'Colored by congestion, the high pressure sits on the splenic side. A month after splenectomy the fundal varices are {gv} and the platelets {plt}.',
      notes: 'Pancreatitis is the commonest cause of an isolated splenic vein clot. The spleen drains through the short gastric veins into the fundus, so fundal varices form with a normal portal pressure: left-sided, or sinistral, portal hypertension. A TIPS lowers a portal pressure that was never high. AASLD 2024: patients with bleeding gastric varices from isolated splenic vein thrombosis should be evaluated for splenectomy, splenic vein stenting or splenic artery embolization. Each one cuts the splenic outflow into the fundus, and the congestion lens shows it leaving the splenic side. Carvedilol lowers the splenic inflow only partly. (AASLD 2024 statement 47.)',
      ask: ['Which treatments fit bleeding fundal varices from an isolated splenic vein clot?', 'Splenectomy, splenic vein stenting or splenic artery embolization.'],
    },
    {
      id: 'a4', preset: 'pvt-acute', params: { anticoag: true }, days: 180, lapse: { seconds: 8, from: 'Anticoagulation starts', to: '6 months later' }, cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'lumen' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      vignette: 'A 39-year-old woman with factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. CT shows a fresh clot in the portal vein. Her liver is normal.',
      caseQ: 'What treatment reopens the vein?',
      kicker: 'Clots', site: 'pre', title: 'Anticoagulate at once, for ≥6 months',
      line: 'Anticoagulation starts at once. Six months on the portal vein has reopened, portal flow is back to {pvFlow} and the PPG is {ppg}.',
      notes: 'A recent portal vein clot without cirrhosis threatens the bowel, through spreading clot in the mesenteric veins, and the liver\'s portal supply. The OCP is stopped. EASL 2025: anticoagulation starts as soon as possible, because early treatment lowers the risk of bowel ischemia and raises the chance that the vein reopens, and it continues for at least 6 months. Thrombolysis and endovascular treatment are kept, in expert centers, for signs of intestinal ischemia that do not improve early on anticoagulation. Neither thrombolysis nor a TIPS comes first. A lasting prothrombotic cause, such as a myeloproliferative neoplasm, calls for long-term anticoagulation. In the model the clot always dissolves on anticoagulation; in patients the vein reopens in only some. (EASL 2025, recent portal vein thrombosis.)',
      ask: ['How long is anticoagulation given after a recent portal vein clot?', '≥6 months, and long term when a lasting prothrombotic cause is found.'],
    },
    {
      id: 'a5', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, lapse: { seconds: 8, from: 'DIPS placed', to: '2 months later' }, cam: 'dips', labels: ['RHV', 'IVCS', 'RA'], mark: { edges: ['DIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['asc'],
      vignette: 'A 35-year-old woman with polycythemia vera has had Budd–Chiari syndrome for 2 months. Her ascites stays tense on anticoagulation and diuretics, and venography found no short stenosis.',
      caseQ: 'Which shunt decompresses her liver?',
      kicker: 'Outflow', site: 'post', title: 'A shunt straight to the IVC',
      line: 'With the hepatic veins clotted, the shunt runs from the portal vein straight to the IVC. Two months on, the PPG is {ppg} and the ascites {asc}.',
      notes: 'Treatment of Budd–Chiari syndrome is stepwise: anticoagulation for everyone, angioplasty or a stent for a short stenosis, a shunt when the patient does not respond, and transplant when the shunt fails or the liver fails acutely. Here the first two steps are done or not possible. EASL 2025: the shunt is made through a hepatic vein stump or directly through the IVC wall (a direct intrahepatic portosystemic shunt, DIPS), in an experienced centre. Shunt dysfunction is common but can usually be treated by angioplasty. Anticoagulation continues for life unless there is a major contraindication; the model leaves the anticoagulant off here, so the change is the shunt\'s alone. (EASL 2025, Budd–Chiari syndrome.)',
      ask: ['Why is a DIPS often needed in Budd–Chiari syndrome?', 'The hepatic veins are clotted, so a standard TIPS has no vein to drain into; the DIPS drains straight into the IVC.'],
    },
    {
      // (The relation chart before the summary: each patient before treatment as a ring, after it as the dot, on the HVPG against
      // PPG plane. The splenic vein clot is left off: both gradients are normal before and after, its pressure beyond either.)
      id: 'relation', cam: 'fit', visual: 'plane', plane: 'hvpg-ppg',
      of: [{ id: 'a1', from: { preset: 'cirr-decomp' }, name: 'Carvedilol and bands', short: 'Carvedilol' }, { id: 'a2', from: { preset: 'cirr-decomp' }, name: 'TIPS' },
        { id: 'a4', from: { preset: 'pvt-acute' }, name: 'Anticoagulation', short: 'Anticoag.' }, { id: 'a5', from: { preset: 'budd-chiari' }, name: 'DIPS' }],
      kicker: 'Summary', title: 'What each treatment does to the two gradients',
      line: 'Each ring is a patient before treatment and its dot after. Carvedilol and a TIPS lower both gradients. Anticoagulation and a DIPS lower the PPG alone.',
      notes: 'The HVPG runs across and the PPG up, with the app\'s cut-offs (HVPG 5 and 10, PPG 6 and 12 mmHg). The HVPG 10 line marks clinically significant portal hypertension (CSPH: an HVPG of 10 mmHg or more, Baveno VIII and AASLD 2024), and the corner beyond both lines is named for it. The PPG 12 line marks the risk of bleeding, and a TIPS aims under it; it is not a CSPH cut-off. The two cirrhosis patients start from the same ring. Carvedilol lowers the inflow, so both gradients fall a little; the TIPS opens a channel beside the sinusoids and takes both down much further. The portal vein clot and Budd–Chiari start high on the PPG with a low HVPG, and their treatments bring the PPG down without moving the HVPG. In Budd–Chiari the hepatic veins cannot be wedged, so its HVPG is a number the model gives and no catheter takes. The splenic vein clot is not on the plane: its pressure sits in the splenic vein, and both gradients stay normal before and after the splenectomy. (AASLD 2024 Table 1; Baveno VIII 6.3, TIPS for recurrent ascites, and 9.19, anticoagulation for portal vein thrombosis.)',
      ask: ['A patient with a portal vein clot starts anticoagulation. Which gradient shows whether it worked?', 'The PPG. The HVPG is normal before and after, because the clot lies before the sinusoids.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'asc', 'liver'], asc: false, note: 'Choice', rowHead: 'Case',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'None', ref: true },
        { id: 'a1', kicker: 'Bleeding', title: 'Bleed, Child–Pugh B 8', note: 'Carvedilol and bands' }, { id: 'a2', kicker: 'Ascites', title: 'Refractory ascites', note: 'TIPS' },
        { id: 'a3', kicker: 'Clots', title: 'Splenic vein clot', note: 'Splenectomy' }, { id: 'a4', kicker: 'Clots', title: 'Portal vein clot', note: 'Anticoagulation' },
        { id: 'a5', kicker: 'Outflow', title: 'Budd–Chiari', note: 'DIPS' }],
      kicker: 'Summary', title: 'Match the treatment to where the pressure is',
      line: 'The right choice follows the case: the criteria after a bleed, the source of the fluid, which side of the clot carries the pressure, and where a shunt can drain.',
      notes: 'Each row shows the case after its treatment. Each choice treats the place where the pressure builds. A TIPS that drains a normal portal vein, or into a clotted hepatic vein, lowers nothing; a splenectomy or a DIPS reaches the right place.',
      ask: ['Which two cases show a TIPS that would not help, and why?', 'Splenic vein thrombosis, where the portal pressure is normal, and Budd–Chiari syndrome, where the hepatic veins it would drain into are clotted.'],
    },
  ],
};
