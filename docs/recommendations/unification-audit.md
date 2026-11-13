# Unification audit: everything done more than one way

13 Nov 2026. Read from the code of `claude/settings-topbar-icon-flvft1`; nothing in the app was changed and nothing was run in a browser.
Line numbers are for that tree on this date.

## Summary

The app does many things one way already (pressure cut-offs, the frame scheduler, the CSS motion scale, the shared FibroScan and
Doppler instruments, the Baveno zones, the glyph atlas). Where it does not, the learner can see it. The five biggest are these. First, a
pressure gradient is measured and shown on at least six different monitors and flows (an Explore HVPG pane, an auto-playing HVPG card, a
catheter-driven HVPG card, the new tracing card, the profile chart with figure callouts, and a numbers-only EUS-PPG panel), drawn by two
different GPU pipelines, titled two ways and stepped two ways. Second, the same reading wears different colours on different charts: the
wedged pressure is orchid on the monitors, `--tr-wedge` on the beat trace and violet `--s7` on the talk trace and the parameter curve, and the
free pressure is blue on two of them and grey on the third. Third, the HVPG between 5 and 10 mmHg is called "Mild", "Mild portal
hypertension" and "Portal hypertension" depending on the card, and a missing number prints as an em dash, an ellipsis or two hyphens.
Fourth, the Doppler breaks the standing rule that every vessel uses the main portal vein's spectrum filled from the baseline: arteries and
the TIPS draw a clear spectral window under the band (`doppler.js:1127`). Fifth, the steps of a measurement (how it starts, what button
starts it, whether Next or a clock moves it, and how the gradient is worked out from the two readings) differ between the HVPG, EUS-PPG and
PPG flows. The pressure-monitor thread (gradients deck, tracing card kind `reading`, span ruler kind `spans`) already covers the core of the
first and part of the fifth; this report says where its work ends.

## Ranked table

| Rank | What is duplicated | Ways | Learner-visible | Effort | Owner thread |
|---|---|---|---|---|---|
| 1 | Pressure monitors and tracings for a gradient | 6 | yes | L | Pressure monitor (core); decks and Explore pane after it |
| 2 | Colour of the same reading (WHVP, FHVP) across charts and monitors | 3 per reading | yes | S | Pressure monitor (for `--mon-*`) |
| 3 | Words for the same HVPG band, "cannot be measured", and the missing-number glyph | 3 to 4 each | yes | S | Pressure monitor (for its files) |
| 4 | Doppler spectrum shape by vessel kind, spectrum synthesis, normal ranges | 2 each | yes | S to M | none |
| 5 | Measurement flows: start, step, end, and the gradient's arithmetic | 4 flows, 3 arithmetics | yes | M | Pressure monitor (shared `proc-anim.js READS`) |
| 6 | Readout tiles: renderers and definition tables | 3 renderers, 2 tables | yes | M | none |
| 7 | Learner wording (hepatic vein or venous, PPG expansion, US spelling, spacing of < and >) | 2 to 3 each | yes | S | none |
| 8 | In-slide stepping (procedure steps, beats, reveal clauses, catheter slides, auto-play) and fixed waits | 5 step units | yes | M | Pressure monitor (HVPG card) |
| 9 | Number roll timing and ease-out curves outside `ease.js` | 2 roll clocks, 6 curves | yes | M | none |
| 10 | Pressure profile, gut to heart | 2 charts | yes | M to L | none |
| 11 | A reading over days or over the talk | 3 charts | yes | M | none |
| 12 | Text on the figure: outlined labels versus tinted pills | 2 styles | yes | M to L | Labels |
| 13 | Glass looks and their stand-ins | 3 looks, 5 fallback fills | partly | S | Glass |
| 14 | Messages and sheets: two toast wraps, swallowed messages, two sheet engines | 2 each | partly | S to M | none |
| 15 | Card shells: corner radii, fallback fills, instrument shells | 6 radii | yes, mildly | M | Glass (fills) |
| 16 | Rating vocabulary maps (sev, rate, token) | 8 local maps | no | S | Pressure monitor (2 of them) |
| 17 | One-decimal number formatters | 14 | barely | S | none |
| 18 | Chart drawing pipelines on the GPU | 3 | no | L | Pressure monitor (monitors) |
| 19 | clamp, lerp, smoothstep and first-order followers | 29, 6, about 30, about 20 | no | S | none |
| 20 | Between-frame write helpers | 2 modules, 7 idle callbacks | no | S | none |
| 21 | Palette values copied as literals | 3 | no | S | none |

---

## 1. Pressure monitors and tracings for a gradient

### What it is

A gradient (HVPG, EUS-PPG, PPG) is taken and shown in these ways:

1. **Explore, Measure › HVPG pane**: `createHvpgProcedure`, `src/ui/hvpg-proc.js:86`. A "Measure HVPG" primary button with a catheter icon
   (`hvpg-proc.js:100`), a FHVP / WHVP / HVPG row as page text drawn by `glWords` (`:93-106`), and the tracing drawn through the 2D-context
   emulation of `trace-gl.js` (`:90`). Header in capitals, `'CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg'` (`:73`). The readings are
   captured once when the catheter starts (`:120`).
2. **Slide tool `{ kind: 'hvpg' }`**: `createHvpgCard`, `src/ui/tool-hvpg.js:1-11`, built on `createHvpgMonitor` (`hvpg-proc.js:334`). It plays
   free, wedge and result on its own clock as the slide opens (no Next), titled "HVPG, catheter tracing" (`presenter-tools.js:73`). Used by
   `decks/treatment.js:32`, `:46` and `decks/varices.js:58`.
