# The screen report, `pps.screen()`, and the self-check rules

Plan: `/mnt/project-files/card-gallery-plan/screen-report-recs.md`. Code: `src/ui/screen/` (readers, builder, text) and `src/ui/selfcheck/` (rules).
Tests: `tests/screen-report.test.js`, `tests/selfcheck-rules.test.js`, helpers `tests/selfcheck-helpers.js`.

An agent (or a person) reads what is on the screen without looking at it: the report is built from the records the app already keeps, never from pixels.

## Using it

- `await pps.screen(opts)`: the JSON report. `opts`: `{ detail: 'summary' | 'full', only: 'cards' | [...], rules: false | 'id' | [ids], as: 'text' }`.
- `await pps.screen.text(report?)` (or `pps.screen({ as: 'text' })`): the text form, plain sentences by part, the self-checks last. The summary stays under about 2 KB; the last line of a cut one says how to ask for the rest.
- In node or a headless layout run: `import { buildScreen } from 'src/ui/screen/build.js'` and call `buildScreen({ pps, io, doc, win, detail, only, rules, history })`. It is synchronous and a pure function of what it is handed. `stableReport(report)` leaves out the volatile parts and the findings' times so two runs of one state compare equal.

Report shape: `{ v: 1, detail, page, cards, <more parts>, errors?, findings }`. A part is left out when its reader has nothing to say; a reader that throws is counted (`caught('screen:<id>')`) and named in `errors`, the other parts still come. `findings` is the state rules' result (`rules: false` skips it).

## Adding a reader (a part of the report)

```js
import { registerReader } from './registry.js';          // src/ui/screen/registry.js
registerReader({ id: 'labels', owner: 'src/ui/label-gl.js', order: 50, volatile: false,
  read(ctx) { return { /* plain JSON, rounded with r1/r2/px from util.js */ }; },   // null: nothing to say
  text(part, ctx) { return ['Label "Splenic vein" at 612,404, 65%.']; } });         // lines; ctx.detail is 'summary' or 'full'
```

