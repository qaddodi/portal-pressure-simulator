# Deck authoring guide: Portal Pressure Simulator presenter decks

Self-contained brief for an AI that writes new presenter decks **without seeing the code**. Everything here was read from the app's source on the preview branch `claude/settings-topbar-icon-flvft1` (commit `81c8c4e`, files `src/ui/decks.js`, `src/ui/decks/*.js`, `src/ui/presenter.js`, `src/ui/presenter-tools.js`, `src/engine/scenario.js`, `src/engine/topology.js`, `src/ui/anatomy.js`, `src/worker-core.js`). Use only the names listed here; an unknown key is silently ignored, an unknown target is silently dropped.

Contents: 1 What a deck is · 2 Deck fields · 3 Slide fields · 4 The model state (patient, parameters, actions, time-lapse) · 5 The figure (views, camera, labels, glow, marks, sites, catheter) · 6 The words (live values, cut-offs, term pills) · 7 The data card (ladder, tiles, tools, visuals, compare) · 8 Catalogue (presets, parameters, stations, vessels, targets, tiles) · 9 Authoring rules · 10 Blank template · 11 Example deck · 12 Adding the deck to the app  · 13 Importing in the app

---

## 1. What a deck is

A deck is a plain JavaScript object (one ES module per deck). The app plays it as a projector-first talk on a **live physiological model**: each slide sets a patient state, frames the figure, and shows one idea (a headline, one sentence, optional causes, and a card of numbers or an instrument). The model state of every slide is computed off screen **in order, each from the slide before**, so forward, back and jump always show the same numbers.

