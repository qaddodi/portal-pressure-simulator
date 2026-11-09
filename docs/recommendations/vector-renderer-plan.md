# Vector vessel renderer: the plan

> **Revised 9 Nov 2026, 17:00 UTC: read `vector-renderer-plan-r1.md` first.** The reviewer's second recommendation
> (`vector-renderer-brief-r2.md`) replaces section 4's fixed 16-unit classification with an adaptive, segment-level hierarchy (short runs,
> bounds for each contribution, adaptive leaves, explicit overflow, workload measurement), changes section 5.2's member loop, and adds
> workstreams K and L. Everything else here stands. None of the six acceptance criteria has passed yet.

9 Nov 2026. For Mohammad. Plan and contract only: no render code changed. Read from the code at preview tip `63aa6ae`
(branch `claude/settings-topbar-icon-flvft1`; mesh renderer last pushed in `7955b2d7`), `docs/veins-mesh-plan.md`,
`docs/recommendations/vessel-renderer-alternatives.md`, `/mnt/project-files/portal-reliability/render-cost-plan.md` and project
memory.

The brief is the reviewer's recommendation as Mohammad sent it on 9 Nov (kept word for word in
`docs/recommendations/vector-renderer-brief.md`): **a retained GPU vector renderer with sparse, explicitly resolved junctions and
crossings, with blood shaded directly on that geometry, in the existing WebGL2 figure context.** This plan builds that brief as
written, sections 1 to 9 and its acceptance list. It replaces the field atlas (idea A of the alternatives doc), as the reviewer says.
Where this plan had to choose something the brief leaves open, the choice is marked **(choice)** so it can be overruled. Nothing in
it shrinks or swaps the brief; anything that turns out not to work is a stop point that asks Mohammad first.

Rules kept everywhere:
- Everything is drawn on the GPU, every frame, the fallbacks included.
- It is a pure renderer: a third choice in Settings › Display (Classic, Mesh, **Vector**). With Vector chosen, no classic or mesh
  vessel pass, no classic composite (`COMP_FS`), no one-pass zoom (`veins-fuse.js`), no "vessels lower while pinching" (`lowPass`)
  and no pinch reuse (`reuseDraw`) draws any frame. Classic and Mesh stay exactly as they are.
- The lobule follows the setting: with Vector chosen, the lobule's vessels are drawn by Vector too (today the lobule always uses
  classic, `who: 'lobule'`).
- Checks are node only: unit tests, `tests/glsl-lint.js` on every new shader, and `scripts/stage-trace.mjs`. No headless browser
  runs, no screenshots. Mohammad is not asked to test or to send `?perf` readouts; the work is pushed and he looks when he likes.

## 1. Short version

The renderer prepares the anatomy once and keeps it on the GPU. A frame mostly moves that geometry and animates its material.

1. **A compiled cell grid.** The world is already cut into 16-unit cells by `binVeins` (`veins-bin.js`). The compiler classifies
   every cell: empty, **owned by one vessel's ordinary stretch** (with the run of its segments that can reach the cell), or an
   **interaction region** (a connected junction, an unconnected crossing, a hairpin or self-overlap, a close approach) that lists
   its members and joins. Reach includes the shadow, glow, selection ring and hover, not only the lumen.
2. **Ordinary stretches are retained strips.** The mesh renderer's strip geometry (`veins-mesh.js`, vertices placed from textures)
   is kept, one instanced strip per vessel. Its fragment shader already knows its vessel and reads its cell's segment run, so it
   evaluates only that vessel's few segments, then shades the vessel and its blood in the same fragment, and draws nothing in a
   cell it does not own.
3. **Interaction regions resolve their members together.** One quad per region cell runs the junction, crossing and hairpin rules
   (today's classic join equations, fillets, trunk and fork roles, cross-tier copies, knock-out rings, tier compositing and group
   opacity) over that region's members only, blends blood from each contributing stream in its own coordinates, and writes the
   pixel once.
4. **The partition is exact.** Both programs find the cell from the pixel's own centre with the same matrix and the same floor.
   A pixel is drawn by the strip of the vessel that owns its cell, or by its region, never both. That removes the mesh's key
   prepasses and depth EQUAL passes altogether.
5. **One target, one pass in motion.** A camera, morph or deforming frame draws organs, vessels, blood and the overlays straight
   into the figure's picture in one render pass. No flow targets (`RGBA16UI`, `RG16UI`) and no lumen mask are written: the blood
   reads the vessel's coordinates where it is shaded.
6. **Cheap still frames.** At rest a colour-only base picture is kept (organs and vessels, no blood). A frame where only the blood
   moved draws only the lumen pixels, reading the base under them.
7. **Organs are retained geometry too.** Their meshes are prepared at every detail level up to the deepest zoom before a gesture,
   kept, and moved by the camera matrix; deformation is vertex interpolation where the outline correspondence holds, prepared
   geometry where it does not.
8. **Built in parallel.** Ten workstreams (A to J, section 9), each owning its own files, all starting at once against the contract
   in `src/ui/vec-contract.js` (pushed with this plan).

## 2. What the brief asks, and where each part is built

