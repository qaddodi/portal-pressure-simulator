# Pure GPU, least CPU, least GPU: the plan

Written 4 Nov 2026 from the Safari ?perf readout of preview c4e95eed (2x Mac, slide changes #10 and #9 in the circuit, view switch #3 in
anatomy) and from reading the code at 2e44012. It leaves out the work already under way:

- one present a frame (done, 2e44012);
- chart glides inside svg-gl with no `path d` writes (agent running);
- vessel morph without whole re-binning or whole setGeometry uploads (agent running);
- the overlay group, the one label mark, and the Doppler/endoscopy readout rows (agent running).

The goal has three parts:

1. **Nothing drawn by the browser** that the figure, labels or charts need. Today every pixel of those is WebGL. What is left is the
   *model* behind them: an SVG/HTML tree that the CPU reads and writes, and the browser restyles.
2. **CPU work near zero in motion.** A frame of a glide should be a few uniform writes and draw calls, and nothing else.
3. **GPU work near zero at rest, and small in motion.** This is a 2D picture. It should cost about what a video player costs,
   and run cool on a fanless MacBook and an iPhone.

The cost targets, per frame in motion on the 2x Mac:

| | readout now | target |
|---|---|---|
| script | 10 to 90 ms | under 4 ms |
| page busy (style, layout) | 10 to 200 ms | under 2 ms |
| GPU copies | 31 to 62 MB | 0 MB (draw straight to the canvas) |
| uploads | 50 KB to 3 MB | under 20 KB |
| style and layout reads | about 100 | 0 |
| DOM writes | 50 to 140 | under 5 (only the a11y text) |
| at rest | flowing blood redrawn every frame | nothing drawn, or 30 Hz for flow only |

---

## Part A. Move the last things onto the GPU

