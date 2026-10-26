# Deck authoring guide: Portal Pressure Simulator presenter decks

Self-contained brief for an AI that writes new presenter decks **without seeing the code**. It was checked against the app's source on the preview branch `claude/settings-topbar-icon-flvft1` on 22 Oct 2026 (files `src/ui/decks.js`, `src/ui/slide-ext.js` and its `ext-*.js` packages, the `tool-*.js` instruments, `src/ui/scale-switch.js`, `src/ui/proc-anim.js`, `src/ui/velNormal.js`, `src/engine/flow-cuts.js`, `src/ui/visual-plane.js`, `src/ui/col-wave.js`, `tests/deck-adopted.js`, `src/ui/decks/*.js`, `src/ui/presenter.js`, `src/ui/presenter-tools.js`, `src/ui/table-marks.js`, `src/ui/handout.js`, `src/ui/deck-source.js`, `src/ui/doppler.js`, `src/worker-core.js`, `src/engine/engine.js`, `src/engine/scenario.js`, `src/engine/topology.js`, `src/ui/anatomy.js`). Use only the names listed here; an unknown key is silently ignored, an unknown target is silently dropped.

**The code wins.** The presenter (`src/ui/presenter.js`), its instruments (`src/ui/presenter-tools.js`) and the tile ratings (`src/ui/table-marks.js`) are the source of truth. The slide-field comment at the top of `src/ui/decks.js` is a summary and lags behind them (it leaves out some fields this guide lists). When this guide and the code differ, follow the code and fix the guide. **Layout is not an authoring matter:** card widths, margins, gaps, corner radii and text sizes are set by the app (`styles/app.css`, and the fitting code in `src/ui/presenter.js`) and change as the layout is tuned. A deck never carries a size, a position or a colour for a card; to make words fit, shorten them. Screens 860 px tall or less (an iPad on its side, a short Mac window) get a compact layout that keeps every card's text at 12 px or more, and a browser check holds every slide to that floor at 1180 × 820 and 1440 × 700, so a slide with more words than its card can hold at 12 px fails it.

**Short version for people:** `docs/deck-authoring-quick-guide.md` explains every feature in plain words with one example each and points back here for the full option lists.

Contents: At a glance · 1 What a deck is · 2 Deck fields · 3 Slide fields · 4 The model state (patient, parameters, actions, time-lapse) · 5 The figure (views, camera, labels, glow, marks, sites, catheter) · 6 The words (live values, cut-offs, term pills) · 7 The data card (ladder, tiles, tools, visuals, compare, what-if, teaching features) · 8 Catalogue (presets, parameters, stations, vessels, targets, tiles) · 9 Authoring rules · 10 Blank template · 11 Example deck · 12 Adding the deck to the app · 13 Importing in the app · 14 Case cards

---

## At a glance: what the system can do

* **A live model, not pictures.** One lumped-parameter hemodynamic model of the portal circulation (gut to heart) computes every pressure, flow, collateral, varix size and ascites volume. A slide only says *which patient and what changed*; the numbers on screen, in the line (`{hvpg}`) and in the tables are read from the model, so they cannot drift from the picture.
* **Patients.** 17 presets from healthy to Budd–Chiari (section 8.1), changed by a partial parameter patch (section 8.2): cirrhosis severity, clots, stenoses, collaterals, shunts (TIPS, DIPS, surgical), drugs, diuretics, heart failure, and more; plus one-off events such as banding, paracentesis, hemorrhage and rupture (section 8.3). Disease runs on a clock: `days` and `ramp` age the patient, and `lapse` plays that change live. A meal is one setting, `meal`, that a lapse ramps from 0 to 1.
* **Two views of the figure.** The anatomy plate (with named camera regions and dives into the lobule and the sinusoid) and the electrical-circuit map (resistors, one row of zigzags). Stations, vessels and organs can be labelled, glowed, marked and pointed at from the words (term pills).
* **The data card** holds the numbers: a pressure ladder, readout tiles, comparison tables, scales, and live instruments (Doppler, endoscopy scope, FibroScan, pressure traces, the abdomen, the varix wall, a flow-over-time chart), or a what-if slider and treatment buttons that act on the live model.
* **Opt-in visuals (deck visuals packages, 19 Oct).** Spotlights, organ outlines, the vein-system and change-since lenses, live readings in marks, calipers and circuit brackets on the figure (section 5.9); a source line under the words (6.4); the pressure profile, the portal blood split, treatment bands, parameter curves, cause bars, the two-reading plane, the vessel cross-section, the fluid balance and new Doppler options in the card (7.2); small Doppler traces as a table column (7.3). A slide that sets none of them looks as before. Many built-in decks use them; a built-in slide may use one only when `tests/deck-adopted.js` lists it (section 12, step 3). The Testing deck "Demo: all the new visuals" (`src/ui/test-decks/demo-all-new-visuals.js`, Present › Testing, preview only) shows them all.
* **Catheter choreography.** The HVPG measurement can be played step by step (route, free, wedge, result) with the live tracing. A TIPS, a BRTO or a BATO can be played the same way on the real vessels from a Play button (`procedure`, section 7.4).
* **Hands-on slides.** `compare` buttons switch the live model between treatments, patients, earlier time points or lenses, and a `whatIf` slider drags one setting (section 7.4). 32 of the 40 built-in decks have at least one. `scales` adds a pill that flips the figure between the anatomy, the lobule and the sinusoid (section 5.10).
* **Case cards.** A slide that brings in a new patient can open with a centred frosted card holding a short clinical case, which may end on one short question (`caseQ`, section 14).
* **Deck furniture the app adds for you:** an Outline and objectives slide in front, the deck's short name in a tab at each slide card's top right corner, the level tab in its top left corner in decks that cover more than one level, disease-name pills, the closing quick check (`checks`), the printed handout (Present menu › Print notes), the nav pill, the corner credit.
* **On screen and in print.** On screen a slide shows its title, line, causes, the figure and the data card. `notes` and `ask` print only in the handout (`src/ui/handout.js`), never on a projected talk; the only questions learners see during a talk are the closing quick check and a question card (section 7.5). While a talk plays, the figure is read-only: taps, hover, zoom, pan and keyboard focus on vessels do nothing, so dye, the vessel card and the Explore tools cannot be used without leaving the talk (Esc). A slide must show what it teaches by itself. These are design decisions by the owner, not gaps to fill.
* **The menu has two tabs:** *Present* (the decks, this guide) and *Patients* (the presets, free exploration). Instructors can also import a deck file in the app (section 13).

---

## 1. What a deck is

A deck is a plain JavaScript object (one ES module per deck). The app plays it as a projector-first talk on a **live physiological model**: each slide sets a patient state, frames the figure, and shows one idea (a headline, a short line, optional causes, and a card of numbers or an instrument). The model state of every slide is computed off screen **in order, each from the slide before**, so forward, back and jump always show the same numbers.

