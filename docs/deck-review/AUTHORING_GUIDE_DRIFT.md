# Authoring guide against the code

`docs/deck-authoring-guide.md` calls the `decks.js` header comment its source of truth, and both have fallen behind the presenter and the engine. This audit read the code first and then compared it with the guide. It was run on the integration branch at commit `1af29676` (18 Oct 2026); line numbers refer to that commit. The guide was last edited in `8d6bc173` the same day.

The two findings that change how the decks teach:

- **`ask` and `notes` never appear on screen.** Only the printed handout reads them (`handout.js:100`, `:108`). During a talk the only questions learners see are the end-of-deck quick checks. Quiz mode was removed (`tests/deck-nav.test.js:93`).
- **The figure is read-only while a talk plays** (`presenter.js:3441-3456`). Taps, hover, zoom and the vessel card are blocked, so dye, shunts and the Explore tools cannot be used without pressing Esc.

## How to stop the drift

The guide drifted because nothing checks it. Three small tests would keep it honest:

1. Every preset in `scenario.js` and every key in `table-marks.js` RATE appears in the guide's preset and tile tables, with the same cut-offs.
2. Every slide field the presenter reads (the list in section 1 below) appears in the guide or the `decks.js` header comment.
3. The tile-rating table in the guide is generated from RATE (a short script that writes the table), not typed by hand.

Summary: the guide has fallen behind the code in about 30 places. The most serious errors: the kicker is never drawn and there is no running head; ladder slides do not round live values; six tile ratings are wrong; one preset and two parameters are missing; scale `legend` does nothing; the case-card camera behaves differently from what the guide describes. The decks.js header comment, which the guide calls the "source of truth" (guide L5), is incomplete too: it omits mark `kind`/`free`, compare `short`, `rGut`, `calm`, `dataTitle`, `deltaLabel`, `bold`, `clear`, `glow` and `vignette`. It also cites a ladder.js that no longer exists (SITES now lives at presenter.js:934).

## 1. Fields the presenter reads (code-derived; * = absent from the guide)

Deck: id, level, title, minutes, summary, objectives, slides, sections, checks, plus short/head/topic from TOPICS (decks.js:122-171). head falls back to a title of 24 characters or fewer (presenter.js:2055).
Model: preset, presetDays, params, action (object or array), days, ramp, lapse {seconds (default 8, presenter.js:1596), from, to}.
- *ramp keys may be dotted, e.g. 'fibrosis.R.post', and are linear, not eased (worker-core.js:33-40; decks.js:43).
Figure:
- view; cam (REGIONS, a box, 'fit', lobule:*, sinusoid); kMax (default 3.2); zoom (default 2.3); clear; lens (+*'oxygen', presenter.js:81); labels; tint.
- terms; glow (string or {id, tone, soft}); glowSeq.
- mark/marks {edges, label, kind, *seg 'proximal'|'mid'|'distal'|'site', *free} (presenter.js:1921; stage.js:7028, 7068).
- sites; layers.
- callout {at, label, *kind}. at accepts 'triad'|'cv'|*'lymph'|*'ha'|*'bd', anything else = sinusoid (lobule-zoom.js:1024-1031). kind: 'block'|'treat'|'note' (presenter.js:1933; app.css:1400-1401).
- cath; monitor.
Words: kicker, site, title, line, causes, causesHead, bold, pill, eq, caveat, vignette, notes, ask, rail, column, tick, when.
Data card:
- data 'ladder'|'tiles'; tiles, key, delta, brackets, block; *fold:false (presenter.js:2842); *dataTitle, which renames the card (2030).
- tool kinds: doppler {vessel, waves, *gate, *points, delta, *deltaLabel}, scope, fibroscan, trace {range, default 'talk'}, abdomen, wall, flowtime {clock, lines}; plus title and open (presenter-tools.js:66, 74, 85-91; presenter.js:2019-2029).
Visuals:
- table: cols, asc, rowHead (default 'Level'), note, vs, foot, *calm (presenter.js:2228-2291).
- of-rows: id|preset, title, name, kicker, note, blank, ref, vs, params, days, plus *key, *calm, *site, *block (2171-2177).
- scale: key, max (default 20), low, marks [v, words, short], sub (a key or a list), *rules (965-995).
- ladders, quadrant, walls; check and outline are automatic.
Interactive:
- compare: {label, params|preset(+block)|lens|*gate, own, *short} (1469-1480, 2102).
- whatIf: {label, param (a path or an *array of paths), min, max, step (default range/20), ends, unit} (1541-1567).
Sites: pv, ivc, ra, web, split, rLiver, rColl, rGut (stage.js:4586-4597).

