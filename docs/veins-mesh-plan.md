# Vessel mesh renderer: plan (Option 1, tube meshes + junction patches)

Status: **Phase 6 (docs, changelog) done 9 Nov 2026; preview built, PR only when the owner asks**. Phase 0 approved (8 Nov 2026); Phases 1 to 4 built (sections 4 and 6). The switch is the
Settings › Display row "Mesh vessel renderer" (on by default), not a compare split, by the owner's word.
Owner's change to the brief (8 Nov 2026): no left/right compare split. Instead, a row in **Settings › Display** beside
"Figure size (megapixels)" switches the figure's vessels between the classic renderer and the mesh renderer. The R14 test
(`tests/settings-product.test.js`) gets that one row added to what Settings keeps, by the owner's word.

The goal: the figure looks the same, and the vessel pass costs much less, most of all on pans, pinches and view-switch morphs.
The lobule (`who: 'lobule'`) and software GL stay on the classic shader. The classic shader stays in the code as the fallback.

## 1. Feature table: what `vesselFS` makes, and where it lives in the mesh path

Terms. **Strip**: one instanced triangle strip per vessel row, 64 samples (63 quads) plus a round cap at each end, placed in the
vertex shader from textures. **Patch**: one instanced quad per join entry, over its blend zone. **Shared**: a GLSL function in the
new shared string (section 3) that the classic shader and the mesh shaders both call.

