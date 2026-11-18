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
