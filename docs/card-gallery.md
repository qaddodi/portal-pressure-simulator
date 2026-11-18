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
  `--write <file>` also writes the ids as a JSON array, the file `?gallery&sweep=affected` reads beside the page (the deploy does not write it yet).