| Feature (classic) | Inputs | Mesh path |
|---|---|---|
| Nearest point of the vessel: `d` (wall distance), `u` (along, running on past the ends), `x` (across), `g` (direction to p), `r` | ent segments, `rad`, texel 5 (drawn part) | Strip fragment: the exact capsule distance to its **own** vessel's segments near the strip's sample (`i − 2 … i + 2`, from the interpolated sample index), the same maths as the classic loop body (moved into a shared `segNear()`). No search over other vessels. |
| Smooth along (`aU / aW`, the soft along used by glow fades and selection ease) | same | Same window, same soft weights, in the strip fragment. |
| Contact-shadow distance `bs` (`ps = p − shOff`) | `shOff` | Strip fragment, same window, from `p − shOff`. |
| Lumen colour along the vessel (`alongAt`, texels 0/1) | `rad.ba`, texels 0/1 | Shared `vesAttrs()`. |
| Casing width and colour (texel 0.w; `F_EDGE` with texel 6; `F_NOCASE`; dotted 0.35; veiled half) | texels 0, 2, 6 | Casing pass, from shared `vesAttrs()` + `tubeShade()`. |
| Flat textbook shading: dark line, light line (`light`, `sheenInk`, `shadeInk`, `F_SPEC`, `F_DIFFUSE`, `fx`), rounding, pale wall band, dark-lumen rim (`rimInk`) | across `x`, `g`, `R`, `D` | Lumen pass, shared `tubeShade()`. The across coordinate is the strip's own exact one (not interpolated), so the lines sit where they sit today. |
| Contact shadow (`shadow`, `F_SHADOW`, sel blur 2.4 / 1.3) | `Ds`, wall | Shadow pass, shared `shadowOf()`, blended MAX on alpha. |
| Fades, texels 3–4, modes 0–3 (linear, radial, dip) | texels 3, 4, p | Shared `vesAttrs()` (per pixel, as now). |
| Organ cover (`organ`, `organRect`, `organK`, `tierGroup` 0, `sof`, `F_VEIL`, `F_WHOLE`) | organ texture | Shared `occlAt()` + `vesAttrs()`; applied per tier group as the classic does (section 2). |
| Drawn part (texel 5 from/to) | texel 5 | Strip vertices outside the drawn part collapse; the fragment's segment clip is the classic `t0/t1` clip (shared `segNear()`). |
| Dotted collaterals (`F_DOTTED`: dots 1.5 every 6) | texel 5.z | Shared `segNear()` keeps the dotted distance; casing 0.35; no stream. |
| Recoloured stretch, texels 8–9 (HVPG wedged vein, EUS glue cast) | texels 8, 9 | Shared `vesAttrs()`. |
| Hover (texel 9.w, eased toward lit ends, texel 11) | texels 9, 11 | Shared `tubeShade()`. |
| Glow, texels 10–11 (band, ends, stretch ends, own colour, width ≤ 1.3, "up" glows over the group) | texels 10, 11 | Glow pass: strips widened by the glow reach; shared `glowOf()`. The classic "no glow inside another lit vessel's lumen" needs the other lit vessels' distance: see risk R5. |
| Selection and dimming (texel 12, `netAlpha`, `ring`, `F_SEL`, lifted ×1.12, eased ends) | texel 12 | Shared `vesAttrs()` (ease) and `tubeShade()` (ring, lift). Group dimming: section 2 and risk R1. |
| Tiers (`tierAlpha`, `tierGroup`, z within a tier) | texel 2 | Draw order, section 2. Within a tier, z by the depth test (depth = z). |
| Joins: `smin` fillet, `corner()`, trunk / fork roles (`jt`, `jtf`, `tn`), run-on stretches (`js < 0.98`), deep blend | join entries (≤ 4 members) | Patch fragment: the classic join code over the patch's own members only (shared `joinShape()`), computing each member's `segNear()` itself. |
| Cross-tier copies near a join (`keep`, `pres`, `tin`: the cava under the hepatic veins) | joins, tiers | Patch fragment of the upper tier, with the lower member's copy (risk R3). |
| Knock-out ring where one tier's vessels cross (`paperInk`, `kn`, `kcas`) | the crossing vessel | Lumen pass of the upper vessel writes the ring over the lower lumen (it is drawn later, depth = z). |
| Crossing ownership (nearest, unless inside an unjoined vessel above it) | z | Depth test on z within a tier. |
| `outColor` (RGBA8 premultiplied, dithered) | | Every colour pass, blended premultiplied; the dither once in the last pass (risk R4). |
| `outFlow` (RGBA16UI: row + 1 \| LUMEN2, 16 × (arc + S_OFF), across, visibility \| share) | | Lumen pass and patches write it where the lumen shows (`lumA > 0.02`), back to front, so the front lumen's stays. Integer targets do not blend: last write wins (risk R2). |
| `outFlow2` (RG16UI, `ROW2_BITS`) and the LUMEN2 bit | | Patches only (a second lumen exists only near a join). Strips write the bit clear and leave target 2 alone (`drawBuffers` NONE there), as the one-vessel build does today. |
| `outDep` (R8, a lumen colour reaches the pixel) | | Lumen pass (`aL > 0`) and glow pass (own-colour glow). |
| `redraw` mode (`drawRows`, pans' strips: an empty pixel is written empty) | | The scissored area is cleared first (cells' box), then drawn, instead of each pixel writing zeros. |
| `tint` mode (`tintPass`: colour only where `depL`) | | Lumen and glow passes only, colour target only, `depL` test kept. |
| Morphs (`morphOn` 1 / 2, `posBase`, `joinBase`) | ent rows after the entries | Strip vertices read the frame's points with the classic `PT()`; patches read the frame's join with `JT()`. |

## 2. Draw order, and why it gives "each tier as one shape"

Per tier `t`, lowest first (`tierAlpha[t]`, group `tierGroup[t]`):

1. **Shadow**: the tier's strips at `r + shadow reach`, offset by `shOff`, colour target only, blend MAX on alpha (equation MAX),
   so overlapping shadows of one tier merge as the classic `min(Ds)` union does.
2. **Casing**: the tier's strips at `r + casing`: casing colour, premultiplied over.
3. **Lumen**: the tier's strips at `r`, over every casing of the tier, depth = z within the tier (crossings). Because all of the
   tier's lumens come after all of its casings, no casing of the tier ever covers one of its lumens: the classic union
   ("one shape") look. Writes `outFlow`, `outDep`.
4. **Patches** of the tier's joins: the fillet's casing and lumen and the blended colour, caliber and shading, with the lower tier's
   copy near a join.