Then add one `import './your-reader.js';` line to `src/ui/screen/plugins.js`. Order: page 10, camera 20, cards 30, charts 40, labels 50, figure 60, motion 70, health 90. `ctx = { pps, io, doc, win, env, detail, parts }`: `io` is `{ box, rects, style, metric, ctm }` (in the app `layout-snap.js`'s reads; a reader reads layout no other way, so the layout-read allowance does not move), `env` the options (plus `minPx`), `parts` the parts read so far.

**The one rule: a reader calls the same functions the painters call and takes the painter's own record.** It never works anything out a second way. Its test checks it imports the painter's function and does not copy it. Anything decided inside a shader is not in the report (say "the report shows X", never "I saw X").

## Adding a rule

```js
import { registerRule } from './rules.js';                // src/ui/selfcheck/rules.js
registerRule({ id: 'label-under-card', owner: 'src/ui/label-gl.js', why: 'Labels must stay clear of cards (17 Nov)', kind: 'state',
  check(report, ctx) { return report.labels.filter(...).map((l) => ({ what: `Label "${l.t}"`, where: 'under the Doppler card, 40% covered', at: '12.4 s' })); } });
```

- `kind: 'state'` (default): `check(report)` over one `pps.screen()` report. `kind: 'series'`: `check(frames, ctx)` over the recorder's frames, oldest first (`runRules(report, { history })`). (`judge` is accepted for `check`.)
- A finding is `{ what, where, at?, ...extra }`; the registry adds `rule`, `why` and `owner`. `runRules` returns a plain array of `{ rule, what, where, why, owner, at, ... }`; a rule that throws becomes one `rule-error` finding.
- `RULES` (live list of `{ id, owner, why, kind }`), `ruleIds()`, `runRules(input, { history, only, skip, kinds })`, `findingText(f)`.
- Add one import line to `src/ui/selfcheck/plugins.js`.
- **Every rule ships with a test with a case that must not fire** (`fires()` and `quiet()` in `tests/selfcheck-helpers.js`). A rule that fires wrongly wastes as much agent time as no rule.
- The off-GPU score and the layout-read allowance must not move: readers read layout through `io` only, and nothing here runs per frame.

## What is in so far

Readers: `page` (device size, look, view, patient, deck and slide, open card, build), `cards` (each card: kind, title, box, opacity, stage, each line with its size in px, numbers; the fit readers' raw readings), `health` (volatile: GPU memory, contexts, counted errors, fps).
Rules: `fit-<kind>` for every kind of `gallery/fit-rules.js` except `zoomed` (it needs a second reading with the card enlarged): the judges there are the only judges, the rules run them over `report.cards.fit` and `report.cards.structure`.

## Figure, labels and camera (step 2a)

Readers (all in `src/ui/screen/`, registered by `register-2a.js`; the pure readers are `read-figure.js`, `read-labels.js`, `read-camera.js`, and `sources.js` is the only file that touches the stage):

| Part | What it says | Painter function / record it takes |
|---|---|---|
| `camera` | view, camera (k, x, y), the world rectangle it frames, what is moving and how much is left, the last 12 moves the stage logged, and each recorded slide move with the judge's failures | `stage.cameraState`, `cameraTraces`, `cameraMoves`, `glideLeft`; `cam-arc.js viewGeom`; the judge is `slide-cam.js judgeSlideMove` (the one `pps.cameraGate` uses) |
| `labels` | each label on the figure: words, box, anchor, leader, alpha and its state (shown, dim, fading, hidden), what it sits under (card, share), off the stage, over another label, detached from its point, clipped by the GPU canvas | `stage.labelLaid` (the layout), `stage.labelSnapshot` (what label-gl drew, its alpha), `stage.labelCarry` (settled or moving), the labels' state classes; overlap, containment and the leader threshold are `label-place.js` `hits`, `overlap`, `within`, `boxGap`, `needsLeader`; the dim is `LABEL_DIM` (= `--label-dim` in `styles/tokens.css`) |
| `figure` | each vessel shown: name, width, the two end colours the GPU row takes, the model's pressure at its ends, whether the colour fits that pressure, flow reversed, selected, stent, opacity; the lens, the Anatomy/Circuit morph, glows | `stage.figureRows` (added for this: the vessel painter's own record, `stage-tubes.js renderTubes`), `colormap.js pressureColor` over `colour-bin.js qP` (the painter's 0.5 mmHg bin, now one definition `stage.js` and the reader share) |

Rules registered (`src/ui/selfcheck/rules-labels.js`, `rules-camera.js`, `rules-figure.js`), each with a test that fires and one that must not (`tests/screen-rules.test.js`):
`label-under-card`, `label-off-screen`, `label-overlap` (warn), `label-dim-alpha`, `label-detached` (warn), `label-clipped-by-canvas` (warn);
`camera-path`, `camera-late-start` (warn), `camera-second-move`, `camera-refused-write` (warn), `camera-two-moves-one-press`, `camera-stop-between` (warn);
`figure-colour-stale`, `figure-vessel-no-colour`, `figure-vessel-width`, `figure-pressure-missing` (warn). A finding of a rule marked warn carries `sev: 'warn'`.

Label rules judge only labels at rest (`labels.settled`): a label riding the camera or under a solve is on its way, and nothing is said of it.

Tests: `tests/screen-readers.test.js` (each reader answers what its painter's function answers on the same inputs, imports it and defines no copy, uses no layout read), `tests/screen-rules.test.js`, `tests/screen-stage.test.js` (the real stage booted in node, through `buildScreen`: the three parts, two reads equal, no figure or camera finding on a settled Circuit).

Not in the report (needs a shader or a frame series): organ paint, the colour a vessel's gradient takes between its two ends, label slides vs fades (the recorder's motion rules, step 2c).

**Tests that import `build.js` (or `screen/plugins.js`) import `tests/screen-dom.js` first.** The figure reader takes its colours from `colormap.js`, which takes them from the page's `--ramp-pressure`; `util.js` and `menu-glass.js` watch the document at import, so the jsdom globals and the ramp must be there before the module graph loads. `screen-dom.js` is that page (light look's ramp, the few globals).
