# Portal Pressure Simulator

An interactive, physics-based model of the portal circulation for medical education.
Pinch vessels, clot them, paint fibrosis, drag in a TIPS, band varices, wedge a hepatic-vein
catheter. Collaterals open, varices swell and rupture, the portal vein reverses and ascites
accumulates. None of this is scripted: it all comes from one lumped-parameter hemodynamic
model.

> **Educational simulation.** The model is simplified and its values are illustrative. Don't use
> it for diagnosis or treatment decisions.

The design spec is [`docs/DESIGN_BLUEPRINT.md`](docs/DESIGN_BLUEPRINT.md).

## Run it

There's no build step. It's plain ES modules, so any static server works:

```bash
npm start            # npx http-server on http://localhost:8080
# or: python3 -m http.server 8080
```

The page has to be served over HTTP (ES modules and the Web Worker don't load from `file://`).
The engine runs in a Web Worker and falls back to the main thread if workers aren't available.

## Test it

```bash
npm test             # physiological acceptance tests (blueprint §12), Node ≥ 20
```

The suite checks things like healthy targets, HVPG behavior in presinusoidal disease and in
right heart failure, splenic-vein reversal, hepatofugal flow, TIPS outcomes, the rupture
threshold, BRTO, NSBBs, Budd–Chiari, paracentesis, volume conservation, determinism and
stability.

## What's inside

| Path | Contents |
|------|----------|
| `src/engine/` | Pure JS model with no DOM. `topology.js` (≈40 nodes, 70 edges, calibrated by construction), `physiology.js` (tube law, nonlinear compliance, Frank–Starling pump), `engine.js` (implicit solver, reflexes, HABR, collaterals, varices, ascites, bleeding, two clocks), `metrics.js`, `events.js`, `explain.js` ("Why?" attribution), `scenario.js` (presets, drugs) |
| `src/worker-core.js`, `src/worker.js` | Simulation host that streams frames at 30 Hz |
| `src/ui/` | Stage (SVG anatomy with atlas-style leader labels, canvas flow particles, anatomy⇄circuit morph), controls panel, readout strip, charts & instruments, lessons, cases |
| `styles/` | Design tokens (light "Atlas" / dark "Monitor") and layout |
| `tests/` | Acceptance tests |
| `legacy/` | The original single-file prototype, kept for reference |

## Interface

The screen is one stage with everything else arranged around it:

- **Stage.** The anatomy fills the center. Pressure labels hang in the margins with thin leader lines, like an atlas plate, and route around anything floating over them. The playback bar sits at the top (play, speed, the Seconds/Months clock, fast-forward, settle). The toolbar sits at the bottom, grouped as Inspect · Disease · Treat · Measure. The pressure legend is on the left, zoom on the right. Events appear as small notifications in the corner, with a pulse ring on the organ where they happened.
- **Readouts.** Under the stage, eight portal readouts in reading order (HVPG → shunt fraction) and a compact block of systemic vitals. Each shows a status word next to its color, and clicking one opens **Why?**
- **Charts.** Tabs grouped as hemodynamics · bedside measurements · microanatomy · log. The dock can be resized or collapsed.
- **Panel.** Controls in three tabs (Pathology · Therapy · Physiology) with a list of active changes you can remove one by one. Selecting a vessel shows its live values and what you can do to it. In Learn mode, the lesson takes over the panel and embeds the control each step asks for. In Cases mode, the panel holds the case.
- **Look.** A light "Atlas" theme and a dark "Monitor" theme, Inter throughout, a perceptually uniform pressure scale with clinical ticks, a chart series palette validated for color-vision deficiency, and hairline grids. Line width follows vessel diameter on a compressed scale, so the cavae don't drown out the portal tree.

For preparing a class, `window.pps` in the browser console exposes `loadPreset`, `updateParams` and the store.

## Features

- **Modes:** Explore, Learn (11 predict → observe → explain lessons), Cases (variceal bleed, isolated gastric varices, cardiac ascites, refractory ascites), and Compare (A/B snapshot).
- **Tools:** select, measure, pinch (stenosis), thrombus, fibrosis brush (portal / sinusoidal / central zone), stent (TIPS or surgical shunts), band ligation, occlude (BRTO), balloon tamponade, hepatic-vein catheter, Doppler, endoscope, paracentesis.
- **Two clocks:** *Seconds* for hemodynamics (with an optional pulsatile mode) and *Months* for remodeling of collaterals, varices, spleen, ascites and splanchnic vasodilation.
- **Readouts:** HVPG, portal pressure, PPG, portal flow, varix wall tension and grade, ascites, liver perfusion and shunt fraction, plus MAP, HR, CO, RA, Hb and spleen length. Click any readout for a **Why?** causal breakdown.
- **Charts:** pressure-profile staircase (with prediction drawing), scope and disease trends (small multiples, one axis per unit, labeled line ends), flow Sankey, perfusion donut with a P–Q operating point, HVPG trace, spectral Doppler, endoscopy, liver lobule, varix cross-section, abdomen.
- **Sharing and layout:** share links, undo/redo, keyboard shortcuts (press `?`), reduced-motion support, and responsive desktop, tablet and phone layouts.
