# Everything still off the GPU (code sweep, preview ffd42679, 1 Nov 2026, ~6:20 PM ET)

Code read of every file in `src/` and `styles/` on `claude/settings-topbar-icon-flvft1` at ffd42679. No renders, no device runs.
Compared with `review/gpu-leftovers-1nov.md` (b37fe322) and the reviewer's GPU_Motion_Review (def4e7ba).

Tags: **NEW** = on neither earlier list. **FIXED** = done since those lists (hash). **PART** = partly done, rest still open.
Unmarked = on an earlier list and still open at ffd42679.

## 1. Figure: organs, vessels, overlays
- Organ picture rastered from SVG (XMLSerializer → Blob → Image → 2D strips → getImageData → upload): stage.js rasterPlate / rasterLayers / drawn / readBack, veins-gl.js plateRows
- Gut picture SVG → image → 2D → PNG: stage.js makeGutPic
- Organ cover mask drawn in 2D: stage.js syncVeinsNow → veins-gl.js setOrgans
- Colour strings parsed through a 2D canvas: stage.js colorParser **NEW**
- Hidden SVG lumen widths and varix strand writes: **FIXED** 2d3566ee (held while the GPU draws; ?tubeall=0)
- Liver path `d` still written to hidden SVG while it eases: stage.js (liver writes), kept for credit.js
- Pressure-change halos on the figure are SVG: circle `r` animated by CSS keyframes `haloRing`, number as SVG text: stage.js stepHalos, app.css `.halo circle` **NEW**
- FibroScan waves: hidden SVG arcs' `d` and opacity written every frame so label-gl can parse them back: stage.js scanTick → scan-waves.js paintWave **NEW**
- FibroScan / Doppler probe heads, beam and reading drawn in 2D then uploaded, redrawn on every angle or reading change: label-gl.js seg (headCv), at (beamCv, sHeadCv) **NEW**
- Probe geometry read back from SVG attribute strings each draw (getAttribute('d'), transform regex): label-gl.js seg / at **NEW**
- Probe beam CSS `filter: blur(5px)`, selected-vessel shadow `blur(2.5px)`, shunt `drop-shadow`: app.css `.sp-beam`, `.v-shadow`, `.vg.shunt-*`
- Back-edge vessels animate CSS `filter` (opacity) on select: app.css `#backEdges .vg` transition filter **NEW**
- Flow-dash cover mask 2D + getImageData: stage.js dashCover (only ?flow=dashes)
- Callouts, probes, catheter pills laid out as DOM per glide frame: stage.js sitesPaint, scanPaint, dprobePaint, cathLabels
- Catheter readings travel into the summary by per-frame DOM writes: cath-flip.js, stage.js cathLabels **NEW**
- Probe placement reads every card's box and style: stage.js scanHead (every 250 ms), scanCards, dprCards, cathFocus **NEW**
- Doppler monitor hit test every 200 ms with elementFromPoint (forces layout, even at rest): stage.js dprMonitorLook setInterval **NEW**
- Label blockers, dive start boxes: stage.js readBlockers / cardSpace, setDiveScale
- Label fades read each label's opacity: stage.js els (getComputedStyle per label at fade start) **NEW**
- Remaining overlays (stents, balloons, guides) and organ filters/masks: stage-over.js overRun, organ-paint.js, shape-gl.js

## 2. Labels
- Text, halos and filters drawn in 2D then uploaded: label-gl.js drawBlock / grow / fill (ctx.filter), canvasCaps
- Live labels re-read computed style each frame on hover/transition and repaint + texSubImage2D: label-gl.js refresh / describeBlock
- Callout hole masks in 2D, plus canvas getBoundingClientRect: label-gl.js holeMask / cutHoles
- Atlas full → SVG fallback, repack re-uploads everything: label-gl.js repack / svgOnly
- Text widths by measureText: stage.js textW, labelGlSync measure
- Label DOM still laid out per glide frame outside a ride: stage.js syncView → updateLabels
- Labels animate CSS `fill` (hover, value change): app.css `#labels .lb .lb-name/.lb-val` transition fill **NEW**

