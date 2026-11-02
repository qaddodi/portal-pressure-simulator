# Holding 120 Hz, always: engineering recommendations (revision 2)

Revision 2, 2 Nov 2026, against the preview build `claude/settings-topbar-icon-flvft1` at `6f79e3df` (the commit
`/preview/preview-info.txt` names at 19:32 UTC). Revision 1 was written against `2851f6e2` earlier the same day; about forty commits
landed between them, many citing this plan's section numbers. This revision is code reading only (no measurements), re-checks every
item of revision 1 against the new code, says what is done, what is half done, what is untouched, and what the new code itself
introduced. File and line numbers are for `6f79e3df`.

The target is unchanged: **8.33 ms a frame on ProMotion (Mac, iPad Pro), 16.7 ms on an iPhone (Safari gives pages 60 Hz rAF unless
the user turns off "Prefer Page Rendering Updates near 60fps"), with zero dropped frames in every view and interaction.** Main-thread
script must stay under about 3.5 ms of that; the GPU under about 6 ms.

---

## 0. Where things stand after the forty commits

The scheduler now has a budget, a watchdog, a governor, a must/may split, a prep ledger, deadline-driven quality tiers and a render
graph budget. The model frame no longer lands as one long frame: the figure takes it, the rest is may tasks. The blood runs on in the
shader, so a steady flow uploads nothing. Layout reads go through one module and the scanner fails any other. Organs leave layout
(`display: none`) once the GPU plate is up. Layout-property CSS transitions are gone. Inputs are coalesced to one transform write a
frame. All of that is real and matches the plan.

What has **not** moved, and still decides whether 120 Hz holds:

1. **Labels are still SVG DOM laid out on the main thread inside the must frame** (`stage.js:3670` `updateLabels` runs from
   `updateInner`, i.e. inside `stage.update`, which is the one part of the model frame deliberately kept as must).
2. **There are still 19 modules creating their own WebGL contexts**, the figure canvas is still transparent (`veins-gl.js:1864`
   `alpha: true`), and hit testing is still `elementFromPoint` on SVG hit strokes (`stage.js:12637`, `13215`).
3. **The store still broadcasts every model frame to every `frame` listener and five `'*'` listeners synchronously** (`store.js:56-61`),
   and the snapshot still carries structured-clone objects (`metrics`, `slow`, `bands`, `bleed`, `events`, `samples`;
   `worker-core.js:213-220`) beside the six transferred typed arrays.
4. **The bundle grew**: 4.94 MB of JavaScript (was 4.85), the largest chunk still 1.1 MB, and the runtime `?flag=` switches went from
   198 to **217**. Every new mechanism shipped with its own off switch and its own fallback path.
5. **No real-GPU measurement exists anywhere in the pipeline.** The gate still runs on software GL; the new tiers and budgets judge
   frame intervals and counted pixel areas, never GPU time.
6. `stage.js` is now 13,769 lines (was 13,563); `presenter.js` 5,911 (was 5,835).

And one new risk the new code created, covered in §3: **six overlapping policies now decide what runs in a frame** (watchdog shedding,
governor yielding, may-task budgeting, prep ledger, adapt tiers, GPU budget), each with thresholds (70%, 85%, 42%, 45%, 3 frames,
4 frames, 250 ms, 1.5 s) tuned by hand and none of them able to stop a callback once it has started. Deferral moves a hitch; it does
not remove it. The work that is too big for a frame has to be made smaller, not scheduled later.

---

## 1. Revision 1 items, re-checked