5. **Glow** of the tier's lit vessels: strips widened by the glow width, under the lit vessel itself (stencil from its lumen) and over
   the tiers beneath; "up" glows after the whole group.

Each tier's alpha (`tierAlpha`, the vessel's fade `sa`) is applied in its passes; the organ fade (group 0) per pixel. One draw call per
pass per tier, instanced over the tier's rows (rows sorted by tier once per `setTubes`), so about 5 × tiers in use calls a layer (12–25).

## 3. Shading code shared by the classic and mesh shaders (Phase 2.1)

Moved out of `vesselFS` into one string `SHADE_GLSL` (in `veins-mesh-glsl.js`), the same arithmetic. The classic `main()` calls them
per slot; the mesh shaders per strip vessel or per patch member. Planned signatures:

```glsl
struct Near { float d, sh, r, u, x, v; vec2 g; };            // wall distance, shadow distance, radius, along, across, soft along, direction
void segNear(inout Near n, inout float aM, inout float aW, inout float aU, int id, int i, vec4 A, vec2 p, vec2 ps, vec4 clip, bool dotted);
float occlAt(vec2 p);                                          // organ cover × VEIL_K × organK
struct Ves { float tier, z, flags, wall, a, hov, sel, of; vec3 col, edge; };
Ves vesAttrs(int id, Near n, vec2 p, float occl);              // texels 0–12: colour along, recolour, fades, veil, selection ease
vec4 glowOf(int id, Near n, Ves v, out bool dep, out bool up); // the band, its ends and stretch
float cornerOf(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw);   // today's corner()
vec4 shadowOf(float Ds, float wall, bool sel, float aa);
vec4 tubeShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, int grp, int id, float v, float hov,
               float kn, float kcas, float px, float aa, out float aL);   // casing, lumen, lines, rim, hover, ring
uvec4 packFlow(uint id, uint id2, float s, float y, float w, float b);
uvec4 packFlow2(uint id2, float s2, float y2);
vec4 ditherOut(vec4 o, vec2 q);
```

The refactor lands alone first, with the classic picture unchanged (same operations in the same order), and the fast checks.

## 4. Phase 3 choices, as built

