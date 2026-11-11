// Presenter talk: liver stiffness, the spleen and the platelets, then five compensated patients at a first visit, each placed on Baveno
// VIII's stiffness and platelet zones (the slide fields are described at the top of decks.js). Each case is one slide: its case card asks,
// and the plane and the two tiles answer. Case 5 is the patient the zones do not fit.

// (The plane already plots the stiffness and the platelets, so the tiles beside it give the other two measures the zones stand in for: the spleen stiffness,
// which Baveno VIII 1.16c and 1.19 add to the liver's, and the HVPG.)
const PLANE = { kind: 'plane', plane: 'csph' };

export const STIFFNESS = {
  id: 'stiffness', level: 'core', title: 'Stiffness, platelets and the first visit', minutes: 15,
  sections: [['The measurements', ['Liver stiffness', 'The spleen and the platelets', 'Spleen stiffness']], ['The first visit', ['The rules', 'Case 1', 'Case 2', 'Case 3', 'Case 4', 'Case 5']],
    ['Where stiffness misleads', ['Where stiffness misleads']]],
  objectives: [
    'Explain what a FibroScan reading in kPa measures, and why a large spleen and low platelets point to portal hypertension',
    'Rule CSPH out or in from the stiffness and the platelet count, and name the next step in the indeterminate zone',
    'Decide who needs a screening scope and who starts carvedilol',
    'Recognize when the rules mislead: congestion, a BMI ≥30, a soft liver with portal hypertension',
  ],
  checks: [
    ['The stiffness is 13 kPa and the platelets are 180,000/µL. Is CSPH present, and is a screening scope needed?', 'CSPH is ruled out (≤15 kPa with platelets ≥150,000/µL), so no carvedilol and no scope. Repeat both in 12 months.'],
    ['What stiffness rules CSPH in at a first visit, and in whom does it not apply?', '≥25 kPa, in viral and alcohol-related cirrhosis and in MASLD with a BMI <30. At a BMI ≥30, ANTICIPATE-NASH decides.'],
    ['A patient in the indeterminate zone cannot take carvedilol. What spares the screening scope?', 'A stiffness <20 kPa with platelets of ≥150,000/µL, or a spleen stiffness <40 kPa. Otherwise the scope goes ahead.'],
    ['Name two situations where stiffness misleads.', 'A recent meal and heart failure congestion raise it. Presinusoidal resistance, such as schistosomiasis, keeps it low despite high portal pressure.'],
  ],
  summary: 'FibroScan, spleen size and the platelet count against the portal gradient, then five compensated patients at a first visit: Baveno VIII\'s stiffness and platelet zones, the indeterminate zone, the scope, carvedilol, and the patients the rules do not fit.',
  slides: [
    {
      id: 'measure', preset: 'healthy', cam: 'liver', tool: { kind: 'fibroscan' },
      kicker: 'Liver stiffness', site: 'sin', title: 'A shear wave measures stiffness',
      line: 'A probe on the skin sends a shear wave through the liver. The faster it travels, the stiffer the liver. Below about 7 kPa is normal.',
      notes: 'Transient elastography (FibroScan) times a shear wave through the right lobe and reports the stiffness in kPa: the median of ten valid readings, with an interquartile range under 30% of the median. A healthy liver reads 4 to 6 kPa. Obesity, narrow intercostal spaces and ascites make readings fail or less reliable; the XL probe helps in obesity. Shear-wave elastography on an ultrasound machine gives similar values with its own cut-offs.',
      ask: ['What does a FibroScan actually time?', 'A shear wave crossing the liver: the faster it goes, the stiffer the tissue.'],
    },
    {
      id: 'fibrosis', preset: 'cirr-comp', cam: 'liver', cutouts: ['lobule', 'sinusoid'], glow: ['liver'], tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: 'measure',
      whatIf: { label: 'Scarring', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      kicker: 'Liver stiffness', site: 'sin', title: 'Fibrosis stiffens the liver',
      vignette: 'A 50-year-old man with chronic hepatitis B, lost to follow-up for years, is referred for staging. He feels well, and his platelets are 159,000/µL.',
      line: 'Stiffness is {lsm}, with an HVPG of {hvpg}. A stiffness <10 kPa makes advanced chronic liver disease unlikely and >15 kPa highly likely.',
      notes: 'Baveno VIII: below 10 kPa, compensated advanced chronic liver disease (cACLD) is unlikely without other signs; 10 to 15 kPa suggests it; over 15 kPa makes it highly likely. Stiffness also rises with inflammation (a hepatitis flare, alcohol), cholestasis and congestion, so a high reading is read against the whole picture. In the model stiffness follows the sinusoidal gradient and the hepatic vein pressure, which is why it climbs with the HVPG. It tracks the gradient up to about 12 mmHg and only loosely above it, and the model\'s stiffness follows the gradient more closely than a patient\'s does.',
      ask: ['Why can stiffness rule CSPH in or out, yet not follow a gradient >12?', 'Above 10 to 12 mmHg the gradient rises mostly with inflow and vascular tone, which stiffness does not see.'],
    },
    {
      id: 'spleen', terms: ['spleen'], preset: 'csph', cam: 'spleen', glow: ['spleen'], calipers: ['spleen'], normalOutline: ['spleen'], data: 'tiles', tiles: ['spleen', 'plt'], key: ['plt'], delta: 'fibrosis',
      kicker: 'The spleen and the platelets', site: 'sin', title: 'A large spleen sequesters platelets',
      vignette: 'A 63-year-old woman with MASH cirrhosis has had a lower platelet count at each yearly visit. She feels well and has never had ascites or bleeding.',
      line: 'The dashed outline is a normal spleen. Hers measures {spleen} and traps platelets, which have fallen to {plt}.',
      notes: 'A falling platelet count is often the first sign in the blood tests. Splenic congestion and hyperplasia enlarge the spleen; a normal spleen already holds about a third of the platelets and an enlarged one up to about 90%, and a lower thrombopoietin from the liver adds to the fall. Spleen length over about 12 to 13 cm and platelets below 150 support portal hypertension. Spleen stiffness, where available, tracks the portal pressure more closely than liver stiffness, including in presinusoidal disease. The tile compares with the compensated patient of "Fibrosis stiffens the liver".',
      ask: ['Give two reasons the platelet count falls in portal hypertension.', 'Splenic pooling in a large congested spleen, and less thrombopoietin from the liver.'],
    },
    {
      // (The same patient as the slide before, her spleen on the 100 Hz probe: the model's spleen stiffness, ssm-cuts.js.)
      id: 'ssm', terms: ['spleen'], preset: 'csph', cam: 'spleen', glow: ['spleen'], tool: { kind: 'fibroscan', organ: 'spleen' }, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm'],
      whatIf: { label: 'Scarring', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      kicker: 'Spleen stiffness', site: 'sin', title: 'Spleen stiffness follows the portal pressure',
      line: 'Her spleen stiffness is {ssm}, with an HVPG of {hvpg}. On the 100 Hz probe, {>55 kPa} rules CSPH in and {<40 kPa} spares the screening scope.',
      notes: 'The spleen drains through the splenic vein into the portal vein, so its red pulp is distended by the portal pressure itself, and an encapsulated organ stiffens as it fills. Months of congestion add hyperplasia and fibrosis of the pulp, which keep it stiff after the pressure falls. In the model the spleen stiffness is worked out from these two: the pressure in the spleen less the abdomen\'s, and the spleen\'s size. A healthy spleen reads about 17 kPa; this patient, with an HVPG just over 10, sits in the indeterminate zone between 40 and 55. Above an HVPG of about 10, spleen stiffness follows the gradient more closely than liver stiffness, and it reads high in pre-hepatic and presinusoidal disease, where the liver is soft. In the model it falls within days of a TIPS, unlike liver stiffness, and it follows a beta-blocker; AASLD 2024 gives neither stiffness a role in monitoring the HVPG. Baveno VIII says spleen stiffness may improve the classification of CSPH (1.13): on the 100 Hz probe, >55 kPa establishes CSPH in cACLD of any cause (1.16c), and <40 kPa spares the screening endoscopy in a patient who cannot take a beta-blocker (1.19). In recompensated cirrhosis, a liver stiffness <15 kPa with a spleen stiffness <25 kPa may rule CSPH out (7.19b). NICER combines liver and spleen stiffness with the platelets and the BMI (1.14). Baveno VII\'s cut-offs, <21 and >50 kPa, came from the older 50 Hz probe in viral hepatitis. Drag Scarring to move her across the cut-offs.',
      ask: ['Why does spleen stiffness stay high in portal vein thrombosis when the liver stiffness is normal?', 'The spleen is congested by the portal pressure wherever the block lies; the liver stiffness sees only the liver.'],
    },
    {
      id: 'rules', preset: 'healthy', cam: 'liver', glow: ['liver'],
      tool: { kind: 'criteria', title: 'Baveno VIII at a first visit', short: 'First visit', ticks: false, lead: 'Fasting LSM + CBC.', rule: 'Baveno VIII 1.15, 1.16, 1.19', zones: 'first-visit', key: [
        { text: '**Hatched:** can skip EGD', swatch: 'hatch' },
        '**Indeterminate:** ANTICIPATE ≥75% or SSM >55 kPa = CSPH',
        '**MASLD, BMI ≥30:** ANTICIPATE-NASH, not 25 kPa'] },
      kicker: 'The rules', title: 'Stiffness and platelets sort most patients at a first visit',
      line: 'Baveno VIII draws three zones on stiffness and platelets: CSPH ruled out, CSPH ruled in, and an indeterminate zone between.',
      notes: 'These rules are for compensated advanced chronic liver disease, with the stiffness measured fasting: a meal raises it by a fifth or more for two to three hours, and a hepatitis flare raises it too, so repeat the scan once the ALT settles. A stiffness of 10 to 15 kPa suggests advanced disease and over 15 kPa makes it highly likely. The 25 kPa rule-in holds for viral and alcohol-related disease and for MASLD with a BMI under 30. The indeterminate zone is settled by a validated model, ANTICIPATE (ANTICIPATE-NASH when the BMI is 30 or more), or by a spleen stiffness over 55 kPa, and an indeterminate result can be repeated in 12 months. A patient who cannot take a non-selective beta-blocker has a screening endoscopy, unless the stiffness is under 20 kPa with platelets of 150,000/µL or more, or the spleen stiffness is under 40 kPa. A first visit asks little of the patient: a fasting FibroScan and a blood count. (Baveno VIII 1.15, 1.16, 1.19.)',
      ask: ['Which two numbers does a first visit use, and what are the three zones?', 'Liver stiffness and the platelet count. CSPH ruled out, CSPH ruled in, or an indeterminate zone in between.'],
    },
    {
      // (The chart of the rules slide, lit for a patient: the first-visit path of Baveno VIII Fig. 1, from the model's stiffness, platelets and spleen
      // stiffness. ANTICIPATE is not in the model, so the card takes it as under 75% unless the slide's patient says otherwise. tool-path.js.)
      id: 'path', preset: 'cirr-comp', params: { cirrhosis: 0.55 }, cam: 'liver', glow: ['liver'],
      tool: { kind: 'path', of: 'first-visit', short: 'First-visit path' },
      whatIf: { label: 'Scarring', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      kicker: 'The rules', title: 'Her numbers place her on the chart',
      line: 'Her stiffness is {lsm} and her platelets {plt}. The lit branches are her path through the Baveno VIII chart; drag Scarring and she moves along it.',
      notes: 'This is the first-visit chart of Baveno VIII (Fig. 1) for a patient with suspected compensated advanced chronic liver disease, lit for the patient on the slide. A stiffness under 10 kPa rules cACLD out (1.3), and the tests are repeated by cause. A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out (1.15): repeat the stiffness in 12 months. A stiffness of 25 kPa or more rules CSPH in (1.16b) in viral and alcohol-related disease and in MASLD with a BMI under 30, and carvedilol is started. Between the two, or with platelets under 150,000/µL, is the indeterminate zone (1.17): an ANTICIPATE probability of 75% or more (ANTICIPATE-NASH at a BMI of 30 or more), a NICER probability of 75% or more, or a spleen stiffness over 55 kPa (1.14, 1.16) rules CSPH in. If none does, repeat the tests in 12 months or add the spleen stiffness, and a patient who cannot take a beta-blocker has the screening scope unless the stiffness is under 20 kPa with platelets of 150,000/µL or more, or the spleen stiffness is under 40 kPa (1.19). On the slide the stiffness is about 21 kPa and the platelets about 160,000/µL, so she is in the indeterminate zone, and her spleen stiffness of about 35 kPa does not rule CSPH in. ANTICIPATE is not in the model, so the chart takes it as under 75%. Drag Scarring to carry her through the chart: her stiffness crosses 10, 15 and 25 kPa. Baveno VIII Fig. 1 prints the spleen stiffness cut-off as 55 kPa or more where its statement 1.16c says over 55; the chart follows the statement.',
      ask: ['A patient in the indeterminate zone has an ANTICIPATE probability <75% and a spleen stiffness of 48 kPa. Is CSPH ruled in?', 'No. It takes an ANTICIPATE probability ≥75% or a spleen stiffness >55 kPa. Repeat the tests in 12 months, or add the spleen stiffness.'],
    },
    {
      // (The same patient on AASLD's chart: the rule of five of Fig. 3, from the model's stiffness and platelets; path-algos/aasld.js. Her platelets
      // sit above 150, so the two charts agree here and part where they are lower.)
      id: 'aasld', preset: 'cirr-comp', params: { cirrhosis: 0.55 }, cam: 'liver', glow: ['liver'],
      tool: { kind: 'path', of: 'aasld', short: 'Rule of five' },
      kicker: 'The rules', title: 'AASLD\'s rule of five leaves her in the indeterminate zone too',
      line: 'Her stiffness is {lsm} and her platelets {plt}: neither side of the rule of five, and the indeterminate zone of the Baveno VIII chart. The two part at platelets <150,000/µL.',
      notes: 'This is the rule of five of AASLD 2024 (Fig. 3, guidance statement 7), lit for the same patient. It uses the stiffness by transient elastography and the platelet count. CSPH is presumed at a stiffness of 25 kPa or more whatever the platelets, at 20 to 24.9 kPa with platelets under 150,000/µL, or at 15 to 19.9 kPa with platelets under 110,000/µL; it is excluded under 15 kPa with platelets of 150,000/µL or more. Everything else is not settled, and spleen stiffness or the HVPG can decide. Baveno VIII draws the first-visit chart differently (1.15 to 1.17): CSPH is ruled out at 15 kPa or less with platelets of 150,000/µL or more and ruled in at 25 kPa or more, and between them is the indeterminate zone until ANTICIPATE, NICER or a spleen stiffness over 55 kPa decides. So the two part in three places: at 20 to 25 kPa with platelets under 150,000/µL, and at 15 to 20 kPa with platelets under 110,000/µL, AASLD presumes CSPH where Baveno VIII stays in the indeterminate zone; and at exactly 15 kPa Baveno VIII rules CSPH out where AASLD does not. On the slide her stiffness is about 21 kPa and her platelets about 160,000/µL, above the 150,000/µL line, so she is in the indeterminate zone on both charts. Case 3 below has the same stiffness with platelets near 100,000/µL: AASLD would presume CSPH, and Baveno VIII leaves him in the indeterminate zone. AASLD advises care with the rule in obesity with MASLD, an ALT over 3 times the upper limit, and primary sclerosing cholangitis with a dominant stricture, where it is less well calibrated.',
      ask: ['A patient has a stiffness of 22 kPa and platelets of 120,000/µL. What do AASLD 2024 and Baveno VIII each say?', 'AASLD presumes CSPH (20 to 24.9 kPa with platelets <150,000/µL). Baveno VIII leaves him in the indeterminate zone until ANTICIPATE or a spleen stiffness >55 kPa decides.'],
    },
    {
      id: 'a1', preset: 'cirr-comp', cam: 'liver', glow: ['liver'], tool: PLANE, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'],
      vignette: 'A 47-year-old man had hepatitis C diagnosed ten years ago and was never treated. He feels well, drinks no alcohol and has had no ascites or bleeding.',
      caseQ: 'Is CSPH ruled out, ruled in or still open?',
      kicker: 'Case 1', site: 'sin', title: 'Case 1: CSPH is ruled out',
      line: 'Stiffness is {lsm}, platelets {plt}: ≤15 kPa with ≥150,000/µL rules CSPH out. No carvedilol, no scope; repeat both in 12 months.',
      notes: 'Baveno VIII rules CSPH out when the stiffness is 15 kPa or less and the platelets are 150,000/µL or more; fewer than 1 in 10 patients with that result have CSPH. Without CSPH a non-selective beta-blocker is not used to prevent decompensation, and under 20 kPa with such platelets the screening scope is spared as well. A stiffness of 10 to 15 kPa still suggests advanced liver disease, so he stays in follow-up with both tests repeated every 12 months, and the hepatitis C is treated. The cause matters for the next cases, because the rule-in applies to viral and alcohol-related disease and to MASLD with a BMI under 30. His spleen stiffness, on the card, is well under the 40 kPa that spares the scope. (Baveno VIII 1.9, 1.15, 1.19.)',
      ask: ['Does he need a screening scope or carvedilol?', 'Neither. CSPH is ruled out, so repeat the stiffness and the platelets in 12 months.'],
    },
    {
      id: 'a2', preset: 'csph', params: { cirrhosis: 0.8 }, cam: 'liver', glow: ['liver'], tool: PLANE, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'],
      vignette: 'A 58-year-old woman with alcohol-associated cirrhosis stopped drinking two years ago. She has had no ascites, confusion or bleeding, and has never had an EGD.',
      caseQ: 'Is CSPH ruled in, and does she need a scope?',
      kicker: 'Case 2', site: 'sin', title: 'Case 2: CSPH is ruled in',
      line: 'Stiffness is {lsm}, which meets the {>=25 kPa} rule: CSPH is ruled in without a catheter. She starts carvedilol, and on carvedilol she needs no screening scope.',
      notes: 'In viral or alcohol-related cirrhosis, and in MASLD with a BMI under 30, a stiffness of 25 kPa or more establishes CSPH. Baveno VIII then recommends a non-selective beta-blocker, preferably carvedilol, to prevent decompensation. A patient already on one needs no screening endoscopy, because what it finds would not change treatment. She has never had an endoscopy, so the scope is part of the question. Her spleen stiffness, on the card, is also over 55 kPa, which alone establishes CSPH on the 100 Hz probe (1.16c). Staying off alcohol remains the most effective treatment of the cause. (Baveno VIII 1.16, 3.15, 3.18.)',
      ask: ['Does she need a screening EGD before carvedilol?', 'No. She takes a non-selective beta-blocker for CSPH, so the scope would not change her treatment.'],
    },
    {
      id: 'a3', preset: 'cirr-comp', params: { cirrhosis: 0.55 }, days: 365, cam: 'liver', glow: ['liver'], tool: PLANE, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'],
      vignette: 'A 61-year-old man with MASH and type 2 diabetes has a BMI of 27 and no ascites or bleeding. An ultrasound shows a nodular liver and a spleen larger than normal.',
      caseQ: 'Which zone is he in, and what comes next?',
      kicker: 'Case 3', site: 'sin', title: 'Case 3: CSPH is still open',
      line: 'Stiffness is {lsm}, platelets {plt}: neither rule applies. ANTICIPATE ≥75%, or a spleen stiffness >55 kPa, makes the diagnosis. Until then, off a beta-blocker, he needs a screening endoscopy.',
      notes: 'Between 15 and 25 kPa, or with platelets under 150,000/µL, Baveno VIII does not decide on the stiffness alone. He is not obese, so the rules and the model both apply. ANTICIPATE estimates the chance of CSPH from the stiffness and the platelets, and a spleen stiffness over 55 kPa on the 100 Hz probe also establishes it. The spleen is larger than normal, which fits portal hypertension but does not decide it. Until one of them settles it, he is off a beta-blocker with a stiffness over 20 kPa and platelets under 150,000/µL, so the scope-sparing rule does not apply and he needs a screening endoscopy now; the indeterminate-zone tests are repeated in 12 months. His spleen stiffness, on the card, falls between 40 and 55 kPa: too high to spare the scope (<40 kPa, 1.19) and too low to establish CSPH (>55 kPa, 1.16c), which is why the indeterminate zone stays open. Most centers do not need a catheter for this decision. (Baveno VIII 1.16, 1.17.)',
      ask: ['What are two ways to settle an indeterminate-zone result without a catheter?', 'A validated model (ANTICIPATE, ≥75%) or a spleen stiffness >55 kPa. Meanwhile, off a beta-blocker, he has a screening endoscopy.'],
    },
    {
      id: 'a4', preset: 'csph', params: { cirrhosis: 0.7 }, cam: 'liver', glow: ['liver'], tool: PLANE, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'],
      vignette: 'A 49-year-old man with MASH and type 2 diabetes has a BMI of 36 and no ascites or bleeding. His platelets have been low for two years, and an ultrasound shows a nodular liver.',
      caseQ: 'Does his stiffness rule CSPH in?',
      kicker: 'Case 4', site: 'sin', title: 'Case 4: the BMI decides, not the stiffness',
      line: 'Stiffness is {lsm}, but the 25 kPa rule needs a BMI <30. At a BMI of 36 a BMI model decides, or a spleen stiffness >55 kPa ({ssm}).',
      notes: 'The 25 kPa rule-in covers viral and alcohol-related cirrhosis and MASLD with a BMI under 30. For MASLD with a BMI of 30 or more, Baveno VIII uses ANTICIPATE-NASH, built on the stiffness, the platelets and the BMI. The stiffness here is as high as in case 2, but the cause is MASH and the BMI is 36, so check the case before reading the zone. The BMI limit applies to the liver stiffness only: a spleen stiffness >55 kPa on the 100 Hz probe establishes CSPH at any BMI (1.16c), and his reading, on the card, sits close to that line. If either test says CSPH, carvedilol starts, as in case 2. (Baveno VIII 1.14, 1.16.)',
      ask: ['Why does a stiffness ≥25 kPa rule CSPH in for case 2 but not for case 4?', 'The 25 kPa rule is for a BMI <30. At a BMI of 36, ANTICIPATE-NASH or a spleen stiffness >55 kPa decides.'],
    },
    {
      id: 'a5', preset: 'schisto', cam: 'liver', glow: ['liver', 'spleen'], tool: PLANE, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'],
      vignette: 'A 41-year-old man from the Nile Delta was treated for schistosomiasis as a boy. He now has a large spleen, low platelets and normal liver tests, and an EGD shows large esophageal varices.',
      caseQ: 'Do the zones apply to him?',
      kicker: 'Case 5', site: 'presin', title: 'Case 5: the rules do not fit a soft liver',
      line: 'Stiffness is {lsm}, yet the spleen is {spleen} and the varices are large. A soft liver with portal hypertension points to vascular liver disease, so the zones do not apply.',
      notes: 'The stiffness and platelet rules were built for compensated advanced chronic liver disease, so ask first whether they were written for a patient like this one. A stiffness under 10 kPa with clinical or imaging signs of portal hypertension should raise the suspicion of vascular liver disease, such as portosinusoidal vascular disorder or schistosomiasis. The dot sits on the plane, but the zones were not drawn for him. The HVPG would read near normal, because the wedged catheter reads the sinusoids and the resistance lies upstream of them. Doppler of the portal vein and imaging come next. His spleen stiffness, on the card, reads high (>55 kPa) while the liver stiffness stays low. (Baveno VIII 1.6.)',
      ask: ['Why can the HVPG be normal when the resistance lies in the portal venules?', 'The wedged catheter reads the sinusoids, and the resistance lies before them, in the portal venules.'],
    },
    {
      id: 'heart', preset: 'rhf', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ra'], key: ['lsm', 'ra'],
      kicker: 'Where stiffness misleads', site: 'cardiac', title: 'Congestion stiffens the liver',
      vignette: 'A 70-year-old woman with severe TR is admitted with heart failure and ascites. A FibroScan done for raised liver enzymes reads in the cirrhosis range.',
      line: 'Readings >25 kPa are common in decompensated heart failure and fall within days of diuresis. Check the jugular venous pressure and get an echocardiogram before calling it cirrhosis.',
      notes: 'Raised right atrial pressure fills the hepatic veins and sinusoids and stiffens the liver; readings over 25 kPa are common in decompensated heart failure and fall within days of diuresis. The HVPG is normal because the wedged and free pressures rise together. Hepatic outflow resistance (Budd–Chiari syndrome) does the same. Check the jugular venous pressure and an echocardiogram before reading a high stiffness as fibrosis.',
      ask: ['Stiffness 32 kPa and a raised jugular venous pressure. What is going on?', 'Congestion from the right heart, not cirrhosis.'],
    },
    {
      // (Baveno VIII 1.4, 1.10 and 2.3: how to take and read the number. The patient is a compensated one at a repeat scan.)
      id: 'reliable', preset: 'cirr-comp', cam: 'liver', glow: ['liver'], data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      tool: { kind: 'criteria', title: 'Trusting a stiffness reading', short: 'Trust the reading', ticks: false, lead: 'Before you act on the number.', rule: 'Baveno VIII 1.4, 1.10, 2.3',
        rows: ['Measure it **fasting**', 'Index reading **≥10 kPa**: repeat it or add a second test', 'Act on the **most recent** reading', 'In alcohol-related disease, a confirmed change of **≥30%** matters'] },
      kicker: 'Where stiffness misleads', site: 'sin', title: 'A stiffness reading is only as good as how it was taken',
      line: 'Measure fasting, repeat or confirm a reading ≥10 kPa, and act on the latest value. In alcohol-related disease, a confirmed change of ≥30% matters.',
      notes: 'Baveno VIII 1.4: liver stiffness is always measured fasting, for the diagnosis of cACLD and of CSPH alike. When the index reading is ≥10 kPa, repeat it, or add another validated test for advanced fibrosis to confirm cACLD. 1.10: changes in stiffness carry prognostic information, but the most recent value should guide the decision. 2.3: in alcohol-related cACLD, a confirmed relative change of ≥30% goes with a matching change in the risk of liver-related events. Congestion and body size are the other two ways a number misleads, on the slides before. The model gives a single stiffness for the patient; it does not show the spread between repeated readings.',
      ask: ['A FibroScan done after breakfast reads 22 kPa. What do you do?', 'Repeat it fasting. Stiffness is always measured fasting, and a reading ≥10 kPa is repeated or confirmed with a second test (Baveno VIII 1.4).'],
    },
    {
      id: 'relation', preset: 'schisto', cam: 'liver', glow: ['liver', 'spleen'],
      // (The relation chart before the summary: the model's cirrhosis from none to severe, each point settled for a year, read
      // stiffness against the HVPG and the platelets. Case 5 is the ring; no case dots (Mohammad, 11 Nov: "remove the cases").)
      tool: { kind: 'curve', x: 'lsm', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['hvpg', 'plt'],
        xCuts: [15, 25] },
      kicker: 'Summary', title: 'Stiffness follows the HVPG only in cirrhosis',
      line: 'Along the line, stiffness climbs with the HVPG as the platelets fall. Case 5 sits far off it: {lsm} with platelets of {plt}.',
      notes: 'The lines are the model\'s cirrhosis from none to severe, each point settled for a year: stiffness on the x axis, the HVPG and the platelets against it. In cirrhosis the three move together, which is why stiffness and platelets can stand in for the catheter at a first visit. The HVPG climbs faster above about 25 kPa, where stiffness has stopped tracking the gradient closely (AASLD 2024: above an HVPG of 10 mmHg, spleen stiffness follows it better than liver stiffness). Cases 1 and 2 sit on the line. Case 5, the ring, has a soft liver with low platelets and large varices: the resistance lies before the sinusoids, so neither line describes him (EASL 2025: stiffness is normal or only slightly raised in PSVD and chronic portal vein thrombosis). The heart failure patient has a stiff liver with a normal HVPG, because congestion stiffens it. (Baveno VIII 1.6, 1.15, 1.16; AASLD 2024 statement 7.) One model patient per point; real patients vary far more.',
      ask: ['Why does case 5 sit so far below the platelet line?', 'His resistance is before the sinusoids: the portal pressure and the spleen are high, but the liver is soft.'],
    },
  ],
};