## 2. Engine

Presets (17): healthy, postprandial, pvt-acute, pvt-chronic, svt, schisto, cirr-comp, csph, cirr-decomp, cirr-hepatofugal, gastric-varix, *pregnancy (cirrhosis 0.62, 365 days, then gestation 24), sos, budd-chiari, ivc-web, rhf, constrictive (scenario.js:64-101). Presets may also carry *volume (extra blood, mL) and *now (applied after the disease days) (engine.js:200-227).
Settable parameters and ranges (scenario.js:3-44, 105-129):
- cirrhosis 0-1; fibrosis 1-80; stenosis 0-0.95; *stenosisSite {stent: 'proximal'|'mid'|'distal'} (default distal); thrombus 0-1; splenicRx 0/1/2.
- splanchnicTone and systemicTone 0.4-2.5; contractility 0.15-1.6; tr 0-1; pericardial 0-1; albumin 1.5-5; *gestation 0-40 weeks; habrStrength 0-2; apShunt 0-1.
- respiration, respDepth 0-3, pulsatile; spontaneous {C5, C6}; isolatedGV; occluded (any collateral id); tips/dips {on, d 6-12}.
- portocaval, dsrs, mesocaval; customShunts X_<portal>_<systemic> 4-16 (topology.js:178-191); balloonEso/Gas; anticoag; diuretics; drugs; bleeding; deterministicRupture.
Actions (worker-core.js:220-229):
- infuse: crystalloid/prbc/albumin/plasma, running 600-900 s of model time (engine.js:911-921).
- hemorrhage {mL}.
- band: capped at 4 sessions; 4 closes C1; bands slough 0.02 a day (engine.js:391, 776, 949).
- paracentesis {mL, albumin as a boolean}: albumin adds 0.3 g/dL per 5 L; without it, more than 5 L triggers PICD (engine.js:953-963).
- rupture {site 'VAR'|'GV', tear}; stopBleed; valsalva {sec}.
Off-screen chain (worker-core.js:330-357): preset → params+settle → actions → days (noRupture: true) → settle (about 343 s of model steps, engine.js:696-700).
Live messages the deck triggers: morph, lapse (with ramp), breath (params.respiration:false, presenter.js:1800-1802), probe, setParams with ease, presetMetrics.

## 3. App features that are not slide fields

Key point: while a deck plays, the figure is read-only. Taps, hover, zoom, pan and keyboard focus on vessels are swallowed (presenter.js:3441-3456). None of the Explore tools below can be used without pressing Esc first.
Explore tools:
- Lens menu, 9 modes (main.js:48-59).
- Compare from here (P) with A/B/Change, and History with "Compare with now" (timeline.js:70-82, 264).
- Jump ahead 1 week, 1 month, 6 months or until something happens; Settle; Undo (timeline.js:24, 72-80).
- Vessel card: Narrow, Clot, Doppler, Add shunt, shunt diameter, Inject dye (J), Band, Endoscope, Cirrhosis, open the lobule or sinusoid, Pregnancy, BRTO, spleen treatment (actions.js:71-298).
- Treat card: anticoagulation, albumin, balloon tamponade, BRTO, spleen, paracentesis, Valsalva (chart.js:101-181).
- Tests: Pressure profile, Over time, HVPG procedure, Doppler with display modes, Endoscopy, Ascites, FibroScan, Readouts (dock.js:298-325; doppler.js:60-65).
  - The Pressure profile chart and the Readouts pane have no tool.kind.
- Blood menu: streaks, chevrons, key chevrons only, pressure values, potential collaterals, organ names, label level (main.js:662-680; store.js:14-16).
  - The presenter never touches these settings, so whatever is set before Start carries into the talk.
