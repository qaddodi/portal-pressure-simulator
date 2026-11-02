# Holding 120 Hz, always: engineering recommendations

Written 2 Nov 2026 against the preview build (`claude/settings-topbar-icon-flvft1` at `2851f6e2`, the commit `/preview/preview-info.txt`
names). Code reading only; no new measurements were taken for this document. Every claim below points at a file and line in that
commit so it can be checked.

The target the owner set: **a 2D scene must hold the display's refresh rate (120 Hz on ProMotion, so 8.33 ms a frame) on iPhone,
iPad and Mac, 100% of the time, in every view and during every interaction.** A game engine treats that as a hard budget: the frame
has 8.3 ms of wall time, of which the main thread may use about 3 to 4 ms of script (the browser needs the rest for style, layout,
compositing and submitting the GPU work), and the GPU may use about 6 ms at the chosen resolution. Anything that cannot fit in that
budget is not done in the frame: it is cut up, moved off the thread, pre-computed, or dropped.

---

## 0. The verdict in one paragraph

The app is not an engine with a frame budget. It is a very large, very clever page (stage.js alone is 13,563 lines; presenter.js
5,835; the shipped JavaScript is 4.8 MB) in which many independent subsystems each do their own work whenever they feel like it,
inside the same animation frame, with no budget, no scheduler that can defer or slice work, and no separation between the simulation
state the worker publishes and the picture the renderer draws. It has had an enormous amount of optimisation applied **inside each
subsystem** (partial redraws, uniform caches, still layers, glass caching, GPU labels, row-wise flow uploads: all real, all good),
but the frame itself still contains, in the worst case, all of: a model snapshot being applied to the whole UI, SVG label layout,
forced style and layout reads, texture uploads, three or more separate WebGL contexts each submitting their own command stream, the
browser compositing a transparent full-screen canvas over an SVG over CSS blurs, and garbage collection from per-frame string and
object allocation. Any one of those can take more than 8 ms on a phone. Together they guarantee frame drops at every model frame
(ten times a second), at every slide change, at every camera settle and at every gesture end. That is why it "does not hold 120 Hz
all the time": the steady blood frame is cheap, and everything that is not the steady blood frame is unbounded.

There is also one thing that no amount of engineering changes, and the owner must know it before judging results on an iPhone:
**iPhone Safari gives web pages a 60 Hz `requestAnimationFrame` by default**, even on a ProMotion iPhone, unless the user turns off
Settings › Apps › Safari › Advanced › Feature Flags › "Prefer Page Rendering Updates near 60fps". Mac Safari and iPadOS Safari run
rAF at the display rate. The code already documents this (`docs/gpu-practices.md` §1 and §11). So the measurable goal is: **120 Hz on
Mac and iPad Pro, 60 Hz locked on iPhone (120 with the flag off), with zero dropped frames in all cases.** The rest of this document
is about the zero dropped frames.

---

## 1. Where the frames go: the ten causes, ranked

Rank is by how often the cause fires multiplied by how long it takes, on a phone-class device.

### 1.1 The model frame is applied to the whole UI synchronously, inside the animation frame (every ~100 ms)

`src/worker-core.js:345` ticks the engine every 33 ms and publishes a snapshot about every 95 ms. `src/ui/paint-gate.js:8` holds the
newest snapshot and paints it in the next scheduler frame (`main.js:442`). `paintFrame` (`main.js:465-489`) then runs, in one go,
inside that frame:

- `store.set({ frame: f, ... })` (`main.js:472`), which fires **every** store subscriber synchronously (stage, card, dock, inspector,
  timeline, compare, Doppler, menu, status bar, credit...). The store has no notion of "which keys changed", so every listener wakes.
- `stage.update(viewFrame(f))` (`main.js:473` → `stage.js:3235` `update` → `updateInner`): recomputes vessel geometry/colours/widths,
  hysteresis bands, varix beads, organ eases, then `updateLabels` (`stage.js:10283`) which builds the label key, may run
  `layoutLabels` (`stage.js:10468`, a full collision solve over every label with DOM writes), and `labelGlSync` (an atlas upload).
- `card.update`, `dock.update`, `inspector.update`, `timeline.update`, `compare.update`, `syncDoppler`, `syncBleeding`,
  `updateProjector`, and every 3 s an `aria-description` attribute write on the stage SVG (`main.js:488`).