3. **Slide tool `{ kind: 'hvpg', catheter: true }`**: the same card following the figure's catheter over three slides (`cath: 'free' | 'wedge' |
   'result'`): `decks/hvpg.js:26`, `:34`, `:42`, `decks/carvedilol.js:64`, `decks/ten-years.js:58`, `:65`.
4. **Slide tool `{ kind: 'reading' }`**, the new tracing card: `src/ui/tool-reading.js:1-12`, drawn as an `svg-gl.js` model (`:15`), titled
   "Pressure tracing" (`ext-teaching.js:26`), stepped by Next through the procedure (`procedure: 'hvpgcath' | 'eus' | { kind: 'irivc', then: 'irpv' }
   | 'tipsgrad'`). Used by `decks/gradients.js:59`, `:67`, `:75`, `:99`, `:122`, `:130`.
5. **Profile chart plus figure callouts** (`tool: { kind: 'profile' }` with `cath: 'result'`): the readings appear as catheter callouts on the
   figure and as brackets on the profile, with no tracing: `decks/ncph.js:37`, `decks/outflow.js:29`, `decks/prehepatic.js:44`, `decks/lobule.js:70`.
6. **EUS-PPG with tiles only**: `procedure: 'eus'` and `data: 'tiles'` with no monitor, `decks/hvpg.js:68`, `decks/ncph.js:46`; and in Explore, the
   EUS-PPG panel on the Scope card, `src/ui/eus-ppg.js:23-35`, numbers and a caption only, started by a small "Watch EUS-PPG" play button.

Beside these, three more live pressure monitors draw pressures over time, each its own way: the beat-by-beat trace with its HVPG lane
(`pressure-time.js:1-6`, lanes `trace-lanes.js`, layout `beat-card.js`), the bedside vitals monitor (`vitals-monitor.js` drawn by the bespoke
`vitals-gl.js`), and the talk trace (`talk-trace.js`). They are not gradient monitors and can stay, but they share the colour and wording
problems below (findings 2 and 3).

How they differ, for a learner: two titles ("HVPG, catheter tracing" and "Pressure tracing"); two clocks (the HVPG card plays by itself, the
tracing card waits for Next); two wait notes ("Waiting for the hepatic vein." at `hvpg-proc.js:76`, "Waiting for the tip to park" at
`tool-reading.js:36`); two drawings (the `trace-gl` monitor, and the `svg-gl` model with `chart-looks/reading.js`); and in two places no tracing at
all. PPG by interventional radiology and the TIPS gradient can only be seen in decks; Explore has no way to take them.

### The standard

The tracing card, `tool: { kind: 'reading' }` (`tool-reading.js`), with its span ruler `{ kind: 'spans' }` (`tool-spans.js`). It already covers all
four ways of reading, follows the procedure's own clock (so Next and Back work as they do for every other procedure), has one fixed size, and
reads its numbers from the same `READS` the figure's callouts print. Its title should be "HVPG, catheter tracing" when the script is the
HVPG's and "Pressure tracing" otherwise, or one rule chosen by the owner, but the same rule on every card.

### Merge plan

1. Leave `tool-reading.js`, `tool-spans.js`, `chart-looks/reading.js`, `chart-looks/spans.js` and `decks/gradients.js` to the pressure-monitor
   thread until it merges.
2. After it merges, move the other decks onto it: replace `{ kind: 'hvpg' }` in `decks/treatment.js:32`, `:46` and `decks/varices.js:58` with
   `procedure: 'hvpgcath'` plus `tool: { kind: 'reading' }`; replace the three catheter slides of `decks/hvpg.js:26-42` (and the single
   result slides in `carvedilol.js:64`, `ten-years.js:58`, `:65`) with one `hvpgcath` procedure slide, or teach `tool-reading.js` a `cath` mode that
   follows the figure's catheter the way `createHvpgMonitor.balloon` does (`hvpg-proc.js:389-394`) so the three-slide walk-through is kept.
3. Give `decks/hvpg.js:68` and `decks/ncph.js:46` the tracing card (`tool: { kind: 'reading' }`), so EUS-PPG is never numbers alone on a slide.
4. Rebuild the Explore Measure › HVPG pane around the tracing card's model (one `svg-gl` model in the pane, the same `scripts()` table), and add
   EUS-PPG and PPG as two more "Measure" entries on that pane, so the Scope card's EUS-PPG panel (`eus-ppg.js`) can go.
5. Retire `createHvpgMonitor` and `tool-hvpg.js` once no deck uses them; keep `hvpg-clock.js` (its balloon timing table is the one rhythm every
   procedure shares).
6. Tests: extend `tests/` with a deck sweep that fails a slide carrying `{ kind: 'hvpg' }` once the migration is done; a test that the title of
   every gradient card comes from one function; and a test that `NOTE_WAIT` and the tracing card's `wait` words come from one table.
7. Risks: the HVPG deck's three-slide catheter story is the most watched sequence in the app; keep its pacing (the balloon's
   `BALLOON_IN_MS`) and the card-keep behaviour (`card-keep.js`, the card stays up across the three slides). The talk-trace and the beat trace
   read `metrics.hvpg`, not `READS`, so their numbers will not change.

### Touches

Pressure monitor thread (owns steps 1 to 3 in effect; steps 4 and 5 after it merges). Labels thread only if the catheter callouts
(`stage-cath.js:550`) change.

---

## 2. The same reading in different colours

### What it is

- WHVP: `--mon-wedge` on the monitors (`hvpg-proc.js:45`, `tool-reading.js:36`, `styles/tokens.css:201`); `--tr-wedge` on the beat trace
  (`pressure-time.js:35`) and the span ruler (`chart-looks/spans.js:3`); violet `--s7` on the talk trace (`talk-trace.js:24-25`) and the
  parameter curve (`tool-curve.js:101`, where `hvpg` takes `--s7` too). `talk-trace.js:10` records why: pink against orchid failed the palette
  check.
- FHVP: `--mon-free` on the monitors; `--tr-hv` on the beat trace (`pressure-time.js:36`) and the curve (`tool-curve.js:101`); `--text-3` grey on the
  talk trace (`talk-trace.js:25`).
- `--tr-wedge` also stands for sinusoidal flow on the curve (`tool-curve.js:101`, `sin: '--tr-wedge'`), so one colour means two things.
- In the dark looks `--mon-*` and `--tr-*` hold the same values (`tokens.css:555-559`, `:795-799` against `:200-205`), so the split only shows in
  the light looks, where `--tr-wedge` is `#A52DA9` (`tokens.css:340`) and the monitor stays `#DA7EDD`.

### The standard

One colour token per reading, used by every chart and monitor: `--tr-pv`, `--tr-wedge` (WHVP), `--tr-hv` (FHVP), `--tr-ivc`. The monitors keep
their dark panel, so their `--mon-*` tokens become aliases (`--mon-wedge: var(--tr-wedge)` in the dark values) rather than separate colours.
If `--tr-wedge` against `--tr-pv` fails the palette check on the talk trace, change `--tr-wedge` once, everywhere, instead of using `--s7` in two
charts.

### Merge plan

1. In `src/ui/theme-tokens.js`, define `mon-wedge`, `mon-free`, `mon-pv`, `mon-ivc` as `var(--tr-…)` of the dark look; run `npm run gen:theme`.
2. Change `talk-trace.js:24-25` and `tool-curve.js:101` to `--tr-wedge` and `--tr-hv`; give sinusoidal flow its own token (`--tr-sin`).
3. Re-run the palette check that `talk-trace.js:10` cites against the new pairs.
4. Tests: a new `tests/reading-colours.test.js` that maps each of `pv`, `whvp`, `fhvp`, `ivc` to one token and greps the chart files
   (`talk-trace.js`, `tool-curve.js`, `pressure-time.js`, `tool-reading.js`, `chart-looks/*.js`) for any other token on those keys.
5. Risk: `tests/stop-tokens.test.js` and `tests/theme-tokens.test.js` will need the regenerated tables.

### Touches

Pressure monitor thread (the `--mon-*` tokens and `tool-reading.js` tones). No glass, label or compositor code.

---

## 3. Words for the same band, "cannot be measured", and the missing number

### What it is

The HVPG's three bands are named differently on different cards:

| Card | 5 to 9.9 mmHg | 10 and over |
|---|---|---|
| Readout tiles, `dock.js:61` | Mild | CSPH |
| Summary tables, `table-marks.js:54` | Mild | CSPH |
| Over time chart, `pressure-time.js:57` | Mild | CSPH, or "CSPH · bleed risk" from 12 |
| Explore HVPG pane, `hvpg-proc.js:51` | Mild portal hypertension | Clinically significant portal hypertension (CSPH) |
| EUS-PPG panel, `eus-ppg.js:21` | Portal hypertension | Clinically significant portal hypertension (CSPH) |

