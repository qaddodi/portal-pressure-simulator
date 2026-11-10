# Vessels and the particles in them, from first principles (10 Nov 2026)

Docs only. Nothing here is built. Read at `2eab592` on `claude/settings-topbar-icon-flvft1`.

Mohammad's ask: a better way to draw blood vessels and the particles inside them, from first principles, on shaders and the GPU,
cost effective and fast. This file is about the drawing method. It is not a restyle, and it is not the Vector renderer.

## The one idea

A vessel is a tube. Today the app draws it as a flat ribbon and then spends most of its work making flat ribbons behave like tubes:
a key prepass per tier to decide which ribbon owns each pixel, join patches where ribbons meet, a stencil so nothing is drawn twice,
three extra targets that carry "which vessel, where along it" to a second full-screen shader that draws the blood.

Draw the tube as a tube and almost all of that goes away:

1. **Give the ribbon its height.** Each vessel becomes a half tube (a rounded strip, 8 faces across), so every vertex has a real depth.
2. **Let the depth buffer do the joining.** Where two tubes meet or cross, the nearer surface wins, per pixel, for free. That is what a
   depth buffer is for. No key prepass, no stencil, no join patches, and the cost no longer depends on how many joins there are.
3. **Draw the blood in the tube's own shader.** The tube already knows, at every pixel, how far along the vessel it is and how far across.
   That is all a particle needs. The blood needs no second pass and no extra targets.

Result: one render pass, one colour target, a short shader. The rest of this file is the detail, the cost, and what could go wrong.

## Where today's work goes

From `mesh-renderer-optimization.md` and the code (`veins-gl.js`, `veins-mesh-glsl.js`):