| § | Item | Status at `6f79e3df` | Evidence |
|---|---|---|---|
| 3.1 | Frame scheduler with a budget, must/may, sliced tasks, timers as tasks | **Part.** Budget fixed at the 120 Hz interval (`frame.js:142-178`); `mayTask` with `MAY_SHARE = 0.42`, `MAY_WAIT = 4`, EMA cost prediction, sliced via `fn(leftMs) === true` (`frame.js:268-336`); watchdog sheds `DEFERRABLE` at 70%, governor yields `SECONDARY` at 85% (`frame.js:180-266`). Timers: still 67 `setTimeout`/`setInterval` in stage.js, 22 presenter.js, 21 main.js, 11 lobule-zoom.js (the `notBefore` may-timer exists but little has moved onto it). The `run()` loop still allocates `[tag, cb]` arrays per ask and calls `performance.now()` twice per callback. | `frame.js:118-131` |
| 3.2 | Model frame applied incrementally; keyed store; transferred buffers; worker paced by paint | **Part.** `PAINT_PARTS` are may tasks (`main.js:484-500`); `painted` ack and `ACK_MAX_MS = 400` in the worker (`worker-core.js:247, 309, 418-421`); `P, Pf, Q, Qf, ext, D` transferred (`worker-core.js:228`). Still synchronous in the must frame: `store.set({frame})` → every `frame` listener and five `'*'` listeners (`store.js:56-61`; `main.js:472`), then `stage.update` whole (geometry, widths, organs eases, **labels**). Snapshot still clones `metrics`, `slow`, `bands`, `bleed`, `events`, `samples` as objects. Worker tick still `setInterval(tick, 33)` (`worker-core.js:347`). |
| 3.3 | Labels fully GPU, solver in a worker, no DOM | **Not done.** `label-gl.js:3-13`: "The SVG label layer (#labels .lb) stays the model: stage.js lays every label out and writes it there as before". `updateLabels` (`stage.js:10283` region, now ~10486) still builds the twelve-field string key per model frame and runs `layoutLabels` on the main thread; R04 only skips the key on camera-only moves. |
| 3.4 | One layout read per frame, scanner fails elsewhere | **Done as a mechanism, not as an outcome.** `layout-snap.js` wraps every read (`readBox`, `readStyle`, `readCTM`, `readBBox`, `readLength`, `readPoint`, `readMetric`, `readElAt`...) and keeps a `ResizeObserver` snapshot for placed elements; the scanner fails reads elsewhere. But the wrappers are called from 85 sites in presenter.js, 76 in stage.js, 39 in util.js, 26 in main.js, 23 in dock.js, 19 in lobule-zoom.js: the reads still happen, now counted (`layoutReads()` only under `?perf`/`?offgpu`). The snapshot is used for the stage box, the world CTM and placed cards; the rest still asks the browser. |
| 3.5 | One opaque context; SVG organs out of the DOM; picking texture | **Part (organs only).** `app.css:135` `.gl-plate #organs { display: none }` and `elBox`/`chainMat` replace `getBBox`/`getCTM` (`stage.js:1978-1987`). Still: 19 context-creating modules (veins-gl, field-gl, fx-gl, tissue-gl, sinusoid-gl, sinusoid-view, glass-gl, label-gl, doppler-gl, fibroscan-gl, endo-gl (WebGL 1), trace-gl, vitals-gl, wide-gl, res-cover-gl, sw-yield, gl-support, lobule-zoom, stage); `LZ_ONE` folds only the lobule's fx overlay into the vessel context. Figure canvas `alpha: true`. Hit test via `.v-hit` SVG + `elementFromPoint`. `#backdrop`, `#ascites`, `#ghosts` are `visibility: hidden`, not removed (`app.css:131`): still in style recalc. |
| 3.6 | Dynamic resolution by measured GPU time; mediump; glass once; no whole copy | **Part.** `adapt-tier.js` steps the vessel layer's **moving** frames down (0.85 / 0.71 / 0.5) on 3 of 6 missed or heavy frames, up after 1.5 s calm; the still view is always Full. `gpu-budget.js` counts allocated bytes and drawn pixel area per frame through `gl-state.js` wrappers; no GPU time. `mediump` in the upscale and overlay lay (fb0afe00) only. Glass: default `reblur = 0` (`glass-gl.js:413`), i.e. **re-blurred on every frame the figure under it changes**; the 50 ms hold is opt-in (`?reblur=1`). The `OWN_BUF` `present()` still blits the whole picture to the canvas on every drawn frame (`veins-gl.js:2705-2751`). 15 CSS `backdrop-filter`s remain. |
| 3.7 | Blood in the shader; changed-range uploads; zero allocation | **Mostly done.** Per-stream anchors, shader runs the stream on (`stage.js:147-149`; `veins-gl flowD`); dye uploads only the changed row span; dye bolus stepped in `dye-worker.js`; `NONE` frozen list. Still allocating in the steady frame: the still-frame template key (`stage.js:12514`, eight interpolations incl. `wrap.className`), `marksKey()`, `olList.some`, `EV.some`, the scheduler's per-ask arrays. |
| 3.8 | One code path; chunks preloaded and split | **Regressed.** 217 switches (was 198). 4.94 MB JS; chunks of 1106, 898 (app), 813, 531, 306, 266, 220, 210 KB. Doppler and FibroScan chunks are read in while idle (dfeacb4a); the lobule, presenter and the 1.1 MB chunk are not. |
| 3.9 | Real-GPU runner; device telemetry; hard gates | **Part.** `?fps=120` forces frames and logs overruns to the console with surfaces (`frame.js:337-351`); `watchdogStats`, `shedStats`, `mayStats`, `tierLog`, `pps.budget()`. No one-tap copy of a device report; the CI gate is unchanged (software GL, ceilings of 280 ms p95). |
| 3.10 | Input coalescing | **Done** (96db0f9f: a move, wheel step or pinch only sets the view; one transform write a frame). |
| 3.11 | CSS hygiene | **Part.** Layout-property transitions: 0 (f62416cd). `backdrop-filter`: 15; `box-shadow`: 189; `@keyframes`: 51. No `contain`/`content-visibility` work. |
| 3.12 | Split the monolith | **Not done.** stage.js +206 lines, presenter.js +76 since revision 1. |

