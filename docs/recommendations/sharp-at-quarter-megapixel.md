# A sharp figure from a 0.25 MP picture (recommendations, 11 Nov 2026)

> **Status (11 Nov 2026).** The first of two lists on the 0.25 MP question; the second, `quarter-mp-big-screen-tricks.md`, is the one being
> built (its recs 1, 2 and 4 are in `eccbe15`). Items here that the second list does not repeat (3 blood layer at an in-between size, 6
> arrowheads and 7 paper grain at screen resolution, 9 sharp when still) are not built. Item 5 (Mesh) is void: the Mesh renderer is gone
> and Tube is the only vessel renderer.

Mohammad's ask (11 Nov): "making even 0.25MP view look good ... there may be a way that's cheap and makes even 0.25MP look good big screen".

Nothing is built. This file is a numbered list to pick from. Everything in it stays on the GPU.

## The short version

At Settings › Figure size 0.25 MP, **everything** in the figure's canvas is drawn at 0.25 MP and stretched by the browser: the organs, the vessels,
the blood, and also the labels, the leaders, the organ overlays and the card glass, because since 4 Nov they are all drawn in that one canvas. On a
4K screen each picture pixel becomes a 5.7 x 5.7 block.

A quarter of a megapixel is plenty for everything soft (blood, glows, washes of colour, fluid) and far too little for everything thin (outlines,
labels, organ lines, small vessels). No filter fixes the thin things, because they are not in the picture to begin with: the middle vessel is
1.3 picture pixels wide and its casing is a third of a pixel (counts below).

The cheap way out is that **thin things cover very few pixels**. All the vessels together cover 3.5% of a Mac's screen. Drawn at the screen's full
resolution that is 0.24 to 0.28 MP of shading, the same amount as the whole 0.25 MP picture. So the plan is: keep the soft things small, and draw
the thin things once more at the screen's resolution, straight onto the canvas, in the pass that already lays the picture there.

| # | Recommendation | What gets sharp | Size of the job | My pick |
|---|---|---|---|---|
| 1 | The canvas stays at the screen's resolution; only the picture is 0.25 MP | Labels, leaders, organ overlays, stents and devices, glass edges | Small | Yes, first |
| 2 | Tube: the vessels drawn again at the screen's resolution over the small picture | Outlines, cel bands, every small vessel | Large | Yes |
| 3 | Tube: the blood layer at an in-between size | Streaks and particles | Small, after 2 | Yes |
| 4 | Organs at the screen's resolution while the view is still | Organ edges, gut loops, organ lines | Medium | Yes |
| 5 | Mesh: the same as 2 with the Mesh's own programs | Mesh vessels | Large | After 2 is seen |
| 6 | Arrowheads laid at the screen's resolution | Flow arrows | Small to medium | Optional |
| 7 | A fine paper grain at the screen's resolution | Nothing real; soft washes read as paper, not blur | Small | His eye |
| 8 | A sharper stretch filter for what stays small | Large vessels a little; small ones not at all | Small | Only for Classic |
| 9 | Sharp when still (redraw at full size once the figure rests) | Everything, but only at rest | Medium | No, unless Classic matters |

With 1 to 4 built, Tube at 0.25 MP should be hard to tell from Full on a big screen, in motion as well as at rest, for roughly the per-frame
cost of 0.25 MP plus one full-size lay of the canvas. That last cost is the one open risk (item 1).

## What I checked for this file

