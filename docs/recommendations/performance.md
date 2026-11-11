# Performance recommendations

**Status (11 Nov 2026).** A dated review (8 Nov 2026, line numbers of 2bde649). Much of Part A (the figure's present) is stale: the vessel pass is now the Tube (`docs/tube-renderer.md`), the Mesh path it measured is deleted, and `veins-gl.js` has changed.
- Built, from code evidence: A1 switch 2, the one present a frame (`PRES_FOLD` in `veins-gl.js` is now `true`; at 2bde649 it was `false`); `invalidateFramebuffer` calls exist in `veins-gl.js`, `tube-pass.js`, `organs-gl.js`, `paint-gl.js` and `keep-screen.js` (A2 partly; which passes are covered is not verified); `trimDeep` exists in `organ-paint.js` (D2 partly, not verified).
- Still open, from code evidence: A1 switch 1 (`preserveDrawingBuffer: KEEP_CANVAS` is still in `veins-gl.js`).
- Not verified: every other item. Items about the Mesh's passes and draw buffers (A2 to A5 as they apply to the Mesh) are superseded by the Tube pass, which sets its draw buffers once. `docs/PERFORMANCE.md` is the current performance document.


Thread "Recommend performance improvements", 8 Nov 2026. Read from `claude/settings-topbar-icon-flvft1` at `2bde649`.

These are recommendations only. No app code was changed. The owner's rules hold throughout: every fix stays on the GPU (no canvas 2D,
SVG or CPU pixel path is proposed anywhere), and nothing was run in a browser. What was run: `npm run build`, `npm run warm`
(allocation profile), `scripts/off-gpu-scan.mjs`, and node benchmarks of the engine and the boot path. A number marked
"measured" comes from those runs in this sandbox (a phone is roughly 2 to 4 times slower). Every other number is arithmetic from
the code and the screen sizes. None of them is a device timing.

## Reference sizes

| Device | Canvas | Figure picture | One RGBA8 copy |
|---|---|---|---|
| iPhone Pro Max (DPR 3) | 1320 x 2868 = 3.79 MP | 880 x 1912 = 1.68 MP (drawn at 2x, upscaled at present) | 15.1 MB canvas, 6.7 MB picture |
| MacBook Pro 14" (DPR 2) | 3024 x 1964 = 5.94 MP | same as the canvas | 23.8 MB (16": 30.9 MB) |

Steady blood motion is drawn at 60 a second (`FIG_LAB.motion60` is on, `frame.js:697`). Pans and pinches run at the display's rate, so
120 a second on ProMotion. At rest nothing presents.

Rough fixed GPU memory traffic for one blood frame, summed from the surfaces it touches: about 95 to 100 MB on the iPhone (about 6 GB/s at
60 Hz) and about 200 MB on a 14" Mac (about 12 GB/s). Most of the savings below are slices of that figure.

## The short version

The model, the scheduler and the per-tick main-thread path are already lean. The remaining cost is mostly GPU memory traffic in the
figure's present, and most of that comes from four safety switches left on after the 4 Nov flicker chase. The cheapest wins are:

- seven small, exact GPU changes (invalidate before whole overwrites, one present per frame for overlays, scissors, cheaper glass);
- three memory trims that give back about 65 MB on the iPhone in the lobule;
- the chart "still layers" put back on the GPU (they quietly stopped caching on 1 Nov);
- a faster preset load for decks (the day step's settle runs a fixed 10 steps when 3 or 4 are enough).

### Ranked list

Impact is per-frame GPU traffic, frame time or memory, as stated in each item. Effort: S is under a day, M a few days, L a week or more.

| # | Recommendation | Area | Impact | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Invalidate a target before a pass overwrites all of it (A2) | GPU | High: 22 MB per present on iPhone, 48 MB on Mac | S | Low |
| 2 | Overlays: one present per frame, render before the canvas pass, scissor the camera lay (A3, A4, A5) | GPU | Medium-high on catheter, balloon, stent and coil frames | S | Low |
| 3 | Glass shader: drop shadows only outside the card (A6) | GPU | Medium; exact | S | None |
| 4 | Memory: free the tier targets, `half` and the lobule's `scr` in `trim()`; wire `trimDeep`; stencil-only depth in paint-gl (D1, D2, D4) | Memory | About 65 MB on iPhone and 210 MB on Mac in the lobule | S | Low |
| 5 | Chart still layers back, on the GPU, with `keepLayer` (B1) | Text/CPU+GPU | 40 to 100 pen calls a frame saved on the dock chart and beat card | S-M | Low |
| 6 | Remove the four flicker-chase safety switches, one per push (A1) | GPU | Highest in total: 30 to 70 MB per frame on iPhone, 50 to 120 MB on Mac | S each | Medium |
| 7 | Settle each disease day until it has converged, not a fixed 10 steps (C1) | Model | Preset and deck prep about 2x faster (83% of a load is this loop) | S-M | Medium (results move about 1e-6) |
| 8 | Morph and slider frames wait for the paint acknowledgement (C4, C5) | Model/CPU | 33 to 61 frames a second down to what the page can paint | S | Low |
| 9 | Start the engine worker and build the stage at the same time at boot (E1) | Load | 50 to 150 ms off a phone's first figure (inferred) | S-M | Low |
| 10 | Label value change: build each glyph mesh once, not twice (B2) | Text/CPU | Half the mesh work and garbage of every label repaint | S | Low |
| 11 | No forced style flush in the present: the tooltip's `getAnimations()` per present (B3) | CPU | One style recalc a frame avoided while menus show | S | Low |
| 12 | Each glass look reads the canvas back once per frame, not once per look (A7) | GPU | 60 MB (iPhone) or 95 MB (Mac) per reblurred frame | M | Low-medium |
| 13 | Repeated preset loads in deck chains reuse a snapshot (C2) | Model | About 1.4 s of worker time off the encephalopathy deck's prep here (3 to 5 s on a phone) | M | Medium (1e-5 drift) |
| 14 | Lobule painter shadows: scissored blurs, one MSAA pass per tile (A9) | GPU | Up to 0.4 to 0.8 GB of traffic per cirrhotic tile repaint in a dive | M | Low |
| 15 | Each chart's bitmap is its own size, not the pool buffer's (D3) | Memory | About 48 MB on iPhone with 10 charts | M | Medium |

The rest (A8 to A14, B4 to B9, C3, C6, C7, D5 to D8, E2 to E6) are in their parts below. Part F lists docs that now mislead perf work.

---

## Part A. GPU draw cost

### A1. The four 4 Nov flicker-chase safety switches are the largest cost left (high impact, S each, medium risk)

On 4 Nov, chasing the figure flicker, four speed changes were taken out or reversed in one day. The cause found that day
(35efddd: a resize cleared the figure for passes that showed nothing) is fixed, and its guard is in (`veins-gl.js:3148`). The switches
are still on.

| Switch | Where | What it costs now |
|---|---|---|
| The canvas keeps its picture (`preserveDrawingBuffer: true`; e846225, then b80f47e reverted its revert) | `veins-gl.js:1968` | WebKit copies the drawing buffer at each composite instead of swapping, and holds one more canvas-sized buffer. iPhone: about 30 MB a frame (1.8 GB/s at 60 Hz) and 15 MB of memory. Mac: about 48 MB a frame (2.9 GB/s at 60 Hz, 5.7 at 120) and 24 MB. |
| One present a frame is off (`PRES_FOLD = false`, 38c96ea) | `veins-gl.js:3114` | A label glide asks its host to present (`label-gl.js:1106-1113`, `:1520`, then `stage.js:2151`) before the stage presents again. Each extra present is about 67 MB on iPhone and 119 MB on Mac. |
| Whole pictures go through the kept one while blood flows (7f18ed3 took c060dcb out) | `veins-gl.js:4425` `bloodOk = !blood.on` | Mac and iPad only (the iPhone upscales anyway): every blood frame writes the kept picture and then copies it, 48 to 71 MB more a frame. |
| The blood's clock is back in the still-lumens signature (225c4e0 took 3c63d68 out) | `veins-gl.js` near 4549 | Lumens whose vessels did not change are no longer skipped while blood flows, so every lumen runs the full composite shader each blood frame. The share needs a GPU capture to size. |

**Fix.** One switch per push, so any one can come back alone if the flicker does:
1. A narrow fold first: only the top-host asks (labels, glass) wait for the frame's end, and only if `presents` has not moved since the ask. The figure's own present stays immediate, which was 38c96ea's concern.
2. Still lumens while blood flows (the 3c63d68 part of 225c4e0).
3. B2 direct whole pictures with blood, keeping `!up && !camOn()`.
4. `preserveDrawingBuffer: false` last. Every present already lays the kept picture whole (`veins-gl.js:3207-3215`), and readers outside the frame call `capture()`.

A node stage-trace of the HVPG slide's resize sequence can confirm before step 4 that no present runs without laying the kept picture.

**Confidence:** the switches and their history are checked in code and git; the copy costs are inferred from WebKit's documented behaviour.

### A2. Invalidate a target before a pass overwrites all of it (high, S, low risk)

- **Where:**
  - the canvas before the whole blit or upscale (`veins-gl.js:3209-3212`);
  - the kept picture before a full composite (`veins-gl.js:4644`);
  - the organ stack before the pan reprojection (`organs-gl.js:584`);
  - the reuse target `rz`.
  The only invalidate in the figure is the stencil one after fused frames (`veins-gl.js:4643`).
- **Now:** on Apple GPUs a render pass loads its target's old contents unless told not to. Each of these passes then overwrites every pixel.
- **Impact:** per present, 15.1 + 6.7 = 21.8 MB on iPhone (1.3 GB/s at 60 Hz) and 47.6 MB on Mac (2.9 GB/s, 5.7 GB/s on a 120 Hz pan). The stack adds 6.7 MB (iPhone) or 23.8 MB (Mac) per pan frame.
- **Fix:** right after binding each target, `invalidateFramebuffer` on its colour (`COLOR_ATTACHMENT0` for an FBO, `gl.COLOR` for the canvas), only when the pass is `full`. Dirty-row composites must keep their load. Invalidating the canvas is valid with or without the preserve flag, because the whole canvas is laid before the tops.
- **Confidence:** the missing calls are checked. That ANGLE's Metal backend turns them into a "don't care" load is inferred; a Metal System Trace on the Mac confirms it.

### A3. Overlay frames present twice (medium-high, S, low risk)

- **Where:** `stage.js:2730` presents whenever the overlay is stale (`veins.overlay.stale`, a getter, `veins-gl.js:4270`). Later in the same frame, `stage.js:2763-2764` presents again through `drawVeins` or `composite` whenever the figure or the blood also moved.
- **When:** every catheter, balloon, stent and coil ease, and every camera frame while overlays show. The shared overlay stack does not reproject (`organs-gl.js:182`, `moves = !shared`), so it is stale on each of those frames.
- **Impact:** one extra whole present per such frame: about 67 MB on iPhone, 119 MB on Mac.
- **Fix:** move the overlay-only present after the draw, and skip it when `veins.top.presents` already moved this frame.

### A4. The overlay's re-render splits the canvas pass (medium, S, exact)

- **Where:** `overLay()` (`veins-gl.js:3321-3325`) calls `over.render` after the canvas has been bound and blitted. The painter's per-op FBO binds (`organ-paint.js:1092`, `:1114`) then store the canvas and load it back mid-present.
- **Impact:** about 30 MB (iPhone) or 48 MB (Mac) per stale frame.
- **Fix:** call `over.stale`/`over.render` before the canvas is bound at `veins-gl.js:3209`. The lay itself stays where it is.

### A5. The overlay's camera lay is not scissored (medium, S, low risk)

- **Where:** `veins-gl.js:3326`. `camDraw(over.texture, true)` returns before the bounds scissor below it.
- **Now:** under any camera, fade or scene zoom (glides, the dive, a card zoom), the overlay is a full-canvas blended draw: 3.79 MP on iPhone, 5.94 MP on Mac. `over.bounds` is usually a small strip.
- **Fix:** map `over.bounds` through the camera transform `camDraw` already uses, scissor to it plus 1 px, and skip the draw when the box is empty.

### A6. The glass shader works out drop shadows inside the card, where they are never used (medium, S, exact)

- **Where:** `glass-gl.js:326-330` evaluates `d0` and `d1` (rounded-box shadow covers) for every fragment. Line 347 weights them by `(1 - m)`, which is 0 wherever the card covers the pixel.
- **Impact:** two rounded-box shadow evaluations per interior pixel on every present. A card over 40% of the iPhone canvas is 1.5 M fragments. This is shader arithmetic, not bandwidth; GPU counters size it.
- **Fix:** compute `d0`, `d1`, `sa` and `sc` only when `m < 1.0`. The output is identical. The branch is coherent, because interior pixels come in large blocks.

### A7. Each glass look reads the canvas back on its own (medium, M, low-medium risk)

- **Where:** `runShare` runs per look at its draw turn (`glass-gl.js:1259-1311`, `drawInto` near 1331). Each halving chain starts with a blit from the canvas (`READ_FRAMEBUFFER null`, `glass-gl.js:1116-1124`).
- **Now:** callout, pane and card looks each split the canvas pass on every reblurred frame (every third frame at `FROST_EVERY 3`, plus the `REBLUR_MS` windows).
- **Impact:** two avoidable splits: about 60 MB on iPhone, 95 MB on Mac per reblurred frame.
- **Fix:** at the first glass turn, read the canvas once into one downsampled level, and build every look's chain from it. This is exact unless one look's blur reach (16 or 32 px) covers another look's pane. Cards that overlap callouts already go to the browser's glass.

### A8. The kept picture's stencil is attached for every pass (low-medium, S, low risk)

- **Where:** `veins-gl.js:3094-3099` attaches `STENCIL_INDEX8` to `own.fbo` for good. Only fused frames invalidate it (`:4643`).
- **Impact:** if it is loaded and stored, 3.4 MB (iPhone) or 11.9 MB (Mac) per pass into the kept picture.
- **Fix:** either two FBOs over `own.tex` (colour only for ordinary frames, colour and stencil for fused ones), or invalidate `STENCIL_ATTACHMENT` at bind and at the end of each pass. This is the open P5 of the 5 Nov review.

### A9. Lobule painter shadows: full-tile blurs and an MSAA switch per op (medium on dives, M, low risk)

- **Where:** `paint-gl.js:1002-1040`. Each shadowed op runs three passes:
  - coverage into `s.a`;
  - a blur across the whole tile into `s.b`;
  - a blur down the whole tile into the 4x MSAA target.
- **The blur loop:** up to 96 taps a side, each with its own `exp()` (`paint-gl.js:679`). The blurs are not scissored to the op.
- **The MSAA cost:** each op leaves the 1024² 4x MSAA target and re-enters it. That is about 32 MB stored and 32 MB loaded each time.
- **Impact:** `lobule-paint.js:328` casts about 6 to 12 shadows per cirrhotic tile, so about 0.4 to 0.8 GB per tile repaint.
- **Fix:**
  - Scissor both blur passes to the op's box plus its reach.
  - Use precomputed weights and paired bilinear taps: half the fetches and no `exp`.
  - Render all of a tile's shadow masks first, then bind the MSAA target once and draw the ops in order, each sampling its own mask. The order is kept, because each mask depends only on its own op.

### A10. Chart strokes take two passes each (low-medium, M, exact)

- **Where:** `trace-gl.js:936-948` (stroke) and `:657-668` (outline). Each is a coverage pass with MAX blend, then a lay pass, so an N-stroke chart takes 2N passes.
- **When:** slide entry and chart animation.
- **Fix:** batch up to four consecutive strokes' coverage into R, G, B and A with `colorMask` and per-channel MAX. One lay pass then composites them in stroke order, so about N/2 passes.

### A11. Fold the pan reprojection into the composite (medium on pans, M-L, medium risk)

- **Where:** `organs-gl.js:575-602` draws a full-screen reprojection into the stack texture, which the composite shader then samples.
- **Impact:** about 13 MB (iPhone) or 48 MB (Mac) of extra write and read per pan frame.
- **Fix:** on camera-only frames, sample the last exact stack texture through the move transform (one `mat3` uniform) inside the composite. Check the free texture units first.

### A12. Three shaders still compile on first use (first-use hitch, S, none)

- **Where:**
  - `CAM_FS`, the first glide (`veins-gl.js:3374`);
  - `LAYT_FS`, the first lobule (`:3400`, `:4240`);
  - the glass fill kit, the first callout (`glass-gl.js:432`), whose status is checked straight after link.
- **Fix:** add them to the warm set after the first present (`AUX_FS`, `veins-gl.js` near 2122), polling `COMPLETION_STATUS_KHR` where `KHR_parallel_shader_compile` exists. This is the open P6.

### A13. The organ painter switches framebuffers twice per op (P2, measure first)

- **Where:** `organ-paint.js:1092`, `:1114`. This is still open.
- **Why measure first:** the 6 Nov notes found that liver and spleen ops mostly overlap and share clips, so disjoint-box batching would rarely apply.
- **What to read:** a `?perf` read of `pps.budget().frame.targets` during a liver ease shows whether it is worth more than A4.

### A14. `mediump` on colour-only passes (needs a device check)

- **Now:** every figure shader is `highp`. Apple GPUs run half precision at about twice the rate.
- **Candidates:** the present's upscale, the glass `PFS` colour maths and the overlay lay.
- **Check:** look for banding on a device before keeping it.

---

## Part B. Text, charts and per-frame CPU

All text is on the GPU already: no canvas-2D text, and no text uploaded from a canvas anywhere (`docs/off-gpu-inventory.md`: ctx2d 0). Label
zoom and pan repaint nothing. A label repaints only when its rounded value changes (`stage-label-items.js:73-76`). The scheduler is
allocation-free and times callbacks one frame in 30. What is left:

### B1. The chart "still layers" no longer cache anything (S-M, low risk; regressed)

- **Where:** `still-layer.js:11-21`. `lay()` is now `ctx.save(); build(ctx); ctx.restore()`. The 1 Nov "nothing off the GPU" change took out the 2D picture and the cache with it.
- **Callers:** `pressure-time.js:600` (the beat card) and `:963` (the dock and slide chart). `vitals-monitor.js` no longer uses it and rebuilds its rect and text lists on every draw, `textWidth` included.
- **Now:** every drawn frame of a scrolling chart redraws the panel, every lane's grid and tick numbers, the HVPG cut-off lines and names, and on the beat card every digit with its own `measureText` and `fillText` (`pressure-time.js:491-495`, `:737-777`). That is 40 to 100 pen calls a frame, each building strings and 18-float glyph records.
- **Impact:** about 0.1 to 0.4 ms of script a frame (higher on iPhone) plus the GPU draws, for as long as the dock chart is open.
- **Fix:** the GPU version of the cache already exists. `keepLayer(ctx, name, sig, draw)` (`trace-gl.js:42`) renders into a texture only when `sig` changes and otherwise lays one quad. Doppler (`doppler.js:1196`) and FibroScan (`fibroscan.js:255`) use it.
  - Give the Pressure chart, the beat card and the vitals panel a version counter, bumped by a field-by-field compare (the `stillKey`/`keyNow` pattern in `stage.js`, never JSON). The printed strings go into the key.
  - The cost is one texture per card: about 2.9 MB at DPR 3 for a 360 x 220 card. The pool allows four layers per context.
- **Tests:** `tests/still-layer.test.js` compares drawing calls and still passes, which is why the regression went unseen. It should also assert that the second identical frame draws nothing new.

### B2. A changed label value builds every glyph mesh twice (S part, L part, low risk)

- **Where:**
  - `refresh()` (`label-gl.js:1200-1300`) paints split pictures with `paintSlot(blockOps(..., 1))` and then `paintSlot(blockOps(..., 2))` (`:1275`).
  - `blockOps` (`:672`) calls `textPolys` per run on every call, which allocates a new `Float32Array` per glyph polygon.
  - The painter's mesh cache keys a polygon by its object (`organ-paint.js:905-922`, `key = geom`), so the second call always misses.
- **Impact:**
  - Nothing at rest.
  - During an infusion, a bleed or a time-lapse, 10 to 30 values change a second, which means 20 to 60 slot paints a second, each with a full CPU mesh build.
  - A burst of `REBUILD_LEAST = 12` labels is 24 paints in one task, about 4 to 10 ms on a phone.
- **Fix (S):** build the run polygons once per `layBlock` result (keep them on `lay.lines[].runs[]`) and pass the same objects to both paints. The second paint then hits the mesh cache, so the mesh work and garbage are halved.
- **Fix (L):** a glyph sprite set per weight, size and halo. Paint each digit once into the atlas, then compose a changed number as instanced quads into its slot. Positions must stay on whole device pixels.

### B3. A forced style flush inside every present (S, low risk)

- **Where:** `menu-glass.js:62`. `live()` runs from `presentSelf` (via the `tops.some(soloOn ...)` test at `veins-gl.js:3164`, frame path per the scanner). It also does the following:
  - every 120 ms it runs `document.querySelectorAll(OTHERS)`;
  - on every call while the tooltip is not shown, it runs `tip.getAnimations()`.
- **Now:** `getAnimations()` flushes pending style first. Any class or style written earlier in the frame is therefore restyled mid-frame, and again at the browser's own style step after the frame's later writes.
- **Fix:** follow the tooltip the way the why-pop is followed. Its class and transition events are already observed in `listen()`, so the per-present read can go.
- **The same pattern elsewhere:**
  - `layer-alpha.js:26`, but only after a change, which is fine;
  - `glass-gl.js` `measureGeo` and `readPanes` (`:631`, `:692`, `:727-736`, `:1417`, `:1525-1585`).
- **The lint tie-in:** `scene-cam.js:43`, `menu-glass.js` and `layer-alpha.js` are the three files the scanner reports with direct reads and an allowance of 0. Nine files are over their layout-read allowance in all, which is the one thing `npm run lint` fails on.

### B4. `glWords` measures walk 12 ancestors with no memo (S, low risk)

- **Where:** `gl-words.js:171-183`, inside `measureReadNow`.
- **Now:** each readout made or resized reads up to 12 ancestors' computed style, plus a box read for each clipping ancestor. Shared ancestors are read again for every readout. A slide that makes about 40 readouts does up to about 480 style reads in one rest pass, often inside the slide change.
- **Fix:** a `Map` (element to clip rect, or null) per `measurePass`, cleared at the pass's end.

### B5. The label draw loop's lookups and attributes (S, low risk)

- **Where:** `label-gl.js:1553-1610`. Each label, each drawn frame: about eight `Map`/`Set` lookups (`live`, `exact`, `sprites`, `dirty`, `pending`, `todo`) and a `hasAttribute('data-gl')` with a read or write of the attribute.
- **Impact:** 60 to 100 labels at 60 Hz is about 0.15 to 0.3 ms a frame on iPhone (inferred).
- **Fix:** keep the `data-gl` state as a boolean on the label's record and write the attribute only when it changes. Skip a lookup when its set is empty.

### B6. The label instance buffer is re-specified every draw (S, low risk)

- **Where:** `label-gl.js:1648`, `bufferData(ARRAY_BUFFER, inst, DYNAMIC_DRAW, 0, ni * IF)`. Each drawn frame orphans the buffer's storage.
- **Fix:** allocate at capacity (doubling) and write with `bufferSubData`. In Safari each GL call is a message to the GPU process, and a re-specification is a heavier one.

### B7. A readout that changes in bursts paints three times (S, low risk; per-readout choice)

- **Where:** `gl-words.js:236-258`, `:325-331`.
- **Now:** each burst costs three steps:
  - `set()` paints;
  - 260 ms later `land()` writes the DOM text;
  - `release()` paints again to clear and waits for a hand-over.
- **Fix:** `keep: true` for readouts that stay on the GPU anyway, as 71f3fb1 and 403760f did for the header numbers. The header comment at `gl-words.js:21` still says nothing passes `keep`.

### B8. Garbage per model update is still about 165 to 190 KB (M, low risk)

- **Measured:** `npm run warm` gives 82 to 95 KB per frame for "60 Hz display, 30 Hz model", which is 165 to 190 KB per model update (jsdom adds some of it).
- **Top sites (bytes per frame):**
  - `updateInner` `stage-tubes.js:276`: 9.6 K
  - `syncVeinsNow` `stage-vessels.js:864`: 6.8 K
  - `tubeFill` `stage-tubes.js:701`: 3.8 K
  - `colPass` `stage-vessels.js:696`: 3.4 K
  - `stepBlood` `stage-blood.js:219`: 2.7 K, on every drawn frame
- **Impact:** about 1.8 MB/s at the 10 Hz model rate, so a young-generation collection about once a second. That is a minor-GC hitch risk at 120 Hz, not a steady cost.
- **Fix:** work down the `--profile` list, `stepBlood` first. `docs/off-gpu-inventory.md`'s 132 KB figure is stale.

### B9. GL-state wrappers on every call (P8; low value)

- **Where:** `gl-state.js:80-150`. Every bind and enable writes a `Map`, and every draw computes `area()` and calls the budget hook (`gpu-budget.js:92`), which is installed at load.
- **Impact:** about 15 to 80 µs a frame for 300 to 800 calls.
- **Fix:** small arrays in place of the `Map`s, and a counter bump with the area computed lazily.

---

## Part C. Model step and worker

- **Step cost (measured):**
  - The network is 40 nodes and 171 edges.
  - A 4 ms step costs 0.048 ms (healthy) to 0.055 ms (decompensated).
  - At 1x the worker uses about 44 ms a second, about 5% of a phone core. At 8x it uses 70 ms, about 20 to 28% on a phone.
  - The solve is 43% of a step.
- **Frame payloads (measured):** 8.5 KB at 1x and 18 KB at 4x, with the typed arrays already transferred.
- **Not worth doing:**
  - A SharedArrayBuffer needs COOP/COEP headers, which GitHub Pages cannot send.
  - A sparse solver would save about 8 µs of a 40 µs step.

The cost that matters is preparation: a chronic preset loads in 100 to 280 ms here (`cirr-decomp` 279 ms), so 300 to 900 ms on a phone.

### C1. Settle each disease day until it converges, not a fixed 10 steps (S-M, medium risk)

- **Where:** `settleQuick()` (`engine.js:924-928`) always runs `step(5)` ten times. `advanceDaySteps` (`:942`) calls it once or twice per simulated day.
- **Measured:** this loop is 83% of a preset load. After a day's slow step, the first 5 s step moves pressure by at most 4e-6 mmHg, and by step 4 by about 5e-7 or less.
- **Fix:** stop when the largest pressure change is under about 1e-6 mmHg *and* the reflex filters (`baro`, `habr`, `MAPf`, the vitals filters, with 10 to 15 s time constants) have also settled.
- **Impact:** preset prep, time jumps and deck `sequence` days about 2x faster or better.
- **Results:** they move by about 1e-6. Pin with `tests/fingerprint.test.js` and `tests/snapshots.test.js` and a before/after sweep of all 18 presets. The tolerance is the owner's medical call, which is why the risk is medium.

### C2. Deck chains load the same preset again and again (M, medium risk)

- **Where:** `sequence` and `presetMetrics` in `worker-core.js` (about 520 to 580) call `loadPresetSteps` each time a step names a preset.
- **Examples:**
  - encephalopathy loads `cirr-decomp` 5 times;
  - stiffness loads `cirr-comp` 5 times and `csph` 4 times;
  - choose-treatment loads `cirr-decomp` 4 times.
- **Impact:** about 1.4 s of worker time for encephalopathy's five loads here, 3 to 5 s on a phone, before the slides are ready.
- **Fix:** keep the post-load snapshot per (id, days, seed) and `restore()` it. All 18 snapshots total 105 KB.
- **Results:** a restore then settle differs from a fresh load by up to about 1e-5 relative (pv 22.46533 against 22.46525 mmHg). Agree the tolerance with C1, and build them together.

### C3. Each history request costs about 200 ms of model time (S, low risk)

- **Where:** `startHistory` (`worker-core.js` near 181). A 12 s window is 16 s of model time at 4 ms steps, which is 4,000 steps: about 200 ms here and 600 ms on a phone, interleaved with the live clock.
- **When:** every patient load and every time a recording instrument opens.
- **Fix:** cache the last result keyed on `gen`, `eng.t` and the params. Reopening an instrument on an unchanged state then costs nothing.

### C4. Morph frames skip the paint acknowledgement (S, low risk, outputs identical)

- **Where:** a morph sets `frameDirty = true` every 33 ms tick (`worker-core.js:312`). `frameDirty` passes the `due`/`unpainted` gate at `:358`.
- **Measured:** a 1.5 s morph posted 49 frames, 33 a second, against about 10 normally. That is every slide change. Each frame is cloned, queued and ingested (`dock.ingest`, trace samples) even when the page shows only the newest.
- **Fix:** while `ackOn && unpainted` and under `ACK_MAX_MS`, skip posting a morph frame. The morph is a function of time, so the next frame carries the right state. The params throttle (`MORPH_PARAMS_MS = 250`) stays.

### C5. A slider drag posts a frame per input event (S, low risk)

- **Where:** `drain()` (`worker-core.js` near 620) sends a frame after every mutation.
- **Measured:** a 60 Hz drag gave 61 frames a second.
- **Fix:** for `setParams` while unpainted, set `owed = true` and let `painted()` build the frame. The gain is mostly the main thread's ingest work.

### C6. Bit-identical engine trims (S, no risk, small payoff)

- **Where:** `tubeResistanceFactor` recomputes `tubeArea(refFrom, kd)` and `tubeArea(refTo, kd)` (two of its four `exp` calls per edge per `computeG`), and `computeG` can run up to three times a step (`engine.js` from 448).
  - `drugEffects()` and `heartState()` allocate objects every step.
  - `frame()`, `keepStill()` and `movedSincePost()` each loop all 171 edges through `eng.diameter(id)`, a string lookup.
- **Fix:**
  - Precompute the reference areas per edge end at construction.
  - Hoist `drugEffects()` out of the step.
  - Work out `D` once per tick into a kept `Float64Array`.
  - About 10% off a step. Pin with `tests/hemo-step.test.js` and `tests/engine-solver.test.js`.

### C7. The healthy reference is settled again by every `new Engine()` (S, check drift)

- **Where:** `engine.js:167-226`. Each construction runs two `settle()` calls (6.8 to 8.5 ms measured).
- **When:** `healthyProfile` at boot (19 ms measured including its metrics), every `restart` in `sequence`, the `explain` scratch engines and the history engine.
- **Fix:** compute the healthy reference once per worker. It is not bit-identical, because the reference settle also leaves the reflex filters evolved, so measure the drift first.

---

## Part D. Memory

There are two live WebGL contexts: the figure, and the chart pool (`gpu-budget.js` `CTX_MAX = 2`). Labels, glass, the lobule, the
sinusoid, ink and the instruments all draw inside those two. Nothing at screen size uses a float format.

Steady state, summed from the inventory below (inferred):

| State | iPhone | Mac 16" |
|---|---|---|
| Anatomy | about 200 MB | about 700 to 800 MB |
| A Present slide with cards | about 260 to 290 MB | about 800 to 900 MB |
| Lobule dive | 380 to 440 MB, counting up to 160 MB kept for a closed lobule | about 760 MB |

The phone envelope in `gpu-budget.js:29` is 320 MB. The dive is the state most likely behind a tab reload on the iPhone.

| Surface | Where | iPhone MB | Mac MB | Freed |
|---|---|---|---|---|
| Figure canvas (kept picture flag, counted twice) | `veins-gl.js:1968` | 15 to 30 | 31 to 62 | page |
| Kept picture and its stencil | `veins-gl.js:3078-3097` | 8 | 39 | `trim()` |
| Vessel layer (RGBA8, RGBA16UI, RG16UI, R8) | `veins-gl.js:2664` | 29 | 131 | `trim()` |
| Quality-tier targets | `veins-gl.js:3537` | 14.5 | 66 | **never by `trim()`** |
| Organ stack and overlay stack | `organs-gl.js:198`, `:819` | 7 + 7 | 31 + 31 | `trim()` |
| Organ painter targets (scratch, group, mask, nested pair, stencil) | `organ-paint.js:821-857` | 22 to 35 | 100 to 162 | the deep ones **never** |
| Label atlas, 2 pages of 2048² | `label-gl.js:747` | 17 to 34 | 17 to 34 | context (a repack briefly adds 33) |
| Lobule vessel layer at canvas size | `lobule-zoom.js:3819` | 64 | 131 | `lobule.release()` |
| Lobule `scr` | `veins-gl.js:1941` | 15 | 31 | **not at close** |
| paint-gl 4x MSAA tile (colour + D24S8) | `paint-gl.js:735-743` | 38 | 38 | 12 s after the last paint |
| Each chart's held bitmap | `trace-gl.js:878` | 4 to 5 each | 8 each | when that chart redraws |

### D1. `trim()` leaves the tier targets, `half` and the lobule's `scr` (S, low risk)

- **Where:** `trim()` (`veins-gl.js:4822-4834`) sets `lowLive = null` but never calls `lowFree()`, while `dispose()` does (`:4863`). It also leaves `half` as it is, and `scr` is freed only in `dispose`.
- **Impact:** about 32 MB on iPhone and 105 MB on Mac while the lobule is open or after it closes.
- **Fix:** in `trim()`, call `lowFree()`, shrink `half` to 1x1, and shrink `scr` to 1x1 when shared. Run `lowWarm()` again on un-trim, so the first move does not allocate.

### D2. The organ painter's mask and nested targets are never given back (S, low risk)

- **Where:** `trimDeep()` and `deepBytes()` exist (`organ-paint.js:1355-1357`), but nothing calls them.
- **Now:** the first masked or nested group (the gut and stomach bakes use `nest: true`) allocates them for good.
- **Impact:** up to 12 bytes a pixel of the picture: 20 MB on iPhone, 93 MB on Mac.
- **Fix:** register them as a warm holder with the budget, as paint-gl does, or call `trimDeep()` once the bakes settle. The code already makes them again at the next first clear.

### D3. Each chart's bitmap is the whole pool buffer (M, medium risk)

- **Where:** `trace-gl.js:878` hands each chart `glCanvas.transferToImageBitmap()`. The bitmap is the pool buffer at its current size, which is the largest chart of the last second (`SHRINK_MS`).
- **Now:** on a slide change every chart redraws inside that window, so each one holds a bitmap of the largest chart's size. A chart that never redraws holds it until the next slide.
- **Impact:** about 48 MB on iPhone with 10 charts, against 10 to 15 MB at their own sizes; about 100 MB on Mac. The budget's registry cannot see it.
- **Fix:** a second pool for small charts (up to about 512 x 384 device px), a third context that is well within limits; or draw a slide's charts sorted by size class and resize between classes.

### D4. The paint-gl tile keeps a depth buffer it never uses (S, low-medium risk)

- **Where:** `paint-gl.js:740` (MSAA) and `:778` (shadow scratch) allocate `DEPTH24_STENCIL8`. Depth testing is never enabled there.
- **Impact:** at 4 samples, 16.8 MB of depth-stencil against 4.2 MB for `STENCIL_INDEX8`. That saves about 12.6 MB during every lobule paint, plus a quarter of the bandwidth A9 pays per switch.
- **Fix:** `STENCIL_INDEX8` on `STENCIL_ATTACHMENT`, as `veins-gl.js:3097` already does. Check framebuffer completeness once.

### D5. Peak memory on a patient change or a look switch is still staged-plus-live (M, medium-high risk)

- **Where:** `organs-gl.js:609-668`, `:706-720`. The new layers are baked while the whole old set is live, and slot 1 keeps the previous view set as `prev` for its fade.
- **Also in the same moment:** a label repack (+33 MB), a glass kit rebuild, the res-fade copy of the canvas and new chart bitmaps.
- **Impact:** about +40 MB over steady state on iPhone, and +100 to 250 MB on Mac. In a talk on a phone this crosses the envelope.
- **Fix:**
  - Free each live layer as its replacement commits.
  - Skip the `prev` copy when `overMemory()`.
  - Hold the view slot until the camera lands.
  - Keep the label repack out of that window.
  - The stage's comments record one-frame flashes on this path, so build it with care.

### D6. The budget can act on very little (M)

- **Registered:** only paint-gl, the chart layers, the glass shares, the lobule's kept world and the veins warm hold register as holders (`gpu-budget.js:257-300`).
- **Not registered:** the view-slot organ pictures, the label atlas, the tier targets, `scr`, the painter's deep targets and the chart bitmaps.
- **Fix:** register those as "retained" holders, so they are dropped at rest, never in the middle of a slide change. The 3 Nov lesson still applies: drop-and-remake mid-change cost 385 ms frames.

### D7. The FibroScan map's GPU objects are never freed (S)

- **Where:** `elastogramUnder` (`fibroscan-gl.js:107-129`) builds two programs, six R32F grids, `mapT`, an FBO, a VAO and a buffer in the pool context. `fibroscan-gl.js` has no `dispose`, and the panel's `dispose` (`fibroscan.js:336`) frees only its words.
- **Impact:** about 1 MB and two programs per instance, kept for the session.
- **Fix:** add `under.dispose()` and call it from the panel's dispose.

### D8. The History timeline keeps 300 full snapshots (S)

- **Where:** `timeline.js:178-179`. Each entry holds an engine snapshot and a captured frame.
- **Impact:** about 6 to 18 MB of JS heap, bounded.
- **Fix:** keep the full frame only for the last 30 entries.

Already fixed from the 5 Nov notes:
- callout glass masks are freed (`forgetMask`, `sweepMasks`, `glass-gl.js:674-684`);
- slide charts are disposed (`dropCharts`, `presenter.js:630-636`);
- labels draw in the figure's context;
- the sinusoid and ink rebuild after a context restore;
- no double allocation was found on restore.

---

## Part E. Load time

What a first visit fetches before the figure (the built site, `npm run build`):

| What | Raw | gzip |
|---|---|---|
| First-screen script (`main` and its static imports) | 126 files, 2,077 KB | 841 KB |
| Stylesheet (render-blocking) | 586 KB | 102 KB |
| `organ-art` data (preloaded) | 1,114 KB | 210 KB |
| GPU glyph atlases (preloaded PNG and JSON) | 474 KB | about 360 KB |
| Fonts (three preloaded) | 217 KB | 217 KB |

After the first figure, the service worker fills its cache with the whole app: 250 files, 8.0 MB.

### E1. Boot waits for the engine before it builds the figure (S-M, low risk)

- **Where:** `main.js:163-178`. The order is:
  1. `await startHost()` (the worker script is fetched, parsed and initialised);
  2. `await` the `healthyProfile` and `presets` answers;
  3. only then `createStage`.
- **Measured (node):** importing the worker's code takes 10 ms, `init` 2 ms, and `healthyProfile` 19 ms (it builds a whole new `Engine` and its metrics). On a phone that is roughly 60 to 120 ms, plus the worker's fetch and parse, during which the main thread is idle.
- **Why it can overlap:** `createStage` reads `healthy` only when it uses it (`stage-blood.js:249`, `stage-label-items.js:112`, `stage-diaphragm.js:88`).
- **Fix:**
  - Call `startHost()` at the top of `main()`.
  - Build the stage before awaiting the answers.
  - Set `healthy` when it arrives, then let the first model frame draw.
  - Optionally post the healthy profile with the worker's first message, saving one round trip.
- **Check:** confirm the order with the existing `pps:booted` and `pps:figure-ready` marks.

### E2. Two data modules still ship as script (XS, no risk)

- **Where:** the build turns data modules into JSON because JSON parses several times faster than the same object as script (`scripts/build.mjs`, `DATA_MODULES`). Two are missing from that list:
  - `glyph-metrics.js` (145 KB, loaded for the first card's paragraph layout, `text-gl.js:54`);
  - `liver-geo-data.js` (30 KB, on the first screen).
- **Fix:** add both names to the regex. The build already checks that the values survive JSON.

### E3. The stylesheet is 586 KB, and a third of it is for talks (M, low risk)

- **Measured:** 5,836 rules and 6,125 selectors.
  - About 193 KB (34%) of the rule text is presenter-only (`.pz…`, `.presenting`).
  - 451 selectors end in `:is()`, `*` or a bare attribute. WebKit cannot hash those by class, so they are tested on every element at every restyle.
  - There are 63 `:has()` rules. One has no subject at all: `:has(> .tb-face-lent)` at `app.css:3942`. That is the shape the comment at `app.css:6532` says once restyled the whole app on every model tick.
- **Fix:**
  - Move the presenter's rules into a stylesheet loaded with `presenter.js`, and have the deck start wait for it.
  - Drop the subject-less `:has()` at `app.css:3942`: `growPill` (`topbar-motion.js:188`) can put a class on the pill while it lends the face, and the rule can key on that class.
  - Rewrite the hottest `:is(...)`-ended selectors as plain lists.
  - This cuts the render-blocking parse by about a third. The style-recalc effect needs a device profile.

### E4. Procedure code is on the first screen (M, low value)

- **Now:** `stage-cath.js` (33 KB), `hvpg-proc.js` (17 KB), `proc-anim.js` (15 KB), `endo-gl.js` (12 KB), `eus-scope.js` (10 KB) and the Doppler probe parts (about 19 KB) are all static imports. That is about 110 KB of the 2,077, loaded before any procedure is used.
- **Why it is lower:** they are woven through `stage.js`, `dock.js` and `main.js` (`setHvpgStage`, `setEusStage`), so moving them behind `import()` is M work for about 5% of the script.
- **When:** after E1 to E3.

### E5. The gut art goes through the page's SVG parser and is flattened again in script (L; later)

- **Now:**
  - `organ-art` holds two strings of SVG markup: `BOWEL_ART` (523 KB, 1,156 paths) and `COLON_ART` (512 KB, 41 paths).
  - `stage.js:882` inserts them into the document at boot.
  - The GPU organ painter then reads each path's `d` back and flattens it in script. Measured in node: 11 to 25 ms for all 1,197 paths.
- **Fix:** pre-flatten them at build time into a binary polyline file for the GPU painter, and load the markup only for the no-WebGL path. This is large work, because the painter also reads each element's computed fill and stroke; measure first.

### E6. The loading cover's floor and holds (note only)

- **Now:** the cover stays at least 600 ms (`index.html`, `MIN=600`) and waits up to 2.5 s for the palette, presenter and dock panes to be read in under it (`main.js:481-482`, `quiet.js:38`). That was chosen so their read-in never lands in the first pinch.
- **What to check:** read the time from `pps:figure-ready` to the cover lifting in `?perf` on a cold iPhone load before changing it.

---

## Part F. Docs that now mislead perf work

- `docs/PERFORMANCE.md` H3 and Q6 describe still layers and vitals pictures that no longer cache (B1).
- The "label canvas that draws nothing is hidden" paragraph in the same file describes the label canvas's own-canvas mode, which is gone: labels draw in the figure's context, and `data-blank` exists nowhere.
- `gl-words.js:21` says nothing passes `keep`; many readouts do.
- `docs/off-gpu-inventory.md` is stale (`npm run offgpu` rewrites it). The scanner today reports 808 of 4,723 sites on the GPU (17%).
- Nine files are over their layout-read allowance in `scripts/layout-read-allowance.json`: `callout`, `doppler`, `glass-gl`, `instruments`, `layer-alpha`, `menu-glass`, `scene-cam`, `sinusoid-view` and `util`. That is the one thing `npm run lint` fails on today. Moving their reads into `layout-snap.js` also fixes B3.

## Build order

1. **Quick and exact:**
   - A2 (invalidate);
   - A3, A4 and A5 (overlay present, render order, scissor);
   - A6 (glass shadow);
   - D1, D2 and D4 (memory);
   - E2 (JSON data).
   These are small, have no visible change, and each is one push.
2. **The CPU side:**
   - B1 (still layers with `keepLayer`);
   - B2's small half;
   - B3 (tooltip flush);
   - C4 and C5 (paint acknowledgement);
   - B5 and B6.
3. **The flicker-chase switches (A1), one per push:** narrow fold, still lumens, B2 direct, then the canvas's kept picture last.
4. **The model's preparation, together and with a tolerance agreed for the fingerprint tests:** C1 (settle until converged), C2 (preset snapshots) and C3 (history cache).
5. **Boot:** E1 (overlap), then E3 (presenter stylesheet).
6. **Larger:** A7 (one canvas read for all glass), A9 (lobule shadows), D3 (chart bitmaps), D5 (peak on patient change), then A10, A11 and B2's sprite half.

## What needs a device to confirm

None of these is needed before building; they size the results afterwards.

- The per-frame traffic totals, and whether ANGLE's Metal backend turns invalidates into "don't care" loads (A2, A8, A9). A Metal System Trace on the Mac in Safari, or a tethered-iPhone GPU trace, shows the load and store actions per pass.
- Whether each A1 switch brings the flicker back.
- The glass and composite shaders' arithmetic share (A6, A14).
- First-use compile hitches (A12).
- Style-recalc cost of the stylesheet (E3).
- Cover-to-first-input time on a cold iPhone load (E1, E6).