Every deck automatically gets an "Outline and objectives" slide in front (built from `objectives` and the slides' `kicker` groups) and, when the deck has `checks`, a quick-check slide at the end. **Never write those slides yourself.** The first real slide keeps the patient of the outline (its model fields move onto the outline), unless that first slide carries a case card, which makes it load its own patient afresh behind the card (section 14).

A slide is **one idea**: a standalone title, a line of 30 words or fewer (section 9 rule 1), at most four causes, a figure that shows it.

## 2. Deck fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kebab-case, unique across all decks (existing, 28: `circulation circuit two-inflows hvpg hyperdynamic sites prehepatic ncph outflow lobule where-resistance doppler stiffness varices endoscopy variceal-bleed ascites encephalopathy gastric-varices recompensation pregnancy treatment next-bleed choose-treatment cause-treated shunts tips-doppler ten-years`). A talk that was merged into another keeps working by its old id: add it to `DECK_ALIAS` in `decks.js` (old id → the deck that took its slides). `?script=<old id>` and the share page `c/deck-<old id>.html` then open that deck at slide 1 (`beta-blockers` → `treatment`, `blood-volume` → `hyperdynamic`, `read-doppler` → `doppler`, `first-visit` → `stiffness`, `one-year` → `ten-years`, `refractory-bleed` → `variceal-bleed`, `where-block` → `sites`, `bleed` → `treatment`, `tips-journey` → `shunts`, `tap` → `ascites`, `spleen` → `stiffness`, `transplant-doppler` → `doppler`). |
| `level` | `'foundation'` \| `'core'` \| `'advanced'` | Shown as Foundation / Core / Advanced. |
| `title` | string | Full title. |
| `minutes` | number | Talk length. |
| `summary` | string | One or two sentences for the picker. |
| `objectives` | string[] | **3 to 4** short learning objectives (start with a verb: "Explain…", "Name…"). More than four fails `tests/deck-line-length.test.js`. |
| `slides` | slide[] | See section 3. |
| `checks` | `[question, answer][]` | The closing quick check: 3 or 4 questions, added after the last slide over its patient. Each answer starts hidden and eases open when tapped. Do not write the slide itself. Make one question a reasoning question: give a change in the numbers and ask what moved or what it means ("On a beta-blocker the HVPG falls from 16 to 11 mmHg. Is the bleeding risk gone?"). A card with four questions is full. |
| `sections` | `[name, [kickers or slide ids]][]` | Optional. 3 to 5 sections for the outline (there is no running head on the slides). Needed only when the deck has more than 5 distinct `kicker` values, or fewer than 3 (list slide `id`s then, as `circuit` does); with 3 to 5 kicker groups the sections are built from them automatically. A kicker `'Summary'` is left out of the outline. |
| `short` | string | **Set by the menu table (`TOPICS` in `src/ui/decks.js`), not in the deck file** (see section 12). Max 32 characters. |
| `head` | string | The deck's short name, in a tab at the top right corner of every slide's card. **Set by the menu table too**, its third entry. Max 20 characters, one or two words ("Ascites"). |
| `topic` | string | Set by the menu table too (`foundations causes measuring complications treatment more`). |

## 3. Slide fields

Every field is optional unless marked. Fields are grouped by what they do. Unknown values are ignored.

### 3.1 Identity and words

| Field | Type / allowed values | Default | Meaning |
|---|---|---|---|
| `id` | string | none | Unique within the deck. Required if any `of`, `delta`, `vs` or summary row refers to the slide, and handy for notes. |
| `kicker` | string | `''` | A group name. It is **not drawn on the teaching card**. Slides with the same kicker form one group: the outline's sections, the slide list (G) and the row label in summary tables come from it, and an instrument's ghost reading takes the earlier slide's kicker as its label when nothing else names it. Use `'Summary'` for the closing slide. |
| `site` | `'pre'` `'presin'` `'sin'` `'postsin'` `'post'` `'cardiac'` | none (grey) | The level of the resistance (pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac). Shown as a tab in the teaching card's top left corner, in the level's colour (Pre-hepatic, Presinusoidal, …), only in decks whose slides cover more than one level and never on a `visual` slide; a slide with a level `rail` names it on the rail instead. It also colours the slide's row label in summary tables. `'pvt'` is read as Pre-hepatic, but no deck uses it: write `'pre'`. |
| `title` | string | `'Step'` is not applied to decks; give one | The headline. **Must stand alone:** the kicker is not shown with it. |
| `line` | string | none | The words under the headline: one idea, **30 words or fewer** (section 9 rule 1). May use `{live values}`, `{>=5 mmHg}` cut-offs and `[word](target)` term pills (section 6). |
| `causes` | string[] | none | Up to **4** short items, set as one run-in line after the heading, joined by commas. Items after the first are lower-cased unless they start with an acronym or a name (Budd, Child, Wilson, Doppler…). A phone never shows the line. On a laptop or an iPad on its side it drops, after the title has stepped down once more, only when the teaching card and data card still do not fit together (so the data card is never cut off), so never leave a fact there that nothing else says. When the list is the slide's lesson (who gets a pre-emptive TIPS, the recompensation criteria, a classification), put it in the criteria card instead (section 7.5), which every screen shows. |
| `causesHead` | string | `'Causes'` | Heading of the causes list (e.g. `'Who gets it'`). |
| `bold` | string[] | `[]` | Extra key terms to bold at their first mention in the line. Always applied: the three-a-line cap is only for the automatic terms (section 6.2). |
| `pill` | `false` | auto | `false`: no automatic pill in the line (use it for a plain number such as an anatomical size). Without `{braces}` the first number with a unit becomes an outlined rule pill. |
| `eq` | `[mathML, legend?]` | none | Equation under the title (MathML string plus an optional legend sentence). See helpers in section 11. |
| `caveat` | string | none | One short sentence in small print under the line, where the model differs from patients ("The model builds the fluid from pressure and albumin; it does not model the kidneys."). |
| `vignette` | string | none | A case card: a clinical case shown on a centred card when this slide brings in a new patient. At most 219 characters, and only on a slide with a `preset`. See section 14. |
| `caseQ` | string | none | Opt-in (`tests/deck-adopted.js`): one short question that ends the case card, on its own line under the `vignette` ("Will his HVPG be raised?"). The case and the question together stay under 220 characters. See section 14. |
| `notes` | string | `''` | Printed in the handout under the slide, **never shown on screen**. Write them for a learner reading the handout (what the slide shows and why), not as instructions to the presenter ("Give the room a minute"). Give every slide notes. |
| `ask` | `[question, expected answer]` | none | A question with its answer, **printed in the handout**, never on a projected talk (a plain string prints the question alone). Give every content slide one. The handout test requires `ask[0]` to appear. |
| `rail` | `true` \| `'all'` | none | `true`: the six levels with this slide's `site` marked; `'all'`: all six levels named. |
| `column` | `true` | none | Draws the wedge-pressure column illustration (portal vein, sinusoids, central vein, balloon) in the text panel. |
| `tick` | string | the slide title | A few words for what happened at this slide's time point, set at 45° over its line on a talk trace (`tool: { kind: 'trace', range: 'talk' }`). Used in the time-line decks (`ten-years`, `prehepatic`, `recompensation`). |
| `when` | string | the day count | The time point under that label, in words, when the days so far would repeat the one before (a drug started at the same visit). |
| `milestone` | string | none | Opt-in: a short name (`'Dx'`, `'Carvedilol'`, `'TIPS'`) for this slide's time point on a milestones year chart (`tool: { kind: 'trace', range: 'talk', style: 'milestones' }`, section 7.2). |
| `cite` | string | none | Opt-in: a source line under the words (section 6.4). |

### 3.2 Model state (section 4)

`preset`, `presetDays`, `params`, `action`, `days`, `ramp`, `lapse`.

### 3.3 The figure (section 5)

`view`, `cam`, `scales` (5.10), `kMax`, `zoom`, `clear`, `lens`, `labels`, `tint`, `terms`, `glow`, `glowSeq`, `mark`, `marks`, `sites`, `layers`, `callout`, `cath`, `monitor`; opt-in (5.9): `spot`, `normalOutline`, `ripple`, `lapseGlow`, `since`, `sinceLabel`, `calipers`, `steps`, `span`, `zone`.

### 3.4 The data card (section 7)

`data`, `tiles`, `key`, `delta`, `dataTitle`, `tool`, `visual` (+ `cols`, `asc`, `rowHead`, `note`, `vs`, `foot`, `calm`, `of`, `scale`), `compare`, `whatIf`, `procedure` (7.4); opt-in: `wave`, `waveMax`, `focusRow` (7.3); opt-in teaching features (7.5): `hold`, `tool: { kind: 'criteria' }`, `question`, `hvpgResp`, `clock`; `caseQ` (section 14).

### Slide order and carry-over

A slide that sets none of `preset`, `params`, `action`, `days` **keeps the previous state**. (`params: {}` and `action: []` count as setting something: the model settles again, which runs about 343 s of model time with any open bleed still running, and the tiles show the change from the slide before.) Camera, labels, marks and glow do **not** carry over; each slide sets its own.

---

## 4. The model state

Order of application on every slide, computed off screen: **preset → params (settled) → action → days → settle** (with `ramp` stepping through the days). The days never start a new rupture, and the last settle runs about 343 s of model time.

| Field | Type | Meaning |
|---|---|---|
| `preset` | preset id (section 8.1) | Loads that patient fresh, then applies the rest on top. Omit to continue the same patient. |
| `presetDays` | number | Extra disease days **added inside the preset load** (on top of the preset's own `days`). Rare. |
| `params` | object | A **partial** parameter patch **deep-merged** onto the current patient (section 8.2). Example: `{ tips: { on: true } }`, `{ drugs: { carvedilol: true } }`, `{ cirrhosis: 0.5 }`. Only the keys you give change. Values are clamped to their ranges. |
| `action` | action or action[] | One-off events (section 8.3): `{ kind: 'band' }`, `{ kind: 'paracentesis', mL: 8000 }`, … Several in an array run in order. `[]` is not a no-op: it counts as a change, so the model settles again (time passes with an open bleed still running, as in Variceal bleed) and the tiles show the change. |
| `days` | number | Extra disease days **after** the patch (the disease clock: varices, ascites and collaterals develop over days). |
| `ramp` | `{ param: [from, to] }` | With `days`: moves one or more numeric parameters from `from` to `to` in equal steps, day by day (linear, not eased): `{ cirrhosis: [0.4, 0.6] }`, `{ albumin: [4, 2.8] }`, `{ splanchnicTone: [1, 0.72] }`. A dotted key names a nested parameter: `{ 'fibrosis.R.post': [1, 20] }`. |
| `lapse` | `{ seconds, from?, to?, clock? }` | Plays the slide's `days` (and `ramp`) **live on the figure** as a time-lapse of `seconds` length (default 8), starting from the previous slide's state. `from` / `to` are words for the start and end in place of a day counter (e.g. `'Fasting'`, `'After a meal'`). **Keep `days` ≥ `seconds`**, or the clock runs sub-day and the ramp is skipped. `clock: 'seconds'` plays the ramp on the bedside clock (see below). |

Typical time-lapse: `days: 90, ramp: { cirrhosis: [0.5, 0.54] }, lapse: { seconds: 8 }`.
Typical "meal" lapse (used by several decks): `days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }`. The `meal` setting (section 8.2) lowers the gut arterioles' tone by the amount a meal does, and a cirrhotic gut, which is already dilated, responds less than a healthy one. Do not ramp `splanchnicTone` for a meal.

How a time-lapse behaves:

* **Its own patient needs `params`.** A lapse plays from the previous slide's state. A lapse slide that sets `params` starts instead from its own patient with those params set and settled. So a lapse slide with its own `preset` must also carry `params` (`params: {}` is enough), or it plays from the previous slide's patient.
* **Its words show the end.** A lapse slide's `{tokens}` read the end state, so word the line as the end point ("Six months on, the HVPG is {hvpg}").
* **Its data card waits** for the end, unless the slide has a `tool` (the instrument plays the days).
* **The counter** reads "Day d of n", then "n days later" ("n months later" when n is 60 or more and a multiple of 30); `from`/`to` replace it with "from → to", then `to`.
* **A bedside lapse.** `lapse: { seconds: 6, clock: 'seconds' }` plays the ramp over those seconds on the bedside clock, with the heartbeat running, instead of on the disease clock. Use it where an instrument has to keep recording while the change happens: the Doppler meal slide, whose trace shows the portal flow rising as the meal takes hold. Without it a Doppler shows no trace during a lapse. Everything else about the lapse is the same.
* **Next** during a lapse runs the rest in about 0.6 s and stops on its end. A lapse never plays on the first slide or when stepping back (the end shows at once), and never shows a case card.

`params: { respiration: false }` stops breathing on the live figure at once, before an instrument's probe is placed, so a Doppler trace does not record the leaving patient's breathing.

---

## 5. The figure

### 5.1 View and camera

| Field | Values | Default |
|---|---|---|
| `view` | `'anatomic'` (the body plate) \| `'circuit'` (the electrical-circuit map) | `'anatomic'` (a circuit deck sets `view: 'circuit'` on **every** slide; the camera is always fit there) |
| `cam` | a named region, a box, `'fit'`, or a lobule/sinusoid view | `'fit'` |
| `kMax` | number | max zoom for a region camera, default 3.2 (existing decks use 4.5 for tight shots) |
| `zoom` | number | zoom multiplier for lobule cameras, default 2.3 |
| `clear` | `true` | frame the region so its vessels stay clear of the cards' exact edges (no softened margin); for slides whose vessels would otherwise run under a card (existing use: the meal time-lapse) |

**Named regions** (`REGIONS`, anatomy world units x 300–1120, y 0–920): `route` portal vein to heart · `liver` · `portal` confluence, trunk, splenic vein, SMV · `gut` the portal system and the whole small bowel, with room for the bowel's glow (the meal time-lapse) · `hepatic` hepatic veins, IVC, right atrium · `heart` · `varices` · `spleen` · `rectum` · `wall` paraumbilical vein and abdominal wall · `fundus` fundal varices, gastrorenal shunt, left renal vein · `splenic` splenic vein to the confluence, spleen, fundus · `dips` the DIPS tract, portal bifurcation up through the caudate lobe to the IVC · `gej` lower esophagus, the gastroesophageal junction and the coronary vein feeding it · `feeder` the varices down the coronary vein to the portal confluence. Also `'fit'` (whole figure) and a box `[x0, y0, x1, y1]` (e.g. `[690, -10, 890, 170]`). The camera also grows to include any organ the slide outlines.

**Inside the liver** (these dive in from the anatomy; the view returns to the body plate for the next normal `cam`):
`'lobule'` (whole lobule) · `'lobule:fit'` · `'lobule:triad'` (portal tract) · `'lobule:sinusoid'` · `'lobule:central'` (central vein) · `'sinusoid'` (the sinusoid wall, cross-section). Some devices cannot draw `'sinusoid'` and fall back to the lobule.

### 5.2 Lens (what the vessel colours show)

`lens` picks what the figure's vessels are colored by on that slide, as the color menu does in Patients. Without it the slide shows pressure. The figure crossfades to the new colours while the old words leave, and a small key sits on the figure, not in the teaching card (src/ui/figure-key.js puts it on bare background, clear of vessels, cards and labels): the lens name ("Velocity", no "Colored by") and its scale. A `visual` slide keeps whatever colours were already showing on the dimmed figure. In learner-facing words say "colored by velocity", never "lens" (Mohammad, 14 Oct).

A line's "colored by <name>" becomes a pill in that lens's colour (it points at nothing on the figure). Names that work: `velocity`, `flow`, `flow volume`, `direction`, `congestion`, `pressure drop`, `change`, `oxygen`, `origin`, `blood origin`.

| `lens` | Colours | Key |
|---|---|---|
| `'velocity'` | each vessel's mean velocity against its own normal: sand slower, teal normal, violet faster; collaterals stay neutral | swatches: Slow, Fast |
| `'flow'` | flow volume, how much blood each vessel carries | colour bar |
| `'direction'` | the usual direction in teal, reversed flow in orange | swatches: Usual, Reversed |
| `'heat'` | congestion: pressure above healthy | colour bar |
| `'drop'` | pressure drop across each vessel: where the resistance lives | Low ▬ High |
| `'delta'` | higher or lower than healthy | colour bar |
| `'oxygen'` | oxygen saturation: blue low (hepatic venous blood, about 65%) to red high (arterial, 98%) | colour bar |
| `'origin'` | where each vessel's blood comes from: SMV, IMV, spleen, hepatic artery, the rest systemic, mixed by flow at each junction | swatches: SMV, IMV, Spleen, Artery, Systemic |

A `compare` row can switch lenses instead of treatments: `compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Flow', lens: 'flow' }]`. Each button crossfades the figure to its lens and swaps the key (it fades out and the new one in), without touching the model; the key is on the figure, so the card never changes height (Circulation's lens slide, which offers five: Pressure, Flow, Direction, Origin and Oxygen). Give a button a `short` label (`'Press.'`, `'Dir.'`) when a row of them would wrap on a phone.

Use it where the colour is the point of the slide (a reversed branch on `'direction'`, a fast stent on `'velocity'`), and say in the line what the colours show. The lens does not carry over: each slide sets its own.

### 5.3 Layers and lobule callouts

* `layers: ['zones']` turns the lobule's zone 1 / 3 bands on for the slide (needed for the `lobule:zone1` / `lobule:zone3` labels); `'lymph'` turns the lymphatics on the same way. Other lobule slides have zones off and lymph as the viewer had it; the viewer's own layers return when the show ends.
* `callout: { at, label, kind? }` on a lobule slide: a callout in the lobule marking where the resistance sits. `at`: `'triad'` (portal tract), `'cv'` (central vein), `'lymph'` (a lymphatic), `'ha'` (the hepatic arteriole), `'bd'` (the bile ductule); anything else, such as `'sin'`, points at a sinusoid. `kind`: `'block'` (default, red), `'treat'` (accent), `'note'` (plain). Example: `callout: { at: 'cv', label: 'Resistance' }`.

### 5.4 Station labels

`labels: ['CONF', 'SIN_R', 'RHV', 'RA']`: the stations named on the anatomy figure (none shown if absent; **only the stations you list, plus those your terms point at, appear**). `tint: ['imv']` takes the colour of a target's station label although the line never names it (the label is on, in its station colour). Valid ids are node ids (section 8.4). Only labels the anatomy draws appear. On the circuit view the labels are the circuit's own.
`VAR` (esophageal varices) is hidden when the patient has no varices; `GV` is hidden when there are no fundal varices.
On Gut to heart chart (`tool: { kind: 'profile' }`) and catheter (`cath`) slides the figure automatically renames to "Right sinusoids · WHVP" and "Right hepatic vein · FHVP".

### 5.5 Glow, highlights and term pills

* `terms` : words in the line that become coloured pills **and** light the figure (section 6.3).
* `glow: [...]`: light vessels or organs directly. Items: a target key (`'smv'`, `'liver'`), a vessel/edge id (`'PV_TRUNK'`, `'C5'`), an organ (`'liver'` `'spleen'` `'heart'` `'caudate'`), or `{ id, tone, soft? }` (`soft: true` marks a supporting vein lit softly; a slide with any soft glow makes the camera frame every vessel it lights, so none runs off the edge). Tone defaults to the target's station colour (accent for an unknown edge). Terms glow automatically, so `glow` is for things the line does not name.
* `glowSeq: 550`: ms between successive `glow` items, so they light in order (e.g. pressure travelling back from the heart). Existing use: `550`.
* Tones usable in `{ id, tone }`: `pv`, `sv`, `smv`, `imv`, `wedge`, `hv`, `ivc`, `ra`, `var`, `cav` (the cavernoma), `accent`, or a CSS variable name starting `--` (e.g. `'--danger'`).

### 5.6 Marks (callouts on a vessel)

`mark: { edges, label, kind, seg?, free?, clot? }` or `marks: [ … ]` (several). `edges` = vessel ids (section 8.5). Only labelled marks get a callout box. `free: true` sets the label on its own with no leader line, for one name over several vessels (the three hepatic veins). `seg` on a stent (`'proximal'` | `'mid'` | `'distal'` | `'site'`, the third that holds its narrowing) lights and points at that third only.
`clot: true` (opt-in, in place of `label`) names the clot in the mark's first vessel as the model has it, so a what-if slider on the clot changes the words: "Nonocclusive clot", "Occlusive clot" once the cross-section card reads 100 %, and no mark at all at 0 %. The new words fade in place.

| `kind` | Look | Use for |
|---|---|---|
| `'block'` (default) | danger red | a clot, web, rupture, occlusion |
| `'treat'` | accent | a stent, bands, a closed shunt |
| `'note'` | a pointer: the vessel glows in its station colour with a small boxed name | naming a collateral, a shunt |

**No repeats:** a `note` mark whose vessel is already named by a station label (or a term) on the slide is dropped by the engine, but its glow stays. Do not point at what a label already names.

### 5.7 Readouts on the figure

`sites: [...]`: pressure/resistance readings drawn on the figure:

| Value | Shows |
|---|---|
| `'pv'` | portal vein pressure at the confluence |
| `'ivc'` | IVC pressure |
| `'ra'` | right atrium pressure |
| `'web'` | the IVC below a web (pair with `'ra'`) |
| `'split'` | where portal blood goes: a fork whose two branches are as wide as the shares to the liver and to the shunts |
| `'rLiver'` | liver resistance vs a healthy liver (circuit view) |
| `'rColl'` | collateral resistance (circuit view) |
| `'rGut'` | gut arteriole resistance (circuit view) |

Pointing at the resistor words `resistance` / `collaterals` / `gut arterioles` with `terms: { resistance: 'rLiver', collaterals: 'rColl' }` also lights those zigzags. A site reading is left out where its station label (`CONF`, `IVCS`, `RA`) is already on the slide: the label carries the reading, in its station colour.

### 5.8 The HVPG catheter

`cath` replaces the camera with the catheter choreography (the camera follows it): `'route'` (in along the jugular route) · `'free'` (free hepatic vein pressure) · `'wedge'` (balloon up, still column, WHVP) · `'result'` (both pressures and the HVPG) · `'blocked'` (catheter in a presinusoidal block).
The catheter's pressure trace belongs in the data card: `tool: { kind: 'hvpg', catheter: true }` on a slide with `cath: 'free'`, `'wedge'` or `'result'` (7.2). The trace follows the catheter's balloon, and the same card stays up from one such slide to the next, so the teaching card holds only the words. (`monitor: 'free' | 'wedge' | 'result'` still shows the same trace under the slide's words, as older decks did; the built-in talks no longer use it.)

---

### 5.9 Opt-in highlights and callouts

All figure-only (no `visual`). Organ outlines, the normal spleen, organ marks, calipers and step numbers show on the anatomy view; `span` and `zone` only on the circuit view; nothing here shows in the lobule or sinusoid views. Code: `src/ui/ext-highlights.js`, `highlight-math.js`, `ext-callouts.js`, `callout-math.js`.

* **More organs** for `terms`, `glow` and `[words](key)`: `bowel` (small bowel), `colon`, `duodenum`, `kidney` (left). The stomach and esophagus are not highlighted. Outlined in the neutral ink `--text-2`.
* **Named vessel sets** (`'@name'`) in `glow`, `spot` and a mark's `edges`: see section 8.5. `{ id: '@name', soft: true }` gives each vessel the same options.
* **`spot: [ids]`**: a spotlight. The named vessels, `@sets` and organs stay at full strength and glow softly; the rest of the network eases back and the organ picture dims. Compare buttons and sliders keep it. Without WebGL only the organs dim.
* **`normalOutline: ['spleen']`**: a thin dashed line at the normal spleen's size inside an enlarged one; it shows once the spleen is 8% over normal and grows into view through a time-lapse.
* **`lapseGlow: ['bowel']`**: with `lapse`, the named organs (`bowel`, `colon`, `duodenum`, `kidney`) glow softly in the gut's amber from the time-lapse's start: the glow swells in over about 1.4 s and stays while the slide shows its end state (also coming back to it), then eases off as the slide leaves. Choose a `cam` that frames the organ (`'gut'` takes in the portal system and the small bowel). With reduce motion the glow uses the usual short fade.
* **`scales`: the scale switch (Anatomy / Lobule / Sinusoid).** One pill with Explore's words and order lets the presenter flip the figure to other scales of the same patient and back. Each scale can be set up as a view of its own: where the camera goes, how close, and what it calls out. See **5.10** for the full field.
* **`ripple: true | '<slide id>'`**: as the slide lands, vessels whose pressure moved 2 mmHg or more glow warm (up) or cool (down) for about 1.6 s. Forward only; none with reduce motion.
* **`lens: 'system'`**: portal veins, systemic veins and shunts (collaterals included) in three colours, keyed Portal, Systemic, Shunts (also a compare button: `{ label: 'Vein system', lens: 'system' }`). Not in Explore.
* **`lens: 'since'`**: the Change colours against the slide before, or `since: '<slide id>'`; `sinceLabel: 'no Rx'` names the reference in the key ("Change vs no Rx"; else "Change vs last slide" or "Change vs earlier"). Compare buttons keep the reference, so two treatments read on one scale. In a lobule view (`cam: 'lobule…'`) the lens colours the lobule's vessels and its three readings from the same reference, eased as it changes, so the figure and the key agree there too.
* **Live readings in a mark**: a mark's `label` may hold any tile `{token}` (`'Varix {varix}'`), printed as its tile prints it and in its rating colour on a plain pill; it follows sliders, buttons and time-lapses without jumping. Do not repeat a reading a station label already shows.
* **Marks on organs**: `mark: { organ: 'spleen', label: 'Spleen {spleen}' }`; organs `liver spleen heart stomach esophagus bowel colon duodenum kidney ascites`. `kind` defaults to `note`.
* **`calipers: ['spleen' | 'varix' | 'TIPS' | <vessel id>]`**: a dimension line with its reading (spleen length, varix diameter, stent width in whole mm, any other vessel's modelled diameter).
* **`steps: true`** with `glowSeq`: a small round number by each glow entry as it lights. A list inside the glow is one step: its vessels light together and its number stands between them on a leader to each (`glow: [['V_INT', 'V_SPL', 'V_IMV'], ['PVH_R', 'PVH_L'], 'SIN_RR']`); its leaders keep off every label and other leader where they can.
* **`span: [{ from, to, label }]`** (circuit station ids; the label may hold tokens): a bracket under the circuit with its reading. **`zone: 'splanchnic' | 'portal' | 'liver' | 'hepatic' | 'heart'`** fills that part of the circuit softly.
* Every reading pill keeps clear of vessels, lines, organs and the cards, at 12 px or more.

### 5.10 The scale switch: `scales`

A slide with `scales` shows a pill with **Anatomy, Lobule, Sinusoid** (Explore's words, always in that order; only the scales the slide offers). The slide opens on its own scale, the one its `cam` shows: anatomy unless `cam` starts with `lobule` or is `sinusoid`. That scale is selected in the pill. A tap flips the figure to another scale of the same patient. The flip uses the moves the slides already make: the dive into the lobule, the zoom into the wall, the rise back out. So it always eases, and the vessels never move. The words, the data card, sliders, compare buttons and a running time-lapse carry on untouched.

**Two forms.** The short form lists the scales offered, each with an optional landing spot:

```js
scales: ['lobule', 'anatomy:fit']          // 'anatomy:<region>' (or 'fit'); 'lobule:<station>' (fit, triad, sinusoid, central)
```

The full form gives each scale its own view, so the slide knows where the camera goes and what to call out at every level:

```js
scales: {
  anatomy:  { cam: 'portal', kMax: 3, labels: ['CONF', 'SV'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, sites: ['pv'] },
  lobule:   { cam: 'lobule:triad', zoom: 2.6, glow: ['lobule:triad'], callout: { at: 'triad', label: 'Resistance' } },
  sinusoid: {},
}
```

A scale's view may set these fields, which work as the slide fields of the same name do:

| Field | At which scale | What it does |
|---|---|---|
| `cam` | anatomy: a region, `'fit'` or `[x0, y0, x1, y1]`; lobule: `'lobule:fit'`, `'lobule:triad'`, `'lobule:sinusoid'`, `'lobule:central'` | Where the camera lands. Defaults: the liver for the anatomy, the whole lobule for the lobule. The sinusoid always shows the wall. |
| `zoom` | lobule | How close the lobule station is framed (× its framing, default 2.3). |
| `kMax`, `clear` | anatomy | The anatomy's closest zoom and its clear framing, as on a slide. |
| `labels` | anatomy | The stations named on the anatomy. |
| `mark`, `marks` | anatomy | Callouts on vessels or organs (5.6). |
| `sites` | anatomy | Readings on the figure (5.7). |
| `glow`, `glowSeq` | anatomy, lobule | Glowing vessels on the anatomy. In the lobule, `'lobule:triad'`, `'lobule:sinusoid'` and `'lobule:central'` light those readings. |
| `callout` | lobule | The lobule's callout (5.3). |
| `layers` | lobule | `['zones']`: the zone bands. |

**What carries over.** The slide's own scale always shows the slide exactly as written. Another scale starts bare: none of the slide's own camera or callouts (`zoom`, `kMax`, `clear`, `labels`, `mark`, `marks`, `sites`, `glow`, `callout`) follows it there, and only that scale's view adds its own. The words' term pills still light their stations at every scale. Package extras (`spot`, `normalOutline`, `ripple`, `lapseGlow`) stay as the slide set them. Each flip takes the old scale's callouts away before the camera moves and brings the new scale's in after it lands, with the liver's labels fading out and in as they do on a slide change.

**Next, Back and jump.** A flip is a detour and is never remembered. Next, Back and a jump open every slide on its own scale, and so does coming back to the flipped slide later. A reload, a shared link and the printed notes also show the slide's own scale. Leaving mid-flip needs nothing special: the next slide's camera starts from wherever the figure is.

**When a tap works.** Only once the slide has landed (cards in, any case card lifted). A tap during a flip turns it to the new scale when the current step ends. Next or Back during a flip cuts it.

**Sinusoid.** The wall view draws pressure colours only, so Sinusoid is offered only on a pressure-lens slide (no `lens`, or `lens: 'pressure'`). It is also left out on a device that can't draw it (no WebGL2). There, a sinusoid slide opens on the lobule and the pill selects Lobule.

**Never on:** question slides (a flip would give the answer away), catheter slides (`cath`), Doppler-probe slides, calipers slides, Circuit slides (`view: 'circuit'`) or visuals. The code refuses the last five even if the field is set (scale-switch.js).

**Where the pill sits.** On Mac and iPad landscape it sits in the slide counter's row, 8 px left of the counter pill, at the same 44 px height. On a phone or an upright iPad it is centred 8 px above the teaching card, and the camera frames the figure above it. It comes in and leaves with the teaching card, in the card's fade, and the figure's labels, the colour key and the credit keep clear of it. The text is 14 px (12 px on a 320 px phone). The selected word sits in a soft inner pill that eases from word to word.

**House rules.** Adopt a run of slides together (all of Sites 4 to 9, all of Ascites 2 to 5), so the pill doesn't come and go from one slide to the next. Give the other scale something to show when the bare view would look empty: at least the readings the slide talks about. Built-in slides that use `scales` are listed in `tests/deck-adopted.js`, and `tests/scale-switch.test.js` checks every list.

**Worked example** (Sites 5, schistosomiasis: opens in the portal tract, flips out to the body):

```js
{
  id: 'presin', preset: 'schisto', cam: 'lobule:triad', lens: 'drop', callout: { at: 'triad', label: 'Resistance' },
  scales: {
    anatomy: { cam: 'liver', labels: ['CONF', 'SIN_R'], glow: ['PV_TRUNK'] },
  },
  kicker: 'Presinusoidal', title: 'Schistosomiasis', line: '...',
}
```

The slide opens in the portal tract with its Resistance callout. **Anatomy** rises to the liver, names the portal confluence and the sinusoids, and lights the portal trunk. **Lobule** dives back and brings the callout back. There is no Sinusoid, because the lens is pressure drop.

## 6. The words

### 6.1 Live values: `{token}`

`{pv}` in a `line` is replaced by the model's **live reading for that slide**, in a pill, with its tile's decimals (one for pressures). This holds on chart slides too: the chart reads whole mmHg and its brackets round the true HVPG and PPG, so `{pv}` can read "18.3 mmHg" beside a reading of 18, and a bracket can be 1 off the difference of the two whole readings it spans. On a time-lapse slide a token reads the end state (section 4). The pill takes the station colour where one exists (`pv`, `whvp`, `sin`, `fhvp`, `ivc`, `ra`); sizes (`spleen`, `varix`, `gv`) take their status colour (amber/red). Prefer a live token over a typed number so it cannot drift.

Valid tokens (the tile keys, section 8.6): `hvpg ppg pv sin whvp fhvp saag tp asc varix gv spleen plt pvFlow pvVel liver shunt map hr lsm ra salb ivc hb co bv`. `{ppg@before}` reads the value at another slide of the deck (here the slide with `id: 'before'`), for "the PPG falls from {ppg@before} to {ppg}". A typed `{6 to 8 g}` is drawn as an outlined rule pill, never as the patient: for the patient's number use a live token.

### 6.2 Cut-off pills: `{>=10 mmHg}`

`{>=10 mmHg}` (also `>`, `<`, `<=`, `≥`, `≤`) renders an **outlined** pill with the comparison symbol dropped, so **write the words around it**: "above {>=5 mmHg}", "below {<12 mmHg}". A filled pill is *the patient*, an outlined pill is *the rule*. A filled pill takes its tile's rating colour (green normal, amber raised, red severe, as the tile's bar; after TIPS the PPG reads against its target of 12 mmHg); a value its tile does not rate keeps its station's colour, and an outlined pill stays plain.

Automatic pills/bold: if a line has no `{braces}`, the first `number + unit` (mmHg, g/dL, mL/min, kPa, cm/s, mm, %) becomes an outlined rule pill (a typed number is a rule or a published figure; only live values are filled). Give `pill: false` when it is neither, such as an anatomical size. Fixed key terms are auto-bold, at most 3 a line, first mention only (the cap is for these alone): CSPH, SAAG, WHVP, FHVP, central vein, portal tracts, fenestrae, space of Disse, basement membrane, capillarization, wedged pressure, free pressure, sinusoidal pressure, caput medusae, gastrorenal shunt, stellate cells, encephalopathy, periportal fibrosis, intrahepatic resistance, hepatopetal, hepatofugal, cavernoma, a wave, pulsatility, reflection coefficient, Laplace, congestion index, gray zone, red wale marks. The slide's `key` tiles' words and its `bold` terms are bold too, at their first mention, whatever the count.

### 6.3 Term pills that point at the figure

A term becomes a pill in its **station colour**; the station's figure label takes the same colour, is added to the slide, and its vessel glows (or its organ is outlined).

* **Inline:** `[portal vein](pv)` in the `line`. The target is a key from the table below or a node id (`CONF`).
* **Field `terms`, array:** `terms: ['sv', 'smv', 'pv']`: each target's own words (the "Words" column) are found in the line.
* **Field `terms`, object:** `terms: { sinusoids: 'sin', 'space of Disse': 'sinusoid:disse' }`: your words → target.
* Only the **first** mention of a term is pilled. A term can open a sentence. Pill only what has a target; leave other key words bold.

**All targets** (`TARGETS`): tone is the `--tr-<tone>` station colour.

| Key | Node label | Lights | Tone | Words matched (for array form) |
|---|---|---|---|---|
| `pv` (`CONF`) | Portal vein | `PV_TRUNK` | pv | portal vein |
| `sv` (`SV`) | Splenic vein | `SV_CONF`, `SV_MID`, `V_SPL` | sv | splenic vein, splenic |
| `imv` (`IMV`) | IMV | `V_IMV` | imv | inferior mesenteric vein(s), inferior mesenteric |
| `smv` (`SMV`) | SMV | `SMV_CONF`, `V_INT` | smv | superior mesenteric vein(s) |
| `sin` (`SIN_R`) | Sinusoids | `SIN_RR`, `SIN_LL` | wedge | sinusoid(s), sinusoidal pressure |
| `whvp` | Sinusoids | liver outlined | wedge | WHVP, wedged pressure |
| `fhvp` (`RHV`) | RHV | `RHV_IVC` | hv | FHVP, free pressure |
| `hv` | Right hepatic vein | `RHV_IVC`, `MHV_IVC`, `LHV_IVC` | hv | hepatic vein(s) |
| `ivc` (`IVCS`) | IVC | `IVCS_RA`, `IVC_IS` | ivc | IVC, inferior vena cava |
| `ra` (`RA`) | Right atrium | whole heart lit by a soft glow (`heart`; `heart-ra` still names it) | `--tour-sys` | right atrium |
| `varix` (`VAR`) | Varices | `C1a`, `C1b` | var | esophageal varices, varices, varix |
| `gv` (`GV`) | Fundal varices | `C2` | var | gastric varices, fundal varices |
| `lgv` (`LGV`) | Left gastric vein | `LGV_CONF`, `V_STO` | var | left gastric vein, coronary vein |
| `cavernoma` | none | `C8` | cav | cavernoma(s). **Automatic:** every line pills it and lights the collaterals, with no `terms` entry |
| `azy` (`AZY`) | Azygos | `AZY_SVC` | var | azygos (vein) |
| `lpv` (`LPV`) | Left portal vein | `PVH_L` | pv | left portal vein |
| `lrv` (`LRV`) | Left renal vein | `LRV_IVC`, `V_KID_L` | ivc | left renal vein |
| `spleen` | none | spleen outlined | sv | spleen |
| `liver` | none | liver outlined | wedge | liver |
| `heart` | none | heart outlined | `--tour-sys` | heart |
| `caudate` | none | caudate lobe with its veins draining into the IVC | hv | caudate lobe |
| `caudateLobe` | none | the caudate lobe alone (a DIPS runs through it) | hv | caudate lobe |
| `rLiver` | none | circuit: liver resistor zigzag | wedge | resistance |
| `rColl` | none | circuit: collateral resistor | var | collaterals |
| `rGut` | none | circuit: gut arterioles | smv | gut arterioles |

Inside the liver (the view's own label takes the colour with a soft glow; use with a lobule/sinusoid `cam`):

| Key | Tone | Words |
|---|---|---|
| `lobule:triad` | pv | portal tract(s), portal triad(s), portal venule(s) |
| `lobule:arteriole` | artery colour | hepatic arteriole(s), arteriole(s) |
| `lobule:ductule` | bile-duct colour | bile ductule(s), bile duct(s) |
| `lobule:sinusoid` | wedge | sinusoid(s) |
| `lobule:central` | hv | central vein(s), central venule(s) |
| `lobule:lymph` | ivc | lymphatic(s), lymph |
| `lobule:zone1` | pv | zone 1, periportal (needs `layers: ['zones']`) |
| `lobule:zone3` | hv | zone 3, centrilobular (needs `layers: ['zones']`) |
| `sinusoid:fenestrae` | accent | fenestrae |
| `sinusoid:disse` | accent | space of Disse |
| `sinusoid:stellate` | accent | stellate cell(s) |
| `sinusoid:kupffer` | accent | Kupffer cell(s) |
| `sinusoid:hepatocyte` | accent | hepatocyte(s), liver cells |
| `sinusoid:lymph` | ivc | lymph |
| `sinusoid:lumen` | wedge | sinusoid(s) |

**Vocabulary for lines:** portal vein (PV) · sinusoids = wedged pressure (WHVP) · hepatic vein = free pressure (FHVP) · IVC · right atrium (RA). In the lobule the figure says "Portal venule" and "Central vein"; lines pointing at those labels use the same words (the tract holds the venule). Use American spelling (esophagus, hemoglobin, gray).

---

### 6.4 Source line: `cite`

`cite: 'Baveno VIII 1.15, 1.16'` prints one small line under the line and any caveat, on a words slide or a panel slide, and in the handout. Cite Baveno VIII (never VII), EASL 2025 or AASLD 2024, matched to the statement; it counts in the card's fit, so keep it short.

---

## 7. The data card

### 7.1 `data`

* The pressure ladder is the Gut to heart chart, `tool: { kind: 'profile' }` (section 7.2): one chart on every card since 21 Oct. An old `data: 'ladder'` slide (an imported or captured deck) is read as that chart, its `ladderFrom`/`ladderFromLabel` as the chart's `from`/`fromLabel`; `brackets` and `block` are dropped. `key: ['hvpg','ppg']` still bolds those names in the words.
* `data: 'tiles'`: readout tiles only. `tiles: [..]` picks them (section 8.6); `key: [..]` highlights tiles (and bolds their words in the line).
* `delta`: shows each tile's change from another state: `true` (from the slide before), `false` (none), or **a slide `id`** (change from that slide's state). A slide that changes the same patient (no `preset`) counts from the slide before unless it says `delta: false`.
* A chart slide can carry tiles too: `tool: { kind: 'profile' }, data: 'tiles', tiles: [..]` puts the tiles beside it. Leave HVPG and PPG out: the chart's brackets show them.
* `dataTitle` renames the tiles or instrument card ("Circulation at 24 weeks"); the chart's card is "Pressure, gut to heart".
* Each tile has a scale bar coloured by its rating, a ring where it started and a dot where it is now, with "from X" or "No change" when it shows a change. After TIPS the PPG tile reads "Target met" (below 12 mmHg) or "Above target" instead of its usual rating.
* **A data card that stays.** When the next slide has the same instrument and options (`tool`), the same tiles, `dataTitle` and layout, the card stays on screen through the slide change and only the words swap; its readings ease to the new slide's numbers (the highlighted tile, `key`, may differ). Different tiles or an option of the instrument (`from`, `gate`, ...) build the card afresh. A recording instrument (the Doppler, the beat-by-beat trace, the vitals monitor) stays only while the patient stays, since a new patient starts its trace over; the new trace opens already full, with the last seconds of the slide's steady state drawn in, and records live from there. Slides with a `cath`, `question`, `hold` or a case card (`vignette`) always build their cards afresh. The exception is the HVPG catheter's own tracing (`tool: { kind: 'hvpg', catheter: true }` on `cath: 'free'`, `'wedge'` or `'result'`): the catheter carries on from one step to the next, so that card stays between them. A `lapse` always builds its words afresh (the lapse bar is in them), but keeps a matching data card when the card reads the live model (tiles alone, or an instrument such as the ladder, the flows bars, the FibroScan, the spleen or the HVPG tracing) and the patient stays: the card is up when the lapse starts and its readings climb with the days. A lapse with its own `params` opens on a patient of its own, and a recording instrument or a drawn chart (the Doppler, the vitals monitor, the beat trace, the flow-time chart, the talk trace) is built for a lapse as before. A new patient without a case card (a bare `preset`) does keep the card, which follows the model to the new patient. The same holds the other way round: two slides with the same words and the same patient keep the teaching card and swap only the data card. If the new slide's layout would change a kept card (a taller teaching card that makes the data card smaller), it leaves and comes back as usual.

### 7.2 `tool`: an instrument in the card (above the tiles if `data` is also set)

`title?` renames the card on any kind (a slide's `dataTitle` wins over it). When `data` is also set, the instrument sits above the tiles. On a phone the readings sit on a sheet tucked under the instrument's card, with a handle to pull them out (no Show button); on a laptop or a tablet on its side the pair folds behind Show only when it would not fit. `open: true` keeps the instrument open on a phone and folds the tiles instead.

| `tool` | Shows |
|---|---|
| `{ kind: 'doppler', vessel }` | spectral Doppler in one vessel; the sampled vessel glows white (ink on the light themes) and a small probe on the figure looks at it, with the sample gate in the middle of the lumen. `vessel` ∈ `PV_TRUNK` (MPV), `PVH_R`, `PVH_L`, `SMV_CONF`, `V_INT`, `SV_CONF`, `V_SPL`, `RHV_IVC`, `MHV_IVC`, `LHV_IVC`, `IVCS_RA`, `A_HEP`, `TIPS`, `DIPS`, `C1b` (varix), `C3` (paraumbilical vein). `waves: true` names a hepatic vein's a, S, v and D waves. On a stent, `gate` (`'proximal'` \| `'mid'` (default) \| `'distal'` \| `'site'`) picks the third it samples and `points: true` calls out the velocity at all three points on the figure. `delta` (`true` or a slide id; else the slide's own `delta`) shows the earlier reading as a ghost, labelled `deltaLabel`, else the lapse's `from`, else that slide's kicker, else "Before". The ghost works only on `PV_TRUNK` and is left out when a `pvVel` tile already shows the change. One set of flow cut-offs names slow, absent and backward flow in the reading, the figure's velocity labels, the sentences in Details, the tables and the stasis event: under 1 cm/s a vein has no flow (2 cm/s for a stent), under 9 cm/s is stasis, and a small backward flow near zero is not called reversed. Word a slide to match. On a meal slide add `lapse.clock: 'seconds'` (section 4) so the trace records the flow rising. |
| `{ kind: 'scope', air?, red?, readings? }` | the esophagus at this slide's varix state (endoscopy; **esophagus only**). Opt-in for the insufflation lesson, the model untouched: `air` (0 to 20, mmHg) is the pressure of the air in the lumen around the varix, which draws and measures the varix as it is seen at that pressure (the Diameter row reads that size; the Grade row stays the size at rest, and the pressure inside the varix, the HVPG and every tile stay as they are); `red: true \| false` shows or hides the red wale marks whatever the wall stress (left out, the model's rule applies; the Stigmata row follows); `readings: true` adds three rows after the wall: the pressure in the varix, in the lumen and across the wall (inside less lumen), mmHg, one decimal. Each slide sets its own options again when it is shown. Move `air` and `red` on a slide with a `whatIf` slider or `compare` buttons that name a `tool` (section 7.4). |
| `{ kind: 'fibroscan' }` | liver stiffness, kPa; shows a ghost reading as the Doppler does (`delta`, `deltaLabel`), left out when an `lsm` tile is on the slide |
| `{ kind: 'spleen' }` | a spleen ultrasound: a grey sector on the monitor's black with the spleen cut along its long axis, calipers end to end and the length (cm) written in the picture in white with a dark outline, as the FibroScan's reading is. The length is the model's, the slide's settled number once pinned, so it matches the `spleen` tile; one scale for every length (a bigger spleen is drawn bigger, the tile's bar ends at 22 cm). It redraws only when the length changes by 0.1 cm and eases between. A removed spleen reads "Spleen removed". Put the platelets in the slide's `plt` tile, not in the picture |
| `{ kind: 'vitals', show? }` | a black bedside monitor: the EKG strip across the top (a schematic rhythm timed to the model's heartbeat, as the beat trace's) and up to three vital signs under it as large numbers. `show` picks and orders them from `'hr'`, `'map'`, `'co'`, `'hb'` (default `['hr', 'map', 'hb']`). The pressure is the mean arterial pressure, named MAP: the model has no systolic and diastolic. A reading past its cut-off turns the monitor's alarm red, held and cleared as the bottom bar's are, so a patient on a cut-off does not flicker. The numbers are the slide's settled ones, so they read as its `hr`, `map`, `co` and `hb` tiles do. A recording kind: a new patient starts the strip over, and a card that kept its text across a patient change is cleared like the pressure trace. The strip opens already full: the model sends the last seconds of the steady state the slide opens on, and the card comes in with them drawn in, then records live from there. While the model's own clock stands still (a `lapse` of days on the disease clock, or a state easing in) the strip goes on by itself: it scrolls on the card's clock and lays beats at the heart rate shown, so over a year-long `lapse` the beats close in as the heart rate climbs, and the live beat takes over at the end with no jump |
| `{ kind: 'hvpg', catheter: true }` | the same tracing following the catheter on the figure: the slide has `cath: 'free'`, `'wedge'` or `'result'` and the card shows that step, the balloon sets the pressure's rise, and it stays up from one such slide to the next. |
| `{ kind: 'hvpg' }` | the HVPG catheter's tracing as a data card, with no catheter on the figure. Going forward onto the slide it plays the whole measurement: the free pressure, the balloon inflating, the climb to the wedge, then the result held (about 9 s). Jumped to, or gone back to, or when the instrument was already showing, it shows the finished tracing at once. When the model changes on the slide (a drug, a button, a time-lapse) the free and wedged levels ease to the new numbers. The HVPG it prints is the difference of the two readings as shown, so WHVP minus FHVP reads exactly |
| `{ kind: 'trace', range: 'talk' }` | portal, wedged, free pressure and HVPG at every slide so far (one point per state) |
| `{ kind: 'trace', range: 'beats' }` | live pressure trace, beat by beat: a thin schematic EKG strip over the portal pressure and the HVPG lane, as the card's room allows (the strip goes first on a short card, then the HVPG lane). The pressure lane holds the portal pressure alone; the HVPG lane is wedged minus free, with faint lines at 5, 10 and 12 mmHg. The strip is a rhythm timed to the model's own heartbeat (each QRS on a phase wrap), not a modelled ECG, and its end reading is the heart rate; say so in the first slide's `notes` that uses it. `ekg: false` leaves the strip off a slide, `hvpgLane: false` the HVPG lane. Put `params: { respiration: false }` on the first beat-trace slide of a run so the lines show the heartbeat alone (a later `preset` restores breathing; a Doppler slide that reads the hepatic vein's waveform keeps it) |
| `{ kind: 'abdomen' }` | the belly with its ascites and collaterals |
| `{ kind: 'wall' }` | the varix in cross-section: Laplace's σ (wall stress), r, w |
| `{ kind: 'flowtime' }` | portal pressure and portal flow around a meal, drawn as the slide's time-lapse plays (clock in minutes) |
| `{ kind: 'flowtime', clock: 'days', lines: [lower, upper] }` | the same chart over a disease time-lapse: two fingerprint keys from `pv pvFlow sin asc hvpg varix lsm`, one point a model day |
| `{ kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 } }` | a line the model has no number for, weight lost in %, is the slide's own: `given` is its end value, reached steadily over the time-lapse's ramp from 0 (left axis, from zero); the other line is still the model's (right axis). Say the number once in the slide's title and notes, and cite the statement in the notes (Baveno VIII 2.13: a weight loss of 10% or more goes with a fall in stiffness of 30% or more). On a laptop or tablet a model line in `lines` leaves the tiles, as on any chart over the days |
| `style: 'milestones'` on `trace` (`range: 'talk'`) | opt-in: the HVPG line alone in its cut-off colours, with the slides that set `milestone: 'Dx'` (a short name: `'Carvedilol'`, `'TIPS'`, `'Clot'`) named over it |
| `since: '<slide id>'` on `trace` (`range: 'talk'`) | opt-in: the chart starts at that slide's state and counts its days from there, so a deck that moves on to a new patient charts only that patient (a slide's `when` words its time point) |
| `bands: [keys]` on `trace` (`range: 'talk'`) or `flowtime` | opt-in: a soft band per treatment while it was on, named once. Keys `carvedilol propranolol terlipressin octreotide anticoag diuretics tips dips` |
| `{ kind: 'profile', from? }` | the Gut to heart chart, the one pressure chart on every card: the pressure from gut to heart through eight stations (the liver's three named Pre-, Intra- and Post- under one "sinusoidal" brace; Intra- shows the wedged pressure). Three soft tints mark the route's zones, named PRE-HEPATIC, INTRAHEPATIC and POST-HEPATIC in a strip over the plot (a chart too narrow for the names keeps the tints alone). The healthy line is dashed and named "Healthy" on itself, with mmHg in the bottom row. HVPG and PPG brackets sit inside the plot in their cut-off colours, each label inside its bracket, and the two readings stand as pills in the plot's top right. A red block stands on the station's column wherever the pressure falls more than 4 mmHg to the next station, from the portal vein on (the heart's own column when it holds the pressure up), so the chart shows where the resistance is without a `block` field. The chart keeps the card's full width and 12 px type; the card's fit only shortens it. `from: true` (the slide before) or a slide id adds a dotted "Before" line; `fromLabel: 'No Rx'` names it otherwise |
| `{ kind: 'flows', of? }` | opt-in: where the portal blood goes, as one bar across the card's full width, centred with its title; nothing at its left and nothing hanging from it. The bar is all the portal blood: the liver's segment first, then one segment per bypass route in its vessel colour, largest first (the liver part is 100 less the Shunted tile). The healthy model's split (the same baseline as the profile's dashed line; all of it to the liver in a healthy person) is a dashed bracket over the whole bar with "Healthy: liver 100%" centred above it, as the pressure ladder marks its Healthy line, so the liver's segment compares with the whole it would fill. A segment wide enough carries its name and percent in text with a halo; one that fits only its percent carries that; one too narrow for even that is named in a pill under the bar in its colour, the pills in the bar's order in rows centred on the card. No colour key, no second bar, no leaders. The card is 10 em tall and holds two rows of pills; on a card too narrow for every pill (a large text size), the smallest routes join Other until they fit. A name that moves between the bar and a pill fades out and in. The slide's tiles go under the card (never beside it). `of: 'inflow'` is one bar for the liver's inflow, portal vein then hepatic artery, across the card's full width and centred top to bottom, with nothing hanging under it: the healthy split is a dashed line over the bar where its portal blood ends, with "Healthy portal 73%" above it, and no second bar. A name too wide for its segment takes its short form ("Artery", "Portal"), then the percent alone; each name keeps 4 px clear of the line. The inflow card is 6 em tall |
| `{ kind: 'curve', param, from, to, step?, lines, also?, label?, unit?, against? }` | opt-in: one setting across its range against one or two readings (`lines: ['ppg', 'liver']`), cut-offs dashed, a ring where the slide sits; a what-if slider on the same setting moves the rings. `against: { label: 'Carvedilol', params: { drugs: { carvedilol: true } }, own: 'No drug' }` draws the first reading twice on one scale, the slide's own sweep and the same sweep with those params, each named on its line (a key at the top when the card is too small), a ring on each (no marks where the lines cross a cut-off) |
| `{ kind: 'causes', metric? }` | opt-in: a waterfall of what raises the reading (`metric`: `'ppg'` default, `'hvpg'`, `'pv'`), read top to bottom across the card: a "Healthy" bar at the healthy reading, one step per cause from the running total (right for a rise, left for a fall, its signed mmHg at the step's end, coloured by mechanism: resistance, inflow, heart, shunts, drugs; no key), a grey "Causes together" step for what the causes add only together (and the smaller ones left out), and a "Now" bar at the case's reading in its tile's rating colour. Dashed lines mark the cut-offs (PPG 6 and 12, HVPG 5 and 10, portal 10 and 15), numbered under the chart. At most five causes, fewer when the card is too short for their rows (the rest join "Causes together"); the printed numbers always add up to the tile's. Steps ease to new places when a compare button or what-if slider moves the model. Word the line for steps, not bars ("a step to the left takes pressure off"). The shares are the model's own: no line may quote them without the owner's OK and a source |
| `{ kind: 'plane', plane }` | opt-in: two readings on one plane with zones (`'csph'`: stiffness and platelets, Baveno VIII 1.15, 1.16, its zones named No CSPH, CSPH and Indeterminate on the plot with no key; `'hvpg-ppg'`), the slide's case a dot in proportion to the plot with a clear gap around it, which the zones' words keep 4 px from wherever it moves. See 7.3 for the panel and a deck's own plane |
| `{ kind: 'lumen', vessel?, site?, name? }` | opt-in: the vessel in cross-section (default `PV_TRUNK`): open lumen %, clot, narrowing, stent. The vessel's name sits in the circle above the % ("Portal vein"); a stent is named by where it is cut, `site` `'proximal'` (portal end), `'mid'` or `'distal'` (hepatic vein end), else the narrowing's `stenosisSite` (distal if unset): "Distal TIPS". A cut away from the narrowed segment shows the stent open there. `name` replaces the name (keep it to about a dozen letters so it fits the circle) |
| `{ kind: 'fluid', window?, forces?, caveat? }` | opt-in: lymph made against lymph drained, the build-up in the ascites colour and a sentence on what builds. `window: true` draws the day strip instead, in mL a day: the day's change first, then the lymph made (liver + gut), then one strip that splits the day on one scale into what the lymphatics carry (named inside, "full" once they can carry no more, or the room they have left as a dashed outline), what the belly reabsorbs and what builds, with a bracket over what leaked (title "Fluid balance · mL/day", no caveat line; the slide's Ascites tile gives the litres; its tiles sit under the card, not beside it). `forces: true` adds the Starling push and pull; the no-kidneys caveat shows by itself with diuretics. Model rates, not clinical figures |
| `{ kind: 'criteria', title, rows, ticks? }` | opt-in: a guideline's rules in the card (section 7.5) |
| Doppler options | opt-in: `mode: 'color' \| 'variance'` (color Doppler maps; a slide without it is Spectrum again), `calipers: true` (peak and trough marks over the last 3 s and the PI in the bottom strip), `pair: true` (a slim paired trace: the right hepatic vein under a portal vein, the main portal vein under a hepatic vein or the IVC), `scale: <cm/s>` (aliasing: the velocity scale fixed at ± that many cm/s, the Nyquist limit, so a faster spectrum wraps round to the other side of the baseline; the reading beside it stays the true velocity; don't combine with `calipers`), `baseline: 0.15–0.85` (with `scale`: where the baseline sits, 0 the top of the trace, 1 the bottom; default 0.5; lower makes room for flow toward the probe) |

### 7.3 `visual`: replaces the text and figure area with a full panel (the figure is dimmed behind)

| `visual` | Extra fields |
|---|---|
| `'outline'` | **Never write this**; added automatically. |
| `'ladders'` | `of`: the rows to draw, each as its own Gut to heart chart (slide ids; the grid holds six). A cell's first row holds the row's `kicker`, tinted by its `site`, and its `name` (else its title), which steps down to 12 px to fit beside the kicker and goes under it if it still does not fit. Each chart names the healthy line and shows its red resistance block, with no HVPG pill. On a phone each case is one line of readings with the red blocks, and the stations are named once over the six. |
| `'table'` | `cols` (columns), `asc` (show SAAG and protein columns: `true`/`false`; default true only if `cols` is absent), `rowHead` (first column heading, default `'Level'`), `note` (heading of a text column, or an array of headings), `vs: 'first'` (arrows against the first row), `foot` (one sentence after the legend), `calm: [cols]` (changes in those columns are neither better nor worse: no green or red, as a meal's small PPG rise), `of` (rows). Pressures print in whole mmHg. A tap on a row goes to its slide; a tap on a heading shows its cut-offs. |
| `'scale'` | `scale: { key, max, low, marks: [[value, words, shortName?], …], sub?, rules? }`. One number on a banded axis, each row a numbered dot. `max` defaults to 20; `low` names the first band and each mark's `shortName` (else its `words`) the band above it. `sub` adds readings under each row (a tile key or a list, `['hvpg', 'plt']`). `rules: [..]` prints each band's rule in words under the axis (Stiffness). |
| `'quadrant'` | SAAG × protein quadrant (`of`: rows; a row with no ascites is left out). |
| `'walls'` | two wall panels: the gut capillary wall holds protein back, the liver sinusoid lets it through. Not Laplace; the varix's Laplace picture is `tool: { kind: 'wall' }`. |
| `'plane'` | opt-in: `plane` (`'csph'`, `'hvpg-ppg'`, or a deck's own `{ x, y, zones, boxes?, cuts?, source, base? }`; zones take `when: [[key, op, value], …]`) and `of`: one named point per row (`short`: a shorter name for tight spots). A key lists each zone's rule and source; a plane with `key: false` (`'hvpg-ppg'` sets it) has no key beside the plot, which takes the width and names every zone in it (an iPhone still shows the key under the plot); `key: 'never'` (`'csph'` sets it) leaves the key off on every device and in the card, with only the source line under the plot, and `edges: true` draws the cut-offs only where two zones meet. Zone words must be checked against the guideline. |

Opt-in table column: `wave` (about two beats of each row's Doppler, `wave: 'PV_TRUNK'` on the slide or per row, one shared scale, `waveMax` to change it). `focusRow: '<slide id>'` (or a row's `key`) tints one row and quiets the rest.

Table column keys (`cols`): `pv whvp fhvp ivc ra hvpg ppg sin varix gv asc liver shunt saag tp plt lsm spleen map hr hb co bv pvFlow res` (the keys of `COLS` in `src/ui/table-marks.js`; `gv` heads as Fundal, `co` as Output and `bv` as Volume; a table flags only a low output or volume, since a high one is gray information). Any other key prints its raw name as the heading with no cut-offs, and `tests/deck-review-bugs.test.js` fails it: give every column a `COLS` heading. Default `cols`: `['pv','whvp','fhvp','ivc','ra','hvpg','ppg']`.

**`of` rows** are slide ids (strings, or `{ id, title?, kicker?, note?, … }` to relabel a row) or patients no slide shows: `{ preset, title, kicker?, note?, blank?: [columns], ref?: true }`. `title` labels a row in tables and ladders; `name` labels it on a scale, a quadrant and the first row of a ladders grid (default: its title; give a long title a short `name` there, the grid keeps it on one line at 12 px or more). `ref: true` marks a reference row (keeps its numbers); a row's `vs` (a slide id, or another row's `key`) compares it with that row instead; `note` is the text column's words (string, or array for several note columns); `blank: [cols]` shows "not measurable" for those columns; `calm: [cols]` as on the slide, for that row only; `site` colours the row label (default: the slide's). Extra patients can also carry `params` and `days`.

Visuals may also carry `cam` (how the dimmed figure is framed).

### 7.4 `compare` and `whatIf`: acting on the live model

`whatIf: { label, param, min, max, step?, ends?: [low, high], unit? }` puts a slider on the slide that drags one parameter of the live model (`param` is a dotted path: `'cirrhosis'`, `'tips.d'`, `'thrombus.PV_TRUNK'`, or an array of paths moved together, such as both lobes' fibrosis). The figure, ladder and tiles follow it; it starts at the slide's own value (the first path's), a ring marks where it started, and the slide's computed state returns whenever the slide is shown again. `step` defaults to a twentieth of the range. `ends` names the two ends of the slider (`['None', 'Severe']`). The value is printed only when `unit` is set; a label that starts with the unit ("Weeks pregnant", `unit: 'weeks'`) prints the bare number. The value stands in a box as wide as the widest it can show, set in tabular figures, so the words' row never reflows as it moves; the first move holds the teaching card and the data card as they came in, for a slider on the model and one on an instrument alike (`tool`). A time-lapse's "Day 12 of 30" counter has the same fixed box. Put it on key slides only, where the student can try the change.

`whatIf: { label, tool, min, max, step?, unit? }` (a `tool` in place of `param`) moves one option of the slide's instrument and leaves the model alone: nothing is sent to the worker and no tile moves. `tool` names the option (`'air'` on the scope, the pressure of the air in the lumen); the slider starts at the slide's own `tool.air` (else `min`), and the instrument is set to the slide's options again whenever the slide is shown. The insufflation lesson uses it: `whatIf: { label: 'Esophageal air pressure', tool: 'air', min: 0, max: 20, step: 1, unit: 'mmHg' }`. Only the scope has options to move today.

`procedure: 'tips' | 'brto' | 'bato'` (or `{ kind, auto: true }`) puts a "Play TIPS" (or BRTO, BATO) button on the teaching card that plays that catheter procedure on the figure, on the real vessels: a TIPS from the right internal jugular vein through the right hepatic vein, with a needle across the liver into the right portal vein; BRTO up from the femoral vein through the left renal vein into the gastrorenal shunt; BATO through the liver into the portal vein and along the splenic vein into the short gastric feeder. The camera follows the catheter, closes in on the balloon, the sclerosant or the stent, and goes back. When it ends, the live model takes the change, as a `compare` button does: the TIPS is on (8 mm), or the gastrorenal shunt is closed. With `auto: true` it plays as the slide lands, going forward only. On a slide whose patient already has the result (the BRTO slides in Gastric varices and Shunts show the shunt closed), Play first takes the change back on the live model, so the shunt opens again while the catheter travels, and the procedure then closes it; the slide's treatment buttons follow. The patient must have the vessels it uses (a gastrorenal shunt for BRTO and BATO, the `gastric-varix` preset for example), a right hepatic vein that is not clotted for a TIPS and a portal vein that is not clotted for BATO; otherwise the button is dimmed and says why. Leaving the slide stops a procedure where it is. Playing one ends a running time-lapse first, and it does not start while the HVPG catheter (`cath`) is on the figure, so do not put both on one slide. Opt-in: a built-in slide uses it only when `tests/deck-adopted.js` lists it. Sites asks it on the slide that sets the six levels on one chart ("Which of the six raised the HVPG?"); its level slides no longer carry a case question, a what-if slider or a causes list (the causes live in the notes, the periportal fibrosis slider on the presinusoidal talk's "tract" slide). The same three play from the buttons under Tests › HVPG.

#### `compare`: live treatment buttons

`compare: [{ label, params, own?, short? }, …]`: buttons switch the live model between treatments in real time. `params`: each option's **full set of the switched keys** (switch off the others: e.g. every drug flag), `own: true` marks the option that is the slide's own state. An `own` option may leave out `params`: it then eases back to the slide's exact state. `short` is a compact label a phone uses where the full names would wrap (`'Prop.'`). Use with `data` so the numbers update.

On a stent Doppler slide, `{ label, gate, own? }` buttons move the Doppler's gate (`'proximal'`, `'mid'`, `'distal'`, `'site'`) without touching the model (TIPS Doppler's working stent). A button with `params: { stenosisSite: { TIPS: 'mid' } }` moves the narrowing itself, and the gate `'site'` follows it (TIPS Doppler's narrowed stent).

`{ label, tool: { red: false }, own? }` buttons change the options of the slide's instrument, the model untouched: the patch is laid over the slide's `tool`, and the `own` button puts the slide's own options back (the insufflation lesson's No red signs / Red signs; TIPS Doppler's aliasing slide, As scanned / Baseline down). Keep the slide's `tool` itself free of the option the buttons switch, so the card stays the same as the slides beside it (section 7.1).

A button can name another patient instead: `compare: [{ label: 'Normal heart', preset: 'healthy' }, { label: 'Failing heart', own: true }]`. The live model eases to that patient (computed with the slide's states), and the `own` button eases back to the slide's exact state. A patient button may also carry `params` and `days`, as an `of` row does: `{ label: 'No anticoagulation', short: 'None', preset: 'pvt-acute', params: {}, days: 180 }` shows the acute clot left alone for 180 days (Pre-hepatic's anticoagulation slide). Give a button a `short` label when the full names would wrap on a phone. A button can also name an earlier slide of the same deck, one patient's earlier visit: `compare: [{ label: 'Before the stent', slide: 'reasons' }, { label: 'With the stent', own: true }]` eases the live model to that slide's state and back (TIPS journey's stent slide). On a catheter slide the catheter's callouts and its monitor follow the live model with the tiles.

### 7.5 Teaching features (opt-in, 25 Oct)

These help a slide make the room think before it tells. Each is opt-in: a built-in slide uses one only when `tests/deck-adopted.js`
lists it, and `tests/teaching-features.test.js` checks both the decks and the wiring.

**`hold: true`: the answer held back on a question slide.** On a question slide the data card can give the answer away: the Gut to heart
chart's red block stands on the station the question asks for, and the Doppler's top strip prints "Hepatofugal" or "No flow". With `hold:
true` the card keeps back what names the answer: the chart draws its line, stations, numbers, healthy line and the HVPG and PPG pills, but no
red blocks and no HVPG or PPG brackets; the Doppler trace runs and its velocity reads, but its direction, pattern and note stay blank; tiles
show their numbers but not their rating words; and the figure's "no flow" and "stasis" words stand down. The next slide, its answer (same
patient, no `preset`), comes in still holding them, and once its cards have landed they ease in (the blocks fade up, the words fade in);
nothing snaps. Going back or jumping to an answer slide shows it whole. Use it on every question slide of a question-and-answer pair (rule
23): No deck holds a question slide now. (Doppler of the portal system, which took in Read the Doppler's cases on 25 Oct, Stiffness, platelets and the first visit, which took in the first visit's, and Where is the resistance? show each case on one slide: the case card asks, the slide answers, and nothing is held.)

**The criteria card: `tool: { kind: 'criteria', title, rows, ticks? }`.** A guideline's rules as up to four rows in the data card, where
every screen shows them (a phone never shows the `causes` line, and a tight laptop drops it). Write each row as a string, as
`{ text, note?, lit? }` or, for a rule the model can read, as `[text, key, op, value]` (or `{ text, key, op, value }`): `key` is a tile key
(section 8.6), `op` one of `>=`, `>`, `<=`, `<`, and `value` in the tile's own units (`['No ascites off diuretics', 'asc', '<', 0.15]`
reads litres, as the Ascites tile does). A live row ends on its reading as its tile prints it, with a quiet tick when met and a dash when
not, and follows the model as the tiles do. `note` is the case's own value in a few words at the row's right ("C 10", "B 8, not
bleeding"); `lit: true` sets the row that applies to the case in full-white words (the other rows stay quieter; rows are split by a hairline, as the quick check's, with no fills). `ticks: false` leaves the marks off, for a classification such as the
Sarin classes. `title` names the card (keep it under about 36 characters; `short` is a phone's shorter title). The slide's tiles sit under
the card, never beside it. Give the slide no `causes` with the same list, and check every row's words against the guideline.
Since 26 Oct the card reads like a handbook page (V3): its title and its rules are set in the serif, and four more fields are opt-in.
`lead` is one short sentence on how the rows combine ("Any one of these is enough."). `rule` is the guideline and its statement
numbers in an outlined pill ("Baveno VIII 5.31"); give it only when the slide's notes cite those numbers (a test checks this).
`verdict` is a line at the foot, its words up to the first colon in bold ("He qualifies on the first rule: a TIPS within 72 hours.").
A list with no cut-offs (Look first for, Watch for, Before the stent, the Sarin classes) puts a mark at each row's left: a ring for a thing to check, and
the ring filled on the row that applies to the case (`lit: true`, or a live row the model meets), so outlined is the rule and filled is the case. Set `ordered: true`
when the order matters ("In this order.") and the rings become 1, 2, 3. Mark each row's key words with `**...**` ("**Infection** or **bleeding**"), the
finding and not its qualifier ("Neonatal **bradycardia**"); they take full ink on the quieter words, and go quiet themselves when one row applies. A lead
that only reads after its list ("Treating them comes first.") goes in `verdict`, not `lead`, so that "them" has something to point at. A lit row needs no marked words.
On a row, `cut` is its cut-off ("C 10–13", "≥20 mmHg"), set large at the row's left on a card 480 px wide or more and dropped on
narrower ones, and `met: true` or `met: false` says whether the case meets it. Any `note` or live row gives the card a "This case"
column, set apart by space alone, with no vertical line. A met row shows its note large with "meets it ✓" under it; `met: false` adds
a quiet "not met"; a note with neither `met` nor `lit` is a quiet word ("not B"). Used on
Variceal bleed 8, Choose the treatment 2, Recompensation 7, Gastric varices 2, Pregnancy 6 and 7, Paracentesis 8, Encephalopathy 4, Stiffness 5, Ten years 13 and 14 and TIPS and shunts 4 and 5.

**Question card: `question: 'One short question?'`.** The room is asked before the slide teaches, and the slide is the answer. Going forward
one step onto the slide, the case card's glass comes up over the figure as it stands, tagged Question, with the question in large type and
nothing else: no choices, no answer line, nothing stored or scored. There is no camera retreat and no new patient. A tap, Next or a swipe
lifts it, and the slide goes on behind it. Put it on a slide that shows the answer by changing the model (`params`, `action`, `days`, a
`lapse`), has a control the learner moves (`compare`, `whatIf`) or is a `visual`; never on one with a `preset`, a `vignette`, a `cath` or a
`procedure`, which bring their own patient or card. A slide that changes the model lands holding the state before the change, its data card
showing those numbers, and plays the change once the card is lifted (the time-lapse, or the eased change a `compare` button makes) with the
numbers following. Jumped to, or gone back to, the slide shows as any other. Write one question under 100 characters, starting with a
capital and ending in a question mark, with no number in it. At most one question card in any three slides, one per section and three per deck, never two in a
row. The handout prints the question before the slide's words, with no answer line. Used on Circuit 6, The circulation in cirrhosis 8, Next bleed 4, Lowering portal pressure 4 and
Variceal bleed 4 and 7 (the first four slides asked with Predict until 25 Oct; Predict is gone, its choices and its reveal with it). A built-in slide
uses it only when `tests/deck-adopted.js` lists it.

```js
{ id: 'both', ...MEAL, question: 'Will the same meal raise the gradient more, or less?', /* …the slide as before… */ }
```

---

#### The HVPG response tile: `hvpgResp`

Three decks teach that a fall in HVPG is a response, and a tile can now show the percent. On a `data: 'tiles'` slide, add
`hvpgResp: '<slide id>'` (or `true` for the slide before) and the card gains one more tile, **HVPG fall**: the fall from that slide's
HVPG, in percent, read live as the other tiles are, so a compare button or a time-lapse moves it. Its bar runs from 0 to 40% with
marks at 10% and 20%; its line says which HVPG it counts from ("from 18.0 mmHg"); its word is "Under 10%" (red), "≥ 10%" (amber, a
response before any bleed), "≥ 20%" (green, a response after a bleed too), or "≤12 mmHg" (green) when the HVPG has come down to 12
or less. Count from the untreated patient, not from the drug before: on Lowering portal pressure 5 the fall is from slide 2, the untreated patient,
though the slide before is carvedilol. Used on Next bleed 5, Lowering portal pressure 3 to 5 and Ten years 5. (HVPG 5 is left out: it shows the
catheter and the equation only, with no tiles.)

#### The bleed clock: `clock`

The bleed decks' timings are their most-tested facts, so a tiles slide can show where the case stands on them. `clock: { at: 10,
label: 'Scope by 12 h' }` adds one tile under the slide's tiles, **Since the bleed**: the hours (`at`, 0 to 72) as its number, the
label as its word, and a tile's own bar from 0 to 72 hours with marks at 12 (the scope, Baveno VIII 5.18) and 72 (a pre-emptive
TIPS, 5.31). The dot eases along the bar from one slide to the next. The hours are the clinical timeline the slide's words give, not
the model's clock, which runs faster; never let them run backward through a deck (the test checks). Keep the label short, a few
words ("Drugs at once", "TIPS by 72 h"). Beside an instrument on a Mac the tile runs the card's full width under the two. Used on
Variceal bleed 3 to 8, Gastric varices 5 and Choose the treatment 2.

## 8. Catalogue

### 8.1 Patient presets (`preset`)

| id | Group → site | Label | Own disease days | What it is |
|---|---|---|---|---|
| `healthy` | Normal | Healthy | 0 | HVPG ≈ 3, portal flow ≈ 1.1 L/min |
| `postprandial` | Normal | Post-prandial | 0 | a meal has taken hold (`meal: 1`): the gut arterioles dilate and the healthy portal flow rises by about half |
| `pvt-acute` | Prehepatic (`pre`) | Acute portal vein thrombosis | 0 | clot in `PV_TRUNK`; HVPG normal |
| `pvt-chronic` | Prehepatic | Chronic PVT (cavernous transformation) | 240 | cavernoma collaterals |
| `svt` | Prehepatic | Splenic vein thrombosis (sinistral PH) | 180 | clot in `SV_CONF`, fundal varices |
| `schisto` | Presinusoidal (`presin`) | Schistosomiasis / NCPH | 365 | high portal, normal wedged, HVPG normal |
| `cirr-comp` | Sinusoidal (`sin`) | Compensated cirrhosis | 365 | cirrhosis 0.4, HVPG 6–9, no varices |
| `csph` | Sinusoidal | Clinically significant PH | 365 | cirrhosis 0.6, HVPG ≥ 10, small varices |
| `cirr-decomp` | Sinusoidal | Decompensated cirrhosis | 540 | cirrhosis 0.85, albumin 2.8, diuretics; large varices, ascites |
| `cirr-hepatofugal` | Sinusoidal | End-stage cirrhosis, hepatofugal flow | 540 | cirrhosis 0.95, arterioportal shunting, splenorenal shunt |
| `gastric-varix` | Sinusoidal | Cirrhosis with gastrorenal shunt | 450 | isolated fundal varices (IGV1) fed by the short and posterior gastric veins, draining through the `C5` gastrorenal shunt (BRTO target); no esophageal varices until BRTO closes the shunt |
| `pregnancy` | Sinusoidal | Cirrhosis in pregnancy | 365 | cirrhosis 0.62 (small varices, HVPG about 12), then `gestation: 24` once the disease days have run; `params: { gestation: 0 }` shows her before pregnancy |
| `sos` | Postsinusoidal (`postsin`) | Sinusoidal obstruction syndrome | 21 | central-vein resistance |
| `budd-chiari` | Posthepatic (`post`) | Budd–Chiari | 60 | all three hepatic veins occluded |
| `ivc-web` | Posthepatic | IVC web | 90 | suprahepatic IVC stenosis |
| `rhf` | Cardiac (`cardiac`) | Right heart failure + TR | 60 | HVPG stays normal; pulsatile portal vein |
| `constrictive` | Cardiac | Constrictive pericarditis | 60 | high RA, HVPG normal |

`ivc-web`, `rhf` and `constrictive` also load extra blood volume (800, 1300 and 600 mL) with the patient.

### 8.2 Parameters (`params`, deep-merged; ranges are clamped)

| Key | Type / range | Meaning |
|---|---|---|
| `cirrhosis` | 0–1 | macro severity of cirrhosis |
| `fibrosis` | `{ R: { pre, sin, post }, L: { … } }`, each 1–80 | resistance multipliers by zone and lobe (right, left) |
| `stenosis` | `{ edgeId: 0–0.95 }` | lumen narrowing (e.g. `{ IVCS_RA: 0.6 }`, a web) |
| `stenosisSite` | `{ stentId: 'proximal' \| 'mid' \| 'distal' }` | which third of a stent (`TIPS`, `DIPS` or a custom shunt) holds the narrowing that `stenosis` sets (`{ TIPS: 0.6 }`); distal when unset |
| `thrombus` | `{ edgeId: 0–1 }` | occlusion (e.g. `{ PV_TRUNK: 1 }`, `{ TIPS: 1 }`) |
| `splenicRx` | 0 \| 1 \| 2 | none / partial splenic artery embolization / splenectomy |
| `splanchnicTone` | 0.4–2.5 | gut arteriolar resistance multiplier (< 1 = vasodilated). A meal is not set here: use `meal` |
| `meal` | 0–1 | how far a meal has taken hold (0 fasting, 1 the 30-minute peak). It lowers the gut arterioles' tone so that a healthy liver's portal flow rises about 50% and its velocity about 47%; a gut that cirrhosis has already dilated responds less (CSPH about 28%). Ramp it `[0, 1]` in a meal time-lapse (section 4) |
| `systemicTone` | 0.4–2.5 | systemic resistance |
| `contractility` | 0.15–1.6 | heart contractility |
| `tr` | 0–1 | tricuspid regurgitation |
| `pericardial` | 0–1 | pericardial constriction |
| `albumin` | 1.5–5 g/dL | serum albumin |
| `gestation` | 0–40 weeks | pregnancy (0 = not pregnant): blood volume, cardiac output and portal inflow rise; after 20 weeks the uterus also raises the pressure in the abdomen |
| `habrStrength` | 0–2 | hepatic arterial buffer response |
| `fenestrae` | 0–1 | how far the sinusoid wall's closed pores are opened again (0: as the disease has them, 1: all open). Protein crosses again and the hepatic lymph runs faster, while the scar, the resistance and the HVPG stay as they were. the Lobule deck's cirrhosis slide uses it for its Open and Closed buttons |
| `apShunt` | 0–1 | arterioportal shunting |
| `respiration`, `pulsatile` | boolean | breathing, pulsatile flow |
| `respDepth` | 0–3 | breathing depth |
| `spontaneous` | `{ C5: bool, C6: bool }` | gastrorenal shunt (C5), spontaneous splenorenal shunt (C6) present. C5 is absent by default; fundal varices need it |
| `isolatedGV` | boolean | isolated fundal varices (IGV1): the coronary vein never forms esophageal varices. Set by the `gastric-varix` preset |
| `occluded` | `{ collateralId: true }` | plugged collaterals, any collateral id (BRTO: `{ C5: true }`, which also closes its feeder `C2`; Circuit closes all of them) |
| `tips` | `{ on: bool, d: 6–12 mm }` | TIPS stent and diameter (default 8) |
| `dips` | `{ on: bool, d: 6–12 }` | direct intrahepatic portosystemic shunt |
| `portocaval`, `dsrs`, `mesocaval` | boolean | surgical shunts (portocaval, distal splenorenal, mesocaval) |
| `customShunts` | `{ X_<portal>_<systemic>: 4–16 mm }` | custom shunt (not used by existing decks) |
| `balloonEso`, `balloonGas` | boolean | tamponade balloons |
| `anticoag` | boolean | anticoagulation |
| `diuretics` | boolean | spironolactone + furosemide |
| `drugs` | `{ propranolol, carvedilol, terlipressin, octreotide }` booleans | drugs. Switch the previous drug off in the same patch when moving to the next. Terlipressin raises the mean arterial pressure by about 5 to 10 mmHg and slows the heart in decompensated cirrhosis; carvedilol lowers it |
| `bleeding`, `deterministicRupture` | boolean | variceal rupture behaviour (leave to `action`) |

Patch only what you need: `params: { drugs: { carvedilol: true } }`.

### 8.3 Actions (`action`, one object or an array)

| `kind` | Fields | Effect |
|---|---|---|
| `band` | none | one banding session on the esophageal varices, at most 4 counted; each shrinks the varix and narrows the coronary-vein channel, and 4 close it. Bands slough over time (about one session's effect lost every 50 days), so varices can recur. A band also stops an esophageal varix bleed |
| `paracentesis` | `mL`, `albumin?` | drain ascites (e.g. `8000`). With `albumin: true` serum albumin rises 0.3 g/dL per 5 L drained; without it, draining more than 5 L causes post-paracentesis circulatory dysfunction |
| `hemorrhage` | `mL` | blood loss (e.g. `1000`) |
| `infuse` | `fluid`: `'crystalloid'` (1 L), `'prbc'`, `'albumin'`, `'plasma'` | infusion, running over 10 to 15 minutes of model time; albumin also raises serum albumin by 0.25 (to at most 4.5) |
| `rupture` | `site?` (`'VAR'` default), `tear?` (0–1, default 0.6) | a varix tears and bleeds |
| `stopBleed` | none | bleeding stops (clot) |
| `valsalva` | `sec?` (default 10) | a Valsalva strain |

### 8.4 Stations (node ids for `labels`, `terms`, `[word](ID)`, and catheter/circuit work)

Figure label text on the anatomy is the SHORT name. Station labels hidden on the anatomy: `AO UPPV LOWV KID_R RRV HA ILI SVD`.

| Id | Full name | Figure label | Kind |
|---|---|---|---|
| `INT` | Intestinal capillary bed | Gut bed | bed |
| `COL` | Colon / rectal bed | Colon | bed |
| `SPL` | Spleen (red pulp) | Spleen | bed |
| `STO` | Gastric bed | Stomach | bed |
| `SMV` | Superior mesenteric vein | SMV | portal |
| `IMV` | Inferior mesenteric vein | IMV | portal |
| `SV` | Splenic vein | Splenic vein | portal |
| `LGV` | Left gastric (coronary) vein | Left gastric vein | portal |
| `CONF` | Portal vein (main) | Portal vein | portal |
| `PVH` | Portal vein (hilum) | Hilar portal vein | portal |
| `RPV` | Right portal vein | Right portal vein | portal |
| `LPV` | Left portal vein | Left portal vein | portal |
| `VAR` | Esophageal varices | Varices | varix |
| `GV` | Gastric fundal varices | Fundal varices | varix |
| `SIN_R` / `SIN_L` | Sinusoids, right / left lobe (inlet) | Right / Left sinusoids | liver |
| `CV_R` / `CV_L` | Central veins, right / left lobe | Right / Left central vein | liver |
| `W_R` `W_M` `W_L` | Wedge compartment (RHV, MHV, LHV) | Right / Middle / Left wedge | wedge |
| `RHV` `MHV` `LHV` | Right / middle / left hepatic vein | Right / Middle / Left hepatic vein | hepatic vein |
| `IVCI` | IVC (renal level) | Lower IVC | vein |
| `IVCS` | IVC (suprahepatic) | IVC | vein |
| `RA` | Right atrium | Right atrium | heart |
| `SVC` | Superior vena cava | SVC | vein |
| `AZY` | Azygos vein | Azygos | vein |
| `ILI` | Iliac veins | Iliac vein | vein |
| `EPI` | Epigastric / umbilical veins | Umbilicus | vein |
| `KID_L` | Left kidney | Left kidney | bed |
| `LRV` | Left renal vein | Left renal vein | vein |
| `AO` `HA` `UPPV` `LOWV` `KID_R` `RRV` | Aorta, hepatic artery, upper-/lower-body veins, right kidney, right renal vein | (hidden on the anatomy) | |
| `SVD` | Splenic vein (midway), where the splenorenal shunts leave | (hidden) | portal |

Organ captions drawn on the plate: Liver, Stomach, Spleen, Colon, Kidney, Small bowel, Esophagus, Right atrium.
On the circuit view the zones are captioned: Splanchnic beds · Portal veins · Liver · sinusoids · Hepatic veins · IVC · Heart.
Normal station pressures (mmHg): AO 93, PV (CONF) 7.8, SIN_R 7.0, central veins 4.8, RHV 4.1, IVCS 3.5, RA 3.0. The model's healthy targets: HVPG 3, PV 7.5, FHVP 4, RA 3, IVC 3.5.

### 8.5 Vessels (edge ids for `mark.edges`, `glow`, `tool.vessel`)

Portal side: `V_INT` jejunal and ileal veins · `V_COL` colic veins · `V_IMV` inferior mesenteric vein · `V_SPL` splenic vein (distal) · `V_STO` gastric veins · `SMV_CONF` superior mesenteric vein · `SV_CONF` splenic vein (proximal) · `SV_MID` splenic vein (mid: from the point midway along it, node `SVD`, where the splenorenal shunts leave, on to the confluence) · `LGV_CONF` left gastric (coronary) vein · `PV_TRUNK` portal vein · `PVH_R` right portal vein · `PVH_L` left portal vein.
Liver: `PRE_R` / `PRE_L` portal venules · `SIN_RR` / `SIN_LL` sinusoids · `POST_R_RHV`, `POST_R_MHV`, `POST_L_LHV`, `POST_L_MHV` central veins → hepatic veins · `CAUD` caudate veins · arteries `A_HEP`, `A_HR`, `A_HL` · arterioportal `AP_R`, `AP_L`.
Veins to the heart: `RHV_IVC`, `MHV_IVC`, `LHV_IVC` hepatic veins · `IVC_IS` IVC · `IVCS_RA` IVC (suprahepatic) to the atrium · `SVC_RA` · `V_UP` brachiocephalic · `AZY_SVC` azygos arch · `LRV_IVC` / `RRV_IVC` renal veins · `V_KID_L` · `ILI_IVC` · `EPI_ILI`, `EPI_SVC` epigastric veins.
Collaterals: `C1a` coronary vein → esophageal varices · `C1b` esophageal varices → azygos · `C2` short/posterior gastric veins · `C3` paraumbilical vein · `C4` rectal (superior ↔ middle/inferior rectal veins) · `C5` gastrorenal shunt · `C6` spontaneous splenorenal shunt · `C7` retroperitoneal (Retzius) veins · `C8` periportal collaterals (cavernoma) · `C9` ascending lumbar → azygos.
Interventions: `TIPS` · `DIPS` · `S_PC` portocaval · `S_DSR` distal splenorenal (Warren) · `S_MC` mesocaval.
Named sets (opt-in, for `glow`, `spot`, `mark.edges`): `@portal`, `@hepatic-veins` (`RHV_IVC MHV_IVC LHV_IVC`), `@collaterals` (`C1a`, `C1b`, `C2`–`C9`), `@esophageal` (`LGV_CONF C1a C1b AZY_SVC`), `@gastrorenal` (`C2 C5 LRV_IVC`), `@splenorenal` (`C6 LRV_IVC`), `@shunts` (`TIPS DIPS S_PC S_DSR S_MC`), `@caval`, `@gut-arteries` (`A_SMA A_IMA A_SPL A_LGA`). A vessel the patient lacks is skipped.

Edge tones used when you glow an id by hand: portal vessels follow their station colour; collaterals and shunts (`C3`–`C9`, `S_PC`, `S_DSR`, `S_MC`) use the varices' colour `var`.

### 8.6 Tiles (`tiles`, `key`, `{token}`, table `cols`)

The ratings mirror `RATE` in `src/ui/table-marks.js` exactly; each judges the value as its tile prints it (4.98 L shows "5.0 L" and reads Grade 3). Amber and red are the tile's colours; a summary table's ↑ and ↑↑ use the same cut-offs (`CUT`).

| Key | Name | Unit | Normal | Amber | Red |
|---|---|---|---|---|---|
| `hvpg` | HVPG (wedged − free) | mmHg | under 5 | 5 or more "Mild" | 10 or more "CSPH" |
| `ppg` | PPG (portal − IVC) | mmHg | under 6 | 6 or more "High" | 12 or more "Bleed risk" |
| `pv` | Portal vein pressure | mmHg | 10 or less | over 10 "High" | 15 or more "Severe" |
| `sin` | Sinusoidal pressure | mmHg | under 9 | 9 or more "High" | 12 or more "Severe" |
| `whvp` | WHVP (wedged hepatic vein) | mmHg | 10 or less | over 10 "High" | 15 or more "Severe" |
| `fhvp` | FHVP (free hepatic vein) | mmHg | 8 or less | | over 8 "High" |
| `ra` | Right atrial pressure | mmHg | 8 or less | | over 8 "High" |
| `ivc` | IVC pressure | mmHg | 8 or less | | over 8 "High" |
| `saag` | SAAG (serum − ascites albumin) | g/dL | under 1.1 "Not portal" | | 1.1 or more "Portal HTN" |
| `tp` | Ascites protein | g/dL | under 2.5 "Low", 2.5 or more "High" (both gray) | under 1.5 "SBP risk" | |
| `asc` | Ascites volume | L | under 0.15 "None" | under 1.5 "Grade 1" | under 5 "Grade 2", 5 or more "Grade 3" |
| `varix` | Esophageal varix diameter | mm | under 2.5 "None" | 2.5 or more "Small" | 5 or more "Large" |
| `gv` | Gastric varix diameter | mm | same as `varix` | | |
| `spleen` | Spleen length | cm | 13 or less | over 13 "Large" | over 16 "Large" |
| `plt` | Platelets | × 10³/µL (88 = 88,000/µL) | 150 or more | under 150 "Low" | under 100 "Severe" |
| `pvFlow` | Portal vein flow | L/min | "Hepatopetal" (uncolored) | | below 0 "Hepatofugal"; 0 "No flow" |
| `pvVel` | Portal vein velocity (Doppler, main portal vein) | cm/s | 15 or more | under 15 "Slow" | under 9 "Stasis"; below 0 "Reversed" |
| `liver` | Liver flow, % of normal | % | over 75 | 75 or less "Low" | 55 or less "Severe" |
| `shunt` | Portal blood bypassing the liver | % | under 10 "Small" | 10 or more "Moderate" | 30 or more "Large" |
| `map` | Mean arterial pressure | mmHg | 65 or more | | under 65 "Low" |
| `hr` | Heart rate | /min | 60 to 100; under 60 "Slow" is gray, not a warning | | over 100 "Fast" |
| `lsm` | Liver stiffness (FibroScan) | kPa | under 10 | 10 or more "cACLD", 15 or more "Borderline" | 25 or more "CSPH" |
| `salb` | Serum albumin | g/dL | 3.5 or more | under 3.5 "Low" | |
| `hb` | Hemoglobin | g/dL | 12 or more | under 12 "Low" | under 7 "Severe" |
| `co` | Cardiac output | L/min | 4 to 8 (resting adult); over 8 "High" is gray, not a warning | | under 4 "Low" |
| `bv` | Blood volume | L | 4.5 to 5.5 (about 70 mL/kg); over 5.5 "High" is gray, not a warning | | under 4.5 "Low" |
| `he` | Encephalopathy risk (the model's index, 0 to 1) | index | under 0.2 "Low" | 0.2 or more "Moderate" | 0.45 or more "High" |

Status words: Normal, then High (or Low), then Severe, except where the table names others (HVPG Mild/CSPH, PPG High/Bleed risk, stiffness cACLD/Borderline/CSPH, varices None/Small/Large, shunt Small/Moderate/Large). The spleen reads Large in amber and in red. SAAG and protein read "No ascites", uncolored, when there is under 0.15 L of ascites.

Every tile has its normal bands (a tile that cannot have a sensible normal would be the only exception; there is none today). A high output or volume reads "High" in gray, like a slow heart rate: pregnancy and the hyperdynamic circulation of cirrhosis raise both without it being a fault. A new tile key gets its rating, cut-offs and scale together (`RATE`, `SCALE`, `CUT` in `table-marks.js`); `tests/tile-bar.test.js` fails for a tile left bare.

Key facts for text: normal HVPG 1–5; CSPH is HVPG ≥ 10; bleeding risk rises steeply from an HVPG of about 12 (rising risk, not a cut-off: varices can bleed below it); PPG normal ≤ 5; Baveno VIII stiffness: < 10 kPa normal, ≤ 15 with platelets ≥ 150 rules CSPH out, 15–25 gray zone (ANTICIPATE ≥ 75% or spleen stiffness ≥ 55 kPa rules it in), ≥ 25 CSPH.

---

## 9. Authoring rules (the house rules)

1. **One idea per slide.** Title stands alone, `line` of 30 words or fewer, ≤ 4 `causes`, one card. `tests/deck-shape.test.js` splits each line on spaces and fails any line over 30 words; `tests/deck-line-length.test.js` fails any deck with more than four objectives; move the extra sentences to `notes`.
2. **One name per station.** Use the vocabulary in section 6.3 (portal vein, sinusoids/WHVP, hepatic vein/FHVP, IVC, right atrium/RA). Do not rename a station within a deck.
3. **No repeated pointer.** Never add a `note` mark or label that names what a station label already names on that slide (e.g. VAR is labelled "Varices", so no "Esophageal varices" pointer). `block` and `treat` marks say something new (Clot, Banded varices), so they stay.
4. **Definitions are fixed:** **HVPG = WHVP − FHVP**, cut-offs **amber 5, red 10**. **PPG = portal vein − IVC**, cut-offs **amber 6, red 12**. In equations write `HVPG = WHVP − FHVP` and `PPG = P_portal vein − P_IVC`. Never define HVPG as portal minus hepatic or PPG as portal minus RA.
5. **Endoscopy is esophagus-only.** The scope tool and any endoscopy words refer to the lower esophagus; do not add gastric endoscopy.
6. **Use live values.** Say numbers through `{hvpg}` / `{ppg}` / `{pv}` etc. and rules through `{>=10 mmHg}`; do not type measured numbers that the model produces. Write cut-off words around the outlined pill ("above {>=5 mmHg}").
7. **Eased animation.** Everything eases in and out on its own; never write a slide that relies on a jump or pop. Use `ramp` + `lapse` for change over time (days ≥ lapse seconds), never a fake step. Camera moves are automatic.
8. **Do not add** a Guidelines tab or slide type; there is none. Do not change the original organ colours or organ art (muted hues and procedural lighting were rejected).
9. **Point only at what has a target** (section 6.3); everything else stays plain or bold.
10. **Order the patient deliberately.** First slide: `preset` (usually `healthy` or the disease). Later slides continue the same patient; use `params`/`days`/`action` to change it, `delta: true` or `delta: '<id>'` to show what changed. Switch the previous drug flag off when switching drugs.
11. **Every content slide has** `id`, `kicker`, `title`, `line`, `notes` (2–4 sentences for a learner reading the handout; never instructions to the presenter such as "Give the room a minute") and `ask: [question, answer]` (printed in the handout only). The last slide is a `visual: 'table'` summary under `kicker: 'Summary'` with `of` rows naming the earlier slides, and the deck ends with `checks` (3 or 4 `[question, answer]` pairs, one of them a reasoning question that gives a change in the numbers and asks what moved; the app adds the quick-check slide).
12. **Decks:** 6–12 slides (the capstone decks that pair a question slide with an answer slide run to about 15), 3–4 `objectives`, ≥ 3 kicker groups or explicit `sections`, `level` one of foundation/core/advanced.
13. **Style:** plain sentence case, no emoji, American spelling, numbers with units (`mmHg`, `g/dL`, `kPa`), clinically accurate (cite Baveno VIII, J Hepatol 2026, never Baveno VII; AASLD 2024 where US practice differs, for a US audience; US drug choices such as octreotide). Write for the learner, never the instructor, in full grammatical sentences that read like a clinician-teacher at the bedside (`docs/ai-humanizer.md`). Use proper clinical shorthand ("OCP use", never "on the pill"). Never write "our patient" or "the patient we just measured", and never an ambiguous "this patient": say "in this case, the HVPG is…" or use the case's own description. Say **resistance** (site labels and running prose), not "block" or "obstruction", for where pressure is lost; drug and procedure uses such as "blocks α1 receptors" stay, and established names keep their wording (sinusoidal obstruction syndrome, hepatic outflow obstruction). (The code's `kind: 'block'`, `block:` and `callout` names are fine; only learner-facing text is affected.) Word thresholds as rising risk, not a cliff.
14. **No new furniture by hand.** The app adds the deck's name tab in the card's top right corner, the level tab in its top left corner (decks covering more than one `site`), disease-name pills (list in `src/ui/diseases.js`), the Outline slide, the quick check and the corner credit. Do not write them into lines or titles.
15. Presenter shows pressure unless a slide sets `lens` (section 5.2), and keeps the app's own N, S, L keys off while presenting; there are **no card or test-type fields on slides**: the nearest are `tool.kind` and `visual` (section 7).
16. **Design rules, not gaps (owner's decisions).** `ask` and `notes` print in the handout, never on a projected talk. The figure is read-only while a talk plays: no dye, vessel card or Explore tools without leaving the talk. Do not write a slide that asks the room to tap, inject or explore, and do not ask for these to be added.
17. **Name what you mean (Mohammad, 18 Oct).** Every line names its subject: no bare "both drugs", "it" or "this patient"; name the drug, the vessel, the patient ("propranolol and carvedilol", "the portal vein", "in this case"). No filler "also" or "again". Explain a mechanism once per talk; later slides lead with the new numbers. Follow `docs/ai-humanizer.md`.
18. **HVPG 12 is not a cut-off.** Say the bleeding risk climbs from about 12 mmHg (varices can bleed below it). The pressure chart's "Can bleed 12" label is deliberate; leave it.
19. **Respect what the model does at once.** In the model, varix size and liver stiffness follow the pressure gradient within seconds (in patients both change slowly). So a drug or other quick-change slide must not show `varix`, `gv` or `lsm` tiles as its effect; show `map` and `hr` (or the pressures) instead.
20. **A time-lapse with its own `preset` carries `params`** (`params: {}` is enough), or it plays from the previous slide's patient; word its line as the end point, since its `{tokens}` show the end values (section 4).
21. **Summary tables:** every `cols` key needs a heading in `COLS` (`src/ui/table-marks.js`); `tests/deck-review-bugs.test.js` checks it.
22. **New decks need handout figures:** run `node scripts/handout-figures.mjs <id>` (it writes `brand/handout/<id>/<slide id>.webp`); `tests/handout.test.js` fails while a slide has none, or while a figure belongs to no slide (a renamed or removed slide).
23. **Question and answer pairs (Choose the treatment, Doppler of the portal system, Stiffness, platelets and the first visit, and Where is the resistance? show their cases on one slide each).** A case is two slides. The question slide loads the patient (`preset`, with a `vignette`), shows the readings or the live options (`compare`) and asks in its line, with nothing named. The answer slide carries on with the same patient (no `preset`), names the finding, can add `params`, `delta: '<question slide id>'` and a `cite`, and may list what decides it with `causesHead` and `causes`. Never put `scales` on a question slide: a flip would give the answer away. Put `hold: true` on the question slide (section 7.5), so its data card names nothing either. Give the two slides of a pair the same kicker ("Case 1"), so the outline and the summary table read in order. Where is the resistance? has one slide per case since 25 Oct: the slide takes the case's `preset`, `vignette` and `caseQ` ("Where is the resistance?"), shows the Gut to heart chart and the Pressure and Pressure drop buttons, and names the level when the case card lifts.
24. **Write the slide that teaches, not the one that tells (the 25 Oct word pass).**
    * *Puzzle before the reveal.* The slide before a reveal ends on the paradox as a plain statement ("A meal is about to raise the portal flow by half."; "They can carry only so much."), and the next slide resolves it. Do not ask a question the figure cannot answer yet.
    * *One lens a line.* Name at most one "Colored by …" sentence in a line, and only when the color is the finding. The key under the figure already says what each coloring shows; put a second lens in the notes or on its own button. `tests/lens-word-pills.test.js` keeps more than 40 of these phrases across the decks, so keep the ones that carry a finding.
    * *A title names the finding.* "A clotted hepatic artery starves the bile ducts", not "Hepatic artery thrombosis". A topic title belongs on a reference slide only.
    * *Say when the patient changes.* A slide that loads a new patient opens with "In another patient with CSPH, …". A slide that goes back to an earlier patient says "Back in the first patient, …" and carries its own `preset`, `days` and `ramp` (without the `lapse`), so it does not lean on the slide before it.
    * *Order by the thread.* Put the contrasts that prove a mechanism straight after it (Ascites 6 and 7), the pitfalls after the main thread (Stiffness), and one slide for one journey (Circulation's lobule). Reorder `sections` and `objectives` to match.
    * *The same last sentence on every question slide* of a capstone that keeps its question slides, so the room learns the method.
25. **The quick check holds one reasoning question.** A patient, a number and "which lever moved?", "what comes next?" or "is that a response?" (Circulation, Hyperdynamic, TIPS Doppler). A deck that already has four checks merges two recall checks or lets the reasoning check carry the recall answer; never write a fifth.
26. **A source names its setting.** Say who a number or rule applies to. Baveno VIII Table 3 gives the HVPG response (a fall of 10% or more, or to 12 mmHg or less) for primary prophylaxis, and none of the three guideline files gives a 20% rule. EASL 2025 puts recanalization of a recent portal vein clot at about 4 in 10 without cirrhosis and about 7 in 10 with it. Octreotide is a 50 µg bolus then 25 to 50 µg an hour (AASLD 2024). A covered esophageal stent is preferred to a balloon tube as the bridge (Baveno VIII 5.35). Check each claim against `/mnt/project-files/guidelines/`, and leave out what no file supports.
27. **Taking a slide out.** Delete its handout figure (`brand/handout/<deck>/<slide id>.webp`) and its `tests/deck-adopted.js` entries, drop its kicker from `sections` and any objective that pointed to it, and point tests that named the slide at the deck that still teaches it. Then read the diff and run `UPDATE=1 node --test tests/deck-terms.test.js` once, so the pill baseline loses only that slide's pills. A new slide needs a figure from a browser run (rule 22); where none is possible, merge or reorder instead.
28. **A decision deck follows one patient and asks at each step (Ten years).** Each decision is two slides with the same kicker: the question (a `compare` that offers the options the model can show, such as a drug, a TIPS or a narrower stent, and a line that asks) and the answer (the treatment on, with a `cite` and a `delta` to the question). Only the first slide has a `preset` and a `vignette`, because a case card needs a preset; the later steps pass time with `days` and `ramp` and describe the same man in the line. Keep the injury going in the model so every later step can be shown, and say so in the notes (Baveno VIII 4.2 would treat the cause).
29. **A source's criteria are stated, the model's limits are named (Transplant Doppler, Stiffness).** When the source gives a number the model cannot draw, such as the jet of over 100 cm/s at a narrowed portal vein or the acceleration time of an artery, quote the source in the line or notes and put one `caveat` on the slide saying what the model shows instead. Keep the source's setting in the comment at the top of the deck, with the date you checked it.
30. **Model facts found while writing the 25 Oct decks.** `band` stops a bleed but one band does not shrink a varix: three sessions do, and the effect wears off in about 50 days. The shunt tile reads 94% for any stent from 6 mm up, so judge a stent's width by the PPG and the liver flow. A Doppler reads a vein as a whole: a narrowed portal vein speeds up about 1.6 times at most, then slows as the narrowing tightens, and a narrowed artery gives a small, low-resistance trace. A slide id that contains `csph` trips the threshold test when it sits in a `{hvpg@csph}` token, so name it `rise`. A summary table needs a heading in `COLS` for every column (`pvVel` has none; use `pvFlow`). A `compare` row's own button names every key the other buttons switch (`tips: { on: false, d: 8 }` beside a button that sets `tips.d`).

---

## 10. Blank deck template

Save as `src/ui/decks/<id>.js`. Delete what you do not use.

```js
// Presenter talk: <one-line description> (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const MYDECK = {
  id: 'my-deck', level: 'core', title: 'My deck title', minutes: 8,
  objectives: [
    'Explain …',
    'Name …',
    'Give …',
  ],
  summary: 'One or two sentences for the deck picker.',
  checks: [                                              // the closing quick check: 3 or 4 [question, answer]
    ['A question to answer in your head?', 'The answer, shown on tap.'],
    ['A second question?', 'Its answer.'],
    ['A third question?', 'Its answer.'],
  ],
  slides: [
    {
      id: 'first', preset: 'healthy',                    // model state: preset → params → action → days
      // vignette: 'A 55-year-old woman with … (a case card; under 220 characters; needs the preset above, see section 14)',
      // params: { cirrhosis: 0.5 }, action: { kind: 'band' }, days: 60, ramp: { cirrhosis: [0.4, 0.6] }, lapse: { seconds: 8 },
      view: 'anatomic', cam: 'portal',                    // 'anatomic' | 'circuit'; region, box, 'fit', 'lobule:triad', 'sinusoid', …
      labels: ['CONF', 'SMV', 'SV'],                      // stations named on the figure
      terms: ['sv', 'smv', 'pv'],                         // or { 'words in line': 'target' }; pills + labels + glow
      // glow: ['liver', 'C3'], glowSeq: 550,
      // mark: { edges: ['PV_TRUNK'], label: 'Clot', kind: 'block' },   // 'block' | 'treat' | 'note'
      // sites: ['pv'], cath: 'result', tool: { kind: 'hvpg', catheter: true },
      data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], // or tool: { kind: 'profile' }, key: ['hvpg', 'ppg']
      // delta: true, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, step: 0.05, ends: ['None', 'Occluded'] },
      kicker: 'Group name', site: 'pre', title: 'A headline that stands alone',
      line: 'Under 30 words with [portal vein](pv) pointing at the figure and the live value {pv}, above {>=10 mmHg} the rule.',
      // causes: ['…', '…'],
      notes: 'Two to four sentences for a learner reading the handout (never shown on screen).',
      ask: ['Question printed in the handout?', 'Expected answer.'],
    },
    // … more slides …
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'first', title: 'The patient' }],
      kicker: 'Summary', title: 'What to remember',
      line: 'A short line that sums the deck up.',
      notes: 'Closing notes.',
      ask: ['Closing question?', 'Answer.'],
    },
  ],
};
```

---

## 11. Short complete example deck

A 4-slide pre-hepatic resistance talk, using only the names in this guide (illustrative: it is not one of the app's decks).

```js
// Presenter talk: a clot in the portal vein, and why the HVPG misses it
// (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const CLOT_DEMO = {
  id: 'clot-demo', level: 'core', title: 'A clot in the portal vein', minutes: 5,
  objectives: [
    'Recognise an occluded portal vein on Doppler',
    'Explain why the HVPG stays normal',
    'Say which gradient finds pre-hepatic resistance',
  ],
  summary: 'An acute portal vein clot on Doppler, the normal HVPG and high PPG, and what a cavernoma looks like months later.',
  checks: [
    ['Which gradient finds pre-hepatic resistance?', 'The PPG.'],
    ['Why is the HVPG normal in a portal vein clot?', 'The wedged catheter reads the sinusoids, which sit downstream of the clot.'],
    ['What grows around a chronic clot?', 'A cavernoma of small collaterals.'],
  ],
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal',
      vignette: 'A 39-year-old woman with factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. Her liver tests and platelets are normal.', labels: ['CONF'], terms: { 'portal pressure': 'pv' },
      mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Acute thrombosis', site: 'pre', title: 'A clot in the portal vein',
      line: 'No signal on Doppler in the main portal vein. Behind the clot the portal pressure climbs to {pv}.',
      notes: 'Acute portal vein thrombosis presents with abdominal pain or is found on a scan. Without cirrhosis, anticoagulation starts at once and continues for at least six months.',
      ask: ['What is the first treatment?', 'Anticoagulation, started at once.'],
    },
    {
      id: 'cath', cath: 'result', tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC'), 'Portal pressure gradient: the whole fall from the portal vein to the IVC'],
      kicker: 'Acute thrombosis', site: 'pre', title: 'The HVPG misses it',
      line: 'The resistance is before the liver, so the wedged and free hepatic pressures stay normal and the HVPG reads {hvpg}. The PPG, {ppg}, finds it.',
      notes: 'The wedged catheter reads the sinusoids, which sit downstream of the clot. The PPG compares the portal vein itself with the IVC. A normal HVPG with varices says the resistance is not in the sinusoids.',
      ask: ['Varices and an HVPG of 3 mmHg. What does that tell you?', 'The resistance is not sinusoidal.'],
    },
    {
      id: 'cavernoma', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'],
      mark: { edges: ['C8'], label: 'Cavernoma', kind: 'note' }, data: 'tiles', tiles: ['varix', 'spleen', 'plt'], key: ['varix'],
      kicker: 'Months later', site: 'pre', title: 'A cavernoma around the clot',
      line: 'Small collaterals grow around the occluded vein and carry some blood to the liver. Varices form and the spleen enlarges.',
      notes: 'Cavernous transformation is a web of collaterals around the occluded portal vein. It does not carry enough blood to bring the pressure down, so varices, a large spleen and low platelets follow.',
      ask: ['A child bleeds from varices with normal liver tests. What is the likely cause?', 'Chronic portal vein thrombosis with a cavernoma.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'Portal vein', title: 'Cavernoma' }],
      kicker: 'Summary', title: 'A clot before the liver',
      line: 'The HVPG stays normal with an acute clot and with a cavernoma; the PPG rises when the portal vein itself carries the resistance.',
      notes: 'Pre-hepatic resistance raises the pressure upstream of the liver and leaves the sinusoids alone. The HVPG is normal and the liver works.',
      ask: ['Which pressure reading is normal in every case of pre-hepatic resistance?', 'The HVPG.'],
    },
  ],
};
```

---

## 12. Adding the deck to the app

1. **Create** `src/ui/decks/<id>.js` exporting one `const` (section 10/11). No other file imports it yet.
2. **Edit `src/ui/decks.js`** (three small edits; the slide-field list in its header comment is the reference for the fields):
   * Add the import next to the others (any `?v=` hash; step 5 fixes it):
     `import { CLOT_DEMO } from './decks/clot-demo.js?v=0000000000';`
   * Register it near the other `DECKS.push(...)` lines:
     `DECKS.push(CLOT_DEMO);`
   * Add it to `TOPICS` (the unified menu) under exactly one topic, with a short title of **32 characters or fewer** and a short deck name of **20 or fewer**:
     `['causes', 'Causes', [ …, ['clot-demo', 'A clot in the portal vein', 'Portal vein clot'] ]]`.
     Topics, in order: `foundations`, `causes`, `measuring`, `complications`, `treatment`, then `more` ("More talks"). The five topics list only the twelve core talks (Circulation, Circuit, Sites and causes, HVPG and PPG, Doppler, Stiffness, Varices, Insufflation, Variceal bleed, Next bleed, Ascites, Encephalopathy); every other talk goes under `more`, which keeps the same group heading. Search finds all 28. A deck missing from `TOPICS` fails the menu test.
3. **Opt-in fields on a built-in deck:** the package tests guard every opt-in field (sections 5.9, 5.10, 6.4, 7) against accidental use in a built-in deck. To use one on purpose, add the slide to `ADOPTED` in `tests/deck-adopted.js` as `'<deck id>/<slide id>': ['<field>', …]` (`'kind:flows'` for a tool kind, `'tool.scale'` for a tool option, `'cols.wave'` for a table column, `'lens:since'` for a deck-only lens, `'mark.organ'` for a mark option, `'glow:group'` for a list inside `glow` (a numbered step that lights several vessels), else the slide field's name, such as `'calipers'`, `'spot'`, `'scales'` or `'procedure'`). `tests/deck-adopted.test.js` fails an entry the slide no longer uses, so the list never grows wider than the decks. An imported deck (section 13) needs none of this.
4. **Check it:** `npm run lint && npm test`. Among the tests that guard a deck: every deck is listed once under a topic with a short title and its own short deck name (`menu`); every slide's `ask[0]` and `notes` appear in the printed handout, and every slide has its handout figure (`handout`); the shape of every talk: at most two lenses, the same tiles on neighbouring slides with the same instrument inside a section, at most two tiles on a slide, no `cite`, a `caveat` only on the TIPS Doppler jet slide, every line 30 words or fewer (`deck-shape`, with short commented allowlists at its top for the slides that need otherwise; an entry that no longer applies fails too, so remove it), and no deck has more than four objectives (`deck-line-length`); every table column has a heading (`deck-review-bugs`); a term a slide gives is named by its line and no slide loses a pill (`deck-terms`); a line that sets a live HVPG or PPG beside a threshold matches the patient the slide shows (`deck-thresholds`, with a hand-checked exceptions list at its top); site tags and disease pills (`site-tags`, `disease-pills`); every case card is under 220 characters on a slide with a preset (`case-card`); the scale switch's lists and its refusals (`scale-switch`); a procedure names a known one and says why it cannot play (`proc-anim`); every compare button of the hands-on decks resolves to a treatment, a patient, a lens or a gate, and each slider moves the model the way its slide teaches (`hands-on-decks`; copy its pattern for a new control).
5. **Stamp scripts:** `npm run stamp` rewrites the `?v=` hashes (required whenever a script file changed; a stale stamp fails the unit job and skips the deploy).
6. **Handout figures:** `node scripts/handout-figures.mjs <id>` draws each slide's figure for the printed notes (`brand/handout/<id>/`); run it after the deck exists and again when a slide is renamed, removed or changes its look. (`scripts/deck-stills.mjs` still writes deck-picker stills to `brand/decks/`, but nothing in the app shows them now; skip it.)
7. **Preview:** follow `AGENTS.md` (the single source of truth for the preview workflow). In short: pushing the integration branch `claude/settings-topbar-icon-flvft1` publishes `/preview/` at https://qaddodi.github.io/portal-pressure-simulator/preview/ . Rebase on the latest preview right before pushing, never force-push, grep for conflict markers, never push to `main` (the owner merges), and check the "Pages (live site + preview)" deploy job succeeded.
8. **Test on the preview:** Present menu → pick the deck (Present, Resume n / N, Copy link, Print notes). In the talk: → Space Enter Page Down step on, ← Page Up Backspace step back, ↑ ↓ untuck and tuck the stacked card's readings (Mac, iPad on its side), a number then Enter jumps, Home and End, G lists the slides, B, W or . blacks the screen, F full screen, Esc ends; ? opens the Guide with every presenter key. A deep link `?script=<id>&slide=<n>` opens a deck at a slide.

**Alternative with no code:** an instructor can capture slides inside the app (stored in the browser as "Yours"); those support only `preset, presetDays, params, action, days, view, cam, kicker, title, line, causes, site, notes, ask, key` and always show the ladder. Full decks need the file route above.

---

## 13. Importing in the app (what the in-app import accepts)

**A full deck file (sections 2 to 11) can be imported in the app.** Menu › Present › "Your scripts" › **Import** opens a dialog: choose a file (`.js` deck, or `.json` deck or script) or paste its contents, then "Add to your scripts". The deck keeps every feature (term pills, live values, marks, tools, visuals, time-lapses) and is stored in the browser (`pps.scripts`) on that device only.

The `.js` is **read as data, never run** (`src/ui/deck-source.js`). It accepts what the built-in decks use: `const` (and `let`, `var`) declarations, `export const` / `export default`, objects, arrays, strings and template literals, numbers, spreads, `+ - * / %`, comparisons, `&& || ??`, `? :`, arrow functions with an expression body (`(x) => …`, `(d) => ({ … })`), the array methods `map filter flatMap concat slice join includes some every find`, `.length` of an array or string, and optional chaining `?.`. `mi mo mn sub frac` are built in, so a deck may use them without defining them. Refused, with the line number: `import`, `function` declarations, block-bodied arrows, `new`, `this`, globals (`window`, `document`, `Math`, …), methods other than those listed, and `__proto__ / constructor / prototype`. The deck is the exported object with a `slides` array (else the last such `const`); it needs a `title`, and each slide a `title`. Import adds a copy each time; "Export" writes it back as JSON, which imports again.

The older **script** format (below) is still accepted, and a shared link `…/#script=<encoded>` adds a script or an imported deck to the recipient's library.

