# Visual, animation and lag glitch audit (code only)

3 Nov 2026, read against `claude/settings-topbar-icon-flvft1` at `48afde1`. I found these by reading the code. I ran no browser,
took no screenshot and did no device test. Each item names the file and line, what a person would see, why it happens, and a fix that stays on
the GPU (owner rule: nothing new off the GPU; on a failed or late GPU frame keep the last GPU picture and retry).

**Severity.** P1: shows up in normal use, in one of the areas Mohammad flagged (labels and leaders following the figure, Doppler and
FibroScan lag, numbers jumping). P2: a visible hitch or wrong frame that comes up often. P3: an edge case, a small artifact, or a risk.
**Effort.** S: under half a day. M: one or two days. L: several days.
**Confidence.** *Confirmed*: the code path reads that way. *Plausible*: the code allows it, but it depends on timing or layout that I could
not check without a browser.
**Overlap.** Other threads are fixing labels (C), captions (D), presenter (A), cards and glass (B), sliders, blur, and the Doppler and FibroScan
renderers. Where an item touches their files, it says so. Treat it as input for that thread, not a second fix. The R01–R18 items in the
project ledger are left out.

## Top 10

| # | Area | What you see | Sev | Effort |
|---|---|---|---|---|
| 1 | Doppler | Trace freezes for a moment on every scale, size, window, mode, invert or vessel change (CPU synthesis of every pixel) | P1 | L |
| 2 | Doppler, FibroScan, pressure strips | Sweeps step or judder when the frame is busy (the scheduler can hold their frames back) | P1 | S |
| 3 | Numbers | Big readings change shape and shift a pixel or two each time they settle (GPU outlines at opsz 14, page text at its own optical size) | P1 | M |
| 4 | Action card | Its leader and dot lag the figure during pan, zoom and glides, and do not move at all while the model is paused | P1 | M |
| 5 | Charts | A chart's words and lines blink out for any frame the GPU cannot draw (non-widget charts are hidden, not kept) | P1 | S |
| 6 | FibroScan | Every word, halo and the reading's font fit are drawn again on every frame | P2 | S |
| 7 | Doppler | Noise floor rebuilt on the CPU on every size or density change (card entrance, rotation) | P2 | M |
| 8 | Captions | For the first frame (or more) the lobule and sinusoid captions show twice, page and GPU, with a doubled halo | P2 | S |
| 9 | Glass | Card drop shadows have square corners under rounded cards | P2 | S |
| 10 | Doppler | A failed GPU frame paints the trace black instead of keeping the last picture | P2 | S |

---

## 1. Doppler monitor (`src/ui/doppler.js`, `src/ui/doppler-gl.js`). Overlap: Doppler/FibroScan thread

### D1. The spectrum is synthesised on the CPU, pixel by pixel (P1, L, Confirmed)
> **Status (second pass):** most of this moved to a GPU shader in `ee067d1`. The CPU path still runs until that shader is published and whenever it fails to build, so a first open on a phone still has the old cost. See section 11.
- **Where:** `doppler.js:766-838` (`writeLine`), called from `doppler.js:1122-1124`. `doppler-gl.js:136-176` only uploads the result.
- **What you see:** the trace stops for a moment (a dropped frame or several) whenever the whole ring is redrawn. That happens on a new
  scale (the signal grows or the baseline moves, `fitScale`), a new size (a card settling, a rotation, the top strip refitting), a new
  sweep window, a display mode change, Invert, a new vessel or gate, and the first frame after a lost context. Between those, each frame
  still runs the per-pixel loop for the new columns. That loop costs a `Math.log`, a `Math.pow`, three speckle lookups and up to three
  `power()` calls per pixel. In colour modes it adds `dopplerColor` and `shadeColor` too.
- **Why:** a full redraw is `RW × RH` device pixels. At a 600 × 300 CSS trace on an iPhone that is 1800 × 900 = 1.6 M pixels, all on the main
  thread, in the frame (`full ? cNow - RW + 1 : …`).
- **Fix (GPU):** move the synthesis into the fragment shader. Keep a small texture of mean velocity per spectral line (RW × 1, R32F or RG16F,
  one texel per column, written by `texSubImage2D` as lines arrive). Hash the speckle from (column index, frequency bin), so a line's grain
  stays fixed as it scrolls, like the ring does now. Then compute `power()`, the wall filter, the log compression and the colour map per
  fragment. A full redraw becomes a change of uniforms (scale, baseline, invert, mode), and no CPU pixel work is left. The ring texture of
  RGBA pixels and the `ImageData` go away.

### D2. Doppler, FibroScan and the pressure strips can be held back by the scheduler (P1, S, Confirmed)
- **Where:** `frame.js:255` puts `doppler`, `fibroscan`, `pressure-time`, `charts`, `sinusoid-view` and others in `SECONDARY` (priority 2).
  `frame.js:290-300` (`shedding`) carries them to a later frame, up to `CARRY_MAX` (2) frames, unless `frameAnimating(tag, true)` is set.
  Only `vitals-monitor.js:226,232` ever calls `frameAnimating`.
- **What you see:** on a busy frame (a pinch, a slide change, a model frame landing) the Doppler sweep, the FibroScan wave and the pressure
  strip skip one or two frames and then jump. This is the "laggy Doppler/FibroScan" feel even when each draw is cheap.
- **Fix:** call `frameAnimating('doppler', true)` while the trace scrolls (`doppler.js:1393-1405`, on when `live()` and shown, off when the
  loop stops). Do the same in `fibroscan.js:270-277` and in `pressure-time.js:438-446`. The frame-time gate then measures the real cost
  instead of hiding it as carried frames.

### D3. The noise floor is built on the CPU at every size or density change (P2, M, Confirmed)
- **Where:** `doppler.js:723-744` (`makeNoise`), called from `doppler.js:1137`.
- **What you see:** a hitch as the Doppler card comes in, on rotation, and when the trace gets taller than the last texture. The texture is
  at least (RW + 96) × (RH + 96) rounded up to 128, about 2 M pixels on a phone, with a `Math.log` and a `Math.pow` per pixel and a 1 MB+
  upload.
- **Fix (GPU):** make the noise a hash in the same fragment shader (D1), with `nOff` as a uniform seed. No texture, no CPU.

### D4. A failed GPU frame paints the trace black (P2, S, Confirmed)
- **Where:** `doppler.js:1151-1155`.
- **What you see:** when `gpu.render` returns false (shader still compiling after a restore, a lost context, a ring size mismatch for a frame),
  the words layer fills the trace rectangle black. The trace blinks black.
- **Why:** this predates the owner's "keep the last GPU picture" rule. The GPU canvas under it still shows its last frame; the black fill on
  the words layer covers it.
- **Fix:** when `gpu` exists, skip the black `fillRect` and keep `glFrom = 'img'` so the ring goes up whole on the next good frame. Keep the
  black only for the no-WebGL2 case.

### D5. A size change allocates a new ImageData and new textures each time (P3, S, Confirmed)
- **Where:** `doppler.js:1113-1120` (`new ImageData(RW, RH)`), `doppler-gl.js:148-166` (`stretch` makes two textures and two framebuffers
  per call).
- **What you see:** while a card eases in and its layout width settles over several frames, each frame allocates a 2–6 MB ImageData plus GPU
  textures. That means GC pauses and stutter during the entrance.
