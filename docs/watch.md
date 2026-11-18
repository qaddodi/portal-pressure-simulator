# ?watch: the motion recorder and its red dot

Step 2c of `/mnt/project-files/card-gallery-plan/screen-report-recs.md`. Preview copy (or a local run) only; off without `?watch`.

Open `/preview/?watch`. Use the app. When a motion rule fails, a small red dot with a count appears at the bottom left. Tap it for the findings
(rule, what and where, why, the file that owns it). **Copy** puts the findings and the last 10 seconds of history on the clipboard.

## What it records

Once a frame the scheduler ran (`onFrameEnd`; the recorder asks for no frame, so a resting page stays at rest), it copies numbers the app already keeps:

| Part | Source | Cost |
|---|---|---|
| camera (zoom, x, y) | `stage.cameraState()` | in script |
| labels (key, place, alpha, the thing each names) | `stage.labelDrawnBy()`, `stage.labelNodeOf(id)` | in script, the kept stage box |
| cards (name, box, alpha) | the glass's `drawn()` (what it drew last frame) | in script |
| slide camera runs, frame by frame | `stage.cameraTraces()` | read when a run has closed |
| a number that changed (its width before and after) | a MutationObserver, boxes read in a **rest pass** | at rest, never in a frame |
| a view change, a hand on the screen | `pps:view`, pointer / wheel / touch events | event |

No layout read happens in a frame. The rules run about once a second in a rest pass. A DOM write happens only when a finding is new.
Twenty seconds are kept.

## The rules (`src/ui/watch/motion-rules.js`, registered as `series` rules in `src/ui/selfcheck/rules-motion.js`)

| Rule | Fires when | Ported from |
|---|---|---|
| `flash` | a card or label is shown, gone and back within 250 ms | glitch-sweep `flash` |
| `stuck-mid` | at the end, a card or label sits at one alpha part way for 1.5 s (a dim label at `DIM_ALPHA` is at rest) | glitch-sweep `stuck-mid` |
| `label-slide` | a shown label moves 12 px or more against its anchor over 60 ms or more, or jumps 48 px in one frame (labels fade between spots) | new (18 Nov rule) |
| `label-detached` | a label stands still while its anchor travels with the camera, or sits far from it | glitch-sweep `label-detached` |
| `label-dim-alpha` | a label rests at an alpha that is not `DIM_ALPHA` (0.65) | new |
| `number-width-jump` | a number changed to one of the same length and its width moved 1 px or more while its card held its width | glitch-sweep `width-jump` |
| `camera-straight` | after a view change the camera's one move turns back, leaves its line, overshoots, or stops part way (no waypoint at the fit) | `slide-cam.js` `judgeSlideMove` (clock check off), plus a stop check |
| `camera-slide` | a slide's recorded camera run fails `judgeSlideMove` as `pps.cameraGate` judges it | `slide-cam.js` |

Each rule has a case that must not fire (`tests/watch-motion-rules.test.js`). Moves with the hand on the screen, moves another change took over and moves
with no view units known are not judged.

## For agents

- `pps.watch.history({ seconds: 10 })`: plain JSON `{ v, seconds, step, startedAt, vb, env, samples, events, traces }` (`history.js`). A sample part equal to the one before is left
  out; `decodeHistory` puts it back. Capped at 60 KB: over that, samples are thinned (`step`).
- `pps.watch.findings()`: `{ rule, what, where, why, owner, at, t0, t1 }`, each once (and again after 4 s).
- Replay with no browser: `import { replayHistory } from './src/ui/watch/replay.js'; replayHistory(history)`.
- A rule of your own: `registerRule({ id, owner, why, kind: 'series', check(frames) })` in `src/ui/selfcheck/`; a series rule gets the frames (oldest first) with
  `.events`, `.traces`, `.vb`, `.env` attached (`historyOf` in `rules-motion.js`).

## What could still be wrong

- Written and unit-tested in Node only (no browser, by the owner's rule). The sources (`labelDrawnBy`, the glass region's `drawn()`) are read as the code documents them, not seen live.
- The view-change camera judge sees the stage camera; the lobule's own camera is not in it.
- Cards are named by their first `pz-` class; two of one class are numbered.
- A card or label that legitimately rests part way (not the dim label) would be named `stuck-mid`.