Script file (`*.pps-script.json`):

```json
{
  "title": "My script",                       // required
  "summary": "One sentence.",                 // optional; objectives, minutes, level are kept if present
  "steps": [                                  // required array; each step becomes one slide
    {
      "title": "Slide headline", "kicker": "Group", "line": "One sentence.",
      "notes": "Notes for the handout.", "ask": ["Question?", "Answer."],
      "preset": "cirr-decomp", "presetDays": 0,
      "params": { "drugs": { "carvedilol": true } }, "action": { "kind": "band" }, "days": 30,
      "view": "anatomic", "cam": "portal",
      "causes": ["…"], "site": "sin", "key": ["hvpg", "ppg"]
    }
  ]
}
```

* Only those step fields are read (`preset presetDays params action days view cam kicker title line causes site notes ask key`; `tell` works as an alias of `notes`). Everything else is **dropped silently**: `labels terms glow mark tiles tool visual compare lapse ramp cath sites layers callout eq delta` and the `{live value}` / `[term](target)` markup (shown as plain text).
* Every imported slide shows the pressure ladder (the Gut to heart chart) beside the figure, and the camera is `'fit'` on the circuit view.
* Import adds a copy each time with a new id (`my-…`) and never overwrites; "Export" in the same menu writes this format. The deck's Outline slide is added automatically, as for built-in decks.

