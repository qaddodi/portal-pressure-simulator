# Why the Mac still heats up while the app runs (13 Nov 2026)

Read at `bab345fd` on `claude/settings-topbar-icon-flvft1`. Method: code reading, arithmetic, and node traces of the real stage (jsdom, the
do-nothing WebGL of `tests/stage-gl-boot.js`, the real worker core on a fake clock, the healthy profile set, the blood shown, the model
running, counted after 8 s untouched so rest pacing is on). No browser, no headless picture, no device readout. Every line says whether it
is **measured** (counted in a node trace) or **inferred** (reasoned from the code). Node counts calls and frames, not GPU time; the GPU
cost at 9 MP is arithmetic on those counts.

## The short answer

At rest the app still draws the figure about 30 times a second (in a talk, 20 after a slide is left 30 s: built later the same day), and at his Figure size (Full,
3840 x 2346 = 9.0 MP) every one of those frames moves the whole 9 MP canvas around two or three times. Three things made it worse than it
had to be:

1. **Every rest frame counted as a brand new picture (fixed in this branch).** Two small writers changed the figure's inputs on every
   frame even though no pixel changed: the bowel's float was handed to the organ stack on every draw, and the ascites ripple's clock kept
   ticking with no ascites on screen. So no frame was ever "the blood alone": every lumen was repainted, and the glass over the figure (top
   bar, dock, cards) treated each frame as a new picture to blur again. The 4 Hz blood-in-glass rule from 12 Nov never got a chance to act.
2. **The labels ask for extra whole-canvas presents between the figure's frames** (measured 7 a second with nothing on screen, 11 a second
   with a TIPS shown). Each one is a full 9 MP lay of the picture plus the glass and labels. Label code, so a brief, not built.
3. **The 30 Hz floor in a talk times 9 MP.** At rest the figure drew 30 frames a second in a talk forever (15 Hz only outside a talk,
   after 30 s; since 6a3c9394 a talk steps to 20 after 30 s untouched). At Full that is about 0.8 to 1 gigapixel a second of whole-canvas copies before any shading. Figure size is his choice;
   the 1.5 MP default is six times less work on every one of these passes.

The source fix the 12 Nov readout called for ("skip the picture-version bump when the pixels don't change") had landed for one writer
only (0a8adf26, the liver's congestion breath). The node trace now shows **0 organ-layer repaints a second at rest** in healthy,
decompensated cirrhosis, SOS, cirrhosis with a TIPS and cirrhosis with a Warren shunt, so that writer is gone. But the **picture version**
was still bumped on every rest frame by the two writers in item 1. After this branch, the only picture bumps left at rest are the model's
own vessel-row redraws (7 a second healthy, 9 in decompensated cirrhosis, 18 in SOS).

## What runs at rest, by the numbers

Node trace, Explore, healthy, blood on, model running, 1200 x 800 at 2x (rest pacing on). Per second:

| What | Before this branch | After |
|---|---|---|
| Scheduler frames (page wakes) | 43 | 43 |
| Figure composites (`counts.composite`) | 30 | 30 |
| ...of which counted as a new picture (`pictureSeq` bumped) | 30 (all) | 7 (model row redraws only) |
| ...of which the blood's alone (still lumens left alone) | 0 ("still lumens left alone: off") | 23 ("211 of 253 rows" left as drawn) |
| Whole-canvas presents (`counts.present`) | 37 | 37 |
| ...of which extra, asked by the labels between figure frames | 7 (11 with a TIPS shown) | same |
| Organ-layer repaints (`counts.organ`) | 0 | 0 |
| Overlay rebuilds (clamps, stents, sutures) | 0 | 0 |
| Label layouts (`updateLabels`) | 10 (one per model frame) | 10 |
| Model frames from the worker | 10 | 10 |

The two writers, found by counting which entry of the composite's "same as last picture" signature changed (`veins-gl.js` `sigNow`,
index 212 `texVer` and index 26 `fluidS.w`), on 135 of 135 rest composites in 5 s:

- `stage-vessels.js:1033` (was 1031) called `veins.organs.shift('bowel', dy)` on every drawn frame. The stack itself ignores a shift to the
  same place (`organs-gl.js:767`), but the renderer's wrapper bumps the texture version first (`veins-gl.js:4566`
  `shift: (name, dy) => { texVer++; ... }`), and `texVer` is in the signature.
- `stage-transitions.js:226` (was 223) stepped the ripple phase `fluidLook.s[3]` every frame while the model ran. The shader reads it only
  inside `if (fluidInk.a > 0.0)` (`veins-gl.js:1383`), and with no ascites the ink is 0, so it changed no pixel.

What the GPU does at 9 MP per rest frame (arithmetic from the trace's own gauges at 1.5 MP, scaled by 6):

- Blood squares: 0.3 of 1.5 MP, so about 1.8 MP of the composite shader (`COMP_FS`) per frame. Before the fix every pixel in them ran the
  whole shader; now the 211 rows whose blood did not move return early.
- Tube lumen layer: drawn in 45% of the vessel layer, so about 4 MP per blood frame (`veins-gl.js:5204`).
- Each present: the kept picture laid onto the kept screen (9 MP), the screen copied onto the canvas at the frame's end (9 MP,
  `keep-screen.js`), then the browser composites the 9 MP canvas. About 27 MP of copies a present, 37 presents a second: about 1.0 Gpx/s.
- Glass: the cards' and the bars' glass takes the picture's count every third picture (`stage.js:2058` heldPictures). With 30 new
  pictures a second it blurred again about 10 times a second (his 12 Nov readout: 17 a second on a slide with cards); with 7 it is about
  2 or 3, plus the blood at 4 Hz (`blur-share.js:96`). Each blur halves the canvas region behind the glasses down to 64 CSS px texels;
  at 9 MP the bars plus one slide card are roughly 2 to 4 MP of first copy. **Inferred** (the node page has no bars or cards).

## Ranked causes

Cost is the share of the GPU's work a second at rest on his 9 MP Mac, estimated from the counts above. "Measured" and "inferred" refer to
the evidence, not the cost, which is always an estimate.

