# Chart looks in code: one table in JS, no style reads (pure GPU plan A3, looks part)

**Status (11 Nov 2026): the table is built and most charts are on it; the clean-up is open.** Written as a plan on 4 Nov 2026. Built:
`src/ui/chart-looks/` (the DSL, the resolver and one file per chart family, listed below), `src/ui/theme-tokens.js` with
`scripts/gen-theme-css.mjs` printing the theme blocks of `styles/tokens.css` (`npm run gen:theme`; `npm run lint` runs it with `--check`),
`src/ui/card-scale.js`, `mixColor` in `css-color.js`, and the chart builders writing `data-look`. `svg-gl.js` takes a piece's look from the
table; `rules-lint.mjs` fails a `getComputedStyle` or `readStyle(` in `svg-gl.js`, `svg-morph.js`, `chart-looks/` and the chart builders
(`tool-*.js`, `flow-time.js`, `talk-trace.js`, `visual-plane.js`). Open: chart look rules still in `styles/app.css`, counted per chart by
`node scripts/chart-looks-inventory.mjs --count` against `scripts/chart-look-allowance.json` (allowance on 11 Nov: talk 2, flow-time 3, curve 3,
criteria 45, plane 10, fluid 10, card 4, instruments 118, small 18; course, profile, flows, causes and lumen are 0); the card type scale
is still defined twice (CSS and `card-scale.js`). A missing look key is reported and drawn magenta, never a quiet fallback. Test files per
family: `tests/*-looks.test.js` and `tests/chart-looks-resolve.test.js`. The display-list part of A3 (no hidden DOM model) is separate and
not started.

## In one paragraph

Every slide chart used to be built twice: once as a hidden copy made of page elements (the "model"), and once as the GPU picture, and
svg-gl asked the browser how each hidden piece looked (`getComputedStyle`), answered from about 470 rules in `styles/app.css` layered by
theme, palette, dark mode, the card's layout and size, the chart's host and data states such as `data-rate="mid"`. Those looks now live
in a JS table written by hand. Every chart piece has a named look key. One small resolver turns key + context + state into the look record
svg-gl draws from. The colour tokens the rest of the UI also uses come from the same JS table, and a script writes them into `tokens.css`,
so the page's CSS and the charts cannot disagree. A chart's CSS rules are deleted when that chart moves.

## Why not capture the look from a browser (the reverted approach, 78c0f32)

78c0f32 filled a `look-tokens.js` from a headless browser run, keyed by a hash of each piece's class string and place. It was reverted: the
browser stayed the source (any size, deck or state the run did not visit was missing), the hash keys could not be read or reviewed, and a
gap or a wrong guess was silent. The rule that came out of it: the JS table is the only definition, written by hand with readable keys,
and nothing is captured from a browser or re-runs the CSS cascade at run time.

## 1. The shape of the table

### Files

```
src/ui/chart-looks/
  dsl.js        tok(), mix(), param(), px(), em(), svk(), cap(), ease()  (tiny constructors, no logic)
  resolve.js    the resolver: context, layer order, memo, output = svg-gl's look record
  index.js      merges every chart's file into one LOOKS map; host base sizes (HOSTS)
  plot.js       pieces shared by several charts: today's ptk-*, pz-plotbg, pft-key
  talk.js  time.js  profile.js  flows.js  causes.js  crit.js  plane.js  fluid.js  lumen.js  inst.js  card.js  small.js  path.js  allp.js
src/ui/theme-tokens.js   every theme-varying colour token, per look, per view (the source tokens.css is written from)
src/ui/card-scale.js     the card type scale in JS (cap, lab, body, val, sm, chCap, fs12, fs14) from JS inputs
```

### A look entry

An entry is plain data: a `base`, then an **ordered** list `when` of `[condition, props]`. Every matching row applies in list order,
and a later row wins. There is no specificity. Whoever translates a CSS group writes the rows in the order the CSS cascade picks a
winner (specificity first, then source order), worked out once, by hand. Here is the `.ptk-grid line` group as it was written (the line
numbers in the comments are `styles/app.css` as of 4 Nov 2026, when the plan was written; they show the style, not a place to look):

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

Prop names are the fields of svg-gl's look record (`svg-gl.js` `readLooks`):
- `fill`, `stroke`, `width`, `opacity`, `fillOpacity`, `strokeOpacity`
- `dash`, `dashOffset`, `cap`, `join`
- `size`, `weight`, `font: [weight, size]`, `anchor`, `letterSpacing`, `upper`, `halo` (paint-order stroke)
- `hidden`, `none`, `fixed` (non-scaling stroke), `baseline`, `stop`, `stopOpacity`
- `ease: { opacity, transform }`