**How the size is applied (code read).** `stage-res.js` `resizeCanvas`: the picture's density is `vdpr` (the screen's, times `figShare`, which holds
the Figure size budget). The canvas's density is `full`, and `full = capDensity(full, r.width, r.height, figOpt('cap'))` puts the canvas under the
same budget, so at 0.25 MP the canvas itself is 0.25 MP. The labels read the canvas's density (`stage.js` `labelHost`: `scale: () => vCanvas.width /
stageBox().width`), and the overlays and the glasses are passes of the same present (`veins-gl.js` `presentLay`: `overLay`, `runTops`). The comment
on the setting in `main.js` ("the labels, cards and readings stay sharp") was true until the labels moved into the figure's canvas on 4 Nov.

**A small picture under a full-size canvas already exists (code read).** `veins.setPicture(size, linear)`: the figure is drawn into its own buffer
at `size` and laid onto the canvas by a filtered copy (or by `UP_FS`, a Catmull-Rom held within its four nearest pixels). Every iPhone runs this path
today: its picture is at 2x and its canvas at 3x. On a Mac or iPad at 0.25 MP it is not used, only because of the `capDensity` line above.

**What is in the small picture (code read).** The compositor (`COMP_FS`) writes, back to front: the organs (plate) with their glows, the bleed, the
vessel layer with the blood, the ascites fluid, and last the organ line layer (`lineL`). All of it is at the picture's size. The organ layers are baked at the picture's density
(`stage-plate.js` `settled`: `need = live.vdpr * live.CTM.sc`).

**Sizes at 0.25 MP (count).** From the real stage in node (the stage trace's recorder, `lowres.mjs` in `/mnt/project-files/sharp-at-quarter-mp/`),
66 vessel rows at the anatomy's rest, the camera fitted to the figure as in the Mesh docs (92% of the layer), so the layer sizes are assumed, not
the devices' own.

| Screen (layer) | Stretch, each way | Middle vessel's lumen | Its casing | Vessels under 2 picture px wide | Vessels' share of the layer | Vessels at full resolution |
|---|---:|---:|---:|---:|---:|---:|
| 4K external, 3771 x 2121 (the 8 MP budget) | 5.7x | 1.3 px | 0.33 px | 35 of 66 | 3.4% | 0.28 MP |
| Mac 16 in, 3456 x 2000 | 5.3x | 1.3 px | 0.34 px | 31 of 66 | 3.5% | 0.24 MP |
| Mac 14 in, 3024 x 1730 | 4.6x | 1.3 px | 0.34 px | 31 of 66 | 3.5% | 0.18 MP |
| iPad 11 in, 2360 x 1500 | 3.8x | 1.4 px | 0.35 px | 31 of 66 | 3.9% | 0.14 MP |
| iPhone, 1170 x 1800 | 2.9x | 2.1 px | 0.53 px | 9 of 66 | 8.6% | 0.18 MP |

"Vessels at full resolution" is the area of every vessel strip (lumen and casing, overlaps counted twice) in screen pixels: what a pass that draws
only the vessels at the screen's resolution has to shade. The casing band alone is 0.03 to 0.06 MP.

**Why that rules out filters (reasoning from the counts).** A picture can only be stretched sharply where each shape is at least about two pixels
wide: then the soft edge the picture holds can be turned back into a hard one. Half the vessels are under two pixels, and no casing reaches one. A
sharper filter, a sharpening pass, or an edge-finding stretch has nothing to find there. This is why the list leans on drawing shapes again, not on
filtering.

**What the Tube's shaders need (code read).** A Tube strip carries its own distance from the lumen's wall as a varying (`tube-lean-glsl.js`: `vD`,
world units) and works out its pixel's world position from the target's size and view (`invA`, `tOff`, `sizeF`, `px`). The lumen layer is already
drawn by giving the same programs a view scaled to a smaller target (`lumenView`, "the pass draws the same picture smaller, with no change to the
shaders"). The same works towards a larger target. 73% of the strips need no fragment work in the depth prepass (`tubeDepth`).

**What I did not measure.** No GPU time. Every cost below is a count of pixels and passes, or a reading of the code. The frame time on a device is
what `?perf` shows after a build.

## 1. The canvas stays at the screen's resolution; only the picture is 0.25 MP

**What.** Take the Figure size budget off the canvas (it keeps the 8 MP ceiling it has had since 1 Nov) and leave it on the picture. The figure is drawn
at 0.25 MP into its own buffer and laid onto the full-size canvas, the path every iPhone already runs. Labels, leaders and dots, the organ
overlays (stents, scopes, catheters, coils), and the glasses' edges and blur are then drawn at the screen's resolution, because they are drawn on
the canvas, not in the picture.

**Parts.**
- `stage-res.js`: `full` under `capDensity(..., 8)`, not under the Figure size; `figShare` unchanged. The `else if (figLab('upscale') ...)` branch
  becomes unreachable when the overlays are on and can stay for the software path.
- The picture is drawn at whole picture pixels (`whole()`), and a pan's remainder is now given to the canvas as a CSS `translate` (`subPixel`).
  With the labels on a full-size canvas that would slide the labels too. The remainder goes into the lay instead (an offset in the copy, or
  `UP_FS`'s mapping), so a pan glides and the labels stay put.
- `main.js`: the comment on the setting becomes true again. `?perf`'s "figure canvas" row gains the picture's size beside the canvas's.

**Cost.** The figure's own passes stay at 0.25 MP. What returns to full size is the lay: one filtered copy of the picture onto the canvas, the
overlays, the labels, the glass, and the frame's end copy of the screen onto the canvas (`keep-screen.js`). On paper that is two simple full-size
passes a frame, about a millisecond each at 8 MP on Apple's GPUs. iPhone and iPad are far under that.

**Risk, said plainly.** On the Mac those very copies have read 12 to 33 ms in `?perf` at 6 to 8 MP ("present copy", 8 and 10 Nov), and nobody has
proved whether that is a wait on the canvas or real work. If it is tied to the canvas's size, part of what makes 0.25 MP fast today is the small
canvas, and this item gives some of it back. So the build keeps a way to hold the canvas at a middle size (2 MP: labels 2.8x sharper than now on a
4K screen, not 5.7x), and `?perf` says which the Mac needs. Also: sizes under the screen's own have had one unexplained fault on the Mac (8 Nov, a
black block and a stent over a card at a 4 MP budget).

**Why first.** It is the smallest change, it is the path the iPhone already uses, it fixes the labels (the worst of it), and 2, 4, 6 and 7 all draw
onto this full-size canvas.

## 2. Tube: the vessels drawn again at the screen's resolution

**What.** In the present, after the small picture is laid and before the overlays, the Tube's shape pass runs once more with the view scaled to the
canvas: the depth prepass of every tier, then the colour pass. It writes the black outline, the flat cel colour and its bands, with every edge
worked out per screen pixel from the strip's own distance. The blood inside comes from the lumen layer, read as the Tube's compositor reads it
today. The small picture is composed without the vessels' colour, so nothing blurred lies under the sharp ones.

The order on the canvas becomes: small picture (organs, glows, bleed), sharp vessels with blood, then what the compositor lays over the vessels
today (the ascites fluid and the organ line layer), overlays, labels, glass.

**Parts.**
- `tube-pass.js` and `tube-stage2.js` (thread D): a screen pass with the stage 2 programs' geometry and one new fragment build, the lean shader
  plus the lumen read (`compTubeHead` and `compTubeSection`'s mix). A depth buffer the canvas's size on the screen target (`keep-screen.js`),
  cleared at the start of the pass and dropped at its end, so it is never loaded or stored. The colour target only (no flow, no picking: the
  small layer keeps those, for the arrowheads and the taps).
- `COMP_FS` Tube builds (thread X): a switch that leaves the vessel layer's colour out of the small picture, and what it lays over the vessels (the ascites fluid, which is soft by nature, and the organ line layer) written to a
  small target of its own that is laid after the vessels.
- `scripts/glsl-compile-list.mjs` (thread K): the new build in the compile check.

**Cost.** Two draws of 41 to 56 strips and 35 to 41 webs: under 0.3 MP of prepass, most of it with no fragment work, and under 0.3 MP of the lean
shader with one more texture read. No new render pass (it is inside the present's) and no new colour target. At rest the small picture no longer
changes when the blood moves, so a rest frame is the lumen pass plus the lay.

**Known differences, for his eye.**
- A dimmed network (a vessel in focus) is drawn through a scratch layer so that crossing vessels fade as one. At the screen's size that layer is
  32 MB at 8 MP. The choice for the planner: make it, or leave dimmed frames to the small picture (soft while dimmed).
- Glows stay in the small picture. They are soft already.
- A camera glide lays the kept picture moved and scaled, and the sharp vessels are drawn at the live view each frame. Both follow the same view,
  so they stay together, but during the glide the organs are a stretched copy and the vessels are freshly drawn.
- The present has many paths (the dive's copy, the resolution fade, the snapshot, the lobule standing alone). The pass must ride each one or step
  aside cleanly. This is where the bugs will be.

**Why it is the main item.** It is the only way the small vessels and the outlines come back, and it is sharp while the figure moves, which the
"sharp when still" route (9) is not.

## 3. Tube: the blood layer at an in-between size

**What.** After 2, size the lumen layer from the canvas, not from the 0.25 MP layer: about half the canvas each way (2 MP on a 4K screen). The
blood's streaks and particles are sized in the layer's own pixels (`blood-particles.js`: a lane is 4 to 6 px), so in a 0.25 MP layer they come out
five times too coarse on screen.

**Cost.** The lumen pass shades only lumen pixels: about 3% of its target, so roughly 0.07 MP of blood shading at 2 MP. `lumenScale` and
`?lumenscale` already exist; the change is what the share is taken of.

## 4. Organs at the screen's resolution while the view is still

**What.** The organs are baked pictures (layers), laid by the compositor at the picture's size. Once the view has rested (the same 0.28 s the sharp
plate already waits), bake the view's organ layers at the canvas's density and lay them in the present, under the small picture, which then holds
no organs. While the view moves, the organs go back into the small picture, as now. The organ line layer (`lineL`) is drawn once per change,
so it can be made at the canvas's size and laid in the present at its own place in the order.

**Cost.** A bake per settled view at full size, as at Full today ("a view's picture costs little for its size", `stage-plate.js`), and one more
texture read per pixel in the lay. Nothing per frame beyond that.

**Known differences.** Organs are soft during a pan or pinch and sharpen about a third of a second after, with the eased change every resolution
change takes. The glow that lies behind an organ is cut by the organ's edge at the small picture's precision, so a faint fringe of a few pixels is
possible there.

## 5. Mesh: the same as 2

**What.** The Mesh's shape pass run once more at the canvas's size. Mesh stays Mesh: its own programs, no Tube shader in it.

**Cost.** Heavier than Tube's. A Mesh strip runs the whole classic vessel shader for its vessel (15 texture reads before it knows its key) and the
join patches are 28 to 32% of the fragments, in a key pass and a colour pass. The area is the same 0.3 MP, but the time per pixel is unknown, and
the Mesh's contact shadows and blood (in the compositor, at the picture's size) stay small. I would build 2 first and decide on this after seeing
it, since the Tube is where the look is going.

## 6. Arrowheads at the screen's resolution

**What.** The flow arrowheads are already instanced quads (`blood-heads.js`). Draw them in the present, over the sharp vessels, instead of in the
small picture. They are masked by the small layer's lumen record, which the sharp outline hides at the edge.

**Cost.** A few hundred small quads. The work is in the masking and in the order with 2.

## 7. A fine paper grain at the screen's resolution

**What.** A very faint grain (the noise tile is already on the GPU) added in the lay, at the screen's resolution. It adds no detail. It gives the
eye something sharp to lock onto over the stretched washes, so they read as watercolour on paper and not as blur. It suits the anatomy-book look,
but it changes the look, so it is his call and wants a mock first.

**Cost.** One texture read per pixel in the lay.

## 8. A sharper stretch filter for what stays small

**What.** Use `UP_FS` (built, off) in place of the plain copy, and add an edge-keeping step to it: where the four nearest picture pixels include a
fully covered one and an empty one, re-cut the edge at the screen's resolution. `UP_FS` already reads those four pixels.

**What it gives.** A cleaner outline on the big vessels (the cava, the portal vein, the aorta). Nothing for the 31 to 35 vessels under two pixels,
for the casings or for the labels. After 2 and 4 the small picture holds only soft things, and the plain copy is the right filter for those. So
this is only worth building for Classic, or if 2 is not chosen.

## 9. Sharp when still

**What.** While anything changes shape or the view moves, draw at 0.25 MP. Once the figure rests, draw the still parts once at full size and keep
them, with the blood still small. This is the existing "While moving" share turned into the rule.

**Why I would not.** It is soft exactly when the figure is most alive (a pinch, a slider, a time-lapse), it pops from soft to sharp at each rest,
and every model change at rest pays a full-size redraw. Its one use is Classic, which has no geometry to draw again: there, shape and colour come
out of one shader per pixel.

## Not recommended

- **Sharpening (CAS) or FSR-style upscaling.** Built for stretches up to about 2x each way. At 4.6x to 5.7x they sharpen the staircase.
- **Upscaling over time (jitter and accumulate, TAA upscaling).** Needs 20 to 30 still frames to fill a 5x grid; the blood never holds still, so it
  smears or the blood must be left out, which is 9 by another road.
- **More samples per pixel (MSAA) on the small picture.** WebGL2 cannot read the samples one by one, so they resolve back to the same 0.25 MP.
- **Variable rate shading.** The native-app version of this whole idea. Not in WebGL2.
- **Pixel-art scalers (hqx, xBR).** Made for few flat colours and whole-pixel shapes; ours are antialiased and thinner than a pixel.
- **A distance channel in the picture, edges re-cut in the stretch.** Elegant, and it would serve Classic, but it needs each shape two pixels wide.
  Half the vessels are not.
- **A second canvas for the labels.** That was the design until 4 Nov, and it let the labels fall a frame behind the figure.

## Which renderer gets what

| | 1 | 2 or 5 | 3 | 4 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| Tube | yes | 2 | yes | yes | yes | yes | not needed |
| Mesh | yes | 5 | no (its blood is the compositor's) | yes | yes | yes | until 5 |
| Classic | yes | no | no | yes | yes | yes | yes |

The lobule and the sinusoid are not under the Figure size budget (`frame.js`: "the anatomy's canvas only"), so nothing here changes them.

## Order and owners

1. Item 1 alone, and a look at `?perf` on the Mac. It decides whether the canvas can be full size or must sit at a middle size.
2. Items 2 and 3 together (threads D, X and K; a brief each from the planner).
3. Item 4.
4. Items 6 and 7 if chosen; 5 after 2 has been seen on a device.

`veins-gl.js` belongs to thread D and `COMP_FS` to thread X; item 1 touches neither.

## What this file does not claim

- No frame times. The counts say where the pixels are, not how long an Apple GPU takes over them.
- The layer sizes are assumed (a fitted camera at 92% of a full-screen layer). A stage beside a card is smaller, and the stretch is then less.
- Item 2's list of present paths is from reading, not from a trace of every one.
- That the Mac's slow canvas copies are a wait and not work is a belief from 8 and 10 Nov, never proved. Item 1 is what will show it.

## Files

- This file.
- `/mnt/project-files/sharp-at-quarter-mp/lowres.mjs`: the count of vessel widths and areas per screen (run beside the Mesh docs' `trace-copy.mjs`
  and `frag.mjs`, from `/mnt/project-files/mesh-renderer-recs/`).
