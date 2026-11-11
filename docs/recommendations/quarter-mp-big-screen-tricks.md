# Making a 0.25 MP figure look good on a big screen (recs only, 11 Nov 2026)

Asked by Mohammad: cheap tricks that make even the 0.25 MP Figure size look good on a big screen. Independent take, from first
principles and from the code on the preview branch at 0bd884f. Nothing here is built. Everything listed is drawn on the GPU.

## What the screen actually gets today at 0.25 MP

- `stage-res.js resizeCanvas`: Figure size caps the figure (`figShare`) **and** the canvas (`full = capDensity(full, ..., figOpt('cap'))`).
  So at 0.25 MP the whole `canvas#veins` is 0.25 MP, and the browser stretches it about 5x each way on a 16-inch Mac or a 4K screen
  (bilinear, in the page compositor).
- Everything drawn inside that canvas is 0.25 MP too: the vessels, the organ plate (`stage-plate.js` bakes at `live.vdpr`), the
  overlays (painted at the picture's size, `overView`), and the "tops": label-gl text and leaders, and the cards' GPU glass.
- Side finding: Settings > Sharper upscaling (`figLab('upscale')`, `UP_FS`) does nothing at 0.25 MP. It only runs when the canvas is
  bigger than the picture, and the cap makes them the same size.

## The one idea behind every rec

The figure is almost entirely vector art: flat cel colours, outlines, filled organ shapes, outlined text. Vector art has no fine
texture inside its shapes. Its sharpness lives on a few pixels along edges. The costly work (tube shading, lumen, blood, glows) is
in the interiors, where 0.25 MP is plenty. So: **shade low, edge high.** Keep the expensive interior colour at 0.25 MP and make the
edges and the text at screen density, where they cost little because they are few pixels or simple.

## Ranked list

Impact is how much better it looks at 0.25 MP on a big screen. Cost is GPU time per frame plus how big the build is.

| # | Rec | Impact | GPU cost | Build | Owner to coordinate |
|---|-----|--------|----------|-------|---------------------|
| 1 | Canvas at 1x CSS density; Figure size caps only the figure picture | Very high | Low | Small | stage-res.js (none), D told |
| 2 | Sharpen the vessels' outer edge from the picture's own alpha in the upscale pass | High | Almost none | Small | D (UP_FS in veins-gl.js) |
| 3 | Organs laid at canvas density under the vessel picture (see correction) | High | One bake per settle | Medium | X (COMP_FS) + present path |
| 4 | Dither in the upscale pass | Medium (dark looks, glows) | Almost none | Tiny | D |
| 5 | Edge distance channel so outlines are rebuilt at screen width | High | Low | Medium | X (COMP_FS) + D |
| 6 | Sharpen at rest with jittered frames and exact 2D reprojection | Very high at rest | Bounded burst after each move | Large | D + X + stage-res.js |
| 7 | Thin vessels keep at least 1 picture pixel, fading instead | Medium | None | Small | D (tube shader) |
| 8 | Spend the 0.25 MP where edges are: glows and soft layers lower | Medium | Saves time | Small | stage-res.js, D |
| 9 | Whole-number stretch | Low | None | Tiny | stage-res.js |
| 10 | Catmull-Rom plus light sharpen alone | Low | Low | Exists | D |

My pick: **1, 2, 3, 4** first. Together they are small, they touch few lines, and they fix what the eye judges first: text,
silhouettes and organ outlines. Then **5**, then **6** if he wants it sharp at rest too.

## 1. Canvas at 1x CSS density, Figure size caps only the picture (very high impact, low cost)

What: let Figure size set only the figure's picture (`live.vdpr`). Size the canvas from its own budget. Then the existing split path
runs: the picture is drawn at 0.25 MP into the renderer's own buffer and upscaled onto the canvas in one GPU pass. The iPhone already
runs this path every day (picture 2x, canvas 3x).

Why it is the biggest win: text is what people judge sharpness by. Labels, leaders, readings drawn in the canvas and the glass edges
all jump from about 0.36 device px per CSS px to 1.

Where I differ from a plain "canvas at screen density": I would size the canvas at **1 device px per CSS px**, not at the
screen's 2x. Text at 1x looks like a normal non-Retina screen: clean and readable. On a 16-inch Mac that is 1.9 MP instead of 7.7, so
the present copy, the upscale pass and the tops cost a quarter of what they would at 2x. That keeps clear of the Mac "present copy"
cost at 6 to 8 MP that was never explained (see mac-lag notes). Simple rule: canvas density = `max(vdpr, min(1, devicePixelRatio))`
when Figure size is under 1 MP, the screen's own density (under the 8 MP cap) otherwise.

Cost: the upscale pass (one read per pixel at 1.9 MP), the tops at 1.9 MP. The vessel passes stay at 0.25 MP.

Risk: the pan remainder. Today, below Full, the canvas is moved by a CSS `translate` of the sub-pixel rest (`subPixel`). With the
canvas bigger than the picture, the rest has to go into the upscale pass's sample offset instead, or text would wobble by a fraction
of a pixel. Small change in the same pass.

## 2. Sharpen the vessel silhouette from the picture's own alpha (high impact, almost free)

What: the vessel picture is premultiplied over a clear background. Along a vessel's outer edge its alpha is a ramp about one
picture pixel wide, which is a short signed distance field in disguise. Stretched 5x by a plain filter that ramp becomes a 5-pixel
blur. In the upscale shader, read alpha filtered as now, then steepen it around 0.5 by the stretch factor:
`a2 = clamp((a - 0.5) * k + 0.5, 0.0, 1.0)` with `k` about the screen pixels per picture pixel, and scale the colour by `a2 / a`.
This is the same trick that makes signed-distance text crisp at any size. Diagonals and curves stay smooth, not stair-stepped,
because the threshold of a filtered field is a smooth curve.

Cost: a few arithmetic steps in a pass that already runs. No new pass, no new texture.

Limits: it fixes the outer edge only. Colour edges inside a vessel (the outline against the lumen) are not alpha edges; see rec 5.
Vessels under about 1.5 picture px across come out a little thinner; rec 7 covers them.

## 3. Organ plate baked at canvas density at rest (high impact, a bake per settle)

What: `stage-plate.js settled()` bakes the organs' picture at `live.vdpr * CTM.sc`. After rec 1, bake it at the canvas density.
Organ outlines are the longest edges on the screen, and they are simple filled shapes, so a bake at 1.9 MP costs little and happens
only once a view settles. During a pan the old plate is laid as now.

Cost: one bake after each settle, a bigger texture (about 8 MB at 1.9 MP). Nothing per frame.

**Correction (11 Nov, from the build thread):** as written this does not work. The plate textures are read inside the vessel composite
(COMP_FS), which draws at the picture's size, so a denser plate is sampled back down to 0.25 MP and the organ outlines come out no
sharper. The version that works takes the organs out of the composite and lays them at canvas density onto the canvas, in the present,
with the upscaled vessel picture over them (the `under` hook, which today is skipped when the picture is smaller than the canvas).
The vessel tiers drawn over the organs then need their own pass, or the organs' covers still have to fade the tiers behind them. That
means changing COMP_FS (thread X's code) and the present path, so it is a medium build, not small. It is on hold until thread X takes it.

## 4. Dither in the upscale pass (medium, almost free)

What: add a tiny screen-space noise, about one 8-bit step, to the colour before it is written (interleaved gradient noise, three
arithmetic steps). The soft contact shadows and the glows have smooth ramps. At 0.25 MP each 8-bit band is 5 screen pixels wide, so
the bands show as contour lines, mostly in the dark looks. Dither turns them into an invisible grain.

Cost: nothing measurable. Done at screen density, so the grain is fine, not 5-pixel blocks.

## 5. An edge distance channel so outlines are rebuilt at screen width (high, medium build)

What: the Tube's cel outline is defined by distance across the tube, not by a picture. Write that distance (to the nearest vessel
edge, in picture px, 8 bits, clamped to a few px) into one spare channel next to the colour. The upscale pass then reads the
distance filtered, which stays accurate under stretching because distance changes linearly, and draws the outline ink where the
distance says, at the screen's own line width. A 0.33-pixel casing at 0.25 MP becomes a crisp 1.5-pixel line on screen, which no
filter on the colour can bring back.

Cost: one more channel written by the compositor, two more reads in the upscale pass.

Owners: COMP_FS is thread X's, the tube shader's outputs are D's. Both need to agree on the channel.

Limits: the outer silhouette of all tiers, and the casing at tier crossings if the distance is per tier group. Where two edges fall
inside one picture pixel (the thinnest vessels) the distance is wrong, so those fall back to the colour.

## 6. Sharp at rest: jittered frames with exact 2D reprojection (very high at rest, large build)

What: the figure's motion is one 2D affine transform (`glM`), so reprojecting last frame's pixels onto this frame is exact, unlike in
3D games. After each settle, draw the vessel layer 16 more times, each shifted by a different sub-pixel offset of the 0.25 MP grid,
and blend each into a screen-density history (new sample weight about 1/n, clamped to the 2x2 neighbourhood so moving blood and the
pulse never ghost). After 16 frames the still parts hold about 16 samples per picture pixel, close to 4 MP of detail. Then **stop
jittering**: the history is kept and laid every present, so the rest cost is what it is today. A pan or zoom carries the history by
the affine, so slow pans stay sharp too.

Cost: a bounded burst of 16 layer passes at 0.25 MP after each move (about 4 MP of shading in total, once), one history texture at
canvas size (8 MB at 1.9 MP), one resolve pass per present instead of the plain upscale.

Risks: the whole-figure fades and dives must reset the history; the blood in the lumen will look like 0.25 MP (it moves, so the
clamp drops its history; that is fine to the eye). Big enough that it wants its own brief and planner.

## 7. Thin vessels keep at least 1 picture pixel (medium, free)

What: a vessel thinner than one picture pixel breaks into dashes and shimmers when it moves. Draw it at 1 picture px wide and fade
its alpha by how thin it really is (the hairline rule the organ outline shader already uses: "widened in device pixels so a hairline
still covers its pixels, its alpha thins instead"). At 0.25 MP that is about half the vessels (earlier count: 31 to 35 of 66 under
2 px).

Cost: none per frame. A change in the tube width the shader uses (D).

## 8. Spend the 0.25 MP where edges are (medium, saves time)

What: glows, contact shadows and the soft blood field have no edges, so they look the same at a quarter of the picture's size.
Settings already has a glow share (`setLayerScale(figOpt('glow'))`). At 0.25 MP drop the glow and soft layers to half the picture
each way, and spend what that saves on a slightly bigger picture at the same GPU time.

## 9. Whole-number stretch (low, free)

What: pick the picture's size so the canvas is a whole multiple of it (4x or 5x). Then every screen pixel sits at the same place
inside its picture pixel. With an odd ratio, fine repeating patterns (streaks, hatching) show a slow beat of sharper and softer
bands across the screen. A whole ratio removes it.

## 10. Catmull-Rom plus sharpen on its own (low)

The existing Sharper upscaling (`UP_FS`) is a good filter, and a light contrast-adaptive sharpen could follow it. But at 5x no colour
filter adds detail that is not there; it makes edges a little firmer and halos are a risk. Worth having on as the base of recs 2 and 4
(they go in the same pass), not worth doing alone. Edge-directed upscalers made for photos (FSR 1 style) cost more taps and do less
than rec 2 on flat cel art.

## Not recommended

- A smarter filter as the whole answer. The detail lost at 0.25 MP is mostly sub-pixel outlines and text; filters cannot rebuild
  either. Recs 1, 2 and 5 rebuild them from what they are (text, alpha, distance) instead.
- Machine-learning upscaling: far too costly for the gain on vector art.

## Order of work if he picks them

1 first, because 2, 3 and 4 need a canvas bigger than the picture to have anything to draw onto. 2 and 4 go into the same upscale
shader (D's). 3 is stage-plate.js alone. 5 and 6 need D and X together and their own briefs.
