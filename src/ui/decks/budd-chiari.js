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
  sections: [['What it is', ['What it is']], ['Stepwise management', ['Stepwise management']], ['Response and risks', ['Response and risks']]],
  objectives: [
    'Describe how Budd–Chiari syndrome (BCS) is diagnosed, and why biopsy is rarely needed',
    'Name the four steps of management in order',
    'Choose the anticoagulant, and name when a DOAC is avoided',
    'Assess response, and manage acute liver failure',
  ],
  checks: [
    ['A young man has tender hepatomegaly and new ascites. When is BCS considered, and how is it diagnosed?', 'In any acute, acute-on-chronic or chronic liver disease. Imaging shows hepatic venous outflow obstruction, or hepatic vein collaterals with no patent hepatic vein; biopsy is not needed (Baveno VIII 8.24 to 8.26).'],
    ['Name the four steps of management for BCS, in order.', 'Anticoagulation, recanalization with or without a stent, TIPS, and liver transplant (Baveno VIII 8.31).'],
    ['After 2 weeks ascites reaccumulates more slowly, but bilirubin and INR are unchanged. Has he improved?', 'Not yet. Response is assessed on ascites, bilirubin, creatinine and INR together, about every 2 weeks (Baveno VIII 8.35).'],
    ['Why is a standard TIPS not possible when all three hepatic veins are occluded, and what is done instead?', 'A TIPS starts in a hepatic vein, and none can be catheterized. A direct intrahepatic portosystemic shunt (DIPS) runs from the IVC through the caudate lobe to the portal vein.'],
  ],
  summary: 'Budd–Chiari syndrome from diagnosis through the four steps of management (anticoagulation, angioplasty and stenting, TIPS or DIPS, and transplant), the choice of anticoagulant, assessment of response, acute liver failure and HCC surveillance.',
  slides: [
    {
      id: 'bcs', preset: 'budd-chiari', cam: 'hepatic', terms: ['hv', 'ivc'], mark: { edges: HVS, clot: true }, tool: BELLY, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'],
      whatIf: { label: 'Right hepatic vein thrombus', param: 'thrombus.RHV_IVC', min: 0, max: 1, step: 0.05, ends: ['None', 'Occlusive'] },
      vignette: 'A 34-year-old man with polycythemia vera has had 3 weeks of right upper quadrant pain and increasing abdominal girth. He has tender hepatomegaly.',
      kicker: 'What it is', site: 'post', title: 'In Budd–Chiari syndrome, hepatic venous outflow is obstructed',
      line: 'The [hepatic veins](hv) are occluded, so the liver is congested. Portal pressure rises to {pv}, and {asc} of ascites accumulates.',
      notes: 'Source: Baveno VIII 8.21 to 8.23. Budd–Chiari syndrome (BCS) is hepatic venous outflow obstruction at any level from the small hepatic veins to the cavoatrial junction (8.21), and it is the preferred name for any obstruction of the hepatic venous outflow tract (8.22). It is secondary when caused by extrinsic compression or by a tumor or parasite within the lumen, and primary otherwise (8.23). Vascular liver diseases in adults without cirrhosis often have more than one cause, which may be occult, so the workup is thorough (8.3). Here all three hepatic veins are occluded.',
      ask: ['Where can the obstruction lie in Budd–Chiari syndrome?', 'At any level from the small hepatic veins to the cavoatrial junction, where the IVC enters the right atrium (Baveno VIII 8.21).'],
    },
    {
      id: 'dx', cam: 'liver', terms: ['hv', 'caudate'], tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'],
      kicker: 'What it is', site: 'post', title: 'Imaging shows the obstruction, and biopsy is rarely needed',
      line: 'Consider BCS in any acute, acute-on-chronic or chronic liver disease. Imaging that shows the obstructed vein or hepatic vein collaterals makes the diagnosis without biopsy.',
      notes: 'Source: Baveno VIII 8.24 to 8.27. The presentation is highly variable, so the diagnosis is considered in any acute, acute-on-chronic or chronic liver disease (8.24). It rests on showing the obstruction of the venous lumen, or hepatic vein collaterals with no patent hepatic vein (8.25). In a patient with radiologically confirmed disease, biopsy is not necessary (8.26). Biopsy is needed only when imaging shows no large hepatic vein obstruction and small hepatic vein disease is suspected (8.27). On Doppler the hepatic vein flow is absent or reversed.',
      ask: ['When is a liver biopsy needed in suspected Budd–Chiari syndrome?', 'Only when imaging does not show a large hepatic vein obstruction and small hepatic vein disease is suspected (Baveno VIII 8.27).'],
    },
    {
      id: 'ladder', cam: 'liver', terms: ['hv'], data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Stepwise management', short: 'Four steps', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 8.31',
        rows: ['**Anticoagulation**', '**Recanalization**, with or without a stent', '**TIPS**', '**Liver transplant**'], verdict: 'Each step is added only when the previous one is insufficient.' },
      kicker: 'Stepwise management', site: 'post', title: 'Management escalates through four steps, only as far as needed',
      line: 'Baveno VIII sets four steps in order: anticoagulation, recanalization, TIPS and liver transplant. Each is added only when the previous step is insufficient.',
      notes: 'Source: Baveno VIII 8.31, 8.33, 8.34. Treatment follows a stepwise approach: anticoagulation, recanalization by interventional radiology with or without a stent, TIPS, and liver transplant (8.31). Short venous stenoses amenable to percutaneous recanalization are sought and treated (8.33). When medical management alone is insufficient and recanalization is not an option or has failed, TIPS is the next step (8.34). The next slides take the steps one at a time in the same patient.',
      ask: ['In what order are the treatments for Budd–Chiari syndrome added?', 'Anticoagulation, recanalization with or without a stent, TIPS, then liver transplant (Baveno VIII 8.31).'],
    },
    {
      id: 'anticoag', params: { anticoag: true }, days: 60, lapse: { seconds: 7, from: 'Diagnosis', to: '2 months later' }, cam: 'liver', terms: ['hv'], tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over two months' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'bcs',
      kicker: 'Stepwise management', site: 'post', title: 'Anticoagulation comes first and continues long term',
      line: 'Anticoagulation starts as soon as the diagnosis is made. In the model it lowers portal pressure to {pv}, but {asc} of ascites remains.',
      notes: 'Source: Baveno VIII 8.32, 8.10. Therapeutic anticoagulation starts as soon as possible after the diagnosis and continues long term, including after a liver transplant (8.32). It should not be postponed to wait for endoscopic prophylaxis of variceal bleeding (8.10). In the model anticoagulation prevents thrombus extension and lowers the pressure slightly; it does not recanalize the three occluded veins, which is why the next step is angioplasty and stenting.',
      ask: ['How long does anticoagulation continue in Budd–Chiari syndrome?', 'Long term, and after a liver transplant too (Baveno VIII 8.32).'],
    },
    {
      id: 'agent', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Choice of anticoagulant', short: 'Anticoagulant', ticks: false, lead: 'LMWH first, then an oral agent.', rule: 'Baveno VIII 8.5, 8.6',
        rows: ['**LMWH** to start, then an oral agent', 'A **DOAC** may be the first-choice oral agent', 'Not a DOAC in **antiphospholipid syndrome** (double or triple positive)', 'Not a DOAC in **pregnancy**, **CTP class C** or a **GFR <30 mL/min**'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'],
      kicker: 'Stepwise management', site: 'post', title: 'A DOAC is often the oral agent of choice, with four exceptions',
      line: 'Treatment starts with low-molecular-weight heparin (LMWH), then an oral agent. A DOAC is the usual choice except in antiphospholipid syndrome, pregnancy, CTP class C or GFR <30 mL/min.',
      notes: 'Source: Baveno VIII 8.4 to 8.7, 8.10, 8.11. The type of vascular liver disease does not determine the anticoagulant (8.4). Treatment can start with LMWH and transition to an oral agent (8.5, weak). Unfractionated heparin is generally not recommended because of heparin-induced thrombocytopenia and is reserved for special situations, such as a GFR <30 mL/min or an upcoming invasive procedure. A DOAC may be the first-choice oral agent unless there is double- or triple-positive antiphospholipid syndrome, pregnancy, severe hepatic impairment (CTP class C) or a GFR <30 mL/min (8.6, weak). The plan is reviewed regularly (8.7). Band ligation can be performed without interrupting heparin or a vitamin K antagonist (8.11).',
      ask: ['A pregnant woman with Budd–Chiari syndrome needs an oral anticoagulant. Is a DOAC the choice?', 'No. Pregnancy is one of the four exceptions (Baveno VIII 8.6); LMWH is used instead (8.16).'],
    },
    {
      id: 'stent', params: { thrombus: { RHV_IVC: 0 } }, days: 60, lapse: { seconds: 7, from: 'Before the stent', to: '2 months later' }, cam: 'hepatic', terms: ['hv'], mark: { edges: ['RHV_IVC'], label: 'Stent', kind: 'treat' }, stented: ['RHV_IVC'], tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'asc'], keepTiles: true, title: 'Portal pressure and ascites over two months' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'bcs',
      kicker: 'Stepwise management', site: 'post', title: 'Stenting one short stenosis can decompress the whole liver',
      line: 'A short stenosis amenable to angioplasty is sought. A right hepatic vein stent lowers portal pressure to {pv} and ascites to {asc}.',
      notes: 'Source: Baveno VIII 8.33, 8.31. Venous stenoses amenable to percutaneous recanalization are actively sought and treated. A short stenosis of a hepatic vein or the IVC is treated by angioplasty, usually with stenting, and anticoagulation continues. In the model one patent hepatic vein can drain the whole liver, as here, and faster than in most patients.',
      ask: ['What is sought after the diagnosis, before TIPS?', 'Short venous stenoses amenable to percutaneous recanalization, with or without stenting (Baveno VIII 8.33).'],
    },
    {
      id: 'stent-lumen', cam: 'hepatic', terms: ['hv'], stented: ['RHV_IVC'], tool: { kind: 'lumen', vessel: 'RHV_IVC' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'bcs',
      kicker: 'Stepwise management', site: 'post', title: 'The stent keeps the stenosis patent',
      line: 'In cross-section the right hepatic vein is patent through the stent, restoring hepatic venous outflow.',
      notes: 'Source: Baveno VIII 8.33, 8.31. The same patient as the slide before, two months after the stent. The card shows the right hepatic vein in cross-section.',
      ask: ['What does the stent change inside the right hepatic vein?', 'It keeps the short stenosis patent and restores hepatic venous outflow, so portal pressure and ascites fall.'],
    },
    {
      id: 'shunt', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, cam: 'dips', terms: ['pv', 'ivc', 'caudateLobe'], mark: { edges: ['DIPS'], label: 'DIPS', kind: 'treat' }, lens: 'flow',
      compare: [{ label: 'TIPS', preset: 'budd-chiari', params: { tips: { on: true }, dips: { on: false } }, days: 60 }, { label: 'DIPS', own: true }],
      tool: { kind: 'flows' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'bcs',
      kicker: 'Stepwise management', site: 'post', title: 'When no vein can be recanalized, a DIPS decompresses the liver',
      line: 'In another patient no hepatic vein can be recanalized. A TIPS starts in a hepatic vein, so a DIPS from the IVC lowers portal pressure to {pv}.',
      notes: 'Source: Baveno VIII 8.34. When medical management is not enough and recanalization is not an option or has failed, TIPS is the recommended next step. A standard TIPS runs from a hepatic vein to the portal vein, so when all three hepatic veins are occluded the stent runs from the IVC through the caudate lobe to the portal vein (a direct intrahepatic portosystemic shunt, DIPS); Baveno VIII names TIPS and not this variant. The portal vein becomes the hepatic outflow tract and the ascites resolves. In the model a TIPS changes nothing here, because there is no hepatic vein for it to drain into. Like any portosystemic shunt it diverts portal flow from the liver, so patients are monitored for hepatic encephalopathy.',
      ask: ['Why can a standard TIPS not be placed when all three hepatic veins are occluded?', 'It needs a hepatic vein to start from; the stent goes from the IVC instead (a DIPS).'],
    },
    {
      id: 'response', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Signs of improvement', short: 'Improvement', ticks: false, lead: 'Assessed together, about every 2 weeks.', rule: 'Baveno VIII 8.35',
        rows: ['**Ascites** reaccumulates more slowly', '**Bilirubin** falls', '**Creatinine** falls', '**INR** falls, if elevated'], verdict: 'The model shows ascites; the laboratory values come from the patient.' },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'Response is assessed on four markers, not on pressure',
      line: 'Improvement means slower ascites reaccumulation and falling bilirubin, creatinine and INR. After the DIPS, ascites is {asc}; the model has no laboratory values.',
      notes: 'Source: Baveno VIII 8.35, 8.36. Improvement is assessed as a combination of a decreasing rate of ascites formation, a falling serum bilirubin, a falling creatinine, and/or a falling INR when it is elevated (or a rising factor V in patients on vitamin K antagonists), evaluated periodically, for example every 2 weeks (8.35, strong). The available prognostic scores should not decide an individual patient\'s management on their own and are for research (8.36). The model has the ascites and the pressures but no bilirubin, creatinine or INR.',
      ask: ['Name the signs that show a patient with Budd–Chiari syndrome is improving.', 'Slower ascites reaccumulation, and falling bilirubin, creatinine and INR (Baveno VIII 8.35).'],
    },
    {
      id: 'alf', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'Acute liver failure', short: 'Liver failure', ticks: false, lead: 'Both, regardless of listing status.', rule: 'Baveno VIII 8.37',
        rows: ['**Urgent liver transplant** should be considered', '**Salvage TIPS**, if possible, independent of the listing'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'In acute liver failure, consider urgent transplant and perform salvage TIPS',
      line: 'A patient presenting with acute liver failure is considered for urgent liver transplant, and salvage TIPS is performed if possible, regardless of listing.',
      notes: 'Source: Baveno VIII 8.37 (strong). In a patient with Budd–Chiari syndrome who presents with acute liver failure, urgent liver transplant should be considered, and salvage TIPS should be performed if possible, independently of listing for transplant. This is the last of the four steps, reached at once. The model does not simulate liver failure, so the tiles show the previous state.',
      ask: ['A patient with Budd–Chiari syndrome presents with acute liver failure. What are the two actions?', 'Consider urgent liver transplant, and place a salvage TIPS if possible, regardless of listing (Baveno VIII 8.37).'],
    },
    {
      id: 'hcc', cam: 'liver', terms: ['hv'], tool: { kind: 'criteria', title: 'HCC surveillance', short: 'HCC surveillance', ticks: false, lead: 'In chronic Budd–Chiari syndrome.', rule: 'Baveno VIII 8.28, 8.29, 8.30',
        rows: ['**Imaging and AFP** about every 6 months', '**AFP >15 ng/mL** raises suspicion of HCC', '**LI-RADS** does not apply: MRI with a hepatobiliary agent', 'A suspected HCC needs **histology**'] },
      data: 'tiles', tiles: ['pv', 'asc'], key: ['pv'], delta: 'shunt',
      kicker: 'Response and risks', site: 'post', title: 'Chronic Budd–Chiari syndrome needs HCC surveillance',
      line: 'Nodules are frequent in chronic BCS and mostly benign, but hepatocellular carcinoma (HCC) occurs. Surveillance is imaging and AFP about every 6 months.',
      notes: 'Source: Baveno VIII 8.28 to 8.30. In chronic Budd–Chiari syndrome hepatic nodules are frequent and most often benign. Because HCC may also occur, patients are monitored with periodic imaging and alpha-fetoprotein (8.28), and a 6-month interval can be proposed, as in cirrhosis; an AFP over 15 ng/mL raises suspicion of HCC (8.29). The LI-RADS classification cannot be applied. MRI with hepatobiliary contrast agents helps to tell benign from malignant lesions, and a lesion suspected to be HCC needs histological confirmation (8.30).',
      ask: ['Why is the LI-RADS classification not used in Budd–Chiari syndrome?', 'It cannot be applied to these nodules. MRI with a hepatobiliary agent is used instead, and suspected HCC needs histology (Baveno VIII 8.30).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'ppg', 'asc'], asc: false, rowHead: 'Step',
      of: [{ id: 'bcs', kicker: 'What it is', title: 'Three hepatic veins occluded', ref: true }, { id: 'anticoag', kicker: 'Step 1', title: 'Anticoagulation, 2 months' }, { id: 'stent', kicker: 'Step 2', title: 'Stent in the right hepatic vein' }, { id: 'shunt', kicker: 'Step 3', title: 'DIPS, no vein to recanalize' }],
      kicker: 'Summary', title: 'What each step of management does',
      line: 'Anticoagulation comes first, and stenting treats a short stenosis. A TIPS or DIPS decompresses the liver when no vein can be recanalized, and transplant follows treatment failure.',
      notes: 'Anticoagulation prevents thrombus extension and lowers the pressure slightly. A stent in one hepatic vein can decompress the whole liver. A DIPS from the IVC decompresses it when no hepatic vein can be recanalized, and liver transplant is for failure of the other steps or for acute liver failure. Response is assessed on ascites, bilirubin, creatinine and INR, and chronic disease needs HCC surveillance every 6 months.',
      ask: ['Which step decompresses the liver when no hepatic vein can be recanalized?', 'A portosystemic shunt: TIPS if a hepatic vein can be catheterized, or a DIPS from the IVC if not.'],
    },
  ],
};
