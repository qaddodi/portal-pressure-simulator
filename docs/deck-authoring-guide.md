# Deck authoring guide: Portal Pressure Simulator presenter decks

Self-contained brief for an AI that writes new presenter decks **without seeing the code**. It was brought up to date with the app's source on the preview branch `claude/settings-topbar-icon-flvft1` on 14 Oct 2026 (files `src/ui/decks.js`, `src/ui/decks/*.js`, `src/ui/presenter.js`, `src/ui/presenter-tools.js`, `src/ui/deck-source.js`, `src/engine/scenario.js`, `src/engine/topology.js`, `src/ui/anatomy.js`). Use only the names listed here; an unknown key is silently ignored, an unknown target is silently dropped.

**The code wins.** The slide-field list at the top of `src/ui/decks.js` and the instrument list at the top of `src/ui/presenter-tools.js` are the source of truth; when this guide and the code differ, follow the code and fix the guide. **Layout is not an authoring matter:** card widths, margins, gaps, corner radii and text sizes are set by the app (`styles/app.css`, and the fitting code in `src/ui/presenter.js`) and change as the layout is tuned. A deck never carries a size, a position or a colour for a card; to make words fit, shorten them.

Contents: At a glance · 1 What a deck is · 2 Deck fields · 3 Slide fields · 4 The model state (patient, parameters, actions, time-lapse) · 5 The figure (views, camera, labels, glow, marks, sites, catheter) · 6 The words (live values, cut-offs, term pills) · 7 The data card (ladder, tiles, tools, visuals, compare, what-if) · 8 Catalogue (presets, parameters, stations, vessels, targets, tiles) · 9 Authoring rules · 10 Blank template · 11 Example deck · 12 Adding the deck to the app · 13 Importing in the app · 14 Case cards

---

## At a glance: what the system can do

* **A live model, not pictures.** One lumped-parameter hemodynamic model of the portal circulation (gut to heart) computes every pressure, flow, collateral, varix size and ascites volume. A slide only says *which patient and what changed*; the numbers on screen, in the line (`{hvpg}`) and in the tables are read from the model, so they cannot drift from the picture.
* **Patients.** 16 presets from healthy to Budd–Chiari (section 8.1), changed by a partial parameter patch (section 8.2): cirrhosis severity, clots, stenoses, collaterals, shunts (TIPS, DIPS, surgical), drugs, diuretics, heart failure, and more; plus one-off events such as banding, paracentesis, hemorrhage and rupture (section 8.3). Disease runs on a clock: `days` and `ramp` age the patient, and `lapse` plays that change live.
* **Two views of the figure.** The anatomy plate (with named camera regions and dives into the lobule and the sinusoid) and the electrical-circuit map (resistors, one row of zigzags). Stations, vessels and organs can be labelled, glowed, marked and pointed at from the words (term pills).
* **The data card** holds the numbers: a pressure ladder, readout tiles, comparison tables, scales, and live instruments (Doppler, endoscopy scope, FibroScan, pressure traces, the abdomen, the varix wall, a flow-over-time chart), or a what-if slider and treatment buttons that act on the live model.
* **Catheter choreography.** The HVPG measurement can be played step by step (route, free, wedge, result) with the live tracing.
* **Case cards.** A slide that brings in a new patient can open with a centred frosted card holding a short clinical case (section 14).
* **Deck furniture the app adds for you:** an Outline and objectives slide in front, the deck's short name over every slide's title (the running head), site tags beside it in decks that cover more than one level, disease-name pills, the closing quick check (`checks`), speaker notes in the handout, the nav pill, the corner credit.
* **The menu has two tabs:** *Present* (the decks, this guide) and *Patients* (the presets, free exploration). Instructors can also import a deck file in the app (section 13).

---

## 1. What a deck is

A deck is a plain JavaScript object (one ES module per deck). The app plays it as a projector-first talk on a **live physiological model**: each slide sets a patient state, frames the figure, and shows one idea (a headline, one sentence, optional causes, and a card of numbers or an instrument). The model state of every slide is computed off screen **in order, each from the slide before**, so forward, back and jump always show the same numbers.

