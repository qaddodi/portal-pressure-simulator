# Play-test plan: 18 testers in 9 pairs

Written 16 Nov 2026 from the code on the preview branch (`claude/settings-topbar-icon-flvft1`, tip fce95dc2) and from today's play-test threads. No app code was changed for it.

The console helpers the testers use are in [`play-test-toolkit.md`](play-test-toolkit.md).

What is in this plan:

1. How to run it
2. What the app has
3. What today covered, and what is still open
4. The rules every tester judges against
5. Setup: browser, lanes, sizes, looks and builds
6. What to measure
7. Severity guide
8. How to report a finding
9. The 18 testers
10. Run order
11. Coverage matrix
12. Ready-to-paste briefs

---

## 1. How to run it

- **18 Sonnet threads, run as 9 pairs.** Each pair has one **V** (visible pane) tester and one **B** (background) tester. Never run two V testers at once.
- **Why pairs, and why only one V at a time.** The built-in browser shows one tab at a time. A tab that is not showing is throttled: today's camera gate read 1,000 ms stalls and about 3 frames a second from a hidden pane. Motion, camera and timing checks therefore need the one visible tab. Checks that read the settled page (text, numbers, layout fit) survive in a background tab, only more slowly.
- **Start the B tester first and the V tester second**, so the V tester's tab is the newest one and is the one showing. Ask Mohammad to keep the Browser pane open (Cmd+Shift+B) while a pair runs.
- **Each wave takes about 1 to 2 hours**, so the whole plan is about a day of tester time. A thread that runs low on context posts what it covered and stops, and a continuation picks up at the next slide (section 8).
- **Routing.** Testers post every finding in their own thread, in real time, with a screenshot. The coordinator routes them:

| Finding about | Goes to |
|---|---|
| Slide camera: late start, two moves, wiggle, retarget | the camera thread ("Find why camera fixes keep failing") |
| iPhone landscape decks, short-landscape card sizing | the "Fix iPhone landscape deck issues" thread |
| Lymph, Disse, overflow, ascites formation | the "Fix the hepatic lymph model" thread |
| Station labels that change between loads | the "Fix Anatomy labels changing between loads" thread |
| Cards left behind between slides | the "Fix deck card hand-off leftovers" thread |
| CSPH verdicts for congestion patients | the "Fix CSPH verdicts in congestion cases" thread |
| Everything else | a Sonnet fixer thread (medium or high), one per area |

---

## 2. What the app has

### 2.1 Decks: 41 talks, 569 slides

Counts include the outline slide every deck opens with and the quick check most end with. "Features" lists what each deck exercises beyond words and tiles. The deck id opens it directly: `?script=<id>&slide=<n>`.

The decks are split into four groups of about 140 slides. Every per-deck tester below works on a group.

**Group 1, the core teaching path (138 slides)**

| Deck id | Title | Slides | Features |
|---|---|---|---|
| circulation | The portal circulation | 11 | scale pill (Anatomy, Lobule, Sinusoid), fluid tool, flows, origin lens |
| circuit | Portal pressure as a circuit | 12 | Circuit view, 2 lapses, compare, circuit regions |
| sites | Sites and causes | 14 | 7 patients, ladders grid, table, 3 scale pills, 6 case cards, question |
| hvpg | Measuring HVPG and PPG | 15 | 5 catheter slides (route, free, wedge, result), HVPG tracing |
| doppler | Doppler of the portal system | 14 | Doppler tool on 7 patients, velocity and direction lenses, lapse |
| stiffness | Stiffness and the first visit | 18 | FibroScan, criteria, 9 case cards, spleen |
| varices | Collaterals and varices | 11 | varix wall, flow lens, HVPG, lapse |
| variceal-bleed | Acute variceal bleeding | 19 | rupture, transfusion, banding, TIPS sub-steps (slide 10), vitals monitor, 2 questions |
| ascites | Ascites and its treatment | 24 | sinusoid and lobule cams, walls visual, SAAG, paracentesis 6.5 L, 3 lapses, lymph |

**Group 2 (145 slides)**

| Deck id | Title | Slides | Features |
|---|---|---|---|
| encephalopathy | Encephalopathy and shunting | 15 | first-pass lens, scale pill, event graph |
| next-bleed | Preventing the next bleed | 12 | banding course, 2 lapses |
| two-inflows | Dual hepatic blood supply | 12 | origin lens, 3 compares, scale pill |
| hyperdynamic | The circulation in cirrhosis | 12 | hemorrhage and transfusion, shift tool, lapse |
| prehepatic | Portal vein thrombosis | 20 | lumen, trace, catheter, 2 lapses, 2 compares |
| ncph | Presinusoidal PH | 14 | schisto and PSVD, catheter, FibroScan |
| outflow | Postsinusoidal and posthepatic | 12 | 5 patients, heat lens, catheter |
| lobule | Inside the lobule | 12 | lobule and sinusoid cams, oxygen lens, 2 scale pills |
| where-resistance | Where is the resistance? | 13 | 8 compare buttons, ladders, 6 case cards, 2 questions |
| endoscopy | The varix and insufflation | 9 | scope tool, air and red-wale compares |
| gastric-varices | Gastric varices | 14 | gastric rupture, BRTO and BATO, splenic cam |

**Group 3 (144 slides)**

| Deck id | Title | Slides | Features |
|---|---|---|---|
| recompensation | Decompensation and recovery | 15 | 3 lapses, since lens |
| pregnancy | Cirrhosis in pregnancy | 10 | pregnancy patient, banding |
| ten-years | One patient, ten years | 22 | 2 catheter slides, 2 lapses, every tool kind |
| kidney | The kidney in cirrhosis | 13 | paracentesis with albumin, hemorrhage, trial card |
| carvedilol | Carvedilol, start to stopping | 16 | 3 lapses, HVPG response, vitals |
| albumin | Albumin: when to give it | 14 | trial card, abdomen, vitals |
| budd-chiari | Budd–Chiari syndrome | 14 | DIPS cam, lumen, 2 lapses |
| masld | MASLD and portal hypertension | 13 | MASLD patient, weight-loss lapse |
| treatment | Lowering portal pressure | 13 | 3 compares, since lens, question |
| choose-treatment | Choose the treatment | 14 | 4 lapses, 5 case cards, fluid tool |

**Group 4 (142 slides)**

| Deck id | Title | Slides | Features |
|---|---|---|---|
| cause-treated | Treating the cause | 16 | 5 lapses, all-patients visual |
| shunts | TIPS and shunts | 16 | procedure plays, Doppler, event graph, menu tool |
| tips-doppler | Doppler after TIPS | 13 | stent gates, 4 compares |
| meso-rex | Pediatric PVT: Meso-Rex bypass | 12 | Rex bypass, 2 compares |
| tipping | Precipitants of decompensation | 12 | 2 lapses, vitals |
| day | A day in the portal vein | 8 | meal lapse on the bedside clock, Doppler recording |
| landmark-trials | Landmark trials replayed | 17 | 6 compares, forest plot, trial and course tools, catheter |
| gradients | HVPG, PPG and EUS-PPG compared | 14 | 6 patients, catheter, 5 case cards |
| same-gradient | Same gradient, different patient | 9 | ladders, 4 case cards |
| two-lesions | Two lesions, one circulation | 11 | 4 lapses, fluid retained and removed |
| tips-candidacy | Who should get a TIPS | 14 | 7 case cards, trial card |

The preview also lists a test deck, "Demo: all the new visuals" (`test-demo-all-new-visuals`, 73 slides, preview only). It is optional and last in priority.

Slide kinds a tester will meet: outline, words and tiles, data card with a tool (Pressure profile, Doppler, Scope, FibroScan, HVPG tracing, vitals monitor, trace, abdomen, wall, flows, fluid, criteria, path, curve, event graph, trial, forest, course, lumen, saag, shift, menu), visuals over a dimmed figure (ladders, table, scale, quadrant, walls, plane, all patients), case cards, question cards, compare buttons, the scale pill, time-lapses with a graph, catheter steps and the quick check.

