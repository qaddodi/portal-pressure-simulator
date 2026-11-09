# Other ways to draw the vessels: ideas and recommendations

9 Nov 2026. For Mohammad. Docs only: no render code was changed. Read from the code at preview tip `7955b2d`
(branch `claude/settings-topbar-icon-flvft1`), `docs/veins-mesh-plan.md`, and the GPU notes in
`/mnt/project-files/portal-reliability/` (render-cost-plan, pure-gpu-plan, gpu-two-contexts-plan, safari-recording-nov8).
No timings were taken. Every cost below is an estimate from reading the code, marked as one. Nothing here gets built until
you pick.

Rules kept in every idea:
- Everything is drawn on the GPU, every frame, fallbacks included.
- Each renderer is pure. A new renderer is a third choice in Settings › Display, beside Classic and Mesh. It never borrows
  frames from another renderer (no classic frames inside it during a zoom, a morph or a load).
- The blood, glass, labels and composite stay as they are. Each idea writes the same four layer targets (colour, flow,
  second flow, lumen mask), so the blood composite reads them unchanged.

## 1. Short answer

1. **Best bet: a "distance field" renderer (idea A).** Work out the vessels' shape once, in world space, into a texture,
   and only redo it when the shape really changes. Each screen pixel then reads a few texels and shades, with no search
   over segments. Pinch, pan and zoom stop paying for the geometry. Estimated pinch frame: about a quarter to two fifths of
   classic's GPU cost. It is the biggest job here (about 1 to 2 weeks), medium risk.
2. **Quickest gain: a "lean mesh" (idea C).** Keep the mesh, but cut its passes per tier from about 6 to 2 by letting the
   draw order make the union (casings first, then lumens) instead of the key prepasses, and shading from a small lookup
   texture. Estimated: about half of today's mesh cost, so around classic's cost or a little under. 3 to 5 days. The
   picture changes slightly where vessels of one tier overlap, so you'd need to look at it.
3. **Cheapest pinch of all, but a look trade-off: a zoom-tile renderer (idea B).** Keep finished pictures of the vessels as
   map-style tiles at a few zoom steps, and lay them during a pinch. A pinch frame costs about as much as one copy. But
   edges go very slightly soft between zoom steps, and the picture at rest is a resampled tile unless it redraws once at
   rest. Your call on whether that counts as pure.
4. **Long term: WebGPU (idea D).** A one-pass, compute-based tile renderer is the right design for Apple GPUs. But the whole
   figure context (glass, labels, lobule, blood) would have to move with it, because WebGL and WebGPU can't share
   textures. That's weeks of work. I'd only do a small test first.
5. Lower down: shading only part of the pixels each pinch frame and reusing the rest (E), and curve pieces in place of the
   64-point polylines (F).

My recommendation: **build A as a third renderer**, and build C first if you want something faster on the Mac this week.
Section 11 has the stop points.

One honest caveat about the lobule. The lobule view (the ~17.5 fps one on Safari) never builds the mesh: it always draws
its vessels with the classic shader (`who: 'lobule'`), and its frame also holds the tissue and sinusoid passes. None of these
ideas change the lobule unless that renderer is also built for the lobule. A can be (the same field, made from the lobule's
vessels). B, C and E could be too. Whether that fixes 17.5 fps depends on how much of the lobule's frame is vessels, and
Safari can't tell us that (its timeline doesn't time GPU passes).

## 2. Why today's two renderers cost what they cost

**Classic** (`vesselFS` in `veins-gl.js`) is already an analytic, distance-based renderer. For every screen pixel in a
vessel cell (16 world units square, `veins-bin.js`), it loops over that cell's segment entries, keeps the nearest 8
vessels (`MAXS = 8`), and then does the tiers, fillets at joins, trunk and fork roles, cross-tier copies, the crossing
ring, the shading, the shadow and the glow, all in one shader. At rest that's cheap, because the layer is kept and only the
blood composite runs. But **every pinch or zoom frame runs the whole shader for every vessel pixel**, because each pixel now
shows a new point of the figure. The one-pass zoom (`veins-fuse.js`) merges the vessel and composite shaders so that frame
doesn't write and read back the four targets (21 bytes a pixel). That is why classic is the one to beat on pinch.

