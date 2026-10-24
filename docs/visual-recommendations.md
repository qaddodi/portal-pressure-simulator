# Recommended additions: tiles, data cards, instruments, callouts and visualizations

Written 24 Oct 2026 against the integration branch `claude/settings-topbar-icon-flvft1` at commit `457268a4`
(the lobule dive on the GPU). It is a planning note, not a spec: each item says what it would show, where the
number already exists in the model, how a deck would ask for it, which built-in deck would use it first, and what
it would cost. Numbers that need a guideline citation are marked **check**: confirm them against the Baveno VIII,
AASLD 2024 or EASL 2025 text the decks cite before they go into a tile's cut-offs.

## What the simulator already shows (so nothing below repeats it)

- **26 tile keys** (`table-marks.js` `TILE`): HVPG, PPG, portal, sinusoidal, WHVP, FHVP, IVC and RA pressures; SAAG,
  ascites protein and volume; esophageal and fundal varix diameter; spleen length, platelets; portal flow and velocity,
  liver flow (% of normal), shunted (%); MAP, heart rate, cardiac output, blood volume, hemoglobin; liver stiffness; clot
  share; serum albumin. Every tile has bands, a dot for now, a ring for the start and a rating word.
- **15 data card tools**: the Gut to heart ladder (`profile`), portal blood and liver inflow bars (`flows`), setting
  curve (`curve`), causes waterfall (`causes`), two-reading plane (`plane`), cross-section (`lumen`), fluid balance
  (`fluid`), pressure and flow around a meal (`flowtime`), the talk trace (`trace`), and the instruments: Doppler
  (spectrum, color, variance, calipers, pair, gate), scope, FibroScan, abdomen with the IAP dial, varix wall.
- **6 whole-panel visuals**: `table`, `ladders`, `scale`, `plane`, `quadrant`, `walls`.
- **Figure callouts**: marks with live values, sites, calipers, normal outlines, brackets and zones on the circuit,
  numbered glow steps, the pressure ripple, the stent's three Doppler callouts, the procedure step callouts.
- **18 event detectors** (`events.js`): reversals, stasis, CSPH, bleed risk, large varix, red wale, ascites forming
  and tense, hyperdynamic, high shunt, hypoperfusion, caudate, RA high, splenomegaly, each collateral recruited.
- **Tests › Readouts** in three groups (Pressure, Flow, Consequences) plus the Systemic row, each with a Why?.

The model computes more than the screens show. `computeMetrics` already returns a systemic vascular resistance,
a PV pulsatility index, an encephalopathy risk index, the intra-abdominal pressure, the ascites formation rate
(mL/day), the hepatic lymph, the varix wall stress as a share of rupture, the hematocrit, the ATLS shock class, the
live bleeding rate and total, the arterial buffer gain (`habr`), the baroreflex, the splanchnic tone, the hepatic
artery and portal inflows, and every collateral's flow by edge. Tier 1 below is mostly those numbers given a tile.

---

## Tier 1: tiles for numbers the model already has (hours each)

Each is one `TILE` entry, one `RATE` and `SCALE` row, a `COLS` column and a `{key}` pill. `tests/tile-bar.test.js`
already fails for any tile left without bands, so each needs its cut-offs on day one.