| Rank | Cause | Evidence | Cost on his 9 MP Mac | Fix | Status |
|---|---|---|---|---|---|
| 1 | Every rest frame was a new picture: all lumens repainted, the glass re-blurred about 10 times a second | Measured: 30 of 30 composites a second bumped `pictureSeq`, signature entries 26 and 212 changed every time; `stage-vessels.js:1033`, `stage-transitions.js:226`, `veins-gl.js:4566`, `veins-gl.js:1383` | Large: the full `COMP_FS` over about 1.8 MP 30 times a second, plus about 10 glass re-blurs of 2 to 4 MP a second (inferred) | Hand the bowel's float to the stack only when it moves (or after a setLive); hand the ripple's phase on only while the fluid shows | Built in abb71b27 (`tests/heat-rest-picture.test.js`) |
| 2 | The 30 Hz floor in a talk, at Figure size Full | Code: `frame.js:829` (no 15 Hz in a talk), `stage.js:2758`; Figure size Full = 9.0 MP against the 1.5 MP Mac default | Largest single multiplier: every canvas pass is 6 times what it is at 1.5 MP. About 1 Gpx/s of copies at 30 presents a second | Options for him: Figure size 1.5 MP or "Auto at rest"; or let a talk step to 20 Hz after 30 s untouched (blood moves on its own clock, so speeds do not change) | He picked the 20 Hz step. Built in 6a3c9394 (`tests/talk-rest-20hz.test.js`): rest pacing through `restGapFor`, not a cap (a whole-app 30 Hz cap flickered on 4 Nov); 30 Hz from 4 to 30 s, then 20 Hz (46 ms gap), never 15; Full sharpness kept |
| 3 | Labels ask for an extra whole present between the figure's paced frames | Measured: 37 presents a second against 30 composites (healthy), 41 against 30 with a TIPS; stack: `label-gl.js:2631` sync calls `ask()` after every layout, `label-gl.js:1553` againTick asks the host next frame, `veins-gl.js:3453` presentAsk lays a whole present when no picture was laid that frame | About 20 to 30% more whole presents: 7 to 11 a second times about 27 MP of copies, 0.2 to 0.3 Gpx/s, plus the glass and labels drawn each time | Brief L-H1 below | Brief for the label thread (and D for the host side) |
| 4 | Model frames redraw vessel rows and re-run the whole update | Measured: row redraws ("part") 7/s healthy, 9/s decompensated cirrhosis, 18/s SOS, each a new picture; full update 10/s; width steps 20/s that re-render every moving vein's tube (`stage-tubes.js` stepWidthsInner) | Medium: each row redraw is a new picture for the glass (now the only one at rest); CPU on the main thread (inferred, node cannot time it) | Drop changes below what shows before they reach the renderer, and refresh reading text at 4 Hz (heat-speed-label-lock H4) | Brief for D (veins-gl and stage-vessels) and the stage owner |
| 5 | The Tube's lumen layer is drawn for every blood frame over 45% of the layer | Measured gauge: "drawn in 0.67 MP (45%)" at 1.5 MP; `veins-gl.js:5204` | Medium: about 4 MP a frame at 9 MP, 120 MP/s at 30 Hz | Brief D-1 below | Brief for D |
| 6 | An ascites ripple makes every frame a new picture on ascites slides | Measured: with cirrhosis decompensated, signature entry 26 changes every frame (correct: the surface moves) | Medium on ascites slides: the cards' glass re-blurs the fluid's region about 10 times a second | Brief D-2 below | Brief for D |
| 7 | The Doppler, the pressure strip and the vitals strip draw at 60 Hz, never rest-paced | Code: `doppler.js:1463` paces by `paceMs()` only; `pressure-time.js:446`, `vitals-monitor.js:305` the same | Small GPU (own small canvases), but it keeps the page at 60 wakes a second while a scope or the dock is open | Pace them by `restGapFor` too (30 Hz at rest) | He picked it. Built in 56ba6406 (`tests/instruments-rest-pace.test.js`): 30 steps a second at rest, 20 in a talk left 30 s, a timer between frames instead of 60 wakes; the sweep is drawn from the clock, so its speed is unchanged |

Checked and not a cause now (measured or read):

- **Organ layer at rest:** 0 repaints a second in all five patients traced (0a8adf26 holds). A slide's own marks or spotlight were not traced
  (the presenter does not boot in node); `?perf` names any writer by element and attribute (d2f0acb).
- **Parking at rest on a Mac:** rest pacing is on for every device since 12 Nov; the figure asked 34 frames a second and drew 30, and waits
  on a timer between drawn frames (`stage.js:2713` parkFor). Nothing found that keeps it from parking with a fine pointer.
- **Today's pushes:** the stent T2 rings, the sutures and the Warren junction are built in the overlay rebuild, which ran 0 times at rest
  with a TIPS and with a Warren shunt. The outline ink is a shader constant. The field glass (22d22282) removed the blur passes: a blur is
  now one copy and its halvings, no pass is added per frame. The glass cover board (3575b830, 2764fd75, b2632453) makes a string only when a
  cover changes. The foot-note and preset cards (96e7c75f, 567422c9) paint once and add their box to the glass. The menus (8eec663d) and
  the Tests card (ad168a7d) do nothing while shut. The TIPS Doppler changes (2bac1eca, bab345fd) change the shader, not how often it draws.
- **CSS animations:** the only infinite ones are the loading spinners (stopped when idle or removed), the skeleton shimmer, a look tile's
  busy spinner and the vitals alarm pulse (only while a vital is bad and the dock is open). None runs at rest on the figure.
- **Timers:** none at a high rate on the page (feedback ask 5 s; the ?perf readout only with ?perf). The worker ticks every 33 ms in its own
  thread and posts at most about 10 frames a second.

## Briefs

### L-H1, for the label thread: no present when the labels did not change

