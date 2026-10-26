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
  bleed; the canvas keeps everything else (`preserveDrawingBuffer`). The per-frame CPU work is a
  few floats per vessel.
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

## Verification

Run `npm test`. In addition to the physiological acceptance suite, lifecycle tests check pause/visibility behavior, immediate action frames, worker timeout cleanup, event-loop yielding and command ordering. The yielded calculations are compared with synchronous calculations, including complete snapshots after preset loading, advancing and prerolling.

Before release, inspect both views in healthy and decompensated scenarios on desktop and a physical phone. Check live label values, pressure units, selection, pan/zoom, transitions, pause/resume and time jumps. Profile scripting, painting and worker work separately. No device FPS or speedup claim is made by these source changes.

Further work should be driven by that profile. Full label-position caching, adaptive visual detail and preset snapshot caching are not implemented here.