Presenter controls: Next (Right, Space, Enter, Page Down), Back (Left, Page Up, Backspace), Home, End, digits then Enter to jump, G for the slide list, B or W or the period for a black screen, F for full screen, L for the laser, P for the presenter view (a second window), Esc (black screen first, then a zoomed card, then leave).

### 2.2 Free views

| View | What to exercise |
|---|---|
| Anatomy | lenses, labels Key, All or None, Blood menu (chevrons: all, key only; potential collaterals), zoom pill (in, out, fit), wheel zoom, drag, vessel tap, Details panel, Why? popover |
| Circuit | the same lenses, Rotate (upright), the circuit's resistors and sites |
| Lobule | Layers menu, zone bands, triad, central vein, wet Disse, lymph labels, zoom |
| Sinusoid | shown only from the Lobule; the sinusoidal wall and hepatic lymph formation |

Ten lenses: Pressure, Change, Congestion, Pressure drop, Flow volume, Velocity, Flow direction, Oxygen, Blood origin, First pass.

### 2.3 Patients: 19, plus your own

| Group | Patients (id) |
|---|---|
| Normal | Healthy (`healthy`), Postprandial (`postprandial`) |
| Pre-hepatic | Acute PVT (`pvt-acute`), Chronic PVT with cavernous transformation (`pvt-chronic`), Splenic vein thrombosis (`svt`) |
| Presinusoidal | Schistosomiasis or NCPH (`schisto`), Porto-sinusoidal vascular disorder (`psvd`) |
| Sinusoidal | Compensated cirrhosis (`cirr-comp`), CSPH (`csph`), MASLD cirrhosis where HVPG underestimates (`masld-csph`), Decompensated cirrhosis (`cirr-decomp`), Cirrhosis with reversed portal flow (`cirr-hepatofugal`), Cirrhosis with gastrorenal shunt (`gastric-varix`), Cirrhosis in pregnancy (`pregnancy`) |
| Postsinusoidal | Sinusoidal obstruction syndrome (`sos`) |
| Post-hepatic | Budd–Chiari (`budd-chiari`), IVC web (`ivc-web`) |
| Cardiac | Right heart failure with TR (`rhf`), Constrictive pericarditis (`constrictive`) |

"From readings" (Work backward) builds a patient from readings, and those are saved under "Yours" on this device only. `?preset=<id>` opens a patient directly.

### 2.4 Treat

- **Drugs:** Propranolol, Carvedilol, Terlipressin, Octreotide, Anticoagulation, Diuretics.
- **Fluids:** 1 L crystalloid, 1 unit PRBC, Albumin.
- **Procedures:** Band (EVL), Balloon tamponade (gastric first, esophageal second in the varices card), TIPS, DIPS, Distal splenorenal shunt (DSRS), Portocaval end-to-side, Portocaval side-to-side, Mesocaval shunt, Meso-Rex bypass, BRTO, Splenic embolization, Splenectomy, Paracentesis. BATO is reached from the gastric varices card and the decks.

### 2.5 Tests (the dock)

Pressure (with its Over time switch), HVPG (the catheter procedure), Doppler, Endoscopy (short name Scope, with the Wall mechanics tab and the insufflation control), Ascites (paracentesis, diuretics, serum albumin), FibroScan (Liver and Spleen), Readouts (every tile, with Why?), Trials (the landmark trials against this patient).

### 2.6 Everything else

- **Top bar:** Menu (Present by topic, Patients by site, one search, Copy link, Help), Treat, Tests, History, Settings, Search (Ctrl K or Cmd K).
- **Timeline:** play, speed, jump ahead, History count, Compare from here.
- **Compare:** freezes a moment; the figure switches between then, now and the change, and the readouts say "vs then".
- **Settings:** Send feedback; Appearance (Light, Soft, Dark, Navy, Black, System); Display (Blur effect, Figure size, Sharp while moving, Keyboard shortcuts); Diagnostics (Show frame rate, Show frame breakdown); Model (About the model, Advanced physiology, References); Help, Guide, Privacy, History; Reset everything.
- **Links:** `#s=` share links, `?script=`, `?slide=`, `?preset=`, `?home=present`, `?home=explore`, `?embed`, the resume point ("Resume 7 / 12"), the printed handout.
- **Tester guides:** `/preview/guides/beta-start-guide.pdf` and `beta-start-guide-iphone.pdf`, whose Settings pictures must match the sheet.

### 2.7 Sizes

| Device | Portrait | Landscape | Layout it gets |
|---|---|---|---|
| iPhone (390 wide) | 390×844 | 844×390 | phone sheet; short landscape docks right |
| iPhone Pro Max | 430×932 | 932×430 | same |
| iPhone SE | 375×667 | 667×375 | the smallest common phone |
| iPad (10th gen, Air) | 820×1180 | 1180×820 | portrait takes the phone layout (up to 1100 wide in portrait); landscape takes the wide layout |
| iPad Pro 13 | 1024×1366 | 1366×1024 | spot checks only |
| Mac | | 1440×900 | the default desktop |
| Mac, full screen | | 1913×1188 | Mohammad's own screen |
| Projector | | 1920×1080 | presenting |

Layout breakpoints in the CSS: 767/768 wide, 1023/1024 wide with height 500 or less in landscape, 1100/1101 wide in portrait, and 359 wide for the smallest phones.

---

## 3. What today covered, and what is still open

Covered today, so testers build on it rather than repeat it:

- Clinical content per patient, treatments and time-lapses, instruments and Tests tabs, and the five looks, all on the desktop.
- Deck content, read on the desktop for about 24 decks (circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites, encephalopathy, choose-treatment, hyperdynamic, masld, cause-treated and prehepatic among them). Motion checks in those runs were weak because the pane was hidden for much of the time.
- Not read at all: two-inflows, tips-doppler, meso-rex, tipping, day, landmark-trials, gradients, same-gradient, two-lesions, tips-candidacy, and slides 1 to 8 of next-bleed.
- iPhone landscape: 3 decks (circulation, circuit, variceal-bleed), at 844×390 and 932×430.
- Camera gate: 4 decks (sites, carvedilol, circulation, variceal-bleed), with a hidden pane, so the late starts it found need a clean rerun.

Open, with fixes in flight (testers report a new kind of problem in these areas, not repeats):

