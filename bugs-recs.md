# Bug and defect audit: first pass (code reading, preview `f8a74747`, 2 Nov 2026)

Scope note: this is the first, cross-cutting pass only. The per-area deep audits (figure, GL renderers, presenter, lobule,
core/worker, instruments/CSS) did not complete in the session; their scope is listed in §3 so they can be run next. Every item in
§1 was checked in the code at `f8a74747`.

## 1. Confirmed by code reading

1. **GL buffers and vertex arrays are created far more often than deleted.** Across `src/ui`: 48 `createBuffer` vs 13 `deleteBuffer`,
   41 `createVertexArray` vs 13 `deleteVertexArray` (textures and framebuffers are balanced: 44/63 and 42/38). Buffers made on a resize,
   a view change or a slide and never freed are a GPU memory leak that grows per session; on iOS this ends in a killed tab. Fix: every
   module that creates a buffer or VAO owns a `dispose()` that deletes it; `gl-state.js`/`gpu-budget.js` already see every create, so
   have the registry assert (under `?perf`) that each is deleted when its owner's view closes.
2. **Event listeners are almost never removed.** 426 `addEventListener` vs 35 `removeEventListener` in `src/ui`. Most are page-lifetime,
   but any added inside a function that runs per slide, per card, per callout or per lobule open accumulates (presenter.js, card*.js,
   lz-pills.js, callout.js are the places to check first). Fix: `AbortController` per owner, `signal` on every listener, `abort()` on dispose.
3. **ResizeObserver: 63 created, 55 disconnect/unobserve calls**; MutationObserver: 59 created, with no systematic disconnect. Observers
   on removed nodes keep closures alive. Same fix as 2: owner-scoped disposal.
4. **Six `setInterval`s, two `clearInterval`s.** `stage.js:5223` (organ-paths diagnostic box) and `credit.js:835` (corner-credit poll) run
   for the page's life; `offgpu-overlay.js:173`, `perf-readout.js:303, 324` are diagnostics. The credit poll runs `querySelectorAll('#labels .lb…')`
   every second even in Present. Fix: make the credit poll a `mayTask` with `notBefore`, stopped while the credit is hidden.
5. **Swallowed exceptions.** `catch {` with an empty body: main.js 21, stage.js 16, label-gl.js 15, frame.js 9, presenter.js 8,
   glass-gl.js 8, veins-gl.js 6, trace-gl.js 6. Each hides a real failure (a GL error, a storage error, a bad deck). Fix: route every one
   through one `warn(tag, e)` that counts and surfaces under `?perf`.
6. **`100vh` on iOS.** `app.css:1280, 1282, 1283, 1572, 4124` size the action card, palette list and app menu with `100vh`, which on iOS
   Safari includes the hidden toolbar area: the card bottom sits under the toolbar. Fix: `100dvh` (used elsewhere already, 7 places).
7. **Fixed cover with `z-index: 2147483000`** (`app.css:4962` `.pz-cover`) and `9999` (`:7518` `.organ-paths`): anything the browser or an
   extension overlays, and the preview badge, will sit under the cover. Fix: a stacking scale (toast 50, cover 40, menu 30…) in tokens.
8. **The still-frame key reads `wrap.className`** (`stage.js:12514` region): any class order change (two toggles in one frame) is a
   redraw, and a class toggled every frame (busy, gesture classes) defeats the sleep. Fix: compare a struct of the classes that matter.
9. **Glass re-blurs on every changed frame by default** (`glass-gl.js:413` `reblur = REBLUR_URL ? REBLUR_MS : 0`): visible as shimmer
   under cards while blood moves, and a cost (see recs.md §2.7). Fix: blur the still figure once; tint the blood.
10. **Paint ack can stall the clock** (`worker-core.js:247, 309`): a frame never painted (hidden tab, a slide change dropping it) holds the
    next model frame up to 400 ms; on return the traces show a step. Fix: ack on ingest, not on paint; clear `unpainted` on `visibilitychange`.
11. **Deck import is safe** (checked: `deck-source.js:384-425` uses a custom tokenizer/evaluator, no `eval`/`Function`), and the remaining
    `backdrop-filter` lines in CSS are `@supports` tests, not live blurs. No action.

## 2. Tests worth adding now

- A GL resource ledger test: open and close every view and every deck slide in headless Chromium, assert `pps.budget()` memory returns to
  its baseline (±1 MB).
- A listener/observer ledger: wrap `addEventListener`/observers in a test harness, assert counts return to baseline after each slide.
- `catch {}` lint rule: forbid empty catch bodies outside a whitelist.
- CSS lint: forbid `100vh`, hard-coded z-index above 100.

## 3. Deep audits still to run (one engineer-day each, read-only, then fix)

stage.js 1-7000 (camera, dive, home look, context restore); stage.js 7000-end (labels, blood rows, sleep/wake, hit testing);
veins-gl.js and the GL modules (context loss, MRT formats, premultiply, partial redraw seams, atlas overflow); presenter.js and cards
(transition races, zoomed-card stand-in, layout-snap desync, per-slide leaks); lobule-zoom.js and its contexts (dive copy drift, tile
streaming, canvas memory); worker/engine/main (ack races, hidden-tab dt, paint gate starvation, SW update flow); instruments and CSS
(still-layer keys missing theme/palette/DPR, fractional-DPR blur, HVPG procedure state machine, Navy/Black token coverage).