## 3. Lobule and sinusoid
- Wide copy, world tissue in 2D (main thread and worker), rim fade, pill copies: lobule-zoom.js buildWide, paintWorld, landed, rimFade, pillCopy / pillDown, tissue-paint-worker.js (OffscreenCanvas 2D) **worker NEW**
- Field tile source drawn in 2D before the GPU blur: lobule-zoom.js fieldTile / paintField
- 2D tissue fallback with its own 2D crossfade (xfCv) when tissueOnGPU says no: lobule-zoom.js draw path ("v") **NEW**
- Readbacks to test canvases: lobule-zoom.js probe, tileBlank, opaqueOnly, rgbaOf, distTo colour parse **NEW**
- Ductules/lymph 2D: **FIXED** d588b6a9 (fx-gl.js); 2D kept as fallback (paintFx, fxCheck readback)
- Tile quiet/liver copies: **FIXED** d588b6a9 (tile-gl.js); CPU blurTile kept for 2D fallback
- Lobule labels glide by CSS `left/top` transitions while leaders follow with per-frame offsetLeft + getComputedStyle(::before): app.css `.lz-labels.lz-ease .lz-lab`, lobule-zoom.js glideLeaders / syncLeaders / lettersOf **NEW**
- Label sizing reads offsetWidth + padding per label: lobule-zoom.js r1, placeCall, inV; card boxes: dist, liveFree **NEW**
- Resolution change stacks layers in 2D: lobule-zoom.js resSwap (fresh), res-fade.js stackInto
- Sinusoid resolution fade: **FIXED** c394de38 (sinusoid-gl keep/mix); 2D svSwap stays for ?svmix=0 / no GPU
- Sinusoid colour parse via 2D: sinusoid-view.js stepState rgbCv
- Sinusoid caption layout reads per layout: sinusoid-view.js layoutEnds, blockers **NEW**

## 4. Glass
- Backdrop blur: **FIXED** db5683fd (html[data-glsolid] turns every non-GPU glass solid; blur rules remain only behind ?glasssolid=0)
- GPU glass layout reads: **PART** ffd42679 (reads only when something may have moved, so still during motion): glass-gl.js draw / hostReads / readPanes / heldBy / fadeOf
- Sheet glass, lobule pills, labels under glass read per frame: sheet-glass.js sheetPanes, lz-pills.js pillOf / readPills, stage.js frostOver
- Callout mask 2D + colour normaliser 2D: glass-gl.js maskOf, own
- Glass on its own canvas copies the source by createImageBitmap + upload: glass-gl.js take (copy path only) **NEW**
- Glass shader compile: **FIXED** ae5f781a

## 5. Shaders and GPU stalls
- Local synchronous compile + status reads (not on gl-compile.js): fx-gl.js compile **NEW**, tile-gl.js ready **NEW**, organs-gl.js program **NEW**, organ-paint.js program, shape-gl.js compile, res-fade-gl.js sh / kit
- Lazy first-use programs: veins-gl.js overLay (layP), upDraw (upP), reuseDraw (rz.P)
- field-gl.js draw → publish every draw, sendCanvas getError pairs
- Synchronous getError / checkFramebufferStatus inside draws: tile-gl.js send / pass / make, fx-gl.js target, tissue-gl.js makeTarget, res-fade-gl.js copy, sinusoid-gl.js **NEW**
- 8808b771 cut status queries to one per shared program (gl-compile.js only)

