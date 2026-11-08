# Animation and transition recommendations (8 Nov 2026)

Read from the code of `claude/settings-topbar-icon-flvft1` at 2bde649. Nothing in the app was changed and nothing was run in a browser:
five readers each took one part (CSS and menus, slide changes and cards, camera and view change, instruments and blood, labels and
glass), and every finding ranked P1 or P2 below was then read again line by line. Line numbers are for 2bde649.

Every change proposed here stays on the GPU: frames through `frameFor`, per-frame DOM writes only to transform, opacity and clip-path,
no new CSS repaint, no canvas 2D. Decisions already made are kept and are not re-opened (list at the end).

## The short version

The motion core is in good shape. There is one easing family (`ease.js`), camera glide times that grow with distance (`camMs`), glides
that keep their speed when retargeted (`carryRate`, `carried`), critically damped followers for every number, width and colour
(`display-state.js follow2`), one frame scheduler, and a CSS motion scale the lint enforces. The problems are elsewhere:

1. **Hand-overs between pieces.** The presenter waits on fixed timers that were sized for older motion (the 700 ms waits after a view
   change were set when the change took 0.6 s; it now takes 1.3 s), cannot be cut by Next, and serialise steps that could overlap.
   This is where a talk feels slow or stutters.
2. **Reversals and retargets.** Several moves flip direction in one frame: the view change, a procedure step on Back, the dive and
   the sinusoid. The camera solved this for its own glides, but the other moves never got the same treatment.
3. **GPU motion outside the scale.** The CSS side has three durations and three curves, and a lint keeps it that way. The GPU side,
   which is now most of the motion, has more than forty duration constants and five different curves. Nothing checks them.
4. **One likely label bug.** At the start of a view change or a slide's camera glide, the labels are probably faded twice, so the
   old names vanish at the tap instead of riding the figure (item 1). This belongs to the labels thread.

## How to read an item

**Now** is what the code does, **Change** is the recommendation, **Where** gives the files, then size (S, M or L), how sure the
finding is, and what to look at on a device once it is built. P1 items show up in every talk. P2 items show up in particular
features. P3 items are about consistency and keeping things clean.

---

## P1. Seen in every talk

### 1. Labels vanish at the tap of a view change or a slide glide (double fade)

- **Now.** The crossfade between the old and new labels is applied twice. `xfLayer(n)` writes the `#labels` svg's own opacity
  (`stage-view.js:15-21`). Since the stage labels became a pass of the figure's present (cac4963, 4 Nov), label-gl also multiplies
  every picture by `LA`, the layer's opacity up the chain, and `#labels` is the first link in that chain (`label-gl.js:1003`,
  `layer-alpha.js:36-42`). Then it multiplies by `xfNew` or `xfOld` as well (`label-gl.js:1558`, `1623`, `1641`). At the tap,
  `xfLayer(0)` and `crossfade(1, 0)` (`glide-labels.js:59`, `stage-view.js:163`) make `LA = 0`, so the old labels that should ride at
  full are drawn at 0. After that the new labels are drawn at n² and the old ones at (1 − n)·n. While a solve is still pending after
  landing (`xfHold`, `stage-view.js:284`), the held old labels are drawn at 0 too.
- **Why it shows.** For a moment at the start of every Anatomy to Circuit switch, and at the start of every presenter camera glide,
  the figure has no names. This goes against view-xf.js's own rule ("never a frame with no labels on the figure").
- **Change.** Keep one of the two fades. The smallest fix is to stop writing opacity on the `#labels` root and write it on the SVG
  fallback's child groups (`gLabels`, `gLeaders`, `gScan`), so `LA` never sees it. The other option is for `createLayerAlpha` to skip
  the leaf's own inline opacity when the host draws the crossfade itself. Add a node test that runs one crossfade step and checks that
  `LA × xfNew = n` and `LA × xfOld = 1 − n`.
- **Where.** `stage-view.js`, `glide-labels.js`, `label-gl.js`, `layer-alpha.js`. **Owner: the labels thread.**
- **Size** S. **Confidence** medium-high (traced through the code, not seen running). **Device check:** tap Circuit on Mac. The
  anatomy names should ride the morph at full, then cross over in its second half.

### 2. Next during a lobule, sinusoid or view-change move does nothing for up to 1.5 s

- **Now.** `camera()` in the presenter waits on plain timers that Next cannot cut: `wait(700)` after a view switch
  (`presenter.js:1113`, `1150`, `1339`, `1417`), `wait(120)` after a dive (`1124`), `wait(1250)` into the sinusoid (`1130`),
  `wait(1000)` out of it (`1131`) and `wait(1500)` after a lobule focus (`1132`, with `ms` from `1107`). `wait` is a bare `setTimeout`
  (`presenter.js:94`). The talk's loop only starts the next slide once `transition()` returns (`run`, `presenter.js:2126-2131`). The
  old cards do leave on the tap (`outNow`), but the new slide's cards and camera wait until the timer ends.
