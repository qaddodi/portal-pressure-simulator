# Slide deck review, October 2026

This review covers all 27 presenter decks. Each deck was checked against four things:

- current guidelines and trials, with Baveno VIII (J Hepatol 2026) as the main reference;
- the house rules in `docs/deck-authoring-guide.md` and the wording rules in `docs/ai-humanizer.md`;
- what the engine and presenter can actually do, used and unused;
- how well each deck teaches.

It ends with ranked ideas for new decks and formats. Three of the new decks are built and ready to try.

Nothing here has been pushed to the app. The owner's dev makes every app change. This folder holds only documents, a patch and deck files.

## What is in this folder

| File | What it holds |
|---|---|
| `DECK_REVIEW.md` (this file) | The summary: what to fix first, the Baveno VIII sweep, engine and code changes, new decks, decisions and checks for the owner |
| [`deck-review/FINDINGS_BY_DECK.md`](deck-review/FINDINGS_BY_DECK.md) | Every finding, deck by deck: the current text, the problem, the proposed change and its source (282 entries) |
| [`deck-review/IDEAS_RANKED.md`](deck-review/IDEAS_RANKED.md) | The 15 ranked ideas with full slide outlines, the rejected ideas, the curriculum map and cross-deck changes |
| [`deck-review/AUTHORING_GUIDE_DRIFT.md`](deck-review/AUTHORING_GUIDE_DRIFT.md) | Where the authoring guide no longer matches the code, and what the unused features could teach |
| [`deck-review/LITERATURE.md`](deck-review/LITERATURE.md) | The two literature digests: 84 statements with sources, confidence and US against European practice |
| [`deck-review/prototype-decks/`](deck-review/prototype-decks/README.md) | Three new decks as files and as a patch, with test results, the app changes they need and a source checklist |

## Read this first

