# Ranked ideas: new decks, formats and changes

The judge step of the review ranked 15 ideas, merged from three idea sets (curriculum gaps, engine-first and learning science) and the seven deck reviews. Each idea was scored for teaching value, guideline relevance, engine readiness and effort. This file prints the full outlines. [DECK_REVIEW.md](../DECK_REVIEW.md) gives the short version and the corrections from the render check, which override the outlines below where they disagree.

Outline rows read: section | slide title | fields and line.

## Corrections from the render check

Read these before building from the outlines:

- Rank 4 (disease clock): pregnancy/after must drop `params: { gestation: 0 }` or the lapse starts from the postpartum state and runs backward. one-year/d180 should keep its jump until the scope grade has hysteresis (it flickers between None and F1, once F2 with red wale). Word every lapse line as the end point, because the line's tokens show the end values from the first frame.
- Rank 4: any new lapse with its own patient must carry `params`, and its ramp's first values must match the chain's state, or day 1 jumps.
- Rank 5 (contrast pairs): ascites/bc keeps its 'Clot in hepatic veins' mark and glow on the heart-failure patient, because marks are slide-level. Put the buttons on ascites/hf (no mark) instead. doppler/rhf only after the owner has watched the handover on an iPad (a brief 'To-and-fro' reading was captured). stiffness/schisto works; trim its tiles so the FibroScan picture stays unfolded on desktop.
- Cross-cutting 'live controls': do not add spleen/pse splenectomy or embolization buttons yet. Platelets jump from 96 to 380 in one step, the spleen tile reads '0.0 cm', and the spleen does not fade on the figure.
- Cross-cutting 'one home per idea': varices/umbilical should use lens 'flow', not 'direction'. In 'direction' the paraumbilical vein is drawn in the 'Usual' color because C3 is defined from the left portal vein outward.
- Cross-cutting 'small code': do not reword the Doppler pulsatility to VExUS bands until it is computed per heartbeat. Today it includes breathing, so a healthy portal vein reads 0.44 to 0.49 and would be called mildly abnormal.
- Cross-cutting pvt-cirrhosis attribution 'Baveno VII and EASL 2025' breaks house rule 13 (never Baveno VII in learner text). Use 'EASL 2025' alone, or no name.
- Param buttons (liveSet) stop updating tiles 7 s after the press and can freeze mid-ease. For two-inflows/switch use a patient button: `{ label: 'Buffer off', preset: 'pvt-acute', params: { habrStrength: 0 } }`.
- On a phone, a slide with a tool shows only the instrument and hides the tiles. A change whose point is a tile is invisible on the iPhone unless the slide drops its tool.


## 1. New deck: Encephalopathy and the blood that skips the liver (new-deck)

**Merged from:** Curriculum gaps idea 1: new deck 'Encephalopathy and the blood that skips the liver'; Ascites review: proposed deck 'encephalopathy' (fold shunts/srs and wide); Shunts review: srs embolization compare (occluded C6 open/closed); Curriculum gaps idea 6: shunts split (srs and wide leave shunts); Treatment review: 'cost' slide (HE rate, rifaximin, no absolute MELD cut-off)

**Scores:** Teaching value 5: it is the only major decompensating event without a deck, and residents meet it every week. Guideline relevance 5: ACG 2026 HE guideline, Baveno VIII's new statement on HE after TIPS, EASL 2025 on rifaximin before TIPS. Engine readiness 4: every state runs today (C6 open and closed, stent width), but there is no ammonia or brain, so the shunted share stands in for the risk. Effort 3 (moderate): 8 slides, 2 slides moved from shunts, 3 new case cards.

**Outline:**

- First pass | In health, all gut blood passes through the liver | preset 'healthy', cam 'liver', lens 'origin', sites ['split'], data 'tiles', tiles ['shunt','liver'], key ['shunt']; no case (healthy reference). line: 'Colored by origin, gut and spleen blood fills the sinusoids, so the liver clears what the gut absorbs and {shunt} of portal blood bypasses it.' caveat: 'The model has no ammonia or brain; the share of portal blood that skips the liver stands in for the risk.' ask: ['A young adult with a normal liver and a congenital portosystemic shunt is confused. Why?', 'Gut blood reaches the brain without passing the liver that would clear its ammonia.']
- First pass | Collaterals carry gut blood around a scarred liver | preset 'cirr-decomp', cam 'fit', lens 'origin', sites ['split'], tiles ['shunt','liver'], delta 'firstpass'. vignette (166 characters): 'A 61-year-old retired bus driver with hepatitis C cirrhosis, cured 2 years ago, has had two minor car crashes. His wife finds him slower, and EGD shows large varices.' line: 'Collaterals now carry {shunt} of the portal blood around the liver, and the scarred liver clears less of what still reaches it.' notes (4 sentences): covert HE is not decompensation under Baveno VIII but predicts overt HE; ACG 2026 diagnoses it with one test, such as animal naming, and treats it with lactulose; it impairs driving; look for precipitants (infection, bleeding, constipation, sedatives, dehydration). ask: ['He drives for a living. What do you test, and what do you start?', 'One test for covert encephalopathy, lactulose if it is abnormal, and no driving until it improves.']
- Spontaneous shunts | A large splenorenal shunt keeps encephalopathy coming back | preset 'cirr-decomp', params { spontaneous: { C6: true } }, days 30, cam 'splenic', lens 'direction', mark { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool { kind: 'doppler', vessel: 'SV_CONF' } (splenic vein runs toward the shunt), tiles ['liver','ppg'], key ['liver']. vignette (173 characters): 'A 58-year-old man with hepatitis B cirrhosis on entecavir has had three admissions for confusion this year despite lactulose and rifaximin. He has no ascites and no varices.' (model: ascites 0, varix 2.1 mm). line: 'A splenorenal shunt drains splenic and portal blood to the left renal vein, so flow through the liver falls to {liver}; colored by direction, the splenic vein runs away from the liver.' notes: shunts appear on CT in about 60% and those of 8 mm or more go with HE (Simon-Talero 2018); ACG 2026: no improvement in 48 to 72 h means missed precipitants, then CT or MRI for a shunt; lactulose to 2 or 3 soft stools, rifaximin added for recurrence, no routine ammonia. ask: ['Three admissions despite lactulose and rifaximin. What do you look for?', 'Missed precipitants first, then a large spontaneous shunt on contrast CT or MRI.']
- Spontaneous shunts | Closing the shunt sends blood back through the liver | compare [{ label: 'Shunt open', own: true, params: { occluded: { C6: false } } }, { label: 'Shunt embolized', short: 'Embolized', params: { occluded: { C6: true } } }], cam 'fit', lens 'flow', tiles ['liver','ppg'], key ['liver'] (no varix tile: it fills at once in the model). line: 'Embolizing the shunt returns portal blood to the liver, and the PPG climbs with it.' (model, acute: liver flow 34% to 63%, PPG 10.1 to 18.8 mmHg). notes: ACG 2026, conditional and very low certainty, for recurrent or persistent HE with preserved liver function (MELD under about 11 to 15); HE remits in about 4 in 5; new or larger varices, ascites or bleeding follow in 10 to 15%; Baveno VIII adds embolization and/or TIPS reduction for HE that persists after TIPS (LoE 3, weak). ask: ['Who is a good candidate for embolization?', 'Recurrent encephalopathy despite treatment, a large shunt on CT and a low MELD.']
- Spontaneous shunts | The price: portal pressure comes back | params { occluded: { C6: true } }, days 60, lapse { seconds: 7, from: 'Shunt closed', to: 'Two months later' }, tool { kind: 'flowtime', clock: 'days', lines: ['pv','asc'] }, tiles ['asc','ppg'], delta 'srs'. line: 'Two months after embolization the PPG is {ppg} and {asc} of ascites has returned.' (model: ascites 0 to 1.24 L). caveat: 'In the model the varices fill as soon as the shunt closes; in patients they grow over weeks to months.' ask: ['What follow-up does he need?', 'An EGD for new varices and a watch for ascites, with carvedilol or banding as needed.']
- After TIPS | A wider stent lowers the gradient and starves the liver | preset 'cirr-decomp', params { tips: { on: true, d: 8 } }, cam 'liver', lens 'origin', sites ['split'], mark { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, compare [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: '10 mm', params: { tips: { on: true, d: 10 } } }], tiles ['ppg','liver'], key ['liver']. vignette (an elective case, a new person): 'A 66-year-old man with alcohol-associated cirrhosis, sober for 2 years, needs a tap every 2 weeks for refractory ascites. He has never been confused.' line: 'An 8 mm stent brings the PPG to {ppg}, under the {<12 mmHg} target, and leaves the liver {liver} of its flow; a 10 mm stent takes more.' (model: 9.7 against 8.3 mmHg; 31% against 25%). notes: overt HE follows in a third to a half in the first year; 8 mm stents caused less HE than 10 mm (Wang 2017: 27% against 43% at 2 years); EASL 2025 asks for the smallest width that reaches the target; rifaximin 600 mg twice a day from 14 days before an elective TIPS cut overt HE from 53% to 34% (Bureau 2021; the US tablet is 550 mg and the use is off-label). ask: ['Elective TIPS in a 66-year-old who has never been confused. What lowers his risk of encephalopathy?', 'An 8 mm stent and rifaximin from 2 weeks before.']
- After TIPS | When encephalopathy persists, narrow the stent | compare [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: 'Narrowed to 6 mm', short: '6 mm', params: { tips: { on: true, d: 6 } } }, { label: 'Occluded', params: { tips: { on: false } } }], tiles ['liver','ppg'], key ['ppg']. line: 'Narrowing the stent gives the liver back portal blood, and the PPG climbs toward the level the TIPS was placed to treat.' (model: 6 mm gives PPG 12.5 mmHg and liver flow 41%; occluded gives 17.8 mmHg and 62%). notes: exclude precipitants first; Baveno VIII new statement (LoE 3, weak, 87%); a reduction stent placed inside the TIPS; ascites or bleeding may return. ask: ['Three admissions for confusion after his TIPS despite lactulose and rifaximin. What are the options?', 'Exclude precipitants, embolize any spontaneous shunt, then narrow or occlude the stent, accepting that ascites may return.']
- Summary | Every route around the liver costs the brain something | visual 'table', cols ['shunt','liver','ppg','asc'], asc false, vs 'first', rowHead 'Patient', of ['firstpass','collat','srs','price','tips', { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, title: 'TIPS, 10 mm' }]. Deck: id 'encephalopathy', level 'core', minutes 10; TOPICS complications after tap: ['encephalopathy', 'Encephalopathy and shunting', 'Encephalopathy']. objectives: ['Explain how portosystemic shunting lets gut blood reach the brain unfiltered', 'Recognize when to look for a large spontaneous shunt, and what closing it costs', 'Choose the stent width and the drug that lower encephalopathy after a TIPS', 'Treat overt encephalopathy as ACG 2026 advises: precipitant, lactulose, rifaximin']. checks: ['Who should have a CT for a spontaneous shunt?', 'A patient whose encephalopathy keeps returning despite lactulose and rifaximin, once precipitants are excluded.'], ['What does embolizing a large shunt cost?', 'The portal pressure rises: new varices, ascites or bleeding in about 1 in 10.'], ['Which two choices lower encephalopathy after an elective TIPS?', 'An 8 mm stent and rifaximin started 2 weeks before.']

**Notes:**

Moves:
- shunts/srs and shunts/wide come here; shunts keeps 'tips' with its width slider.
- treatment/cost keeps one line and points here.
- tap/tips notes point here for rifaximin.

Tests:
- tests/case-card.test.js:32 (55 or more cases) still passes: shunts loses one or two cases and this deck adds three.
- deck-lenses and splenorenal-route are untouched while shunts/dsrs stays.

Engine:
- Every own button must carry params. abPick calls liveSet with the option's params, and merge() reads them (presenter.js:1465-1480, 1523-1527).
- The 'he' index already in the fingerprint (worker-core.js:24-31) would add little as a tile (shunt × (0.6 + 0.8 × cirrhosis), metrics.js:69).
- The numbers come from the curriculum-gap reviewer's chain runs. Re-read every token on the preview.

Evidence:
- Bureau 2021 (Ann Intern Med 174:633-640) and Wang 2017 (J Hepatol 67:508-516): high confidence.
- ACG 2026 HE guideline and Baveno VIII wording: from the shared digests' search extracts, medium.
- The 2026 embolization meta-analysis rates (PMID 42564112): secondary summaries, medium.


## 2. New deck: Treating the cause, and how far portal hypertension recedes (new-deck)

**Merged from:** Curriculum gaps idea 3: new deck 'cause-treated'; Measuring review: stiffness 'cure' slide (LSM 12.5 to 7.0 kPa after a year); Engine-first idea 6: 'Two futures' stiffness cure button; One-year review: MASLD caveats (weight loss, GLP-1 receptor agonist, wedge reads low); Recompensation review: 'keep' idea (CSPH outlasts the cure, carvedilol continues)

**Scores:** Teaching value 5: compensated cACLD after a cure is the commonest clinic patient, and no deck follows one. Guideline relevance 5: the Baveno VII/VIII post-cure rules, and Baveno VIII's new MASLD section (10% weight loss, GLP-1 RA, bariatric surgery only without CSPH, statins downgraded). Engine readiness 5: ramps and lapses regress stiffness, platelets, collaterals and spleen (engine.js:19, 772, 781). Effort 3 (moderate): 8 slides, 3 cases, about 3 multi-year lapses to check.

**Outline:**