| Tile key | Shows | From | Bands and word | First deck |
|---|---|---|---|---|
| `wall` | Varix wall stress, % of rupture | `varix.ratioShown` | green under 50, amber 50 to 70, red over 70 ("Red wale" at the model's own 0.7 flag), "Rupture" at 100 | Endoscopy and the varix; Acute variceal bleeding; Next bleed |
| `pi` | Portal vein pulsatility index | `pvPI` (pulsatile mode) | normal under 0.5, "Pulsatile" over (blueprint §12 T5 uses 0.5; **check**) | Right heart and the liver; TIPS Doppler |
| `svr` | Systemic vascular resistance | `svr`, mmHg·min/L | normal about 10 to 15 (800 to 1200 dyn·s/cm⁵); "Low" under 10; a high one gray | Hyperdynamic circulation; Blood volume |
| `he` | Encephalopathy risk | `heRisk.index`, shown as its word | Low under 0.2, Moderate to 0.45, High over (the model's own thresholds) | Encephalopathy and shunting; Shunts; Choose the treatment |
| `iap` | Intra-abdominal pressure | `ascites.iap` | normal under 12, "Hypertension" 12 to 20, "Compartment" over 20 (the abdomen dial's own cut-offs) | Ascites; Tap; Pregnancy |
| `ascRate` | Ascites forming, mL/day | `ascites.ratePerDay` | 0 "Steady", positive "Forming", negative "Resolving"; red over 500 mL/day (**check**: pick a number the Ascites deck can defend) | Ascites; Recompensation; Treatment |
| `lymph` | Hepatic lymph, mL/min | `ascites.hepLymph` | normal about 1 to 2 (**check**), "High" above | Ascites; Sinusoid view decks (Lobule) |
| `shock` | Blood loss, ATLS class | `blood.lossPct`, `blood.shock` | class I under 15 %, II to 30, III to 40, IV over | Acute variceal bleeding; Blood volume |
| `bleed` | Bleeding, mL/min and total | `bleeding.rate`, `bleeding.total` | shows only during a bleed; red always | Acute variceal bleeding |
| `hct` | Hematocrit | `blood.hct` | normal 36 to 50 % (**check** sex-neutral range), Low under 30 | Blood volume |
| `artIn` | Hepatic artery inflow, % of normal | `arterialIn` against healthy | normal 80 to 120, "Buffering" over 120 (the HABR at work) | Two inflows; Shunts (TIPS steals portal flow) |
| `habr` | Arterial buffer gain | `habr` | 1 is none; a word, "Buffering ×1.6" | Two inflows |
| `splIn` | Splanchnic inflow, L/min | `splanchnicIn` | normal about 1.0 to 1.3 (**check**); "High" above (the hyperdynamic gut) | Hyperdynamic circulation; Circulation (meal) |
| `coll:C3` etc. | One collateral's flow, L/min | `collateralFlows[edge]` | no bands; signed, orange when reversed, with the route's name | Varices; Gastric varices; Shunts |

Smaller related changes:

- **Readouts › a Risk group.** `dock.js` `GROUPS` has Pressure, Flow and Consequences. Add "Risk" for `wall`, `he`,
  `shock` and `iap`, so the Why? on each is one click away in Explore as well as on a slide.
- **`{pi}`, `{svr}`, `{he}` and `{iap}` pills** in the words follow from the tile for free (`pill-rating-tone`).
- **Summary table columns** (`COLS`) for the same keys, so the Encephalopathy and Bleeding decks' closing tables can
  carry the risk the talk was about.

## Tier 2: new charts from existing numbers (a day or two each)

### 2.1 Flow Sankey: where the gut's blood goes (`tool: { kind: 'sankey' }`)

The blueprint's §9.2 chart 3, never built. Left: splanchnic arterial inflow split into gut and spleen. Middle: the
liver (sinusoids) and each collateral or shunt by name. Right: hepatic veins, azygos/SVC, left renal vein, and the
GI lumen during a bleed. Band widths are `routeFlows` and `collateralFlows`; reversed flows draw in the direction
colour with an arrow. It animates as the model moves. The `flows` bars already give the shares; the Sankey gives
the *route*, which is what the Varices, Shunts and Encephalopathy decks spend their words on. On a phone, collapse
to three bands (liver, collaterals, shunt) with the names as pills. Reuse `tool-flows.js` for the parts and shares.

### 2.2 Pressure–flow operating point (`tool: { kind: 'operating' }`)

The blueprint's §9.2 chart 5. Two lines on a P–Q plot: the liver's (slope = intrahepatic resistance) and the
collateral bed's (slope = collateral resistance), with the inflow as a vertical line; where they meet is the portal
pressure. A TIPS, a β-blocker or a BRTO moves one line and the dot slides. The slopes come from two scratch-engine
replays of the kind `slide-ext.js` already asks the worker for (`worker-core.js`), or more cheaply from the model's
intrahepatic resistance (`rih`) and the collateral resistances (`rColl` is already a circuit lens). Best for Shunts (why the 10 mm stent takes more than the
8 mm did), Lowering pressure (a drug lowers inflow, a stent lowers resistance) and the Circuit deck.

### 2.3 Sensitivity tornado (`tool: { kind: 'tornado', metric: 'ppg' }`)

The causes waterfall answers "what raised it from healthy". A tornado answers "what would move it most from here":
one bar per setting, the reading's change for a fixed nudge each way (cirrhosis ±0.1, stent ±1 mm, carvedilol on/off,
albumin ±0.5). `explain.js` already runs leave-one-out replays on a scratch engine; this is the same loop with a
nudge instead of a revert. Use it on the Choose the treatment question slides (which lever matters for this
patient) and the Where is the resistance? answer slides.

### 2.4 Time-to-threshold callout and tile (`{eta:asc}`, `callout: { eta: 'varix' }`)

From a slow-clock rate and the distance to the next band: "At this rate: grade 2 ascites in 23 days", "Red wale in
about 4 months". The rates exist for ascites (`ratePerDay`); the varix and spleen need their growth rate kept over
the last few slow ticks (a two-sample slope in `engine.slow`). Show it on the figure as a mark label with the live
value, or as a tile with a day count. One year, Recompensation and Ascites would use it; it gives a time-lapse slide
a reason before Play is pressed. Hide it when the rate is under a floor, so a steady patient never reads "in 4,000
days".

### 2.5 Two-clock strip chart (`tool: { kind: 'beats' }`)

A rolling 10 s window of the RA pressure, the hepatic vein velocity and the PV velocity, one axis each, in pulsatile
mode. The Doppler `pair` shows two traces as spectra; this shows three as lines with the beat marked, so the eye can
see the v-wave of tricuspid regurgitation reach the portal vein. Reuse `pressure-time.js`'s window code. Right heart
and the liver and Read the Doppler.

### 2.6 Hepatic vein waveform word on the Doppler

Not a chart: one readout under the RHV Doppler, "Triphasic", "Biphasic" or "Monophasic", from the trace's own
minima over the last beats. The flattening of the hepatic vein waveform with cirrhosis and its exaggeration in
right heart failure is a standard teaching point and the model already draws the waves. Cheap, and it gives the
Read the Doppler question slides a second thing to ask.

### 2.7 Congestion index on the portal Doppler

Cross-sectional area over mean velocity (cm² / cm/s), normal about 0.07, raised in portal hypertension (**check**
Moriyasu's cut-off, often quoted as 0.1). The engine has the tube law for a lumen's area (`tubeArea` in `physiology.js`) and `pvVelMean`. Show it
beside the PI in the Doppler readouts and as a `ci` tile. Read the Doppler, Doppler, Spleen.

### 2.8 Whole-panel: Doppler small multiples (`visual: 'waves', of: [...]`)

The summary table's `wave` column already draws a small trace per row. A panel of six traces, one per earlier slide
or patient, each with its direction word and velocity, side by side on a shared scale, would be the Read the Doppler
deck's natural summary (today a table). Reuse the `wave` column renderer at a larger size.

### 2.9 Whole-panel: Sankey pair (`visual: 'sankeys', of: ['before', 'after']`)

Two Sankeys from 2.1, Before and After a treatment, with the same band order so a band's growth reads directly.
Shunts, Encephalopathy, Gastric varices (BRTO sends the fundal blood back through the liver).

## Tier 3: additions that need new model state (a week or more, decide first)

| Idea | Why it is tempting | What it needs | Recommendation |
|---|---|---|---|
| **Spleen stiffness** (SSM) as a FibroScan reading and a `plane: 'ssm'` | Baveno VII/VIII use SSM to rule high-risk varices in or out (**check** the thresholds in the cited text) | an SSM estimate from spleen congestion and size, like `lsm` is from the gradient | Worth it: small model addition, one new tile, one new plane; the Spleen and Stiffness decks use it at once |
| **Kidney panel**: renal perfusion, sodium retention, urine output, a hepatorenal flag | the figure draws kidneys; diuretics, albumin and the hyperdynamic state are modeled | a renal node in the topology or a lumped renal perfusion from MAP, SVR and splanchnic steal; a sodium balance for ascites | Later: it changes the ascites model (sodium retention would drive it, not just Starling). Plan it with the Ascites deck's owner before any tile |
| **Oxygen delivery to the liver** (portal + arterial O₂) | TIPS and shunts lower it; the HABR partly repays it | a saturation per inflow and a consumption | Later: the Two inflows deck could carry it as a single tile, `do2`, once the model has it |
| **MELD or Child-Pugh** | every clinician asks | bilirubin, INR, creatinine, sodium: none modeled | Do not build. The app's own About warns against implying diagnosis; a liver function score from a hemodynamic model would be made up |
| **Ammonia** | the Encephalopathy deck's words end on it | a gut production and a hepatic extraction | Do not build yet: the `he` tile (Tier 1) says the same thing honestly as a risk word |
| **Pulse-wave Doppler of the hepatic artery** (resistive index) | the HABR deck could show the artery's response | an arterial waveform in the pulsatile engine | Maybe: the model has the arterial inflow; the waveform would be synthetic |

## Figure callouts worth adding (half a day each)

- **Threshold-crossing flash on a site reading.** `sites: ['pv']` writes a pressure beside the vein. When the value
  crosses one of its tile cut-offs during a time-lapse or a what-if slider, flash the pill once in the new colour and
  show the band's word for two seconds ("CSPH"). The data exists (`rateShown`); `events.js` has the hysteresis.
- **Delta chips on sites.** `sites: ['pv'], delta: true` adds a small "▲ 4" after the reading, from the slide before,
  as the tiles already do. It keeps the number next to the vessel on phones, where the data card is tucked.
- **Flow arrows with a volume.** A mark on a collateral that reads its flow and direction, `mark: { edges: ['C3'],
  label: 'Left gastric {coll:C3}' }`, follows from the Tier 1 `coll:` key.
- **Where the catheter sits.** During `cath: 'wedge'` a callout that names the pressure it reads ("Wedged: the
  sinusoids' pressure, 17 mmHg") so the HVPG deck's slide 3 needs fewer words.
- **Rupture callout.** When `VARIX_RUPTURE` fires (the detector exists as `RED_WALE` and the bleed), a critical
  callout anchored to the esophagus with the bleeding rate and a Why?, staying until acknowledged, as §10.3 of the
  blueprint describes. Today the bleed shows on the figure; the number does not.

## Order to build in

1. Tier 1 tiles `wall`, `he`, `iap`, `shock` and `coll:` (one afternoon, five decks gain a tile each, all with tests
   `tile-bar`, `pill-rating-tone`, `readouts-tab`).
2. The Readouts Risk group and the summary table columns for the same keys.
3. The Sankey (2.1) and its pair panel (2.9): the one new chart that shows something no current card does.
4. The waveform word (2.6) and congestion index (2.7) on the Doppler: cheap, and the Read the Doppler deck gets two
   more things to ask.
5. The operating point (2.2) and the tornado (2.3), which share the worker replay code.
6. Time-to-threshold (2.4) once the slow clock keeps a rate for the varix and spleen.
7. Spleen stiffness (Tier 3) after the SSM thresholds are confirmed against the cited guideline text.

## Tests to add with each

- A new tile: `tests/tile-bar.test.js` already enforces bands; add its cut-offs to `tests/readouts-tab.test.js` so the
  Readouts row and the tile agree, and a `tests/numbers-agree.test.js` case so the pill, tile and table print the same
  number.
- A new chart: a layout test in the style of `tests/model-charts.test.js` (fits at 390 px wide and 12 px text), a
  "stands down when crowded" case, and a slide in the Demo deck (`src/ui/test-decks/demo-all-new-visuals.js`) so the
  smoke run draws it on every device.
- A new callout: a `tests/callouts.test.js` case for its colour and a `tests/figure-callouts-17oct.test.js` case for
  its place off the vessels.
- A new engine number: an acceptance target in `tests/acceptance.test.js` (healthy range, and one preset where it
  leaves it), listed in About the model.