- **Fix:** with D1 this goes away. Until then, keep the stretch textures and framebuffers in a pair that is reused, and only grow the
  ImageData (round up to 64 px).

### D6. The top strip's fit measures the page many times (P3, M, Confirmed)
- **Where:** `doppler.js:898-943` (`fitStrip`), `doppler.js:961-983` (`stripLayout`, from `setTimeout(…, 0)` at `doppler.js:1039`).
- **What you see:** a short hitch the first time a vessel shows on a slide, on a new width, and when a time-lapse notice appears. Each of the
  7 steps writes words into the page (`wNow`) and measures them with ranges (`wordsRect`). A `getComputedStyle(cv)` also runs every 500 ms
  while the trace runs (`doppler.js:966-967`).
- **Fix:** measure the strip's words with the GPU type metrics already in `text-gl.js` (`textWidth` at the strip's size and weight, with the
  optical-size tables of `glyph-metrics.js`). That needs no page writes or reads. Read `--dop-ov` and the type tokens when the theme or text
  size changes (the `cssVar` cache already does this), not every 500 ms.

---

## 2. FibroScan panel (`src/ui/fibroscan.js`). Overlap: Doppler/FibroScan thread

### F1. Every word and halo is drawn again on every frame (P2, S, Confirmed)
- **Where:** `fibroscan.js:224-265` (`paintWith`).
- **What you see:** the panel costs more than it needs on every frame of the wave, which matters most on a phone with the Doppler also on
  screen. The depth labels, the time labels, the window lines, the edge and "kPa" are the same on every frame, but each is drawn again, most
  twice (a halo `strokeText`, then `fillText`).
- **Fix:** put the still parts in `keepLayer(ctx, 'fs-axes', sig, …)` as the Doppler scale does (`doppler.js:1170`). The signature is the
  size, CAP, theme and `side`. Each frame then draws only the fitted line and the reading.

### F2. The reading's font is fitted on every frame (P3, S, Confirmed)
- **Where:** `fibroscan.js:254-261` (a loop of `measureText('88.8')` that steps the size down 2 px at a time).
- **Fix:** the result depends only on the size, CAP and theme. Work it out once with F1's signature and keep it.

### F3. DOM work in a frame (P3, S, Confirmed)
- **Where:** `fibroscan.js:191` (`dataSoon(cv, 'reading', …)` and `fibroReading.show` each frame), `fibroscan.js:197`
  (`cv.closest('.pz-tool')` each frame).
- **Fix:** work out `side` with the box (`readBox`, which runs from the ResizeObserver). Write the reading only when `fix1(shown)` changes.

### F4. Soft map on large or retina cards (P3, S, Confirmed)
- **Where:** `fibroscan.js:143` (`cap = 300`), `fibroscan.js:180,210`.
- **What you see:** on an iPad or Mac slide the elastogram is sampled at most 300 × 300 and stretched, so it looks soft next to the sharp
  words.
- **Fix:** the map is a shader, so raise the cap with the device pixel ratio (for example `300 * min(2, dpr)`). Keep the saver's limit.

---

## 3. Numbers and clocks (`src/ui/gl-words.js`, `src/ui/text-gl.js`). Overlap: whoever owns "numbers jumping"

### N1. GPU numbers use opsz-14 outlines while the page sets big text at its own optical size (P1, M, Confirmed)
- **Where:** `scripts/glyphs.py:27` (outlines and advances cut at `opsz 14` only); `styles/app.css:7556` (`body { font-optical-sizing: auto }`);
  `gl-words.js:150-153` (measure), `gl-words.js:236-247` (draw with `textWidth`/`glyphRun` from those outlines), `gl-words.js:301-327`
  (`land` hands over to the page after `QUIET`, `gl-words.js:30`).