- Hepatitis C cured | CSPH when the antivirals start | preset 'csph', cam 'liver', tool { kind: 'fibroscan' }, data 'tiles', tiles ['lsm','plt','hvpg'], key ['hvpg']. vignette (143 characters): 'A 55-year-old man with hepatitis C cirrhosis starts sofosbuvir and velpatasvir. His liver stiffness is 24 kPa and his platelets are 88,000/µL.' line: 'At {lsm} with platelets of {plt} he is in the gray zone, and a catheter would read {hvpg}, so carvedilol starts alongside the antivirals.' caveat: 'The model shows him off carvedilol, so these are the disease's own numbers.' ask: ['Why start carvedilol now rather than wait for the cure to act?', 'CSPH is present now, and the beta-blocker lowers the risk of decompensation while the pressure is high; the fall after cure takes a year or more.']
- Hepatitis C cured | The year after cure: the liver softens | days 365, ramp { cirrhosis: [0.6, 0.45] }, lapse { seconds: 8, from: 'Antivirals started', to: 'A year after cure' }, tool { kind: 'flowtime', clock: 'days', lines: ['hvpg','varix'] }, tiles ['lsm','plt'], delta 'before'. line: 'A year after cure, stiffness has fallen to {lsm} and platelets have risen to {plt} as the scar and the pressure recede.' caveat: 'Part of an early fall in stiffness is less inflammation; the model reads it all as less scar.' notes: the HVPG falls in most patients after cure; a fall of 20% or more to under 20 kPa, or any fall to under 10 kPa, marks a much lower risk (Baveno VII). (model: HVPG 11.6 to 7.7 mmHg, LSM 24.1 to 15.4 kPa, platelets 88 to 125)
- Hepatitis C cured | Low stiffness with normal platelets rules CSPH out after cure | days 365, ramp { cirrhosis: [0.45, 0.37] }, lapse { seconds: 8, from: 'One year', to: 'Two years' }, tool fibroscan, tiles ['lsm','plt','hvpg'], key ['lsm']. line: 'Two years on, his stiffness of {lsm} is under {<12 kPa} with platelets over 150,000/µL, which after cure rules CSPH out.' (model: LSM 11.1 kPa, platelets 167). notes: the Baveno VII rule applies after cure without cofactors such as alcohol or obesity (Semmler 2021); portal hypertension follow-up can stop, liver cancer ultrasound every 6 months continues, and stopping carvedilol has not been tested. ask: ['His stiffness is 11 kPa and his platelets 167,000/µL. What changes, and what does not?', 'CSPH is excluded and portal hypertension follow-up can stop; liver cancer surveillance goes on.']
- A higher start | A higher starting pressure | preset 'csph', params { cirrhosis: 0.75 }, days 365, cam 'liver', data 'ladder', key ['hvpg'], tiles ['lsm','plt']. vignette (164 characters): 'A 62-year-old woman with hepatitis C cirrhosis has large varices and a little ascites seen only on ultrasound. Her stiffness is 27 kPa and her platelets 66,000/µL.' line: 'Her HVPG is {hvpg}, well above {>=10 mmHg}, with large varices and ascites seen only on ultrasound.' (model: HVPG 15.1 mmHg, ascites 0.54 L). notes: Baveno VIII does not count imaging-only ascites as decompensation, but it worsens the outlook; she starts carvedilol with glecaprevir and pibrentasvir.
- A higher start | With a higher start, CSPH can outlast the virus | days 730, ramp { cirrhosis: [0.75, 0.55] }, lapse { seconds: 10, from: 'Cure', to: 'Two years later' }, tool { kind: 'flowtime', clock: 'days', lines: ['hvpg','varix'] }, tiles ['hvpg','lsm','plt'], key ['hvpg'], delta 'high'. line: 'Two years after cure her HVPG is still {hvpg}, above {>=10 mmHg}, so CSPH persists and carvedilol continues.' (model: 10.4 mmHg, LSM 21.4 kPa). notes: a high HVPG before treatment predicted persistent CSPH after cure, which still carries the risk of decompensation (Lens 2017, 2020); collaterals shrink more slowly than they grew. ask: ['Two years after cure her stiffness is 21 kPa. Can carvedilol stop?', 'No: her stiffness is still in the gray zone and her HVPG above 10 mmHg, so CSPH persists.']
- MASLD | In MASLD, weight changes how stiffness reads | preset 'cirr-comp', params { cirrhosis: 0.45 }, days 365, tool fibroscan, tiles ['lsm','plt','hvpg'], key ['lsm']. vignette (154 characters): 'A 52-year-old woman with MASLD, type 2 diabetes and a BMI of 34 has a liver stiffness of 15 kPa and platelets of 136,000/µL. She has never decompensated.' line: 'Her stiffness of {lsm} sits in the gray zone, and with a BMI over 30 the 25 kPa rule-in does not apply to her.' notes: Baveno VIII uses ANTICIPATE-NASH at a BMI of 30 or more; the HVPG can read low in MASLD (Ferrusquia-Acosta 2021); GLP-1 receptor agonists and SGLT2 inhibitors for their approved indications; bariatric surgery only without CSPH. ask: ['Stiffness 15 kPa with platelets of 136,000/µL. Is CSPH ruled out?', 'No: the rule-out needs platelets of 150,000/µL or more, so she is in the gray zone; use a model or spleen stiffness, or repeat in 12 months.']
- MASLD | Losing a tenth of her weight softens the liver | days 365, ramp { cirrhosis: [0.45, 0.35] }, lapse { seconds: 8, from: 'Before weight loss', to: 'A year and 12% lighter' }, tool fibroscan, tiles ['lsm','plt'], delta 'masld'. line: 'A year later and 12% lighter, her stiffness has fallen to {lsm}, about a third lower.' (model: 15.3 to 10.3 kPa, platelets 175). caveat: 'The model has no fat or weight; it shows the fall in liver resistance that weight loss brings.' notes: Baveno VIII (LoE 3): weight loss of 10% or more goes with a fall in stiffness of 30% or more; resmetirom and semaglutide are approved in the US for MASH with F2 to F3 fibrosis, not cirrhosis; in hepatitis B, suppression with tenofovir or entecavir regresses fibrosis; statins are no longer recommended to prevent decompensation.
- Summary | Treating the cause lowers the pressure, if it starts low enough | visual 'table', cols ['hvpg','lsm','plt','varix'], asc false, rowHead 'Visit', of ['before','year1','year2','high','high2','masld','loss']. Deck: id 'cause-treated', level 'core', minutes 10, sections 'Hepatitis C cured', 'A higher start', 'MASLD'; TOPICS treatment: ['cause-treated', 'Treating the cause', 'Treating the cause']. objectives: ['Explain why treating the cause lowers portal pressure over months to years', 'Apply the stiffness and platelet rule that excludes CSPH after hepatitis C cure', 'Recognize who keeps CSPH after cure, and why carvedilol and follow-up continue', 'Describe what weight loss does in MASLD, and the limits of stiffness in obesity']. checks: ['After hepatitis C cure, which result rules CSPH out?', 'Stiffness under 12 kPa with platelets over 150,000/µL, without cofactors such as alcohol or obesity.'], ['Does liver cancer surveillance stop once CSPH is excluded?', 'No: ultrasound every 6 months continues in anyone who had cirrhosis.'], ['Who is likely to keep CSPH after cure?', 'Someone with a high HVPG or stiffness before treatment.']

**Notes:**

Overlap:
- stiffness gets a one-line pointer instead of its own 'cure' slide.
- recompensation stays the story of alcohol after decompensation.

Model:
- Keep carvedilol out of params. The model's LSM and varix fall at once on a beta-blocker (engine.js:775), which slide 1's caveat explains.
- Patient B's 10.4 mmHg sits close to the cut-off. Rerun tests/deck-thresholds after any engine change.
- Typed numbers in asks (11 kPa, 167,000/µL, 21 kPa) must match the model or be reworded without numbers.

Evidence:
- Baveno VII's post-cure rule (stiffness under 12 kPa with platelets over 150): high confidence.
- Baveno VIII's MASLD statements: medium (extracts).
- Lens 2017/2020, Mandorfer 2016, Semmler 2021 and Marcellin 2013 are cited from memory. Verify them before any of their numbers goes into notes.


## 3. New deck: When banding fails (balloon, rescue TIPS and fundal varices) (new-deck)

**Merged from:** Varices-bleeding review: new deck 'refractory-bleed' (chain run, numbers checked); Imaging review: endoscopy 'rescue' balloon slide and its own 'refractory-bleed' sketch; Curriculum gaps idea 2: new deck 'Gastric varices'; Engine-first idea 4: 'Fundal varices' deck with a live gastric balloon; Shunts review and varices review: shunts/grs, shunts/brto and varices/fundal overlap

**Scores:** Teaching value 4: the bridge (balloon or stent), rescue TIPS with futility limits, and the BRTO-versus-TIPS choice are taught nowhere. Guideline relevance 4: Baveno VIII (EVL for GOV1; its pre-emptive TIPS statement names EV and GOV1 only), AASLD 2024 (Lee) on BRTO and TIPS, GAVAPROSEC 2025. Engine readiness 3: balloonEso, balloonGas, a GV rupture and stopBleed all exist but have never run in a deck, and on the figure the balloon appears and the jets stop without easing. Effort 3 (moderate): 9 slides plus two small figure fixes and one table key.

**Outline:**

