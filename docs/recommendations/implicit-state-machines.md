# Implicit state machines: recommendations (8 Nov 2026)

I read the code of `claude/settings-topbar-icon-flvft1` at f56992f. Nothing in the app was changed and nothing was run in a browser. Line
numbers are for f56992f. Every claim marked **(code)** was traced line by line. Every claim marked **(guess)** is a reading of how the code
would behave, and nobody has seen it on a device.

The question was where the app keeps state in scattered pieces: booleans, timer and frame handles, mode strings, `isX`, `wasX` and
`pendingX` variables, classes on DOM nodes, and transitions written inline wherever they are needed. For each such place this doc
answers four questions. Where does it live? What states and transitions does it really have? What can go wrong? What small change makes
it easier to read, test and reason about without changing what the learner sees?

All proposals stay on the GPU. None moves drawing off the GPU or adds a DOM or CSS fallback for something the GPU draws. Trace hooks never
write to the DOM, for three reasons. A `data-state` attribute or a class would be a new site in `scripts/off-gpu-scan.mjs`. It would wake
the stage's class observers (`stage-idle.js:50-51`). It would change the DOM hash that `scripts/stage-trace.mjs` compares. Every
verification recipe here uses node unit tests or `node scripts/stage-trace.mjs`, never a headless browser.

## The short version

The app already has several good explicit machines: the slide transaction (`slide-txn.js`), the counted leases, the timer scope
(`scope.js`), the card throw's `throwState` (`card-throw.js:278-300`), the dock's `state` enum (`dock.js:511`), the reversible clocks
(`createReversible`), and the view change's pure maths (`view-xf.js`). They are the models to copy. The trouble is elsewhere.

1. **The camera has no single owner.** At least eleven things can move `live.vt`: a plain glide, a drift, an arc, a card follow, a view
   change, a dive or rise, a card zoom, a drag, a pinch, a wheel glide and a fling. Each has its own flag or handle (`vtGliding`,
   `vtAnim`, `drifting`, `following`, `camMove`, `arcRun`, `viewXf.hand`, `zoomBase`, `live.drag`, `live.glide`, `wheelAt`). Each new
   mover cancels the others by hand. The 443 getter and setter pairs on `live` (`stage.js:144-601`) are the only interface to all of this.
2. **"Is the camera moving?" is answered eight different ways.** The label layer, the callouts' box cache, the label presolve, the card
   follow, the presenter's waits and the idle loop each build their own test from those flags, and no two tests agree. This is the most
   direct threat to "labels move 100% with the figure": a reader that thinks the view is at rest re-reads or re-lays-out during a pinch.
   See M2.
3. **The view is three store fields for four states.** `view`, `lobule` and `sinusoid` allow eight combinations, and four of them are
   illegal. Listeners repair them after the fact. In one case the repair makes the view pill fold and unfold within one tap. See M6 and
   M7.
4. **Several machines are written as coroutines with bare waits.** The slide change (`transitionRun`), the catheter's script (`cathTo`) and
   the hush are written this way. The program counter is the state, so nothing outside can see where a change is. 31 `await wait(…)` calls
   in `presenter.js` cannot be cut by Next.