- **What you see:** a big number that changes (the Doppler velocity at 28 px, `app.css:3636`; the HVPG/PPG catheter readings at 26 px,
  `app.css:3338`; the pressure-time header at 28 px, `app.css:3575`; the monitor's 24 px values, `app.css:1746`) is drawn by the GPU at the
  opsz-14 shapes and widths. When it holds still for 260 ms, the page's own text takes over. The browser sets that text at opsz ≈ the font
  size, which is Inter's display cut: tighter spacing and slightly different shapes. So the number changes shape, and its width shifts by
  a pixel or two, every time it settles. With end alignment the left edge moves; with start alignment the unit after it moves. This is very
  likely part of "numbers jumping". The digits are tabular in both, so it is not proportional digits.
- **Fix (GPU, no new CPU):** cut the outlines at a few optical sizes (14, 20, 24, 32; `glyphs.py` already instantiates the variable font) and
  pick or interpolate the nearest stop for `L.size` in `textWidth`, `glyphRun` and `textPolys`. `text-gl.js:191-230` already does this for
  advances in paragraph layout. A smaller interim fix: set `font-variation-settings: 'opsz' 14` on `.glw` hosts, so the page sets the same
  cut the GPU draws. That is one CSS line, but it changes the look of big numbers slightly.

### N2. Shimmer at the hand-over to the page's own text (P2, M, Plausible)
- **Where:** `gl-words.js:290-298` (`release`), `gl-words.js:268-284` (`drawn` → `handOff`).
- **What you see:** even with N1 fixed, the GPU fill of flattened outlines (svg-gl) and the browser's hinted text differ in weight and
  edge. A settled number can look like it "breathes" once.
- **Fix:** for readouts that change often (dock tiles, Doppler tiles, catheter readings), use the `keep: true` mode that already exists
  (`gl-words.js:17-23`). The GPU picture then stays, and the page's words stay clear under it as the hit and screen-reader text. No
  hand-over, so no shimmer.

### N3. `.glw-on` does not clear text strokes (P3, S, Confirmed latent)
- **Where:** `styles/app.css:7634` clears `color`, `-webkit-text-fill-color`, `fill` and `text-shadow`, but not `-webkit-text-stroke` or SVG
  `stroke`. Halo rules exist on HTML and SVG text: `app.css:262, 726, 1610, 1637, 1729, 2915-2916, 4241, 7052-7146`.
- **What you see:** if a glWords readout is ever placed on one of those (for example an SVG dial number, which `gl-words.js:134` supports),
  the page's old halo stays under the GPU's new number: a doubled, ghosted caption.
- **Fix:** add `-webkit-text-stroke-color: transparent !important; stroke: transparent !important;` to the `.glw-on` rule.

### N4. Dock and panel numbers land up to four frames after the figure (P3, S, Confirmed)
- **Where:** `main.js:546-552`. The card, dock and inspector updates are `mayTask`s that are allowed to wait up to 4 frames.
- **What you see:** during a busy moment the dock's readings change a few frames after the figure's colours. That is small, but it adds to
  "numbers jump" when they then catch up.
- **Fix:** keep it as a may task, but run it within the same frame when the frame has room.

---

## 4. Labels, leaders and the action card. Overlap: thread C (labels)

### L1. The action card's leader and dot do not follow the figure during pan, zoom or glides (P1, M, Confirmed)
- **Where:** `card.js:712-765` (`position`), `card.js:771-788` (`drawLeader`). It is called only from `card.update` (`card.js:675-679`),
  which runs as a may task on model frames (`main.js:552`), and from resize and `pps:occ` events.
- **What you see:** with a vessel's action card open, a pan or pinch moves the figure while the leader line and its dot stay where the
  vessel was. They catch up in steps at the model's frame rate, up to four frames late. While the model is paused they do not move at all
  until something else calls `position()`. This is Mohammad's top priority: leaders must move 100% with the figure.
- **Why:** the leader is two DOM `<i>` elements whose `width` and `transform` are written from `stage.anchorFor(...)`. Nothing ties them to
  the camera's frame.
- **Fix (GPU):** draw this leader in label-gl's leader layer like the figure labels' leaders, which already ride the camera matrix
  (`label-gl.js:1555-1600`). Its anchor goes in in world coordinates, and its card end stays fixed in screen space. While no GPU leader layer
  exists (no WebGL2), at least call `position()` from the stage's camera step (`stage.js:2805-2825`, next to `sitesPaint()`).

### L2. Labels snap to whole device pixels while they ride (P3, S, Confirmed)
- **Where:** `label-gl.js:1287` (`Math.round(s.x * dpr)`), the ride (`rideAt`, `label-gl.js:1563`) and the glide (`label-gl.js:1297`).
- **What you see:** in a slow pan or pinch the figure moves smoothly below a pixel, but the labels step one device pixel at a time. On a 1×
  display (an external monitor on the Mac) that is a visible 1 px jitter against the vessels.
- **Fix:** while `rideM` or a glide is active, place the pictures at sub-pixel positions with linear filtering, and snap again at rest
  (crisp text when still, true tracking while moving).

### L3. Labels keep gliding after the figure has stopped (P3, S, Confirmed by design)
- **Where:** `label-gl.js:2201-2210` (`rideEnd` keeps where each label rode), then the next `sync` glides each label over `RIDE_MS`
  (`label-gl.js:1294-1300`).
- **What you see:** when a camera glide or pinch lands, the figure stops and the labels then slide to their new places. That reads as the
  labels lagging. It is a design choice, so I am noting it for thread C rather than as a bug.
- **Fix:** start the label solve for the landing before the camera lands (the code does this for presenter glides, `stage.js:2803`
  `solveLanding`). Shorten the glide to a few frames when the shift is under a few pixels.

### L4. Status of what Mohammad reported (for reference, nothing new)
Leaders stretching (fixed 099ec8f, dfa15ef), labels off screen during a pinch (c9fa7f23), stale labels after a view switch (0009–0011 in
`c-out/`), and pointer hits at stale places (R09) are in thread C's ledger. I found no new stale-label path in `label-gl.js` or the
stage's camera step beyond L1–L3: `ride()` draws in the same callback as the camera step (`label-gl.js:2187-2198`), so the labels and
the figure are in the same frame.

---

## 5. Lobule and sinusoid captions (`src/ui/label-captions.js`). Overlap: thread D

### C1. One or more frames with the captions shown twice (P2, S, Confirmed)
- **Where:** `lobule-zoom.js:168` (`cap.onPresented = () => classSoon(labels, 'cap-gl-on', true)`), `sinusoid-view.js:196`
  (`restClass(...)`). The CSS that hides the page's captions is `app.css:1676-1679`.
- **What you see:** on opening the lobule or sinusoid, the GPU captions appear in a frame, but the class that hides the page's captions lands
  between frames, one or more frames later. In those frames both show, slightly out of register, and the halos (`-webkit-text-stroke`,
  `app.css:1637,1729,4241`) look doubled and thick. Mohammad's "double-drawn or haloed captions" may include this.
- **Fix:** keep the GPU caption canvas at `opacity: 0` (a compositor property) until `onPresented`, then show the canvas and add
  `cap-gl-on` in the same rest pass. Both change in one style pass, so they never overlap. The reverse order applies for `onLost`.

### C2. Caption halos change thickness with the dive's scale (P3, S, Plausible)
- **Where:** `label-captions.js` text policy (R07, ledger: "glyph size, letter spacing and halo scale with the layer" while view k ≠ 1).
- **What you see:** during the dive into the lobule, the halo widens with the glyphs, and then snaps back to the CSS `--hw` clamp
  (`app.css:1636`) when the page's captions take over at rest.
- **Fix:** clamp the GPU halo width to the same `clamp(1px, …, 2px)` range in screen pixels, scaling only the glyphs.

---

## 6. Charts drawn by the GPU chart drawer (`src/ui/trace-gl.js`). Overlap: instruments/charts thread

### T1. A chart blinks out for any frame the GPU cannot draw (P1, S, Confirmed)
- **Where:** `trace-gl.js:793-795` (`begin` → `api.hide()` when `!api.ready`), `trace-gl.js:807` (a failed pool move hides too),
  `trace-gl.js:857-861` (`hide` sets the GPU canvas `visibility: hidden`; only `keep` widgets are exempt).
- **What you see:** the Doppler's words and scale, the FibroScan labels, the pressure strip and every other chart vanish for a frame (or
  longer while a pool's programs compile after a move, or after a context restore) and then come back. The page canvas under them is blank
  by design. This is the same failure mode as the "sliders disappearing" bug, which round 3 fixed only for widgets (`keep: true`).
- **Fix:** apply the widget rule to every chart: on a frame the GPU cannot draw, leave the last transferred bitmap visible (do not hide),
  set `missed`, and redraw on publish. Pass `keep: true` from `createTraceGL` for the charts too, or make it the default and opt out only
  where a stale picture would be wrong.

### T2. Shared drawing buffer size churn when many small pictures change in one frame (P2, M, Plausible)
- **Where:** `trace-gl.js:799-811`. Every glWords readout draws through `svg-gl.js:913` → `createTraceGL`, so each changing number is its own
  chart with its own size.
- **What you see:** on a slide where many readings change at once (eight Doppler tiles, the velocity, the gauge numbers, the dock), each
  frame sizes the shared OffscreenCanvas once per distinct picture size and transfers each one. That costs GPU memory churn and frame time
  just when the numbers move. `sharedStats.resizes` in `?perf` shows it.
- **Fix:** round the drawing size up to a bucket (for example 64 px steps) so pictures share sizes, draw each in its own viewport of the bucket,
  and size the display canvas to the bucket with the extra clipped by its box. Or give small readouts one shared atlas canvas.

---

## 7. Sliders (`src/ui/slider-gl.js`, `src/ui/widget-gl.js`). Overlap: slider thread

### S1. Many sliders gliding at once each do a full GPU frame and transfer (P2, M, Plausible)
- **Where:** `slider-gl.js:199` (`ask` → `frame(S.tickFn, 'numbers')` per slider), `slider-gl.js:245-261` (`tick` → `S.w.paint()` each
  frame), `widget-gl.js:52-60`.
- **What you see:** a preset or patient change glides a dozen sliders together. Each frame does a dozen begin, draw and
  `transferToImageBitmap` passes in the shared context, at different sizes (see T2), and the glide can stutter on a phone.
- **Fix:** tick all live sliders in one frame callback and keep the pool sized once (sliders in a panel share a size), or draw a panel's
  sliders into one widget canvas.

### S2. A slider's native look stays hidden if the GPU picture is lost (P3, S, Plausible)
- **Where:** `widget-gl.js:58` adds `.wgl-on` once and removes it only in `dispose` (`widget-gl.js:68`); `app.css:849-854` clears the native
  track and thumb under it. `slider-gl.js:203` writes `--p` (the native fill) only until the widget is live.
- **What you see:** if the shared context is lost and the bitmaprenderer canvas is cleared by the browser (iOS after backgrounding can do
  this), the slider is invisible until something repaints it. If it repaints with a stale `--p`, the native fill is at an old value.
- **Fix:** on the pool's `webglcontextlost`, mark widgets `missed` and repaint them right after restore (`trace-gl.js:425` sets `missed` only
  when `redraw` is given, so check that the widget path passes it). Keep `--p` written so the native fallback is never stale.