- **Which code:** the decks were reviewed on the integration branch `claude/settings-topbar-icon-flvft1` at `1af29676`, and line numbers refer to that commit. Since then the dev has reworded the beta-blocker deck (`c4e7bd6b`). All seven beta-blocker findings still match its new text. No other deck file has changed.
- **How findings were checked:** seven review groups read the decks and re-ran every slide's patient in the engine headlessly. A second agent then checked each finding: 232 were confirmed, 38 left uncertain and 8 refuted (the refuted ones are dropped). A render check then put 14 of the uncertain items on screen at phone (390x844 at 3x) and desktop sizes, and some on iPad.
- **Limits:**
  - The guideline PDFs could not be opened from the sandbox, so Baveno VIII wording comes from journal-page extracts, press releases and commentaries (see [Claims to check](#10-claims-to-check-against-the-sources)).
  - The sandbox renders at 1 to 3 frames a second. Screenshots show states, not smoothness, so every "it eases" in this review still needs a look on real devices.

## 1. Fix first: what learners see wrong today

These are errors on screen or in the printed handout, in rough order of harm. Each fix is a few lines.

| # | Deck / slide | What a learner sees | Fix | Checked |
|---|---|---|---|---|
| 1 | `stiffness/meal` | The FibroScan starts at 24 to 26 kPa (the previous slide's CSPH patient), then drops to 14.8 kPa under "After a meal": the opposite of the lesson. A lapse slide with a preset but no `params` plays from the previous slide's patient (`presenter.js:1818`, `worker-core.js:344`). | `stiffness.js:55`: add `params: { splanchnicTone: 1 }`. Then it rises from 12.5 to 14.8 kPa. | Rendered on phone and desktop, with the fix. No other lapse slide has this bug. |
| 2 | `hvpg/grades` (ask), `endoscopy/tension` (line) | "At what HVPG can varices bleed? 12 mmHg or more." and "Bleeding needs an HVPG of about 12 mmHg or more." Both teach 12 as a cut-off, which the slide's own notes and the guide (section 8.6) say it is not. | Word it as a rising risk: "Bleeding becomes much more likely once the HVPG reaches about 12 mmHg, though varices can bleed below it." | Confirmed |
| 3 | `one-year/carv`, `treatment/prop`, `treatment/carv`, `ncph/nsbb` | The varix tile halves (5.0 to 2.5 mm, large to small) the moment carvedilol starts, and stiffness falls with it. In the model, varix size follows the gradient with no lag (`engine.js:775`). | Show `map` and `hr`, or `tool: { kind: 'wall' }`, instead of the varix and stiffness tiles. | Confirmed |
| 4 | `two-inflows/switch` | The line says "the hepatic artery and sinusoids thin", but the artery is hidden on the figure. The liver-flow tile also stops updating 7 s after "Buffer off", frozen at 31 to 39%. | Reword the line, and make "Buffer off" a patient button: `{ label: 'Buffer off', preset: 'pvt-acute', params: { habrStrength: 0 } }`. | Rendered: the tile froze, though not at the 55 to 60% first claimed |
| 5 | `lobule/sos` | The HVPG tile reads 8.9 mmHg ("Mild") under a line that says above 10 supports the diagnosis. | Use the `outflow` SOS params (`fibrosis post 32`, HVPG 11.3 mmHg) and "10 mmHg or more" (EBMT 2023). | Confirmed |
| 6 | `stiffness/year` | A slide about yearly FibroScans in compensated cirrhosis ends with 4.7 L of ascites, albumin 2.8 g/dL and an HVPG of 17.8 mmHg. | `params: { cirrhosis: 0.4 }`, `ramp: { cirrhosis: [0.4, 0.65] }`, no albumin ramp, `lapse: { seconds: 8 }`. | Confirmed |
| 7 | `stiffness/rule` | The line calls `{lsm@spleen}` "the last case", but it is the third row; the last row is already ruled in at 28.6 kPa. It also gives "25 kPa or more means CSPH" without Baveno VIII's limits. | See the Baveno VIII table below. | Confirmed |
| 8 | `spleen/normal` → `grown` | A woman with MASLD and a normal liver reaches CSPH in a lapse labeled "730 days". | Lapse words `from: 'MASLD', to: 'Cirrhosis'`, or drop the case from the healthy slide (guide section 14). | Confirmed |
| 9 | `endoscopy/tension` (wall card) | "158% Past tear" with a full red bar on a varix that does not bleed. | Source text in `instruments.js:223` and `:294`: "Rupture risk" and "above the tear point: it can rupture at any time". | Rendered |
| 10 | `pvt-cirrhosis/base` | Titled "Slow flow toward a stiff liver" while the Doppler reads 24 cm/s, normal by the card's own range. The causes list includes "A high INR does not protect", which is not a risk factor. | Retitle "Cirrhosis sets the stage for a portal vein clot", or add a "Decompensated" patient button (13 to 14 cm/s). Replace the INR item with "Recent abdominal surgery, splenectomy above all". | Rendered |
| 11 | `variceal-bleed/summary` | A column headed with the raw key "hb". | Add `hb` (and `gv`) to COLS and CUT in `table-marks.js:102-104`. | Confirmed |
| 12 | `pvt-cirrhosis/scope`, `band` | A CSPH patient gets four banding sessions before anticoagulation. Under Baveno VIII the CSPH itself calls for carvedilol, a patient on it needs no screening scope, and anticoagulation is not delayed for banding. | Replace with a carvedilol compare slide; outline in FINDINGS_BY_DECK. | Uncertain: depends on the Baveno VIII wording |

## 2. Baveno VIII currency sweep (one commit)

Baveno VIII is published: Baveno VIII Faculty, J Hepatol 2026, doi [10.1016/j.jhep.2026.07.030](https://doi.org/10.1016/j.jhep.2026.07.030). It has 272 statements from a March 2026 meeting, and EASL announced it on 25 August 2026. Several decks still say what Baveno VII said. Make the changes below in one commit, so the app is consistent on one date.

| Baveno VIII says | Decks that still differ | Change |
|---|---|---|
| **New:** with ascites and varices, carvedilol or a conventional beta-blocker, carvedilol preferred, to prevent a first bleed and ascites complications (LoE 3, strong, 81%). Reduce or stop if the systolic pressure is under 90 mmHg, the MAP under 65 mmHg, or HRS-AKI develops. | `endoscopy/large` (`endoscopy.js:47`) and `recompensation/carv` (`recompensation.js:49`) still call the benefit an open question. `treatment/carv` quotes the compensated-CSPH statement for a patient with ascites. `circuit/drugs` reads as a reason to avoid carvedilol with ascites. | State the new recommendation and the stop rules. `beta-blockers.js:81` already does. |
| A beta-blocker, carvedilol preferred, for CSPH itself, not only for varices; no screening endoscopy while on one | `endoscopy/summary` ("Varix size and bleeding decide treatment"), `varices/burst`, `pvt-cirrhosis` CSPH case, `pregnancy/before` notes, `hvpg/route` (the case gives no reason for a catheter) | "CSPH decides the beta-blocker, and the scope decides banding and treats a bleed." Per-slide text in FINDINGS_BY_DECK. |
| HVPG of about 12 mmHg is a rising risk of bleeding, not a threshold | `hvpg/grades` ask and objectives, `endoscopy/tension` | See item 2 above |
| CSPH rule-in by stiffness of 25 kPa or more only in viral, alcohol-related or non-obese MASLD; otherwise ANTICIPATE, ANTICIPATE-NASH or NICER at 75% or more; gray-zone results reassessed at 12 months | `stiffness/rule` line and notes; `one-year/d90`, where an obese MASLD patient is called "likely CSPH" | Name the limits. In `one-year`, rate stiffness with words that fit obese MASLD. |
| Spleen stiffness above 55 kPa rules CSPH in, **on the 100 Hz probe** | `stiffness.js:51`, `one-year.js:39`, the reference text at `main.js:1857` | Add "on the 100 Hz probe" |
| Spleen stiffness under 40 kPa spares the screening endoscopy (strong) | Missing everywhere; it belongs in `spleen/screen`, with a mention in `endoscopy/screen` | Add it, with the sign (under 40, or 40 or less) checked against the PDF |
| Pre-emptive TIPS: Child–Pugh C 10 to 13, or B over 7 with active bleeding, **or an HVPG of 20 mmHg or more**; within 72 hours, **ideally within 24** | `endoscopy/band` (`endoscopy.js:88`) lacks the HVPG criterion and the 24-hour aim. `variceal-bleed/tips` already has both. | Copy the `variceal-bleed/tips` wording |
| Endoscopy within 12 hours, sooner if unstable | `variceal-bleed/band`, `endoscopy.js:64` and `:71` | Use the same words in all three |
| Statins downgraded: not enough evidence to recommend them | `lobule/cirr` names statins beside carvedilol as drugs that lower resistance | "…which is why carvedilol can lower it." |
| cACLD is the preferred term when the diagnosis rests on non-invasive tests | Not defined anywhere | Define it once in `stiffness/fibrosis`; use it in stiffness lines |
| House rule 13: name Baveno VIII, never Baveno VII | `docs/DESIGN_BLUEPRINT.md:1143` still names Baveno VII. A proposed `pvt-cirrhosis` attribution, "Baveno VII and EASL 2025", would break the rule. | Fix the blueprint. Attribute the anticoagulation criteria to "EASL 2025", or to no source. |

Recompensation already matches Baveno VIII: `recompensation.js:62-64` uses more than 6 months. Keep it.

## 3. Other clinical updates

These come from AASLD 2024, the EASL 2025 TIPS and vascular guidelines, EBMT 2023, ICA-ADQI 2024 and recent trials. Wording for every slide is in FINDINGS_BY_DECK. Use the same words in every deck.

**Bleeding**
- **Octreotide:** "50 µg bolus, then 25 to 50 µg an hour" (AASLD 2024; confirm the table) in `variceal-bleed`, `treatment/oct` and `endoscopy/oct`.
- **Ceftriaxone:** "up to 7 days" in `variceal-bleed/oct`, not 5.
- **Bridge:** "a balloon tube, or a covered esophageal stent where available" in `variceal-bleed/band`, which now calls the stent preferred.

**Drugs**
- **Carvedilol against propranolol:** about 1 to 2 mmHg more HVPG fall than propranolol, the same in `beta-blockers/carv-sin`, `treatment/vs`, `one-year/carv` and `circuit/drugs`.
- **Carvedilol's mechanism:** its stellate-cell effect is stated as fact in `circuit/drugs` and `treatment/carv`; hedge it as `beta-blockers` does.
- **Doses:** `beta-blockers/choose` gives no dose for either drug and does not mention that propranolol is titrated to a heart rate and carvedilol is not.

**TIPS**
- **Target and width:** EASL 2025 asks for the smallest stent width that brings the PPG under 12 mmHg (`circuit/tips`, `tips-doppler/stent`). `tap.js:70` correctly says no target is agreed for ascites.
- **Encephalopathy after TIPS:** "about a third" in `treatment.js:78-79` and `tap.js:69`, "a third to a half in the first year" in the digests. Pick one figure after checking, and use it everywhere.
- **Dysfunction:** suspect it clinically (bleeding or ascites returns, or ascites is slow to clear), then work up with Doppler, angiography and a pressure measurement (`tips-doppler/fix`). The baseline Doppler is "in the first weeks" (`doppler/tips`).

**Vascular**
- **SOS cut-off:** "10 mmHg or more", using the `{>=10 mmHg}` pill, in `outflow.js:69-70`, `lobule/sos`, `sites.js:66` and the `hvpg` summary notes. `endoscopy.js:38` has the same "above 10" slip for CSPH.
- **SOS prevention and treatment:** ursodeoxycholic acid for every stem-cell transplant; no defibrotide prophylaxis after HARMONY; defibrotide treats severe disease (`outflow/recover`, `lobule/sos`). Add inotuzumab and gemtuzumab ozogamicin to the `outflow/sos` causes.
- **`pvt-cirrhosis`:**
  - anticoagulate a clot of 50% or more, a recent or symptomatic clot, or any transplant candidate;
  - partial clots often stay stable;
  - attribute to EASL 2025.
- **PSVD:** `ncph/nsbb` says "EASL 2025 and Baveno VIII see no proven advantage for carvedilol" in presinusoidal disease. Neither digest found such a statement. Drop the names, or show it live with a three-button compare (no beta-blocker, propranolol, carvedilol).

**Ascites and kidneys**
- **Long-term albumin:** `tap/summary` says it is "used in some centers". ATTIRE was negative and PRECIOSA missed its primary endpoint; neither AASLD nor EASL recommends it routinely. The summary's "With albumin" row also repeats the "Paracentesis" row exactly.
- **Kidney injury:** ICA-ADQI 2024 shortened the volume challenge to 24 hours and dropped the fixed 48-hour albumin dose (`tap/lvp` is silent on it).
- **Terlipressin:** in the US it is approved for HRS only. `treatment/terli` claims a rise in kidney perfusion the model cannot show.

**Pregnancy and follow-up**
- **`pregnancy`:**
  - CSPH alone calls for a beta-blocker;
  - mycophenolate stops before conception;
  - autoimmune hepatitis often flares after delivery (about 30% in a Swedish series), the likeliest postpartum event for this patient.
- **`one-year`:** never mentions six-monthly ultrasound for liver cancer, or that collaterals on imaging diagnose CSPH.

## 4. House rules and the humanizer

**Counts on the current decks** (checked by script on the integration head):

| Rule | Broken by |
|---|---|
| One sentence per `line` (guide rule 1) | 200 of 249 lines |
| Notes of 2 to 4 sentences (rule 11) | 59 notes run longer |
| 6 to 12 slides (rule 12) | `where-resistance` (14) and `tips-doppler` (13) |
| A closing summary table (rule 11) | `varices` has none; `one-year` ends on a trace; `ascites` ends on its quadrant (the owner's call) |

A rule broken this often needs a test, not a reminder. Add `tests/deck-line-sentences.test.js` with a KNOWN list of today's offenders, as `deck-thresholds` does, and empty the list deck by deck. The usual fix is to fold the "Colored by X" sentence into the line after a semicolon, and move trial numbers and doses to the notes. The three new decks already pass.

**Patterns the humanizer forbids, found across decks:**
- three short sentences in the same rhythm for one idea (`circulation/series`, `lobule/schisto`);
- fragments without a verb (`circulation/ladder`, `treatment/terli`);
- lines opening on "it" (`endoscopy/oct`);
- colon-then-reveal titles;
- metaphor titles ("starves the liver");
- double negatives (`endoscopy/screen`);
- titles with no actor ("Hepatic outflow meets resistance").

**Notes that speak to the room.** Thirteen notes give instructions to the presenter ("Give the room a minute", "Tap Pressure drop"), but the handout prints notes for learners. Rewrite them as content.

**Typed numbers drift from the model.** For example, `hvpg/heart` asks about "21, 20, 19 mmHg" while the ladder shows 20, 19 and 19. Either word asks and checks without model numbers, or add a test that checks typed numbers against the deck states that `tests/deck-states.js` already computes. Do this before any study mode shows asks on screen.

**The same person appears in several decks** (guide section 14):
- `where-resistance` q1 is the `hvpg` route case;
- q3 nearly copies `right-heart/constrict`;
- q6 is `right-heart/web`;
- q5 and `ncph/patient` both come from Lake Victoria;
- "RUQ pain for 2 months and now tense ascites" appears in four decks;
- the woman with MASH and recurrent encephalopathy appears in three;
- the cirr-decomp case "despite spironolactone and furosemide, platelets 57,000/µL" appears in four.

At least 10 cases are women with MASH, and at least 8 open on an older adult with severe tricuspid regurgitation.

Two slides break section 14 directly:
- `tap/tense`: a first slide with a ramp and a case, so the Outline loses the patient;
- `spleen/normal`: a case on a healthy slide.

## 5. The engine: misleading behavior, live controls, unused features

### 5.1 Model behavior a learner can read as fact

| Behavior | Where in the engine | Rule for decks |
|---|---|---|
| Varix size and liver stiffness follow the gradient at once on drugs | `engine.js:775` | No varix or stiffness tiles on drug slides (item 3 above) |
| Closing a shunt fills the esophageal varices at once | `engine.js:1037-1042` | Every BRTO or embolization slide carries the "over weeks to months in patients" caveat |
| Anticoagulation clears every clot, cavernomas and hepatic veins included | `engine.js:810-815` | Never show it for chronic Budd–Chiari or a cavernoma; elsewhere add the reopening caveat |
| Infused volume never leaves (no kidneys) | `engine.js:911-921` | Never follow an infusion with days or params without rechecking. Albumin infusion on `tap/albumin` makes ascites return faster (6.0 against 3.7 L), so keep the `albumin` param there. |
| The off-screen chain never clots an open bleed | `engine.js:570` | Balloon and rescue slides need an explicit `stopBleed` |
| A lapse slide with a preset but no `params` plays from the previous slide's patient | `presenter.js:1818`, `worker-core.js:344` | Every lapse with its own patient carries `params`, with ramp start values that match (item 1) |
| A lapse line's `{tokens}` show the end values from the first frame, while tiles count up | `presenter.js:1866` | Word lapse lines as the end point ("Three months on, …") |
| `circuit/both`: the 8 disease days of the meal grow ascites from 3 to 844 mL | chain `days` | Hidden on screen today; matters only if a later tile or the handout shows it |
| The wall card's tear point is a constant, so any large varix reads "past tear" | `instruments.js:223` | Reword the card (item 9); no wall-tension tile |
| The encephalopathy index is the shunted share times a constant | `metrics.js:69` | No `he` tile; show shunted share and liver flow, with a caveat |

### 5.2 Live controls: what works today

Thirteen decks have no live control at all. These were rendered:

- **Patient buttons work.** `{ label, preset }` buttons land on computed states and ease both ways. This was checked on `stiffness/schisto` (FibroScan 6.6 against 24.1 kPa) and `ascites/bc` (right atrium 3.3 against 19.0 mmHg). Prefer them.
- **Param buttons can freeze.** Param buttons and sliders (`liveSet`) stop updating the tiles 7 s after the press, and can freeze mid-ease on slow variables (`presenter.js:1529`).
- **Marks stay when the patient changes.** Slide marks and glows stay on screen when a patient button swaps the patient, so `ascites/bc` showed "Clot in hepatic veins" on a heart-failure patient. Put contrast buttons on unmarked slides (`ascites/hf`), or let compare options carry their own mark.
- **Phones hide the tiles on tool slides.** On a phone, a slide with a tool shows only the instrument. A lesson that lives in a tile change is invisible on the iPhone unless the slide drops its tool.
- **Threshold words flicker at their cut-offs:**
  - the Doppler's Phasic/Monophasic word in cirrhosis;
  - the scope's None/F1 grade during a lapse, once showing "F2 Large, red wale".
- **Splenectomy and embolization buttons are not ready.** Platelets jump from 96 to 380 in one step and the spleen tile reads "0.0 cm". The spleen does not fade on the figure, and a red cross is drawn over a whole spleen.

Ready to add with fields only:
- `stiffness/schisto`: a cirrhosis/schistosomiasis compare;
- `ascites/hf`: a heart failure/Budd–Chiari compare;
- `pvt-cirrhosis/base`: a "Decompensated" button;
- `one-year/d90`: a lapse;
- `pregnancy/after`: a lapse without `params`;
- sliders on `right-heart/constrict` (pericardial), `outflow/soswedge` and `sites/postsin` (central-vein resistance), `hvpg/presin` (periportal fibrosis), `circuit/where` (splanchnic tone) and `doppler/rhf` (tricuspid regurgitation).

Wait for the code fixes below:
- `one-year/d180` (scope flicker);
- `spleen/pse` buttons;
- `doppler/rhf` compare, until the owner has watched the handover on an iPad.

### 5.3 Built into the engine, used by no deck

From the code audit (full list in AUTHORING_GUIDE_DRIFT.md, section 5):

| Feature | What it could teach | Where |
|---|---|---|
| `balloonEso`, `balloonGas`, rupture at `'GV'`, `stopBleed` | Tamponade as a bridge; a fundal varix bleed | Used by the new `refractory-bleed` deck |
| `portocaval`, `mesocaval`, `customShunts` | Total against selective decompression | `shunts/dsrs` compare |
| `pericardial`, `contractility` | Constriction against a failing heart | `right-heart/constrict` |
| Lens `delta` (change from healthy) | Left-sided portal hypertension in one picture | `prehepatic/svt` |
| Lens `oxygen` (used, but undocumented) | Zone 3 hypoxia in congestion | `right-heart`, `outflow` |
| Doppler on `C3`, `DIPS`, `C1b`, `V_SPL`, `MHV_IVC`, `LHV_IVC` | Recanalized paraumbilical vein; DIPS patency; single-vein Budd–Chiari | `doppler`, `varices/umbilical` (use lens `flow`), `outflow` |
| Tiles `co`, `bv`; tokens `{pvVel}`, `{gv}`, `{hb}` | The hyperdynamic circulation; live values instead of typed ones | `variceal-bleed`, `one-year/doppler`, a new hyperdynamic deck |
| `monitor: 'result'` | The wedged and free tracing behind an HVPG | `one-year/cath` and `d365`, `prehepatic/cath`, `ncph/wedge`, `outflow/soswedge` |
| Ladder brackets, `rail: true`, `glowSeq` | Which gradient reads the resistance and which misses it | `sites` level slides, `beta-blockers/schisto`, `hvpg`, `lobule` |
| Dye injection (`stage.injectDye`) | Where portal blood goes: a reversed coronary vein, arterial blood leaving through a TIPS | A dye button on five slides (rank 14) |

### 5.4 Code changes, by priority

Each is a few lines. The dev decides.

| Priority | Change | Where | Why |
|---|---|---|---|
| Before any balloon slide | Fade balloons in and out (about 450 ms), as clamps do | `stage.js:5618-5620` | The balloon pops in. It also breaks the easing rule on existing slides. |
| Before any balloon slide | Ease bleeding jets and the stomach pool out (and in on a rupture) | `stage.js:7432-7437` | They vanish in one frame, on `variceal-bleed/tear` and `band` too |
| Before any balloon slide | Switch the bleed state at the same point of the morph as the params | `worker-core.js:47-61` | The bleeding stops 1.4 to 3.8 s before the balloon appears |
| Before any balloon slide | The scope reads `store.get().params` | `instruments.js:173` | The scope never shows the balloon |
| High | Keep `liveSet` running until the model settles, about 3 × 10 s | `presenter.js:1529` | Param buttons freeze mid-ease |
| High | Let compare options carry their own mark, or none | `presenter.js:1485-1503` | Wrong mark on a swapped patient |
| High | Hysteresis on the Doppler pattern word and the scope grade | `doppler.js:297`; `instruments.js:35-61` | Words flicker; one fix covers every deck |
| Medium | Doppler pulsatility per heartbeat, averaged over a breath; then the VExUS bands (under 30%, 30 to 49%, 50% or more) | `doppler.js:244-255`, `:290` | Today the number includes breathing, so a healthy vein reads 0.44 to 0.49, and VExUS bands would call it abnormal. Do not add the bands first. |
| Medium | Wall card: "Rupture risk" | `instruments.js:223`, `:294` | Item 9 |
| Medium | Add `gv`, `hb`, `co`, `bv`, `salb`, `pvVel` to COLS and CUT | `table-marks.js:102-104` | Item 11; fundal varices in tables |
| Medium | Let a flow-time chart take a title | `presenter-tools.js:45` | It always says "Portal pressure and flow over time", even when it plots ascites |
| Medium | Spleen: fade it (add its opacity to `plateStateKey`), rate a removed spleen "Removed", let platelets rise over days | `stage.js:3440`; `table-marks.js`; `metrics.js:111` | Needed before splenectomy buttons |
| Medium | Color a collateral with portal-to-systemic flow as reversed, or add a "Bypass" color | `stage.js:4228-4232` | The `direction` lens draws the paraumbilical vein as "Usual" |
| Low | "Paraumbilical", not "Paraumb. C3" | `doppler.js:41` | An internal code shows on screen |
| Low | Add MASH (and decide on NASH) to the disease pills | `diseases.js:4-9` | A title cannot name MASH today |
| Low | Lift the case card in the layout sweep | `tests/e2e/deck-sweep.mjs` | The last slides of decks with cases are never swept |
| Low | Print the case, causes and caveat in the handout; a learner copy with answers at the back | `handout.js:98-113` | The handout drops the vignette |
| Low | SCORM completion; `docs/LMS.md` says `?script=<file name>`, which fails for `where.js` (its id is `where-resistance`) | `lms.js`, `scripts/scorm.mjs:40`, `docs/LMS.md` | Lessons never report "completed" |

## 6. The authoring guide is out of date

The owner suspected the guide had missed things the engine can do. A code-first audit found about 30 gaps. The full list is in [AUTHORING_GUIDE_DRIFT.md](deck-review/AUTHORING_GUIDE_DRIFT.md).

**Two gaps change how the decks teach:**
- **`ask` and `notes` never appear on screen.** Only the printed handout reads them (`handout.js:100`, `:108`). During a talk, the only questions learners see are the end-of-deck quick checks; quiz mode was removed.
- **The figure is read-only while a talk plays** (`presenter.js:3441-3456`). Dye, the vessel card and the Explore tools cannot be used without pressing Esc.

**Wrong or stale in the guide:**
- **The kicker:** described as a heading above the title, but it is never drawn. The site shows as a corner tab.
- **Ladder rounding:** "Ladder slides round to whole mmHg" is false. `{pv}` reads 18.3 beside a ladder showing 18.
- **Tile ratings:** six are wrong, for example `pv` (code: amber over 10, red 15 or more; guide: red over 10), `liver`, `shunt`, `spleen`, and `whvp`/`fhvp`, which are unrated.
- **Scale `legend`:** described but never read.
- **The case card:** the camera behavior described differs from what the code does.
- **Bands:** "three bands = eradication" does not match the model; it needs 4 sessions, and bands slough.

**Missing from the guide:**
- the `pregnancy` preset;
- `gestation` and `stenosisSite`;
- lens `oxygen`;
- mark `seg` and `free`;
- Doppler `gate`, `points` and `deltaLabel`;
- probes `DIPS`, `C1b` and `C3`;
- compare `short`;
- `fold: false`, `dataTitle`, table `calm`, scale `rules`;
- tiles `co` and `bv`;
- the lapse details in 5.1;
- the "Target met" PPG reading after a TIPS;
- the handout-figure step for new decks.

**How to stop the drift:** add tests that check the guide's preset, tile and field tables against `scenario.js`, `table-marks.js` RATE and the fields the presenter reads, and generate the tile table from RATE.

## 7. New decks and formats, ranked

The judge step merged the 24 ideas from three idea sets with the reviewers' own proposals into 15. It scored each for teaching value, guideline relevance, engine readiness and effort. Full outlines are in [IDEAS_RANKED.md](deck-review/IDEAS_RANKED.md).

| Rank | Idea | Kind | Effort | Status |
|---|---|---|---|---|
| 1 | **Encephalopathy and shunting** | New deck | Medium | **Built** ([prototype](deck-review/prototype-decks/README.md)) |
| 2 | **Treating the cause** (hepatitis C cure, high starting HVPG, MASLD weight loss) | New deck | Medium | **Built** |
| 3 | **When banding fails** (balloon, rescue TIPS, fundal varices, BRTO against TIPS) | New deck | Medium | **Built**; needs the four balloon and bleed fixes in 5.4 to ease |
| 4 | Play the disease clock in the static decks (lapses, futures, anticoagulation reopening a vein) | Field edits in 8 decks | Low | Partly render-checked; see 5.2 |
| 5 | Contrast pairs: switch to the look-alike patient on the same slide | Field edits | Very low | `stiffness/schisto` ready; `ascites` on `hf`; `doppler/rhf` after an iPad check |
| 6 | Quick checks that ask for decisions, spaced across decks | Text | Very low | Ready to write |
| 7 | Shunts rebuilt as "TIPS: who, how wide, at what cost", with heart and liver work-up | Deck rebuild | Medium | Depends on ranks 1 and 3 |
| 8 | Predict cards: the room commits before the model moves | Presenter code | Medium | Needs the owner's decision (rule 15) |
| 9 | The hyperdynamic circulation and the kidneys | New deck | Medium | Outline only |
| 10 | Find the resistance as a worked example, then faded practice (14 to 12 slides) | Deck edit | Very low | Ready |
| 11 | Read it yourself: five measuring stations | New deck plus a small `blind` flag | Medium | Outline only |
| 12 | Lobule refocused on zone 3 and the sealing sinusoid wall | Deck edit | Low | Lapse render-checked with its own preset |
| 13 | Capstone: One liver, five years | New deck | Medium | Chain run; build after ranks 4 and 8 |
| 14 | A dye button on five slides | Presenter code | Medium | Outline only |
| 15 | Study mode, a case box in the handout, LMS completion | Code | High | Do the handout and LMS parts first |

### The three built decks

They are in [`deck-review/prototype-decks/`](deck-review/prototype-decks/README.md) as a patch against the current integration head.

- **Checks:** on a scratch copy with the patch and handout figures, all 898 unit tests pass and lint is clean with the repo's config. The layout sweep on desktop, iPad and phone found nothing that the existing `shunts` deck does not also show.
- **Rules:** every number on a slide comes from a live token, and no learner text names Baveno VII.
- **Before teaching:** the README lists 11 clinical claims to check, the overlaps to resolve with `shunts` and `variceal-bleed`, and the code `refractory-bleed` needs before it meets the easing rule.

### New formats, in short

- **Contrast pairs** (rank 5): a patient button for the look-alike. Comparing cases side by side beats studying them one at a time. It costs only fields; see 5.2 for where it works.
- **Decision quick checks** (rank 6): replace recall items ("What HVPG defines CSPH?") with decisions ("WHVP 15, FHVP 4: what is the HVPG, and is it significant?"). Add one item per deck taken from an earlier deck, named, for spaced retrieval.
- **Predict cards** (rank 8): a frosted card over the previous state asks the room one question; the model moves when it lifts. It reuses the case-card code. It conflicts with rule 15 ("no card or test-type fields on slides") and with the owner's habit of asking the room by voice, so it is the owner's decision.
- **Study mode** (rank 15): for learners on their own with a shared link, who today get no questions, answers or notes. Do it after the notes stop speaking to the room and the typed numbers are fixed, because it puts both on screen.
- **Dye button** (rank 14): a compare option that injects dye into a chosen vessel without changing the model.

## 8. Curriculum map and tracks

There would be 33 decks, the current 27 plus 6 new; each still stands alone.

- **Foundation, mechanisms (about 42 min):** `circulation` (merge its lobule and triad slides), `circuit`, `two-inflows`, `hyperdynamic` (new).
- **Core 1, measuring and finding the level (about 120 min):** `hvpg` (home of the HVPG pitfalls), `sites` (home of the six-level tour), `stiffness`, `doppler`, `one-year` (played live), `prehepatic`, `ncph`, `right-heart` (home of congestion), `pvt-cirrhosis`, `spleen`, `stations` (new, closing practice).
- **Core 2, complications (about 67 min):** `varices`, `endoscopy`, `variceal-bleed` (home of resuscitation), `ascites` (home of the SAAG), `encephalopathy` (new), `cause-treated` (new).
- **Advanced 1, treatment (about 70 min):** `beta-blockers`, `treatment` (mechanisms only), `tap`, `shunts` (renamed), `tips-doppler` (home of surveillance), `refractory-bleed` (new), `recompensation`.
- **Advanced 2, vascular and special situations (about 31 min):** `outflow`, `lobule` (refocused), `pregnancy`.
- **Practice and capstone (about 28 min):** `where-resistance` (12 slides), `five-years` (new).

**Tracks:**
- **Residents:** four sessions of 30 to 40 minutes:
  1. circulation, sites, hvpg;
  2. stiffness, varices, variceal-bleed;
  3. ascites, encephalopathy, beta-blockers;
  4. stations.
- **Fellows:** the residents' track, then the rest in the order above, ending with where-resistance and five-years.
- **Radiology and IR:** circulation, sites, doppler, tips-doppler, shunts, refractory-bleed, prehepatic, outflow, pvt-cirrhosis, stations.

Each session opens with the previous session's quick check. Plan about 1.5 times the deck minutes for discussion.

**One home per repeated idea, with one-line pointers elsewhere:**

| Idea | Home deck |
|---|---|
| Resistance levels | `sites` |
| HVPG pitfalls | `hvpg` |
| Lobule anatomy | `lobule` |
| Congestion | `right-heart` |
| Budd–Chiari Doppler | `outflow` |
| SAAG | `ascites` (`tap/heart` is cut) |
| Resuscitation | `variceal-bleed` (`endoscopy` drops `oct` and `transfuse`) |
| Splenic vein thrombosis | `prehepatic/svt` |

TIPS splits by question:
- mechanism against drugs: `treatment`;
- choosing it in ascites: `tap`;
- work-up and width: `shunts`;
- encephalopathy: `encephalopathy`;
- surveillance: `tips-doppler`.

**Topics the engine cannot show** stay as notes on the nearest slide, not as decks:
- SBP microbiology;
- hyponatremia;
- hydrothorax;
- ACLF, frailty and nutrition;
- hepatopulmonary syndrome;
- liver cancer surveillance;
- children.

**Rejected, with reasons in IDEAS_RANKED.md:**
- a scored exam deck;
- a wall-tension tile;
- a Valsalva slide;
- separate gastric and fundal varix decks;
- a surgical-shunts deck;
- a `he` tile;
- plasma on bleed slides;
- a 168-day pregnancy lapse;
- a Fontan slide.

## 9. Decisions for the owner

1. **New decks:** build and preview ranks 1 to 3? They are ready to try; `refractory-bleed` should wait for the balloon fixes, or be shown knowing the balloon pops.
2. **Predict cards (rank 8):** allow them despite rule 15? Two or three per deck, on outcomes learners get wrong.
3. **`ascites`:** may it end on its quadrant instead of a table (rule 11)?
4. **`where-resistance` to 12 slides:** keep the six-ladders picture and cut the table, or the reverse? Rule 11 asks for the table.
5. **`circuit/both`:** keep the 8-day meal (animated "Fasting → After a meal", with hidden ascites growth) or make it acute (no animation)?
6. **`shunts`:** split it into the encephalopathy and refractory-bleed decks (rank 7), or keep its slides and add only the heart and liver work-up?
7. **`circuit`:** no case cards, by the owner's choice. Should a predict card count as a case?

## 10. Claims to check against the sources

The guideline PDFs could not be opened from the sandbox. Before teaching, someone with access should check:

- **Baveno VIII:**
  - the spleen-stiffness sign (under 40 kPa, or 40 or less);
  - "above 55 kPa on the 100 Hz probe";
  - NICER as a third gray-zone model, and reassessment at 12 months;
  - the exact wording, evidence level and stop rules of the carvedilol-with-ascites statement;
  - the pre-emptive TIPS criteria, including HVPG 20 mmHg or more and the late window;
  - whether the post-cure rule-out (under 12 kPa with platelets over 150,000/µL) was kept;
  - the decompensation definitions (ascites on imaging only);
  - the MASLD statements;
  - the statement on encephalopathy after TIPS.
- **AASLD 2024:**
  - the octreotide dose table;
  - carvedilol at no more than 12.5 mg a day with ascites;
  - presuming CSPH at 20 to 25 kPa with platelets under 150,000/µL.
- **EASL TIPS 2025:**
  - the dysfunction statement ("4 to 8 weeks");
  - the smallest-width rule;
  - the cardiac work-up (echo, BNP, RVSP over 45 mmHg leads to catheterization).
- **EASL vascular 2025:**
  - ursodeoxycholic acid for every stem-cell transplant;
  - PVT anticoagulation criteria;
  - PSVD.
- **ACG 2026 hepatic encephalopathy guideline:** citation and statements (known only from a summary).
- **Trials cited in notes:**
  - Escorsell 2016 (stent against balloon);
  - GAVAPROSEC 2025;
  - Bureau 2021 (rifaximin before TIPS);
  - Wang 2017 (8 against 10 mm);
  - PRECIOSA;
  - CARVE-AS 2026;
  - Razafindrazoto 2022 (PSVD carvedilol).
- **The 11 claims in the new decks:** listed in the prototype README.

The statements, their sources and the confidence of each are in [LITERATURE.md](deck-review/LITERATURE.md). Until checked, the safest wording drops the guideline name and keeps the claim general; each finding gives that fallback.

## 11. How this was done

A multi-agent review ran these steps:

1. A capabilities pass over the engine and presenter.
2. Two literature digests.
3. Seven review groups covering the 27 decks; each re-ran its slides' patients with the engine's own chain (`src/worker-core.js`).
4. A verifier for each group, which checked every finding against the code, the model and the source.
5. Three idea sets: curriculum gaps, engine-first, and learning science.
6. A judge to rank the ideas.
7. A critic, which found two gaps that became the render check and the three built decks.

Separately, a code-first audit compared the authoring guide with the presenter and engine.

All work ran on a read-only checkout. Nothing was pushed to the app's branches.
