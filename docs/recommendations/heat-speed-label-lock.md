# Heat, speed and labels that lag a pan: what is happening and what to build

Opus review, 12 Nov 2026, read at `5dc6051` on the preview branch. Docs only: nothing in the app changed.
Method: code read plus arithmetic. No browser, headless or device runs (owner's rule), so every finding below says whether it is
read straight from the code (**verified in code**) or reasoned from it (**inferred**).

## The short version

1. **Figure size does not reach the costs that matter.** It shrinks only the vessel picture. The canvas that the labels, glass,
   overlays and the upscale are drawn into stays at about 1 CSS px per px (a Mac at 2 MP lands there too), and every frame still
   runs several passes over that whole canvas. The earlier low-res review measured a calm frame at 0.25 MP as about 90 % canvas
   work. So 0.25 MP feels the same as 2 MP for heat, and it makes the label stepping in L3 below coarser, not finer.
2. **Heat: the Mac draws the figure 60 times a second for as long as the blood is shown.** The calm 30 Hz step was set to 0 on
   4 Nov during the flicker chase and never came back (`stage.js:2515`, `CALM_MS = 0`). Touch devices got their own rest pacing
   on 10 Nov (`ecc43f1`), but the Mac was left out on purpose. On top of that, the card glass blurs 30 times a second because
   the blood moves under it, and every model tick (30 a second) can redraw vessel cells and re-solve labels.
3. **The labels are drawn in the figure's own canvas, in the same present, under the same camera numbers.** For the labels that
   are pinned, the lock holds by design. The drift he sees comes from four places where it does not hold: labels that a hand pan
   never moves (L1), a full re-solve after every stop that slides labels while the figure stands still (L2), whole-pixel stepping
   of the words against sub-pixel vessels (L3), and number changes that re-solve the whole layout (L4).

## 3. Labels that move at a different speed than the figure

How it works now (**verified in code**): labels are a pass of the vessel canvas's present (`stage.js:2193`, label host,
`LABELS_ORDER`). During a hand pan nothing is laid out (`stage-labels.js` `updateLabels`, the "rigid labels" hold). Every label
is drawn each frame either **pinned**, at its station's point or its world anchor under this frame's camera plus its layout offset
(`label-gl.js` `pinOf`, `pinDev`), or, during a glide or a card zoom only, **ridden** by the ride matrix. Anything that is
neither is drawn where the layout last put it, in screen pixels (`label-gl.js:1644`).

### L1. Some labels are never moved by a hand pan (verified in code; high impact in the Circuit)

- `NO_ANCHOR = /^(lane:|scan|stage|60%:)/` (`stage-camera.js:140`) keeps these keys from getting a world anchor
  (`stage-label-layer.js:191`). The Circuit's lane captions (`lane:` + id, `stage-label-solve.js:1047`: the collateral and shunt
  lane names) are among them.
- A hand pan, pinch or wheel never starts a ride. `rideStart` is only called from the scene camera's start (`stage-zoom.js:51`:
  a card zoom, the readings card tucking). So `rideM` is null during a hand pan.
- Result: in the Circuit, lane captions stay at their screen spot while the circuit slides under them, then jump to the vessel
  when the pan ends and the layout runs. Any other label that failed its anchor goes the same way: one laid out mid-morph
  (`gp` needs morph 0 or 1), one marked hidden at layout time, or a station whose point the figure cannot give this frame
  (`pinOf` returns null).

**Fix (small).** Give lane captions a world anchor at their lane point, the same as every other figure label. Then add a safety
net: start the ride on the first frame of a hand gesture and end it at the settle, so any label that is still unpinned is carried
by the camera instead of standing still. Both live in label code, so the label thread builds them (one-owner rule).

### L2. After every stop the whole layout runs again, and labels slide while the figure is still (verified in code)

- When the hand lets go, `labelSettle` (`stage-labels.js:67`) clears the key and calls `updateLabels`, which runs a full solve.
  Any label whose new spot is more than 3 px from its old one fades to it (`MOVE_PX`, `label-gl.js:796`).
- So the figure stops, and a moment later labels move on their own. That reads as "the labels move at a different speed": they
  move when nothing else does. The solve is also the heaviest main-thread job in the app (about 46 s on software GL at Mac size,
  so likely hundreds of ms on a device). Every pan therefore ends with a CPU burst and a hitch.