**Mesh** (`meshPass`, `veins-gl.js:3441`) draws instanced strips and join patches. Blending can't take the "nearest per
tier" that classic takes, so each of glow, shadow and shape is a **pair of passes**: a prepass writing a key into depth,
then a colour pass drawing only where the key matches (depth EQUAL). On top of that come the crossing ring's mark and draw,
and the scratch targets for dimming and lift. With 4 to 6 tiers in use, that's roughly 25 to 40 passes over strips that are
widened by the glow or shadow reach. Every one of those passes runs the strip fragment shader (the segment window, `vesAttrs`,
the shading). With the mesh on, the one-pass zoom and "vessels lower while pinching" are off (your no-hybrid rule), so **a
pinch frame is a full mesh draw plus the full composite**. The mesh moved the work out of the segment search and into
overdraw. On a pinch, the overdraw costs more than the search did.

So there are only three ways to make a pinch frame cheaper:
1. Don't redo the geometry per screen pixel on a pinch (ideas A and B).
2. Make each pixel's shading cheaper, with less overdraw (ideas C and D).
3. Shade fewer pixels per frame (idea E).

## 3. Idea A: world-space distance field + a shading pass ("field renderer")

**What it is.** Split classic's shader into its two halves (the mesh work already shares the pieces in `SHADE_GLSL`):

- **Bake (the shape half), into world space.** For each occupied 16-unit cell, run classic's geometric half at a fixed
  world resolution (say 2 texels per world unit, so 32 × 32 texels plus a 1-texel border per cell). Write out, per tier
  layer:
  - the fused wall distance `D` (signed, with the join fillets already in it);
  - the owning row, along `u`, across `x`;
  - the second member and its share near a join.

  The cells are packed into an atlas, with a small page table (cell to atlas slot). `binVeins` already makes the cells, and
  `atlas-pack.js` already packs.
- **Shade (the look half), per screen pixel.** Read the page table, then the cell's texels. The distance is read filtered,
  the same way font SDFs give sharp edges at any zoom. The integers (row, along) are read with four texel fetches. Then run
  classic's shading half: `vesAttrs`, `tubeShade`, `shadowOf`, `glowOf`, the dotted pattern, the drawn part, selection,
  hover and tint. Write the same four targets.

**Why it's cheap on a pinch.** The field is in world units, so it doesn't change on a pinch, pan or zoom. A pinch frame is
just the shading pass: about 6 to 12 texel reads and the shading maths per pixel, with no segment loop, no 8-slot sort and
no join search. It's still one pass, so it fuses with the composite just as classic's one-pass zoom does. That's the
field renderer's own fused pass, not classic's.

Most of what changes on screen is shading, not shape, so it needs no rebake:
- **Colour, tint, glow, selection, hover, fades, the drawn part** (it compares the stored `u` with the from and to values),
  **the dotted collaterals** (the pattern comes from `u`).
- **The contact shadow** is the same field read at `p − shOff`. The union of the shifted shapes is the shifted union, so
  it's exact.

**What does need a rebake.** Radii or geometry changing (physiology widths, a clot, a stent) rebakes only those rows'
cells, the way `drawRows` does now. A **view-switch morph** changes every point every frame, so it rebakes the whole field
each frame.