Every deck automatically gets an "Outline and objectives" slide in front (built from `objectives` and the slides' `kicker` groups) and, when the deck has `checks`, a quick-check slide at the end. **Never write those slides yourself.** The first real slide keeps the patient of the outline (its model fields move onto the outline), unless that first slide carries a case card, which makes it load its own patient afresh behind the card (section 14).

A slide is **one idea**: a standalone title, a one-sentence line, at most four causes, a figure that shows it.

## 2. Deck fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kebab-case, unique across all decks (existing: `circulation circuit two-inflows hvpg sites prehepatic ncph right-heart outflow lobule doppler stiffness one-year varices endoscopy variceal-bleed ascites tap spleen pvt-cirrhosis recompensation treatment shunts`). |
| `level` | `'foundation'` \| `'core'` \| `'advanced'` | Shown as Foundation / Core / Advanced. |
| `title` | string | Full title. |
| `minutes` | number | Talk length. |
| `summary` | string | One or two sentences for the picker. |
| `objectives` | string[] | **3 to 4** short learning objectives (start with a verb: "Explain…", "Name…"). |
| `slides` | slide[] | See section 3. |
| `checks` | `[question, answer][]` | The closing quick check: 3 or 4 questions, added after the last slide over its patient. Each answer starts hidden and eases open when tapped. Do not write the slide itself. |
| `sections` | `[name, [kickers or slide ids]][]` | Optional. 3 to 5 sections for the outline and the running head. Needed only when the deck has more than 5 distinct `kicker` values, or fewer than 3 (list slide `id`s then, as `circuit` does); with 3 to 5 kicker groups the sections are built from them automatically. A kicker `'Summary'` is left out of the outline. |
| `short` | string | **Set by the menu table (`TOPICS` in `src/ui/decks.js`), not in the deck file** (see section 12). Max 32 characters. |
| `head` | string | The running head, the deck's short name in small capitals over every slide's title (beside the site tag). **Set by the menu table too**, its third entry. Max 20 characters, one or two words ("Ascites"). |
| `topic` | string | Set by the menu table too (`foundations causes measuring complications treatment`). |

## 3. Slide fields

Every field is optional unless marked. Fields are grouped by what they do. Unknown values are ignored.

### 3.1 Identity and words

| Field | Type / allowed values | Default | Meaning |
|---|---|---|---|
| `id` | string | none | Unique within the deck. Required if any `of`, `delta`, `vs` or summary row refers to the slide, and handy for notes. |
| `kicker` | string | `''` | Small heading above the title; slides with the same kicker form one group (outline, running head). Use `'Summary'` for the closing slide. |
| `site` | `'pre'` `'presin'` `'sin'` `'postsin'` `'post'` `'cardiac'` | none (grey) | Colours the kicker by the level of the resistance (pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac). `'pvt'` appears in one deck but has no colour, so avoid it. |
| `title` | string | `'Step'` is not applied to decks; give one | The headline. **Must stand alone without the kicker.** |
| `line` | string | none | One sentence under the headline. May use `{live values}`, `{>=5 mmHg}` cut-offs and `[word](target)` term pills (section 6). |
| `causes` | string[] | none | Up to **4** short bullet items. |
| `causesHead` | string | `'Causes'` | Heading of the causes list (e.g. `'Who gets it'`). |
| `bold` | string[] | `[]` | Extra key terms to bold wherever the line names them (at most 3 bold terms a line are applied). |
| `pill` | `false` | auto | `false`: no automatic pill in the line (use it for a plain number such as an anatomical size). Without `{braces}` the first number with a unit becomes an outlined rule pill. |
| `eq` | `[mathML, legend?]` | none | Equation under the title (MathML string plus an optional legend sentence). See helpers in section 11. |
| `caveat` | string | none | One short sentence in small print under the line, where the model differs from patients ("The model builds the fluid from pressure and albumin; it does not model the kidneys."). |
| `vignette` | string | none | A case card: a clinical case shown on a centred card when this slide brings in a new patient. At most 219 characters, and only on a slide with a `preset`. See section 14. |
| `notes` | string | `''` | Speaker notes. Printed in the handout. Give every slide notes. |
| `ask` | `[question, expected answer]` | none | Question for the room. Give every content slide one. The handout test requires `ask[0]` to appear. |
| `rail` | `true` \| `'all'` | none | `true`: the six levels with this slide's `site` marked; `'all'`: all six levels named. |
| `column` | `true` | none | Draws the wedge-pressure column illustration (portal vein, sinusoids, central vein, balloon) in the text panel. |
| `tick` | string | the slide title | A few words for what happened at this slide's time point, set at 45° over its line on a talk trace (`tool: { kind: 'trace', range: 'talk' }`). Used in the time-line decks (`one-year`, `pvt-cirrhosis`, `recompensation`). |
| `when` | string | the day count | The time point under that label, in words, when the days so far would repeat the one before (a drug started at the same visit). |

### 3.2 Model state (section 4)

`preset`, `presetDays`, `params`, `action`, `days`, `ramp`, `lapse`.

### 3.3 The figure (section 5)

`view`, `cam`, `kMax`, `zoom`, `clear`, `lens`, `labels`, `tint`, `terms`, `glow`, `glowSeq`, `mark`, `marks`, `sites`, `layers`, `callout`, `cath`, `monitor`.

### 3.4 The data card (section 7)

`data`, `tiles`, `key`, `delta`, `brackets`, `block`, `tool`, `visual` (+ `cols`, `asc`, `rowHead`, `note`, `vs`, `foot`, `of`, `scale`), `compare`, `whatIf`.

### Slide order and carry-over

A slide that sets none of `preset`, `params`, `action`, `days` **keeps the previous state**. (`params: {}` counts as setting something: it re-settles the model, and with `delta` shows the change.) Camera, labels, marks and glow do **not** carry over; each slide sets its own.

---

## 4. The model state

Order of application on every slide: **preset → params → action → days** (with `ramp` stepping through the days).

| Field | Type | Meaning |
|---|---|---|
| `preset` | preset id (section 8.1) | Loads that patient fresh, then applies the rest on top. Omit to continue the same patient. |
| `presetDays` | number | Extra disease days **added inside the preset load** (on top of the preset's own `days`). Rare. |
| `params` | object | A **partial** parameter patch **deep-merged** onto the current patient (section 8.2). Example: `{ tips: { on: true } }`, `{ drugs: { carvedilol: true } }`, `{ cirrhosis: 0.5 }`. Only the keys you give change. Values are clamped to their ranges. |
| `action` | action or action[] | One-off events (section 8.3): `{ kind: 'band' }`, `{ kind: 'paracentesis', mL: 8000 }`, … Several in an array run in order. `[]` is allowed (no-op). |
| `days` | number | Extra disease days **after** the patch (the disease clock: varices, ascites and collaterals develop over days). |
| `ramp` | `{ param: [from, to] }` | With `days`: eases a top-level numeric parameter from `from` to `to` day by day (`{ cirrhosis: [0.4, 0.6] }`, `{ albumin: [4, 2.8] }`, `{ splanchnicTone: [1, 0.72] }`). |
| `lapse` | `{ seconds, from?, to? }` | Plays the slide's `days` (and `ramp`) **live on the figure** as a time-lapse of `seconds` length, starting from the previous slide's state. `from` / `to` are words for the start and end in place of a day counter (e.g. `'Fasting'`, `'After a meal'`). **Keep `days` ≥ `seconds`**, or the clock runs sub-day and the ramp is skipped. |

Typical time-lapse: `days: 90, ramp: { cirrhosis: [0.5, 0.54] }, lapse: { seconds: 8 }`.
Typical "meal" lapse (used by several decks): `days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }`.

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

**Named regions** (`REGIONS`, anatomy world units x 300–1120, y 0–920): `route` portal vein to heart · `liver` · `portal` confluence, trunk, splenic vein, SMV · `hepatic` hepatic veins, IVC, right atrium · `heart` · `varices` · `spleen` · `rectum` · `wall` paraumbilical vein and abdominal wall · `fundus` fundal varices, gastrorenal shunt, left renal vein · `splenic` splenic vein to the confluence, spleen, fundus · `dips` the DIPS tract, portal bifurcation up through the caudate lobe to the IVC · `gej` lower esophagus, the gastroesophageal junction and the coronary vein feeding it · `feeder` the varices down the coronary vein to the portal confluence. Also `'fit'` (whole figure) and a box `[x0, y0, x1, y1]` (e.g. `[690, -10, 890, 170]`). The camera also grows to include any organ the slide outlines.

**Inside the liver** (these dive in from the anatomy; the view returns to the body plate for the next normal `cam`):
`'lobule'` (whole lobule) · `'lobule:fit'` · `'lobule:triad'` (portal tract) · `'lobule:sinusoid'` · `'lobule:central'` (central vein) · `'sinusoid'` (the sinusoid wall, cross-section). Some devices cannot draw `'sinusoid'` and fall back to the lobule.

### 5.2 Lens (what the vessel colours show)

`lens` picks what the figure's vessels are colored by on that slide, as the color menu does in Patients. Without it the slide shows pressure. The figure crossfades to the new colours while the old words leave, and a small key sits on the figure, not in the teaching card (src/ui/figure-key.js puts it on bare background, clear of vessels, cards and labels): the lens name ("Velocity", no "Colored by") and the two ends. `visual` slides always show pressure. In learner-facing words say "colored by velocity", never "lens" (Mohammad, 14 Oct).

| `lens` | Colours | Key |
|---|---|---|
| `'velocity'` | mean velocity, pale amber (slow) to deep brown (fast) | Slow to Fast |
| `'flow'` | flow volume, how much blood each vessel carries | Little to Much |
| `'direction'` | the usual direction in teal, reversed flow in orange | Usual direction, Reversed |
| `'heat'` | congestion: pressure above healthy | None to Backed up |
| `'drop'` | pressure drop across each vessel: where the resistance lives | None to Large |
| `'delta'` | higher or lower than healthy | Lower to Higher |
| `'origin'` | where each vessel's blood comes from: SMV, IMV, spleen, hepatic artery, the rest systemic, mixed by flow at each junction | the five sources |

A `compare` row can switch lenses instead of treatments: `compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Flow', lens: 'flow' }]`. Each button crossfades the figure to its lens and swaps the key (it fades out and the new one in), without touching the model; the key is on the figure, so the card never changes height (Circulation's lens slide).

Use it where the colour is the point of the slide (a reversed branch on `'direction'`, a fast stent on `'velocity'`), and say in the line what the colours show. The lens does not carry over: each slide sets its own.

### 5.3 Layers and lobule callouts

* `layers: ['zones']` turns the lobule's zone 1 / 3 bands on for the slide (needed for the `lobule:zone1` / `lobule:zone3` labels); `'lymph'` turns the lymphatics on the same way. Other lobule slides have zones off and lymph as the viewer had it; the viewer's own layers return when the show ends.
* `callout: { at, label }` on a lobule slide: a red callout in the lobule marking where the resistance sits. `at` values used: `'triad'` (portal tract), `'sin'` (sinusoids), `'cv'` (central veins). Example: `callout: { at: 'cv', label: 'Resistance: central veins' }`.

### 5.4 Station labels

`labels: ['CONF', 'SIN_R', 'RHV', 'RA']`: the stations named on the anatomy figure (none shown if absent; **only the stations you list, plus those your terms point at, appear**). `tint: ['imv']` takes the colour of a target's station label although the line never names it (the label is on, in its station colour). Valid ids are node ids (section 8.4). Only labels the anatomy draws appear. On the circuit view the labels are the circuit's own.
`VAR` (esophageal varices) is hidden when the patient has no varices; `GV` is hidden when there are no fundal varices.
On ladder (`data: 'ladder'`) and catheter (`cath`) slides the figure automatically renames to "Sinusoids R · WHVP" and "RHV · FHVP".

### 5.5 Glow, highlights and term pills

* `terms` : words in the line that become coloured pills **and** light the figure (section 6.3).
* `glow: [...]`: light vessels or organs directly. Items: a target key (`'smv'`, `'liver'`), a vessel/edge id (`'PV_TRUNK'`, `'C5'`), an organ (`'liver'` `'spleen'` `'heart'` `'caudate'`), or `{ id, tone, soft? }` (`soft: true` marks a supporting vein lit softly; a slide with any soft glow makes the camera frame every vessel it lights, so none runs off the edge). Tone defaults to the target's station colour (accent for an unknown edge). Terms glow automatically, so `glow` is for things the line does not name.
* `glowSeq: 550`: ms between successive `glow` items, so they light in order (e.g. pressure travelling back from the heart). Existing use: `550`.
* Tones usable in `{ id, tone }`: `pv`, `sv`, `smv`, `wedge`, `hv`, `ivc`, `ra`, `var`, `accent`, or a CSS variable name starting `--` (e.g. `'--danger'`).

### 5.6 Marks (callouts on a vessel)

`mark: { edges, label, kind }` or `marks: [ … ]` (several). `edges` = vessel ids (section 8.5). Only labelled marks get a callout box.

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

Pointing at the resistor words `resistance` / `collaterals` / `gut arterioles` with `terms: { resistance: 'rLiver', collaterals: 'rColl' }` also lights those zigzags.

### 5.8 The HVPG catheter

`cath` replaces the camera with the catheter choreography (the camera follows it): `'route'` (in along the jugular route) · `'free'` (free hepatic vein pressure) · `'wedge'` (balloon up, still column, WHVP) · `'result'` (both pressures and the HVPG) · `'blocked'` (catheter in a presinusoidal block).
`monitor: 'free' | 'wedge' | 'result'` shows the catheter's pressure-monitor trace under the slide's words.

---

## 6. The words

### 6.1 Live values: `{token}`

`{pv}` in a `line` is replaced by the model's **live reading for that slide**, in a pill, rounded as the card shows it. Ladder slides (`data: 'ladder'`) round `pv`, `whvp`, `fhvp`, `ivc`, `ra` to whole mmHg. The pill takes the station colour where one exists (`pv`, `whvp`, `sin`, `fhvp`, `ivc`, `ra`); sizes (`spleen`, `varix`, `gv`) take their status colour (amber/red). Prefer a live token over a typed number so it cannot drift.

Valid tokens (the tile keys, section 8.6): `hvpg ppg pv sin whvp fhvp saag tp asc varix gv spleen plt pvFlow pvVel liver shunt map hr lsm ra salb ivc hb`. `{ppg@before}` reads the value at another slide of the deck (here the slide with `id: 'before'`), for "the PPG falls from {ppg@before} to {ppg}". A typed `{6 to 8 g}` is drawn as an outlined rule pill, never as the patient: for the patient's number use a live token.

### 6.2 Cut-off pills: `{>=10 mmHg}`

`{>=10 mmHg}` (also `>`, `<`, `<=`, `≥`, `≤`) renders an **outlined** pill with the comparison symbol dropped, so **write the words around it**: "above {>=5 mmHg}", "below {<12 mmHg}". A filled pill is *the patient*, an outlined pill is *the rule*.

Automatic pills/bold: if a line has no `{braces}`, the first `number + unit` (mmHg, g/dL, mL/min, kPa, cm/s, mm, %) becomes an outlined rule pill (a typed number is a rule or a published figure; only live values are filled). Give `pill: false` when it is neither, such as an anatomical size. Fixed key terms are auto-bold, at most 3 a line, first mention only: CSPH, SAAG, WHVP, FHVP, central vein, portal tracts, fenestrae, space of Disse, basement membrane, capillarization, wedged pressure, free pressure, sinusoidal pressure, caput medusae, gastrorenal shunt, stellate cells, encephalopathy, periportal fibrosis, intrahepatic resistance, hepatopetal, hepatofugal, cavernoma, a wave, pulsatility, reflection coefficient, Laplace, congestion index, gray zone, red wale marks. The slide's `key` tiles' words are bold too.

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
| `sin` (`SIN_R`) | Sinusoids | liver outlined | wedge | sinusoid(s), sinusoidal pressure |
| `whvp` | Sinusoids | liver outlined | wedge | WHVP, wedged pressure |
| `fhvp` (`RHV`) | RHV | `RHV_IVC` | hv | FHVP, free pressure |
| `hv` | RHV | `RHV_IVC`, `MHV_IVC`, `LHV_IVC` | hv | hepatic vein(s) |
| `ivc` (`IVCS`) | IVC | `IVCS_RA`, `IVC_IS` | ivc | IVC, inferior vena cava |
| `ra` (`RA`) | RA | whole heart lit by a soft glow (`heart`; `heart-ra` still names it) | ra | right atrium |
| `varix` (`VAR`) | Esoph. varices | `C1a`, `C1b` | var | esophageal varices, varices, varix |
| `gv` (`GV`) | Fundal varices | `C2` | var | gastric varices, fundal varices |
| `lgv` (`LGV`) | L. gastric v. | `LGV_CONF`, `V_STO` | var | left gastric vein, coronary vein |
| `azy` (`AZY`) | Azygos | `AZY_SVC` | var | azygos (vein) |
| `lpv` (`LPV`) | L portal | `PVH_L` | pv | left portal vein |
| `lrv` (`LRV`) | L renal v. | `LRV_IVC`, `V_KID_L` | ivc | left renal vein |
| `spleen` | none | spleen outlined | sv | spleen |
| `liver` | none | liver outlined | wedge | liver |
| `heart` | none | heart outlined | ra | heart |
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

## 7. The data card

### 7.1 `data`

* `data: 'ladder'`: the pressure ladder (portal vein → WHVP → FHVP → IVC → RA) with HVPG and PPG brackets and the station key. Use `key: ['hvpg','ppg']` to highlight rungs/brackets.
* `data: 'tiles'`: readout tiles only. `tiles: [..]` picks them (section 8.6); `key: [..]` highlights tiles (and bolds their words in the line).
* `delta`: shows each tile's change from another state: `true` (from the slide before), `false` (none), or **a slide `id`** (change from that slide's state). A slide that changes the same patient (no `preset`) counts from the slide before unless it says `delta: false`.
* `brackets: { hvpg | ppg: 'misleads' | 'works' }`: colours the ladder's bracket red (misleads) or green (works). Used for "the HVPG misses it" / "the PPG finds it".
* `block: 'pv' | 'whvp' | 'fhvp' | 'ivc' | 'ra'` on a ladder slide marks the station where pressure is lost with the ladder's bold red diagonal hatching on that node (no text). Heart-failure slides use `block: 'ra'`. Leave it off ladders of a healthy or sinusoidal patient.
* `tiles` and `key` can also accompany `data: 'ladder'` (a slide with `data: 'ladder'` and `tiles` shows both).

### 7.2 `tool`: an instrument in the card (above the tiles if `data` is also set)

`title?` renames the card on any kind. When `data` is also set, the instrument sits above the tiles; on a phone it folds behind a Show button, and `open: true` keeps the instrument open there and folds the tiles instead.

| `tool` | Shows |
|---|---|
| `{ kind: 'doppler', vessel }` | spectral Doppler in one vessel. `vessel` ∈ `PV_TRUNK` (MPV), `PVH_R`, `PVH_L`, `SMV_CONF`, `V_INT`, `SV_CONF`, `V_SPL`, `RHV_IVC`, `MHV_IVC`, `LHV_IVC`, `IVCS_RA`, `A_HEP`, `TIPS`. `waves: true` names a hepatic vein's a, S, D waves. `delta: '<slideId>'` shows an earlier reading as a ghost. |
| `{ kind: 'scope' }` | the esophagus at this slide's varix state (endoscopy; **esophagus only**) |
| `{ kind: 'fibroscan' }` | liver stiffness, kPa |
| `{ kind: 'trace', range: 'talk' }` | portal, wedged, free pressure and HVPG at every slide so far (one point per state) |
| `{ kind: 'trace', range: 'beats' }` | live pressure trace, beat by beat |
| `{ kind: 'abdomen' }` | the belly with its ascites and collaterals |
| `{ kind: 'wall' }` | the varix in cross-section: Laplace's T, r, w |
| `{ kind: 'flowtime' }` | portal pressure and portal flow around a meal, drawn as the slide's time-lapse plays (clock in minutes) |
| `{ kind: 'flowtime', clock: 'days', lines: [lower, upper] }` | the same chart over a disease time-lapse: two fingerprint keys from `pv pvFlow sin asc hvpg varix`, one point a model day |

### 7.3 `visual`: replaces the text and figure area with a full panel (the figure is dimmed behind)

| `visual` | Extra fields |
|---|---|
| `'outline'` | **Never write this**; added automatically. |
| `'ladders'` | `of`: the rows to draw as ladders (slide ids). |
| `'table'` | `cols` (columns), `asc` (show SAAG and protein columns: `true`/`false`; default true only if `cols` is absent), `rowHead` (first column heading), `note` (heading of a text column, or an array of headings), `vs: 'first'` (arrows against the first row), `foot` (one sentence after the legend), `of` (rows). |
| `'scale'` | `scale: { key, max, low, marks: [[value, words, shortName?], …], legend?, sub? }`. `key: 'hvpg'` with `legend: true` draws the HVPG cut-off scale; `key: 'lsm'` the stiffness scale (`sub: ['hvpg','plt']` adds sub-readings). |
| `'quadrant'` | SAAG × protein quadrant (`of`: rows). |
| `'walls'` | the Laplace wall-tension illustration. |

Table column keys (`cols`): `pv whvp fhvp ivc ra hvpg ppg sin varix asc liver shunt saag tp plt lsm spleen map hr pvFlow res`. Default `cols`: `['pv','whvp','fhvp','ivc','ra','hvpg','ppg']`.

**`of` rows** are slide ids (strings, or `{ id, name?, title?, kicker?, note? }` to rename a row) or patients no slide shows: `{ preset, name | title, kicker?, note?, blank?: [columns], ref?: true }`. `ref: true` marks a reference row (keeps its numbers); a row's `vs: '<slideId>'` compares it with that row instead; `note` is the text column's words (string, or array for several note columns); `blank: [cols]` shows "not measurable" for those columns. Extra patients can also carry `params` and `days`.

Visuals may also carry `cam` (how the dimmed figure is framed).

### 7.4 `compare` and `whatIf`: acting on the live model

`whatIf: { label, param, min, max, step?, ends?: [low, high], unit? }` puts a slider on the slide that drags one parameter of the live model (`param` is a dotted path: `'cirrhosis'`, `'tips.d'`, `'thrombus.PV_TRUNK'`). The figure, ladder and tiles follow it; it starts at the slide's own value and the slide's computed state returns whenever the slide is shown again. `ends` names the two ends of the slider (`['None', 'Severe']`). Put it on key slides only, where the student can try the change.

#### `compare`: live treatment buttons

`compare: [{ label, params, own? }, …]`: buttons switch the live model between treatments in real time. `params`: each option's **full set of the switched keys** (switch off the others: e.g. every drug flag), `own: true` marks the option that is the slide's own state. Use with `data` so the numbers update.

---

## 8. Catalogue

### 8.1 Patient presets (`preset`)

| id | Group → site | Label | Own disease days | What it is |
|---|---|---|---|---|
| `healthy` | Normal | Healthy | 0 | HVPG ≈ 3, portal flow ≈ 1.1 L/min |
| `postprandial` | Normal | Post-prandial | 0 | splanchnic vasodilation (a meal) |
| `pvt-acute` | Prehepatic (`pre`) | Acute portal vein thrombosis | 0 | clot in `PV_TRUNK`; HVPG normal |
| `pvt-chronic` | Prehepatic | Chronic PVT (cavernous transformation) | 240 | cavernoma collaterals |
| `svt` | Prehepatic | Splenic vein thrombosis (sinistral PH) | 180 | clot in `SV_CONF`, fundal varices |
| `schisto` | Presinusoidal (`presin`) | Schistosomiasis / NCPH | 365 | high portal, normal wedged, HVPG normal |
| `cirr-comp` | Sinusoidal (`sin`) | Compensated cirrhosis | 365 | cirrhosis 0.4, HVPG 6–9, no varices |
| `csph` | Sinusoidal | Clinically significant PH | 365 | cirrhosis 0.6, HVPG ≥ 10, small varices |
| `cirr-decomp` | Sinusoidal | Decompensated cirrhosis | 540 | cirrhosis 0.85, albumin 2.8, diuretics; large varices, ascites |
| `cirr-hepatofugal` | Sinusoidal | End-stage cirrhosis, hepatofugal flow | 540 | cirrhosis 0.95, arterioportal shunting, splenorenal shunt |
| `gastric-varix` | Sinusoidal | Cirrhosis with gastrorenal shunt | 450 | isolated fundal varices (IGV1) fed by the short and posterior gastric veins, draining through the `C5` gastrorenal shunt (BRTO target); no esophageal varices until BRTO closes the shunt |
| `sos` | Postsinusoidal (`postsin`) | Sinusoidal obstruction syndrome | 21 | central-vein resistance |
| `budd-chiari` | Posthepatic (`post`) | Budd–Chiari | 60 | all three hepatic veins occluded |
| `ivc-web` | Posthepatic | IVC web | 90 | suprahepatic IVC stenosis |
| `rhf` | Cardiac (`cardiac`) | Right heart failure + TR | 60 | HVPG stays normal; pulsatile portal vein |
| `constrictive` | Cardiac | Constrictive pericarditis | 60 | high RA, HVPG normal |

### 8.2 Parameters (`params`, deep-merged; ranges are clamped)

| Key | Type / range | Meaning |
|---|---|---|
| `cirrhosis` | 0–1 | macro severity of cirrhosis |
| `fibrosis` | `{ R: { pre, sin, post }, L: { … } }`, each 1–80 | resistance multipliers by zone and lobe (right, left) |
| `stenosis` | `{ edgeId: 0–0.95 }` | lumen narrowing (e.g. `{ IVCS_RA: 0.6 }`, a web) |
| `thrombus` | `{ edgeId: 0–1 }` | occlusion (e.g. `{ PV_TRUNK: 1 }`, `{ TIPS: 1 }`) |
| `splenicRx` | 0 \| 1 \| 2 | none / partial splenic artery embolization / splenectomy |
| `splanchnicTone` | 0.4–2.5 | gut arteriolar resistance multiplier (< 1 = vasodilated, a meal ≈ 0.72) |
| `systemicTone` | 0.4–2.5 | systemic resistance |
| `contractility` | 0.15–1.6 | heart contractility |
| `tr` | 0–1 | tricuspid regurgitation |
| `pericardial` | 0–1 | pericardial constriction |
| `albumin` | 1.5–5 g/dL | serum albumin |
| `habrStrength` | 0–2 | hepatic arterial buffer response |
| `apShunt` | 0–1 | arterioportal shunting |
| `respiration`, `pulsatile` | boolean | breathing, pulsatile flow |
| `respDepth` | 0–3 | breathing depth |
| `spontaneous` | `{ C5: bool, C6: bool }` | gastrorenal shunt (C5), spontaneous splenorenal shunt (C6) present. C5 is absent by default; fundal varices need it |
| `isolatedGV` | boolean | isolated fundal varices (IGV1): the coronary vein never forms esophageal varices. Set by the `gastric-varix` preset |
| `occluded` | `{ C5: true }` | plugged collaterals (BRTO closes `C5`, and its feeder `C2`) |
| `tips` | `{ on: bool, d: 6–12 mm }` | TIPS stent and diameter (default 8) |
| `dips` | `{ on: bool, d: 6–12 }` | direct intrahepatic portosystemic shunt |
| `portocaval`, `dsrs`, `mesocaval` | boolean | surgical shunts (portocaval, distal splenorenal, mesocaval) |
| `customShunts` | `{ X_<portal>_<systemic>: 4–16 mm }` | custom shunt (not used by existing decks) |
| `balloonEso`, `balloonGas` | boolean | tamponade balloons |
| `anticoag` | boolean | anticoagulation |
| `diuretics` | boolean | spironolactone + furosemide |
| `drugs` | `{ propranolol, carvedilol, terlipressin, octreotide }` booleans | drugs. Switch the previous drug off in the same patch when moving to the next |
| `bleeding`, `deterministicRupture` | boolean | variceal rupture behaviour (leave to `action`) |

Patch only what you need: `params: { drugs: { carvedilol: true } }`.

### 8.3 Actions (`action`, one object or an array)

| `kind` | Fields | Effect |
|---|---|---|
| `band` | none | one banding session on the varices (three in an array = eradication) |
| `paracentesis` | `mL`, `albumin?` | drain ascites (e.g. `8000`) |
| `hemorrhage` | `mL` | blood loss (e.g. `1000`) |
| `infuse` | `fluid`: `'crystalloid'` (1 L), `'prbc'`, `'albumin'`, `'plasma'` | infusion; albumin also raises serum albumin by 0.25 |
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
| `SV` | Splenic vein | Splenic v. | portal |
| `LGV` | Left gastric (coronary) vein | L. gastric v. | portal |
| `CONF` | Portal vein (main) | Portal v. | portal |
| `PVH` | Portal vein (hilum) | PV hilum | portal |
| `RPV` | Right portal vein | R portal | portal |
| `LPV` | Left portal vein | L portal | portal |
| `VAR` | Esophageal varices | Esoph. varices | varix |
| `GV` | Gastric fundal varices | Fundal varices | varix |
| `SIN_R` / `SIN_L` | Sinusoids, right / left lobe (inlet) | Sinusoids R / L | liver |
| `CV_R` / `CV_L` | Central veins, right / left lobe | Central v. R / L | liver |
| `W_R` `W_M` `W_L` | Wedge compartment (RHV, MHV, LHV) | Wedge R / M / L | wedge |
| `RHV` `MHV` `LHV` | Right / middle / left hepatic vein | RHV / MHV / LHV | hepatic vein |
| `IVCI` | IVC (renal level) | Lower IVC | vein |
| `IVCS` | IVC (suprahepatic) | IVC | vein |
| `RA` | Right atrium | RA | heart |
| `SVC` | Superior vena cava | SVC | vein |
| `AZY` | Azygos vein | Azygos | vein |
| `ILI` | Iliac veins | Iliac v. | vein |
| `EPI` | Epigastric / umbilical veins | Umbilicus | vein |
| `KID_L` | Left kidney | L kidney | bed |
| `LRV` | Left renal vein | L renal v. | vein |
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
Edge tones used when you glow an id by hand: portal vessels follow their station colour; collaterals and shunts (`C3`–`C9`, `S_PC`, `S_DSR`, `S_MC`) use the varices' colour `var`.

### 8.6 Tiles (`tiles`, `key`, `{token}`, table `cols`)

| Key | Name | Unit | Rating (colour) |
|---|---|---|---|
| `hvpg` | HVPG (wedged − free) | mmHg | **amber ≥ 5 ("Mild"), red ≥ 10 ("CSPH")** |
| `ppg` | PPG (portal − IVC) | mmHg | **amber ≥ 6 ("High"), red ≥ 12 ("Bleed risk")** |
| `pv` | Portal vein pressure | mmHg | red > 10 |
| `sin` | Sinusoidal pressure | mmHg | amber ≥ 9, red ≥ 12 |
| `whvp` | WHVP (wedged hepatic vein) | mmHg | red > 10 |
| `fhvp` | FHVP (free hepatic vein) | mmHg | red > 8 |
| `ra` | Right atrium | mmHg | red > 8 |
| `ivc` | IVC | mmHg | red > 8 |
| `saag` | SAAG (serum − ascites albumin) | g/dL | ≥ 1.1 portal hypertension |
| `tp` | Ascites protein | g/dL | < 1.5 flagged (SBP risk) |
| `asc` | Ascites volume | L | none < 0.15 L; grade 1 < 1.5 L; grade 2 < 5 L; grade 3 tense |
| `varix` | Esophageal varix diameter | mm | amber ≥ 2.5, red ≥ 5 |
| `gv` | Gastric varix diameter | mm | same |
| `spleen` | Spleen length | cm | red > 13 |
| `plt` | Platelets | × 10³/µL (88 = 88,000/µL) | amber < 150, red < 100 |
| `pvFlow` | Portal vein flow | L/min | red if reversed |
| `pvVel` | Portal vein velocity (Doppler, main portal vein) | cm/s | amber < 15 ("Slow"), red < 9 ("Stasis") or reversed |
| `liver` | Liver flow, % of normal | % | amber < 80, red < 50 |
| `shunt` | Portal blood bypassing the liver | % | amber ≥ 20, red ≥ 50 |
| `map` | Mean arterial pressure | mmHg | red < 65 |
| `hr` | Heart rate | /min | slow < 60, fast > 100 |
| `lsm` | Liver stiffness (FibroScan) | kPa | amber ≥ 10 ("cACLD"), 15–25 ("Borderline"), red ≥ 25 ("CSPH") |
| `salb` | Serum albumin | g/dL | amber < 3.5 |
| `hb` | Hemoglobin | g/dL | amber < 12, red < 7 |

Status words read in order: Normal, then High (or Low), then Severe; HVPG, PPG and stiffness use their guideline meaning instead (Mild/CSPH, High/Bleed risk, cACLD/Borderline/CSPH). The spleen is Normal or Large.

Key facts for text: normal HVPG 1–5; CSPH is HVPG ≥ 10; bleeding risk rises steeply from an HVPG of about 12 (rising risk, not a cut-off: varices can bleed below it); PPG normal ≤ 5; Baveno VIII stiffness: < 10 kPa normal, ≤ 15 with platelets ≥ 150 rules CSPH out, 15–25 gray zone (ANTICIPATE ≥ 75% or spleen stiffness ≥ 55 kPa rules it in), ≥ 25 CSPH.

---

## 9. Authoring rules (the house rules)

1. **One idea per slide.** Title stands alone, one sentence in `line`, ≤ 4 `causes`, one card.
2. **One name per station.** Use the vocabulary in section 6.3 (portal vein, sinusoids/WHVP, hepatic vein/FHVP, IVC, right atrium/RA). Do not rename a station within a deck.
3. **No repeated pointer.** Never add a `note` mark or label that names what a station label already names on that slide (e.g. VAR is labelled "Esoph. varices", so no "Esophageal varices" pointer). `block` and `treat` marks say something new (Clot, Banded varices), so they stay.
4. **Definitions are fixed:** **HVPG = WHVP − FHVP**, cut-offs **amber 5, red 10**. **PPG = portal vein − IVC**, cut-offs **amber 6, red 12**. In equations write `HVPG = WHVP − FHVP` and `PPG = P_portal vein − P_IVC`. Never define HVPG as portal minus hepatic or PPG as portal minus RA.
5. **Endoscopy is esophagus-only.** The scope tool and any endoscopy words refer to the lower esophagus; do not add gastric endoscopy.
6. **Use live values.** Say numbers through `{hvpg}` / `{ppg}` / `{pv}` etc. and rules through `{>=10 mmHg}`; do not type measured numbers that the model produces. Write cut-off words around the outlined pill ("above {>=5 mmHg}").
7. **Eased animation.** Everything eases in and out on its own; never write a slide that relies on a jump or pop. Use `ramp` + `lapse` for change over time (days ≥ lapse seconds), never a fake step. Camera moves are automatic.
8. **Do not add** a Guidelines tab or slide type; there is none. Do not change the original organ colours or organ art (muted hues and procedural lighting were rejected).
9. **Point only at what has a target** (section 6.3); everything else stays plain or bold.
10. **Order the patient deliberately.** First slide: `preset` (usually `healthy` or the disease). Later slides continue the same patient; use `params`/`days`/`action` to change it, `delta: true` or `delta: '<id>'` to show what changed. Switch the previous drug flag off when switching drugs.
11. **Every content slide has** `id`, `kicker`, `title`, `line`, `notes` (2–4 sentences a lecturer can read aloud) and `ask: [question, answer]`. The last slide is a `visual: 'table'` summary under `kicker: 'Summary'` with `of` rows naming the earlier slides, and the deck ends with `checks` (3 or 4 `[question, answer]` pairs; the app adds the quick-check slide).
12. **Decks:** 6–12 slides, 3–4 `objectives`, ≥ 3 kicker groups or explicit `sections`, `level` one of foundation/core/advanced.
13. **Style:** plain sentence case, no emoji, American spelling, numbers with units (`mmHg`, `g/dL`, `kPa`), clinically accurate (Baveno VIII, the latest, never Baveno VII; AASLD where US practice differs; US drug choices such as octreotide). Write for the learner, never the instructor, in full grammatical sentences that read like a clinician-teacher at the bedside (`docs/ai-humanizer.md`). Use proper clinical shorthand ("OCP use", never "on the pill"). Never write "our patient" or "the patient we just measured", and never an ambiguous "this patient": say "in this case, the HVPG is…" or use the case's own description. Say **resistance** (site labels and running prose), not "block" or "obstruction", for where pressure is lost; drug and procedure uses such as "blocks α1 receptors" stay. (The code's `kind: 'block'`, `block:` and `callout` names are fine; only learner-facing text is affected.) Word thresholds as rising risk, not a cliff.
14. **No new furniture by hand.** The app adds the deck's short name and the site tag above the title (decks covering more than one `site`), disease-name pills (list in `src/ui/diseases.js`), the Outline slide, the quick check and the corner credit. Do not write them into lines or titles.
15. Presenter shows pressure unless a slide sets `lens` (section 5.2), and keeps the app's own N, S, L keys off while presenting; there are **no card or test-type fields on slides**: the nearest are `tool.kind` and `visual` (section 7).

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
      // sites: ['pv'], cath: 'result', monitor: 'result',
      data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], // or data: 'ladder', key: ['hvpg', 'ppg']
      // delta: true, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, step: 0.05, ends: ['None', 'Occluded'] },
      kicker: 'Group name', site: 'pre', title: 'A headline that stands alone',
      line: 'One sentence with [portal vein](pv) pointing at the figure and the live value {pv}, above {>=10 mmHg} the rule.',
      // causes: ['…', '…'],
      notes: 'Two to four sentences of speaker notes.',
      ask: ['Question for the room?', 'Expected answer.'],
    },
    // … more slides …
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'first', title: 'The patient' }],
      kicker: 'Summary', title: 'What to remember',
      line: 'One sentence that sums the deck up.',
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
      id: 'cath', cath: 'result', data: 'ladder', key: ['hvpg', 'ppg'], tiles: ['hvpg', 'ppg'], brackets: { hvpg: 'misleads', ppg: 'works' },
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
      line: 'The HVPG stays normal in both; the PPG rises when the portal vein itself carries the resistance.',
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
   * Add it to `TOPICS` (the unified menu) under exactly one topic, with a short title of **32 characters or fewer** and a running head of **20 or fewer**:
     `['causes', 'Causes', [ …, ['clot-demo', 'A clot in the portal vein', 'Portal vein clot'] ]]`.
     Topics, in order: `foundations`, `causes`, `measuring`, `complications`, `treatment`. A deck missing from `TOPICS` fails the menu test.
