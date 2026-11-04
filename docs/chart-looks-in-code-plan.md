# Chart looks in code: one table in JS, no style reads (pure GPU plan A3, looks part)

Written 4 Nov 2026 against `claude/settings-topbar-icon-flvft1` at 3991815 (the revert of 78c0f32). This is a plan only. No code has been
changed for it yet.

## In one paragraph

Today every slide chart is built twice: once as a hidden copy made of page elements (the "model"), and once as the GPU picture.
svg-gl.js asks the browser how each hidden piece looks (`getComputedStyle`, svg-gl.js:106). The browser answers from about 470
rules in `styles/app.css` that set chart colours, line widths, dashes, opacity, type and eases, layered by theme, palette, dark mode,
the card's layout and size, the chart's host, and data states such as `data-rate="mid"`. The plan moves those looks into a JS table
written by hand. Every chart piece is given a named look key. One small resolver turns key + context + state into the look record
svg-gl already draws from. The colour tokens that the rest of the UI also uses come from the same JS table. A script writes them into
`tokens.css`, so the page's CSS and the charts can never disagree. Each chart's CSS rules are deleted in the same PR that moves that
chart. When the last chart is done, the style-reading path in svg-gl is deleted too.

## Why not the reverted approach (78c0f32)

78c0f32 added `src/ui/look-tokens.js`, filled by a headless browser run (`scripts/gen-look-tokens.mjs` plus a workflow). It
captured each piece's computed style under 5 looks × 2 sizes, keyed by a hash of the piece's class string and its place in the page.
It was reverted for three reasons:
- **The browser stayed the source.** The CSS kept the real definitions and the JS table was a copy of what one run happened to compute.
  Any size, deck or state the run did not visit was missing.
- **The keys could not be read.** A hash of `pk>tag.class|attr…` tells a reviewer nothing, and two contexts could share a key
  ("key reads two ways; the later one is kept").
- **A gap or a wrong guess was silent.** A miss fell back to the browser, and a wrong capture miscoloured a chart with no sign.

This plan turns that around. The JS table is the only definition. It is written by hand, with readable keys, and the CSS rule is
deleted in the same PR. Nothing is captured from a browser. Nothing in the shipped code re-runs the CSS cascade. A key missing
from the table is an error you can see (see §6), never a quiet fallback.

## What the inventory found

Counts come from a one-off node scan of `styles/app.css` (5,563 rules). It kept rules whose selector names a class that a chart
builder writes onto its model, and whose body sets a look property (paint, stroke, opacity, font, letter spacing, transform case,
paint order, transition).

| Builder (file) | Class prefixes | Look rules | Layers seen |
|---|---|---|---|
| talk-trace.js | `ptk-` (shared: also used by flow-time, curve, course, profile) | 43 | dark theme ×4, color-mix ×8, data-rate ×11, host (`.pz-talk`, `.pz-curve`…) ×14, em/`--svk` sizes ×14 |
| flow-time.js | `pft-` (shared with curve, course) | 25 | dark ×4, mix ×4, host ×6, em ×9 |
| tool-curve.js | `pcv-` | 39 | mix ×7, data-* ×6, host ×16, transitions ×8 |
| tool-course.js | `pco-` | 4 | mix ×4, data-* ×3 |
| tool-profile.js | `ppf-` (shared with tool-flows) | 34 | mix ×2, data-* ×4, host ×6, em ×13 |
| tool-flows.js | `pfl-` | 7 | `--tone` per piece |
| tool-causes.js | `pcs-` | 21 | mix ×5, data-* ×10 |
| tool-criteria.js | `pzc-`, `pzz-` | 47 | mix ×9, data-* ×8, host ×12, em ×20, transitions ×12, 1 container query, 1 reduced-motion |
| visual-plane.js | `pze-` | 53 | data-* ×18, own vars `--pze-*` with dark overrides |
| tool-fluid.js | `gf-`, `gs-` | 21 | own vars `--gf-*`, `--gs-*` |
| tool-lumen.js | `gl-` | 6 | own vars `--gl-*` |
| instruments.js (dials) | `ab-`, `wall-`, `chart-` | ≤107 (some are HTML) | data-* ×33, transitions ×21 |
| presenter.js (card charts) | `c-`, `pzq-`, `pzw-` | 50 | mix ×13, host ×20, transitions ×9 |
| timeline, lobule-zoom leaders, sinusoid-view, callout, gl-words | `tl-day-gl`, `lz-call-*`, `leader`, `leader-dot`, `cl-*`, attribute fills | ~25 | transitions ×8 |

That is about 470 chart look rules. The "~600" figure also counts about 130 figure SVG rules (`org-`, `lb-`, `lv-`, `band-`,
`cath-`, `stent-`…). Those belong to the figure (A2) and are out of scope here.

How the layers actually reach the charts:
- **Theme, palette, dark mode.** `looks.js` sets `data-theme` (light | soft | dark) and `data-palette` (navy | black) on `<html>`.
  If neither is set, `prefers-color-scheme` decides (look.js `darkMQ`). `theme-epoch.js onTheme()` already runs every listener in one
  frame after any change, the device's own dark mode included. (svg-gl's own observer, svg-gl.js:837, watches only the two attributes,
  so it misses a system dark switch. The resolver fixes that by using `onTheme`.) 21 of the ~200 theme-varying tokens are read by charts.