---

## 8. Glass, blur and card shadows (`src/ui/glass-gl.js`). Overlap: blur thread, thread B

### G1. Drop shadows have square corners (P2, S, Confirmed)
- **Where:** `glass-gl.js:291-299`. The drop shadow is `cover(x) * cover(y)`, a separable erf, which is a blurred *rectangle*.
- **What you see:** under a card with large rounded corners and a small blur, the shadow shows dark wedges past each rounded corner.
- **Fix (GPU):** use the closed-form rounded-rectangle Gaussian shadow (integrate the erf along x for each y with the corner's radius, the
  well-known "fast rounded rectangle shadows" approach) in the same fragment shader, with the card's radius.

### G2. Corner radii are read and clamped differently from CSS (P3, S, Confirmed)
- **Where:** `glass-gl.js:626` (`radiiOf` takes the first number of each radius, so `50%` reads as 50 px and an elliptical `a / b` takes `a`);
  `glass-gl.js:287` clamps each corner to half the short side on its own.
- **What you see:** on a card whose radius is a percentage, elliptical, or larger than half its side, the frost's corner and the card's
  corner do not match. A sliver of frost shows outside the corner, or a sliver of unfrosted figure inside it. That can read as "blur not
  covering the full rounded rect".
- **Fix:** resolve percentages against the box (`r.width`, `r.height`), carry both radii of each corner, and scale all four radii by CSS's
  rule (`f = min(1, side / (r1 + r2))` over all four sides) before upload.

### G3. Frost stops at the figure canvas's edge (P2, M, Plausible)
- **Where:** `glass-gl.js:795-800`. The region is clamped to the canvas (`x0 = max(0, …)`, `x1 = min(cr.width, …)`), while `[data-gl]` cards
  have their own background removed (`app.css:3319-3329`).
- **What you see:** any part of a GPU-glass card that overhangs the figure's canvas (a phone sheet, a card near the top bar or the dock) has
  no frost and no fill there: a hard edge where the blur stops inside the card.
- **Fix:** for panes that overhang, either draw the overhang with the tint alone (no blur source, so a solid tint that matches) on the
  same GPU pass, or drop `[data-gl]` for that pane so it keeps its solid `--surface` fallback. Prefer the first; it stays on the GPU.

### G4. A card's glass reads the page when its list changes, one frame late (P3, M, Plausible)
- **Where:** `glass-gl.js:1613-1625` (`nowGeo` → `measureSoon()` on a new list, a `setTimeout`).
- **What you see:** on the frame a new card or callout appears, its glass is missing, and it comes in the next frame (a one-frame bare
  card). The read-phase path (`measureEarly`) exists, but a changed list takes the timer path.
