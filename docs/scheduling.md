# Scheduling: who owns a timer

**Status (11 Nov 2026):** the scope exists and the stage is converted. The rest of this page is the rule and the current owners. Cited by
`scripts/rules-lint.mjs` (the timer budget) and `scripts/timer-budget.json`.

A timer that outlives the thing that started it is how a stale callback acts on the next view, talk or gesture. The rule: every timer
belongs to a scope, and the scope ends the timer.

`src/ui/scope.js` `createScope()` gives `timer(fn, ms)`, `interval(fn, ms)`, `clear(id)`, `clearInterval(id)`, `onDispose(fn)`,
`live()`, `pending()` and `dispose()`. A callback runs only while the scope is live; `dispose()` clears everything waiting and runs the
`onDispose` functions newest first; calls after it do nothing.

Who owns which scope today:
- the presenter: one per talk (`sess` in `presenter.js`, replaced on each talk, `createScope` is also re-exported from `slide-txn.js`);
- the stage: one scope for the whole stage and its parts (`stageScope` in `src/ui/stage-scope.js`). It lives as long as the figure does;
  a scope per view and per gesture (disposed on a view switch, or at the end of a pan, pinch or card throw) is not built yet;
- the page: `appScope` in `main.js`, which is never disposed.

`scripts/timer-budget.json` (checked by `rules-lint`) stops three places from gaining bare `setTimeout` / `setInterval` calls: the stage
files (`src/ui/stage*`, budget 3), `lobule-zoom.js` (budget 26) and `main.js` (budget 22). The budgets only go down. On 11 Nov 2026
`lobule-zoom.js` and `main.js` hold fewer calls than their budgets (22 and 21 by a plain count), so `node scripts/rules-lint.mjs --tighten`
would lower them.

Converting a file is a mechanical pass, one subsystem at a time. Convert a site only with its subsystem's behaviour test, and never change
a delay while converting. A new timer uses a scope.

## The other helpers that defer work

Each was added for a real need. A new timer uses a scope; a new deferred write picks the helper whose job it is.

| Helper | Job |
|---|---|
| `frame.js` (`frameFor(tag)`, `mayTask`, `afterMotion`) | the one render scheduler: every per-frame callback runs in one browser frame, in the order asked; `mayTask` work may wait a few frames under a budget. Nothing else calls `requestAnimationFrame` (`tests/no-raw-raf.test.js`) |
| `class-soon.js` (`classSoon`, `textSoon`, `attrSoon`, `runSoon`) | class, text and attribute writes made in a task straight after the frame, never inside it; `store.setSoon` listeners run through `runSoon` |
| `rest-pass.js` (`restPass`, `restClass`) | layout measured where nothing moves, as a task between two frames, sliced by the budget |
| `prep-budget.js` | one ledger for all preparation done between frames (rest passes, slide preparation, observers), per frame interval |
| `late-queue.js` | the figure's deferred structure writes, applied in a rest pass in the order asked |
| `idle-rest.js` | after 30 s with no input (never in a talk) the app rests; the first input wakes it |
| `quiet.js` (`leftAlone`, `whenQuiet`) | when the person last had a hand on the page, for work that must stay out of a gesture's way |
| `theme-epoch.js` (`onTheme`, `themeSettled`) | one frame in which every surface redraws after a look, palette or device dark-mode change |

The order between these is described in the header of each file; there is no single diagram of a frame yet.
