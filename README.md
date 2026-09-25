# Portal Pressure Simulator

An interactive, physics-based model of the portal circulation for medical education.
Pinch vessels, clot them, paint fibrosis, drag in a TIPS, band varices, wedge a hepatic-vein
catheter. Collaterals open, varices swell and rupture, the portal vein reverses and ascites
accumulates. None of this is scripted: it all comes from one lumped-parameter hemodynamic
model.

> **Educational simulation.** The model is simplified and its values are illustrative. Don't use
> it for diagnosis or treatment decisions.

The design spec is [`docs/DESIGN_BLUEPRINT.md`](docs/DESIGN_BLUEPRINT.md). The plan for the next UI/UX and graphics pass is [`docs/UI_UX_NEXT_LEVEL.md`](docs/UI_UX_NEXT_LEVEL.md).

## Run it

There's no build step. It's plain ES modules, so any static server works:

```bash
npm start            # npx http-server on http://localhost:8080
# or: python3 -m http.server 8080
```

After editing any file under `src/` or `styles/`, run `npm run stamp`. It updates the `?v=<hash>` on every local import and link, so a browser never combines freshly deployed files with stale cached ones. `npm test` fails if a stamp is out of date.

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
| `src/ui/` | Stage (SVG anatomy, screen-space label layout, flow arrowheads, canvas flow particles, anatomy⇄circuit morph), figure view & export, controls panel, readouts, instrument drawer, lessons, cases, compare |
| `styles/` | Design tokens (light "Atlas" / dark "Monitor") and layout |
| `tests/` | Acceptance tests |
| `legacy/` | The original single-file prototype, kept for reference |

## Interface

The figure is the page. Everything else is arranged so it never covers the anatomy:

- **Figure.** A focused anatomical plate of the portal circulation. The organs are opaque, quiet silhouettes drawn back to front, each with a soft inner shade and a crisp outline. The liver takes on the pressure hue only as sinusoidal pressure rises, and shows nodularity in cirrhosis. The small bowel is drawn as coiled loops inside the colon frame. Veins that run behind an organ (the retrohepatic IVC, iliac and azygos veins) show through as faint lines. Vessels are tubes: a dark casing around a lumen colored by pressure. Vessels that only close the systemic loop stay in the model but aren't drawn.
- **Rendering.** The anatomy is a layered 2.5D atlas lit from the upper left: a soft body cavity and the diaphragm domes form the back plane; each organ has a cast shadow, a faint tissue texture (hepatic lobules, gastric rugae, pancreatic lobules, myocardium) and form shading. Veins are drawn as one connected network, the way a map draws streets: all shadows, then all casings, then all lumens, so vessels flow into each other at junctions instead of overlapping. Each vein is a filled tube whose caliber eases smoothly into its neighbours at both ends (the larger vessel narrows toward the next largest, smaller branches widen into the junction), and anatomic courses carry a gentle, fixed meander instead of ruler-straight lines. Tubes have a contact shadow, a darker side turned from the light and a narrow sheen. A TIPS is drawn as a metal stent (rails, diamond struts, radiopaque end markers); surgical shunts carry suture rows at each anastomosis. The SVC and IVC end in a drawn right atrium, the azygos ascends beside the cava and arches into the SVC, and a dashed arrow shows blood leaving for the right ventricle. A stenosis narrows the lumen where it was pinched, by the model's diameter fraction, and the chevrons speed up through the waist (velocity ∝ 1/area). Selecting a vessel keeps it bright while the rest of the network recedes.
- **Data layers.** Like the views in a city-building game, the same network can be read several ways (Color menu), each with its own legend, labels and figure caption. The anatomy desaturates so the data carries the view:
  - *Pressure*: mean venous pressure (default).
  - *Change from healthy*: blue lower, red higher.
  - *Congestion heat map*: pressure above healthy, grey to deep red, with a soft glow over the most congested territories.
  - *Pressure drop*: where the resistance sits.
  - *Flow volume*: L/min on a log scale, and line width ∝ √flow, like traffic volume. Labels give the flow into each station and its change from healthy.
  - *Velocity and stasis*: mean velocity, dark red below ~5 cm/s (thrombosis-prone), green free-flowing. The liver's microcirculation is grey, and stations fed only by closed collaterals say so.
  - *Flow direction*: physiological vs reversed.
