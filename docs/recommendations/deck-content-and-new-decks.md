# Deck content, card choices, new decks and new features

11 Nov 2026. Recommendations only: nothing here is built. Read at `a8484c2` (all 31 decks in `src/ui/decks/`,
the path cards in `src/ui/path-algos/`), checked against the two files in `guidelines/` (Baveno VIII 2026, AASLD 2024).

Pick by number. Items already built, or turned down in earlier reviews, are left out. Ideas from earlier reviews that
are still open are listed in one line at the end, not repeated.

How the check was done: every Baveno VIII statement number (264) was compared with the numbers the decks cite, and
each number quoted below was read in the PDF. Where a claim rests on my memory of a paper and not on a file in the
folder, it says "check the paper first".

---

## A. Guideline and literature fixes

### Claims the folder does not support (deck guide rule 26)

1. **next-bleed `nsbb`: "a fall of 20% or more, or to 12 mmHg or less, is a response".** Neither file gives 20%.
   Baveno VIII Table 3 gives a fall of at least 10%, or to 12 mmHg or less, and says it applies to primary prophylaxis;
   AASLD only names "10% to 20% changes in HVPG" as a research question. The slide cites "Baveno VIII 4.8, Table 3"
   for a number that is not there. Change the line, notes and ask to the Table 3 wording, or add the source paper to
   the folder and cite it.
2. **encephalopathy `grade` notes: polyethylene glycol "resolved episodes faster than lactulose in trials".** That is
   one trial (HELP), and it is not in the folder. Say "in one randomized trial" and add the source, or drop it.
3. **doppler `a1`: hepatofugal flow in "about 8% of patients".** No source in the folder. Add the paper or drop the number.
4. **cause-treated `alcohol` notes: baclofen and acamprosate safe, disulfiram and naltrexone avoided.** Neither file
   says this. Add a source (the AASLD alcohol guidance) or drop it.
5. **ascites `complications` notes: the HRS-AKI criteria with the two-day albumin challenge.** These are the ICA
   criteria, not in either file. Add the AASLD 2021 ascites guidance to `guidelines/` (asked for on 8 Nov, still missing)
   and cite it there.

### Baveno VIII statements no deck uses, and where each fits

6. **Acute bleed, "what not to give" (variceal-bleed `oct` card or a new card beside it).** 5.23 and 5.24 are cited;
   add 5.25 (no recombinant factor VIIa, no tranexamic acid), 5.26 (hold anticoagulation until the bleed is controlled,
   restart case by case) and 5.28 (no clips, over-the-scope clips or haemostatic powder as first line).
7. **Bleeding from the banding ulcer (next-bleed `bands` or `slough`).** The notes mention ulcers with no number.
   5.47: vasoactive drug, endoscopic haemostasis, stent or tamponade, rescue TIPS; higher risk with MELD over 18 or
   emergency banding. 5.48: not enough evidence for routine acid suppression after banding.
8. **Portal vein clot in cirrhosis when anticoagulation is not given or fails (prehepatic deck, one new slide).**
   9.22 (untreated clot: image again within 6 weeks, then every 3 months, anticoagulate if it grows), 9.26 (TIPS for a
   main-trunk clot that does not improve, with portal hypertension complications or on the transplant list), 9.27
   (TIPS first when anticoagulation is contraindicated), 9.28 (no routine anticoagulation after TIPS), 9.25 (no
   preferred DOAC), 5.45 (acute bleed with a clot: usual care; TIPS with recanalisation in selected patients).
9. **Recompensation: what does not count (recompensation deck, and ten-years after its TIPS slide).** 7.6 (ascites
   gone on diuretics is not recompensation; consider stopping diuretics after cure), 7.7 (the same for encephalopathy
   drugs), 7.8 (ascites cleared by TIPS alone is not recompensation), 7.10 to 7.12 (who recompensates: severity of
   portal hypertension, time to treating the cause, kind and number of events), 7.13 (hepatologist every 6 months),
   7.14 (liver cancer surveillance goes on). The deck teaches the 7.4 criteria correctly but not these traps, which are
   the common exam and clinic errors.
10. **Weight-loss surgery (masld deck, one slide).** 2.14 to 2.16: modest risk without CSPH, expert centre with CSPH,
    generally contraindicated once decompensated. The deck only has a phrase in cause-treated notes. Fits the
    flow-resistance plane with three patient dots.
11. **When not to trust the stiffness number (stiffness deck, one slide).** 1.4 (fasting; repeat an index reading of
    10 kPa or more, or back it with a second test), 1.10 (the most recent reading guides the decision), 2.3 (in alcohol,
    a change of 30% or more matters). The deck covers congestion and body size only.