At rest `updateLabels` runs on every model frame (10 a second) and, with a TIPS, a DIPS, a scan, measuring sites or a camera move shown, on
every width step too (`stage-tubes.js` stepWidthsInner, `labels = ... || E.TIPS?.vis || E.DIPS?.vis`). Its tail calls `labelGL.sync`, which
ends with `ask()` whatever changed (`label-gl.js:2631`). `againTick` then asks the host next frame, and since the figure is waiting on its
rest timer that frame lays nothing else, so `presentAsk` lays a whole present for the labels alone (`veins-gl.js:3453`, flushPresent).

Proposed: in `sync`, ask only when a label's picture, place, alpha or set changed since the last draw (the sprites already keep what was
drawn). A value that ticks from 9 to 10 still asks. Expected: the 7 to 11 extra presents a second at rest go to about the number of
readings that really change. If that is not enough, the host side (D, stage.js `labelHost` and `presentAsk`): while the figure is
rest-paced and its next frame is due within one rest gap, let that frame's present carry the labels (a number shows up to 33 ms later; a
camera move unparks the figure at once, so pinned labels never trail it).

### D-1, for D (veins-gl.js): the lumen layer only where the blood moved

The Tube's stage 3 lumen pass runs on every frame that draws blood (`veins-gl.js:5204`), over 45% of the layer. On a blood-alone frame the
composite now leaves still rows alone (`stillOn`); the lumen pass could take the same `moved` rows and skip the strips of rows that did not
move. Not built: the lumen layer feeds the composite and the half-size streaks, and only D knows whether a skipped strip leaves its texels
valid for the next frame.

### D-2, for D (veins-gl.js): an unrelated texture version bump

`shift: (name, dy) => { texVer++; return stack.shift(name, dy); }` (`veins-gl.js:4566`) bumps the version even when the stack did nothing.
This branch stops the caller from asking every frame, which is enough at rest. To close it at the renderer too, have `organs-gl.js` shift
return whether it moved a layer and bump only then: `shift: (name, dy) => { if (stack.shift(name, dy)) texVer++; }`. The stack's own
staleness already makes the composite redraw the cells it covers (`stack.stale`, `dirt`), so nothing else depends on that bump.

### D-3, for D: the ripple as a blood-like frame

