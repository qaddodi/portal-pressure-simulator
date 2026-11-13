// Presenter talk: choosing the treatment (Advanced), a capstone for the treatment talks. Five cases, one slide each: the case
// card brings the patient in and asks what to do, and the slide behind it plays the choice the guidelines make (Baveno VIII;
// AASLD 2024, and Baveno VIII for the vascular liver diseases: 9.5 to 9.10 and Fig. 5 for the portal vein clot, 8.31 to 8.34 for Budd–Chiari syndrome). Four of the five are time-lapses, so the case card covers the patient
// at the time-lapse's start and the days play after it lifts. The slide fields are described at the top of decks.js.

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };

export const CHOOSE_TREATMENT = {
  id: 'choose-treatment', level: 'advanced', title: 'Choose the treatment', minutes: 12,
  objectives: [
    'Apply the preemptive TIPS criteria after a variceal bleed',
    'Choose between repeated paracentesis and TIPS for refractory ascites',
    'Anticoagulate recent portal vein thrombosis (PVT) in cirrhosis, and know which PVT needs it',
    'Start anticoagulation in portal vein thrombosis and Budd–Chiari syndrome, and know what follows it',
  ],
  checks: [
    ['Child–Pugh B 8, variceal bleeding controlled by banding, no active bleeding at endoscopy. Preemptive TIPS?', 'No. Child–Pugh B qualifies only with active bleeding at endoscopy (or an HVPG ≥20 mmHg). She receives carvedilol and repeat banding.'],
    ['A surveillance ultrasound in Child–Pugh A cirrhosis finds new thrombus occluding >50% of the main portal vein. Anticoagulate?', 'Yes, once tumor invasion is excluded (Baveno VIII 9.19). Variceal prophylaxis proceeds alongside and must not delay it.'],
    ['How long does anticoagulation continue after recent PVT without cirrhosis?', '≥6 months, and longer when a permanent prothrombotic risk factor is found.'],
    ['In Budd–Chiari syndrome, what follows anticoagulation when the ascites does not respond?', 'Angioplasty of a short-segment stenosis if present, then TIPS (often a DIPS directly to the IVC), then liver transplant.'],
  ],
  sections: [['Bleeding', ['Bleeding']], ['Ascites', ['Ascites']], ['Thrombosis', ['Thrombosis']], ['Outflow', ['Outflow']]],
  summary: 'Five cases, one slide each: a variceal bleed, refractory ascites, PVT in cirrhosis, recent PVT without cirrhosis and Budd–Chiari syndrome, each with the choice the guidelines make and why.',
  slides: [
    {
      id: 'a1', preset: 'cirr-decomp', action: BAND, params: CARV, cam: 'varices', labels: ['VAR'], data: 'tiles',
      vignette: 'A 61-year-old woman with alcohol-associated cirrhosis had hematemesis yesterday. EGD showed no active bleeding; EVL controlled it. She is Child–Pugh B 8.',
      caseQ: 'Does she meet the criteria for a preemptive TIPS?',
      tool: { kind: 'criteria', title: 'Preemptive TIPS', lead: 'Any one of these is enough.', rule: 'Baveno VIII 5.31',
        rows: [{ text: 'Child–Pugh C', cut: 'C 10–13', note: 'not C' }, { text: 'Child–Pugh B, active bleeding at endoscopy', cut: 'B 8–9', note: 'B 8, not bleeding', met: false, lit: true },
          { text: 'HVPG, where measured', cut: '≥20 mmHg', note: 'not given' }],
        verdict: 'She does not qualify: carvedilol and banding.' }, tiles: ['ppg', 'hr'], key: ['ppg'],
      kicker: 'Bleeding', site: 'sin', title: 'Carvedilol and banding, not a preemptive TIPS',
      line: 'Child–Pugh B 8 without active bleeding at endoscopy does not meet the criteria. She starts carvedilol, which lowers the PPG to {ppg}, with banding every 2 to 4 weeks.',
      notes: 'A preemptive TIPS, placed within 72 hours and ideally within 24, lowers rebleeding and death only in the highest-risk patients. All other patients receive secondary prophylaxis: a nonselective beta-blocker, carvedilol preferred, with banding until variceal eradication. TIPS follows if she rebleeds despite both. The Preventing the next bleed talk follows this plan step by step. Both options lower portal pressure, TIPS much more, at the cost of hepatic portal perfusion; the question is which she qualifies for. (Baveno VIII 4.8, 5.31.)',
      ask: ['Name the three criteria for a preemptive TIPS.', 'Child–Pugh C 10 to 13; Child–Pugh B >7 with active bleeding at endoscopy; an HVPG ≥20 mmHg.'],
    },
    {
      // (He starts as the ascites and kidney talks build him: diuretics off, 200 days, 5.2 L. The TIPS goes in on the first day of the lapse: a ramp from 0 to 1 on tips.on is on from day 1.)
      id: 'a2', preset: 'cirr-decomp', params: { diuretics: false, albumin: 2.5 }, relax: 200, days: 28, ramp: { 'tips.on': [0, 1] }, lapse: { seconds: 7, from: 'Before TIPS', to: 'Four weeks later' }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'liver'], keepTiles: true, title: 'Ascites and sinusoidal flow over four weeks' }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      vignette: 'A 57-year-old man with MASH cirrhosis needs a 5 L paracentesis every two weeks despite full-dose diuretics. His bilirubin is 1.8 mg/dL and he has no hepatic encephalopathy.',
      caseQ: 'What treatment controls his recurrent ascites?',
      kicker: 'Ascites', site: 'sin', title: 'TIPS for recurrent ascites',
      line: 'He has no hepatic encephalopathy and a low bilirubin, so he is a TIPS candidate. Over four weeks the ascites falls to {asc} and sinusoidal flow to {liver} of normal.',
      notes: 'Refractory ascites recurs within 4 weeks despite maximum diuretic doses and dietary sodium restriction, or diuretics cannot be tolerated. Large-volume paracentesis (LVP) with albumin, 6 to 8 g per liter removed, treats it but must be repeated, because the fluid comes from the sinusoids and only a lower sinusoidal pressure stops it at its source. Baveno VIII: patients with recurrent or refractory ascites should be considered for a TIPS, discussed together with liver transplant. The stent may be dilated to the smallest diameter that controls the ascites, to lower the risk of hepatic encephalopathy and heart failure. Prior hepatic encephalopathy, an elevated bilirubin, heart failure or pulmonary hypertension weigh against TIPS. (Baveno VIII 6.3 to 6.5.)',
      ask: ['What lowers the risk of encephalopathy after a TIPS for ascites?', 'The smallest stent diameter that controls the ascites (6.5), and rifaximin, which Baveno VIII says to consider before every elective TIPS (6.16, strong). Prior hepatic encephalopathy is reviewed first, but it does not by itself rule out TIPS (6.14, 6.15).'],
    },
    {
      id: 'a2-fluid', cam: 'liver', tool: { kind: 'fluid', window: true }, data: 'tiles', tiles: ['asc', 'liver'], key: ['asc'],
      kicker: 'Ascites', site: 'sin', title: 'After TIPS, lymphatic drainage keeps pace with lymph formation',
      line: 'With sinusoidal pressure lower, hepatic lymph formation falls below lymphatic drainage capacity. Almost no lymph leaks into the peritoneal cavity, so ascites stops accumulating.',
      notes: 'The same man as the slide before, four weeks after the TIPS. The fluid card divides hepatic lymph formation into lymphatic drainage and the net leak into the peritoneal cavity. After TIPS, lymph formation falls within lymphatic drainage capacity, so ascites no longer accumulates and repeat LVP is no longer needed. These are the model\'s own terms.',
      ask: ['Why does a TIPS stop the ascites from coming back?', 'It lowers sinusoidal pressure, so hepatic lymph formation falls below lymphatic drainage capacity.'],
    },
    {
      // (A recent clot in cirrhosis, found on the 6-monthly scan: the commoner portal vein clot in clinic. The clot is partial, over half the
      // trunk; the start is the preset with the clot, and anticoagulation lyses it over the days, as the model always does.)
      id: 'a3', preset: 'csph', params: { drugs: { carvedilol: true }, thrombus: { PV_TRUNK: 0.6 }, anticoag: true }, days: 180, lapse: { seconds: 8, from: 'Anticoagulation starts', to: '6 months later' }, cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'pvFlow'], keepTiles: true, title: 'PPG and portal flow over six months' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      vignette: 'A 62-year-old man with MASH cirrhosis (CSPH, Child–Pugh A 6) on carvedilol has new bland thrombus occluding >50% of the main portal vein on surveillance ultrasound. No abdominal pain.',
      caseQ: 'Does this thrombus need treatment?',
      kicker: 'Thrombosis', site: 'pre', title: 'Recent portal vein thrombosis in cirrhosis: anticoagulate',
      line: 'In cirrhosis, recent thrombosis occluding >50% of the main portal vein is anticoagulated. Six months later the vein has recanalized: portal flow is {pvFlow}, the PPG {ppg}.',
      notes: 'Portal vein thrombosis (PVT) is far more common in cirrhosis than without it; Baveno VIII advises looking for it at each 6-month HCC surveillance ultrasound (9.16). Contrast-enhanced imaging first excludes tumor invasion, which enhances in the arterial phase and expands the vein (9.17). Anticoagulation should be considered for recent PVT that is complete or occludes >50% of the main portal vein, for symptomatic PVT, and for non-tumoral PVT with HCC (9.19); it is recommended in any potential transplant candidate with PVT (9.18). Started early, anticoagulation achieves recanalization far more often than no treatment. Low-molecular-weight heparin, a vitamin K antagonist or a direct oral anticoagulant (DOAC) may be used; a DOAC is safe in Child–Pugh A, used with caution in B and not in C (9.23, 9.24). Banding can be done without stopping heparin or a vitamin K antagonist (8.11). Anticoagulation continues until transplant in a candidate, and otherwise for ≥6 months, with long-term use considered whether or not the vein recanalizes (9.20). Here the thrombus raised the PPG well above an HVPG that barely changed, because it lies upstream of the sinusoids. In the model the thrombus always resolves; in patients it does not always.',
      ask: ['Which PVT in cirrhosis is anticoagulated?', 'Any PVT in a transplant candidate; otherwise recent PVT that is complete or occludes >50% of the main portal vein, symptomatic PVT, or non-tumoral PVT with HCC.'],
    },
    {
      id: 'a3-lumen', cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'lumen' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      kicker: 'Thrombosis', site: 'pre', title: 'Six months later, the portal vein has recanalized',
      line: 'In cross-section, the thrombus that occluded >50% of the lumen has resolved.',
      notes: 'The same man as the slide before, six months after anticoagulation started. The card shows the main portal vein in cross-section.',
      ask: ['After six months of anticoagulation the vein has recanalized. Does anticoagulation stop?', 'Not on that basis alone. Continue for ≥6 months, and consider long-term use whether or not the vein recanalizes (Baveno VIII 9.20).'],
    },
    {
      id: 'a4', preset: 'pvt-acute', params: { anticoag: true }, days: 180, lapse: { seconds: 8, from: 'Anticoagulation starts', to: '6 months later' }, cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'pvFlow'], keepTiles: true, title: 'PPG and portal flow over six months' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      vignette: 'A 39-year-old woman with homozygous factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. CT shows acute portal vein thrombosis. She has no liver disease.',
      caseQ: 'What treatment recanalizes the vein?',
      kicker: 'Thrombosis', site: 'pre', title: 'Anticoagulate at once, for ≥6 months',
      line: 'The earlier anticoagulation starts, the likelier recanalization; here the vein recanalizes. Six months later, portal flow is back to {pvFlow} and the PPG is {ppg}.',
      notes: 'Recent PVT without cirrhosis threatens the bowel, through extension into the mesenteric veins, and hepatic portal perfusion. The OCP is stopped. Baveno VIII advises a workup for permanent and reversible risk factors, because several often coexist (9.5). Recent PVT rarely resolves spontaneously, and recanalization is more likely the earlier anticoagulation starts, so it starts at diagnosis at a therapeutic dose (9.6) and continues for ≥6 months (9.8). When the thrombus extends to the SMV, the bowel is assessed for ischemia (9.7); endovascular treatment is considered, in experienced centers, only if ischemia persists or worsens after 24 to 48 hours of anticoagulation (9.14). Neither thrombolysis nor TIPS is first-line. Her factor V Leiden is homozygous, a permanent major risk factor, so anticoagulation then continues long term at a therapeutic dose (9.10a, Fig. 5); the next slide shows the chart. In the model the thrombus always resolves on anticoagulation; in patients the vein recanalizes in only some. (Baveno VIII 9.5 to 9.10, 9.14.)',
      ask: ['How long is anticoagulation given after recent PVT?', '≥6 months (Baveno VIII 9.8), and long term when a permanent major risk factor is found (9.10).'],
    },
    {
      id: 'a4-lumen', cam: 'portal', labels: ['CONF', 'SMV'], tool: { kind: 'lumen' }, data: 'tiles', tiles: ['ppg', 'pvFlow'], key: ['ppg'],
      kicker: 'Thrombosis', site: 'pre', title: 'Six months later, the lumen is patent',
      line: 'In cross-section, the acute thrombus has resolved and the vein is fully patent.',
      notes: 'The same woman as the slide before, six months after anticoagulation started. The card shows the main portal vein in cross-section.',
      ask: ['Why is recanalization more frequent when anticoagulation starts early?', 'Recent PVT rarely resolves spontaneously, and recanalization is more frequent the earlier anticoagulation starts (Baveno VIII 9.6).'],
    },
    {
      // (Fig. 5 of Baveno VIII, lit for the same woman as the slide before: a reversible factor (the OCP) and a permanent major one (homozygous factor V Leiden).
      // Case facts. The figure and the card stay as on the slide before; tool-path.js.)
      id: 'a4-grid', cam: 'portal', labels: ['CONF', 'SMV'],
      tool: { kind: 'path', of: 'pvtgrid', short: 'Long-term grid', patient: { r: 'yes', c: 'maj' } },
      kicker: 'Thrombosis', site: 'pre', title: 'A permanent major factor means long-term anticoagulation',
      line: 'OCP use was a reversible risk factor, but homozygous factor V Leiden is a permanent major one. In that column the answer is long-term therapeutic-dose anticoagulation.',
      notes: 'Source: Baveno VIII Fig. 5, 9.5, 9.10. For PVT without cirrhosis, two questions place the patient in one cell: was the thrombosis provoked, by a reversible risk factor in the last 3 months, and is there a permanent risk factor, and if so is it major? A permanent major factor, such as a homozygous or combined thrombophilia or a myeloproliferative neoplasm, calls for long-term anticoagulation at a therapeutic dose (9.10a, strong). Isolated heterozygous factor V Leiden is a permanent factor that is not major (supplement Table S4); with the trigger removed the cell reads: a lower-dose DOAC can be considered (9.10b, weak). Her homozygous genotype puts her in the red cell.',
      ask: ['The same woman had isolated heterozygous factor V Leiden instead. What does Fig. 5 offer?', 'A permanent factor that is not major, with the OCP stopped: a lower-dose DOAC can be considered for the long term (weak recommendation).'],
    },
    {
      id: 'a5', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, lapse: { seconds: 8, from: 'DIPS placed', to: '2 months later' }, cam: 'dips', labels: ['RHV', 'IVCS', 'RA'], mark: { edges: ['DIPS'], label: 'Covered stent', kind: 'treat' }, tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'asc'], keepTiles: true, title: 'PPG and ascites over two months' }, data: 'tiles', tiles: ['ppg', 'asc'], key: ['asc'],
      vignette: 'A 35-year-old woman with polycythemia vera and Budd–Chiari syndrome for 2 months has tense ascites despite anticoagulation and diuretics; venography showed no short-segment stenosis.',
      caseQ: 'Which shunt decompresses her liver?',
      kicker: 'Outflow', site: 'post', title: 'A shunt directly to the IVC',
      line: 'With the hepatic veins thrombosed, the shunt runs from the portal vein directly to the IVC. Two months later, the PPG is {ppg} and the ascites {asc}.',
      notes: 'Treatment of Budd–Chiari syndrome is stepwise (Baveno VIII 8.31): anticoagulation for everyone, started as soon as possible and continued long term, including after a transplant (8.32); angioplasty or stenting of a suitable stenosis, which is actively sought (8.33); a TIPS when medical treatment is not enough and recanalization is not possible or has failed (8.34); and liver transplant. Here the first two steps are done or not possible. With the hepatic veins thrombosed, a standard TIPS has no vein to start from, so the stent runs from the IVC through the caudate lobe to the portal vein: a direct intrahepatic portosystemic shunt, DIPS. The model leaves the anticoagulant off here, so the change is due to the shunt alone. (Baveno VIII 8.31 to 8.34.)',
      ask: ['Why is a DIPS often needed in Budd–Chiari syndrome?', 'The hepatic veins are thrombosed, so a standard TIPS has no vein to drain into; the DIPS drains directly into the IVC.'],
    },
    {
      // (The treatment menu before the relation chart: one patient with bleeding and ascites, every treatment he could get run on him, the PPG each reaches against the sinusoidal flow
      // it costs. Mohammad, 8 Nov 2026: new-features recs C2.)
      id: 'menu', preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'menu' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      kicker: 'Summary', site: 'sin', title: 'Each treatment against the sinusoidal flow it costs',
      line: 'From {ppg}, the drugs preserve most sinusoidal flow, carvedilol lowering the PPG most. A TIPS or surgical shunt lowers it further but diverts the most flow.',
      notes: 'Each dot is this patient after one treatment, calculated by the model from the current state; the ring is his current state. Carvedilol lowers the gradient and preserves almost all sinusoidal flow, because it also lowers intrahepatic resistance. Propranolol lowers it less and reduces flow more. A TIPS and the surgical shunts lower it most and divert the most flow, so they are reserved for patients whom drugs and banding cannot control. Dot size increases with the fraction of portal blood that bypasses the liver.',
      ask: ['Why is carvedilol the first choice among the drugs here?', 'Of the drugs it lowers the PPG the most and preserves the most sinusoidal flow.'],
    },
    {
      // (The relation chart before the summary: each patient before treatment as a ring, after it as the dot, on the HVPG against
      // PPG plane. The portal vein clot in cirrhosis starts from its own ring: the same man with the clot, before anticoagulation.)
      id: 'relation', cam: 'fit', visual: 'plane', plane: 'hvpg-ppg',
      of: [{ id: 'a1', from: { preset: 'cirr-decomp' }, name: 'Carvedilol and bands', short: 'Carvedilol' }, { id: 'a2', from: { preset: 'cirr-decomp', params: { diuretics: false, albumin: 2.5 }, relax: 200 }, name: 'TIPS' },
        { id: 'a3', from: { preset: 'csph', params: { drugs: { carvedilol: true }, thrombus: { PV_TRUNK: 0.6 } } }, name: 'Anticoagulation, cirrhosis', short: 'Anticoag., cirrhosis' },
        { id: 'a4', from: { preset: 'pvt-acute' }, name: 'Anticoagulation', short: 'Anticoag.' }, { id: 'a5', from: { preset: 'budd-chiari' }, name: 'DIPS' }],
      kicker: 'Summary', title: 'What each treatment does to the two gradients',
      line: 'Each ring is a patient before treatment and each dot the same patient after. Carvedilol and a TIPS lower both gradients. Anticoagulation and a DIPS lower the PPG alone.',
      notes: 'The HVPG runs across and the PPG up, with the app\'s cut-offs (HVPG 5 and 10, PPG 6 and 12 mmHg). The HVPG 10 line marks clinically significant portal hypertension (CSPH: an HVPG of 10 mmHg or more, Baveno VIII and AASLD 2024), and an HVPG to its right is CSPH, whatever the PPG. The PPG 12 line marks the risk of bleeding, and a TIPS aims under it; it is not a CSPH cut-off. The two patients with cirrhosis start from their own rings, the man with tense ascites slightly higher. Carvedilol lowers inflow, so both gradients fall a little; the TIPS creates a channel that bypasses the sinusoids and lowers both much further. The two patients with PVT and the patient with Budd–Chiari syndrome start with a high PPG for their HVPG, and treatment lowers the PPG while the HVPG barely changes; in cirrhosis the thrombus adds to a sinusoidal HVPG, so the HVPG alone would miss the pressure it adds. In Budd–Chiari syndrome the hepatic veins cannot be wedged, so the HVPG shown is the model\'s value and cannot be measured by catheter. (AASLD 2024 Table 1; Baveno VIII 6.3, TIPS for recurrent ascites, and 9.19, anticoagulation for portal vein thrombosis.)',
      ask: ['A patient with PVT starts anticoagulation. Which gradient shows whether it worked?', 'The PPG. The HVPG is normal before and after, because the thrombus lies upstream of the sinusoids.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'asc', 'liver'], asc: false, note: 'Choice', rowHead: 'Case', focusRow: 'a4',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'None', ref: true },
        { id: 'a1', kicker: 'Bleeding', title: 'Variceal bleed, Child–Pugh B 8', note: 'Carvedilol and banding' }, { id: 'a2', kicker: 'Ascites', title: 'Refractory ascites', note: 'TIPS' },
        { id: 'a3', kicker: 'Thrombosis', title: 'PVT, cirrhosis', note: 'Anticoagulation' }, { id: 'a4', kicker: 'Thrombosis', title: 'PVT, no cirrhosis', note: 'Anticoagulation' },
        { id: 'a5', kicker: 'Outflow', title: 'Budd–Chiari', note: 'DIPS' }],
      kicker: 'Summary', title: 'Match the treatment to where the pressure builds',
      line: 'The choice follows the case: the preemptive TIPS criteria after a bleed, the source of the ascites, where the thrombus raises the pressure, and where a shunt can drain.',
      notes: 'Each row shows the case after its treatment. Each choice treats the site where the pressure builds. A TIPS cannot drain into a thrombosed hepatic vein; a DIPS reaches the IVC instead. Prehepatic thrombosis is treated by recanalizing the vein, with or without cirrhosis.',
      ask: ['Two patients have recent PVT, one with cirrhosis. What is the same, and what differs?', 'Both are anticoagulated early. In cirrhosis tumor thrombus is excluded first, and variceal prophylaxis proceeds alongside.'],
    },
  ],
};
