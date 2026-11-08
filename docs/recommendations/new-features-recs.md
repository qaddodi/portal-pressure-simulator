# New features to add: recommendations

8 Nov 2026. Recommendations only; no app code was changed. I read `claude/settings-topbar-icon-flvft1` at 2bde649: the engine
(`src/engine/`), all 31 decks and the slide schema (`src/ui/decks.js`), the 19 data-card tool kinds, the 6 procedure plays
(`src/ui/proc-anim.js`), the Tests and Treat cards, the free sim's vessel actions, and the two guideline PDFs in `guidelines/`
(Baveno VIII 2026, AASLD 2024). I checked each statement number below against the text.

**Where the numbers come from.** Every model number here comes from running the engine in node (no browser): `loadPreset`, then
`setParams` and `settle`, plus `advanceDays` where days are given. They are settled readings, given to one decimal. A slide's own
state (its `days`, ramps or diuretics) can read a little differently, so a build thread should read the numbers on its own slide.

**How I ranked.** What it gives a room of hepatologists, times how much of it the model really computes (no invented number on
screen), divided by cost. Each item names the GPU piece it sits on, so nothing reaches for DOM or canvas 2D.

**Effort key.**
- **S**: one build thread, under a day. One or two files, no new GPU surface.
- **M**: one thread, one to three days. A new GPU piece or an engine knob, plus its slides.
- **L**: several threads.

---

## What is already there, and what is still open from 7 Nov

The 7 Nov ideas doc (`/mnt/project-files/portal-reliability/features-and-decks-ideas.md`) has been largely built:

- **Built:** the Guideline path card (15 algorithms in `src/ui/path-algos/`), the kidney pressure tile, the Meso-Rex graft, and the
  kidney, Meso-Rex and MASLD decks.