- **Circuit view.** `.stage-wrap.cmap` re-defines about 40 tokens in dark looks (tokens.css:410-523). The dock's instruments sit inside
  `.stage-wrap`, so their dials change colour with the view. This is one more context axis (`view`).
- **Screen size and "per-deck" sizes.** No chart rule has a viewport media query of its own. Screen size reaches the charts only
  through the card type scale: `--pzh` (1vh, app.css:26-27), `--s-cap/--s-lab/--s-val` (clamp formulas, app.css:1876-1896, 2575-2627),
  `--pz-sm` and `--ch-cap` (2266, 2806), `--fs-12/--fs-14` (2851), the text-size setting `--ts` (stage.js:10136), the card layout
  classes `.stack`, `.low`, `.tab` (presenter.js:4270-4282), the card fit `--pz-fit` (presenter.js:3868), and the chart's own letter
  scale `--svk` (presenter-tools.js:84). There are no deck selectors. What differs "per deck" is the fit and layout of the deck's card.
  All of these inputs are already numbers or classes that JS sets.
- **Host.** The same `ptk-*` piece looks different under `.pz-talk`, `.pz-curve`, `.pz-flowtime`, `.pz-prof` and
  `.pz:not(.stack) .pz-cell`. The host is a context axis too.
- **States.** `data-rate` (32 rules), `data-tone` (37), `data-lit` (22), `data-met`, `data-q`, `data-tc`, `data-kind`, `data-dir`, plus
  classes such as `cut`, `now`, `on`, `off`, `miles`, `has-bands`. Builders write these onto the model. svg-gl re-reads looks when
  `class` or `data-rate` changes (svg-gl.js:976).
- **Per-piece colour parameters.** Inline `--rx` (treatment band colour: talk-trace.js:84, flow-time.js:203), `--tone`
  (tool-flows.js:380), `--site`, `--i`, `--bs`.
- **color-mix.** 335 uses are `in srgb` and 14 are `in oklab` (chart rules use both).
- **Eases.** svg-gl reads `transition-*` off each piece (svg-gl.js:154 `opEase`) to run opacity and transform eases itself. Those are
  looks too and must be in the table.

Style reads on the chart path today: svg-gl.js:106 (the whole look) and :222 (`SCALE_VARS`), svg-morph.js:269 (opacity), and the
builders' host font size, `getComputedStyle(el).fontSize`, in talk-trace (×2), timeline (×2), flow-time, tool-causes, tool-course,
tool-criteria, tool-curve, tool-flows, tool-fluid, tool-profile (×2) and visual-plane, plus instruments.js:441. That is 17 calls.

---

## 1. The shape of the table

### Files

```
src/ui/chart-looks/
  dsl.js        tok(), mix(), param(), px(), em(), svk(), cap(), ease()  (tiny constructors, no logic)
  resolve.js    the resolver: context, layer order, memo, output = svg-gl's look record
  index.js      merges every chart's file into one LOOKS map; host base sizes (HOSTS)
  plot.js       pieces shared by several charts: today's ptk-*, pz-plotbg, pft-key
  talk.js  time.js  profile.js  causes.js  crit.js  plane.js  fluid.js  lumen.js  inst.js  card.js  small.js
src/ui/theme-tokens.js   every theme-varying colour token, per look, per view (the source tokens.css is written from)
src/ui/card-scale.js     the card type scale in JS (cap, lab, body, val, sm, chCap, fs12, fs14) from JS inputs
```

### A look entry

An entry is plain data: a `base`, then an **ordered** list `when` of `[condition, props]`. Every matching row applies in list order,
and a later row wins. There is no specificity. Whoever translates a CSS group writes the rows in the order the CSS cascade picks a
winner (specificity first, then source order). They work this out once, by hand, and show it in the PR table (§7). Here is the real
`.ptk-grid line` group as it would be written:

