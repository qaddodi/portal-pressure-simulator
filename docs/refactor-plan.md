# Code health and refactor plan

3 Nov 2026, read at `fb60ce8`. This is a code-only review: no app code is changed here. It covers dead code, duplication, oversized
modules, ownership and inconsistent patterns. Each item ends in steps that can each be merged on their own, with the gate
(`npm run lint && npm test`, then `npm run gate`) green after every step. The order matters: early steps are mechanical and cut the
size of later ones.

**Ground rules for every step:** no behaviour change unless the step says so. The visual references (`tests/visual/`) and the
frame gate must not move. Nothing moves off the GPU. Move code first, change it second, never both in one commit.

## The codebase in numbers

| Measure | Value |
|---|---|
| UI modules (`src/ui/*.js`) | 314 files, about 96,500 lines |
| `stage.js` | 15,286 lines, nearly all inside one closure, `createStage` (lines 182–15286) |
| `presenter.js` | 6,328 lines (`createPresenter` from line 1078) |
| `lobule-zoom.js`, `veins-gl.js` | 4,909 and 4,207 lines |
| Comment lines in `src/ui` | about 17,300 (18%) |
| Source lines over 250 characters | 652 |
| `alloc-rare` annotations | 2,472 |
| Tests / scripts / docs | 657 test files, 57 scripts, 13 docs |

The engine (`src/engine`, about 3,000 lines) is small, pure and well tested. The weight, and the risk, is in the UI.

## H1. One 15,000-line closure (stage.js) (High, L)
Everything the figure does lives in `createStage`: camera and gestures, labels, organs, vessels, overlays, Doppler probe, catheter,
fluid, the lobule hand-off and resolution. They share hundreds of closure variables (`CTM`, `morph`, `lobuleOn`, `cath`, `vt`,
`camMove`…). A change anywhere can read or write any of them, so the label and camera bugs keep coming back from new directions.
The closure also makes it impossible to test a part on its own.

**Steps:**
1. Write a map: list the closure's top-level `let`/`const` state and which line ranges read and write each one (a script over the
   AST; commit its output as `docs/stage-map.md`).
2. Pull out pure helpers that read no closure state first. There are many: path builders such as `stage.js:461`, `583` and `1006-1010`,
   and colour maths at `167-180`. Move them into `src/ui/stage/*.js` modules with tests.
3. Pull out one subsystem at a time behind a small interface, passing it the state it needs as a `ctx` object. Start with those that
   touch the least: the delta halos (`~6180-6270`), the Doppler probe (`~8540-8850`), the catheter labels (`~9680`, `14400`), the fluid
   (`~7540-7590`). Then the camera and ride (`~2600-2830`, `3024-3090`, `3486-3500`).
4. Last, the label layout (`updateLabels`, `~10500-11600`), owned by thread C. Do it in step with that thread, not around it.
5. Target: `createStage` becomes a composition of about 15 modules of under 1,500 lines each. Each step is one PR that only moves code.

## H2. presenter.js is a second monolith (High, L)
`presenter.js` (6.3k lines) mixes deck loading, slide transactions (`slide-txn.js` is already split out), card building, fitting,
folding, the summary tables, keyboard input and the cover. It has 25 `setTimeout`s with their own guards (for example 1964, 2926, 5369, 5874-5931).

**Steps:** split along the lines that already exist: deck I/O (`~1040-1060`), card fitting (`fitEquations`, `fitHeadRow`, ~3640-3780),
folding (`~5870-5935`), keys (`~5680`) and the cover (`~6010-6060`). Then register every timer with the slide transaction
(`t.onRelease`), so a superseded slide can never fire one. That is a behaviour change: make it a separate step with its own test.
Coordinate with thread A.

## H3. Five ways to defer a DOM write (High, M)
- `class-soon.js` (`classSoon`, `textSoon`, `attrSoon`, …): a task straight after.
- `rest-pass.js` (`restPass`, `restClass`): between frames, sliced by budget.
- `class-batch.js`: an older copy of the same idea, **imported by nothing** (dead).
- `store.setSoon`: listeners after the frame, through `runSoon`.
- Plain `setTimeout(…, 0)`, still used in places (`doppler.js:1060`, `label-gl.js:931`, `gl-words`).

Two writes asked in the same frame by different helpers land in different tasks. That is the root of the one-frame double captions (C1)
and of the stepped theme change (TH1).

