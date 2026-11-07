# Two GPU contexts: the figure and the UI (pure GPU plan B1, the rest)

4 Nov 2026. Takes over B1 in `docs/pure-gpu-plan.md` after ed6d10c (Doppler and endoscopy moved into the chart pool).
Plan only. Each work package below is sized for one Sonnet thread, lists its files, what it depends on, and a code-only check.
No browser, headless or screenshot runs. Unit tests (`npm test`) and lint are the checks.

## 1. The target

Mohammad's split, with two corrections (section 2):

| Context | Canvas | What draws in it |
|---|---|---|
| **Figure** (veins-gl) | the stage's `vCanvas`, the only full-screen GPU canvas | anatomy and circuit figure, lobule, sinusoid, tissue, field, wide copy, fx overlay, **stage labels and leaders**, **lobule and sinusoid captions**, **lobule resolution cover**, **presenter ink**, and **the glass behind the cards** |
| **UI** (trace-gl pool) | one `OffscreenCanvas`, never on screen | every chart, Doppler, endoscopy, scope tile, **FibroScan beam**, **vitals monitor**, menu profiles, widgets. Each card shows its picture in its own `bitmaprenderer` canvas, which is not a GL context |

Cards, menus, sheets and buttons stay HTML (decided earlier, for text, zoom and VoiceOver).

What is still separate today (from `grep getContext` on 78e96bc):

| Drawer | File | Today | Goes to |
|---|---|---|---|
| Stage labels | label-gl.js:603, stage.js:8883 | own canvas | Figure (S1, S2) |
| Lobule captions | label-captions.js:274 via lobule-zoom.js:175 | own canvas | Figure (L1) |
| Sinusoid captions | label-captions.js:274 via sinusoid-view.js:68 | own canvas | Figure (L1) |
| Lobule resolution cover | res-cover-gl.js:38 | own canvas, layers copied in from canvases | Figure (L2) |
| Presenter ink | ink-gl.js:157 | own canvas over the figure | Figure (F1) |
| FibroScan beam | fibroscan-gl.js:86 | own canvas | UI (U1) |
| Vitals monitor | vitals-gl.js:114 | own canvas | UI (U1) |
| Chart pools | trace-gl.js:65 | up to 3 OffscreenCanvas contexts | UI, one (U2) |
| Lobule, tissue, fx, wide, field, sinusoid when not shared | lobule-zoom.js, tissue-gl.js, fx-gl.js, wide-gl.js, sinusoid-view.js | own canvases only on the fallback path | remove the fallback (F2) |

The lobule, sinusoid, tissue, field, wide copy and fx overlay already draw in the figure's context when the lobule is shared
(lobule-zoom.js:820, sinusoid-view.js:226). So the lobule's remaining extra canvases are the captions and the cover.

## 2. Where the split needs a correction

1. **The glass belongs with the figure, not the UI.** A card's glass is a blurred picture of the figure behind it. To blur it in the
   UI context, the figure's picture would have to be copied from one context to the other every frame. That copy is exactly what G5
   removed (createImageBitmap, rehostSoon). The glass stays in the figure's context, drawn under the card's HTML. The card itself
   (its text, its buttons) is HTML.
2. **The UI context has no full-screen canvas.** Cards overlap (the deck stack, a throw, a sheet over a card). One full-screen canvas
   for every chart would sit at one depth, so a chart on a back card would draw over the front card. The UI context draws each chart
   off screen and hands the picture to that card's own small canvas, which moves and stacks with the card. That is how ed6d10c and
   the chart pool already work.

## 3. One context or two

**Recommendation: two.** One is possible only by drawing the charts in the figure's canvas, and that has three costs:
- Stacking breaks for the reason in 2.2: the figure's canvas sits under every card, so a chart drawn there sits under the card's
  background too. Cards would need see-through bodies and the charts drawn in the right order per card.
- Card motion would have to be redrawn by the figure's present every frame of a throw, at the card's place. Today a thrown card's chart
  moves with the card's own transform for free.
- A lost context takes everything with it. With two, a lost chart pool never blanks the figure or the labels, and the reverse.

Two contexts still give what B1 wanted: one full-screen GPU layer (the figure), one copy of the figure's atlases and programs, and
one copy of the charts' glyph field and programs.

## 4. The open decisions, with a recommendation each

**D1. Stage labels into the figure's context: yes.** It is the strongest way to make labels move 100% with the figure: they are drawn in
the same present, with the same camera numbers, so they cannot be a frame behind. Host mode (label-gl.js:598, `host`) first needs the
three things it lacks: view-switch ghosts, the camera ride and the glass holes (S1). Then host mode becomes the only mode (S2).

**D2. Labels under the glass, so no glass holes.** In the figure's present, draw labels and leaders before the glass pass. A card over a
label then shows it blurred, as real glass would, and the hole cutting goes away. The other way (labels over the glass, scissored out
under each card) keeps today's look but keeps the hole code. Recommend under. The same rule applies to the lobule and sinusoid captions.