```js
// plot.js: today's .ptk-grid line (app.css 2956-2958, 7235, 7628, 2280)
'plot.grid.line': {
  state: { cut: 'class:cut', rate: 'data-rate' },          // read off the piece or its ancestors (inherited down the model)
  base: { stroke: mix('srgb', tok('text'), 11, 'transparent'), width: 1 },             // 2956  (0,1,1)
  when: [
    [{ cut: true },   { dash: [4, 5], width: 1.5 }],                                     // 2957  (0,2,1)
    [{ rate: 'mid' }, { stroke: tok('caution') }],                                       // 2958  (0,2,1)
    [{ rate: 'hi' },  { stroke: tok('danger') }],                                        // 2958  (0,2,1)
    [{ host: 'curve', rate: 'mid' }, { stroke: mix('srgb', tok('caution'), 85, tok('text')) }],          // 7235 (0,3,1)
    [{ host: ['curve', 'flowtime', 'talk'], cut: false },
                      { stroke: mix('srgb', tok('border-strong'), 70, 'transparent') }],   // 7628 (0,3,1), later in the file
    [{ layout: 'row', in: 'cell' }, { width: max(px(1), em(0.075)) }],                    // 2280 (0,4,1): wins on width
  ],
},
// talk.js: the treatment bands and the values (app.css 7181, 7189-7197, 2970-2971, 6181)
'talk.band.rect':  { base: { fill: param('rx'), opacity: 0.12 }, when: [[{ dark: true }, { opacity: 0.24 }]] },
'talk.band.name':  { base: { font: [600, em(1)], fill: mix('oklab', param('rx'), 62, tok('text')),
                             halo: { stroke: tok('surface'), width: 3, join: 'round' } },      // paint-order: stroke
                     when: [[{ dark: true }, { fill: mix('oklab', param('rx'), 72, tok('text')) }]] },
'talk.value':      { state: { rate: 'data-rate' },
                     base: { font: [700, px(22)], fill: tok('text'), numerals: 'tabular' },
                     when: [[{ host: 'talk' }, { size: em(1.5) }],
                            [{ rate: 'mid' }, { fill: tok('caution') }], [{ rate: 'hi' }, { fill: tok('danger') }]] },
'plot.grid.text':  { base: { font: [500, svk(px(15))], fill: tok('text-3'), numerals: 'tabular' },          // 2959
                     when: [[{ host: ['talk', 'flowtime', 'curve', 'prof'] }, { size: em(1) }]] },          // 6179, 6327, 7135, 7220
```

The value constructors (dsl.js) are:
- `tok('text')`: a theme token, by its CSS name without `--`.
- `param('rx')`: a per-piece colour, given by the builder in place of today's inline `--rx`.
- `mix(space, a, pct, b)`: CSS `color-mix(in space, a pct%, b)`.
- `px(n)`, `em(k)`: em is relative to the chart host's base size, not to an ancestor chain.
- `svk(x)`: x × the chart's letter scale.
- `cap(k)`: k × the card's `--s-cap`, and likewise `lab`, `val`, `chCap`.
- `max`, `min`, `clamp`.
- `ease('small' | 'surface' | 'flip', curve)`: the duration and curve from ease.js. ease.js already mirrors `--d-*` and `--ease-*`.

Condition fields form a fixed vocabulary:
- **Context**, set once per chart and look:
  - `host`: talk, curve, flowtime, prof, crit, cell, plane, fluid, lumen, dock…
  - `layout`: row | stack | low | tab (row means `.pz:not(.stack)`)
  - `in`: an inner host such as cell or table
  - `theme`: light | soft | dark
  - `dark`: true for every dark look, system dark included
  - `palette`: navy | black
  - `view`: anatomic | circuit
  - `motion`: reduce
  - `minW` / `maxW`: the chart's box width, for the one container query
- **State**, read off the model piece:
  - the names declared in the entry's `state` (`rate`, `cut`, `now`, `on`, `tone`, `lit`, `met`, `q`, `kind`, `dir`…)
  - each one maps to an attribute (`data-rate`) or a class token (`class:cut`) on the piece or an ancestor
  - a value may be a list (any of) or `false` (absent)

Prop names are the fields of svg-gl's look record (svg-gl.js:122 `lookOf`):
- `fill`, `stroke`, `width`, `opacity`, `fillOpacity`, `strokeOpacity`
- `dash`, `dashOffset`, `cap`, `join`
- `size`, `weight`, `font: [weight, size]`, `anchor`, `letterSpacing`, `upper`, `halo` (paint-order stroke)
- `hidden`, `none`, `fixed` (non-scaling stroke), `baseline`, `stop`, `stopOpacity`
- `ease: { opacity, transform }`

### Key names

`<group>.<part>[.<sub>]`, in lowercase, joined by dots. `group` is the file in `chart-looks/`, `part` is the piece in plain words
(`grid`, `band`, `value`, `point`, `line`, `axis`, `unit`, `mark`, `key`), and `sub` is the SVG child when the CSS styled a child
(`plot.grid.line`, `plot.grid.text`). A key for a shared piece goes in `plot.js`, never in the first chart that happened to use it.
Each entry carries a comment with the app.css line numbers it replaces, until the last package deletes the old path.

### How a builder asks for a look

The builder keeps its classes and `data-*` (svg-morph pairs pieces by them) and adds one attribute, `data-look`:

```js
sv('g', { class: 'ptk-grid cut', 'data-rate': rate },
  sv('line', { 'data-look': 'plot.grid.line', x1, y1, x2, y2 }),
  sv('text', { 'data-look': 'plot.grid.text', x, y }, label));
sv('g', { class: 'ptk-band', 'data-look': 'talk.band.rect', 'data-p-rx': r.tone /* token name, e.g. 'rx-tips' */ }, …);
```

The chart tells svg-gl its context once: `createSvgGL(el, { host: 'talk' })`, and `gl.setCtx({ layout, fit, svk })` when presenter's
fit or layout changes (presenter.js already computes all three). A builder that needs the host's type size for layout asks
`gl.hostSize()` in place of `getComputedStyle(el).fontSize`. This keeps working unchanged when A3 replaces the DOM model with plain
`{tag, attrs, kids}` objects, because `data-look` and the state attributes are just attrs.