Every deck automatically gets an "Outline and objectives" slide in front (built from `objectives` and the slides' `kicker` groups). **Never write that slide yourself.** The first real slide keeps the patient of the outline.

A slide is **one idea**: a standalone title, a one-sentence line, at most four causes, a figure that shows it.

## 2. Deck fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kebab-case, unique across all decks (existing: `circulation sites hvpg ascites varices treatment stiffness one-year tap circuit lobule shunts doppler endoscopy prehepatic right-heart variceal-bleed`). |
| `level` | `'foundation'` \| `'core'` \| `'advanced'` | Shown as Foundation / Core / Advanced. |
| `title` | string | Full title. |
| `minutes` | number | Talk length. |
| `summary` | string | One or two sentences for the picker. |
| `objectives` | string[] | **3 to 4** short learning objectives (start with a verb: "Explain…", "Name…"). |
| `slides` | slide[] | See section 3. |
| `sections` | `[name, [kickers]][]` | Optional. 3 to 5 sections for the running head. Needed only when the deck has more than 5 distinct `kicker` values; with 3 to 5 kicker groups the sections are built from them automatically. A kicker `'Summary'` is left out of the outline. |
| `short` | string | **Set by the menu table, not in the deck file** (see section 12). Max 32 characters. |
| `topic` | string | Set by the menu table too. |

## 3. Slide fields

Every field is optional unless marked. Fields are grouped by what they do. Unknown values are ignored.

### 3.1 Identity and words

| Field | Type / allowed values | Default | Meaning |
|---|---|---|---|
| `id` | string | none | Unique within the deck. Required if any `of`, `delta`, `vs` or summary row refers to the slide, and handy for notes. |
| `kicker` | string | `''` | Small heading above the title; slides with the same kicker form one group (outline, running head). Use `'Summary'` for the closing slide. |
| `site` | `'pre'` `'presin'` `'sin'` `'postsin'` `'post'` `'cardiac'` | none (grey) | Colours the kicker by the level of the block (pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac). `'pvt'` appears in one deck but has no colour, so avoid it. |
| `title` | string | `'Step'` is not applied to decks; give one | The headline. **Must stand alone without the kicker.** |
| `line` | string | none | One sentence under the headline. May use `{live values}`, `{>=5 mmHg}` cut-offs and `[word](target)` term pills (section 6). |
| `causes` | string[] | none | Up to **4** short bullet items. |
| `causesHead` | string | `'Causes'` | Heading of the causes list (e.g. `'Who gets it'`). |
| `bold` | string[] | `[]` | Extra key terms to bold wherever the line names them (at most 3 bold terms a line are applied). |
| `pill` | `false` | auto | `false`: no automatic value pill in the line. Without `{braces}` the first number with a unit becomes a pill. |
| `eq` | `[mathML, legend?]` | none | Equation under the title (MathML string plus an optional legend sentence). See helpers in section 11. |
| `notes` | string | `''` | Speaker notes. Printed in the handout. Give every slide notes. |
| `ask` | `[question, expected answer]` | none | Question for the room. Give every content slide one. The handout test requires `ask[0]` to appear. |
| `quiz` | string | none | If present, quiz mode (Q) shows this question first with the figure at "fit", and the answer slide on the next click. |
| `rail` | `true` \| `'all'` | none | `true`: the six levels with this slide's `site` marked; `'all'`: all six levels named. |
| `column` | `true` | none | Draws the wedge-pressure column illustration (portal vein, sinusoids, central venule, balloon) in the text panel. |

### 3.2 Model state (section 4)

`preset`, `presetDays`, `params`, `action`, `days`, `ramp`, `lapse`.

### 3.3 The figure (section 5)

`view`, `cam`, `kMax`, `zoom`, `labels`, `terms`, `glow`, `glowSeq`, `mark`, `marks`, `sites`, `layers`, `callout`, `cath`, `monitor`.

### 3.4 The data card (section 7)

`data`, `tiles`, `key`, `delta`, `brackets`, `tool`, `visual` (+ `cols`, `asc`, `rowHead`, `note`, `vs`, `foot`, `of`, `scale`), `compare`.

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

**Named regions** (`REGIONS`, anatomy world units x 300–1120, y 0–920): `route` portal vein to heart · `liver` · `portal` confluence, trunk, splenic vein, SMV · `hepatic` hepatic veins, IVC, right atrium · `heart` · `varices` · `spleen` · `rectum` · `wall` paraumbilical vein and abdominal wall · `fundus` fundal varices, gastrorenal shunt, left renal vein · `splenic` splenic vein to the confluence, spleen, fundus. Also `'fit'` (whole figure) and a box `[x0, y0, x1, y1]` (e.g. `[690, -10, 890, 170]`). The camera also grows to include any organ the slide outlines.

**Inside the liver** (these dive in from the anatomy; the view returns to the body plate for the next normal `cam`):
`'lobule'` (whole lobule) · `'lobule:fit'` · `'lobule:triad'` (portal tract) · `'lobule:sinusoid'` · `'lobule:central'` (central vein) · `'sinusoid'` (the sinusoid wall, cross-section). Some devices cannot draw `'sinusoid'` and fall back to the lobule.

### 5.2 Layers and lobule callouts

* `layers: ['zones']` turns the lobule's zone 1 / 3 bands on for the slide (needed for the `lobule:zone1` / `lobule:zone3` labels). Other lobule slides have them off; the viewer's own layers return when the show ends. (The code also mentions a `'lymph'` layer in the engine note; only `'zones'` is read by the current presenter code.)
* `callout: { at, label }` on a lobule slide: a red "block" callout in the lobule. `at` values used: `'triad'` (portal tract), `'sin'` (sinusoids), `'cv'` (central venules). Example: `callout: { at: 'sin', label: 'Block: sinusoids' }`.

### 5.3 Station labels

`labels: ['CONF', 'SIN_R', 'RHV', 'RA']`: the stations named on the anatomy figure (none shown if absent; **only the stations you list, plus those your terms point at, appear**). Valid ids are node ids (section 8.4). Only labels the anatomy draws appear. On the circuit view the labels are the circuit's own.
`VAR` (esophageal varices) is hidden when the patient has no varices; `GV` is hidden when there are no fundal varices.
On ladder (`data: 'ladder'`) and catheter (`cath`) slides the figure automatically renames to "Sinusoids R · WHVP" and "RHV · FHVP".

### 5.4 Glow, highlights and term pills

* `terms` : words in the line that become coloured pills **and** light the figure (section 6.3).
* `glow: [...]`: light vessels or organs directly. Items: a target key (`'smv'`, `'liver'`), a vessel/edge id (`'PV_TRUNK'`, `'C5'`), an organ (`'liver'` `'spleen'` `'heart'`), or `{ id, tone }`. Tone defaults to the target's station colour (accent for an unknown edge). Terms glow automatically, so `glow` is for things the line does not name.
* `glowSeq: 550`: ms between successive `glow` items, so they light in order (e.g. pressure travelling back from the heart). Existing use: `550`.
* Tones usable in `{ id, tone }`: `pv`, `sv`, `smv`, `wedge`, `hv`, `ivc`, `ra`, `var`, `accent`, or a CSS variable name starting `--` (e.g. `'--danger'`).

### 5.5 Marks (callouts on a vessel)

`mark: { edges, label, kind }` or `marks: [ … ]` (several). `edges` = vessel ids (section 8.5). Only labelled marks get a callout box.

| `kind` | Look | Use for |
|---|---|---|
| `'block'` (default) | danger red | a clot, web, rupture, occlusion |
| `'treat'` | accent | a stent, bands, a closed shunt |
| `'note'` | a pointer: the vessel glows in its station colour with a small boxed name | naming a collateral, a shunt |

**No repeats:** a `note` mark whose vessel is already named by a station label (or a term) on the slide is dropped by the engine, but its glow stays. Do not point at what a label already names.
Marks are hidden in quiz mode until the answer shows.

### 5.6 Readouts on the figure

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

### 5.7 The HVPG catheter

`cath` replaces the camera with the catheter choreography (the camera follows it): `'route'` (in along the jugular route) · `'free'` (free hepatic vein pressure) · `'wedge'` (balloon up, still column, WHVP) · `'result'` (both pressures and the HVPG) · `'blocked'` (catheter in a presinusoidal block).
`monitor: 'free' | 'wedge' | 'result'` shows the catheter's pressure-monitor trace under the slide's words.

---

## 6. The words

### 6.1 Live values: `{token}`

`{pv}` in a `line` is replaced by the model's **live reading for that slide**, in a pill, rounded as the card shows it. Ladder slides (`data: 'ladder'`) round `pv`, `whvp`, `fhvp`, `ivc`, `ra` to whole mmHg. The pill takes the station colour where one exists (`pv`, `whvp`, `sin`, `fhvp`, `ivc`, `ra`); sizes (`spleen`, `varix`, `gv`) take their status colour (amber/red). Prefer a live token over a typed number so it cannot drift.

Valid tokens (the tile keys, section 8.6): `hvpg ppg pv sin whvp fhvp saag tp asc varix gv spleen plt pvFlow liver shunt map hr lsm ra salb ivc hb`. A typed `{8 mmHg}` also works but avoid it.

### 6.2 Cut-off pills: `{>=10 mmHg}`

`{>=10 mmHg}` (also `>`, `<`, `<=`, `≥`, `≤`) renders an **outlined** pill with the comparison symbol dropped, so **write the words around it**: "above {>=5 mmHg}", "below {<12 mmHg}". A filled pill is *this patient*, an outlined pill is *the rule*.

Automatic pills/bold: if a line has no `{braces}`, the first `number + unit` (mmHg, g/dL, mL/min, kPa, cm/s, mm, %) becomes a pill. Fixed key terms are auto-bold, at most 3 a line, first mention only: CSPH, SAAG, WHVP, FHVP, central vein, portal tracts, fenestrae, space of Disse, basement membrane, capillarization, wedged pressure, free pressure, sinusoidal pressure, caput medusae, gastrorenal shunt, stellate cells, encephalopathy, periportal fibrosis, intrahepatic resistance, hepatopetal, hepatofugal, cavernoma, a wave, pulsatility, reflection coefficient, Laplace, congestion index, gray zone, red wale marks. The slide's `key` tiles' words are bold too.

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
| `sv` (`SV`) | Splenic vein | `SV_CONF`, `V_SPL` | sv | splenic vein, splenic |
| `smv` (`SMV`) | SMV | `SMV_CONF`, `V_INT` | smv | superior mesenteric vein(s) |
| `sin` (`SIN_R`) | Sinusoids | liver outlined | wedge | sinusoid(s), sinusoidal pressure |
| `whvp` | Sinusoids | liver outlined | wedge | WHVP, wedged pressure |
| `fhvp` (`RHV`) | RHV | `RHV_IVC` | hv | FHVP, free pressure |
| `hv` | RHV | `RHV_IVC`, `MHV_IVC`, `LHV_IVC` | hv | hepatic vein(s) |
| `ivc` (`IVCS`) | IVC | `IVCS_RA`, `IVC_IS` | ivc | IVC, inferior vena cava |
| `ra` (`RA`) | RA | right atrium outlined (`heart-ra`) | ra | right atrium |
| `varix` (`VAR`) | Esoph. varices | `C1a`, `C1b` | var | esophageal varices, varices, varix |
| `gv` (`GV`) | Fundal varices | `C2` | var | gastric varices, fundal varices |
| `lgv` (`LGV`) | L. gastric v. | `LGV_CONF`, `V_STO` | var | left gastric vein, coronary vein |
| `azy` (`AZY`) | Azygos | `AZY_SVC` | var | azygos (vein) |
| `lpv` (`LPV`) | L portal | `PVH_L` | pv | left portal vein |
| `lrv` (`LRV`) | L renal v. | `LRV_IVC`, `V_KID_L` | ivc | left renal vein |
| `spleen` | none | spleen outlined | sv | spleen |
| `liver` | none | liver outlined | wedge | liver |
| `heart` | none | heart outlined | ra | heart |
| `rLiver` | none | circuit: liver resistor zigzag | wedge | resistance |
| `rColl` | none | circuit: collateral resistor | var | collaterals |
| `rGut` | none | circuit: gut arterioles | smv | gut arterioles |

Inside the liver (the view's own label takes the colour with a soft glow; use with a lobule/sinusoid `cam`):

| Key | Tone | Words |
|---|---|---|
| `lobule:triad` | pv | portal tract(s), portal triad(s), portal venule(s) |
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

**Vocabulary for lines:** portal vein (PV) · sinusoids = wedged pressure (WHVP) · hepatic vein = free pressure (FHVP) · IVC · right atrium (RA). In the lobule the figure says "Portal venule" and "Central venule"; lines pointing at those labels use the same words (the tract holds the venule). Use American spelling (esophagus, hemoglobin, gray).

---

## 7. The data card

### 7.1 `data`

* `data: 'ladder'`: the pressure ladder (portal vein → WHVP → FHVP → IVC → RA) with HVPG and PPG brackets and the station key. Use `key: ['hvpg','ppg']` to highlight rungs/brackets.
* `data: 'tiles'`: readout tiles only. `tiles: [..]` picks them (section 8.6); `key: [..]` highlights tiles (and bolds their words in the line).
* `delta`: shows each tile's change from another state: `true` (from the slide before), `false` (none), or **a slide `id`** (change from that slide's state). A slide that changes the same patient (no `preset`) counts from the slide before unless it says `delta: false`.
* `brackets: { hvpg | ppg: 'misleads' | 'works' }`: colours the ladder's bracket red (misleads) or green (works). Used for "the HVPG misses it" / "the PPG finds it".
* `tiles` and `key` can also accompany `data: 'ladder'` (a slide with `data: 'ladder'` and `tiles` shows both).

### 7.2 `tool`: an instrument in the card (above the tiles if `data` is also set)

`title?` renames the card on any kind.

| `tool` | Shows |
|---|---|
| `{ kind: 'doppler', vessel }` | spectral Doppler in one vessel. `vessel` ∈ `PV_TRUNK` (MPV), `PVH_R`, `PVH_L`, `SMV_CONF`, `V_INT`, `SV_CONF`, `V_SPL`, `RHV_IVC`, `MHV_IVC`, `LHV_IVC`, `IVCS_RA`, `A_HEP`, `TIPS`. `waves: true` names a hepatic vein's a, S, D waves. `delta: '<slideId>'` shows an earlier reading as a ghost. |
| `{ kind: 'scope' }` | the esophagus at this slide's varix state (endoscopy; **esophagus only**) |
| `{ kind: 'fibroscan' }` | liver stiffness, kPa |
| `{ kind: 'trace', range: 'talk' }` | portal, wedged, free pressure and HVPG at every slide so far (one point per state) |
| `{ kind: 'trace', range: 'beats' }` | live pressure trace, beat by beat |
| `{ kind: 'abdomen' }` | the belly with its ascites and collaterals |
| `{ kind: 'wall' }` | the varix in cross-section: Laplace's T, r, w |

In quiz mode, tools with a reading (Doppler, FibroScan, scope grade) stay covered until the answer.

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

### 7.4 `compare`: live treatment buttons

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
| `gastric-varix` | Sinusoidal | Cirrhosis with gastrorenal shunt | 450 | fundal varices, `C5` gastrorenal shunt (BRTO target) |
| `sos` | Postsinusoidal (`postsin`) | Sinusoidal obstruction syndrome | 21 | central-vein block |
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
| `spontaneous` | `{ C5: bool, C6: bool }` | gastrorenal shunt (C5), spontaneous splenorenal shunt (C6) present |
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

Figure label text on the anatomy is the SHORT name. Station labels hidden on the anatomy: `AO UPPV LOWV KID_R RRV HA ILI`.

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
| `CV_R` / `CV_L` | Central venules, right / left lobe | Central v. R / L | liver |
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

Organ captions drawn on the plate: Liver, Stomach, Spleen, Colon, Kidney, Small bowel, Esophagus, Right atrium.
On the circuit view the zones are captioned: Splanchnic beds · Portal veins · Liver · sinusoids · Hepatic veins · IVC · Heart.
Normal station pressures (mmHg): AO 93, PV (CONF) 7.8, SIN_R 7.0, central venules 4.8, RHV 4.1, IVCS 3.5, RA 3.0. The model's healthy targets: HVPG 3, PV 7.5, FHVP 4, RA 3, IVC 3.5.

### 8.5 Vessels (edge ids for `mark.edges`, `glow`, `tool.vessel`)

Portal side: `V_INT` jejunal and ileal veins · `V_COL` colic veins · `V_IMV` inferior mesenteric vein · `V_SPL` splenic vein (distal) · `V_STO` gastric veins · `SMV_CONF` superior mesenteric vein · `SV_CONF` splenic vein (proximal) · `LGV_CONF` left gastric (coronary) vein · `PV_TRUNK` portal vein · `PVH_R` right portal vein · `PVH_L` left portal vein.
Liver: `PRE_R` / `PRE_L` portal venules · `SIN_RR` / `SIN_LL` sinusoids · `POST_R_RHV`, `POST_R_MHV`, `POST_L_LHV`, `POST_L_MHV` central veins → hepatic veins · `CAUD` caudate veins · arteries `A_HEP`, `A_HR`, `A_HL` · arterioportal `AP_R`, `AP_L`.
Veins to the heart: `RHV_IVC`, `MHV_IVC`, `LHV_IVC` hepatic veins · `IVC_IS` IVC · `IVCS_RA` IVC (suprahepatic) to the atrium · `SVC_RA` · `V_UP` brachiocephalic · `AZY_SVC` azygos arch · `LRV_IVC` / `RRV_IVC` renal veins · `V_KID_L` · `ILI_IVC` · `EPI_ILI`, `EPI_SVC` epigastric veins.
Collaterals: `C1a` coronary vein → esophageal varices · `C1b` esophageal varices → azygos · `C2` short/posterior gastric veins · `C3` paraumbilical vein · `C4` rectal (superior ↔ middle/inferior rectal veins) · `C5` gastrorenal shunt · `C6` spontaneous splenorenal shunt · `C7` retroperitoneal (Retzius) veins · `C8` periportal collaterals (cavernoma) · `C9` ascending lumbar → azygos.
Interventions: `TIPS` · `DIPS` · `S_PC` portocaval · `S_DSR` distal splenorenal (Warren) · `S_MC` mesocaval.
Edge tones used when you glow an id by hand: portal vessels follow their station colour; collaterals and shunts (`C3`–`C9`, `S_PC`, `S_DSR`, `S_MC`) use the varices' colour `var`.

### 8.6 Tiles (`tiles`, `key`, `{token}`, table `cols`)

| Key | Name | Unit | Rating (colour) |
|---|---|---|---|
| `hvpg` | HVPG (wedged − free) | mmHg | **amber ≥ 5 ("Raised"), red ≥ 10 ("CSPH")** |
| `ppg` | PPG (portal − IVC) | mmHg | **amber ≥ 6 ("Raised"), red ≥ 12 ("High")** |
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
| `plt` | Platelets | × 10⁹/L | amber < 150, red < 100 |
| `pvFlow` | Portal vein flow | L/min | red if reversed |
| `liver` | Liver blood flow (of normal) | % | amber < 80, red < 50 |
| `shunt` | Portal blood bypassing the liver | % | amber ≥ 20, red ≥ 50 |
| `map` | Mean arterial pressure | mmHg | red < 65 |
| `hr` | Heart rate | /min | slow < 60, fast > 100 |
| `lsm` | Liver stiffness (FibroScan) | kPa | amber ≥ 10, gray zone 15–25, red ≥ 25 |
| `salb` | Serum albumin | g/dL | amber < 3.5 |
| `hb` | Hemoglobin | g/dL | amber < 12, red < 7 |

Key facts for text: normal HVPG 1–5; CSPH is HVPG ≥ 10; HVPG ≥ 12 high risk of variceal bleeding; PPG normal ≤ 5; Baveno stiffness: < 10 kPa normal, 15–25 gray zone, ≥ 25 CSPH likely.

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
11. **Every content slide has** `id`, `kicker`, `title`, `line`, `notes` (2–4 sentences a lecturer can read aloud) and `ask: [question, answer]`. The last slide is a `visual: 'table'` summary under `kicker: 'Summary'` with `of` rows naming the earlier slides.
12. **Decks:** 6–12 slides, 3–4 `objectives`, ≥ 3 kicker groups or explicit `sections`, `level` one of foundation/core/advanced.
13. **Style:** plain sentence case, no emoji, American spelling, numbers with units (`mmHg`, `g/dL`, `kPa`), clinically accurate (Baveno VII).
14. Presenter forces the pressure colour mode and keeps the app's own N, S, L keys off while presenting; there are **no lens, card or test-type fields on slides**: the nearest are `tool.kind` and `visual` (section 7).

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
  slides: [
    {
      id: 'first', preset: 'healthy',                    // model state: preset → params → action → days
      // params: { cirrhosis: 0.5 }, action: { kind: 'band' }, days: 60, ramp: { cirrhosis: [0.4, 0.6] }, lapse: { seconds: 8 },
      view: 'anatomic', cam: 'portal',                    // 'anatomic' | 'circuit'; region, box, 'fit', 'lobule:triad', 'sinusoid', …
      labels: ['CONF', 'SMV', 'SV'],                      // stations named on the figure
      terms: ['sv', 'smv', 'pv'],                         // or { 'words in line': 'target' }; pills + labels + glow
      // glow: ['liver', 'C3'], glowSeq: 550,
      // mark: { edges: ['PV_TRUNK'], label: 'Clot', kind: 'block' },   // 'block' | 'treat' | 'note'
      // sites: ['pv'], cath: 'result', monitor: 'result',
      data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], // or data: 'ladder', key: ['hvpg', 'ppg']
      // delta: true, tool: { kind: 'doppler', vessel: 'PV_TRUNK' },
      kicker: 'Group name', site: 'pre', title: 'A headline that stands alone',
      line: 'One sentence with [portal vein](pv) pointing at the figure and the live value {pv}, above {>=10 mmHg} the rule.',
      // causes: ['…', '…'],
      notes: 'Two to four sentences of speaker notes.',
      ask: ['Question for the room?', 'Expected answer.'],
    },
    // … more slides …
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'first', title: 'This patient' }],
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

