# Changelog

## Unreleased

- **Lobule on request.** Scrolling or pinching into the liver no longer drops the view into the
  lobule; the zoom only moves the camera. The lobule opens from the zoom trail's *Lobule* step,
  the liver's card, the command palette or a presenter step, and scrolling or pinching out (or
  *Back to the liver*) returns to the liver.
- **One side panel.** The instruments moved from the drawer under the figure into the side
  panel, as a second tab beside the patient chart (the panel widens a little for charts). On
  tablets and phones the panel slides over the figure from the Chart button; phones lose the
  bottom sheet and tab bar, so the figure takes the screen, and a tap outside closes the panel.
- **Anatomy.** Caput medusae restored in full: larger, with the abdominal-wall veins drawn again
  from the umbilicus up to the SVC (beside the azygos arch) and down to the iliac once the
  paraumbilical vein opens, and the umbilicus always marked. The tip of the left lobe of the
  liver is rounded. The esophagus now flows into the cardia of the stomach instead of ending
  over it.
- **Varix plexuses.** Esophageal and fundal varices are drawn connected to their vessels the way
  the cavernoma is: the coronary vein reaches the esophageal varices, and they reach the azygos,
  as a braid of periesophageal channels; the short and posterior gastric veins reach the fundal
  varices as a leash from the splenic vein; the gastrorenal shunt leaves them as a tortuous
  bundle. The braids grow with recruitment and are hidden while the collateral is closed.
  The varices are now shown by these channels alone: the beaded columns in the esophagus, the
  grape cluster at the fundus and the wall-tension ring around the esophageal varices are gone
  (wall tension is still read from Varix tension in the readouts and the Varix wall instrument).
- **Fundal varices, anatomy corrected.** The fundal ↔ coronary vein channel is now an anatomical
  variant ("Fundal varices reach the coronary vein", under Anatomical variants and on the vessel's
  card), present by default: gastroesophageal varices (GOV2) and the sinistral route of splenic
  vein thrombosis use it. The *Cirrhosis with gastrorenal shunt* patient now has isolated fundal
  varices (IGV1) without it: fed by the short and posterior gastric veins, drained only through
  the gastrorenal shunt. Its patient snapshot was regenerated.
- **Banding shows on the anatomy.** Each band thromboses one of the esophageal varix channels
  (they fade out one by one) and the remaining channels shrink, alongside the band rings; as
  bands slough over the months the channels return.
- **One arrow style.** Flow marks no longer grow tails in fast vessels (TIPS, shunts, varices):
  every arrow in the figure is the same notched dart, including the heart's "to RV" mark and the
  figure legend.
- **Shunts and feeders.** The gastrorenal and splenorenal shunts are drawn as single large veins,
  not tortuous collaterals. The short and posterior gastric veins leave the splenic vein as one
  vein and break into a plexus only as they reach the fundal varices.
- **Tributaries.** The splenic vein (hilar branches), the superior mesenteric vein (jejunal and
  ileal branches) and the inferior mesenteric vein (descending colic and sigmoid veins) are drawn
  formed by a network of tortuous, branching tributaries, like the variceal plexus, with flow
  marks (anatomy only); the vessels themselves have not moved.
- The gastrorenal shunt leaves the fundal varices in a smooth arc instead of a hairpin. In the
  circuit, the fundal varices → coronary vein line drops clear of the short gastric line instead
  of running on top of it.
- Tributaries fade out into the bowel (only the stretch near the vessel carries flow marks); the
  IMV's come from the descending colon on the patient's left. The gastrorenal shunt runs clear
  of the coronary vein and fades into the left renal vein; the caudate vein fades into the IVC.
  The esophageal varices drain to the azygos through one vein, no plexus.
- Budd–Chiari caudate collaterals are drawn as veins: smooth, smaller, each colored from the
  pressure of the portal branch it leaves (right or left portal vein) to that of the caudate vein,
  and no longer veiled by the caudate vein's fade. The caudate vein itself is a little smaller.
- **Caudate lobe.** Its vein runs from the portal vein straight into the IVC. In Budd–Chiari it
  enlarges with its flow and collaterals from the right and left portal veins drain into it.
- **Flow rates** read to one decimal everywhere (labels, cards, readouts, charts), with "< 0.1"
  for a small but real flow; the low end of the flow lens is darker so trickles stay visible.

## 2.1.0 (content version 2.0), 2026-09

The overhaul: faster on every device, a quieter and clearer figure, a simpler shell. The model,
patients, lessons and cases are unchanged (content version 2.0).

- **Phase 1, foundations.** Command palette, figure plate and presenter load on first use (and
  are fetched when the app is idle, for offline use). Frosted-glass blurs replaced with solid
  surfaces. The figure stops painting while Home covers it. Font and module preloads. An
  optional production build (`npm run build`), ESLint, a browser smoke test on desktop and
  phone, a performance report, and CI. Fixed: the legend's "How to read" popover failed in the
  Congestion lens; an unknown `?preset=` link now says so and opens the closest patient.
