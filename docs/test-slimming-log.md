# Test slimming log (B6)

Every source-text test removed, and what covers it now. Lint rules live in `scripts/source-shapes/`.

| test | what happened | covered by / reason |
|---|---|---|
| coil-hold.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (1 rule) | a collateral's coil target is held either side of its threshold (coiled past 0.25, straight below 0. |
| pan-start.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (1 rule) | a pan starts where the finger is once past the slop: the figure does not jump the slop in its first  |
| dock-hist-reset.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (1 rule) | dock.js clears the tiles' own histT/histV, never an `x.hist` no tile has, which threw and stopped th |
| leader-spares.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a leader left without a blank marks the shortfall and the refill lays the labels out again, or the c |
| liver-shade-steady.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (1 rule) | a congestion shade keeps the visibility lvFade gives it: no visibility flip on every liver frame (mo |
| label-hold.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | laid-out labels are not rebuilt during a transition and catch up in the first frame after it (2 Nov  |
| label-key.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the label key builds the text of its object inputs once per object, never JSON.stringify on every ca |
| prealloc-cells.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the organs' changed box and the ascites pool are sent from one kept Float32Array into kept GPU buffe |
| seen-only.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the side panel's readings wait while it is shut and take the newest frame when it shows (R17, 2 Nov  |
| credit-path-memo.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (1 rule) | the credit keeps a path's Path2D while its outline is the same: 73 to 95 ms a look on a Mac otherwis |
| day-polys.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the jump's day count is handed to the GPU picture as outlines, not written as a path string at each  |
| lobule-open-retry.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a lobule asked for from the circuit opens whenever the anatomy is back: no retry cap that gives up ( |
| label-dpr-cap.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | the stage labels draw in the figure's canvas at its capped density (2x); the label layer has no canv |
| term-tone-token.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a slide term's tone goes through toneCol, never a bare --tr- prefix: the right atrium's label fell b |
| callout-glass-shape.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the glass reads a callout's shape at glass > model > path, or no glass is drawn and the callout is t |
| credit-label-boxes.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the credit polls on the labels' 8 px grid boxes, not on each laid-out number: 560 reads in 15 s on a |
| vessel-paint-held.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a vessel's colours are a field the GPU reads, replaced only when one of the two changes; no SVG stop |
| doppler-frame-cost.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the Doppler sends only its new lines to the GPU (a phone dipped hard writing them on the CPU, 22 Oct |
| view-sync-same-frame.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a view moved by a frame callback is synced with the figure's draw in the same frame: labels, lines a |
| chart-keep.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | a chart's still parts are kept as a GPU picture by signature; the Doppler keeps its velocity scale a |
| fluid-one-look.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the ascites has one look: the GPU draws it with the plate off too and the SVG copy stays hidden (17  |
| first-interactive.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | P3: the service worker registers once the page is left alone, the sinusoid's shaders start in a quie |
| cath-tag-hairline.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (2 rules) | the catheter tags print with a hairline: 2 px stroke clipped to its inside, in the glass edge (1 Nov |
| figure-fades.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | the figure's resistors and the lobule's pointer fade and glide on a change, never snap (17 Oct) |
| site-width-digits.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | a site reading's width is keyed on its text with digits as zeros, and its digits are tabular, so a c |
| congestion-no-halo.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | the Congestion lens shows congestion by the vessels' colour alone: no halo (his pick, 20 Oct 2026) |
| idle-wake.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | the idle loop looks once a second while shown and still, keys the blood setting on the store version |
| morph-joins.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | a change between views draws from joins found ahead at the widths between the views, so no frame fal |
| glass-budget-hold.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | a shared blur in use this frame is never freed by the budget, and a glass hook that throws once is k |
| doppler-wave-labels.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | wave letters at least 18 px, margins follow their size (pins-stage-gl: WAVE_PX) |
| no-event-track.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | the timeline event track classes may not come back (pins-stage-gl: forbid tl-track/rail/marks/core/tags in timeline.js a |
| stage-made-order.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | OVER_ON set before the overlays' watch reads it (pins-stage-gl: ordered need) |
| one-vt-writer.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | the camera has one writer (pins-stage-gl: exactly-2 `vt =` and no stage part declares vt) |
| stent-callout-calm.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | the stent callout waits for growth and morph (pins-stage-gl: stentReady, morphing) |
| lobule-radii-rows.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | a lobule radius change names its vessel (pins-stage-gl) |
| history-compare-paused.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | History repaints and Compare fills while paused (pins-stage-gl) |
| overlay-key-varix.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | overlays' rebuild key holds no varix number (pins-stage-gl, two between-rules) |
| plane-line-follows-dot.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | the walk line follows the GPU dot (pins-stage-gl) |
| label-paint-reads.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | the FibroScan probe finds the liver from numbers; the layout-read half is covered by layout-read-allowance.json (pins-st |
| glass-apple-pins.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | card-glass blur path on Apple/Metal: every blur target is plain RGBA8 (float and half-float are not  |
| gesture-zoom-cost.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | a hand's zoom reads the camera without a style or layout read (clientToVBFast), and the lobule's han |
| phone-leftovers-1nov.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | leftover phone layout bugs of 1 Nov 2026: id width beside the topbar, placeMulti's short-leader fall |
| visual-ownership-b01-b09.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (6 rules) | visual-ownership fixes of the 2 Nov 2026 static review (B01, B02, B07/B08, B09): a words wrapper is  |
| credit-still.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | the credit reads no figure shape while the figure is pinched, panned or glided (2 Nov 2026, "zoom is |
| lobule-opaque-pass.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | Z3: the lobule's whole field alone covers the canvas, ahead of the fade check |
| view-alias.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | the stage's view (vt) is replaced, never changed in place: vt, homeAt and vtTarget are three objects |
| will-change-layers.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (8 rules) | will-change is a layer held in memory: the lobule, sinusoid and divider-guide layers have it only wh |
| keys-and-start.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | review 18 and 24: the Escape order closes popover, dock, panel with focus handed back, and a preset' |
| treat-swipe.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (7 rules) | review 20 and 21: the phone Treat card is one stack of panes (one height), a swipe carries a settlin |
| menu-cold-open.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | premium feel R15: the menu opens in one frame and fills the next; a cold open says Loading… and fade |
| organs-whole-live.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | the organs never fall back to the page's SVG while their pictures are made (2 Nov 2026, "no SVG fall |
| iphone-app-card.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | an iPhone opened from the Home Screen: the teaching card drops to the screen's edge with concentric  |
| label-carry.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (6 rules) | a presenter's small camera move keeps its labels (31 Oct): only the leaders ride away, the label lay |
| gl-classes.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (5 rules) | gl-on and gl-plate follow the GPU's state by what it tells the stage, not by a write in every sync ( |
| glass-targets.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (6 rules) | the glass's blur targets on a real GPU (Apple's Metal included): each is checked once as made or res |
| reveal-framing.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | 22 Oct: a deck opened with the figure beside where it belonged, then moved to the middle: the cover  |
| lobule-gpu-free.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | the lobule's tissue gives its GPU copies back as soon as their canvases are given back (performance  |
| ink-pass.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (4 rules) | F1: the presenter's ink is a pass of the figure's present, not a canvas of its own |
| label-fade-hold.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (3 rules) | "labels turn on and off randomly" (Mohammad, iPhone, 2 Nov 2026): a label's entry fade must not stay |
| history-menu.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (8 rules) | the History menu from the timeline clock stays compact: rows only, no Copy action or header |
| label-host-ride.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs (6 rules) | S1: label-gl in host mode keeps the view-change ghosts and the camera ride, and draws nothing outsid |
| label-onvessel-halo.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | no label carries an SVG filter; the on-vessel halo is a 7 px stage-coloured stroke under .cmap only (pins-stage-gl: CSS  |
| glass-solid.test.js | moved to scripts/source-shapes/pins-stage-gl.mjs | no backdrop-filter or CSS blur in the styles; every glass the GPU does not draw is solid (pins-stage-gl: CSS scans) |
| frame-read-phase.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (5 rules) | the frame's read phase (1 Nov 2026, zero layout inside the frame): boxes are read first in a frame t |
| label-pills.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (8 rules) | a label's pill (31 Oct, his yes): the figure's label pills are their fill alone with no hairline, 6  |
| tests-close-keeps-view.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | closing the Tests card (17 Oct): a fitted view is fitted again to the space the card leaves; a view  |
| theme-resize-3nov.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (12 rules) | glitch audit second pass (3 Nov 2026): theme epoch (every painter registers onTheme), resize (the do |
| ctx-lazy.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (9 rules) | WebGL contexts are made when their view is about to show and given back after (2 Nov, plan item 5):  |
| circuit-paint.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (6 rules) | the circuit's pan and zoom frames paint only on the GPU: no SVG grid, zones or dots (26 Oct "Circuit |
| dive-paint-ahead.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (6 rules) | HVPG 5 to 6: the dive into the lobule for a new patient paints the tissue bitmap ahead, never on the |
| drag-class-guard.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (8 rules) | review 31: a drag or pinch does not re-add a class the app already has (it fires four MutationObserv |
| table-pending-rows.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (9 rules) | a comparison table never shows "…" and never stays blank: a row whose patient is still computed show |
| plate-hidden-masks.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | while the GPU draws the plate its SVG groups are hidden and their masks turned off with them (a hidd |
| gl-hygiene.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (9 rules) | 22 Oct review: the GPU is let go of, or fallen back from, where the figure or an instrument is not s |
| organ-read-kept.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (9 rules) | the organs' groups are read for painting once and kept until something they were read from changes ( |
| layout-thrash-sweep.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | 31 Oct sweep of forced layouts and repeated figure updates on the hot paths: hover is read in the re |
| lobule-exit-hold.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | out of the lobule to a wider view the camera only zooms out: the lobule's framing is held in the spa |
| scope-row.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (6 rules) | the endoscopy data card on Mac and iPad landscape: a large view, its readings in one compact row, ev |
| lobule-view-uniform.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (10 rules) | the lobule's captions and leaders follow the camera as a view the GPU draws with (3 Nov 2026), not a |
| chip-open.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (12 rules) | menu chips answer their menu (1 Nov 2026): Blood, Layers and the lens chip turn their chevron and ho |
| doppler-gate-tiles.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | a stent's sample spot is chosen by tapping the Proximal, Mid or Distal tile under the Doppler trace: |
| clamp-label-place.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | a narrowing's "60 %" sits beside its clamp with one formula for the spot (22 Oct: the callout did no |
| flow-time-refit.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (6 rules) | a chart in a card draws its type at 12 px on screen: set larger by as much as the card's zoom shrink |
| rest-pass.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (8 rules) | rest passes: layout work measured between frames, never inside the render loop; the presenter's dock |
| sweep-fixes-1.test.js | moved to scripts/source-shapes/pins-ui-gl.mjs (7 rules) | small layout rules from the overnight screenshot sweeps (batches 01 to 03): each was seen broken on  |
| gpu-storage-kept.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (6 rules) | R05: reusing a JS array is not enough: the vessel layer's dynamic GPU buffers are kept too, written  |
| boot-rise.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (8 rules) | premium feel R10: the boot is the figure's first breath: the cover lifts as the figure rises, on opa |
| rise-organs.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (6 rules) | out of the lobule with a new patient (HVPG 7 to 8): the organs are repainted before the lift, so no  |
| plate-raster.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (6 rules) | the organs reach the GPU as strips of pixels, not as a canvas (Safari stalled up to 750 ms on each p |
| blood-motion-round2.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (6 rules) | round 2 motion review (B9, B10, B4, B6): the moving blood's eases keep easing: the loop sleeps only  |
| plate-resume.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (7 rules) | back in the app on iPhone or iPad the organs showed almost white for a moment: the plate waits while |
| cath-frame-order.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (7 rules) | the HVPG catheter's frame (26 Oct): the shaft is sampled once and sent once, labels laid out late in |
| no-pop.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (9 rules) | motion and heat review, 17 Oct ("Fix all"): things that appeared, vanished or jumped in one frame fa |
| no-pops-late.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (12 rules) | the last of the motion review's pops (P3, P13, P16-P23): with Reduce Motion the movement goes but ev |
| teardown-leaks.test.js | moved to scripts/source-shapes/pins-motion-gl.mjs (7 rules) | teardown leaks (bugs-recs B03 to B06, B29, 2 Nov 2026): what a view owns is let go when the view goe |
| belly-rate-no-flash.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the belly's daily balance never flashes (19 Oct): one balanceLine, no dip-and-return timer |
| cam-arc.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; long camera moves pull back and come in (camera recs B, 29 Oct); Reduce Motion keeps the short plain glide |
| cath-settle.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; a catheter slide with a new patient changes the patient before its camera moves, the catheter then drives the  |
| causes-looks.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the causes chart reads no computed style and keeps no .pcs-* rule (chart looks in code, WP7) |
| cavity-spans.test.js | source assertions removed (1), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; the GPU fills the ascites from the cavity's half-width per row: FLUID_R is the ellipse the rows are cut from |
| circuit-resistor-segments.test.js | source assertions removed (1), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; the Circuit talk, slide 2 to 3 (16 Oct crash): each segment takes its line's id |
| credit-art.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the corner credit's art test lives in the figure's own coordinates: a camera move reads no shape from the page |
| disease-pills.test.js | source assertions removed (1), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; a disease name in a teaching card is set in a pill, marked from one list (the markup regex's capture groups) |
| doppler-stent-course.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; a stent probe's name carries its gate (probeName(meta(), gateOf())) |
| endo-size.test.js | source assertions removed (1), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; the scope draws a large varix (5 mm or more) large and bulging through endoGrow (17 Oct) |
| flank-mask.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the organs' copy for the GPU leaves the flank out: it sits under the diaphragm's fade, clear from y 420 down |
| fluid-lumen-looks.test.js | source assertions removed (1), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the fluid balance and the vessel cross-section read no computed style (chart looks in code, WP10) |
| glass-motion-translate.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; an animation of the translate property moves the glass as a transform's does |
| gpu-probe.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the debug overlay's GPU readout: off, a step only runs; the name and closure are made only inside the probe |
| input-latency.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; input to first change (recs R2): inputToPaint is the scheduler's own measure |
| join-room.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; a join easing wider inside its binning circle keeps its cells: the binning is patched in place, not made again |
| key-chevron-lanes.test.js | source assertions removed (2), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; the key's chevron lanes come from keyChevron, no KEY_IDS list |
| look-signature.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the vessel look's signature (look-sig.js) sees every number the old JSON text did: no JSON.stringify of the lo |
| organ-art-lite.test.js | source assertions removed (2), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; lighter organ art (off by default) syncs with its Settings switch |
| organ-paint-job.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the painter's room is the picture's size, so a picture is cut at the size it will be drawn |
| plane-callouts.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the HVPG against PPG plane: no key beside it on a Mac or iPad, an iPhone keeps the key under it |
| plane-looks.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the plane reads no computed style and keeps no .pze-* model rule (chart looks in code, WP9) |
| rise-path.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; out of a zoomed-in lobule the camera pulls straight out toward the next view, with no sideways pan |
| stop-tokens.test.js | source assertions removed (1), behaviour kept | 1 as lint rule(s) in pins-mixed-a.mjs; the organ painter takes its gradient stops from the generated table, never a style read |
| trace-labels.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; the event labels of a talk-so-far chart are level over the plot, each time point named once |
| veins-relay.test.js | source assertions removed (3), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; binVeins with room in its cells' lists writes a changed vessel in place (memo.relay) |
| worker-recovery-b20-b22.test.js | source assertions removed (2), behaviour kept | 2 as lint rule(s) in pins-mixed-a.mjs; a failed sweep worker is dropped and replaced or bypassed (B20) |
| blood-cells.test.js | source assertions removed, behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; A frame where only the blood moved repaints only the cells a lumen can reach (binVeins' `blood`) |
| blur-gauge.test.js | source assertions removed, behaviour kept | 7 as lint rule(s) in pins-mixed-b.mjs; Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop- |
| callouts.test.js | source assertions removed, behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js) |
| cath-pill.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; The HVPG catheter's two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026,  |
| clot-shape.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen. |
| coil-bin-reach.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st |
| credit-cath-shaft.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; The corner credit stood on the catheter's shaft (HVPG 2, an iPhone held sideways |
| deck-review-bugs.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; Three bugs from the external deck review (18 Oct) |
| engine-crash.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; An engine that throws, or whose numbers stop being numbers, stops the clock and says so once ('crash'), keeps |
| ext-review-fixes.test.js | source assertions removed, behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c |
| fact-target.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is |
| fen-place.test.js | source assertions removed, behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis) |
| fibrous-band-ends.test.js | source assertions removed, behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e |
| fingerprint.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; One fingerprint (engine/fingerprint.js) for the worker's slide states and the presenter's live model during a  |
| flow-judge.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js). |
| fork-joins.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; A pair of members, order-free. Splenic vein from the right, on to the left |
| glass-gpu-mask.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; The glass's masks and colours with no canvas 2D (1 Nov 2026, Mohammad |
| heat-once-a-frame.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work |
| hidden-levels-follow.test.js | source assertions removed, behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; A patient changed while the lobule or the sinusoid covers the anatomy |
| idle-rest.test.js | source assertions removed, behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers |
| label-build-sweep.test.js | source assertions removed, behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; The label pool's deferred builds (stage.js blockBuild, renderBlock, late) |
| ladder-pills.test.js | source assertions removed, behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; The Gut to heart ladder's two pills, HVPG and PPG, in the plot's top right (Mohammad, 22 Oct |
| lesion-ease.test.js | source assertions removed, behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion- |
| lobule-dive-rim.test.js | source assertions removed (7), behaviour kept | 7 as lint rule(s) in pins-mixed-b.mjs; the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas |
| long-frame-log.test.js | source assertions removed (4), behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; The ?perf long-frame log and the slowest inputs (recs P4, R2) |
| no-cavity-glow.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays |
| organ-names-off-vessels.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov) |
| organ-paint.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; The organs painted live on the GPU (organ-paint.js) read their colours from the page's computed styles |
| path-cmds.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; A path's commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver |
| path-pieces.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; The organs' outlines read piece by piece (path-pieces.js) |
| perf-mac-30oct.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; His Mac ?perf readouts on 8d45bef7 (30 Oct) |
| plane-csph-words.test.js | source assertions removed (6), behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; The stiffness and platelets plane names its own zones (Mohammad, 19 Oct |
| pressure-along.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; Where the pressure falls along a stenosed vessel (combined plan V1) |
| quiet.test.js | source assertions removed (6), behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; one clock of input for deferred work (quiet.js): no second listener set |
| reverse-arrows-colour.test.js | source assertions removed (6), behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve |
| shader-warm.test.js | source assertions removed (7), behaviour kept | 7 as lint rule(s) in pins-mixed-b.mjs; the shader warm-up order: organ stack, layers, fade and glass compile before first use |
| short-vessel-labels.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a |
| sin-perfusion.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; Review G15 (16 Oct): the sinusoids' strands are drawn 60 % fainter and taper to a quarter of the sinusoid's wi |
| spleen-growth-live.test.js | source assertions removed (6), behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; A spleen growing through a time-lapse stood still under the organs' picture, jumped bigger, waited and jumped |
| stage-dive-record.test.js | source assertions removed (6), behaviour kept | 6 as lint rule(s) in pins-mixed-b.mjs; Push B of the one-camera record (one-camera-record-plan.md) |
| sw-yield.test.js | source assertions removed (4), behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; A software renderer's yield (src/ui/sw-yield.js) |
| velocity-normal.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-b.mjs; Colored by velocity, each vessel is set against its own normal range (velNormal.js) |
| vessel-pick.test.js | source assertions removed (4), behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; vessel picking uses the vessels own data (vessel-pick.js), never DOM hit-tests |
| vitals-gl.test.js | source assertions removed (7), behaviour kept | 7 as lint rule(s) in pins-mixed-b.mjs; the vitals monitor is all GPU: no 2D context, no cached pictures |
| wall-numbers-agree.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-b.mjs; The Wall mechanics tiles multiply out (review 19 Oct) |
| warm-vis.test.js | source assertions removed (4), behaviour kept | 4 as lint rule(s) in pins-mixed-b.mjs; The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13 |
| audit-correctness-b.test.js | source assertions removed (10), behaviour kept | 10 as lint rule(s) in pins-mixed-c.mjs; Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). |
| card-sweep-2nov.test.js | source assertions removed (10), behaviour kept | 10 as lint rule(s) in pins-mixed-c.mjs; Card motion sweep (2 Nov 2026, "No more glitches", code only): |
| circuit-nodes.test.js | source assertions removed (14), behaviour kept | 14 as lint rule(s) in pins-mixed-c.mjs; No stray dots in the circuit: a station's marker (dot, label, Δ ring) shows only while a vessel is drawn at it |
| deck-lenses.test.js | source assertions removed (2), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that |
| doppler-alias.test.js | source assertions removed (10), behaviour kept | 10 as lint rule(s) in pins-mixed-c.mjs; Doppler aliasing (20 Oct, Mohammad's pick 2 from the Doppler papers): |
| ease-family.test.js | source assertions removed (12), behaviour kept | 12 as lint rule(s) in pins-mixed-c.mjs; One easing family and one duration scale (combined plan M2): |
| endo-motion.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; The scope's view eases between states (Mohammad, 17 Oct: |
| gpu-glass-steady.test.js | source assertions removed (14), behaviour kept | 14 as lint rule(s) in pins-mixed-c.mjs; The frosted glass drawn in the figure's canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU") |
| heart-glow.test.js | source assertions removed (12), behaviour kept | 12 as lint rule(s) in pins-mixed-c.mjs; The right atrium's slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe |
| hvpg-monitor-reading.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; Review #55 (HVPG slide 3): the catheter monitor's number read 5.3 while the FHVP callout beside it read 4.8. |
| join-trunk.test.js | source assertions removed (10), behaviour kept | 10 as lint rule(s) in pins-mixed-c.mjs; Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk, |
| label-repack.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; label-gl wiring (source checks, as the other label-gl tests: |
| label-track.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; A stand-in for an Animation: its effect's keyframes and timing, its current time. |
| leader-end.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; A leader reaches its label and stops on the edge of what is seen of it: |
| lobule-since.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; A change-since slide (lens 'since', ext-highlights.js) in the lobule views: |
| mark-fade.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; The treatment marks on the figure (a stent's mesh, sutures, the tie on a divided vein, the cross on a closed s |
| morph-sweep.test.js | source assertions removed (13), behaviour kept | 13 as lint rule(s) in pins-mixed-c.mjs; The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy") |
| over-records.test.js | source assertions removed (10), behaviour kept | 10 as lint rule(s) in pins-mixed-c.mjs; The figure's kept shapes (src/ui/over-records.js): |
| paint-gate.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock. |
| portal-split.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; The figure's "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int |
| refine.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; Optional refinement (the organ pictures made sharper, the gut's) shares one small CPU allowance per display fr |
| sinusoid-labels-kept.test.js | source assertions removed (13), behaviour kept | 13 as lint rule(s) in pins-mixed-c.mjs; The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct: |
| slide-ext.test.js | source assertions removed (3), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; The deck visuals packages' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): |
| sweep-fixes-2-brackets.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; The sweep's bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder's phone strip: |
| tile-bar.test.js | source assertions removed (14), behaviour kept | 14 as lint rule(s) in pins-mixed-c.mjs; Each data card tile's scale bar (layout A): |
| varix-look.test.js | source assertions removed (12), behaviour kept | 12 as lint rule(s) in pins-mixed-c.mjs; 29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are", |
| veins-tint.test.js | source assertions removed (14), behaviour kept | 14 as lint rule(s) in pins-mixed-c.mjs; Shape apart from colour in the vessel layer (veins-gl.js): |
| venous-stent.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-c.mjs; A vein a slide shows stented (slide field `stented`): |
| vessel-taper.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-c.mjs; Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov: |
| blood-chain.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; Parcels and arrowheads carried through junctions (combined plan B1 + C1): |
| card-readings-head.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-d.mjs; An instrument card is one fixed card: no readings card tucks behind it or comes out, no handle (Mohammad, 7 No |
| deck-nav.test.js | source assertions removed (21), behaviour kept | 21 as lint rule(s) in pins-mixed-d.mjs; Getting around the presentations (review U3, U5, U7, U15, U22, U23, U24): |
| feedback.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-d.mjs; Beta feedback (18 Oct): Send feedback is one tap into Settings in every mode (talks too), addressed to the one |
| glass-gl.test.js | source assertions removed (4), behaviour kept | 16 as lint rule(s) in pins-mixed-d.mjs; The callouts' frosted glass drawn on the GPU (glass-gl.js, his "GPU glass" pick of 25 Oct): |
| glide-clock.test.js | source assertions removed (19), behaviour kept | 19 as lint rule(s) in pins-mixed-d.mjs; Mohammad, 29 Oct (iPhone): "when I untuck and tuck card stacked ... |
| heat-phase2.test.js | source assertions removed (18), behaviour kept | 20 as lint rule(s) in pins-mixed-d.mjs; Heat, phase 2 (26 Oct): the blood table without a whole clear or a whole upload each frame, the junction width |
| idle-keys.test.js | source assertions removed (22), behaviour kept | 22 as lint rule(s) in pins-mixed-d.mjs; Loops that ran while nothing changed now skip their work, and only that (Fable's review, item 2 and the safe p |
| lens-word-pills.test.js | source assertions removed (5), behaviour kept | 16 as lint rule(s) in pins-mixed-d.mjs; The words name the view the vessels are colored by ("With the vessels colored by congestion"): |
| live-numbers-steady.test.js | source assertions removed (18), behaviour kept | 18 as lint rule(s) in pins-mixed-d.mjs; Live numbers keep one width and are never blank (2 Nov 2026: |
| one-ladder.test.js | source assertions removed (15), behaviour kept | 15 as lint rule(s) in pins-mixed-d.mjs; One pressure chart on every card (Mohammad, 21 Oct: |
| organ-dim.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; The live SVG organs dim and grey exactly as the GPU copy of them does (a lens other than pressure, a selected |
| phone-text.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; Phone text and labels (review 15 Oct, #23, #48-#51): |
| review-safe-a11y.test.js | source assertions removed (17), behaviour kept | 19 as lint rule(s) in pins-mixed-d.mjs; Review items Q3 (popover listener race), Q4 (mistyped patient links), Q17 (organs by keyboard) and Q19 (screen |
| scene-cam.test.js | source assertions removed (10), behaviour kept | 18 as lint rule(s) in pins-mixed-d.mjs; ── The lobule's records (push A): read from the source |
| scroll-edges.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; Soft edges on lists that scroll (1 Nov 2026): |
| splenorenal-route.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; The splenorenal shunts (spontaneous and Warren) leave the splenic vein midway between the spleen and the IMV j |
| tamponade-bleed.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-d.mjs; The tamponade tube's gastric balloon, up and drawn against the cardia, stops the bleed (the first step; |
| veins-bin-memo.test.js | source assertions removed (15), behaviour kept | 15 as lint rule(s) in pins-mixed-d.mjs; While collaterals coil, one vessel's points change on each model frame and the rest hold still. |
| vessel-blood-visuals.test.js | source assertions removed (21), behaviour kept | 21 as lint rule(s) in pins-mixed-d.mjs; The vessel and blood visuals from the October review (docs/REVIEW_2026-10.md §4, G9, G10, G12, G14 and G17): |
| visual-glitch-sweep-1.test.js | source assertions removed (18), behaviour kept | 18 as lint rule(s) in pins-mixed-d.mjs; Visual glitch sweep 1 (31 Oct): the change halos and the shunt's target name keep their size on screen at any |
| wheel-gesture.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-d.mjs; A trackpad (or wheel) works the slide as a finger does (Mohammad, 22 Oct: |
| deck-instruments.test.js | source assertions removed, behaviour kept | 22 as lint rule(s) in pins-mixed-d.mjs; Deck visuals, package G (src/ui/ext-instruments.js): |
| dive-gpu.test.js | source assertions removed, behaviour kept | 15 as lint rule(s) in pins-mixed-d.mjs; The lobule's dive and rise on the GPU (1 Nov 2026, Mohammad: |
| menu-swipes.test.js | source assertions removed, behaviour kept | 17 as lint rule(s) in pins-mixed-d.mjs; The menu on a touch screen (Mohammad, 18 Oct): |
| oxygen.test.js | source assertions removed, behaviour kept | 15 as lint rule(s) in pins-mixed-d.mjs; Colored by oxygen (Fable review G11, Mohammad yes 16 Oct): |
| fluid-window.test.js | source assertions removed (15), behaviour kept | 15 as lint rule(s) in pins-mixed-e.mjs; The fluid balance's day card (tool { kind: |
| frame-costs-glow.test.js | source assertions removed (18), behaviour kept | 18 as lint rule(s) in pins-mixed-e.mjs; Review P6, P9 and P12 (16 Oct): cheaper glow eases, FibroScan ripples, hidden tubes, label caches and font cac |
| glass-motion.test.js | source assertions removed (5), behaviour kept | 5 as lint rule(s) in pins-mixed-e.mjs; glass-motion.js builds nothing in a frame (2 Nov 2026, "SVG and CPU do NOTHING during motion"). |
| glide-dom-1nov.test.js | source assertions removed (13), behaviour kept | 13 as lint rule(s) in pins-mixed-e.mjs; A slide's camera glide sets off no style passes of its own (1 Nov 2026, iPhone: |
| gpu-fallback-guards.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-e.mjs; Reviewer's checklist, 1 Nov 2026, sections 7 and 9: |
| label-snapshot.test.js | source assertions removed (24), behaviour kept | 24 as lint rule(s) in pins-mixed-e.mjs; The displayed-label snapshot (R17): { seq, gen, items: |
| numbers-agree.test.js | source assertions removed (11), behaviour kept | 11 as lint rule(s) in pins-mixed-e.mjs; Patients numbers agree with each other (review 15 Oct, #6, #7, #8): |
| sweep-fixes-2.test.js | source assertions removed (30), behaviour kept | 30 as lint rule(s) in pins-mixed-e.mjs; Sweep batches 02–04 (16 Oct): the Pressure chart and the HVPG tab read the bottom bar's own HVPG and PPG, the |
| uniform-cache.test.js | source assertions removed (9), behaviour kept | 9 as lint rule(s) in pins-mixed-e.mjs; Laptop-heat quick item Q2: a uniform is sent to the GPU only when its value is not the one the program already |
| blood-shading-fast.test.js | source assertions removed (15), behaviour kept | 15 as lint rule(s) in pins-mixed-e.mjs; The blood's speed-ups of 26 Oct (review/blood-shading-ideas): |
| cards-critique-17oct.test.js | source assertions removed (17), behaviour kept | 17 as lint rule(s) in pins-mixed-e.mjs; Titles, labels and data cards from the design critique Mohammad answered on 17 Oct. |
| heat-cuts-30oct.test.js | source assertions removed (22), behaviour kept | 22 as lint rule(s) in pins-mixed-e.mjs; The performance and heat review of 30 Oct, groups 1 and 2: |
| hover-link.test.js | source assertions removed (19), behaviour kept | 19 as lint rule(s) in pins-mixed-e.mjs; A reading and its vessel light together on hover (sprint brief 8, 1 Nov 2026): |
| lobule-live.test.js | source assertions removed (26), behaviour kept | 26 as lint rule(s) in pins-mixed-e.mjs; The shader lobule (lobule-live.js, A5b push 1): |
| lobule-surround-grey.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-e.mjs; In a lens other than Pressure the anatomy's organs are grey (stage.js plateTargets). |
| review-doppler-text.test.js | source assertions removed (8), behaviour kept | 8 as lint rule(s) in pins-mixed-e.mjs; Code review of 15 Oct, items 3 to 5 and Mohammad's answer A: |
| review-u-items.test.js | source assertions removed (22), behaviour kept | 22 as lint rule(s) in pins-mixed-e.mjs; Review items U2, U4, U8, U9, U10, U11, U12, U13 and U16 (docs/REVIEW_2026-10.md on its branch): |
| tissue-gl.test.js | source assertions removed (26), behaviour kept | 26 as lint rule(s) in pins-mixed-e.mjs; The open lobule's tissue on the GPU (tissue-gl.js): |
| wide-gl.test.js | source assertions removed (26), behaviour kept | 26 as lint rule(s) in pins-mixed-e.mjs; The lobule's wide copy on the GPU (wide-gl.js, 1 Nov 2026: |
| ladders-chart-size.test.js | source assertions removed (22), behaviour kept | 22 as lint rule(s) in pins-mixed-e.mjs; The six ladders' charts on a wide screen: |
| label-gl.test.js | source assertions removed (54), behaviour kept | 54 as lint rule(s) in pins-mixed-f.mjs; The labels drawn on the GPU (label-gl.js): |
| lobule-field.test.js | source assertions removed (47), behaviour kept | 47 as lint rule(s) in pins-mixed-f.mjs; The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the |
| polish-31oct.test.js | source assertions removed (91), behaviour kept | 91 as lint rule(s) in pins-mixed-f.mjs; Tile, menu and number polish, 31 Oct (the "Polish tiles, cards and tables" sprint thread). |
| teaching-features.test.js | source assertions removed (33), behaviour kept | 33 as lint rule(s) in pins-mixed-f.mjs; The teaching features of 25 Oct (review/deck-teaching-ideas/recommendations.md, Mohammad's "All"): |
| card-throw.test.js | source assertions removed (20), behaviour kept | 20 as lint rule(s) in pins-mixed-f.mjs; Next and Back throw the cards on one clock (Mohammad, 2 Nov 2026: |
| dop-probe.test.js | source assertions removed (115), behaviour kept | 115 as lint rule(s) in pins-mixed-f.mjs; The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white"; |
| figure-callouts-17oct.test.js | source assertions removed (32), behaviour kept | 32 as lint rule(s) in pins-mixed-f.mjs; The figure's callouts after the 17 Oct design review: |
| grid-key-phone.test.js | source assertions removed (50), behaviour kept | 50 as lint rule(s) in pins-mixed-f.mjs; The six-case summary (visual: 'ladders', Sites 10 and Where-resistance 8): |
| hardening-e.test.js | source assertions removed (64), behaviour kept | 64 as lint rule(s) in pins-mixed-f.mjs; Production pass, batch E (31 Oct): the search card is a real combobox that keeps Tab inside it, a shared link |
| highlights.test.js | source assertions removed (38), behaviour kept | 38 as lint rule(s) in pins-mixed-f.mjs; Deck visuals, package A (figure highlights: |
| organs-gl.test.js | source assertions removed (100), behaviour kept | 100 as lint rule(s) in pins-mixed-f.mjs; The organs as layers (organs-gl.js): each layer is cropped to its own box on the whole picture's pixel grid, s |
| proc-anim.test.js | source assertions removed (34), behaviour kept | 34 as lint rule(s) in pins-mixed-f.mjs; The treatment procedures played on the anatomy (proc-anim.js): |
| review-lobule-transitions.test.js | source assertions removed (55), behaviour kept | 55 as lint rule(s) in pins-mixed-f.mjs; Fable review (16 Oct), graphics G18, G20, G21 and G22: |
| slide-one-move.test.js | source assertions removed (29), behaviour kept | 29 as lint rule(s) in pins-mixed-f.mjs; A slide change is one move (premium-feel R1): |
| tips-doppler-points.test.js | source assertions removed (60), behaviour kept | 60 as lint rule(s) in pins-mixed-f.mjs; TIPS Doppler's stent slides call out the stent's velocity at all three points (proximal, mid, distal), not onl |