## 2. How each layer maps in, and when it is resolved

**Context object.** It is built in JS and nothing in it is read from styles:

```js
ctx = { theme, dark, palette, view, motion,                    // from looks.js attrs + darkMQ + store view + reduceMotionMQ
        host, layout, in: inner, boxW,                          // from createSvgGL options, presenter's classes, the box's ResizeObserver size
        scale: cardScale({ vw, vh, ts, layout, pk, bk, fit }),  // card-scale.js: cap, lab, body, val, sm, chCap, fs12, fs14, pzh
        svk }
```

**Resolution order** for one piece:
1. Take the parent's inherited props (fill, stroke, font, width, dash, cap, join, anchor, letterSpacing…), as SVG inherits them. svg-gl's
   walk does this today.
2. Apply the entry's `base`.
3. Apply each `when` row whose condition matches, in list order.
4. Apply SVG attributes the builder set on the piece. They win only where the entry left the prop unset, as svg-gl.js:110 does today.
   `opacity`, `stop-color` and `text-anchor` attributes stay live, read each frame.
5. Turn values into numbers. `tok()` takes the colour from the resolved theme token map. `mix()` is worked out (below). `em` is
   multiplied by `HOSTS[host](ctx)`. `svk` and `cap` come from `ctx`. `ease()` gives `{ ms, delay, ease }`, or null when
   `motion: reduce` and the CSS dropped the transition there.
6. Output exactly svg-gl's `L` record, so trace-gl's drawing code does not change.

**Host base sizes** live in `index.js` and copy today's host rules once:
- `talk: (c) => c.scale.sm ?? c.scale.psm ?? 12`, from `.pz-talk { font-size: var(--pz-sm, var(--pz-psm, 12px)) }`
- and one line for each other host.

**When it is resolved.** Never per frame, never per piece read from the page.
- **Look change** (`onTheme`, which covers data-theme, data-palette and the system dark switch) or a view change: resolve
  `theme-tokens.js` for the current look into a flat `{ name: rgba floats + 'rgba()' string }` map (about 200 tokens, color-mix
  included), clear the look memo, and `relook()` the live charts in the same theme frame as every other surface.
- **Size change** (the existing 150 ms resize debounce, svg-gl.js:186), `pps:labelscale` (text size), or presenter's layout/fit
  change: recompute `cardScale`, clear the size half of the memo, relook.
- **Piece**: `look(key, ctxSig, stateSig)` is memoised in a Map, and its first ask happens where svg-gl reads looks today (place, or
  the relook rest pass). A class or `data-rate` change on the model still triggers the existing MutationObserver relook. That relook
  now costs a Map hit, not a style recalc.

**color-mix maths.** Use the CSS Color 5 `color-mix()` algorithm:
1. Normalise the two percentages: if one is missing it is 100 − the other; if they sum to more than 100 they are scaled to sum to 100;
   if they sum to less than 100, the result's alpha is multiplied by that sum.
2. Convert both colours into the interpolation space:
   - `srgb`: gamma-encoded sRGB, the components as they stand
   - `oklab`: sRGB → linear sRGB → XYZ D65 → LMS → cube root → OKLab, Björn Ottosson's matrices as published in CSS Color 4
3. Premultiply each by its alpha.
4. Interpolate linearly.
5. Un-premultiply.
6. Convert back to sRGB, and round to 8 bits only at the very end, as svg-gl's `rgbaOf` does now.

`transparent` takes part as `rgba(0,0,0,0)`. Premultiplying is why `mix(text 11%, transparent)` keeps the text colour's hue at 11 %
alpha. **Do not write new maths.** `src/ui/css-color.js` already does all of this (its "color-mix: the two colours and the mix"
buffers, CSS Color 4 sample matrices) to read the browser's `oklab()` output. WP2 exports its mixer as
`mixColor(space, a, pctA, b, pctB) → [r,g,b,a]` and the resolver calls it. The same function then serves the parse of computed
colours (today) and the table (tomorrow), so the two cannot drift apart while both paths exist.

## 3. Keeping CSS variables in sync for the rest of the UI

**Recommendation: the JS table is the source. A node script writes the theme blocks of `styles/tokens.css` from it, and
`--check` fails lint when the file is out of date.** The output is a static stylesheet. Nothing is written onto `:root` at run time.

Why this direction, and why at build time rather than run time:
- **First paint.** The page's CSS must have its colours before any module runs. Writing vars onto `:root` from JS would paint one frame
  with no colours (or the wrong look) on every load, and again on every look change until the script runs.
- **Same values everywhere.** HTML text, glass, menus and charts all read one value, because the CSS text was printed from the very
  object the resolver reads.
- **No cascade guessing.** Going JS → CSS is plain printing. The abandoned direction, CSS → JS, needed a browser to compute it.
- **No new runtime work or reads.** util.js's `cssVar()` cache (util.js:1284), used by the canvas instruments and the dock charts, keeps
  working unchanged. It can later read `theme-tokens.js` directly as a follow-on.