- **Model-driven transitions.** Only what the model computes is animated, and every effect settles: while a vessel's mean pressure is still rising, a faint band travels upstream along it (falling: downstream); where a vessel's resistance jumps, two brackets close across it at the lesion (with the ratio, e.g. *R ×2.1*, on the sinusoids); a vessel whose flow reverses glows briefly; a collateral or shunt that opens is drawn on in the direction of its flow. None of this runs under reduced motion, in Cases that hide pressures, or in the figure view.
- **Blood flow.** The chevrons inside each lumen are the blood. They point and move downstream, faster where the blood moves faster, and a vessel with no flow carries none. Reversed flow simply runs the other way, with no badge or icon. Thin vessels carry small solid arrowheads instead, so they can't be mistaken for the dotted style of a closed collateral. When the model is paused, or the system asks for reduced motion, the chevrons hold still and keep their direction. Exported figures carry the same chevrons as vector paths. Labels live in their own screen-space layer, so text keeps a constant size at any zoom. On a wide figure they hang in the margins as atlas columns with leader lines; on narrow screens they sit next to their structure. Each label is placed by priority, avoids every other label, floating card and vessel line it can, and is dropped if there is no room (zoom in to see more). Every label gives the value in mmHg and the change from healthy (▲/▼).
- **Circuit.** A dark "hemodynamic command map" (in either theme) in which pressure falls from left to right along the main series circuit, which carries a quiet spine band. Each collateral and shunt runs in its own captioned lane with rounded corners, and every station is labeled with its pressure. The liver is a module: collapsed, one header gives the sinusoidal pressure and the pre-, sinusoidal and post-sinusoidal resistance (both lobes in parallel, Wood units); it expands to show every station and segment resistance when you click the header, select a liver vessel or zoom in. On a squarish or tall screen the map opens zoomed to fill the height, and you pan sideways.
- **Figure header and footer.** Above the figure: Anatomy/Circuit, the color mode and a horizontal pressure legend. Click the legend for how to read it. Below the figure: playback (play, Seconds/Months, time, and a menu with speed, fast-forward and settle), the tools, and zoom.
- **Tools.** *Select* plus three named groups: **Disease** (pinch, thrombus, fibrosis brush), **Treat** (stent/shunt, band ligation, occlusion, balloon) and **Measure** (hover values, hepatic-vein catheter, Doppler, endoscope, paracentesis). Each group opens a tray that lists every tool by name, shortcut and purpose. When a lesson or case limits the tools, the bar shows exactly those tools by name. A card beside the figure explains the active tool, and Esc returns to Select.
- **Findings.** Threshold events (a collateral opening, flow reversing, a varix rupturing, ascites forming) never cover the figure and never flash. They collect behind one Findings button in the figure header, which shows a count of unread items. The newest finding is named beside the button for a few seconds, and the list gives each one's detail and a **Why?** link. Active bleeding is a steady status in the header. Every event is also kept in the Log instrument.
- **Readouts.** HVPG, portal pressure, portal flow and varix wall tension are always shown. PPG, ascites, liver perfusion and shunt fraction join the row when they become abnormal. **All readouts** shows everything, including the systemic vitals. Click any readout for **Why?**
- **Instruments.** A drawer under the figure, closed by default. It opens when you pick an instrument or a tool needs one (catheter → HVPG, Doppler → spectrum). The instruments are grouped as Hemodynamics · Bedside · Microanatomy · Log.
- **Side panel.** It shows one thing at a time: the controls (with a *Where to begin* card on a healthy baseline), the vessel you selected, the lesson, the case, or the comparison. It can be collapsed to give the figure the full width.
- **Modes.** *Learn* shows the step (Predict · Your turn · Observe · Explain · Check) in the figure header and points at the vessel to act on. *Cases* hide pressures the clinician can't see: the figure switches to anatomy-only colors with no values, no flow direction and no clot markers until you investigate. *Compare* captures state A, then switches the figure between A, B and the change A→B. Readouts report "vs A" and a table lists every difference.
- **Figure view (F).** A clean plate (flat lumens so color reads as the value, no textures, shadows, sheen, selection dimming or transitions) with a title, scenario, key values, legend, notation key and caption, ready to present, print or export as **SVG** (all styles resolved inline, editable in a vector editor) or **PNG** (2×).
- **Phone and tablet.** On a phone the figure sits on top with one sheet below it (Controls/Lesson/Case, Readouts, Instruments), and ⤢ expands the figure. The tools collapse to *Select* + *Tools*. In landscape the sheet moves beside the figure. Lesson steps flag the Instruments tab on a phone but don't switch to it. On tablets the side panel slides over the figure.
- **Look.** A light "Atlas" theme and a dark "Monitor" theme, Inter throughout, and a perceptually uniform pressure scale whose breaks mirror the HVPG thresholds. Color always comes with a second cue (a value, arrow, dash or word). Motion is short and eased, and turned off under reduced-motion.

For preparing a class, `window.pps` in the browser console exposes `loadPreset`, `updateParams`, `toggleFigure` and the store.

## Features

- **Modes:** Explore, Learn (11 predict → observe → explain lessons), Cases (variceal bleed, isolated gastric varices, cardiac ascites, refractory ascites), and Compare (A/B snapshot).
- **Tools:** select, measure, pinch (stenosis), thrombus, fibrosis brush (portal / sinusoidal / central zone), stent (TIPS or surgical shunts), band ligation, occlude (BRTO), balloon tamponade, hepatic-vein catheter, Doppler, endoscope, paracentesis.
- **Two clocks:** *Seconds* for hemodynamics (with an optional pulsatile mode) and *Months* for remodeling of collaterals, varices, spleen, ascites and splanchnic vasodilation.
- **Readouts:** HVPG, portal pressure, PPG, portal flow, varix wall tension and grade, ascites, liver perfusion and shunt fraction, plus MAP, HR, CO, RA, Hb and spleen length. Click any readout for a **Why?** causal breakdown.
- **Instruments:** pressure-profile staircase (with prediction drawing), scope and disease trends (small multiples, one axis per unit, labeled line ends), flow Sankey, perfusion donut with a P–Q operating point, HVPG trace, spectral Doppler, endoscopy, liver lobule, varix cross-section, abdomen.
- **Sharing and layout:** share links, undo/redo, keyboard shortcuts (press `?`), reduced-motion support, and responsive desktop, tablet and phone layouts.
