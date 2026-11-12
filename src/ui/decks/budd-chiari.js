// Presenter talk: Budd–Chiari syndrome on its own (the slide fields are described at the top of decks.js), split out of the After the
// sinusoids talk (outflow.js, which keeps the sinusoidal obstruction, the heart and the IVC). One man with polycythemia vera: what the
// syndrome is, how it is found, then Baveno VIII's four steps in order (anticoagulation, recanalization, TIPS, transplant), which anticoagulant,
// how improvement is judged, acute liver failure, and the cancer surveillance. The model has the clot, the anticoagulant, the stent and the
// shunt; it has no bilirubin, creatinine, INR or liver failure, so the response, failure and surveillance slides are rule cards.
//
// Sources, checked 11 Nov 2026 against guidelines/baveno-viii-2026.pdf (EASL 2025 vascular liver disease is not in the folder yet):
// Baveno VIII (J Hepatol 2026) panel 8: 8.21 to 8.23 (obstruction from the small hepatic veins to the IVC entering the right atrium; BCS the
// preferred name; primary or secondary), 8.24 to 8.27 (consider it in any acute, acute-on-chronic or chronic liver disease; diagnosed by the blocked
// lumen or hepatic vein collaterals with no patent hepatic vein; no biopsy when imaging confirms; biopsy for small hepatic vein disease), 8.28 to
// 8.30 (nodules frequent and mostly benign; imaging and AFP every 6 months; AFP >15 ng/mL; LI-RADS not applicable; MRI with hepatobiliary agents;
// histology for suspected HCC), 8.31 to 8.34 (stepwise: anticoagulation, recanalization with or without a stent, TIPS, LT; anticoagulation as soon
// as possible and long term, also after LT; look for venous stenoses that suit recanalization; TIPS next when medical care is not enough and
// recanalization is not an option or has failed), 8.35 to 8.36 (improvement judged on the ascites, bilirubin, creatinine and INR, about 2-weekly;
// prognostic scores not alone), 8.37 (acute liver failure: urgent LT considered, salvage TIPS regardless of listing). Anticoagulation in vascular
// liver disease: 8.4 to 8.7, 8.10, 8.11. The DIPS (a shunt from the IVC through the caudate to the portal vein) is a technique the statements do
// not name; the Baveno statement is for TIPS.

const BELLY = { kind: 'abdomen' };
const HVS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];

