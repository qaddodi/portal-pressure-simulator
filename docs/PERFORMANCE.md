# Rendering and simulation scheduling

## 2.1 overhaul (phase 2)

Measured with `npm run perf` (Chromium, CPU throttled; busy patient: decompensated cirrhosis):

| Profile | Before | After |
|---|---|---|
| Desktop | 60 fps | 60 fps |
| Laptop (CPU 4×, 2× pixels) | 12 fps, p50 frame 83 ms | 37 fps, p50 17 ms |
| Phone (CPU 6×, 3× pixels) | 7 fps, p50 150 ms, longest stall 150 ms | 31 fps, p50 17 ms, longest stall ~75 ms |

What changed:

- **Moving blood on the GPU** (`src/ui/veins-gl.js`, `src/ui/blood.js`): the vessel shader, run
  only when the vessels change (a model frame, a pan or zoom), also writes a small per-pixel lumen
  buffer (which vessel, how far along, where across). Each animation frame then runs one cheap
  pass over just the vessel tiles that reads that buffer and draws the parcels, the dye and any
  bleed; the renderer keeps everything else in a picture of its own and copies it whole onto the
  canvas, which keeps none (no `preserveDrawingBuffer`; `?vesselbuf=keep` goes back). Anything that
  reads the canvas outside the frame that drew it calls `capture()` first. The per-frame CPU work is a
  few floats per vessel.
- **A pan copies nothing, and the vessel layer is only as large as the figure.** The layer wraps round
  at its edges: a pan moves the wrap and draws only the strips it uncovers. On an axis where the
  figure takes less than the picture, the layer is the figure's extent and a quarter more (rounded up to
  64 px), and it follows the figure, so a pan along that axis draws nothing at all. Pixels outside it
  read as empty, as the layer's own cleared pixels. Checked texel by texel in `tests/veins-wrap.test.js`.
- **Only the vessels that changed are redrawn.** When a model frame changes only some vessels'
  attributes (the pulse moving a few colours), `drawRows` in `veins-gl.js` redraws only those
  vessels' cells, to the same picture pixel for pixel; anything else the vessel pass reads (view,
  size, look, a vessel's shape) still redraws the whole layer. Checked by `npm run smoke:rows`.
- **A colour change draws only the pixels that colour reaches.** The vessel shader marks, beside
  each pixel's colour, whether any vessel's lumen colour reaches it (its lumen, or a glow in its own
  colour). When vessels' lumen colours alone change (the pulse, the lobule's lymph tint, a lens
  fade), `drawRows` recolours their cells: the same shader runs again only on the marked pixels and
  writes their colour; casings, shadows and the space between vessels depend on no lumen colour and
  stay as drawn. So a tint that moves every lymph channel at once no longer redraws the whole layer.
  The picture is a whole redraw's, pixel for pixel (`npm run smoke:rows`; `tests/veins-tint.test.js`).
- **A glow easing rewrites only the glow.** While a hover, selection, slide or Doppler glow eases,
  only the glow texels of the tube data change. When nothing else the vessel sync reads has changed
  since it last ran (vessels, model frame, morph, layout, colours, plate, lens, catheter, classes),
  `syncGlowOnly` in `stage.js` writes those texels alone, with the helper the whole sync uses
  (`glow-texels.js`), and only the changed rows are drawn again; otherwise the whole sync runs.
  The same tube data, so the same picture (`tests/frame-costs-glow.test.js`).
- **The quality rule, exactly (one place).** Resolution and motion are never lowered at rest, and never for text (labels, readings, cards and
  every GPU word stay at full density). The one thing that may step down is the vessel layer's *moving* frames (`adapt-tier.js`: 0.71 then
  0.5 of the width and height, chosen by the frame deadline during a pan, pinch, glide or dive), and it returns to Full at the frame the
  move ends. Settings › Sharp while moving turns even that off (`pps.sharp`). A software renderer is the only other reduction (below).
  The paragraph after this one describes the same rule from the older, still-true side.
- **Full detail, always.** The figure, the lobule and the FibroScan never
  lower their own resolution or frame rate: no governor steps them down when frames run long, and
  zooming in keeps every pixel. Levels older builds stored (`pps.quality`, `pps.q`) are removed at
  start. One step remains: a software renderer (WebGL drawn on
  the CPU: SwiftShader, llvmpipe), which starts and stays at 8 frames a second at half resolution so
  the rest of the page keeps the CPU it needs. The stage exposes `data-veins`, `data-renderer`
  (`gpu` or `software`), `data-quality` (0 full, 1 saver, 2 software) and `data-res` (vessel canvas
  pixels per CSS pixel) for diagnosis.
