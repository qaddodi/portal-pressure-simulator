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