- It follows two existing patterns: ease.js already mirrors the `--d-*` durations, and `stop-tokens.js` + `npm run check:stops` keeps
  a JS table and the CSS in step (that one reads the browser; this one does not need to).

`theme-tokens.js` shape (real values):

```js
export const TOKENS = {
  light: { text: '#1A1917', 'text-2': …, caution: …, danger: …, surface: …, 'border-strong': …, … },
  soft:  { from: 'light', text: '#221E18', 'text-2': '#4A443A', ok: '#24724F', caution: '#A2700C', danger: '#B03C28', … },
  dark:  { text: '#EEEBE5', 'text-2': '#B7B1A8', 'text-3': '#A69E95', caution: '#F0B43C', danger: '#F2634D', surface: '#242321', … },
  navy:  { from: 'dark', text: '#E9EDF6', 'text-2': '#A9B2C7', grid: '#1F2840', axis: '#34405E', 'tr-ra': '#A9B2C7', … },
  black: { from: 'dark', text: '#F4F4F5', grid: '#19191C', axis: '#3A3A40', … },
};
export const CIRCUIT = { dark: { bg: '#0F0E0D', 'stage-bg': '#121110', … }, navy: { … }, black: { … } };   // .stage-wrap.cmap
```

The generator prints, between `/* BEGIN generated: theme-tokens.js */` and `/* END */` in tokens.css:
- the light values into `:root`
- `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="soft"]) {…} }`
- `:root[data-theme="dark"]`, `:root[data-theme="soft"]`, `:root[data-theme="dark"][data-palette="navy|black"]`
- the four `.stage-wrap.cmap` blocks
- the `--look-<id>-*` tile tokens

The selectors and their order are the ones tokens.css uses now. Non-theme tokens (durations, fonts, radii, `--fs-*`) stay
hand-written outside the markers. index.html, build.mjs and sw.js do not change.

**Which variables are in it.** Theme tokens that charts and HTML both read stay CSS vars, generated:
- `--text`, `--text-2`, `--text-3`
- `--surface`, `--surface-2`, `--surface-3`
- `--border`, `--border-strong`
- `--accent`, `--accent-ink`, `--on-accent`
- `--ok`, `--caution`, `--danger`, `--caution-ink`, `--danger-ink`
- `--stage-bg`, `--axis`, `--grid`
- `--tr-pv`, `--tr-wedge`, `--tr-hv` (and the other `--tr-*`)
- `--tour-portal`, `--tour-sys`
- `--fibroscan`, `--thrombus`, `--thrombus-edge`, `--stent-metal`, `--ascites`, `--leader`
- `--s1`…`--s8`
- every other theme-varying token in tokens.css today (about 200)

Chart-only tokens move into `theme-tokens.js`. They are still printed as CSS vars only where an HTML legend uses them:
- `--pze-ok/mid/hi/ppg/hvpg/both` and their `-ink` pairs: printed, because `.pze-key` and `.pze-ckey` are HTML
- `--pzq-1..4`: printed, because one HTML rule uses each
- `--gf-*`, `--gs-*`, `--gl-*`, `--chart-liver/pre/post-band`, `--pz-hepatocyte`, `--pz-albumin`: printed only if a grep finds an
  HTML user once the chart is moved, otherwise dropped
- `--hv-bw`, `--hv-bg`, `--hv-bd`: these are button hover tokens, not chart tokens. Check them in the profile package before touching them.

Size and motion tokens stay as they are for now:
- `--font-ui`, `--font-display`, `--font-num`
- `--d-flip`, `--d-small`, `--d-surface`, `--ease`, `--ease-move` (ease.js mirrors these)
- `--s-cap`, `--s-lab`, `--s-body`, `--s-val`, `--s-big`, `--ch-cap`, `--pz-sm`, `--pz-num`, `--fs-12`, `--fs-14`, `--pzh`, `--svk`

The card type scale is the one place where run-time writing is right, because it depends on the window. card-scale.js mirrors the
CSS formulas first (WP3). In the last package (WP12), presenter writes `--s-*`, `--pz-sm` and `--ch-cap` inline on the card from
card-scale.js, and the CSS formulas are deleted. Until then the formulas exist twice, side by side with line references. This is the
one deliberate, time-boxed double definition.

Per-piece params (`--rx`, `--tone`, `--site`, `--i`, `--bs`) stop being CSS on model pieces. The builder passes the token *name*
(`data-p-rx="rx-tips"`) and the resolver looks it up in the token map.

## 4. Migration order, chart by chart

Each chart is one PR. In that PR, the builder writes `data-look` on every model piece, the entries land in the chart's file, and every
app.css rule listed for the chart is deleted. The chart's `getComputedStyle(el).fontSize` becomes `gl.hostSize()`, and the tests that
grep app.css for those rules are ported to assert the table instead. While a chart is moving, svg-gl draws pieces that have a
`data-look` from the table and pieces that do not from the old path. **There is never a piece with both a `data-look` and a live CSS
rule**, because the PR deletes the rule. Run `node scripts/chart-looks-inventory.mjs --chart <name>` to get each PR's exact rule list
(WP0). The selectors below are what the scan found.