3. **Check it:** `npm run lint && npm test`. Among the tests that guard a deck: every deck is listed once under a topic with a short title and its own running head (`menu`); every slide's `ask[0]` appears in the printed handout (`handout`); a term a slide gives is named by its line and no slide loses a pill (`deck-terms`); a line that sets a live HVPG or PPG beside a threshold matches the patient the slide shows (`deck-thresholds`, with a hand-checked exceptions list at its top); site tags and disease pills (`site-tags`, `disease-pills`); every case card is under 220 characters on a slide with a preset (`case-card`).
4. **Stamp scripts:** `npm run stamp` rewrites the `?v=` hashes (required whenever a script file changed; a stale stamp fails the unit job and skips the deploy).
5. **Optional deck-picker stills:** `node scripts/deck-stills.mjs <id>` writes `brand/decks/<id>-light.webp` and `-dark.webp` (200×250); run it after the deck exists.
6. **Preview:** follow `AGENTS.md` (the single source of truth for the preview workflow). In short: pushing the integration branch `claude/settings-topbar-icon-flvft1` publishes `/preview/` at https://qaddodi.github.io/portal-pressure-simulator/preview/ . Rebase on the latest preview right before pushing, never force-push, grep for conflict markers, never push to `main` (the owner merges), and check the "Pages (live site + preview)" deploy job succeeded.
7. **Test on the preview:** Present menu → pick the deck. In the app: ←/→ step, G lists the slides, B blacks the screen, ? opens the Guide with every presenter key.