- **Why it shows.** Next on a lobule or sinusoid slide while it is still moving feels dead: the cards leave, then nothing happens for
  up to a second and a half.
- **Change.** Add `waitCut(ms, cut)`, which resolves on the timer or as soon as `cut()` is true, and use it for each wait above.
  Better still, wait on what the stage already knows (the lobule's glide landed, the view change done) rather than a number. Also
  give `until()` (`presenter.js:99`) a frame poll instead of its 40 ms timer, which adds about 20 ms of lateness to every wait it runs.
- **Where.** `presenter.js`. **Size** S-M. **Confidence** high.
- **Device check:** on a lobule slide, press Next twice quickly. The second slide's cards should start in at once.

### 3. The 700 ms waits are from the 0.6 s view change; the change now takes 1.3 s

- **Now.** `VIEW_CHANGE_S` went from 0.6 to 1.3 on 6 Nov (c0cd15a). The presenter still waits 700 ms after asking for a switch
  (`presenter.js:1113`, `1150`, `1339`, `1417`), and `viewXfStart` still marks the camera busy for 700 ms (`vtUntil`, `vtMs`,
  `stage-view.js:161`). So the slide's own framing (`frameTo`, `presenter.js:1156`) starts when the change is only 54 % done. Both then
  write `live.vt` every frame: the morph writes `lerpVT(viewXf.from, viewXf.to, p)` (`stage.js:2738`), and the slide's glide writes its
  own path (`stage-glide.js:86`). `frameBox`'s guard (`stage-glide.js:145`) checks `morphTarget`, which is already 0 or 1 during a
  change, so it never stops this. When the change lands, `viewXfEnd` snaps `vt` to the change's target and clears `vtGliding`
  (`stage-view.js:282-283`) while the slide's glide is still running, so the glide carries on from its own path next frame. Lobule
  dives that follow a switch to Anatomy (`1113`, `1339`, `1417`) start the same way, with the morph still running.
- **Why it shows.** On a Circuit slide whose framing is not the whole circuit, the camera stutters near the end of the change, or
  jumps. A pinch or a refit during the change is overwritten the same way, because gestures do not look at `viewXf`.
- **Change.** A framing asked for during a change becomes the change's new end: set `viewXf.to` to the slide's framing so the camera
  lerps there on the change's own clock, with no second glide. Replace each `wait(700)` with a stage value "view change done" (as
  `glideLeft` does for glides). Set `vtUntil` and `vtMs` from `VIEW_CHANGE_S`. Make `animateVT`, refit and the hand respect a running
  `viewXf` (retarget it, or end it cleanly from where it is).
- **Where.** `presenter.js`, `stage-view.js`, `stage-glide.js`, `stage-fit.js`, `stage-gestures.js`. **Size** M. **Confidence** high
  for the timing, medium for how visible the fight is (which writer wins depends on frame order).
- **Device check:** in a deck, go from an Anatomy slide to a Circuit slide that frames part of the circuit. The camera should travel
  once and land without a hitch.

### 4. Every Next has 90 to 250 ms where nothing moves, and the camera leaves about 330 ms after the press

- **Now.** When cards are thrown, `wordsOut` returns a fixed `D_SMALL + 20` = 260 ms (`presenter.js:2636`), and the change waits for
  it (`presenter.js:2267`) before `throwsOut()`. The thrown cards are out of sight at about 170 ms: the rail curve
  `cubic-bezier(.32,.72,0,1)` reaches 85 % of its way, where an out-card's opacity hits 0, at 170 ms of 560 (`card-throw.js:25-36`,
  `104`). So about 90 ms is spent on an empty slot. Before that, a press on a slide that is not yet prepared holds everything still
  for up to `PREP_MS` = 160 ms (`presenter.js:2053-2062`), because `outNow()` only runs inside `goOn`. After the out-wait, the new cards
  are built unseen and laid out over two frames, and only then does `camera()` start the glide: about 330 ms after the press.
  `docs/deck-behavior-vision.md` §3 says the camera "sets off for the new framing" on the frame after the press.
