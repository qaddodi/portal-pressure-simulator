# Scheduling: who owns a timer

A timer that outlives the thing that started it is how a stale callback acts on the next view, talk or gesture. The rule: every timer
belongs to a scope, and the scope ends the timer.

`src/ui/scope.js` `createScope()` gives `timer(fn, ms)`, `interval(fn, ms)`, `clear(id)`, `clearInterval(id)`, `onDispose(fn)`,
`live()`, `pending()` and `dispose()`. A callback runs only while the scope is live; `dispose()` clears everything waiting and runs the
`onDispose` functions newest first; calls after it do nothing.

Who owns which scope:
- the presenter: one per talk (`sess` in `presenter.js`, replaced on each talk);
- the stage (to convert): one per view, disposed on a view switch, and one per gesture (pan, pinch, card throw), disposed at its end.

`scripts/timer-budget.json` (checked by `rules-lint`) stops the three files from gaining bare timers: it only goes down.

Converting `stage.js` is a mechanical pass, one subsystem at a time (82 bare `setTimeout`/`setInterval` sites at e5176cf; `lobule-zoom.js`
26, `main.js` 21). Convert a site only with its subsystem's behaviour test, and never change a delay while converting. The older helpers
(`class-soon`, `rest-pass`, `store.setSoon`, `late-queue`, `idle-rest`, `prep-budget`, `quiet`) stay for now; a new timer uses a scope.