**Alternative with no code:** an instructor can capture slides inside the app (stored in the browser as "Yours"); those support only `preset, presetDays, params, action, days, view, cam, kicker, title, line, causes, site, notes, ask, key` and always show the ladder. Full decks need the file route above.

---

## 13. Importing in the app (what the in-app import accepts)

**A full deck file (sections 2 to 11) can be imported in the app.** Menu › Present › "Your scripts" › **Import** opens a dialog: choose a file (`.js` deck, or `.json` deck or script) or paste its contents, then "Add to your scripts". The deck keeps every feature (term pills, live values, marks, tools, visuals, time-lapses) and is stored in the browser (`pps.scripts`) on that device only.

The `.js` is **read as data, never run** (`src/ui/deck-source.js`). It accepts what the built-in decks use: `const` declarations, `export const` / `export default`, objects, arrays, strings and template literals, numbers, spreads, `+ - * / %`, comparisons, `&& || ??`, `? :`, arrow functions with an expression body (`(x) => …`, `(d) => ({ … })`), and the array methods `map filter flatMap concat slice join includes some every find`. `mi mo mn sub frac` are built in, so a deck may use them without defining them. Refused, with the line number: `import`, `function` declarations, block-bodied arrows, `new`, `this`, globals (`window`, `document`, `Math`, …), methods other than those listed, and `__proto__ / constructor / prototype`. The deck is the exported object with a `slides` array (else the last such `const`); it needs a `title`, and each slide a `title`. Import adds a copy each time; "Export" writes it back as JSON, which imports again.