The PPG's are "Normal, High, Bleed risk" (`dock.js:61`). A reading that cannot be taken is "Not measurable" (`dock.js:397`, `presenter.js:3382`,
`:3399`, `readouts-pane.js:125`, `hvpg-proc.js:438`), "No pressure can be read. HVPG is not measurable." (`hvpg-proc.js:351`) or "Cannot be
read" (`tool-spans.js:38`, `:141`). A number not known yet prints as an em dash (`util.js:118` `fmt`, `eus-ppg.js:17`, `proc-anim.js:162`), an
ellipsis (`callout-math.js:34` `valueText`) or two hyphens (`scan-ease.js:89`).

### The standard

One table of band words in `src/engine/pressure-cuts.js` beside the cut-offs (it already has `sevOfCuts`): HVPG `Normal`, `Mild portal
hypertension` (short `Mild`), `CSPH` (long `Clinically significant portal hypertension (CSPH)`); PPG `Normal`, `High`, `Bleed risk`. A short and
a long form, chosen by the room, never a third wording. "Not measurable" everywhere (it is what the tiles, the most-seen place, say). The em
dash for a number not known, as `util.js fmt` prints it; the ellipsis stays only for a value still being worked out, if the owner wants that
distinction, and then it is named in one constant.

### Merge plan

1. Add `HVPG_WORDS = { ok: ['Normal'], caution: ['Mild', 'Mild portal hypertension'], danger: ['CSPH', 'Clinically significant portal
   hypertension (CSPH)'] }` and `PPG_WORDS` to `pressure-cuts.js` (no imports, so the worker still loads it).
2. Read them in `dock.js:61`, `table-marks.js:54`, `pressure-time.js:57`, `hvpg-proc.js:51`, `eus-ppg.js:21`.
3. Replace "Cannot be read" in `tool-spans.js:38` and the sentence at `hvpg-proc.js:351` with the shared "Not measurable" (owner's call for
   the screen-reader sentence).
4. Put `NOT_SHOWN` (the U+2014 dash, as `fmt` prints it) in one pure module (see finding 17) and use it in `scan-ease.js:89`, `eus-ppg.js:17`, `proc-anim.js:162`.
5. Tests: extend `tests/pressure-vocabulary.test.js` to fail a literal "Mild", "CSPH" or "Portal hypertension" assigned as a band word outside
   `pressure-cuts.js`.
6. Risk: `dock.js` tiles are read every model frame; keep the words as frozen tables, as now.

### Touches

Pressure monitor thread for `tool-spans.js`, `hvpg-proc.js` and the wait words. None other.

---

## 4. Doppler: spectrum shape, synthesis and normal ranges

### What it is

- **Shape by vessel kind.** `doppler.js:1127` sets `g.venous = kind !== 'artery' && kind !== 'tips'`. For a vein the band fills to the baseline
  (`L = av * 0.05`, `doppler.js:769`, `:795`) and is brightest just under the outline; for the hepatic arteries and the TIPS and DIPS the band
  starts at about 0.45 of the mean, leaving a dark spectral window under it (`:769`, `:795`), with a different brightness curve (`doppler.js:751`
  on the CPU, `doppler-synth.js:45` on the GPU). This contradicts the standing rule that every vessel is drawn in the main portal vein's style,
  filled from the baseline, with only the velocities and the waveform differing.
- **Two synthesisers of the same spectrum.** The GPU shader (`doppler-synth.js:41-52`, driven by `lineParams`, `doppler.js:761-777`) and a CPU
  per-pixel loop that writes an `ImageData` (`writeLine`, `doppler.js:779-830`, used at `:1167` whenever `gpu.canSynth()` is false), uploaded with
  `texSubImage2D` (`doppler-gl.js:215`). The same formula lives twice, and the CPU path is off the GPU.
- **Two tables of normal velocities.** `PROBES` in `doppler.js:46-66` (with `V_INT` and the arteries) and `DOPPLER_NORMAL` in `velNormal.js:12-15`
  (without them); `velNormal.js:2` says it keeps the Doppler's ranges, but nothing checks that. The TIPS limit 190 is also written as a
  literal in `doppler.js:485-487`.
- **Other traces of velocity.** The paired trace (`doppler.js:1336-1375`) is a white line on a grey band; the summary-table waves (`col-wave.js:76-101`)
  are lines in the toward and away colours. Both are thumbnails, not spectra (see "Not sure" below).

### The standard

The main portal vein's spectrum: filled from the baseline, the vein's brightness curve, for every vessel. Only `velAt` (the waveform) and the
scale change. One synthesiser, the GPU's (`doppler-synth.js`). One table of normals, `doppler.js PROBES`, exported, with `velNormal.js` reading it.

### Merge plan

1. Remove the `venous` flag: in `doppler.js` take the vein branch at `:751`, `:769`, `:795`, drop `g.venous` and `SYN.venous` (`:1127`, `:1148`), and in
   `doppler-synth.js:45` keep only the vein formula (drop the `venous` uniform from `SYNTH_UNIS`, `:92`).
2. Delete `writeLine`, `power`, the `ImageData` ring and `gpu.ringCols` (`doppler.js:740-830`, `:1155-1172`; `doppler-gl.js:215`). Where
   `canSynth()` is false the trace shows black, as `doppler-gl.js:8` already says the drawer does when it cannot draw.
3. Export `PROBES` normals (or move them to `velNormal.js` as the one table) and read `DOPPLER_NORMAL` from it; replace the literal 190 with
   `normal[1]` of the stent probe.
4. Tests: a new `tests/doppler-fill.test.js` that loads `doppler-synth.js` and fails if the source mentions `venous`, and that the artery's and
   the vein's `lineParams` give the same `L / P` ratio; `tests/doppler-normals.test.js` that the two tables agree for every vessel in both.
   Update `tests/doppler-frame-cost.test.js` if it counts the CPU path.
5. Risk: the arterial and stent traces lose their window, which sonographers would recognise; this is the owner's standing rule, so it is
   intended. Re-check `tests/doppler-alias.test.js` (the wrap code at `:820-828` lives in the CPU path that goes).

### Touches

None of the owning threads. The Doppler glass and labels are not changed.

---

## 5. Measurement flows: how a reading starts, steps and ends

### What it is

