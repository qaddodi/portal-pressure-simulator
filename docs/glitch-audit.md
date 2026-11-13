# Glitch audit: status ledger

**Status (11 Nov 2026): almost all of it is fixed.** This was a code-only audit in four passes on 3 Nov 2026 (read at `48afde1`, `a0dfb6d`,
`fb60ce8` and `033cc02`; no browser, no screenshot, no device test): 35 first-pass findings, 18 second-pass, 9 correctness bugs, 2 clock
findings. The finding text is in git history. This file keeps the IDs, because source comments and `tests/audit-correctness-b.test.js`
cite them (B1 to B9, TH1, TH2, RM1 and others), and lists what is still open. The code-health findings of the third pass are in
`docs/refactor-plan.md`.

How the statuses were set on 11 Nov 2026: each item was looked up in the code by name. **Fixed** means the code no longer has the described
path. **Open** means the described code is still there. **Not verified** means the item depends on timing or layout that only a device
shows, or the code moved too far to compare. Severity was P1 to P3 as originally rated; the open items are all P2 or P3.

## Open

| ID | What | Where | Fix noted in the audit |
|---|---|---|---|
| D5 | a Doppler size change allocates a new `ImageData` (2 to 6 MB) | `doppler.js` `new ImageData(RW, RH)`; not verified whether the shader path still reaches it | reuse a pair of stretch textures; grow the ImageData in 64 px steps |
| D6 | the Doppler top strip's fit measures the page (`getComputedStyle`, ranges) and re-reads every 500 ms while the trace runs | `doppler.js` `fitStrip`, `stripLayout` | measure words with the GPU type metrics (`text-gl.js textWidth`); read `--dop-ov` and tokens on a theme or size change |
| F3 | FibroScan does DOM work in its frame (`cv.closest('.pz-tool')`, the reading text) | `fibroscan.js` | work out `side` from the box; write the reading only when it changes |
| F4 | the elastogram is sampled at most 300 x 300 and stretched, so it is soft on a big or retina card | `fibroscan.js` `cap = 300` | raise the cap with the device pixel ratio, keep the saver's limit |
| L2 | labels snap to whole device pixels while they ride, a 1 px jitter against the vessels on a 1x display | `label-gl.js` `Math.round(s.x * dpr)` | sub-pixel placement while riding, snap again at rest |
| G2 | the glass reads corner radii differently from CSS (a percentage or elliptical radius, radii larger than half a side) | `glass-gl.js` `radiiOf` | resolve percentages against the box, carry both radii, scale all four by the CSS rule |
| O2 | overlay marks read computed styles in the figure's frame | `stage-marks.js` `marksBuild` (`getComputedStyle` at several lines) | derive paint and transform from the overlay's own data; triangulate between frames |
| S1 | many sliders gliding at once each ask their own frame and hand over a picture | `slider-gl.js` `ask` | tick all live sliders in one frame callback |

## Not verified

| ID | What | Note |
|---|---|---|
| L1 | the action card's leader and dot lag the figure in a pan or glide | the leader is still a DOM element (`card.js`, `ac-leader`); whether it now follows the camera each frame was not checked |
| C1 | lobule and sinusoid captions shown twice for a frame | `lobule-zoom.js` adds the hiding class in `onPresented`; whether both land in one style pass was not checked |
| C2 | caption halos change thickness with the dive's scale | not checked |
| S2 | a slider's native look stays hidden if the GPU picture is lost | not checked |
| G3 | frost stops at the figure canvas's edge for a pane that overhangs it | not checked |
| O1 | disease easing rewrites the liver's SVG paths on the CPU | `morphLiver` is no longer in `src/`; the liver morph moved and was not re-read |
| RM2 | the label landing glide under Reduce Motion | `label-gl.js` reads the reduced-motion query in several places; the glide itself was not checked |
| FN1 | label widths dropped on every `loadingdone`, not only the first `fonts.ready` | reported fixed by the 3 Nov review; not re-checked |

## Fixed or closed

| IDs | How |
|---|---|
| D1, D3 | the Doppler spectrum and noise floor come from a GPU shader (`doppler-synth.js`, `ee067d1`) |
| D2 | obsolete: `doppler.js` and `fibroscan.js` call `frameAnimating` |
| D4 | a failed GPU frame keeps the last picture; black only where there is no drawer |
| F1, F2 | `keepLayer` holds FibroScan's still parts and the reading's font fit |
| N1 | GPU outlines cut at opsz 14, 20, 24 and 32 for HTML readouts (`scripts/glyphs-opsz.py`, `glyph-data-opsz.js`, `text-gl.js`); SVG readouts keep the opsz-14 cut because Chromium measures SVG text that way (`tests/script-measures.test.js`) |
| N2 | readouts that change often use `keep: true`, so the GPU picture stays and no hand-over happens |
| N3 | the text stroke is cleared under a GPU number (`a0dfb6d`) |
| N4, L3 | by design: `mayTask` runs in the same frame when the budget allows; the label landing glide is a design choice |
| T1 | a chart keeps its last GPU picture on a recoverable failure (`a0dfb6d`); a chart whose GPU is gone for good still shows the page's drawing |
| T2 | closed by the one chart pool with a buffer that grows in 256 px steps (`trace-gl.js`, `docs/gpu-two-contexts-plan.md`) |
| G1, G4 | the drop shadow follows rounded corners (`d4f6ddc`); a changed card list uses the early read phase (`67a6a78`) |
| O3 | closed by decision (Mohammad, 3 Nov 2026): a pinch never reallocates the canvas mid-gesture |
| O4 | the endoscopy tile is shaded by `endo-gl` (`fb60ce8`); the CPU renderer stays for no-WebGL2 only |
| RM1 | labels ride the figure under Reduce Motion (`stage-ride.js`) |
| TH1, TH2 | one theme epoch: `theme-epoch.js` `onTheme`, used by the status bar in `main.js` and the GPU surfaces |
| RS1 to RS5 | one late home refit only if the box moved (`stage-tubes.js`); the Tests card resizes in a rest pass (`dock.js`); a pair cut to one is kept in `wanted`; the charts' shared looks are re-read once, 150 ms after a resize settles (`svg-gl.js`); the label density query is re-armed |
| FN2, FL1 | `size-adjust` and `ascent-override` fallback in `fonts/fonts.css`; labels and glass hold the loading cover (`holdCover`) |
| IN1, TO1, ZO1, TM1 | fixed in `299a97c` (inspector readings, toast removal, toast above menus, Doppler timer while hidden) |
| MN1, MN2 | the menu is built ahead and kept (`menu.js` `spare`); the swipe reads the mover's own eased value, not a computed transform |
| B1 to B9 | `loadPreset` returns whether it applied; no "Restarted" toast for a replaced load; sends during a restart are queued (`host.js`); a failed snapshot marks the entry (`snapFailed`); a main-thread engine error calls `crashed`; `hashchange` loads a pasted link; share links keep only known vessels (`scenario.js`); resume evicts by stamp; the store skips listeners removed during a change. Test: `tests/audit-correctness-b.test.js` |
| W1, W2 | the model clock keeps the step remainder (`stepAcc` in `worker-core.js`); the heart's phase runs on through a patient morph |

## Still not covered by any pass

High-DPI and safe-area handling beyond RS5, memory growth over long sessions, and a full read of the per-frame paths of `veins-gl.js` and
`lobule-zoom.js` (the fourth pass found nothing there). Every P1 here was meant to be confirmed on Mohammad's Mac and iPhone after its fix;
that confirmation is not recorded in the repo. The next useful pass is a device session, not more reading.