All of this lands in the same frame as the blood draw. On a phone this is routinely 10 to 40 ms of script, plus the style and layout
the DOM writes trigger. The scheduler can see it (`framePart` names the pieces) but cannot do anything about it. **This is the single
largest, most regular cause of dropped frames: a hitch every tenth frame, in every view, forever.**

### 1.2 Label layout and value refresh are DOM work on the frame path

Labels are SVG `<text>`/`<g>` elements laid out by a collision solver (`layoutLabels`, `stage.js:10468` onward, several hundred lines),
with `querySelectorAll('.clamp-label')` inside the solve (`stage.js:1594`, `7810`), `worldToLocal` per candidate, `rectOf`/`hits`
loops over every placed box, and text measured through `lineW`. `updateLabels` builds a composite string key on every call
(`stage.js:10301-10303`: twelve fields including `paramJSON(blockerBoxes)`, `calloutBoxes().map(...).join(';')`, and
`[CTM.a,CTM.b,CTM.e,CTM.f].map(v=>v.toFixed(2))`), allocating strings and arrays each model frame. `refreshValues` rewrites text content
of live labels. All of this runs in the frame; the `LABEL_HOLD` guard (`stage.js:10333`) only defers it during a recognised transition.
A label solve on a phone is several milliseconds by itself; the style recalculation it triggers on the SVG subtree is more.

### 1.3 Forced layout reads on the model frame and at settles