| Flow | Start | Steps | End | Gradient worked out from |
|---|---|---|---|---|
| Explore HVPG (`hvpg-proc.js:86`) | "Measure HVPG", primary button, catheter icon (`:100`) | its own clock, no Next | result row, "Measure again" (`:300`) | one model frame read at the start (`:120`) |
| Explore EUS-PPG (`eus-ppg.js:31`) | small "Watch" play button labelled EUS-PPG, on the Scope card | `playProcedure` clock | caption sentence with the arithmetic (`:65`) | each needle reading as it is taken (`proc-anim.js:225-226`, `r1(pv - hv)`) |
| Slide HVPG card (`tool-hvpg.js`) | the slide opening | own clock (`hvpg-clock.js`) | result held | the slide's fingerprint, `tenthGap` (`tool-hvpg.js:22`) |
| Slide procedure (`proc-anim.js`, tracing card) | Next | Next per step (`presenter.js:2305`, `procNext` at `:1461`) | the gradient step | for HVPG, `tenthGap(m.whvp, m.fhvp)` of the third step's frame (`proc-anim.js:297`), for PPG `tenthGap(m.pv, m.ivc)` of the second step's frame (`:360`) |
| FibroScan, Doppler, Scope | always live | none | none | not a gradient |

Two things a learner can catch: the start control differs (a primary "Measure" button against a small "Watch" play button), and in the HVPG
and PPG procedures the gradient is computed from the frame of its own step, while the two readings printed above it were taken from earlier
frames (`proc-anim.js:295-297`, `:359-360`). On a settled slide the model does not move and the numbers agree; on a slide whose state is
still easing they can differ by a tenth. EUS does it the safe way (`proc-anim.js:226`, the difference of the two printed readings).

### The standard

One flow for every gradient: Next steps it on a slide; in Explore a "Measure" button of the same style starts it and the same steps play.
The gradient is always the difference of the two readings as printed (`r1(r1(a) - r1(b))`, which `tenthGap` already is), taken from the two
readings the step captured, never from a new frame.

### Merge plan

1. In `proc-anim.js`, change `hvpgcath.capture` (`:297`) to `rd.hv = r1(rd.wh - rd.fh)` and `irpv` (`:360`) and `tipsgrad` (`:264`) to `r1(rd.pv -
   rd.iv)` when both are finite. This file is shared with the monitor thread (`READS`); coordinate, or let that thread make the change.
2. In Explore, one "Measure" row (finding 1, step 4): HVPG, EUS-PPG and PPG as three buttons of the same class (`btn primary` or `btn sm`, one
   of them), each with the procedure's icon.
3. Tests: `tests/reading-arithmetic.test.js` that runs each `capture` over a moving fake frame and checks the gradient equals the printed
   difference.
4. Risk: the Explore pane's "readings captured once" note (`hvpg-proc.js:120`) explains why it reads one frame; the tracing card's approach
   gives the same agreement without it.

### Touches

Pressure monitor thread (`proc-anim.js READS`, `hvpg-proc.js`, `eus-ppg.js`).

---

## 6. Readout tiles: three renderers, two tables

### What it is

- Renderers: the bottom bar's tiles, `dock.js:210` (`tile`); Tests › Readouts, `readouts-pane.js:32` (its own `tile`, which says it "follows the
  bar's tiles" by copying their markup); the slide's data-card tiles, `presenter.js:725` (`buildTiles`).
- Tables: `dock.js TILES` (`dock.js:63`) and `table-marks.js TILE` (`table-marks.js:122`). They describe the same readings differently: the HVPG is
  "Hepatic venous pressure gradient: wedged − free hepatic venous pressure ... normal < 5, clinically significant ≥ 10 mmHg" (`dock.js:64`) against
  "HVPG, Wedged − free" (`table-marks.js:123`); the PPG is "portal confluence − suprahepatic inferior vena cava" (`dock.js:68`) against "Portal −
  IVC" (`table-marks.js:124`); the FHVP is "Free hepatic vein" (`table-marks.js:129`).
- The status words differ as in finding 3; the number roll differs as in finding 9.

### The standard

`table-marks.js TILE` as the one definition of a reading (name, short name, unit, decimals, scale, better direction, rating), since every
deck and handout already reads it and it loads in Node. `dock.js TILES` keeps only what the bar adds (its group and the "why" link), keyed
on `TILE`. One tile builder, used by all three places.

### Merge plan

1. Move the `title` long descriptions of `dock.js TILES` into a `long` field of `TILE` and write them once in the clinical register (finding 7).
2. Make `dock.js TILES` entries `{ ...TILE[id], group, why, hideKey }`.
3. Extract one `tileEl(def)` builder (DOM only, no frame writes) into a new `src/ui/tile-el.js`, and use it in `dock.js:210`, `readouts-pane.js:32`
   and `presenter.js:725`; keep each caller's own update loop.
4. Tests: `tests/tile-defs.test.js`: every `dock.js TILES` id exists in `TILE` with the same unit and decimals.
5. Risk: `presenter.js` is large and edited by many threads; do step 3's presenter part as one small hunk.

### Touches

None of the owning threads.

---

## 7. Learner wording

### What it is