A 4-slide pre-hepatic block talk, using only the names in this guide (`src/ui/decks/clot-demo.js`).

```js
// Presenter talk: a clot in the portal vein, and why the HVPG misses it
// (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const CLOT_DEMO = {
  id: 'clot-demo', level: 'core', title: 'A clot in the portal vein', minutes: 5,
  objectives: [
    'Recognise an occluded portal vein on Doppler',
    'Explain why the HVPG stays normal',
    'Say which gradient finds a pre-hepatic block',
  ],
  summary: 'An acute portal vein clot on Doppler, the normal HVPG and high PPG, and what a cavernoma looks like months later.',
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], terms: { 'portal pressure': 'pv' },
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
      line: 'The block is before the liver, so the wedged and free hepatic pressures stay normal and the HVPG reads {hvpg}. The PPG, {ppg}, finds it.',
      notes: 'The wedged catheter reads the sinusoids, which sit downstream of the clot. The PPG compares the portal vein itself with the IVC. A normal HVPG with varices says the block is not in the sinusoids.',
      ask: ['Varices and an HVPG of 3 mmHg. What does that tell you?', 'The block is not sinusoidal.'],
    },
    {
      id: 'cavernoma', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'],
      mark: { edges: ['C8'], label: 'Cavernoma', kind: 'note' }, data: 'tiles', tiles: ['varix', 'spleen', 'plt'], key: ['varix'],
      kicker: 'Months later', site: 'pre', title: 'A cavernoma around the clot',
      line: 'Small collaterals grow around the blocked vein and carry some blood to the liver. Varices form and the spleen enlarges.',
      notes: 'Cavernous transformation is a web of collaterals around the occluded portal vein. It does not carry enough blood to bring the pressure down, so varices, a large spleen and low platelets follow.',
      ask: ['A child bleeds from varices with normal liver tests. What is the likely cause?', 'Chronic portal vein thrombosis with a cavernoma.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'Portal vein', title: 'Cavernoma' }],
      kicker: 'Summary', title: 'A clot before the liver',
      line: 'The HVPG stays normal in both; the PPG rises when the portal vein itself is blocked.',
      notes: 'Pre-hepatic block raises the pressure upstream of the liver and leaves the sinusoids alone. The HVPG is normal and the liver works.',
      ask: ['Which pressure reading is normal in every pre-hepatic block?', 'The HVPG.'],
    },
  ],
};
```