- **No work on the heartbeat.** Vessel colors follow the beat-filtered mean pressure in
  0.5 mmHg steps; widths, wall thickness and varix geometry change only once past a hysteresis
  band. Gradients, tube outlines and varix beads were being rebuilt several times a second by
  the pulse alone.
- **Hit testing** is limited to the invisible hit strokes (`#world .v-hit`), so the browser
  never tests the thousands of drawn paths on pointer moves.
- The hidden congestion-glow layer is only updated in the Congestion lens; occlusion masks are
  keyed on whole-pixel widths.
- **Optional refinement shares one small allowance and waits out a gesture** (`src/ui/refine.js`).
  The organ pictures made sharper after a zoom (painted on the GPU a few ops at a time, or
  rasterized a strip at a time) and the gut's pictures each took 6 ms of painting a frame of their
  own, a strip's drawing and read-back on top. They now take turns, one step a frame, from an
  allowance of 1 ms a frame (`REFINE_MS`; `?refinems=3` tries another), in frames where no
  gesture is under way (a drag, a fling, a wheel in the last 250 ms, a finger down or an input in the
  last 120 ms). A step paints at least one op, so the allowance can be exceeded by one op: the
  `?perf` readout lists the longest step by layer and counts the steps and the frames held for a
  gesture. Work the state has moved on from is dropped at its next turn, not after the gesture.
  The pictures therefore arrive over a longer stretch than before (the figure shows what it showed
  before them meanwhile). The one indivisible operations left (a big shape's first mesh, reading
  every organ's shapes) are not split.
- **Shader publishing, the optional vessel programs and the module warm-up wait for the page to be
  left alone** (`src/ui/quiet.js`, the one clock of input): a program that finishes compiling mid
  pan or pinch is published afterwards (`publishWhenDone`, the vessel renderer's `prepare()`), and
  the palette, presenter and dock modules are read in one at a time, each in a quiet idle moment.
  The programs the first draw needs are still compiled and finished at start-up.
- **The corner credit's art test is kept in the figure's own coordinates** (`src/ui/credit-art.js`,
  `worldTest` in `src/ui/credit.js`). It had read every organ, fluid and vessel shape from the page
  (matrix, box, style) and drawn them onto a canvas it read back, again at each new camera position
  once the camera had rested (the 11 ms `credit: art grid` step). On the GPU figure the shapes are
  now read once into facts (outline, matrix inside the world, box, fill and stroke), kept until a
  shape changes (a watch on the art's groups, stopped at the first change, not on the world's own
  transform, which is the camera) or 15 s have passed, and drawn onto a grid in world coordinates
  over the view and half a screen of margin, cells 3 to 6 px on screen. A pan inside the grid, or a
  zoom to 1.5 times closer or twice further, reads no shape and no pixel: the credit maps each box it
  tries into the world (a turned Circuit included, the box round the turned rectangle) and looks the
  cells up. Past the grid it is drawn again from the facts, with no page read. The `?perf` readout
  counts `credit art: shapes read`, `grid drawn` and `grid kept (camera only)`. The lobule's outline,
  the SVG figure of Lite graphics and a grid over 700,000 cells keep the screen grid, as before.

The sections below describe the earlier scheduling work, still in place.


The physiological equations are unchanged by the performance work. The timestep is unchanged at 1× and 2× (so every Present slide, which runs at 1×): 4 ms with the pulse on, 20 ms without. At 4× and 8× the pulse takes 8 ms steps (`hemoStep()` in `src/worker-core.js`), half the work a tick, so phones keep up; beat-averaged pressures move by about 0.01 mmHg, MAP and heart rate by 0.15 at most (`tests/hemo-step.test.js`).

- Running model frames are still published approximately ten times per second. Explicit actions publish immediately, including while paused.
- Paused and hidden pages stop the simulation timer. Returning to the page resumes without integrating time spent hidden. Long jobs already in progress finish in command order.
- Motion (the blood and flow, the lobule and sinusoid, the Doppler sweep, the FibroScan map, chart glides) is drawn on every frame the display offers: 60, 120 or more a second. Elapsed time controls every speed and transition, so a faster display shows the same motion in more steps; the model's samples and the simulation clock do not depend on the frame rate. Battery saver (off by default) paces motion to 15 frames a second (`paceMs()` in `src/ui/frame.js`).
- SVG labels retain their text elements when only values, widths or colors change. The vessel-density grid used for label placement is cached until geometry, visibility or the viewport transform changes. Label positions themselves are still evaluated to preserve collision handling.
- Preset preparation, time jumps, prerolls and counterfactuals yield between batches. Commands remain serialized and timer ticks do not run inside partially completed jobs. A batch targets 8 ms, but an individual solver/day operation can exceed that budget. This is cooperative scheduling, not a hard latency guarantee.
- A timed-out worker is terminated before fallback. The app element exposes `data-engine="worker"` or `data-engine="main"` for diagnosis.

## Frame-time and input-latency gates (31 Oct 2026; premium-feel recs R2, R5, P4)

What is measured, and where (`src/ui/frame.js`, `frame-stats.js`, `input-latency.js`; `scripts/frame-gate.mjs`):

- **Frames.** `watchFrames(fn)` hands a watcher every frame the scheduler runs: its interval from the last frame (only while the
  scheduler ran frame after frame), the script time, and each callback's surface, phase (early, late, final) and ms. Nothing is timed
  while nobody watches. `window.pps.perf.frames.start()` / `.stop()` record a window and return the raw numbers.
- **Inputs.** `window.pps.perf.inputToPaint` stamps a click, a press on the figure or a key at the event's own time and closes it at the
  scheduler frame in which the page first changed (a DOM mutation). `.summary()`, `.entries(since)`, `.slowest()`. It is made on the
  first read of it, or at load when the address has `?perf` or `?inputs`, so a page nobody measures has no listener for it. (At load,
  because the presenter's own window key listener stops the keys it uses: a tracker made after it never sees a Next.) A
  MutationObserver watches only while an input waits for its answer. On a page whose readings change by themselves an unrelated
  change can answer an input early, so a time is at most the true one; the gate pauses the model first.
- **`?perf`.** The readout also lists every frame over 50 ms (when, the interval, the script, which surface ran in which phase, and what
  the scheduler's callbacks do not account for: style, layout, paint, the GPU) and the slowest inputs, and Copy carries both.
- **The gate.** Laptop (CPU 4×, 2× pixels) and phone (CPU 6×, 3× pixels), as `npm run perf`. The script time per frame is judged always;
  the interval between frames only on a GPU (the runners draw in software, which sets their pace). Bars (`target`): p95 under 16.7 ms
  laptop and 33 ms phone, no frame over 100 ms, an input answered within 100 ms and 150 ms; a measure past a bar is reported. Ceilings
  (`fail`) are what blocks, and are not the bars: the runners draw in software under a 4× or 6× slower CPU, so untouched code
  measured 80 to 270 ms of script at p95, and 1.9 s for the longest frame (the lobule's zoom on slides 5 to 6 of the HVPG deck), on
  31 Oct (checks runs 1105 and 1121). Each scenario's own ceiling is the largest number the runners have measured for it ×1.5 (×2 for
  the longest frame; no input ceiling under 150 ms); a scenario nobody has measured has the profile's generic one. A ceiling only goes
  down from here: lower it to the largest number of the runs seen, with the same margin; never raise one. A scenario over a ceiling is run once more, if the
  time allows, and the better run kept. The whole run has 12 minutes (`--budget`, `PERF_BUDGET`) inside the workflow step's 15: a
  scenario that cannot finish in what is left is listed as not run, the files are written as it goes, and the verdict is printed
  whatever is done. The cold menu is reported, not judged, until a ceiling can be set from more than one sample. `checks.yml` warns,
  `ci.yml` blocks; both run it in their `visual` job so no runner is added. `npm run perf:gate -- dist` runs it by hand
  (`--profile=phone`, `--mode=block`).

## Compositor and canvas heat (31 Oct 2026; laptop-heat recs H2, H3)

- **Backdrop blurs (H2).** A CSS `backdrop-filter` is a CABackdropLayer that macOS's WindowServer redraws on every frame the content under
  it changes, which over the moving figure is every frame. The figure draws the glass of the callouts, the liver pane and the Present
  cards itself (`glass-gl.js`); what is left on the browser's blur is listed by `?perf` -> **Blurs** (`blur-gauge.js`), each with the
  reason its glass gave the blur back (`stage.js` `blurWhy`). The lobule pills are on the browser's blur on purpose (the GPU frost
  flickered); `.pz-fold` and `.toast` have no glass of the figure.
- **Still layer (H3).** The Pressure chart's parts that do not move (the panel, each lane's grid and numbers, the HVPG lane's cut-off
  lines and names, and on a slide's beat card the scale's numbers and the column or line of readings) are drawn once into a picture of
  the chart's size (`still-layer.js`) and laid down with one `drawImage` while their key holds. The key is the JSON of every number,
  colour and word those parts are drawn from, plus the canvas size, the pixel ratio, the context's line ends and the fonts epoch. The
  traces, ends, markers, axis and crosshair are drawn over it as before. `tests/still-layer.test.js` compares what reaches the canvas
  (every drawing call with the state it reads) with and without the picture, frame by frame, for the dock and the slide cards.
- **Frost that is not blurred again for nothing (Q5, Q4).** The glass drawn in the figure's canvas never re-blurs on a plain blood frame
  (`veins-gl.js` `pictured(true)` leaves `drawSeq` alone), so what it blurred again every frame were the frames that are not plain blood
  (the ascites ripple, a catheter, dye, an eased colour). When only the figure under it has been drawn again, with the view
  (`veins.viewKey`) and the region taken unchanged, it now blurs at most every `REBLUR_MS` (50 ms) and draws from the blur it has in
  between; a pan, a zoom, a glide or a card moving to another region blurs at once, and the last change is blurred when the time is up
  (`tests/glass-reblur.test.js`). The lobule pills' frost (`?lzpills=1` only; by default they stay on the browser's blur) keeps its copy of
  the lobule while only the blood moves (`lz-pills.js` `pillHold`), so it cannot shimmer with the streaks, and takes a new one for the
  model's frames, a pan, a zoom, an ease or a fade.

- **Uniforms sent only when they changed (Q2).** The figure's composite set about fifty uniforms on every frame the blood moved, nearly
  all the same numbers as the frame before; in Safari each `gl.*` call is a message to the GPU process. `uniform-cache.js` keeps the
  value each uniform location holds and sends a call only when it differs (the view, plates, colours and flags; the clock still goes
  every frame). These names are set through it and nowhere else (`tests/uniform-cache.test.js` pins that in `veins-gl.js`).

- **Vitals monitor still layers (Q6).** `vitals-monitor.js` drew the panel, the baseline, the strip's name and the three vitals' names, numbers
  and units (with a `measureText` fit loop each) on every frame the strip scrolled. They are now two pictures (`still-layer.js`): the panel
  with its baseline and name, and the readings, each drawn again only when its key changes (size, colours, fonts epoch, and for the readings
  the printed strings). The strip is drawn over the first every frame, as before. `tests/vitals-still.test.js` compares every drawing call
  with and without the pictures, frame by frame, for six card sizes and moving numbers.
- **A label canvas that draws nothing is hidden.** The label canvas (`label-gl.js`) covers the whole stage, so the compositor blended it with
  the figure on every frame the blood moved even when no label, mark or probe was on it. Every picture it draws has a box (`boxes`), so
  with none it takes `data-blank` (`visibility: hidden` in `app.css`) in the same draw, and loses it in the task that draws the first thing back.
  Sizing the canvas to the union of the labels was not built: the labels spread over most of the stage, the dive's transform is set on the
  layer's own box, and a label must land on a whole device pixel.

## Verification

Run `npm test`. In addition to the physiological acceptance suite, lifecycle tests check pause/visibility behavior, immediate action frames, worker timeout cleanup, event-loop yielding and command ordering. The yielded calculations are compared with synchronous calculations, including complete snapshots after preset loading, advancing and prerolling.

Before release, inspect both views in healthy and decompensated scenarios on desktop and a physical phone. Check live label values, pressure units, selection, pan/zoom, transitions, pause/resume and time jumps. Profile scripting, painting and worker work separately. No device FPS or speedup claim is made by these source changes.

Further work should be driven by that profile. Full label-position caching, adaptive visual detail and preset snapshot caching are not implemented here.
