// Presenter talk: choosing the treatment (Advanced), a capstone for the treatment talks. Five cases, one slide each: the case
// card brings the patient in and asks what to do, and the slide behind it plays the choice the guidelines make (Baveno VIII;
// AASLD 2024, and Baveno VIII for the vascular liver diseases: 9.5 to 9.10 and Fig. 5 for the portal vein clot, 8.31 to 8.34 for Budd–Chiari syndrome). Four of the five are time-lapses, so the case card covers the patient
// at the time-lapse's start and the days play after it lifts. The slide fields are described at the top of decks.js.

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };

export const CHOOSE_TREATMENT = {
  id: 'choose-treatment', level: 'advanced', title: 'Choose the treatment', minutes: 12,
  objectives: [
    'Apply the pre-emptive TIPS criteria after a variceal bleed',
    'Choose between repeated paracentesis and TIPS for refractory ascites',
    'Anticoagulate a recent portal vein clot in cirrhosis, and know which clots need it',
    'Start anticoagulation in portal vein thrombosis and Budd–Chiari syndrome, and know what follows it',
  ],
  checks: [
    ['Child–Pugh B 8, variceal bleed controlled by bands, no active bleeding at endoscopy. Pre-emptive TIPS?', 'No. Child–Pugh B qualifies only with active bleeding at endoscopy (or an HVPG ≥20 mmHg). She gets carvedilol and repeat banding.'],
    ['A screening ultrasound in Child–Pugh A cirrhosis finds a new clot in over half of the main portal vein. Anticoagulate?', 'Yes, once tumor invasion is ruled out (Baveno VIII 9.19). Variceal prophylaxis goes on beside it and must not delay it.'],
    ['How long does anticoagulation continue after a recent portal vein clot without cirrhosis?', '≥6 months, and longer when a lasting prothrombotic cause is found.'],
    ['In Budd–Chiari syndrome, what follows anticoagulation when the ascites does not respond?', 'Angioplasty of a short stenosis if there is one, then a TIPS (often a DIPS straight to the IVC), then transplant.'],
  ],
  sections: [['Bleeding', ['Bleeding']], ['Ascites', ['Ascites']], ['Clots', ['Clots']], ['Outflow', ['Outflow']]],
  summary: 'Five cases, one slide each: a variceal bleed, refractory ascites, a portal vein clot in cirrhosis, a recent portal vein clot without it and Budd–Chiari syndrome, each with the choice the guidelines make and why.',
  slides: [
    {
      id: 'a1', preset: 'cirr-decomp', action: BAND, params: CARV, cam: 'liver', labels: ['CONF', 'VAR'], data: 'tiles',
      vignette: 'A 61-year-old woman with alcohol-associated cirrhosis vomited blood yesterday. One band stopped it, with no active bleeding at endoscopy. She is Child–Pugh B 8.',
      caseQ: 'Does she meet the criteria for a pre-emptive TIPS?',
      tool: { kind: 'criteria', title: 'Pre-emptive TIPS', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31',
        rows: [{ text: 'Child–Pugh C', cut: 'C 10–13', note: 'not C' }, { text: 'Child–Pugh B, bleeding at endoscopy', cut: 'B 8–9', note: 'B 8, not bleeding', met: false, lit: true },
          { text: 'HVPG, where measured', cut: '≥20 mmHg', note: 'not given' }],
        verdict: 'She does not qualify: carvedilol and bands.' }, tiles: ['ppg', 'hr'], key: ['ppg'],
      kicker: 'Bleeding', site: 'sin', title: 'Carvedilol and bands, not a pre-emptive TIPS',
      line: 'Child–Pugh B 8 without active bleeding at endoscopy misses the criteria. She starts carvedilol, which lowers the PPG to {ppg}, with banding every 2 to 4 weeks.',
      notes: 'A pre-emptive TIPS, placed within 72 hours and ideally within 24, lowers rebleeding and death only in the highest-risk patients. Everyone else gets secondary prophylaxis: a non-selective beta-blocker, carvedilol preferred, with banding until the varices are gone. A TIPS follows if she bleeds again despite both. The Preventing the next bleed talk follows this plan step by step. Both options lower the pressure, the TIPS much more, at the cost of the liver\'s portal flow; the question is which she qualifies for. (Baveno VIII 4.8, 5.31.)',
      ask: ['Name the three criteria for a pre-emptive TIPS.', 'Child–Pugh C 10 to 13; Child–Pugh B >7 with active bleeding at endoscopy; an HVPG ≥20 mmHg.'],
    },
    {
      // (He starts as the ascites and kidney talks build him: diuretics off, 200 days, 5.2 L. The TIPS goes in on the first day of the lapse: a ramp from 0 to 1 on tips.on is on from day 1.)
      id: 'a2', preset: 'cirr-decomp', params: { diuretics: false, albumin: 2.5 }, relax: 200, days: 28, ramp: { 'tips.on': [0, 1] }, lapse: { seconds: 7, from: 'Before the stent', to: 'Four weeks later' }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, tool: { kind: 'fluid', window: true }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      vignette: 'A 57-year-old man with MASH cirrhosis needs a 5 L paracentesis every two weeks despite full-dose diuretics. His bilirubin is 1.8 mg/dL and he has no encephalopathy.',
      caseQ: 'What stops ascites that keeps coming back?',
      kicker: 'Ascites', site: 'sin', title: 'TIPS for recurrent ascites',
      line: 'He has no encephalopathy and a low bilirubin, so he gets a TIPS. Over four weeks the ascites falls to {asc} and sinusoidal flow to {liver} of normal.',
      notes: 'Refractory ascites returns within four weeks despite the highest diuretic doses and a low-salt diet, or the diuretics cannot be given. Large-volume paracentesis with albumin, 6 to 8 g for each liter drained, treats it but must be repeated, because the fluid comes from the sinusoids and only a lower sinusoidal pressure stops it at its source. Baveno VIII: patients with recurrent or refractory ascites should be considered for a TIPS, discussed together with liver transplant. The stent may be dilated to the smallest diameter that controls the ascites, to lower the risk of encephalopathy and heart failure. Past encephalopathy, a high bilirubin, heart failure or pulmonary hypertension weigh against a TIPS. (Baveno VIII 6.3 to 6.5.)',
      ask: ['What lowers the risk of encephalopathy after a TIPS for ascites?', 'The smallest stent diameter that controls the ascites (6.5), and rifaximin, which Baveno VIII says to consider before every elective TIPS (6.16, strong). Past encephalopathy is reviewed first, but it does not by itself rule a TIPS out (6.14, 6.15).'],
    },
    {
      // (A recent clot in cirrhosis, found on the 6-monthly scan: the commoner portal vein clot in clinic. The clot is partial, over half the
      // trunk; the start is the preset with the clot, and anticoagulation lyses it over the days, as the model always does.)
      id: 'a3', preset: 'csph', params: { drugs: { carvedilol: true }, thrombus: { PV_TRUNK: 0.6 }, anticoag: true }, days: 180, lapse: { seconds: 8, from: 'Anticoagulation starts', to: '6 months later' }, cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'lumen' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      vignette: 'A 62-year-old man with MASH cirrhosis and CSPH, Child–Pugh A 6, takes carvedilol. His 6-monthly ultrasound shows no tumor but a new clot filling over half the portal vein. He has no pain.',
      caseQ: 'Does this clot need treatment?',
      kicker: 'Clots', site: 'pre', title: 'A recent portal vein clot in cirrhosis: anticoagulate',
      line: 'In cirrhosis, a recent clot filling over half of the main portal vein is anticoagulated. Six months on, the vein is open: portal flow is {pvFlow}, the PPG {ppg}.',
      notes: 'Portal vein thrombosis is far commoner in cirrhosis than without it; Baveno VIII advises looking for it at each 6-monthly liver cancer scan (9.16). Contrast-enhanced imaging first rules out tumor invasion, which enhances in the arterial phase and expands the vein (9.17). Anticoagulation should be considered for a recent clot that is complete or leaves under half of the main portal vein open, for a clot that causes symptoms, and for a non-tumoral clot with liver cancer (9.19); it is recommended in any potential transplant candidate with a clot (9.18). Started early, the vein reopens far more often than without treatment. Low-molecular-weight heparin, a vitamin K antagonist or a direct oral anticoagulant may be used; a direct oral anticoagulant is safe in Child–Pugh A, used with caution in B and not in C (9.23, 9.24). Banding can be done without stopping heparin or a vitamin K antagonist (8.11). It continues until the transplant in a candidate, and otherwise for at least 6 months, with long-term use considered whether or not the vein reopens (9.20). Here the clot raised the PPG well above an HVPG that barely moved, because it lies before the sinusoids. In the model the clot always dissolves; in patients it does not always.',
      ask: ['Which portal vein clots in cirrhosis are anticoagulated?', 'Any clot in a transplant candidate; otherwise a recent clot that is complete or leaves under half of the main vein open, a symptomatic clot, or a non-tumoral clot with liver cancer.'],
    },
    {
      id: 'a4', preset: 'pvt-acute', params: { anticoag: true }, days: 180, lapse: { seconds: 8, from: 'Anticoagulation starts', to: '6 months later' }, cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'lumen' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      vignette: 'A 39-year-old woman with homozygous factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. CT shows a fresh clot in the portal vein. Her liver is normal.',
      caseQ: 'What treatment reopens the vein?',
      kicker: 'Clots', site: 'pre', title: 'Anticoagulate at once, for ≥6 months',
      line: 'The earlier anticoagulation starts, the likelier the vein reopens; here it does. Six months on, portal flow is back to {pvFlow} and the PPG is {ppg}.',
      notes: 'A recent portal vein clot without cirrhosis threatens the bowel, through spreading clot in the mesenteric veins, and the liver\'s portal supply. The OCP is stopped. Baveno VIII advises a workup for permanent and reversible risk factors, because several often coexist (9.5). A recent clot rarely clears on its own and the vein reopens more often the earlier anticoagulation starts, so it starts at diagnosis at a therapeutic dose (9.6) and continues for at least 6 months (9.8). When the clot reaches the SMV the bowel is assessed for ischemia (9.7); endovascular treatment is considered, in experienced centers, only if ischemia persists or worsens after 24 to 48 hours of anticoagulation (9.14). Neither thrombolysis nor a TIPS comes first. Her factor V Leiden is homozygous, a permanent major risk factor, so anticoagulation then continues long term at a therapeutic dose (9.10a, Fig. 5); the next slide shows the chart. In the model the clot always dissolves on anticoagulation; in patients the vein reopens in only some. (Baveno VIII 9.5 to 9.10, 9.14.)',
      ask: ['How long is anticoagulation given after a recent portal vein clot?', '≥6 months (Baveno VIII 9.8), and long term when a permanent major risk factor is found (9.10).'],
    },
    {
      // (Fig. 5 of Baveno VIII, lit for the same woman as the slide before: a reversible factor (the OCP) and a permanent major one (homozygous factor V Leiden).
      // Case facts. The figure and the card stay as on the slide before; tool-path.js.)
      id: 'a4-grid', cam: 'portal', labels: ['CONF', 'SMV'],
      tool: { kind: 'path', of: 'pvtgrid', short: 'Long-term grid', patient: { r: 'yes', c: 'maj' } },
      kicker: 'Clots', site: 'pre', title: 'A permanent major factor means long-term anticoagulation',
      line: 'Her OCP was a reversible factor, but homozygous factor V Leiden is a permanent, major one. In that column the answer is full-dose anticoagulation, long term.',
      notes: 'Source: Baveno VIII Fig. 5, 9.5, 9.10. For a portal vein clot without cirrhosis, two questions place the patient in one cell: was the clot provoked, by a reversible risk factor in the last 3 months, and is there a permanent risk factor, and if so is it major? A permanent major factor, such as a homozygous or combined thrombophilia or a myeloproliferative neoplasm, calls for long-term anticoagulation at a therapeutic dose (9.10a, strong). Isolated heterozygous factor V Leiden is a permanent factor that is not major (supplement Table S4); with a removed trigger the cell reads: a lower-dose DOAC can be considered (9.10b, weak). Her homozygous genotype puts her in the red cell.',
      ask: ['The same woman had isolated heterozygous factor V Leiden instead. What does Fig. 5 offer?', 'A permanent factor that is not major, with the OCP removed: a lower-dose DOAC can be considered for the long term (weak recommendation).'],
    },
    {
      id: 'a5', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, lapse: { seconds: 8, from: 'DIPS placed', to: '2 months later' }, cam: 'dips', labels: ['RHV', 'IVCS', 'RA'], mark: { edges: ['DIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['asc'],
      vignette: 'A 35-year-old woman with polycythemia vera has had Budd–Chiari syndrome for 2 months. Her ascites stays tense on anticoagulation and diuretics, and venography found no short stenosis.',
      caseQ: 'Which shunt decompresses her liver?',
      kicker: 'Outflow', site: 'post', title: 'A shunt straight to the IVC',
      line: 'With the hepatic veins clotted, the shunt runs from the portal vein straight to the IVC. Two months on, the PPG is {ppg} and the ascites {asc}.',
      notes: 'Treatment of Budd–Chiari syndrome is stepwise (Baveno VIII 8.31): anticoagulation for everyone, started as soon as possible and continued long term, including after a transplant (8.32); angioplasty or a stent for a stenosis that suits it, which is looked for actively (8.33); a TIPS when medical treatment is not enough and recanalization is not possible or has failed (8.34); and transplant. Here the first two steps are done or not possible. With the hepatic veins clotted, a standard TIPS has no vein to start from, so the stent runs from the IVC through the caudate lobe to the portal vein: a direct intrahepatic portosystemic shunt, DIPS. The model leaves the anticoagulant off here, so the change is the shunt\'s alone. (Baveno VIII 8.31 to 8.34.)',
      ask: ['Why is a DIPS often needed in Budd–Chiari syndrome?', 'The hepatic veins are clotted, so a standard TIPS has no vein to drain into; the DIPS drains straight into the IVC.'],
    },
    {
      // (The relation chart before the summary: each patient before treatment as a ring, after it as the dot, on the HVPG against
      // PPG plane. The portal vein clot in cirrhosis starts from its own ring: the same man with the clot, before anticoagulation.)
      id: 'relation', cam: 'fit', visual: 'plane', plane: 'hvpg-ppg',
      of: [{ id: 'a1', from: { preset: 'cirr-decomp' }, name: 'Carvedilol and bands', short: 'Carvedilol' }, { id: 'a2', from: { preset: 'cirr-decomp', params: { diuretics: false, albumin: 2.5 }, relax: 200 }, name: 'TIPS' },
        { id: 'a3', from: { preset: 'csph', params: { drugs: { carvedilol: true }, thrombus: { PV_TRUNK: 0.6 } } }, name: 'Anticoagulation, cirrhosis', short: 'Anticoag., cirrhosis' },
        { id: 'a4', from: { preset: 'pvt-acute' }, name: 'Anticoagulation', short: 'Anticoag.' }, { id: 'a5', from: { preset: 'budd-chiari' }, name: 'DIPS' }],
      kicker: 'Summary', title: 'What each treatment does to the two gradients',
      line: 'Each ring is a patient before treatment and its dot after. Carvedilol and a TIPS lower both gradients. Anticoagulation and a DIPS lower the PPG alone.',
      notes: 'The HVPG runs across and the PPG up, with the app\'s cut-offs (HVPG 5 and 10, PPG 6 and 12 mmHg). The HVPG 10 line marks clinically significant portal hypertension (CSPH: an HVPG of 10 mmHg or more, Baveno VIII and AASLD 2024), and an HVPG to its right is CSPH, whatever the PPG. The PPG 12 line marks the risk of bleeding, and a TIPS aims under it; it is not a CSPH cut-off. The two cirrhosis patients start from rings of their own, the man with tense ascites a little higher. Carvedilol lowers the inflow, so both gradients fall a little; the TIPS opens a channel beside the sinusoids and takes both down much further. The two portal vein clots and Budd–Chiari start high on the PPG for their HVPG, and their treatments bring the PPG down with the HVPG barely moving; in cirrhosis the clot sits on top of a sinusoidal HVPG, so the HVPG alone would miss the pressure it adds. In Budd–Chiari the hepatic veins cannot be wedged, so its HVPG is a number the model gives and no catheter takes. (AASLD 2024 Table 1; Baveno VIII 6.3, TIPS for recurrent ascites, and 9.19, anticoagulation for portal vein thrombosis.)',
      ask: ['A patient with a portal vein clot starts anticoagulation. Which gradient shows whether it worked?', 'The PPG. The HVPG is normal before and after, because the clot lies before the sinusoids.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'asc', 'liver'], asc: false, note: 'Choice', rowHead: 'Case', focusRow: 'a4',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'None', ref: true },
        { id: 'a1', kicker: 'Bleeding', title: 'Bleed, Child–Pugh B 8', note: 'Carvedilol and bands' }, { id: 'a2', kicker: 'Ascites', title: 'Refractory ascites', note: 'TIPS' },
        { id: 'a3', kicker: 'Clots', title: 'Portal vein clot, cirrhosis', note: 'Anticoagulation' }, { id: 'a4', kicker: 'Clots', title: 'Portal vein clot, no cirrhosis', note: 'Anticoagulation' },
        { id: 'a5', kicker: 'Outflow', title: 'Budd–Chiari', note: 'DIPS' }],
      kicker: 'Summary', title: 'Match the treatment to where the pressure is',
      line: 'The right choice follows the case: the criteria after a bleed, the source of the fluid, which side of the clot carries the pressure, and where a shunt can drain.',
      notes: 'Each row shows the case after its treatment. Each choice treats the place where the pressure builds. A TIPS cannot drain into a clotted hepatic vein; a DIPS reaches the IVC instead. A clot before the liver is treated by reopening the vein, with or without cirrhosis.',
      ask: ['Two patients have a recent portal vein clot, one with cirrhosis. What is the same, and what differs?', 'Both are anticoagulated early. In cirrhosis tumor thrombus is ruled out first, and variceal prophylaxis goes on beside it.'],
    },
  ],
};