12. **Treating porto-sinusoidal vascular disorder (ncph deck).** The patient arrives vomiting blood and the deck has no
    treatment slide; management is one sentence in the summary notes. 8.12 and 8.13 (already in the notes), then 8.46 to 8.53 (scope at diagnosis
    and every 2 years, cross-sectional imaging at diagnosis, Doppler every 6 months for clot when portal hypertension is
    present, transplant for refractory complications). The `psvd` slide also reuses the schistosomiasis
    preset; it deserves its own.
13. **Frailty, muscle and food (ten-years or ascites, one slide).** 4.16 to 4.18. No deck names them. Words-light slide
    on the abdomen window.

### Naming the trials

14. **Name the landmark trial on the slide that teaches it.** Today only a handful are named (PREDESCI, Kravetz,
    Zocco, a few Doppler papers); elsewhere it is "in a randomized trial". Put the trial name and year in the `cite`
    line, limited to trials that are in the two guidelines' reference lists so rule 26 still holds. Confirmed in the
    AASLD reference list: PREDESCI (Lancet 2019), early TIPS (García-Pagán, NEJM 2010; Lv 2019), restrictive
    transfusion (Villanueva, NEJM 2013), rifaximin before TIPS (Bureau 2021), covered TIPS for recurrent ascites
    (Bureau, Gastroenterology 2017). Slides: treatment `carv`, variceal-bleed `tips` and `blood`, encephalopathy
    TIPS slide, ascites `tips`.
15. **Headline numbers for those trials in notes.** From memory, so check each paper first: PREDESCI 16% against 27%
    decompensation or death; early TIPS one-year survival 86% against 61%; restrictive transfusion six-week survival
    95% against 91%; rifaximin before TIPS overt encephalopathy 34% against 53%; covered TIPS one-year transplant-free
    survival 93% against 52%. Only worth doing together with item 39 (a trial card) or as notes.

### Checked and correct (no change)

The recompensation card against 7.4; the acute-bleed card (5.5, 5.7, 5.20 to 5.22); carvedilol 6.25 mg then 12.5 mg;
"up to 60% rebleed in a year without prophylaxis"; spleen stiffness under 40 kPa sparing the scope (1.19, 8.47); TIPS
age 70 and over case by case (6.8); 5.31, 5.33, 5.35.

---

## B. Teaching card, instrument, readout, callout and zoom choices

Each is one slide unless it says otherwise.

16. **circulation: five slides in a row carry the pressure profile** (`series`, `ladder`, `lobule`, `wall`, `define`).
    Give `wall` (fenestrae) the fluid forces strip with a sinusoid pressure tile, and let `lobule` stand without an
    instrument so the dive is the picture.
17. **varices `collat`: the line names four collateral sites and marks none.** Add a mark on each, stepped as beats.
18. **varices `nograd` (heart failure, no gradient): no instrument.** Add the pressure profile and a Budd–Chiari
    compare button, since the ask contrasts the two.
19. **ascites `bc`: notes tell the reader to look at the hepatic vein Doppler and the slide shows none.** Add the
    Doppler on the right hepatic vein.
20. **ascites `tense`: "presses on the kidneys" with tiles for ascites and portal pressure.** Swap portal pressure for
    the kidney perfusion tile.
21. **ascites `tips`: the line says the price is encephalopathy and no tile shows it.** Add the encephalopathy tile.
22. **ascites `lvp`: the notes admit pulse and pressure barely move between the albumin buttons.** Either a larger tap
    in the case, or check the model's post-paracentesis response. Check the model first.
23. **cause-treated `high2`: the line says stiffness cannot tell alone, shown on the pressure profile.** Use the
    flow-resistance plane with its trail, as `year2` does.
24. **choose-treatment `a1`: a banding case framed on the liver.** Frame the varices.
25. **doppler `a3`: quotes portal velocity with no tile; `a5`: quotes the gradient and returning ascites with no
    tiles.** Add the tiles, and a callout on the caudate lobe on `a3`.
26. **hvpg `hvpg`: three ideas on one line** (reading CSPH, 16 or more before surgery, the under-read in MASLD). Keep
    the first; the other two go to notes or to the slides that already teach them. `heart`: the key names right atrial
    pressure and no tile shows it; add it.
27. **kidney: `norepi` and `staging` are words while the figure does nothing.** Fold `norepi` into `terli` as a compare
    button. `pressure`: add the abdomen window so the abdominal pressure in the equation is on screen.
28. **recompensation `cure`: a year-long lapse shown on the catheter tracing.** A time graph of HVPG and albumin fits a
    year; the tracing fits a minute.
29. **shunts `tips`: Doppler, calipers, spot, what-if, sites split and a mark on one slide.** Six call-out systems.
    Keep Doppler and what-if; move the split to the next slide.
30. **ten-years `he`: confusion taught on the pressure profile.** The first-pass lens with the flows card and the
    encephalopathy tile shows the cause (the lens was built after this deck). The same lens would serve shunts `srs`
    and `tips` and two-inflows `tips`.
