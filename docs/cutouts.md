# Three scales on one plate (`cutouts`)

11 Nov 2026. Item 1 of `docs/recommendations/first-principles-next.md`; approved mock: the "Fourteen mocks from the next-moves list"
artifact (item 1). Mohammad's rules: everything on the GPU, each window uses the chosen vessel renderer (never a hybrid), only the
subject runs blood, Mac and iPad landscape only, labels and tags through the labels thread, `veins-gl.js` through thread D.

## What a slide says

```js
cutouts: ['lobule', 'sinusoid'],     // windows beside the anatomy, in plate order
cutoutSubject: 'anatomy',            // optional: the scale that runs blood ('anatomy' | 'lobule' | 'sinusoid')
```

`src/ui/cutouts.js` (no DOM, no GPU; `tests/cutouts.test.js`) holds the field's rules and the plate's geometry:

- `offeredCutouts(slide, { landscape, lens, sinusoid })`: the windows shown now. Not on a phone or an upright iPad (they keep the scale
  pill), not on a visual, a question (a window would give the answer away), the Circuit, or a slide that opens inside the lobule or
  sinusoid. The sinusoid only on a pressure-lens slide and only where the device draws it (as `scale-switch.js`). A catheter, Doppler probe
  or calipers stay: the anatomy stays on screen beside them (the scale pill's rule excluded them because a flip replaced the figure).
- `plateRects(free, kinds, view)`: the mock's layouts scaled to the free rect (the room the top bar, dock and cards leave): the figure
  62.5% wide on the left, the lobule's round window as wide as the column on the right, the sinusoid's two thirds of it hung under it.
  `view` 'lobule' or 'sinusoid' is a dive: that window fills the room and the scales it left become small round corner windows, the way back.
  Shapes are `{ x, y, w, h, r }`, so a dive is `lerpShape` of one into the next.
- `coneTangents(p, c, R)`: the magnifier's two lines from the ring on the figure to a window.
- `bloodShare(scale, subject)`: 1 for the subject, 0 for the others.

## Slides that use it (8)

Each is an anatomy-main slide where the cause and the effect sit at different scales. Built-in slides list the field in
`tests/deck-adopted.js`.

| Slide | Windows | Why |
|---|---|---|
| stiffness / fibrosis | lobule, sinusoid | the scarring slider: scar in the sinusoid, stiffness and pressure on the figure |
| masld / regress | lobule, sinusoid | twelve percent of body weight lost, the scar regresses |
| cause-treated / year1 | lobule | cure: lens "since", so no sinusoid window (it draws pressure only) |
| cause-treated / year2 | lobule, sinusoid | the same, a second year on |
| ascites / fill | lobule, sinusoid | pressure in the sinusoids, lymph overrun, fluid in the belly |
| hvpg / wedge | sinusoid | the wedge reads the sinusoids; the catheter stays on the anatomy |
| lobule / wedge | sinusoid | schistosomiasis: portal vein high, sinusoids not, so the wedge stays normal |
| outflow / bcs | lobule | heat lens, so lobule only: congestion of zone 3 behind the clotted veins |

Not given the field, and why. `treatment / carv` is a question slide (the windows would answer it). `treatment / carv-sin` (carvedilol
relaxes the sinusoids) opens inside the sinusoid; it can take the field only once its main figure is the anatomy (cam `liver`, subject
`sinusoid`), which changes the slide, so it waits for Mohammad's word. Slides with cam `lobule:*` or `sinusoid` stay as they are: their
main figure is already a small scale.

## What is built, and what is next

Built (phase 1): the field, its rules, the layouts, the cone, the blood rule, the deck slides, the tests.

Not built yet (phase 2, the drawing). Findings from reading the code, for whoever builds it:

1. **The lobule's picture is already a texture the figure's present lays through an affine map** (`lobule-zoom.js` `layShared`:
   `top.lay(tex, a, b, c, d, tx, ty, alpha)`, `veins-gl.js` `layTex`, LAYT_FS). The dive and the rise scale it that way. A window is the
   same lay with the window's map and a circular (rounded) mask: a new `layWin` beside `layTex`. That is in `veins-gl.js`, thread D's file.
2. **The lobule view is one object** (`createLobuleZoom`, made once in `stage.js`), with the store, the camera records
   (`cams.lobule.*`), the dive, `fade` and `freeRect()` as singletons. A window needs it open at its framing (`lobule:fit`) while the
   anatomy is still drawn: `covers()` (true once the lobule or the field covers the anatomy) must say false, and `freeRect()` must be the
   window's square. No second instance: it would double every store listener and camera record.
3. **The sinusoid is not independent of the lobule.** `sinU` (0 to 1) turns the lobule view into the sinusoid view, a pass laid over the
   lobule's. Showing both at once means the sinusoid pass is laid through its own window by its own map, with its own framing record, and
   `sinU` no longer meaning "the lobule is gone". `sinusoid-view.js` and the sinusoid parts of `lobule-zoom.js` carry that.
4. **Blood.** The lobule's moving blood (`lzLoop`, `flowLiveAt`) and the sinusoid's cells stop when the scale is not the subject
   (`bloodShare`). The anatomy's blood stops the same way (the stage's flow clock).
5. **Cost.** The lobule draws at the stage's size today. A window should draw at its own size (the lobule's `canvasPx` and the figure's
   render scale can take the window's pixel size), once, and keep it; only the subject redraws every frame. Read `?perf` on the first
   slide before widening.
6. **Room.** The anatomy fits the room the windows leave the way it does for cards (`--pz-r`/`--right-occ`, `stage-fit.js`):
   `plateRects(...).anatomy` gives the rect.
7. **Rings, cones and frames** are a small model drawn by `svg-gl` (as the lobule's leaders are), not new SVG. The windows' names and
   readings go through the labels thread.
8. **A tap on a window** runs the existing dive for the lobule; for the sinusoid the existing `diveSinusoid`. The corner windows of the
   scales left behind are the same lay with the corner map from `plateRects(free, kinds, view)`.

Phase 2 touches `veins-gl.js` (thread D), `lobule-zoom.js` and `sinusoid-view.js` (the label code in them belongs to the labels thread),
`stage.js` and `presenter.js`.
