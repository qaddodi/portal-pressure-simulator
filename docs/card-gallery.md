# The card gallery (preview only)

Plan: `/mnt/project-files/card-gallery-plan/debug-page-recs.md`. Code: `src/ui/gallery/`.

## Plug-in points for parts of the page

`src/ui/gallery/registry.js` (pure, no DOM):

- `registerPanel({ id, title, order?, mount(host, ctx) })`: a tool in the page's top bar and drawer (Check, Freeze ...).
- `registerBench({ id, title, group, summary?, order?, mount(host, ctx) })`: a debug bench, one entry in the rail under "Benches".

`mount` draws into `host` and may return a dispose function (or `{ dispose }`). Add one `import './your-module.js';` line to
`src/ui/gallery/plugins.js`; your module registers itself when imported. `ctx` is described in `registry.js`
(`pps`, `specimen()`, `onSpecimen(fn)`, `look()`, `setLook(id)`, `toast(text)`, `catalog`).

Rules for parts: no `requestAnimationFrame` (use `frameFor(tag)`), no per-frame DOM writes outside transform and opacity, layout
reads through `layout-snap.js` and only on a tap, nothing imported by the live app (the page chunk loads only with `?gallery` on the
preview copy).

## Test controls: `window.pps.gallery` (preview, with `?gallery`)

`src/ui/gallery/api.js` (tests: `tests/gallery-api.test.js`). Plain JSON, for a harness, a sweep, or the browser console:

- `list({ family, section, kind })`: `[{ id, section, family, kind, title }]`.
- `open(id, { look, timeoutMs })`: `Promise<{ id, ok, settled, ms, look, errors, error? }>`, resolved once the specimen has landed (nothing moving for 300 ms).
- `settled({ timeoutMs, quietMs })`: `{ settled, ms }`. Call it after a window resize: the cards refit.
- `check()`: the fit rules' problems as data, `{ id, look, size, problems: [{ kind, text, line, where }], busy, slide, structure }`.
- `words()`: `{ id, look, vw, vh, cards: { '.pz-text': [words] } }`; `boxes()`: `{ ..., boxes: { '.pz-text': [l, t, r, b] } }` rounded to 2 px.
  Both readers (`readers.js`) are self-contained like the fit rules' (`scripts/fit-io.mjs` can send them into a page). Words drawn by the GPU are not in the page.
- `sweep(spec)` hands over to the runner the Sweep panel registers with `registerSweep(fn)`; `fn(spec, api)` returns the report.
  `spec`: `{ all | affected | family | ids, looks, with: ['check','words','boxes'], fresh }`.
- The root has `data-gallery-state="idle|opening|settled|failed"` and `data-gallery-id`; wait on the attribute.
- `?gallery&sweep=<all | affected | family | ids:a,b>&looks=light,navy&with=check,words&fresh=1` starts the sweep at boot and writes the report to
  `window.ppsGalleryResult` and `<pre id="gallery-result">` (JSON), with `data-gallery-sweep="running|done|failed"` on the root.
  `sweep=affected` reads `gallery-affected.json` beside the page.
- The settled test is sampled (100 ms) only while a call waits: the presenter and the camera announce no "done" event, so a quiet window is the signal.

## The Phone check (preview only): `/preview/?check`

The fast answer to "a script I can run on my phone that finds everything" (19 Nov 2026). The Sweep opens every specimen (about 290, 45 to 60 minutes). The Phone check does
not: the iPhone's tab kills came from *paths* (the Tests card pane to pane, the HVPG deck's slide 5 to 6, a close zoom then the lobule), so it walks the paths and reads
what the page holds after **every step**. Open the link, put the phone down, and about three minutes later it shows one report and a Copy button.

- **Code:** `src/ui/gallery/journeys.js` (the paths, pure data, shared with any Node rig: `tests/gpu-journey.js` imports the same steps and brings its own executor),
  `walk.js` (the runner, the flags and the report; pure, tested by `tests/gallery-walk.test.js`), `walk-exec.js` (plays a step through `window.pps`, reads
  `gpu-budget.js` and `gl-contexts.js`), `phone-check-panel.js` (the overlay, the address, the test clock, the wake lock). `main.js` loads the gallery page for `?check` on the preview copy.
- **Address:** `?check` (the paths that would start after 200 s are dropped and named), `?check=full` (no limit), `&rate=8` (test-clock speed, default 6; `1` is real pace),
  `&only=views,panes` (just those paths), `&fresh=1`. The Tools sheet has a "Phone check" button too.
- **Speed:** the page runs on the test clock (`pps.testClock({ rate })`), which skips the waiting between frames; each step waits only until the camera, the presenter and the
  cards are still. One look, no easing waits, layout judged where the walk already stands (never a second open for it), one card of each family rather than every state.