- **Phase 2, rendering.** Flow marks drawn on the GPU (WebGL2, with the Canvas2D renderer as the
  fallback), occlusion masks rendered on the GPU; adaptive detail for slow devices; colors,
  widths and varices no longer rebuilt on every heartbeat; hit testing limited to hit strokes.
  On a throttled phone profile: 7 → 31 frames a second (see docs/PERFORMANCE.md).
- **Phase 3, the figure.** Quiet anatomy: organs are flat tinted silhouettes with a hairline (no
  cast shadows, blurred rims or decorative textures); texture now appears only as disease
  (nodules, nutmeg, congestion). A varix wall-tension ring closes as the varices approach their
  rupture threshold (amber ≥ 70 %, red ≥ 90 %). On small screens the station labels are single
  lines on a text halo instead of cards, uncovering the anatomy.
- **Phase 4, the shell.** Home's patient list is now a map of the disease: patients grouped by
  where the resistance sits, each drawn as its own pressure profile from the gut to the heart
  (generated from the model by `scripts/snapshots.mjs`, checked by `npm test`), with HVPG,
  portal pressure, flow direction and ascites. Compact Home on phones. The legend is now the
  lens switcher (one control, with "How to read the figure" inside); Draw is an icon. The
  pressure profile's ΔP labels are pills that never overlap bars or each other, and the largest
  fall (where the resistance sits) is highlighted. Phone readouts fit four across and snap.
- **Phase 5, signature views.** The pressure landscape instrument: the circuit raised by mean
  pressure in 2.5D (drag to tilt and turn), flow running downhill, the CSPH and bleeding planes,
  and a live verdict naming the steepest fall on the portal pathway (presinusoidal, sinusoidal,
  postsinusoidal, posthepatic). In the circuit, the liver's resistance gates take the color of
  the pressure they drop, so the dominant resistance lights up. Instruments and Home arrive with
  a short, staggered motion (off with reduced motion).
- **Anatomy redrawn as a plate.** New silhouettes drawn to the anterior view of an atlas: a
  domed liver with a sharp oblique inferior margin, a teres notch and a thin rounded left lobe,
  the gallbladder fundus just below the margin; a single-form heart on the diaphragm; a smooth
  notched spleen; one continuous colon ending in the cecum where the ileum enters, with the
  appendix; the duodenum leaving the pylorus. The pancreas is no longer drawn. Matte tissue
  rendering from one light source: per-tissue tones, soft volume, a gradual inner shade, a faint
  rim light and ambient occlusion; surface anatomy (falciform ligament, gastric folds, pylorus,
  splenic and renal hila, haustra). Vessels are cut out of the tissue by a thin paper edge so
  pressure colors stay legible. Light and dark themes; gradients and clips only (no blur
  filters); exports as vector.

## 2.0.0 (content version 2.0), 2026-09

The v2 redesign from [docs/UI_UX_NEXT_LEVEL.md](docs/UI_UX_NEXT_LEVEL.md).

- **Interaction:** object → verb. Click a vessel or organ and an action card opens beside it;
  the toolbar and tool modes are gone. Shunts are dragged from source to target.
- **One timeline** for time, history, events and comparison: jump the disease clock, go back to
  any change, pin a moment as A. Compare mode, the Findings tab and the Log are gone.
- **Shell:** Home with four doors, a patient chart (vitals, Treat, Story), one-level
  instruments that dock, pop out or sit side by side, a command palette, and role levels.
- **Art:** anatomy redrawn (warm tissue palette, colon frame, kidneys, gallbladder, lobes);
  nodular cirrhotic liver, nutmeg congestion, ascites with meniscus and flank bulge, beaded and
  grape-cluster varices, caput medusae, laminated thrombus, stent mesh. Change halos, selection
  lift, a new brand mark, self-hosted fonts with a serif for lesson prose.
- **Signature visuals:** semantic zoom from abdomen to liver to lobule; circuit crossings drawn
  as bridges; grey-scale spectral Doppler; rendered endoscopy; motion trails in fast flow.
- **Teaching:** lesson step card on the figure, predictions on the figure, Replay, scores;
  cases with a bedside monitor, a single visibility map, pre-roll, randomized variants and a
  printable debrief with a counterfactual; assessment records (CSV, xAPI); presenter scripts
  with notes, laser pointer and sharing.
- **Institution-ready:** SCORM 1.2 packaging and LMS score reporting, deep links, PWA/offline,
  privacy and accessibility statements, versioned content, interface in five languages
  (including right-to-left Arabic).

## 1.0.0

First public version: the hemodynamic engine, anatomy and circuit views, lessons, cases and
instruments.