The older **script** format (below) is still accepted, and a shared link `…/#script=<encoded>` adds a script or an imported deck to the recipient's library.

Script file (`*.pps-script.json`):

```json
{
  "title": "My script",                       // required
  "summary": "One sentence.",                 // optional; objectives, minutes, level are kept if present
  "steps": [                                  // required array; each step becomes one slide
    {
      "title": "Slide headline", "kicker": "Group", "line": "One sentence.",
      "notes": "Speaker notes.", "ask": ["Question?", "Answer."],
      "preset": "cirr-decomp", "presetDays": 0,
      "params": { "drugs": { "carvedilol": true } }, "action": { "kind": "band" }, "days": 30,
      "view": "anatomic", "cam": "portal",
      "causes": ["…"], "site": "sin", "key": ["hvpg", "ppg"]
    }
  ]
}
```

* Only those step fields are read (`preset presetDays params action days view cam kicker title line causes site notes ask key`; `tell` works as an alias of `notes`). Everything else is **dropped silently**: `labels terms glow mark tiles tool visual compare lapse ramp cath sites layers callout eq delta` and the `{live value}` / `[term](target)` markup (shown as plain text).
* Every imported slide shows the pressure ladder (`data: 'ladder'`) beside the figure, and the camera is `'fit'` on the circuit view.
* Import adds a copy each time with a new id (`my-…`) and never overwrites; "Export" in the same menu writes this format. The deck's Outline slide is added automatically, as for built-in decks.