- "hepatic venous pressure" 13 times and "hepatic vein pressure" 6 times for the same thing, for example `decks/hvpg.js:10` ("Wedged hepatic vein
  pressure minus free hepatic vein pressure"), `decks/hvpg.js:28-29`, `decks/gradients.js:110`, `table-marks.js:128-129`, against `decks/gradients.js:43`,
  `:54` and `dock.js:64`.
- The PPG expanded three ways: "portal pressure gradient" (26), "portosystemic gradient" (11, for example `dock.js:130`, `inspector.js:144`,
  `decks/carvedilol.js:125`) and "portosystemic pressure gradient" (2, `decks/tips-doppler.js:31`, `decks/gradients.js:135`).
- British spelling in learner text, against the authoring guide's American spelling rule (rule 13, cited in `docs/ai-humanizer.md:8`): "litre"
  13 times in `decks/day.js` (`:1`, `:19`, `:23`, `:26`, `:47-50`, `:69-73`) while other decks say "liter" (20 times); "litres a minute" in the heart
  label's spoken text (`heart-label.js:28`).
- Spacing of comparison signs: decks write "<5", "≥10"; the Explore tiles write "< 5", "≥ 10" (`dock.js` holds 38 such strings, `doppler.js` 15).
- "minus" and U+2212 mixed in the same kind of sentence (`decks/hvpg.js:10` "minus", `eus-ppg.js:65` and `tool-spans.js` "−").
- The wording check named in the brief, `scripts/clinical-wording.mjs`, does not exist in the repo; only `docs/ai-humanizer.md` and
  `scripts/rules-lint.mjs` (which has no spelling rules) do.

### The standard

US clinical register: "hepatic venous pressure" (the term HVPG abbreviates); PPG is "portal pressure gradient" on first use, with
"portosystemic" only where the guideline sentence quoted uses it; "liter"; "<5" and "≥10" with no space, as the decks have it; "minus" in a
sentence, U+2212 in a formula of abbreviations ("WHVP − FHVP").

### Merge plan

1. Edit the strings listed above (decks, `dock.js`, `table-marks.js`, `inspector.js`, `heart-label.js`, `doppler.js`).
2. Add `scripts/clinical-wording.mjs` (the file the brief expects) run by `npm run lint`: it scans string literals in `src/ui/decks/*.js` and the
   learner tables (`dock.js`, `table-marks.js`, `doppler.js` notes) for a short list: `litre`, `colour`, `haemo`, `oesoph`, `hepatic vein pressure`,
   `portosystemic gradient` (outside a quoted source), and a space after `<`, `>`, `≥`, `≤` before a digit.
3. Tests: `tests/clinical-wording.test.js` runs the script on the tree and on a fixture.
4. Risk: `tests/deck-thresholds.test.js` reads thresholds from slide words; re-run it after the spacing change.

### Touches

None of the owning threads, except `decks/gradients.js` (pressure monitor) and the heart label's line (labels thread, one string).

---

## 8. In-slide stepping and waits

### What it is

`next()` (`presenter.js:2303-2309`) checks, in order: a case card to lift, a time-lapse to skip, a procedure step (`procNext`, `:1461`), a camera
beat (`slide-beats.js`, which also counts reveal clauses, `reveal.js`), then the next slide. `prev()` (`:2310`) checks only the procedure step and
the beat. So a slide can step in five different units (procedure steps, beats, reveal clauses, a case card, and the catheter slides that are
whole slides), and two measurement cards step differently: the HVPG card plays by itself (finding 1), the tracing card waits for Next.
The waits between steps are partly cut-able (`wait-cut.js`) and partly fixed numbers written in place: `smooth(cut, ms = 700)` (`presenter.js:121`),
`waitCut(1250 + 400, ...)` and `waitCut(1000 + 400, ...)` for the sinusoid (`:1181-1182`), and `waitCut(60 | 80 | 120, cut)` (`:1137`, `:1151`, `:1173`).

### The standard

Every in-slide step is a beat of one list that `slide-beats.js` builds (procedure steps, reveal clauses and camera beats in one ordered list),
so Next and Back walk the same list both ways. Every wait is `waitCut` with a duration taken from `motion.js` or the move's own clock.

### Merge plan

1. In `slide-beats.js`, add procedure steps to the beat count (`lastBeat` already counts reveal clauses); let `procNext` and `procBack` become
   `toBeat` for those indices.
2. Give `prev()` the same order as `next()` (case card, lapse, then beats), or document in `slide-beats.js` why Back skips them.
3. Replace the literal waits with named constants in `motion.js` (`SINUSOID_IN_MS`, `SINUSOID_OUT_MS`) and the view's own settled flags, as
   `viewSettled` (`presenter.js:115`) does.
4. Tests: extend `tests/slide-beats.test.js` so a procedure slide's beat count equals its steps plus its camera beats.
5. Risk: the proc runner owns the procedure clock; turning steps into beats must keep Back running the clock backwards.

### Touches

Pressure monitor thread (the tracing card follows `procNext`). The presenter thread that clears layout reads owns `presenter.js`.

---

## 9. Number rolls and easing outside the family

### What it is

- Two constants named `COUNT_MS`: 950 ms in `motion.js:44` (slide tiles, `presenter.js:563`) and 240 ms in `util.js:795` (the bar's number roll,
  `util.js:878`). The same reading rolls for 0.24 s in Explore and 0.95 s on a slide. `presenter.js:847` writes 950 again as a literal.
- The ease-out cubic `1 - (1 - u) ** 3` is hand-written for time-based moves in `util.js:878`, `timeline.js:241`, `stage-cath.js:520`, `presenter.js:3605`
  and `trace-callouts.js:18`; it is not one of the family in `ease.js` (`easeMove`, `easeArrive`, `easeIn`).
- `label-track.js:16-31` (`easingOf`) is a second CSS-curve parser beside `ease.js:53-66` (`cssCurve`); they differ on an unknown curve (null
  against linear).
- `lobule-zoom.js:1561` rebuilds `easeArrive` as `cubicBezier(0.2, 0.8, 0.2, 1)`.
- A slide change moves the teaching card by `card-throw.js` on Next and Back, but by a WAAPI `animate` (`presenter.js:2173-2177`) for any other
  turn; the ternary there (`thrown ? EASE_MOVE : EASE_ARRIVE`) is dead because `thrown` is false on that path. `card-throw.js:4` says no WAAPI
  moves these cards.
- Card curves: `easeRail` `cubicBezier(0.32, 0.72, 0, 1)` (`card-throw.js:26`), `EASE_ARRIVE`, and `EASE_MOVE`.

### The standard

`ease.js` for every curve and `motion.js` for every duration (as `tests/ease-family.test.js` and `tests/motion-scale.test.js` already intend). One
number roll: the slide tiles' 950 ms, or one decided value, on one curve. `easeArrive` for any "settle into place".

### Merge plan

1. Rename `util.js:795` to `ROLL_MS` or make it `motion.js COUNT_MS` (owner's choice of the one duration), and replace `presenter.js:847`'s 950.
2. Replace the five ease-out cubics with `easeArrive` (closest in shape) or add `easeOut3` to `ease.js` if the owner wants that exact curve.
3. Make `label-track.js easingOf` call `ease.js cssCurve` (export a variant that returns null for an unknown curve).
4. Replace `lobule-zoom.js:1561` with `easeArrive`.
5. Route the non-thrown teaching-card entry through `card-throw.js throwIn` with a zero distance and a fade, and drop `pageIn`'s WAAPI use.
6. Tests: extend `tests/ease-family.test.js` to fail `(1 - u) ** 3` and `cubicBezier(` with literal numbers outside `ease.js` and `card-throw.js`;
   extend `tests/motion-scale.test.js` to fail a second export named `COUNT_MS`.
7. Risk: the bar's 240 ms roll was short so a reading that changes every second never seems to lag; check with the owner before lengthening.

### Touches

Labels thread for `label-track.js`; lobule owner for `lobule-zoom.js`.

---

## 10. The pressure profile, gut to heart, drawn twice

### What it is

- Explore's dock chart, `charts.js:162` (`createProfile`), drawn through the 2D-context emulation (`charts.js:168`, `createTraceGL`), with its own
  spans and fonts (`FONT`, which `doppler.js:10`, `fibroscan.js:10` and `pressure-time.js:10` also import from here).
- The slide tool `{ kind: 'profile' }`, `tool-profile.js:710` (`createProfileTool`), drawn as an `svg-gl` model with `chart-looks/profile.js`.

Both read `anatomy.js PROFILE_PATHS` and both bracket the HVPG and PPG, but with different layouts, label rules and type. A learner who
opens the profile in Explore after a talk sees a different chart of the same thing.

### The standard

`tool-profile.js` (the newer one, laid out for every screen, its looks in `chart-looks`, Node-testable layout).

### Merge plan

1. Make the dock's Profile pane host `createProfileTool()` with a `pathId` option (the dock lets the person choose among `PROFILE_PATHS`; the
   tool now takes `PROFILE_PATHS[0]`, `tool-profile.js:28`).
2. Move `FONT` and `textW` out of `charts.js` into `trace-gl.js` or a small `chart-font.js` so the instruments do not depend on the retired chart.
3. Delete `charts.js createProfile` and its `tenthGap` bracket code (`charts.js:314`).
4. Tests: port the dock chart's tests to the tool; add a test that the dock pane builds the tool.
5. Risk: the dock chart has a path chooser and hover readout; the tool must gain both.

### Touches

None of the owning threads.

---

## 11. A reading over days or over the talk

### What it is

- `{ kind: 'flowtime', clock: 'days', lines }` (`flow-time.js`, 37 slides with all clocks), which also draws the teaching card's time-lapse graph
  (`lapse-graph.js`) and the procedure graph (`{ kind: 'evgraph' }`, `event-graph.js:1-4`, "the same chart as the time-lapse graph").
- `{ kind: 'course', reading: 'asc' }` (`tool-course.js:1-5`), one slide, `decks/ascites.js:12`: one reading over days with an event, its own chart
  and looks.
- `{ kind: 'trace', range: 'talk' }` (`talk-trace.js`), 5 slides, including `style: 'milestones'` courses over two and ten years
  (`decks/recompensation.js:109`, `decks/ten-years.js:169`, `decks/prehepatic.js:151`).

### The standard

`flow-time.js` for a reading over model days (it already serves three kinds); `talk-trace.js` for the talk's own states (a different x axis:
one point per state, not per day), which is a different chart and stays.