The code has a `readFrame` discipline (reads first, writes after) and uses it in places, but the reads are still there and still
expensive: `homeLookRead` (`stage.js:3296`) measures every organ's box and every card's box ("about 22 ms twice a second on a slowed
phone", the code's own comment at `stage.js:3252-3254`); `coverWRead` reads `getComputedStyle(...).strokeWidth` for every banded organ
(`stage.js:12405-12413`); `stageBox()` and `refreshCTM()` are called from `updateLabels` every model frame; `calloutBoxes()` and
`blockerBoxes` are read from the DOM. presenter.js has about 150 call sites of `getBoundingClientRect`/`offsetWidth`/`getComputedStyle`
(count by grep), dock.js 23, credit.js 23, lobule-zoom.js 19. Any read that follows a write in the same frame forces a synchronous
layout of the page, and this page has thousands of SVG nodes and a 6,893-line stylesheet with 383 `transition:` rules and 189
`box-shadow`s. A forced layout here is 5 to 20 ms on a phone.

### 1.4 The picture is composited from several layers the browser must blend every frame

The figure is **not one opaque canvas**. It is: the SVG organs (DOM, until the GPU "plate" lands), under a **transparent** WebGL
canvas (`veins-gl.js:1830`: `alpha: true, premultipliedAlpha: true`), under SVG labels (and/or the label GL canvas, which is hidden only
when it draws nothing), under GPU glass drawn into the figure's context, under cards and pills that still use CSS `backdrop-filter`
(15 occurrences in `styles/app.css`) and `box-shadow`. Every frame the blood moves, the compositor re-blends every one of those layers
over the full screen at device resolution (DPR 3 on an iPhone: about 3.6 MP per layer per frame), and every CSS backdrop blur over a
changed region is re-blurred by the compositor at the same cost. On Apple GPUs this is bandwidth, which is heat, which is throttling.
This is the per-frame GPU floor the app pays before it has drawn a single vessel.

### 1.5 Several WebGL contexts, each a layer, each its own command stream

Twenty modules create their own canvas or context (grep `getContext('webgl2'`: veins-gl, field-gl, fx-gl, tissue-gl, sinusoid-gl,
glass-gl, label-gl, doppler-gl, fibroscan-gl, endo-gl (WebGL 1!), trace-gl, vitals-gl, wide-gl, svg-gl, res-cover-gl, sw-yield,
gl-support...). The lobule view can hold four full-screen contexts at once (the GPU practices doc admits this: §4 and §5 "Part").
Each context is a compositor layer with its own drawing buffer (DPR² × 4 bytes, twice), its own per-frame submit, and its own
synchronisation with the compositor. On iOS, total canvas memory is capped and the tab is killed past it. The lobule and the dock
instruments, when open on top of the anatomy, are the moments the owner sees the worst behaviour, and this is a large part of why.

### 1.6 The GPU work is not sized to the budget

The vessel canvas is drawn at `min(2, devicePixelRatio) × QUALITY.res` (`stage.js:2953`) with a cap of 8 MP (`frame.js:429`, `cap: [8,...]`)
and a default `renderScale` of Full. The vessel pass is a per-cell SDF loop over every segment and junction reaching that cell with
smooth-minimum fillets and multi-render-target output (colour, lumen buffer RGBA16UI, second lumen RG16UI, "shape mask"); the blood
composite runs a noise/lane/chevron shader over every lumen pixel; one-pass zoom frames fuse both over the whole canvas; glass reblurs
run at `glassDpr` (cap 2) every 50 ms while anything under them changes; the `OWN_BUF` present copies the kept picture to the canvas
whole on every drawn frame. All shaders are `highp`. There is an "auto" resolution mode and a "while moving" share, but both are off
by default (`FIG_OPTS` and `FIG_LAB` in `frame.js:429-458` are all "experiments, off until chosen"). Nothing in the engine measures
GPU time per frame and nothing reacts to it except the opt-in `adapt` switch, which only acts after a move. On a hot phone this
means the frame rate falls and stays fallen.

### 1.7 Per-frame allocation and string keys

The steady frame itself allocates: `frame.js:73` and the `late`/`fin` maps make three `new Map()`s per frame and one two-element array
per callback; each callback is wrapped in `try/catch` and timed with two `performance.now()` calls. `animate` (`stage.js:12257`) builds
the `key` template string every still frame (`stage.js:12311`, eight interpolations including `wrap.className`), reads `document.hidden`
and `classList.contains('home-open')`, calls `store.get()` and evaluates a ~25-term condition (`stage.js:12318`) that itself calls
`marksKey()` (string), `olList.some(...)`, `EV.some(...)`. `stepBlood` (`stage.js:11785`) is good (preallocated `flowData`, one options
object) but still allocates `put` as a closure per call and loops `EV` → strands → feeders with optional chaining. Over a second at
120 Hz that is thousands of small objects: V8/JSC young-generation GCs of 1 to 4 ms land on random frames. On a 60 Hz budget they
hide; on an 8.3 ms budget they are visible drops.

### 1.8 Timers and "wake" paths that run work outside the frame

`stage.js:12381` re-arms a 1 s `setTimeout(wake)` whenever the loop sleeps; `store.on('*', wake)` and two `MutationObserver`s on class
attributes wake it; `paint-gate` uses a 100 ms `setTimeout` fallback; `worker-core.js:345` ticks at 33 ms (so the worker's own
`postMessage` arrival, structured-clone deserialisation of the snapshot and `ingestFrame` → `dock.ingest(f)` run as tasks between
frames, competing with the frame for the main thread); main.js has twenty `setTimeout`s for refits/relayouts (`main.js:1212`, `1216`,
`1300`...) that trigger layout at arbitrary points in a frame. Each is small; together they fragment the frame budget.

### 1.9 Code size and lazy chunks parsed mid-use

`dist/assets` is 4.8 MB of JavaScript across 34 chunks, one of them 1.1 MB and one 210 KB, loaded by eleven dynamic `import()`s "on
first use". Parsing and compiling 1 MB of JS on an A15-class CPU is 50 to 150 ms on the main thread, and it happens the first time
the user opens the surface that needs it: the frame that opens the lobule, the dock, or the presenter. `quiet.js` warms modules in idle
moments, which helps when the user waits, and not at all when they tap first.

### 1.10 198 runtime `?flag=` switches

`grep -o "/\[?&\][a-z0-9]*=" src/ui/*.js | sort -u | wc -l` gives 198 distinct URL switches, each selecting a code path at module
load (`OWN_BUF`, `ONE_PASS`, `INVALIDATE`, `CTX_STENCIL_FREE`, `UNIFORM_CACHE`, `DEPTH`, `LZ_ONE`, `CLASSIC`, `BLOOD_SAT`, `GENERIC`,
`PREALLOC`, `STATFIX`, `LABEL_HOLD`, `SEEN_ONLY`...). Every one is a second implementation kept alive in the shipped bundle and a branch
in the frame path. This does not itself drop frames, but it is why the bundle is 4.8 MB, why nobody can say which path a device runs,
and why fixes keep landing beside old code instead of replacing it. An engine ships one path.

---

## 2. What is already right (do not redo it)

- One scheduler for all surfaces with early/late/final phases (`frame.js`); no frames when nothing moves; sleep on hidden.
- Vessels on the GPU as SDF cells; blood as a cheap per-frame pass over a lumen buffer; partial redraws (`drawRows`, `tintPass`,
  `syncGlowOnly`); flow uploaded row-wise and skipped when unchanged (`flow-rows.js`).
- `OWN_BUF` instead of `preserveDrawingBuffer`; `invalidateFramebuffer` on the one-pass stencil; uniform cache; shader pre-compile with
  `KHR_parallel_shader_compile` and warm-up draws; label atlas; GPU glass with reblur throttling; still layers for charts and vitals;
  the paint gate (newest snapshot only).
- Physics in a worker, with cooperative yielding on long jobs.
- Honest instrumentation: `?perf`, `watchFrames`, `frame-stats.js`, the motion budget, the off-GPU scanner, the CI frame gate.

The problem is not the quality of these pieces. It is that the frame is still a bag of unbudgeted work around them.

---

## 3. The fix: turn the page into an engine

These are ordered by payoff. Items 3.1 to 3.4 remove the regular hitches; 3.5 to 3.8 remove the GPU floor and the heat; 3.9 to 3.12
keep it fixed.

### 3.1 Build a real frame scheduler with a budget, and make everything that is not "draw" go through it

Replace the three-phase "run everything asked" `flush` in `frame.js` with a scheduler that has:

- **A hard per-frame script budget** (`BUDGET_MS = 3.5` at 120 Hz, derived from the measured refresh interval at runtime: median of the
  last 60 rAF deltas, clamped to {8.33, 11.1, 16.7, 33.3}).
- **Two queues**: `must` (camera, input response, the blood draw, the present/copy) and `may` (model-frame application, label solve,
  chart redraw, glass reblur, texture refinement, credit look, home look, aria text, anything with a `setTimeout` today). `must` runs
  every frame. `may` tasks are **resumable generators or explicit step functions** that run until the budget is spent and continue next
  frame. A task that cannot be split declares a cost estimate and runs only when the remaining budget covers it, otherwise it waits.
- **Priority ageing**, so a `may` task cannot starve (a label solve waits at most N frames, then becomes `must` once and is drawn).
- **No `setTimeout`/`setInterval` for anything that touches the DOM or GL.** Timers become scheduler tasks with a `notBefore` time.
  (Grep targets: the 60 timers in `stage.js`, 20 in `main.js`, 18 in `presenter.js`, 11 in `lobule-zoom.js`.)
- The scheduler records, per frame, `script`, `gpu` (see 3.9) and `missed` (rAF delta > 1.5 × refresh) and exposes it on `window.pps.perf`.
  The `?perf` readout already has the display side; this is the control side.

Delete the `Map` churn: a preallocated ring of `{tag, cb}` slots, no per-callback `try/catch` (one around the whole flush; a surface
that throws is unregistered and reported), `performance.now()` only when `perf` is being watched.

### 3.2 Apply model frames incrementally, never as one synchronous store broadcast

- Split `paintFrame` (`main.js:465`) into independent scheduler tasks: `figure`, `labels`, `cards`, `dock`, `inspector`, `timeline`,
  `a11y`. Each is `may`, each is sliced. Only `stage.update`'s vessel attribute sync (colours/tiers/flags: the few-kilobyte texture upload)
  is `must`, because the blood pass reads it.
- Replace `store.set({frame})` → broadcast to `'*'` with **keyed subscriptions and a dirty set**: listeners register for the paths they
  read (`frame.P`, `frame.Q`, `frame.events`, `running`, `clock`); the store diffs the snapshot's top-level sections (the worker can
  send a `changed` bitmask, it already sends `f.changed`) and wakes only those listeners, as scheduler tasks.