- Imaging view (store.js:28); Advanced physiology (main.js:865); command palette (palette.js:44-49); #s= share links (main.js:405-438).
Presenting tools:
- Keys (presenter.js:3459-3483): → / Space / Enter / ↓ / PageDown next; ← / ↑ / PageUp / Backspace back; number then Enter; Home and End; G for the slide list grouped by kicker; B, . or *W for black; F for full screen; Esc. The Guide's list omits W and the arrow/page variants (main.js:1803-1807).
- Swipe; drag the data card out of the way.
- Tap a table row to jump to that slide (presenter.js:2276); tap a column heading to show its cut-off (2272-2275); tap a quick-check answer.
- Projector mode turns on automatically (presenter.js:3768).
Present menu (menu.js:126-143; presenter.js:3856-3933):
- Present, Resume n/N (keeps the newest 40), Copy link (c/deck-<id>.html or ?script=<id>), Print notes.
- Your scripts: New, Add current state, Import (.js/.json/paste), Export, Share link (#script=), Delete.
Deep links: ?script=<id>&slide=<n>, ?preset=, ?home=present|patients (main.js:302-317).
SCORM package of a single talk: node scripts/scorm.mjs --script <id> (scorm.mjs:5-6).
There is no exam or quiz code; quiz mode was removed (tests/deck-nav.test.js:93).

## 4. Diff against the guide

### (a) In the code, missing from the guide

1. Preset `pregnancy`; the guide says 16 presets (L14, table L338-355).
2. Parameters `gestation` and `stenosisSite`; `occluded` accepts any collateral, not just C5 (circuit deck); preset `volume`/`now`.
3. Lens `oxygen` (blue low, red high), used by lobule and two-inflows.
4. Mark `seg` and `free` (free: no leader line; used by doppler, ascites, sites).
5. Doppler `gate`, `points`, `deltaLabel`; compare `{gate}` buttons; Doppler probes DIPS, C1b, C3 (doppler.js:38-41).
6. FibroScan also shows a ghost reading. The ghost works only on PV_TRUNK for Doppler, is hidden when a tile already shows that value, and falls back to the slide's own `delta` (presenter.js:2019-2029).
7. whatIf `param` as an array (used in sites). The value shows only when `unit` is set; a label starting with the unit shows the bare number; a ring marks where the slider started (1546-1566).
8. compare `short` (phone label).
9. Slide `fold:false` and `dataTitle`; table `calm` (slide and row); of-row `key`, `site`, `block`.
10. scale `rules` (stiffness uses it); `max` default 20; `sub` may be a single key; '\n' allowed in mark words.
11. Tiles and tokens `co` (cardiac output) and `bv` (blood volume), unrated with plain bars (table-marks.js:64-66, 85-86); used by the pregnancy deck.
12. Target `cavernoma`: an automatic term in every line, its own tone `cav`, lights C8 (presenter.js:138, 189). Tones `imv` and `cav` exist (tokens).
13. A line's "colored by <velocity|flow|direction|congestion|pressure drop|change|oxygen|origin>" becomes a pill in that lens's colour (presenter.js:255-258, 278). 20 decks rely on this.
14. After TIPS the PPG tile reads "Target met" (below 12) or "Above target" (presenter.js:824). Tiles have scale bars, a start ring and "from X"/"No change" text (866-900).
15. Lapse details:
  - A lapse slide's live tokens show the end-state values (1865-1866).
  - A lapse slide with its own params starts from them, set and settled (1835-1836; worker-core.js:344).
  - The data card is held back until the end if the slide has no tool (2117).
  - Next runs the lapse to its end in about 0.6 s (1570).
  - The counter reads "Day d of n", then "N days" or "N months later" (1571-1572).
  - No lapse on the first slide or when stepping back.
16. `params.respiration:false` stops breathing at once, before the probe is placed.
17. The off-screen settle runs about 343 s of model time and days never rupture (worker-core.js:348). So a running bleed continues through each changing slide; variceal-bleed relies on this (variceal-bleed.js:2-3).
18. A site reading is suppressed where the station's label already shows it (presenter.js:1937-1941). The sampled Doppler vessel glows green (227).
19. `ask` and `notes` appear ONLY in the printed handout (handout.js:100, 108); nothing on screen shows them. `ask` may be a plain string.
20. Adding a deck requires running node scripts/handout-figures.mjs <id>, or tests/handout.test.js:42-52 fails. tests/deck-line-length.test.js:8-14 requires lines under 45 words and at most 4 objectives. Neither is in guide §12.
21. The slide a talk is started or resumed on never shows its case card (presenter.js:3743-3745).
22. Table `cols` accept any tile key, but only COLS keys get a header and a cut-off. variceal-bleed.js:77 uses 'hb', which renders the raw header "hb" (presenter.js:2281; table-marks.js:102). This is a bug.
23. Present-menu workflow (Resume, Copy link, deep links, Print notes, SCORM) and the read-only figure (section 3).
24. deck-source also accepts let/var, ?. and .length (deck-source.js:133, 187, 311).

### (b) In the guide but wrong or stale

1. Kicker "small heading above the title", "running head" (L44, L58) and site "colours the kicker" (L59). The teaching card never draws the kicker (presenter.js:2099-2107). The `sec` running-head data is computed (decks.js:131) but read nowhere. The site colours a top-left corner tab (presenter.js:2075-2080).
2. "Site tags above titles" (L19, L502): it is a corner tab, per the code comment of 17 Oct.
3. "Ladder slides round pv, whvp, fhvp, ivc, ra to whole mmHg" (L206) is false. liveVal always uses the tile's decimals (presenter.js:234-240). So {pv} reads "18.3 mmHg" beside a ladder showing 18, and {hvpg} is a tenth-gap while the ladder bracket is a whole-gap (764).
4. Tile ratings (L456-479) are wrong for:
  - pv: amber >10, red ≥15.
  - whvp and fhvp: unrated (no entry in RATE).
  - spleen: amber >13, red >16.
  - liver: amber ≤75, red ≤55.
  - shunt: amber ≥10%, red ≥30%.
  - pvFlow: also red for "No flow" at 0.
  (table-marks.js:8-37, 68)
5. Velocity lens "pale amber to deep brown, mean velocity" (L136): it colours each vessel against its own normal (sand slow, teal normal, violet fast; collaterals neutral) (velNormal.js:1-5; main.js:54; tokens.css:104).
6. Lens key "the lens name and the two ends" (L132, L136-141): only 'drop' prints end words (Low/High). Flow, heat and delta show a bare bar. Direction's words are "Usual"/"Reversed" (presenter.js:74-103).
7. "`visual` slides always show pressure" (L132): visuals keep the previous lens on the dimmed figure (presenter.js:1813-1815).
8. Target `sin` "liver outlined" (L233): it lights the SIN_RR and SIN_LL edges (presenter.js:128). The ra and heart tone is --tour-sys, not ra.
9. ramp "top-level numeric parameter … eases" (L105): dotted keys work and the ramp is linear.
10. `action: []` described as a no-op (L103): it counts as a model change, triggers a fresh settle and an automatic delta (presenter.js:1196, 2014).
11. "Three bands = eradication" (L395): 4 sessions are needed for full effect, and bands slough over time.
12. scale `legend` (L312): never read; only scaleKey's fields are used (presenter.js:965-995).
13. `causes` as "bullet items" (L62): rendered as one comma-joined run-in line, with later items lower-cased (presenter.js:2107; glue.js:12).
14. `bold` "at most 3 a line" (L64): the cap applies only to the automatic terms; bold and key words are always bolded (presenter.js:248, 273-274).
15. Row `name` "renames a row" (L318): `name` labels scale and quadrant entries only; the table and ladders use `title` (presenter.js:2176).
16. Deck id list (L36) lacks beta-blockers, pregnancy and where-resistance. "'pvt' appears in one deck" (L59): no deck uses it; SITE_TAGS maps it to Pre-hepatic (decks.js:146).
17. Case card (L685): the camera does not glide to the slide's framing behind the card. It holds the whole patient and zooms only when the card is lifted (presenter.js:1626-1629, 1896-1897).
18. Tool "on a phone folds behind a Show button" (L291): the phone now uses a tucked sheet with a handle, "No Show or Hide" (presenter.js:2335-2338).
19. Doppler `waves` names a, S, v and D, not just a, S, D (presenter-tools.js:4-5).
20. "Deck-picker stills" (L640): brand/decks/*.webp are referenced nowhere in src.
21. Quadrant rows without ascites are silently dropped (presenter.js:1013); not stated.

### (c) Documented but used by none of the 27 decks

- Slide fields: bold, presetDays, zoom, marks (plural), glow {tone}.
- Lens 'delta'. Preset postprandial (decks use a splanchnicTone ramp instead).
- Actions: valsalva, stopBleed, infuse albumin and plasma, rupture site 'GV'.
- Parameters: systemicTone, contractility, pericardial, respDepth, pulsatile, isolatedGV, portocaval, mesocaval, customShunts, balloonEso, balloonGas, bleeding, deterministicRupture.
- Doppler vessels V_INT, V_SPL, MHV_IVC, LHV_IVC.
- Tokens {gv}, {pvVel}, {hb}; table column 'sin'.
- Targets lobule:zone1, sinusoid:kupffer, sinusoid:hepatocyte; imv appears only as tint or glow.

## 5. What each unused or undocumented item could teach

- oxygen lens: zone-3 hypoxia in congestion → right-heart, outflow.
- pregnancy preset / gestation: portal flow rising with plasma volume → beta-blockers (propranolol in pregnancy).
- stenosisSite with gate, points and seg: where a stent narrows → shunts, treatment (TIPS follow-up).
- mark.free: one label for a multi-vessel lesion → outflow (three hepatic veins).
- dotted ramp: presinusoidal fibrosis growing (fibrosis.R.pre) → ncph.
- whatIf array: both lobes together → ncph, lobule.
- compare short: long treatment labels on a phone → beta-blockers, pregnancy.
- fold:false: keep the ladder plot visible → hvpg.
- dataTitle: "Circulation at 24 weeks" → pregnancy.
- calm: a change that is neither better nor worse (meal, HABR) → two-inflows, doppler tables.
- of-row block: per-level ladders with a block on each → right-heart, where-resistance.
- scale rules: what to do in each HVPG zone → hvpg grades slide.
- deltaLabel and the FibroScan ghost: "Before cure" stiffness → recompensation, stiffness.
- Doppler on DIPS, C3, C1b: DIPS patency, recanalized umbilical vein, varix flow → outflow, doppler, varices.
- callout lymph/ha/bd and kinds: lymph overflow, the arterial inflow → ascites, two-inflows, lobule.
- co/bv: shock volume and the hyperdynamic circulation → variceal-bleed, treatment, right-heart.
- PPG "Target met": TIPS goal below 12 → shunts, treatment.
- paracentesis with albumin vs PICD: why albumin above 5 L → tap.
- action:[] passing time: ongoing loss → endoscopy bleed slides.
- lens 'delta': higher/lower than healthy at each level → sites, circulation.
- valsalva: the transient variceal and hepatic-vein surge → varices, doppler.
- stopBleed: spontaneous cessation vs banding → variceal-bleed.
- infuse albumin: oncotic support → ascites, tap.
- balloonEso/Gas: tamponade as a bridge → variceal-bleed, endoscopy.
- portocaval, mesocaval, customShunts: surgical shunts vs TIPS → shunts.
- isolatedGV with rupture 'GV': a fundal varix bleed and BRTO → shunts.
- systemicTone: vasodilation, MAP, terlipressin → ascites, treatment.
- contractility/pericardial sliders: failing vs constricted heart → right-heart.
- respDepth/pulsatile: respiratory and cardiac waveforms → doppler.
- presetDays: start further along the disease → one-year, pvt-cirrhosis.
- marks: name several collaterals at once → varices, shunts.
- zoom: a tight view of one portal tract → lobule.
- glow tone: danger tint on a vessel → sites, circuit.
- {pvVel}, {gv}, {hb}: live values instead of typed ones → doppler, shunts, variceal-bleed.
- V_SPL, V_INT, MHV, LHV probes: hilar splenic reversal, single-vein Budd–Chiari → doppler, outflow.
- zone1, kupffer, hepatocyte targets: lobule anatomy → lobule.
- 'sin' column: sinusoidal pressure by level → sites, where-resistance tables.