| Brief section | What it asks | Built by (section 9) |
|---|---|---|
| 1. Persistent graph | Vessel centreline and radius, connections, identity and depth, material, selection and visibility, flow, direction, streams; organs' outlines, shapes, gradients, masks, deformation. Reusable GPU buffers. Camera = a matrix; pressure = parameters; no reparsing. | A (graph), F (organs), E (buffers) |
| 2. Ordinary stretches and interaction regions | Small shader for ordinary stretches; dedicated regions at joins, crossings, close approaches, hairpins; regions partition the drawing; sparse world grid; consistent clipping at cell edges; reach of shadows, glows, rings included. | A (compile), B (stretch), C (region) |
| 3. Connected vessels as one shape | Local distances, union and fillet, member contributions, blended radius, wall, colour and shading, coverage once. Crossings keep depth and do not mix streams. Cross-tier joins keep the trunk and tributary rules. Group opacity after compositing the group. | C |
| 4. Blood from vessel coordinates | Along, across, identity, stream data from geometry; regions supply the contributing streams; no full-resolution flow images in normal display; keep `blood-tile.js`'s two-phase mipmapped tile. | B, C, D |
| 5. Continuous, coherent blood motion | Integrated travel; anchored to the vessel; physical vs drawn dimensions kept apart; continuity across drawing objects; blend sampled streams, not coordinates; contributions follow the flow direction; provenance kept apart from decoration. | D |
| 6. Filtering at every zoom | Mipmaps, screen-space derivatives, smooth attenuation of unresolved detail, stable phases, continuous cross-lumen profile. | D |
| 7. Organs as retained vector geometry | Triangulated interiors, exact boundaries, gradients and material coordinates on the geometry; detail levels prepared ahead within a maximum zoom and kept; GPU vertex interpolation for deformation; separate geometry where topology changes; explicit clips and masks, updated only when their shape changes; tissue texture may stay a texture. | F |
| 8. Soft effects near boundaries | Shadows and glows as bounded geometry with analytic coverage; keep today's look first, then localise; glass stays a separate scene-sampling effect. | B, C (vessels), G (organ glows, outlines) |
| 9. Cheap stationary frames | The change table (blood, camera, colour, radius, organ, nothing); a colour-only static base at rest; the blood pass over it; explicit invalidation; interaction lists covering the width and motion ranges, morphs included. | E (frames), A (ranges) |
| Vertical slice | Curved vessels, a confluence, an unconnected crossing, a cross-tier junction, one deforming organ, moving blood, with selection, transparency, radius changes and morphing. | Phase 1 (section 8) |
| Measurement | Whole frames including presentation and glass, on the devices; GPU timer queries read asynchronously and checked for invalid results; 16.67 ms and 8.33 ms are whole-frame budgets. | E (timers in `?perf`), J |
| Acceptance | Seamless joins and region edges at maximum zoom; stream ownership at crossings and confluences; continuous blood through speed change and reversal; stable streaks in slow pinch and pan; fades and selection without double-darkening; sustained pacing after warm-up. | J (node checks), Mohammad on his devices |

## 3. The persistent graph (brief section 1)

**Where it comes from (choice).** Everything the graph needs already reaches `veins-gl.js` through its API, so Vector reads the
same inputs and nothing upstream changes (no `stage.js` edit, which is over its line budget):

| Graph field | Today's source in `veins-gl.js` |
|---|---|
| Centreline, 64 samples a vessel row | the binned entries (`setGeometry` / `patchGeometry`: `entCPU`, `cellsCPU`), turned back into points as the mesh does (`pointsFromEntries`, `veins-mesh-data.js`) |
| Radius along the course | `setRadii` (`radAll` mirror, the `rad` texture) |
| Connections ("connected here") | the join entries in the cells (`joinEntryList`, `patchGroups`): members (at most 4), trunk, fork, run-on |
| Identity, tier, depth (z), flags, material, selection, hover, glow, fades, drawn part | the tube texels (`setTubes`, 13 texels a row: `tubeNow` mirror, `tube` texture) |
| Flow, direction, stream distance, chains, origins, dye | `setFlow` (8 flow texels a row, anchored by `stage-blood.js` `anchorStream`), `setDye` |
| Curvature for arrowheads | `setBend` |
| Morph frames | `makeMorphSet` (swept binnings from `veins-sweep.js`), `setMorphFrame` |
| Organs | the organ painter's op lists as `stage-organs.js` hands them to the organ stack (`setLive`, `setLiveAll`), the fluid (`setFluid*`), outlines and glows (`setLines`), the catheter (`setCath`) |

`vec-graph.js` (A) holds one record a vessel and keeps it in place: rebuilt on a new binning, patched by `patchGeometry`, its radii
and attributes read from the mirrors. The GPU buffers are the mesh's: one static strip index buffer (`stripIndex`), the points
texture, the existing `rad`, `tube`, `flow`, `bend`, `dye` textures (shared with the instance, not copied), plus Vector's own cell
and region textures. A camera change writes uniforms only. A pressure change writes the tube and flow rows that changed. No path is
parsed and no geometry rebuilt for either.

## 4. The cell grid: ordinary stretches and interaction regions (brief section 2)

**Cells.** The binning's own 16-unit squares (`CELL`), over the binning's box plus one cell (`GRID_PAD`). A texture of one `RGBA16UI`
texel a cell (layout in `vec-contract.js`): kind, then the vessel row and its segment run `[i0, i1]` for an ordinary cell, or the
region index for a region cell.

**Classification (A), per cell, with each vessel's full reach** (lumen, casing, contact shadow offset and blur, glow width, selection
ring, hover; radius × `REACH_HEADROOM`):