- Make the worker send **typed arrays** for the numeric bulk (pressures, flows, radii, node states) in one `ArrayBuffer`, transferred
  (`postMessage(msg, [buf])`), with a small JSON header for events and strings. Structured clone of nested objects every 95 ms on the
  main thread is measurable; a transferred buffer is free. Keep two buffers and alternate (the main thread hands the previous one back).
- Decouple the worker's tick from publish: tick stays at 33 ms; publish only when `changed` or at the 95 ms heartbeat, and never
  publish faster than the page paints (the worker reads a `painted` ack; skip a publish while one is unacked). This removes the pile-up
  the paint gate exists to mitigate.

### 3.3 Take labels off the DOM entirely and off the frame path

`label-gl.js` already draws labels on the GPU from an atlas; the SVG `<text>` is still the source of truth and the layout still writes
DOM. Finish the move:

- Labels become plain records `{id, text runs, anchor world xy, box, slot}`; text is measured once per (font, size, string) into a cache
  (a `Map` keyed by string: measurement is the only DOM/canvas call left, and it happens on string change, not on frame).
- The collision solver runs on those records in a **worker** (it is pure geometry: boxes, segments, vessel density grid). The main
  thread posts the current camera + anchors + obstacle boxes; the worker posts back slots. While waiting, labels **carry** with the
  camera (already implemented: `carry*` in `updateLabels`). Latency of one or two frames on a solve is invisible; a 6 ms solve on the
  main thread is a dropped frame.