- **Also built on 7 Nov:** surgical shunts as Treat orders, EUS-guided coils and glue, the live after-procedure graph.
- **Still open, not repeated here except where a new item builds on one:**
  - F3, the statement chip;
  - F5, the self-study case (sharpened in L1 below);
  - F6, the gastric scope view;
  - F8, the tumour in the liver;
  - F9, the pleural space;
  - F10, side-by-side patients;
  - presenter items N5, N8 and N9;
  - decks D2 (liver cancer), D5 (bleeding that isn't a varix) and D6 (read the tests).

Three things in the code are built but barely used. They make several items below cheap:

1. **The dye bolus.** The free sim's "Inject dye" verb (`src/ui/actions.js:216`) sends contrast through the network on the model's
   own flows. It is stepped in a worker (`dye-worker.js`, `dye-remote.js`) and drawn by veins-gl. No deck uses it.
2. **The free-form plane.** The `plane` tool and visual take any two fingerprint keys (`planeOf` in `src/ui/visual-plane.js`), but
   only the `csph` and `hvpg-ppg` planes are in use.
3. **The `causes` waterfall.** It is registered (`ext-model.js`), but no slide uses it.

---

## Top pick: contrast on the slide (I1)

**Contrast travels through the live model, and a slide can show it in an X-ray look.**

Why this one first:

- Interventional hepatology is taught on venograms, and the app already moves contrast by the model's real flows. A portogram before
  and after a TIPS needs no drawing: the contrast goes where the blood goes.
- It improves seven decks at once (shunts, gastric varices, outflow, HVPG, TIPS Doppler, encephalopathy, Meso-Rex). It is also the
  check the HVPG technique item (I2) needs.
- It needs no model work. The new pieces are one slide field and one look.

Details are in I1 below.

---

## Ranked list

| # | Feature | Kind | What it teaches | Model work | Effort |
|---|---|---|---|---|---|
| I1 | **Contrast on the slide** (top pick) | instrument, animation | Portograms and venograms on the live model | none | M |
| I2 | **HVPG done right**: technique modes on the catheter | instrument, deck K1 | The 12 measuring rules, and what breaks the reading | one knob | M |
| C1 | **Flow and resistance plane** | chart | Ohm's law: which drug lowers the flow, which the resistance | none | S |
| C2 | **Treatment menu** for the patient on screen | chart | Every treatment's PPG against the liver flow it costs | none | M |
| P1 | **Plug a spontaneous shunt** (play) | procedure | Baveno VIII 6.12 | none | S–M |
| P2 | **Narrow or close the TIPS** (play) | procedure | Baveno VIII 6.17 | none | S–M |
| P3 | **Splenic vein stent and splenic embolization** (plays) | procedure | AASLD 2024 statement 47, left-sided PH | none | S–M |
| P4 | **Portal vein recanalization, with or without a TIPS** (play) | procedure | Baveno VIII 9.12, 9.13, 9.15, 5.45 | none | M |
| I3 | **Gradient across the new stent** (TIPS step 5) | instrument | PSG <12 mmHg after TIPS, AASLD 2024 | none | S |
| K2 | **After the transplant** | deck | Pressures fall at once, the spleen takes months, a big shunt steals | none | S–M |
| S1–S3 | **Three small slide additions** | slides | See section S | none | S each |
| I4 | **Ultrasound tab**: survey and bedside volume | test card | The first scan; IVC and venous congestion | calibration | M–L |
| A1 | **First-pass lens** | lens, animation | Gut blood the liver cleaned against blood that went round | none | M |
| P5 | **Coil the coronary vein at TIPS** (play) | procedure | Baveno VIII 5.41 | small fix | M |
| L1 | **Case runner** (sharpens 7 Nov F5) | learning mode | A learner works a case alone, then a debrief | none | L |
| L2 | **Slide composer** | authoring | Faculty make slides from what is on screen | none | M |
| A2 | **Platelets pool in the spleen** | animation | Hypersplenism | none | S–M |

---

## I. Instruments and test cards

### I1. Contrast on the slide, and an X-ray look (top pick)

**What exists.** "Inject dye" on any vessel in the free sim. The slugs advance through the network flow-weighted in a worker, and
veins-gl lays the dye bins on the vessels.

**What to add.**

1. **A slide field**, for example `dye: { at: 'CONF', seconds: 3 }`. It injects as the slide lands, or at a procedure step:
   `procedure` steps can carry `dye`. Back clears it.
2. **A lens, `lens: 'fluoro'`.**
   - The organs go grey. `organ-grey.js` already greys every organ fill without a filter.
   - The vessels become faint grey tubes, and the dye is drawn dark on a light ground, as subtracted angiography looks.
   - A key on the figure says "Contrast".
   - It is a veins-gl lens branch plus the organ grey path. There is no new surface.

**Slides it opens.** Each is a one-line addition to a slide that exists; the model already computes where the contrast goes.

1. **Portogram before and after a TIPS** (shunts `tips`). Before, contrast in the main portal vein runs up the coronary vein into the
   varices. After, it runs into the stent and the heart. Check first that the coronary vein's flow is hepatofugal on the slide's
   state.
2. **BRTO venogram** (gastric-varices `brto`). With the balloon up in the gastrorenal shunt, contrast fills the fundal varices and
   stands still.
3. **Hepatic venogram in Budd–Chiari** (outflow, or HVPG `blocked`). Contrast in a stump drains through the caudate veins to the
   IVC.
4. **TIPS venogram with a narrowing** (tips-doppler). Contrast slows at the narrowing. The notes already say a suspicious Doppler "is
   followed by TIPS venography" (`tips-doppler.js:110`).
5. **The wedge check** (HVPG `wedge`). With the balloon up, contrast stays still. With a vein-to-vein communication (I2), it washes
   out through the next vein. Both guidelines name this check (Baveno VIII Table 3; AASLD 2024 Box 2, item 8).
6. **A spontaneous splenorenal shunt** (encephalopathy `srs`). Splenic contrast goes to the left renal vein, not the liver.
7. **Meso-Rex graft patency** (meso-rex). Contrast from the superior mesenteric vein fills the left portal vein.

**Check before building.**
- An injection at a wedged catheter needs the wedge compartment (`W_R`) to carry dye. The dye network may only know edges with flow.
- Add a node test that every slide's `dye.at` names a vessel id.

**Effort M.** The field and the presenter hook are S. The look is M, in veins-gl and the organ paint.

### I2. HVPG done right: technique modes on the catheter

The HVPG deck shows the measurement done right. Hepatologists who measure the HVPG also need the ways it goes wrong. Both guidelines list
them:

- **Baveno VIII Table 3**, "Statements on technical aspects of HVPG and PPG measurement":
  - a balloon catheter is preferred over a straight one, because it lowers the random error of the WHVP;
  - a small contrast injection with the balloon up confirms occlusion and excludes vein-to-vein communications;
  - the WHVP needs at least 1 minute, read on the stable last 20 to 30 seconds, in triplicate;
  - the wedged-to-free gradient is the standard, not wedged-to-right-atrium.
- **AASLD 2024 Box 2** (p. 1187):
  - the transducer sits at the midaxillary line and is zeroed;
  - the patient breathes quietly, with no deep sedation (midazolam 0.02 mg/kg is acceptable);
  - the FHVP is taken 2 to 4 cm inside the vein;
  - triplicates sit within 2 mmHg of each other;
  - an FHVP more than 2 mmHg above the IVC calls for venography to rule out obstruction.

Modes on `tool: { kind: 'hvpg' }` and the `cath` steps:

| Mode | What the model does | What the room sees |
|---|---|---|
| `leak: 0..1`, a vein-to-vein communication | **One engine line.** `engine.js:513` sets the wedge's outflow to 0 when wedged; make it `e.G × leak`. | The WHVP under-reads, and the HVPG with it. The contrast puff (I1) washes out. |
| `breath: 'deep'` | `respDepth` exists (`engine.js:410–413`). | The tracing swings with each breath; read at end-expiration. |
| `zero: +5`, the transducer set too low | No model change: an offset on both readings. | Both readings shift 5 mmHg and the HVPG does not. This is why the gradient is used. |
| `read: 'early'`, read before it settles | The wedge compartment fills over seconds (0.3 mL/mmHg against about 0.02 to 0.025 mL/s/mmHg in and out, so 12 to 15 s). | A low first reading, then the true one. Check the model's settle time against the guideline's 1 minute. |
| Triplicate strip | Three wedges in a row. | Three readings, their spread, and a tick when they agree within 2 mmHg. |

GPU: trace-gl for the tracing, veins-gl for the catheter, text-gl.

It lands in the HVPG deck (two or three slides) and in the new deck K1.

**Effort M.**

### I3. The gradient across the new stent (TIPS step 5)

The TIPS play ends with the stent in. Interventional radiologists then measure the portal pressure through the stent and the right
atrium (or IVC) pressure, and report the gradient. AASLD 2024 (p. 1197): beta-blockers "are not required after TIPS placement if
portosystemic gradient is reduced to under 12 mm Hg". Baveno VIII Table 3 adds that the immediate post-TIPS gradient can be
skewed by general anaesthesia and vasoactive drugs.

**What exists.** The after-procedure graph (`event-graph.js`) already draws the PPG with a green "Target <12" band.

**What is missing.** The catheter step that takes the two readings, built as EUS-PPG's measure spec is (`MEASURES.eus` in
proc-anim). In `cirr-decomp` the PPG falls from 17.4 to 9.2 mmHg (8 mm stent) or 7.9 mmHg (10 mm).

