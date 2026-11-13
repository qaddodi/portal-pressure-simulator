# Two GPU contexts: the figure and the UI (as built)

**Status (11 Nov 2026): built.** Written as a plan on 4 Nov 2026 (it took over B1 of `docs/pure-gpu-plan.md`). Every work package below
landed: the app has two real WebGL contexts, and `tests/gl-contexts.test.js` fails a third. This file is kept as the as-built note,
because source comments and tests cite its package letters (X0, L1, L2, U1, U2, F1, F2, S1, S2, D1 to D6).

## The two contexts

| Context | Canvas | What draws in it |
|---|---|---|
| **Figure** (`veins-gl.js`) | the stage's `vCanvas`, the only full-screen GPU canvas | anatomy and circuit figure, lobule, sinusoid, tissue, field, wide copy, fx overlay, stage labels and leaders, lobule and sinusoid captions, the lobule resolution cover, presenter ink, and the glass behind the cards |
| **UI** (`trace-gl.js`, the chart pool) | one `OffscreenCanvas`, never on screen | every chart, Doppler, endoscopy, scope tile, FibroScan beam, vitals monitor, menu profiles, widgets. Each card shows its picture in its own `bitmaprenderer` canvas, which is not a GL context |

Cards, menus, sheets and buttons stay HTML (text selection, zoom, find-in-page and VoiceOver).

`tests/gl-contexts.test.js` lists every `getContext('webgl2'|'webgl')` site in `src/`: `veins-gl.js` (1, the figure), `trace-gl.js` (2: the
pool, plus an own-canvas fallback for a chart when the pool cannot be had), the probes in `gl-support.js` and `sw-yield.js`, and the
software-yield probe on the figure's canvas in `stage.js`. Adding a site anywhere else fails the test: share the figure's or the pool's
context instead.

## Why two, not one (the rules that still hold)

1. **The glass belongs with the figure.** A card's glass is a blurred picture of the figure behind it. In the UI context the figure's
   picture would have to be copied between contexts every frame, which is what the old glass copy did. The glass is drawn in the figure's
   context, under the card's HTML.
2. **The UI context has no full-screen canvas.** Cards overlap (the deck stack, a thrown card, a sheet over a card). One full-screen canvas
   for charts would sit at one depth and draw a back card's chart over the front card. The pool draws each chart off screen and hands the
   picture to that card's own small canvas, which moves and stacks with the card.
3. **A lost context stays contained.** A lost chart pool never blanks the figure or the labels, and the reverse.
4. **Labels, captions and ink are drawn in the figure's present, before the glass pass.** A card over a label then shows it blurred, as
   glass would, and there are no holes to cut. They use the same camera numbers as the figure in the same present, so they cannot be a frame
   behind it (`tests/label-host-ride.test.js`).
5. **No fallback contexts.** The lobule, tissue, fx, wide copy, field and sinusoid draw only in the figure's context. If it is missing or
   lost they keep the last picture and draw again when it comes back.
6. **One chart pool.** Its buffer grows in `CAP_STEP` (256 px) steps to the largest chart drawn lately (cut back after a quiet second),
   every chart draws in the buffer's lower left (viewport and scissor), and the card's canvas is clipped to the chart's box, so pixels map
   1:1 and nothing is resized or copied (`trace-gl.js`, `tests/chart-pools.test.js`).

## Where each package landed

| Package | What | Where it is now |
|---|---|---|
| X0 | the context guard | `tests/gl-contexts.test.js` |
| L1 | lobule and sinusoid captions in the figure's context | `label-captions.js` (host mode), `tests/captions-in-figure.test.js`, `tests/captions-closed-layer.test.js` |
| L2 | lobule resolution cover without a canvas copy | `res-cover-gl.js` (`blitFramebuffer` inside the context) |
| L3 | the lobule's frame cost | not verified as a whole; the lobule's present and leaders were reworked in `veins-gl.js` and `lobule-zoom.js` |
| U1 | FibroScan beam and vitals monitor in the pool | `fibroscan-gl.js`, `vitals-gl.js` (no context of their own), `tests/vitals-gl.test.js` |
| F1 | presenter ink as a pass of the figure's present | `ink-gl.js`, `tests/ink-pass.test.js` |
| S1, S2 | label-gl host mode with ghosts, camera ride and draw order; host mode the only mode | `label-gl.js` (`createLabelGL` returns null without a host) |
| U2 | one chart pool | `trace-gl.js` (`pools[0]`, `CAP_STEP`) |
| F2 | remove the lobule's fallback contexts | no `getContext` in `lobule-zoom.js`, `tissue-gl.js`, `fx-gl.js`, `wide-gl.js`, `field-gl.js`, `sinusoid-view.js` |
| T1 | the 21 failing unit tests | superseded: the suite is the check (`npm test`) |

The endoscopy field (`endo-gl.js`) also draws in the pool's context now (pure-GPU plan A5).