- Live value refresh (`refreshValues`) becomes a glyph-run rewrite in the atlas instance buffer (a few hundred bytes `bufferSubData`),
  no `textContent`.
- Delete `labelKey` string building (`stage.js:10301`); replace with a small struct compare (camera 4 floats rounded, box w/h, morph,
  rotU, fonts epoch, theme id, two insets, mode, compare flags, callout box hash as a number).
- Remove the SVG label layer from the DOM when the GL labels are live (today it is `visibility: hidden` at best; hidden SVG text still
  costs style recalc on every class change of an ancestor).

Until that lands, the stop-gap is in the scheduler: `layoutLabels` is a `may` task with a 2 ms slice (the solver's candidate loop can
yield between labels: it already iterates `out`/`later` lists in order).

### 3.4 Zero layout reads in a frame, enforced by the scanner

`scripts/off-gpu-scan.mjs` already counts `layoutRead` in frame callbacks and reports 0, but the reads moved into `readFrame` callbacks,
observers and timers, which still force layout whenever a write preceded them in the same task. Rule: **the page's geometry is read in
one place, once per frame, before any write, into a `LayoutSnapshot` object** (stage box, safe-area insets, every card box, every
callout box, the credit box, the pill edge, the dock divider), and every consumer reads the snapshot. A `ResizeObserver` on the cards
and the stage fills the snapshot asynchronously (it fires after layout, with sizes, for free); positions come from the presenter's own
placement maths (it put the cards there; it knows where). Delete `homeLookRead`'s organ box measurement: the organ boxes are in world
coordinates and the camera is known, so the home fit is arithmetic.

Make the scanner fail the build on any `getBoundingClientRect`, `getBBox`, `getComputedStyle`, `getScreenCTM`, `offsetWidth/Height`,
`clientWidth/Height`, `scrollTop`, `getTotalLength`, `getPointAtLength`, `elementFromPoint` outside the one snapshot function and
test files. Today's count to burn down: presenter 150, stage 81, util 40, main 33, dock 23, credit 23, lobule-zoom 19.

### 3.5 One opaque WebGL context for the whole figure

- The anatomy, lobule, sinusoid, labels, glass, overlays, the lobule's field/fx/tissue, and the dock instruments when they are shown
  over the figure all draw into **one** context, one drawing buffer, with `alpha: false` and an opaque clear in the page background
  colour (`docs/gpu-practices.md` §7 has this as "Later": make it now). One compositor layer; no per-frame blend of a transparent
  full-screen canvas over the DOM; no per-context submit.
- Organs are already painted on the GPU (`organ-paint.js`, the plate). The SVG organ layer must **not exist in the DOM** once the plate
  is up: remove the nodes (keep the path data in JS for hit-testing and for the painter), do not hide them. While the plate is being
  made at start-up, show a pre-rasterised PNG/WebP plate shipped with the build (one per organ art variant and palette) so the SVG is
  never in the live frame at all.
