# The lowest resolution that still looks right (recommendations, 11 Nov 2026)

> **Status (11 Nov 2026).** Docs only. Nothing here is built: 0 of 8 recommendations. Third file on the low-resolution question, after
> `sharp-at-quarter-megapixel.md` and `quarter-mp-big-screen-tricks.md` (whose recs 1, 2 and 4 are in `eccbe15`; its rec 3 was dropped by the
> owner: "don't touch the compositor"). This file starts from the code on the preview branch at `089d367` and does not repeat what is built.

Mohammad's ask (11 Nov): "think about new ways to make the 0.25MP look good; in fact even if we can decrease some parts of the image to 0.125MP;
basically use the lowest resolution possible but maintain good visuals; that's the best cost effective method to decrease heat and performance".

Every idea stays on the GPU, keeps the one card glass exactly as it is, keeps the one label style, and changes nothing in `COMP_FS` (the
compositor's shader text). Where an idea would need the compositor, it says so and is left out of the plan.

## The short answer

1. **At 0.25 MP the picture is no longer what costs the most.** On a 16-inch Mac a calm frame (the figure still, the blood moving) spends roughly
   nine tenths of its GPU work on the canvas: the upscale onto the canvas, the card glass, the labels and the frame end's copy onto the page, all at
   1.7 MP. The picture's own passes are about a tenth (model below, not a measurement). So going from 0.25 to 0.125 MP saves about 5% of a calm
   frame and about 20% of a frame that redraws the figure whole. Going from the 2 MP default to 0.25 MP, which the setting already allows, saves
   about eight times the picture work. **The win is making 0.25 to 0.5 MP look good enough to be the default, not going far below it.**
2. **Four things in the code make low sizes look worse than they need to, and three are cheap to fix:**
   - The Tube's outlines and blood streaks are sized in picture pixels, so a smaller picture draws a **chunkier** figure, not just a softer one.
     At 0.25 MP on a 16-inch Mac the thinnest outline is 3.9 CSS px wide (0.75 at Full) and a streak lane is 16 CSS px (3 at Full).
   - The organ overlays (stents, scopes, catheters, coils, calipers) are painted at the picture's size and stretched with a plain filter, so they
     got none of `eccbe15`'s sharpening.
   - The upscale sharpens only alpha edges (the figure's outer silhouette). Colour edges (organ against organ, outline against lumen, the cel
     tones) are stretched soft.
   - (Not cheap.) Lines thinner than a picture pixel cannot come back from any filter.
3. **The lobule and the sinusoid ignore Figure size.** They draw at the screen's own density (about 4 MP on a Mac), and the lobule is the view
   that is really GPU bound (21 fps at rest on 10 Nov). Bringing them under the same budget is the largest heat cut in this file.
4. **The "draw lower while moving" tiers do nothing today.** `MOTION_K` and the deadline tiers (`adapt-tier.js`) lower only the classic pass;
   `lowPass` is guarded by `!meshUse()`, so every Tube frame of a pinch or glide is drawn at the full picture size.
5. **Resolution will not fix the 5 fps Anatomy/Circuit switch.** His `?perf` on 11 Nov showed a switch frame's whole vessel redraw at about
   107 ms against 5 ms for a whole redraw at rest, at the same picture size. Twenty times the time for the same pixels points at the extra
   geometry the morph sets draw, not at fill. That stays with the switch thread.

## How the figure is drawn today

### Two sizes: the picture and the canvas

Since `eccbe15`, Figure size caps only the **picture** (`stage-res.js figShare`). The **canvas** (`canvas#veins`) keeps at least one device pixel per
CSS pixel (`fullFloor`), never more than the screen's density or 8 MP. When the picture is smaller than the canvas, `veins-gl.js upDraw` lays it up
with `UP_FS`: one filtered read (or Catmull-Rom with Sharper upscaling), clamped to the four nearest picture pixels, the alpha edge steepened by the
stretch, and one 8-bit step of dither. The pan's sub-pixel rest is applied in that pass (`setRest`), so text and glass in the canvas stay put.

Sizes at 0.25 and 0.125 MP. The stage boxes are assumed (a full-window stage), so read the numbers as the right size, not exact.

| Device (stage in CSS px) | Canvas at 0.25 MP | CSS px per picture px at 0.25 MP | at 0.125 MP | Thinnest Tube outline on screen, 0.25 MP (Full) | Front streak lane, 0.25 MP (Full) |
|---|---:|---:|---:|---:|---:|
| Mac 16 in (1728 x 1000) | 1.73 MP | 2.6 | 3.7 | 3.9 CSS px (0.75) | 16 CSS px (3) |
| Mac 14 in (1512 x 900) | 1.36 MP | 2.3 | 3.3 | 3.5 (0.75) | 14 (3) |
| iPad 11 in (1180 x 780) | 0.92 MP | 1.9 | 2.7 | 2.9 (0.75) | 12 (3) |
| iPhone (390 x 700) | 0.27 MP | 1.0 | 1.5 | 1.6 (0.75) | 6 (3) |

"Full" is two picture pixels per CSS pixel (`base = min(2, devicePixelRatio)`). The outline is `clamp(0.14 R, 1.5 px, 3 px)` and the front lane
`lanePx 6`, both in the target's own pixels (`tube-cel-glsl.js` CEL, `blood-particles.js` P.FRONT). On the iPhone at 0.25 MP the canvas is also about
0.27 MP, one device pixel per CSS pixel on a 3x screen, so its labels are drawn at a third of the screen's density. At the iPhone's default (1 MP) the
canvas is about 1.9x and the labels are fine.

### What is in the picture, and how often it is drawn

Back to front, in the picture's size (`PW x PH`):

| Layer | Drawn when | Notes |
|---|---|---|
| Organ layers (the plate, `organs-gl.js` stack: eight layers) | the view or an organ changes; every frame of a pan or pinch | flat fills with gradients and the organ outlines |
| Glow and warm layers (`glowLayer`, `warmLayer`) | when they or the view change | soft; Settings has a share for them (`figOpt('glow')`: 1, 0.5, 0.25; default 1) |
| Tube vessel layer (12 passes at the anatomy's rest: a depth prepass and a colour pass per tier, 41 strips, 35 webs) | the shape or the view changes; the pulse redraws only the changed rows | cel colour, outline, flow and picking targets |
| Lumen layer (the blood, `tubeLumenPass`) | every blood frame | at a share of the layer (`lumenScale`: figure 1, phone 0.67, lobule 0.5), cut to the box the rows lie in, depth kept between frames |
| Composite (`COMP_FS`) into the kept picture | whole when anything above changed; otherwise only the blood's cells | reads all of the above, the bleed, the fluid and the organ line layer |

Then, on the canvas, every frame: the upscale (`upDraw`), the organ overlays (`overLay`, painted at the **picture's** size by `overView` and laid up
with the plain filter), the labels and the card glass (`runTops`), and at the frame's end the screen texture copied whole onto the canvas
(`keep-screen.js`). The glass blurs on a grid of 8 CSS px a texel (`glass-gl.js CARD.scale`), so its blur is already far below 0.125 MP.

### Already at less than the picture

The glass blur grid (8 CSS px a texel); the lumen share (0.67 on a phone, 0.5 in the lobule); the glow share (an option, off by default); the lumen
pass cut to its box and clearing only what it drew; blood-only frames that repaint only the blood's cells; the pulse redrawing only its rows.

## Where the GPU time goes at 0.25 MP (a model, not a measurement)

Weights are my guesses: a plain read and write is 1 unit a pixel; the composite about 10; the blood shader about 12; the Tube's lean shader about 5.
16-inch Mac, 0.25 MP picture, 1.73 MP canvas, a slide with one or two cards.

**A calm frame** (blood moving, nothing else):

| Pass | Pixels | Units (millions) | Share |
|---|---|---:|---:|
| Lumen pass | about 12 k (2.5% of the picture, twice for the tiers) | 0.15 | 2% |
| Composite of the blood's cells | 40 to 75 k | 0.4 to 0.75 | 6 to 10% |
| Upscale onto the canvas | 1.73 MP, two units each | 3.5 | 45% |
| Organ overlays laid | their box | 0 to 0.5 | 0 to 6% |
| Labels | their quads | 0.2 | 3% |
| Card glass (cut and tint over the cards) | 0.5 to 0.8 MP | 1 to 1.6 | 13 to 20% |
| Screen texture onto the canvas | 1.73 MP | 1.7 | 22% |

The picture's share is about a tenth. The browser's own compositing of the canvas into the page comes on top and is not ours to change.

**A whole frame** (a slide change, a model step that changes shape, every frame of a pan or a pinch): the organ layers, the Tube layer pass, the
lumen pass with its depth, and the whole composite add about 5 to 7 million units, so the picture is about 45% of the frame. His `?perf` gives one
anchor: a whole Tube redraw at rest read 5 ms on 11 Nov, at the size he was running (probably the 2 MP default).

**What that means for heat.** GPU heat follows GPU busy time roughly one for one (a little better when the GPU can drop its clock). From the 2 MP
default to 0.25 MP, whole frames lose most of their picture work (eight times fewer pixels). From 0.25 to 0.125 MP, a calm frame saves about 5% and a
whole frame about 20%. At 0.25 MP and below, a calm frame's cost is the canvas, and it scales with the frame rate, not with the picture: the rest
slow-down is on touch devices only, by his choice of 10 Nov, and that is outside this file.

## The rules every idea keeps

- On the GPU. No CPU pixel work, no second canvas for the labels (that let them fall a frame behind, until 4 Nov).
- Glass: untouched. Every idea below leaves `glass-gl.js` and its inputs as they are.
- Labels: untouched. One label style, drawn by `label-gl.js` at the canvas's density.
- Compositor: `COMP_FS` text untouched. Two ideas use texture bindings it already has (noted where).
- Tube only, no hybrid: a lower or sharper path is the Tube's own programs, never the classic pass.
- Nothing snaps: a change of size rides the existing resolution fade (`res-fade.js`).

## Ranked list

Savings are of GPU busy time in the frames named, from the model above (so, estimates). Effort: tiny (under an hour), small (one thread, a few
hours), medium (a day), large (several days, several threads).

| # | Idea | GPU and heat | Visual gain | Visual risk | Effort | Owner |
|---|---|---|---|---|---|---|
| 1 | Two-tone edge rebuild in the upscale pass | costs about 2% of a calm frame | organ edges, outlines, cel tones crisp | low to medium: three-colour corners | small | D (`UP_FS`), K |
| 2 | Organ overlays painted at the canvas's density | under 1% (painted only when they change) | stents, scopes, catheters crisp | low | small | D (`overView`, `overPrep`) |
| 3 | Lobule and sinusoid under the Figure size budget | lobule frames 50 to 80% less | none by itself; softer fine vessels | medium | medium | lobule owner, D (`LAYT_FS`) |
| 4 | Blood streaks sized in screen pixels | none | the blood reads as Full's mist at any size | medium (his eye) | small | C, D |
| 5 | Lower defaults per device, after 1, 2 and 4 | whole frames 25 to 40% less, calm frames 5 to 10% | none | his eye on each device | tiny | `frame.js`, guides |
| 6 | A 0.125 MP step and glows at half under 1 MP | 0.125 vs 0.25: calm 5%, whole 20% | none | chunky at 0.125 until 7 | tiny | `frame.js`, Settings |
| 7 | Ink layer: thin hard lines at the canvas's density, kept between frames | costs about 5% of a calm frame; lets the picture drop to 0.125 or 0.06 MP (whole frames 20 to 35% less than at 0.25) | Full-weight lines at any size | medium: many present paths | large | D, B, organ painter, K |
| 8 | The Tube's own lower picture while moving | pinch and glide frames 20 to 25% less at 0.25 MP, about 40% at 2 MP | none | soft while moving | medium | D |

Not now: temporal accumulation at rest (large, risky), a partial present (small saving, flicker risk). Not recommended: listed at the end.

## 1. Two-tone edge rebuild in the upscale pass

**What.** `UP_FS` already reads the four picture pixels nearest each canvas pixel and steepens the alpha between them. Do the same for the colour.
Cel-shaded vector art has at most two colours in almost every 2 x 2 block: one side of an edge and the other. So in the same pass:

- take the pair of the four pixels that differ most (six distances, premultiplied RGBA), call them `lo` and `hi`;
- place the filtered colour on the line between them (`t = dot(col - lo, hi - lo) / |hi - lo|²`) and measure how far it is off that line;
- steepen `t` about 0.5 by the stretch (`k`, as the alpha is steepened now) and write `mix(lo, hi, t')`;
- only where the pair differs clearly and the colour lies close to their line. A glow or a blood streak (a small step between pixels) and a corner
  where three colours meet (far from the line) keep the filtered colour.

This replaces the alpha-only steepening with one that covers it (alpha is the fourth channel of the same rule).

**What gets sharp.** Organ against organ and organ against the page, the Tube's outline where it is at least about 1.5 picture px wide (it always is
today: its width is floored at 1.5 picture px), the cel tones' edges, the casing. Not: anything under about one picture pixel (thin organ lines,
vessels thinner than a pixel). A faint thin line stays faint but gets a clean edge, because `lo` and `hi` are the real neighbours, not black and white.

