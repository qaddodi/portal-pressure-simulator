# Physics clock vs. render clock: how they run together, and how to make it smoother

**Status (11 Nov 2026).** A dated analysis (8 Nov 2026). Its description of the two clocks was not re-checked; of the options, only the first has started.
- Started: option 1 (instrument). `src/worker-core.js` keeps counters (`wstat.frames`, `wstat.params`); whether the HUD shows ticks, posts, bypass posts and "radii changed" per second is not verified (`frame-hud.js` lists "radii changed" as a cause).
- Not built, from code evidence: option 2 (`lapseDays` and `bedsideStep` in `worker-core.js` still set `paramsDirty = true` unthrottled; only the morph is throttled by `MORPH_PARAMS_MS`, 250 ms).
- Not verified: options 3 to 8. The Tube renderer work (10 to 11 Nov) does not change the physics side.


8 Nov 2026. For Mohammad. Code reading plus a short Node measurement of the worker core (no browser run). Line numbers are for
branch `claude/settings-topbar-icon-flvft1`. Anything I did not check in code is marked **(guess)**.

## 1. Short answer

- **The physics doesn't run at 50-60 Hz.** The "worker 50-60" in the `?perf` readout comes from a separate tiny probe worker. All
  it does is count its own animation frames to show the screen's rate (`src/ui/frame-hud.js:79-90`, `:116-117`). The real physics
  worker runs on a fixed **33 ms timer (about 30 ticks a second)** and normally sends the page a new state only **about 10 times a
  second** (every third tick).
- The physics and the drawing are **decoupled**. The physics takes small fixed steps (4 ms with the pulse on) and keeps track of
  real time left over. The page never replays the physics: it takes in every state it receives but draws only the newest one. It
  smooths vessel widths and colours toward that state with a short ease. The blood animation runs on the page's own clock.
- **Nothing backs up and there is no "spiral of death".** The physics clamps any gap between ticks to 0.1 s and caps the steps per
  tick. It stops completely in a hidden tab and restarts with no catch-up burst. On the page side, a "received" handshake (the
  paint ack) stops the worker from sending more states than the page takes in.
- **The physics is cheap.** One tick costs about 0.5-1 ms of a separate core (measured in Node; Safari will differ). Each message
  is about 8 KB. Neither is why your Mac sits at 15-30 fps. That is the GPU work on the page.
- What the physics side *does* add to page cost: each new state runs a full figure update, and it gives the vessels new target
  widths. The widths then ease on every drawn frame, which can trigger the "radii changed" whole-vessel redraw. Some paths also
  skip the handshake and send about 30 states a second: bedside time-lapses, disease time-lapses, and parameter updates during a
  slide change.
- Best options, in order: **(1) measure it properly in `?perf`**, **(2) close the handshake bypasses and throttle the parameter
  updates**, **(3) send vessel diameters only when they really change**, behind a switch you can A/B on the Mac.

## 2. How each loop runs

### Physics (Web Worker: `src/worker.js` → `src/worker-core.js`)

| What | Where | Detail |
|---|---|---|
| Who drives the clock | `worker-core.js:430-437` | `setInterval(tick, 33)`. It is a timer inside the worker, so the page and its frames don't drive it. No rAF in this worker. |
| Extra ticks | `worker-core.js:510` | When the page acks a state and a frame is owed, `painted()` runs one tick right away. It doesn't wait for the next 33 ms. |
| Step size | `worker-core.js:102` | `hemoStep`: 4 ms with pulse on (8 ms at 4x/8x speed), 20 ms with pulse off. |
| Accumulator | `worker-core.js:358-363` | `stepAcc += realDt*speed`. It takes `floor(stepAcc/h)` whole steps and keeps the remainder, so model time = real time × speed. |
| Clamp on a late tick | `worker-core.js:332` | `realDt = min(0.1 s, gap)`. If a tick arrives more than 100 ms late, the extra time is **dropped**. It is not replayed. |
| Max steps per tick | `worker-core.js:360-363` | Cap 700 (fine step) / 400 (20 ms step). If the cap is hit, the remainder is zeroed. The 0.1 s clamp means the cap is never reached: at most 25 steps at 1x, 50 at 2x, 100 at 8x. |
| Steps per posted state | measured | At 1x: about 8 steps per tick, about 25 per posted state. Node run: 45 states in 4.5 s = **10/s**, 25 samples each. |
| When a state is posted | `worker-core.js:394-401` | (a) something changed (`frameDirty`, `paramsDirty`, new events). Or (b) "due": more than 95 ms since the last post, the page has acked, **and** the model moved past a small threshold (`movedSincePost`, `:324-329`) or 1 s has passed (heartbeat). |
| Slide change (morph) | `worker-core.js:336-351` | Each tick blends the two states and posts one, but only when the page has acked the last one, or 400 ms have passed. Params are re-sent every 250 ms (`:347`). |
| Hidden tab / resting page | `main.js:186-187`, `:204-205`; `worker-core.js:506`, `:439`, `:670` | The page sends `visibility:false`, and the worker clears its timer. **The model pauses.** On return `last=null`, so the first tick has `realDt=0`: no burst. Morphs and bedside lapses have their start time pushed back by the paused time (`:433`). |
| Long jobs (preset load, chains) | `worker-core.js:643-651` | The live clock is stopped (`stop()`) while the job runs in 8 ms slices. |
| Message contents | `worker-core.js:239-280` | 6 typed arrays (P, Pf, Q, Qf, ext, D) plus a packed samples buffer, all **transferred** (zero copy). Metrics, slow state, bands and bleed are **cloned**. Measured: about 8.4 KB in total, about 3.7 KB of that transferred. Cloning a whole state took 0.04 ms in Node. |
| Fallback | `ui/host.js:66-77` | If no Worker can start, the same core runs on the page's own thread with the same 33 ms timer. Physics cost then lands on the page **(rare)**. |