- Hit-testing moves off `#world .v-hit` SVG strokes to a **picking texture**: the vessel pass already writes a lumen buffer with the
  vessel row per pixel; read one pixel asynchronously (PBO + fence, polled next frame) on pointer events. Then the SVG world can go.
- Each instrument (Doppler, FibroScan, endoscopy, traces, vitals) becomes a renderer that draws into a viewport of the shared context
  when docked, and into its own small context only when undocked to a separate window. `endo-gl.js:200` is WebGL 1: port to the shared
  WebGL 2 renderer.
- Budget: at DPR 2 an iPhone 15 Pro figure is 2.4 MP; one buffer, one copy. Today's lobule can be four to five buffers.

### 3.6 Render at a resolution the GPU budget allows, measured, not configured

Turn the opt-in experiments into the engine's default behaviour and remove the switches:

- **Dynamic resolution scaling** on the figure's own render target (the canvas stays at display size; the kept picture `OWN_BUF` is
  already a texture, so the upscale path `UP_FS` exists): target 6 ms GPU per frame measured with `EXT_disjoint_timer_query_webgl2`
  where available (Chrome; the probe `gpu-probe.js` already uses it) and with frame-interval slip where not (Safari): if the rAF
  interval misses the refresh twice in a row while script is under budget, the GPU is the bottleneck: step the render share down 15%;
  if it holds for 2 s with margin, step up. Floor 0.5 at DPR 2 on phones. This is what every console and mobile game does.
- Motion frames (pan, pinch, glide) render at the `move` share immediately (today `FIG_OPTS.move` is off); the settle frame renders at
  the full share. `pinchLow`/`pinchReuse` become the one implementation, on.
- `mediump` in the blood composite, the glass blur, the upscale and the organ painter (colour-only work). Keep `highp` only where
  positions are computed (the SDF distance). Apple GPUs run half precision at twice the rate.
- Glass: never re-blur per frame from the moving picture. Blur the **still** figure once at a quarter resolution, and blend the moving
  blood under the glass as a flat tint (the blood under frosted glass is not legible anyway). Remove the 15 CSS `backdrop-filter`s:
  pills and toasts get a solid or GPU glass.
- Delete the `OWN_BUF` whole-copy per frame: draw the blood pass **directly into the canvas's back buffer** over a copy of only the
  cells that have lumen (the lumen buffer tells you which), or better, with `alpha:false` and a single context, keep the figure in the
  back buffer and `invalidateFramebuffer` nothing you need; the copy exists today only because the canvas is transparent and shared.

### 3.7 Fix the data path per frame

- `flowData` upload (`stage.js:11900`, `veins.setFlow`): already row-diffed; make it a UBO or a 1-D texture updated by `texSubImage2D`
  of only the changed row range (contiguous min..max), not the whole table.
- Tube attribute texture (`TUBE_TEXELS = 13` per vessel): same, changed-range only.
- Per-vessel blood simulation (`advanceStream` × `EDGES.length` every frame) moves into the **vertex shader / blood pass**: the stream
  position is `phase0 + velocity × t` with eases expressed as uniforms per vessel; the CPU sends a velocity table when the model frame
  changes it (10 Hz), not a position table at 120 Hz. `stepBlood` then costs nothing on the frame.
- Garbage: audit with a heap allocation sampling profile over 10 s of steady anatomy and drive it to zero objects per frame on the
  `must` path. Known offenders: `key` string (`stage.js:12311`), `marksKey()`, the scheduler Maps, `put` closure, `calloutBoxes().map`,
  `labelKey`, spread objects in `store.set` (`main.js:472`).

### 3.8 Ship one code path, half the bytes

- Remove the 198 `?flag=` switches except a handful of **diagnostic** ones (`?perf`, `?budget`, `?inputs`) that cost nothing when off.
  Each removed switch deletes its losing branch. Expect the bundle to fall from 4.8 MB toward 2 MB and the frame loop to lose dozens
  of branches.
- Preload every chunk a view can need **before** the user can reach it: the lobule chunk when the anatomy is idle for 1 s, the
  presenter chunk when the menu opens, the instrument chunks when the dock handle is touched. Never `import()` in response to the tap
  that needs it. The 1.1 MB chunk must be split so no single parse exceeds ~200 KB.
- Compile and link **all** GL programs at start-up in parallel (mostly done), including the instruments' and the lobule's, and warm each
  with a draw, so no view's first frame compiles.

