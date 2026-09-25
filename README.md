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
| `src/ui/` | Stage (SVG anatomy + canvas particles + anatomy⇄circuit morph), inspector, dock charts & instruments, lessons, cases |
| `styles/` | Design tokens (light "Atlas" / dark "Monitor") and layout |
| `tests/` | Acceptance tests |
| `legacy/` | The original single-file prototype, kept for reference |

## Features

- **Modes:** Explore, Learn (11 predict → observe → explain lessons), Cases (variceal bleed, isolated gastric varices, cardiac ascites, refractory ascites), and Compare (A/B snapshot).
- **Tools:** select, measure, pinch (stenosis), thrombus, fibrosis brush (portal / sinusoidal / central zone), stent (TIPS or surgical shunts), band ligation, occlude (BRTO), balloon tamponade, hepatic-vein catheter, Doppler, endoscope, paracentesis.
- **Two clocks:** *Seconds* for hemodynamics (with an optional pulsatile mode) and *Months* for remodeling of collaterals, varices, spleen, ascites and splanchnic vasodilation.
- **Readouts:** HVPG, PPG, portal pressure and flow, liver perfusion, shunt fraction, varix grade and wall tension, ascites and IAP, spleen, MAP/CO, blood volume. Click any tile for a **Why?** causal breakdown.
- **Charts:** pressure-profile staircase (with prediction drawing), scope and disease trends, flow Sankey, perfusion donut with a P–Q operating point, HVPG trace, spectral Doppler, endoscopy, liver lobule, varix cross-section, abdomen.
- **Sharing and layout:** share links, undo/redo, keyboard shortcuts (press `?`), reduced-motion support, and responsive desktop, tablet and phone layouts.
