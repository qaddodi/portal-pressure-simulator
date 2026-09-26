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
npm install          # dev tools only: esbuild, ESLint, Playwright
npm test             # physiological acceptance tests and the stamp check (Node ≥ 20)
npm run lint         # ESLint
npm run smoke        # the app in a real browser (desktop and phone): loads, runs, every surface opens
npm run perf         # frame rate and main-thread stalls on a desktop, a laptop and a phone profile
npm run check        # all of the above, on the root site and on the build
```

The browser checks need a Chromium for Playwright (`npx playwright install chromium`). CI
(`.github/workflows/ci.yml`) runs lint, tests, the build, both smoke tests and the performance
report on every push and pull request.

The acceptance tests are the model's validation targets (healthy ranges, HVPG in presinusoidal
disease and heart failure, splenic-vein reversal, hepatofugal flow, TIPS outcomes, the rupture
threshold, BRTO, β-blockers, Budd–Chiari, paracentesis, volume conservation, determinism,
stability). They are listed in the app under *Menu › About the model*.

## Using it

**Home** has four doors: *Explore a patient* (16 patients from healthy to Budd–Chiari, laid out
as a map of the disease: grouped by where the resistance sits, each with its pressure profile),
*Lessons*, *Cases* and *Presenter*.

- **Act on the anatomy.** Click any vessel or organ: a card opens beside it with what you can do
  there (narrow or clot a vein, make the liver cirrhotic, band varices, wedge a catheter, start
  a shunt, zoom into the lobule). Keys 1–9 run the card's actions.
- **One timeline.** Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease
  ahead. Every change and every event is a marker: click one to go back, or pin it as A to
  compare with now.
- **Patient chart.** Vitals with trends, Treat (drugs, fluids, procedures), and the Story of what
  happened and why. Click any readout for a causal **Why?**
- **Instruments.** Pressure profile, pressure landscape, trends, flow, perfusion, HVPG, spectral
  Doppler, endoscopy, varix wall, abdomen. The **pressure landscape** raises the circuit by
  pressure (drag to tilt): blood runs downhill, cliffs are resistances, and it names the steepest
  fall on the portal pathway. One opens in the side panel's Instruments tab, beside the
  patient chart; pop it out or stack a second one below it.
- **Semantic zoom.** Zoom into the liver, then choose *Lobule* in the zoom trail (or *Zoom into
  the lobule* on the liver's card): the plate becomes a honeycomb of lobules drawn from the model
  (sinusoids, stellate cells, collagen, congestion). Zooming alone never leaves the anatomy.
- **Phones.** The figure takes the screen; the Chart button slides the side panel (chart and
  instruments) over it.
- **Views and lenses.** Anatomy or a transit-map Circuit; color by pressure, change, congestion,
  pressure drop, flow, velocity or direction.
- **Figure (F).** A clean labeled plate to present, print or export as SVG or PNG.
- **Command palette (Ctrl/⌘ K).** Everything, by name.

### Teaching

- **Lessons** (11): predict → do → observe → explain → check, with the step card on the figure,
  predictions made on the figure or the pressure profile, Replay per step, and a score.
- **Cases** (4): a variceal bleed and three diagnostic puzzles with a bedside monitor, orders,
  randomized variants, pressures hidden until measured, and a printable debrief with a
  counterfactual ("had terlipressin been started at minute 2…") replayed in the same model.
- **Assessment:** every attempt is recorded on the device and exports as CSV or xAPI.
- **Presenter:** scripts of model states with speaker notes, stepped with arrow keys or a
  clicker; notes in a second window; laser pointer. Build scripts from the live model and share
  them as a link or a file.

## For institutions

- **LMS.** `npm run scorm` builds a SCORM 1.2 package (optionally of one lesson, case or script)
  that reports scores to the LMS. Deep links (`?lesson=hvpg`, `?case=bleed`, `?script=ph-ten`,
  `?preset=csph`) open straight into an activity. See [docs/LMS.md](docs/LMS.md).
- **Accessibility.** Keyboard access to every structure, a spoken description of the patient
  (D), pressure sonification, reduced motion, color always paired with a second cue. See
  [ACCESSIBILITY.md](ACCESSIBILITY.md).
- **Privacy.** No trackers, no third-party requests (fonts are self-hosted), nothing stored off
  the device. See [PRIVACY.md](PRIVACY.md).
- **Offline.** Installable PWA; works on poor exam-hall Wi-Fi once loaded.
- **Languages.** The interface shell is available in English, Spanish, French, Portuguese and
  Arabic (right-to-left); lesson and case text is English for now.
- **Versioned content.** A course built on content version 2.0 behaves the same all term.

## What's inside

| Path | Contents |
|------|----------|
| `src/engine/` | The model, with no DOM: topology, physiology (tube law, compliance, Frank–Starling), implicit solver, reflexes, hepatic arterial buffer, collaterals, varices, ascites, bleeding, two clocks, metrics, events, "Why?" attribution, presets and drugs |
| `src/worker-core.js`, `src/worker.js` | Simulation host (Web Worker, main-thread fallback): frames at 30 Hz, snapshots, pre-roll and counterfactual replays |
| `src/ui/` | Stage (SVG anatomy, flow marks, labels, anatomy⇄circuit morph, semantic zoom), action card, timeline, chart, instruments, lessons, cases, presenter, records, LMS bridge, accessibility |
| `src/i18n/` | Interface strings per language |
| `styles/` | Design tokens (light and dark) and layout |
| `fonts/`, `brand/` | Self-hosted fonts (SIL OFL); brand mark, lockup and app icons |
| `scripts/` | Cache stamping, SCORM packaging |
| `tests/` | Acceptance tests |
| `docs/` | Design blueprint and the v2 UI/UX plan ([UI_UX_NEXT_LEVEL.md](docs/UI_UX_NEXT_LEVEL.md)) |
| `legacy/` | The original single-file prototype, kept for reference |

For preparing a class, `window.pps` in the browser console exposes `loadPreset`,
`updateParams`, `startLesson`, `startCase`, `presenter` and the store.

## License

Code: MIT. Fonts: SIL Open Font License.