### 3.9 Measure the right thing, on the right machine, and gate on it

The CI frame gate (`scripts/frame-gate.mjs`, `scripts/perf-limits.json`) runs on software GL with the CPU throttled 4 to 6× and
therefore judges nothing against the real bar (its own note says the ceilings are 280 ms p95). That is a regression detector, not a
120 Hz gate. Add:

- **On-device telemetry in the app**: the scheduler's per-frame record (script ms, GPU ms where measurable, missed frames, which `may`
  tasks ran and were deferred, resolution share) kept in a ring; `?perf` shows it live; a one-tap "copy report" the owner can paste from
  the iPhone and iPad. The owner is the only true test bench this project has, so make it one-tap.
- **A real-GPU runner for CI**: a self-hosted macOS runner (any Apple-silicon Mac mini) running Safari Technology Preview and Chrome
  with real WebGL, `--disable-frame-rate-limit` for Chrome's uncapped ceiling test, and WebKit via Playwright. Gate: p99 frame interval
  ≤ 1.1 × refresh and zero frames over 2 × refresh across the whole scenario list (idle anatomy, hover, pan, pinch, lobule, each deck's
  slide changes, menu, dock). Without a real GPU in CI the 120 Hz target is unverifiable and will regress silently.
- Keep the software-GL run only for the **CPU-only** numbers (`frame-budget.mjs` with draws stubbed) with a gate of **p99 script ≤ 3.5 ms
  and zero tasks over 8 ms** on the 6× phone profile. That is the main-thread half of the budget, and it is measurable today.

### 3.10 Input handling

- `pointermove`/`touchmove`/`wheel` handlers must only record the latest input; the camera is applied in the `must` phase of the next
  frame (coalescing). Check every listener is `{passive: true}` where it does not call `preventDefault`, and that none reads layout.
- Keyboard slide changes (`ArrowRight`) kick a scheduler task, not a synchronous presenter rebuild.

### 3.11 CSS and compositor hygiene

- Audit the 383 `transition:` and 51 `@keyframes` rules: anything animating a property other than `transform`/`opacity` is repaint or
  layout per frame (16 rules animate width/height/top/left/margin/padding/max-height/flex by grep). Convert or remove.
- 189 `box-shadow`s: a shadow on an element that moves is a re-raster every frame. Pre-render shadows as images or draw them in the GPU
  glass pass; keep CSS shadows only on static chrome.
- `will-change` only during motion (the code already does this for some layers); never on large static elements.
- `contain: strict` on the cards, the dock and the menu so a change inside them cannot trigger layout of the stage, and
  `content-visibility: hidden` on surfaces that are off screen rather than `display:none` toggles (which re-layout on return).

### 3.12 Structure: split the monolith

A 13.5k-line `stage.js` and a 5.8k-line `presenter.js` cannot be reasoned about for latency. Split along the engine's seams:

```
engine/        sim worker (unchanged physics), snapshot buffers, publish protocol
render/        one GL context: passes (vessels, blood, organs, labels, glass, instruments), render graph, dynamic resolution
scene/         world geometry, camera, hit-testing (picking), label records, layout snapshot
ui/            DOM chrome only (cards, menu, dock frames); never touches GL or the frame loop
scheduler/     frame budget, must/may queues, sliced tasks, telemetry
```

Rule for the review: **nothing in `ui/` may run in a frame callback; nothing in `render/` may touch the DOM.** The off-GPU scanner
becomes the lint for this.

---

## 4. Sequence and expected effect

| Step | Work | Removes |
|---|---|---|
| 1 | Scheduler with budget, must/may, sliced tasks; timers to tasks (3.1) | the ability of any one subsystem to take the frame |
| 2 | Model frame applied incrementally, keyed store, transferred buffers (3.2) | the hitch every 100 ms |
| 3 | Layout snapshot, zero reads in frame, scanner fails on reads (3.4) | the 5-20 ms forced layouts at settles and model frames |
| 4 | Labels fully GPU, solver in a worker (3.3) | the label solve and SVG style recalcs |
| 5 | One opaque context, SVG organs out of the DOM, picking texture (3.5) | the compositor floor and the lobule's multi-context stalls |
| 6 | Dynamic resolution, mediump, glass once, no whole copy (3.6) | the GPU floor and the heat throttling |
| 7 | Blood in the shader, changed-range uploads, zero allocation (3.7) | GC hitches and the per-frame CPU blood step |
| 8 | Flags out, chunks preloaded and split (3.8) | parse stalls on first use, bundle size, dual code paths |
| 9 | Real-GPU CI runner, device telemetry, hard gates (3.9) | silent regression |