5. **State is read from classes that are written later.** `classSoon` writes a class in a later task, but some machines read
   `classList.contains` as their own state (the chrome's `stage-busy`, the modal's `show`/`leaving`, the dive's `sin-focus`). Between the
   ask and the write they read the old value.

The recommendation is small and incremental: one tiny `machine()` helper (spec at the end), adopted one machine at a time. Each adoption
starts as a read-only "derived state" pass that names the states the flags already encode. That pass catches impossible combinations in
node tests and stage-trace runs and changes no behaviour. Only after that do writes go through a transition table. The rollout order is
at the end.

## How to read an entry

Each machine (M1 to M22) gives:

- **Where**: files and lines.
- **States and transitions**: reconstructed from the code, usually as a table. Names in `code` are the existing variables.
- **Risks**: bugs, races and impossible combinations, marked (code) or (guess).
- **Design**: the recommended change, smallest first, and what it gains for UX (no glitch, no lag, labels with the figure), DX (readable,
  testable) and AX (an agent can find the states in one named place, read a transition table, turn on a trace, run a node test).
- **Verify**: node tests and stage-trace only.
- **Size**: S (under a day), M (a few days), L (a week or more). **Risk** is the chance of a visible regression.

A note that applies to every entry: **437 test files are source-regex tests** (`scripts/source-regex-tests.json`). They match the text
of `src/`, and the list may only shrink. Converting a machine will break some of them, for example `tests/idle-wake.test.js`, which matches
the body of `sleep()` character by character. The rule for each conversion: replace the regex test with a behaviour test of the machine,
in the same commit, and take its file off the list (`node scripts/test-classes.mjs --write`). Never loosen a regex to keep it green.

---

## Camera and view

### M1. Camera motion owner

**Where.** `stage.js:1236-1241` (`vt`, `writeVT`, the one writer). `stage.js:1338-1340` (`diveT`, `vtAnim`, `vtGliding`, `vtTarget`).
`stage.js:1461-1500` (`vtUntil`, `camMove`, `viewXf`, `drifting`, `following` and the rest, `handRide`, `arcRun`). `stage.js:1510`
(`zoomLz`, `zoomM`). `stage-glide.js:25-112` (`animateVT`). `stage-ride.js:54-90` (`driftEnd`, `camSettle`, `camSettleIdle`, `viewNow`,
`followStart`). `stage-gestures.js:38-49`, `218-226` (the hand takes over). `stage-view.js:150-170`, `296-311` (the view change takes
the camera and gives it back). `stage-dive.js:336-339`. `stage-fit.js:370`. `stage-tubes.js:71`.

**States and transitions (reconstructed).** `writeVT` makes sure that nothing writes `vt` except through one function (S6.6), and that
part works. What it does not record is *who* is writing.

| Mode (implicit) | Encoded as | Entered by | Left by |
|---|---|---|---|
| rest | none of the below | landing of any mode | any mover |
| glide | `vtGliding && !drifting && !arcRun`, `vtAnim` | `animateVT` (`stage-glide.js:78`) | last step (`:109`), a newer `animateVT` (`vtTarget !== to`, `:89`), a hand (`stage-gestures.js:48, 226`), `viewXfStart`, a rise (`stage-dive.js:339`) |
| glide on an arc | `vtGliding && arcRun` | `animateVT` with `opt.arc` (`:58-63`) | as glide; a refit bends it (`:51-57`) |
| drift (slow push) | `vtGliding && drifting` | `animateVT` with `opt.drift` (`:34-35`) | `driftEnd` (`stage-ride.js:54`), any non-drift glide (`:34`) |
| presenter move | `camMove` (+ glide) | `animateVT` when presenting (`:80`) | `camSettle` from the last step, from a timer `left + 80` (`:80`), or from `updateLabels` (`stage-labels.js:155`) |
| card follow | `following`, `followScene` | `followStart` (`stage-ride.js:80-90`) | any `animateVT` (`stage-glide.js:29-30`), `viewXfStart` (`stage-view.js:158`), `followEnd` |
| view change | `viewXf`, `viewXf.hand` | `viewXfStart` (`stage-view.js:150`) | `viewXfEnd` (`:296`), a hand detaches it (`viewXfDetach`) |
| dive / rise | `diveT ∈ (0,1)`, `lobOn`, `lobAnim` | `setLobule` (`stage-dive.js:291`) | `lobuleStep` landing, the backstop |
| card zoom | `zoomBase`, `zoomLz` | `zoomOpen` | `zoomEnd` |
| hand | `live.drag` (pan or pinch), `wheelAt` < 250 ms, `live.glide` (fling), `wheelGlide` | pointerdown or wheel | pointerup or cancel, 250 ms of quiet, the fling ends |

**Risks.**

- (code) Any mode can be on alongside any other, because each has its own flag. Cancelling the old mode is copied at about a dozen call
  sites as `cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false;`. The copies differ. The wheel path also calls `camSettle()`
  (`stage-gestures.js:48`) and the pointer path does not (`:226`), so after a pointerdown on a presenter's move `camMove` stays true until
  the 80 ms timer from `stage-glide.js:80` or the next `updateLabels`. The hand path also never touches `following`: a pan begun during a
  card follow leaves `following` true, and `viewNow()` then reports "not at rest" until the follow ends. (guess: whether a follow and a
  hand can really overlap depends on the presenter, `presenter.js:4887`.)
- (code) `camMove` ends in three places: the last step, a timer and `updateLabels`. `camSettleIdle` guards the timer
  (`stage-ride.js:59`), so the three agree today, but nothing says so.
- (code) A dive or rise is a camera mode that does not set `vtGliding`. So the stage's API `gliding()` (`stage.js:3195`) is false while
  the dive zooms. The presenter waits on `lobuleSettled()` (`stage.js:3304`) for that case instead. That works only because each caller
  knows which test to use.
- (code) `atTargetVT` and `atTargetStage` (`glide-labels.js:15-28`, `stage-view.js:74-100`) briefly overwrite `vt`, `vtGliding`,
  `camMove`, `morph` and more to solve the labels "as if landed", then put them back in a `finally`. Anything that reads `live.*` inside,
  such as `sitesPaint` from `labelTail`, sees the pretend camera. `glideRepaint` (`glide-labels.js:31`) exists to paint again afterwards.
  This is correct today, and it depends on every reader being repainted.

**Design.**

1. *Derived first (no behaviour change).* Add `cameraMode()` in a new `stage-motion.js`. It returns one of `'rest' | 'glide' | 'arc' |
   'drift' | 'present' | 'follow' | 'view' | 'dive' | 'zoom' | 'hand'` from the flags as they stand, plus an `impossible()` list of the
   combinations that should never happen together. Examples: `following && vtGliding`, `viewXf && !viewXf.hand && drag`,
   `diveT ∈ (0,1) && viewXf`, `camMove && !vtGliding && no timer pending`. Expose it on the stage API next to `cameraState`, and have the
   machine trace (spec below) record each change of mode.
2. *One take-over function.* Replace the dozen copies with `takeCamera(owner)`. It ends whatever owns the camera now, through that
   owner's own end function (`driftEnd`, `camSettle`, `followEnd`, `viewXfDetach`, `stopGlide`, `wheelGlide.cancel`), then records the
   new owner. The behaviour of each call site is kept: list in the table which ends each site runs today, and make `takeCamera` run
   exactly those for that new owner. The differences then show up as rows that can be reviewed, instead of being lost in copies.
3. *Later, optional.* Make the owner a `machine('camera')` whose table is the one above. Do not fold the dive into it: the dive has its
   own clock and its own machine (M5). The camera machine records only that the dive owns `vt`.

- **UX:** one owner per frame means no frame in which two movers write `vt`. That is the stutter the animation doc's item 3 describes.
- **DX and AX:** "who moved the camera" becomes a one-line trace.
- **Do not change** `writeVT` itself, the glide maths (`carried`, `springSlope`, `camPath`) or the arc blending. They are fine.

**Verify.** Add a node test for `takeCamera` with a fake `live` covering each pair of modes. Run
`node scripts/stage-trace.mjs --save` before the change and `--compare` after: the hashes must not change. Extend the trace session with
the missing seams: a wheel step, a two-pointer pinch (jsdom `PointerEvent` dispatched on `#stage`), a presenter glide via `st.frameTo`
while the view changes, and a fling.

**Size** M. **Risk** low for step 1, medium for step 2.

### M2. "Is the view moving?": eight predicates

**Where.**

| # | Predicate | Where | Built from |
|---|---|---|---|
| 1 | `viewMoving()` | `stage.js:1481` | `vtGliding \|\| camMove \|\| wrap.classList.contains('panning')` |
| 2 | label `moving` | `stage-labels.js:165` | `gestureOn() \|\| vtGliding \|\| drifting \|\| zoomBase` |
| 3 | `handRideWait` | `stage-labels.js:238-243` | `drag \|\| glide \|\| gestureOn() \|\| vtGliding \|\| drifting \|\| zoomBase` |
| 4 | `preKeep` | `stage-view.js:224-225` | about 18 terms |
| 5 | `viewNow()` | `stage-ride.js:79` | `following \|\| zoomBase \|\| vtGliding \|\| drifting \|\| lobuleOn \|\| morph… \|\| diveT > 0` |
| 6 | `gliding()` (API) | `stage.js:3195` | `vtGliding \|\| viewXf` |
| 7 | `gestureOn()` | `stage-gestures.js:125` | `drag \|\| glide \|\| now - wheelAt < 250` |
| 8 | idle `still` | `stage.js:2754` | about 25 terms (M9) |

**Risks.**

- (code) `viewMoving()` reads the `panning` class, and only a one-finger pan sets that class. A pinch removes it (`stage-gestures.js:230`),
  and a pinch that hands over to a one-finger pan (`:307`, `startPan(..., true)`) never adds it back. A wheel zoom, a trackpad pinch
  and a fling never set it either. So during a pinch, a wheel zoom or a fling, `viewMoving()` is false. The readers of #1,
  `stage-sites-paint.js:124` and `:323`, `stage-scan.js:56` and `stage-doppler.js:43`, then treat the view as at rest and re-read their
  kept boxes and room every time the watch is due. The comment at `stage.js:1480` says boxes "are not read again while it is"
  [moving]. During those gestures they are. That is extra layout work in gesture frames, and it can make a callout re-place mid-pinch.
  (code for the predicate. guess for how visible it is.)
- (code) #2 leaves out `following` (a card follow that is not on the scene camera rides through `drifting`, so it is covered) and `camMove`
  (handled above it, at `:155`). #3 adds `drag` and `glide`, which `gestureOn()` already contains. Each copy is right for its caller today.
  None says why it differs from the others.

**Design.** One record, recomputed once per frame by the frame's first reader. Do not add a getter that is called many times a frame.
For example `motion = { hand, glide, drift, follow, present, view, dive, zoom, any }`, filled by `cameraMode()` (M1). Then:

- `viewMoving = () => motion.any && !motion.dive`. This is the one behavioural fix: it adds pinch, wheel and fling. Make it behind a flag
  first (`?motionrec=0` restores the old test) so the owner can compare on an iPad pinch.
- Rewrite #2, #3 and #5 as named subsets of the record (`motion.hand || motion.glide || motion.drift || motion.zoom`), each with a
  comment that says why the subset is what it is. Leave #4 and #8 as they are until M4 and M9.
- **UX:** callouts and probes stop re-placing during a pinch, so labels stay with the figure. **AX:** one record to log.

**Verify.** Add a node test: a fake `live` per mode, and assert every predicate's value against a table. The table is the spec. Run
stage-trace `--compare` with the pinch seam added in M1: GL and DOM hashes may change *only* in the pinch frames. Check that the change is
fewer box reads, using `layout-snap` counters if `?perf` exposes them in node, else the `stats` object.

**Size** S. **Risk** low (behind a flag).

### M3. The view change (Anatomy and Circuit)

**Where.** `stage.js:1242-1245` (`morph`, `morphTarget`, the reversible `viewClock`). `stage.js:2758-2763` (the morph step that writes the
camera). `stage-view.js:103-170`, `249-311` (`viewXfStart`, `viewXfStep`, `viewXfRetargetTo`, `viewXfEnd`, `xfRelease`, `xfHold`).
`view-xf.js` (pure: `viewXfMix`, `viewXfCamU`, `viewXfRetarget`, `viewXfDetach`).

**States.** `idle` → `changing.solving` (`viewXf.pending`, `landAt == null`) → `changing.crossing` (`landAt` set) → `landed` → `idle`.
Two side states: `landed.held` (`xfHold`: the morph landed before the solve did, and the ghosts stand until the solve lands) and
`changing.hand` (`viewXf.hand`: a pan or pinch took the camera, and the morph goes on without it). A tap back mid-change reverses the
clock (`viewClock`) without a new `viewXf`.

**Risks.**

- (code) The state is half in `viewXf` (an object with eight fields) and half in `xfHold`, `xfSolving`, `glSuppress` and `xfOp` on
  `live`. `viewXfEnd` derives `xfHold` from `x.pending && labelJob` (`:306`). `viewXfStep` clears `pending` when the job was "dropped by
  another" (`:181`). These are transitions caused by a second machine (the label job, M4) changing under this one.
- (code) The double fade the animation doc lists as P1 #1 (`xfLayer` plus `labelGL.crossfade`) lives here. This doc does not repeat it.
  Fixing it is easier once `xfLayer` and `crossfade` are called from one `enter` action per state, not at five sites (`stage-view.js:108`,
  `169`, `193-194`, `309`, `glide-labels.js:59`, `86-87`, `97-99`).
- (guess) A tap back while `landed.held` is waiting starts a new `viewXf` (`viewXfStart` clears `xfHold` at `:151`) without dropping the
  ghosts the held state kept. `freezeGhosts` at `:155` probably replaces them, but the code does not say so.

**Design.** This is the best candidate for the first *written* machine. Its maths is already pure and tested (`view-xf-*.test.js`), and
its states are few:

```
idle --tap--> solving --solveLanded--> crossing --morphLanded--> idle
solving --morphLanded--> held --solveLanded--> idle
solving|crossing --hand--> (same state, hand: true)
solving|crossing --retarget--> solving (solve again)    (only if not yet crossing: viewXfRetargetTo)
held --tap--> solving
```

Each state's `enter` action does the layer work: `solving` enter is `xfLayer(0)` plus `crossfade(1, 0)`, `idle` enter is `xfLayer(1)`
plus `dropGhosts`, and so on. That puts the fade in one place per state and makes the double fade a one-line fix. Keep `viewXf` as the
machine's data (`m.data`). **Do not** move the morph clock into the machine. The clock is a reversible clock, the machine reads its
progress, and that split is right.

**Verify.** The existing tests `view-xf-ghosts`, `view-xf-retarget`, `view-change-clock` and `view-fade` must pass. Add a node test that
runs the table with a fake `labelGL` (record `crossfade` and `xfLayer` calls) and asserts the layer opacities per state. That is the test
the animation doc asked for. Stage-trace `--compare` covers the circuit and anatomy seams, and must match.

**Size** M. **Risk** low-medium.

### M4. The label layer (ride, solve, crossfade, hold)

**Where.** `stage-labels.js:147-245` (`updateLabels`, `handRideWatch`, `handRideWait`, `handRideEnd`). `stage-view.js:103-130`, `204-300`
(the presolve `pre`, `xfRelease`). `glide-labels.js` (the presenter glide's own crossfade, `glideXf`). `stage-label-layer.js:105`
(`leadOwed`). `stage.js:1353`, `1475-1498` (`labelKey`, `labelPainted`, `xfSolving`, `xfHold`, `leadOwed`, `handRide`, `layCTM`).
`stage-ride.js:16-50` (`rideStart`, `rideNow`, `rideStop` and the `lb-ride` class).

**States (reconstructed).**

| State | Encoded as | Meaning |
|---|---|---|
| laid | `solvedFor` current, no job | labels stand where the last solve put them |
| riding | `handRide` (hold) or `rideCTM` (card zoom ride) | the camera moves, labels are pinned to world anchors (GPU `pinDraw`), nothing laid out |
| solving | `labelJob` | a solve sliced over frames, labels stand as they were |
| crossing (view) | `viewXf` pending or crossing | M3 |
| crossing (glide) | `glideXf` | a presenter glide's old and new labels crossfade on its progress |
| held | `xfHold` | the camera landed, the new solve is not done, ghosts stand |
| hidden | `cathHid()`, `labHid`, `diveT > 0` | the HVPG catheter or the dive hides them |
| owed | `leadOwed` | a leader layout is owed to the next layout |

**Risks.**

- (code) There are two parallel copies of the crossfade machine: `viewXf` (`stage-view.js`) and `glideXf` (`glide-labels.js`). Each has
  `pending`, `landAt` and the same slice logic, and each has its own end path into `xfHold`. `viewXfStart` must call `glideXfCut()` first
  (`stage-view.js:150`) so the two never run at once. The guard works, but it is one of a dozen ordering rules nobody wrote down.
- (code) `updateLabels` is the transition function for this machine *and* for the camera's `camMove` (`stage-labels.js:155` calls
  `camSettle`). A call that only wanted to refresh values can end a presenter move.
- (code) `handRide` is "only the flag that a hold is on" (`:236`). Its end is polled every frame by `handRideWait`, using predicate #3 from
  M2. With M2 fixed, the label ride and the box cache agree on when the camera stopped. Today they do not, so the labels can be solved for
  rest while the callouts still think the view is at rest *or* moving. (guess for any visible effect.)
- (code) The `lb-ride` class on the stage wrap (`stage-ride.js:11`) is how `label-gl.js` learns that a ride is on (`rideLook`,
  `label-gl.js:906`, `closest('.lb-ride')`). The class is also on the idle wake's observer list (`stage-idle.js:50`) and in
  `GESTURE_LOOK` (`idle-keys.js:40-42`), so it wakes the figure loop and makes the observers filter it out again. It is a state channel
  through the DOM.

**Design.**

1. Derived first: `labelPhase()` returns the table's state from the flags. Record it in the machine trace with the camera mode (M1). Add
   an impossible list: `handRide && labelJob` (`updateLabels` drops the job when it starts a ride, `:167`), `viewXf && glideXf`,
   `xfHold && viewXf && !viewXf.pending`.
2. Merge the two crossfades into one `crossfade` machine with a `kind: 'view' | 'glide'` and one slice step. They share `viewXfMix` and
   `XF_SLICE_MS` already. This deletes about 40 lines of copied logic and makes M3's double-fade fix apply to both.
3. Give `label-gl` the ride state by a call (`labelGL.riding(on)`) next to the class. Keep the class for the leaders' CSS opacity
   (`label-theme.js`) only, so label-gl stops reading the DOM to find its own state.
4. Split `updateLabels(f)` into `labelsFrame(f)` (the machine step) and a separate `camSettle` call at its one caller that needs it.

- **UX:** labels and leaders follow one notion of "moving". No frame is laid out mid-move. This is the "labels move 100% with the
  figure" goal.
- **AX:** "why are the labels not laid out" becomes one state name.

**Verify.** `label-presolve-interleave.test.js`, `view-xf-ghosts.test.js` and the label snapshot in stage-trace (the fourth column
of each trace line). `--compare` must be identical through step 3. Step 4 is a pure move.

**Size** M (steps 1 and 3), L (step 2). **Risk** medium for step 2. Do it after M2 and M3.

### M5. Dive into and rise out of the lobule

**Where.** `stage-dive.js:268-372` (`prepRise`, `riseReady`, `setLobule`). `stage.js:1338`, `1386-1459` (`diveAt`, `diveLand`, `diveT`,
`diveOut`, `riseLine`, `riseFast`, `zShift`, `diveOrig`, `diveHid`, `labHid`, `lobIn`, the `camShow*` fields, `risePrep`, `risePrepT`,
`diveWait`, `diveGen`, `lobOn`, `lobTo`, `lobMs`, `lobSeen`, `lobuleStep`, `lobuleBackstop`, `syncSemantic`). `stage.js:1527`
(`riseBox`, `riseExp`, `riseUsed`). `stage.js:3304` (`lobuleSettled`). `stage-dive.js:110-125` (`camShow` fade).

**States.** `anatomy` → `waitingPaint` (`diveWait = gen`, `lz.paintAhead()` pending) → `diving` (`lobuleOn`, `0 < diveT < 1`, `lobOn`)
→ `inLobule` (`diveT = 1`, `lobIn` once covered) → `risePrepared` (`risePrep`, at most 6 s) → `rising` (`!lobuleOn`, `0 < diveT < 1`)
→ `anatomy`. A tap back reverses the clock from `diving` or `rising` (`diveClock`). The backstop (`lobEnd`) lands it if frames stop.

**Risks.**

- (code) There are two booleans for "asked to be in the lobule": `lobuleOn` (set by `setLobule`, `stage-dive.js:312`) and `lobOn` (the
  clock's goal, `:367`). The backstop's first test is `lobuleOn !== lobOn` (`stage.js:1441`). `syncSemantic` (`stage.js:1453`) sets
  `lobuleOn = false` and `diveT = 0` directly when the view turns to the circuit, and cancels `lobAnim`. It does not clear `lobOn`, the
  backstop timer `lobEnd`, `diveWait` or `risePrep`. Each is guarded where it is read today. For example, the backstop returns on
  `lobuleOn !== lobOn`, and the paint-ahead continuation re-checks `!lobuleOn && diveT === 0` (`stage-dive.js:308`). But the stage is left
  with `lobOn = true` while `lobuleOn = false` and `diveT = 0`, a combination no table would allow.
- (code) While waiting for the paint, `store.lobule` is true but `lobuleOn` is false. If the user turns to the circuit in that window,
  `syncSemantic`'s branch does not run (it needs `lobuleOn`), so `store.setSoon(LOBULE_OFF)` is never sent. The paint then lands and
  `setLobule(true, true)` returns at its first guard (`morphTarget !== 0`, `:292`). The store is left saying `lobule: true` on the
  circuit. (code for the path. guess that the paint window is long enough on a phone to hit it: it was 1.8 s on CI, per the comment at
  `:301-303`.) This is an impossible store state (M7).
- (code) `riseUsed`, `riseLine` and `riseFast` are set at the start of a rise and read at its landing (`stage.js:1435`). A reversal mid-rise
  keeps them, which the comment says is on purpose (`stage-dive.js:328`). They are three flags for one fact: what kind of landing is
  owed.

**Design.**

1. Derived first: `diveState()` returns `'anatomy' | 'waitingPaint' | 'diving' | 'inLobule' | 'rising'` plus the `impossible()` list
   (`lobOn !== lobuleOn && !diveWait && diveT ∈ {0,1}`, `store.lobule && morphTarget === 1` after a rest pass).
2. Fix the waiting window: on a turn to the circuit while `diveWait` is set, cancel the wait (`diveWait = 0; diveGen++`) and clear
   `store.lobule`, as `syncSemantic` does for a landed lobule. This is the one behaviour change. Put it in its own commit with a node test.
3. Later, make it a machine with `diveClock` as its data. Make `syncSemantic`'s reset an event (`circuit`) handled in every state, so
   `lobOn`, `lobEnd`, `diveWait` and `risePrep` are all ended by one exit action. `riseUsed`, `riseLine` and `riseFast` become
   `m.data.landing = 'fit' | 'slide' | 'line'`.

**Verify.** `stage-dive-record.test.js`, `dive-*.test.js`, `lobule-exit-hold.test.js`. Stage-trace's dive and rise seams must match
(`--compare`). Add a trace seam "dive, then `setView('circuit')` mid-dive" and "dive asked for, then circuit, before the paint lands",
and assert `store.get().lobule === false` in a node test that drives `createStage` the way stage-trace does.

**Size** S (steps 1 and 2), M (step 3). **Risk** low, then medium.

### M6. Into and out of the sinusoid

**Where.** `lobule-zoom.js:4834-4879` (`diveSinusoid`, `sinOnLanding`, the `store.on('lobule')` handler). `sinTo`, `sinU`, `sinRaf`,
`sinClock`, `sinPending`, `quietSin`, `sinDive`, `refitLater`. `main.js:330-350` (`syncViewSeg`, the `sin-focus` class, `pillChange`).
`main.js:835` (the view buttons). `stage-dive.js:261`, `325` (the dive reads the `sin-focus` class).

**States.** `lobule` → `zoomingIn` (`sinTo = 1`, `0 < sinU < 1`) → `sinusoid` (`sinU = 1`) → `zoomingOut` → `lobule`. Plus
`pendingIn` (`sinPending`: asked during the lobule's own dive, carried on at landing) and `closing` (`quietSin`: the lobule closes with
the sinusoid open).

**Risks.**

- (code) If Sinusoid is pressed while the lobule is still fading in (`fade < 0.98`), `diveSinusoid(true)` sets `sinPending = true`
  (`:4837`). It then refuses the request by queueing `store.set({ sinusoid: false })` (`:4838`). When the dive lands, `sinOnLanding` sets
  `sinusoid: true` again (`:4877`). The store therefore goes true, false, true. Store listeners are synchronous, so `syncViewSeg` runs on
  each change: it adds `sin-focus`, plays the pill fold (`pillChange`), removes `sin-focus`, plays the fold back, and later plays it a
  third time. That is three pill folds and three changes to the `#app` class (each wakes the stage loop, `stage-idle.js:51`) for one tap.
  (code for the sequence. guess for how visible it is: the folds may cancel each other within a frame, since `foldPill` calls `stopFold`
  first. The `sin-focus` class still changes twice and moves the dock and bars.)
- (code) `sin-focus` is set in `main.js` from the store, and read in `stage-dive.js:261` and `:325` as "the sinusoid is up". `stage-dive.js:325`
  removes it by hand before measuring, "or the fit is measured without them". This is the class as state again, with two writers.

**Design.**

- Do not write the store to refuse a request. Keep the request inside the lobule view (`sinPending`) and leave `store.sinusoid` false until
  the zoom really starts. The click handler in `main.js:835` then calls `lz.askSinusoid()`, which either starts the zoom (and sets the store)
  or sets `pending`. This is a small, contained change.
- Name the states in one place: `sinState()`, in the trace. `lobuleSettled()` (`stage.js:3304`) already reads `lz.sinBusy()`. Make
  `sinBusy` return `sinState() !== 'lobule' && sinState() !== 'sinusoid'`.
- Have `stage-dive.js` read the sinusoid's state from `lz` (or from the store) instead of from `#app.sin-focus`.

**Verify.** `sinusoid-*.test.js` and `view-pill-sinusoid-glide.test.js`. Add a node test: drive `store.set1('lobule', true)`, press
"sinusoid" at fade 0.5, and count `store.on('sinusoid')` calls. One is expected. The stage-trace dive seam must match.

**Size** S. **Risk** low.

### M7. The view in the store (view, lobule, sinusoid)

**Where.** `store.js:13-15`. Readers derive the view in several places: `main.js:337` (`cur = lobule && sinusoid ? 'sinusoid' : lobule ?
'lobule' : view`), `main.js:2189` (the A key), `presenter.js` (`store.get().lobule || store.get().sinusoid`, `inLiver` at about `:2339`),
and `stage.js:1453` (the fix-up).

**States.** Four legal states: anatomy, circuit, lobule (over the anatomy) and sinusoid (inside the lobule). The three fields allow eight
combinations. These illegal ones are repaired by listeners:

| Illegal combination | Repaired by |
|---|---|
| `view: 'circuit'`, `lobule: true` | `syncSemantic` → `store.setSoon(LOBULE_OFF)` (`stage.js:1453`), but only if `lobuleOn` (see M5) |
| `lobule: false`, `sinusoid: true` | `lobule-zoom.js:4879` (`quietSin`) |
| `sinusoid: true` before the lobule can take it | `lobule-zoom.js:4838` (queued false, M6) |

**Risks.** (code) Each repair is a second store write, heard by every listener, after the first write was already heard. Listeners that
act on the illegal state (pill folds, the dock's `#btnLobuleLayers`, the presenter's `inLiver`) act twice.

**Design.**

- Add `viewKey(st)`, which returns `'anatomy' | 'circuit' | 'lobule' | 'sinusoid'`, and use it at every reader above.
- Add `setViewKey(k)`. It writes the three fields in one `store.set` that is always legal. Route the view buttons, the A key, the palette
  and the presenter through it.
- Add a dev assertion in `store.set` (node tests and `?trace` only) that throws or logs when a patch leaves an illegal combination. Keep
  the three fields: everything that reads them goes on working.
- **AX:** an agent can see the four views and their transitions in one function.

**Verify.** Add `tests/view-key.test.js`: every transition between the four, done through `setViewKey`, never leaves an illegal
combination, and each sends exactly one store write. Stage-trace `--compare` must match, because it calls `setView` and `store.set1`
directly.

**Size** S. **Risk** low.

---

## Input

### M8. Gestures on the figure (pointer, touch, pinch, wheel) and their copy in the lobule

**Where.** `stage-gestures.js:22-125` (`wheelKind`, `wheelAt`, `settleT`, `wheelMute`, `gScale`, `gWheel`, `touchesDown`, `panFit`).
`:207-350` (`live.drag` with `type: 'pan' | 'pinchzoom' | 'ignore'`, `pointers`, `pressT`, `lastTap`, `peekEv`, the `panning` class).
`lobule-zoom.js:567-628` (its own `wheelKind`, `wheelAt`, `wheelMute`, `wheelFrame`, `pinch`, `down`, `drag`, `fingerA`, `fingerB`, `tN`).

**States.** `idle` → `pressed` (`drag.type = 'pan'`, `!moved`, long-press timer `pressT`) → `peeking` (`drag.peeked`), or → `panning`
(`moved`) → `flinging` (`live.glide`) or `springBack` → `idle`. A second finger: → `pinching` (`pinchzoom`). One finger lifts: → `panning`
(`noFling`). Then: `wheelZoom` (a notch glide), `padPinch` (`wheelAt` within 250 ms), `padScroll`, and `muted` (`wheelMute`, after a
button during a momentum scroll). A tap and a double tap are decided at pointerup from `lastTap`.

**Risks.**

- (code) `live.drag.type` is close to an explicit state, and that part is good. But several facts about the gesture live outside it. The
  `panning` class covers only a one-finger pan (M2). "Gesture on" is a 250 ms time window for the wheel (`gestureOn`). There are two finger
  sets: `pointers` (the stage's Map) and `touchesDown` (a window capture Set used only to tell Safari's gesture events apart, `:93-95`).
  The two sets can disagree when a pointer is captured elsewhere. That is the design (the capture listener sees every pointer), but it is
  not written down next to `pointers`.
- (code) Two gesture machines of nearly the same shape exist, one in `stage-gestures.js` and one in `lobule-zoom.js`, with the same
  variable names, the same 250 ms window and the same mute rule. A fix to one, such as the 4 Nov trackpad pinch `wheelAt` fix described at
  `stage-gestures.js:52-55`, has to be made twice. (I did not check whether the lobule copy has that fix. Worth a look.)
- (code) A long press is a `stageScope` timer that re-checks `live.drag !== d || d.moved || pointers.size !== 1` (`:243`). That is
  correct, but it is a state check written as three comparisons instead of "still in `pressed`".

**Design.**

- Name the states: put `drag.type` and `moved`/`peeked` together into one `phase` field: `'pressed' | 'panning' | 'peeking' | 'pinching'
  | 'ignore'`. This is a rename inside the file. The external readers only test `live.drag` truthiness and `.type === 'pinchzoom'`.
- Add the `panning` class at the start of every hand phase that moves the view, or better, stop reading the class at all (M2). Keep
  writing the class for the cursor only (`app.css:187`).
- Extract the pure part shared by the two machines into `hand-input.js`: classify wheel against pad, the 250 ms gesture window, the mute
  rule, the flick test (`tb - ta >= 6 && dt >= 30 && now - tr[tb] < 50`), and the tap and double-tap rule. Both files call it. Each file
  keeps its own DOM wiring and its own apply step (the stage's `zoomAt`, the lobule's `V`).
- **Do not** convert the pointer handlers to a generic machine library. The event order (capture, `lostpointercapture`, pinch→pan
  hand-over) is subtle and well commented. Naming the phases is enough.

**Verify.** `wheel-gesture.test.js`, `gesture-zoom-cost.test.js`, `lobule-pan-only.test.js`, `veins-pinch-*.test.js`. Add a node test
for `hand-input.js`: wheel classification, the flick threshold and double-tap timing, from recorded event sequences. Add the stage-trace
pinch and wheel seams (M1) and `--compare`.

**Size** M. **Risk** medium (input is touched). Do the rename and `hand-input.js` in separate commits.

---

## The figure loop

### M9. Idle and wake (`stage-idle.js`, `animate`, the stage scope's timers)

**Where.** `stage-idle.js:13-51` (`trimVeins`, `sleepLook`, `sleep`, `wake`, the wake sources). `stage.js:2676-2797` (`askAnimate`,
`animate`). `stage.js:2754` (the `still` test). `stage.js:2803-2808` (`sleeping`, `sleepTimer`, `veinsTrimmed`, `hiddenAt`,
`veinsHold`). `stage.js:2711-2719` (`busyAt`, `calm`, `flowGate`).

**States.**

| State | Encoded as | Next look |
|---|---|---|
| running | `animRaf` asked, `!sleeping` | every frame, paced (`interval`, calm at 30 Hz) |
| calm | running and `now - busyAt > CALM_AFTER_MS` | 30 Hz |
| asleep, shown | `sleeping`, `!unseen()` | 1 s safety look |
| asleep, unseen, warm | `sleeping`, `hiddenAt` set, `!veinsTrimmed`, `veinsHold` | at the warm window's end |
| asleep, trimmed | `sleeping`, `veinsTrimmed` | never (woken only) |
| diving | `0 < diveT < 1` and nothing easing | every frame, blood only |

Wake sources: any store write (`'*'`, not frames), `visibilitychange`, any class change on the stage wrap or `#app` (two
`MutationObserver`s), `restOn`, direct `askAnimate()` from `stage-sites.js:69` and others, and `live.stageWake` from organ pictures.

**Risks.**

- (code) The `still` test at `stage.js:2754` joins 25 conditions with `&&` on one line. When the loop does not sleep, nothing says which
  condition held it awake. When something new eases and is left out of the test, the figure freezes until a wake, because the loop slept
  while it still had work. Both kinds of bug have happened, judging from the comments around it.
- (code) `askAnimate()` called directly (not through `wake`) while `sleeping` runs the loop without clearing `sleeping` or the 1 s
  `sleepTimer`. That is harmless today: the next `sleep()` resets both, and `wake` is idempotent. But "asleep and running" is a combination
  the flags allow and nothing checks.
- (code) Every class change on the wrap or `#app` wakes the loop. That includes the gesture classes (`panning`, `lb-ride`, `stage-busy`,
  `figure-focus`, `off-home`), which `idle-keys.js` then has to filter out for the layout watchers. The wake is cheap (one frame), but
  M6's triple class change and the chrome's arm and off timers (M20) each cost one.

**Design.**

- Turn the `still` test into a registry, the way `theme-epoch.js` already does for `onThemeBusy`: `easing.add('widths', () => widthEasing)`,
  and so on, one line per term, in the file that owns the term. `still` becomes `!easing.any()`. In trace mode, `easing.why()` returns the
  names that kept the loop awake, and the `?perf` Copy can include them. The terms and their order stay as they are, so the result is the
  same. Order only matters for cost, and these are all cheap reads.
- Name the sleep states with `idleState()` (the table above) in the machine trace. Add `sleeping && animRaf` to the impossible list as a
  watch item, not an error.
- **Do not** add a timer or change `WARM_MS` or the 1 s safety look. **Do not** remove the class observers: they are a deliberate backstop
  ("in case a change came by a path that does not wake it").
- **UX:** when an easer is left out, the frozen figure shows up in a node test instead of on the owner's iPad. **DX and AX:** "why is the
  figure drawing at 60 Hz when nothing moves" becomes a one-line answer.

**Verify.** Rewrite `idle-wake.test.js` and `idle-rest.test.js`, both source-regex tests, as behaviour tests. Register a fake easer,
assert that `still` is false while it is true, assert that `sleep()` follows once it is false, and assert that `why()` names it. Then take
both files off the regex list. Stage-trace `--compare` must match, because the trace's frames depend on sleeping: a drawn frame or not
changes the GL hash.

**Size** S-M. **Risk** low, provided every term moves over, and the trace proves that.

---

## The presenter

### M10. Slide change (`go`, `run`, `transition`, `transitionRun`)

**Where.** `presenter.js:937-941` (`want`, `shown`, `shownState`, `busy`, `playing`, `gen`, `entering`, `black`). `:2073-2125` (`txn`,
`sess`, `go`, `prepHold`, `changing`, `outNow`). `:2140-2190` (`next`, `prev`, `toBeat`, `run`). `:2229-2500` (`transition`,
`transitionRun`). `slide-txn.js` (good). `wait-cut.js` (good).

**States.** `run()` is a reconciliation loop. It keeps calling `transition(want)` or `beatMove` until `shown` matches
`{ i: want, gen, beat }` (`:2178`). That is a sound pattern: level-triggered, and it survives presses during a change. Inside
`transitionRun` the phases are the order of the code:

```
prep-hold → leave (cards thrown, figure out) → cath-out → to-anatomy → state ready → case / question
→ morph → cards in → camera → settle → unhush → play (lapse | answer | procedure) → landed
```

Three mechanisms cut a stale change: `gen` (bumped by a new talk), `txn` (one for each press) and `want !== to`. All three are in `cut`
(`:2258`).

**Risks.**

- (code) No phase is visible from outside. A slide that hangs (the presenter warns "did not land" only after three tries, `:2182`) cannot
  say which `await` it was waiting on. The degraded marker (`data-pz-degraded`) covers only the preparation phase.
- (code) `busy` is cleared in both the `catch` and the `finally` of `run()` (`:2187-2189`). `changing()` is `busy || !!prepT` (`:2125`).
  `go()` reads `busy` to choose between `outNow()` and `run()`. The zoom-close path (`:2103`) calls `run()` only `if (!busy)`, so a press
  that lands while a zoom closes during a running change relies on the running loop picking up the new `want`. It does, by the `while`.
  This is fine. It is fine only because of the loop, and the loop is not named as the guarantee.
- (code) 31 `await wait(…)` calls in `presenter.js` cannot be cut. Examples: `:2325` (the hush-out wait), `:2412` (`wait(150)` after a
  lead), and `wait(60)` at `:2463`. The animation doc moved the long ones to `waitCut`. These short ones each add up to 150 ms of lag
  after Next during a change.

**Design.**

1. Name the phases: `tx.phase('leave')` and so on, a string field on the transaction set at each step of `transitionRun`, and recorded in
   the trace with timestamps. `slide-txn.js` gets a `phase` field and its `stats()` gets `{ id, phase, since }`. This changes nothing on
   screen, and a hang can say "stuck in camera for 9 s". The presenter's warn line names it.
2. Replace every remaining `await wait(n)` in `transitionRun` and its helpers with `await waitCut(n, cut)`. Do this mechanically, one helper
   at a time, and **never change a delay** (the rule in `docs/scheduling.md`).
3. **Do not** turn `transitionRun` into a table. A coroutine is the right shape for a long sequence of steps that each wait on something.
   A table would scatter it. The phases, the transaction and `waitCut` give the AX benefit without the rewrite.

**Verify.** `slide-txn.test.js`, `deck-nav.test.js`, `slide-scope.test.js`, `slide-txn-lease.test.js`. Add a node test: `createTxns`
plus phases, where each `begin` resets the phase and `stats()` reports it. `wait-cut.test.js` (if it exists, otherwise add it) with a fake
frame. There is no stage-trace seam for the presenter. Add a `rules-lint` rule that fails a new bare `await wait(` in `presenter.js` (an
allowance that only goes down, like `timer-budget.json`).

**Size** S (step 1), M (step 2). **Risk** low.

### M11. The hush (liver labels out and in)

**Where.** `presenter.js:2191-2221` (`hushed`, `hushAt`, `hushInT`, `lastCam`, `hush`, `unhush`). `:2325`. `:6281` (reset). Classes
`pz-hush` and `pz-hush-in` on `#app`.

**States.** `shown` → `hushing` (class `pz-hush`, `hushed`) → `waitingLanding` (inside `unhush`, `until` 2.5 s) → `easingIn` (class
`pz-hush-in`, timer `HUSH_IN + 50`) → `shown`.

**Risks.** (code) `unhush` is an async function with three waits (`until(…, 2500)`, `wait(80)`, `eased(…, 1500)`), and only the first
can be cut. A second `hush()` during `unhush`'s waits is a no-op (`if (hushed) return`), so the first `unhush` goes on, and at its end it
checks `cut()`. A `hush` from a *newer* slide while an older slide's `unhush` waits is therefore safe only because `cut()` is the older
slide's. That holds. (guess: the `eased` wait reads the browser's animations with `getAnimations()`. That works, but the cards' own fades
are known to the throw state, so this one machine still asks the browser instead of its own state.)

**Design.** Keep it, and put `wait(80)` and `eased`'s cap behind `cut` (M10 step 2). Record `hushed` in the presenter's phase trace. It is
a sub-phase of `unhush`. Size S, risk low.

### M12. Time-lapse playback

**Where.** `presenter.js:1499` (`lapseOn`, `lapseLeft`, `lastAt`). `:1655-1660` (`stopLapse`, `skipLapse`). `:1768-1800`
(`playLapse`).

**States.** `off` → `playing` (`lapseOn`, `lapseLeft > 0`) → `fast` (`lapseLeft === 0`, after Next) → `landing` (`morphTo(end)`) →
`off`. Polled every 150 ms (60 ms when fast) from the store's frames.

**Risks.**

- (code) The loop ends only when `d >= days && fr?.clock === 'hemo'` (`:1790`), or on `cut()`, or when `lapseOn` goes false. If the
  worker never reports the hemo clock again (a stalled worker, or a lapse message lost), the loop polls until the next press. There is no
  time cap. `sos-recover-lapse.test.js` suggests a recovery exists elsewhere. (guess: I did not trace it.)
- (code) `lapseLeft` holds two facts at once: the days left, and "Next has sped it up" (0 means fast). `paintChrome` reads it for both.

**Design.** Name the states (`lapse.state`) and record them in the presenter trace. Add a cap: if no frame has advanced `d` for, say,
`3 × lapse.seconds`, mark the slide degraded (`degrade('lapse-stall')`) and land on the computed end state, which `morphTo(end)` already
does. Split `lapseLeft` into `left` and `fast`. Size S, risk low.

### M13. The HVPG catheter's script (`cathTo`, `cathOut`)

**Where.** `presenter.js:1445-1495`. Its state: `cath.on`, `cath.cam` (`'route' | 'tip'`), `cath.show` (an array of callout keys),
`cath.ring`, `cath.follow`, and `cath.v.{u, balloon, column}` (eased tracks). On the stage: `live.cath.st` and `st.keep`
(`stage-cath.js`).

**States.** `out` → `routeIn` (camera to route, follow the tip) → `atTip` → one of `blocked` (occluded, then abort) | `free` |
`wedging` (balloon up) → `filling` (column) → `wedged` (`show: ['f','w']`) → `result` (`show: ['sum']`). `cathOut` goes back to `out`.

**Risks.** (code) Every step is a bare `await wait(ms(…))` followed by `if (cut()) return`. The descent waits `3800 * (1 - u) + 100` ms
(`:1469`), so Next pressed during the descent is answered up to about 3.9 s later. The step's `cut()` runs only after the wait. This is
the biggest remaining case of the problem the animation doc fixed for the lobule waits.

**Design.** `waitCut` for every wait in `cathTo` (M10 step 2). Name the steps in `cath.step`, recorded with the presenter phases.
**Do not** make it a table. It is a script and should stay one. Size S, risk low. Verify with `cath-*.test.js` and `hvpg-*.test.js`.

### M14. The data card's dock and tuck (`dock.lvl`, `slip`, `tool-open`)

**Where.** `presenter.js:3321-3375` (`lvlSet`, `glide`, the `dock` object with `lvl`, `to`, `raf`, `auto`, `autoKey` and `down`,
`sheetPull`, `slip` with `d`, `h0`, `raf`, `lift` and `base`). `:3637-3680` (`dockHalt`, `dockTo`, the glide). `:4970`, `:5899-5906`,
`:6038` (taps and pulls). Classes `pz-sheet`, `tool-open`, `stack` and `pz-wide`, and the custom property `--pz-u`.

**States.** On an upright phone or a stacked wide card:

| Pose | Encoded as |
|---|---|
| closed | `dock.lvl = 1`, `!tool-open` |
| instrument out, readings tucked | `dock.lvl = 0`, `tool-open`, `--pz-u = 0` |
| readings out | `tool-open`, `--pz-u = 1` |
| moving (glide) | `glide` set, `dock.lvl` read from the animation clock |
| under the finger | a pull in progress (`sheetPull`, the fold touch) |
| tucked by tap, next tap closes | `dock.down = slide index` |
| closed by layout | `dock.auto`, `dock.autoKey` |

**Risks.**

- (code) `dock.lvl` is a getter and setter with a side effect: setting it halts a running glide (`set lvl(v) { if (glide) dockHalt(); … }`,
  `:3329`). So a plain assignment is also a transition, and a reader cannot tell which assignments end a glide.
- (code) The pose is spread over a number (`lvl`), a class (`tool-open`), a CSS custom property (`--pz-u`, written frame by frame), and
  `down` and `auto`. No function returns "the pose". The 30 Oct note ("the view still snaps when I untuck a stacked card") and the M1 card
  follow exist because the camera has to follow this pose. The camera follow reads the card's progress `u`, not a pose.

**Design.** Add `cardPose()`, which returns `{ pose: 'closed' | 'tucked' | 'open' | 'moving' | 'held', from, to, u }` from the pieces
above. It is read-only. Record it in the trace. Make the camera follow (`camAt`, `:4887`) and the tests read the pose instead of the
classes. Replace the `lvl` setter with an explicit `dockSet(v)` that names the halt. Size M, risk low-medium. Verify with
`card-dock-reframe.test.js`, `dock-glide.test.js` and `card-throw-*.test.js`.

### M15. Card throws (already explicit: keep)

**Where.** `card-throw.js:36-60`, `278-300` (`runs`, `held`, `pinned`, `lastRun`, `lands`, `throwState`, `throwLeaving`, `throwBusy`,
`throwLanded`).

This is the model the others should copy. One record per card (`kind: 'in' | 'out' | 'back'`), plus held and pinned sets, a public
`throwState(el)` that reports the state, and a promise for "landed". Its one gap is that `held` and `pinned` are sets beside `runs`, so a
card can be in `runs` and `pinned` at once, which `throwState` reports as both. That is intended. **Do not convert.** Only register it
with the machine trace, so a stuck card shows as `out, held` in the `?perf` paste.

### M16. Card zoom (`card-zoom.js`)

**Where.** `card-zoom.js:101` (`st` with `closing`, `steady` and the rest). `:217-229` (`dataset.zoomed = ''`, classes `pz-zoomed`,
`pz-cam`, `pz-zmain`). `:283` (`dataset.zoomed = 'back'`). The presenter: `zoomOn()`, `zoomMissed`, `zoomWas`, `zoomCreditOff`
(`presenter.js:4124-4193`).

**States.** `rest` → `opening` → `zoomed` → `closing` (`st.closing`, `data-zoomed="back"`) → `rest`.

**Risks.** (code) The CSS reads `data-zoomed` (empty or `back`) as state, which is intended (the shadow eases). The presenter's
`zoomOn()`, `zoomMissed` and `zoomWas` hold a second copy of whether a zoom is up. (guess: they agree today, because every path goes
through `ui.zoom.close()`.)

**Design.** Expose `ui.zoom.state()` (`'rest' | 'opening' | 'zoomed' | 'closing'`), and have the presenter read it instead of keeping
`zoomOn` and `zoomMissed`. Register it in the trace. Size S, risk low.

---

## Surfaces: menus, dialogs, sheets, cards, popovers

### M17. The surface lifecycle (open, leaving, the one on top)

**Where.** `util.js:387-409` (`surface`, `claimSurface`, `releaseSurface`, the Esc and outside-tap handlers, `armed`). `util.js:388`
(`dialogUp`, which reads `#modalBack.show` and `.pal-back:not([hidden]):not(.leaving)`). `util.js:1162-1215` (`openModal`,
`closeModal`, `modalLeaveT`, `modalDone`). `util.js:1251` (`isModalOpen`, read from the class). `menu.js:118-147`, `599-620` (`open`,
`coldOpen`, `hoverT`, `hideT`, `pvGone`, the leaving panel kept until a timer). `card.js:120-121`, `194-216`, `350-355` (`ac-in`,
`ac-leaving`, `hidden`, `closeTimer`, `dataset.swiped`). `util.js:416-420` (`goneAt`, `goneEl`: the sheet switch crossfade).
`main.js:2417` (the "is anything open" test before the feedback prompt, with nine checks).

**States.** Every surface goes `closed` → `entering` → `open` → `leaving` → `closed`. Each one encodes the four states differently:

| Surface | open | leaving | closed |
|---|---|---|---|
| modal | `#modalBack.show` | `.leaving` + `modalLeaveT` | neither |
| menu | `open = true`, `el` set | panel kept, `inert`, `.out`, `setTimeout(done)` | `el = null` |
| card | `!hidden` | `.ac-leaving` + `closeTimer` | `hidden` |
| palette | `.pal-back:not([hidden])` | `.leaving` | `[hidden]` |

**Risks.**

- (code) "Is a dialog up" is read from classes in three places (`dialogUp`, `isModalOpen`, `main.js:2417`). "Is any surface up" has no
  single answer. `main.js:2417` lists nine checks, and a new surface has to be added there by hand or the feedback prompt can open over
  it.
- (code) `claimSurface` arms the new surface after `setTimeout(0)` (`util.js:398`), so the tap that opened it does not close it. A second
  `claimSurface` in the same task closes the first and arms the second. That is correct, but `armed` is a third state ("open, not yet
  armed") that nothing names.
- (code) `closeModal` starts two timers, `modalLeaveT` and an untracked one for `modalClosedDown` (`util.js:1207-1208`). The second is
  not cleared by `openModal`. Its callback checks `!show` first, so it is safe. It is safe only because the callback re-reads the class.

**Design.** Add a small `presence(el, { enterMs, leaveMs })` helper built on `machine()`. It has the four states, the timers are owned by
the states (cleared on exit), and the CSS class writes stay exactly as they are (`show`, `leaving`, `ac-leaving`, `out`). The helper only
decides *when*. Adopt it in the modal first (one element, two timers, clear tests: `modal-veil.test.js`). Then add a registry
`surfaces.any()` that `main.js:2417` and `dialogUp` read, so a new surface is counted by being made. Keep `claimSurface` as the one-on-top
rule. It is good: give it `armed` as a named state in the trace. Size S (modal), M (all), risk low. **Do not** change any CSS timing or
any class name.

### M18. The GPU glass's first-draw wait (`glass-gl.js`)

**Where.** `glass-gl.js:543-627` (`shown`, `quiet`, `liveUntil`, `poll`, `gen`, and per card `marked`, `waiting`, `wasDrawn`, `gaveUp`,
`fadedNow`, `waitT`, plus the attributes `data-gl` and `data-gl-wait`).

**States per card.** `new` → `waiting` (`data-gl-wait`: no solid card shows for a frame or two) → `drawn` (`wasDrawn`, `data-gl`), or →
`gaveUp` (solid, after `WAIT_MS` and `WAIT_PASSES` or `WAIT_CAP`). Also `fadedWait` (faded right out, held bare until it shows). A card
that leaves the list forgets its state.

**Risks.** (code) Each card's state is its membership in five collections plus two attributes, kept disjoint by the order of the
statements in `waitFor` (`:607-626`). A card is in `waiting` and `gaveUp` together only if that order is broken, but nothing would catch
that. This machine prevents the "solid card flashes before its frost" glitch the owner reported on 2 Nov, so a regression here is visible
on every slide.

**Design.** Keep the attributes. They are how the CSS hides the solid card, and that is GPU-side work. Replace the five sets with one
`Map(card → { state, at, n })` and a five-row transition table. `waitFor` becomes one pass over the list that sends `seen`, `drawn` and
`tick` events. Add a node test (glass-gl's wait logic can be pulled out as a pure function of `(list, drawnSet, now)`) that asserts each
card's state per pass, including the WAIT_CAP give-up and the faded case. Size S-M, risk medium (a visible glitch if wrong). Do it behind
the trace first: compute the new map *beside* the sets and assert they agree in `?trace` and node tests for a week, then switch.

### M19. The look or theme crossfade

**Where.** `main.js:1383-1418` (`canCrossfade`, `switchTheme`, `crossfade`, `pageFade`, the capture `pointerdown` that skips it).
`frame.js:86-97` (`pump`, `setFramePump`). `theme-epoch.js` (`epoch`, `themeSettled`, `onThemeBusy`, `settledSurfaces`: good).

**States.** `idle` → `capturingOld` (`startViewTransition` called) → `applying` (callback running, `pump = true`, waiting on
`themeSettled`, then `lookWhole`, then `settledSurfaces`, capped at 900 ms) → `fading` (`pageFade` set, a tap skips it) → `idle`.

**Risks.** (code for the boolean. guess for the race, from how view transitions are specified.) `setFramePump(on)` is a boolean. If a
second look is chosen while the first transition's update callback is still waiting, the second `startViewTransition` skips the first
transition, but the first callback still runs to its end. Its `finally` then calls `setFramePump(false)` while the second callback is
still waiting for surfaces. With the pump off and rendering held by the second transition, the second callback's frame-based waits get no
frames, and the transition waits for the 900 ms cap. The fade arrives late and maybe without the labels' new look. Two taps on the look
grid within about half a second would show it.

**Design.** Make the pump a counted lease (`createLease`, `slide-txn.js:62`): `const off = pumpLease.take()` in the callback, and `off()`
in its `finally`. The pump is on while any callback holds it. That is a three-line change, and the lease already exists and is tested.
Name `pageFade`'s states in the trace. Size S, risk low. Verify with a node test of `setFramePump` and the lease, using fake
`requestAnimationFrame` and timers (as stage-trace does): two overlapping takes, then one release, and the pump must still be on.

### M20. The chrome's busy and focus dimming (`stage-busy`, `figure-focus`)

**Where.** `main.js:1757-1782` (`busyT`, `armT`, `down`, `moved`, `busyOff`, `busyArmed`, `busy`, `busyEnd`, `focusT`, `focused`,
`unfocus`, `figureFocus`). The classes are written through `classSoon`. `credit.js:23` reads `stage-busy`.

**States.** `calm` → `arming` (`armT`, 120 ms) → `dimmed` (`stage-busy`) → `holding` (`busyT`, `ms`) → `calm`. Separately, on a phone:
`figure-focus` on or off, with `focused` mirroring it (the comment at `:1774` says why).

**Risks.** (code) `busyArmed`, `busy` and `busyEnd` read `app.classList.contains('stage-busy')` as their state, but writes go through
`classSoon` (`class-soon.js:3-6`: applied "after a task of its own"). Between the ask and the flush the read is stale. Take a
`busyOff()` asked in task A, followed by a pointer move in task A' before the flush: `busy()` sees `contains === true`, does not arm, and
then the flush removes the class while the hand moves. The pieces undim, then dim again 120 ms after the next move. (guess: the window is
one task wide, so this would be a rare blink.) `figure-focus` avoids this with its own `focused` mirror (`:1774`). `stage-busy` should do
the same.

**Design.** Add a `dimmed` variable mirroring the class, as `focused` does. Better, make the four-state machine above with
`machine('chromeBusy')`, timers owned by states. Size S, risk low. Verify with a node test with fake timers: move, pause past `ms`, move,
and the class asks must not include an off between the two moves.

---

## Loading and the rest

### M21. Boot, the loading cover and the service worker

**Where.** `index.html:23` (`data-boot="hold"`). `index.html:37`, `60-61` (the CSS failsafe at 20 s, `rise`). `index.html:78`
(`MIN`, `failed`, `hide`, `release`, `show`, `#boot` classes `named`, `done` and `failed`). `window.ppsFigureReady` and the
`pps:figure-ready` event. `presenter.js:6132-6180` (`cover`, `booting`, `coverT` 12 s, `coverUp`, `coverDown`, and `cold` read from
`data-boot`). `main.js:445-475` (the service worker: `offered`, `holdsMine`, the 30 s retry while presenting, registration on idle).

**States.** Page: `hold` → `named` → `rise` (`#boot.done`, 600 ms) → `released`, or → `failed` (message shown) → `released`
("anyway"). Deck cover: `none` → `up` (`booting`, cut when cold) → `settling` (`coverDown` loop) → `none`, with a 12 s failsafe. Service
worker: `none` → `registered` (after the figure is ready and the page is quiet) → `update seen` (`controllerchange`) → `offered`.

**Risks.** (code) The boot state is in an attribute, a class set, a global flag and an event, across inline script, CSS and two modules.
It works, and every stage has a failsafe timer, which is the right design for boot. The risk is for agents: the states are not written
anywhere. (code) The presenter's `coverUp` reads `data-boot === 'hold'` as "cold start". That couples the deck's cover to the page's boot
attribute.

**Design.** Document only. Add a short "Boot states" table to `docs/stage-map.md` or to this doc's follow-up, and a node test that parses
`index.html`'s inline script and asserts the four names (`hold`, `rise`, `done`, `failed`) and the timers (`MIN = 600`, the 20 s CSS
failsafe). That is a source test, though, which the rules forbid adding. So use `rules-lint.mjs` with a one-line reason instead. **Do not**
move boot into the `machine()` helper: the inline script must run before any module loads. Size S, risk none.

### M22. Small machines that are already fine

These have a clear owner, few states and good comments. Register them with the trace if it costs one line. Otherwise leave them.

| Machine | Where | Why it is fine |
|---|---|---|
| View pill fold | `pill-motion.js:89-100` (`folding`, `foldTimer`, `running`) | one module, `stopFold` ends everything |
| Dock panes | `dock.js:511`, `834-860` (`state: 'open' \| 'peek' \| 'focus'`, `setState`) | already an explicit enum with one setter |
| Slide transaction | `slide-txn.js` | explicit ids, supersede, release, publish, stats |
| Counted leases | `slide-txn.js:62-84` | explicit, idempotent releases |
| Timer scope | `scope.js` | owned timers, dispose |
| Waits that cut | `wait-cut.js` | pure, takes its clock, tested |
| View change maths | `view-xf.js` | pure functions over a record |
| Reversible clocks | `motion.js createReversible` (view, dive, turn, sinusoid) | one clock per move, reversal built in |
| Theme epoch | `theme-epoch.js` | one observer, one frame, a busy registry |
| `classSoon` | `class-soon.js` | last ask wins; the bug is in readers that read the DOM instead of their own mirror (M20) |

---

## What not to do

- **No big rewrite.** Do not replace `stage.js`'s `live` bag in one go. Do not introduce a state-chart library (XState or similar): it
  allocates per transition, which breaks the warm-allocation gate (`scripts/warm-alloc.mjs`), and it would hide the machines behind
  framework code agents cannot read in place.
- **No state in the DOM.** No `data-state`, no new classes for trace or tests. Each would be an off-GPU site, an observer wake and a
  stage-trace DOM hash change.
- **No changed delays** while converting (`docs/scheduling.md`). A conversion that changes a delay is two changes: make it two commits.
- **No machine around a coroutine.** `transitionRun`, `cathTo`, `unhush` and `coverDown` stay scripts. Name their phases (M10).
- **No conversion without its trace first.** Every machine starts as a derived, read-only state with an impossible-combination list
  that has run green in node tests and stage-trace for a while.

---

## Prioritized rollout

Each item is one push to the preview branch. Run `npm run lint && npm test && npm run check:static`, and
`node scripts/stage-trace.mjs --save` on the parent commit and `--compare` after, for every item that touches `src/ui/stage*.js`.

| # | Machine | Payoff | Risk | Size |
|---|---|---|---|---|
| 1 | `machine()` helper and trace registry (spec below), with `tests/machine.test.js` | Every later item uses it. The `?perf` Copy gains the machines' states. | none (new file, nothing adopts it yet) | S |
| 2 | M2 one "moving" record, `viewMoving` fixed for pinch, wheel and fling behind `?motionrec` | Callouts and probes stop re-reading boxes mid-pinch; labels stay with the figure | low | S |
| 3 | M1 step 1: `cameraMode()` derived, plus the impossible list in the trace | One answer to "who moves the camera". Catches double writers. | none | S |
| 4 | M7 `viewKey` and `setViewKey`, plus M6 no store echo for the sinusoid | No triple pill fold and `sin-focus` flip on one tap; no illegal store states | low | S |
| 5 | M19 frame pump as a lease | Two quick look taps no longer wait for the 900 ms cap | low | S |
| 6 | M5 steps 1 and 2: the dive's derived state, and the paint-wait fix on a turn to the circuit | No `lobule: true` on the circuit | low | S |
| 7 | M9 idle easers as a registry with `why()` | A missing easer shows up in node; "awake because…" in `?perf` | low | S-M |
| 8 | M10 step 1: presenter phases on the transaction; M12 lapse cap | A hang names its phase; no endless lapse poll | low | S |
| 9 | M10 step 2, M11 and M13: every bare `await wait` to `waitCut`, plus a lint allowance that only goes down | Next answers at once during the catheter and hush steps (up to 3.9 s today) | low | M |
| 10 | M3 view change as a written machine; fix the animation doc's double fade in its `enter` actions | No frame without labels at the tap; one place for the fade | low-medium | M |
| 11 | M1 step 2: `takeCamera(owner)` replaces the dozen copied cancels | No two movers in one frame; fewer copies | medium | M |
| 12 | M4 label layer: derived phase, ride by call, then the two crossfades merged | Labels 100% with the figure through every move; about 40 lines of copies gone | medium | M-L |
| 13 | M20 chrome busy mirror or machine | No rare undim blink mid-gesture | low | S |
| 14 | M17 `presence()` helper: modal first, then `surfaces.any()` | New surfaces counted automatically; no class reads for state | low | S-M |
| 15 | M14 `cardPose()` and `dockSet` | The camera follow and tests read one pose | low-medium | M |
| 16 | M18 glass wait as one map, run in shadow first | The same glitch protection, testable in node | medium | S-M |
| 17 | M8 gestures: phase rename and the shared `hand-input.js` | One fix lands in both the figure and the lobule | medium | M |
| 18 | M5 step 3: the dive as a written machine | `lobOn`, `lobEnd`, `diveWait` and `risePrep` all end in one exit | medium | M |
| 19 | M16 card zoom `state()`, M15 and M22 registered with the trace, M21 boot table | Completeness for agents | none | S |

Items 1 to 9 are each a day or less and change behaviour only where a bug was found (items 2, 4, 5, 6, 8 and 9, each in its own
commit). Items 10 to 12 are the structural core and should wait until the derived states from items 2 and 3 have run green on the
owner's devices for a few days.

---

## The shared helper: `src/ui/machine.js`

A spec, not code. About 120 lines, with no dependencies.

```js
import { machine, machines } from './machine.js';

const cam = machine('camera', {
  initial: 'rest',
  states: ['rest', 'glide', 'arc', 'drift', 'present', 'follow', 'view', 'dive', 'zoom', 'hand'],
  on: {                                   // the transition table: state → event → next state
    rest:  { glide: 'glide', drift: 'drift', hand: 'hand', view: 'view', dive: 'dive', follow: 'follow', zoom: 'zoom' },
    glide: { land: 'rest', glide: 'glide', hand: 'hand', view: 'view', dive: 'dive' },
    // …
    '*':   { reset: 'rest' },               // events every state takes
  },
  enter: { rest: () => camSettle() },     // optional actions, run after the state changes
  exit:  { drift: () => driftEnd() },
});

cam.state          // 'rest' (a string constant from `states`, never built)
cam.is('glide')    // boolean
cam.send('land')   // → true if the table had a row; false = ignored (counted, traced, never thrown in production)
cam.can('hand')    // whether the table has a row for it now
cam.data           // a plain record the owner keeps (viewXf's fields, the dive's landing kind…); the helper never reads it
cam.timer(scope, ms, 'event')   // a timer owned by the current state: it sends 'event' when due, and is cleared when the state exits
cam.derive(fn)     // read-only adoption: fn() → state name, called by the trace each frame; mismatches with cam.state are reported
cam.impossible(fn) // fn() → null or a short reason; checked in trace mode only
```

Rules:

1. **No allocation in `send`.** Event and state names are the literals in the table. The trace is a preallocated ring of 128 records
   `{ t, machine, from, event, to }`, written in place. This passes `scripts/warm-alloc.mjs` and the `alloc-rare` rule: the table is built
   once, as the machine is made.
2. **No DOM, no frames, no timers of its own.** `timer()` takes the caller's scope (`stageScope`, the presenter's `sess`), so
   `docs/scheduling.md` and `scripts/timer-budget.json` hold. The helper never calls `requestAnimationFrame` or `frameFor`, so
   `tests/no-raw-raf.test.js` holds.
3. **Trace only when asked.** `?trace=machines`, `?perf` (its Copy adds `machines()` as a short table: name, state, since, last five
   transitions, impossible reasons) or `globalThis.__ppsTraceMachines = true` in node tests and in `stage-trace.mjs`. Otherwise `send` is
   one table lookup, one compare and one assignment.
4. **Ignored events are data, not errors.** A `send` with no row returns false and counts `ignored[event]`. In node tests,
   `machine.strict = true` makes it throw, so a test that runs the table catches a missing row.
5. **`machines()`** returns every live machine. That is the one named place where an agent finds the app's states: one grep for
   `machine('` lists them all. Each machine's table is the documentation of its transitions, and the file that makes it is its owner.
6. **Stage-trace integration.** With `TRACE_MACHINES=<file>`, `stage-trace.mjs` writes the ring per frame to that file. The ring is not
   hashed, so `--compare` against a trace saved before adoption still passes. A second flag, `--compare-machines`, compares the machine
   logs of two runs, which shows that a refactor left the transitions as they were.
7. **Tests.** `tests/machine.test.js` (behaviour, not source): table lookups, wildcard rows, `enter` and `exit` order (exit, then
   change, then enter), state-owned timers cleared on exit (with the fake timers pattern from `stage-trace.mjs`), `derive` mismatch
   reporting, ring wrap-around, and no allocation per `send` (count objects with `--expose-gc` as `warm-alloc.mjs` does, or assert that
   the ring's records are the same objects).

Adoption pattern for every machine: **derive** (read-only, trace, impossible list, run green) → **send beside** (the old code still sets
its flags, and also sends events; the trace asserts that `derive()` equals `state`) → **own** (the flags become getters of `state`, the
copies go, and the regex tests become behaviour tests). Each step is its own push, and `stage-trace --compare` must match at every step.