- `draw` (a whole draw) and `shiftLayer` (a pan's uncovered strips): the mesh pass, through the same pieces and scissor (`wrapPieces`), the
  piece cleared first. Depth and stencil are cleared inside the scissor too.
- `drawRows` (and the rows it would recolour with `tintPass`): the changed rows' cells, rounded out to 128 px tiles and grouped into at
  most 12 boxes, each cleared and drawn again by the mesh pass through its scissor, every vessel in it. Each pixel there ends as a whole
  draw would leave it (the brief's "the same picture"), and the rest of the layer is kept. More than 60% of the cells: a whole draw.
  (First built as a whole mesh draw for every partial one; at rest that was about 11 whole draws a second, 8 Nov 2026.)
- One-pass zoom frames (`fused`): off while the mesh draws; each zoom frame is a whole mesh draw and the normal composite.
- `lowPass` (Vessels lower while pinching): not with the mesh on (owner, 9 Nov 2026: "Mesh is mesh. Classic is classic. No hybrid"); a pinch frame is a whole mesh draw. `reuseDraw`, the upscale: unchanged (they read
  the layer). Morphs: the strips read the frame's points (`PT()` from `posBase`), the patches the frame's joins (`JT()`).
- Falls back to classic: the switch off, software GL, the lobule (it never builds the mesh programs), a shader that fails to compile or
  link (console.warn), a depth or stencil target the driver will not make. Until the programs are published (parallel compile) the classic
  pass draws.
- `?perf`: the gauge "vessel renderer" says `mesh: N passes, N strips, N patches drawn` or `classic: <why>`, and "vessels: mesh" counts
  mesh draws.

## 6. How the passes pick the fragment that draws (as built)

Hardware blending cannot take the minimum over a tier the way the classic shader does, so each pass (glow, up glow, shadow, shape) has a
prepass: every fragment of the tier writes a key as its depth, no colour, and the depth test (LESS) keeps the lowest. The pass then runs
over the same strips and patches and draws only the fragment whose key is the kept one (depth EQUAL: the same program on the same inputs
makes the same key); the stencil lets it draw a pixel once (two overlapping triangles of one vessel make the same key). Keys: the shape, a
lumen by its z (the vessel drawn above wins, as the classic crossing rule), else the nearest wall; the shadow and the glow, the strongest.
Each pass's keys lie below every earlier pass's, so the depth is cleared once a draw (and after 64 passes). The lift (the selected vessel's
own share over the dimmed network) draws over the shape pass's keys (EQUAL). The crossing ring: a mark pass sets the stencil where the
tier's shape kept a lumen (depth GREATER than the lumens' top key), then the ring draws where it is marked and the kept lumen's z is under
the crossing vessel's (depth LESS).
The depth and stencil are one DEPTH24_STENCIL8 buffer on the layer's own framebuffer, so every prepass and pass of a draw goes to the
same framebuffer (9 Nov 2026: the first build kept the keys in a framebuffer of their own and switched to it twice a pass; on a tiled GPU
each switch stores and loads the whole layer, its four targets, which made the mesh slower than the classic pass). Switched off, the
layer gives the depth and stencil back. A shadow drawn with MAX into a scratch layer (the brief's 2.2) was tried and taken back the same day:
the scratch is another switch per tier.
Known differences from the classic picture: a casing, shadow or ring over another tier's lumen hides that lumen's stream there (integer
targets do not blend); a fade (tier alpha below 1) is applied to the shadow and the shape separately; where more than eight vessels meet,
all of them are drawn (the classic keeps eight); glows are cut only by lit lumens of their own tier.

## 5. Risks, and what I do not yet understand

- **R1 Group dimming.** The classic fades the whole network group by `netAlpha` *after* compositing it (`accN`), and lays the selected
  vessel's own share on top (`accT`). Hardware blending cannot fade a group as one. Plan: while `netAlpha < 1` (a vessel focused), the
  network group is drawn into a scratch RGBA8 target and laid with `netAlpha`, the selected vessel's lift on top. Otherwise exact.
- **R2 Integer targets do not blend.** `outFlow` / `outFlow2` keep the last write. Back-to-front order gives the front lumen's, as the
  classic does, except its "a lower copy adds to the lumen and keeps its stream" rule at cross-tier joins, which the patch must do itself.
- **R3 Cross-tier joins** (`keep`, `pres`, `tin`): the lower tier's vessel is drawn less where the upper tier's copy covers it. The
  patch of the upper tier has to know what the lower tier drew there. Plan: compute the same `keep` in the lower tier's lumen pass for
  pixels inside a join patch (the patch list is per pixel at most 6, so a second small instanced pass), else small seams can appear.
- **R4 Dither and 8-bit rounding.** The classic rounds once at the end; several blended passes round at each step. Differences of a level
  or two in soft gradients (glow falloff, shadows) are expected; the dither moves to the last pass of each pixel.
- **R5 Glow inside another lit vessel's lumen** (the cava's two lengths lit together): the band is cut at the other's wall. Plan: the
  glow pass is stencilled out of every lit lumen drawn so far.
- **R6 Knock-out ring** needs the crossing vessel's casing distance: drawn by the upper lumen pass as a widened ring over the lower lumen.
- **R7 Hairpins and short vessels:** mitres clamped, bevel fallback; covered by `tests/veins-mesh.test.js`.
- **R8 Memory:** a depth buffer (4 bytes a pixel) for the z order, and a scratch RGBA8 target for R1.
- Not yet understood: how often the MAXS = 8 slot eviction (`key`, glow −16) actually decides a pixel today (the mesh path has no
  slots, so where eight or more vessels meet, the mesh will draw all of them); and whether `tn` (the nearer trunk stretch at a fork)
  needs vessels outside the join's own four members.
