# One report format (bible review 19 Nov 2026, DBG-3)

Every debug tool ends its text with one JSON block, `-----BEGIN REPORT JSON-----` ... `-----END REPORT JSON-----`, a **Run report**.
The tool keeps its own text above it (its own readers know what to put first); the block is what a program reads.

- **Finding** (`src/ui/report/finding.js`): `{ rule, sev: 'fail'|'warn'|'note', what, where, why?, owner?, at?, scope? }`. `scope` is `{ specimen | slide | step, deck, device, look }`.
  Severity has one scale: the Phone check's `bad` is `fail`. Adapters: `fromRegistry`, `fromProblem` (card judges), `fromWalkFlag`, `fromGroup`, `fromGlitch`, `fromFrameStep`, `fromDeckLine`; `normalize` tells them apart.
- **Run report** (`src/ui/report/run.js`): `{ kind: 'pps-run-report', v, tool, build, device, scope, started, ms, findings, total, health, notes, missing, sum }`.
  `sum` is a check sum, so a paste a chat changed is refused. Over 400 findings the worst are kept and `missing` says so.
- **Emitters** (`src/ui/report/emit.js`): `checkRun` (Check button), `sweepRun` (gallery Sweep), `walkRun` (Phone check), `deckRun` (deck sweep). A new runner adds one adapter and a line in the contract test (`tests/run-report.test.js`).
- **Reading**: `node scripts/report.mjs show <paste|->` prints it; `node scripts/report.mjs compare <before> <after>` says fixed, partly, not-fixed, regressed or unchanged between any two pastes, even from different tools (findings match by rule and words).
  It also reads a bug packet and a replay result. `scripts/packet.mjs` keeps its own state, screen and replay verbs.
- **Not yet in a block**: `?perf` Copy, `?lap`, `?watch` Copy and the camera bench are measurements, not findings lists; they stay text for now.