| The cell holds | Kind | Drawn by |
|---|---|---|
| no vessel's reach | empty | nothing (no vessel shading) |
| one vessel, whose segments within reach form one run of at most `WIN_MAX` (8) segments | **ordinary** (row, `i0`, `i1`) | the stretch shader (B) |
| members of a join entry | region `K_JOIN` (and `K_CROSSTIER` when the members' tiers differ) | the region shader (C) |
| two vessels' reaches with no join between them | region `K_CROSS` (or `K_NEAR` when their lumens do not overlap) | C |
| one vessel whose segments within reach are not one run, or more than `WIN_MAX` | region `K_HAIRPIN` / `K_LONG` | C |
| a morph set's cell whose swept members differ over the stretch | region `K_MORPH` with every member the sweep reaches | C |

A region lists up to `MAX_MEMBERS` (16) members with their own segment runs, and up to `MAX_JOINS` (6) joins. The shader keeps the
nearest `SLOTS` (8) per pixel, as classic's `MAXS` does. More than 16 members in one cell is a stop point (section 10).

**The partition rule.** Every program computes `world = inv × gl_FragCoord.xy` with the same uniform matrix, then
`cell = floor((world − gridO) / CELL)`, then reads the cell texel. A stretch fragment draws only when the cell is ordinary and its row
is the strip's own; a region quad covers exactly its cell's square and its fragment draws only when the cell is that region. One
pixel centre has one cell, so a vessel's contribution can only reach a pixel once and there is no seam from two programs both
blending. Where only one member reaches a pixel inside a region, the region shader calls the very same single-vessel function the
stretch shader calls (B's `vecShadeOne`), so the pixel values on both sides of a cell edge match exactly. Over-zoom does not open
seams, because nothing is interpolated across the edge: both sides evaluate exact distances.

**Why strips at all, not cell quads.** A strip rasterises only near its vessel (its pad is the vessel's reach), so the many cell pixels
a thin vessel never touches cost nothing. Overlapping triangles of one strip at a bend would blend twice; the strip writes a constant
depth per row with depth LESS, so the second fragment of the same vessel at a pixel is dropped. Every fragment of a vessel in a cell
reads the same segment run from the cell, so whichever fragment wins gives the same value.

**Keeping regions valid while things move (brief section 9's main correctness challenge).**
- Width: reach is compiled with `REACH_HEADROOM` over the radius now. `setRadii` checks each changed row against its compiled reach
  and recompiles only that row's cells (and their neighbours) when it is exceeded. A node test drives every width easing of every
  deck slide's preset through this check.
- Selection, glow and hover change reach: compiled at their largest (`glow` width ≤ 1.3, ring, hover), so they never recompile.
- Morph: each morph set comes from `binSwept` (`veins-sweep.js`), already conservative over its stretch of the change; A classifies
  the swept cells, and any cell whose membership differs over the stretch is a `K_MORPH` region listing everyone. A new crossing in
  the middle of a morph is therefore already a region.
- A coiling collateral (`patchGeometry` with `patchCells`): those cells are reclassified, nothing else.

## 5. The shaders

### 5.1 Ordinary stretch (B, `vec-stretch-glsl.js`)

Vertex: the mesh's `STRIP_VS_GLSL` / `meshWorld()` (imported from `veins-mesh.js`, not copied), padded by the vessel's full reach.
Fragment, in this order:
1. Cell test (section 4). Not owned: discard.
2. `vecNear(row, i0, i1, p, p − shOff)`: the exact capsule distance over the cell's run (the mesh's `segNear` maths): wall distance,
   shadow distance, radius, along `u`, across `x`, soft along, direction.
3. `vecShadeOne(...)`: the vessel's shadow, casing, lumen, flat shading lines, rim, hover, selection ring and lift, glow, fades,
   veil and organ cover, dotted collaterals, recoloured stretches, drawn part, the same arithmetic as classic's single-slot path
   (shared pieces in `veins-mesh-glsl.js` `shadeGLSL`, imported).
4. In the lumen: `vecBlood(...)` (D) at (row, `u`, `x`), laid over the lumen colour.
5. Premultiplied output, dithered once (it is the pixel's only vessel write).

Variants (`V_FULL`, `V_BASE`, `V_BLOOD`, contract): BASE skips step 4; BLOOD runs only on the lumen strip (radius pad, not reach),
reads the kept base at the pixel, lays the blood over it and then the over-blood overlays (G's `vecAboveAt`).

### 5.2 Interaction region (C, `vec-region-glsl.js`)

One instanced quad per region cell. The fragment reads its region record and, over its members only:
1. Each member's `vecNear` over its own run; keep the nearest `SLOTS`.
2. **Connected junction:** the classic join rules exactly as `vesselFS` has them today (the `smin` fillet, `corner()`, trunk and fork
   roles `jt` / `jtf` / `tn`, run-on stretches, the deep blend), applied to the region's join list: combined boundary and fillet,
   member shares inside it, blended radius, wall, colour and shading direction, outer coverage once.
3. **Cross-tier junction** (the hepatic veins into the cava): the classic cross-tier copies (`keep`, `pres`, `tin`): trunk and
   tributary rules kept, never "whichever was drawn last".
4. **Unconnected crossing:** depth by tier and z, the knock-out ring (`paperInk`, `kn`, `kcas`), the casing over the lower lumen;
   the visible stream is the front lumen's only, never a mix.
5. **Hairpin / long run:** the member's several runs resolved as one vessel (nearest point over all of them).
6. **Tiers and groups:** each tier composited as one shape, back to front, with `tierAlpha`; the network group composited whole and
   then given `netAlpha`, the selected vessel's own share laid over it (classic `accN` / `accT`). So a fade or a focus never
   double-darkens where vessels overlap.
7. **Blood:** for each member whose lumen shows, its stream sampled in its own (row, along, across); the samples blended with the
   junction's normalised weights (D's `vecBloodMix`). Crossings: the front lumen's stream only.
8. Write once, premultiplied, dithered.

Single-member pixels call B's `vecShadeOne` and D's `vecBlood` unchanged, which is what makes the cell edges seamless (section 4).
The same three variants as 5.1.

### 5.3 Blood material (D, `vec-blood-glsl.js`, `vec-blood-math.js`)

Everything `COMP_FS` lays in a lumen, moved to functions the two shaders call with the vessel's own coordinates:

| Today in `COMP_FS` (veins-gl.js) | In `vecBlood` |
|---|---|
| `bloodAt`: parcels, style D tile (`blood-tile.js` `D_GLSL`, two phases half a cycle apart, mipmapped), style E (`E_GLSL`), legacy | kept; the tile read with `textureGrad` |
| `flowD`, `flowDrift`, `rootDD`: the stream's distance and drift from its anchor on the blood clock `bT` | kept as is (already integrated: `anchorStream` re-anchors at each speed change, the GPU adds `(v + ½ a t) t`) |
| chains (flow texel 5: parent, root, A, B, weight): one pattern through several drawing objects | kept: continuity across drawing objects |
| `originAt`: blood origin streams side by side, Péclet mix along a sloshing vessel | kept (provenance: physiological state) |
| `dyeAt`, `dyeEdge`: bolus with a bullet front | kept |
| `castAt`: EUS glue cast | kept |
| `lymphAt`: lobule lymph dashes and albumin core | kept |
| stasis smoke, reversed-flow colour (`revCol`), `flowA`, `blendA` fades, `lenOn` streak length | kept |
| `chevAt` in-lumen arrowheads (when `chevQuad` is 0); `blood-heads.js` quads (when 1) | kept; the head quads drawn in Vector's pass after the lumens |
| bleeds (`bleedE`, `bleedB`): spray and pool (the stomach lumen `STO`) | kept, drawn in the lumen and the pool region |
| the half-size streak pass (`halfL`, `STREAK`) for wide lumens | **not used** (choice): with filtered derivatives a wide lumen's streaks cost one tile read a pixel; a stop point if that is slower than the half pass on his devices |
| the flow targets (`gbuf`, `gbuf2`) | **gone**: row, along and across come from the geometry |

Filtering (brief section 6), all in `vecBlood`:
- **Mipmaps** on the tile (already built by `createBloodTile`).
- **Derivatives**: the footprint along is `px` (world units per device pixel) and across is `px / R`, computed analytically and passed to
  `textureGrad`, not taken from `dFdx`, so the same call is valid inside the region shader's member loop (derivatives are undefined in
  non-uniform control flow).
- **Smooth attenuation**: the fine octave's share fades with the footprint (a smoothstep over 0.5 to 1.5 texels), the coarse one's
  beyond that, toward the lumen's mean, so a streak never shimmers or runs backwards as it shrinks below a pixel.
- **Stable phases**: each stream keeps its row's layer and golden-ratio start (as today); a chain keeps its root's.
- **Cross-lumen profile**: the continuous Poiseuille profile look D already uses.

Coherence (brief section 5), checked in node by D on `vec-blood-math.js` (a JS mirror of the GLSL arithmetic):
- **Integrated motion**: distance continuous across a speed change, a beat, a re-anchor and a reversal (`REVERSE_SETTLE`, `REVERSE_HOLD`).
- **Anchored to the vessel**: along and across are world-space coordinates of the vessel, so a camera move leaves them unchanged.
- **Physical vs drawn**: the stream's speed comes from the model's velocity (`displaySpeed`, `blood.js`), never from the drawn radius.
  D adds a test that the speed path reads no drawn radius; if any place does, that is a stop point (fixing it changes classic too).
- **Junctions**: `vecBloodMix` samples each stream in its own coordinates and blends the results with weights that sum to one; the
  weights follow the current flow direction (upstream members supply the junction; a reversal swaps them, eased as the chains' weights
  are).

## 6. Organs as retained geometry (F, brief sections 7 and 8)

With Vector chosen the organ stack's pictures (`organs-gl.js` layers, the plate rasters) are not drawn: Vector draws the organs from
geometry, in the same pass as the vessels.
- **Source**: the organ painter's op lists (`organ-paint.js`: paths, ellipses, fills, strokes, linear and radial gradients, opacities,
  clips, group masks), read exactly as the stack reads them, and its triangulation (`shape-gl.js` `polyMeshInto`). F may add exports
  to `organ-paint.js` and `shape-gl.js`, never change their behaviour.
- **Detail levels prepared ahead**: today `detailTol(sc)` and `meshOf()` make a new mesh when a pinch doubles the zoom. F prepares
  every level from the fit view to the deepest supported zoom (the camera's own limit: F finds where it is set and names it) when the organs are first read, keeps them all,
  and picks the level per frame by scale. A pinch or pan never flattens or triangulates.
- **Gradients and material**: per-vertex organ coordinates; the gradient (stops from `stop-tokens.js`, transform, spread) evaluated
  in the fragment from them.
- **Clips and masks**: stencil from the clip's own retained mesh in the same pass (no render target switch). A mask whose shape changes
  (the gut's cut by the liver and the spleen, the stomach's see-through liver) is redrawn when that shape changes, not per consumer.
- **Deformation**: the liver's outline morph (`stage-organs.js` `morphOutline`, `liverSurface`) and the spleen: where both outlines have
  the same point count and order, the GPU interpolates the vertices; where the topology changes (cirrhotic nodules appearing), the new
  geometry is prepared ahead and crossfaded by the same easing.
- **Organ covers for the vessels' veil** (`organ` sampler, `organRect`): rebuilt from the retained geometry when an organ deforms.
- **Soft effects**: the organs' contact shading (`org-ao`) and the slide glows as bounded geometry along the edges (a band a reach wide)
  with analytic coverage, the same look first.
- **Tissue**: decorative tissue textures stay textures in organ coordinates (the brief allows this); anatomical boundaries are geometry.
- **Organs the painter cannot read today** (filters, nested masks, focal points: `organ-paint.js` header): F lists them in its first
  push. Each must be made readable or it is a stop point (section 10). None is drawn from an SVG raster in Vector.

## 7. Frames and caches (E, brief section 9)

The renderer core owns the frame. Its picture goes where the classic composite writes today (the instance's own picture `own`, or the
shared screen texture `SCR()`), so the present, keep-screen, labels, leaders and GPU glass downstream are unchanged and read it as they
read the composite now. Glass stays a separate scene-sampling effect restricted to its regions.

| Change | Vector's work |
|---|---|
| Blood advances (rest) | One pass, `V_BLOOD`: lumen strips and lumen regions only, scissored to the blood's dirty boxes (the existing `bloodDirty` / tiles), reading the kept base |
| Camera moves (pan, pinch, wheel, glide) | One pass, `V_FULL`: organs, under-overlays, strips, regions, heads, over-overlays, straight into the picture; uniforms only change |
| Colour or selection changes | `setTubes` rows: the kept base redrawn in those rows' cells' boxes (scissor), `V_BASE`; then the blood pass |
| Radius changes | the `rad` rows; recompile only if past the compiled reach (section 4); base redrawn in the affected boxes |
| Organ deforms | its vertices or prepared geometry; its masks and the organ covers redrawn; base redrawn in its box |
| Morph (view switch) | `V_FULL` every frame from the morph set's points and regions |
| Nothing visible changes | nothing drawn (the frame scheduler already asks for no frame) |

- **The kept base** is one `RGBA8` texture the size of the picture, holding the scene up to and including the vessels, without the
  blood and without what lies over the blood (the ascites and the organ outlines, as `COMP_FS` orders them:
  `over(lineL, over(fluid, over(vessels, over(pool, plate))))`). The frame where motion ends writes it (choice: E picks MRT in the last
  `V_FULL` pass or one `V_BASE` pass, by counting render passes, the Apple lesson below).
- **Depth and stencil**: one `DEPTH24_STENCIL8` renderbuffer on Vector's own picture framebuffer (the stretch's per-row depth, the organ
  clips). Never a second framebuffer inside a pass. Apple tiled GPUs store and reload every attachment at each switch; this was the
  mesh's first slowdown (memory `vessel-mesh-renderer`).
- **Compile and readiness (choice)**: Vector's programs are started at boot when Vector is the stored choice (parallel compile,
  `gl-compile.js`), and on the switch otherwise. Until they are ready the figure shows its last picture (as any setting switch does).
  A device that cannot build them gets the Settings choice shown as unavailable with the reason, and its stored choice goes back to
  Mesh: a whole-renderer setting, never a mix inside a frame.
- **Measurement (brief "What would establish")**: `?perf` gets the gauge `vessel renderer: vector: N strips, N regions (join, cross,
  hairpin, near, morph), N passes`, and GPU time per frame kind (FULL, BASE, BLOOD) from `EXT_disjoint_timer_query_webgl2` through
  the existing probe, read asynchronously, results dropped when `GPU_DISJOINT_EXT` is set. Whole-frame times stay the panel's own.
  The budgets (16.67 ms at 60 Hz, 8.33 ms at 120 Hz) are whole frames.

## 8. Phases

All ten workstreams start at once. Each phase is a milestone inside each workstream, not a wait between them. Every push goes to the
workstream's own `claude/vec-<letter>-preview` branch and is merged into the preview branch when its node checks pass; files do not
overlap, so merges are clean.

- **Phase 0 (this push).** The plan, the brief, the contract (`src/ui/vec-contract.js`).
- **Phase 1: the vertical slice** (the brief's). The anatomy view, `preset=cirr-decomp`, drawn entirely by Vector: curved vessels; the
  portal confluence (a connected junction); an unconnected crossing (A names the slice's crossings, from the binning, in its first push); the hepatic veins into
  the cava (a cross-tier junction); the liver's outline morph (a deforming organ); moving blood (style D); a vessel selected (the
  network dims, the selected one lifts: transparency); a width easing (radius change); the Anatomy ↔ Circuit switch (morph). Settings ›
  Display gets the three-way choice when the slice draws end to end (H). The `?perf` vector gauge and GPU timers are in.
- **Phase 2: every feature.** Every row of the feature tables in sections 5 and 6 and appendix A: dye, origin lens, bleeds, glue cast,
  lymph, dotted collaterals, drawn parts, recoloured stretches, glows up and down, catheter, ascites, circuit map, organ outlines and
  glows, every organ, every deck slide's preset, the lobule (I).
- **Phase 3: acceptance.** The brief's six acceptance points (section 11) with their node checks green, and the docs.

## 9. Workstreams, file ownership, briefs

A file is edited by its owner only. Every other workstream may import it. Shared files that already exist are read-only for all
workstreams except where a row says otherwise.

| | Workstream | Owns (new unless marked) | May also edit |
|---|---|---|---|
| A | Graph and interaction compiler | `src/ui/vec-graph.js`, `src/ui/vec-compile.js`, `src/ui/vec-contract.js`, `tests/vec-graph.test.js`, `tests/vec-compile.test.js` | none |
| B | Ordinary stretch shader | `src/ui/vec-shade-glsl.js`, `src/ui/vec-stretch-glsl.js`, `tests/vec-stretch.test.js` | none |
| C | Interaction region shader | `src/ui/vec-region-glsl.js`, `tests/vec-region.test.js` | none |
| D | Blood material | `src/ui/vec-blood-glsl.js`, `src/ui/vec-blood-math.js`, `tests/vec-blood.test.js` | none |
| E | Renderer core, frames, caches, timers | `src/ui/vec-renderer.js`, `src/ui/vec-targets.js`, `src/ui/vec-frame.js`, `tests/vec-renderer.test.js`, `tests/vec-frame.test.js` | none |
| F | Organs as retained geometry | `src/ui/vec-organs.js`, `src/ui/vec-organs-glsl.js`, `tests/vec-organs.test.js` | `organ-paint.js`, `shape-gl.js`: new exports only |
| G | Scene overlays and soft effects | `src/ui/vec-overlays.js`, `src/ui/vec-overlays-glsl.js`, `tests/vec-overlays.test.js` | none |
| H | Setting and the seam | `tests/vector-setting.test.js`, `tests/vec-seam.test.js` | `frame.js` (the choice), `main.js` (the Settings row), `veins-gl.js` (the seam only), `tests/vessel-mesh-setting.test.js`, `tests/settings-product.test.js` |
| I | The lobule under Vector | `src/ui/vec-lobule.js`, `tests/vec-lobule.test.js` | `lobule-zoom.js` (Vector-only branches, no added lines elsewhere) |
| J | Acceptance, trace, docs | `tests/vec-accept-*.test.js`, `docs/vector-renderer.md` | `scripts/stage-trace.mjs` (a `--renderer` flag), `CHANGELOG.md`, `docs/PERFORMANCE.md` |

No workstream edits `stage.js` (over its line budget, `scripts/size-budget.json`), the classic or mesh shaders, `COMP_FS`,
`blood.js`, `stage-blood.js` or `organs-gl.js`. A need to is a stop point for that workstream: ask the coordinator.

`veins-gl.js` belongs to the mesh renderer's thread ("Build vessel mesh renderer"). H edits only the seam (section 9.H) and tells that
thread before each push touching the file.

Common rules for every workstream (each brief below includes them by reference; the coordinator pastes this list into every brief):
1. Repo `qaddodi/portal-pressure-simulator`. Branch from `claude/settings-topbar-icon-flvft1`, work on `claude/vec-<letter>-preview`,
   merge into `claude/settings-topbar-icon-flvft1` when your node checks pass, push. Never push `main`.
2. Build this plan's section for you exactly. No smaller or substitute design. If something will not work as written, stop and ask
   Mohammad one short question through your thread, and wait.
3. Everything on the GPU. No canvas 2D, no CPU pixel work, no SVG raster. `npm run lint` must not lower the off-GPU score.
4. Vector is pure: never call or draw a classic or mesh vessel pass, `COMP_FS`, the one-pass zoom, `lowPass` or `reuseDraw`.
5. Checks: `npm run lint && npm test && npm run check:static` (tests test what a module exports, never a file's text: `rules-lint` PR-02), `tests/glsl-lint.js` (`lintGLSL`, `uniformsOf`) on every shader string
   you add, and `node scripts/stage-trace.mjs --compare` where your files can change the classic or mesh draws (they must not). No
   headless browser, no screenshots. Do not ask Mohammad to test or for `?perf` readouts.
6. Read `src/ui/vec-contract.js` first. It is the only source of shared numbers; import them, never copy them.
7. On every push, post: the hash, what changed, how to see it (Settings › Display › Vector once H has landed), and this x/y list of
   your milestones.
8. Use `frameFor()` for frames (never `requestAnimationFrame`), `layout-snap.js` for layout reads, and allocate nothing per frame
   (`scripts/frame-alloc.mjs` rules: buffers made once, written in place).

### 9.A Graph and interaction compiler

Goal: sections 3 and 4. CPU only, node-tested.
- `vec-graph.js`: `createVecGraph()` with `fromBins(bins, nTubes)` (points by `pointsFromEntries`, joins by `joinEntryList` and
  `patchGroups`, read-only imports from `veins-mesh-data.js`), `patch(bins)` for `patchGeometry`, `attrs(tubeNow)` and `radii(radAll)`
  read in place. One record a vessel row, kept.
- `vec-compile.js`: `compileGrid(graph, reach, out)` → the cell texels and region texels in the contract's layouts, into kept typed
  arrays; `recompileRows(graph, rows, out)` → the changed cells only (and the list of them, for E's uploads);
  `compileMorphSet(bins, out)` for a swept binning (`K_MORPH`); `reachOf(row)` (lumen, casing, shadow offset and blur, glow ≤ 1.3,
  ring, hover, × `REACH_HEADROOM`; `padOf` in `veins-mesh.js` for the pieces).
- Tests (the real anatomy: every preset's binning as `tests/veins-mesh.test.js` builds it, and the lobule's tubes): (1) every point within
  two vessels' reach lies in a region cell; (2) every ordinary cell's run covers every segment of its vessel within reach of the cell and
  is at most `WIN_MAX`; (3) every join entry's cells are `K_JOIN` regions listing all its members; (4) members' tiers differing →
  `K_CROSSTIER`; (5) no region over `MAX_MEMBERS` (report the largest; over is a stop point); (6) the partition rule in JS (cell of a
  pixel centre under random cameras) gives one owner a pixel; (7) every width easing of every deck preset either stays inside the
  compiled reach or triggers `recompileRows` for exactly the rows past it; (8) a morph set's cells all classified, each sweep crossing in
  a region.
- Phase 1: the slice's preset and the Anatomy ↔ Circuit morph sets. Phase 2: every preset, deck slide and the lobule.
- Contract owner: other workstreams ask you for changes; you change `vec-contract.js` and say so in your push.

### 9.B Ordinary stretch shader

Goal: section 5.1. Shader strings, lint-tested.
- `vec-shade-glsl.js`: `VEC_SHADE_GLSL` with `vecNear(row, i0, i1, p, ps)` and `vecShadeOne(...)`: the classic single-vessel result
  (shadow, casing, lumen, lines, rim, hover, ring, lift, glow, fades, veil and organ cover, dotted, recolour, drawn part) built from
  `shadeGLSL` (`veins-mesh-glsl.js`, imported). It is also C's single-member path, so publish it in your first push with its signature in
  a comment; C codes against it.
- `vec-stretch-glsl.js`: `vecStretchVS` (the mesh's `STRIP_VS_GLSL` / `meshWorld`, pad = reach) and `vecStretchFS(variant)` for
  `V_FULL`, `V_BASE`, `V_BLOOD`, calling D's `vecBlood` (D publishes its signature first; until then a stub returning no blood, removed
  when D's lands). The cell test exactly as section 4.
- Tests: `lintGLSL` on all three variants; `uniformsOf` lists exactly the uniforms E sets (agree the list with E); a check on the exported shader strings (never the file's text: `rules-lint` PR-02) that the
  cell test is the one formula (`inv`, `gl_FragCoord`, `floor`, `gridO`, `CELL`) and that the region shader calls the same `vecShadeOne`.
- Phase 1: the slice's features (casing, lumen, lines, shadow, glow, selection and lift, fades, veil). Phase 2: every row of appendix A
  marked B.

### 9.C Interaction region shader

Goal: section 5.2.
- `vec-region-glsl.js`: `vecRegionVS` (an instanced quad per region cell, the cell's exact square) and `vecRegionFS(variant)`: the region
  record read, members' `vecNear`, nearest `SLOTS`, then the classic join, fillet, trunk and fork, run-on, cross-tier copy, crossing ring,
  tier compositing and group opacity code, ported from `vesselFS` (`veins-gl.js` lines 280 to 896, read, not edited) to run over the
  region's members; the blood by D's `vecBloodMix`. Single-member pixels call B's `vecShadeOne` and D's `vecBlood` unchanged.
- Tests: lint, uniforms; a JS mirror of the tier and group compositing (`accN`, `accT`) showing a faded network over two overlapping
  vessels gives the group's alpha once (no double-darkening), and the crossing rule picks the front lumen's stream.
- Phase 1: joins (the confluence), the crossing, the cross-tier join (hepatic veins into the cava), group dimming. Phase 2: hairpins,
  long runs, close approaches, morph regions, every appendix A row marked C.

### 9.D Blood material

Goal: section 5.3.
- `vec-blood-glsl.js`: `VEC_BLOOD_GLSL` with `vecBlood(row, s, y, R, lumenCol, px)` and `vecBloodMix(n, rows, s, y, R, w, lumenCol, px)`,
  every row of the table in 5.3, the filtering rules, built from `blood-tile.js` (`D_GLSL`, `E_GLSL`, imported) and the blood functions of
  `COMP_FS` (ported, not edited). Publish both signatures in your first push; B and C code against them.
- `vec-blood-math.js`: the JS mirror of the stream distance, drift, chain, mixing weights and footprint attenuation, for the tests.
- Tests: distance continuous through a speed step, a beat, a re-anchor and a reversal; a camera change leaves (s, y) for a world point
  unchanged; the speed path reads no drawn radius (stop point if it does); mix weights sum to 1 and swap with a reversal, eased; the fine
  octave's weight falls smoothly to 0 as the footprint passes 1.5 texels (no step); lint and uniforms.
- Phase 1: style D streaks, stasis, reversal colour, chains, heads. Phase 2: origin, dye, bleed and pool, glue cast, lymph, style E and
  legacy, chevrons in-lumen.

### 9.E Renderer core, frames, caches, timers

Goal: section 7 and the GPU side of section 3.
- `vec-renderer.js`: `createVecRenderer(gl, shared)` where `shared` is the accessor H passes from the veins-gl instance (its `rad`,
  `tube`, `flow`, `bend`, `dye`, noise tile and organ cover textures, its CPU mirrors, its picture target, its camera and look). Compiles
  B, C, G and F's programs (parallel, `gl-compile.js`), holds A's cell and region textures and the strip buffers (the mesh's
  `stripIndex`, instanced by row), and draws `draw(m, look, blood)`, `drawRows(...)`, `composite(...)` with the same meaning as
  `veins-gl.js`'s API, returning what they return.
- `vec-targets.js`: the picture framebuffer with its `DEPTH24_STENCIL8`, the kept base, invalidate-on-write (`gl.invalidateFramebuffer`)
  for passes that write every pixel.
- `vec-frame.js`: the change table of section 7: which variant, which boxes, when the base is written, from the invalidations
  (`setGeometry`, `patchGeometry`, `setRadii`, `setTubes`, `setFlow`, morphs, organs).
- `?perf`: the vector gauge and per-kind GPU timers (section 7), through `gpu-probe.js`.
- Tests: with the warm harness's do-nothing WebGL (as `scripts/stage-trace.mjs` uses), one render pass per frame kind and no framebuffer
  bind inside it; a blood-only frame draws only lumen programs; a pan draws `V_FULL` and writes no base; the frame where motion ends
  writes the base once; nothing drawn when nothing changed; no allocation in a frame.
- Phase 1: FULL, BASE, BLOOD frames for the slice. Phase 2: all invalidations, morph sets, the lobule's instance.

### 9.F Organs as retained geometry

Goal: section 6.
- `vec-organs.js`: `createVecOrgans(gl)` with `setOrgans(...)` (the op lists the stack receives, H passes them), `prepare(maxZoom)` (every
  detail level, kept), `draw(pass, m)` into the current pass with stencil clips, `covers()` (the vessels' organ cover texture and rect),
  deformation (`morph` vertices or prepared geometry). `vec-organs-glsl.js`: fill, gradient, stroke, clip and soft-edge programs.
- Tests: no flattening or triangulation called during a pinch (spy on `flattenPath` / `polyMeshInto`); the right level picked per scale;
  the liver morph interpolates when point counts match and prepares when not; a mask is rebuilt once per shape change, not per consumer;
  lint and uniforms.
- First push: the list of organs the painter cannot read today, each with what it needs. Phase 1: the liver (deforming) and the organs of
  the slice's view. Phase 2: every organ, every look, the glows and contact shading.

### 9.G Scene overlays and soft effects

Goal: everything `COMP_FS` draws that is not the vessels, the organs or the blood, as retained geometry or bounded analytic passes.
- `vec-overlays.js`, `vec-overlays-glsl.js`: under the vessels: the circuit map (`mapAt`), the glows behind the organs (`glowL`), the warm
  glows on them (`warmL`), the plate's grey-down (`plateSat`, `plateAlpha`) applied to F's organs; over the vessels: the ascites (`fluidAt`,
  `fluidMask`) and the organ outlines (`lineL`) as retained stroke meshes; the catheter (`drawCath`) as retained geometry.
  `vecAboveAt(p)` (GLSL): the over-blood overlays at a point, for the `V_BLOOD` pixels.
- Tests: lint and uniforms; the order is `COMP_FS`'s exactly (checked on the exported shader string against the order in section 7); outlines are meshes kept
  across a pinch.
- Phase 1: the slice's view (outlines, ascites on `cirr-decomp`). Phase 2: the map, the glows, the catheter, every slide's lines.

### 9.H Setting and the seam

Goal: the three-way choice and the one place `veins-gl.js` hands over to Vector.
- `frame.js`: `vesselRenderer()` → `'classic' | 'mesh' | 'vector'`, `setVesselRenderer(v)`, `onVesselRenderer(f)`, stored under
  `RENDERER_KEY`, migrating `pps.vesselMesh = '0'` to classic once; `vesselMesh()` kept as `vesselRenderer() === 'mesh'`. The default
  stays Mesh.
- `main.js`: Settings › Display, the "Mesh vessel renderer" toggle replaced by a three-way "Vessel renderer" choice (Classic, Mesh,
  Vector) in the style of `figureMpControl`, shown once Phase 1 draws end to end. `tests/settings-product.test.js` gets that one row.
- `veins-gl.js`, the seam only: create Vector for the instance (`who` stage and lobule) when chosen; in `draw`, `drawRows`, `composite`
  hand over to it and return before any classic or mesh work; forward the invalidations (`setGeometry`, `patchGeometry`,
  `makeMorphSet`, `useMorphSet`, `setMorphFrame`, `setRadii`, `setTubes`, `setFlow`, `setDye`, `setBend`, the organ and overlay inputs);
  skip the organ stack's picture draws while Vector is on; give back the classic layer's four targets while it is on (they are not
  drawn). Tell the mesh thread before each push to `veins-gl.js`.
- Tests: the choice's storage and migration; with Vector on, the seam calls no classic or mesh program (a spy on `useProgram` with the
  do-nothing WebGL); with Classic or Mesh, `stage-trace --compare` unchanged.
- If the guides (`guides/*.pdf`) list the Display rows, say so: regenerating them needs a browser, so that is a stop point.

### 9.I The lobule under Vector

Goal: the lobule's vessels drawn by Vector when Vector is chosen.
- `vec-lobule.js`: what the lobule's instance needs beyond the figure's: its tubes (sinusoids, inlet venules, arterioles, central vein,
  lymph rows with `f1.x = −1`), its flow factor 0 (the CPU's own distance, `flowD`), its tissue underneath (`tissue-gl.js`, kept as the
  texture under the vessels: decorative tissue may stay a texture), its kept picture (`lobule-keep.js`), its present.
- `lobule-zoom.js`: Vector-only branches where the lobule asks for classic-only behaviour, nothing else.
- Tests: the lobule's binning compiled by A with no region over `MAX_MEMBERS` (the sinusoids cross-link: report the region counts); the
  lobule's instance under Vector calls no classic program; lymph rows reach `lymphAt`.
- Phase 2 (it needs A, B, C, D, E's Phase 1).

### 9.J Acceptance, trace, docs

Goal: section 11's checks in node, the trace for Vector, the docs.
- `scripts/stage-trace.mjs --renderer vector`: the fixed session hashed with Vector on, so later Vector pushes can be compared.
- `tests/vec-accept-*.test.js`: the six acceptance points as node checks where node can judge them (section 11), importing the other
  workstreams' code.
- `docs/vector-renderer.md` (how it works, as built), `docs/PERFORMANCE.md` (the vector gauges), `CHANGELOG.md` lines for every
  workstream's merged push (others do not edit the changelog).
- Phase 1: the trace flag and the acceptance tests as skips naming what each waits for. Phase 3: all green.

## 10. Stop points (ask Mohammad, wait)

1. A region with more than 16 members anywhere (A, I).
2. An organ the painter cannot read and that cannot be made readable (F).
3. The blood's speed reads the drawn radius somewhere (D): fixing it changes Classic and Mesh too.
4. Without the half-size streak pass, wide lumens cost more than with it (D, E).
5. Anything that would need an edit to `stage.js`, `blood.js`, `stage-blood.js`, `organs-gl.js`, `COMP_FS`, or the classic or mesh
   shaders.
6. A guide PDF that lists the Display rows (H).
7. Anything in this plan that turns out not to work as written.

## 11. Acceptance (the brief's list)

| Point | Node check (J, with the owner) | On the devices (Mohammad, when he likes) |
|---|---|---|
| Seamless joins and region edges at the deepest zoom | partition: one owner a pixel centre (A); single-member pixels call the same functions on both sides (B, C: checked on the exported shader strings) | pinch to the deepest zoom over a join and a region edge |
| Stream ownership at crossings and confluences | crossing → front stream only; confluence → weights of the members, summing to 1 (C, D) | a crossing A names; the portal confluence |
| Continuous blood through speed change and reversal | distance continuous across steps, beats, anchors and reversals (D) | a TIPS slide; a reversal slide |
| Stable streaks in a slow pinch and pan | footprint attenuation smooth, no step (D); (s, y) unchanged by the camera (D) | a slow pinch through the point where streaks pass a pixel |
| Fades and selection without double-darkening | group compositing applies the group alpha once (C) | select a vessel over another |
| Sustained pacing after warm-up | one pass a frame kind, no switch inside it, nothing allocated a frame (E) | ten minutes on the Mac and the iPhone, `?perf` |

## Appendix A. Classic features and where Vector draws them

From `vesselFS` (the mesh plan's section 1 table) and `COMP_FS`:

| Feature | Vector |
|---|---|
| Wall distance, along, across, direction, radius (`segNear`) | B `vecNear` (one vessel), C (members) |
| Soft along (glow fades, selection ease) | B, C |
| Contact shadow (`shOff`, `F_SHADOW`, selection blur) | B, C (the union of a tier's shadows in C) |
| Lumen colour along (`alongAt`), recoloured stretches (texels 8, 9) | B `vecShadeOne` |
| Casing (`F_EDGE`, `F_NOCASE`, dotted 0.35, veiled half) | B, C |
| Flat shading lines, rounding, pale wall band, dark-lumen rim | B, C |
| Fades (texels 3, 4; linear, radial, dip) | B, C |
| Organ cover, veil, `F_WHOLE`, behind-the-organs group | B, C, with F's covers |
| Drawn part (texel 5) | B, C (strip vertices outside it collapse, as the mesh's) |
| Dotted collaterals (`F_DOTTED`) | B, C |
| Hover (texel 9.w, 11) | B, C |
| Glow (texels 10, 11; "up" glows; no glow inside another lit lumen) | B (alone), C (cut by other lit lumens) |
| Selection, dimming, lift (texel 12, `netAlpha`, `ring`, ×1.12) | B (alone), C (group compositing) |
| Tiers (`tierAlpha`, `tierGroup`, z) | C |
| Joins: fillet, `corner()`, trunk and fork roles, run-on, deep blend | C |
| Cross-tier copies (`keep`, `pres`, `tin`) | C |
| Knock-out ring at crossings | C |
| Dither | B, C (once, the pixel's only write) |
| `outFlow`, `outFlow2`, `outDep`, `redraw`, `tint` modes | not needed (blood from geometry; base boxes redrawn in `V_BASE`) |
| Morphs (`morphOn`, `posBase`, `joinBase`) | B (strip vertices from the frame's points), C (morph regions), A |
| Plate, organ stack, `plateSat`, `plateAlpha` | F, G |
| Circuit map, glows behind, warm glows on the organs | G |
| Bleed pool (`inner`) | D, in the stomach lumen |
| Blood, chevrons, heads, origin, dye, cast, lymph, stasis, reversal | D |
| Ascites (`fluidAt`), organ outlines (`lineL`) | G (and `vecAboveAt` for blood frames) |
| Catheter (`drawCath`) | G |