**D3. Chart pools: one.** The three pools exist so charts of different sizes do not resize one buffer every frame. With one pool,
grow its buffer in 256 px steps to the largest chart drawn so far and never shrink it. Each chart draws in the buffer's top-left
corner (viewport and scissor), and its card canvas is given the buffer's size and clipped to the chart's box by a wrapper with
`overflow: hidden`, so pixels still map 1:1 and nothing is copied or resized. If a drawer is full-screen (trace-gl.js:47 mentions
"the page's words"), it is found first: if it lies over the figure, it moves to the figure's context; if not, it keeps a second
pool. Either way, the check is that the resize count stays at zero across a scripted run of mixed sizes.

**D4. Ink into the figure's context.** The pen already rides the figure through `stage.figureXform`. Drawn in the figure's present,
under the glass like the labels, it can never be a frame off.

**D5. Lobule and sinusoid captions into the figure's context: yes, first.** Same reasons as D1, and they sit over the lobule, where
Mohammad sees 5 to 10 fps.

**D6. The fallback contexts (a lobule that is not shared): remove them.** If the figure's context is missing or lost, keep the last
picture and retry, as the GPU rule says. A second set of contexts for the lobule is a path nobody tests.

## 5. The lobule's 5 to 10 fps: suspects from the code

Not measured (no ?perf readout, by rule). Read from lobule-zoom.js and veins-gl.js:
1. **Three extra full-screen canvases over the lobule**: the lobule captions, the sinusoid captions (when built) and the resolution
   cover, each composited every frame, plus the stage label canvas. L1 and L2 remove them.
2. **The figure's kept picture is laid under an opaque lobule every frame.** The lobule draws into its own texture, then the figure's
   present lays the figure's kept picture (31 MB at 3840x2230) and the lobule texture over it (veins-gl.js:2972 on). When the lobule
   covers the canvas, the figure's layer is hidden but still copied.
3. **The glass re-blurs every frame** because the flow animates the lobule under the cards (lobule-zoom.js:4899).
4. **Per-frame DOM writes for leaders**: `syncLeaders` and `leadTo` write SVG line `x2`/`y2` and classes while the labels themselves
   are GPU pictures (lobule-zoom.js:2690 to 2740).
5. `layoutLabels` runs in every frame's draw (lobule-zoom.js:2869). It returns early in most frames, but the ride path measures.

L3 works through 2 to 5.

## 6. Work packages

Order: **X0 and T1 first, in parallel. Then L1 and L3 in parallel. Then L2, U1, F1 in parallel. Then S1, then S2. Then U2. F2 last.**
The lobule packages go first because of the frame rate. S2 is the only package that edits stage.js (a few lines), so it rebases onto
the stage.js split thread's latest push and tells that thread which lines it touched.

### X0. Context guard (start now)
- **What:** a unit test listing every `getContext('webgl2'|'webgl')` in `src/`, with an allow-list that holds today's sites. Each later
  package deletes its own line. The end state: veins-gl.js (figure), trace-gl.js (pool) and the probes in gl-support.js and sw-yield.js.
- **Files:** `tests/gl-contexts.test.js` (new).
- **Depends on:** nothing.
- **Check:** `npm test` passes; adding a stray `getContext('webgl2')` in any src file makes it fail.

### T1. The failing unit tests (start now)
- **What:** 21 tests fail on 78e96bc (section 7). For each one, find whether the test is stale or the code regressed, and fix the right
  side. Never skip or loosen a test to get green.
- **Files:** the test files in section 7, and any code they show broken.
- **Depends on:** nothing. Does not touch stage.js unless a test proves a regression there; then it tells the split thread.
- **Check:** `npm test` shows 0 failing.

### L1. Lobule and sinusoid captions in the figure's context
- **What:** `createCaptions(box, { host })` passes the host to `createLabelGL` (label-gl.js:598 host mode already exists). lobule-zoom.js:175
  and sinusoid-view.js:68 pass the figure's top when shared. The captions are a pass of the figure's present at an order just above
  the sinusoid (`LZ_UNDER_GLASS - 3`), under the glass (D2). Their own canvases go. Keep the one label-gl look.
- **Files:** label-captions.js, lobule-zoom.js, sinusoid-view.js.
- **Depends on:** X0.
- **Check:** a unit test with a fake host GL: captions built with a host call no `getContext`, add one pass at the right order, and draw
  their instances in the host's present call. X0 lines for the captions are deleted. Existing caption tests pass.

### L3. The lobule's frame cost
- **What:** fix suspects 2 to 5 in section 5:
  (a) when a solo pass is opaque and covers the whole canvas, skip laying the figure's kept picture under it;
  (b) re-blur the glass during flow-only frames at quarter scale, the same picture through every zoom (it stays real GPU glass);
  (c) leaders: no SVG attribute or class writes in a frame while the labels are GPU pictures; they come from the layout numbers;
  (d) `layoutLabels` does nothing in a frame where the view and base are unchanged (no measuring).