1. **Foundations** (WP1, WP2, WP3). No chart changes look. tokens.css theme blocks become generated (byte-identical values). The
   resolver and the svg-gl hook land. card-scale.js lands.
2. **Pilot: talk-trace + shared plot pieces** (WP4). Delete every `.ptk-*` look rule:
   - app.css 2956-2971, 6179-6181, 7181-7197
   - the `.ptk-*` parts of 2280, 2945, 6327-6328, 7135, 7220, 7235-7239, 7628
   - `:is()` lists that also name `.pft-*`, `.pcv-*` or `.ppf-*` keep those names and drop only `.ptk-*`
   - also `.pz-plotbg`, and `.pz-talk`'s `font-size` (its `height` is layout and stays)
   - talk-trace.js:47,115 lose `getComputedStyle`
3. **Time charts: flow-time + course + curve** (WP5). Delete:
   - `.pft-*` (2945, 6327-6328, 7189 `.pft-band-n`, 7193/7197 dark)
   - `.pco-*`
   - `.pcv-*`, with its 8 transitions → `ease`
   - `.pz-curve`/`.pz-flowtime` host font rules
4. **Profile + flows** (WP6). `.ppf-*`, `.pfl-*`, and `--tone` → `param('tone')`.
5. **Causes** (WP7). `.pcs-*`.
6. **Criteria** (WP8). `.pzc-*`, `.pzz-*`, the container query → `minW/maxW`, and the reduced-motion row → `motion`.
7. **Plane** (WP9). `.pze-*`, and the `--pze-*` blocks (scoped definitions + dark overrides) → `theme-tokens.js`, still printed for
   `.pze-key`.