### Merge plan

1. Teach `flow-time.js` the course's one extra, an event marker on the time axis (it already takes `given` lines), and move `decks/ascites.js:12`
   to `{ kind: 'flowtime', clock: 'days', lines: ['asc', ...] }`.
2. Delete `tool-course.js` and its `ext-model.js:34` registration.
3. Tests: the ascites slide's course test moves to the flow-time chart.
4. Risk: the course runs its own worker scenario (`from`, `event`); `flow-time.js` reads the slide's own time-lapse trail, so the slide must
   express the paracentesis as the slide's own `days` and `action`.

### Touches

None of the owning threads.

---

## 12. Text on the figure: outlined labels against tinted pills

### What it is

- The standard: `label-gl.js`, outlined text with no box (the anatomy and circuit labels, the heart's reading, `heart-label.js:4`).
- The lobule and sinusoid names are pills: a rounded box tinted 18 % with the term's colour and ringed (`styles/app.css:5519`, `:6720`, `:6729`),
  whose frost `lz-pills.js` reads for the GPU, drawn by `label-captions.js` (SDF atlas) rather than `label-gl.js`.
- Figure callouts (`.cath-label`, glass pills with a pointer) carry readings: `stage-cath.js:550`, `stage-sites-paint.js:172`, `callout.js`.

### The standard

`label-gl.js` outlined text for every name on the figure, the lobule and sinusoid included. Callouts that carry a reading with a pointer are a
separate component (see "Not duplicates"), unless the owner counts them as labels.

### Merge plan

1. Draw the lobule and sinusoid names with the label layer's outlined style (the label thread's `label-gl.js` look), keeping their term colour as
   the ink rather than as a pill fill; emphasis by ink weight, never a side bar.
2. Drop `lz-pills.js` and the `::before` pill rules (`app.css:5519-5522`, `:6720`, `:6729`, `:7580-7581`).
3. Tests: `tests/lobule-label-fades.test.js` and `tests/sinusoid-labels-kept.test.js` change; add a test that no `::before` pill remains on
   `.lz-lab`, `.lz-zone`, `.sv-region`.
4. Risk: the pills were added so names read over a busy lobule; the outline (halo) must be strong enough there.

### Touches

Labels thread (owns all of this). Glass thread (the pills' frost is a glass read).

---

## 13. Glass looks and their stand-ins

### What it is

- `GLASS` (`glass-gl.js:32`) and `CARD` (`:43`) hold the same blur, saturation and tint; `GLASS` is only the default when no `cards` option is given
  (`:526`), which neither caller in `stage.js` (`:2087`, `:2098`) does.
- `PANE` (`glass-gl.js:33-34`, blur 9, saturate 1.2) is for the liver label's `.lb-glass`, which no longer exists in `styles/` or any other
  module, and no caller passes `pane`: dead code.
- The tooltip keeps its own dark glass: `menu-glass.js:108` (`card: (e) => e.id !== 'tooltip'`) and `styles/app.css:7609` (tint 80 % of `--text`).
- Stand-in fills where the GPU glass is not drawn: `--surface` (`app.css:6707-6708`, the Blur effect off), `--gl-tint` (`app.css:7618`, menus
  before the GPU lands), `--glass` (`tokens.css:170`, chrome pills), 94 % (`app.css:1862`, `:3357`) and 96 % (`app.css:1874`, `:1906`, `:2050`, `:2249`,
  `:2470`, `:2508`, `:2524`, `:2675`) of the surface under `@supports not (backdrop-filter)`, and the high-contrast bar's 92 % (`app.css:2674`), which
  `glass-gl.js:37-41` says the GPU ignores.

### The standard

`CARD` in field mode, everywhere, the tooltip included. One stand-in fill for "no GPU glass here": `--glass-tint` (66 % of the surface), so a
card looks the same before and after the frost lands; `--surface` only for the Blur effect off.

### Merge plan

1. Delete `GLASS` and `PANE` and the `pane` option (`glass-gl.js:32-34`, `:483-484`, `:525-526`, `:2101`, `:2115-2116`, the `pane` tally at `:1422`).
2. Give the tooltip the card glass (`menu-glass.js:108`: `card: true`; `app.css:7609`: drop the dark tint), or, if the owner wants a dark tooltip
   for contrast, record it under "Not duplicates".
3. Replace the 94 % and 96 % fallback fills with `var(--glass-tint)`.
4. Tests: `tests/glass-one-look.test.js` exists; extend it to fail a second look object in `glass-gl.js` and any `color-mix(... 9[0-9]%` glass
   fallback in `app.css`.
5. Risk: browsers without `backdrop-filter` now get a lighter fallback; that is the same tint the GPU uses, so it matches.

### Touches

Glass thread (owns all of this). The compositor (`veins-gl.js COMP_FS`) is not touched.

---

## 14. Messages and sheets

### What it is

- **Toasts.** The standing pick is the foot card "D" for every message, and `toastBuild` already takes `#toastsFoot` first (`util.js:243-244`), so
  it is the only live wrap. The top wrap remains as dead code: `index.html:170`, `placeToasts` (`util.js:180-190`), the toast's close button for a
  non-note (`util.js:266`), the docked layout in `toast-gl.js:5-7` and `:63`, and `main.js:1913-1915`.
- **Messages swallowed while presenting.** `toast` drops any non-error message without buttons while `#app.presenting` (`util.js:232`). The
  presenter view's "Allow pop-ups to open the presenter view" (`presenter.js:2312`) is raised from a key press inside a talk (`presenter.js:6051`),
  so it is never seen.
- **Other message carriers.** The copy-link fallback opens a modal (`presenter.js:6637`); the HVPG pane writes a standing note line
  (`hvpg-proc.js:302-305`); the monitors write status on their canvas (`hvpg-proc.js:76`, `monitorNote` at `:556`). The last two are instrument
  status, not messages, and can stay.
- **Two sheet engines.** `dock-sheet.js:46` (`sheetBehaviour`, the cards) and `util.js:1082` (`swipeSheet`, menus and popovers). `dock-sheet.js:1` calls itself "the one engine behind every sheet",
  menu sheets included, but only the three cards call it (`main.js:1782-1784`); the menus' pull is its own copy that "follows the cards' engine"
  (`util.js:1088-1089`), sharing the constants, not the code.

### The standard

The foot card for every message. A message the presenter asked for carries `present: true`. One sheet engine, `dock-sheet.js`.

### Merge plan

1. Delete the top wrap and its code paths (the files above); keep `#toastsFoot`.
2. Pass `{ present: true }` at `presenter.js:2312`, and review every `toast(` in `presenter.js` for the same.
3. Move `swipeSheet`'s pointer handling onto `sheetBehaviour` (add the menu's options: resistance past full height and the scroll hand-off).
4. Tests: `tests/toast-gl.test.js` loses its docked cases; add a test that `index.html` has one toast wrap; a test that `presenter.js` toasts
   raised inside a talk carry `present`.