- **Files:** veins-gl.js (present), glass-gl.js, lobule-zoom.js (leaders, layoutLabels). Not the caption code (L1's).
- **Depends on:** X0. Runs beside L1; rebase on whichever pushes first.
- **Check:** a unit test with a counting fake GL: one flow-only lobule frame makes at most one full-screen pass for the lobule and none
  for the hidden figure; a frame with no view change makes zero `setAttribute` calls on leaders. `npm run warm` stays within limits.

### L2. The lobule resolution cover in the figure's context
- **What:** at a resolution change, the lobule's last picture (already a texture in the figure's context) is copied inside the context
  (`blitFramebuffer`) into a kept texture, laid over the new layers as a pass and faded out by its weight. No canvas copied in, no
  context of its own. A second change while one fades keeps today's blend in the shader.
- **Files:** res-cover-gl.js, lobule-zoom.js (resSwap, resCoverStep).
- **Depends on:** L1 (same lobule present order).
- **Check:** unit test: the cover takes no `texImage2D` from a canvas and no `getContext`; its weight falls to 0 over its time; X0 line gone.

### U1. FibroScan beam and vitals monitor in the chart pool
- **What:** the same move ed6d10c made for Doppler: enter/leave the pool's context, draw at the card's size, hand the picture to the
  card's canvas. The vitals glyphs use the pool's SDF atlas, not their own copy.
- **Files:** fibroscan-gl.js, fibroscan.js, vitals-gl.js, vitals-monitor.js, trace-gl.js.
- **Depends on:** X0.
- **Check:** no `getContext` left in those files (X0 lines gone); existing fibroscan and vitals tests pass; a unit test that both
  draw through the pool's `enter`.

### F1. Presenter ink in the figure's context
- **What:** ink-gl draws as a pass of the figure's present, under the glass (D4), with the figure's camera numbers each present. It is
  added when ink is on and removed when it is off, as today.
- **Files:** ink-gl.js, presenter.js (where ink is made).
- **Depends on:** X0.
- **Check:** unit test: the pass is added on the first stroke and removed with the last, draws through the host's present, no `getContext`.

### S1. label-gl host mode gets what it lacks
- **What:** in host mode, (a) view-switch ghosts: the old view's instances kept and drawn fading out while the new ones fade in, as
  own-canvas mode does now; (b) the camera ride: the figure's camera matrix passed in each present (no CSS transform on a canvas);
  (c) draw order under the glass (D2), so no holes are needed.
- **Files:** label-gl.js only.
- **Depends on:** L1 (same host code).
- **Check:** unit test with a recording fake GL: for a ghost fade and a camera ride, host mode and own-canvas mode record the same
  instance lists and the same matrices frame by frame.

### S2. Stage labels in the figure's context, host mode the only mode
- **What:** stage.js:8883 builds label-gl with the figure's top. Remove own-canvas mode from label-gl.js and the glass holes for labels.
- **Files:** label-gl.js, stage.js (a few lines at the label-gl setup and the holes), glass-gl.js (the holes key).
- **Depends on:** S1. Rebase onto the stage.js split thread's latest and tell it which lines changed.
- **Check:** unit tests pass; X0 line for label-gl gone; if the split thread's node draw check covers the label draws, its record
  shows the labels drawn in the same present as the figure in every frame of a camera move.

### U2. One chart pool
- **What:** D3. First find the full-screen drawer (trace-gl.js:47) and decide its place as D3 says. Then `POOLS = 1`, buffer grown in
  256 px steps and never shrunk, each chart drawn in the top-left with viewport and scissor, card canvas sized to the buffer and
  clipped by its box.
- **Files:** trace-gl.js, the card canvas CSS (styles/app.css), and the full-screen drawer if it moves.
- **Depends on:** U1.
- **Check:** unit test: a scripted frame list of mixed chart sizes gives `sharedStats.resizes` 0 after warm-up and one context.

### F2. Remove the lobule's fallback contexts
- **What:** D6. lobule-zoom.js, tissue-gl.js, fx-gl.js, wide-gl.js, field-gl.js and sinusoid-view.js draw only hosted. When the figure's
  context is lost, they keep the last picture and draw again when it comes back.
- **Files:** those six.
- **Depends on:** L1, L2, L3, S2.
- **Check:** X0's allow-list is at its end state (veins-gl.js, trace-gl.js and the two probes). `npm test` passes.

## 7. The failing tests: they were failing before ed6d10c

Run with `npm ci` then `npm test` (node 22) on three commits:

| Commit | Pass | Fail |
|---|---|---|
| 1e35bb0 (before ed6d10c) | 3546 | 35 |
| ed6d10c | 3620 | 20 |
| 78e96bc (now, WP1) | 3623 | 21 |

All 20 that fail on ed6d10c also fail on 1e35bb0, so ed6d10c did not cause them. They are:
- card-throw-back, card-throw-finishes (4), card-throw-reenter, card-throw-state (6): 12 tests, all `st.getPropertyPriority is not a
  function`. The code now calls `getPropertyPriority` and the tests' fake style object lacks it.
- veins-relay (3), label-repack (R12 atlas packing), organs-gl, pressure-along, streak-length, figure-performance: 8 tests.

The 21st, on 78e96bc, is new with WP1: stop-tokens "the stop table is made from the style rules and tokens as they are now (run
npm run gen:stops when this fails)".
