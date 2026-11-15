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
