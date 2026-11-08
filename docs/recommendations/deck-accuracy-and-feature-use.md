# Decks and slides: accuracy and feature use

8 Nov 2026. Recommendations only: no app code, deck or test was changed, and nothing was run in a browser.

**What I read.** All 31 decks in `src/ui/decks/` (343 slides) on `claude/settings-topbar-icon-flvft1` at 2bde649, then the
gastric-varices change in 14bd769 (the new `eusglue` slide). I read each slide's line, notes, ask, vignette, data card, tool,
compare and camera. I also read the field reference in `docs/deck-authoring-guide.md` (sections 5 to 8, 14 and rule list 9).

**Where the numbers come from.** Every number quoted for a slide is that slide's own state, built in node with
`tests/deck-states.js` (`deckStates`, the same states the tests use). That means the deck's own presets, params, days, ramps and
actions, in order, with no browser. Tokens such as `{hvpg}` were resolved from those states. A few sweeps (TIPS narrowing, stent
width) were run the same way, and they are labelled where I give them.

**What I checked against.** `guidelines/baveno-viii-2026.pdf` (cited as Baveno VIII x.y; its supplement tables S2 and S4 too) and
`guidelines/aasld-2024-portal-hypertension.pdf` (AASLD 2024). These are the only two files in the folder. Rule 26 of the
authoring guide asks for every claim to be checked against the guideline files, and for anything no file supports to be left
out. Section 6 below lists the claims that cite sources outside the folder.

**Tags.** **[Fix]** is an accuracy or consistency fix. **[Model]** means the engine shows something a clinician would question.
**[Feature]** means a slide could use a feature that already exists. **[Source]** is a citation problem.

---

## 1. Fix first

These are ranked by how likely a hepatologist in the room is to notice them. Each one is a deck-text or slide-field change unless
it is tagged [Model].