- **Why it shows.** Next is answered at once but then stalls, so the change reads as two moves instead of one.
- **Change.**
  1. With a throw, let `wordsOut` return 0 and rely on `throwsOut()`, which already resolves when the cards are out of sight.
  2. If the 260 ms floor is also covering the old slide's labels and marks fading out (V-SLIDE-12), wait for that fade's real end
     instead of a number. With item 1 fixed, the old labels are pinned and ride the figure, so they can fade during the glide's first
     160 ms rather than before it, and the camera can leave at once.
  3. Throw the old cards on the press, before `prepHold`. The throw takes 170 ms to clear anyway, which covers most of the 160 ms
     prep.
  4. Where the new framing does not depend on the new cards' size (most slides with a named `cam`), compute it in `slidePrep` and
     start the glide with the throw. The insets then refit the glide in flight, which `carryRate` and arc blending already handle.
- **Where.** `presenter.js`, `slide-prep.js`. **Size** S for steps 1 and 3, M for steps 2 and 4. **Confidence** high.
- **Device check:** keyboard Right through five ordinary slides. The figure should start moving as the cards leave.

### 5. The view change, label glides and site glides run on the curve the camera retired

- **Now.** `easeInOut` in `stage-frame.js:164` is the quadratic in-out, `t < .5 ? 2t² : …`. It drives the Anatomy to Circuit morph
  and its camera (`stage-view.js:14`, `stage.js:2738`, `2760`), the label layer's glide (`stage-label-layer.js:47`), the callouts'
  room glide and count (`stage-sites-paint.js:150`, `184`), the blood's rest (`stage-blood.js:150`) and the lobule's share in the dive
  (`stage-dive.js:250`). Its acceleration jumps from +4 to −4 at the midpoint. `ease.js:9-11` replaced it for every camera glide for
  exactly that reason ("a catch half way"). The view change is the longest move in the app (1.3 s), so it is the one where the catch
  shows most.
- **Change.** Make `easeInOut` the quintic `easeMove` (import it from `motion.js`). This is a one-line change that keeps the 1.3 s and
  the flow peel's order, because `flow-peel.js` uses its own per-point shares on top. Peak speed drops from 2.0× to 1.875× the mean,
  and the speed eases through the middle instead of turning there. Check the tests that pin morph values.
- **Where.** `stage-frame.js`. **Size** S. **Confidence** high on the curve, medium on how much anyone will notice.
- **Device check:** Anatomy to Circuit on Mac. The middle of the change should feel like one smooth pass.

### 6. Reversals flip direction in one frame

- **Now.**
  - View change: `morph += sign(target − morph) · dt / 1.3` (`stage.js:2736`). Tapping back mid-change flips the figure and the camera
    from full speed forward to full speed backward in one frame.
  - Procedure Back: `t = t < goal ? t + dt : t − dt · 1.6` (`proc-anim.js:419`). A catheter or balloon mid-segment reverses at 1.6× in
    one frame. All the step stops sit in holds, so a plain Back from a stop is fine; the problem is Back or Next while a step is still
    moving.
  - Circuit turn: `rotU` is integrated the same way (`stage.js:2743`).
  - Dive and rise reversal stop dead before turning back, because the outer smoothstep restarts from rest (`stage.js:1408`). The
    sinusoid reverses at once.
- **Change.** One reversible clock in `motion.js`: a progress with a velocity that slews toward ±rate over `D_FLIP` (120 ms) instead of
  switching sign, with `settleAt`'s Hermite for the landing. Use it for the view change, the turn, the procedure clock, the dive and
  rise, and the sinusoid. Durations stay as they are.
- **Where.** `motion.js` (new helper), `stage.js`, `proc-anim.js`, `stage-dive.js`, `lobule-zoom.js`. **Size** M. **Confidence** high.
- **Device check:** tap Circuit, then Anatomy at once. The figure should slow and come back, not snap round.

---

## P2. Seen in particular features

### 7. Catheters, wires and scopes crawl, rush, then crawl

- **Now.** Every travel leg uses `ease`, the cubic in-out `4t³` (`hvpg-clock.js:12`), over the whole leg: TIPS (`proc-anim.js:299`),
  BRTO and BATO (`310`), the EUS scope (`328`) and glue (`346`). The first 20 % of the time covers 3 % of the route, and the peak speed
  is three times the mean. On a 6.2 s BRTO leg the tip barely moves for a second, then races. The tip follow camera is a 320 to 450 ms
  low-pass (`stage-cath.js`), so it trails most during the race.
- **Change.** For travel legs only, use a cruise profile: speed ramps up over the first 20 %, holds steady, then ramps down over the
  last 20 %, with cosine ramps so speed and acceleration both stay continuous. The peak is 1.25× the mean and the first 20 % covers
  12.5 % of the route. Keep the eased curves for balloons, the needle and the column, which should ease and hold. A ready helper:

  ```js
  // Travel at a steady speed with soft starts and stops (r: the share of the time spent speeding up, and again slowing down).
  export const cruise = (t, r = 0.2) => {
    t = t <= 0 ? 0 : t >= 1 ? 1 : t; const v = 1 / (1 - r);
    const ramp = (u) => v * (u / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * u) / r));
    return t < r ? ramp(t) : t > 1 - r ? 1 - ramp(1 - t) : v * (r / 2 + (t - r));
  };
  ```