- Esophageal | Bleeding that banding cannot stop | preset 'cirr-decomp', action { kind: 'rupture', tear: 0.6 }, cam 'varices', tool { kind: 'trace', range: 'beats' }, data 'tiles', tiles ['hr','map'], key ['hr']. vignette (about 150 characters): 'A 49-year-old man with alcohol-associated cirrhosis vomits blood. At EGD the esophagus fills with blood faster than it can be cleared, and no band holds.' line: 'Blood fills the esophagus faster than it can be cleared, so no band holds and the heart rate climbs to {hr}.' (model: MAP about 84 mmHg, HR about 112)
- Esophageal | Drugs and blood do not keep up | params { drugs: { octreotide: true } }, action [UNIT, UNIT] (UNIT = { kind: 'infuse', fluid: 'prbc' }), tool BEATS, tiles ['hr','map'], key ['map'], delta true. line: 'Octreotide and two units run in, but the bleeding outpaces them and the blood pressure falls to {map}.' (model: about 66 mmHg, HR about 148). notes: what is already under way per Baveno VIII (ceftriaxone, erythromycin, restrictive transfusion to 7 to 8 g/dL), and the airway is protected before any tube.
- Bridge | A balloon tube presses the varices shut | params { balloonEso: true }, action [{ kind: 'stopBleed' }, UNIT], tool { kind: 'scope', open: true } (the scope draws the balloon and eases it in, instruments.js:173-181), tiles ['map','hr'], key ['map'], delta true. line: 'Inflated in the esophagus, the balloon presses on the varices from outside, so the pressure across their wall falls, the bleeding stops and the blood pressure recovers to {map}.' (model: about 80 mmHg). caveat: 'The model adds 40 mmHg around the varices; its live clock stops a bleed after 45 seconds of low wall pressure, which this slide applies at once.' notes: intubate first, no more than about 24 hours, bleeding often returns on deflation; a covered self-expanding esophageal stent where available was as effective and safer in one small trial (Escorsell 2016); in the US the balloon tube is still the usual bridge.
- Rescue | Rescue TIPS takes over from the balloon | params { balloonEso: false, tips: { on: true, d: 8 } }, cam 'liver', mark { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data 'ladder', key ['ppg'], causesHead 'Likely futile', causes ['Child–Pugh 14 or 15', 'MELD 30 or more with lactate 12 mmol/L or more', 'Unless a transplant is close']. line: 'A covered TIPS drops the PPG to {ppg}, under the {<12 mmHg} target, so the balloon can come down.' (model: about 8.6 mmHg). ask: ['When is a rescue TIPS likely futile?', 'Child–Pugh 14 or 15, or a MELD of 30 or more with a lactate of 12 mmol/L or more, unless a transplant is close.']
- Fundal varices | A fundal varix drains through a gastrorenal shunt | preset 'gastric-varix', cam 'fundus', labels ['GV','LRV'], mark { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }, lens 'flow', tiles ['gv','varix','ppg'], key ['gv']. vignette (about 160 characters): 'A 66-year-old woman with hepatitis C cirrhosis has melena and dizziness. EGD shows a large varix in the gastric fundus with fresh clot, and no esophageal varices.' line: 'Fed by the short and posterior gastric veins, a fundal varix of {gv} drains through a shunt to the left renal vein while the esophagus stays clear.' (model: 8.9 mm against 2.0 mm). notes: the Sarin classes: GOV1 runs along the lesser curve and is banded like esophageal varices (Baveno VIII); GOV2 runs into the fundus; IGV1 is isolated in the fundus and bleeds most heavily; IGV2 lies elsewhere in the stomach. ask: ['Varices run 3 cm down the lesser curve from the esophagus. How are they treated if they bleed?', 'Like esophageal varices: they are GOV1, and banding is the treatment.']
- Fundal varices | A fundal varix bleeds heavily | action { kind: 'rupture', site: 'GV', tear: 0.5 }, cam 'fundus', tool BEATS, tiles ['hr','map'], key ['hr'], delta true. line: 'The torn fundal varix bleeds into the stomach, and the heart rate climbs to {hr}.' (model: HR 88 to 109, MAP 94 to 85). notes: the first steps are those of any variceal bleed; bands do not hold on a large fundal varix; cyanoacrylate is injected where expertise exists (off-label in the US) and is not in the model. ask: ['Bleeding IGV1 at EGD. What is the endoscopic treatment?', 'Cyanoacrylate injection where available, with a TIPS or BRTO to prevent rebleeding.']
- Fundal varices | The gastric balloon holds the fundus | params { balloonGas: true }, action [{ kind: 'stopBleed' }, UNIT], tiles ['gv','map'], delta true. line: 'Pulled up against the fundus, the gastric balloon squeezes the varix to {gv} and the bleeding stops.' (model: about 0.4 mm). caveat: 'The model presses on the varix only; it does not model the balloon's traction or its risks.'
- Definitive treatment | BRTO keeps portal blood in the liver; a TIPS sends it around | params { balloonGas: false, occluded: { C5: true } }, compare [{ label: 'BRTO', own: true, params: { occluded: { C5: true }, tips: { on: false } } }, { label: 'TIPS', params: { occluded: { C5: false }, tips: { on: true } } }], cam 'fit', lens 'flow', tiles ['ppg','varix','liver'], key ['ppg'] (no gv tile: the model does not fill the varix with sclerosant). line: 'BRTO plugs the shunt and keeps portal blood in the liver but raises the PPG to {ppg}, while a TIPS lowers it and sends that blood around the liver.' (model: BRTO PPG about 17.6 mmHg, varix 7.4 mm, liver flow 50%; TIPS 8.4 mmHg, 2.0 mm, 22%). caveat: 'In the model the esophageal varices fill at once; in patients they grow over months.' notes: AASLD 2024 favors a TIPS with ascites or esophageal varices and obliteration when a TIPS is contraindicated; in an RCT new or worse ascites followed 36% of BRTO, 15% of TIPS and 4.4% of glue alone; GAVAPROSEC: pre-emptive TIPS cut rebleeding from 63% to 24% against glue without a clear survival gain. ask: ['Bleeding IGV1, a large gastrorenal shunt and tense ascites: BRTO or TIPS?', 'TIPS: BRTO would raise the portal pressure and worsen the ascites.']
- Summary | Bridge, then rescue | visual 'table', cols ['map','hr','ppg','varix','liver'] (add 'gv' once COLS has it), asc false, vs 'first', rowHead 'Step', of ['fail','shock','balloon','rescue','gv','gvbleed','gvballoon','choose']. Deck: id 'refractory-bleed', level 'advanced', minutes 10; TOPICS complications after variceal-bleed: ['refractory-bleed', 'When banding fails', 'Refractory bleed']. objectives: ['Explain how a balloon tube stops variceal bleeding, and why it is only a bridge', 'Name the rescue for bleeding that drugs and banding do not control, and when it is futile', 'Classify gastric varices and name the ones that are banded', 'Compare BRTO and TIPS for a fundal varix, and what each costs']. checks: ['How long can a balloon tube stay up?', 'No more than about 24 hours, as a bridge to a rescue TIPS.'], ['Which gastric varices are banded?', 'GOV1, which continue the esophageal varices along the lesser curve.'], ['What does BRTO cost that a TIPS does not?', 'The portal pressure rises, so esophageal varices and ascites can worsen.']

**Notes:**

Prerequisites (must land before the deck, because everything has to ease):
- On the figure the balloon is appended with no transition (stage.js:5618-5620; .balloon-shape at styles/app.css:608 has none).
- The bleeding jets vanish the frame a bleed stops (bleedSpray returns [] once !F.bleed.active, stage.js:7432-7437).
- Fade both, then check that the scope's own balloon and jet already ease.
- Add gv: 'Fundal varix' and hb: 'Hb' to COLS/CUT (table-marks.js:102-104).

Engine:
- The chain never clots an open bleed: the clot rule runs only on the live clock (fastProcesses is skipped when quiet, engine.js:570; the rule itself is at engine.js:664-668). That is why each balloon slide sends an explicit stopBleed.
- A GV rupture, balloonGas and stopBleed have never run in a deck. Read every number on the preview.
- Alternative for the gastric balloon: a live compare button { label: 'Inflate the gastric balloon', params: { balloonGas: true } }. The bleed would then stop in front of the room about 45 s later on the bedside clock (presenter.js:1523-1529), but the presenter has to reach it within a minute or two.

Moves:
- shunts/grs and shunts/brto come here.
- varices/fundal keeps its anatomy and points here.
- endoscopy drops 'oct' and 'transfuse' (they repeat variceal-bleed) and points here for the balloon. That takes endoscopy from 9 to 7 slides.
- variceal-bleed/band notes point here, and its 'stent preferred' wording becomes 'a balloon tube, or a covered stent where available'.
- Splenic vein thrombosis stays in prehepatic.

Evidence:
- Escorsell 2016 (Hepatology 63:1957-1967) and AASLD 2024 Lee (Hepatology 79:224-250): high confidence.
- GAVAPROSEC and the 2024 RCT ascites rates: secondary summaries, medium.
- Futility cut-offs (Walter 2021, Maimone 2019): medium.
- 'Bleeding often returns on deflation' is general knowledge, so it carries no number.


## 4. Play the disease clock in the static decks (deck-modification bundle)

**Merged from:** Capabilities summary: six decks with no lapse and no live control; One-year review: lapses on d90/d180, monitor on cath/d365, pvVel Doppler slide; Pre-hepatic review: anticoagulation lapse, cavernoma marks; Ascites review: tap/back lapse; ascites/fill on a year, not 60 days; Recompensation review: 'keep' slide, 'Kept drinking' row, flowtime on cure; Outflow review: flowtime on recover; Pregnancy review: 42-day postpartum ramp; Engine-first idea 6: 'Two futures' buttons (patient buttons with days); Measuring review: stiffness/year ramp pushes the patient into decompensation

**Scores:** Teaching value 4: disease and recovery play on screen instead of jumping between states. Guideline relevance 4: anticoagulation for 6 months or more in acute PVT; Baveno VIII recompensation (over 6 months, CSPH persists); postpartum course. Engine readiness 5: everything uses days, ramp, lapse, flowtime and patient buttons with days (presenter.js:957, 1202-1210, 1590). Effort 2 (low): field edits on about 12 slides plus two new slides.

**Outline:**

- one-year/d90, d180 | Year played live | Add lapse: { seconds: 8 } to each (days 90 and up exceed the seconds; neither slide has a case card). Check on the preview that the FibroScan and scope ease during the lapse.
- one-year/cath, d365 | Show the tracing | Add monitor: 'result' (it reads the slide's state, presenter.js:2058-2069).
- one-year/doppler | One idea | data 'tiles', tiles ['pvVel'], delta 'd0'. line: 'As the resistance in the liver rises, portal velocity falls to {pvVel}, still above the {<15 cm/s} that supports portal hypertension.' (model: 23.6 to 21.7 cm/s)
- one-year/carv and summary | No instant varix, a real table | carv: replace the varix tile with ['hvpg','hr'] plus tool { kind: 'wall' } (varix diameter follows the gradient instantly, engine.js:775) and move the talk trace here. summary: visual 'table', of ['d0','d90','d180','d365','carv'], cols ['lsm','plt','hvpg','varix'], which meets the summary-table rule.
- prehepatic/anticoag (new, after cath) | Early anticoagulation can reopen the portal vein | params { anticoag: true }, days 180, lapse { seconds: 8, from: 'Day 1', to: 'Month 6' }, cam 'portal', labels ['CONF'], tool { kind: 'doppler', vessel: 'PV_TRUNK' }, tiles ['pv','ppg','pvVel'], key ['pv']. line: 'On anticoagulation the clot shrinks, flow returns on Doppler and the portal vein pressure falls to {pv}.' caveat: 'In the model the clot always clears; in patients without cirrhosis the portal vein reopens in about 4 in 10.' notes: anticoagulate at once for at least 6 months, for life with a persistent prothrombotic state or extension into the SMV; ascites and a clotted splenic vein predict failure (Plessier 2010). ask: ['Which two findings at presentation make it less likely the portal vein reopens?', 'Ascites and a clotted splenic vein.']
- prehepatic/cavernoma | When the vein stays closed, a cavernoma grows around it | Keep preset 'pvt-chronic' (it follows the anticoagulated patient). marks: [{ edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, { edges: ['C8'], label: 'Cavernoma', kind: 'note' }]. Notes add portal cholangiopathy and the meso-Rex bypass in children, plus Baveno VIII's first pediatric statement: stiffness should not guide their care. objective 1 becomes 'Recognize acute portal vein thrombosis on Doppler and start anticoagulation'.
- prehepatic/clot (optional futures) | Two futures for an acute clot | compare [{ label: 'Now', own: true }, { label: 'Six months anticoagulated', short: 'Anticoagulated', preset: 'pvt-acute', params: { anticoag: true }, days: 180 }, { label: 'Eight months untreated', short: 'Untreated', preset: 'pvt-acute', days: 240 }], tiles ['pv','varix','spleen','plt'] (model: now PV 28.8 mmHg; anticoagulated 7.8; untreated 19.5 with varix 5.0 mm, spleen 16.4 cm, platelets 76, matching the cavernoma preset). Use either this or the anticoag lapse, not both.
- tap/back | The fluid returns in two weeks | lapse { seconds: 6, from: 'After the tap', to: 'Two weeks later' }. line: 'Nothing has changed the sinusoidal pressure or the kidneys' sodium retention, so without diuretics the abdomen holds {asc} again in two weeks.' Keep params { albumin: 2.74 } on tap/albumin; do not use infuse there (an albumin infusion makes the model's ascites return faster, 6.0 against 3.7 L).
- recompensation/cure | Show the course | tool { kind: 'flowtime', clock: 'days', lines: ['asc','hvpg'] }, lapse { seconds: 10, from: 'Last drink', to: 'A year without alcohol' }. line: 'A year without alcohol: the albumin rises to {salb}, the ascites clears and the HVPG, on carvedilol, falls to {hvpg}.'
- recompensation/keep (new, after recomp) | Carvedilol still holds the HVPG down | cam 'liver', data 'ladder', key ['hvpg'], compare [{ label: 'On carvedilol', own: true, params: { drugs: { carvedilol: true } } }, { label: 'Off carvedilol', params: { drugs: { carvedilol: false } } }]. line: 'On carvedilol the HVPG is {hvpg}; switch it off and it climbs back above {>=10 mmHg}, so CSPH is still there.' (model: 9.3 against 12.2 mmHg). ask: ['He has recompensated and asks to stop carvedilol. What do you advise?', 'Keep it: off the drug his HVPG is back above 10 mmHg, and stopping after recompensation has not been tested.']
- recompensation/summary | The other year | Append to of: { preset: 'csph', params: { cirrhosis: 0.85, albumin: 2.8, diuretics: true, drugs: { carvedilol: true } }, days: 365, kicker: 'For comparison', title: 'Kept drinking' } (model: HVPG 14.8 mmHg, varix 5.7 mm, ascites 0.7 L, platelets 73, against 9.3, 2.0, 0 and 124). line (one sentence): 'Removing the cause lowered the portal pressure more than any drug, but carvedilol and liver cancer surveillance continue while CSPH persists.'
- outflow/recover | Show the recovery | tool { kind: 'flowtime', clock: 'days', lines: ['hvpg','asc'] }; keep the tiles. Notes: 'Prevention matters: gentler conditioning where possible, and ursodeoxycholic acid for every transplant' (EASL 2025; defibrotide prophylaxis failed in HARMONY).
- pregnancy/after | Six weeks after delivery | Replace params { gestation: 0 } and the caveat with days: 42, ramp: { gestation: [38, 0] }, lapse: { seconds: 6, from: 'Delivery', to: '6 weeks after' }. line: 'Over the six weeks after delivery her blood volume falls back to {bv} and, on propranolol, the HVPG to {hvpg}.' (model: 7201 to 5359 mL, 11.3 to 11.0 mmHg). Notes add postpartum flares of autoimmune hepatitis, in about a third. Keep 'weeks' acute, with its slider.
- stiffness/year | Keep the patient compensated | The current ramp ends with 4.7 L of ascites and albumin 2.8 g/dL, on a slide about yearly FibroScans. Ramp cirrhosis only, from 0.4 to 0.6, with albumin held, so stiffness passes 20 kPa without ascites. Check on the preview.
- ascites/fill | One clock for one ramp | days 365 instead of 60, matching recompensation's identical ramp (cirrhosis 0.6 to 0.85, albumin 4 to 2.8).

**Notes:**

Engine:
- A lapse needs days of at least its seconds.
- A case card never shows on a lapse slide (presenter.js:1846), so none of these slides may carry one.
- Anticoagulation clears every clot at 0.006 a day (engine.js:810-815). Every anticoagulation slide needs the reopening caveat, and anticoagulation must never be shown for chronic Budd-Chiari or a cavernoma.
- Future buttons start a fresh preset, not the slide's chain (presenter.js:1202-1210). Label them as comparisons, not as this patient's fate.
- Infused volume never leaves the model, which has no kidneys (engine.js:911-921). Never follow an infuse action with days without rechecking the numbers.

Tests to rerun: tests/deck-terms.test.js:64 (prehepatic/cavernoma), deck-thresholds (one-year/cath, d365, recompensation/csph), and the visual references for every changed view.

Evidence:
- Plessier, Hepatology 2010;51:210-218: medium, as relayed.
- Baveno VIII recompensation over 6 months: medium-high.
- AIH postpartum flares 'about a third': medium; check against EASL 2023.


## 5. Contrast pairs: switch to the look-alike patient on the same slide (new-format)

**Merged from:** Learning-science idea 8: contrast pairs with patient buttons; Measuring review: stiffness/schisto compare (cirrhosis against schistosomiasis); Ascites review: ascites/bc compare with heart failure and an RA tile; Varices review: varices/nograd ladder compare (cirrhosis against heart failure); Capabilities summary: compare-by-patient is used once (sites/cardiac)

**Scores:** Teaching value 4: comparing cases side by side beats studying them one at a time (Alfieri 2013 meta-analysis), and these are the look-alikes learners confuse. Guideline relevance 3: it supports the NIT and HVPG pitfalls rather than new guidance. Engine readiness 5: patient buttons work today (livePatient, presenter.js:1485-1503; xKey 957). Effort 1 (very low): five field edits, no code.

**Outline:**

- stiffness/schisto | In schistosomiasis the liver stays soft | compare [{ label: 'Cirrhosis', preset: 'csph' }, { label: 'Schistosomiasis', own: true }] (model: cirrhosis PV 17.9 mmHg, LSM 24.1 kPa; schistosomiasis PV 20.7 mmHg, LSM 6.6 kPa). notes: 'Switch between them: similar portal pressures, a stiff liver against a soft one.' Check that the FibroScan follows the button (tools pin to the live state, presenter.js:1586-1587).
- hvpg/heart | Every station rises, so the HVPG stays normal | compare [{ label: 'Heart failure', own: true }, { label: 'Cirrhosis', preset: 'csph' }]; the own button keeps block 'ra' (abBlk, presenter.js:1480-1483). The ladder's largest step moves from the heart to between the wedged and free readings. Reword the ask without typed numbers: the current 'WHVP 21, FHVP 20, right atrium 19 mmHg' does not match the ladder's 20, 19 and 19.
- doppler/rhf | A pulsatile portal vein | compare [{ label: 'Heart failure', own: true }, { label: 'Cirrhosis', preset: 'cirr-decomp' }]. Both run at about 15 cm/s (model: 15.2 against 14.2 cm/s): one pulses with each beat, the other is slow and steady. ask: ['Both portal veins run at about 15 cm/s. What tells them apart?', 'The shape: a pulse with each beat points to the right heart.'] Check on the iPad that the running trace scrolls the old patient off without a seam.
- ascites/bc | Same fluid, different right atrium | compare [{ label: 'Budd–Chiari', own: true }, { label: 'Heart failure', preset: 'rhf' }], tiles ['saag','tp','ra'], key ['ra'] (model: Budd-Chiari RA 3.3 mmHg, heart failure 19.0 mmHg). notes add: 'Switch the patients: the fluid is the same, the right atrial pressure is not.'
- varices/nograd | Heart failure raises portal pressure without varices | compare [{ label: 'Cirrhosis', preset: 'cirr-decomp' }, { label: 'Heart failure', own: true }], data 'ladder', key ['ppg'], block 'ra', tiles ['varix'] (model: PPG 17.8 against 1.4 mmHg). Pairs the 'no gradient, no varices' point with the patient who has both.
- House rule (guide section 7.4) | When to use a contrast pair | Only for two patients a learner would confuse, labeled plainly, with no case details on the other button. One compare row per slide.

**Notes:**

Each button loads a fresh preset computed off screen, not the slide's chain, so keep the labels plain and the other patient caseless. Splenic vein thrombosis is deliberately not on this list: prehepatic/svt takes the splenicRx compare and the 'delta' lens (see cross-cutting), and varices/svt keeps lens 'origin' with a pointer. tests/deck-lenses.test.js:64 runs varices/svt and prehepatic/svt, so rerun it. Evidence: Alfieri, Educ Psychol 2013;48:87-113 and Hatala, Adv Health Sci Educ 2003;8:17-26 (high). Congestive stiffness in decompensated heart failure has a median of about 12 kPa (Soloveva, J Card Fail 2019, medium), so the stiffness/heart wording 'above 25 kPa is common' should soften to 'can exceed 25 kPa'.


## 6. Quick checks that ask for decisions, and space across decks (curriculum)

**Merged from:** Learning-science idea 3: quick checks that space, interleave and ask for decisions; Learning-science idea 9: course tracks ('From <deck>' retrieval items); One-year review: the check that is framed wrongly

**Scores:** Teaching value 4: key-feature items test the decision rather than the fact, and spaced, mixed retrieval improves retention (Larsen 2009; Kerfoot 2007). Guideline relevance 4: every rewritten item applies Baveno VIII, AASLD 2021 or AASLD 2024. Engine readiness 5: checks are plain [question, answer] pairs (decks.js:61-63). Effort 1 (very low): text only.

**Outline:**

- circulation checks[2] | Replace 'What HVPG defines CSPH?' | ['The wedged hepatic vein pressure is 15 mmHg and the free one 4 mmHg. What is the HVPG, and is it clinically significant?', '11 mmHg. It is clinically significant, since CSPH starts at 10 mmHg.']
- hvpg checks[0] | Replace 'How is the HVPG calculated?' | ['WHVP 20 mmHg, FHVP 19 mmHg, right atrium 19 mmHg, with ascites. What is the HVPG, and where is the resistance?', '1 mmHg, which is normal. Every station is high, so the resistance lies at or beyond the heart, not in the sinusoids.']
- ascites checks[0] | Fluid that needs reading | ['Ascitic fluid: SAAG 1.6 g/dL, protein 0.9 g/dL, neutrophils 120/mm³. Where is the resistance, and is this SBP?', 'Sinusoidal, as in cirrhosis: a high SAAG with low protein. It is not SBP, which needs 250 neutrophils/mm³ or more.']
- stiffness checks[1] | A rule-out decision | ['MASLD, BMI 27, stiffness 13 kPa, platelets 172,000/µL. Does she need an EGD or a beta-blocker?', 'Neither: 15 kPa or less with platelets of 150,000/µL or more rules CSPH out; repeat both tests in a year.'] (a non-hepatitis C patient, so it is not confused with the post-cure rule)
- one-year checks[2] | Replace the drug-name recall | ['MASLD cirrhosis, BMI 26, stiffness 27 kPa. Which drug starts, and does he need an EGD first?', 'Carvedilol: 25 kPa or more rules CSPH in at a BMI under 30, and on a beta-blocker a screening EGD is not needed.']
- endoscopy checks[1] | A transfusion decision | ['A man bleeding from varices has a hemoglobin of 7.8 g/dL, and his blood pressure has held for an hour. Does he need another unit?', 'No: transfuse below 7 g/dL, to a target of 7 to 8 g/dL; more volume raises the portal pressure and the risk of an early rebleed.']
- spleen checks[1] | The scope-sparing rule | ['He cannot take a beta-blocker. Stiffness 18 kPa, platelets 160,000/µL. Does he need an EGD?', 'No: under 20 kPa with platelets of 150,000/µL or more spares the scope, as Baveno VIII says a spleen stiffness under 40 kPa does. Repeat yearly.']
- Fourth check, spaced from an earlier talk (decks with 3 checks only) | varices, tap, treatment, variceal-bleed | varices: ['From Measuring HVPG and PPG: large varices, an HVPG of 4 mmHg and an open portal vein. Where is the resistance?', 'Before the sinusoids, in the portal venules, as in schistosomiasis; the PPG would be high.'] tap: ['From How ascites forms: SAAG 1.4 g/dL, protein 3.2 g/dL and a pulsatile portal vein. Where is the resistance?', 'At the heart: congested sinusoids leak protein-rich fluid, and the pulse travels back to the portal vein.'] treatment: ['From Doppler of the portal system: after a TIPS, which way should the left portal vein flow?', 'Toward the stent, away from the liver; flow toward the liver again suggests the stent is narrowing.'] variceal-bleed: ['From Stiffness, spleen and platelets: a year before this bleed his stiffness was 24 kPa with platelets of 88,000/µL. What should have started then?', 'Carvedilol: AASLD 2024 presumes CSPH at 20 to 25 kPa with platelets under 150,000/µL, and Baveno VIII settles the gray zone with the ANTICIPATE model.']

**Notes:**

Rules for the rewrite:
- Typed numbers in checks must be definitional arithmetic or guideline cut-offs, never model outputs that can drift.
- Every spaced item names its source deck, so a deck taught alone still makes sense.
- Decks keep 3 or 4 checks. shunts, tips-doppler and pregnancy already have 4, so they swap an item rather than add one.

Optional code (a pretest): a deck field pre: [i, j] lists one or two of the deck's own checks without answers on the Outline slide (withOverview, decks.js:122-141), with the answers in the closing check.

Evidence:
- Larsen, Med Educ 2009;43:1174-1181; Kerfoot, Med Educ 2007;41:23-31; Page and Bordage, Acad Med 1995;70:104-110: high.
- Spleen stiffness under 40 kPa sparing the scope is a Baveno VIII statement known only from extracts (medium) until the PDF is read.


## 7. Rebuild Shunts as 'TIPS: who, how wide, at what cost', with the heart and liver work-up (deck-merge-or-split)

**Merged from:** Curriculum gaps idea 6: split shunts, add heart and liver work-up slides; Engine-first idea 5: surgical shunts deck (reduced to a three-shunt compare); Shunts review: dsrs compare (Warren, portocaval, mesocaval), occl Doppler ghost, one-sentence lines; Treatment review: 'cost' slide moves here (no absolute MELD cut-off); Digest B: EASL 2025 pre-TIPS work-up, portopulmonary hypertension, cirrhotic cardiomyopathy

**Scores:** Teaching value 4: TIPS selection is a weekly decision, and the cardiopulmonary contraindications appear nowhere in the app. Guideline relevance 5: EASL 2025 TIPS CPG (echo, BNP, RVSP over 45 mmHg leads to catheterization, no absolute MELD cut-off, smallest width under 12 mmHg); Baveno VIII (HCC is not an absolute bar for ascites; no TIPS to prevent a first decompensation). Engine readiness 4: everything runs, but the heart effect is small (RA rises about 1.2 mmHg) because the model has one pump and no lungs. Effort 3 (moderate): the deck goes from 9 to 7 slides, two of them new.

**Outline:**

- The parallel path | Collaterals are a second path around the liver | Keep 'own' (the parallel-resistance equation, lens 'flow', sites ['split']), but give it a new person: its case nearly copies sites/sin, two-inflows/cirr and lobule/cirr ('despite spironolactone and furosemide', platelets 57,000/µL). Example: 'A 63-year-old woman with primary sclerosing cholangitis and cirrhosis has large varices and a little ascites on ultrasound. Her platelets are 57,000/µL.' Check it against the figure.
- The parallel path | A TIPS is a wide parallel path | Keep 'tips' with whatIf tips.d and the TIPS Doppler. line in one sentence: 'A covered stent from the right portal vein to the right hepatic vein opens a wide parallel path, so the PPG falls to {ppg}, under the {<12 mmHg} target.' notes: EASL 2025 asks for the smallest width that reaches the target; Baveno VIII does not use a TIPS to prevent a first decompensation.
- Choosing the patient | A TIPS sends portal blood straight to the heart | New. compare [{ label: 'No TIPS', params: { tips: { on: false } } }, { label: 'TIPS', own: true, params: { tips: { on: true, d: 8 } } }], cam 'route', labels ['CONF','RA'], tiles ['ra','co','ppg'], key ['ra']. line: 'A TIPS returns portal blood straight to the heart, so the right atrial pressure rises to {ra} and the cardiac output to {co}.' (model: RA 4.7 to 5.9 mmHg, CO 6.7 to 7.5 L/min). caveat: 'The model has one pump and no lungs, so it shows the extra return, not heart failure itself.' notes (4 sentences): EASL 2025 asks for an echocardiogram and ECG before every elective TIPS; a BNP under 40 pg/mL or NT-proBNP under 125 pg/mL suggests low risk, and an RV systolic pressure over 45 mmHg leads to right heart catheterization; portopulmonary hypertension (mean PAP over 20 mmHg with PVR over 2 Wood units) that is moderate to severe rules out an elective TIPS; cirrhotic cardiomyopathy is an LVEF of 50% or less, a global longitudinal strain under 18% or advanced diastolic dysfunction. ask: ['RV systolic pressure 58 mmHg on the echocardiogram before an elective TIPS. Next step?', 'Right heart catheterization, because moderate to severe portopulmonary hypertension rules the TIPS out.']
- Choosing the patient | The liver gives up its portal blood | New; replaces treatment/cost, which keeps a pointer. lens 'origin', sites ['split'], tiles ['liver','shunt'], delta 'tips'. line: 'The stent takes portal blood away from the sinusoids, so flow through the liver falls to {liver}, and a liver with little reserve can fail.' notes: EASL 2025 sets no absolute MELD cut-off, but a high MELD (or FIPS) predicts death after TIPS; other contraindications are uncontrolled infection, refractory encephalopathy and unrelieved biliary obstruction; HCC is not an absolute bar for ascites unless the tumor lies on the track (Baveno VIII). ask: ['Bilirubin 4.5 mg/dL, MELD 24, refractory ascites. TIPS or transplant assessment first?', 'Transplant assessment first: a high MELD predicts liver failure and death after a TIPS.']
- Width and failure | An occluded stent | Keep 'occl'. Add tool { kind: 'doppler', vessel: 'TIPS', delta: 'tips' } to ghost the working stent. line: 'With the stent clotted, the PPG is back to {ppg}, as before the TIPS, so bleeding or ascites can return.' Surveillance detail stays in tips-doppler.
- Surgical shunts | Where a shunt joins decides what the liver keeps | Keep 'dsrs' (tests/splenorenal-route.test.js:53-57 and deck-lenses need it). compare [{ label: 'Warren', own: true, params: { dsrs: true, portocaval: false, mesocaval: false } }, { label: 'Portocaval', params: { dsrs: false, portocaval: true, mesocaval: false } }, { label: 'Mesocaval', params: { dsrs: false, portocaval: false, mesocaval: true } }], lens 'origin', tiles ['ppg','liver'] (model, acute: PPG 15.8 / 3.0 / 6.9 mmHg; liver flow 55 / 40 / 25%). caveat: 'The model does not tie off the coronary vein, as the Warren operation does, so the varices shrink less here.' notes: a covered TIPS replaced surgical shunts in cirrhosis; surgery remains for some patients without cirrhosis, such as a cavernoma with no usable left portal vein for a meso-Rex bypass, or schistosomiasis in endemic regions.
- Summary | Each shunt trades gradient for flow through the liver | visual 'table', cols ['ppg','liver','ra'], asc false, vs 'first', of ['own','tips','heart','liver','occl','dsrs']. Title 'TIPS: who, how wide, at what cost'; TOPICS short 'TIPS and surgical shunts', tab 'TIPS'. objectives: ['Explain how a TIPS lowers portal pressure as a parallel path', 'Name the heart, lung and liver checks before an elective TIPS', 'Recognize a failed stent on the gradient and the Doppler', 'Contrast selective and total surgical shunts by what the liver keeps'].

**Notes:**

This rebuild depends on ranks 1 and 3: srs and wide move to encephalopathy, and grs and brto move to refractory-bleed. If the owner adopts neither, keep those slides here and add only the heart and liver slides, for 11 slides.

The right-heart review's 'notips' slide still belongs in right-heart: a TIPS cannot drain a liver backed up by the heart (rhf plus TIPS: PPG 1.4 to 1.3 mmHg). The two slides point to each other.

Tests to keep green:
- case-card count at 55 or more;
- splenorenal-route and deck-lenses (dsrs);
- visual references redrawn for the moved slides.

Evidence:
- EASL TIPS CPG, J Hepatol 2025;83:177-210 (work-up thresholds from summaries, medium; check the PDF);
- Izzy, Hepatology 2020;71:334-345;
- ESC/ERS 2022 PH definitions;
- Krowka, ILTS 2016.


## 8. Predict cards: the room commits to an answer before the model moves (engine-feature)

**Merged from:** Learning-science idea 1: predict cards reusing the case card; Engine-first idea 2: predict, then reveal (reveal and veil fields); Foundations review: 'predict-foundations' retrieval deck; Blueprint P4 and objective 6 (DESIGN_BLUEPRINT.md:83, 109-111)

**Scores:** Teaching value 5: predict, observe, explain is the blueprint's own principle, and predicting before a demonstration improves understanding (Crouch 2004; Brod 2018). Guideline relevance 2: it is a format, not content. Engine readiness 3: one small presenter change, reusing caseRun (presenter.js:1631-1700). Effort 3 (moderate): presenter code, a handout line, a test, and about 12 cards.

**Outline:**

- Engine | Slide field predict (219 characters or fewer) | caseRun shows a centered frosted card tagged 'Predict' over the previous slide's state, and the slide's own words stay hidden. Next or a tap lifts it, then morphTo eases the slide's change in view (1200 ms), so nothing jumps. Forward only, like case cards (presenter.js:1846). Never on a preset slide, where the vignette owns the card; at most one per slide; printed in the handout as 'Predict' above the title (handout.js:98-113). Length test copied from tests/case-card.test.js:14; guide section 14b.
- circuit/meal | Predict the healthy meal | predict: 'After a meal the gut sends about a quarter more blood to a healthy liver. Will the portal gradient rise a lot, a little or not at all?' The lapse plays on lift. Confirm with the owner: circuit has no case cards by the owner's choice, and a predict card is not a case.
- circuit/both | Predict the cirrhotic meal | predict: 'The same meal reaches a cirrhotic liver. Will the gradient rise more or less than it did in the healthy one?'
- variceal-bleed/minutes | Shock before anemia | predict: 'Minutes into the bleed, which moves first: the hemoglobin, or the blood pressure and pulse?'
- treatment/band | The pressure banding leaves | predict: 'Four bands close the varices. Will the HVPG fall, stay the same or rise?' (on lift the HVPG rises about 1 mmHg, as the slide's caveat says)
- tap/lvp and tap/back | The tap and the return | lvp: 'Eight liters of ascites come off. Which way will the portal pressure move?' back: 'No diuretics are started after the tap. How much of the fluid will be back in two weeks?'
- pvt-cirrhosis/clot | Which gradient sees a clot? | predict: 'A clot fills 60% of the portal vein. Which reading rises: the HVPG, the PPG or both?'
- outflow/open | One vein enough? | predict: 'Angioplasty reopens the right hepatic vein and the other two stay clotted. Will the ascites clear?'
- pregnancy/weeks | The second trimester | predict: 'At 24 weeks her blood volume and cardiac output are far above what they were. What happens to her varices?'
- refractory-bleed/choose | Closing the shunt | predict: 'BRTO plugs the gastrorenal shunt. Will the portal pressure rise or fall?'
- two-inflows/switch (no code today) | Hold the answer back | Keep compare and own 'Buffer on'. line: 'With the buffer, the liver keeps {liver} of its blood flow after the clot; predict how much it keeps with the buffer switched off, which no patient can do.'
- House rule | Where cards go | Two or three per deck, on outcomes a learner would get wrong. A predict question is a real question the room answers, which the humanizer's ban on rhetorical questions allows; say so in the guide.

**Notes:**

Chosen over the reveal and veil fields (engine-first idea 2):
- A predict card reuses a tested card and never changes the step logic for back or jump.
- A veil can leak its number through the figure's readouts, callouts or the ladder's axis.

where-resistance reaches 12 slides without code instead (rank 10).

Owner style: the owner asks the room by voice and keeps the screen clean (no ask button, presenter.js:3302). A card is not a button, but confirm with the owner. Test a lift during a long morph and a lift that starts a lapse on the iPhone.

Evidence:
- Crouch et al., Am J Phys 2004;72:835-838 and Brod et al., Learn Instr 2018;55:22-31 are cited from memory (medium-high). Spot-check the pages.


## 9. New deck: The hyperdynamic circulation and the kidneys (new-deck)

**Merged from:** Curriculum gaps idea 5: hyperdynamic circulation and the kidneys (SBP to HRS-AKI); Foundations review: circuit 'hyper' slide, where-slide splanchnicTone slider; Treatment review: terli/HRS slide is off-topic in a bleeding deck and implies kidney effects; Digest B: ICA-ADQI 2024, CONFIRM, Terlivaz label, AGA 2024, Sort 1999, ATTIRE

**Scores:** Teaching value 5: blueprint lesson 4 (forward flow) has no slide anywhere, and SBP-triggered AKI is daily ward work. Guideline relevance 4: ICA-ADQI 2024 dropped the fixed 48 h albumin challenge; US terlipressin label and boxed warning; Baveno VIII's beta-blocker stop rules. Engine readiness 3: the hyperdynamic state is built from first principles (engine.js:70, 269, 335, 782-785), but there are no kidneys, the baroreflex holds MAP near 95 mmHg, and COLS lacks co. Effort 3 (moderate): 9 slides, view switching to check, one table key.

**Outline:**

- Forward flow | In health the gut arterioles take most of the pressure | preset 'healthy', view 'circuit', sites ['rGut','rLiver'], data 'tiles', tiles ['co','hr','map']. line: 'The heart pumps {co} at a mean pressure of {map}, and the gut arterioles take most of that pressure before blood reaches the portal vein.' ask: ['Where does most of the drop from the aorta to the portal vein happen?', 'In the gut arterioles, which set the portal inflow.'] No case: like circulation and circuit, the opening teaches the model.
- Forward flow | Portal hypertension opens the gut arterioles | preset 'csph', view 'circuit', sites ['rGut','rColl','rLiver'], terms ['rGut'], tiles ['co','hr','bv'], delta 'rest'. line: 'As the PPG rises, nitric oxide and other vasodilators open the gut arterioles, so more blood enters the portal veins and the heart pumps {co}.' (model: 5.0 to 5.8 L/min)
- Forward flow | Inflow holds the pressure up as collaterals open | view 'circuit', sites ['rGut','rColl'], whatIf { label: 'Gut arterioles', param: 'splanchnicTone', min: 0.5, max: 1.5, step: 0.05, ends: ['Dilated','Constricted'] }, data 'ladder', key ['ppg']. line: 'Collaterals lower the resistance to portal flow, but the open gut arterioles keep the inflow high, so the PPG stays at {ppg}.' (model: dragging gives 22.4 to 17.3 mmHg). notes: beta-blockers and octreotide act on this side of the circuit. ask: ['Why does portal pressure stay high after collaterals open?', 'The gut arterioles stay dilated, so inflow rises and holds the pressure up.']
- Forward flow | Decompensation brings a fast, full circulation | cam 'fit' (back to anatomy), days 365, ramp { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse { seconds: 8, from: 'CSPH', to: 'A year later' }, tiles ['co','hr','bv'], delta 'open'. line: 'A year into decompensation the heart pumps {co} and the blood volume has grown to {bv}, while the blood pressure holds at {map}.' caveat: 'The model's reflexes hold the blood pressure near normal; in advanced cirrhosis it often runs lower.' (model: CO 6.8 L/min, HR 86, volume 5.64 L)
- The kidneys | Infected ascites and a rising creatinine | preset 'cirr-decomp', params { diuretics: false }, days 60, cam 'fit', tiles ['asc','map','hr']. vignette (about 165 characters): 'A 60-year-old man with alcohol-associated cirrhosis and ascites has fever, ascitic neutrophils of 480/mm³ and a creatinine that rose from 0.9 to 2.1 mg/dL in 3 days.' line: 'With {asc} of infected ascites, his creatinine has more than doubled in 3 days, an acute kidney injury that may become HRS-AKI.' caveat: 'The model has no kidneys; it shows the circulation that feeds them.' notes: a third-generation cephalosporin, and albumin 1.5 g/kg within 6 hours and 1 g/kg on day 3 (Sort 1999: kidney failure 33% to 10%); stop diuretics, nephrotoxins and, if the pressure is low, the beta-blocker; ICA-ADQI 2024 calls it HRS-AKI when the creatinine has not improved 24 hours after volume and no other cause is found.
- The kidneys | Vasodilation underfills the arteries | params { systemicTone: 0.45 }, tiles ['map','hr','co'], delta true. line: 'Infection dilates the arterioles further, so the blood pressure falls to {map} even as the heart races at {hr}.' (model: MAP 82.6 mmHg, HR 106, CO 7.2 L/min). caveat: 'The model's reflexes hold the blood pressure up, so this slide sets the extra vasodilation by hand.' notes: arterial underfilling switches on renin, the sympathetic nerves and vasopressin, so the kidneys hold sodium and water; Baveno VIII lowers or stops the beta-blocker at a systolic pressure under 90 mmHg, a MAP under 65 mmHg or HRS-AKI.
- Treatment | Terlipressin narrows the gut arterioles and lifts the blood pressure | params { drugs: { terlipressin: true } }, cam 'portal', lens 'flow', tiles ['map','pvFlow'], delta true. line: 'Terlipressin narrows the gut arterioles, so portal inflow falls to {pvFlow} and the blood pressure rises to {map}.' (model: 0.54 to 0.25 L/min, MAP 88.8 mmHg). notes: CONFIRM reversed HRS in 32% against 17% but caused more deaths from respiratory failure; the US label (HRS only, IV boluses) says not to start at an SpO2 under 90% and to use caution with volume overload or ACLF grade 3; norepinephrine in the ICU, or midodrine with octreotide, are the alternatives. ask: ['HRS-AKI with an SpO2 of 88% on room air. Terlipressin?', 'No: hypoxemia is a reason not to start it; use norepinephrine in the ICU.']
- Treatment | Albumin fills the circulation, and too much overfills it | action [{ kind: 'infuse', fluid: 'albumin' }, { kind: 'infuse', fluid: 'albumin' }], tiles ['map','ra','co'], key ['ra'], delta true. line: 'Two infusions of albumin raise the blood pressure to {map}, but the right atrial pressure climbs to {ra}, so watch for fluid overload.' (model: RA 3.8 to 7.3 mmHg). notes: ATTIRE raised serum albumin in inpatients without fewer infections, kidney injuries or deaths, and with more pulmonary edema. Placed last before the summary, because infused volume never leaves the model.
- Summary | A fast, full circulation that still underfills the kidneys | visual 'table', cols ['map','hr','ppg','pvFlow'] (add 'co' once COLS has it), asc false, vs 'first', of ['rest','open','inflow','full','hrs','underfill','terli','albumin']. Deck: id 'hyperdynamic', level 'core', minutes 11; TOPICS foundations after two-inflows: ['hyperdynamic', 'The hyperdynamic circulation', 'Hyperdynamic']. checks: ['What defines HRS-AKI under ICA-ADQI 2024?', 'AKI in cirrhosis with ascites that does not improve 24 hours after volume, with no other cause.'], ['What albumin dose follows a diagnosis of SBP?', '1.5 g/kg within 6 hours and 1 g/kg on day 3.'], ['Why does cardiac output rise in decompensated cirrhosis?', 'Dilated arterioles and a larger blood volume let the heart pump more against less resistance.']

**Notes:**

Moves:
- treatment/terli comes here, which takes treatment from 11 to 10 slides and removes a kidney claim the model cannot show.
- circuit drops the proposed 'hyper' slide and points here.

Minimum version, if the owner wants no hand-set states: build slides 1 to 4 and the summary only (a foundation deck), and keep HRS in tap or treatment notes.

Engine:
- Switching from view 'circuit' to anatomy mid-deck is untried outside circuit, with a 700 ms wait (presenter.js:1330-1349). Check that it eases. The circuit slides are grouped first, so there is only one switch.
- Code: add co: 'Output' and bv: 'Volume' to COLS/CUT (table-marks.js:102-104).

Evidence (all high):
- Nadim, J Hepatol 2024;81:163-183;
- Wong, NEJM 2021;384:818-828;
- Terlivaz label rev. June 2026;
- Sort, NEJM 1999;341:403-409;
- China, NEJM 2021;384:808-817.
The Baveno VIII stop rules are medium (extracts).


## 10. Find the resistance as a worked example, then faded practice (14 slides to 12) (deck-merge-or-split)

**Merged from:** Learning-science idea 4: worked example, then fading; Engine-first idea 2: rebuild where-resistance shorter; Sites-causes review: notes speak to the room; duplicate patients (q1, q3, q6)

**Scores:** Teaching value 4: worked examples followed by fading help novices most (Renkl and Atkinson 2003), and the deck already interleaves its six cases. Guideline relevance 2: the content is unchanged. Engine readiness 5: no code; q1 and a1 share the csph patient (where.js:28-36). Effort 1 (very low): merge two slides, cut one, rewrite some notes.

**Outline:**

- Case 1 | Case 1: reading the ladder step by step | Merges q1 and a1. preset 'csph' with a new vignette (q1 now copies hvpg's case: 57-year-old man, 88,000/µL, 24 kPa), cam 'route' (keep 'lobule:sinusoid' if the lens buttons read better there), labels ROUTE, data 'ladder', key ['whvp','hvpg'], brackets { hvpg: 'works', ppg: 'works' }, compare LENS, rail true, causesHead 'Read the ladder', causes ['Find the largest step', 'Name the stations on each side', 'Compare the HVPG with the PPG', 'Check that the case fits that level']. line: 'The largest step falls between the wedged and free pressures, so the HVPG of {hvpg} carries almost all of the PPG of {ppg}: the resistance is in the sinusoids.' notes (learner-facing): 'Read every ladder in the same four steps. Here the step lies between the wedge and the free reading, so the wedge reads behind the resistance and the HVPG tracks the portal pressure. Colored by pressure drop, the sinusoids stand out.'
- Case 2 (first two steps given) | Where is the resistance in case 2? | q2 fields. line: 'The step lies before the wedge: the HVPG is {hvpg} but the PPG is {ppg}; use the Doppler of the main portal vein to choose between the two levels that fit.'
- Case 2 answer | a2 unchanged | (brackets, Clot mark and lens buttons kept)
- Case 3 (first step given) | Where is the resistance in case 3? | q3 with a new person (q3 nearly copies right-heart/constrict: a Hodgkin survivor around 60). Drop 'Ask the room...' from the notes.
- Case 3 answer | a3 | Add brackets { hvpg: 'misleads', ppg: 'misleads' }, matching a6.
- Case 4 (independent) | Where is the resistance in case 4? | line: 'Read the ladder and the fluid on your own: the HVPG is {hvpg} and the PPG {ppg}.'
- Case 4 answer | a4 unchanged | 
- Case 5 (independent) | Where is the resistance in case 5? | line: 'Read the Doppler, then the ladder, and place the resistance.' Give the person a different origin (q5 and ncph/patient are both from Lake Victoria).
- Case 5 answer | a5 unchanged | 
- Case 6 (independent) | Where is the resistance in case 6? | line: 'The portal pressure is high and both gradients are normal; place the resistance.' New person (q6 is the same 36-year-old man from Nepal as right-heart/web).
- Case 6 answer | a6 unchanged | 
- Summary | The largest step on the ladder names the level | Table unchanged (where.js:121). The 'ladders' visual (where.js:114-118) is cut, and its notes become one sentence of the summary notes. The 13 room-facing notes ('Give the room a minute', 'Tap Pressure drop') are rewritten as learner statements, because notes print in the handout.

**Notes:**

This is the cheapest fix for a broken house rule: 14 slides is over the 6-12 limit, or 16 screens with the Outline and quick check. If the owner prizes the six-ladders picture, keep it and cut the table instead, but that needs the owner's decision because rule 11 asks for a table.

A case card on the merged slide lands on the route framing. Check that the lens buttons still show the sinusoids clearly at cam 'route'.

The proposed 'where-resistance-2' deck is not adopted (see rejected). Its strongest case, schistosomiasis with hepatitis C cirrhosis, becomes ncph/mixed.

Evidence (high):
- Renkl and Atkinson, Educ Psychol 2003;38:15-22;
- Kalyuga, Educ Psychol 2003;38:23-31;
- Stark, Learn Instr 2011;21:22-33.


## 11. New deck: Read it yourself, five measuring stations (new-deck)

**Merged from:** Learning-science idea 5: 'Read it yourself' stations deck (blind Doppler); Measuring review: proposed deck 'CSPH without a catheter' (rule-out, gray zone, rule-in); Learning-science idea 3: key-feature items

**Scores:** Teaching value 4: no slide asks the learner to read a raw trace or do the HVPG arithmetic; the instrument card always prints its interpretation (doppler.js:282-344). Guideline relevance 4: two stations apply Baveno VIII and AASLD 2024 rules for ruling CSPH out and in. Engine readiness 3: the HVPG and FibroScan stations work today; the Doppler stations need a small 'blind' flag. Effort 3 (moderate): 11 slides plus the flag.

**Outline:**

- Station 1 | What is the HVPG? | preset 'csph', cath 'wedge', data 'tiles', tiles ['whvp','fhvp'] (both unrated, so they do not give the answer; never used by any deck). vignette (183 characters): 'A 52-year-old woman with alcohol-associated cirrhosis has a transjugular liver biopsy. Before the biopsy, the catheter records the free and wedged pressures in the right hepatic vein.' line: 'The free hepatic vein pressure is {fhvp} and the wedged pressure {whvp}; calculate the HVPG and classify it.'
- Station 1 answer | Clinically significant portal hypertension | cath 'result', monitor 'result', data 'ladder', key ['hvpg']. line: 'The HVPG is {hvpg}, at or above {>=10 mmHg}: CSPH, so carvedilol starts to prevent decompensation.' (model: WHVP 16.4, FHVP 4.8, HVPG 11.6 mmHg)
- Station 2 | EGD, beta-blocker or neither? | preset 'cirr-comp', cam 'liver', tool fibroscan, tiles ['lsm','plt']. vignette (143 characters): 'A 59-year-old man with MASLD and type 2 diabetes, BMI 28, has a FibroScan at his yearly visit. He feels well, and his platelets are 159,000/µL.' line: 'Stiffness {lsm}, platelets {plt}: decide on an EGD and a beta-blocker.'
- Station 2 answer | CSPH ruled out | data 'ladder', key ['hvpg']. line: 'A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out, and the HVPG here is {hvpg}: no EGD and no beta-blocker, with both tests repeated in a year.' (model: LSM 12.5 kPa, HVPG 6.4 mmHg)
- Station 3 | The gray zone | preset 'csph', cam 'liver', tool fibroscan, tiles ['lsm','plt','spleen']. vignette (new person): 'A 47-year-old man with alcohol-associated cirrhosis, sober for a year, has a stiffness of 24 kPa and platelets of 88,000/µL. He has never decompensated.' line: 'Stiffness {lsm} and platelets {plt}: is this CSPH, and what starts?'
- Station 3 answer | CSPH likely: carvedilol, no scope | data 'ladder', key ['hvpg']. line: 'AASLD presumes CSPH at 20 to 25 kPa with platelets under 150,000/µL, and the HVPG here is {hvpg}, so carvedilol starts and no screening EGD is needed.' notes: Baveno VIII settles the gray zone with a 75% or higher probability from ANTICIPATE (ANTICIPATE-NASH at a BMI of 30 or more, or NICER), or a spleen stiffness above 55 kPa on the 100 Hz probe; an indeterminate result is repeated after 12 months.
- Station 4 | Which way does the portal vein run? | preset 'cirr-hepatofugal', cam 'portal', labels ['CONF'], tool { kind: 'doppler', vessel: 'PV_TRUNK', blind: true }. vignette (165 characters): 'A 71-year-old man with cirrhosis from hemochromatosis comes for his 6-monthly ultrasound. He was admitted with encephalopathy last year, and his albumin is 2.6 g/dL.' line: 'Read the main portal vein trace and give the direction of flow and its speed.'
- Station 4 answer | Hepatofugal flow | lens 'direction', tool unblinded, tiles ['pvFlow','pvVel']. line: 'The portal vein drains the liver at {pvVel}, because the resistance in the liver is so high that portal blood leaves through collaterals.' (model: PV -13.2 cm/s)
- Station 5 | Is the stent working? | preset 'cirr-decomp', params { tips: { on: true }, stenosis: { TIPS: 0.6 } }, cam 'liver', tool { kind: 'doppler', vessel: 'TIPS', gate: 'mid', points: true, blind: true }. vignette (130 characters): 'A 63-year-old man had a TIPS for refractory ascites 8 months ago. The ascites has come back, and he now needs a tap every 3 weeks.' line: 'Read the velocities along the stent and in the portal vein, and decide whether the stent is open.'
- Station 5 answer | The stent is narrowing | tool { kind: 'doppler', vessel: 'PVH_L' }, tiles ['ppg']. line: 'Stent flow under 90 cm/s and a left portal vein that runs toward the liver again point to a narrowing, so venography with a gradient comes next.' (model: mid-stent 45.5 cm/s, main PV 20.1 cm/s, PPG 14.7 mmHg). caveat: 'These velocity cut-offs come from bare stents and are less specific in covered ones.'
- Summary | What each reading showed | visual 'table', cols ['hvpg','ppg','lsm','plt'], note 'Finding', of the five answer slides. Deck: id 'stations', level 'core', minutes 15; TOPICS: a new 'Practice' topic with where-resistance and five-years. objectives: ['Calculate the HVPG from the free and wedged pressures and classify it', 'Apply the stiffness and platelet rules to decide on an EGD or a beta-blocker', 'Read the direction of a portal vein Doppler', 'Recognize a narrowing TIPS on Doppler']. checks are 3 key-feature items, for example ['WHVP 18 mmHg and FHVP 6 mmHg. What is the HVPG, and what follows?', '12 mmHg: CSPH, so carvedilol starts and no screening EGD is needed.']

**Notes:**

Code:
- tool.blind hides the Doppler card's direction, pattern and note lines and its severity colors (dirEl, patternEl, noteEl, doppler.js:121-146, 435, 469-470). It keeps the spectrum, scale and velocity.
- Without it, the question slides drop the tool and ask the room to predict the trace.
- Stations 1 to 3 need no code. Station 1 must stay at cath 'wedge', because the result step prints the HVPG (hvpg-proc.js:122).

The model's spectra come from a lumped model. Say in the summary notes that the stations train reading direction, shape and numbers, not probe skills.

The pitfall cases of 'CSPH without a catheter' (meal, congestion, schistosomiasis) stay in stiffness, now as contrast pairs and predict cards. Cured hepatitis C belongs to cause-treated.

Evidence:
- Baveno VIII gray-zone tools: medium.
- AASLD 2024 gray-zone rule: medium-high.
- Mitchell, Abdom Radiol 2025, and the EASL TIPS CPG 2025: medium.


## 12. Refocus Lobule on zone 3 and the sinusoid wall, with the wall sealing on the disease clock (deck-modification)

**Merged from:** Engine-first idea 7: a time-lapse in the sinusoid view; Foundations review: lobule is the fifth pass over the resistance sites; the SOS HVPG error; statins; Ascites and tap reviews: the protein of cardiac against cirrhotic ascites taught in four places

**Scores:** Teaching value 4: the sinusoid view's fenestrae, Disse collagen and albumin sieving are unique to this deck, and they explain low-protein ascites. Guideline relevance 3: EBMT 2023 (SOS 10 mmHg or more); it removes the statin claim Baveno VIII withdrew support for. Engine readiness 4: the reflection coefficient rises from 0.42 to 0.53 on the ramp (engine.js:56-60), but a lapse in the sinusoid view is untested on a phone. Effort 2 (low): 8 slides, mostly re-cut.

**Outline:**

- Lobule | The lobule and its blood supply | Keep 'lobule'. Its notes nearly copy circulation/lobule ('a hexagon about a millimeter across'), so circulation merges its lobule and triad slides and points here.
- Lobule | Three zones by oxygen | Keep 'zones' (compare and the oxygen lens).
- Cirrhosis | Early cirrhosis: the sinusoid wall is still open | Replaces 'cirr'. preset 'csph', cam 'sinusoid', terms { fenestrae: 'sinusoid:fenestrae', 'space of Disse': 'sinusoid:disse', 'stellate cells': 'sinusoid:stellate' }, tiles ['sin','hvpg'], key ['sin']. vignette, a new person (the cirr-decomp case is shared with sites, shunts and two-inflows): 'A 61-year-old man with hepatitis B cirrhosis stopped his antiviral a year ago. Ultrasound shows a large spleen, and an EGD shows small esophageal varices.' line: 'The sinusoidal pressure is {sin}, and plasma with its albumin still crosses the [fenestrae](sinusoid:fenestrae) into the space of Disse.' Drop the statin sentence.
- Cirrhosis | As the wall seals, the ascites protein falls | days 180, ramp { cirrhosis: [0.6, 0.85], albumin: [4, 3.2] }, lapse { seconds: 9, from: 'Compensated', to: 'Six months later' }, cam 'sinusoid', tool { kind: 'flowtime', clock: 'days', lines: ['sin','asc'] }, tiles ['tp','asc'], key ['tp']. line: 'Over six months the fenestrae close and collagen fills the space of Disse, so albumin is turned back and the ascites that forms holds only {tp} of protein.' (model: sinusoids 23.6 mmHg, ascites 3.1 L, protein 1.6 g/dL). caveat: 'The model builds the fluid from pressure and albumin; it has no kidneys.'
- Cirrhosis | A failing heart leaves the wall open | compare [{ label: 'Cirrhosis', own: true }, { label: 'Heart failure', preset: 'rhf' }], cam 'sinusoid', tiles ['tp','saag'], key ['tp']. line: 'Cirrhosis seals the wall and the fluid holds little protein, while a failing heart congests an open wall and the fluid is rich in it, with a high SAAG in both.' (model: rhf protein 4.3 g/dL, SAAG 1.4). ascites/hf keeps its slide; tap/heart is cut and points here or to ascites.
- Congestion | Congestion starves zone 3 | Keep 'cong' (rhf, lobule:central, lens 'oxygen'), with rail true. It owns 'zone 3 suffers first'.
- Sinusoidal obstruction | Injured central veins block the outflow | 'sos' with params { fibrosis: { R: { post: 32 }, L: { post: 32 } } }, as outflow uses (model: HVPG 11.3 mmHg), so the slide shows the diagnosis its notes name. Use '10 mmHg or more' with the {>=10 mmHg} pill. tests/lobule-sinusoid-reading.test.js:33 reads lobule/sos, so rerun it.
- Summary | What the lobule shows | visual 'table', cols ['sin','tp','saag','hvpg'], of ['early','seal','contrast','cong','sos']. The 'schisto' slide (eight decks teach it) and 'wedge' (it repeats hvpg and ncph) are cut, with one pointer sentence in the summary notes.

**Notes:**

The sinusoid view needs WebGL2 and falls back to the lobule elsewhere (sinusoid-view.js:36-41). Check the frame rate during the 9-second lapse on the iPhone. Show the protein tile only from 'seal' on, because it reads a number even when there is no fluid. The deck stays at 8 slides and 10 minutes. Evidence: the engine's own source for the reflection coefficient (engine.js:56-60, PMID 1214504); Schaffner and Popper 1963 is cited from memory; EBMT 2023 (PMID 37095231) is medium.


## 13. New capstone deck: One liver, five years (new-deck)

**Merged from:** Learning-science idea 6: capstone 'One liver, five years', ten decisions on one patient; Learning-science idea 9: course tracks (capstone as the closing session)

**Scores:** Teaching value 4: it is the only deck that carries one patient across compensated disease, CSPH, ascites, a bleed, cure and recompensation, built from decision points. Guideline relevance 5: it encodes the Baveno VIII decisions (rule-out, CSPH treatment, NSBB with ascites, bleed bundle, pre-emptive TIPS criteria, recompensation over 6 months). Engine readiness 4: the whole chain was run; drug slides must avoid varix and lsm tiles. Effort 3 (moderate): 11 slides, one case.

**Outline:**

- Compensated | Compensated cirrhosis found on ultrasound | preset 'cirr-comp', cam 'liver', tool fibroscan, tiles ['lsm','plt'], tick 'Found'. vignette (163 characters): 'A 46-year-old woman who injected drugs in her twenties has chronic hepatitis C and a nodular liver on ultrasound. She feels well, and her platelets are 159,000/µL.' line: 'A stiffness of {lsm} with platelets of {plt} makes advanced chronic liver disease likely and rules CSPH out.' ask: ['EGD, beta-blocker or neither?', 'Neither: CSPH is ruled out; start antivirals and repeat the tests in a year.']
- Compensated | Untreated, the gradient climbs past 10 | days 730, ramp { cirrhosis: [0.4, 0.6] }, lapse { seconds: 8, from: 'Year 0', to: 'Year 2' }, tool fibroscan, tiles ['lsm','plt'], delta true. line: 'She did not start antivirals, and two years on her stiffness is {lsm} and her platelets {plt}.' (model: 24.2 kPa, 90). ask: ['What starts now, and does she need an EGD first?', 'Carvedilol for probable CSPH, and antivirals; on a beta-blocker no screening EGD is needed.']
- Compensated | Carvedilol lowers the gradient | params { drugs: { carvedilol: true } }, data 'ladder', key ['hvpg'], tiles ['hr'], when 'Same visit'. predict (if rank 8 is built): 'She starts carvedilol, 6.25 mg once a day and then twice a day. Will her HVPG fall below 10 mmHg?' line: 'Carvedilol brings the HVPG down to {hvpg}.' (model: 11.8 to 9.0 mmHg). ask: ['On carvedilol her HVPG reads 9 mmHg. Has the CSPH gone?', 'No: the drug holds the gradient down, and the cause is untreated.']
- Decompensated | Ascites: the first decompensation | days 365, ramp { cirrhosis: [0.6, 0.85], albumin: [3.8, 2.8] }, lapse { seconds: 8, from: 'Year 2', to: 'Year 3' }, tool abdomen, tiles ['asc','salb']. line: 'Still untreated, she develops {asc} of ascites and her albumin falls to {salb}.' ask: ['New ascites: what comes first?', 'A diagnostic tap with cell count, SAAG, protein and culture.']
- Decompensated | A diagnostic tap, then diuretics | params { diuretics: true }, days 28, tiles ['saag','tp','asc']. line: 'A SAAG of {saag} with low protein points to the sinusoids, and salt restriction with diuretics brings the fluid down to {asc}.' ask: ['Does carvedilol stop now?', 'No: with ascites it continues, carvedilol preferred, unless the systolic pressure stays under 90 mmHg, the mean under 65 mmHg or HRS-AKI develops.']
- Decompensated | The varices bleed | action { kind: 'rupture', tear: 0.6 }, cam 'varices', tool { kind: 'trace', range: 'beats' }, tiles ['map','hr'], key ['map'], delta true, tick 'Bleed'. line: 'She vomits blood, and the blood pressure falls to {map}.' ask: ['First hour?', 'Octreotide, ceftriaxone, red cells only below 7 g/dL, erythromycin before the scope, and an EGD within 12 hours.']
- Decompensated | Octreotide, blood and bands | params { drugs: { octreotide: true } }, action [prbc, four bands, prbc, crystalloid], tool { kind: 'scope', open: true }, tiles ['hr','hb']. line: 'Four bands close the bleeding varix, and at endoscopy she is no longer bleeding.' ask: ['She is Child–Pugh B8 with an HVPG of 15 mmHg. Pre-emptive TIPS?', 'No: it is for Child–Pugh C 10 to 13, B over 7 with active bleeding, or an HVPG of 20 mmHg or more; she continues carvedilol with repeat banding.'] (No map tile after the bleed: the model never restores volume.)
- Recovery | Antivirals at last | params { drugs: { octreotide: false } }, days 365, ramp { cirrhosis: [0.85, 0.6], albumin: [2.8, 3.8] }, lapse { seconds: 10, from: 'Antivirals', to: 'A year later' }, tool { kind: 'flowtime', clock: 'days', lines: ['asc','hvpg'] }, tick 'Cure'. line: 'Once the virus is cured, the ascites clears and the HVPG falls to {hvpg}.'
- Recovery | Recompensated, but not cured | params { diuretics: false }, days 180, tool { kind: 'trace', range: 'talk' }, causesHead 'Baveno VIII recompensation', causes ['Cause removed', 'No ascites off diuretics for over 6 months', 'No encephalopathy off lactulose, rifaximin or LOLA', 'No further bleeding']. line: 'Off diuretics for six months she stays dry, and her course from diagnosis plays on one chart.' notes add that liver function must return to Child–Pugh A (medium confidence).
- Recovery | Carvedilol still holds the HVPG down | compare [{ label: 'On carvedilol', own: true, params: { drugs: { carvedilol: true } } }, { label: 'Off carvedilol', params: { drugs: { carvedilol: false } } }], data 'ladder', key ['hvpg']. line: 'On carvedilol the HVPG is {hvpg}; off it, it climbs back above {>=10 mmHg}.' (model: 9.3 against 12.1 mmHg). ask: ['She asks to stop carvedilol. What do you advise?', 'Keep it: CSPH persists, stopping after recompensation has not been tested, and liver cancer surveillance every 6 months continues.']
- Summary | Five years, one liver | visual 'table', cols ['hvpg','ppg','plt','asc'], vs 'first', of ['meet','year2','carv','ascites','band','cure','keep']. Deck: id 'five-years', level 'advanced', minutes 15, TOPICS 'Practice'. 3 key-feature checks: rule-out, the pre-emptive TIPS criteria, stopping carvedilol.

**Notes:**

Build this after ranks 4 and 8. Its 'keep' slide repeats recompensation/keep on purpose, as retrieval, and it is presented last, never instead of one-year, recompensation or variceal-bleed.

Engine:
- The varix halves and stiffness falls at once on carvedilol (engine.js:775), so drug slides show only hvpg and hr.
- The bleed is modest (MAP 83 mmHg). If the owner wants frank shock, copy variceal-bleed/minutes (action: []) and recheck.
- Child–Pugh and active bleeding are typed text, as in variceal-bleed/tips.

Evidence:
- Baveno VIII bleed bundle and pre-emptive TIPS criteria: high (digest A).
- Recompensation details: medium.
- Learning science (Schmidt and Rikers 2007; Harden 1999): high.


## 14. A dye button: watch where the blood goes on five existing slides (engine-feature)

**Merged from:** Engine-first idea 1: 'Follow the blood' dye study deck and dye button

**Scores:** Teaching value 4: it is the circulation's own Observe step, and a moving path (portography, a reversed coronary vein, arterial blood leaving a TIPS through the portal branches) is easier to follow than a color map. Guideline relevance 2: it supports the TIPS Doppler signs and hepatofugal flow. Engine readiness 3: the dye bolus exists (blood.js:281-380; stage.injectDye, stage.js:7422; clearDye 8283) but is reachable only by the J key and vessel cards (main.js:1750). Effort 3 (moderate): a compare option, clean-up on slide change, a guide entry.

**Outline:**

- Engine | Compare option { label, dye: '<edge id>' } | Handled in abPick (presenter.js:1469-1480) like the lens and gate buttons: it calls stage.injectDye(id) and leaves the model untouched. stage.clearDye runs on leaving the slide. Injection points: V_INT (gut veins), V_SPL (splenic hilum), A_HEP (hepatic artery, hidden, crossed in about a second). Document it in decks.js and guide 7.4.
- circulation/inflow | In health, gut dye crosses the liver | compare [{ label: 'Inject into the gut veins', short: 'Gut veins', dye: 'V_INT' }]. Notes: 'Dye from the gut veins runs up the portal vein, fans out through the sinusoids and leaves by the hepatic veins.'
- varices/collat | In cirrhosis, part of the dye never reaches the liver | compare [{ label: 'Gut veins', dye: 'V_INT' }, { label: 'Splenic vein', dye: 'V_SPL' }]. The dye climbs the reversed coronary vein to the varices (model, cirr-decomp: LGV_CONF -0.2 L/min; collaterals C1a 0.4 and C3 0.4 L/min).
- tips-doppler/stent | Arterial dye runs back into the stent | compare [{ label: 'Gut veins', dye: 'V_INT' }, { label: 'Hepatic artery', dye: 'A_HEP' }]. Shows the Doppler sign the deck teaches: portal branches flowing toward the stent (model: PRE_R -0.2 L/min).
- prehepatic/cavernoma | Dye threads through the cavernoma | compare [{ label: 'Gut veins', dye: 'V_INT' }] (model: C8 1.1 L/min).
- outflow/caudate | Dye leaves only through the caudate veins | compare [{ label: 'Gut veins', dye: 'V_INT' }] (model: caudate veins 1.2 L/min, right hepatic vein 0).
- Optional later | A full 'Follow the blood' deck | Only if the five placements land well. Its outline (healthy, cirrhosis, TIPS, hepatofugal, splenic vein clot, cavernoma, Budd–Chiari, Warren shunt, summary) is in the engine-first idea set.

**Notes:**

Placed only on slides that have no compare row now: one row per slide, so two-inflows/fugal and shunts/dsrs, which already carry buttons, are skipped.

Check on the preview:
- that dye shows over the pressure and flow lenses (veins-gl.js:1097);
- that a second tap extends a run rather than restarting it (blood.js:338-341);
- how it looks at phone width.

The dye washes out over about 30 s, so it needs a button, not a one-off injection on arrival.

Evidence: McNaughton, RadioGraphics 2011;31:161-188; Mitchell, Abdom Radiol 2025 (PMID 39551838).


## 15. Study mode, a case box in the handout, and LMS completion (engine-feature)

**Merged from:** Learning-science idea 2: study mode (on-screen ask and notes, review queue); Learning-science idea 7: SCORM completion and the learner handout (without the exam visual); Capabilities summary: the handout drops vignette, causes and caveat; SCORM never scores; docs/LMS.md id bug

**Scores:** Teaching value 4: shared deck links (c/deck-<id>.html, ?script=) give a lone learner no questions, answers or notes, and the handout prints answers under their questions. Guideline relevance 2: format only. Engine readiness 2: presenter, handout and lms.js changes. Effort 4 (substantial): text-card fitting is intricate and must not jump.

**Outline:**

- Handout (handout.js:98-113) | Print the case | Add a 'Case' box for the vignette, plus causes and caveat. Add a 'Learner copy' option that prints asks and checks as questions with the answer key on the last page.
- LMS (lms.js:15-24; scripts/scorm.mjs:40) | Complete the lesson | Call lmsProgress(at, n) next to noteResume (presenter.js:1734). It sets cmi.core.lesson_location, sets lesson_status to 'completed' on the quick check slide, then calls LMSCommit. Drop masteryscore from unscored packages.
- docs/LMS.md | Fix the id | '?script=<id> (its file name)' fails for where.js, whose id is 'where-resistance'. Say 'the deck id'.
- Deck card in the menu (menu.js:212) | Present or study | 'Present' and 'Study on my own' side by side; a study link adds &study=1 (main.js:302-307). Never on in presenter mode.
- Content slide, study mode | Think first, then notes | Under the line, a 'Think first' button eases ask[1] open under ask[0], with the quick check's markup and motion (presenter.js:2299-2305), and a 'Notes' button. The card is fitted with everything open (as presenter.js:2572-2573 does), so opening never resizes the text.
- Quick check, study mode | Review later | 'Got it' or 'Not yet' per item; 'Not yet' items go to localStorage 'pps.review' (wrapped in try/catch, a per-device convenience only) and come back as 'Review: N questions' after 1, 3 and 7 days.

**Notes:**

Order of work: handout case box, LMS completion and the LMS doc fix come first. They are small, and they fix real gaps the capabilities summary found. Study mode comes later, after the room-facing notes are rewritten (see cross-cutting) and the drifting typed numbers in asks are fixed, because study mode puts them on screen beside live values.

The scored exam visual is not adopted (see rejected).

Evidence (high): Mayer and Chandler 2001; Karpicke and Roediger 2008; Kirschner, Sweller and Clark 2006; ADL SCORM 1.2 RTE (cmi.core.lesson_status, lesson_location).


## Rejected ideas

- Reveal and veil slide fields that rebuild Find the resistance at 8 slides (engine-first idea 2): replaced by predict cards (rank 8), which reuse the tested case card. A veil can leak its number through figure readouts, callouts or the ladder axis, and reveal adds a new step state to forward, back and jump. where-resistance reaches 12 slides with no code (rank 10).
- Compare-by-action buttons ('Two more units', 'Four units of plasma', paracentesis with or without albumin) (engine-first idea 3a): each adds an off-screen branch of the chain, which is slow on phones, and needs presenter work. The transfusion lesson is already live in variceal-bleed/blood. The albumin-after-tap gap in the model is tiny (HR 94 against 92/min). Keep 'no plasma for the INR' in notes and in the endoscopy quick check.
- Wall-tension tile (engine-first idea 3b): Tcrit is a model constant, so the tile reads 158% of bursting tension in cirr-decomp on slides where nothing bursts. That invites a false reading. Use tool { kind: 'wall' } on drug slides instead.
- Valsalva action for pregnancy/delivery (engine-first idea 3c; capabilities summary): the chain's quiet settle erases it (engine.js:696-701), its release is a step that breaks 'everything eases' (engine.js:296-299), and the model's pressure across the varix wall falls during the strain (18.6 to about 10 mmHg). That contradicts the delivery line. The physiology needs the owner's judgment first. Meanwhile, word pregnancy/delivery as 'raises the portal pressure', not the pressure across the varix wall.
- Separate 'Gastric varices' and 'Fundal varices' decks (curriculum gaps idea 2, engine-first idea 4) alongside a separate refractory-bleed deck: merged into one deck (rank 3). Splenic vein thrombosis stays in prehepatic, so the fundal story is not split three ways.
- 'Total, partial, selective: surgical shunts' deck (engine-first idea 5): surgical shunts are rare in cirrhosis. The pediatric meso-Rex bypass cannot be built (custom shunts run only portal to systemic, topology.js:176-190), and the core lesson fits one three-button compare on shunts/dsrs (rank 7). The Warren and DIVERT citations were from memory.
- 'Surgery and procedures in portal hypertension' deck (curriculum gaps idea 4), deferred: the resection stand-in still draws the removed lobe, plasma infusion is untested in decks, pre-operative TIPS has no RCT, and the Bruix, Berzigotti, Reverter and VOCAL-Penn numbers were cited from memory without verification. Revisit after the Baveno VIII PDF check. The 'no plasma for the INR' point lives in notes and checks now.
- 'CSPH without a catheter' deck (measuring review): merged into the stations deck (rank 11, two FibroScan stations). Its pitfall cases (meal, congestion, schistosomiasis) are already in stiffness and become contrast pairs and predict cards there; cured hepatitis C belongs to cause-treated (rank 2).
- 'where-resistance-2' deck (sites-causes review): its patients mostly repeat other decks (svt, budd-chiari, rhf, MASLD). The one new lesson, schistosomiasis with hepatitis C cirrhosis, becomes the ncph 'mixed' slide (see cross-cutting).
- 'predict-foundations' retrieval deck (foundations review): predict cards on circuit/meal, circuit/both, two-inflows/switch and pvt-cirrhosis/clot give the same retrieval in place, without a 28th foundation deck.
- Full 'Follow the blood' dye deck as a first step (engine-first idea 1): reduced to a dye button on five existing slides (rank 14). The deck stays optional once the button proves itself on devices.
- 'Two futures' slide reference button { slide: '<id>' } (engine-first idea 6): small code with little gain. Patient buttons with days already show chronic futures. prehepatic uses either the anticoagulation lapse or the preset futures (rank 4).
- Scored exam visual and 'final-check' deck (learning-science idea 7, exam part): new furniture close to the forbidden Guidelines slide type, and every item needs physician review whenever guidelines move. Kept: SCORM completion and the learner handout (rank 15).
- Slide field 'look' in the figure key pill (learning-science idea 9): the pill is small on a phone and the phrase must stay under 5 words. Instead, fold 'colored by X' into the one-sentence line after a semicolon, enforced by the new sentence test (cross-cutting).
- New tiles 'he' (encephalopathy risk), 'ssm' (spleen stiffness) and a renal perfusion readout: 'he' is the shunted share times a constant (metrics.js:69) and adds nothing. Spleen stiffness is not modeled, and mapping it from the PPG would invent a measurement with false precision. A kidney readout would imply a kidney model the engine lacks.
- albumin infuse on tap/albumin (capabilities summary): the ascites review ran it, and the model's ascites then returns faster (6.0 L against 3.7 L at 14 days, RA 9.1 mmHg), which reverses the teaching. Keep params { albumin: 2.74 } and show the PICD on tap/lvp (HR 85 to 95/min).
- Plasma (FFP) slide inside variceal-bleed or endoscopy: infused volume never leaves the model, which has no kidneys, so every later slide would carry it. The point stays in notes and in a check.
- Pregnancy 'weeks' as a 168-day gestation lapse (capabilities summary): the pregnancy review found it turns the slide into decompensation. Keep the acute slider; only 'after' gets a ramp.
- One-lobe fibrosis slide on catheter sampling error: uncertain clinical value (the capabilities summary flagged it), and the catheter wedges only the right hepatic vein.
- Fontan slide in right-heart: rhf with tr 0 and contractility 0.4 for a year gives 2.9 L of ascites, which does not match a typical Fontan liver. Keep it as one notes sentence (EASL-ERN 2023).
- Breathing-depth slider (respDepth) on doppler/probe: low teaching value for its cost.
- Course-track filter chip in the menu (code): the tracks work as a printed sequence and a docs page; the code is optional and last.

## Curriculum map

Order of decks, existing and new (33 in all: 27 plus 6 new). Each deck still stands alone.

Foundation, mechanisms (about 42 min):
- circulation (merge its lobule and triad slides; add 'meet', the four portosystemic meeting points)
- circuit
- two-inflows
- hyperdynamic (new)

Core 1, measuring and finding the level (about 120 min):
- hvpg (home of the HVPG pitfalls)
- sites (home of the six-level tour)
- stiffness
- doppler
- one-year (now played live)
- prehepatic, ncph, right-heart (home of congestion)
- pvt-cirrhosis, spleen
- stations (new): closing practice

Core 2, complications (about 67 min):
- varices
- endoscopy (screening, grading, Laplace, banding)
- variceal-bleed (home of resuscitation)
- ascites (home of the SAAG)
- encephalopathy (new)
- cause-treated (new)

Advanced 1, treatment (about 70 min):
- beta-blockers
- treatment (mechanisms only, once HE and HRS move out)
- tap (choosing TIPS in ascites)
- shunts, renamed 'TIPS: who, how wide, at what cost'
- tips-doppler (home of surveillance)
- refractory-bleed (new)
- recompensation

Advanced 2, vascular and special situations (about 31 min):
- outflow
- lobule (refocused on zone 3 and the sinusoid wall)
- pregnancy

Practice and capstone (about 28 min), last:
- where-resistance (12 slides)
- five-years (new)

Menu (TOPICS, decks.js:164-170):
- Foundations adds hyperdynamic; hvpg stays as the bridge.
- Complications adds encephalopathy after tap and refractory-bleed after variceal-bleed.
- Treatment adds cause-treated and renames shunts 'TIPS and surgical shunts'.
- A new Practice topic holds stations, where-resistance and five-years.

Tracks:
- Residents, 4 sessions of about 30 to 40 min (about 2 hours): (1) circulation, sites, hvpg; (2) stiffness, varices, variceal-bleed; (3) ascites, encephalopathy, beta-blockers; (4) stations.
- GI and hepatology fellows: the residents' track, then the remaining core and advanced decks in the order above, ending with where-resistance and five-years.
- Radiology and IR: circulation, sites, doppler, tips-doppler, shunts, refractory-bleed, prehepatic, outflow, pvt-cirrhosis, stations.

Each session opens with the previous session's quick check (spaced retrieval). Plan about 1.5 times the deck minutes for live discussion.

Topics the engine cannot show stay as notes, with a caveat, on the nearest slide rather than becoming decks:
- SBP microbiology and prophylaxis
- hyponatremia
- hydrothorax
- ACLF, frailty and nutrition
- hepatopulmonary syndrome
- HCC surveillance
- children (Baveno VIII says stiffness should not guide their care)


## Cross-cutting changes (as the judge wrote them; see the render-check corrections above)


Do first: a Baveno VIII currency sweep, in one commit.
- Beta-blockers with ascites: endoscopy/large (endoscopy.js:47) and recompensation/carv (recompensation.js:49) still call the benefit an open question. Baveno VIII's new statement recommends carvedilol preferred with ascites and varices (LoE 3, strong) and keeps the stop rules: systolic under 90 mmHg, MAP under 65 mmHg, or HRS-AKI. beta-blockers.js:81 already says so.
- 12 mmHg is a rising risk, not a cut-off: fix the hvpg/grades ask and objectives and endoscopy/tension (endoscopy.js:56).
- Pre-emptive TIPS: endoscopy/band (endoscopy.js:88) adds an HVPG of 20 mmHg or more, 'ideally within 24 hours' and the late window. variceal-bleed/tips already has them.
- Endoscopy timing: 'within 12 hours, sooner if unstable' in variceal-bleed/band and endoscopy.js:64 and :71.
- Spleen stiffness: 'above 55 kPa on the 100 Hz probe' in stiffness.js:51, one-year.js:39 and main.js:1857. Spleen stiffness under 40 kPa spares the scope; spleen/screen owns that point.
- Statins: remove from lobule/cirr.
- Use cACLD for diagnoses made by non-invasive tests (define it in stiffness/fibrosis).
- docs/DESIGN_BLUEPRINT.md:1143 still names Baveno VII.
- The app's own note at main.js:1857 is still true: the Baveno VIII PDF needs a line-by-line check, and every statement known only from extracts should be flagged medium until then.


Drug and practice details for US readers, the same wording in every deck.
- Octreotide: '50 µg bolus, then 25 to 50 µg an hour' (AASLD 2024 table, per both digests; confirm) in variceal-bleed, treatment/oct and endoscopy/oct.
- Ceftriaxone: 'up to 7 days' in variceal-bleed/oct, not 5 (AASLD and ESGE; Baveno VIII individualizes it).
- Bridge: 'a balloon tube, or a covered esophageal stent where available' in variceal-bleed/band, which now says the stent is preferred.
- Carvedilol's extra HVPG fall: 'about 1 to 2 mmHg more than propranolol' in beta-blockers/carv-sin, treatment/vs, one-year/carv and circuit/drugs.
- Carvedilol's stellate-cell mechanism: hedged as in beta-blockers, not stated as fact in circuit/drugs and treatment/carv.
- Overt HE after TIPS: 'a third to a half in the first year' in treatment, tap and shunts.
- Baseline TIPS Doppler: 'in the first weeks' (doppler/tips).
- Terlipressin: US-approved for HRS only.


Vascular and threshold wording.
- SOS: '10 mmHg or more', using the {>=10 mmHg} pill, in outflow/soswedge (outflow.js:69-70), lobule/sos, sites/postsin and the hvpg summary notes (EBMT 2023). endoscopy.js:38 has the same 'above 10 (CSPH)' slip.
- Give lobule/sos outflow's params (fibrosis post 32, HVPG 11.3 mmHg), or keep sites' 'earlier stage' caveat.
- Budd–Chiari: blank the HVPG in sites/summary, as hvpg does.
- outflow/sos causes: add inotuzumab and gemtuzumab ozogamicin, and thiopurines in the notes. outflow/recover: ursodeoxycholic acid for every HSCT; defibrotide prophylaxis failed (HARMONY).
- pvt-cirrhosis:
  - Anticoagulation qualifiers: a clot of 50% or more, recent (under 6 months), or symptomatic, or any transplant candidate.
  - Attribution: 'Baveno VII and EASL 2025', not Baveno VIII.
  - The CSPH case gets carvedilol and no screening EGD, and anticoagulation is not delayed for banding.
  - The base slide uses lens 'velocity' and pvVel, or rewords 'slow flow'.
  - The clot slide gets a caveat that partial clots often stay stable (Nery 2015).
- PSVD: ncph/nsbb and the beta-blockers caveats drop 'EASL 2025 and Baveno VIII'. They show the point live with a three-button compare and cite only Razafindrazoto (JGH Open 2022). The unverified 'de Abreu 2022' goes.


House rules.
- One sentence per line and at most 4 sentences of notes: add tests/deck-line-sentences.test.js with a KNOWN list, as deck-thresholds does, and clear it deck by deck. 200 of 249 lines and 60 notes break the rule now.
- Fold the 'Colored by X, ...' sentence into the line after a semicolon. Move trial numbers and doses to notes.
- Rewrite the 13 notes that speak to the room ('Give the room a minute', 'Tap Pressure drop'), because the handout prints notes.
- Slide counts: tips-doppler 13 to 12 (cut 'shunted'; give 'stent' the '{ppg@before} to {ppg}, under the {<12 mmHg} target' line). where-resistance 14 to 12 (rank 10).
- Summary tables:
  - varices gets one: of collat, svt, umbilical and nograd; cols hvpg, ppg, varix, spleen, plus gv once COLS has it.
  - one-year gets one (rank 4).
  - Ask the owner whether ascites may end on its quadrant.


Case cards: vary the people (guide section 14).
- Duplicates to replace:
  - where q1 is the hvpg route case;
  - where q3 nearly copies right-heart/constrict;
  - where q6 is right-heart/web;
  - where q5 and ncph/patient both come from Lake Victoria;
  - 'RUQ pain for 2 months and now tense ascites' appears in sites/post, outflow/bc, doppler/bc and ascites/bc;
  - the MASH woman with recurrent HE appears in doppler/reverse, two-inflows/fugal and shunts/srs;
  - the cirr-decomp 'despite spironolactone and furosemide, platelets 57,000/µL' case appears in sites/sin, shunts/own, two-inflows/cirr and lobule/cirr;
  - a JAK2 case appears in both sites/pvt and two-inflows/clot.
- At least 10 cases are women with MASH, and at least 8 open on an older adult with severe TR.
- Fix tap/tense: a first slide with a ramp and a case breaks section 14, and the Outline loses the patient (decks.js:124).
- Fix spleen/normal: a case on a healthy slide.
- Fix the 'despite diuretics' wording where the model shows grade 1 ascites (1.06 L).


Model artifacts that learners can read as fact.
- On drug slides the varix diameter follows the gradient at once (engine.js:775), and liver stiffness falls at once.
  - Remove varix and lsm tiles from one-year/carv, treatment/prop and treatment/carv, and ncph/nsbb (key 'varix').
  - Use hvpg, hr, map or tool 'wall' instead, or add a caveat.
- Closing a shunt fills the esophageal varices at once (varixMature, engine.js:1037-1042). Every BRTO or embolization slide carries the 'over months in patients' caveat.
- Anticoagulation clears every clot, including cavernomas and hepatic veins (engine.js:810-815). Never show it for chronic Budd–Chiari or a cavernoma, and add the reopening caveat elsewhere.
- Infused volume never leaves the model (engine.js:911-921). Never follow an infuse action with days or other params without rechecking the numbers.
- The chain never clots an open bleed (engine.js:570). A slide with params settles twice and bleeds longer (worker-core.js:336, 352). Balloon and rescue slides need an explicit stopBleed.


One home per repeated idea, with one-line pointers elsewhere.
- Resistance levels: sites, with where-resistance for practice.
- HVPG pitfalls: hvpg.
- Lobule anatomy: lobule.
- Congestion and the pulsatile portal vein: right-heart. doppler/rhf keeps the waveform; both use 'pulsatility fraction' with VExUS cut-offs of 30% and 50%.
- Budd–Chiari Doppler: outflow. outflow/bcs notes also gain the IVC web cross-reference.
- SAAG and cardiac ascites: ascites. tap/heart is cut, which takes tap to 8 slides.
- Bleed resuscitation: variceal-bleed. endoscopy drops 'oct' and 'transfuse'.
- Splenic vein thrombosis: prehepatic/svt takes the splenicRx compare with lens 'delta'. varices/svt keeps lens 'origin' and a pointer.
- Hepatofugal flow: two-inflows takes the oxygen angle, doppler/reverse the waveform.
- 'Collaterals on imaging diagnose CSPH': a new doppler/umbilical slide with the C3 probe (the csph patient: PV 24 cm/s, paraumbilical vein 15.6 cm/s away from the liver). varices/umbilical takes lens 'direction' and a pointer.
- TIPS:
  - mechanism against drugs: treatment;
  - choosing it in ascites: tap;
  - work-up and width: shunts;
  - HE: encephalopathy;
  - surveillance: tips-doppler.
- Duplicate title: circuit/tips and treatment/tips share one; retitle one.


Live controls for the 13 decks that have none (no code; the response is acute, which is the lesson).
- ncph/nsbb: compare No beta-blocker / Propranolol / Carvedilol, tiles ['pv','map'] (carvedilol adds only 0.3 mmHg here, against 1.3 in CSPH).
- spleen/pse: compare Before / Embolized (splenicRx 0/1), with a caveat that platelets usually double in patients.
- right-heart/constrict: whatIf pericardial 0 to 1.
- outflow/soswedge and sites/postsin: whatIf central vein resistance ['fibrosis.R.post', 'fibrosis.L.post'] 1 to 40.
- hvpg/presin: whatIf periportal fibrosis ['fibrosis.R.pre', 'fibrosis.L.pre'] 1 to 80.
- two-inflows/clot and doppler/clot: whatIf thrombus.PV_TRUNK 0 to 1.
- doppler/rhf: whatIf tr.
- circuit/where: whatIf splanchnicTone 0.5 to 1.5.
- New ncph 'mixed' slide (schistosomiasis plus hepatitis C cirrhosis, days 180, whatIf cirrhosis): the HVPG of 11 against a PPG of 18 reveals a second level.
- right-heart gains a 'notips' compare slide: a TIPS cannot drain a liver backed up by the heart.


Unused instruments and figure aids to switch on.
- monitor 'result' on one-year/cath and d365, prehepatic/cath, ncph/wedge and outflow/soswedge.
- Brackets:
  - sites level slides (pvt and presin 'misleads' for HVPG; post and cardiac misleads);
  - beta-blockers/schisto and carv-pre (data 'ladder', key ['pv']);
  - prehepatic/cath (with block 'pv');
  - where/a3.
- rail true on lobule/schisto, cong and sos, and hvpg/presin, ppg, heart and bc.
- glowSeq 550 on sites/overview (six levels in order).
- beta-blockers/summary cols ['hvpg','ppg','res','map']: carvedilol lowers liver R from 9.5 to 8.1, while propranolol leaves it unchanged.
- A marks array instead of repeated pointers on varices/rectal (C4 and C7).
- tool fibroscan on right-heart/constrict.
- The first use of the 'delta' lens: on prehepatic/svt only, checked on the preview, because the portal vein reads slightly below healthy (6.9 against 7.8 mmHg).


Small code changes (owner's call; each is a few lines).
- table-marks.js:102-104: add gv, hb, co, bv, salb and pvVel to COLS and CUT. The variceal-bleed summary heads a column with the raw key 'hb' (variceal-bleed.js:77).
- doppler.js:41: label 'Paraumbilical', not 'Paraumb. C3'.
- doppler.js:295-303: pulsatility words that match VExUS (0.3 to 0.5 mildly pulsatile).
- Figure balloon fade-in and bleeding-jet fade-out (stage.js:5618-5620, 7432-7437), before any balloon slide.
- handout.js:98-113: print vignette, causes and caveat.
- lms.js and scorm.mjs: lesson completion.
- docs/LMS.md: script id fix.
- Authoring-guide drift (17 presets; gestation, stenosisSite, tiles co and bv, lens 'oxygen', probes DIPS, C1b and C3, tool gate and points, compare gate/short/preset-with-days, mark seg, calm, scale.rules, deltaLabel; tile cut-offs in 8.6; section 2 id list; velocity lens colors in 5.2), so authors stop missing what the engine can do.


Typed numbers in asks and checks are printed raw and can drift from the model: hvpg/heart asks '21, 20, 19 mmHg' while the ladder shows 20, 19 and 19. Either word asks without model numbers, or add a test that checks typed numbers against deck states (tests/deck-states.js already computes them). Do this before study mode puts asks on screen.

