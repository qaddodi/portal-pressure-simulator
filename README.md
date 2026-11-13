# Portal Pressure Simulator

Created by **Mohammad Almeqdadi, MD**. More teaching tools: [qaddodi.github.io](https://qaddodi.github.io/#tools).

A living, physics-based model of the portal circulation for medical education. Raise a
resistance anywhere from the gut to the heart and watch blood find another way: collaterals
open, varices swell and rupture, the portal vein reverses, ascites accumulates. None of it is
scripted: every number and every pixel comes from one lumped-parameter hemodynamic model.

> **Educational simulation.** The model is simplified and its values are illustrative. Don't use
> it for diagnosis or treatment decisions.

Updated November 2026, model content dated October 2026. See [CHANGELOG.md](CHANGELOG.md).

## Run it

No build step: plain ES modules and static files. Any static server works.

```bash
npm start            # http://127.0.0.1:8080
# or: python3 -m http.server 8080
```

It must be served over HTTP (ES modules and the Web Worker don't load from `file://`). Once
loaded it works offline and can be installed as an app (PWA).

Imports and links are plain addresses (`./dock.js`); no `?v=<hash>` is committed. Cache-busting is made
by `npm run build` (bundled files named by their content hash, a generated service worker), which is what the
live site and the preview serve. `npm test` fails if a stamp is committed (`npm run stamp` takes one out).

### Production build (optional)

The repository root is the site, build-free. For hosts that can serve a build output,
`npm run build` writes an optimized copy to `dist/`: bundled and minified modules with
content-hashed names, rarely used surfaces split into chunks loaded on first use, one CSS file,
and a service worker that precaches everything for offline use. `npm run preview` serves it on
port 8081.

## Test it

```bash
npm ci                 # dev tools only: esbuild, ESLint, Playwright (lint needs them)
npm run lint           # ESLint, the off-GPU scan, the rules lint, the theme CSS check
npm test               # unit and physiological acceptance tests (Node ≥ 20)
npm run check:static   # conflict markers; the app and the worker bundle
npm run check          # lint, tests, the build and the static checks, in that order
npm run smoke:lite -- dist   # the one browser check, on the production build (boot, three views, slide 1 of every deck)
```

Those first four are the fast checks (node only, seconds to a minute); Quick runs them on every push to the preview branch. The
browser checks need a Chromium for Playwright (`npx playwright install chromium`). The older browser scripts (`npm run smoke`,
`visual`, `perf`, `gate` and the `smoke:*` family under `tests/e2e/` and `scripts/`) are local tools, not part of any workflow: software
WebGL on a shared runner judges neither the look nor the speed of a real GPU. Screenshots of the real app go through `scripts/shoot.mjs`
(see [AGENTS.md](AGENTS.md)). In the app, `?perf` lists every slow frame with its cost, and `?offgpu=1` shows work that is off the GPU.

GitHub workflows:

| Workflow | When | What |
|----------|------|------|
| `pages.yml` | pushes to `main` and the preview branch | publishes the live site at `/` and the preview at `/preview/` (with an orange PREVIEW badge); the deploy does not wait for the checks |
| `quick.yml` | pushes to the preview branch | lint, unit tests and the static checks beside the deploy, as a warning |
| `ci.yml` | pull requests and `main` | lint, tests, the static checks, a strict build and the smoke on the build |
| `checks.yml` | on request (Actions tab, dispatch only) | the smoke on the production build: `scripts/smoke-lite.mjs` |
| `tag-release.yml` | pushes to `main` | tags the merge as `v<year>.<month>.<n>` so a bad merge has a rollback target |

The preview workflow and the merge rules are in [AGENTS.md](AGENTS.md).

The acceptance tests are the model's validation targets (healthy ranges, HVPG in presinusoidal
disease and heart failure, splenic-vein reversal, hepatofugal flow, TIPS outcomes, the rupture
threshold, BRTO, β-blockers, Budd–Chiari, paracentesis, blood loss by ATLS class, volume
conservation, determinism, stability). They are listed in the app under *Menu › Help › About the model*.

## Using it

The **menu** (top left, named after the current patient) has two tabs: *Present* (the
presentation decks, by topic, and your own scripts and imported decks) and *Patients* (19 patients
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
- **Settings.** Send feedback, Search and Help; *Appearance* (Light, Soft, Dark, Navy, Black or System); *Display* (*Blur effect*:
  frosted glass, off gives solid cards and label pills and runs cooler; *Figure size* in megapixels, set per device; *Sharp while
  moving*); *Advanced physiology*; frame-rate and frame-breakdown counters; and *Reset everything*.
- **Search (Ctrl/⌘ K).** Everything, by name. **?** lists every keyboard shortcut.

The figure moves at the display's own rate (60, 120 Hz or more) and everything in it is drawn by the GPU: the vessels with the
Tube renderer (cel-shaded tubes with smoothed joints), the organs, the blood, the labels
and the glass behind the cards. Its resolution is the Figure size setting (2 MP on a Mac or iPad, 1 MP on an iPhone by default); touch
devices slow down at rest to stay cool. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md) and [docs/tube-renderer.md](docs/tube-renderer.md).

### Teaching

- **Presenter:** decks of model states, each slide with a teaching card (the words) and a data card
  (numbers, tiles, a chart or a live instrument), stepped with arrow keys, a swipe or a clicker;
  cases open with a short clinical vignette and each deck ends with quick-check questions. Build
  scripts from the live model and share them as a link or a file, or import a deck file
  (Menu › Present › Your scripts › *Import*). *Print notes* prints each deck's speaker notes and questions, one row per slide.
- **Guidelines:** clinical content follows Baveno VIII and, where US practice differs, AASLD 2024.
- **Writing decks:** [docs/deck-authoring-guide.md](docs/deck-authoring-guide.md) (format and
  layout rules) and [docs/ai-humanizer.md](docs/ai-humanizer.md) (how slide wording should read);
  [docs/design-humanizer.md](docs/design-humanizer.md) covers how the interface should look.

## For institutions

- **LMS.** `npm run scorm` builds a SCORM 1.2 package (optionally of one script)
  for the LMS. Deep links (`?script=sites`, `?preset=csph`) open straight into an activity. See [docs/LMS.md](docs/LMS.md).
- **Accessibility.** Keyboard access to every structure, a live one-line description of the
  patient, reduced motion, color always paired with a second cue. See
  [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).
- **Privacy.** No trackers, no third-party requests (fonts are self-hosted), nothing stored off
  the device. See [docs/PRIVACY.md](docs/PRIVACY.md).
- **Offline.** Installable PWA; works on poor exam-hall Wi-Fi once loaded.
- **Language.** English only for now; language selection may come back later.
- **Dated content.** The model, patients and presentations change only when their content date does, so a class behaves the same all term.

## What's inside

| Path | Contents |
|------|----------|
| `src/engine/` | The model, with no DOM: topology, physiology (tube law, compliance, Frank–Starling), implicit solver, reflexes, hepatic arterial buffer, collaterals, varices, ascites, bleeding, two clocks, metrics, events, "Why?" attribution, presets and drugs |
| `src/worker-core.js`, `src/worker.js` | Simulation host (Web Worker, main-thread fallback): runs the model off the main thread, snapshots, pre-roll and counterfactual replays |
| `src/ui/` | Stage (the GPU figure: Tube vessels, organs, moving blood, labels and glass; anatomy⇄circuit morph, lobule and sinusoid views), action card, timeline and history, Treat, Tests and its instruments (Doppler, FibroScan, HVPG, endoscopy, ascites), presenter, LMS bridge, accessibility |
| `styles/` | Design tokens (the five looks) and layout |
| `fonts/`, `brand/` | Self-hosted fonts (SIL OFL); brand mark, lockup and app icons |
| `scripts/` | The production build, the off-GPU scan and the lint rules, the shader compile check, screenshots (`shoot.mjs`), SCORM packaging, the preview badge, generated tables, local performance tools |
| `tests/` | Unit and physiological acceptance tests; `tests/e2e/` browser checks; `tests/visual/` visual references |
| `src/ui/decks/` | The presentation decks, one file each |
| `docs/` | All documentation (see below) |

For preparing a class, `window.pps` in the browser console exposes `loadPreset`,
`updateParams`, `presenter` and the store.

## Documentation

| File | What it covers |
|------|----------------|
| [AGENTS.md](AGENTS.md) | Working rules for coding agents: preview branch, Pages deploys, the test loop, the off-GPU rule, screenshots, tester guides |
| [CHANGELOG.md](CHANGELOG.md) | What changed, release by release |
| [docs/deck-authoring-quick-guide.md](docs/deck-authoring-quick-guide.md) | The short guide to writing a deck: every feature in plain words, one example each |
| [docs/deck-authoring-guide.md](docs/deck-authoring-guide.md) | How to write a presentation deck (the full field reference and rules) |
| [docs/deck-behavior-vision.md](docs/deck-behavior-vision.md) | How a talk should behave: slide changes, cards, the clock |
| [docs/ai-humanizer.md](docs/ai-humanizer.md) | Style rules for slide wording |
| [docs/design-humanizer.md](docs/design-humanizer.md) | Visual rules that keep the interface from looking machine-made |
| [docs/DESIGN_BLUEPRINT.md](docs/DESIGN_BLUEPRINT.md) | The original design spec, cut to what is still true (the model, §7, §10, §12); the code comments cite its section numbers |
| [docs/tube-renderer.md](docs/tube-renderer.md) | The Tube vessel renderer as built (the only renderer) |
| [docs/gpu-practices.md](docs/gpu-practices.md) | GPU rendering practices for every thread that touches the figure |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Rendering and simulation scheduling |
| [docs/off-gpu-inventory.md](docs/off-gpu-inventory.md) | Generated list of everything still off the GPU (`npm run offgpu`) |
| [docs/stage-map.md](docs/stage-map.md), [docs/test-classes.md](docs/test-classes.md) | Generated maps of `stage.js` and of the tests |
| [docs/scheduling.md](docs/scheduling.md) | Who owns a timer |
| [docs/recommendations/](docs/recommendations/) | Dated recommendation lists and build plans, each with a status line at its top |
| [docs/LMS.md](docs/LMS.md) | Deep links and SCORM packaging |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | WCAG 2.2 AA self-assessment |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What the app stores and sends (nothing off the device) |
| [guides/](guides/) | The two beta tester start guides (PDF), served at `/guides/` |
| [guidelines/](guidelines/) | The Baveno VIII and AASLD 2024 PDFs the decks cite |

## License

© 2026 Mohammad Almeqdadi. All rights reserved. No permission is granted to copy, modify or redistribute the application code without written consent.

Fonts (Inter, JetBrains Mono, Source Serif 4) are third-party and used under the SIL Open Font License.