- **Where.** `hvpg-clock.js` or `motion.js` (helper), `proc-anim.js`, `eus-scope.js`. **Size** S. **Confidence** high.
- **Device check:** the TIPS slide's first step. The catheter should move off promptly and travel at an even pace.

### 8. One rhythm for procedures

- **Now.** Each procedure writes its own step tables. Travel takes 3.7 s for TIPS, 4 s for HVPG, 4.9 s for EUS and 6.2 s for BRTO
  and BATO. Balloons fill in 1.2 s (TIPS), 1.5 s (gastric tube), 1.6 s (BRTO and BATO) and 1.8 s (HVPG), and deflate in 0.8 s (TIPS),
  1.2 s (BRTO and BATO) or 2.5× faster than they filled (the tamponade tube). The curves differ too: cubic in-out for the catheters,
  smoothstep for the tube (`stage-balloon.js:19`) and the stent marks (`mark-fade.js:18`). Every shot's camera glide is a fixed
  `SHOT_MS = 1500` (`proc-anim.js:34`), above the camera's own 900 ms ceiling, whether it moves a little or a lot.
- **Change.** A small procedure timing table: `legMs(routeLength)` for travel (one speed in figure units per second, so a longer
  route takes longer but moves at the same pace), one `BALLOON_IN_MS` and `BALLOON_OUT_MS`, and one inflation curve (`easeMove`).
  Build each step table from it. Time shots with `camMs(from, to)`. Keep `OBLIT_SHOT_MS` for BRTO and BATO (`proc-anim.js:38`), which
  Mohammad picked on 7 Nov, and keep the glide-first, then-move order.
- **Where.** `proc-anim.js`, `hvpg-clock.js`, `stage-balloon.js`, `eus-scope.js`. **Size** M. **Confidence** medium (route lengths
  not measured).

### 9. The HVPG trace runs on its own beat, its own breath, and an unclamped clock

- **Now.** The HVPG step takes `dt = now − last` with no cap (`hvpg-proc.js:363`); every other loop in this area caps it (64 ms in
  `proc-anim.js`, 100 ms for the blood and the balloon). After a hidden tab or a long frame the sweep leaps to its end. The trace's
  a, c and v waves use their own `BEAT_MS = 850` and `BREATH_MS = 3600` (`hvpg-clock.js:35`), while the model breathes on a 4 s sine
  (`blood.js:36`) and the EKG and Doppler follow the model's heart rate. The waves run on the procedure's clock, so on Back they play
  backwards.
- **Change.** Cap `dt` at 64 ms as `proc-anim.js` does. Take the beat's phase from the model's beat time and heart rate, and the
  breath from the model's own sine (`simTime` or the frame's `F.t`), so the trace, the EKG and the Doppler pulse together. Keep the
  waves on model time, not procedure time. Do not touch the chevrons' speed (0eec029).
- **Where.** `hvpg-proc.js`, `hvpg-clock.js`. **Size** S for the cap, M for the shared beat. **Confidence** high.

### 10. Labels that move to a new slot swap in one frame

- **Now.** When labels are solved again (a pan or pinch lets go, a same-view slide change with no camera move, a refit), a label that
  moves to another slot is drawn there in the next frame with no fade: `#labels .lb { transition: none }` (`app.css:246`), offsets
  taken at once (`label-gl.js:808-812`, `pinOff`), and `eased = false` in the lobule (`lobule-zoom.js:1443`). V-LBL-3 asks for the
  opposite: a label that needs a new place fades out and fades in at its final place, and never slides. A second case: when the
  presenter's glide cannot solve ahead (`glideOk` refuses with a catheter kept, a card zoomed, a hand on the figure or inside the
  lobule, `glide-labels.js:41`), the old slide's labels stand through the whole glide and the new set pops in at landing.
- **Change.** A per-label crossfade on the frame clock, in label-gl: when a pinned label's drawn offset and its new offset differ by
  more than about 3 px, fade the old picture out and the new one in at the same pin over `D_SMALL`. This is a fade, not a glide, so
  it keeps V-LBL-1 (labels never trail the figure) and V-LBL-3. Use the same fade at `camSettle` for the glides that `glideOk`
  refused.
- **Decided (8 Nov 2026, Mohammad: "item 10: yes, fade").** Build the crossfade. It replaces the 4 Nov "a label shows and goes at
  once" rule (`app.css:246`) for labels that move to a new slot; a label that only appears or leaves with its slide follows item 1.
