# Changelog

## 2.1.0 (content version 2.0), 2026-09

The overhaul: faster on every device, a quieter and clearer figure, a simpler shell. The model,
patients, lessons and cases are unchanged (content version 2.0).

- **Phase 1, foundations.** Command palette, figure plate and presenter load on first use (and
  are fetched when the app is idle, for offline use). Frosted-glass blurs replaced with solid
  surfaces. The figure stops painting while Home covers it. Font and module preloads. An
  optional production build (`npm run build`), ESLint, a browser smoke test on desktop and
  phone, a performance report, and CI. Fixed: the legend's "How to read" popover failed in the
  Congestion lens; an unknown `?preset=` link now says so and opens the closest patient.

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
