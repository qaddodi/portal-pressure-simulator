# The engine lives in hales-engine

The physics engine has its own repository, [qaddodi/hales-engine](https://github.com/qaddodi/hales-engine) (private). It is laid out as a `core/` (what every organ module shares: the solver, the tube law, the heart, the gap rule) and a `portal/` module (this app's circulation). More modules (pulmonary, intracranial) will sit beside `portal/`.

`src/engine/` in this repository is a **vendored copy** of that repository's `src/`: the same files, pinned to one commit, committed here.

```
src/engine/core/*.js        linalg, physiology, gap
src/engine/portal/*.js      topology, scenario, engine, metrics, events, explain, fingerprint, wall-read and the four cut-off tables
src/engine/VENDORED.json    the repository, the ref synced, the commit, and a sha256 for every file
```

## Changing the engine

1. Make the change in hales-engine (`npm test` there is the golden-output check; `--update` only when a number is meant to move).
2. Tag it (`v0.2.0`) and push.
3. Here: `node scripts/sync-engine.mjs --ref v0.2.0` (needs read access to the private repository: your own git credentials). Commit the result with the app change that goes with it.

`npm run check:engine` (and `tests/engine-vendored.test.js`, which Quick runs on every push) fails when a file in `src/engine/` differs from the manifest, so a hand edit of the copy is caught at once. Do not edit `src/engine/` here; the next sync would erase the edit.

## Why a copy and not a git dependency

- **The build must not need a secret.** hales-engine is private. A git dependency (`npm i github:qaddodi/hales-engine#tag`) or a submodule would make `pages.yml`, `quick.yml` and `ci.yml` clone a private repository, which needs a token or deploy key stored as a repository secret on every workflow. A committed copy needs none: a fresh checkout builds and runs as is.
- **The app runs unbundled.** `npm start` serves the repository root as plain ES modules (no bundler, no `node_modules` in the browser), so an import must be a path in the repository. A package in `node_modules` would only work after a build.
- **Nothing else in the app changes.** The worker, the 300-odd importers, the tests that read engine files, the deck-state cache key (`hashFiles('src/engine/**')`) and the off-GPU scan all see ordinary files at fixed paths.
- **It is still pinned and checked.** One commit, a hash per file, a test that fails on drift, and a script that moves the pin deliberately. The cost is a second step (sync and commit) when the engine changes, which is also the moment a human reads the diff.

If hales-engine is ever made public, or the 3D app and this one need to share it without a copy, switch to a git dependency pinned to a tag then; the import paths (`engine/core/…`, `engine/portal/…`) already match the package's `exports`.

## Not moved (yet)

`src/worker-core.js` and `src/worker.js` (the message protocol between the UI and the engine) stay in the app: they know the app's presets of messages, decks and slides. `Engine` still mixes core stepping with portal physiology, and `iapFromAscites` (portal) still lives in `core/physiology.js`; hales-engine's README lists them as the first things to split when a second module needs the machinery.