- **Where.** `label-gl.js`, `glide-labels.js`, `stage-labels.js`. **Owner: the labels thread.** **Size** M. **Confidence** high.

### 11. Pinch, wheel and spring-back

- **Now.** A pinch or wheel zoom stops dead at the last event, and the spring-back after it starts from rest whatever the hand was
  doing: 420 ms at the fit and 380 ms otherwise on the stage (`stage-gestures.js:141`, `153`), 380 ms in the lobule. A mouse-wheel
  notch zooms about 16 % in one frame (`stage-gestures.js:53`, `lobule-zoom.js:562`). The stage stretches past its zoom-in limit and
  springs back, but the lobule stops hard at `kFit × KMAX`. Panning already has inertia (`flick.js`).
- **Change.** Carry the last pinch rate into the spring-back with `carried()` (and `settleSlope` for the pan), using the helpers that
  are already in `ease.js`. Give a mouse-wheel notch an 80 to 120 ms glide that carries speed, so repeated notches run together; a
  trackpad pinch stays direct. Give the lobule's zoom-in limit the stage's 0.3-power stretch.
- **Where.** `stage-gestures.js`, `lobule-zoom.js`. **Size** M. **Confidence** high.

### 12. Fixed glide times that ignore distance

- **Now.** `camMs` only applies when a caller passes `opt.scale`. Fixed times are used for Fit (420 ms, `stage-fit.js:323`), the zoom
  pill and double-click (260 ms, `stage-camera.js:164`), the reveal (320 ms) and the spring-back (above). In the lobule, every slide
  focus is a fixed 1500 ms (`presenter.js:1107`; `focusOn` defaults to 1400, `lobule-zoom.js:5124`) and its buttons use 260, 380 or 420 ms. A step
  between two nearby lobule zones takes as long as crossing the whole lobule.
- **Change.** Pass these through `camMs` (480 to 900 ms by reach), and give the lobule a version on its own view (with a ceiling near
  1500 ms for its long dives). This is not the view change, which stays at 1.3 s.
- **Where.** `stage-fit.js`, `stage-camera.js`, `lobule-zoom.js`, `presenter.js`. **Size** S-M. **Confidence** high.

### 13. The rise out of the lobule jumps to speed on its first frame

- **Now.** The fast rise uses `p = u²(2 − u)` (`stage-dive.js:203`) with the dive clock running from 1 to 0. Its speed on the first
  frame is already 75 % of its peak. That was done on purpose so the rise no longer sat still for 120 to 160 ms, but it reads as a
  lurch.
- **Change.** `settleAt(k, m0)` (`ease.js:177`) with a starting slope of about 0.5: it moves on frame one but builds speed over the
  first 100 ms or so.
- **Where.** `stage-dive.js`. **Size** S. **Confidence** high.

### 14. Smaller camera pops

- **The circuit turn during a glide snaps to the glide's end.** `stage-fit.js:364` sets `live.vt = { ...live.vtTarget }` before
  turning. Start the turn's glide from where the view is instead; `rotGlide.from` already takes any start. S, high.
- **Card-room follow zooms unevenly.** `followAt` interpolates `k` linearly (`stage-ride.js:97`). Interpolate it in log space, as
  `lerpVT` does, so a tuck that also zooms 2× runs evenly. S, high.
- **An arc glide retargeted to a far framing restarts from rest** (`stage-glide.js:55`: the `else if (room)` branch builds a fresh arc and
  `c0` stays 0). Carry the old speed into the new arc with the same `carried` term. M, medium.
- **A card zoom reversed mid-way restarts the full 520 or 440 ms on a fresh arrive curve** (`card-zoom.js:113-118`). Scale the time by
  the share left and start with the carried slope. The 520 ms and 440 ms stay. S, medium.

### 15. On a kept data card, the number shows its end value before the bar gets there

- **Now.** `tileGlide` rolls the digits to the final value (`odoSwap`, `presenter.js:803`) while the bar travels on its own CSS curve
  over 280 to 700 ms. A kept card that follows a patient change polls the model every 150 ms (`presenter.js:2735`, `2965`), while the
  vessels follow the same change continuously (`follow2`, tau 0.2 s).
- **Change.** Drive the tile's number from the same follower as its bar and the vessels, drawn on the GPU as the live readouts already
  are (`gl-words.js`), so number, bar and figure arrive together. If the odometer roll is the look you want, at least match its time
  and curve to the bar's.
- **Where.** `presenter.js`, `num-move.js`. **Size** M. **Confidence** medium (traced, not seen).

### 16. Two chart heads glide faster at 120 Hz than at 60 Hz

- **Now.** `flow-time.js:289` (`shown += (goal − shown) · 0.16`) and `event-graph.js:241` (`· 0.2`) step once per frame with no time
  in them. At 120 Hz they settle twice as fast as at 60 Hz, and at the battery saver's 15 Hz four times slower. Every other chart uses
  `follow2`, which gives the same result at any rate.