8. **Fluid + lumen** (WP10). `.gf-*`, `.gs-*`, `.gl-*` (not `gl-words`), and their scoped vars.
9. **Card charts + instruments + small ones** (WP11):
   - presenter `c-*`, `pzq-*`, `pzw-*`
   - instruments `ab-*`, `wall-*`, `chart-*` (model pieces only: the HTML `.ab-*` rules stay; the scan lists both, so check each rule
     against instruments.js:629 `s()` calls), plus the `view` axis for the circuit view
   - timeline `.tl-day-gl`
   - lobule-zoom `.lz-call-l/-r`, `.leader`, `.leader-dot` (model pieces only: label-gl's HTML leaders keep theirs)
   - sinusoid-view, callout `cl-*`, gl-words
10. **Close-out** (WP12). Delete svg-gl's `resolve()`, `getComputedStyle`, `SCALE_VARS`, `opEase(cs)` and the style-read half of
    `readLooks`. Make svg-morph's `probe` read the piece's resolved `op` and its own fade record. Move card type to card-scale.js
    (inline vars, CSS formulas deleted). Add a lint rule.

Waves 2-9 can merge in any order after the pilot, but the pilot goes alone first. It shakes out the DSL, the inheritance step and the
PR table format with every layer present: dark, mix, data-rate, host, em, `--svk` and per-piece params.

## 5. Work packages

File ownership is exclusive: a package edits only its listed files. `styles/app.css` is shared, but each package only **deletes
whole lines or names inside `:is()` lists** in its own rules. It never reformats or moves lines. Merge chart PRs one at a time and
rebase the next one; line-only deletions in separate regions rebase cleanly.

| WP | What | Owns (edits) | Depends on | Size |
|---|---|---|---|---|
| **WP0** Inventory + guard | `scripts/chart-looks-inventory.mjs` (node, no browser): lists each chart's look rules (line, selector, media/container context, body), `--chart <name>`, `--count`. `scripts/chart-look-allowance.json`: per-chart remaining counts, numbers only go down, wired into `rules-lint.mjs`. `scripts/look-diff.mjs` skeleton (§7). | the three new scripts, `rules-lint.mjs` (one hook) | none | 0.5 d |
| **WP1** Theme tokens in JS | `src/ui/theme-tokens.js` (every token that differs by look or view, values copied from tokens.css). `scripts/gen-theme-css.mjs` (+`--check` in lint) prints the marked blocks into tokens.css. Hand-written theme blocks are replaced by the generated ones with **identical values** (diff of computed values = none). Port `appearance.test.js`, `token-contrast.test.js`, `colour-tokens.test.js` to read theme-tokens.js. | `theme-tokens.js`, `gen-theme-css.mjs`, `styles/tokens.css`, those tests, `package.json` (one script) | WP0 for the lint hook (or add it after) | 1 d |
| **WP2** Resolver + svg-gl hook | `chart-looks/dsl.js`, `resolve.js`, `index.js` (empty chart maps). css-color.js exports `mixColor`. svg-gl: `createSvgGL(el, { host })`, `gl.setCtx()`, `gl.hostSize()`. In `readLooks`, a piece with `data-look` → resolver, else the old path. Memo cleared on `onTheme` and resize. Unit tests for layer order, inheritance, mix (srgb + oklab against known values), em/svk, ease, reduce-motion. | `src/ui/chart-looks/{dsl,resolve,index}.js`, `svg-gl.js`, `css-color.js`, new tests | WP1's export names (agree `tokensFor(ctx)` up front; WP2 can stub it) | 1.5 d |
| **WP3** Card scale in JS (mirror) | `src/ui/card-scale.js` copies today's formulas (app.css:26-27, 1876-1896, 1911-1913, 2266, 2575-2576, 2627, 2806, 2851) as functions of JS inputs. presenter passes `{layout, fit, svk}` to its charts' `gl.setCtx`. presenter-tools passes `svk`. No CSS deleted yet. | `card-scale.js`, `presenter.js` (ctx hand-off only), `presenter-tools.js` | WP2 (`setCtx`) | 1 d |
| **WP4** Pilot: talk + plot | `chart-looks/plot.js`, `talk.js`, `talk-trace.js`, `plot-look.js`; delete the §4 step 2 rules; port `relation-chart-names`, `ladders-chart-size`, `type-polish` (ptk parts) | those files, app.css (ptk lines) | WP1-3 | 1 d |
| **WP5** Time charts | `time.js`; `flow-time.js`, `tool-course.js`, `tool-curve.js`; pft/pco/pcv rules; port `relation-ascites-chart`, `svg-morph` (pcv parts) | those | WP4 | 1.5 d |
| **WP6** Profile + flows | `profile.js`; `tool-profile.js`, `tool-flows.js`; ppf/pfl; port `profile-model`, `flows-inflow` | those | WP4 | 1 d |
| **WP7** Causes | `causes.js`; `tool-causes.js`; pcs | those | WP4 | 0.5 d |
| **WP8** Criteria | `crit.js`; `tool-criteria.js`; pzc/pzz | those | WP4 | 1 d |
| **WP9** Plane | `plane.js`; `visual-plane.js`; pze rules + `--pze-*` into theme-tokens (append-only block, owned here) | those | WP4, WP1 | 1 d |
| **WP10** Fluid + lumen | `fluid.js`, `lumen.js`; `tool-fluid.js`, `tool-lumen.js`; gf/gs/gl | those | WP4 | 1 d |
| **WP11** Card charts, instruments, small | `card.js`, `inst.js`, `small.js`; chart parts of `presenter.js`, `instruments.js`, `timeline.js`, `lobule-zoom.js`, `sinusoid-view.js`, `callout.js`, `gl-words.js` | those | WP4; WP3 must be merged before (presenter.js) | 2 d (split into 11a presenter, 11b instruments, 11c small if run in parallel) |
| **WP12** Close-out | delete the svg-gl style path and `SCALE_VARS`; svg-morph probe; card type scale written inline from card-scale.js, CSS formulas deleted; lint: no `getComputedStyle` in svg-gl/svg-morph/chart builders, no chart prefixes in app.css (allowance 0) | `svg-gl.js`, `svg-morph.js`, `presenter.js`, `card-scale.js`, app.css (scale formulas), `rules-lint.mjs` | all of WP4-11 | 1.5 d |

Parallelism:
- WP0 and WP1 can start together. WP2 starts with them against a stubbed `tokensFor`.
- WP3 follows WP2.
- WP4 runs alone.
- WP5-WP10 and WP11b/c run in parallel, at most four at a time (one app.css rebase each).
- WP11a waits for WP3.
- WP12 is last.

Two rules where token files are shared:
- theme-tokens.js additions in WP9 and WP10 go in **separate, package-named blocks at the end of each look's object**, so they do
  not collide.
- `chart-looks/index.js` gets one import line per package, appended. A conflict there is a trivial union.

## 6. Risks and how each is contained

| Risk | Containment |
|---|---|
| A rule is translated in the wrong order or with the wrong value, and a chart is silently miscoloured. This is what sank 78c0f32. | Every PR carries the old → new table (§7) with the CSS line, its specificity and its value for all 5 looks. One chart per PR. The pilot first. The owner looks at that chart on his device per PR, as he does now. Entries keep their app.css line comments until WP12. |
| A piece is keyed but its entry is missing (typo), or a state is never declared. | The resolver throws in `?debug` and draws magenta in dev builds. In production it logs once (`caught()`) and draws the base. An `index.test.js` checks that every `data-look` string in `src/ui/*.js` exists in LOOKS, and that every `state` name maps to an attribute the builder writes. |
| A CSS rule is left behind for a migrated piece (double definition), or deleted for an HTML element that shared the class. | The inventory `--chart` output must be empty for migrated prefixes (allowance file). Rules for HTML elements (`.ab-*` panels, label-gl leaders, `.pze-key`) are named in the PR and kept. The reviewer checks each deleted selector names only model pieces. |
| Generated tokens.css drifts from theme-tokens.js. | `gen-theme-css.mjs --check` in `npm run lint`. The file header says "do not edit between the markers". |
| HTML and charts disagree on type size during WP3-WP11, because the formulas exist twice. | card-scale.js cites the app.css lines it mirrors. A unit test pins both to the same sample inputs (vh 900/700/430, ts 1/1.4, each layout). WP12 removes the CSS copy. |
| System dark mode switch is missed (svg-gl observes only the attributes today). | The resolver listens on `onTheme`, which already covers `darkMQ`. |
| Circuit view re-colours dock instruments in dark looks. | `view` is part of ctx and `CIRCUIT` is part of theme-tokens.js. WP11b covers it explicitly. |
| Eases change (a transition read from CSS today is lost). | Each `transition` rule on a model piece becomes an `ease` prop, and is listed in the PR table. Rows for `prefers-reduced-motion` become `motion: 'reduce'` rows. |
| Per-frame cost or allocation goes up. | Resolution happens at place/relook only (as today), memoised by `key|ctxSig|stateSig`. The token map and scale are rebuilt only on a look or size change. Keep the `alloc-rare` comment convention so rules-lint's allocation check still passes. |
| svg-morph stops pairing pieces. | `data-look` is a `data-*` attribute, so morph includes it in "same look" as it does classes. Builders keep their classes. |
| Merge conflicts in app.css. | Line-only deletions. Merge one at a time and rebase. Shared `:is()` lines are edited name by name, owned by the earliest package in §4 order. |
| A rollback is needed. | Each chart PR reverts on its own: the old path stays in svg-gl until WP12, and the reverted CSS lines come back with the revert. |

## 7. How to tell each step worked, without running anything

For every chart PR (WP4-WP11):
1. **Selectors gone.** `node scripts/chart-looks-inventory.mjs --chart talk` prints nothing. `grep -cE '\.ptk-' styles/app.css` is 0,
   or only the HTML exceptions named in the PR. `chart-look-allowance.json` drops by the PR's count.
2. **Style reads gone.** `grep -c getComputedStyle src/ui/talk-trace.js` is 0. The chart-path total (17 at 3991815: svg-gl 1,
   svg-morph 1, builders 15) drops by the builder's count. Paste the before/after numbers in the PR.
3. **Every piece keyed.** `grep -c "sv('" src/ui/talk-trace.js` vs `grep -c "data-look" src/ui/talk-trace.js`: every leaf and every
   styled `g` has one. Unkeyed ones are listed with a reason, for example a `clipPath` or a `defs` child.
4. **Old → new table in the PR description.** One row per deleted rule × look. `scripts/look-diff.mjs` (WP0) prints it. For old, it
   substitutes `var()` from tokens.css per look and evaluates `color-mix` with css-color.js. This is a review aid only, never shipped.
   For new, it imports the table and runs the resolver in node with the same ctx. A cell that differs is marked `≠`, and the PR either
   fixes it or explains it (for example, a rule that never applied to a model piece):

   | app.css | selector (specificity) | look | old | new key / row | new | |
   |---|---|---|---|---|---|---|
   | 2956 | `.ptk-grid line` (0,1,1) | light | stroke `color-mix(in srgb, #1A1917 11%, transparent)` = rgba(26,25,23,.11) | plot.grid.line base | rgba(26,25,23,.11) | = |
   | 2956 | `.ptk-grid line` (0,1,1) | navy | rgba(233,237,246,.11) | plot.grid.line base | rgba(233,237,246,.11) | = |
   | 7191 | `:root[data-theme=dark] .ptk-band rect` | dark/navy/black | opacity .24 | talk.band.rect when dark | .24 | = |
   | 7235 | `.pz-curve .ptk-grid[data-rate=mid] line` (0,3,1) | soft | mix(caution 85%, text) | plot.grid.line row 4 | … | = |

5. **Review checklist** (reviewer ticks each one):
   - Every deleted line appears in the table. No line outside the chart's inventory list is touched.
   - `when` rows are in cascade order: the specificity column ascends, and ties follow source order.
   - Every `data-rate`/class state in the deleted selectors is declared in the entry's `state` and written by the builder.
   - Dark rows cover both the attribute and the system-dark media copies (they are always pairs in app.css, for example 7191 + 7195).
   - `em` sizes name their host, and `HOSTS[host]` matches the deleted host font-size rule.
   - Transitions on the piece became `ease`, and reduced-motion rows became `motion`.
   - The ported tests assert table values, not CSS text.
   - No new `getComputedStyle`, `getPropertyValue` or `cssVar()` in the chart path.

For WP1, the generated tokens.css must be identical in values: `git diff --word-diff` shows only moved lines and the marker comments.
A node one-off parses old and new token blocks and prints "0 values differ" in the PR.

For WP12:
- `grep -n "getComputedStyle\|getPropertyValue\|SCALE_VARS" src/ui/svg-gl.js src/ui/svg-morph.js` returns nothing.
- `grep -c getComputedStyle` over the 15 chart builders returns 0.
- The inventory reports 0 chart rules.
- The allowance file is all zeros.
- The lint rule exists.

## Out of scope, noted for later

- Figure SVG looks (`org-`, `lb-`, `lv-`…, about 130 rules) belong to A2.
- The canvas-2D parts of instruments.js (`cssVar` at :316-583) and the dock charts (charts.js) still read `cssVar()`. They keep
  working off the generated CSS vars, and can switch to `theme-tokens.js` directly later.
- Forced-colours mode: no chart rule uses it today, and the GPU picture ignores it now. That does not change here.
- The DOM model itself (A3's display list) is separate work. `data-look` is designed to carry over unchanged.