Measured in Node (V8, this container): 8 engine steps ≈ 0.4-0.5 ms; `relaxHidden` (used while a slider eases) ≈ 0.33 ms;
`detectEvents` 0.05 ms. A normal tick comes to about 1 ms out of a 33 ms budget, roughly 3% of one core. Safari's JavaScript engine
may be slower **(guess: within 2-3x)**. Even so, the worker is far from its limit.

### Rendering (page, one rAF scheduler in `src/ui/frame.js`)

| What | Where | Detail |
|---|---|---|
| A state arrives | `main.js:543-545`, `paint-gate.js:11-35` | It goes into a queue. At the **next page frame**, every queued state is *ingested* in order (params, events, monitor samples) and only the **newest** is painted. A 100 ms timer covers frames that never come. |
| Handshake (paint ack) | `main.js:188`, `:555` | `painted` is sent when the state is **ingested**, in the page's frame, not after it is drawn. So it means "received", once per page frame. |
| Paint | `main.js:572-585` | Store update → `stage.update(f)` (full figure update) → cards, dock and inspector as deferred "may" tasks. |
| No interpolation | `paint-gate.js:4-5` | The page never blends between two physics states. Widths and colours **follow** the newest target through a two-stage ease (`display-state.js:12`, `W_TAU = 0.2 s` in `stage-tubes.js:523`). |
| Width ease | `stage-tubes.js:300-306`, `:403-412`, `:545-557` | Each model state sets new target widths, and every drawn frame moves the widths a step toward them. A change smaller than about 0.1 canvas px snaps at once (`:561-562`, `:409-411`). |
| Frame pacing | `frame.js:729-767`; `stage.js:2709-2722` | Motion is capped at about 60 Hz (10 ms gap). The calm-blood 30 Hz mode is currently off (`stage.js:2496`, `CALM_MS = 0`). On your Mac, the GPU is what holds the page at 15-30 fps. |
| Blood clock | `stage.js:2724`, `:2776`; `stage-blood.js:246-271` | The blood advances by the page's own frame time, clamped to 0.1 s. The physics only sets the flow it aims for, and the blood's speed follows it over seconds (`blood.js:27`, `MEAN_TAU = 3`). |

## 3. When one clock is faster than the other

**Physics faster than drawing (your Mac: 30 ticks/s vs 15-30 fps).**
In steady running this hardly matters. States go out about 10 times a second, below even 15 fps, so each one is painted in the
frame after it arrives. The 25 or so steps between two states never reach the page except as monitor samples, and those are all
kept. During a slide change the worker *would* post every tick (30/s), but the handshake holds it back. It posts again only after
the page has taken the last state in, so about one state per page frame. Nothing queues: if the page takes 60 ms for a frame, the
worker posts one state, waits, and the next state is simply newer. The samples from the waiting ticks go out with it
(`worker-core.js:310-312`).

**Accumulator:** keeps its remainder (`:363`). Neither the page's slowness nor a long draw affects it, because the worker's timer
runs on its own thread.

**Drawing faster than physics (60-120 Hz screens, or a light scene).**
The page draws 6-12 frames per physics state. The physics part of the picture changes in steps of about 10 a second. The width and
colour eases smooth those steps out, so the vessels don't visibly step **(guess, from the filter design: not checked on screen)**.
The blood moves every frame on its own clock. Nothing is invented between states, and nothing has to be.