---

## 2. What still breaks the frame, ranked (the remaining work)

### 2.1 `stage.update` is a must task that contains the label solver

`main.js:473` runs `stage.update(viewFrame(f))` as must because "the blood reads it". The blood reads the vessel attribute texture
(colours, tiers, flags: a few KB upload). Everything else in `updateInner` (`stage.js:3459`) is not needed by the blood pass: width
hysteresis and geometry rebuilds, organ eases, band eases, `prepLobule`, `followHome`, and `updateLabels` (`stage.js:3670`, and again
at `3770` for sites/scan/catheter). The label solve is the single largest piece of main-thread work on the model-frame path and it is
still inside the must frame.

**Fix.** Split `updateInner` into (a) `syncVesselAttributes(f)` (must, bounded, no DOM), and (b) everything else as sliced may tasks
with their own tags (`geometry`, `organs`, `labels`, `home`). `updateLabels` becomes a may task with a 2 ms slice: the solver's
candidate loop already iterates `out`/`later` in order and can yield between labels; carry the labels with the camera (the `carry*`
path exists) until the solve lands. Measure the win with `?perf`: the `figure update` part should fall to under 1 ms.

### 2.2 Labels are still DOM

Until §3.3 of revision 1 is done the page pays, on every label solve or value refresh: SVG `textContent` writes, `setAttribute`
on transforms, style recalc of the `#labels` subtree, then the GPU label atlas re-upload from those elements. Even with `display:none`
on the organs, the SVG label layer and `#backdrop/#ascites/#ghosts` (`visibility: hidden`) are in the style tree.

**Fix (unchanged from revision 1, now the top structural item).** Label records in JS; text measured once per string into a cache;
the collision solver in a worker (pure geometry), the main thread posting camera + anchors + obstacle boxes and receiving slots; value
refresh as an instance-buffer rewrite; the SVG `#labels` removed from the DOM when GL labels are live (kept only for the no-WebGL
fallback, built on demand). Also remove `#backdrop`, `#ascites`, `#ghosts` nodes under `gl-plate` instead of hiding them.

### 2.3 Several contexts, transparent canvas, SVG hit strokes

Unchanged from revision 1 §3.5 and still the compositor floor on every frame: the transparent figure canvas blended over the page,
the GL label canvas and glass as separate layers where not hosted, and in the lobule up to four full-screen contexts (`field-gl.js:83`,
`tissue-gl.js:98`, `sinusoid-gl.js:530`, plus the vessels; `fx-gl` is folded in under `LZ_ONE`). Each context is a layer, a drawing
buffer (DPR² × 4 bytes × 2) and a separate submit.

**Fix.** One `alpha: false` WebGL 2 context for the figure, with the lobule's field/tissue/sinusoid, the labels, the glass and the
docked instruments drawing into viewports of it; `endo-gl.js:200` ported from WebGL 1. Hit testing from the lumen buffer the vessel
pass already writes (row id per pixel), read with a PBO + `fenceSync` and polled next frame; then `.v-hit` strokes and
`elementFromPoint` go. The `OWN_BUF` whole-canvas blit per drawn frame (`veins-gl.js:2751`) becomes unnecessary once the canvas is
opaque and the figure lives in its back buffer.

### 2.4 The store broadcast and the snapshot's object half

