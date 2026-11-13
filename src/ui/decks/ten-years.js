// Presenter talk: one man followed for ten years, from the tests that find clinically significant portal hypertension in his first year
// to a transplant evaluation, with a decision at each step (the slide fields are described at the top of decks.js). The injury is never
// removed in the model, so every later step can be shown; Baveno VIII 4.2 would treat the cause after the first decompensation.
// Year 0 to 2 is the follow-up (the plane, FibroScan at year 2, the HVPG that confirms CSPH, carvedilol at once); the chain runs on
// by the same disease clock to the first ascites at year 6 (the transplant referral), the bleeds of years 8 and 9 and the transplant evaluation at year 10.
// Sources, checked 25 Oct 2026 and again 6 Nov 2026 against the Baveno VIII text in guidelines/baveno-viii-2026.pdf: 1.15 and 1.16 (the stiffness and platelet
// rules), 3.15 and 3.16 (carvedilol only with CSPH), 4.1 (further decompensation), 4.3 and 6.1 (transplant evaluation), 4.4 and 4.6
// (carvedilol with ascites and varices, and when to cut it), 4.8 (carvedilol with banding after a first bleed, even after carvedilol as
// primary prophylaxis), 4.13 (TIPS when that fails), 6.16 and 6.17 (rifaximin before an elective TIPS; narrowing the stent for
// encephalopathy that persists).

const BAND = { kind: 'band' };
const CARV = { drugs: { carvedilol: true } };
const ramp = (a, b) => ({ cirrhosis: [a, b] });