**Steps:**
1. Delete `class-batch.js`, which nothing references.
2. Write one module, `defer.js`, with explicit phases: `afterFrame(fn)` (the current `runSoon`) and `atRest(fn)` (the current
   `restPass`). Make `classSoon` and `restClass` thin names over it.
3. Add `together(fn)`: one call whose writes all land in the same task, for the cases that must swap atomically (C1, the canvas shown
   and the page text hidden).
4. Move the `setTimeout(…, 0)` sites onto it one by one.

## H4. Fourteen theme observers, twenty colour-scheme queries (Medium, M)
`MutationObserver`s on `data-theme` and `data-palette` in 14 places (`gl-words`, `plate-gl`, `widget-gl`, `label-gl`, `glass-gl`,
`svg-gl`, `util`, `stage` ×3, `fibroscan`, `col-wave`, `lobule-zoom` …). `matchMedia('(prefers-color-scheme: dark)')` is called 20
times and `(prefers-reduced-motion: reduce)` 41 times, some inside functions (`stage.js:6018`, `6291`, `8072`; `dock.js:825`).

**Steps:** add a `look.js` module: one observer, one dark query and one reduced-motion query, `onLook(fn)` with a frame-aligned epoch
(this also fixes TH1), and `reduced()` read from a kept query. Then replace the sites file by file. Lint rule: no `matchMedia(` with
these two queries outside `look.js`.

## H5. Duplicated small helpers (Low, S)
- `clamp` is defined in 12 files (one exported from `engine/physiology.js`, one from `ui/util.js`).
- `easeInOut`, `easeOut`, `smoothstep`, `lerp` and `mix` have 24 local definitions, while `ease.js` and `pill-motion.js` export some.
- `wait`, `painted` and `nextFrame = frameFor(…)` wrappers are made per file.
- Two `UNSAFE` sets for prototype keys: `share-link.js:5` and `scenario.js:159`.

**Steps:** a `math.js` (`clamp`, `lerp`, `mix`, `smoothstep`) and the eases in `ease.js`; replace the locals in one mechanical commit per
helper. Share the one `UNSAFE` set from `scenario.js` (no imports, so the worker can load it).

## H6. Dead exports and dead API (Low, S)
A scan for exports that no other file imports (source, tests and scripts, by name) lists about 35. Some are kept for the console
(`pps.*`) or for `?perf`, so check each before deleting. Clear candidates:
- `layout-snap.js:59-85` (`keep`, `forget`, `place`, `boxOf`): a whole kept-box API with no importer.
- `class-batch.js` (whole file), `svg-gl.js:178` `FIRST_LOOK` (its own comment: "switch deleted; kept for tool-profile.js", and
  tool-profile does not import it), `svg-gl.js` `sharedLooks`.
- `num-words.js` (`txIndex`, `txWords`, `sxIndex`, `SX_WHOLE`, `sxWords`, `opWords`), `pill-motion.js` (`EASE_IO3`, `glideShift`).
- `util.js` `repositionPopover`, `implicitWordsLive`; `widget-gl.js` `widgetsLive`; `res-fade.js` `fadingOnGpu`; `refine.js`
  `MAX_DEBT_FRAMES`; `fibroscan-gl.js` `prepareElastogramGL`; `diaphragm.js` `diaphragmPathD`; `tool-profile.js` `smoothD`.
- `frame.js` debug exports (`framesTimed`, `recentGaps`, `perfMode`, `wouldYield`, `mayWaiting`, `fpsLogOn`), `debug.js`
  (`debugOptions`, `debugOn`, `setDebug`): keep only if `?perf` or the console uses them by another route.

**Steps:** add `knip` (or a small script like the one used here) to `npm run lint` as a warning. Delete in small batches, each batch
behind a green gate.

## H7. Comments that have become a changelog (Medium, M)
About 18% of `src/ui` is comments, many of them dated history ("2 Nov 2026: …", "Mohammad, 21 Oct: …", "review pass 2, priority 1",
"R03"), often in one line of 300–900 characters beside the code. The history is valuable, but inline it hides the code. It also
goes stale (the inventory's and this audit's own line numbers drifted within a day), and every change has to edit around it.

**Steps:**
1. Move dated rationale into the commit history or `docs/decisions/<area>.md`, leaving one line that says *what* and *why now*.
2. Wrap source at a column limit (Prettier `printWidth: 140`, or ESLint `max-len` as a warning, comments included). Do it file by file
   with the move-only rule, since it touches every line.