### Key names

`<group>.<part>[.<sub>]`, in lowercase, joined by dots. `group` is the file in `chart-looks/`, `part` is the piece in plain words
(`grid`, `band`, `value`, `point`, `line`, `axis`, `unit`, `mark`, `key`), and `sub` is the SVG child when the CSS styled a child
(`plot.grid.line`, `plot.grid.text`). A key for a shared piece goes in `plot.js`, never in the first chart that happened to use it.
An entry may carry a comment naming the rule it replaced.

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
4. Apply SVG attributes the builder set on the piece. They win only where the entry left the prop unset, as `lookFor` in `resolve.js` does.
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
- **Size change** (the 150 ms resize debounce in `svg-gl.js`), `pps:labelscale`, or presenter's layout/fit
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
alpha. **There is one mixer.** `src/ui/css-color.js` exports `mixColor(space, a, pctA, b, pctB) → [r,g,b,a]`; the resolver and the scene
store both call it, so a table value and a computed style cannot drift apart.

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

The card type scale is the one place where run-time writing is right, because it depends on the window. `card-scale.js` mirrors the
CSS formulas (`tests/card-scale.test.js` pins the two together). The last step, still open, is that presenter writes `--s-*`, `--pz-sm`
and `--ch-cap` inline on the card from `card-scale.js` and the CSS formulas in `styles/app.css` are deleted. Until then the formulas
exist twice. This is the one deliberate, time-boxed double definition.

Per-piece params (`--rx`, `--tone`, `--site`, `--i`, `--bs`) stop being CSS on model pieces. The builder passes the token *name*
(`data-p-rx="rx-tips"`) and the resolver looks it up in the token map.

## Work packages (all planned on 4 Nov; status 11 Nov 2026)

| WP | What | Status |
|---|---|---|
| WP0 | `scripts/chart-looks-inventory.mjs`, `chart-look-allowance.json` in `rules-lint.mjs`, `scripts/look-diff.mjs` | Built (look-diff was a skeleton on 4 Nov; whether it is complete is not verified) |
| WP1 | `theme-tokens.js` and the generated theme blocks of `tokens.css` | Built |
| WP2 | resolver, `createSvgGL(el, { host })`, `setCtx`, `hostSize` | Built |
| WP3 | `card-scale.js` mirror of the card type scale | Built (the CSS copy is not deleted, see WP12) |
| WP4 to WP11 | talk and plot, time charts, profile and flows, causes, criteria, plane, fluid and lumen, card charts, instruments, small ones | Built as `chart-looks/{talk,plot,time,profile,flows,causes,crit,plane,fluid,lumen,card,inst,small}.js`, plus `path.js` and `allp.js`. Leftover app.css rules per the counts above. |
| WP12 | close-out: delete the style-read path in svg-gl, lint rule, card type scale written inline, allowance at 0 | Partly: the style reads in svg-gl, svg-morph and the chart builders are gone and the lint rule exists. Open: allowance not at 0, CSS scale formulas still present. |

## Rules for a chart PR that still apply

- A piece gets `data-look`; no piece has both a `data-look` and a live CSS rule, so the PR deletes the rule (`node scripts/chart-looks-inventory.mjs --chart <name>` lists them; lower the number with `node scripts/rules-lint.mjs --tighten`).
- `when` rows are in cascade order. Dark rows cover the attribute and the system-dark copies. `em` names its host and matches `HOSTS[host]`. A CSS `transition` on the piece becomes an `ease` prop, and a reduced-motion rule becomes a `motion: 'reduce'` row.
- Rules for HTML elements that share a chart class (legends, panels, label-gl leaders) stay in the stylesheet.
- No new `getComputedStyle`, `getPropertyValue` or `cssVar()` in the chart path. Keep the `alloc-rare` comment convention so the allocation check passes.
- Tests assert table values, not CSS text.

## Out of scope

- Figure SVG looks (`org-`, `lb-`, `lv-`, about 130 rules) belong to pure-GPU plan A2 (`scene-store.js`).
- The canvas-2D parts of `instruments.js` and the dock charts (`charts.js`) read `cssVar()` and keep working off the generated CSS vars.
- Forced-colours mode: no chart rule uses it and the GPU picture ignores it.
- The DOM model itself (A3's display list). `data-look` is designed to carry over unchanged.