**Therefore:** paste or choose a deck `.js` to present it in full without changing the app; add it as a code deck (section 12) only to make it built in for everyone.

---

## 14. Case cards

A **case card** opens a new patient with a short clinical case. When the talk moves forward onto a slide that brings in a new patient, a centred frosted-glass card (the same glass as the other cards) covers the figure. It holds a small **Case** pill and the case text, nothing else (no numbers, no site tag). Behind the card the camera eases out to the whole patient and holds still while the new patient eases in around the card; **Next, a tap on the card or a swipe** lifts the card, the camera makes one eased zoom to the slide's own framing (the lobule included), and the teaching card and data card come in once it has landed. A tap, Next or swipe *while the patient is still loading* only lifts the card and lands on that same slide; it never skips ahead.

### Adding one

1. Pick a slide that **loads a new patient**, that is, one with a `preset`. A slide that only changes the current patient (`params`, `days`, `action`) never gets a case.
2. Add the text as the slide's `vignette` field, exactly like this (from `src/ui/decks/prehepatic.js`):

   ```js
   {
     id: 'clot', preset: 'pvt-acute', cam: 'portal', /* …the rest of the slide… */
     vignette: 'A 39-year-old woman with factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. Her liver tests and platelets are normal.',
   },
   ```

3. Keep it **under 220 characters** (219 at most). `tests/case-card.test.js` loads every deck as it is presented and fails any `vignette` that is 220 or longer or sits on a slide without a `preset`; it also expects at least 55 cases in the app, so removing cases needs the test's count lowered.
4. Run `npm run stamp` (a deck file changed), then `npm run lint && npm test`, as in section 12.