| # | Where | What is wrong | What the source says | Suggested fix |
|---|---|---|---|---|
| 1 | `prehepatic.js:72-76` (`path-pvtgrid`), same patient in `prehepatic.js:24` and `choose-treatment.js:60` (`a4`) | Factor V Leiden is called "a permanent, major risk factor", so the grid is lit at full-dose, long-term anticoagulation (`patient: { r: 'yes', c: 'maj' }`). | Baveno VIII Table S4 lists **isolated heterozygous** factor V G1691A (and factor II G20210A) as a permanent factor that is **not major**. Only homozygous or combined defects are major. The Fig. 5 cell for a permanent, not-major factor with a removed trigger is "lower-dose DOAC can be considered" (9.10). | Either say "homozygous factor V Leiden" in the vignette and line, which keeps the lesson, or set `c: 'min'` and rewrite the line for the lower-dose cell. `two-inflows.js:52` (JAK2 neoplasm, `c: 'maj'`) is correct as it is. |
| 2 | `ten-years.js:52-55` (`d90`, "Year 2: the stiffness rules in CSPH") | He has obesity and type 2 diabetes (`d0` vignette), yet the line says his stiffness of 25.5 kPa "meets the ≥25 kPa rule: CSPH is ruled in without a catheter". | Baveno VIII 1.16b limits the 25 kPa rule to viral, alcohol-related and **non-obese (BMI <30)** MASLD. In obese MASLD, ANTICIPATE-NASH ≥75% (1.16a) or a spleen stiffness >55 kPa (1.16c) decides. The slide's own notes say so, and the MASLD deck (`masld.js:47`) teaches exactly this. | Retitle the slide ("stiffness and platelets point to CSPH") and base the line on ANTICIPATE-NASH. Or drop "obesity" from the `d0` vignette so the rule applies. The model's spleen stiffness on this slide is 53.9 kPa, which is under 55, so it does not settle the question either. 25.5 kPa also sits close to its cut-off. |
| 3 | `ncph.js:53` (`path-psvdscope`), `ncph.js:61` (`psvd`), `ncph.js:71` (`path-psvdscore`) | The PSVD scope chart and the PSVD score are applied to "this patient", the schistosomiasis case from slide 1. The scope chart also comes before the slide that introduces PSVD. | Baveno VIII Table S2 lists schistosomiasis (with hepatosplenic disease) among the conditions that **exclude** PSVD. | Move `psvd` before the two path cards. Give `psvd` its own case card for a new PSVD patient (for example azathioprine for Crohn's disease, normal stiffness, no schistosomiasis). Say on the line that the patient has changed. The score itself adds up (3 + 2 = 5). |
| 4 | `variceal-bleed.js:58` (`oct` notes), `variceal-bleed.js:103` (`controlled` notes) | "Ceftriaxone ... for up to 7 days". | AASLD 2024 gives ceftriaxone 1 g/24 h for up to 5 days, or until discharge if that is sooner. Baveno VIII 5.10 says to individualise it, with a shorter course or none in Child–Pugh A. Neither file gives 7 days. | "for up to 5 days (AASLD 2024), shorter in Child–Pugh A (Baveno VIII 5.10)". |
| 5 | `variceal-bleed.js:140` (`rescue` notes), `variceal-bleed.js:160` (`summary` notes) | Rescue TIPS is called futile at "Child–Pugh 14 or more, or a MELD above 30 with a lactate above 12 mmol/L". | That is the Baveno VII wording, and the guide (6.4) says never to cite VII. Baveno VIII 5.37 says rescue TIPS should be considered **whatever the age, Child–Pugh or MELD**, case by case. `path2` on the same deck already cites 5.37 correctly, so the deck contradicts itself. | Replace both passages with the 5.37 wording. |
| 6 | `pregnancy.js:52-55` (`scope`), `pregnancy.js:60` (`propranolol`) | `scope` says the varix "now measures 5.3, with red wale marks" (the model's wall ratio is 0.76, so the red marks are drawn). The next slide starts propranolol and keeps banding for when propranolol cannot be taken. | AASLD 2024 (pregnancy section): NSBB or banding for medium or large varices, **with banding preferred when there are cherry-red spots or red wale signs**. | Band this varix (`action: { kind: 'band' }`), or keep propranolol and remove the red wale signs from the line. Two smaller points: the deck cites Baveno VIII 8.15 to 8.20, which are vascular liver disease statements, for a woman with autoimmune-hepatitis cirrhosis, so cite AASLD 2024 first. Add AASLD's weak note that carvedilol may cause less fetal growth restriction than propranolol. |
| 7 | `varices.js:46` (`burst` notes) | "a bleed carries a 6-week mortality of about 15 to 20%". | AASLD 2024: "6-week mortality still ranges from 10% to 15%". | "about 10 to 15% (AASLD 2024)". |
| 8 | `hvpg.js:45` (`hvpg` line) | "An HVPG ≥16 mmHg predicts higher mortality", stated generally. | In the folder, 16 mmHg appears only in Baveno VIII Table 3, for short-term mortality after non-hepatic abdominal surgery. | Name the setting ("before abdominal surgery, an HVPG ≥16 mmHg predicts higher short-term mortality"), per rule 26, or drop the sentence. |
| 9 | `shunts.js:77` (`check` line), `shunts.js:28` (check question) | "A bilirubin >3 mg/dL or MELD >18 sharply raises early mortality". | Neither file supports this for TIPS. AASLD's "bilirubin >3 mg/dL" is a caution for simvastatin, and Baveno VIII's "MELD >18" is about post-banding ulcer bleeding (5.47). Baveno VIII 5.33 says a raised bilirubin and the MELD are **not** absolute contraindications to a pre-emptive TIPS. The slide's notes are well cited (age <75, creatinine <3, no heart failure, 6.8, 6.9, 6.14 to 6.16). | Rest the line on what the notes cite. Drop the bilirubin and MELD figures, or cite the source they come from once it is in the folder. |
| 10 | `kidney.js:110` (`terli`) | The "HRS-AKI" state is the state left by the unreplaced 1.3 L bleed of `hold`: blood volume 4.48 L, cardiac output 3.82 L/min, heart rate 104. Terlipressin then raises the MAP in a hypovolaemic patient. The notes even say "the bleed has not been replaced". | HRS-AKI is not a bleed. A hepatologist will read this as terlipressin given for shock. | Replace the blood first (`action: { kind: 'infuse', fluid: 'prbc' }`, as `variceal-bleed.js` and `hyperdynamic.js` do), or start the HRS-AKI slides from the `carv` state, then add terlipressin and albumin. |
| 11 | cirr-decomp case cards (`sites.js:61`, `lobule.js:47`, `shunts.js:38`, `two-inflows.js:78`; also doppler `slow`, endoscopy `size`, hyperdynamic `full`) | The vignettes say "ascites despite spironolactone and furosemide", or ascites on diuretics, but the `cirr-decomp` preset settles at **1.0 L**. That is grade 1 ascites, seen only on imaging. Guide section 14: "if it shows no ascites, the case must not describe ascites". | Baveno VIII 3.3: the first decompensation is clinically evident ascites. Grade 1 ascites is not decompensation. | Reword these vignettes ("ascites controlled on spironolactone and furosemide"), or give `cirr-decomp` a grade 2 volume. Changing the preset touches many tests and handout figures, so rewording is the cheaper fix. `cause-treated.js:70` (`high`) already handles imaging-only fluid correctly and is a good model to copy. |
| 12 | `choose-treatment.js:40-41` (`a2`) | The case "needs a 6 L paracentesis every two weeks", but the slide starts from `cirr-decomp` at 1.0 L, so the belly and the fluid card show 1 L. | Same rule as #11. | Start the slide from the tense state the ascites and kidney decks build (`cirr-decomp`, diuretics off, 120 days, albumin 2.8 to 2.4: 5.1 L). |
| 13 | `varices.js:52` (`predesci`), `pregnancy.js:60` and `:69` (`propranolol`, `delivery`, key `varix`), `treatment.js:94` (`summary` varix column) | The varix tile shrinks the moment a beta-blocker starts: 3.8 to 2.1 mm on carvedilol, 5.3 to 3.2 mm on propranolol, and 7.2, 5.3, 4.4, 2.1 down the treatment table. To a room this reads as "beta-blockers make varices disappear". | The model's varix diameter follows the pressure at once. Real varices regress slowly, if at all. | Copy `next-bleed.js:69` (`nsbb`), which leaves the varix off and says why. Show the HVPG fall instead. The lasting fix is the [Model] item in section 4.1. |
| 14 | `ten-years.js:142` (`list`, tiles `liver`, `plt`) | At year 10, with further decompensation, the platelet tile reads **139k** (76k before the TIPS). The spleen shrank from 16.3 to 13.4 cm and the heart rate fell to 56 in the 60 days after the TIPS. | A TIPS lowers the spleen size and raises platelets only modestly. | Drop `plt` from this slide (use `shunt` or `ppg`). The [Model] item in section 4.3 covers the cause. |
| 15 | `where.js:99-102` (`summary`) | The notes say "The SAAG and protein columns add one more clue", but `cols` has no `saag` or `tp`. | | Add `'saag', 'tp'` (blank where there is no ascites), or drop the sentence. The case cards for a3, a4 and a6 quote SAAG and protein that match the model (1.5/4.1, 1.4/4.3, 1.4/4.3), so the columns would agree. |
| 16 | `rex.js:87` (`months`) | The title and line are about the spleen (12.3 cm) and the platelets (178k), but the tiles and the time graph show `pv` and `varix`. | | `tiles: ['spleen', 'plt']`, `key: ['plt']`, and the same keys in the flowtime `lines` if the tool takes them. |
| 17 | `stiffness.js:125` (`a4` ask) | "Why does 27 kPa rule CSPH in for case 2 ..." Case 2 reads 29.8 kPa on its slide. | | Use "≥25 kPa" or `{lsm@a2}`. |
| 18 | `shunts.js:105` (`wide`) | "At 12 mm the PPG is 10.0 ... each extra millimeter buys less." The 8 mm slide before it reads 10.1. Both states are taken the moment the stent opens, with the 6 L of ascites still in place, so the tiles show almost no gain for 4 mm. A node sweep at 180 days gives 9.1 mmHg at 8 mm and 6.5 at 12 mm. | | Give `tips` and `wide` the same settled `days` (for example 30), so the tiles show the trade-off the curve draws. |

### Smaller copy fixes

- `ten-years.js:171` (`summary`): "The pressure fell at each step", but the table's HVPG column reads 8.7, 10.0, 14.4, 15.1, 6.0,
  5.6. Say "each treatment lowered it for a while" (the `course` notes already put it that way).
- `ten-years.js:142` (`list` ask): "or once the MELD reaches 15" has no source in the folder. Baveno VIII 4.3 says to consider
  transplant in everyone with decompensated cirrhosis.
- `tips-doppler.js:116` (`relation`): "The PPG passes 12 mmHg at about a third narrowed". A node sweep of the same patient
  (180 days) gives 11.9 at 20%, 12.5 at 30% and 13.0 at 35% narrowed, so it crosses at about a quarter. The portal vein drops below
  30 cm/s at about 43%, which fits "about half".
- `doppler.js:104-105` (`a5`): the case says the TIPS went in "a year ago", but `days` is 180. Make one match the other.
- `recompensation.js:84` (`path-stopcarv`): the title says "Recompensated", but the slide before says he is only recompensating
  (60 days). Use "Recompensating, but CSPH has not resolved".
- `gastric-varices.js:106` (`splenectomy`): "the platelets ({plt}) rise" prints the value **before** treatment (87k) as if it had
  risen. Use "the platelets, {plt} now, rise".
- `gastric-varices.js:29` (`classes` notes) says twice that the scope stays in the esophagus. The "AASLD AASLD:" typo I noted on
  2bde649 is gone in 14bd769.
- `lobule.js:28` (`zones`) and `lobule.js:69` (`wedge`): each set of notes ends by repeating an earlier sentence.
- `choose-treatment.js:40` (`a2` ask): "rifaximin in selected patients" understates Baveno VIII 6.16, where rifaximin should be
  considered before every elective TIPS (strong).
- `choose-treatment.js:64` (`a4` notes): "the vein reopens in about half" has no source in the folder.
- `outflow.js:62` (`soswedge`): "an HVPG ≥10 mmHg strongly supports" SOS has no source in the folder. Cite it or soften it.

### Case cards whose numbers differ from the slide

Guide section 14 says a case must agree with the model on its slide. These platelet counts do not:

| Vignette | Says | Slide reads |
|---|---|---|
| `varices.js:22`, `ascites.js:41`, `recompensation.js:25`, `where.js:25`, `hvpg.js:19`, `prehepatic.js:96` | 88,000/µL | 90k (the `csph` preset) |
| `lobule.js:47`, `shunts.js:38`, `two-inflows.js:78` | 57,000/µL | 60k (`cirr-decomp`) |
| `circulation.js:51` | 98,000/µL | 90k |
| `pregnancy.js:25` | 84,000/µL | 87k |
| `where.js` a5 | 70,000/µL | 71k |

The 88,000 probably comes from the guide's own format example (`88,000/µL` in section 14, and "88 = 88,000/µL" in the units
table), copied as a value. Section 4.5 suggests a test that would catch these.

---

## 2. Themes across decks

**2.1 The decompensated patient.** `cirr-decomp` is the most used patient, and three things about it recur. It has 1.0 L of
ascites (grade 1, #11 above). It has large varices (7.2 mm) with no carvedilol, although Baveno VIII 4.4 gives carvedilol to
patients with ascites and varices; no vignette says why he is not on it (hyperdynamic `full`, two-inflows `cirr`, sites `sin`).
And its platelets are 60k against vignettes that say 57k. One sentence in each case card ("he could not tolerate a beta-blocker",
or "on carvedilol") would close the second point.

**2.2 The varix follows the pressure at once.** See #13. `next-bleed.js:69` is the pattern for the decks to copy now, and section
4.1 is the model fix.

**2.3 Hidden states a clinician would question.** These are not on a tile today, but they appear in tables, time graphs or the
belly when a slide is extended.
- The meal time-lapse (`circuit.js:14`, `MEAL`) runs 8 disease days. In the `both` slide (`circuit.js:70`) the varix grows from
  3.8 to 5.4 mm and 0.7 L of ascites appears from one meal. `lapse.clock: 'seconds'` (used in `doppler.js`) fits a meal.
- `pvt-acute` in a normal liver reads a cardiac output of 3.54 L/min and an HE index of 0.34 (two-inflows `clot`, doppler `a2`).
- `hyperdynamic.js:37` (`dilate`) time-lapses to a row titled "Decompensated" with 0.6 L of fluid. The same happens with
  `varices.js:28` (`lapse`), whose end state is the `burst` row titled "Decompensated" in the summary (`varices.js:92`). Rename the
  rows ("Large varices"), or use the `cirr-decomp` preset for the row.
- `hyperdynamic.js:84` (`over`) gives eight units for a 1 L loss. That is deliberately exaggerated, but the `hb` tile is not shown,
  so the room cannot see that the haemoglobin ends at 12.6. Show `hb` and `bv`.

**2.4 "Liver blood flow" against the "Sinusoidal flow" tile.** The `liver` tile is now named Sinusoidal flow, but lines still say
"liver blood flow" or "Liver flow" (`two-inflows.js:44`, `:62`, `:79`, `:86`; the `COLS` heading). Use one name throughout.

**2.5 The encephalopathy index saturates after any TIPS.** `he` reads 1.14 to 1.23 after every stent from 6 to 12 mm (shunt
fraction 89 to 96%). It already reads 1.03 before the TIPS in the `tips-doppler` patient. So the encephalopathy, ten-years and
shunts decks fall back on `liver` or `shunt` to teach stent width. See section 4.2.

**2.6 Guideline statements that are missing where they belong.**
- Baveno VIII 6.16 (rifaximin before an elective TIPS, strong) is missing on `ascites.js:162` (`tips`) and understated on
  `choose-treatment` `a2`.
- Baveno VIII 6.19 (terlipressin preferably as a continuous infusion, 2 to 3 mg/24 h, for HRS-AKI) is missing on
  `ascites.js:143` (`complications`) and `treatment.js:59` (`terli`). `kidney.js` has it.
- Baveno VIII 5.22 (lactulose in every acute variceal bleed, strong) is not mentioned anywhere in the Variceal bleed deck.
- Encephalopathy: Baveno VIII 6.12 is paraphrased without its number on `embolize`. LOLA (6.13) and 6.14 and 6.15 (review the
  history of overt encephalopathy; it is not an absolute contraindication) are absent.

---

## 3. Feature use

### 3.1 Features no deck uses yet, and where each would earn its place

| Feature | Best slots |
|---|---|
| `cite` (guide 6.4, opt-in) | Words slides whose notes start with "Source:" (every path card, `ten-years`, `masld`, `kidney`). Put the statement numbers on screen, not only in the notes. List each adopting slide in `tests/deck-adopted.js`. |
| `reveal: true` | `circulation.js` (the guide's own example sentence is a circulation line), `circuit.js:39` (`ohm`), `sites.js:26` (`overview`), and `hyperdynamic.js:59` (`forward`), whose line is a causal chain. |
| `cam: { on: [...] }` | `rex.js` uses hand-typed boxes (`SHUNTS_CAM = [580, 340, 1000, 700]`, `recess`, `bypass`). Use `cam: { on: ['REX', 'S_DSR', 'S_MC'] }`, which keeps framing them if the figure moves. The same goes for `varices.js:42` (`burst`, `[690, -10, 890, 170]`) and `variceal-bleed`'s box. |
| `lens: 'since'` | `ten-years.js:126` (`he`, since `tips`), `treatment.js:37` (`carv`, since `prop`), `cause-treated.js:42` (`year1`, since `before`), and `recompensation` `cure`. It colours what changed, which is the point of each of those slides. |
| `lapseGlow` | `circuit.js:54` (`meal`) and `doppler.js:42` (`meal`): glow the bowel while the meal lapse runs. |
| `tool: { kind: 'causes' }` (waterfall) | `circuit.js:95`/`:104` (what raises the PPG: scar, inflow, collaterals), `hyperdynamic.js:59` (`forward`, metric `pv`), and `where.js` cases a1 to a6 (metric `ppg`). |
| `visual: 'walls'` | `ascites.js:62` (`saag`), before `bc` (`:78`): the gut capillary wall holds protein back and the sinusoid lets it through, which is the SAAG and protein lesson. |
| `visual: 'scale'` | `stiffness.js:60` (`rules`, kPa bands with each case as a dot) or `hvpg.js:42` (`hvpg`, bands 5, 10, 12). |
| `focusRow` | Summary tables with one patient of note: `choose-treatment.js:90`, `where.js:99`, `ten-years.js:171` (the TIPS row). |
| `scopeTile` | `varices.js:35` (`eso`), `pregnancy.js:52` (`scope`, the red wale signs of #6), `ten-years.js:88` and `:95` (`bleed`, `bands`), `variceal-bleed.js:69` (`band`). |
| `action: { kind: 'valsalva' }` | `pregnancy.js:69` (`delivery`): push for 10 s with the trace, to show the portal and varix pressure rising during the second stage. That is the reason for an assisted second stage. |
| Preset `postprandial`; params `respDepth`, `contractility`, `systemicTone`, `customShunts` | `contractility` fits `sites.js:84` (`cardiac`) and the outflow deck's heart-failure slides. `respDepth` fits `outflow.js:91` (`pulse`). |

### 3.2 Features used once or twice that more decks should use

- **Camera beats** (only `varices.js`). `lobule.js:21` (`lobule`) is a walk: portal triad, then sinusoid, then central vein, as
  three beats. Others that fit: `rex.js:70` (`bypass`, along the graft), `hvpg.js:17` (`route`, neck to wedge), and
  `tips-doppler.js:44` (`jet`, along the stent from the portal end to the hepatic vein end).
- **`lapse.cam`** (only varices). Any time-lapse whose story moves, for example `kidney.js:67` (`tense`, from the belly to the
  kidneys) and `prehepatic` `cavernoma`.
- **Scope instrument** (only endoscopy). The scope already draws bands. Endoscopy itself has no banding slide: add one with
  `action: { kind: 'band' }` × 1 to 4, before or after `bridge`. It would also fit `next-bleed.js:54` (`bands`) and the
  pregnancy fix in #6.
- **Vitals tool** (hyperdynamic, kidney). `variceal-bleed.js:62` (`blood`) and `kidney.js:100` (`hold`) are both about the
  pulse and the pressure.
- **The `hvpg-ppg` plane** (`diag: WHVP = portal`). It is the natural chart for `masld.js:30` and `:39` (`under`, `still`): plot
  `masld-csph` against `cirr-comp` and `csph`, so the gap between the HVPG and the PPG is visible. The **`csph` plane** fits
  `masld.js:47` (`bmi`, gray zone, LSM 22.2) as it does `ten-years` `d0`.
- **Doppler on more vessels.** In each of these the line describes a flow that no Doppler card shows:
  - `shunts.js:45` (`srs`): `PV_TRUNK`, which reads −4.1 cm/s (hepatofugal). The line says flow may reverse.
  - `gastric-varices.js:81` (`svt`): the splenic vein at the clot (no flow).
  - `outflow.js:106` (`web`): `IVCS_RA` (the jet at the web, slow flow below it).
  - `rex.js:42` (`cavernoma`): a compare between the empty trunk and the cavernoma web (`C8`).
  - `where.js:78` (`ladders`): the notes say "Doppler of the portal vein tells them apart" (a2 against a5), but the deck has no
    Doppler. Add one slide.
  - `doppler.js:68` and `:77` (`a1`, `a2`): `mode: 'color'` (blue portal vein for hepatofugal flow, no colour fill for a clot).
    Colour mode is used only on `probe` and `hepatic`.
  - `prehepatic.js:24` (`clot`): `mode: 'color'`. Its ask is about the missing colour signal.
- **Path cards reused where the decision recurs.**
  - `choose-treatment.js:60` (`a4`): add the `pvtgrid` card with the corrected patient from #1.
  - `ten-years.js:142` (`list`): bring back the `ladder` card lit at further decompensation (`s: 3`), so the deck ends on the
    chart it opened with at `:44`.
  - After the reorder in #3, the two PSVD cards follow a real PSVD patient.
- **Compare buttons the notes already promise.**
  - `sites.js:89` (`cardiac`): the notes say "Tap Normal heart", but there is no such button. Add
    `compare: [{ label: 'Normal heart', preset: 'healthy' }, { label: 'Failing heart', own: true }]`. That is the guide's own
    example.
  - `prehepatic.js:103` (`gradients`): the notes say "Colored by pressure drop, a second large drop would appear". Add lens buttons
    (`compare.lens`: pressure, drop).
  - `ascites.js:101` (`lvp`): a tap with albumin against one without. The model has the circulatory dysfunction after a large tap
    without albumin (guide 8.3), so the MAP, heart rate and blood volume would show why albumin goes with it.
- **Tiles that carry the slide's point.**
  - Spleen stiffness: `stiffness.js:110`, `:119`, `:128` (`a3` 45.7, `a4` 55.9, `a5` 60.3; `a4` just over 55 rules CSPH in by
    1.16c, though only just). Also `masld.js:47` (53.5, which teaches that it does not settle the case) and
    `gastric-varices.js:81` (`svt`, the spleen is the story).
  - Portal vein velocity: `doppler.js:51` (`slow`, whose case question is "How fast will his portal vein run?" while the tile is
    `hvpg`), `prehepatic.js:103` (`gradients`, a 41 cm/s jet), `outflow.js:91` (`pulse`).
  - `asc` on `tips-doppler.js:80` (`narrow`, "fluid has returned": 0.9 L). `rpp` on `treatment.js:59` (`terli`).
- **Summary columns.**
  - `tips-doppler.js:124`: add `pvVel`. The main portal vein under 30 cm/s is one of the three signs the line names.
  - `lobule.js:89`: add `tp` (the notes teach ascites protein).
  - `shunts.js:130`: an `he` or `liver` column instead of the text note.
  - `kidney.js:135`: `hr`.
  - `where.js:99`: `saag`, `tp` (#15).
- **A relation chart for the kidney.** `kidney.js:67` (`tense`) says the abdomen's pressure rises "slowly at first and steeply
  once tense". A `curve` with `x: 'asc'` and `lines: ['rpp']` would draw that sentence.

### 3.3 Decks that already use their features well

`tips-doppler` (gates, compare at three points, aliasing with the baseline button, the narrowing curve), `ten-years` (ticks,
milestones, the course chart with treatment bands, the relation walk), `next-bleed` (hides the varix honestly, the `since`
trace), `stiffness` (plane, path cards, case pairs), `kidney` (criteria cards with live rows, its model limits named in
caveats) and `meso-rex` (origin lens, three-way shunt compare, adult-model caveat) are the models for the others.

---

## 4. Improvements to the features themselves

**4.1 [Model] A slow remodelling term for the varix.** Today `m.varix.d` tracks the transmural pressure at once, which is right for
a bleed or a meal and wrong for a drug. A first-order lag on the fall of the resting diameter (weeks), with the rise kept quick,
would let `predesci`, `propranolol`, `delivery` and the treatment table keep their varix tile. Until then, decks should hide the
tile as `next-bleed` does.

**4.2 [Model] An encephalopathy index that can tell stents apart.** Weight it by the portal blood that skips the liver and the
liver's own perfusion (both are in the fingerprint as `shunt` and `liver`), so that an 8, 10 and 12 mm stent read differently,
and so that it does not start above 1 before any TIPS. The stent-width lesson in shunts, encephalopathy (`narrow`) and ten-years
could then read the `he` tile directly.

**4.3 [Model] The state after a TIPS relaxes too far.** Sixty days after the stent in `ten-years` (`he`), the platelets go from 76k
to 139k, the spleen from 16.3 to 13.4 cm, the heart rate from 70 to 56, the cardiac output from 6.67 to 5.14 and the stiffness from
17.2 to 13.4. It is worth checking whether carvedilol, the stent and the spleen's settling are compounding. The rise of platelets
after a Meso-Rex bypass (`rex` `months`, 77k to 178k) is plausible. After anticoagulation in `prehepatic` (`pvt-anticoag`, 90k to
129k with varices gone in six months) the line already says the model is faster than patients.

**4.4 [Feature] Let the BRTO play take a target.** `procedure: 'brto'` closes only C5 (gastrorenal). The splenorenal shunt on
`encephalopathy.js:68` (`embolize`) is C6, so that closure cannot be played. This overlaps item P1 in `new-features-recs.md`
(plug a spontaneous shunt, Baveno VIII 6.12); build them as one.

**4.5 [Test] Case cards agree with their slide.** `tests/case-card.test.js` already loads every deck as presented. Extend it to read
the numbers a vignette quotes (platelets `N,000/µL`, stiffness `N kPa`, "no ascites", or a volume in litres) and compare them
with that slide's state: platelets within ±2k, stiffness within ±1 kPa, "no ascites" only when the volume is under about 0.3 L.
Every row of the case-card table in section 1 would have failed it. Section 14's own example could use a value no preset shows.

**4.6 [Feature] Meal lapses on a seconds clock.** Section 2.3: a meal should not advance the spleen, the varix or the ascites by
eight days. Either run `MEAL` on `lapse.clock: 'seconds'`, or have the meal ramp freeze the slow organs.

**4.7 [Feature] A curve against a reading for the kidney.** If `curve` can already take `x: 'asc'`, this is only deck work (3.2).
If not, allowing any fingerprint key on x with a time-driven sweep (days off diuretics) would also serve the ascites deck.

---

## 5. Deck by deck

Each entry lists what I checked, then what to change. "Numbers ok" means the line's tokens and the vignette agree with the slide
state, and the claim matches the guideline file.

### Foundation

**Circulation (`circulation.js`).** The numbers are consistent. Fix: `define` vignette platelets 98k against 90k (`:51`).
Features: `reveal` on the lines that build a sentence one vessel at a time; `cam: { on }` for the box slide.

**The circuit (`circuit.js`).** `tips` "the gradient halves" (17.4 to 9.2) is correct. Fix: the meal lapse grows the varix and
ascites (2.3, 4.6). Features: a compare of carvedilol against propranolol on `resist` (flow against resistance), a `whatIf` on the
stent width on `tips`, and the `causes` waterfall before the summary.

**Two inflows (`two-inflows.js`).** The JAK2 grid (`:52`) is correct. Fixes: `cirr` platelets 57k (`:78`); "liver blood flow"
wording (2.4); the acute clot's cardiac output of 3.54 (2.3). Features: good use of the origin lens and compare already.

**The hyperdynamic circulation (`hyperdynamic.js`).** Fixes: `dilate` and its "Decompensated" row (2.3); `full` large varices
without carvedilol (2.1); `over` shows no `hb` tile. Features: the `causes` waterfall on `forward` (metric `pv`), `ripple` on
`loss`, `reveal` on `forward`.

### Core

**Sites and causes (`sites.js`).** Fixes: `sin` vignette ascites and platelets (#11, table); `cardiac` promises a Normal heart
button (3.2); the pvt preset's varix is 4.9 mm, which is fragile against a "small" cut-off of 5. The guide's scales worked
example names Sites slides 5 and 4 to 9, but Sites has no `scales` now: re-add them on `presin`, `sin` and `postsin`, or update
the guide. Features: a caudate lobe pill on `post`, a hepatic vein Doppler (no flow) on `post`.

**HVPG (`hvpg.js`).** Fix: ≥16 mmHg (#8); vignette platelets 88k (`:19`). `presin` brings in the schistosomiasis patient with no
case card, and `eus` reloads the same patient later with one, so move the card to `presin` (`:50`). The Budd–Chiari state (`bc`)
carries a 10.8 mm varix and 7.3 L of ascites, which is fine but unseen. Features: `scale` on `hvpg`, `beats` on `route`.

**Stiffness, platelets and the first visit (`stiffness.js`).** This deck is strong, and its numbers check: spleen stiffness about
35 on `path` matches its notes. Fix: `a4` ask (#17). Features: spleen stiffness tiles on a3 to a5 (3.2), `scale` on `rules`.

**Doppler of the portal system (`doppler.js`).** Fixes: `a5` time (copy fixes), `slow` tile against its question (3.2); vignette
on `slow` is the cirr-decomp ascites (#11). Features: colour mode on a1 and a2. Cite Baveno VIII 9.2 (Doppler first-line for
PVT) where the notes cite EASL.

**Varices (`varices.js`).** Fixes: mortality (#7), `predesci` varix tile (#13), `lapse` and its "Decompensated" row (2.3),
`collat` platelets 88k. Features: it is the only deck with `beats` and `lapse.cam`; add `scopeTile` on `eso`.

**Endoscopy (`endoscopy.js`).** Clean and careful. Its case card is the cirr-decomp ascites on diuretics (#11). Feature: a banding
slide on the scope (3.2).

**Variceal bleed (`variceal-bleed.js`).** A rich deck with the two accuracy fixes #4 and #5. Gaps against Baveno VIII:
- 5.22 lactulose (strong)
- 5.30 CT or MRI in every acute bleed
- 5.14 stop the PPI once the bleed is shown to be variceal
- 5.9 watch the sodium on terlipressin
- 5.12 early oral nutrition
- 5.21 ICU care
- 5.27 iron

An ordered criteria card, "Before the scope" (`ordered: true`) on `oct` or `minutes`, would hold most of them: vasoactive drug,
ceftriaxone, transfuse to 7 g/dL, erythromycin, lactulose, and intubation for altered consciousness or ongoing haematemesis. The
`tips` ask leaves out the HVPG ≥20 criterion that its card has. Feature: vitals on `blood`.

**Preventing the next bleed (`next-bleed.js`).** Clean (HVPG −23% checks). Its `nsbb` slide is the pattern for #13.

**Ascites (`ascites.js`).** The SAAG ≥1.1 at 97%, albumin 6 to 8 g per litre removed above 5 L, the 100:40 diuretic ratio and the
refractory definition cite AASLD 2021, EASL and the International Ascites Club, none of which is in the folder (section 6). Gaps:
6.16 on `tips`, 6.19 on `complications`, 6.21 and 6.22 (secondary SBP prophylaxis, and stopping it on recompensation), 6.24
(PPIs in further decompensation). `start` platelets 88k. Features: `walls`, the albumin compare on `lvp`, live rows on the
`refractory` criteria card.

**Hepatic encephalopathy (`encephalopathy.js`).** The numbers are consistent: the `srs` case has no ascites or varices, matching
the model's 0.0 L and 2.1 mm. Fixes: cite 6.12 on `embolize`; add 6.13 to 6.15 (2.6). Model: the `he` index (4.2) and the BRTO
target (4.4).

**Gastric varices (`gastric-varices.js`).** The numbers match the vignettes (gastric varix 8.5 mm, 0.8 L, stiffness 5 on `svt`).
The new `eusglue` slide (14bd769) is well sourced (Baveno VIII 5.40). Fixes: `classes` duplicate sentence; `splenectomy` {plt}
wording. Features: a splenic vein Doppler and a spleen or SSM tile on `svt`.

**Pre-hepatic portal hypertension (`prehepatic.js`).** Fix #1 (factor V Leiden). The EASL 2025 recanalisation figures (about 4
in 10 without cirrhosis, 7 in 10 with it) are outside the folder (section 6). `pvt-anticoag` could add Baveno VIII 9.20 (consider
long-term anticoagulation whether or not the vein reopens). Features:
- colour Doppler on `clot`
- lens buttons on `gradients`
- a velocity tile for the 41 cm/s jet
- on `liver` (SSM 56), tie the reading to Baveno VIII 9.11 (an SSM under 40 spares the scope)
- the SMV extension (`thrombus` on `SMV_CONF`) to teach bowel ischaemia (9.14)

**Non-cirrhotic portal hypertension (`ncph.js`).** Fix #3 (PSVD on a schistosomiasis patient, and the order). Features: the `eus`
procedure (used in `hvpg`) on `wedge`. Gaps: TIPS for PSVD bleeding, and the six-monthly Doppler for PVT in PSVD.

**Treating the cause (`cause-treated.js`).** A careful deck, and the numbers check: the MASLD start is 15.1 kPa and 138k (vignette
15 kPa and 136k), and the fall to 10.2 is −32%, which matches 2.13. Minor: the alcohol patient's start state holds 0.29 L, under
a case that says "no ascites". That much fluid is clinically undetectable, so it is acceptable. Feature: `lens: 'since'` on
`year1`.

### Advanced

**Where is the resistance? (`where.js`).** Fix #15 (summary columns). Small platelet differences (88k against 90k, 70k against
71k). Feature: one Doppler slide to tell a2 from a5, as the notes promise.

**The lobule (`lobule.js`).** Fixes: duplicate sentences on `zones` and `wedge`; `cirr` vignette (#11, 57k). The `relation` notes
cite EASL 2025, but Baveno VIII Table 3 and the AASLD 2024 table cover the same point. Features: `beats` for the walk on `lobule`;
a `tp` column in the summary.

**Hepatic outflow (`outflow.js`).**
- `open` cites EASL 2025 for the stepwise treatment of Budd–Chiari syndrome. Baveno VIII 8.31 to 8.34 says the same. Add 8.32
  (long-term anticoagulation, including after transplant) and 8.29 (six-monthly imaging and AFP).
- `soswedge`'s ≥10 mmHg (copy fixes).
- Features: an `IVCS_RA` Doppler on `web`; mark kind `clot` on `bcs`; a velocity or pulsatility tile on `pulse`.

**Lowering portal pressure (`treatment.js`).** The numbers check: propranolol −12.7%, carvedilol −19.4%, and the TIPS halves the
liver's flow. Fixes: 6.19 and an `rpp` tile on `terli`; the summary varix column (#13). Feature: `lens: 'since'` on `carv`.

**Choose the treatment (`choose-treatment.js`).**
- Fix #12 (`a2` start state).
- The `a2` rifaximin wording, and "reopens in about half" on `a4` (copy fixes).
- `a4` and `a5` cite EASL 2025, but Baveno VIII 9.6, 9.8 and 9.10 with Fig. 5 (`a4`), and 8.31 to 8.34 (`a5`), cover the same
  points from the folder.
- Feature: the `pvtgrid` card on `a4` once #1 is fixed (heterozygous factor V Leiden plus the pill is lower-dose DOAC). Also
  `focusRow` on the summary.

**Recompensation (`recompensation.js`).** The numbers check: SSM 49, HVPG 11.2, 11.4 and 17.0. Fixes: the `path-stopcarv` title;
`csph` platelets 88k. Good use of ticks, milestones, the walk and three path cards.

**Shunts and TIPS (`shunts.js`).**
- Fixes: #9 (bilirubin and MELD), #18 (stent width); the `own` vignette (#11, 57k).
- The `srs` case is consistent (0.0 L, 2.1 mm), and the `reasons` state (6.0 L) matches its case.
- The `heart` slide's rise in cardiac output (7.27 to 8.96) and right atrial pressure (5.5 to 8.0) is shown well.
- Features: a portal vein Doppler on `srs`; an `he` column in the summary.

**Doppler of TIPS (`tips-doppler.js`).** The numbers check:
- before the TIPS, the portal vein runs at 12.5 cm/s (line <15)
- the stent takes the PPG from 18.6 to 10.7, and the portal vein to 33.7 cm/s (>30)
- the narrowed stent reads 17.0 mmHg and 23.4 cm/s, with 0.9 L of fluid back
- the NSBB remark on `relation` (not needed once the PPG is under 12) is supported by AASLD 2024

Fixes: "a third" against "a quarter" on `relation`. Features: `pvVel` in the summary, `asc` on `narrow`, beats along the stent on
`jet`. The Doppler `baseline` button is used here (`alias`), and nowhere else.

**One patient, ten years (`ten-years.js`).**
- Fixes: #2 (the 25 kPa rule in obese MASLD), #14 (platelets at year 10), and the summary line and the MELD 15 ask (copy fixes).
- The other numbers check: HVPG 8.7 at year 0, 12.9 at year 2 (+4.2), 10.0 on carvedilol (−22%); 1.4 L at year 6 and 0.7 L on
  diuretics; the varix 5.3, 3.0 after bands and 5.3 again; the TIPS PPG 7.6, with the liver's flow at 28%.
- The pre-emptive TIPS note on `bleed` (Child–Pugh B 8 with no active bleeding, so no pTIPS) matches 5.31. It could add that his
  HVPG is under 20.
- Features: the ladder bookend on `list`; `lens: 'since'` on `he`; `scopeTile` on `bleed` and `bands`.

**The kidney in cirrhosis (`kidney.js`).** Well sourced: 4.6, 4.7, 6.9, 6.18 to 6.20 and Table 3 each say what the slide says. Fix
#10 (terlipressin after an unreplaced bleed). AASLD 2024 links a low renal perfusion pressure on NSBBs to HRS-AKI, which `carv`
could cite. Features: vitals on `hold`, the relation chart for `tense`, `hr` in the summary.

**Children with a portal vein clot (`rex.js`).** Well sourced (1.24 to 1.27, 9.29 to 9.31, 9.34 to 9.36, 9.38), with the
adult-model caveat. The case's 77k matches the model. Fixes:
- #16 (`months` tiles).
- `flows` says the sinusoids get "123% of a healthy liver's flow". That is the model's splanchnic overshoot through the graft, and
  six months later it reads 100%. Say "more than before the operation".

Features: `cam: { on }` for the shunt frames; the cavernoma Doppler compare; beats along the graft.

**Pregnancy (`pregnancy.js`).** Fix #6 (banding for red wale signs, cite AASLD). Add Baveno VIII 8.19's platelets above 20 G/L for
vaginal delivery to the `delivery` card. Case platelets 84k against 87k. The varix tile on `propranolol` and `delivery` (#13).
Feature: Valsalva on `delivery` (3.1).

**Fatty liver and the portal pressure (`masld.js`).** Strong and well sourced (2.5, 1.14 to 1.16, 2.6 to 2.9, 2.13, 2.17 to 2.19,
2.1, 2.2, Table 3). The case numbers match: 82k; HVPG 10.9 with PPG 14.3 (the ask says 11 and 14); a stiffness of 14.8 with
platelets of 160k, which rules CSPH out (1.15); and a fall from 14.8 to 10.2 (−31%). Features: the `hvpg-ppg` plane on `under`;
the `csph` plane or an SSM tile on `bmi`.

---

## 6. The guideline folder

Rule 26 speaks of "the three guideline files", but `guidelines/` holds two, and so do the project's uploads. These claims cite
sources that are not in the folder, so they cannot be checked against it:

- **EASL 2025, vascular liver diseases:** `outflow` (`open`, `relation`), `lobule` (`relation`), `where`, `doppler`,
  `stiffness`, `treatment`, `choose-treatment` (`a4`, `a5`), `prehepatic` (recanalisation 4 in 10 and 7 in 10), and rule 26's own
  example.
- **AASLD 2021 ascites guidance, EASL decompensated cirrhosis, and the International Ascites Club:** the `ascites` deck (SAAG 97%,
  albumin 6 to 8 g/L, diuretic doses, refractory ascites).
- **Primary papers** in deck headers (Iranpour, McNaughton and Abu-Yousef, Feldstein, Mitchell, Darcy). These are fine as header
  provenance, since the slides say "neither Baveno VIII nor AASLD 2024 gives Doppler cut-offs".
- **Figures with no source at all:** the bilirubin >3 or MELD >18 for TIPS (#9), SOS "HVPG ≥10" (`outflow` `soswedge`),
  "reopens in about half" (`choose-treatment` `a4`), and "MELD 15" (`ten-years` `list`).
- **Baveno VII** wording: the futility criteria (#5).

Recommendation: add the EASL 2025 vascular liver disease guideline and the AASLD 2021 ascites guidance to `guidelines/`, with a line
each in `guidelines/README.md`. Where Baveno VIII says the same thing (Budd–Chiari 8.31 to 8.34, PVT 9.2, 9.6, 9.8, 9.10), cite
Baveno VIII instead.