5. Risk: the sinusoid view had no bars to sit under (`util.js:186`); the foot wrap already serves it.

### Touches

None of the owning threads (`util.js` and `main.js` are shared; keep the hunks small).

---

## 15. Card shells

### What it is

Corner radii: talk cards `clamp(16px, 2.2 * --pzh, 28px)` (`app.css:1871`, `:2243`), the panel `clamp(18px, 2.6 * --pzh, 32px)` (`app.css:2260`), the
stacked teaching card 18 px (`app.css:2518`), sheets and menus `--r-sheet` 16 px, toasts on a phone `--r-card` 10 px, the tooltip 4 px, figure
callouts 14 px and dock panes `.7em` (from `app.css`; tokens at `tokens.css:56`). An instrument is laid in two shells: a `.dock-pane` in Explore
and a `.pz-inst` on a slide (`presenter-tools.js:116`), which changes its padding and type.

### The standard

`--r-sheet` for every card, sheet, menu and toast, scaled on large screens by the one formula the talk cards use; `--r-control` for controls.

### Merge plan

1. Add `--r-card-big: clamp(16px, calc(2.2 * var(--pzh)), 28px)` to `tokens.css` and use it for every talk card and the panel.
2. Make `.dock-pane` and `.pz-inst` share one instrument shell class for padding and type.
3. Tests: a CSS test that `border-radius` on card selectors reads a token.
4. Risk: the glass reads each card's radius to cut its shape (`glass-gl.js` uses the corners); re-check the glass on every card.

### Touches

Glass thread (the glass draws the shapes).

---

## 16. Rating vocabulary maps

### What it is

`pressure-cuts.js:30` defines `RATE_OF_SEV` (sev to rate). Copies or inverses: `tool-reading.js:24`, `hvpg-proc.js:48`, `readouts-pane.js:20`,
`tool-menu.js:71`. Rate or sev to colour token: `pressure-time.js:67`, `callout-math.js:41`, `presenter.js:287`, `instruments.js:382`.

### The standard

`pressure-cuts.js`: add `SEV_OF_RATE` and `TOKEN_OF_SEV` beside `RATE_OF_SEV`.

### Merge plan

Replace the eight maps with imports; extend `tests/pressure-vocabulary.test.js` to fail an object literal with keys `ok`, `mid`, `hi` or `ok`,
`caution`, `danger` outside `pressure-cuts.js`. Risk: none beyond import order (no imports in `pressure-cuts.js`, so the worker is fine).

### Touches

Pressure monitor thread (`tool-reading.js`, `hvpg-proc.js`).

---

## 17. One-decimal number formatters

### What it is

`util.js:117` (`fmt`, U+2212 minus, no "−0", cached); `callout-math.js:9` (a copy of `fmt` without the cache, because `util.js` needs the page);
`fix-text.js:14` (`fix1`) and `liver-morph.js:18` (a second `fix1`, a different fast path); `tool-curve.js:280` and `tool-causes.js:112` (the same
signed formatter twice); `doppler.js:108`; `tool-spans.js:135`; `proc-anim.js:151` and `:162`; `eus-ppg.js:19`; `tool-reading.js:27`; `instruments.js:645`;
`engine/gap.js:4`. The plain `toFixed` paths print a hyphen-minus for a negative value, the others U+2212.

### The standard

A pure module, `src/ui/num.js` (no DOM, Node-loadable): `fmt`, `fix1`, `round1`, `r1`, `NOT_SHOWN`. `util.js` re-exports `fmt` from it.

### Merge plan

Create `num.js` from `util.js fmt` and `fix-text.js`; replace the copies; keep `liver-morph.js fix1` only if its benchmark (`liver-morph.js:15-17`)
shows it is needed, then make it the one `fix1`. Tests: `tests/num.test.js` for sign and "−0", and a grep test for new `toFixed(1)` on a pressure.

### Touches

Pressure monitor thread for `tool-reading.js`, `tool-spans.js`, `proc-anim.js`.

---

## 18. Three chart pipelines on the GPU

### What it is

- The 2D-context emulation, `trace-gl.js` (`createTraceGL`, `fitPen`): `pressure-time.js`, `charts.js`, `doppler.js`, `fibroscan.js`, `hvpg-proc.js`,
  `col-wave.js`, `scope-tile.js`, `instruments.js`, `menu.js`, `endo-gl.js`.
- The `svg-gl.js` model with `chart-looks/*`: every deck tool (`tool-*.js`), `talk-trace.js`, `flow-time.js`, `event-graph.js`, `visual-plane.js`,
  `timeline.js`, `sinusoid-view.js`.
- The bespoke `vitals-gl.js` for the vitals monitor.

All are on the GPU, so this is maintenance, not a rule break: type sizes, colours and line weights are set in code in the first, in looks
in the second, and in a third place in the last.

### The standard

`svg-gl.js` with `chart-looks` for charts; `trace-gl.js` only where a picture streams every frame (the Doppler ring, the beat trace).

### Merge plan

Move a chart only when it is rewritten for another reason (finding 10 moves `charts.js`; finding 1 moves the HVPG monitor). Do not move
monitors outside the pressure-monitor thread. No test change until a move.

### Touches

Pressure monitor thread (the monitors).

---

## 19. clamp, lerp, smoothstep and first-order followers

### What it is

29 `clamp` definitions (for example `util.js:1308`, `engine/physiology.js:3`, `tool-curve.js:83`, `event-graph.js:101`, `card-place.js:5`, `blood.js:730`;
`card-scale.js:26` takes `(lo, v, hi)`, a different argument order), 6 `lerp`, 9 `clamp01`, about 30 smoothsteps (most are spatial shaping and
fine; the time-based ones are `trace-callouts.js:23`, `balloon-gas.js:90`, `proc-anim.js:424`, while `motion.js:53 smooth01` exists for that). About 20
hand-written first-order followers `x += (goal - x) * (1 - exp(-dt / tau))` (for example `vitals-monitor.js:223`, `stage-scan.js:108`, `ekg.js:118`,
`tool-fluid.js:434`, `stage-doppler.js:365`), beside six helper modules that each do the same (`display-state.js:94 headStep`, `organ-ease.js:8`,
`lesion-ease.js:19`, `band-ease.js:15`, `endo-motion.js:17`, `lobule-live.js:34`).