export const BUDD_CHIARI = {
  id: 'budd-chiari', level: 'advanced', title: 'Budd–Chiari syndrome, step by step', minutes: 11,
  sections: [['What it is', ['What it is']], ['Stepwise care', ['Stepwise care']], ['Response and risks', ['Response and risks']]],
  objectives: [
    'Say how Budd–Chiari syndrome is found, and that a biopsy is rarely needed',
    'Name the four steps of care in order',
    'Pick the anticoagulant, and name when a DOAC is not used',
    'Judge improvement, and act on acute liver failure',
  ],
  checks: [
    ['A young man has a tender liver and new ascites. When is Budd–Chiari syndrome considered, and how is it found?', 'In any acute, acute-on-chronic or chronic liver disease. Imaging shows the blocked hepatic vein, or hepatic vein collaterals with no patent vein; a biopsy is not needed (Baveno VIII 8.24 to 8.26).'],
    ['Name the four steps of care for Budd–Chiari syndrome, in order.', 'Anticoagulation, recanalization with or without a stent, TIPS, and liver transplant (Baveno VIII 8.31).'],
    ['After two weeks the ascites forms more slowly, but the bilirubin and INR have not moved. Has he improved?', 'Not yet. Improvement is judged on the ascites, bilirubin, creatinine and INR together, about every 2 weeks (Baveno VIII 8.35).'],
    ['Why is a TIPS no use when all three hepatic veins are clotted, and what is done instead?', 'A TIPS starts in a hepatic vein, and none can be entered. The shunt runs from the IVC through the caudate lobe to the portal vein (a DIPS).'],
  ],
  summary: 'Budd–Chiari syndrome from the clot to the four steps of care: anticoagulation, a stent, a shunt and transplant, which anticoagulant, how improvement is judged, acute liver failure and cancer surveillance.',
  slides: [
    {
      id: 'bcs', preset: 'budd-chiari', cam: 'hepatic', terms: ['hv', 'ivc'], mark: { edges: HVS, clot: true }, tool: BELLY, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'],
      whatIf: { label: 'Right hepatic vein clot', param: 'thrombus.RHV_IVC', min: 0, max: 1, step: 0.05, ends: ['None', 'Occlusive'] },
      vignette: 'A 34-year-old man with polycythemia vera has had 3 weeks of right upper quadrant pain and a swelling abdomen. His liver is large and tender.',
      kicker: 'What it is', site: 'post', title: 'In Budd–Chiari syndrome the liver cannot drain',
      line: 'The [hepatic veins](hv) are blocked, so blood backs up in the liver. The portal pressure rises to {pv}, and {asc} of ascites forms.',
      notes: 'Source: Baveno VIII 8.21 to 8.23. Budd–Chiari syndrome is an obstruction of the hepatic venous outflow, anywhere from the small hepatic veins to where the IVC enters the right atrium (8.21), and it is the preferred name for any obstruction of the hepatic venous outflow tract (8.22). It is secondary when the cause is a compression or a tumor or parasite inside the lumen, and primary otherwise (8.23). Vascular liver diseases in adults without cirrhosis often have more than one cause, which may be hidden, so the work-up is thorough (8.3). Here all three hepatic veins are blocked.',
      ask: ['Where can the obstruction lie in Budd–Chiari syndrome?', 'Anywhere from the small hepatic veins to where the IVC enters the right atrium (Baveno VIII 8.21).'],
    },
    {
      id: 'dx', cam: 'liver', terms: ['hv', 'caudate'], tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'],
      kicker: 'What it is', site: 'post', title: 'Imaging finds the blocked vein, and a biopsy is rarely needed',
      line: 'Consider it in any acute, acute-on-chronic or chronic liver disease. Imaging shows the blocked vein or hepatic vein collaterals, so a biopsy is not needed to make the diagnosis.',
      notes: 'Source: Baveno VIII 8.24 to 8.27. The presentation is extremely diverse, so the diagnosis is considered in any acute, acute-on-chronic or chronic liver disease (8.24). It rests on showing the obstruction of the venous lumen, or hepatic vein collaterals with no patent hepatic vein (8.25). In a patient with radiologically confirmed disease, a biopsy is not necessary (8.26). It is needed only when imaging shows no large hepatic vein obstruction and small hepatic vein disease is suspected (8.27). On Doppler the hepatic vein flow is absent or reversed.',
      ask: ['When is a liver biopsy needed in suspected Budd–Chiari syndrome?', 'Only when imaging does not show a large hepatic vein obstruction and small hepatic vein disease is suspected (Baveno VIII 8.27).'],
    },
    {
      id: 'ladder', cam: 'liver', terms: ['hv'], data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Stepwise care', short: 'Four steps', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 8.31',
        rows: ['**Anticoagulation**', '**Recanalization**, with or without a stent', '**TIPS**', '**Liver transplant**'], verdict: 'Each step is added only when the one before is not enough.' },
      kicker: 'Stepwise care', site: 'post', title: 'Care moves up four steps, and only as far as needed',
      line: 'Baveno VIII sets four steps in order: anticoagulation, recanalization, TIPS and liver transplant. Each is added only when the step before is not enough.',
      notes: 'Source: Baveno VIII 8.31, 8.33, 8.34. Treatment follows a stepwise approach: anticoagulation, recanalization by interventional radiology with or without a stent, TIPS, and liver transplant (8.31). Clinicians look for venous stenoses that suit percutaneous recanalization and treat them (8.33). When medical management alone is not enough and recanalization is not an option or has failed, TIPS is the next step (8.34). The next slides take the steps one at a time on the same man.',
      ask: ['In what order are the treatments for Budd–Chiari syndrome added?', 'Anticoagulation, recanalization with or without a stent, TIPS, then liver transplant (Baveno VIII 8.31).'],
    },
    {
      id: 'anticoag', params: { anticoag: true }, days: 60, lapse: { seconds: 7, from: 'Diagnosis', to: 'Two months on' }, cam: 'liver', terms: ['hv'], tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over two months' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'bcs',
      kicker: 'Stepwise care', site: 'post', title: 'Anticoagulation comes first and continues long term',
      line: 'Anticoagulation starts as soon as the diagnosis is made. In the model it lowers the portal pressure to {pv}, but {asc} of ascites remains.',
      notes: 'Source: Baveno VIII 8.32, 8.10. Therapeutic anticoagulation starts as soon as possible after the diagnosis and continues long term, including after a liver transplant (8.32). It should not be postponed to wait for endoscopic prophylaxis of variceal bleeding (8.10). In the model anticoagulation stops new clot and lowers the pressure a little; it does not reopen the three clotted veins, which is why the next step is a stent.',
      ask: ['How long does anticoagulation continue in Budd–Chiari syndrome?', 'Long term, and after a liver transplant too (Baveno VIII 8.32).'],
    },
    {
      id: 'agent', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Which anticoagulant', short: 'Anticoagulant', ticks: false, lead: 'Heparin first, then an oral drug.', rule: 'Baveno VIII 8.5, 8.6',
        rows: ['**LMWH** to start, then an oral drug', 'A **DOAC** may be the first choice of oral drug', 'Not a DOAC in **antiphospholipid syndrome** (double or triple positive)', 'Not a DOAC in **pregnancy**, **Child–Pugh C** or a **GFR <30 mL/min**'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'],
      kicker: 'Stepwise care', site: 'post', title: 'A DOAC is often the oral choice, with four exceptions',
      line: 'Low-molecular-weight heparin starts treatment and an oral drug follows. A DOAC is the usual choice unless there is antiphospholipid syndrome, pregnancy, Child–Pugh C or a GFR <30 mL/min.',
      notes: 'Source: Baveno VIII 8.4 to 8.7, 8.10, 8.11. The type of vascular liver disease does not decide the anticoagulant (8.4). Treatment can start with low-molecular-weight heparin and move to an oral drug (8.5, weak). Unfractionated heparin is generally not recommended because of heparin-induced thrombocytopenia and is kept for special cases, such as a GFR under 30 mL/min or an invasive procedure to come. A DOAC may be the primary oral choice unless there is double or triple-positive antiphospholipid syndrome, pregnancy, severely impaired liver function (Child–Pugh C) or a GFR under 30 mL/min (8.6, weak). The plan is revisited regularly (8.7). Banding can be done without stopping heparin or a vitamin K antagonist (8.11).',
      ask: ['A pregnant woman with Budd–Chiari syndrome needs an oral anticoagulant. Is a DOAC the choice?', 'No. Pregnancy is one of the four exceptions (Baveno VIII 8.6); LMWH is used instead (8.16).'],
    },
    {
      id: 'stent', params: { thrombus: { RHV_IVC: 0 } }, days: 60, lapse: { seconds: 7, from: 'Before the stent', to: 'Two months on' }, cam: 'hepatic', terms: ['hv'], mark: { edges: ['RHV_IVC'], label: 'Stent', kind: 'treat' }, stented: ['RHV_IVC'], tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over two months' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'bcs',
      kicker: 'Stepwise care', site: 'post', title: 'A stent in one short narrowing can drain the whole liver',
      line: 'Clinicians look for a short stenosis that a catheter can open. A stent in the right hepatic vein brings the portal pressure to {pv} and the ascites to {asc}.',
      notes: 'Source: Baveno VIII 8.33, 8.31. Clinicians actively look for venous stenoses that suit percutaneous recanalization and treat them. A short narrowing of a hepatic vein or of the IVC is opened by angioplasty, usually with a stent, and anticoagulation goes on. In the model one good hepatic vein can drain the whole liver, as here, and it does so faster than in most patients.',
      ask: ['What does the team look for after the diagnosis, before a shunt?', 'Venous stenoses that a catheter can open, with or without a stent (Baveno VIII 8.33).'],
    },
    {
      id: 'stent-lumen', cam: 'hepatic', terms: ['hv'], stented: ['RHV_IVC'], tool: { kind: 'lumen', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'bcs',
      kicker: 'Stepwise care', site: 'post', title: 'The stent holds the narrowing open',
      line: 'In cross-section the right hepatic vein is open through the stent, so blood leaves the liver freely.',
      notes: 'Source: Baveno VIII 8.33, 8.31. The same patient as the slide before, two months after the stent. The card shows the right hepatic vein in cross-section.',
      ask: ['What does the stent change inside the right hepatic vein?', 'It holds the short narrowing open, so blood drains from the liver and the portal pressure and ascites fall.'],
    },
    {
      id: 'shunt', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, cam: 'dips', terms: ['pv', 'ivc', 'caudateLobe'], mark: { edges: ['DIPS'], label: 'DIPS', kind: 'treat' }, lens: 'flow',
      compare: [{ label: 'TIPS', preset: 'budd-chiari', params: { tips: { on: true }, dips: { on: false } }, days: 60 }, { label: 'DIPS', own: true }],
      tool: { kind: 'flows' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'bcs',
      kicker: 'Stepwise care', site: 'post', title: 'When no vein opens, a shunt drains the liver',
      line: 'In another man no hepatic vein can be opened. A TIPS starts in a hepatic vein, so a DIPS from the IVC lowers the portal pressure to {pv}.',
      notes: 'Source: Baveno VIII 8.34. When medical management is not enough and recanalization is not an option or has failed, TIPS is the recommended next step. A standard TIPS runs from a hepatic vein to the portal vein, so when all three hepatic veins are clotted the stent runs from the IVC through the caudate lobe to the portal vein (a direct intrahepatic portosystemic shunt, DIPS); Baveno VIII names TIPS and not this variant. The portal vein becomes the liver\'s outflow and the ascites clears. In the model a TIPS changes nothing here, because there is no hepatic vein for it to drain into. Like any shunt it diverts portal blood from the liver, so encephalopathy is watched for.',
      ask: ['Why can a standard TIPS not be placed when all three hepatic veins are clotted?', 'It needs a hepatic vein to start from; the stent goes from the IVC instead (a DIPS).'],
    },
    {
      id: 'response', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Signs of improvement', short: 'Improvement', ticks: false, lead: 'Judged together, about every 2 weeks.', rule: 'Baveno VIII 8.35',
        rows: ['**Ascites** forms more slowly', '**Bilirubin** falls', '**Creatinine** falls', '**INR** falls, if it was raised'], verdict: 'The model shows the ascites; the bedside shows the rest.' },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'Improvement is judged on four signs, not on the pressure',
      line: 'Improvement means the ascites forms more slowly and the bilirubin, creatinine and INR fall. After the shunt the ascites is {asc}; the model has no blood tests.',
      notes: 'Source: Baveno VIII 8.35, 8.36. Improvement is assessed as a combination of a decreasing rate of ascites formation, a falling serum bilirubin, a falling creatinine, and/or a falling INR when it is raised (or a rising factor V in patients on vitamin K antagonists), evaluated periodically, for example every 2 weeks (8.35, strong). The available prognostic scores should not decide an individual patient\'s management on their own and are for research (8.36). The model has the ascites and the pressures but no bilirubin, creatinine or INR.',
      ask: ['Name the signs that show a patient with Budd–Chiari syndrome is improving.', 'Ascites forming more slowly, and a falling bilirubin, creatinine and INR (Baveno VIII 8.35).'],
    },
    {
      id: 'alf', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Acute liver failure', short: 'Liver failure', ticks: false, lead: 'Both, whatever the listing.', rule: 'Baveno VIII 8.37',
        rows: ['**Urgent liver transplant** should be considered', '**Salvage TIPS**, if possible, independent of the listing'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'In acute liver failure, transplant is urgent and a salvage TIPS goes ahead',
      line: 'A patient who presents with acute liver failure is considered for an urgent transplant. A salvage TIPS is done as well, if possible, whatever the listing.',
      notes: 'Source: Baveno VIII 8.37 (strong). In a patient with Budd–Chiari syndrome who presents with acute liver failure, urgent liver transplant should be considered, and salvage TIPS should be performed if possible, independently of listing for transplant. This is the last of the four steps, reached at once. The model has no liver failure, so the tiles keep the last state.',
      ask: ['A patient with Budd–Chiari syndrome presents with acute liver failure. What are the two actions?', 'Consider an urgent liver transplant, and place a salvage TIPS if possible, whatever the listing (Baveno VIII 8.37).'],
    },
    {
      id: 'hcc', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Watching for liver cancer', short: 'HCC watch', ticks: false, lead: 'In chronic Budd–Chiari syndrome.', rule: 'Baveno VIII 8.28, 8.29, 8.30',
        rows: ['**Imaging and AFP** about every 6 months', '**AFP >15 ng/mL** raises suspicion of HCC', '**LI-RADS** does not apply: MRI with a hepatobiliary agent', 'A suspected HCC needs **histology**'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'Chronic Budd–Chiari syndrome needs cancer surveillance',
      line: 'Liver nodules are frequent in chronic disease and mostly benign, but liver cancer occurs. Imaging and AFP about every 6 months watch for it.',
      notes: 'Source: Baveno VIII 8.28 to 8.30. In chronic Budd–Chiari syndrome hepatic nodules are frequent and most often benign. Because HCC may also occur, patients are monitored with periodic imaging and alpha-fetoprotein (8.28), and a 6-month interval can be proposed, as in cirrhosis; an AFP over 15 ng/mL raises suspicion of HCC (8.29). The LI-RADS classification cannot be applied. MRI with hepatobiliary contrast agents helps to tell benign from malignant lesions, and a lesion suspected to be HCC needs histological confirmation (8.30).',
      ask: ['Why is the LI-RADS classification not used in Budd–Chiari syndrome?', 'It cannot be applied to these nodules. MRI with a hepatobiliary agent is used instead, and suspected HCC needs histology (Baveno VIII 8.30).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'ppg', 'asc'], asc: false, rowHead: 'Step',
      of: [{ id: 'bcs', kicker: 'What it is', title: 'Three hepatic veins blocked', ref: true }, { id: 'anticoag', kicker: 'Step 1', title: 'Anticoagulation, 2 months' }, { id: 'stent', kicker: 'Step 2', title: 'Stent in the right hepatic vein' }, { id: 'shunt', kicker: 'Step 3', title: 'DIPS, no vein to open' }],
      kicker: 'Summary', title: 'What each step of care does',
      line: 'Anticoagulation comes first and a stent opens a short narrowing. A shunt drains the liver when no vein opens, and transplant is for failure.',
      notes: 'Anticoagulation stops new clot and lowers the pressure a little. A stent in one hepatic vein can drain the whole liver. A shunt from the IVC drains it when no vein can be opened, and a liver transplant is for failure of the other steps or for acute liver failure. Improvement is judged on the ascites, bilirubin, creatinine and INR, and chronic disease needs cancer surveillance every 6 months.',
      ask: ['Which step drains the liver when no hepatic vein can be opened?', 'A shunt: TIPS if a hepatic vein can be entered, or a DIPS from the IVC if not.'],
    },
  ],
};