It lands in shunts `tips`, variceal-bleed's TIPS slide and ten-years' TIPS slide.

**Effort S.**

### I4. An Ultrasound tab: the survey, and bedside volume

A new tab in the Tests card, with two modes. Both are built from readings the model already has.

- **Survey**, the first scan of a new patient:
  - spleen length;
  - portal vein diameter, direction and velocity (`diameter('PV_TRUNK')`, `pvVel`);
  - ascites grade;
  - a recanalized paraumbilical vein (C3 flow);
  - a splenorenal shunt (C6 flow);
  - a large caudate (the `CAUDATE` event);
  - open hepatic veins.

  Baveno VIII 9.2 makes Doppler ultrasound the first test for a portal vein clot, and 8.50 asks for one every 6 months to screen
  for a clot in PSVD with signs of portal hypertension.
- **Bedside volume (POCUS):**
  - IVC size and how much it collapses with a breath;
  - the hepatic vein waves (the Doppler's `waves` option);
  - the portal pulsatility (the Doppler's calipers);
  - a VExUS-style congestion grade.

  Baveno VIII lists POCUS for judging volume and guiding albumin in HRS-AKI only as research (RA6.18), so the card says so.

The model already swings the suprahepatic IVC with breathing:

| Patient | IVC diameter over a breath | Collapse |
|---|---|---|
| Healthy | 20.0 to 23.1 mm | 14% |
| Healthy after a 1.5 L bleed | 11.4 to 21.9 mm | 48% |
| Right heart failure | 25.3 to 28.0 mm | 9% |
| Constriction | 23.6 to 24.9 mm | 5% |

That is the right direction. But a healthy IVC reads as plethoric on the usual echo bands (over 21 mm with under 50% collapse), so
the card needs a sniff first (`respDepth` 3) and a calibration check before it maps a reading to a right atrial pressure.

GPU: a new card drawn the way doppler-gl and fibroscan-gl draw theirs, with tiles on tile-gl. It lands in the kidney, outflow and
variceal-bleed decks, and in the first visit.

**Effort M–L.**

---

## C. Charts

### C1. Flow and resistance plane (Ohm's law)

The central idea of portal hypertension is pressure = flow × resistance. It is in the circuit deck's words, but there is no chart of
it.

The plane:
- the x axis is portal inflow (`pvFlow`) and the y axis is the PPG;
- lines from the origin are lines of equal resistance;
- each patient or treatment is a dot.

A beta-blocker slides the dot down its line, because the flow falls. Carvedilol drops it to a lower line, because the resistance
falls as well. A meal moves it right. A TIPS drops it near the floor.

In `csph`:

| State | PPG, mmHg | Portal flow, L/min | PPG ÷ flow |
|---|---|---|---|
| Untreated | 13.5 | 1.16 | 11.6 |
| Propranolol | 11.7 | 0.87 | 13.4 |
| Carvedilol | 10.3 | 0.92 | 11.2 |
| Terlipressin | 11.2 | 0.71 | 15.8 |
| After a meal | 15.6 | 1.47 | 10.6 |

The model separates the two beta-blockers the way the drug notes in `scenario.js` describe them: carvedilol also lowers the
resistance inside the liver.

**Model work: none.** `planeOf` already takes `{ x: 'pvFlow', y: 'ppg' }`. The new parts are:
- an `iso` option that draws rays of equal PPG ÷ flow, named in mmHg per L/min, in plane.js;
- an `of:` list, as the plane visual already has, or `against` sweeps, for the drug dots.

The fingerprint's `rih` (resistance inside the liver alone) can name the liver's share if a slide needs it.

It lands in circuit, treatment and circulation.

**Effort S.**

### C2. Treatment menu for the patient on screen

**One chart: every treatment the patient could get, run on this patient by the sweep worker.** Each treatment is drawn with the PPG
it reaches against the liver perfusion it costs. The encephalopathy summary's sentence, "Every shunt trades a lower gradient for less
liver flow", becomes a picture. The Meso-Rex is the one dot that breaks the line.

In `cirr-decomp`:

| Treatment | PPG, mmHg | Liver perfusion | Shunt fraction |
|---|---|---|---|
| None | 17.4 | 59% | 69% |
| Propranolol | 15.1 | 52% | 74% |
| Carvedilol | 14.1 | 58% | 65% |
| Partial splenic embolization | 16.3 | 56% | 71% |
| Warren shunt | 16.1 | 55% | 78% |
| TIPS, 8 mm | 9.2 | 29% | 94% |
| TIPS, 10 mm | 7.9 | 24% | 94% |
| Mesocaval shunt | 6.6 | 23% | 100% |
| Portocaval shunt | 3.0 | 36% | 100% |

`pvt-chronic` makes the outlier case: recanalization gives a PPG of 4.6 mmHg and the Rex a PPG of 7.2, both with the liver over
100%.

**What is new.** Today a slide per treatment feeds a table (the shunts, encephalopathy and choose-treatment summaries). Here the
card sweeps the options on the slide's own patient. It reuses the `curve` tool's sweep worker and the plane's drawing. As bars, it
reads as a menu; as a plane, it reads as a trade-off.

It lands in choose-treatment, shunts and encephalopathy.

**Effort M.**

---

## P. Procedures

Today these changes happen instantly through `params` or `compare`. The slides that need them exist; what is missing is the play.
Each play goes through `specOf` in proc-anim, as the six plays do now (steps, `can`, `apply`, `undo`), and draws on veins-gl.

### P1. Plug a spontaneous shunt (Baveno VIII 6.12)

**The play.** From the femoral vein to the left renal vein, then into the splenorenal shunt (C6). The route is the BRTO's into C5.
A plug or coils are deployed.

**The model** (`occluded.C6`, verified), on `cirr-decomp` with a splenorenal shunt:

| Reading | Shunt open | Shunt plugged |
|---|---|---|
| PPG | 10.3 mmHg | 17.4 mmHg |
| Liver perfusion | 35% | 59% |
| Encephalopathy index | 1.28 | 0.88 |
| Esophageal varix | 2.1 mm | 7.2 mm |

It lands in encephalopathy `embolize`, which is a params change today.

**Effort S–M.**

### P2. Narrow or close the TIPS (Baveno VIII 6.17)

**The play.** A reducing stent placed inside the TIPS (`stenosis.TIPS`), or a plug that closes it (`tips.on: false`). 6.17 lists
"reduction or occlusion of the TIPS" with shunt embolization for encephalopathy that persists after a TIPS.

**The model:** on a 10 mm TIPS in `cirr-decomp`, a 50% reduction takes the PPG from 7.9 to 10.5 mmHg and the liver from 24% to 33%.

It lands in encephalopathy `narrow` (today a 6 mm stent) and shunts `occl`.

**Read before you word it.** The encephalopathy index is 1.20 for a 6, 8, 10 or 12 mm stent and for a narrowed one, because the
shunt fraction stays at 94% (`heRisk` in `metrics.js`). What moves is the liver's perfusion. The `narrow` slide already shows the
liver and PPG tiles, not the index. Keep it that way, or revisit how the index counts a narrowed stent.

**Effort S–M.**

### P3. Splenic vein stent and partial splenic embolization (AASLD 2024 statement 47)

Statement 47 (p. 1199): bleeding gastric varices from an isolated splenic vein clot "should be evaluated for splenectomy, splenic
vein stenting, or splenic artery embolization". Gastric-varices `splenectomy` offers all three as compare buttons, but none of them
plays.

Two plays:

- **Splenic vein stent** (`thrombus.SV_CONF` → 0, `stented: ['SV_CONF']`):
  - the fundal varix goes from 8.0 to 2.0 mm at once;
  - by day 90 the platelets rise from 87 to 213 and the spleen shrinks from 15.6 to 11.6 cm.
- **Partial splenic embolization** (`splenicRx: 1`): a microcatheter into the splenic artery, with particles to the lower pole.
  The look Mohammad picked is built (096c5bc).
  - The fundal varix goes from 8.0 to 3.6 mm.
  - **Check first:** it is back to 6.6 mm by day 90 in the model. Decide whether that regrowth is intended before a slide says the
    embolization fixed it.

**Effort S–M.**

### P4. Portal vein recanalization, with or without a TIPS

Baveno VIII:
- 9.12: endovascular restoration of portal flow uses angioplasty, with or without a stent, and/or a TIPS for chronic PVT;
- 9.13: a TIPS when intrahepatic resistance is raised;
- 9.15: restoring flow is considered in non-cirrhotic chronic PVT with recurrent complications;
- 5.45: a TIPS with or without recanalization in cirrhosis with PVT and a variceal bleed, in selected patients;
- 9.34: recanalization is the named alternative when a Meso-Rex is not feasible.

**The play.** A transsplenic or transhepatic wire through the clot, then a balloon, then a stent in the trunk (`thrombus.PV_TRUNK` →
0, `stented: ['PV_TRUNK']`).

**The model**, on `pvt-chronic`:

| Reading | Before | After | Day 120 | Meso-Rex instead |
|---|---|---|---|---|
| PPG | 14.7 mmHg | 4.6 mmHg | 4.3 mmHg | 7.2 mmHg |
| Platelets | 77 | 77 | 218 | |
| Spleen | 16.3 cm | 16.3 cm | 11.5 cm | |

The cavernoma (C8) regresses on its own clock (120 days).

It lands in prehepatic (two or three slides) and meso-rex (the 9.34 alternative).

**Effort M.**

### P5. Coil the coronary vein during a TIPS (Baveno VIII 5.41)

**The guideline.** 5.41 makes "TIPS ± variceal embolisation" the preferred definitive treatment for GOV2 and IGV1 bleeding.

**The play.** A portogram (I1), coils in the coronary vein (`occluded.C1a`), and a second portogram.

**Two checks first:**
- With `C1a` occluded and no TIPS, the model's esophageal varix stays at 7.3 mm, because `varixTarget` reads the gradient, not the
  feeder. That needs a small fix (S).
- After a 10 mm TIPS the varix is already 2.1 mm. The coil shows only if the portogram still fills the coronary vein on the slide's
  state.

**Effort M**, with the fix.

---

## K. New decks

### K1. Measuring the HVPG well (needs I2, I1 for the wedge check, I3)

About 9 slides, after the HVPG deck:

1. Balloon or straight catheter: the error, as a spread of readings.
2. Confirm the wedge with contrast.
3. A vein-to-vein communication: the WHVP that under-reads.
4. Wait for the wedge to settle; read the last 20 to 30 seconds.
5. Triplicate, within 2 mmHg.
6. The transducer level: the gradient holds and the absolute pressure doesn't.
7. Breathing and sedation.
8. An FHVP above the IVC by more than 2 mmHg: venography, with the `ivc-web` preset.
9. Summary.

Source: Baveno VIII Table 3 and AASLD 2024 Box 2.

### K2. After the transplant (no model work)

A slide can give the patient a new liver with `params: { cirrhosis: 0, albumin: 4, diuretics: false }`. The model's slow clocks then
teach what happens next:

| Reading | Before the transplant | Day 90 | One year |
|---|---|---|---|
| Platelets | 60 | 193 | 250 |
| Spleen | 17.7 cm | 12.0 cm | 11.0 cm |

- **The pressures fall at once.** The PPG falls from 17.4 to about 4 mmHg.
- **The hyperdynamic circulation takes weeks.** The cardiac output is still 7.6 L/min on the day, and 5.3 by day 90.
- **A large splenorenal shunt left open steals portal blood.** At day 90 the portal flow is 0.79 L/min with the shunt against 1.10
  with it tied, and the shunt still carries 0.32 L/min. Tying it at surgery fixes that.

About 8 slides, using profile, trace with `range: 'talk'`, tiles and the origin lens.

**Caveat.** The two PDFs say little about the time after a transplant. The sources (spleen and platelet recovery, portal steal)
belong in the notes, checked before the deck is built, or the numbers are worded as the model's.

**Effort S–M.**

### K3. Read the X-ray (needs I1)

D6's puzzle idea, for venograms. Six cases, each a question slide with `hold: true` and an answer slide:

- a hepatofugal portogram;
- a BRTO venogram;
- a Budd–Chiari spider web draining by the caudate;
- a TIPS venogram with a distal narrowing;
- a wedged venogram with a vein-to-vein communication;
- a cavernoma.

**Effort S** once I1 exists.

---

## S. Small additions to the decks we have

Each is S, in deck files only.

1. **Gastric varices `svt`: add a TIPS button.** In left-sided portal hypertension the model shows a TIPS treating the wrong
   pressure. The fundal varix goes from 8.0 to 7.8 mm, against 2.1 mm with a splenectomy and 2.0 mm with a splenic vein stent.
   AASLD 2024 statement 47 names the spleen and the splenic vein, not a TIPS. The words should stay with that statement.
2. **Use the `causes` waterfall.** It is registered and in no slide. It fits the first slide of the MASLD deck (the presinusoidal
   part the wedge misses) and Sites. This overlaps the deck review thread; whichever builds first takes it.
3. **Encephalopathy `srs`: a stagnant portal vein.** With a large splenorenal shunt in `cirr-decomp`, the portal velocity falls to
   about 0 (−1 cm/s) and the `PV_STASIS` event can fire. One line ties the spontaneous shunt to clot risk. The PDFs don't state it,
   so it goes in the notes with its source, and the words say only what the Doppler shows.

---

## A. Animations and lenses

### A1. First-pass lens

The origin lens colours blood by where it came from (SMV, IMV, splenic vein, systemic, hepatic artery). Gut blood keeps its colour
after the liver, so it cannot show which gut blood the liver cleaned and which went round it. That is the whole idea behind
encephalopathy.

Add a channel to the origin mixing (`stage-blood.js` and its texels in veins-gl): gut-origin blood that has crossed the sinusoids turns
"cleared". Blood that reached the cava by a collateral or a stent keeps its colour.

On the encephalopathy `firstpass`, `collat`, `srs` and `tips` slides, the room sees uncleaned gut blood reach the heart.

It is not an ammonia number, and the key says so.

**Effort M.**

### A2. Platelets pool in the spleen

The blood heads in the splenic red pulp slow down and gather as the spleen grows. The density of platelet specks in the stream
follows `spleen.platelets`, which the model reads from the spleen's size. It is drawn by the blood heads on veins-gl.

It lands in stiffness (the platelet slides), varices and gastric varices (after a splenectomy or embolization).

**Effort S–M.**

---

## L. Tools for learners and faculty

### L1. Case runner (sharpens 7 Nov F5)

This is the case engine the design blueprint planned (§12) and never built. All its parts exist now:
- the free sim;
- the Tests card (Doppler, FibroScan, scope, HVPG, EUS-PPG, Abdomen);
- the Treat card (drugs, fluids, procedures);
- the timeline's History, with a snapshot per entry.

A case is:
- a vignette and a preset with seeded small changes;
- a goal, for example "control the bleed" or "decide on a TIPS";
- the path card as the judge: it already lights the guideline branch from the live numbers.

The debrief replays the timeline next to the branch the guideline takes. The blueprint's six cases map onto decks that exist:
variceal bleed, refractory ascites, gastric varices, outflow, encephalopathy and gastric-varices BRTO.

The score stays on the device (PRIVACY.md).

**Effort L.**

### L2. Slide composer

**What exists.** "Add current state" in Your scripts (`menu.js:200`, `presenter.js` `addStep`) saves the preset, params and camera
with a profile card.

**What to add.** Let it also take:
- the data card that is open (any tool kind and its options);
- the lens, labels and marks;
- a title and line with live pills (`{hvpg}`).

Faculty could then build a slide by setting it up on screen. Saving stays on the device; export uses the deck file format that
Import already reads.

**Effort M.**

---

## Model notes found on the way

None of these blocks the items above. Each is worth a look before a slide quotes the number.

1. **The encephalopathy index after a TIPS.** It is 1.20 for every stent width and for a narrowed stent, because the shunt fraction
   stays at 94% (P2).
2. **An occluded coronary vein leaves the esophageal varix as it was** (7.3 mm), because `varixTarget` reads the gradient (P5).
3. **The fundal varix regrows after a partial splenic embolization** in `svt`: 3.6 mm at once, 6.6 mm by day 90 (P3).
4. **A healthy IVC reads wide.** It is 20 to 23 mm with 14% collapse on quiet breathing (I4).
5. **A 10 mm TIPS raises the right atrial pressure by only 1.3 to 1.5 mmHg**, whether the heart is normal (4.5 to 6.0) or weak
   (contractility 0.3 with tricuspid regurgitation 0.5: 8.3 to 9.6). Rises reported after TIPS are usually larger. The shunts deck
   says "The stent gives the heart more to do" in words. A slide that quantifies it should wait for a calibration check.
6. **Vasodilation alone never takes the MAP under 65 mmHg.** `systemicTone` (in no deck) lowers it, but the baroreflex holds it up:
   in `cirr-decomp` a tone of 0.7 gives a MAP of 78 (from 82), and even the slider's floor of 0.4 with carvedilol gives 69, with a
   kidney pressure of 63. An "infection as a second hit" slide on the kidney deck would therefore show the MAP falling but never
   reaching the hold-carvedilol line (4.6), unless a bleed or tense ascites is added on top. I left it out of section S for that
   reason.

---

## Considered and not recommended

- **A slide that quantifies TIPS overloading a weak heart.** See model note 5.
- **CO2 wedged portography.** The model's wedge is a still column, so contrast would not fill the portal vein backwards. The picture
  would be drawn, not computed.
- **A Child–Pugh or MELD calculator.** The model has no bilirubin, INR or creatinine. The path card already takes these as case
  facts.
- **Exporting a slide as video or PNG.** It needs a CPU pixel copy, which the off-GPU scanner counts against the 100% goal.
- **Portopulmonary or hepatopulmonary decks.** There are no lungs in the model.
- **Separate decks on spontaneous shunts or left-sided portal hypertension.** Encephalopathy (`srs`, `embolize`) and gastric
  varices (`svt`, `splenectomy`) already teach them. P1, P3 and S1 fill the gaps.

---

## Build order, if these are taken up

These can run as parallel Sonnet threads; each touches separate files.

1. **C1, then C2:** `visual-plane.js`, `chart-looks/plane.js`, the sweep worker.
2. **I1:** decks.js field, presenter hook, the fluoro lens in veins-gl and the organ paint. Then K3.
3. **I2 and I3, then K1:** `hvpg-proc.js`, `tool-hvpg.js`, one line in `engine.js`, the TIPS spec in proc-anim.
4. **P1, P2 and P3:** one thread, because they share `proc-anim.js`. Then P4, then P5 with its varix fix.
5. **S1 to S3:** deck files only.
6. **K2:** deck only.
7. **A1, then A2:** `stage-blood.js`, `veins-gl.js`, `blood.js`.
8. **I4:** a new Tests tab.
9. **L2, then L1.**

Labels: none of these touch label code. Callouts on new slides go through the one label thread's existing system.