### The standard

`num.js` (finding 17) also holds `clamp(x, a, b)`, `lerp`, `clamp01`, `smooth01`; `display-state.js` holds the one follower (`headStep` with a
`tau` argument).

### Merge plan

Replace by file as files are touched; fix `card-scale.js:26`'s argument order first (it is the one copy that can be called wrong). A grep
test can cap the count so it only falls. The shader twins (`tube-*-glsl.js` JS mirrors of GLSL) stay as they are.

### Touches

None.

---

## 20. Between-frame write helpers

### What it is

`rest-pass.js:104` (`restClass`), `:136` (`restAttr`), `:143` (`restRemove`) beside `class-soon.js:61` (`classSoon`), `:102` (`attrSoon`), `:69`
(`textSoon`). The first waits for a budgeted rest pass, the second runs in the next task; 13 and 76 callers. Seven direct `requestIdleCallback`
calls (`main.js`, `sinusoid-gl.js`, `gl-compile.js`, `stage-balloon.js`, `stage-outlines.js`, `stage-tubes.js`, `trace-gl.js`).

### The standard

`class-soon.js` for class and attribute writes (cheap, prompt); `rest-pass.js` for work that reads layout; one idle helper for idle work.

### Merge plan

Point `restClass` and `restAttr` at `classSoon` and `attrSoon` (or keep them only where the wait for a quiet interval is wanted, named so);
add `whenIdle` to `rest-pass.js` and use it for the seven idle calls. Test: the existing `no-raw-raf` style test, extended to
`requestIdleCallback`.

### Touches

The presenter layout-read thread owns `rest-pass.js` (`scripts/off-gpu-owners.json`).

---

## 21. Palette values copied as literals

### What it is

`chart-looks/profile.js:21-23` writes the profile zones' tints as `rgba(...)` copies of the `--chart-*-band` tokens (marked colour-exempt). A few
`#fff` and `#000` remain in `stage.js:767-771`, `tool-profile.js:860`, `:921`, `stage-organs.js:124`.

### The standard

`theme-tokens.js` and `tok(...)` in the looks.

### Merge plan

Read `tok('chart-liver-band')` and its two siblings in `chart-looks/profile.js`; leave `#000` where it is a mask colour, not a colour seen.
Test: `tests/colour-tokens.test.js` already exists; remove the exemption.

### Touches

None.

---

## Not duplicates

- `card-scale.js` mirrors the stylesheet's type formulas on purpose, time-boxed and pinned by `tests/card-scale.test.js` (`card-scale.js:5-6`).
- `colormap.js velocityColor` (the figure coloured against each vessel's normal) and `dopplerColor.js` (the scanner's colour map) answer different
  questions.
- The Doppler's colour modes (spectrum, velocity, variance) and the scope probe for the EUS slide (`probe: 'scope'`) are deliberate options.
- The FibroScan, Doppler and endoscope are one component each in Explore and on slides (`presenter-tools.js:110-116` reuses them); only the
  HVPG is split (finding 1).
- `talk-trace.js` (one point per state of the talk) and `pressure-time.js` (the live beats, two minutes, and the disease clock) are different axes.
- `HVPG_CUTS.bleed` (12, drawn as a faint line) is a model calibration, not a third cut-off (`pressure-cuts.js:9-10`).
- The JavaScript twins of shader functions in `tube-*-glsl.js` exist so Node tests can check the GLSL; they are mirrors, not copies to merge.
- `chart-looks/dsl.js:22` `clamp` builds a look expression, not a number.
- Figure callouts with a pointer (`.cath-label`) carry a reading tied to a point; they are a component of their own, not a label style,
  unless the owner decides otherwise (then they join finding 12).
- `baveno-zones.js` is already the one source for the Baveno rectangles (used by `tool-criteria.js`, `visual-plane.js`, `chart-looks/plane.js`).

## Suggested build order

Each batch's items touch disjoint files and can run in parallel; a later batch waits for the one before it.

**Batch 1 (now, beside the pressure-monitor thread).**
- 1a Doppler (finding 4): `doppler.js`, `doppler-synth.js`, `doppler-gl.js`, `velNormal.js`, new tests.
- 1b Glass (finding 13): `glass-gl.js`, `menu-glass.js`, the glass lines of `styles/app.css`. Glass thread.
- 1c Wording (finding 7) in decks other than `gradients.js`, plus `inspector.js`, `heart-label.js`; new `scripts/clinical-wording.mjs`.
- 1d Messages (finding 14): `index.html`, `toast-gl.js`, `util.js` toast block (lines 175-300 only), `main.js:1907-1916`, one line of `presenter.js`.
- 1e Palette literals (finding 21): `chart-looks/profile.js`.

**Batch 2 (after 1d, because it edits `util.js` and `presenter.js`).**
- 2a Vocabulary (findings 3 and 16): `pressure-cuts.js`, `dock.js` words, `table-marks.js`, `pressure-time.js:57`, `:67`, `callout-math.js`,
  `readouts-pane.js:20`, `tool-menu.js:71`, `instruments.js:382`, `scan-ease.js`. The two monitor-thread files wait for that thread.
- 2b Easing (finding 9): `ease.js`, `motion.js`, `util.js:795`, `:878`, `timeline.js`, `stage-cath.js:520`, `trace-callouts.js`, `label-track.js`
  (labels thread), `lobule-zoom.js:1561`.
- 2c Number and maths helpers (findings 17 and 19): new `src/ui/num.js`, then file by file, avoiding the files of 2a and 2b in this batch.

**Batch 3 (after the pressure-monitor thread merges).**
- 3a Monitors and flows (findings 1 and 5): `decks/hvpg.js`, `carvedilol.js`, `ten-years.js`, `treatment.js`, `varices.js`, `ncph.js`, the
  Explore pane (`hvpg-proc.js`, `eus-ppg.js`), `proc-anim.js` capture lines.
- 3b Reading colours (finding 2): `theme-tokens.js`, `talk-trace.js`, `tool-curve.js`, `npm run gen:theme`.
- 3c Tiles (finding 6): `dock.js` table, `table-marks.js` long descriptions, new `tile-el.js`, `readouts-pane.js`, the tile hunk of `presenter.js`.

**Batch 4 (structural, one at a time per file).**
- 4a Profile chart (finding 10): `charts.js`, `tool-profile.js`, `dock.js` pane wiring.
- 4b Course chart (finding 11): `tool-course.js`, `flow-time.js`, `decks/ascites.js`, `ext-model.js`.
- 4c Stepping (finding 8): `slide-beats.js`, `presenter.js` next/prev and waits (coordinate with the presenter layout-read thread).
- 4d Labels (finding 12): labels thread.
- 4e Card shells (finding 15) and sheet engine (finding 14, step 3): `tokens.css`, `app.css` card rules, `dock-sheet.js`, `util.js swipeSheet`.
- 4f Between-frame helpers (finding 20): `rest-pass.js`, `class-soon.js`, the seven idle sites.
- Finding 18 (chart pipelines) rides on 3a and 4a and needs no batch of its own.