- **Change.** `1 − exp(−dt / τ)` with τ about 100 ms, or reuse `createFollow`. **Size** S. **Confidence** high.

### 17. Catheter labels animate a box-shadow, and the off-GPU scan misses it

- **Now.** `.cath-label` transitions `box-shadow` over 420 ms (`app.css:3267`, `3302`, `3421`). That is the only repainting property
  left in any CSS transition. `docs/off-gpu-inventory.md` lists one `paintAnim` site (the card zoom's clip-path), so the scanner does
  not see these three.
- **Change.** Drop `box-shadow` from those transition lists and fade the shadow as the opacity of a pseudo-element or of the label's
  glass, or let the GPU glass draw the drop as it does for cards. Teach `off-gpu-scan.mjs` to read transition lists for repainting
  properties.
- **Where.** `styles/app.css`, `scripts/off-gpu-scan.mjs`. **Size** S. **Confidence** high.

---

## P3. One motion vocabulary

### 18. Bring the GPU motion into the motion scale

The CSS motion scale is linted (`tests/motion-scale.test.js`, `scripts/motion-allowance.json`). In the JS, the test only catches
`cubic-bezier(` strings, `easing:` strings, `duration: NNN` and inline transitions. Constants and hand-written curves pass. Today:

| Kind | Examples |
|---|---|
| Off-scale durations | `CATH_GLIDE` 600 (`stage-cath.js:479`), `FLIP_MS` 600 (`cath-flip.js:36`), `LABEL_GLIDE_MS` and `ROOM_GLIDE_MS` 450, `COUNT_MS` 950 (`stage-sites-paint.js:92`, `167`), callout leave 700 (`stage-sites-paint.js:160`), `HALO_MS` 1500 (`stage-halos.js:54`), `CLAMP_FADE` 250 (`stage-outlines.js:55`), `OL_FADE` 160 (`stage-outlines.js:51`), `FADE_MS` 280, 420 and 90 (`endo-motion.js:6`, `tool-profile.js:612`, `ink-gl.js:24`), `DEFLATE_MS` 500, `BAND_MS` 420 + 140 (`endo-motion.js:8`), `DROP_MS` 220 (`trace-callouts.js:10`), `GONE_MS` 900 (`scope-lens.js:32`), `SEL_FADE` 0.3 s (`stage-glow.js:164`), the turn's 0.5 s (`stage.js:2743`), glow fades of 160 to 600 ms (`stage-glow.js:74`) |
| Curves | quadratic in-out (`stage-frame.js:164`), cubic in-out (`hvpg-clock.js:12`, the worker's morph `worker-core.js:43`, `presenter.js:97`, the `tweener` fallback), smoothstep used as a time ease in about 15 files (`stage-balloon.js:19`, `mark-fade.js:18`, `res-fade.js:14`, `stage.js:1252`, `1408`, `stage-dive.js:113`, `doppler-marks.js:55`, `trace-callouts.js:22`, `cam-arc.js:123` and more), linear glow fades (`stage-glow.js:92`) |

- **Change.** Name the GPU durations in `motion.js`, as tokens for the GPU (the three steps, the camera range, and a short list of
  named exceptions such as `VIEW_CHANGE_MS = 1300`, `DIVE_MS = 2200`, `HALO_MS = 1500`). Snap the rest to `D_FLIP`, `D_SMALL` or
  `D_SURFACE`. Export one `smooth01` for the smoothstep time eases, and use `easeMove` for anything that travels. Then extend the
  motion-scale test: a `*_MS` or `*_DUR` constant in a file that imports `frameFor` must come from `motion.js` or carry the
  `motion-scale: own pace` marker, and so must a hand-written `t * t * (3 - 2 * t)` used against a clock. Smoothsteps used to blend
  shapes in space are fine and stay out of the rule.
- **Size** M (mostly mechanical). **Confidence** high.

### 19. Five clocks, one rule

- **Now.** After a long frame, the parts of one change disagree. `easeNow()` is the honest wall clock (R20, `frame.js:503-511`), so
  card throws, the dive, the sinusoid and the script glides jump ahead. Refits use `glideClock` and advance at most 40 ms
  (`glide-clock.js`). The view change and the turn integrate `dt ≤ 100 ms` (`stage.js:2700`). `simTime` caps at 200 ms (`clock.js`).
  The procedure caps at 64 ms, and the HVPG trace is not capped. `docs/deck-behavior-vision.md` V-TIME-2 asks that a long frame hold
  everything together, while R20 chose never to hold. `PACED` is a dead constant (`frame.js:496`), and comments in `stage.js:1408` and
  `lobule-zoom.js` still describe the old held clock.
- **Change.** Pick one rule and write it in `motion.js`. The suggestion is the honest wall clock for everything, plus `glideClock`'s
  40 ms step cap for the first two frames of any motion (the frames where the layout and label passes that set the change off make a
  long frame, which is the case glideClock was built for). Give the view change, turn, procedure and HVPG clocks the same cap. Delete
  `PACED` and fix the comments and V-TIME-2.
- **Size** S-M. **Confidence** high.

### 20. CSS: exits on the arrive curve, displaced items starting at full speed

- **Exits.** The tokens say "a leave takes the step below its entrance", but state-toggled fades whose transition sits on the base
  rule leave on the arrive curve at full length: `.pz-text > .pz-leave` (`app.css:1867`), `.pz-scales.pz-leave` (`2425`), the catheter
  `cl-glass` fade (`3307`, `3390`), `.stage-bar.top` (`4809`), `.pz-pscrim` and `.pz-gscrim` (`6031`), `.pz-lip` (`5849`, `5910`) and
  `.pz-data.pz-sheet.pz-hide` (`5913`, `5976`). Give each leaving state `--ease-in` and the step below, or write down that fade-only
  toggles may be symmetric. The phone sheets' 240/240 is a deliberate exception from the 4 Nov menu audit; note it in `tokens.css`.
- **Things that were already on screen.** Neighbour FLIPs mix `EASE_ARRIVE` and `EASE_MOVE`: `topbar-motion.js:109` uses arrive
  outside a row and move inside one, and `util.js:617`, `dock.js:872`, `menu.js:529` and `presenter.js:2716` use arrive, while
  `util.js:174` and `palette.js` use move. The arrive curve starts at about four times its mean speed, so a displaced chip leaps on its
  first frame. Use `EASE_MOVE` for anything that was already visible and keep arrive for things that appear.
- **Retargets.** `topbar-motion.js:105` and `util.js:610-617` cancel a running FLIP and start a fresh one, so a quick second change
  begins at top speed again. Use `composite: 'add'`, which `menu.js:529`, `util.js:1136` and `plate-glide.js:111` already use.
- **Size** S-M. **Confidence** high on the facts, medium on taste.

### 21. Timers that copy a token by hand

`menu.js:238` (130) and `menu.js:318` (140) against a 120 ms exit, `why.js:99` (200) against 120, `menu.js:714` and `dock.js:639`
(250) against `D_SMALL`. Derive each from the token plus a fixed slack, as
`closeModal` does (`util.js:1199`, `D_FLIP + 20`). The 4 Nov menu audit's other points are fixed, except the dragged desktop main menu,
which still leaves on the arrive curve (`menu.js:136-141`), and the tooltip's 4 px nudge (`app.css:928-937`). **Size** S.

### 22. Reduced motion

- The view change ignores Reduce Motion. The morph and its camera run the full 1.3 s (`stage.js:2736`), while the dive is skipped and
  `animateVT` shortens to 300 ms. Give the change the same short form as the camera: a 300 ms crossfade-and-move, or an instant
  switch behind a 120 ms fade.
- `motion.js` says "a state change is instant", but `stage-glide.js:34` keeps a 300 ms camera glide on purpose, because a jump of the
  whole figure is harder to follow (`presenter.js:1151`). Write that exception into `motion.js` and `docs/ACCESSIBILITY.md` so both
  say the same thing.
- About 55 small transform transitions inside controls (switch thumbs `app.css:778`, `860`, `.zoom-pill` `3745`, the `.dop-*` band
  `5131-5150`) have no reduce override. Most are tiny within-control moves; add `transition: none` under reduce for the switch thumb
  and the zoom pill at least.
- **Size** S. **Confidence** medium.

### 23. Two curves for one fade

- The catheter's fade-out runs the SVG group on WAAPI `EASE_IN` (`stage-cath.js:420`) and the GL draws on `(1 − k)²`
  (`stage-cath.js:444`). They end together but differ on the way. Drive both from one value.
- Glow fades step `k = dt / dur` linearly (`stage-glow.js:92`) with durations from 160 to 600 ms. Snap them to the scale and ease `k`.
- The scope view mixes an exponential follow (tau 0.2 s, `instruments.js:227`) with fixed cubic tweens for deflation and banding
  (`endo-motion.js:8`). Pick one. **Size** S.

### 24. Dead code and stale notes

- The lobule's `lz-ease` still runs: the class, a 450 ms timer and `glideLeaders` every frame for 480 ms, plus a CSS translate on the
  DOM label (`app.css:1726`), although its GPU names never glide (`lobule-zoom.js:1443`). The hit target lags the drawn name by
  240 ms. Remove `lz-ease`, `easeT`, `glideUntil` and the rule.
- `PIN_HID` is always false and `pinLast` is written but never read (`label-gl.js:~790`, `1610`).
- `docs/deck-behavior-vision.md` §11 lists "Anatomy ↔ Circuit morph 1200 ms MORPH_ONE_MS". The change is `VIEW_CHANGE_S` 1.3 s;
  `MORPH_ONE_MS` is the patient's change under a glide. `main.js:1372` says the look crossfade is ".45 s"; the token is 420 ms.
- `scripts/glass-trail-probe.mjs` refers to `glass-motion.js leadFor`, which no longer exists.

---

## Suggested pushes

| Push | Items | Who | Size |
|---|---|---|---|
| A. Labels crossfade once, and fade on a new slot | 1, 10, and the label parts of 24 (`lz-ease`, `PIN_HID`, `pinLast`) | labels thread | M |
| B. Presenter waits and hand-overs | 2, 3, 4 | one thread (presenter and stage-view) | M |
| C. One curve and one reversible clock | 5, 6, 13, 19 | one thread (motion.js, stage, dive, proc clock) | M |
| D. Procedures | 7, 8, 9, 23 (catheter fade) | one thread | M |
| E. Camera and hand | 11, 12, 14 | one thread | M |
| F. Charts and cards | 15, 16, 17 | one thread | S-M |
| G. Vocabulary and lint | 18, 20, 21, 22, 23 (glows, scope), 24 | one thread, last, mostly mechanical | M |

A and B change what a talk feels like the most and can go first, in parallel: they touch different files except that both read
`stage-view.js`, where A only touches `xfLayer` and B touches the timing fields.

Where the pushes share files (fetch and rebase before every push):
- **B and E** both touch `stage-glide.js`, `stage-fit.js` and `stage-gestures.js`. B adds the checks for a running `viewXf`; E changes
  the arc branch, the spring-back and the fixed glide times.
- **B and E on the lobule.** B owns the waits in `presenter.js camera()`, including the one after a lobule focus (wait for the
  lobule's landing, not a number). E makes `focusOn` in `lobule-zoom.js` time itself by reach, with the `ms` it is given as a ceiling.
- **C and D.** C writes the reversible clock in `motion.js` first and uses it for the view change, the turn, the dive and the
  sinusoid. D owns `proc-anim.js` and uses the same helper for the procedure clock.
- **C** also takes the view-change part of item 22 (Reduce Motion), since it sits in the same morph step in `stage.js`.
- **F**'s item 15 is in `presenter.js tileGlide`, away from B's `camera()` and `transitionRun`.
- **G** goes last: it renames durations across files the others edit.

## Looked at and judged fine

- Labels, leaders and dots are drawn from the same frame's camera as the vessels in every move traced: glides, pinch, wheel, the
  morph, dive and rise, and card zoom. One `pinDev` rounding puts the dot, the label and the leader in one place (`label-gl.js:817`).
- The GPU glass follows a moving card in the same frame (`glass-gl.js` reads the animation's own clock, and an animation that has not
  started is held at its start).
- Camera glides: quintic curve, log-space zoom, distance-scaled time, speed carried on retarget, van Wijk-Nuij arcs for far moves.
- Blood: one `bloodClock`, `dt ≤ 0.1`, steady across view changes, zoom and hidden tabs, re-anchored every 32 s with no jump. The idle
  rest eases out over 1.5 s and back over 0.4 s.
- Balloons and the contrast column all ease in and hold; no stent, balloon or contrast appears at once.
- Flick inertia is time-based (`0.9955^dt`, `dt ≤ 34 ms`), so it is the same at 60 and 120 Hz.
- `follow2` and `display-state.js`: exact at any frame rate, a new target bends the speed, and real jumps snap on purpose.
- Card throws: one clock for every leaving card, retaken from where each stands, with a guard for a stopped loop.
- The CSS keyframes animate only transform, translate, scale, rotate and opacity. The look switch's View Transition runs both sides
  on one curve.
- The 4 Nov menu audit's points 1 to 8 are fixed except the two noted in item 21.

## Kept as decided (not re-opened)

- The view change lasts 1.3 s (`VIEW_CHANGE_S`) and runs in the direction blood flows (flow peel). No chord frame, no straight phase,
  no flow stagger, no station boxes.
- Card zoom: 520 ms in, 440 ms back; veil 260 ms in, 200 ms out, labels 160 ms. No card zoom on phone.
- Teaching cards show all their text at once.
- Blood moves at its steady mean speed (no heartbeat or breathing swing in the chevrons).
- BRTO and BATO shot times (`OBLIT_SHOT_MS`, 7 Nov).
- No liver seep for ascites.