No new code is needed: the presenter reads `vignette` itself (`caseRun` in `src/ui/presenter.js`; the card is the `.pz-case` rules in `styles/app.css`). Do not size, colour or position the card from a deck. The card is just big enough for its words and centred, with the figure visible above and below; its text is set in the title (display) font at 2.5 times the teaching card's body size, and eases down only if a small screen cannot hold it, before the card appears.

### Where a case belongs

* **One case per new patient**, on the slide that loads the preset. Slides that carry on with the same patient get none.
* **A deck's first slide** can carry one. The app then lets that slide load its own patient afresh behind the card (normally the first slide keeps the patient the Outline slide already shows, and its model fields move onto the Outline). The Outline slide still shows the same patient, so the figure does not change between them. The first slide must have a `preset` and no `lapse` or `ramp`.
* **A single-patient deck** (for example HVPG) gets one case, at the start.
* **No case on:** healthy reference slides, comparison tables and ladders (`visual` slides, `of` rows), summaries, the Outline and quick-check slides (the app builds those), and the **Circuit** and **Circulation** decks (the owner's decision: they teach the model itself, not a patient).
* **Going forward only.** The card shows when the talk moves forward onto the slide (a step or a jump ahead) and the slide loads a new patient. Stepping back onto it shows the slide without the card, and so does the slide a talk starts or resumes on. A slide with its own `lapse` never shows one, so do not put a case on a time-lapse slide.
* Sites and causes has six cases (one per level); most other decks have one to seven.

### Writing the case

* **What it holds:** age and sex, the relevant history or cause, then what brought the person in and one or two findings (labs, endoscopy, ultrasound, exam). Two or three full sentences, like a case on rounds. Learner-facing, never instructor-facing.
* **It must agree with the model on that slide.** Run the slide's preset to steady state and read what the app shows: varix size, ascites or none, spleen size, platelets, albumin, stiffness, flow direction, whether the portal vein is patent. If the slide shows large esophageal varices, the case may say large varices; if it shows no ascites, the case must not describe ascites. Quote **labs and findings, not pressures**, so the case never clashes with the ladder or the tiles (pressures come from the model; section 9 rule 6). Real-world details the model does not simulate (the cause, age, a lab not shown) are fine as long as they do not contradict what is shown.
* **Vary the people.** Ages, sexes and causes differ from deck to deck so the same preset never reads as the same person twice (for example, schistosomiasis is a man from Yemen in one deck, a Filipino rice farmer in another, a Brazilian in a third).
* **Wording:** full grammatical sentences, no sentence fragments. Clinical shorthand as a clinician writes it: OCP use, MASH, MASLD, EGD, TR, JVP, RUQ, HSCT, "alcohol-associated cirrhosis". American spelling, numbers with units (`88,000/µL`, `2.8 g/dL`, `24 kPa`). Never "our patient", "the patient we just measured", or an ambiguous "this patient" (a case is not a patient we have followed). Apply the rest of section 9 rule 13 and `docs/ai-humanizer.md`.
* **Guidelines:** Baveno VIII, with AASLD where US practice differs. A case describes a presentation, not a recommendation, so it rarely needs a guideline, but never contradicts one.

### A question on the card: `caseQ`

The case card already holds the talk until it is lifted, so a case that comes right before a reveal can end on one short question for the
room: `caseQ: 'Will his HVPG be raised?'`. It stands on its own line under the case, in the same type and colour, and is fitted
with the case. Ask what the next slide answers, in the case's own terms ("What will the Doppler show?", "Where is the resistance?"), and
keep the case and the question together under 220 characters (`tests/teaching-features.test.js` counts them). One question, no choices,
no answer on the card: the slide behind it is the answer. Used on Two inflows 4 and 6, Where is the resistance? 1 to 6, Pre-hepatic 2, After the
sinusoids 13, Doppler 5 and 7 to 11, Choose the treatment 2 to 6, Stiffness 6 to 10, Pregnancy 2, Treating the cause 5 and Transplant Doppler 3 to 7.

### Checking one

* Count the characters: under 220, spaces included. `tests/case-card.test.js` does it for every deck.
* Read it against the slide's tiles and figure on the preview: Present menu, pick the deck, step to the slide with Right arrow or Next; the card appears over the whole new patient, and Next lifts it and zooms to the slide's framing.
* Stepping back onto the slide must show no card.
