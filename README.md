# Portal Pressure Simulator

Created by **Mohammad Almeqdadi, MD**. More teaching tools: [qaddodi.github.io](https://qaddodi.github.io/#tools).

A living, physics-based model of the portal circulation for medical education. Raise a
resistance anywhere from the gut to the heart and watch blood find another way: collaterals
open, varices swell and rupture, the portal vein reverses, ascites accumulates. None of it is
scripted: every number and every pixel comes from one lumped-parameter hemodynamic model.

> **Educational simulation.** The model is simplified and its values are illustrative. Don't use
> it for diagnosis or treatment decisions.

Version 2.1.0 · content version 2.0. See [CHANGELOG.md](CHANGELOG.md).

## Run it

No build step: plain ES modules and static files. Any static server works.

```bash
npm start            # http://localhost:8080
# or: python3 -m http.server 8080
```

It must be served over HTTP (ES modules and the Web Worker don't load from `file://`). Once
loaded it works offline and can be installed as an app (PWA).

After editing any file under `src/` or `styles/`, run `npm run stamp`: it updates the
`?v=<hash>` on every local import and link so a browser never mixes fresh and stale files.
`npm test` fails if a stamp is out of date.

### Production build (optional)

The repository root is the site, build-free. For hosts that can serve a build output,
`npm run build` writes an optimized copy to `dist/`: bundled and minified modules with
content-hashed names, rarely used surfaces split into chunks loaded on first use, one CSS file,
and a service worker that precaches everything for offline use. `npm run preview` serves it on
port 8081.

## Test it

```bash
npm ci               # dev tools only: esbuild, ESLint, Playwright (lint needs them)
npm test             # unit and physiological acceptance tests, plus the stamp check (Node ≥ 20)
npm run lint         # ESLint
npm run smoke        # the app in a real browser (desktop and phone): loads, runs, every surface opens
npm run smoke:quick  # a fast browser check (DECKS=<id> limits it to one deck)
npm run visual       # compare the look against the tests/visual/ references (--update redraws them)
npm run perf         # frame rate and main-thread stalls on a desktop, a laptop and a phone profile
npm run check        # lint, unit tests, the build, and the smoke test on the root site and on the build
```

The browser checks need a Chromium for Playwright (`npx playwright install chromium`).

GitHub workflows run them:

| Workflow | When | What |
|----------|------|------|
| `pages.yml` | pushes to `main` and the preview branch | lint and unit tests, then publishes the live site at `/` and the preview branch at `/preview/` (with an orange PREVIEW badge) |
| `checks.yml` | the same pushes | browser checks on desktop and phone, the visual comparison (a drift is a warning) and the iPhone WebKit check |
| `ci.yml` | pull requests and `main` | everything: lint, tests, build, browser checks split over parallel runners, the performance report, gesture and idle checks, and the visual comparison (a drift blocks the merge) |
| `visual-refs.yml` | run by hand on a branch | redraws only the drifted visual references on CI's machines and commits them |

`deck-sweep.yml` plays every deck at several screen sizes when run from the Actions tab or a
commit message contains `[deck-sweep]`. The preview workflow and the merge rules are in
[AGENTS.md](AGENTS.md).

The acceptance tests are the model's validation targets (healthy ranges, HVPG in presinusoidal
disease and heart failure, splenic-vein reversal, hepatofugal flow, TIPS outcomes, the rupture
threshold, BRTO, β-blockers, Budd–Chiari, paracentesis, blood loss by ATLS class, volume
conservation, determinism, stability). They are listed in the app under *Menu › Help › About the model*.

## Using it

The **menu** (top left, named after the current patient) has two tabs: *Present* (the 24
presentation decks, by topic, and your own scripts and imported decks) and *Patients* (16 patients
from healthy to constrictive pericarditis, grouped by where the resistance sits: prehepatic,
presinusoidal, sinusoidal, postsinusoidal, posthepatic and cardiac).

- **Act on the anatomy.** Click any vessel or organ: a card opens beside it with what you can do
  there (narrow or clot a vein, make the liver cirrhotic, band varices, inject dye, start a shunt,
  zoom into the lobule). Keys 1–9 run the card's actions.
- **Four views.** *Anatomy*, a transit-map *Circuit* (A switches between them, and the circuit can
  be turned upright), the *Lobule* (a honeycomb of lobules drawn from the model: sinusoids, stellate
  cells, collagen, congestion) and the *Sinusoid* (one sinusoid's wall up close, and the lymph it
  makes). Anatomy and Circuit morph into each other; zooming alone never leaves the anatomy.
- **The figure fills the screen.** Everything else floats over it: the top bar (menu · views ·
  Blood and the color legend · Treat, Tests, History · Settings, Search), the play bar at the
  bottom, the zoom group (+, −, Fit), and cards that open on demand. Fit frames the anatomy in the
  space they leave.
- **One timeline.** Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease
  ahead. HVPG and PPG sit on the play bar. *History* lists every change and event with a way back to
  each, and *Compare* (P) freezes a moment to compare the live model with it.
- **Colors.** The color menu colors the vessels by pressure, change, congestion, pressure drop,
  flow volume, velocity (against each vessel's own normal), flow direction or blood origin
  (L cycles). The Blood menu switches the moving blood and what the figure shows (pressure values,
  potential collaterals, organ names).
- **Treat (T).** One card with the drugs, fluids and blood, and procedures; the changes you made
  sit in a *Changes* row at its foot.
- **Tests (I).** Pressure (along the circuit or over time), HVPG, Doppler, endoscopy (scope view
  and varix wall mechanics), ascites and paracentesis, FibroScan, and *Readouts* with every other
  number and a causal **Why?** for each. Swipe or tap between them.
- **Phones and upright tablets.** The view switch and the actions move to the bottom bar. Cards rise from
  behind it; pull down once to halve a card and again to close it.
- **Settings.** Appearance (light, dark, soft or the device's), text size on the figure, *Blur effect* (frosted
  glass; off gives solid cards, lighter on a hot device), *Battery saver* (off by default: 15 frames
  a second at lower resolution), *Advanced physiology*, and *Reset everything*.
- **Search (Ctrl/⌘ K).** Everything, by name. **?** lists every keyboard shortcut.

The figure always draws at full resolution and moves at the display's own rate (60, 120 Hz or
more); only Battery saver lowers either. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

### Teaching

- **Presenter:** decks of model states, each slide with a teaching card (the words) and a data card
  (numbers, tiles, a chart or a live instrument), stepped with arrow keys, a swipe or a clicker;
  cases open with a short clinical vignette and each deck ends with quick-check questions. Build
  scripts from the live model and share them as a link or a file, or import a deck file
  (Menu › Present › Your scripts › *Import*). *Print notes* prints each deck's speaker notes and questions, one row per slide.
- **Guidelines:** clinical content follows Baveno VIII and, where US practice differs, AASLD 2024.
- **Writing decks:** [docs/deck-authoring-guide.md](docs/deck-authoring-guide.md) (format and
  layout rules) and [docs/ai-humanizer.md](docs/ai-humanizer.md) (how slide wording should read).

## For institutions

- **LMS.** `npm run scorm` builds a SCORM 1.2 package (optionally of one script)
  for the LMS. Deep links (`?script=sites`, `?preset=csph`) open straight into an activity. See [docs/LMS.md](docs/LMS.md).
- **Accessibility.** Keyboard access to every structure, a live one-line description of the
  patient, interface zoom, reduced motion, color always paired with a second cue. See
  [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).
- **Privacy.** No trackers, no third-party requests (fonts are self-hosted), nothing stored off
  the device. See [docs/PRIVACY.md](docs/PRIVACY.md).
- **Offline.** Installable PWA; works on poor exam-hall Wi-Fi once loaded.
- **Language.** English only for now; language selection may come back later.
- **Versioned content.** A class taught on content version 2.0 behaves the same all term.

## What's inside

| Path | Contents |
|------|----------|
| `src/engine/` | The model, with no DOM: topology, physiology (tube law, compliance, Frank–Starling), implicit solver, reflexes, hepatic arterial buffer, collaterals, varices, ascites, bleeding, two clocks, metrics, events, "Why?" attribution, presets and drugs |
| `src/worker-core.js`, `src/worker.js` | Simulation host (Web Worker, main-thread fallback): runs the model off the main thread, snapshots, pre-roll and counterfactual replays |
| `src/ui/` | Stage (GPU figure and moving blood over the SVG scene, labels, anatomy⇄circuit morph, lobule and sinusoid views), action card, timeline and history, Treat, Tests and its instruments (Doppler, FibroScan, HVPG, endoscopy, ascites), presenter, LMS bridge, accessibility |
| `styles/` | Design tokens (light and dark) and layout |
| `fonts/`, `brand/` | Self-hosted fonts (SIL OFL); brand mark, lockup and app icons |
| `scripts/` | Cache stamping, the production build, SCORM packaging, the preview badge, performance measurements |
| `tests/` | Unit and physiological acceptance tests; `tests/e2e/` browser checks; `tests/visual/` visual references |
| `src/ui/decks/` | The 24 presentation decks, one file each |
| `docs/` | All documentation (see below) |

For preparing a class, `window.pps` in the browser console exposes `loadPreset`,
`updateParams`, `presenter` and the store.

## Documentation

| File | What it covers |
|------|----------------|
| [AGENTS.md](AGENTS.md) | Working rules for coding agents: preview branch, Pages deploys, the test loop |
| [CHANGELOG.md](CHANGELOG.md) | What changed, release by release |
| [docs/deck-authoring-guide.md](docs/deck-authoring-guide.md) | How to write a presentation deck |
| [docs/ai-humanizer.md](docs/ai-humanizer.md) | Style rules for slide wording |
| [docs/DESIGN_BLUEPRINT.md](docs/DESIGN_BLUEPRINT.md) | The original design spec; its model sections (§7, §12) are what the code comments cite |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Rendering and simulation scheduling |
| [docs/LMS.md](docs/LMS.md) | Deep links and SCORM packaging |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | WCAG 2.2 AA self-assessment |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What the app stores and sends (nothing off the device) |

## License

© 2026 Mohammad Almeqdadi. All rights reserved. No permission is granted to copy, modify or redistribute the application code without written consent.

Fonts (Inter, JetBrains Mono, Source Serif 4) are third-party and used under the SIL Open Font License.
