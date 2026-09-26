# Rendering and simulation scheduling

## 2.1 overhaul (phase 2)

Measured with `npm run perf` (Chromium, CPU throttled; busy patient: decompensated cirrhosis):

| Profile | Before | After |
|---|---|---|
| Desktop | 60 fps | 60 fps |
| Laptop (CPU 4×, 2× pixels) | 12 fps, p50 frame 83 ms | 37 fps, p50 17 ms |
| Phone (CPU 6×, 3× pixels) | 7 fps, p50 150 ms, longest stall 150 ms | 31 fps, p50 17 ms, longest stall ~75 ms |

What changed:

- **Flow marks on the GPU** (`src/ui/flow-gl.js`): one instanced WebGL2 draw per frame; each
  arrowhead, trail and bleed droplet is a quad cut by a signed distance field. Occlusion under
  organs and nearer vessels comes from a mask the GPU renders only when the layout changes
  (vessel centerlines as round-capped segments, organs from a world-space bitmap made once).
  Used only with hardware acceleration (`failIfMajorPerformanceCaveat`); otherwise the Canvas2D
  renderer runs. `window.PPS_FLOW_GL = true` / `PPS_FLOW_2D = true` force either (tests use both).
- **Adaptive detail.** A governor watches frame pacing while the model runs; below ~22 frames a
  second the flow layer steps down (24 then 15 redraws a second, fewer pixels, no trails) and
  steps back up with headroom. The level is remembered per device (`pps.quality`). The stage
  exposes `data-flow` and `data-quality` for diagnosis.
- **No work on the heartbeat.** Vessel colors follow the beat-filtered mean pressure in
  0.5 mmHg steps; widths, wall thickness and varix geometry change only once past a hysteresis
  band. Gradients, tube outlines and varix beads were being rebuilt several times a second by
  the pulse alone.
- **Hit testing** is limited to the invisible hit strokes (`#world .v-hit`), so the browser
  never tests the thousands of drawn paths on pointer moves.
- The hidden congestion-glow layer is only updated in the Congestion lens; occlusion masks are
  keyed on whole-pixel widths.

The sections below describe the earlier scheduling work, still in place.


The simulation timestep and physiological equations are unchanged by the performance work.

- Running model frames are still published approximately ten times per second. Explicit actions publish immediately, including while paused.
- Paused and hidden pages stop the simulation timer. Returning to the page resumes without integrating time spent hidden. Long jobs already in progress finish in command order.
- Flow drawing is capped at approximately 30 frames per second, independent of display refresh rate. Elapsed time still controls flow speed and anatomy/circuit transitions.
- Flow marks hidden under organs or nearer vessels are erased only in the 32 px canvas tiles that hold marks, not across the whole canvas. The result is pixel-identical to erasing the full canvas.
- SVG labels retain their text elements when only values, widths or colors change. The vessel-density grid used for label placement is cached until geometry, visibility or the viewport transform changes. Label positions themselves are still evaluated to preserve collision handling.
- Preset preparation, time jumps, prerolls and counterfactuals yield between batches. Commands remain serialized and timer ticks do not run inside partially completed jobs. A batch targets 8 ms, but an individual solver/day operation can exceed that budget. This is cooperative scheduling, not a hard latency guarantee.
- A timed-out worker is terminated before fallback. The app element exposes `data-engine="worker"` or `data-engine="main"` for diagnosis.

## Verification

Run `npm test`. In addition to the physiological acceptance suite, lifecycle tests check pause/visibility behavior, immediate action frames, worker timeout cleanup, event-loop yielding and command ordering. The yielded calculations are compared with synchronous calculations, including complete snapshots after preset loading, advancing and prerolling.

Before release, inspect both views in healthy and decompensated scenarios on desktop and a physical phone. Check live label values, pressure units, selection, pan/zoom, transitions, pause/resume and time jumps. Profile scripting, painting and worker work separately. No device FPS or speedup claim is made by these source changes.

Further work should be driven by that profile. Full label-position caching, adaptive visual detail and preset snapshot caching are not implemented here.
