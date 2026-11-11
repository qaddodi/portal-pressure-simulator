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

Phase 1 (8dc6cca): the field, its rules, the layouts, the cone, the blood rule, the deck slides, the tests.

Phase 2a, the lobule window: `lobule-zoom.js` gets a plate mode (`plateOn(win, run)`, `plateOff`). The lobule is drawn as it is for the stage
(framed whole in the room the cards leave, at half the pixels) and its texture is laid through the window with `top.lay(..., win)` (thread D,
77f03b8), so the hexagon fills a round window and nothing outside it is written. In plate mode nothing outside the lobule sees it as open or
shown (`isOpen`, `isShown`, `covers` say no), its pass is not solo (the figure's picture stays under it), its names and leaders are off, and
its blood runs only for the subject (`flowA`). `stage.plateLobule(win, run)` opens it, loading the lobule's code if it has not arrived;
`presenter.js layout()` reserves the column in `--pz-r` (the figure frames itself in what is left, as it does for cards) and places the window
from `plateRects`. Mac and iPad landscape only, never while the lobule itself is open or diving.

Phase 2b, the frame (`src/ui/cutout-frame-gl.js`): the ring round the lobule's window (with its soft shadow), the ring on the liver and the
cone's two lines are one pass of the figure's present (`top.add`, order -4: over the lobule's window, under the ink and every glass), a
fullscreen triangle scissored to the frame's box with the shapes as distance fields in the fragment shader. The liver's spot is kept in world
units and put through each frame's camera (`stage.figureXform`), so it rides a pan, zoom or glide in the same present as the figure. No DOM
shapes, no canvas. `presenter.js platePlace` only sets the plan; the `data-safe` strip that reserves the column stays a DOM element (it is
read, never drawn). Shader check: `node scripts/glsl-compile.mjs "cutout frame (plate ring, spot, cone)"`.

Phase 2c (Mohammad, 11 Nov, Liver stiffness 3/17): the liver's spot sits on the open right lobe, between the portal branches and the hepatic
veins (`PLATE_SPOT` in `presenter.js`, fractions of the liver's box). The window closes like the scope view: a round x on its rim, and it
opens again by a tap on the spot (`stage.onPlateTap`, `cutout-frame-gl.js hit`, as the scope's ring is tapped). Shut, the window gives
its room back and the figure frames itself in it; the spot stays, a little fuller, as the way back. A new slide opens its windows again.
Unlike the scope view, a tap elsewhere on the figure does not close it (the tap on a window will dive into it).

Not built yet:

- the sinusoid window (the sinusoid is a pass turned out of the lobule by `sinU`; it needs its own framing record and its own lay through a window),
- the anatomy's blood stopping when the subject is a window,
- the tap that dives into a window with the corner windows,
- the windows' names and readings (the labels thread).

Findings that hold for them:

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
7. **Rings, cones and frames** are the GPU pass above. The windows' names and readings go through the labels thread.
8. **A tap on a window** runs the existing dive for the lobule; for the sinusoid the existing `diveSinusoid`. The corner windows of the
   scales left behind are the same lay with the corner map from `plateRects(free, kinds, view)`.

Phase 2 touches `veins-gl.js` (thread D), `lobule-zoom.js` and `sinusoid-view.js` (the label code in them belongs to the labels thread),
`stage.js` and `presenter.js`.