| | Today (Mesh) | Proposed |
|---|---|---|
| Render passes for a whole vessel draw | 24 to 30 (Metal, counted in the Opus doc) | 1 |
| Targets written | 4 (colour, two flow targets, depth mask) plus depth and stencil | 1 colour; depth never leaves the tile |
| How a join is resolved | key prepass (writes `gl_FragDepth`), then a colour pass at depth EQUAL, plus join patches that run the shader for two vessels | the depth test |
| Work per vessel pixel | a nearest-segment search with table reads, then the shading | the shading only: along and across arrive as varyings |
| Blood | a second full-screen shader that reads the flow targets back on every blood frame | the same shader, the same pixel, no reads |
| Tile traffic per layer pixel (the Opus doc's model) | 648 bytes for a whole draw | about 4 |

These are counts and models, not device timings. The Vector debrief's lesson stands: a count says where the work is, not how many
milliseconds it is. See "How to prove it" below.

## Recommendations, ranked

| Rank | What | Changes the picture? | Size |
|---:|---|---|---|
| 1 | Half-tube geometry, joins by depth, one pass | At joins only: a welded crease instead of a blended one | M |
| 2 | Blood as particles drawn in the tube's shader, stretched by their speed | Yes | M |
| 3 | The cross-section as a small picture (one lookup) | No, unless you repaint it | S |
| 4 | Line weights set in pixels, in the vertex shader | Yes, when zoomed (already asked for) | S |
| 5 | Shadow and glow as one half-size soft mask | Barely | S |
| 6 | Redraw every frame, keep nothing | No | S |
| 7 | The lobule on the same renderer | No | M |

### 1. Half-tube geometry, joins by depth

**Geometry.** Per vessel: the 64 samples it has today, times 9 vertices across, placed on a half circle (height `sqrt(R² - d²)`).
About 1,000 triangles a vessel, 67,000 for the anatomy's 66 rows. The casing is the same shape, slightly wider and slightly lower
(the "inverted hull" outline every toon renderer uses). Triangles are not the cost on any GPU the app runs on; passes and pixels are.

**Joins.** At a fork both tubes are drawn whole. Where one is inside the other it is lower, so it loses the depth test. The casing of a
branch is hidden inside the trunk's lumen for the same reason, so the outline follows the outside of the union and never cuts across a
join. Nothing in the program knows that a join exists. This is why the lobule, where two thirds of the vessel area lies inside joins,
stops being a special case.

**Order and depth.** Tiers (what is in front of what) become bands of depth, drawn back to front in one render pass. The depth test is
plain LESS with depth from the vertices, so the GPU rejects hidden pixels before shading them. Today's prepass writes `gl_FragDepth`,
which switches that early rejection off.

**Edges.** A tube's silhouette is anti-aliased from the across coordinate (one `fwidth`), blended over its own casing, which is already
under it. No MSAA.

**Faded vessels** (veiled, dimmed, mid-transition): the depth test still lets each pixel be written once per tier, so a vessel at 40%
does not double up at its joins. That is the job the keys do today.

**What changes in the picture.** Where two tubes meet, today's shader blends them into one smooth shape. Depth gives the line where
two real tubes intersect, lit on each side by its own tube: a soft weld. On a fork of similar calibers it is hard to see; on a small
vein entering the cava it reads as the small vein going into the large one. I think that is more correct, not less, but it is a
change at joins and it is your call.

### 2. Blood as particles, drawn in the tube's shader

**First principle.** A particle in a vessel has two numbers: where it is along (s) and where it is across (y). It moves along at the
speed of its lane, fastest on the axis (`1 - y²`, laminar flow). So a particle field is a function of `(s - speed × time, y)`, and
the tube's shader has both numbers for free. No particle is simulated, stored or uploaded.

**How.** Cut the moving coordinate into cells. A hash of the cell's number gives that cell's particle: its place in the cell, its
size, its brightness. The pixel asks "how far am I from my cell's particle" (and its neighbour's) and that is the whole computation:
four hashes and a distance, no texture reads.

```glsl
float v  = vmax * (1.0 - yc * yc);                 // lane speed
float u  = (s - v * t) / cell, i = floor(u);
vec2  h  = hash2(i, lane, id);                     // this cell's particle
float len = r0 + v * shutter;                      // faster = longer
float d  = capsule(vec2((u - i - h.x) * cell, (y - yc - h.y * jitter) * R), len, r0);
float a  = smoothstep(px, -px, d) * mix(0.6, 1.0, h.y);
```

**What it buys in the picture.**
- **Speed is visible in a still frame.** Each particle is stretched by its speed times a fixed exposure, as a camera would blur it.
  Slow blood is round cells; fast blood is streaks. One rule covers both, so "streaks or dots" stops being a choice.
- **Stasis looks like stasis**: round cells, barely drifting. A reversal turns the comets round (a brighter head, a fading tail).
- **Depth inside the tube.** Two layers: a front layer, sharp, and a back layer, smaller, dimmer and slower. With the tube's own
  light over them, the blood sits inside the vessel and not on it.
- **No shimmer when small.** A procedural particle field has an exact average (density times area). When a particle would be under
  about a pixel and a half, the shader fades to that average. Noise textures need mipmaps to do this; this needs nothing.

**What it replaces.** The two flow targets, the depth mask target, and the composite's read of them on every pixel of every blood
frame. `blood-render-recs.md` (5 Nov, recs 20 and 23) already recommended shading the blood in the vessel pass; the Mesh does not
do it today (its blood is still the composite's). With item 1 there is one pass to put it in.

**Through a join.** Give each vessel a starting offset so `s` runs on from the trunk into its main branch (the flow-time idea, rec 8
of the same file). The side branch's particles start under the trunk's wall, where they cannot be seen starting.

### 3. The cross-section as a small picture

Everything that makes a vessel look like a vessel is a function of one number, the position across it: the casing line, the dark
line, the light line, the rounding, the wall band, the rim on dark looks. Today that is about 30 lines of shader arithmetic per
pixel. Bake it into a strip of texture (across × light side, 64 × 8 texels, a row per look) and the shader does one read.

It is faster, and it makes the look data. Any future restyle of the vessels is a new strip, with no shader change, and a strip can be
drawn by hand.

### 4. Line weights in pixels

The casing width is added in the vertex shader, so it can be whatever rule you want in pixels: fixed, or growing with the square
root of the zoom (item 3 of `mesh-renderer-beautiful-fast.md`). Nothing else has to know.

### 5. Shadow and glow as one soft mask

Soft things do not need full resolution. Draw the tubes' widened outlines once into a single-channel target at half size (a quarter
of the pixels), keeping the larger value where two overlap, and let the ground and the organs read it. Shadow and glow then cost one
small pass in place of two strips per vessel per tier at full size, which the Opus doc counted as about half of today's shaded pixels.

### 6. Redraw every frame, keep nothing

Today the vessels are drawn rarely and kept, and a composite runs every frame. That split is why the blood needs the flow targets.
With one cheap pass the simpler design wins: draw the tubes, blood included, every frame. No kept layer, no invalidation, no "which
tiles changed". By the Opus doc's count the vessels cover 0.64 shaded pixels per screen pixel at the fitted view today, shadows
included; with hidden pixels rejected early and the soft things moved to item 5, the full-size work is well under that, and each pixel
does less. The composite's full-screen reads go away.

### 7. The lobule

The lobule never uses the Mesh today. Because joins cost nothing here, it can use this renderer as it is. Do it last.

## What could go wrong

- **The picture at joins** (item 1). A weld, not a blend. If you reject it, the fall-back is a small smoothing of the height near
  joins, which costs a second sample across; I would look at the plain version first.
- **Tight bends.** A wide ribbon folds on the inside of a tight bend. The height makes the fold resolve itself (it is a tube bending),
  but the across coordinate jumps there, so particles could pop at the fold. The anatomy's sharpest joint is 17°, so I expect none;
  the lobule has to be looked at.
- **Things that read the flow targets today** other than the blood (dye, the origin tint, arrowheads). Each has to move to
  per-vessel values in the tube's shader. I have not listed every reader; that is the first job of a build.
- **The glass.** It samples the figure as a texture and still can. Unchanged.
- **My cost claims are counts.** Passes, targets and reads fall by a lot; what that is in milliseconds on your Mac and iPhone is not
  known until it runs there.

## How to prove it, small

Following the Vector lesson (measure on the device, smallest thing first):

1. **Step one, about two days:** a third Settings > Display choice, pure, no fall-back into Mesh or Classic. Anatomy only: tubes,
   joins by depth, casing, the cross-section strip, and the particles. No shadow, no glow, no lobule, no fades.
2. `?perf` already times a whole vessel draw on the GPU. Compare the three choices on the same view.
3. **Stop point:** if it is not clearly faster than Mesh on the Mac at the fitted view and at 4x, stop and shelve it. Nothing else is
   built on it until then.
4. Then, in order: fades and veils, item 5, the other readers of the flow targets, the Circuit view, the lobule.

## How this differs from what was tried

- **Vector** resolved overlaps by classifying screen cells and running a region shader over lists of vessels. Here nothing is
  classified and no pixel looks at more than its own tube.
- **Mesh** has the right geometry but flat, so it needs keys, patches and a stencil to fake the depth it does not have.
- **The 5 Nov blood recs** (20, 23) are the same blood idea; this gives them the renderer they need and replaces noise streaks with
  particles that have an exact average.