**Therefore:** paste or choose a deck `.js` to present it in full without changing the app; add it as a code deck (section 12) only to make it built in for everyone.

---

## 14. Case cards

A **case card** opens a new patient with a short clinical case. When the talk moves forward onto a slide that brings in a new patient, a centred frosted-glass card (the same glass as the other cards) covers the figure. It holds a small **Case** pill and the case text, nothing else (no numbers, no site tag). Behind the card the new patient loads and the camera glides, once, straight to the framing of the slide that follows (the lobule included); **Next, a tap on the card or a swipe** lifts the card, and the teaching card and data card come in with no further camera move. A tap, Next or swipe *while the patient is still loading* only lifts the card and lands on that same slide; it never skips ahead.

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
* **Going forward only.** The card shows when the talk moves forward onto the slide (a step or a jump ahead) and the slide loads a new patient. Stepping back onto it shows the slide without the card. A slide with its own `lapse` never shows one, so do not put a case on a time-lapse slide.
* Sites and causes has six cases (one per level); most other decks have one to seven.

### Writing the case

* **What it holds:** age and sex, the relevant history or cause, then what brought the person in and one or two findings (labs, endoscopy, ultrasound, exam). Two or three full sentences, like a case on rounds. Learner-facing, never instructor-facing.
* **It must agree with the model on that slide.** Run the slide's preset to steady state and read what the app shows: varix size, ascites or none, spleen size, platelets, albumin, stiffness, flow direction, whether the portal vein is patent. If the slide shows large esophageal varices, the case may say large varices; if it shows no ascites, the case must not describe ascites. Quote **labs and findings, not pressures**, so the case never clashes with the ladder or the tiles (pressures come from the model; section 9 rule 6). Real-world details the model does not simulate (the cause, age, a lab not shown) are fine as long as they do not contradict what is shown.
* **Vary the people.** Ages, sexes and causes differ from deck to deck so the same preset never reads as the same person twice (for example, schistosomiasis is a man from Yemen in one deck, a Filipino rice farmer in another, a Brazilian in a third).
* **Wording:** full grammatical sentences, no sentence fragments. Clinical shorthand as a clinician writes it: OCP use, MASH, MASLD, EGD, TR, JVP, RUQ, HSCT, "alcohol-associated cirrhosis". American spelling, numbers with units (`88,000/µL`, `2.8 g/dL`, `24 kPa`). Never "our patient", "the patient we just measured", or an ambiguous "this patient" (a case is not a patient we have followed). Apply the rest of section 9 rule 13 and `docs/ai-humanizer.md`.
* **Guidelines:** Baveno VIII, with AASLD where US practice differs. A case describes a presentation, not a recommendation, so it rarely needs a guideline, but never contradicts one.

### Checking one

* Count the characters: under 220, spaces included. `tests/case-card.test.js` does it for every deck.
* Read it against the slide's tiles and figure on the preview: Present menu, pick the deck, step to the slide with Right arrow or Next; the card appears, the figure behind it shows the new patient already at the slide's framing, and Next lifts it.
* Stepping back onto the slide must show no card.