31. **treatment: no slide on dose or on who responds.** `prop` and `carv` could carry a what-if on response strength
    (the engine has it: `nsbbGain`, used once). `terli` has no instrument; the profile or kidney tile fits.
32. **pregnancy `inflow` and outflow `constrict`: no instrument or a still one.** `inflow` takes the flows card;
    `constrict` could use the engine's breathing depth for the neck vein rise on inspiration in its vignette.

---

## C. New decks

33. **Carvedilol, from the first visit to the transplant list.** One drug followed through every stage: no benefit
    without CSPH; started at CSPH (3.15, PREDESCI); no scope needed while on it (3.18); kept with ascites and varices
    (4.4); held at systolic under 90, mean under 65 or HRS-AKI (4.6) and restarted (4.7); after a bleed (4.8); after
    TIPS; stopped after confirmed resolution of CSPH (7.18, 7.19). Uses what exists: response tile, kidney tile, the
    hold and stop path cards. About 10 slides. Best single new deck: it is the question trainees get wrong most.
34. **Albumin: when and how much.** After large-volume paracentesis, in spontaneous bacterial peritonitis, with
    terlipressin in HRS-AKI (6.18), long-term albumin (6.10, weak), and when not to. On the fluid window and forces
    strip. Doses for paracentesis and peritonitis need the AASLD 2021 ascites file (item 5).
35. **Budd–Chiari on its own.** Split from the 14-minute outflow deck: 8.22 to 8.37 (stepwise care, anticoagulation,
    hepatic vein stent, TIPS or DIPS, response judged on ascites, bilirubin, creatinine and INR, transplant for acute
    liver failure). The clot what-if and the stent already exist. Outflow keeps the heart and pericardium.
36. **What tips a compensated patient over.** Infection (3.10, 3.11), surgery (3.13, HVPG 16 or more), a second liver
    injury (3.7: alcohol hepatitis, viral flare, drug injury), dental care (3.12, 3.23, weak), and no long-term
    antibiotic after a first decompensation (4.12). Needs item 40 for the infection slides.
37. **A day in the portal vein.** A meal, straining, a litre of fluid, standing: what moves the pressure in hours, not
    years. Uses engine parts no deck touches (the meal preset, Valsalva, breathing depth). Guideline support is thin
    (fasting before HVPG and before stiffness), so most of it would need sources added first. Lowest priority here.
38. **The landmark trials, replayed.** Six trials, one slide pair each: the patient the trial enrolled, then the two
    arms run on the model with the trial's result beside it. Needs item 39.

---

## D. New features, and the decks that would use them

39. **Trial card.** An instrument card (so the teaching card keeps no graph): two arms, event rates, number enrolled,
    follow-up, source line. Text and bars drawn on the GPU like the tiles. A node test fails any trial not listed in a
    sources file. Used by: item 38, item 14's slides, deck 33.
40. **Infection lever in the engine.** Vasodilation the reflexes cannot fully hold, so mean pressure can cross 65 (the
    8 Nov review found systemic tone alone never gets there). Used by: deck 36, kidney `staging`, ascites
    `complications`, and the carvedilol hold slide in deck 33.
41. **Beta-blocker response control.** `nsbbGain` as a what-if (non-responder, usual, strong) with the systolic 90 and
    mean 65 hold line drawn on the vitals card. Used by: treatment `prop` and `carv`, next-bleed `nsbb`, deck 33.
42. **Hold-to-strain button.** A momentary slide button (hold to strain, release to recover) driving the engine's
    Valsalva. Used by: pregnancy delivery slide, deck 37, varices wall-tension slide.
43. **Stiffness reliability readout.** Spread of the ten readings (IQR over median) on the FibroScan card, and a
    compare for fed against fasted and congested against not. Check first whether the model's stiffness rises with a
    meal. Used by: item 11, masld, outflow.
44. **Sources folder.** Add EASL 2025 vascular liver disease and AASLD 2021 ascites (both asked for 8 Nov), and one
    trials list file that items 14, 15 and 39 cite. Unblocks items 5, 34 and 35.

---

## My order

First, the fixes that are wrong or unsupported today: 1 to 5. Then the gaps with the most teaching value for the
least work: 9, 6, 8, 12. Then the card choices that are one-line changes: 19, 20, 21, 24, 25, 30. New deck: 33.
New feature: 41 (small, and 33 uses it), then 39.

## Still open from earlier reviews (not repeated above)

Contrast lens, HVPG technique modes, narrow or close the TIPS, splenic vein stent and embolization plays, portal vein
recanalization (now backed by 9.12 to 9.15), Measuring HVPG well, After the transplant, Read the X-ray, Ultrasound tab,
case runner, slide composer (mocks waiting), platelets pool, statement chip, gastric scope view, tumour, pleural space,
side-by-side, and the decks on liver cancer (now backed by 1.20 to 1.23, 4.14, 4.15, 5.46), bleeding that is not a
varix (5.42 to 5.44) and reading the tests.