3. Shorten the `alloc-rare` tag (2,472 of them): it is the scanner's allowance marker. Keep the tag and drop the prose after it, or let
   the scanner read a per-function list instead of per-line notes.

## H8. Unclear ownership of shared surfaces (Medium, S)
Thread ownership lives in `scripts/off-gpu-owners.json` and in a ledger outside the repo. Several files are edited by more than one
thread in a day (`stage.js`, `app.css`, `util.js`, `main.js`), and the shared `/preview/` and the merges show it.

**Steps:** add `CODEOWNERS`-style lines (even without GitHub teams, as documentation) mapping `src/ui/*` files to an owning thread or area,
generated from `off-gpu-owners.json`, and have the gate print which owners a diff touches.

## H9. `app.css`: one 7,600-line stylesheet (Medium, M)
All app styles live in `styles/app.css`, with 97 `z-index` rules (most on tokens, good) and long selectors such as
`.pz.pz-wide.pz-wide .pz-data.pz-sheet::before` that use doubled classes to win specificity.

**Steps:** split by surface into `styles/*.css` (figure, labels, cards, presenter, dock, menus, toasts), bundled by the build so nothing
changes at runtime. Then replace doubled-class specificity with `@layer` (base, components, presenter, state).

## H10. Inconsistent error handling (Medium, S)
`caught(where, e)` is called 104 times, with a hand-numbered location (`'main:1120'`, `'main:618'`) that no longer matches the line.
There are 20 empty `catch {}` or `.catch(() => {})` sites, and some async paths have no catch at all (B4).

**Steps:** make `caught` take a stable tag (`'main:sendFeedback'`), not a line. Lint for empty catches without a comment. Add an
`unhandledrejection` listener that reports through `caught` and the `?perf` panel, so B4-type misses show up.

## H11. The engine boundary is untyped (Medium, M)
`host.send` / `host.request` carry about 25 message types, built as object literals in `main.js`, `presenter-tools.js`, `timeline.js`
and others, and switched on in `worker-core.js`. A renamed field fails silently.

**Steps:** a `src/protocol.js` with one builder per message (`msg.probe(id)`, `msg.run({ speed })`) and JSDoc types, plus a
test that every `case` in the worker has a builder and the other way round. Then add the queue from B3 there.

## H12. Many schedulers (Medium, M)
`frame.js` (`frameFor`, `mayTask`, phases), `rest-pass.js`, `class-soon.js` (`runSoon`), `late-queue.js`, `idle-rest.js`,
`prep-budget.js`, `quiet.js`, `afterMotion`, `prepIdle`, and plain timers. Each was added for a real need, but the order between them
is spread across comments, not one place.

**Steps:** write `docs/scheduling.md` with one diagram of a frame and the tasks between frames, which helper runs where, and its
budget. Make each helper's header point to it. Then fold the ones that differ only by name (H3).

## H13. Long parameter lists to factories (Low, S)
`createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange })` and
`createPresenter({ openSettings, loadPreset, host, stage, projectorOn, projectorOff, closeHome, stashCards, rerenderHome })` take
callbacks into `main.js`, which is itself 2,500 lines and wires everything.

**Steps:** after H1 and H2, pass a small `app` service object (store, host, toast, look, scheduler) instead of loose callbacks, and
move `main.js`'s wiring into `app.js` (create) and `main.js` (boot only).

## H14. Tests that cannot reach the closures (Medium, M)
Most of the 657 tests run either pure modules or the whole page in a browser. Nothing in between can test, for example, the camera
ride or the label hand-off without a browser, because they sit inside `createStage`.

**Steps:** each H1 extraction lands with unit tests for the extracted module. Track the share of `stage.js` lines covered by unit tests
(c8 on the extracted modules) as the measure of H1's progress.

## Suggested order
1. H6 (dead code), H5 (helpers), H3 step 1 (delete class-batch): small and safe, and they shrink what follows.
2. H10 and H11: error handling and the protocol. They also fix B3–B5 from the audit.
3. H4 then H3: one look module, one defer module. They fix TH1 and C1 at the root.
4. H7 and H9: comments and CSS, mechanical, file by file.
5. H1 and H2, with H14 alongside: the big splits, one subsystem per PR, coordinated with threads A and C.
6. H12 and H13 once the shapes have settled.