**A long page frame (for example the 163 ms "radii changed" redraw).**
- Worker: keeps ticking. The handshake has no ack yet, so heartbeat states wait (up to 400 ms, then one goes anyway). After the long
  frame the page takes in one state, or at most a couple, and paints the newest. **No burst.**
- Page clocks: a gap over 100 ms is clamped to 0.1 s (`stage.js:2724`). The blood and the eases lose the rest: in a 163 ms frame,
  about 63 ms of blood motion goes missing. That shows as a small hitch on top of the frozen frame.
- Accumulator: unaffected.

**A late physics tick (worker paused by the OS, garbage collection, a timer clamped in Low Power mode (guess)).**
The gap is clamped to 0.1 s and the excess **dropped** (`:332`). The model runs slightly slow for that moment. It doesn't sprint to
catch up.

**Hidden tab or resting page:** the physics **stops** (no steps at all). The page draws nothing (`stage.js:2692`). On return,
neither side catches up. The model continues from where it stopped.

**Spiral of death:** not possible as written. The steps per tick are bounded by 0.1 s × speed, and a tick costs about 1 ms.

### Where the handshake is bypassed (verified)

The handshake gates the heartbeat and the morph ticks (`:351`, `:395`). It does **not** gate these, which post at once whatever
the page has taken in (`:398`):

1. **`paramsDirty`**
   - During a slide change, every 250 ms (`:347`). That is about 4 extra posts a second, each carrying the parameter object.
   - **Bedside time-lapse** (the meal-type slides): every tick (`bedsideStep`, `:423`). That is **about 30 posts a second, each
     with a cloned parameter object**. On the page, each one updates the store's `params` field, which wakes its 6 listeners
     (`card.js:813`, `inspector.js:354`, `:360`, `compare.js:105`, `stage-halos.js:82`, `main.js:2044`).
   - Disease-clock time-lapse: every tick that advances a day (`lapseDays`, `:412`), and on anticoagulation (`:378`, `:387`).
2. **New clinical events** (`:398`, rare).
3. **Any change message** (preset, action, run, probe, visibility…): an immediate post (`:657-663`). Slider moves are the exception:
   they *are* held for the handshake (`:659`).

The earlier review's point is correct but small for morphs: the ticks themselves respect the handshake. Only the 4-per-second
parameter posts and the landing bypass it. The **bedside time-lapse** is the larger bypass. I can't say from code alone whether it
costs much: that depends on what the 6 listeners do **(guess: moderate; `?perf` "store listeners" would show it)**.

## 4. Cost and sources of jank, from the physics side

| Source | Size | Effect |
|---|---|---|
| Worker tick | about 1 ms per 33 ms on its own core (Node) | none on the page |
| Message clone and transfer | about 8 KB, about 0.04 ms to clone | negligible |
| Taking a state in (`ingestFrame`) | not measured; params, events and samples into the dock | small. It runs for **every** state, painted or not. |
| `stage.update(f)` per painted state | not measured here (`?perf` "figure update") | about 10/s in steady state, more during morphs and lapses. Each one re-reads the frame and recomputes every width target. |
| Width targets move → widths ease every frame → "radii changed" | 163 ms whole redraw on the Mac (other thread) | **The likely real link between the physics and the stutter (guess, see below).** |
| Param posts that skip the handshake (bedside lapse) | about 30/s | store fan-out to 6 listeners. A store write also stops the cheap "widths only" path (`stage-tubes.js:606`, `storeVer`) and forces the full update. |
| Blood clock clamped on a >100 ms frame | up to 63 ms of motion lost per 163 ms frame | a small hitch layered on the long frame |

**How the physics triggers "radii changed" (partly a guess).** Each posted state carries new diameters `D`. While breathing and the
pulse run, Pf/Qf/D keep moving, so `movedSincePost` is almost always true. That makes the 10/s rate the normal running case, not
the exception: in the Node run it ran a full 10/s. If a vessel's new target is at least 0.1 canvas px from what is shown, an ease
starts. The two-stage ease takes several tenths of a second to land, longer than the 0.1 s gap to the next state. So while the
breath moves the widths, **some vessel is always easing**, and the vessel layer gets new radii on every drawn frame. Whether that
becomes a 163 ms whole redraw or a cheap partial one is the renderer's business (the other thread). The comment at
`stage-tubes.js:402-403` says this is deliberate: "no dead-band: the breath never stops and starts". **Not verified:** how often
the breath alone moves a width by 0.1 px or more. Pausing the model and watching the `?perf` "radii changed" count will settle it
in a minute.

## 5. Options (ranked: impact first, then effort)