---

## 12. Adding the deck to the app

1. **Create** `src/ui/decks/<id>.js` exporting one `const` (section 10/11). No other file imports it yet.
2. **Edit `src/ui/decks.js`** (three small edits):
   * Add the import next to the others (any `?v=` hash; step 5 fixes it):
     `import { CLOT_DEMO } from './decks/clot-demo.js?v=0000000000';`
   * Register it near the other `DECKS.push(...)` lines:
     `DECKS.push(CLOT_DEMO);`
   * Add it to `TOPICS` (the unified menu) under exactly one topic, with a short title of **32 characters or fewer**:
     `['causes', 'Causes', [ …, ['clot-demo', 'A clot in the portal vein'] ]]`.
     Topics, in order: `foundations`, `causes`, `measuring`, `complications`, `treatment`. A deck missing from `TOPICS` fails the menu test.
3. **Check it:** `npm run lint && npm test` (the tests require every deck to be listed once with a short title, and every slide's `ask[0]` to appear in the printed handout).
4. **Stamp scripts:** `npm run stamp` rewrites the `?v=` hashes (required whenever a script file changed; a stale stamp fails the unit job and skips the deploy).
5. **Optional deck-picker stills:** `node scripts/deck-stills.mjs <id>` writes `brand/decks/<id>-light.webp` and `-dark.webp` (200×250); run it after the deck exists.
6. **Preview:** commit on a one-level `claude/<name>` branch and merge into the preview integration branch `claude/settings-topbar-icon-flvft1`; pushing it publishes `/preview/` at https://qaddodi.github.io/portal-pressure-simulator/preview/ . Never push to `main` (the owner merges). Rebase on the latest preview right before pushing, never force-push, and check the "Pages (live site + preview)" deploy job succeeded.
7. **Test on the preview:** Present menu → pick the deck. In the app: ←/→ step, Q toggles quiz mode, P toggles projector contrast.

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