With ascites shown, the ripple's phase moves every frame, so every frame is a new picture and the cards' glass re-blurs the fluid's cells
every third picture. The ripple is motion of the same kind as the blood: a frame where only the ripple moved could count as blood
(`bloodSeq`, with the fluid's cells as its dirty rects), so the glass takes it at the same 4 Hz. Not built: it changes what the glass is told,
and the glass is a separate owner.

## What was built

abb71b27 (6ff0b2ed before the rebase), stage code only (no veins-gl, glass, label or compositor shader change):

- `stage-vessels.js` drawVeinsNow: the bowel's float is handed to the live organ stack only when it moved, or when a `setLive` since made new
  cuts (`stage-plate.js` sets `bowelAt` back to NaN at every setLive and setLiveAll). The stack ignored the repeats anyway, so no pixel changes.
- `stage-transitions.js` stepFluid: the ripple's phase is handed to the shader only while the fluid's ink is above 0. The phase itself runs on,
  so when ascites appears the ripple is where it would have been.
- `tests/organs-gl.test.js`: its source check of the bowel's float now names the new shape (handed on change, and again after every setLive).
- `tests/heat-rest-picture.test.js` (node, about 15 s): at rest with the blood shown, at least 60% of the figure's composites leave still
  lumens alone and most rows are left as drawn; with ascites shown the ripple still redraws the picture. It fails with either change taken out.

How he can feel it on the Mac: on a still slide with cards, or in Explore with the bars over the figure, at Figure size Full, the fan
should come on later and the Mac stay cooler after a few minutes left alone. The picture should look exactly the same: the glass, the blood,
an ascites ripple and the bowel's float on a filling abdomen all move as before. Nothing is asked of him beyond using it.

## Built after his picks (13 Nov, rows 2 and 7)

6a3c9394, a talk left on one slide steps to 20 Hz (row 2):

- `frame.js` restGapFor: in a talk, 30 s with no input and nothing moving gives `TALK_IDLE_MS` (46 ms: every 3rd frame of a 60 Hz screen,
  every 6th of a 120 Hz one, so 20 a second). From 4 to 30 s it is 30 a second as before, and a talk never goes to 15. Outside a talk the
  15 Hz idle step is unchanged. It is rest pacing, not a cap: any input, a camera, view or figure move, or a slide change (the loops' own
  busy stamps) gives the full rate back on the next frame. Figure size and sharpness are not touched.
- The blood and the eases step by the time that passed (capped at 0.1 s, above a 50 ms frame), so nothing moves slower; fewer pictures are drawn.
- ?perf: the blood pacing line reads "talk idle 20 Hz, one slide left 30 s (sharpness unchanged)" while it is on.
- `tests/talk-rest-20hz.test.js` (node): the steps (0, 28, 46 ms), about 20 drawn a second on 60, 90, 120 and 144 Hz screens, the full rate
  after an input, a busy stamp or a running move, Battery saver and ?rest=off still winning. The wiring (main.js, the dt caps, ?perf) is
  pinned in `scripts/rules-lint.mjs`, as new source checks may not live in tests.

56ba6406, the Doppler, the pressure strip and the vitals strip are rest-paced (row 7):

- Each loop now paces by `Math.max(paceMs(), restGapFor(now))`: 30 steps a second after 4 s untouched, 20 in a talk left 30 s. Between its
  frames each waits on a timer (`frame.js` restPark, the same 8 ms early wake the figure's loop uses), so an open scope or dock no longer
  wakes the page 60 times a second. Each lets its timer go on dispose.
- The sweeps were already drawn from the clock (the Doppler's newest column is `floor(clockNow * columns a second)`, the strips' head is the
  wall clock since the last sample), so only the step rate changes, never the speed. A Doppler change while paused, or the lab's own
  drawing, is still drawn at once.
- `tests/instruments-rest-pace.test.js` (node, fake clock and timers, the real worker's frames): the vitals and pressure strips draw about 60
  a second when touched, 30 at rest with about 30 wakes on a 60 Hz screen (at most 62 on a 120 Hz one, against 120), 20 in a talk after
  30 s, the full rate again after an input, and nothing left running once let go. The vitals strip drawn at 30 a second puts its trace
  in exactly the same place as at 60 on every frame both draw. The Doppler's loop shape is pinned in `scripts/rules-lint.mjs`.

How he can feel it on the Mac: in a talk, leave one slide alone for half a minute at Figure size Full; the figure then draws a third fewer
frames than before, so the fan should come on later on long slides. Touching anything, or Next, gives the full rate at once. With a
Doppler, the pressure strip or the vitals strip open, after 4 s untouched the traces step 30 times a second; they move at the same speed,
and at most a careful eye sees slightly coarser steps. ?perf, if he looks, names the rule on the blood pacing line.

Checks at 56ba6406: `npm run lint` clean (0 errors), `npm run check:static` passed, `npm test` 4923 of 4925 pass. The two failures,
`tests/proc-anim.test.js` "presented, Next drives it" and `tests/slide-beats.test.js` "Next goes through a slide's beats", fail the same
way at 6f6eeef8 before this work (presenter.js source checks, not heat). The deck-shape failure noted below is gone upstream.

Shots (headless, software GL, `scripts/shoot.mjs`, Mac, light): Explore healthy (bowel and organs in place) and decompensated cirrhosis
(the fluid band and the floated bowel as at a62ddf58, the commit before abb71b27); the Doppler deck's probe slide paused and with the model
running (the spectrum whole and unbroken after more than 2 minutes untouched in a talk, so on the 20 Hz step); the hyperdynamic deck's
vitals strip paused and running (whole, scrolled on); the portal day deck's beat-by-beat pressure strip. Nothing blank, stale or half
drawn. The pressure strip's slide never settles in a shot (its strip runs on its own while the model is held); it does the same at 6f6eeef8.

Checks at 6ff0b2ed (now abb71b27): `npm run lint` clean (0 errors), `npm run check:static` passed, `npm test` 4875 of 4876 pass. The one failure,
`tests/deck-shape.test.js` "every slide line is 30 words or fewer", fails the same way at `bab345fd` before this work (deck text, not heat).