### A1. The 14 labels that fall back to SVG during a view switch (first)
In #3 the readout says "labels (8 of 22 labels on the GPU)". So during an anatomy view switch, 14 labels are drawn by the browser
as SVG text. That is the biggest visible fallback left, and it is also why the switch shows `svg:tspan children 204`, `svg:tspan style 173`
and `svg:g style 431` writes. The labels are restyled and re-laid as SVG text while they fade.
- **Where:** label-gl.js `counts()` (c.svg), and the host-mode hand-back in label-gl.js about line 1001 ("Every label, mark and the probes given
  back to the SVG (host mode, while the labels may not be drawn over the figure)"). Also the switch code in stage.js that releases host mode.
- **Fix:** never hand labels back to the SVG while switching. Keep them in label-gl and fade them with the label-gl alpha
  (V-SLIDE / the switch rules already ask "labels ready at landing, fade in"). Make the SVG label text `visibility:hidden` for good under gl-on.
- **Size:** medium, 1 day. **Saves:** the tspan writes and about 30 to 60 ms of page busy in the switch frames.

### A2. The figure's scene model leaves the DOM (largest job, after the stage.js split)
`<svg id="stage">` and `<svg id="labels">` (index.html:126) are still built as real SVG (util.js `createElementNS`). Under gl-on they are not
painted, but they are still styled, laid out and read:
- organ-paint.js `readGroup` reads each group's computed style (`getComputedStyle`) to learn its look;
- the overlays are read the same way (stage.js syncOver, over-records.js);
- label positions, `getBBox` and `getBoundingClientRect` calls feed the label solve;
- every class change on `.app`/`section` (lit terms, the patient, the theme) restyles the whole SVG tree. That is a large part of the
  "page busy" 60 to 200 ms frames.

The readout shows 5,112 to 6,874 style and layout reads in 3 s, all from one function. The GL code reads its looks from the DOM.
- **Fix:** a typed-array scene store (`scene-store.js`). It holds, for each vessel, organ, overlay and label: geometry (Float32Array), paint
  (fill, stroke, width, alpha as numbers), transform, and lit/dim state. Builders write to the store instead of to SVG attributes. Looks come
  from one JS theme table (`theme-tokens.js`), made from the CSS variables once per theme change, never per element. The GL renderers read only the
  store. The DOM keeps a thin accessible tree only: one `<g role=...>` with `aria-label` per focusable vessel and label, holding no geometry.
- **Steps:**
  1. theme tokens table;
  2. organs read from the store, not readGroup;
  3. overlays;
  4. labels;
  5. vessels' hit testing from the store (it already has the geometry);
  6. drop the SVG geometry.
- **Size:** large, 4 to 6 days. Do it after the stage.js split lands, inside the new modules. **Saves:** all style reads, most page busy, and
  the "picture: whole" rebuilds that come from a class change.

### A3. Chart models: no hidden DOM at all
svg-gl draws charts from a hidden HTML model (`svgModel`, svg-gl.js:30). The glide agent removes the per-frame writes. The model itself is still
built as DOM elements for every slide, and each piece's look is read from computed style ("each piece's look is read once, as a drawing is
placed"). In #3, svg-gl script takes 30 to 143 ms in frames with no glide, so placing a drawing is the cost.
- **Fix:** builders (tool-*.js, talk-trace.js, timeline.js, flow-time.js) emit a plain JS display list (`{tag, attrs, kids}` objects) instead
  of elements. Looks resolve from the theme tokens table (A2 step 1) by class name. The model is flattened once into GPU buffers at build
  time. The accessible text (the chart's title and values) becomes one hidden `<p>`.
- **Size:** medium-large, 2 to 3 days (about 12 builders, all through `sv()`, so mostly one change in svg-gl.js and svg-morph.js).
  **Saves:** the 30 to 143 ms svg-gl placing frames, and the DOM churn of a slide change.

### A4. The card and slide text
Cards, menus, the dock and buttons are HTML. The browser draws them on its own GPU compositor, and their glass is ours. **Recommendation: keep
them HTML.** Moving them to GL text loses text selection, find-in-page, zoom, VoiceOver and inputs. What must change is how they move:
- Card motion writes `section style` 228 to 247 times and `div class`/`section class` 56 to 75 times in 3 s. Each write restyles a subtree.
- **Fix:** move every card with one compositor-only property, a `transform` on one wrapper, set through a CSS custom property on the card. Put
  `contain: strict` (or `layout paint style`) on every card and sheet, so a card's change never restyles the figure or the other cards. Build
  the next slide's card content one frame ahead in a `content-visibility:hidden` holder, so the swap is a class flip, not a build.
- **Size:** medium, 1 to 2 days. **Saves:** most of the remaining page busy on a slide change.

### A5. Endoscopy field shading
instruments.js / endo-gl.js shade the field "once per state" and lay it with the GPU drawer. It is made with `getContext('webgl')` (WebGL1), a
context of its own. Fold it into the charts' shared context (trace-gl) as one more program (see B1). **Size:** small.

---

## Part B. Fewer GPU contexts and fewer full-screen passes

### B1. From 8 live contexts to 2 (second)
The readout shows 8 live WebGL contexts: veins-gl (figure), label-gl, trace-gl (charts), doppler-gl, fibroscan-gl, endo-gl, res-cover-gl,
sinusoid or lobule. Each context has its own canvas, so the compositor blends one more full-screen layer each frame. Each also duplicates
textures (atlases, noise) and shader programs.
- **Fix:** one context for everything over the figure (the veins-gl context already hosts the glass and, shared, the lobule and sinusoid).
  label-gl already has a host mode. Make host mode the only mode. Charts, Doppler, FibroScan and endoscopy share the trace-gl context: one
  canvas for every card's drawings, scissored per card, the way the glass already draws per card into the figure's canvas.
- **Target:** 2 canvases, the figure and the cards' drawings. **Size:** medium-large, 3 days. **Saves:** 4 to 6 full-screen composites a
  frame, and about 100 to 200 MB of GPU memory.

### B2. Draw straight to the canvas, with no kept-picture copy
Even with one present a frame, each present copies the kept picture (31 MB at 3840×2230) onto the canvas, because the canvas is made without
`preserveDrawingBuffer`. "Whole picture in 36 of 49 frames": most motion frames redraw everything anyway.
- **Fix:** when the frame redraws the whole picture, draw it straight onto the canvas. The `directNow` path in veins-gl.js already exists, so
  find why "composite build: plain" never takes it in motion. Keep the kept texture only for row redraws at rest. With A2 done, the glass's
  copy reads the canvas texture in the same pass.
- **Size:** small-medium, 1 day. **Saves:** 31 MB a frame of GPU bandwidth, the single biggest GPU cost left.

### B3. Render scale that follows motion
The canvas is 3840×2230 (8.5 MP, "8.0 MP budget"). In motion the eye cannot see 2x detail on blood, streaks or organ fills.
- **Fix:** while the camera or a morph moves, draw the vessels, blood and organs at 0.67x into a smaller target and scale up in the present
  (it already scales for "up"). Draw sharp again in one frame at rest (the refinement step exists). Labels and lines stay at full scale,
  because they are drawn by label-gl.
- **Size:** small-medium. **Saves:** about 55% of fill in motion frames, which is most of "waiting (GPU/screen)" 20 to 40 ms.

### B4. Glass blurs: one, at low resolution, cached
Three glass instances (glass, glass-pane, glass-cards) each run a callback every frame (87 to 167 in 3 s). blur-share already shares one
blur per look.
- **Fix:** blur at 1/4 scale always, since a 20 px blur hides it. Re-blur only when the figure under a card changed (the version check
  exists) or the card moved more than 2 px. Merge the three instances into one glass loop with a list of panes.
- **Size:** small-medium. **Saves:** 3 callbacks, and about 2 blur pyramids a frame.

### B5. Organ layers and GPU room
The view switch made 71 MB of GPU room in 107 allocations and rendered organ layers ×8. Allocating textures mid-motion stalls Safari.
- **Fix:** allocate organ layer textures once at the largest size, from a pool, and re-use them across switches. Pre-render the next view's
  layers in the free moments before the switch (the refine queue). Never allocate inside a motion.
- **Size:** small-medium.

---

## Part C. CPU work to the floor

### C1. Blood flow and pulse in the shader, not uploaded (third)
At rest and in motion, every frame uploads `setTubes` (49 KB), `setFlow` (17 to 19 KB), `setLines` (118 KB) and `setRadii` (×174 small calls in #10).
The CPU steps the flow animation and sends it.
- **Fix:** upload the flow field once per state (pressures and rates). Move the time step into the shader: a `uTime` uniform, with the
  phase per tube computed on the GPU, so the shader does `offset = fract(phase + uTime * speed)`. Batch radii into one texture write per
  frame (`texSubImage2D` of the changed rows), not one call per vessel.
- **Size:** medium, 1 to 2 days. **Saves:** about 200 KB of uploads and 2 to 5 ms of script a frame, every frame, including at rest. This
  is the main heat source at rest.

### C2. Nothing at rest
"Still lumens left alone: off". When nothing moves, the figure is still drawn every frame, because the blood flows.
- **Fix:** with C1, a frame at rest is one draw of the blood layer over a kept still layer: no script, no uploads. Cap that at 30 Hz
  (the flow reads the same), and stop entirely when the tab is hidden or Battery saver is on. Turn "still lumens left alone" on by default.
  Every other surface (glass, labels, charts, credit poll) sleeps until an input or a state change wakes it.
- **Size:** small once C1 is in. **Saves:** most of the heat with the app open and untouched.

### C3. One label solve per motion, not per frame
label solve runs 26 to 37 times in 3 s, label-captions 37 to 61, labels-gl 29 to 45. Labels ride the camera on the GPU already, and the solve
only needs to run when the set of labels or the zoom band changes.
- **Fix:** solve once at motion start for the landing camera (presolve exists). Ride the camera on the GPU during the motion. Solve again
  only at landing if the result differs.
- **Size:** small.

### C4. 120 Hz only when it pays
Frame pacing asks for every refresh. On ProMotion that is 120 Hz of all the above.
- **Fix:** 120 Hz while a finger or trackpad drives the camera, 60 Hz for glides the app runs itself (slide changes, view switches), 30 Hz
  for flow at rest, 0 when still. One governor in frame.js, `frameRateFor(reason)`.
- **Size:** small.

### C5. Per-frame surface callbacks
#9 ran 30 kinds of frame callbacks in 3 s (stage-home, stage-organs, stage-labels, card update, dock update, inspector update, timeline update,
frame chrome, credit, card-throw, fps-counter...). Many run every frame of a motion and find nothing to do.
- **Fix:** each subscribes to the one state it shows (an event), and asks for a frame only when that state changes. Retire "update" fan-outs
  that touch the dock, inspector and timeline on every frame of a slide change. They change once, at the slide's start.
- **Size:** medium, spread across files. Do it inside the stage.js split, one module at a time.

---

## Order

| # | item | size | why first |
|---|---|---|---|
| 1 | A1 labels stay on GPU during a view switch | 1 d | visible fallback; worst switch frames |
| 2 | B2 draw straight to the canvas | 1 d | biggest GPU cost left |
| 3 | C1 + C2 flow in the shader, nothing at rest | 2 d | heat at rest |
| 4 | A4 cards move by one transform, contained | 1.5 d | page busy on slide change |
| 5 | B3 motion render scale | 0.5 d | GPU fill in motion |
| 6 | C3, C4 label solve once, frame-rate governor | 1 d | script and heat |
| 7 | B4, B5 glass and organ layer pools | 1 d | GPU memory and stalls |
| 8 | A3 chart display lists, no DOM model | 2.5 d | svg-gl placing cost |
| 9 | B1 two contexts | 3 d | composite layers, memory |
| 10 | A2 scene store, the SVG tree retired | 5 d | the last DOM in the figure; after the stage.js split |
| 11 | C5 callbacks on state, not frames | spread | with the split |

Items 1 to 7 touch separate files and can run in parallel, two at a time: 1 with 3, 2 with 4, 5 with 6. Items 8 to 11 change shared
structure, so they should run one after another.

## How each is checked without a device
Each step is judged on the ?perf readout lines it names: "on a fallback", "copies: kept picture onto the canvas", "uploaded", "style+layout
reads", "DOM writes", "page busy", and the frame interval histogram. A step is done when its line drops to the target in the table at the top.