Steps 1 to 3 are where the owner will first feel the difference (no regular hitch, no stutter at settles). Steps 5 and 6 are what
make a phone hold the rate for minutes instead of seconds. Step 9 is what keeps it that way.

---

## 5. Acceptance criteria (what "done" means)

1. Mac Safari and Chrome on a ProMotion display, iPad Pro Safari: every scenario (idle anatomy running, hover, pan, pinch, lens switch,
   lobule open/close, sinusoid, each deck's slide changes, menu open, dock open/close, Doppler and FibroScan live) shows **zero frames
   over 2 × refresh interval and p99 ≤ 1.1 × refresh** over a 60 s run, read from the app's own telemetry.
2. iPhone Safari (60 Hz default): the same, at 60; with the Safari feature flag off, at 120.
3. Main-thread script per frame: **p99 ≤ 3.5 ms, max ≤ 8 ms**, in every scenario, on the 6× throttled phone profile with draws stubbed
   (`frame-budget.mjs`), gated in CI.
4. Zero layout reads in any frame callback, observer or timer (scanner gate), zero per-frame heap allocation on the `must` path
   (allocation profile gate), one WebGL context on the page in every view.
5. Bundle ≤ 2.5 MB; no dynamic chunk over 200 KB; no `import()` triggered by a user input.
6. Sustained: 10 minutes of the running anatomy on an iPhone does not drop the resolution share below 0.7 (telemetry), i.e. no thermal
   collapse.

---

## 6. Appendix: file and line references used above

- `src/ui/frame.js:22-29, 68-80` scheduler maps and flush; `:429` `FIG_OPTS` (cap 8 MP, move/adapt off); `:458` `FIG_LAB` (motion60,
  pinchReuse, pinchLow, upscale, all off); `:475-479` `MOTION60_MS`, `paceMs`.
- `src/ui/stage.js:2785` `QUALITY` steps; `:2953-2954` canvas DPR and share; `:3235` `update`; `:3252-3254, 3296` home look reads;
  `:10283` `updateLabels`, `:10301-10303` label key string; `:10333` `LABEL_HOLD`; `:10468` `layoutLabels`; `:11785` `stepBlood`;
  `:12257` `animate`; `:12311` still-frame key string; `:12318` the sleep condition; `:12381` sleep timer; `:12405-12413` `coverWRead`.
- `src/ui/main.js:442` paint gate; `:447` `ingestFrame`; `:465-489` `paintFrame` (`:472` store broadcast, `:488` aria write).
- `src/ui/paint-gate.js:8` (minGap 80, fallback 100 ms timer).
- `src/worker-core.js:345` 33 ms tick.
- `src/ui/veins-gl.js:1830` context attributes (`alpha: true`); `:88-130` the `OWN_BUF`, `ONE_PASS`, `INVALIDATE`, `CTX_STENCIL_FREE`,
  `UNIFORM_CACHE`, `DEPTH` switches.
- Context creators: `field-gl.js:83`, `fx-gl.js:124`, `glass-gl.js:426`, `label-gl.js:490`, `doppler-gl.js:46`, `fibroscan-gl.js:68`,
  `endo-gl.js:200` (WebGL 1), plus tissue-gl, sinusoid-gl, trace-gl, vitals-gl, wide-gl, svg-gl, res-cover-gl, sw-yield.
- `styles/app.css`: 15 `backdrop-filter`, 189 `box-shadow`, 383 `transition:`, 51 `@keyframes`, 16 transitions on layout properties.
- `dist/assets`: 4.8 MB JS, 34 chunks, largest 1.1 MB; 11 dynamic imports.
- `docs/gpu-practices.md` §1, §4, §5, §7, §11: the team's own list of "Part", "Gap" and "Later" items; this document promotes the
  "Later" ones (one context, opaque canvas, SDF text, OffscreenCanvas) to required.