**Cost.** About twenty more arithmetic steps a canvas pixel in a pass that already runs and already reads those four pixels. No new pass, texture or
target: about 2% of a calm frame on the model.

**Risk.** Where three colours meet (a vessel crossing an organ's edge) the rule steps aside, so that corner stays soft. Near-horizontal edges can show a
slight bead where the bilinear field's contour bends; with Sharper upscaling on (Catmull-Rom) the contours are smoother. A switch (`?up2=off`) for an
A/B on his devices is worth adding.

**Why first.** It is the colour half of what `eccbe15` did for alpha, in the same shader, and every other idea below looks better with it.

## 2. Organ overlays painted at the canvas's density

**What.** `overView` and `overPrep` paint the overlay stack (`organs-gl.js` stack over the canvas: stents, devices, clamps, plugs, balloons, bands,
calipers, halos, guides) at `PW() x PH()`, and `overLay` lays it up with `camDraw(..., plain)`, a bilinear stretch. Paint it at `canvas.width x
canvas.height` under the figure's exact view (the picture's transform scaled to the canvas, plus the pan's rest that `upDraw` applies), and lay it
pixel for pixel with `LAY_FS`, cut to its box, as at Full.

**Why it was this way.** The comment says it saved the phone 2.25 times the pixels under a 3x canvas. Since `eccbe15` the canvas is bigger than the
picture on every Mac and iPad at low sizes, and the overlays are the one vector layer that did not follow.

**Cost.** The stack is painted only when it changes (`over.stale`). The lay is the same box. Memory: one canvas-sized RGBA8 texture (7 MB on a 16-inch
Mac at 1x), where it was the picture's size.

**Risk.** Alignment with the vessels during a pan: the overlay must move by the same rest the upscale applies, or a stent slides a fraction of a pixel
against its vessel. `overlay.snap` exists for exactly this and changes meaning; the stage-over tests cover the lay.

## 3. Lobule and sinusoid under the Figure size budget

**What.** The lobule draws at `min(2, devicePixelRatio) x lzScale() x zres` (`lobule-zoom.js`): Settings' Figure resolution, but not Figure size. Its
renderer instance (`who: 'lobule'`) draws into its own picture, which the host lays onto the figure's canvas with `layTex` (`LAYT_FS`, filtered). Cap
the lobule's picture like the figure's (one step above it, say twice the figure's megapixels, since the lobule is a close-up), and give `LAYT_FS` the
same edge steepening and two-tone rule as `UP_FS` (1). The sinusoid view the same.

**Cost saved.** The lobule frame on 10 Nov: a lumen pass of 258 strips and 425 webs on a 4.15 MP layer, 4924 blood cells repainted, a 5.2 MP clear and
lay, the frame end's copy. At a 0.5 MP lobule picture on a 1.73 MP canvas the picture passes shrink about eight times, the lay and copy about three.
Estimate: 50 to 80% of the lobule's GPU time. It is the view the GPU was saturated in, so this is where heat drops most.

**Risk.** The lobule is dense with fine vessels: more of them fall under two picture pixels than in the anatomy, so it gets softer than the figure at
the same budget. That is why the cap sits a step above the figure's, and why 7 matters most here later. The lobule's kept picture (`lobule-keep.js`,
`keepRead`) refuses an upscaled picture today (`if (up || ...) return false`); the shared lay path is what carries it, and that needs checking in the
build. "Battery saver" already draws the lobule at one pixel per CSS pixel (`saver() ? 1 : 2`), so a lower lobule density is a known path.

## 4. Blood streaks sized in screen pixels

**What.** A streak lane is `lanePx` pixels of the lumen target (6 front, 4 back). At 0.25 MP on a 16-inch Mac that is 16 CSS px a lane against 3 at
Full: a few fat stripes in a vessel instead of dozens of fine ones. Give the lumen pass one uniform, the picture's pixels per CSS pixel over Full's,
and size the lanes from it, never under 2 picture px (below that a streak cannot be seen and the field falls back to its mean, which reads as flat).

| | Lane now | Lane with 4 |
|---|---:|---:|
| Full | 3 CSS px | 3 |
| 0.25 MP, Mac 16 in | 16 | 5.3 (the 2 px floor) |
| 0.25 MP, iPad | 12 | 3.8 |

**Cost.** None; the streaks per pixel are the same work.

**Risk.** It changes how the blood looks at low sizes: finer and softer, closer to Full's D4 Mist. His eye decides. `FLOOR_PX`, `DASH` and the narrow
gains (`P.NARROW_GAIN`, which the tests measure) are in pixels too and need the same scale; the test table re-measures them.

**Not the outline.** The outline's width is also in picture pixels, but making it screen-sized before 7 exists would make it a sub-pixel hairline at
0.25 MP (faint, and too thin for 1 to sharpen). Keep the outline's picture-pixel floor until 7.

## 5. Lower defaults per device

**What.** Today's defaults (`66c893f`): 2 MP on Mac and iPad, 1 MP on iPhone. Most viewers never open Settings, so the default is where the heat is.
Once 1, 2 and 4 are in, try 0.5 MP on Mac and iPad and 0.5 MP on iPhone. On a phone, keep the canvas at least two device pixels per CSS pixel when
the picture is split (`fullFloor` is one today), so labels stay sharp on a 3x screen.

**Cost saved.** Mac and iPad: the picture's work on whole frames divided by four, about 25 to 40% of those frames; calm frames 5 to 10%. iPhone: the
picture's work halved; the canvas floor adds about 1 MP of light passes back on a phone, so its net is smaller, about 15 to 25% of whole frames.

**Risk.** Only his eye, on each device, which is why it comes after 1, 2 and 4. If a guide's Settings picture shows the Figure size value, both start
guides change in the same push.

## 6. A 0.125 MP step, and glows at half under 1 MP

**What.** Add 0.125 to `FIG_OPTS.cap` (and the Settings row). Under 1 MP, draw the glow and warm layers at half the picture each way by default
(`figOpt('glow')` already does it when chosen): they are soft, and nobody can tell at that size.

**Cost saved.** 0.125 against 0.25 MP: about 5% of a calm frame and 20% of a whole one on the model. Glows at half: a little on each whole frame and
on memory.

**Risk.** Without 7, 0.125 MP is the chunkier drawing from the table above, made crisp by 1: a bold cartoon. Fine as a choice in Settings, not as a
default. `figShare` floors the share at a tenth of the screen's density, which 0.125 MP stays above on every device here.

## 7. Ink layer: thin hard lines at the canvas's density, kept between frames

**What.** One canvas-sized layer that holds only the figure's thin hard lines, drawn by the GPU when they change and read every frame by the upscale
pass (one more texture read there, laid over the picture, under the overlays):

- **Vessel outlines.** A new fragment build of the Tube's lean shader (thread B's `celShade`, thread D's pass) that writes only the outline band, at
  the outline's screen width (`CEL.LINE_*` in Full's pixels, so the same weight at every Figure size), antialiased in canvas pixels. Its own depth
  prepass at the canvas's size orders the tiers; the depth is cleared and dropped in the pass, never stored.
- **Organ outlines.** The stroke ops of the organ stack (`organ-paint.js`) drawn at the canvas's density into the same layer, before the vessels.
- **Punch.** Where an opaque vessel lies (its own alpha 0.95 or more), the vessel's draw writes clear, so an organ line under a vessel is cut, as
  the picture has it. A vessel faded behind an organ is left alone, so the organ's line stays over it, as the picture has it.
- **The picture's own lines go thin.** With the ink layer on, the picture draws the outline at the same screen width, which at 0.125 MP is a faint
  hairline under the crisp one, not a fat dark band.

**What it gives.** Lines of Full's weight and sharpness over a picture of 0.125 MP or less, which then holds only fills, cel tones, glows and blood,
all soft by nature. With 1 for the fills' edges, the picture could drop to 0.06 MP on a Mac.

**Cost.** Each frame: one texture read a pixel in the upscale (about 5% of a calm frame). On change: the outline band of every vessel at the canvas's
density (vessels cover about 3.5% of the screen, so about 0.06 MP and its tiers) and the organ strokes, about 3% of a whole frame. While the view moves
it is drawn every frame like the layer, or, cheaper, laid by the camera's move since it was drawn (the `reuseMap` arithmetic) and drawn again when the
view lands.

**Risk.** Every way the present lays the figure (the dive's copy, the card zoom's scene camera, the resolution fade, the snapshot, the lobule standing
alone) must lay the ink layer the same way, or a line slides off its vessel. Dimmed networks (drawn through a scratch layer), the selected vessel's
lift and glows keep to the picture. Memory: 7 MB for the layer and 7 MB of transient depth on a 16-inch Mac. It needs a brief from the planner.

**Compositor.** None. The ink layer is read in `UP_FS`, not in `COMP_FS`. Leaving the organ line layer out of the picture would be a binding change in
`composite()`'s JS, not in the shader text: worth his word before doing it.

## 8. The Tube's own lower picture while moving

**What.** `stage-vessels.js` asks for a lower layer on pinch and glide frames (`MOTION_K` 0.67, the deadline tiers 0.71 and 0.5), but `veins-gl.js`
draws it only for the classic pass (`lowK && lowOn && !meshUse() ...`). Give the Tube the same: draw the layer and the lumen with the view scaled to
the tier's targets (`lumenView` already does this for the lumen layer, with no change to the shaders), add a depth-stencil to those targets, and let
the composite read them as it already reads tier frames (`lowUV`, in `COMP_FS` and in the Tube's `compTubeHead` at `comp-glsl.js` 399: no text change).

**Cost saved.** Pinch and glide frames draw about 45% of the picture's pixels. At 0.25 MP that is about 20 to 25% of those frames; at the 2 MP default
about 40%. Not the view switch (its frames drawn lower and its landing at full size read as a flicker before, which is why it is excluded today).

**Risk.** Soft while the hand moves, sharp when it lets go: the landing rides the resolution fade, and Settings › Sharp while moving turns it off, as
it does now.

## Not now

- **Temporal accumulation at rest** (jittered frames into a canvas-sized history, `quarter-mp-big-screen-tricks.md` rec 6). The best possible still
  image from a tiny picture, but it is large, every present path must reset it, and it spends a burst of whole frames after each move. Worth it only
  if 7 is built and the still figure still looks soft.
- **A partial present** (upscale only the tiles the picture changed). The upscale is the biggest item of a calm frame, but most of its cost is the
  write, which a partial path still pays unless the labels and the glass become partial too. That is a lot of new ways to leave stale pixels for a
  saving of a few tenths of a millisecond.

## Not recommended

- **Skipping the figure under the cards.** The glass replaces a card's pixels whole, so the upscale under a card looks wasted, but the glass blurs
  the canvas as laid. Taking its blur from elsewhere would change what the glass shows, and the glass must look the same everywhere.
- **A distance channel in the picture** (`quarter-mp-big-screen-tricks.md` rec 5). It needs `COMP_FS` to write it.
- **The vessels drawn whole at the canvas's density every frame** (`sharp-at-quarter-megapixel.md` item 2). It needs `COMP_FS` to leave the vessels
  out, and since the blood moves every frame it costs more at rest than a 0.25 MP calm frame does today. The ink layer (7) keeps only what does not
  move.
- **A lower lumen share on the figure.** At 0.25 MP the lumen pass is about 2% of a calm frame; there is nothing to save, and the lanes coarsen.
- **A canvas under one pixel per CSS pixel.** Text gets soft fast, and the labels are what people judge first.
- **FSR, CAS, machine-learning upscalers, MSAA, variable-rate shading.** Built for photos, or for stretches up to 2x, or not in WebGL2. The figure's
  detail lost at low sizes is thin vector lines, which only drawing them again brings back.

## The view switch, and what resolution cannot fix

The coordinator asked to look at the 5 fps Anatomy/Circuit switch. From the thread's notes (`17b5315`, `6a768ab`): repeated identical morph frames no
longer redraw the layer, but a switch frame whose points really move is a whole Tube redraw of about 107 ms on his Mac, against 5 ms for a whole redraw at
rest, at the same picture size. Morph frames draw about 111 webs a tier against about 7 at rest (the morph sets list every join of every moment). If that
cost were pixels, 0.25 MP would already switch about eight times faster than 2 MP; nobody has compared, and I would not count on it. The fix is fewer
webs drawn during the switch, in that thread. Idea 8 leaves the switch out on purpose.

## Plan

1. **One D push: 1 and 2.** Both in `veins-gl.js`, neither touches `COMP_FS`, both small. Add the compile-check entry for the new `UP_FS`.
2. **3**, the lobule and the sinusoid under the budget, with 1's rule in `LAYT_FS`. Biggest heat cut.
3. **4**, the blood lanes (C writes it, D passes the uniform).
4. **5 and 6** together, after he has looked at 1 to 4 on his devices: the new defaults, the 0.125 MP step, glows at half under 1 MP.
5. **7**, with a planner's brief. After it, 0.125 MP can be a real default candidate.
6. **8** whenever pinch frames show up in `?perf` as the heavy ones.

What `?perf` will show after each, with no extra test asked of him: the `present copy` and `glasses and labels` rows (1, 2, 7), the lobule's `lumen
layer` row and frame time (3), `whole picture` frames' GPU time (5, 6, 8), and the `vessel renderer` gauge naming the lower frames (8).

## What this file does not claim

- No frame times. The shares come from pixel counts and my weights per shader, not from a GPU timer. The one measured anchor is his 5 ms whole redraw.
- The stage sizes are assumed full-window; a stage beside a card is smaller, so its stretch is smaller too.
- That the switch is not fill-bound is an inference from 107 against 5 ms at one size, not a measurement.
- Nothing was run in a browser for this file: code reading and arithmetic only.
