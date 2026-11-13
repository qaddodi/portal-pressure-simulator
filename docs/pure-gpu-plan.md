# Pure GPU, least CPU, least GPU: the plan

**Status (11 Nov 2026): partly built.** Written 4 Nov 2026 from a Safari `?perf` readout of preview c4e95eed (2x Mac) and from the code
at 2e44012. The item letters (A1 to A5, B1 to B5, C1 to C5) are cited from source comments and tests, so they are kept. Per item:
built, open, or not verified (nobody re-measured on a device after 4 Nov, and the readout lines below are not re-taken).

The goal has three parts:

1. **Nothing drawn by the browser** that the figure, labels or charts need. Every pixel of those is WebGL; what is left is the *model*
   behind them: an SVG/HTML tree the CPU reads and writes and the browser restyles.
2. **CPU work near zero in motion.** A glide frame should be a few uniform writes and draw calls.
3. **GPU work near zero at rest, small in motion.** A 2D picture should cost about what a video player costs, and run cool on a fanless
   MacBook and an iPhone.

Cost targets, per frame in motion on a 2x Mac (the 4 Nov readout was: script 10 to 90 ms, page busy 10 to 200 ms, GPU copies 31 to 62 MB,
uploads 50 KB to 3 MB, about 100 style and layout reads, 50 to 140 DOM writes):

| | target |
|---|---|
| script | under 4 ms |
| page busy (style, layout) | under 2 ms |
| GPU copies | 0 MB (draw straight to the canvas) |
| uploads | under 20 KB |
| style and layout reads | 0 |
| DOM writes | under 5 (only the a11y text) |
| at rest | nothing drawn, or 30 Hz for flow only |

Each step is judged on the `?perf` readout lines it names ("on a fallback", "copies: kept picture onto the canvas", "uploaded",
"style+layout reads", "DOM writes", "page busy", the frame interval histogram), on a device. `scripts/off-gpu-scan.mjs` and
`docs/off-gpu-inventory.md` count the code-side work.

## Part A. Move the last things onto the GPU

| # | Item | Status |
|---|---|---|
| A1 | Labels stay on the GPU during a view switch (no SVG fallback while they fade) | Built in `label-gl.js` host mode: the view change keeps the old labels as ghosts and crossfades them (`ghosts`, `xfOld`, `xfNew`; `tests/label-host-ride.test.js`). That the SVG label text is never shown during a switch is not verified. |
| A2 | The figure's scene model leaves the DOM: typed store, theme table, GL painters read the store | Partly built. `theme-tokens.js` (every theme-varying colour, per look and view, prints `styles/tokens.css`), `scene-store.js` (an element's paint worked out in script from the style rules, no `getComputedStyle`; `organ-paint.js` reads through `sceneStyle`) and `scene-cam.js` exist. Open: `svg#stage` and `svg#labels` are still real SVG in `index.html`, overlays and marks still read computed styles (`stage-marks.js`), and the SVG geometry is not dropped. |
| A3 | Chart models: looks from a JS table, then no hidden DOM | Looks: built (`docs/chart-looks-in-code-plan.md`). The display list (builders emit `{tag, attrs, kids}` instead of elements) is open: `svgModel` in `svg-gl.js` still makes HTML elements. |
| A4 | Cards move by one transform; `contain` on cards; next slide built a frame ahead | `contain: layout style` is on cards and menus (`styles/app.css`). One-transform card motion and the one-frame-ahead build: not verified. |
| A5 | Endoscopy field in the chart pool's context | Built (`endo-gl.js` draws in the pool; no context of its own). |

Notes kept from the plan for A2: the GL code should read looks only from the store and the theme table, never per element from the DOM;
the DOM keeps a thin accessible tree (one `<g role>` with `aria-label` per focusable vessel and label, no geometry). Steps: theme table,
organs, overlays, labels, vessel hit testing, drop the SVG geometry. The first two are done.

## Part B. Fewer GPU contexts and fewer full-screen passes

| # | Item | Status |
|---|---|---|
| B1 | From 8 contexts to 2 | Built. `docs/gpu-two-contexts-plan.md`; `tests/gl-contexts.test.js`. |
| B2 | Draw straight to the canvas, no kept-picture copy | Partly. The renderer keeps its picture in its own texture and copies it whole to the canvas (`keep-screen.js`), and `directNow` paths exist in `veins-gl.js`. A comment of 8 Nov (Mohammad's Mac) still reads "present copy 33 ms" as the cost. Whether motion frames now draw straight: not verified. |
| B3 | Render scale that follows motion | Built as an option, off by default: Settings figure option `move` (share while the view moves: 100, 75, 50, 25%; `FIG_OPTS` in `frame.js`). |
| B4 | One glass loop for the three glass instances | Open. `glass-gl.js` still has three kinds (`glass`, `glass-pane`, `glass-cards`). |
| B5 | Organ layer textures from a pool, none allocated mid-motion | Not verified. |

## Part C. CPU work to the floor

| # | Item | Status |
|---|---|---|
| C1 | Blood flow and pulse in the shader, not uploaded each frame | Open. No time uniform drives the flow; `setTubes`, `setFlow` and the radii writes remain in `veins-gl.js`. |
| C2 | Nothing at rest | Partly. The idle rest after 30 s with no input (`idle-rest.js`); the flow rate at rest is held at the motion rate (60) since 4 Nov because the 30 Hz step read as a flicker on Mohammad's Mac (`frame.js` `FRAME_GAP_MS`). The lobule's calm blood is capped at 30 Hz (`calmFlowGapFor`). |
| C3 | One label solve per motion | Not verified (landing solve exists: `stage-label-solve.js`). |
| C4 | 120 Hz only when it pays | Built: `frameRateFor(reason)` and `frameGapFor(reason)` in `frame.js` ('hand' at the screen's rate, 'glide' 60, 'flow' 30 nominal, 'still' 0; Battery saver 15). |
| C5 | Per-frame surface callbacks on state, not on frames | Not verified. |

## Order that was planned

Labels in a switch (A1), draw straight (B2), flow in the shader and nothing at rest (C1, C2), cards by one transform (A4), motion render
scale (B3), label solve and rate governor (C3, C4), glass and organ pools (B4, B5), chart display lists (A3), two contexts (B1), scene
store (A2), callbacks on state (C5). Of these the open ones that matter most for heat and fill are C1 and the B2 check.