## 6. Instruments (cards)
- Bedside monitor ECG and readings in 2D every frame: vitals-monitor.js draw / loop
- HVPG tracing: **PART** f121c29c (moving parts on trace-gl); panel, grid, level names, notes still 2D: hvpg-proc.js drawTrace; cv.getBoundingClientRect on every model update: hvpg-proc.js update **NEW**
- trace-gl's own word atlas drawn with fillText on a 2D canvas, getImageData on flush, 2D colour parse: trace-gl.js createTraceGL / entry / flush / colour **NEW**
- Pressure-over-time chart 2D: pressure-time.js drawNow, drawShadow, layoutMarkers, drawMarkers, still-layer.js lay
- Pressure profile 2D: charts.js draw / geometry
- Doppler words, ticks, calipers 2D; ring copies in 2D (off/T/colCv) and per-frame getComputedStyle + Range rects: doppler.js draw / ring / put / box
- Doppler DOM band/ticks animate `left`/`width`: app.css `.dop-band`, `.dop-ticks > span`, `.dop-mark` **NEW**
- Endoscopy: GL copied into 2D, bleed 2D, crossfade 2D, CPU per-pixel fallback, scope tile: instruments.js draw / keep, endo-bleed.js, endo-render.js renderEndo, scope-tile.js paint
- Varix cross-section and abdomen 2D, ink readback: instruments.js update / inkRows
- FibroScan elastogram copied into 2D, words 2D: fibroscan.js paint / elastogramPair / drawElastogram
- Belly fill, IAP bar, endoscopy grade bar animate `height`/`width`: app.css `.ab-belly-fill`, `.ab-iap-fill`, `.endo-bar i` **NEW**

## 7. Card charts and numbers
- SVG charts redrawn per frame of their eases: tool-profile, tool-curve, tool-course, tool-flows, tool-fluid, tool-lumen, tool-causes, tool-criteria, talk-trace, visual-plane, flow-time, col-wave, svg-morph.js **svg-morph NEW**
- Those draws read layout/style: tool-fluid.js draw / labels (clientWidth), tool-profile.js draw, talk-trace.js draw / drawMiles, visual-plane.js draw / dotNow (getComputedStyle transform mid-glide) **NEW details**
- Text widths by 2D measureText: talk-trace.js, tool-flows.js, tool-profile.js textW, presenter.js chipRoom **NEW**
- Rolling numbers rewrite text nodes: util.js countTo / rollStep / putNum, readouts-pane.js update (with offsetWidth to restart flash)
- Time-lapse day count rewritten every frame: timeline.js jump tick **NEW**
- Readout tile fit reads style per tile: presenter.js fit (tile number fit) **NEW**

## 8. Card, sheet and dock motion (layout animations)
- Teaching card transitions `top`, `height`, `width` (and `filter` in high contrast): app.css `.pz-shade:is(.pz-card,.stack)` transition-property **NEW**
- Data card column/sheet slides by `top`: app.css `.pz-data.col`, `.pz.pz-wide .pz-data.pz-sheet` **NEW**
- Stacked tiles fold by `max-height`/`margin`: app.css `.pz.stack .pz-data > .pz-tiles`; `.pz-ghost` max-height **NEW**
- Presenter: placeLip (left/top/width), dockTo → dockPaint / dockVec, slideUnder / liftTo / measureUnder, setFold (maxHeight, margins), squeeze (top/maxHeight writes) 
- Presenter progress links positioned by `left`/`width`: presenter.js build (p.now / p.was / p.link) **NEW**
- Vertical dock folds by WAAPI `height`/`width`: main.js foldDock **NEW**
- Phone sheet: main.js sheetBehaviour (style.height per move), settleHeight (WAAPI height); app.css panel `height` transitions (`.panel, .treat-card`, mobile sheets 3847/3858) **CSS NEW**
- Tests workspace: dock.js updateSize; `.instrument-workspace.fit` height transition; tab labels `max-width`/`margin-left` **CSS NEW**
- Action card moves by `left`/`top`: app.css `.action-card`, `.action-card.docked` **NEW**
- Thumb sheets: util.js sinkTo, app.css thumbIn / thumbOut (`--sink`), polygon clip
- Lists: util.js reconcile, foldHidden; checklist answers `grid-template-rows`: app.css `.pzc-a`, `.ac-info`, `.um-inline` **NEW**
- Menus: menu.js showPreview (height), profile (SVG); `.umenu.sheet` bottom/height, `.um-pv` top/height, `.modal-back.kb` top/bottom, `.modal` max-height **CSS NEW**
- Segmented-control glide moves a pseudo-element by `left/top/width/height`: app.css `.seg-glide::before`, seg-glide.js put; palette glide `.pal-glide` width/height **NEW**
- Zoom pill animates `bottom` and `font-size`: app.css `.app.figure-focus .zoom-pill` **NEW**
- Catheter callout `top`, summary box `top`: app.css 3332 `.cath-label`, `.cath-sum-box` **NEW**