- For a **pure pan** (same zoom, no turn), the layout is the same in world terms. Only labels that now cross the stage edge or a
  card need a new spot.

**Fix.** After a pure pan, keep every label's offset and re-place only the labels whose box now leaves the stage or touches a
card's box. Run a full solve only after a zoom past the existing 5 % step, a turn, or a change in what is shown. Expected impact:
no label motion after a pan, and no solve burst (less heat, no hitch). Owner: label thread.

### L3. Words step by whole pixels while the vessels glide (verified in code; worse at low Figure size)

- Pinned labels are drawn at `Math.round(PIN * dpr)` device px (`label-gl.js` `pinDev`, 826). `dpr` here is the vessel canvas's
  pixels per CSS px.
- At 0.25 MP that canvas sits on its floor of 1 px per CSS px (`stage-res.js:138`, `fullFloor`), and the Mac's 2 MP default
  lands near 1 too. So a label steps 2 physical px at a time on a Mac and 3 on an iPhone.
- The vessels are drawn at whole picture pixels and moved by the leftover fraction in the upscale pass (`subPixel` → `setRest` →
  `UP_FS uOff`), so they glide smoothly. On a slow pan the words shimmer against the vessels by up to half a step either way.

**Fix.** Keep the canvas the labels and glass are drawn into at 2 device px per CSS px on phones and Macs, and cap only the
picture (this is item 5's "phone canvas ≥ 2x" in the lowest-resolution recs). If that costs too much, draw pinned labels at
their exact fractional place during a move (linear sampling of the atlas) and snap them only at rest. Owner: D (canvas size) or
the label thread (fractional draw).

### L4. A number changing width re-solves every label (verified in code; inferred to be frequent)

- On a model frame, `refreshValues` (`stage-labels.js:335`) returns false as soon as one reading's box changes width by more
  than half a pixel (line 345), for example 9 → 10 mmHg. That forces a full layout.
- With the model running, labels can re-solve many times a minute with no camera move at all. They hop, and the main thread
  pays for a solve each time.

**Fix.** Lay each reading out at the width of its widest value (tabular digits, padded to the most digits it can show), so
value changes never move its box. Owner: label thread.

## 1. Heat

### H1. Bring the calm 30 Hz back on the Mac, and the idle 15 Hz step (verified in code; biggest single heat cut)

- `CALM_MS = 0` (`stage.js:2515`): while the blood is shown, the Mac draws every 60 Hz frame forever (60 Hz because `motion60`
  caps a 120 Hz screen).
- Each blood frame runs the composite, the upscale into the kept screen, the overlays, the labels pass, the glass, and the
  `keepScreen` whole-canvas blit (`keep-screen.js`), and then the browser composites the canvas onto the screen.
- The 30 Hz step was removed on 4 Nov because a whole-app 30 Hz caused flicker. That flicker came from the shown canvas being
  drawn on part-way through a frame. On 8 Nov `keepScreen` changed that: the shown canvas now gets one whole blit a frame and
  nothing else. The reason for keeping 60 Hz at rest looks gone, but this is **inferred** and needs one look on his Mac.
- **Build:** use the same `restGapFor` the touch devices use on fine pointers too. That is 30 Hz after 4 s with only the blood
  moving and 15 Hz after 30 s with no input. Talks never go below 30 (existing rule). Pans, zooms and glides stay at the full
  rate.
- **Expected:** about half the GPU work at rest, and about three quarters less after 30 s untouched. ?rest=off stays as the
  off switch.

### H2. The glass blurs the blood 30 times a second (verified in code)

- `BLOOD_BLUR_MS = 28` (`blur-share.js:95`): with blood moving under a card, its glass is blurred again every other frame. During
  a pan the view changes every frame, so it blurs every frame.
- At 22 px of blur, moving streaks cannot be seen through a card. Only the vessels and organs show as soft shapes.
- **Build (at rest):** blur the figure picture without the blood layer for the glass, or refresh the blood in the glass at 4 Hz
  or less. The tint and blur stay identical everywhere (11 Nov rule); only how often they are recomputed changes.
- **Build (during a pan):** blur is shift-invariant, so move the last blurred texture by the pan's offset and blur only the strip
  the pan uncovers, the same way the vessel layer's `shiftLayer` works.
- **Expected:** most of the glass cost at rest and during pans on slides with cards. Owner: the glass thread.

### H3. Lay only the parts of the canvas the blood changed (inferred; medium–large)

- At rest the only thing changing is the blood, but each frame upscales and blits the whole canvas. The renderer already tracks
  the blood's changed tiles (`bloodDirtyRects`, `veins-gl.js:5342`).
- **Build:** scissor the upscale and the `keepScreen` blit to those rects when the camera, picture and overlays are unchanged.
- **Expected:** at rest, canvas-size work shrinks to the area the blood actually covers. This is the cost Figure size cannot
  reach. Owner: D (veins-gl.js; COMP_FS untouched).

### H4. Model ticks redraw vessels and labels 30 times a second (inferred)

- The worker posts a frame every 33 ms (`worker-core.js:447`). Each one can change vessel colours or radii, which redraws cells
  (`drawRows`) or, above 60 % of cells or under a switch piece, the whole layer. Each one also rebuilds the label signature and
  refreshes the values (and L4 then re-solves).
- **Build:** in steady state, drop vessel changes below what can be seen (under 1/255 in colour, under 0.1 px in radius) before
  they reach the renderer, and update reading text at 4 Hz. Physiology is not frozen; the screen just stops repainting changes
  nobody can see.

### H5. The lobule and sinusoid ignore Figure size (already in the lowest-resolution recs, item 3)

- When the lobule is open, it is the heaviest view (about 21 fps at rest, GPU-bound).
- Repeated here because it is the single largest heat item while that view is open.

### H6. Option: a true stop at deep idle (his call)

- After 30 s with no input in Explore, idle rest already stops the model's worker, so nothing new is being computed. Blood
  frames could stop after a further few minutes untouched, and the first input would wake them.
- This would show a still figure, which goes against "never frozen physiology". It is listed so he can decide; do not build it
  without his yes.

## 2. Speed (frames while you pan)

What a pan frame does now (**verified in code**): the vessel layer is shifted by whole pixels and only the uncovered strips are
drawn (cheap). Then the glass blurs again (H2), the cards-follow script runs, the readings callouts get new DOM transforms
(`sitesPaint`), the labels pass runs, and the blit happens. The hitches come from:

- **S1. The settle solve (L2).** The biggest main-thread stall, once per gesture. The fix is L2.
- **S2. Model frames during a pan.** Rows changing mid-pan force cell redraws on top of the shift, or a whole draw ("tubes
  changed", more than 60 % of cells). **Build:** while a hand is on the figure, hold the model's vessel changes and apply them
  together about 150 ms after it lets go. The numbers in cards keep updating.
- **S3. Glass during a pan (H2's shift).** Turns the blur at every pan frame into one strip blur.
- **S4. Move the label solve off the main thread.** The solve is maths on boxes and points. Run it in a worker and hand back
  offsets. This is the long-term answer to the 46 s headless and multi-second device solves; L2 is the quick one.
- **S5. The view switch's 107 ms GPU frames** (11 Nov, cause still open) need their own diagnosis. Resolution does not change
  them.

## Build order (ranked by what he will feel)

| # | Item | Fixes | Size | Owner |
|---|---|---|---|---|
| 1 | L1 lane anchors + hand-pan ride safety net | labels left behind in a pan | small | label thread |
| 2 | L2 no full solve after a pure pan | labels sliding after a stop, hitch, CPU heat | medium | label thread |
| 3 | H1 calm 30 Hz / idle 15 Hz on Mac | heat at rest | small (needs one Mac look for flicker) | stage.js / frame.js |
| 4 | H2 glass: no blood blur at rest, shifted blur in pans | heat at rest, pan speed | medium | glass thread |
| 5 | L4 fixed-width readings | labels hopping, CPU | small | label thread |
| 6 | S2 hold model vessel changes during a hand gesture | pan hitches | small | D |
| 7 | L3 canvas 2x for labels and glass, picture capped | word shimmer on slow pans | small code, some GPU cost | D |
| 8 | H3 scissored present at rest | heat at rest | medium | D |
| 9 | H4 drop invisible model changes | heat, CPU | medium | stage + worker |
| 10 | S4 label solve in a worker | stalls, heat | large | label thread |
| 11 | H5 lobule under budget | heat with the lobule open | medium | lobule |
| — | H6 stop at deep idle | heat when left open | small | only if he says yes |

Items 1, 2, 3 and 5 together target all three complaints: no label left behind or sliding after a pan, and roughly half the GPU
work at rest on the Mac.
