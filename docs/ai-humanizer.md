# Clinical humanizer: learner text for US physicians

Rewritten 13 Nov 2026 (Mohammad: "X less Y is a stupid way of putting this minus that ... correct our humanizer to be clinically
oriented for an American physician"). Checked against the authoring guide (section 9, rules 13, 17 and 24), the cut-offs in
`src/engine/portal/pressure-cuts.js` and the guidelines in `guidelines/` (Baveno VIII, AASLD 2024, AASLD 2021 ascites, AASLD 2020 and EASL 2025 vascular).

Use it for every word a learner reads: slide titles, lines, notes, asks, checks, vignettes, teaching cards, instrument and data
cards, tile names and tooltips, pop-ups and toasts, preset names and descriptions, menus, Help, About, the guide PDFs, README
and changelog prose. `tests/clinical-wording.test.js` holds the mechanical rules (section 6) over every deck and the app's text.

## 1. Who reads it

A US internal medicine resident, a GI or hepatology fellow, an IR trainee or an attending. They know physiology, read AASLD
guidance and speak in its terms. Write the way an attending hepatologist teaches on rounds or in a fellows' conference:
standard US clinical vocabulary, standard abbreviations, real formulae, numbers with units. Plain means short and direct,
never lay. A substitute word a clinician would not use ("the belly", "kidney pressure", "a tap", "less" for minus) reads as
wrong, not as friendly, and costs the app its credibility.

**The test.** Read the sentence aloud as if presenting to the hepatology attending. Could they tell who does what, to which
structure, and why, without the figure? If they would correct a word, or wince,
change it. If it explains something every physician knows, cut it. If it could be pasted onto any other slide, it says nothing.

## 2. Arithmetic and formulae

- Subtraction is **minus** in prose and **−** (U+2212) in an equation. Never "less", "less the", "taken from", "after taking
  away", "leaves" or "what is left" for a subtraction.
  - HVPG = WHVP − FHVP. "The HVPG is the WHVP minus the FHVP."
  - PPG = portal venous pressure − IVC pressure. "The PPG is the portal pressure minus the IVC pressure."
  - Abdominal perfusion pressure: APP = MAP − IAP (WSACS; not "renal perfusion pressure", which no guideline defines). "The abdominal perfusion pressure is the MAP minus the intra-abdominal pressure." It is a number with no cut-off.
  - Transmural (variceal wall) pressure = intravariceal pressure − intraluminal (esophageal) pressure.
  - Filtration and Starling forces in their usual terms (capillary hydrostatic,
    oncotic pressure, reflection coefficient).
- A ratio or a product is said the clinical way: "SAAG = serum albumin − ascitic fluid albumin", "flow × resistance", "MAP 65 mmHg".
- Comparisons beside a number are symbols with no space: `>` `<` `≥` `≤` ("HVPG ≥10 mmHg", "platelets ≥150,000/µL",
  "LSM <15 kPa"). A comparative with no number ("carvedilol lowers the HVPG more than propranolol") and a duration ("over 3
  weeks") stay words. No word beside a cut-off pill (no "above {>=5 mmHg}"). No trailing plus ("150,000+").
- A change is "falls by 20%", "drops 4 mmHg", "rises to 14 mmHg". A difference of readings must equal the readings shown.

## 3. Vocabulary: say what a US clinician says

Use the term on the right. The left column is banned in learner text (the lint holds the starred ones).

| Lay or quaint | Clinical |
|---|---|
| X less Y\*, X take away Y | X minus Y |
| belly\*, tummy | abdomen; peritoneal cavity |
| the abdomen's pressure, pressure in the belly\* | intra-abdominal pressure (IAP) |
| the belly takes back\*, taken back | peritoneal reabsorption (mL/day) |
| kidney pressure\* | abdominal perfusion pressure (APP) |
| kidney function falls fast | acute kidney injury (AKI); HRS-AKI |
| a tap\*, tapped, the tap | paracentesis; large-volume paracentesis (LVP) |
| water pill\*, water tablet | diuretic (spironolactone, furosemide) |
| salt | sodium (2 g/day sodium restriction); "salt" only in "salt-poor albumin" or a diet the patient eats |
| the gut's blood, gut inflow | splanchnic (portal venous) inflow |
| gut veins, gut arteries | mesenteric veins, splanchnic arteries |
| the gut (as a vascular bed) | splanchnic circulation; the bowel or intestine when the organ is meant |
| scarring, scar | fibrosis (stage F0 to F4); cirrhosis when meant |
| fatty liver | steatosis; MASLD, MASH |
| the scope, the camera | the endoscope; at endoscopy, on EGD |
| the air (in the esophagus) | insufflation; intraluminal pressure |
| pressure across the wall | transmural pressure |
| the wedged pressure, the free pressure | WHVP, FHVP (define once: wedged and free hepatic venous pressure) |
| the neck | right internal jugular (transjugular) access |
| the heart's pressure, heart pressure | right atrial pressure (RAP) |
| blood pressure (when the mean is meant) | MAP |
| clot (in a vein, as a diagnosis) | thrombosis, thrombus; PVT, PVT occlusive or nonocclusive; "clot" is fine for the thrombus itself in passing |
| a bleed (as a diagnosis) | acute variceal bleeding (AVB), variceal hemorrhage; "a bleed" stays in quick speech |
| bleeds again | rebleeding |
| confusion, a muddled brain | hepatic encephalopathy (HE), overt HE, grade |
| the liver's flow, blood the liver gets | hepatic blood flow, portal perfusion of the liver |
| stiffness (bare) | liver stiffness measurement (LSM) by VCTE; spleen stiffness (SSM) |
| the shunt tube, the stent (as the procedure) | TIPS, covered TIPS stent (8 or 10 mm) |
| fluid in the belly | ascites (grade 1 to 3); tense ascites |
| fluid in the lungs, water in the chest | pulmonary edema; hepatic hydrothorax |
| fluid given, a drip | IV crystalloid, saline bolus, albumin infusion |
| worked out, sums | calculated, estimated |
| sits at, stands at, runs at | is |
| scar (in the liver) | fibrosis, fibrous septa |
| salvage and rescue TIPS used loosely | salvage TIPS: bleeding not controlled; rescue TIPS: rebleeding despite vasoactive drugs and EVL (AASLD 2024, 35) |
| medium varices | small (<5 mm) or large (≥5 mm) varices (Baveno VIII) |
| alcohol-related (as the disease name), post-hepatic | alcohol-associated, posthepatic |
| clot (in a label or title) | portal vein thrombosis, PVT |
| SAAG of 1.4 | SAAG 1.4 g/dL (always with its unit) |
| fed at (an organ) | perfused at |
| the room, the class | (never: write to the learner) |

British usage is out: American spelling (color, gray, hemorrhage, edema, esophagus, anemia), and none of "whilst",
"tablets" (say "pills" only for oral contraceptives as "OCP use"; otherwise the drug and dose), "per cent", "A&E", "theatre",
"being sick", "full blood count", "U&E", "GP". Drugs: US names (octreotide for AVB, terlipressin as its alternative;
terlipressin with albumin for HRS-AKI), with no region caveat. Platelets in US units (150,000/µL). Sodium in mEq/L, creatinine and bilirubin in mg/dL, albumin in g/dL.

## 4. Abbreviations

Standard ones, defined at first use in a deck or card, then used plainly: HVPG, WHVP, FHVP, PPG, EUS-PPG, IVC, RA, RAP, MAP,
IAP, APP, CSPH, cACLD, LSM, SSM, VCTE, NSBB, EVL, EGD, EUS, TIPS, BRTO, PARTO, CARTO, PVT, BCS, SOS, PSVD, NCPH, HRS-AKI, AKI,
SBP, LVP, HE, MELD (MELD-Na), CTP (Child-Turcotte-Pugh), GOV1, GOV2, IGV1, SAAG, MASLD, MASH, TR, JVP, RUQ. Use them as
clinicians do ("HVPG 14 mmHg", "a covered 8 mm TIPS", "CTP class C"), not spelled out every time and not invented
("Kidney P" is not an abbreviation; "APP" is).

## 5. Register

- **No dumbing down.** Do not explain what a physician knows ("the liver filters blood", "a beta-blocker slows the heart").
  Keep the mechanism at the level of a fellows' lecture: resistance and flow, Ohm's law, Starling forces, Laplace's law.
- **No lay metaphors.** Plumbing, sponges, traffic, dams and gatekeepers go. "Resistance rises in the sinusoids" teaches; "the
  liver becomes a clogged sponge" does not.
- **No anthropomorphic possessives.** "The abdomen's pressure", "the spleen's size", "the liver's flow" become "intra-abdominal
  pressure", "spleen size", "hepatic blood flow". A drug or organ does not "want", "try" or "push back".
- **Name the measurement.** "The WHVP is 18 mmHg", not "the reading is 18". "The tile reads" only for the app's own tile.
- **Clinical verbs.** Varices "bleed", "are banded" (EVL); ascites "accumulates", "is drained"; the HVPG "falls" or "drops";
  a TIPS "is placed" and "dilated"; a thrombus "recanalizes".
- **Say who acts.** A drug or therapy never starts, stops, restarts, resumes or continues on its own: a clinician does it. Write the
  action as an imperative ("Carvedilol restarts once the blood pressure has recovered" is wrong; "Restart carvedilol once the blood
  pressure has recovered" is right) or a passive with its drug ("carvedilol is restarted", "anticoagulation may be stopped"). A slide
  title that tells the learner what to do is an imperative: "Start carvedilol at CSPH", "Continue carvedilol despite ascites". The
  intransitive verbs belong to things that happen on their own (a pressure falls, ascites accumulates, a thrombus recanalizes, a
  bleed stops). The same goes for "the algorithm continues carvedilol": the algorithm says to continue it.
  Mohammad, 16 Nov 2026, on the title "Carvedilol restarts once the blood pressure has recovered": "Who restarts it? I don't
  understand." A sentence that leaves the reader unsure who acts is a defect. Held by the `drug-as-subject` rule (section 6).
- **Cause and effect in a title.** "With ascites, carvedilol continues" reads as if the drug caused the ascites. Say the order of
  events with "despite", "after" or "on" only where it is true: "Ascites and large varices despite carvedilol: continue it".
- **A card says only what the patient shows.** A verdict card (a path's "why" line) is built from the patient's own fields. It never
  says an event happened (an HRS-AKI that "has resolved") that the case does not have.
- **Only clinicians act** (wording audit, 16 Nov 2026, with an independent hepatologist's review). The rule above covers more than drugs:
  a guideline, an algorithm, a score, a test or a finding never starts, holds, withholds, keeps, continues or stops a treatment either.
  Clinicians start, hold, reduce, stop, restart, continue, place and give. Guidelines recommend, suggest, advise against or define.
  Tests and scores rule in, rule out or classify. Wrong: "Baveno VIII starts carvedilol", "the algorithm continues carvedilol",
  "Hypotension holds carvedilol", "Does the bilirubin withhold the TIPS?", "a covered stent goes in". Right: "Baveno VIII recommends
  starting carvedilol", "the algorithm says to continue carvedilol", "Reduce or hold carvedilol for hypotension", "Does the bilirubin
  rule out a TIPS?", "Place a covered TIPS". Held by `guideline-as-actor` and `finding-as-actor`.
- **Pressures, flows and structures.** A pressure is, rises, falls, exceeds or returns to a value. A flow is hepatopetal or hepatofugal
  and rises or falls. Never "runs at", "runs high", "sits higher", "jumps", "eases", "settles", "pushes", "pulls", "stays put". A vessel,
  an organ, a catheter or a gradient does not see, take, spare, hide, cost or lose its blood: a gradient "reflects", "includes" or
  "misses" a resistance, and only an instrument or a tile "reads". Held in part by `pressure-motion` and `sees`.
- **No figurative language, no teasers.** No idiom, figurative verb or pun: not "costs the liver its blood", "takes the flow with it",
  "bought time", "opens the door", "holds the ascites in", "under pressure", "for now", "the tear". "At the cost of" stays for the
  PPG-against-portal-perfusion trade-off. A title is a declarative finding or an imperative, never a cliffhanger or wordplay.
- **Complete sentences, one referent.** Every line, ask, answer and check is a sentence with a subject and a finite verb (labels, table
  notes and tool rows are exempt). "It", "they", "both" and "this" point to one noun in the same sentence; when two nouns could fit, repeat
  the noun ("repeat LSM and platelets", not "repeat both"). To meet the 30-word limit, cut a clause, never the verb, subject or object
  ("leaves the portal pressure unchanged", not "leaves the portal pressure").
- **Say when the patient changes.** A line that brings in a different patient opens with "In another patient". "Back in the first
  patient" only after a second patient has appeared. The vignette names every disease a later slide uses.
- **Model against patient.** Where the model behaves differently from what is known in patients, say "in the model". Two decks never
  teach opposite effects of one intervention. A count in a title or line ("two of three") equals the items on the slide's card and in
  the cited statement.
- **Drug choices, no region caveats (owner, 16 Nov 2026).** Never write "outside the US" or name a region for a drug. For variceal
  bleeding use octreotide where it is a sound alternative; where terlipressin is the drug the slide teaches (HRS-AKI, the terlipressin
  slide), name it with no caveat. A continuous terlipressin infusion, covered esophageal stents and long-term albumin need no caveat.
- **Grading and staging as written in the guidelines**: Baveno VIII "CSPH", "cACLD", "decompensation", "recompensation"; AASLD
  ascites grades; West Haven HE grades; varix size small (<5 mm) or large (≥5 mm).
- **One hedge per claim.** Thresholds are rising risk, not a switch: "bleeding risk climbs from about 12 mmHg".
- **Model honesty.** When the number is the model's, say so plainly ("in the model", "the model's estimate"), not with a hedge.

## 6. Mechanical rules (held by `tests/clinical-wording.test.js`)

The test walks every string in the built-in decks and in the app's text modules and fails on:
1. "less" used as subtraction (`MAP less the`, `pressure less the`, `WHVP less`, `less the IVC`, `less its`...).
2. The starred lay words of section 3: belly, kidney pressure, "a tap"/"the tap" for paracentesis, water pill, "takes back".
3. British spellings in the list of section 3 (colour, grey, haemorrhage, oesophagus, oedema, anaemia, whilst, per cent, centre
   for anatomy...). (Code names such as `--grey` or `centre` in a comment are not learner text.)
4. Em-dashes (—) in learner text.
5. A drug or therapy as the subject of start, stop, restart, resume, continue, begin or cease (`drug-as-subject`: carvedilol, propranolol,
   NSBB, beta-blocker, terlipressin, octreotide, albumin, diuretics, rifaximin, lactulose, antibiotics, anticoagulation and the rest of
   `THERAPY` in `scripts/clinical-wording.mjs`): "Carvedilol restarts", "the NSBB may continue", "anticoagulation comes first and
   continues". Write "Restart carvedilol", "carvedilol is restarted", "continue the NSBB".
6. A guideline, an algorithm or a finding as the one who acts (`guideline-as-actor`, `finding-as-actor`): "Baveno VIII starts
   carvedilol", "the algorithm continues carvedilol", "Hypotension holds carvedilol", "the bilirubin withholds the TIPS".
7. A pressure that "runs at" or "sits higher", a gradient or vessel that "sees" (`pressure-motion`, `sees`), and "scar" for fibrosis (`scar`).
8. `tests/deck-claims.test.js` also holds the text against the data: a line that says a reading "falls to {x}" or "raises ... to {x}"
   must agree with the state before the slide's change, and "rises from {x@id} to {x}" with the two slides it names.
A new phrase that a clinician would correct goes into the test's list in the same commit as its fix.

## 7. Patterns that sound machine-made (still out)

- Filler openers and closers: "it is important to note", "it is worth noting", "in conclusion", "overall", "in summary",
  "let's explore", "as we can see", "needless to say".
- Inflated words: crucial, pivotal, vital role, key role, delve, unpack, navigate the complexities, a testament to, a tapestry,
  a landscape of, leverage, utilize, harness, robust, seamless, cutting-edge, game-changing, unlock, revolutionize,
  fundamentally, essentially, ultimately, myriad, plethora, furthermore, moreover, additionally.
- Vague quantity: say the number ("HVPG >10 mmHg", "about a third of portal flow bypasses the liver").
- Shapes: "not only X but also Y", rule-of-three for rhythm, em-dash asides, colon-then-reveal ("The result? Pressure."),
  rhetorical questions, "is characterized by", stacked abstractions, same-length sentences in a row, a summary sentence that
  repeats the one before.

## 8. Teaching-card and slide rules (with the authoring guide)

- Learner-facing only: no instructor notes, no "teaching tip". UI instructions ("Press Next", "Drag Stent width") go in notes.
- One idea per line. Lead with the mechanism or the clinical consequence, then the number: "Sinusoidal resistance rises, so
  the HVPG climbs to 14 mmHg."
- Define a term at first use on a slide (HVPG, PPG, WHVP, FHVP), then use it plainly. The same word for the same thing in every deck.
- Say "resistance" for where pressure is lost (rule 13); established names keep their wording (sinusoidal obstruction syndrome).
- Thresholds as in the app: HVPG 5 mmHg (amber) and 10 mmHg (red); PPG 6 mmHg (amber) and 12 mmHg (red).
- Whole numbers only on the "Pressure, portal vein to heart" ladder card; one decimal elsewhere. Any HVPG or PPG equals the
  difference of the readings shown.
- Titles name the finding ("Splenic vein thrombosis raises pressure upstream"), never a teaser. Shrink to fit; trim filler, not meaning.
- No emoji, exclamation marks, slogans or hype words.

## 9. Before and after

| Before | After |
|---|---|
| The kidneys are fed at the MAP less the abdomen's pressure | The abdominal perfusion pressure is the MAP minus the intra-abdominal pressure |
| HVPG: the wedged pressure less the free pressure | HVPG = WHVP − FHVP |
| Ascites holds steady: the belly takes back the overflow. | Ascites is stable: peritoneal reabsorption matches the net lymph leak. |
| 120 leaks; the belly takes back 80. | Net leak 120 mL/day; peritoneal reabsorption 80 mL/day. |
| A tap lowers the abdomen's pressure | Large-volume paracentesis lowers the IAP |
| The air presses on the varix, so the pressure across its wall falls | Insufflation raises the intraluminal pressure, so the transmural pressure falls |
| Drag Scarring to move her across the cut-offs. | Drag Fibrosis to move her across the cut-offs. (notes only) |
| Less blood from the gut reaches the liver | Splanchnic inflow falls, so portal flow falls |
| It is crucial to understand that portal hypertension arises from a multifaceted interplay | Portal hypertension has two drivers: higher intrahepatic resistance and higher splanchnic inflow |
| Carvedilol restarts once the blood pressure has recovered | Restart carvedilol once the blood pressure has recovered |
| With ascites and large varices, carvedilol continues | Ascites and large varices despite carvedilol: continue it |
| Anticoagulation starts at once | Start anticoagulation at once |
| At this MAP, the algorithm continues carvedilol | At this MAP, continue carvedilol |
| The portal vein runs at {pv} and the right atrium at {ra} | The portal vein pressure is {pv} and the right atrial pressure {ra} |
| The shunt spares the platelets, and costs the liver its blood | The shunt spares the platelets but cuts hepatic portal perfusion |
| No carvedilol and no screening endoscopy; repeat both in 12 months | No carvedilol and no screening endoscopy; repeat LSM and platelets in 12 months |
| Large varices under pressure | Large varices with high wall stress |
| Octreotide leverages splanchnic vasoconstriction to mitigate bleeding | Octreotide causes splanchnic vasoconstriction, lowering portal inflow and portal pressure |

## 10. Final pass

1. No subtraction written as "less"; every formula is in its standard form with −.
2. No word from the left column of section 3; every term is the one a US hepatologist uses; abbreviations defined at first use.
3. Nothing explains what a physician already knows; no lay metaphor; no anthropomorphic possessive.
4. Every claim has a subject, a verb and, where it applies, a number with a unit; comparisons beside numbers are symbols.
5. No em-dash, emoji, exclamation mark, rhetorical question or "not only... but also"; no filler or inflated word.
6. Meaning, thresholds, direction of effect and the guideline source are unchanged (check `guidelines/` when unsure).
7. `npm test` passes `tests/clinical-wording.test.js`.

## Prompt to hand to a model

> Rewrite the text below for US physicians (residents, GI and hepatology fellows, attendings). Keep every fact, number,
> threshold and citation exactly. Use standard US clinical terms and abbreviations (HVPG = WHVP − FHVP, PPG, IAP, APP, LVP,
> NSBB, TIPS, CSPH), write subtraction as "minus" or "−", never "less", and use symbols for comparisons beside numbers.
> No lay words (belly, kidney pressure, a tap, the gut's blood), no British usage, no dumbing down, no metaphors, no filler,
> no em-dashes. One idea per sentence. Return only the rewritten text, plus a one-line list of any fact you were unsure about.