- **Fix:** use `measureEarly()` (the next frame's read phase) for a changed list too.

---

## 9. Figure and overlays (`src/ui/stage.js`). Overlap: organ, figure and overlay threads

### O1. Disease easing rewrites the liver's SVG paths on the CPU (P2, M, Confirmed)
- **Where:** `stage.js:1040-1090` (`morphLiver`): it builds the outline string and the nodule string (`liverNodules`, a path per cell) and
  `setAttribute('d')` on live SVG paths, plus mask and fill-opacity attributes, on every eased step (40 or 200 steps).
- **What you see:** a time-lapse of cirrhosis or congestion stutters while the liver changes shape, most on a phone.
- **Fix (GPU):** the GPU painter already takes the command lists (`bindShape(el, src)`). Feed it only the commands, keep the DOM paths
  for the no-WebGL2 path alone, and let the shader morph between two outlines with one uniform instead of a new path for each step.

### O2. Overlay marks read computed styles in the figure's frame (P2, M, Confirmed)
- **Where:** `stage.js:7135-7180` (`marksBuild`, run from the frame loop through `marksSync`): `getComputedStyle` per shape and per
  ancestor, a regex parse of `transform`, and earcut, all in the frame.
- **What you see:** when stents, band rings, clamps or clots change (a slide change, a treatment), that frame is long. The comment notes
  about 36 style passes on a phone.
- **Fix:** derive the marks' paint and transform from the overlay's own data (the code that builds the SVG knows the fill, stroke, opacity
  and transform it writes) and triangulate once, between frames (rest pass), not in the frame.

### O3. Figure resolution Auto: low-res while pinching out, then a sharpness jump at rest (P2, M, Confirmed by design)
- **Where:** `stage.js:3024-3086` (`autoScale`, `settleRes` and `resSettled` change the canvas share only after the view settles).
- **What you see:** zoomed in, the canvas is drawn at as little as 10%. Pinch out and the whole figure is very soft for the length of the
  gesture, then snaps sharp (with a fade, `easeRes`) 200 ms after release.
- **Fix:** when a gesture starts while Auto is below 1, raise the share right away to the share for the widest view the gesture can reach
  (home), or at least one step per 1.5× of zoom-out during the gesture, which makes one realloc, not one per frame. The sharp picture is
  GPU-drawn either way.

### O4. Endoscopy tile is drawn on the CPU even with WebGL2 (P2, M, Confirmed)
- **Where:** `scope-tile.js:57-60` (`renderEndo(RES, …)` on every grade step), `endo-render.js:100-140` (a per-pixel loop with `atan2`,
  `hypot` and three `field()` calls per pixel).
- **What you see:** a short hitch at each varix grade step during a time-lapse, and a 168 px picture stretched on retina (soft). It also
  breaks the GPU rule, while `instruments.js:247-258` already renders the same field on the GPU (`endo-gl`).
- **Fix:** render the tile with `endo-gl` like the instrument does, and fade by `keepImage`. Keep `renderEndo` only for the no-WebGL2 path.

---

## Status of items since the audit (3 Nov 2026, checked against `96b8354` by an external review, then by the fixing thread)

| Item | Status |
|---|---|
| D1, D3 (spectrum and noise floor synthesised on the CPU) | **Fixed** in `ee067d1`: the spectrum and floor come from a GPU shader (`doppler-synth.js`). Not every frame is CPU pixel synthesis any more. |
| D2 (only the vitals monitor registers `frameAnimating`) | **Obsolete**: `doppler.js` and `fibroscan.js` call `frameAnimating`. |
| D4 (a failed spectrum frame paints black) | **Fixed**: the GPU picture is kept; black only where there is no drawer. |
| F1, F2 (FibroScan still words and font fit drawn every frame) | **Fixed**: `keepLayer` holds the still parts and `drawStill` holds the fit. |
| N3 (text strokes under a GPU number) | **Fixed** in `a0dfb6d`. |
| T1 (a chart blinks out for a frame the GPU cannot draw) | **Fixed** in `a0dfb6d` for a recoverable failure. A chart whose GPU is gone for good still shows the page's own drawing, and the readout hand-over has its own policy (EXT-VIS-1, below). Not a blanket clearance. |
| RS5 (label density query not re-armed) | **Fixed**: `label-gl.js` re-arms the query with `{ once: true }`. |
| FN1 (label widths dropped only on the first `fonts.ready`) | **Fixed**: `stage.js` also listens for `loadingdone`. |
| FL1 (labels do not hold the loading cover) | **Partly fixed**: `label-gl.js` registers a cover promise, which is capped, so a slow load still needs a measurement. |
| O4 (endoscopy tile on the CPU) | **Fixed** in `fb60ce8`: shaded by `endo-gl`; the CPU renderer stays for no-WebGL2 only. |
| G1 (square drop-shadow corners) | **Fixed** in `d4f6ddc`: the shadow follows the card's rounded corners. |
| N1 (numbers change shape and width at hand-over) | **Fixed** by cutting the GPU outlines at opsz 14, 20, 24 and 32 for HTML readouts (`scripts/glyphs-opsz.py`, `glyph-data-opsz.js`, `text-gl.js`). To be confirmed on a Mac and an iPhone. SVG readouts keep the opsz-14 cut: Chromium's own measure of SVG text (`tests/script-measures.test.js`, 62.87 at 27.28 units) matches opsz 14. |
| G4 (a card's glass comes one frame late on a changed list) | **Fixed** in `67a6a78`: a changed list uses the early read phase. |
| N4 (dock and panel numbers up to four frames after the figure) | **By design, not a bug**: `mayTask` runs them in the same frame when the budget allows and only carries them when it does not. |
| N2 (shimmer at the hand-over) | **Fixed**: the Doppler velocity and stat tiles and the HVPG/PPG catheter readings use `keep: true`, so their GPU picture stays and the page text is never handed the number. |
| T2 (shared chart canvas resized per picture size) | **Measured, no code change (3 Nov 2026)**: headless on the hvpg deck, a slide change resizes the shared buffer 5-8 times (sizes such as 126x101, 128x101, 242x227, 429x216, 428x216, now and then 1440x900), already spread over the pools. Sizing the buffer larger than the picture cannot work: `transferToImageBitmap` hands over the whole buffer, so the picture would be the wrong size and the shaders' `gl_FragCoord` origin (bottom left) would shift. Moving a chart between pools rebuilds its programs, which is why moves are rate limited. Needs a device `?perf` "charts: N buffer resizes" number before any further change. |
| O3 (soft figure while pinching out) | **Closed by decision** (Mohammad, 3 Nov 2026): left as is, so a pinch never reallocates the canvas mid-gesture. |
| O1, O2 | **Open**: `stage.js`, each a separate piece with a screenshot per mark type; waiting for Mohammad's go-ahead. |
| G2, G3 | **Open**: in `glass-gl.js`, which the card-glass thread has. |
| EXT-VIS-1 (a failed clear is acknowledged and a timer hands the words to the page) | **Fixed** in `gl-words.js`: only a drawn clear hands the words over; a failed clear is asked again, and past three tries the GPU draws the number again and keeps it. |

## 10. Cross-cutting checks worth adding (no code change to the app)
- A frame-gate measure that fails when `shedStats().byTag` shows `doppler`, `fibroscan` or `pressure-time` carried during a scroll (catches D2).
- A gl-words test that compares `textWidth` at 28 px with the page's measured width of the same digits (catches N1).
- A label-follow case with the action card open during a pan, judged on the leader's dot against its anchor (catches L1).
- A chart test that forces `ready === false` for one frame and checks that the GPU canvas stays visible (catches T1).

## What I did not cover
`presenter.js` (6.3k lines) and `card-throw.js` are thread A's and B's (R01–R05, R14, R15). `veins-gl.js` (4.2k) and `lobule-zoom.js`
(4.9k) I only skimmed: I found nothing beyond the items above, but a full read of their per-frame paths is still to do. All results come
from reading the code. Every P1 here should be confirmed on Mohammad's Mac and iPhone after its fix.

---

# Second pass: areas Mohammad has not reported (3 Nov 2026, read at `a0dfb6d`)

This pass covers theme switching, resize and rotation, fonts, screen density, reduced motion, first load, timers, z-order, menus,
toasts and the inspector. It uses the same severity, effort and confidence scale as above, and all line numbers are at `a0dfb6d`.
Nothing here repeats a first-pass item. A separate thread is fixing the first-pass list, so this pass stays read-only.

**Status of first-pass items since the audit:** D1 is mostly done (`ee067d1`, the spectrum lines now come from a GPU shader). T1 is
fixed (`a0dfb6d`, a chart keeps its last GPU picture). N3 is fixed (`a0dfb6d`, the text halo is cleared under a GPU number).

## New findings: top 5

| # | ID | What you see | Sev | Effort |
|---|---|---|---|---|
| 1 | RM1 | With Reduce Motion on (iPhone or Mac setting), labels vanish for a whole pinch and for every camera glide, then pop back | P2 | S |
| 2 | TH1 | A theme change lands in steps: figure, words, sliders, labels and glass switch colour in different frames | P2 | M |
| 3 | RS1 | After a rotation or window resize the figure reframes up to three times (at 0.2 s, 0.7 s and 1.5 s) | P2 | S |
| 4 | RS2 | Dragging a Mac window's edge stutters: the Tests card measures and rewrites its layout on every resize event | P2 | S |
| 5 | IN1 | The open inspector rewrites its readings as page text every model frame (layout and paint per frame, not on the GPU) | P2 | M |

## 11. Reduced motion

### RM1. Labels are hidden instead of riding the figure when Reduce Motion is on (P2, S, Confirmed)
- **Where:** `stage.js:2615`: `rideStart` refuses with `reduceMotion.matches`. The pinch path relies on it (`stage.js:11581`), and so does the
  presenter glide (`stage.js:2800`, which adds `cam-move` when the ride is refused). `app.css:176` hides `#labels`, `#labelGl` and the label
  glass under `.cam-move`.
- **What you see:** on a device with Reduce Motion on, every pinch zoom hides all labels until the hand lets go, then they come back. Every
  slide glide (shortened to 300 ms, `stage.js:2762`) blinks the labels off and on. That is more flashing, not less, and it breaks "labels
  move 100% with the figure" for anyone with that setting.
- **Why:** riding is tracking the figure. It is not decorative motion, but it is gated as if it were.
- **Fix:** drop `reduceMotion.matches` from `rideStart`'s refusals. Keep reduced motion for the landing glide only (`label-gl.js`
  `RIDE_MS` → 0 under reduced motion, so labels land in one step after the ride).

### RM2. The landing glide still runs under reduced motion (P3, S, Plausible)
- **Where:** `label-gl.js:1294-1300` (the glide after `rideEnd`). I found no reduced-motion check on that path in label-gl, while the CSS
  rule `app.css:260` only covers DOM labels.
- **Fix:** with RM1, make the GPU label glide instant when `prefers-reduced-motion: reduce` matches.

## 12. Theme and look changes

### TH1. A theme change lands in steps across surfaces (P2, M, Confirmed)
- **Where:** each GPU surface watches `data-theme` and `data-palette` on its own and redraws on its own schedule:
  - `gl-words.js:58` (at once, in the observer);
  - `plate-gl.js:142` (at once);
  - `widget-gl.js:29` (a rest pass, between frames);
  - `label-gl.js:867-868` (its own observer plus `pReadSoon`);
  - `glass-gl.js:1739`;
  - `svg-gl.js:827`;
  - `util.js:1240` (the colour-token cache, `readFrame`);
  - `stage.js:6301` (organ tones then `nextFrame(resTheme)`), and `fibroscan.js:36`, `col-wave.js:109` and `lobule-zoom.js:1876`.

  Rest passes are sliced to about 4–6 ms each (`rest-pass.js:30-60`), so those redraws can spread over several frames.
- **What you see:** an in-app theme change runs as a View Transition crossfade (`main.js:1319-1322`). The "new" side of that crossfade is
  live, so surfaces that redraw late pop under the fade. A change of the device's own light or dark setting has no crossfade
  (`main.js:1364-1367`), and the steps show plainly: the figure turns dark, the numbers follow a frame later, then the sliders, then the
  labels and glass.
- **Fix:** one theme epoch. A single observer in `looks.js` bumps an epoch and runs every surface's refresh in the same frame's early
  phase (`frameFor('theme')` with all subscribers). The surfaces read colours from the token cache only after it has been refreshed for
  that epoch. In-app switches start the View Transition only after that frame has drawn (`await` one `frameFor` frame inside the update
  callback), so the captured "new" state is whole.

### TH2. The status bar colour reads the page's style after every app class change (P3, S, Confirmed)
- **Where:** `main.js:1375` (a MutationObserver on `#app`'s class → `restPass(syncStatusBar)` → `readStyle(...).backgroundColor`, plus
  `setTimeout(statusLater, 600)`).
- **What you see:** this is not a visible glitch by itself, but every non-gesture class change on the app (cards, sheets, presenting) costs a
  style pass between frames, and a second one 600 ms later.
- **Fix:** the stage's background colour depends on the look alone, so take it from the stop-token table or the token cache keyed by look,
  and update the meta only on the theme epoch (TH1).

## 13. Resize, rotation and screen density

### RS1. The figure reframes up to three times after a rotation or resize (P2, S, Confirmed)
- **Where:** `stage.js:3496-3500`: `homeResizeGo` runs `lookHome` at 200 ms, then again at 500 ms and 1300 ms later.
- **What you see:** turning an iPhone or iPad, or resizing the Mac window, can move the figure at about 0.2 s, 0.7 s and 1.5 s. Each one is a
  refit that may glide, and labels re-solve each time. It reads as the figure "settling" in jumps.
- **Fix:** refit once when the layout snapshot reports the stage box stable (two equal reads from `layout-snap.js` a frame apart), and
  run the late refits only if the box changed since the last one (compare `stageBox()` with the box the last refit used).

### RS2. The Tests card lays itself out synchronously on every resize event (P2, S, Confirmed)
- **Where:** `dock.js:1040` (`addEventListener('resize', () => { updateSize(); layout(); })`). `updateSize` toggles classes and then reads
  `clientWidth` or `clientHeight` (`dock.js:688-696`). `layout` toggles more classes and reads `offsetLeft` of each tab (`dock.js:814-826`).
- **What you see:** dragging a Mac window's edge (dozens of resize events a second) or an iPad Split View drag makes the figure stutter
  while the edge moves: each event is a forced style and layout pass of the whole page, and some are write-then-read.
- **Fix:** coalesce into one rest pass per frame (`restPass` with a pending flag), as `glass-gl.js:1772` and `label-gl` already do.

### RS3. A narrow moment while resizing closes the second instrument for good (P3, S, Confirmed)
- **Where:** `dock.js:816-818`. With two instruments open and `!canSplit()`, `open` is cut to one. Only the profile pair is restored when
  there is room again (`dock.js:817`).
- **What you see:** on a Mac, dragging the window narrower and back, or on an iPad entering and leaving Split View, the Doppler and Over
  time pair (or any pair) comes back as one instrument.
- **Fix:** keep the chosen pair (`wanted`) apart from what is shown (`open`), and show the pair again when `canSplit()` is true.

### RS4. Every resize event drops the charts' shared looks (P3, S, Confirmed)
- **Where:** `svg-gl.js:185` (`addEventListener('resize', () => clearShared())`).
- **What you see:** during a window drag every chart that redraws after a resize asks the page for its looks again (the comment above it
  counts about 230 asks in a slide change). That adds to RS2's stutter.
- **Fix:** clear once the resize has settled (one rest pass after the last event), or only when a media query the stylesheet uses has
  changed its `matches`.

### RS5. Labels stop following a density change after the first one (P3, S, Confirmed)
- **Where:** `label-gl.js:932`. The `(resolution: Ndppx)` query is built once, from the density at start, and never re-armed. `stage.js:3191`
  does re-arm its own (`watchDensity`, `{ once: true }`).
- **What you see:** on a Mac with a Retina screen and an external 1× monitor, moving the window across and back works (the one query
  flips both ways). Moving across a third density (a scaled monitor, or a browser zoom that leaves the window's CSS size equal) leaves the
  label canvas at the wrong density: soft or over-sharp labels next to a sharp figure, until the next resize.
- **Fix:** re-arm the query on each change with the new `devicePixelRatio`, as stage.js does.

## 14. Fonts

### FN1. Label widths are dropped only on the first `fonts.ready` (P3, S, Plausible)
- **Where:** `stage.js:10563` (`document.fonts.ready.then(...)` clears `widths` once). Inter's Greek and Latin-extended subsets load only
  when a character in them first appears (`fonts/fonts.css`, `unicode-range`), which can be long after `ready` has resolved.
- **What you see:** the first label with a Greek letter (α, β, Δ, μ) or a Latin-extended character that shows up later is measured in the
  fallback font, and its box stays a little too wide or narrow: a slightly off-centre name or a leader that ends short, until the cache
  reaches 1500 entries.
- **Fix:** listen to `loadingdone`, as `charts.js:64` and `glass-gl.js:1755` do, and clear only the entries that hold those characters.
  The best fix is to measure label words with the GPU type metrics (`text-gl.js`), which need no web font at all.

### FN2. The loading cover waits at most 1.5 s for fonts (P3, S, Confirmed by design)
- **Where:** `index.html:25` (`Promise.race([load, 1500 ms])`); `fonts.css` uses `font-display: swap`.
- **What you see:** on a slow network the cover lifts with fallback fonts, then every page text (top bar, cards, menus) swaps typeface and
  width once. GPU words and labels are not affected (their outlines are built in).
- **Fix:** keep the cap, but show the fallback with matched metrics: an `@font-face` fallback using `size-adjust`, `ascent-override` and
  `descent-override` for Arial or system-ui tuned to Inter, so the swap does not change widths.

## 15. First load

### FL1. Labels and glass are not held by the loading cover (P3, S, Plausible)
- **Where:** the cover waits for `ppsFigureReady` (`stage.js:3358`) and the `ppsHold` promises. Only `veins-gl`, `sinusoid-gl`, `gl-compile`
  (through its callers), the lobule loader (`stage.js:3406`) and `main.js:452` add holds. `label-gl.js` and `glass-gl.js` do not.
- **What you see:** on a cold start on a phone, the cover lifts on a figure with no labels, and the labels (and their glass) fade in a beat
  later. The first view is not whole.
- **Fix:** `holdCover(labelsPresented)` from label-gl's first presented frame, and the same for the glass's first draw, inside the cover's
  existing 2.5 s cap.

## 16. Inspector, menus and toasts

### IN1. The inspector's live readings are page text rewritten every model frame (P2, M, Confirmed)
- **Where:** `inspector.js:344-345` (`update`: `el.textContent = v` for each live reading whose words changed), with `.num` spans built
  at `inspector.js:156`. `main.js` runs it on model frames.
- **What you see:** with the patient chart or a vessel's panel open while the model plays, each changed number causes a style, layout and
  paint of the panel's text on the main thread. The figure's frame time rises with the panel open, and a number that gains a digit
  (9.9 → 10.0) shifts its right-aligned row by one digit. It is also off the GPU, against the owner's rule.
- **Fix:** host live readings in `glWords` (the same as the dock tiles), keeping the page text under it for screen readers. Update the page
  text only at rest (the `QUIET` hand-over already does this).

### MN1. The menu is built from scratch on every open (P3, M, Confirmed)
- **Where:** `menu.js:576` (`el = build(lib)`) builds the whole menu, appends it, then `place()`, `filter()` and `groupsIn(el)` measure and
  animate it in the same task.
- **What you see:** the first frame of the menu (and its plate, `plateFor`) can come late on a phone, so the open feels sticky. CI already
  measured a cold open at 1.9 s on the phone profile (comment at `menu.js:592-594`).
- **Fix:** keep the built menu between opens (hidden, `inert`) and only re-filter. Build it once during idle after the first paint.

### MN2. The menu's sideways swipe reads a computed transform at the touch (P3, S, Confirmed)
- **Where:** `menu.js:629` (`shiftX`: `getComputedStyle(el).transform` parsed with `DOMMatrixReadOnly`), called from `touchstart`
  (`menu.js:637`).
- **What you see:** a short hitch at the start of a swipe that catches a list still easing. This is a forced style pass in the touch
  handler.
- **Fix:** the list moves by a number (`moverOf`, num-move.js), so read the mover's current value instead of the page's computed style.

### TO1. A toast leaving makes the others jump twice (P3, S, Plausible)
- **Where:** `util.js:241` (close: class `leaving`, then `setTimeout(340)` → `restPass(away)`), `util.js:157-168` (`dropToast`: reads each
  other toast's top, removes, reads again, then animates `translate`).
- **What you see:** the leaving toast's slide ends (`--d-small`), but its box stays until the timer and the rest pass run. Rest passes can
  wait while the shared budget is spent (`rest-pass.js:37-41`, up to `STARVE_MS` 250 ms). The toast below holds its place, then glides up
  late.
- **Fix:** remove on the leaving animation's `animationend` (with the timer as a fallback), and compute the others' shift from
  `toast-gl.js`'s layout heights (`t._L.h`) instead of two layout reads.

## 17. Z-order and clipping

### ZO1. Toasts sit under any open menu or sheet scrim (P3, S, Confirmed by design)
- **Where:** `app.css:4708` (`.toast-wrap.docked { z-index: calc(var(--z-popover) - 1) }`), with the comment "It stays below menus".
  `.um-scrim` and `.um-pv` are at `--z-popover` (`app.css:4024`, `3970`).
- **What you see:** a message raised while the menu is open (a link copied, an error loading a talk) is hidden under the menu, and has often
  timed out by the time the menu closes. An error (`kind 'bad'`) is lost the same way.
- **Fix:** keep normal toasts below menus, but lift `.toast.bad` and toasts with actions above them (`--z-toast`), or hold a toast's timer
  while a popover is open.

## 18. Timers and work while hidden

### TM1. Doppler's 500 ms style read keeps running while the trace is hidden or the tab is in the background (P3, S, Plausible)
- **Where:** `doppler.js` `stripLayout` (`doppler.js:982`, armed by `setTimeout(stripLayout, 0)` at `doppler.js:1060`; it re-arms every 500 ms while the trace runs, as
  noted in D6). I found no `document.hidden` check on that path.
- **What you see:** nothing on screen, but battery use and a style pass every half second for an iPad left open on a Doppler slide, and a
  burst of catch-up work on return.
- **Fix:** stop the re-arm when the trace is not shown or `document.hidden`, and start it again on `visibilitychange`.

## Count
Second pass: **18 new findings** (RM1, RM2, TH1, TH2, RS1–RS5, FN1, FN2, FL1, IN1, MN1, MN2, TO1, ZO1, TM1). None is P1. The P2s (RM1, TH1, RS1, RS2, IN1) are the ones worth a fix thread.

Still not covered: high-DPI and safe-area handling beyond RS5 (the safe-area read at `stage.js:1700-1711` looked right), memory growth
over long sessions (the GPU budget and context cap in `gpu-budget.js` already cover context loss and leaks well), and `presenter.js`
(thread A).

---

# Third pass: correctness bugs (3 Nov 2026, read at `fb60ce8`)

This pass looks at state races, async ordering, error handling, stale caches and input checks, outside the drawing code. It is
read-only, and the line numbers are at `fb60ce8`. The code-health findings and the refactor steps are in `docs/refactor-plan.md`.

**Status since the second pass:** the fix thread has done IN1, TO1, ZO1 and TM1 (`299a97c`) and O4 (`fb60ce8`, the endoscopy tile on
the GPU).

I also checked the engine's own math (`physiology.js`, `wall-read.js`, `linalg.js`, the sanitising in `scenario.js`). The tube law,
the volume curve and its inverse, and the compliance agree with each other piece by piece, and the solver pivots properly. I found no
math errors there. The problems are in how the page talks to the engine.

| ID | What goes wrong | Sev | Effort | Confidence |
|---|---|---|---|---|
| B1 | A share link's settings are applied on top of a different patient | P2 | S | Confirmed |
| B2 | "Restarted" or a patient's name is announced for a load that was replaced or failed | P3 | S | Confirmed |
| B3 | Taps sent while the engine restarts are silently lost | P3 | S | Confirmed |
| B4 | A timeline entry whose snapshot fails can never be gone back to, with no word | P3 | S | Confirmed |
| B5 | Without a worker, an engine error is thrown into whatever UI code sent the message | P3 | S | Plausible |
| B6 | Pasting a share link into an open tab does nothing | P3 | S | Confirmed |
| B7 | A hand-edited link's unknown vessels and keys are kept, shown and passed on | P3 | S | Confirmed |
| B8 | "Resume where you left off" can forget the wrong talk | P3 | S | Plausible |
| B9 | A store listener removed during a change still hears that change | P3 | S | Confirmed |

### B1. A share link's settings land on another patient (P2, S, Confirmed)
- **Where:** `main.js:619-631` (`loadShared`: `await loadPreset(s.preset)`, then merges `s.params`, sets the view, the selection and the
  camera). `loadPreset` (`main.js:588-607`) returns nothing both when a newer load replaced it (`gen !== presetGen`) and when the engine
  did not answer (the `catch`).
- **What goes wrong:** open a share link, then tap another patient in the menu before the first one has loaded (easy on a phone's first
  start). The tapped patient loads, and then the link's settings are merged into it: a cirrhosis link's clot or stent ends up on the
  healthy patient, and the history marks it as the patient's start. The same happens after an engine failure: the link's settings go
  onto the old patient.
- **Fix:** have `loadPreset` return whether it applied (`true` only when `gen === presetGen` after the answer), and stop in `loadShared`
  when it did not.

### B2. A load that was replaced or failed is still announced (P3, S, Confirmed)
- **Where:** `main.js:674-675` (`restartPatient`: the "Restarted" toast after `await loadPreset(id)`), `main.js:267` (the Home card's
  `loadPreset` toasts the patient's name), and `main.js:463`.
- **What goes wrong:** a quick second tap, or an engine that does not answer, still shows "Restarted: Decompensated cirrhosis" or the
  first patient's name, while the screen shows another patient or the old one.
- **Fix:** use B1's return value before the toast.

### B3. Sends during an engine restart are dropped silently (P3, S, Confirmed)
- **Where:** `host.js:82` (`send(msg) { impl?.post(msg); }`), and `host.js:75-79` (`restartHost` sets `impl = null` until the new worker
  has answered, up to `WORKER_WAIT`, 15 s).
- **What goes wrong:** during a restart after a crash, a slider moved, a play or pause, or a treatment tapped is lost. The page's store
  shows the change, but the engine never heard it, so the figure and the controls disagree until the next change. `restartPatient`
  (`main.js:667-672`) resends speed and running, but not the Doppler's probe vessel (`probe`), so the Doppler can read a different vessel
  than the one shown as picked.
- **Fix:** queue messages while `impl` is null and flush them in order once it is set. Resend the probe with speed and running.

### B4. A failed timeline snapshot is lost without a word (P3, S, Confirmed)
- **Where:** `timeline.js:146-155` (`snapInto` awaits `host.request('snapshot')` with no `catch`). Its callers are `reset`,
  `flushParams`, `recordAction` (after 80 ms) and `jump` (after 120 ms).
- **What goes wrong:** if the engine is slow (the 30 s cap) or has stopped, the rejection is unhandled, and the entry keeps no `snap`.
  `restorable()` then skips it, so Undo jumps past that change to an older one with no explanation.
- **Fix:** catch the rejection, mark the entry (`e.snapFailed = true`), and show it in the History card as "can't go back here".

### B5. Without a worker, an engine error is thrown into the caller (P3, S, Plausible)
- **Where:** `host.js:66-68`. In the main-thread fallback, `impl.post` calls `core.handle(structuredClone(m))` directly. `failed` is
  never set there, and `crashed()` is never called.
- **What goes wrong:** on a browser that cannot start the worker (some locked-down school or hospital machines), an exception in the
  engine is thrown into the slider or button handler that sent the message. The control breaks, and no crash card offers Restart.
- **Fix:** wrap `core.handle` in `try` / `catch` → `crashed(err.message)`, as the worker's `onerror` does.

### B6. A share link pasted into an open tab does nothing (P3, S, Confirmed)
- **Where:** `main.js:395` reads `#s=` once at start. Nothing listens for `hashchange` (no `hashchange` or `popstate` handler anywhere in
  `src/ui`).
- **What goes wrong:** a tester with the app already open who pastes a colleague's link into the same tab sees the URL change, and the
  app stays on the old patient. Only a reload applies it.
- **Fix:** on `hashchange` with a new `#s=`, run `readShare()` and `loadShared()`, as at start.

### B7. Unknown vessels and keys in a link are kept (P3, S, Confirmed)
- **Where:** `scenario.js:134-155` (`sanitizeParams`). Range and type are checked, but the ids under `stenosis`, `thrombus`,
  `customShunts`, `stenosisSite` and `spontaneous` are not checked against `EDGES`. `deepMerge` (`scenario.js:160-170`) also copies top-level
  keys the defaults do not have.
- **What goes wrong:** a hand-edited or old link with a renamed vessel id keeps it. It then shows in the explainer by its raw id
  (`explain.js:48-49`: "Stenosis of PV_OLD 50%"), and it is carried into every snapshot, history entry and share link made after. Unknown
  top-level keys travel the same way.
- **Fix:** keep only ids in `EDGES` (and only the shunt kinds each map allows), and drop top-level keys `defaultParams()` lacks.

### B8. Resume can forget the wrong talk (P3, S, Plausible)
- **Where:** `resume.js:16-27` keeps the newest talk last by deleting and re-adding its key, and drops the first keys past `MAX`.
- **What goes wrong:** JavaScript orders integer-like keys ("12", "2024") before all others, whatever the insertion order. A deck whose id
  is all digits is always "oldest", so it is dropped first, or never moves to newest. I did not check whether any deck id is all
  digits.
- **Fix:** store an array of `{ id, at, n, t }` or keep a timestamp per entry and evict by it.

### B9. A store listener removed during a change still hears it (P3, S, Confirmed)
- **Where:** `store.js` `on()`: the unsubscribe replaces the array (`filter`), while `wake` (`store.js`, top) loops over the array it
  already holds.
- **What goes wrong:** a panel that closes in reaction to a key, and unsubscribes there, still has its later listeners in the same list
  run once more, after it has torn down its elements. This is a common source of "cannot read properties of null" in panels that close
  themselves. It is latent here: I did not find a crash from it.
- **Fix:** mark removed listeners (a `dead` flag checked in `wake`), or copy the list before iterating.

## Count after three passes
- First pass: 35 findings.
- Second pass: 18.
- Third pass: 9 correctness bugs here, plus 14 code-health items in `docs/refactor-plan.md`.

Since the audit started, the fix thread has closed D1 (most of it), T1, N3, IN1, TO1, ZO1, TM1 and O4.

---

# Fourth pass: the model's clock, and the big renderers (3 Nov 2026, read at `033cc02`)

I read the GPU paths of `veins-gl.js` and `lobule-zoom.js` for per-frame allocations, uniform look-ups, state queries and uploads.
Their buffers are kept and only grow, uniforms are looked up once, and uploads happen on change. I found nothing new to report there.
The two findings below are in the model's own loop.

### W1. The model's clock runs about 6% fast at 1× (P3, S, Confirmed)
- **Where:** `worker-core.js:295`. Each 33 ms tick takes `n = ceil(simDt / h)` steps of `h` (4 ms with the beat on, `worker-core.js:80`),
  and nothing carries the extra time over to the next tick.
- **What goes wrong:** a tick of 33 ms real time runs 9 steps, which is 36 ms of model time. On average each tick runs half a step too
  much (2 ms per 33 ms), so model time gains about 6% at 1× (about 3% at 4×, where `h` is 8 ms). The model's clock, the heart rate per
  real minute, and the Doppler and Over time sweeps (timed in model seconds) run that much faster than the wall clock. Because `realDt` is
  also capped at 0.1 s (`worker-core.js:280`), a worker held up for longer loses time instead. So the "clocks" drift in both directions.
- **Fix:** keep the remainder. `acc += simDt; n = floor(acc / h); acc -= n * h`, with the same cap on `n`. That keeps model time equal to
  real time × speed over any stretch.

### W2. The heart stops for a presenter's change of patient (P3, S, Plausible by design)
- **Where:** `worker-core.js:283-287`. During a `morph`, the loop only blends two snapshots (`eng.restore(morphAt(...))`). It takes no
  `eng.step` and no `sample()`. `cyc`, which gives the cardiac phase (`engine.js:382`), is not in `MORPH_KEYS` (`worker-core.js:29`), so
  it holds the target's value for the whole blend.
- **What goes wrong:** for each eased patient change in a deck (`MORPH_ONE_MS`, 1.2 s), the beat stops. The figure's pulse, the vitals
  and any beat trace on screen freeze, and then start again from a different phase. `presenter.js:1209-1212` says recording instruments
  wait for the slide's state, so the instruments are covered, but the figure's own pulse is not.
- **Fix:** keep stepping the heart's phase during the blend (advance `cyc` by `realDt · hr / 60`, and take a sample each tick from the
  blended state), so the pulse runs on through the change.

**Count after four passes:** 35 + 18 + 9 + 2 glitch and correctness findings, plus 14 code-health items. This pass found far less
than the three before it. The next useful pass is a device session on Mac and iPhone against the P1 and P2 items, not more reading.