`store.set({ frame })` (`main.js:472`) wakes every `frame` listener and five `'*'` listeners synchronously (`store.js:60-61`), in the
must frame, before any may task runs. The worker's snapshot (`worker-core.js:195-221`) transfers six typed arrays but still clones
`metrics` (an object per frame from `detectEvents`), `slow`, `bands`, `bleed`, `events`, `samples` (the dock's traces), and the page
deserialises them on the main thread on arrival (`host.on('frame')` → `ingestFrame` → `dock.ingest(f)` runs as a message task, outside
the scheduler).

**Fix.** (a) The store takes a `changed` mask from the worker (it already sends `changed`) and wakes only listeners of the sections that
changed; `'*'` listeners are removed (five call sites). (b) `metrics`, `slow`, `bands`, `bleed` and `samples` go into one more
transferred `Float32Array` with a fixed layout (an index table shared by `engine/` and `ui/`); `events` stays a small JSON array.
(c) `ingestFrame` runs inside the scheduler's read phase, not in the message task. (d) The worker's tick becomes a `setTimeout`
chain aligned to the paint ack rather than a fixed 33 ms interval, so the worker is never building a frame while the page is painting
the last one.

### 2.5 Six policies, none of which can shorten a callback

`frame.js` now has: watchdog shedding (`DEFERRABLE`, 70%, `SHED_MAX = 3`), governor yielding (`SECONDARY`, 85% or 50% after a streak,
`SEC_MAX = 2`), may budgeting (42%, `MAY_WAIT = 4`), EMA cost prediction for both, `frameAnimating` exemptions; `prep-budget.js` adds a
ledger for between-frame work; `adapt-tier.js` steps resolution on 3-of-6 misses; `gpu-budget.js` flags pressure from counted pixel
area. Every one is a *deferral*: a callback judged too expensive is carried to a later frame and, after `SHED_MAX`/`MAY_WAIT`, run
anyway. A callback that costs 6 ms costs 6 ms whichever frame it lands in. The policies also interact: a may task aged past 4 frames
runs regardless of budget in the same frame the watchdog is trying to protect; the tiers read `graphOver()` which reads counted area,
not time, so a cheap-but-large pass (the whole-canvas blit) looks like pressure and a small-but-slow one (the SDF cell loop) does not.

**Fix.** (a) Collapse to **one** policy: a priority queue (0 camera/input/blood, 1 model-frame application, 2 instruments, 3 chrome),
one budget check before each callback with the EMA cost, and **every** priority-1..3 callback required to be sliced (returns `true` to
continue). Delete `DEFERRABLE`/`SECONDARY` name sets, `SHED_MAX`, `SEC_MAX`, the "aged" override (a sliced task cannot starve: it
always gets its slice), and the three `perfMode`s (there is one correct behaviour: hold the refresh). (b) Fix the biggest callbacks
instead of deferring them: `stage.update` (§2.1), `card.update`, `dock.update`, `layoutLabels` (§2.2), the glass reblur (§2.7). (c) Keep
`adapt-tier` but drive it from frame slip *and* from `EXT_disjoint_timer_query_webgl2` where available (Chrome), and apply the tier
to the still view too, not only moving frames: a phone that cannot draw the still anatomy at Full in 6 ms will not hold 120 Hz at rest.

### 2.6 Per-call GL wrappers on the hot path

`gpu-budget.js` is on by default (`GPU_BUDGET = GL_STATE && !?gpubudget=0`) and is fed by `gl-state.js` wrappers that intercept every
GL call (`onGLCall`), adding "two numbers" per draw and a registry update per allocation. The scheduler also keeps `counts`, `totals`
and `parts` Maps and calls `performance.now()` around every callback. Individually microseconds; across a few hundred GL calls and a
dozen callbacks a frame it is tens to hundreds of microseconds on an A15, taken from a 3.5 ms budget, on every frame, for diagnostics.

**Fix.** Make the GL wrappers and the per-callback timing **sampling** (one frame in 30) or opt-in under `?perf`, as `layoutReads`
counting already is. `frameBudget()`/`overBudget()` only need the frame's total, which one `performance.now()` at the end gives.

### 2.7 Glass re-blurs on every changed frame by default

`glass-gl.js:413` `reblur = REBLUR_URL ? REBLUR_MS : 0`: the 50 ms hold from revision 1's own list of "done well" is now off by
default, so while the blood moves under a card the blur passes run every frame (the comment at `glass-gl.js:44` explains the iPhone
flicker that motivated it). Combined with 6f79e3df (the frost follows a zoomed card's transform every frame) this is a per-frame
multi-pass blur at `glassDpr` over every card's region.

**Fix.** Blur the still figure (vessels, organs, no blood) once per figure change into a quarter-res texture and composite the moving
blood under the glass as a flat tint; the glass then never re-blurs for blood. Keep the per-frame transform follow (it is a cheap
quad). Remove the remaining 15 CSS `backdrop-filter`s (pills, toasts): solid or GPU glass.

### 2.8 Remaining per-frame allocation and string work

`stage.js:12514` still builds the still-frame key string every still frame (`wrap.className` read included); `marksKey()`,
`olList.some(...)`, `EV.some(...)` in the sleep condition; `?fps=120` builds a sorted string on every overrun; `frame.js run()`
allocates `[tag, cb]` per ask. GC pauses of 1 to 4 ms on random frames are invisible at 60 Hz and visible at 120.

**Fix.** Replace the key with a struct of numbers compared field by field (a `stillSig` object mutated in place); `marksKey()` and the
`some` scans become dirty flags set where the state changes; the scheduler keeps a preallocated ring of slots. Gate: an allocation
sampling profile over 10 s of steady anatomy shows zero allocations on the must path.

### 2.9 Flags and bytes

217 runtime switches and 4.94 MB of JS. Each switch is a second implementation in the bundle and a branch in the frame path; each
forty-commit day adds about twenty. The 1.1 MB chunk is still parsed on first use.

**Fix.** A one-day deletion pass: keep `?perf`, `?offgpu`, `?fps`, `?budget`, `?inputs`; every other switch's losing branch is
deleted. Then split the 1.1 MB chunk so no chunk exceeds 200 KB and preload every chunk a view can reach before the user can reach it
(the lobule's when the anatomy idles 1 s; the presenter's when the menu opens). Target ≤ 2.5 MB.

### 2.10 Measurement on a real GPU

Nothing in the pipeline has ever measured a GPU frame. `scripts/frame-gate.mjs` runs on SwiftShader; `adapt-tier` and `gpu-budget` infer.

**Fix.** A self-hosted Apple-silicon runner with Safari Technology Preview and Chrome; the gate becomes p99 interval ≤ 1.1 × refresh and
zero frames over 2 × refresh across the scenario list; the software-GL run keeps only the CPU gate (p99 script ≤ 3.5 ms, no task over
8 ms on the 6× phone profile). In the app, a one-tap "copy report" of the last 60 s (frames, overruns with surfaces, tier changes,
shed counts, layout reads by phase, allocations if sampled) so the owner's devices become the test bench.

---

## 3. New risks introduced since revision 1 (watch these)

- **Deferral masquerading as a fix.** `shedStats().byTag` and `mayStats().aged` will show, on a phone, which surfaces are being carried
  and then forced. If `aged` climbs, the frame is not being held; the hitch is being moved. Report both numbers in `?perf` and treat a
  non-zero `aged` as a failure.
- **Tier oscillation.** `adapt-tier.js` steps down on 3 of 6 and up after 1.5 s calm; a pass that is borderline will cycle every ~2 s
  (visible as periodic softening). Add hysteresis (up only after the *predicted* cost at the higher tier fits) and log the cycle count.
- **The first run of any may task is unbudgeted** (`mayCost` has no entry, so `used + 0 > limit` is false). A first `card.update` on a
  heavy slide lands whole. Seed costs from a static table.
- **`painted` ack latency.** The worker now waits up to 400 ms for an ack; a page that paints late (a long frame) now also delays the
  next physics frame, which shows as uneven motion in the traces. Decouple: ack on *ingest*, not on paint.
- **Diagnostics on by default** (§2.6). Every "cheap end-of-frame signal" is paid on every frame on every device.

---

## 4. Order of work from here

| Step | Work | Removes |
|---|---|---|
| 1 | `stage.update` split: must = vessel attributes only; geometry, organs, labels, home as sliced may tasks (§2.1) | the last large must-frame piece |
| 2 | One scheduler policy, all non-zero priorities sliced, diagnostics sampled (§2.5, §2.6) | deferral churn, policy interactions, per-frame overhead |
| 3 | Store keyed by `changed`, snapshot fully typed-array, ingest inside the scheduler, worker tick aligned to ack (§2.4) | the synchronous broadcast and clone cost |
| 4 | Labels off the DOM, solver in a worker (§2.2) | SVG style recalcs and the solve on the main thread |
| 5 | One opaque context, picking texture, remaining SVG nodes removed (§2.3) | the compositor floor, lobule multi-context stalls, SVG hit tests |
| 6 | Glass blurred once from the still figure, CSS backdrop-filters gone (§2.7) | per-frame blur passes |
| 7 | Tiers on the still view too, GPU timer where available (§2.5c) | sustained overload on phones |
| 8 | Zero allocation on the must path (§2.8) | GC hitches |
| 9 | Flag deletion pass, chunk split and preload (§2.9) | parse stalls, bundle size, dual paths |
| 10 | Real-GPU runner, device report (§2.10) | flying blind |

---

## 5. Acceptance criteria (unchanged in substance)

1. Mac and iPad Pro Safari/Chrome at 120 Hz, iPhone Safari at 60 (120 with the flag off): zero frames over 2 × refresh and p99 ≤ 1.1 ×
   refresh over 60 s in every scenario (idle anatomy running, hover, pan, pinch, lens, lobule in/out, sinusoid, every deck's slide
   changes, menu, dock, Doppler and FibroScan live), read from the app's own report.
2. Main-thread script p99 ≤ 3.5 ms and max ≤ 8 ms on the 6× phone profile with draws stubbed, gated in CI.
3. `shedStats().byTag` and `mayStats().aged` both zero over any 60 s scenario on a phone (nothing deferred, nothing forced).
4. Zero layout reads after writes (`layoutReads().afterWrites === 0`) in every scenario; zero per-frame allocation on the must path;
   one WebGL context in every view; no SVG node for organs, labels or hit strokes in the live DOM on the GPU path.
5. Bundle ≤ 2.5 MB; no chunk over 200 KB; no `import()` triggered by a user input; ≤ 5 runtime switches.
6. Ten minutes of the running anatomy on an iPhone does not step the tier below 0.71 (no thermal collapse).

---

## 6. File and line references (for `6f79e3df`)

- `src/ui/frame.js`: `:118-131` `run()` (per-callback timing, shedding check); `:142-178` refresh and budget; `:180-266` watchdog,
  governor, perf modes, EMA costs; `:268-336` must/may (`MAY_SHARE`, `MAY_WAIT`, `mayTask`, `runMay`); `:337-351` `?fps=120`;
  `:589` `figOpts` (move 1, adapt false, cap 8); `:617` `FIG_LAB` defaults (all off except `creditLean`).
- `src/ui/main.js`: `:465-500` `paintFrame`, `PAINT_PARTS`, `MODEL_SLICE`; `:472` the store broadcast; `:473` `stage.update` as must.
- `src/ui/store.js`: `:56-61` `set()` fan-out to key and `'*'` listeners.
- `src/worker-core.js`: `:190-228` the snapshot (`frame()`), transferred buffers at `:228`; `:247, 309, 418-421` paint ack; `:347` 33 ms tick.
- `src/ui/stage.js`: `:147-149` blood anchors; `:1978-1987` `elBox`; `:3459` `updateInner`; `:3670, 3770` `updateLabels` from the model
  frame; `:12514` still-frame key string; `:12637, 13215` `elementFromPoint` on `.v-hit`; `:12574-12576` GPU hold.
- `src/ui/layout-snap.js`: the one read module; `:14-24` counting only under `?perf`/`?offgpu`.
- `src/ui/label-gl.js:3-13`: the SVG label layer stays the model.
- `src/ui/veins-gl.js`: `:1864` context attributes (`alpha: true`); `:2705-2751` `present()` whole blit.
- `src/ui/glass-gl.js`: `:43-46, 413` `REBLUR_MS` opt-in, default 0.
- `src/ui/adapt-tier.js`, `gpu-budget.js`, `prep-budget.js`, `pixel-budget.js`: the new budgets.
- Contexts: `field-gl.js:83`, `fx-gl.js:125`, `tissue-gl.js:98`, `sinusoid-gl.js:530`, `sinusoid-view.js:170`, `glass-gl.js:426`,
  `label-gl.js:490`, `doppler-gl.js:46`, `fibroscan-gl.js:68`, `endo-gl.js:200` (WebGL 1), `lobule-zoom.js:681`, plus trace-gl,
  vitals-gl, wide-gl, res-cover-gl, sw-yield, gl-support.
- `styles/app.css`: `:131, 135` organs under `gl-plate`; 15 `backdrop-filter`; 189 `box-shadow`; 0 layout-property transitions.
- `dist/assets` (built from this commit): 4.94 MB JS; chunks 1106 / 898 / 813 / 531 / 306 / 266 / 220 / 210 KB.
- Switch count: `grep -ho '/\[?&\][a-z0-9]*=' src/ui/*.js | sort -u | wc -l` → 217.