## 9. Chrome around the figure
- Top bar lens/pill plate WAAPI `width`: topbar-motion.js run (lines 103, 109)
- Legend gradient through color-mix repaint: legend-morph.js morphGradient / morphKey / fadeIn
- Scroll fades: scroll-edges.js sync; util.js scroller sync (getComputedStyle per scroll) **util NEW**
- Toast placement and menu placement read layout: util.js put / placeToasts, menu.js place / shiftX
- Focus ring is SVG + box reads: focus-ring.js lit / clipBoxes
- Settings switch knobs animate `width`: app.css `.switch span::after`, `.ac-toggle .switch-vis i`, `.lens-opt .mt-sw::after`, `.ab-tg`, `.ab-dp-alb` **NEW (small)**
- Loading skeleton animates `background-position` forever while shown: app.css `.skeleton` / `shimmer` (why.js) **NEW (small)**
- Colour, background and box-shadow transitions on buttons, chips, tabs (paint-only, no layout): app.css, about 60 rules **NEW (small)**

## 10. Idle and timers
- Corner credit polls every 1 s (querySelectorAll at rest); in the lobule, sinusoid and talks it re-runs the full CPU credit test every second: credit.js pollKey / soon → screenTest **NEW**
- Doppler monitor hit test every 200 ms: stage.js dprMonitorLook **NEW**
- Corner credit CPU grid, getScreenCTM, getImageData after each settle: credit.js screenTest / worldLevel / gridRead / paint
- Diagnostics only: perf-readout.js tick (unconditional rAF), debug.js tick, stage.js organPathsNow (1 s), blur-gauge.js
- Export only (not motion): png-encode.js, veins-gl.js snapshot (toDataURL)

## Reviewer rows (def4e7ba) checked at ffd42679
FIXED: sinusoid svSwap / svFadeStep (c394de38); res-fade fadeOver / mixInto on the default path (3f369ef7, 2D fallback kept); glass-gl programsOf (ae5f781a); remaining CSS backdrop-filter surfaces (db5683fd); hidden lumen width writes (2d3566ee).
PART: hvpg-proc.js (f121c29c, static panel still 2D); glass-gl readPanes / measure / hostDraw (ffd42679).
STILL OPEN, unchanged: vitals-monitor draw / stillTop / stillCells; label-gl refresh / drawBlock / holeMask / repack; lobule resSwap; res-fade stackInto; res-fade-gl kit; veins-gl overLay / upDraw / reuseDraw; field-gl publish / sendCanvas; topbar-motion run; legend-morph morphGradient / morphKey; main.js sheetBehaviour / settleHeight; presenter placeLip / dockPaint / slideUnder / measureUnder / setFold; menu.js showPreview / profile; util.js reconcile / foldHidden / sinkTo / countTo / rollStep; app.css thumbIn / thumbOut; dock.js updateSize; scroll-edges sync; readouts-pane update; perf-readout / debug; scope-tile; doppler; endoscopy and FibroScan copies; endo-bleed; pressure-time; charts.js; tool-* / talk-trace / visual-plane; stage.js rasterPlate, stage-over overRun; focus-ring; dash cover; probe-beam and vessel-shadow blur; lobule 2D fallbacks.