**Estimated GPU cost** (classic's one-pass zoom frame = 1.0):

| Frame | Estimate |
|---|---|
| Pinch, pan, zoom | **about 0.25 to 0.4** |
| Rest | same as today (blood composite only) |
| Radius change | a small bake of the changed cells, plus one shading pass |
| Morph | **about 0.8 to 1.2**: a bake at field resolution (about the screen's pixel count at fit, fewer zoomed in, since only the cells on screen need it) plus shading |

Memory, estimated: the world is 1400 × 1000 units. At 2 texels a unit, with about 20% of cells occupied and 2 tier layers
at 12 bytes a texel, that's about 25 to 30 MB. It fits the phone's 320 MB budget, and it registers with `gpu-budget.js`
as rebuildable.

**How close to classic's picture.** Very close, because the shading half is the same code. The differences:
- Where 3 or more tiers overlap one point (rare), the field keeps 2 tier layers.
- Detail smaller than half a texel (about 0.25 world units) inside a fillet is smoothed. You could raise it to 3 or 4
  texels per unit if a deep zoom shows it, at 2.3 to 4 times the memory.

**Risk: medium.** The work is in cutting classic's main loop into the "shape" and "look" halves at the right place,
because the tier loop computes `D` and the owner together. The cross-tier copies (`keep`, `pres`, `tin`) have to be decided
at bake time per tier layer. The node checks would be:
- the bake/shade split gives classic's numbers at texel centres (stage-trace style);
- the page table covers every vessel cell;
- each change that should rebake does, and the others don't.

**Fit with your rules.** Pure GPU, pure renderer (it bakes and shades every frame itself, morphs included), with no
classic frames.

## 4. Idea B: zoom-step tiles of the finished picture ("tile renderer")

**What it is.** Map-style tiles. The finished vessel layer (all four targets) is drawn into world-space tiles at power-of-two
zoom steps, only for the tiles near the screen, and kept in an LRU cache. Every frame lays the tiles from the nearest
finer step:
- the colour filtered (trilinear);
- the flow and the mask nearest, since integers can't be filtered.

The blood composite then runs as usual. Tiles are drawn by the tile renderer's own shader (A's shading pass, or classic's
shader in world-tile space) whenever one is missing or changed.

**Estimated GPU cost.** A pinch frame costs **about 0.05 to 0.1** (a textured lay of the screen), plus refilling tiles as
the zoom crosses a step: a few tiles a frame, spread out.

**The catch.**
- Between zoom steps, the edges and the fine lines are resampled. Taking the finer step keeps them sharp (it shrinks the
  tile, never stretches it), but the anti-aliasing is at the tile's scale, so edges look a touch crisper or softer than
  classic as you pinch.
- At rest, the picture is either a resampled tile or the renderer redraws once at the exact zoom when the hand stops. That
  redraw is its own shader, so no other renderer is involved, but it's the same "sharp again at rest" idea as today's
  pinch reuse (`reuseDraw`).
- The tiles go stale on every radius or colour change, and are rebuilt for every morph frame (no gain there).
- It costs the most memory of the ideas (four targets per tile, two steps kept).

**Risk: medium.** Stale tiles, if the key is incomplete, and edge softness on a slow pinch.

**Fit.** Pure GPU. It's pure only if you count "tiles always, plus its own refresh at rest" as one renderer. I'd ask you
before building it.

## 5. Idea C: lean mesh (one colour pass per piece, draw order makes the union)

**What it is.** Today's mesh with fewer passes and lighter shading:
1. **No key prepasses.** Per tier, draw all its casings, then all its lumens (the usual trick for joined strokes: no
   casing of the tier can cover one of its lumens, which is what the plan's section 2 first described). Depth = z only
   orders the crossings. The stencil stops one vessel's overlapping triangles from blending twice. That's 2 passes per tier
   for the shape instead of the shape pair plus the ring's mark and draw.
2. **Shadow and glow as soft strips** blended with MAX on alpha, which is the union `min(Ds)` gives. That's 1 pass each
   instead of a pair.
3. **The cross-section profile as a lookup texture.** The dark line, the light line, the wall band, the rim and the casing
   edge depend only on across × radius in pixels. A small 2D lookup (across, radius in px) replaces most of
   `tubeShade`'s maths. The along colour is one texel read too.
4. **Dimming without the scratch target**, by multiplying the network group's alpha per vessel. This drops a framebuffer
   switch (the Apple tiled-GPU lesson), at the cost of vessels faintly showing through each other while one is focused.

**Estimated GPU cost:** **about 0.5 of today's mesh**, which puts it around classic's 1.0 on a pinch, maybe 0.7 to 1.0.
This is still a full rasterisation each pinch frame, so it gets close to classic but doesn't clearly beat it on a pinch. It
does help morphs (the vertex shader moves the points for free).

**What changes in the picture** (needs your eye):
- Where two lumens of one tier overlap at their edges, it takes the later one, not the nearest wall.
- Dimmed vessels can faintly show through each other.
- The ring at crossings is drawn as a widened casing strip.

**Risk: low to medium.** It's an edit of code that already exists and works.

**Fit.** Pure GPU, still the mesh. But it moves the mesh's look away from classic's at the overlaps, so it needs your
OK. You asked for the brief to be built exactly, and this changes the brief.

## 6. Idea D: WebGPU compute tile renderer

**What it is.** The modern 2D vector design (as in Vello and piet-gpu):
1. A compute pass sorts the segments into 16 × 16 px screen tiles, using atomics and storage buffers.
2. A second compute pass shades each tile in one go, with that tile's short vessel list in workgroup memory. It writes
   the colour and flow to storage textures.

That's one pass, no prepasses, and no render-target switches, so it suits Apple's tiled GPUs. Safari 26 (macOS 26, iOS 26)
ships WebGPU. Older Safaris don't, so they would need Classic or Mesh as their renderer (a different setting per device,
not a mix in one frame).

**Estimated GPU cost:** **about 0.3 to 0.5** on a pinch (each pixel tests only its own tile's few vessels, with fast
shared loads). It's also good for morphs, because sorting the segments is cheap. This is a guess from published 2D compute
renderers, not from our code.

**The catch.** WebGL and WebGPU can't share textures. The glass blurs the figure, the labels and leaders are drawn in the
figure's present, and the lobule shares the figure's context (gpu-two-contexts-plan D1, D2). So either all of that moves
to WebGPU, or the figure gets copied between contexts every frame, which is the copy that plan removed. That's weeks of
work and a second shader language (WGSL).

**Risk: high.** **Fit:** pure GPU and its own renderer, but a big move. Recommendation: a small spike only (the vessel
pass alone on an empty page, timed in Safari), and decide after.

## 7. Idea E: shade a part of the pixels per pinch frame, reuse the rest

**What it is.** Each pinch frame, the renderer shades a quarter of the pixels (a rotating 2 × 2 pattern) and fills the rest
from its own last frames, moved by the zoom change (reprojection, like checkerboard rendering in games). When the hand
stops, it shades the full picture.

**Cost:** **about 0.3 to 0.4** of whatever renderer it sits in (it's a technique inside a renderer, so it stays pure).

**The catch.** Fine lines shimmer and edges smear a little on a fast pinch. It's the same family as "vessels lower while
pinching", which you keep off by default. **Risk: medium.** It's ranked low because it trades look for speed.

## 8. Idea F: curve pieces instead of 64-point polylines

**What it is.** Each vessel as a handful of quadratic curve pieces instead of 63 segments. There are fewer pieces to test
per pixel, but the distance to a curve needs a cubic solve, so each test costs more. Joins and the arc length for the blood
both get harder.

**Cost:** unclear, and possibly no gain. **Risk: medium. Not recommended**, except as a later tweak inside A's bake.

## 9. Ruled out, and why

- **One-pass mesh with framebuffer fetch, or pixel-local storage.** WebGL2 has no framebuffer fetch.
  `WEBGL_shader_pixel_local_storage` is a draft that Safari doesn't expose.
- **Hardware MSAA in place of the analytic edges.** In WebGL2, integer targets (the flow targets) can't be multisampled,
  and every attachment of a framebuffer must share one sample count. So the flow would need a framebuffer of its own: a
  switch per draw, which is the tiled-GPU cost we just removed.
- **Geometry or tessellation shaders.** They aren't in WebGL2. The mesh's vertex-from-texture approach is already the way
  around that.
- **Anything drawn by the CPU or browser** (2D canvas, SVG): against your GPU rule.

## 10. Things that help any renderer

- **Slimmer layer.** 21 bytes a pixel (colour, two flow targets and a mask). The second flow target only matters near
  joins, so it could be packed into the first's spare bits or written only inside join cells. That's less to store per
  tile on Apple GPUs.
- **The profile lookup** from C step 3 can go into classic's and A's shading too.
- **The pinch is the frame to judge by.** All the estimates above are for pinch frames. At rest, every renderer costs the
  blood composite and nothing else.

## 11. Ranked, with stop points

| Rank | Idea | Pinch GPU (classic = 1.0, estimate) | Size | Risk | Look vs classic |
|---|---|---|---|---|---|
| 1 | A: distance-field renderer | 0.25 to 0.4 | 1 to 2 weeks | medium | same shading code, near identical |
| 2 | C: lean mesh | 0.7 to 1.0 (half of today's mesh) | 3 to 5 days | low to medium | small changes at overlaps |
| 3 | B: zoom-step tiles | 0.05 to 0.1 | 1 week | medium | slight edge softness mid-pinch |
| 4 | D: WebGPU compute tiles | 0.3 to 0.5 | weeks | high | same if ported faithfully |
| 5 | E: partial shading per frame | 0.3 to 0.4 of its host | 2 to 3 days | medium | shimmer on fast pinch |
| 6 | F: curve pieces | unclear | 1 week | medium | same |

If you pick **A**, the phases, each ending at a stop point for you:
1. Split classic's shader into its shape half and look half, with the picture unchanged (node check: same numbers).
2. The bake into a world atlas and its page table, plus rebakes by row.
3. The shading pass and its fused pinch frame, with a third Settings › Display choice, "Field".
4. Morph frames (bake per frame).
5. Optionally, the lobule's vessels.

If you pick **C**, the phases:
1. Draw-order union and stencil, with the key prepasses gone.
2. Shadow and glow as single passes.
3. The profile lookup.

Each phase is pushed with its hash for you to try on the Mac and iPhone.
