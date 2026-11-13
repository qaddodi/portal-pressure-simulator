# Code health and refactor plan

**Status (11 Nov 2026): partly done.** A code-only review of 3 Nov 2026 (read at `fb60ce8`): dead code, duplication, oversized modules,
ownership, inconsistent patterns. The H numbers are cited from other docs, so they are kept. The first column of the table says what
happened to each; the sections below keep only what is still open. The rule for every step still holds: no behaviour change unless the step
says so; move code first, change it second, never both in one commit; `npm run lint && npm test` green after every step; nothing moves
off the GPU.

## The codebase now (11 Nov 2026)

| Measure | 3 Nov | 11 Nov |
|---|---|---|
| UI modules (`src/ui/*.js`) | 314 files, about 96,500 lines | 456 files, about 120,000 lines |
| `stage.js` | 15,286 lines in one closure | 3,368 lines, plus 47 `stage-*.js` modules |
| `presenter.js` | 6,328 | 6,623 (with `presenter-tools.js`, `presenter-view*.js`, `presenter-visuals.js` beside it) |
| `lobule-zoom.js`, `veins-gl.js` | 4,909 and 4,207 | 5,378 and 5,461 |
| `main.js` | about 2,500 | 2,457 |
| `styles/app.css` | one 7,600-line file | 7,608 lines, with `tokens.css`, `icons.css`, `path.css`, `scope-card.css` split out |
| `alloc-rare` annotations | 2,472 | 2,732 |
| Tests (`tests/*.test.js`) | 657 files | 837 files |

The engine (`src/engine`) is small, pure and well tested. The weight, and the risk, is in the UI.

## Status per item

| Item | State | What is there |
|---|---|---|
| H1 stage.js closure | Done | `createStage` split into the `stage-*.js` modules; `docs/stage-map.md` (from `scripts/stage-map.mjs`) maps what is left; `scripts/stage-split/` holds the move and check tooling used for the split |
| H2 presenter.js | Open | `presenter-*.js` modules exist, but `presenter.js` is still 6.6k lines with 22 bare timers. Registering every timer with the slide transaction (a behaviour change) is not done |
| H3 five ways to defer a DOM write | Part | `class-batch.js` is deleted. No `defer.js` exists; `class-soon.js`, `rest-pass.js`, `store.setSoon` and plain zero-delay timers remain. Scheduler roles: `docs/scheduling.md` |
| H4 theme observers | Part | `look.js` holds the one `prefers-color-scheme: dark` list (`darkMQ`) and `rules-lint.mjs` keeps new code from making its own; `theme-epoch.js` `onTheme` runs every surface's colour work in one frame (fixed TH1). A shared reduced-motion list is `reduceMotionMQ` in `motion.js`. The 14 observers are not all converted: not verified |
| H5 duplicated helpers | Open | no `math.js`; `clamp` and the ease helpers are still defined in many files |
| H6 dead exports | Part | `class-batch.js` and the `layout-snap.js` kept-box API are gone, and `num-words.js` is trimmed. No `knip` or equivalent runs in lint. The remaining candidates were not re-scanned |
| H7 comments that read as a changelog | Open | the dated comments are still in the source; no line-length rule |
| H8 ownership of shared surfaces | Open | no `CODEOWNERS`; `scripts/off-gpu-owners.json` is the only map |
| H9 `app.css` | Part | split into five files, but `app.css` is still 7.6k lines and the doubled-class specificity is not replaced by `@layer` (not verified) |
| H10 error handling | Part | an `unhandledrejection` listener reports through `caught` (`report.js`). Some `caught()` tags are still hand-numbered with a line (13 `main:<number>` style tags); empty-catch lint not verified |
| H11 untyped engine boundary | Open | no `src/protocol.js`; messages are still object literals through `host.send` / `host.request`. The queue for sends during a restart is done (`host.js`, B3) |
| H12 many schedulers | Done as a document | `docs/scheduling.md` (scopes) and the header of each helper; the helpers were not folded |
| H13 long factory parameter lists | Open | no `app.js`; `createStage` and `createPresenter` still take loose callbacks |
| H14 tests that cannot reach the closures | Part | the stage split gave the extracted modules their own unit tests; the share of `stage.js` covered was not tracked |

## What is still worth doing, in the original order of value

1. **H5, H6 (dead code, helpers).** Small and safe. A `math.js` (`clamp`, `lerp`, `mix`, `smoothstep`) with the eases in `ease.js`, one
   mechanical commit per helper; share the single `UNSAFE` prototype-key set from `scenario.js` (no imports, so the worker can load it).
   Add `knip` or a small script to `npm run lint` as a warning and delete in small batches. Keep exports used by the console (`pps.*`) and
   `?perf`.
2. **H11 (protocol).** A `src/protocol.js` with one builder per message (`msg.probe(id)`, `msg.run({ speed })`) and JSDoc types, plus a
   test that every `case` in `worker-core.js` has a builder and the other way round.
3. **H10 (error tags).** `caught(where, e)` takes a stable tag (`'main:sendFeedback'`), never a line. Lint for an empty `catch` with no comment.
4. **H3 (one defer module).** `defer.js` with `afterFrame(fn)` (today's `runSoon`), `atRest(fn)` (today's `restPass`) and `together(fn)`
   (writes that must land in the same task); move the zero-delay timers onto it one by one. This is what fixes a one-frame double caption at
   the root.
5. **H7 (comments).** Move dated rationale into the commit history or `docs/decisions/<area>.md` and leave one line saying what and why now;
   a column limit (`max-len` warning or Prettier `printWidth: 140`), file by file with the move-only rule; shorten the `alloc-rare` tag
   (keep the tag, drop the prose after it).
6. **H2, H13 (presenter, factories).** Split `presenter.js` along its existing lines (deck I/O, card fitting, folding, keys, the cover),
   then register timers with the slide transaction as a separate behaviour-changing step with its own test. After that, pass a small `app`
   service object (store, host, toast, look, scheduler) instead of loose callbacks and move `main.js`'s wiring into `app.js`.
7. **H8, H9 (ownership, CSS).** `CODEOWNERS`-style lines generated from `off-gpu-owners.json`; split `app.css` by surface and replace
   doubled-class specificity with `@layer` (base, components, presenter, state).
