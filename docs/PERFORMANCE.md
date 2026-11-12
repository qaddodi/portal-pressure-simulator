# Rendering and simulation scheduling

Updated 11 November 2026. This file says how the figure is drawn and paced today. The history of each
change is in `CHANGELOG.md`; the rules every change must keep (nothing off the GPU, one frame
scheduler, layout reads through `layout-snap.js`) are in `AGENTS.md`. Related files:
`docs/tube-renderer.md` (the vessel renderer), `docs/gpu-practices.md`, `docs/scheduling.md`,
`docs/stage-map.md`.

## What draws what

- **The figure is drawn on the GPU.** The vessels (the Tube renderer, `docs/tube-renderer.md`), the
  organs, the moving blood, the glows, the glass behind callouts and cards (`glass-gl.js`), the
  labels (`label-gl.js`), the Doppler, the pressure traces and the vitals strip are all drawn by
  WebGL or the canvas, not by layout. The Tube is the only vessel renderer. A hidden classic pass
  draws only while the Tube cannot (its programs still compiling, a failed shader, software GL, no
  depth and stencil target), so the figure never shows nothing. `?perf` names which in its
  `vessel renderer` gauge.
- **Moving blood** (`src/ui/veins-gl.js`, `src/ui/blood.js`): the vessel pass runs only when the
  vessels change (a model frame, a pan or zoom). Each animation frame then draws the blood over just
  the vessel tiles. The renderer keeps its picture in a texture of its own and lays it whole on the
  canvas; the canvas also keeps its picture (`preserveDrawingBuffer`, 4 Nov 2026), so a frame that
  touches it without a fresh picture can never show it cleared.
- **A pan copies nothing, and the vessel layer is only as large as the figure.** The layer wraps round
  at its edges: a pan moves the wrap and draws only the strips it uncovers (`tests/veins-wrap.test.js`).
- **Only the vessels that changed are redrawn.** When a model frame changes only some vessels'
  attributes (the pulse moving a few colours), `drawRows` redraws only their cells. A colour-only
  change redraws only the pixels the colour reaches (`tests/veins-tint.test.js`). A glow easing
  rewrites only the glow texels (`syncGlowOnly` in `stage.js`, `glow-texels.js`;
  `tests/frame-costs-glow.test.js`).
- **Uniforms are sent only when they changed** (`uniform-cache.js`, `tests/uniform-cache.test.js`):
  in Safari every `gl.*` call is a message to the GPU process.