| # | Option | What changes | Expected effect | Impact | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Measure in `?perf`** | Rename the probe's "worker" to "screen (worker rAF)". Add: physics ticks/s, states posted/s, states painted/s, handshake-bypass posts/s, "radii changed" redraws/s. | Ends the 50-60 Hz confusion and tells us whether options 3-4 are worth doing. No fps change by itself. | High (decides the rest) | Low | none |
| 2 | **Close the handshake bypasses** | `bedsideStep` and `lapseDays` set `paramsDirty` at most every 250 ms, as the morph already does (`:347`). A post caused only by params waits for the ack like the heartbeat does (with the 400 ms escape). | Bedside or disease lapse: about 30 → about 4-10 posts/s. Fewer store fan-outs, and the cheap width-only path works again between them. Smoother lapse slides on the Mac **(guess: noticeable only if "store listeners" shows up in `?perf`)**. | Med-High during lapses, none otherwise | Low | Controls tied to params lag up to 250 ms during a lapse. Tests for lapse params may need updating. |
| 3 | **Send diameters only when they really change** (worker side) | The worker sends `D` only when some vessel moved by more than a set fraction (for example 0.3%), plus a flag saying it changed. The page skips recomputing width targets when it didn't. Behind a Figure-performance switch so you can compare on the Mac. | If the breath is what keeps the widths easing, eases land between states and "radii changed" redraws drop from every frame to only after real changes. **(guess: the largest steady-state win from the physics side)** | High if the hypothesis holds | Low-Med | Breath sway of the veins becomes smaller or steppier. That goes against the "no dead-band" choice, so it's your call by eye. |
| 4 | **Lower the state rate when the page is slow** | The worker already knows the ack timing. When acks come more than 50 ms apart, the heartbeat gap stretches from 95 ms to about 200-250 ms (samples still go out whole). | Halves full figure updates and new width targets on a 15 fps Mac. Readouts update about 4-5/s instead of 10. | Med | Low | Numbers feel slightly less live. The monitor traces don't change, because samples are batched, not dropped. |
| 5 | **Do the slide-change blend on the page** | The worker sends from and to once. The page blends D/Pf/Qf every rAF, and the worker posts only at the start, every 250 ms for readouts, and at the landing. | The morph moves every drawn frame instead of at the 30 Hz tick rate, and there are about 30-60 fewer posts per slide change. Smoothness gain mostly on fast screens. | Med | Med | A linear D blend differs slightly from the model's blend, which may show a tiny jump at landing. Two blend paths to keep in sync. |
| 6 | Raise the blood clock's clamp from 0.1 s to 0.2 s | `stage.js:2724` dt clamp, blood only | On a 163 ms frame the blood keeps true speed (a bigger step, no slow-down). | Low | Low | Bigger visual jump after a stall. This is render code: coordinate with the GPU thread. |
| 7 | Speed up the physics (rAF in the worker, a 60 Hz tick, SharedArrayBuffer) | n/a | **None useful.** The physics is not the bottleneck, and more ticks mean more posts. SharedArrayBuffer would need cross-origin isolation headers. | none | Med-High | Adds work for nothing |
| 8 | Shrink the messages | Pack metrics and slow state into typed arrays | Saves about 2.6 KB of cloning, about 0.04 ms | negligible | Med | not worth it |

## 6. Recommendation and build order

**Do 1 → 2 → 3, in that order, and stop as soon as the Mac readout says the physics side no longer matters.**

1. **Instrument (`frame-hud.js`, `worker-core.js`).** The worker counts ticks, posts and bypass posts per second and sends them once a
   second with the heartbeat state. The HUD shows them next to "radii changed"/s and relabels the probe worker. Then run the same
   slide on your Mac with the model running and paused. If "radii changed"/s drops to near zero when paused, the physics is feeding
   the redraws, and step 3 is the fix. If it doesn't drop, the redraws come from elsewhere, and the GPU thread owns them.
2. **Close the handshake bypasses (`worker-core.js:378`, `:387`, `:412`, `:423`, `:398`).** Throttle `paramsDirty` in lapses to 250 ms
   (reuse `MORPH_PARAMS_MS`). Let a post caused only by params respect the ack with the existing 400 ms escape. Add a Node test: a
   bedside lapse over 1 s posts 10 or fewer frames when the page doesn't ack. Small, safe, and it fixes the one place where the
   physics floods the page.
3. **Diameter dead-band behind a switch (`worker-core.js:241-242`, `:262`; page reads the flag in `stage-tubes.js` update).** Add it
   only if step 1 shows the breath keeps "radii changed" firing. Ship it off by default and A/B it on the Mac for smoothness versus
   the look of the breathing veins.
4. Options 4-5 only if 1-3 leave physics-driven cost visible in `?perf`.

Nothing here moves rendering off the GPU or adds a CPU drawing path. Every change is in the worker's timing and messaging, the HUD,
or the page deciding when to recompute width targets.