- **Short-landscape card sizing.** The card stack is taller than a 390 px screen: chart cards cut at the bottom, the nav pill over the figure.
- **Camera late starts** on slides that change the patient, use the catheter, or open with a case card. A fix is due on the preview; the camera gate testers wait for its commit.
- **The lymph model** was rewritten at 3b46bb41 (lymph rises with sinusoidal pressure up to the lymphatics' capacity, and ascites is the overflow). Its fixer thread is still working.
- **Today's content findings**, which T04 re-checks: MAP beside a BP 1 to 4 mmHg below (SBP + 2×DBP) ÷ 3; "she" for the 54-year-old man in variceal-bleed slide 5; platelets 90,000 against 160,000 for one woman in stiffness slides 5 and 8; treating-the-cause slide 13 against slide 12 (HVPG 10.3); PPG "27" against 28.0 in prehepatic slide 20; "higher than typical" in prehepatic slide 12; the platelet dip in the masld slide 7 lapse; the update and feedback toasts over slide text; the carvedilol slide 5 tracing header showing "HVPG FALL 35 %" mid-change.

---

## 4. The rules every tester judges against

These are Mohammad's standing rules. A tester fails a slide or a screen on any of them.

| # | Rule | Pass | Fail |
|---|---|---|---|
| R1 | Nothing pops in or out | every card, control, label, number, vessel, clot and collateral fades in and out over several frames | anything that is fully there in one frame and absent in the one before (or after), including a card's contents swapping in place |
| R2 | Labels fade between spots and never slide | a label that moves fades out at the old spot and in at the new one; leader lines do the same | a label seen part-way between two spots, a leader that stretches across the figure |
| R3 | Every slide camera move is one straight glide that starts with the press | one move per press, on a straight line, zoom only one way, landing once; motion within about 120 ms of the press | a pause then a move, two moves, a wiggle, a swoop, an overshoot and settle, a zoom that turns back, a second move after landing |
| R4 | Numbers match, with one rounding | the same quantity reads the same on the figure, the tiles, the data card, the chart header, the slide text, case cards, tables, Tests tabs, Readouts and History, with the same number of decimals | 4.2 beside 4.3, 10.3 beside 10, a BP whose parts disagree between two places, a count in the text that the deck's own slides contradict |
| R5 | Baveno VIII only, never VII; AASLD citations are fine | | any "Baveno VII", or a rule or cut-off that is not Baveno VIII or AASLD |
| R6 | Clinical text is for US physicians | US spelling (hemorrhage, esophageal, anemia), US units (mg/dL, g/dL, mmHg, kPa, cm/s, ×10³/µL or /µL), US drug names and practice, one patient keeps one age, sex and set of labs through a deck | British spelling, SI-only units, a drug name not used in the US, a pronoun or lab that changes for the same patient |
| R7 | It fits | nothing cut off, no text off screen, no card over another card's words or over a control, the nav pill clear of content | any of those at a size the app supports |
| R8 | No errors | no console errors, nothing new in `pps.caught()`, no lost WebGL context | any of those |

Two more facts to judge against: the pressure cut-offs live once in `src/engine/pressure-cuts.js` (HVPG amber from 5, red from 10; PPG amber from 6, red from 12), and every colour for them is the `--ok`, `--caution` and `--danger` tokens. A tile coloured against those cut-offs is a finding.

Not tested: Reduce Motion (Mohammad, standing rule).

Judge numbers after the slide settles. During a time-lapse, numbers move on purpose; report only fixed words that contradict the live number on screen (an S3).

---

## 5. Setup

### 5.1 Browser

- Use the Claude desktop app's built-in browser on Mohammad's Mac (load the built-in-browser skill first). Not Claude in Chrome. Do not ask Mohammad to press shortcuts.
- Open your own tab once (`preview_start` with the URL) and pass its `tabId` to every call. Never close or switch another tester's tab.
- Load the toolkit (`docs/play-test-toolkit.md`) with the JavaScript tool. Fetch it from `https://raw.githubusercontent.com/qaddodi/portal-pressure-simulator/claude/project-thread-ltazxh/docs/play-test-toolkit.md` and run the code block.

### 5.2 Lanes

- **V lane (visible pane).** Before each deck, run `await PT.fps()`. 50 or more means your tab is showing; below that, stop motion and timing work, post "pane hidden, motion paused", and carry on with whatever needs no motion.
- **B lane (background).** Your tab may be behind the V tester's. Run `await PT.fps()` first: 5 or more is enough for settled reads (allow up to 60 s a slide); 0 means the page is frozen, so tell the coordinator and wait. Never report a pop, a glide or a timing from the B lane. Take a screenshot only for a finding.

### 5.3 Sizes

Use `PT.frame(W, H)` on `preview-info.txt` for every size (section 2.7). It holds the size steady, which the pane's own resizing did not today. Say the size in every finding. Touch, pixel density and safe areas are not emulated, so a finding near a screen edge on a phone size gets "edge: not emulated" in its note.

### 5.4 Looks

Each tester has a look (section 9) so that, across the plan, every deck is seen in at least two looks. Set it with `PT.setLook('navy')` (or Settings, Appearance) and check it with `PT.look()` before each deck: testers share the browser's storage, so a partner's change shows up on your next reload. Set yours back if it changed.

### 5.5 Builds

Before each deck, `await PT.build()`. Name the commit in every finding. When "A new version of the simulator is ready" appears, finish the slide, reload, note the new build, and carry on. Findings from an older build are re-checked once on the new one before posting when that is quick.

---

## 6. What to measure

| Tool | How | Use for |
|---|---|---|
| Camera gate | `await PT.gate('sites')` (wraps `pps.cameraGate({ decks })`), one deck at a time | R3: every slide move, Next and Back, judged from the device's own frames. A failing line names the move, the reason (for example "starts 1,344 ms after the press") and, for a late start, the steps that held it. Paste the line as it is |
| `?perf` | `PT.frame(1440, 900, '?perf')`, then the readout's Copy button | frames over 50 ms with their surfaces and phase, the slowest inputs, p50/p95/p99 frame intervals, the slow slide steps |
| `?offgpu=1` | `PT.frame(W, H, '?offgpu=1')`, then `PT.offgpu()` | work off the GPU while something moves: canvas 2D, SVG, layout reads (getBoundingClientRect, getComputedStyle, offset*, client*), texture uploads, shader compiles. The overlay flashes red when any of it happens in motion; `inMotion`, `redFrames` and `sites` name the cause |
| DOM pop watch | `await PT.step('ArrowRight')` | R1 for DOM parts: lists every card or control that went from nothing to full opacity, or back, in one frame |
| Layout walk | `await PT.walk('sites')` | R7: lists slides with text off screen, text cut by its box, ellipses, overlapping cards, and the app's own clipped-card list (`pps.presenter.degraded().clipped`) |
| Numbers | `PT.numbers()` | R4: the slide's words, its tiles and the model's own values for the slide (`pps.presenter.probe()`), with near misses such as "4.2 vs 4.3" |
| Errors | `PT.errors()` | R8: page errors since the toolkit loaded, the app's counted errors (`pps.caught()`) and the device report ring (`pps.report()`) |
| Frame rate | `await PT.fps()` or Settings, Show frame rate | whether the pane is showing; whether a view runs at the screen's rate |
| Device lap | `PT.frame(1440, 900, '?lap')` | a fixed 90-second route that writes one block to paste: frames, surfaces, phases and heat (optional, T02 and T17) |

The DOM pop watch and the layout walk read styles and boxes themselves, so never run them while measuring `?perf` or the camera gate.

---

## 7. Severity guide

| Severity | Meaning | Examples |
|---|---|---|
| **S1 Blocker** | stops a talk, or teaches the wrong medicine | crash or reload, blank figure, a deck that will not open or advance, "Baveno VII", a wrong cut-off, a number that makes the slide's teaching point wrong, the teaching text cut off at the Mac or projector size |
| **S2 High** | the audience sees it | a card or label that pops, a camera move that is not one glide or that starts late (any camera gate fail), a label that slides, a card clipped or covering another at a supported size, numbers that disagree beyond rounding, a control that does nothing, a toast over slide text, a patient whose sex or labs change within a deck |
| **S3 Medium** | noticeable, does not mislead | a rounding mismatch (4.2 against 4.3), a small overlap that hides no meaning, wording that is not US usage, repeated frames over 50 ms in one place, fixed words that contradict a live number during a lapse |
| **S4 Low** | cosmetic | spacing, alignment, typos, the preview badge over a kicker (preview only) |

Add **unconfirmed** when the pane was hidden, the build changed mid-check, or a second try did not reproduce it.

---

## 8. How to report a finding

One post per finding, the moment it is found, with a screenshot attached. No batching and no progress-only posts.

```
S2 · R1 pop-in · varices 6/11 · 1440×900 · Navy · build 3b46bb41
What: the "Gut to heart" card's bracket appears at full opacity in one frame after Next.
Repro: ?script=varices&slide=5, press Next.
Expected: it fades in with the card.
Measured: PT.step → "412 ms IN .pz-tool "PPG 15.3"".
Screenshot attached.
```

At the end, post one ranked list of everything found (most severe first, one line each with its repro) and one coverage line: which decks, slides, sizes and looks were done, and which were not.

**When context runs low:** post the ranked list and the coverage line with the exact next slide ("stopped at gastric-varices 9/14 in 820×1180"), and stop. The coordinator starts a continuation from there with the same brief.

---

## 9. The 18 testers

Effort: **medium** for testers that mostly run the toolkit and confirm its suspects, **high** for testers that judge motion by eye or judge clinical content.

### T01 · Read the decks nobody has read (content and numbers)

- **Lane B · Sonnet high · 1440×900 · Light**
- **Scope:** two-inflows (12), tips-doppler (13), meso-rex (12), tipping (12), day (8), landmark-trials (17), gradients (14), same-gradient (9), two-lesions (11), tips-candidacy (14), next-bleed (12, all of it). 134 slides.
- **Script, per deck:**
  1. `await PT.open('<id>')`, then for each slide `await PT.go(n)`.
  2. Read the kicker, title, line, case card, question, data card, table and teaching card (`get_page_text` or `PT.numbers().words`). With a case card up, read it before tapping it away.
  3. `PT.numbers()`: every number in the words must match a tile or the model's value with the same rounding. Check every near miss by eye.
  4. Check the medicine: cut-offs, drug doses, trial results (landmark-trials and tips-candidacy against the trials they cite: who was enrolled, the effect, the follow-up), Baveno VIII and AASLD only, US usage.
  5. Check one patient stays one patient: age, sex, pronouns and labs across the deck.
  6. Answer the quick check and the question cards yourself; the shown answer must agree with the deck.
- **Pass:** R4, R5, R6 on every slide. R7 only when obvious.
- **Measure:** `PT.numbers()` near misses, `PT.errors()` at each deck's end.
- **Runs with:** T02 (its wave), or any V tester.
- **About 2 hours.**

### T02 · Free views, patients and lenses in motion

- **Lane V · Sonnet high · 1440×900 Dark, then 820×1180 Navy, then 390×844 Light**
- **Scope:** the four views, all 19 patients, ten lenses, labels, Blood, Layers, zoom and pan, Rotate, cards and sheets opening and closing.
- **Script, per size:**
  1. `PT.frame(W, H, '?offgpu=1')`, `await PT.fps()` (50 or more).
  2. View switches: Anatomy to Circuit, Circuit to Lobule, Lobule to Sinusoid, Sinusoid to Anatomy and every reverse, on Healthy, Decompensated cirrhosis, Budd–Chiari and Chronic PVT. Burst of 4 to 6 screenshots during each switch.
  3. Patients: step through all 19 in Anatomy in the menu's order and back. Clots, collaterals, ascites, organs and labels must fade, never pop. Watch the TIPS, banding and shunt states between patients that have and do not have them.
  4. Lenses: all ten in Anatomy and in Circuit (L cycles them). The key under the lens name must cross-fade.
  5. Labels Key, All and None; Blood menu (chevrons all, key only; potential collaterals); Lobule Layers; zoom in, out and Fit; wheel zoom and drag; Rotate in Circuit.
  6. Open and close Treat, Tests, History, Settings, the menu, Search, a vessel's Details and its Why? popover, each twice. On 390×844 and 820×1180 these are sheets: drag one up and down.
  7. `PT.offgpu()` after each block; any red frame gets its `sites`.
- **Pass:** R1, R2, R7, R8. No red off-GPU frame in motion. The figure keeps the screen's frame rate on the Mac.
- **Measure:** `PT.offgpu()`, `PT.step` for the cards, `PT.errors()`. Optional: one `?lap` run at 1440×900 at the end, pasted whole.
- **Runs with:** T01.
- **About 2 hours.**

### T03 · Camera gate, groups 1 and 2

- **Lane V · Sonnet medium · 1440×900 · Soft**
- **Depends on:** the camera thread's late-start fix being on the preview. Start when the coordinator passes its commit, and check `PT.build()` shows it.
- **Scope:** the 20 decks of groups 1 and 2, every move, Next and Back (283 slides, about 560 moves).
- **Script:**
  1. `PT.frame(1440, 900)` with no query (no `?perf`, no other snippet running).
  2. Per deck: `await PT.fps()` (50 or more, else wait and retry), then `await PT.gate('<id>')`.
  3. Post each failing move as its own finding, its gate line pasted as it is. Then open that slide (`PT.go(n)`), press the key yourself and take a screenshot mid-move for the post.
  4. A deck that does not open in a minute is an S1.
- **Pass:** every move passes. Any fail is an S2.
- **Measure:** the gate report.
- **Runs with:** T04 (its wave), or any B tester. Never beside another V tester.
- **About 1.5 hours.**

### T04 · Re-check today's fixes and the newest number changes

- **Lane B · Sonnet high · 1440×900 · Light**
- **Scope:** every open finding in section 3, on the newest build, plus three recent changes:
  - **MAP and BP** (001f646a lets a tile's systolic and diastolic follow its mean): every place a BP shows (tiles, vitals monitor, chart headers, slide text) in hyperdynamic 3, varices 6, variceal-bleed 4, 5, 7, 8, 11, 16 and 18, kidney 6, 8 and 9, carvedilol 9 and 10, albumin 9, 10, 12 and 13, treatment 4 and 7, gastric-varices 4. The same BP must read the same everywhere, and the mean in brackets must agree with its parts as the app defines it.
  - **Bedside numbers** (afac0bc0 brought deck numbers, labels and tables to the bedside state): the summary tables of sites, hvpg, ascites, where-resistance and gradients against the slides they summarize.
  - **CSPH verdicts for congestion** (fix in flight): what Readouts, the HVPG tab, the FibroScan card and the decks (outflow, where-resistance, gradients, hvpg) say about CSPH for Right heart failure, Constrictive pericarditis, Budd–Chiari, IVC web and SOS. One verdict per patient, on every surface.
- **Script:** for each item, open the slide by link, settle, read with `PT.numbers()`, post fixed or still open with a screenshot. Post "fixed" items together in one post at the end; post each still-open item on its own.
- **Pass:** R4, R5, R6.
- **Runs with:** T03.
- **About 1.5 hours.**

### T05 · Camera gate, groups 3 and 4

- **Lane V · Sonnet medium · 1440×900 · Soft**
- Same as T03 for the 21 decks of groups 3 and 4 (286 slides). Also run the gate on the Demo deck if time allows.
- **Runs with:** T06.
- **About 1.5 hours.**

### T06 · The lymph and fluid model

- **Lane B · Sonnet high · 1440×900 Dark, then 820×1180 Dark**
- **Depends on:** the "Fix the hepatic lymph model" thread having finished. Start on its final commit.
- **Scope:** every place the lymph and ascites appear: the Sinusoid view's lymph labels, the Lobule's wet Disse and lymph labels and the lobule card, Readouts' lymph and overflow tiles, the Ascites tab, the fluid card in circulation, choose-treatment and ascites, all 24 ascites slides, and the lymph lines in outflow, where-resistance and landmark-trials.
- **Script:**
  1. For all 19 patients, read lymph (mL/day), overflow and ascites on every surface above. Make a table: patient, sinusoidal pressure, lymph, overflow, ascites.
  2. Check the shape: lymph never below a healthy liver's; it rises with sinusoidal pressure (healthy < compensated cirrhosis < CSPH < decompensated); it levels off at the lymphatics' capacity (7.2 L/day healthy, up to 14.4 L/day); ascites forms only from the overflow; presinusoidal and pre-hepatic patients do not make liver lymph as cirrhosis does; post-sinusoidal and cardiac patients make protein-rich lymph.
  3. Treat: TIPS, paracentesis (the tense belly is about 6 L and the tap drains 6 L), albumin, diuretics. Each moves the numbers the right way and every surface agrees.
  4. Read the ascites deck against the model: "the portal-tract lymphatics carry many times their usual flow" must match the multiples the tiles show.
- **Pass:** R4 (one printed form: mL/day, rounded to 10, with a thousands comma, everywhere), R5, R6, the shape in step 2.
- **Runs with:** T05.
- **About 1.5 hours.**

### T07, T09, T11, T13 · Every deck in motion on the Mac, one group each

- **Lane V · Sonnet high · 1440×900, with `?perf`**
- **Looks:** T07 Light (group 1), T09 Dark (group 2), T11 Navy (group 3), T13 Black (group 4, then the Demo deck if time allows).
- **Script, per deck:**
  1. `PT.frame(1440, 900, '?perf')`, `await PT.fps()`, `await PT.open('<id>')`.
  2. Each slide: press the real Next key (the computer tool on the frame, or `PT.press()`). Take 2 screenshots during the change and 1 after it lands. On slides whose camera moves with station labels on the figure, take a burst of 4 to 6 instead (R2).
  3. Watch the first time-lapse in each deck play to its end without skipping: tiles and the graph ease, no dip against the direction of change, the words do not contradict the live number.
  4. Use every control the slide offers: compare buttons, the scale pill (each scale and back), lens buttons, variant toggles, a case card (read, then tap away), a question card (answer, then reveal), the quick check (tap each), a zoomable data card (tap to zoom, then back).
  5. Where the DOM part of a change looks abrupt, rerun that step with `PT.step()` and paste its lines. The pop watch costs frames, so frame times measured while it runs do not count.
  6. At the deck's end: Back through every slide at a presenter's pace, then one jump (G, then a slide far away), then End and Home.
  7. Copy `?perf`. Post one finding for the deck if any frame went over 50 ms during a slide change, with the pasted lines.
- **Pass:** R1, R2, R3 by eye, R7, R8. No frame over 50 ms during a slide change more than once per deck.
- **Measure:** screenshots, `PT.step()`, `?perf` Copy, `PT.errors()` per deck.
- **Runs with:** T07 with T08, T09 with T10, T11 with T12, T13 with T14.
- **About 2 hours each.** At about 2 screenshots a slide, a group fits one thread; if context runs low, hand off as section 8 says.

### T08 · iPad layout, every deck, both orientations

- **Lane B · Sonnet medium · 820×1180 Soft, then 1180×820 Dark**
- **Scope:** all 41 decks in each orientation (569 slides each).
- **Script, per orientation:**
  1. `PT.frame(820, 1180)` (then `PT.frame(1180, 820)`).
  2. Per deck: `await PT.walk('<id>')`. For each suspect it lists, open the slide, look, screenshot, and post it if it is real. Heuristics flag some things that are fine: an overlap inside a zoomed card, or a card meant to sit over a dimmed figure.
  3. Also take one screenshot of slide 2 of each deck and look at it: the walk cannot see the figure hidden behind a card, or a GPU label under a card.
- **Pass:** R7, R8. No slide where teaching text, a chart's axis or a table row is cut.
- **Measure:** `PT.walk` suspects, `PT.clipped()`, `PT.errors()`.
- **Runs with:** T07.
- **About 2 hours.**

### T10 · iPhone portrait layout, every deck

- **Lane B · Sonnet medium · 390×844 Dark, with spot checks at 375×667 and 430×932**
- **Scope:** all 41 decks at 390×844; group 1 again at 375×667 and 430×932.
- **Script:** as T08. Also on each data card with a tool: the tool folds behind its Show button on a phone; open it, and the tiles fold instead where the slide asks.
- **Pass:** R7, R8, and the phone rules: the slide text, the card and the nav are all reachable; nothing needs a horizontal scroll.
- **Runs with:** T09.
- **About 2 hours.**

### T12 · iPhone landscape layout, every deck

- **Lane B · Sonnet medium · 844×390 Light, then 932×430 and 667×375 on group 1**
- **Depends on:** the "Fix iPhone landscape deck issues" thread having pushed its card-sizing fix. Start on that commit.
- **Scope:** all 41 decks at 844×390, starting with the three already tested (circulation, circuit, variceal-bleed) to confirm the fix; then group 1 at 932×430 and 667×375.
- **Script:** as T08. If the known card-height cause is still there, post it once with the list of slides it hits, and post only new kinds of problems after that. Watch the variceal-bleed slide 10 sub-steps (camera framing at a short height) and the nav pill over the figure.
- **Pass:** R7, R8.
- **Runs with:** T11.
- **About 2 hours.**

### T14 · Everything outside the figure and the decks

- **Lane B · Sonnet high · 1440×900 Light, then 390×844 Soft**
- **Scope and script:**
  1. **Menu:** Present (the 11 core talks by topic, then More talks, then the test deck), Patients by site, one search across both, the preview beside a row (hover on the Mac, the ⓘ on a phone), Copy link, Help.
  2. **Search** (Ctrl K): "tips 8", "cirrhosis 60", "albumin 2.5", "+6 months", "narrow portal 80", a patient's name, a deck's name. Each lands in History.
  3. **From readings (Work backward):** enter readings step by step for three patients you know (a CSPH patient, a Budd–Chiari patient, a PVT patient), read the scenarios it offers, save one to Yours, reload, open it.
  4. **History:** every change and event listed; going back to one restores it; undo from a Treat chip.
  5. **Timeline and Compare:** play, speed, jump ahead; Compare from here, then change something; the figure's then, now and change; the readouts' "vs then"; unpin.
  6. **Details and Why?:** tap three vessels and two organs; the Why? popover's sentence, waterfall and formula agree with the tiles.
  7. **Settings:** every row. Appearance (six choices), Display (Blur effect, Figure size, Sharp while moving, Keyboard shortcuts), Diagnostics (frame rate, frame breakdown), Model (About the model, Advanced physiology, References), Help, Guide, the shortcuts sheet (?), Privacy. Send feedback opens a draft: read what it carries.
  8. **Links:** Copy link, open it in a new tab, the same patient, view and camera come back; `?script=sites&slide=5`; `?preset=budd-chiari`; `?preset=budd` (a toast and the patient list, never a wrong patient); `?home=present`; `?home=explore`; `?embed&script=hvpg&slide=5`.
  9. **Resume and handout:** leave a deck at slide 7, reopen the menu (Resume 7 / n), resume; open a deck's handout and read its layout.
  10. **Tester guides:** open both PDFs under `/preview/guides/` and compare their Settings pictures and rows with the sheet.
  11. **Last, and only after asking the coordinator that no other tester is running:** Reset everything, and check the app comes back clean.
- **Pass:** each control does what it says; R4, R6, R7, R8.
- **Runs with:** T13.
- **About 2 hours.**

### T15 · The slide camera by eye, and taking over mid-move

- **Lane V · Sonnet high · 1440×900 Navy, then 1180×820 Light**
- **Depends on:** the camera late-start fix (as T03).
- **Scope:** the slides with special moves: hvpg (catheter route, free, wedge, result), variceal-bleed 10 (TIPS sub-steps), shunts (procedure plays), lobule and ascites (lobule and sinusoid cams), circulation (the scale pill: Anatomy to Lobule to Sinusoid and back), circuit (circuit regions), sites (ladders and table), where-resistance (8 compare buttons), endoscopy (the gastroesophageal junction), budd-chiari (DIPS), two-inflows, and the patient-change, catheter and case-card slides the gate flagged.
- **Script:**
  1. Each move by eye: burst of 5 screenshots from the press to the landing. One glide, straight, starting with the press.
  2. Interruptions, each on 5 slides: Next twice fast; Next then Back mid-glide; a jump (digits then Enter) mid-glide; a drag and a wheel zoom mid-glide (the camera yields at once and never snaps back); Fit mid-glide; a zoomable card tapped mid-glide. On decks that keep a pinched view, the learner's view must stay through Next.
  3. Sinusoid to Anatomy, and every scale pill change, both ways.
  4. Run `PT.gate` on the same decks and compare its lines with what you saw.
- **Pass:** R2, R3. After any interruption, one clean move to where the last press asked, with no second move.
- **Measure:** screenshot bursts, `PT.gate`.
- **Runs with:** T16.
- **About 2 hours.**

### T16 · The five looks on phone and tablet, and the size edges

- **Lane B · Sonnet medium · 390×844 and 820×1180, every look**
- **Scope:** in each of Light, Soft, Dark, Navy, Black and System: each view, each Tests tab, the Treat card, History, Settings, and in the decks the outline slide, a table slide (sites, the summary), a chart slide (circulation 3), a case card (stiffness 5), a question card (where-resistance), a quick check (any deck's last slide), the vitals monitor (variceal-bleed 4) and the Doppler (doppler 3). Desktop looks were covered today.
- **Then the edges, in Light:** 767×900 and 768×900; 1023×500 and 1024×500; 1100×1300 and 1101×1300; 359×740. The layout must switch cleanly at each edge, with no half-state.
- **Pass:** text readable in every look; pressure colours from the `--ok`, `--caution` and `--danger` tokens only; nothing left in another look's colours (a light card in Black, a dark chart in Light); R7.
- **Runs with:** T15.
- **About 1.5 hours.**

### T17 · Presenting on the big screen

- **Lane V · Sonnet high · 1920×1080 Light, then 1913×1188 Black, with `?perf`**
- **Scope:** the 11 core decks (circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites, encephalopathy, next-bleed), presented as Mohammad presents them, and every presenter control.
- **Script:**
  1. Present from the menu; F for full screen; Next and Back with the keys; digits then Enter; G and a pick from the list; Home and End; B for black and back; L for the laser; Esc in order (black first, then a zoomed card, then leave).
  2. P opens the presenter view: Next and Back from that window move the talk; its notes and slide number match the talk; closing it leaves the talk alone.
  3. Leave the talk: the free view comes back with the cards that were open before.
  4. Toasts while presenting: wait out a few minutes on one slide. The update toast and the feedback prompt must never cover slide text.
  5. Then `PT.walk` on all 41 decks at 1920×1080 (the walk is quick) and post its real suspects.
  6. Copy `?perf` after each core deck; full screen draws the biggest canvas, so frame times matter most here.
- **Pass:** R1 to R8; every key does what section 2.1 says.
- **Runs with:** T18.
- **About 2 hours.**

### T18 · Tests and Treat on phone and tablet, and one number everywhere

- **Lane B · Sonnet high · 390×844, 844×390 and 820×1180**
- **Scope:** every Tests tab and every Treat order (section 2.4 and 2.5) at these sizes, on Healthy, CSPH, Decompensated cirrhosis, Cirrhosis with gastrorenal shunt, Chronic PVT and Budd–Chiari. The desktop was covered today.
- **Script:**
  1. Each tab: open, read, use its controls (the Over time switch, the HVPG procedure, the Doppler past "Acquiring…", the scope's insufflation and the Wall mechanics tab, paracentesis, Liver and Spleen in FibroScan, a Why? in Readouts, a trial in Trials). The sheet opens, drags and closes cleanly; nothing is cut.
  2. Each Treat order on a patient it fits: it says what it did, the figure shows it, History lists it, its chip undoes it. A procedure that does not fit (Meso-Rex without a clotted trunk, BRTO without a gastrorenal shunt) says why.
  3. One number everywhere, for all 19 patients at 820×1180: portal pressure, HVPG, PPG, portal flow, PV velocity, LSM and ascites on the bottom bar, Readouts, the Pressure tab, the HVPG tab, the Doppler, FibroScan, the figure's labels and History. Make the table; flag any cell that differs.
- **Pass:** R4, R7, R8; every order works and can be undone.
- **Runs with:** T17.
- **About 2 hours.**

---

## 10. Run order

| Wave | V lane (visible pane) | B lane (background) | Start when |
|---|---|---|---|
| 1 | T02 Free views in motion | T01 Read the unread decks | now |
| 2 | T03 Camera gate, groups 1 and 2 | T04 Re-check today's fixes | the camera late-start fix is on the preview |
| 3 | T05 Camera gate, groups 3 and 4 | T06 Lymph and fluid model | wave 2 is done and the lymph fix has landed |
| 4 | T07 Decks in motion, group 1 (Light) | T08 iPad layout, both orientations | wave 3 is done |
| 5 | T09 Decks in motion, group 2 (Dark) | T10 iPhone portrait layout | wave 4 is done |
| 6 | T11 Decks in motion, group 3 (Navy) | T12 iPhone landscape layout | wave 5 is done and the landscape fix has landed |
| 7 | T13 Decks in motion, group 4 (Black) | T14 Outside the figure and decks | wave 6 is done |
| 8 | T15 Camera by eye and takeovers | T16 Looks on phone and tablet, size edges | wave 7 is done |
| 9 | T17 Presenting on the big screen | T18 Tests and Treat on small screens | wave 8 is done |

Rules for changing the order:

- Any B tester can pair with any V tester. Two V testers never run together.
- If a fix a wave waits on is late, swap that wave with the next one that waits on nothing (waves 4, 5, 7 and 9 wait on nothing).
- T14 runs Reset everything only when it is the last tester running.
- After a large fix lands (the camera rewrite, the lymph model), rerun the gate tester for the decks it touches before the motion testers reach them.

---

## 11. Coverage matrix

Which tester covers each area at each size (today's coverage in brackets).

| Area | Mac 1440×900 | Mac full screen, projector | iPad landscape 1180×820 | iPad portrait 820×1180 | iPhone portrait 390×844 | iPhone landscape 844×390 |
|---|---|---|---|---|---|---|
| Decks, group 1: content | (today), T04 | | | | | |
| Decks, group 1: motion | T07 | T17 (core decks) | T15 (special moves) | | | |
| Decks, group 1: camera gate | T03 | | | | | |
| Decks, group 1: layout | T07 | T17 | T08 | T08 | T10 (+375×667, 430×932) | T12 (+932×430, 667×375), (today, 3 decks) |
| Decks, groups 2 to 4: content | (today), T01, T04 | | | | | |
| Decks, groups 2 to 4: motion | T09, T11, T13 | T17 (encephalopathy, next-bleed) | T15 (special moves) | | | |
| Decks, groups 2 to 4: camera gate | T05 (and T03 for group 2) | | | | | |
| Decks, groups 2 to 4: layout | T09, T11, T13 | T17 | T08 | T08 | T10 | T12 |
| Free views, patients, lenses | (today), T02 | | | T02 | T02 | |
| Tests tabs | (today) | | | T18 | T18 | T18 |
| Treat orders | (today) | | | T18 | T18 | T18 |
| Numbers across surfaces | T04 | | | T18 | | |
| Lymph and fluid | T06 | | | T06 | | |
| Menu, Search, From readings, History, Compare, Settings, links | (today, part), T14 | | | | T14 | |
| Presenter controls and presenter view | | T17 | | | | |
| Looks | (today), T02, T07, T09, T11, T13 | T17 | T08 | T16, T02, T08 | T16, T10 | T12 |
| Breakpoint edges | T16 | | | | | |

Each deck is seen in motion in one look on the Mac and in layout in four more sizes, each in its own look, so every deck meets at least three of the five looks.

---

## 12. Ready-to-paste briefs

Paste the shared opening, then the tester's own brief. Fill in the commit where it says `<commit>`.

### 12.1 Shared opening (paste first, for every tester)

```
You are a play-tester for the Portal Pressure Simulator, a portal hypertension teaching app that Mohammad, a hepatologist, presents to US physicians. This is read-only: make no code changes and push nothing.

Browser: use the Claude desktop app's built-in browser on Mohammad's Mac (load the built-in-browser skill first), not Claude in Chrome. Do not ask Mohammad to press shortcuts. Open your own tab once with preview_start and pass its tabId to every call. Never close or switch another tester's tab.

Plan and tools: the full plan is https://raw.githubusercontent.com/qaddodi/portal-pressure-simulator/claude/project-thread-ltazxh/docs/play-test-plan.md (read sections 4 to 8 before you start). Load the toolkit: fetch https://raw.githubusercontent.com/qaddodi/portal-pressure-simulator/claude/project-thread-ltazxh/docs/play-test-toolkit.md and run its code block with the JavaScript tool on https://qaddodi.github.io/portal-pressure-simulator/preview/preview-info.txt, then call PT.frame(W, H) for your size. PT.help() lists the helpers.

Your lane: V means you own the visible pane, so run `await PT.fps()` before each deck and do motion and timing checks only at 50 fps or more. B means your tab may be behind another tester's: run `await PT.fps()` first (5 or more is enough for settled reads, 0 means stop and tell the coordinator), and never report a pop, a glide or a timing.

Build: run `await PT.build()` before each deck and name the commit in every finding. When "A new version of the simulator is ready" appears, finish the slide, reload, note the new build and carry on.

Mohammad's rules, which you judge against:
- Nothing pops in or out. Labels fade between spots and never slide.
- Every slide camera move is one straight glide that starts with the press.
- Numbers match across the figure, tiles, card and slide text, with one rounding.
- Baveno VIII only, never VII. AASLD citations are fine.
- Clinical text is for US physicians.
- No Reduce Motion testing.

Report every finding the moment you find it, one post each, with a screenshot attached, in this form:
"S2 · R1 pop-in · varices 6/11 · 1440×900 · Navy · build <commit>", then What, Repro (one line, a ?script=...&slide=... link where it helps), Expected, Measured, and the screenshot.
Severity: S1 stops a talk or teaches wrong medicine; S2 the audience sees it; S3 noticeable but not misleading; S4 cosmetic. Add "unconfirmed" when the pane was hidden or a retry did not reproduce it. No progress-only posts.
At the end, post a ranked list (one line each with its repro) and one coverage line saying what you did and did not cover. If your context runs low, post those two with the exact next slide and stop, so a continuation can pick up.
```

### 12.2 T01 · Read the decks nobody has read

```
You are T01, lane B, at 1440×900 in the Light look (PT.setLook('light')).
Read these decks slide by slide for content and numbers: two-inflows, tips-doppler, meso-rex, tipping, day, landmark-trials, gradients, same-gradient, two-lesions, tips-candidacy, and all of next-bleed. 134 slides.
For each deck: await PT.open('<id>'), then await PT.go(n) for each slide. Read every word on the slide, including the case card (before you tap it away), the question, the data card, the table and the teaching card. Run PT.numbers(): every number in the words must match a tile or the model value with the same rounding; check each near miss by eye.
Check the medicine: cut-offs, doses, and the trials that landmark-trials and tips-candidacy cite (who was enrolled, the effect, the follow-up). Baveno VIII and AASLD only. US spelling, units and drug names. One patient keeps one age, sex, set of pronouns and labs through a deck. Answer each question and quick check yourself and check the deck's answer agrees.
Run PT.errors() at the end of each deck.
```

### 12.3 T02 · Free views, patients and lenses in motion

```
You are T02, lane V. Sizes and looks, in order: 1440×900 Dark, then 820×1180 Navy, then 390×844 Light. Use PT.frame(W, H, '?offgpu=1') for each.
At each size:
1. View switches: Anatomy to Circuit, Circuit to Lobule, Lobule to Sinusoid, Sinusoid to Anatomy, and every reverse, on Healthy, Decompensated cirrhosis, Budd–Chiari and Chronic PVT. Take a burst of 4 to 6 screenshots during each switch. Nothing may pop; labels fade and never slide.
2. Step through all 19 patients in Anatomy in the menu's order and back. Clots, collaterals, ascites, organs, devices and labels must fade, never pop.
3. All ten lenses in Anatomy and in Circuit. The key under the lens name must cross-fade.
4. Labels Key, All and None; the Blood menu; the Lobule's Layers; zoom in, out and Fit; wheel zoom and drag; Rotate in Circuit.
5. Open and close Treat, Tests, History, Settings, the menu, Search, a vessel's Details and its Why? popover, twice each; on the two smaller sizes drag the sheets up and down. Use PT.step() where a card looks abrupt.
6. After each block run PT.offgpu(); any red frame in motion is a finding with its sites.
Finish with PT.errors(). If time allows, one ?lap run at 1440×900, pasted whole.
```

### 12.4 T03 · Camera gate, groups 1 and 2

```
You are T03, lane V, at 1440×900 in the Soft look. Run only when the coordinator has given you the camera fix's commit, and check PT.build() shows it (<commit>).
Use PT.frame(1440, 900) with no query, and run no other snippet while the gate runs.
Decks, one at a time: circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites, encephalopathy, next-bleed, two-inflows, hyperdynamic, prehepatic, ncph, outflow, lobule, where-resistance, endoscopy, gastric-varices.
For each: await PT.fps() (50 or more, else wait and retry), then await PT.gate('<id>'). Post each failing move as its own S2 finding with its gate line pasted exactly. Then open that slide, press the key yourself and screenshot mid-move for the post. A deck that does not open within a minute is an S1.
```

### 12.5 T04 · Re-check today's fixes and the newest number changes

```
You are T04, lane B, at 1440×900 in the Light look.
Re-check each item on the newest build and post it as fixed or still open, with a screenshot:
- MAP beside a BP 1 to 4 mmHg below (SBP + 2×DBP) ÷ 3, and BP parts that differ between places: hyperdynamic 3; varices 6; variceal-bleed 4, 5, 7, 8, 11, 16, 18; kidney 6, 8, 9; carvedilol 9, 10; albumin 9, 10, 12, 13; treatment 4, 7; gastric-varices 4. Read every place the BP shows on each slide (tiles, vitals monitor, chart header, text).
- variceal-bleed 5 says "she" for the 54-year-old man.
- stiffness 5 (platelets 90,000) against 8 and 9 (160,000) for the same woman.
- cause-treated 13 against 12 (HVPG 10.3).
- prehepatic 20 says PPG "27"; slides 4 and 18 say 28.0. prehepatic 12 says "higher than typical".
- masld 7: the platelet tile dips from 160 to about 142 before rising to 175 during the lapse (watch it play, PT.settle({ skip: false })).
- carvedilol 5: the tracing header briefly reads "HVPG FALL 35 %" with overlapping BP text.
- The update toast and the feedback prompt over slide text (wait a few minutes on masld 9).
- The summary tables of sites, hvpg, ascites, where-resistance and gradients against the slides they summarize.
- CSPH verdicts for Right heart failure, Constrictive pericarditis, Budd–Chiari, IVC web and SOS: what Readouts, the HVPG tab, the FibroScan card and the decks outflow, where-resistance, gradients and hvpg say. One verdict per patient on every surface.
Post the fixed items together in one post at the end; post each still-open item on its own.
```

### 12.6 T05 · Camera gate, groups 3 and 4

```
You are T05, lane V, at 1440×900 in the Soft look. Same method as T03 (PT.frame(1440, 900), no query, nothing else running, PT.fps() then PT.gate('<id>') per deck), on the build the coordinator names (<commit>).
Decks: recompensation, pregnancy, ten-years, kidney, carvedilol, albumin, budd-chiari, masld, treatment, choose-treatment, cause-treated, shunts, tips-doppler, meso-rex, tipping, day, landmark-trials, gradients, same-gradient, two-lesions, tips-candidacy. Then, if time allows, test-demo-all-new-visuals.
Post each failing move as its own S2 with its gate line pasted exactly and a mid-move screenshot.
```

### 12.7 T06 · The lymph and fluid model

```
You are T06, lane B, at 1440×900 then 820×1180, in the Dark look. Start on the lymph fix's final commit (<commit>).
1. For all 19 patients, read lymph (mL/day), overflow and ascites in the Sinusoid view's labels, the Lobule's labels and card, Readouts, and the Ascites tab. Post one table: patient, sinusoidal pressure, lymph, overflow, ascites. Every surface must print the same value: mL/day, rounded to 10, with a thousands comma.
2. Check the shape: never below a healthy liver; rising with sinusoidal pressure (healthy < compensated < CSPH < decompensated); levelling off at the lymphatics' capacity (7.2 L/day healthy, up to 14.4 L/day); ascites only from the overflow; pre-hepatic and presinusoidal patients not making liver lymph as cirrhosis does; post-sinusoidal and cardiac patients making protein-rich lymph.
3. Treat a decompensated patient with TIPS, paracentesis (the tense belly is about 6 L; the tap drains 6 L), albumin and diuretics; each must move the numbers the right way on every surface.
4. Read all 24 ascites slides, the fluid card in circulation and choose-treatment, and the lymph lines in outflow, where-resistance and landmark-trials against the model ("many times their usual flow" must match the multiples shown).
```

### 12.8 T07, T09, T11, T13 · Every deck in motion on the Mac

```
You are T07 (group 1, Light) / T09 (group 2, Dark) / T11 (group 3, Navy) / T13 (group 4, Black, then test-demo-all-new-visuals if time allows). Lane V, at 1440×900 with PT.frame(1440, 900, '?perf').
Group 1: circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites.
Group 2: encephalopathy, next-bleed, two-inflows, hyperdynamic, prehepatic, ncph, outflow, lobule, where-resistance, endoscopy, gastric-varices.
Group 3: recompensation, pregnancy, ten-years, kidney, carvedilol, albumin, budd-chiari, masld, treatment, choose-treatment.
Group 4: cause-treated, shunts, tips-doppler, meso-rex, tipping, day, landmark-trials, gradients, same-gradient, two-lesions, tips-candidacy.
Per deck: await PT.fps(), await PT.open('<id>'). On each slide press the real Next key and take 2 screenshots during the change and 1 after it lands; where the camera moves with station labels on the figure, take a burst of 4 to 6 instead. Watch the deck's first time-lapse play to its end without skipping. Use every control the slide offers: compare buttons, the scale pill, lens buttons, variant toggles, the case card, the question card, the quick check, a zoomable data card. Where a DOM part looks abrupt, rerun that step with PT.step() and paste its lines (its frames do not count for ?perf). At the deck's end go Back through every slide at a presenter's pace, jump far with G, then End and Home. Copy ?perf and post one finding if any frame went over 50 ms during a slide change. Run PT.errors().
Report pops (R1), sliding labels (R2), camera moves that are not one straight glide from the press (R3), anything that does not fit (R7) and errors (R8).
```

### 12.9 T08 · iPad layout, every deck, both orientations

```
You are T08, lane B. First PT.frame(820, 1180) in the Soft look, then PT.frame(1180, 820) in the Dark look.
In each orientation, for all 41 decks (the list is in section 2.1 of the plan): await PT.walk('<id>'). For each suspect it lists, open that slide, look, screenshot, and post it if it is real (some flags are fine, such as an overlap inside a zoomed card). Also screenshot slide 2 of each deck and look at it, because the walk cannot see the figure hidden behind a card or a GPU label under a card.
Report R7 (cut, off screen, overlapping, covered) and R8 (errors).
```

### 12.10 T10 · iPhone portrait layout, every deck

```
You are T10, lane B, at PT.frame(390, 844) in the Dark look. Then group 1 (circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites) again at PT.frame(375, 667) and PT.frame(430, 932).
Same method as T08: PT.walk per deck, confirm each suspect with a screenshot, and screenshot slide 2 of each deck. On a data card with a tool, the tool folds behind its Show button on a phone: open it, and check the tiles fold instead where the slide asks. Nothing may need a horizontal scroll; the slide text, the card and the nav must all be reachable.
```

### 12.11 T12 · iPhone landscape layout, every deck

```
You are T12, lane B, at PT.frame(844, 390) in the Light look. Start on the landscape fix's commit (<commit>).
First re-walk circulation, circuit and variceal-bleed to confirm the fix, then walk the other 38 decks, then group 1 again at PT.frame(932, 430) and PT.frame(667, 375).
Same method as T08. If the known cause (the card stack taller than the screen: chart cards cut at the bottom, the nav pill over the figure) is still there, post it once with the list of slides it hits, then post only new kinds of problems. Watch the variceal-bleed slide 10 sub-steps for camera framing at the short height.
```

### 12.12 T14 · Everything outside the figure and the decks

```
You are T14, lane B, at 1440×900 in the Light look, then 390×844 in the Soft look.
At each size, test: the menu (Present by topic, More talks, the test deck; Patients by site; search across both; the preview beside a row; Copy link; Help); Search with Ctrl K ("tips 8", "cirrhosis 60", "albumin 2.5", "+6 months", "narrow portal 80", a patient, a deck); From readings for a CSPH, a Budd–Chiari and a PVT patient, saving one to Yours and reopening it after a reload; History (back to an entry, undo from a Treat chip); the timeline (play, speed, jump ahead) and Compare (from here, then, now, change, "vs then", unpin); Details and Why? on three vessels and two organs (the sentence, waterfall and formula agree with the tiles); every Settings row, including Send feedback's draft; Copy link opened in a new tab; ?script=sites&slide=5, ?preset=budd-chiari, ?preset=budd (a toast and the patient list, never a wrong patient), ?home=present, ?home=explore, ?embed&script=hvpg&slide=5; Resume after leaving a deck at slide 7; a deck's handout; and both PDFs under /preview/guides/ against the Settings sheet.
Last, and only after the coordinator confirms no other tester is running: Reset everything, and check the app comes back clean.
```

### 12.13 T15 · The slide camera by eye, and taking over mid-move

```
You are T15, lane V, at 1440×900 in the Navy look, then 1180×820 in the Light look. Start on the camera fix's commit (<commit>).
Slides: hvpg (catheter route, free, wedge, result), variceal-bleed 10 (TIPS sub-steps), shunts (procedure plays), lobule and ascites (lobule and sinusoid cams), circulation (the scale pill, Anatomy to Lobule to Sinusoid and back), circuit (regions), sites (ladders and table), where-resistance (the compare buttons), endoscopy, budd-chiari (DIPS), two-inflows, and the patient-change, catheter and case-card slides.
1. Each move by eye: a burst of 5 screenshots from the press to the landing. One straight glide, starting with the press.
2. Interruptions, each on 5 slides: Next twice fast; Next then Back mid-glide; digits then Enter mid-glide; a drag and a wheel zoom mid-glide (the camera must yield at once and never snap back); Fit mid-glide; tapping a zoomable card mid-glide. A view the learner pinched or zoomed must stay through Next on decks that keep it.
3. Sinusoid to Anatomy, and every scale pill change both ways.
4. Run PT.gate on the same decks and say where its lines agree or disagree with what you saw.
```

### 12.14 T16 · The five looks on phone and tablet, and the size edges

```
You are T16, lane B, at PT.frame(390, 844) and PT.frame(820, 1180).
In each of Light, Soft, Dark, Navy, Black and System (PT.setLook; for System clear it in Settings): each view, each Tests tab, Treat, History, Settings, and in the decks: an outline slide, sites' summary table, circulation 3 (a chart), stiffness 5 (a case card), a where-resistance question card, any deck's quick check, variceal-bleed 4 (the vitals monitor) and doppler 3 (the Doppler).
Then, in Light, the edges: PT.frame(767, 900) and (768, 900); (1023, 500) and (1024, 500); (1100, 1300) and (1101, 1300); (359, 740). The layout must switch cleanly at each edge.
Report text that is hard to read, pressure colours not from the ok, caution and danger tokens, anything left in another look's colours, and R7.
```

### 12.15 T17 · Presenting on the big screen

```
You are T17, lane V, at PT.frame(1920, 1080, '?perf') in the Light look, then PT.frame(1913, 1188, '?perf') in the Black look.
Present the 11 core decks as Mohammad would: circulation, circuit, sites, hvpg, doppler, stiffness, varices, variceal-bleed, ascites, encephalopathy, next-bleed. Use every control: Present from the menu; F; Next and Back by key; digits then Enter; G and a pick; Home and End; B and back; L; Esc in order (black, then a zoomed card, then leave). Press P for the presenter view: Next and Back from it move the talk, its notes and number match, closing it leaves the talk alone. Leave the talk and check the free view comes back with the cards that were open. Wait a few minutes on one slide: no toast may cover slide text. Copy ?perf after each deck.
Then run PT.walk on all 41 decks at 1920×1080 and post its real suspects.
```

### 12.16 T18 · Tests and Treat on phone and tablet, and one number everywhere

```
You are T18, lane B, at PT.frame(390, 844), PT.frame(844, 390) and PT.frame(820, 1180).
On Healthy, CSPH, Decompensated cirrhosis, Cirrhosis with gastrorenal shunt, Chronic PVT and Budd–Chiari:
1. Every Tests tab: Pressure and its Over time switch, HVPG (run the procedure), Doppler (past "Acquiring…"), Endoscopy (insufflation, Wall mechanics), Ascites (paracentesis, diuretics, albumin), FibroScan (Liver and Spleen), Readouts (a Why?), Trials (open one). The sheet opens, drags and closes cleanly, and nothing is cut.
2. Every Treat order on a patient it fits: Propranolol, Carvedilol, Terlipressin, Octreotide, Anticoagulation, Diuretics; 1 L crystalloid, 1 unit PRBC, Albumin; Band (EVL), Balloon tamponade, TIPS, DIPS, DSRS, both portocaval shunts, Mesocaval, Meso-Rex, BRTO, Splenic embolization, Splenectomy, Paracentesis. Each says what it did, shows on the figure, appears in History and undoes from its chip. One that does not fit says why.
3. At 820×1180, for all 19 patients, read portal pressure, HVPG, PPG, portal flow, PV velocity, LSM and ascites on the bottom bar, Readouts, the Pressure tab, the HVPG tab, the Doppler, FibroScan, the figure's labels and History. Post one table and flag every cell that differs.
```