export const TEN_YEARS = {
  id: 'ten-years', level: 'advanced', title: 'One patient, ten years', minutes: 15,
  objectives: [
    'Follow one man from compensated cirrhosis to a transplant evaluation, and read his HVPG along the way',
    'Choose the treatment at each step: carvedilol, diuretics, banding, TIPS',
    'Name what the model can and cannot show of hepatic encephalopathy after TIPS',
    'State when to refer for liver transplant evaluation, and when further decompensation makes it urgent',
  ],
  checks: [
    ['At what point does Baveno VIII start carvedilol in compensated cirrhosis?', 'At CSPH, an HVPG ≥10 mmHg, to prevent decompensation. Without CSPH it should not be used for that purpose.'],
    ['He had a variceal bleed while taking carvedilol. Is carvedilol stopped?', 'No. Baveno VIII 4.8 combines carvedilol with banding after a first bleed, whether or not he was taking carvedilol before.'],
    ['He rebleeds on carvedilol and repeat banding. What next?', 'A TIPS. Baveno VIII 4.13 says to consider one when secondary prophylaxis fails.'],
    ['Two months after TIPS he has overt hepatic encephalopathy, and the PPG is low. Which comes first, TIPS reduction or lactulose?', 'Lactulose, after a search for the precipitant. The stent is reduced only if the encephalopathy persists, because a narrower stent raises the portal pressure again.'],
  ],
  sections: [['Compensated', ['Year 0', 'Year 2']], ['Ascites', ['Year 6']], ['Bleeding', ['Year 8', 'Year 9']], ['The end', ['Year 10', 'Summary']]],
  summary: 'One man with cirrhosis over ten years: the tests that find CSPH and carvedilol at once, the first ascites, diuretics and a transplant referral, a variceal bleed and banding, rebleeding and TIPS, hepatic encephalopathy, and the transplant evaluation, with a decision at each step.',
  slides: [
    {
      id: 'd0', tick: 'Year 0', milestone: 'Cirrhosis', preset: 'cirr-comp', params: { cirrhosis: 0.5 }, cam: 'liver', tool: { kind: 'plane', plane: 'csph' }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      kicker: 'Year 0', site: 'sin', title: 'Year 0: cirrhosis, but not yet CSPH', cite: 'Baveno VIII 3.16',
      vignette: 'A 56-year-old man with type 2 diabetes and a BMI of 28 has a nodular liver on an ultrasound done for gallstones. He feels well, and his platelets are 160,000/µL.',
      line: 'His HVPG is {hvpg}, which does not meet {>=10 mmHg}: no beta-blocker yet. He starts weight loss, glycemic control and ultrasound surveillance for hepatocellular carcinoma every 6 months.',
      notes: 'Compensated cirrhosis without clinically significant portal hypertension needs follow-up and treatment of the cause, not a beta-blocker; Baveno VIII advises against using one to prevent decompensation at this stage (3.16). His liver stiffness (LSM) and platelets are in the indeterminate zone, shown as the ring on the plane in the data card, so HVPG measurement decides. HVPG = WHVP − FHVP (wedged minus free hepatic venous pressure). An HVPG >5 mmHg is portal hypertension; ≥10 mmHg is clinically significant (CSPH), where varices and decompensation become possible, and the risk rises with the gradient. HVPG measurement is the reference standard but invasive, so most centers reserve it for trials, uncertain cases and evaluation before liver resection. Treat the cause from the start: weight loss of ≥7 to 10%, control of diabetes and lipids, and alcohol abstinence. HCC surveillance by ultrasound every 6 months, with or without AFP, begins at the diagnosis of cirrhosis and continues indefinitely. In this case the injury is never removed, so every later step over the next ten years can be shown in the same man. Fibrosis advances steadily in the model; nothing else changes until carvedilol.',
      ask: ['Does a man with compensated cirrhosis and an HVPG <10 mmHg need carvedilol?', 'No. Baveno VIII advises against a beta-blocker to prevent decompensation without CSPH.'],
    },
    {
      // (The stages of Baveno VIII Fig. 2 lit for him at year 0: compensated, no CSPH yet. The ladder is the map of the ten years.)
      id: 'path-ladder', cam: 'liver',
      tool: { kind: 'path', of: 'ladder', short: 'Stages', patient: { s: 0, rc: false } },
      kicker: 'Year 0', site: 'sin', title: 'He starts at the first of four stages',
      line: 'An LSM of {lsm} indicates cACLD, and with no decompensation he is compensated. His HVPG of {hvpg} does not meet {>=10 mmHg}, so the second stage is still ahead.',
      notes: 'Source: Baveno VIII Fig. 2, 1.16, 3.1, 3.2, 4.1. Compensated advanced chronic liver disease (cACLD) is suggested by an LSM ≥10 kPa and indicated by an LSM ≥15 kPa, with no current or past decompensation. It becomes cACLD with CSPH when LSM, a validated model, varices, collaterals or an HVPG ≥10 mmHg show CSPH. Ascites, bleeding or overt encephalopathy is the first decompensation (3.3), and a second event or a rebleed is further decompensation (4.1). This man passes through all four stages: CSPH at year 2, ascites at year 6, and the variceal bleeds of years 8 and 9. Each stage changes the guideline recommendations, and the later slides take them in turn.',
      ask: ['What places a compensated patient at the second stage, with CSPH?', 'Evidence of CSPH: an HVPG ≥10 mmHg, an LSM ≥25 kPa, varices or collaterals, or a model such as ANTICIPATE ≥75%.'],
    },
    {
      id: 'd90', tick: 'Year 2', days: 730, ramp: ramp(0.5, 0.66), cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'd0',
      kicker: 'Year 2', site: 'sin', title: 'Year 2: the LSM rules in CSPH', cite: 'Baveno VIII 1.16',
      line: 'In non-obese MASLD, an LSM of {lsm} meets the {>=25 kPa} rule, and with platelets of {plt}, CSPH is ruled in without HVPG measurement. Carvedilol starts.',
      notes: 'In viral and alcohol-related disease and in non-obese MASLD (BMI <30, as here), an LSM ≥25 kPa alone rules CSPH in (Baveno VIII 1.16b). Between 15 and 25 kPa it does not decide. In MASLD with obesity the 25 kPa rule does not apply, and ANTICIPATE-NASH, which adds the BMI, decides. Baveno VIII calls CSPH present when a validated model (ANTICIPATE, or ANTICIPATE-NASH in MASLD, built on LSM, platelet count and BMI) puts its probability at ≥75% (1.16a), or when the spleen stiffness (SSM) with the 100 Hz probe is >55 kPa. In the simulation, the HVPG has risen above 12 mmHg over two years. Carvedilol starts on this result; it does not wait for HVPG measurement. LSM and platelet count are inexpensive and repeatable, which is why they are used to follow patients between HVPG measurements. (Baveno VIII 1.15, 1.16.)',
      ask: ['LSM 21 kPa and platelets 115,000/µL. How likely is CSPH?', 'Likely: in the indeterminate zone, an LSM >20 kPa with thrombocytopenia gives ANTICIPATE a high probability of CSPH. An SSM >55 kPa with the 100 Hz probe would establish it.'],
    },
    {
      id: 'd365', tick: 'HVPG', days: 14, cath: 'result', tool: { kind: 'hvpg', catheter: true }, data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: 'd0',
      kicker: 'Year 2', site: 'sin', title: 'Year 2: HVPG measurement confirms CSPH',
      line: 'The HVPG is {hvpg}, up from {hvpg@d0} at diagnosis and past the {>=10 mmHg} where CSPH begins. Varices and decompensation are now possible.',
      notes: 'Here the HVPG is measured as well, as in a study, to show the effect of carvedilol on it; in practice the LSM and platelets were enough to start carvedilol. Over two years the gradient has risen by about 4 mmHg, to nearly 13 mmHg. From about 12 mmHg the risk of variceal bleeding climbs, and the risk of ascites and other decompensation rises with each mmHg. Repeat HVPG measurements are not routine; in practice LSM, platelet count and endoscopy track this rise, and grade 1 ascites, seen only on ultrasound, may already be present without constituting decompensation.',
      ask: ['His HVPG is 13 mmHg and he feels well. Does he need a drug?', 'Yes. Baveno VIII recommends carvedilol at CSPH, to prevent decompensation.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', milestone: 'Carvedilol', when: 'On carvedilol', params: CARV, cath: 'result', tool: { kind: 'hvpg', catheter: true }, data: 'tiles', tiles: ['map'], key: ['hvpgFall'], delta: 'd365', hvpgResp: 'd365',
      kicker: 'Year 2', site: 'sin', title: 'Carvedilol at CSPH prevents decompensation', cite: 'Baveno VIII 3.15',
      line: 'Baveno VIII recommends carvedilol in compensated cirrhosis with CSPH, to prevent decompensation and improve survival. It lowers his HVPG from {hvpg@d365} to {hvpg}.',
      notes: 'Carvedilol acts on both flow and resistance: it lowers portal inflow and intrahepatic resistance, so it lowers the HVPG more than propranolol. Baveno VIII prefers it in compensated cirrhosis with CSPH (3.15), as in the PREDESCI trial, and it replaces the screening endoscopy for most patients who take it. The dose is titrated (6.25 mg, then 12.5 mg/day), keeping systolic blood pressure >90 mmHg. An HVPG fall of ≥10% on drug therapy predicts benefit in compensated patients; the tile shows the percent fall from the previous measurement.',
      ask: ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'When CSPH is present, to prevent decompensation and improve survival.'],
    },
    {
      id: 'ascites', tick: 'Year 6', milestone: 'Ascites', days: 1460, ramp: { cirrhosis: [0.66, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10 }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'salb'], keepTiles: true, title: 'Ascites and albumin over four years' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'carv',
      compare: [{ label: 'Carvedilol alone', short: 'Carv.', own: true, params: { diuretics: false } }, { label: 'Add diuretics', short: 'Diuretics', params: { diuretics: true } }],
      kicker: 'Year 6', site: 'sin', title: 'Year 6: the first ascites',
      line: 'Four more years of liver injury: the HVPG is {hvpg}, serum albumin {salb}, and {asc} of ascites has accumulated despite carvedilol. Refer him for liver transplant evaluation now.',
      notes: 'Try adding diuretics. Clinically evident ascites is the first decompensation, and it changes the prognosis. Grade 1 ascites, seen only on ultrasound, comes earlier and is not decompensation; grade 2 causes moderate symmetric abdominal distension, and grade 3 is tense. After the first decompensation, Baveno VIII 4.2 recommends treating the cause, to prevent further decompensation. From this first decompensation he should be considered for liver transplant (Baveno VIII 4.3); listing comes later, as the disease advances. In this case the liver injury continues, so the later steps can follow. Carvedilol management is on the next slide.',
      ask: ['What is the first decompensation in this case?', 'Ascites at year 6.'],
    },
    {
      id: 'diuretics', tick: 'Diuretics', params: { diuretics: true }, days: 30, lapse: { seconds: 6 }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'salb'], keepTiles: true, title: 'Ascites and albumin over the month' }, data: 'tiles', tiles: ['asc', 'salb'], key: ['asc'], delta: 'ascites',
      kicker: 'Year 6', site: 'sin', title: 'Diuretics and sodium restriction; carvedilol continues',
      line: 'Spironolactone, furosemide and moderate sodium restriction reduce the ascites to {asc}. Carvedilol continues unless systolic blood pressure stays <90 mmHg or HRS-AKI develops.',
      notes: 'Ascites with varices is a reason to keep carvedilol, not to stop it: Baveno VIII 4.4 recommends it to prevent a first bleed and to lower the risk of ascites complications. It is reduced or stopped if systolic blood pressure stays <90 mmHg, MAP <65 mmHg, or hepatorenal syndrome with acute kidney injury (HRS-AKI) develops, and restarted when these resolve. (Baveno VIII 4.4, 4.6.)',
      ask: ['When is carvedilol reduced or stopped in a man with ascites?', 'When systolic blood pressure stays <90 mmHg (or MAP <65 mmHg), or HRS-AKI develops.'],
    },
    {
      id: 'bleed', tick: 'Year 8', milestone: 'Bleed', days: 700, action: [BAND], cam: 'varices', labels: ['VAR'], calipers: ['varix'], tool: { kind: 'trace', range: 'talk' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'diuretics',
      kicker: 'Year 8', site: 'sin', title: 'Year 8: a first variceal bleed, on carvedilol',
      line: 'He has hematemesis from a {varix} varix. Octreotide, ceftriaxone and band ligation control it. He was already taking carvedilol. What prevents rebleeding?',
      notes: 'The acute bleed is managed as in the Acute variceal bleeding talk: a vasoactive drug, antibiotic prophylaxis and endoscopy within 12 hours. The decision here comes afterward, once he is stable. He bled despite carvedilol, so the question is whether carvedilol has failed. He is Child–Pugh B 8 with no active bleeding at endoscopy, and his HVPG, about 14 mmHg, is under the 20 mmHg of the third criterion, so he is not a preemptive TIPS candidate (Baveno VIII 5.31).',
      ask: ['A man bleeds from varices while taking carvedilol. Has carvedilol failed?', 'Not on that fact alone. Baveno VIII 4.8 combines carvedilol with banding whether or not he was taking carvedilol before.'],
    },
    {
      id: 'bands', tick: 'Carvedilol and bands', action: [BAND, BAND, BAND], cam: 'varices', labels: ['VAR'], calipers: ['varix'], tool: { kind: 'trace', range: 'talk' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'bleed',
      kicker: 'Year 8', site: 'sin', title: 'Carvedilol with banding until variceal eradication',
      line: 'Carvedilol keeps the HVPG at {hvpg}, and three banding sessions reduce the varix to {varix}.',
      notes: 'Banding obliterates the varices but leaves portal pressure unchanged; carvedilol lowers portal pressure but leaves the varices. Baveno VIII 4.8 combines them as first-line secondary prophylaxis, with carvedilol preferred, whether or not the patient was taking carvedilol before the bleed. Banding is repeated every 2 to 4 weeks until eradication.',
      ask: ['What is first-line prevention of variceal rebleeding?', 'Carvedilol with banding, whether or not carvedilol was taken before the bleed.'],
    },
    {
      // (The algorithm of Baveno VIII 4.8 to 4.10, lit for him: a bleed on top of the ascites of year 6 is not his only decompensation, so the chart adds TIPS and transplant
      // to carvedilol and banding. Carvedilol and banding go on, as the slide before says; tool-path.js.)
      id: 'path-secprop', cam: 'varices', labels: ['VAR'], calipers: ['varix'],
      tool: { kind: 'path', of: 'secprop', short: 'Next-bleed path', patient: { more: true, can: 'both' } },
      kicker: 'Year 8', site: 'sin', title: 'The bleed is not his only decompensating event',
      line: 'The algorithm first asks whether the bleed is the only decompensating event. He developed ascites at year 6, so TIPS and transplant may be considered alongside carvedilol and banding.',
      notes: 'Source: Baveno VIII 4.8 to 4.10, for a patient recovering from an esophageal variceal bleed who is not a candidate for rescue or preemptive TIPS, as he is not. If the bleed is the only decompensation, carvedilol with banding is first-line, and either is given alone if he cannot have both (4.8, 4.9). If he has also had a non-bleeding decompensating event, TIPS and liver transplant may be considered (4.10, weak). He had ascites at year 6, so the second branch is lit. Carvedilol and banding continue, as on the previous slide, and the transplant referral of year 6 becomes more pressing. TIPS is considered if he rebleeds on both, as he does at year 9.',
      ask: ['Banding and carvedilol after a bleed in a man who also had ascites. What else may be considered?', 'TIPS and liver transplantation (Baveno VIII 4.10, weak), because the bleed is not his only decompensating event.'],
    },
    {
      id: 'rebleed', tick: 'Year 9', milestone: 'Rebleed', days: 270, cam: 'liver', tool: { kind: 'profile', from: 'bands', fromLabel: 'Year 8' }, data: 'tiles', tiles: ['varix', 'liver'], key: ['hvpg'], delta: 'bands',
      kicker: 'Year 9', site: 'sin', title: 'Year 9: rebleeding on carvedilol and banding',
      line: 'Nine months later he rebleeds on carvedilol, from varices that have recurred to {varix} since banding eradicated them.',
      notes: 'TIPS is the next step: note the HVPG and the sinusoidal flow. Rebleeding makes this further decompensation. Carvedilol and banding have been given appropriately and have failed, so continuing them alone is unlikely to help. The question is what lowers portal pressure further, and Baveno VIII answers it: consider TIPS for bleeding despite secondary prophylaxis.',
      ask: ['A man rebleeds on carvedilol and repeat banding. Is TIPS considered?', 'Yes. Baveno VIII 4.13 says to consider a TIPS when bleeding continues despite secondary prophylaxis.'],
    },
    {
      id: 'tips', tick: 'TIPS', milestone: 'TIPS', params: { tips: { on: true, d: 8 } }, procedure: { kind: 'tips', then: 'tipsgrad' }, cam: 'liver', tool: { kind: 'evgraph', title: 'PPG and sinusoidal flow after TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'rebleed',
      kicker: 'Year 9', site: 'sin', title: 'TIPS when secondary prophylaxis fails',
      line: 'A covered TIPS lowers the PPG to {ppg}. The cost is portal perfusion: sinusoidal flow falls to {liver} of normal, most of it now from the hepatic artery.',
      notes: 'Baveno VIII advises considering a TIPS for bleeding despite secondary prophylaxis with carvedilol and banding (4.13). The stent creates a channel from the portal vein to a hepatic vein, so the gradient falls below the level at which varices bleed. The cost is the fraction of portal blood that bypasses the liver, and with it a risk of hepatic encephalopathy. Step 5 measures the gradient across the new stent: the same catheter records portal pressure through the stent, is withdrawn to the IVC at the level of the hepatic veins, and records again. With a post-TIPS PPG <12 mmHg, a beta-blocker is not required (AASLD 2024). The measurement just after the procedure can be affected by general anesthesia and vasoactive drugs (Baveno VIII), so it may not reflect the long-term gradient.',
      ask: ['What does a TIPS cost the liver?', 'Most of its portal perfusion, which now bypasses the liver through the stent. The hepatic arterial buffer response makes up part of the loss.'],
    },
    {
      id: 'he', lens: 'firstpass', tick: 'HE', days: 60, cam: 'liver', tool: { kind: 'flows' }, data: 'tiles', tiles: ['he', 'shunt'], key: ['he'], delta: 'tips',
      kicker: 'Year 9', site: 'sin', title: 'Two months after TIPS he has overt hepatic encephalopathy',
      line: 'He has sleep-wake inversion and psychomotor slowing. {shunt} of portal blood now bypasses the liver.',
      notes: 'TIPS reduction comes last, because a narrower stent raises the PPG. Overt hepatic encephalopathy is a recognized complication of TIPS: more portal blood reaches the systemic circulation without first-pass hepatic clearance. The first step is not the stent. A narrower stent lowers the shunt fraction but raises portal pressure again, which brings back the risk of bleeding. The model has no ammonia or brain; the fraction of portal blood that bypasses the liver stands in for the risk. The vessels show the first pass: splanchnic blood that bypasses the liver remains uncleared.',
      ask: ['What is the downside of TIPS reduction?', 'Portal pressure rises again, so varices and the risk of bleeding return.'],
    },
    {
      id: 'he-answer', tick: 'Treat first', cam: 'liver', data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'he',
      tool: { kind: 'criteria', title: 'Encephalopathy after TIPS', short: 'After TIPS', ticks: false, ordered: true, lead: 'In this order.', rule: 'Baveno VIII 6.17', rows: ['Find and treat the **precipitant** first', '**Lactulose**, and **rifaximin** after a recurrence',
        { text: 'Reduce or occlude the stent only if it persists', lit: true }] },
      kicker: 'Year 9', site: 'sin', title: 'Treat the precipitant and give lactulose before reducing the stent',
      line: 'Look for infection, GI bleeding, constipation, sedatives, hyponatremia and hypokalemia, and give lactulose. Add rifaximin after a recurrence. Reduce the stent only if encephalopathy persists.',
      notes: 'Baveno VIII 6.17 considers narrowing or closing the TIPS, or embolizing a large spontaneous shunt, for encephalopathy that comes back or persists after a TIPS despite removal of precipitants and standard medical treatment. Before an elective TIPS, rifaximin should be considered (6.16). TIPS reduction is last because it reverses part of the portal decompression.',
      ask: ['When is the TIPS reduced for hepatic encephalopathy?', 'Only when it persists or recurs despite removing the precipitant and giving lactulose and rifaximin.'],
    },
    {
      // (Baveno VIII 7.8: his TIPS stopped the bleeding, which on its own is not recompensation. The figure is the slide before's.)
      id: 'tips-recomp', tick: 'Not recompensated', cam: 'liver', data: 'tiles', tiles: ['shunt', 'ppg'], key: ['shunt'], delta: 'he',
      tool: { kind: 'criteria', title: 'Recompensation after TIPS', short: 'After TIPS', ticks: false, lead: 'The TIPS alone does not decide it.', rule: 'Baveno VIII 7.4, 7.8',
        rows: ['**Ascites** resolved by TIPS alone: not enough', '**No rebleeding** after TIPS alone: not enough', 'Every **7.4 criterion** is still needed'], verdict: 'Not recompensated: he is on lactulose for encephalopathy.' },
      kicker: 'Year 9', site: 'sin', title: 'A TIPS that ends the bleeding is not recompensation',
      line: 'After TIPS, recompensation (7.8) also requires removal of the cause, no decompensating events off treatment for >6 months, and Child–Pugh A.',
      notes: 'Baveno VIII 7.8: a patient with a TIPS can recompensate, provided every criterion in 7.4 is met. Ascites cleared by the TIPS alone, or no recurrent variceal bleeding alone, is not evidence of recompensation. 7.7 adds that a patient free of encephalopathy only because of lactulose or rifaximin has not recompensated either. This man has had no rebleeding since TIPS, but he needed treatment for hepatic encephalopathy, and the criteria ask for no events off treatment for more than 6 months.',
      ask: ['His TIPS has stopped the bleeding for a year. Has he recompensated?', 'Not on that alone. After TIPS, every 7.4 criterion must still be met, and freedom from rebleeding alone does not count (Baveno VIII 7.8).'],
    },
    {
      id: 'list', tick: 'Year 10', milestone: 'Transplant', cam: 'liver', data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Further decompensation', short: 'Decompensation', ticks: false, rule: 'Baveno VIII 4.1, 6.1', rows: [{ text: '≥2 events: ascites, bleeding, encephalopathy, jaundice', note: 'Three kinds', met: true, lit: true },
        'Or **rebleeding**, recurrent **HE**, or **≥3** LVPs in a year'], verdict: 'He meets the first: the listing decision is due now.' },
      kicker: 'Year 10', site: 'sin', title: 'Year 10: three decompensating events',
      line: 'He has had ascites, two variceal bleeds and hepatic encephalopathy: further decompensation. Referred at year 6, he now faces the listing decision. The TIPS treated portal hypertension, not cirrhosis.',
      notes: 'Further decompensation carries a higher mortality than first decompensation. Baveno VIII 6.1 recommends transplant evaluation for these patients, and 4.3 says to consider it in everyone with decompensated cirrhosis. The TIPS treated the portal hypertension but not the cirrhosis, and the liver receives only the fraction of its blood flow shown in the tile. (Baveno VIII 4.1, 6.1.)',
      ask: ['When should he have been referred for transplant evaluation?', 'At his first decompensation, the ascites of year 6 (Baveno VIII 4.3 says to consider it). Further decompensation makes the evaluation a strong recommendation (6.1).'],
    },
    {
      // (The stages of Baveno VIII Fig. 2 again, lit for him at year 10: the talk opened on this chart at year 0. The figure is the slide before's.)
      id: 'path-ladder-end', cam: 'liver',
      tool: { kind: 'path', of: 'ladder', short: 'Stages', patient: { s: 3, rc: false } },
      kicker: 'Year 10', site: 'sin', title: 'He ends at the fourth of four stages',
      line: 'He began at the first stage, compensated. Ascites, two variceal bleeds and hepatic encephalopathy have taken him to the fourth, further decompensation, where Baveno VIII recommends transplant evaluation.',
      notes: 'Source: Baveno VIII Fig. 2, 4.1, 6.1. The same chart as at year 0, with the last stage lit. Further decompensation is a second decompensating event, a rebleed, recurrent overt encephalopathy, SBP or HRS-AKI, or ascites that needs 3 or more large-volume paracenteses in a year (4.1). It carries a higher mortality than the first decompensation, and these patients should be evaluated for liver transplant (6.1). Each treatment over the ten years lowered portal pressure for a time; none moved him back a stage, and the cause was never removed. A patient who recompensates can move back (7.4), which this man did not.',
      ask: ['Where does the chart place him at year 10, and what does it advise?', 'At the fourth stage, further decompensation: liver transplant evaluation (Baveno VIII 6.1).'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', title: 'Ten years on one chart', style: 'milestones', bands: ['carvedilol', 'diuretics', 'tips'] },
      kicker: 'Summary', site: 'sin', title: 'Ten years on one chart',
      line: 'The HVPG rose with fibrosis and fell with each treatment. Carvedilol and the TIPS lowered it, but neither halted progression of the liver disease.',
      notes: 'The chart plots the HVPG at each step, shades the treatments while they were on, and names the milestones above the line. Each treatment lowered portal pressure for a time. The cause was never removed, so the liver disease kept progressing.',
      ask: ['What did the TIPS treat, and what did it not?', 'It treated the portal hypertension and the bleeding. It did not treat the underlying liver disease.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, read the varix and
      // its wall stress against the HVPG, as on the Varices talk. The dots are his visits, joined in order (years 6 to 9 are one: the
      // HVPG and the varix hardly move between the ascites and the rebleed); the ring is him after the TIPS, the slide before's state.)
      id: 'relation', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'], walk: true,
        dots: [{ slide: 'd0', name: 'Year 0', on: [0] }, { slide: 'd365', name: 'Year 2', on: [0] }, { slide: 'carv', name: 'Carvedilol', on: [0] }, { slide: 'ascites', name: 'Years 6 to 9', on: [0] },
          { slide: 'bands', name: 'Bands', on: [0] }, { slide: 'tips', name: 'TIPS', on: [0] }] },
      kicker: 'Summary', site: 'sin', title: 'Ten years on one line: the varix follows the HVPG',
      line: 'Carvedilol lowered his HVPG from {hvpg@d365} to {hvpg@carv}, and the TIPS from {hvpg@rebleed} to {hvpg@tips}. The varix lags, so both dots lie above the line; banding put it below.',
      notes: 'The line is the model\'s cirrhosis from mild to severe, each point at steady state after a year, with the varix (left) and its wall stress as a fraction of the rupture threshold (right) against the HVPG, as on the Varices talk. The dots are this talk\'s visits. Carvedilol at year 2 and the TIPS at year 9 lowered the HVPG, but a varix regresses over weeks to months, so their dots still lie above the line; left alone, the varix would return to it, down to its resting 2 mm on the flat part. Banding obliterated the varix without changing portal pressure, so it lies below the line, and the varix grows back to the line within months (see Preventing the next variceal bleed). The ring is him after the TIPS. The cause was never removed, so each treatment bought time and none ended the climb. Wall stress rises faster than the diameter because it grows with both the transmural pressure and the radius (Laplace\'s law; AASLD 2024 p. 1193). Baveno VIII 4.8 combines carvedilol with banding after a bleed, and 4.13 says to consider a TIPS when bleeding continues. One model patient per point; real patients vary far more.',
      ask: ['Which of his treatments moved the varix without moving the HVPG?', 'Banding: it obliterates the varix but leaves portal pressure unchanged, so the varix recurs after the bands slough.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix', 'asc', 'shunt'], asc: false, rowHead: 'Step', vs: 'first', focusRow: 'tips',
      of: [{ id: 'd0', kicker: 'Year 0', title: 'Compensated' }, { id: 'carv', kicker: 'Year 2', title: 'CSPH, carvedilol' }, { id: 'diuretics', kicker: 'Year 6', title: 'Ascites, diuretics' },
        { id: 'bands', kicker: 'Year 8', title: 'First bleed, banding' }, { id: 'tips', kicker: 'Year 9', title: 'Rebleed, TIPS' }, { id: 'he', kicker: 'Year 9', title: 'Encephalopathy' }],
      kicker: 'Summary', site: 'sin', title: 'Each treatment bought time, none removed the cause',
      line: 'Each treatment lowered portal pressure for a time. Each decision followed a guideline, and the last is the transplant evaluation.',
      notes: 'Read the rows from the top. The HVPG, varices and ascites show where each treatment helped, and the shunt column shows the shunt fraction the TIPS created. Removing the cause would have been the best treatment; in this case it never happened.',
      ask: ['Which treatment lowered the HVPG the most in this case?', 'The TIPS. It also sent the most portal blood past the liver.'],
    },
  ],
};