- **The glass** is drawn in the figure's canvas, blurred again on every picture laid (since 1 Nov 2026,
  so a card never shows a stale blur). No `backdrop-filter` is declared anywhere; `?perf` lists any
  blur that is not a glass of the figure. Since 12 Nov 2026 every glass (card, bar, pill, menu,
  callout, pane) is the field (Mohammad's F4): no blur passes, the figure averaged to one texel each 64 CSS px
  and a cubic B-spline over 72 px cells (`glass-gl.js` `SMOOTH`). Settings › Display › Blur effect turns it
  on or off (on by default on every device; off is solid and runs cooler), stored as `pps.glassMode` with
  `pps.noGlass` kept in step for the blur guard (`glass-mode.js`).
- **Still layers** (`still-layer.js`): the parts of a chart that do not move (the panel, each lane's
  grid and numbers, the cut-off lines, the vitals panel and names) are drawn once into a picture and
  laid down with one `drawImage` while their key holds (`tests/still-layer.test.js`).
- **A label canvas that draws nothing is hidden** (`data-blank` on the canvas of `label-gl.js`), so the
  compositor does not blend it with the figure on every frame.

## Resolution and the quality rule

- **Figure size** (Settings › Display, `pps.fig.cap`): the figure picture's pixel budget, from 0.25
  megapixels to Full. The default is per device: 2 MP on a Mac and an iPad, 1 MP on an iPhone. The
  canvas the labels, leaders and glass are drawn in stays at 1 device pixel per CSS pixel at least,
  the picture is upscaled onto it with its edges steepened, and cards, labels and readings stay
  sharp (`stage-res.js`; `docs/recommendations/sharp-at-quarter-megapixel.md`).
- **Text is never lowered.** Labels, readings, cards and every GPU word stay at full density. The
  figure's text size is fixed at 100% (the Text size setting was removed).
- **Resolution is never lowered at rest.** The one thing that may step down is the vessel layer's
  *moving* frames (`adapt-tier.js`: tiers 1, 0.71 and 0.5 of the width and height, chosen by the frame
  deadline during a pan, pinch, glide or dive), and it returns to Full at the frame the move ends.
  Settings › Display › Sharp while moving turns even that off (`pps.sharp`).
- **Software renderers** (SwiftShader, llvmpipe) are the only other reduction: the app starts and stays
  at 8 frames a second at half resolution so the page keeps the CPU it needs. The stage exposes
  `data-veins`, `data-renderer` (`gpu` or `software`), `data-quality` (0 full, 2 software) and
  `data-res` (vessel canvas pixels per CSS pixel) for diagnosis. Levels older builds stored
  (`pps.quality`, `pps.q`) are removed at start.
- **Battery saver** (15 frames a second) is no longer a setting. Its code stays for tests and an
  old stored value is dropped.

## Frame pacing

All per-frame work goes through the one scheduler in `src/ui/frame.js` (`frameFor(tag)`; see
`AGENTS.md`). The frame-rate governor gives each kind of motion its own rate:

| Reason | Rate |
|---|---|
| `hand` (a drag, flick, wheel or pinch drives the camera) | the screen's own rate (60, 120 or more) |
| `glide` (a slide change, view switch or other move the app runs itself) | 60 Hz |
| `flow` (only the blood moves) | 60 Hz (30 was tried and read as a flicker) |
| `still` / `hidden` | none |

Elapsed time controls every speed and transition, so a faster display shows the same motion in more
steps; the model's samples and the simulation clock do not depend on the frame rate.

## Work that waits for a quiet page

- **Optional refinement shares one small allowance and waits out a gesture** (`src/ui/refine.js`). The
  organ pictures made sharper after a zoom take turns, one step a frame, from an allowance of 1 ms a
  frame (`REFINE_MS`; `?refinems=3` tries another), only in frames where no gesture is under way.
- **Shader publishing, the optional vessel programs and the module warm-up wait for the page to be left
  alone** (`src/ui/quiet.js`, the one clock of input). The programs the first draw needs are compiled
  and finished at start-up.
- **The corner credit's art test is kept in the figure's own coordinates** (`credit-art.js`,
  `worldTest` in `credit.js`), so a pan or modest zoom reads no shape and no pixel.

## The simulation

The physiological equations are not changed by any performance work.

- The timestep is 4 ms with the pulse on and 20 ms without at 1x and 2x (every Present slide runs at
  1x). At 4x and 8x the pulse takes 8 ms steps (`hemoStep()` in `src/worker-core.js`), so phones keep
  up; beat-averaged pressures move by about 0.01 mmHg (`tests/hemo-step.test.js`).
- Running model frames are published about ten times a second. Explicit actions publish immediately,
  also while paused.
- Paused and hidden pages stop the simulation timer. Returning to the page resumes without integrating
  the time spent hidden.
- Preset preparation, time jumps, prerolls and counterfactuals yield between batches (a batch targets
  8 ms; one solver or day operation can exceed it). Commands stay serialized. This is cooperative
  scheduling, not a hard latency guarantee.
- A timed-out worker is terminated before the fallback. The app element exposes
  `data-engine="worker"` or `data-engine="main"`.
- Vessel colours follow the beat-filtered mean pressure in 0.5 mmHg steps; widths, wall thickness and
  varix geometry change only once past a hysteresis band.

## Measuring

- **`?perf`** shows the frame-rate readout, the vessel renderer gauge, the surfaces and phases of every
  frame over 50 ms, the slowest inputs, and the budgets; Copy puts them in the paste. **Show frame
  rate** and **Show frame breakdown** in Settings › Performance show smaller versions.
  `window.pps.perf.frames` and `window.pps.perf.inputToPaint` record frames and input-to-paint
  times (`frame.js`, `frame-stats.js`, `input-latency.js`).
- **Local tools, not CI.** `npm run perf`, `npm run perf:frames` and `npm run perf:gate`
  (`scripts/frame-gate.mjs`) judge frame time and input latency under throttled CPUs. They were
  retired from CI on 4 Nov 2026, because software WebGL on a shared runner judges neither the look nor
  the speed of a real GPU. Run them by hand when a measurement is wanted. A real device is the judge.
- **Static checks** run on every push: `scripts/off-gpu-scan.mjs` (lint, with the layout-read
  allowance), the line budgets and the chunk cap in the strict build (`npm run check:static`,
  `npm run build`).

## Verification

Run `npm test`. In addition to the physiological acceptance suite, lifecycle tests check pause and
visibility behaviour, immediate action frames, worker timeout cleanup, event-loop yielding and command
ordering. The yielded calculations are compared with synchronous calculations, including complete
snapshots after preset loading, advancing and prerolling.