- **What it walks (priority order):** every move between the four views; every Tests pane forward, on a TIPS patient (IR pane to Doppler, the 18 Nov crash) and back; the catheter-tip
  zoom with the IR pane open, then into the lobule; HVPG slide 5 to 6 and back four times; each structure card one after another and the lobule's parts; procedure slides; the
  heaviest two slides of every deck (`heaviestPair`); one card of every teaching-card family.
- **What it reads after each step:** the GPU estimate and the page's highest mark, live contexts (own, charts, live, lost), who grew (`budget().owners`), `holdersNow().unmetMB`, counted errors,
  and the fit rules (`pps.gallery.check`) and the self-check rules (`pps.screen` findings) at every stop that is not a camera transit.
- **What it flags:** 92% of the phone envelope or more ("at the limit", the same gate as the node walker), a step's own gate (tip zoom with a pane open 75%), unmet pressure, a rest above 60% before a
  path begins, a step that adds 25 MB or more (naming the owners that grew), a path that keeps 15 MB or more after everything is put away, more than 2 own contexts or 12 live, a lost context, a step that
  failed or did not settle, and fit or self-check findings (the same words at several stops are one line).
- **Tab kills:** the place is kept in `sessionStorage` before each step starts. A reload that finds a step still open reports it ("THE TAB WAS ENDED on ... step 3, after these steps, the last read
  was 260 MB") and goes on with the next path on the clean page; after 3 kills it stops and reports. The page's own `last-seen` line (`report.js`) is added to the report.
- **Cannot judge:** how anything looks, wording, motion smoothness, shaders no step compiles, states no step reaches, the layout of all 290 cards (the Sweep, or the headless layout sweep),
  and anything the test clock's faster pace hides (a race that needs real time). A device with no Sinusoid view reports the move as a failed step.

## The Node specimen runner (`tests/gallery-specimens.test.js`)

Runs in `npm test` (so in Quick on every push), no browser. Each specimen of the catalog is opened on the page's own DOM (jsdom, `scripts/warm/` GL stand-in,
a clock `tests/gallery-node.js` moves): a teaching-card slide as the presenter puts it up (instrument, tiles, words), a Tests-card pane in the real dock, a structure
card (and its Details face) in the real card. Each must open with no throw, console error or caught error; its words (title, line, notes, card, tiles, aria-labels,
as the page writes them) pass `scripts/clinical-wording.mjs` plus Baveno VIII only and "PPG (PV − IVC)"; a tile's and a header reading's number is the model's, as the
tile table prints it; and a card that is opened and closed twice leaves the GPU holding what the first close left (a context a card gives up with `WEBGL_lose_context`
counts as freed). A failing leak names where the kept context was made. A new instrument needs a `dispose` that gives its GL context back.
Cannot judge: fit (jsdom has no layout), shaders (`scripts/glsl-compile.mjs`), looks, timing. The sheets (Treat, History, menus, palette, toasts) are not opened here.
The first run works out each deck's states and each curve's sweep (about 100 s); they are kept in `node_modules/.cache/pps-deck-states`.

## Sweep and "what to test" (preview, with `?gallery`)

- **Sweep button** (`sweep-panel.js`, Tools > Sweep; logic in `sweep.js`, pure and tested by `tests/gallery-sweep.test.js`). Pick a scope (everything, a section,
  a family, or the specimens a link names) and the looks, press Sweep, and leave the device on the table. It keeps the screen awake, opens each specimen
  through `pps.gallery.open`, runs the shared fit rules (`check()`), and ends with one report to copy: fit problems per specimen, specimens that did not open
  or settle, errors counted (`pps.caught`), GPU memory peak, the slowest frame (from `pps.perf.frames`) and the slowest openings. The same runner answers the
  address (`?gallery&sweep=...`, through `registerSweep`), so a link starts it with no tap.
- **Resume.** The place is kept in `sessionStorage` after every specimen. If the browser ends the tab (an iPhone kill), the reload goes on from the next
  specimen and the report lists the one that was open as "Lost to a reload". After 3 such reloads the sweep stops and reports what it has.
- **`npm run gallery:affected`** (`scripts/gallery-affected.mjs`, tested by `tests/gallery-affected.test.js`). Maps the files changed since the branch's upstream
  (`--base <ref>`, `--files a,b`) to specimens: each family's modules in `FAMILY_ENTRY`, walked through their imports three levels deep but not through a
  module a dozen others import, plus `SHARED_FILES` and `CSS_FAMILIES`. A catalog change names exactly the entries that differ from the base. A hub change
  (util.js, store.js, tokens.css) is "broad" and says to sweep everything; a deck file is listed as "test by hand". It prints a deep link for each of up to 10
  specimens and one Sweep link (`?gallery&sweep=ids:a,b&fresh=1`) for the rest. A new catalog family needs its modules in `FAMILY_ENTRY` (the test fails until it has them).
  `--write <file>` also writes the ids as a JSON array, the file `?gallery&sweep=affected` reads beside the page (the deploy does not write it, because a deploy has no git history to diff against; the push message's `sweep=ids:...` link is the list, and `sweep=affected` on a preview says so).
