# The vector vessel renderer

How it works, as built. Workstream J keeps this page: it states what is in the tree, so a line here is true of the code at the commit
that last touched the page, and the status table says which parts have not landed yet. The design and its reasons are
`docs/recommendations/vector-renderer-plan.md` (the plan), revised by `docs/recommendations/vector-renderer-plan-r1.md` (the adaptive
hierarchy) after the reviewer's second recommendation, and the briefs `docs/recommendations/vector-renderer-brief.md` and
`vector-renderer-brief-r2.md` (word for word; where they differ, the second wins).

**Status: none of the six acceptance criteria has passed.** The node files `tests/vec-pre-*.test.js` are preconditions: they test partition
rules, maths and scheduling and are kept green, but they cannot show seamless GPU rendering, stable streaks or sustained pacing. Those are
judged on the devices, when the vessels draw (they did not, at the first GPU run, `8772ff8`). Nothing on this page says a criterion is met. The shared numbers and layouts are `src/ui/vec-contract.js`, the only place they are written.

**In one paragraph.** The anatomy is prepared once and kept on the GPU. A compiler cuts the world into the binning's 16-unit cells and
labels each cell empty, an *ordinary stretch* of one vessel, or an *interaction region* (a join, a crossing, a hairpin, a close
approach). Ordinary stretches are retained strips whose small shader already knows its vessel and segment run; a region is a quad whose
shader resolves its members together and writes the pixel once. Both find the cell from the pixel's own centre with the one formula, so a
pixel has one owner. Blood is shaded in the same fragment, from the vessel's own coordinates (along, across, identity), so the two
full-resolution flow targets and the lumen mask are not written. A frame is one render pass. At rest a colour-only base picture is kept
and a blood-only frame draws just the lumen pixels over it. Organs are retained geometry in the same pass.

**Pure.** With Settings › Display › Vessel renderer set to Vector, no classic or mesh vessel pass, no `COMP_FS`, no one-pass zoom
(`veins-fuse.js`), no `lowPass` and no `reuseDraw` draws any frame, and nothing is drawn off the GPU. Classic and Mesh are unchanged. The
default stays Mesh.

## The structure being built (revision 1: the adaptive hierarchy)

The first build classified the world into fixed 16-unit cells. On the first GPU run about 98% of the lobule's occupied cells were regions
and the lobule ran at about 9 fps, so the reviewer asked for the structure under the cells to be adaptive and segment-level. Revision 1
(`vector-renderer-plan-r1.md`) replaces plan section 4; the retained renderer, the frame kinds, the organs, overlays, setting and seam stay.
Nothing below is in the tree until its row in "Status of the tree" says so; this page is updated as each part lands.

| Part | What it is | Owner |
|---|---|---|
| **Runs** | Each vessel row's 63 segments are cut into runs of `RUN_SEGS` = 4 (16 a row). A run is never widened to join two runs: a cell lists the pieces of a vessel that reach it, not an interval between them. | A (`vec-runs.js`) |
| **Bounds** | One conservative capsule per run per contribution: lumen and casing, shadow, glow (its active reach now, never the widest), selection ring, junction (the join's disc and its required members), morph (the box over the stretch). A material change (glow, selection, casing, a radius past its bound) rebuilds only that row's runs and the leaves they reach. | A |
| **Leaves** | The 16-unit cell stays the broad index; a cell is empty, a leaf or a node, nodes split in four down to `MAX_DEPTH` = 6. A leaf holds run references with the contribution bits they reach it with, the junction records needed, its most candidates and its class. Built on the CPU when geometry or a bound changes, retained on the GPU, never rebuilt on a camera change. Refined where the estimated shader work falls materially (cost model with the projected footprint, `LEAF_MIN_PX`, `REFINE_GAIN`). | K (`vec-leaves.js`) |
| **Classes** | `L_SINGLE` (one vessel: its strip), `L_LAYERED` (soft contributions overlap only), `L_CROSS` (lumens may overlap, not connected), `L_JOIN` (a connected junction, cross-tier included), `L_WIDE` (still over `SLOTS` at the finest level: `SLOTS_WIDE` = 32 slots), `L_MORPH`. One program per class. | K, C |
| **The fragment** | Reject the leaf; reject runs by their bounds; distances for the survivors only; junctions and depth for the joins whose disc covers the pixel; shade each candidate only for the contributions it survived, in classic's order; then the blood. | B, C, D |
| **Overflow** | Never silent: a leaf over `SLOTS` subdivides, then becomes `L_WIDE` and keeps every candidate; over `SLOTS_WIDE` is a stop point (reported, nothing truncated). Lists have no capacity limit. A shortlist only where the bounds prove the excluded runs change the pixel by less than `TOLERANCE_8BIT`. | K, C |
| **Exclusive ownership** | Every program finds a leaf the same way (`world = inv × gl_FragCoord.xy`, the cell, then the child at each node by comparing with its centre); a strip draws only in an `L_SINGLE` leaf of its row, a leaf quad covers exactly its leaf. The JS mirror `leafAt` does the same arithmetic in the same order. | K, B, C |
| **Workload** | Reported numbers are projected pixels by class, bound tests, segment tests, surviving candidates, active joins, and GPU time by component, never cell percentages; named benchmarks `cv-junction`, `lobule-tissue`, `anat-fit`, `anat-deep`, `pinch`, `blood-only`, each old beside new. Numbers and the constants they chose: [`docs/vector-workload.md`](vector-workload.md) (L, `ef13c75`): in node, on the real anatomy and the real lobule, the leaves cost 2% to 18% of the frozen old compiler's work across all six benchmarks (the junction 4% to 5%, ordinary tissue 2% to 3%, the anatomy 12% to 18%), with 5 to 8 segment tests a pixel where the old structure ran about 230. These are plan-model numbers measured before plan r1.1, not device times, and they do not pass any acceptance point. | L |

**Workload so far (L, measured before r1.1).** Chosen policy `BOUND_HEADROOM 1`, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`, `REFINE_GAIN 0.05`: 86% to 88% of the default policy's cost, about half the leaf quads on the anatomy and the junction. `L_WIDE` is few pixels but the most leaves and about 120 work units a pixel (against 5 to 23 for the other classes), the case r1.1 shrinks; no leaf passed 32 candidates and no false-proximity subdivision failed (stop points 1, 2 and 4 not reached). Repeat with `node scripts/vec-workload.mjs`; in the app `?perf` has a "Vector work" section (GPU time per component, leaves in view by class) and `?vecbench=<name>` plays a named benchmark.

The fixed classification's names (`MAX_MEMBERS`, `MAX_JOINS`, `WIN_MAX`, `REGION_TEXELS`, `JOIN0`, `CELL_SIMPLE` / `CELL_REGION`) are in the
contract and the tree until E's switch-over push; the tables below describe that structure, which keeps drawing until then.

## Pipeline (the first build, drawing until E's switch-over)

| Step | What happens | Where |
|---|---|---|
| Graph | One record per vessel row (centreline, radius, connections, identity, tier, depth, flags), read from the inputs `veins-gl.js` already receives | `vec-graph.js` (A) |
| Compile | Every cell classified with each vessel's full reach (lumen, casing, shadow, glow, ring, hover, × `REACH_HEADROOM`); regions list up to `MAX_MEMBERS` (32) members and `MAX_JOINS` joins; a radius past its compiled reach recompiles that row's cells | `vec-compile.js` (A) |
| Ordinary stretch | Instanced strip per vessel (the mesh's geometry); fragment draws only in cells its vessel owns; `vecNear`, then `vecShadeOne`, then `vecBlood` | `vec-stretch-glsl.js`, `vec-shade-glsl.js` (B) |
| Interaction region | Quad per region cell; members' `vecNear`, nearest `SLOTS`, classic join/fillet/trunk/fork/run-on/cross-tier/crossing rules, tier and group compositing, `vecBloodMix` | `vec-region-glsl.js` (C) |
| Blood | Streaks from `blood-tile.js` (two phases, mipmapped), stream distance and drift on the blood clock, chains, origin, dye, cast, lymph, stasis, reversal; filtered with analytic footprints | `vec-blood-glsl.js`, `vec-blood-math.js` (D) |
| Organs | Op lists read as the organ stack reads them; every detail level prepared ahead; clips as stencil; deformation by vertex interpolation or prepared geometry | `vec-organs.js`, `vec-organs-glsl.js` (F) |
| Overlays | Circuit map, glows, ascites, outlines, catheter as retained geometry; `vecAboveAt` for blood-only frames | `vec-overlays.js`, `vec-overlays-glsl.js` (G) |
| Frames | `V_FULL` (camera, morph, deforming), `V_BASE` (colour, radius, organ changes in their boxes), `V_BLOOD` (blood only, scissored, over the kept base); one pass each, one `DEPTH24_STENCIL8` renderbuffer, no framebuffer bind inside a pass | `vec-renderer.js`, `vec-frame.js`, `vec-targets.js` (E) |
| Setting and seam | Classic / Mesh / Vector choice (`pps.vesselRenderer`), and the one place `veins-gl.js` hands a draw over | `frame.js`, `main.js`, the seam in `veins-gl.js` (H) |
| Lobule | The lobule's vessels drawn by Vector when Vector is chosen | `vec-lobule.js` (I) |

## Status of the tree

| Part | Files | In the tree |
|---|---|---|
| Plan, brief, contract | `docs/recommendations/vector-renderer-*.md`, `src/ui/vec-contract.js` | yes (`2bcd99d`) |
| A graph and compiler | `vec-graph.js`, `vec-compile.js`, `vec-contract.js` | yes (`5bcfca7`; contract `MAX_MEMBERS` 48, `WIN_MAX` 64, `4e58124`) |
| B stretch shader | `vec-shade-glsl.js`, `vec-stretch-glsl.js` | yes (`7e679ec`; the loop windowed about the strip's own sample, `a7fb90f`); r1: `vecShadeBits` shades only the contributions that survived their bounds (`cf44369`); the leaf-based strip program `vecLeafStretchFS` (`7f0d8ad`), which draws only inside an `L_SINGLE` leaf of its vessel; the shared text without the fixed cell test, `bedd14c` |
| C region shader | `vec-region-glsl.js` | yes (first slice `8cb684e`; morph regions `be2c71d`); r1: one program per leaf class, `L_LAYERED`, `L_CROSS`, `L_JOIN`, `L_WIDE`, `L_MORPH`, the reviewer's five steps, magenta on overflow and no silent drop (`f7b0a89`, `bedd14c`) |
| D blood | `vec-blood-glsl.js`, `vec-blood-math.js` | yes (`08b0799`; the heads' fragment shader, `a02a438`); r1: `vecBloodMix` over up to `SLOTS_WIDE` streams (`59f4df3`) and `bloodPixelWork` for the workload replay (`9b3bd33`) |
| E renderer core | `vec-renderer.js`, `vec-frame.js`, `vec-targets.js` | yes (`2ea671d`; BEHIND phase `62d8c19`; D's uniforms `2d060ef`; F's organs wired `6544d79`; blood rows `40a1f73`) |
| F organs | `vec-organs.js`, `vec-organs-glsl.js` | yes (`6962e93`; every figure organ, `2586eb0`; a frame with no level prepared makes its own once, `37a3732`) |
| G overlays | `vec-overlays.js`, `vec-overlays-glsl.js` | yes (`fd581c3`; E's overlay port `c861d5e`) |
| H setting and seam | `frame.js`, `main.js`, `veins-gl.js`, `vec-seam.js` | the Classic / Mesh / Vector choice and the seam (`aeaa31e`, `ee684a9`); Vector is now made on the fixed structure and the figure draws its vessels (the entry texture is the points texture, `47fcfc0`; idle frames while the organs prepare, `a924098`) |
| I lobule | `vec-lobule.js` | first slice (`2ef670b`: flow-row index, kept-picture stamps and box repaint); r1: the benchmark scenes `cv-junction` and `lobule-tissue` for L (`33208eb`); the class test reports the lobule's leaf classes and names the central vein (15 vessels, rows 102 to 113, 149, 252, 253) as the `L_WIDE` case (`4de0828`) |
| K adaptive leaves (new) | `vec-leaves.js`, `vec-leaves-pack.js`, `vec-hier-glsl.js` | yes: the leaf lookup in GLSL and its JS mirror `leafAt` (`1beb096`, `b625189`); `buildLeaves` (adaptive quadtree, cost model, classes, explicit overflow), `rebuildLeaves` and `summarize` (`0a90b11`); hard candidates reported in wide leaves, the join-disc probe, and rebuild, camera, morph, circuit and lobule tests (`fce9376`, `6831c93`). The shaders do not draw from it until E's switch-over |
| L workload and benchmarks (new) | `vec-measure.js`, `vec-bench.js`, `scripts/vec-workload.mjs`, `docs/vector-workload.md` | yes (`1f4963b`, `a2c5488`, report `ef13c75`): the numbers were taken before plan r1.1 and are to be repeated after K's builder changes |
| A contract v2, runs, bounds | `vec-contract.js`, `vec-runs.js` | runs and bounds yes (contract v2 additive and `vec-runs.js`, `1357dbd`; headroom option and `tests/vec-runs.test.js`, `d063293`; `fitGrid` for K, `317bd81`); the old names stay until E's switch-over |
| Plan r1.1 | `docs/recommendations/vector-renderer-plan-r1.md` | yes (`38abb1c`): a join's bound is grown from its members' lumen and shadow bounds, not the whole disc (the lobule was 97% `L_JOIN`; it is now 68.7% of vessel area in a disc and 47.5% needing a junction) |
| E visibility fix and switch-over | `vec-renderer.js` | not yet |
| J trace, preconditions, docs | `scripts/stage-trace.mjs --renderer`, `tests/vec-pre-*.test.js`, this page | trace flag; the six node preconditions (40 checks), acceptance not passed; Vector now traces on the fixed structure (reference deterministic), the reference for the new structure waits for E's switch-over |

## Checking it (node only: no browser, no screenshots)

- `npm run lint && npm test && npm run check:static`.
- `node scripts/stage-trace.mjs --renderer vector --save` hashes the fixed scripted session (boot, zoom, Anatomy ↔ Circuit, the dive into
  the lobule and the rise, card zooms) with Vector chosen, into `/tmp/stage-trace-vector.json`; `--renderer vector --compare` says
  whether a later push draws the same GL calls in the same frames. `--renderer classic|mesh` does the same for the others. Without
  `--renderer` nothing changes. Where frame.js cannot select the renderer the trace exits 2 and says so; where it is selected but cannot be made (`veins-gl.js` warns and
  draws with the other renderer: Vector was "waiting for region, compile" until `47fcfc0`) it exits 3, saves and compares
  nothing, and prints the reason, rather than hashing another renderer's draws (`--allow-fallback` hashes them anyway). After E's switch-over the Vector trace is saved again as the reference for the new structure. Note: the unflagged trace already differs from its own saved copy at frame 317 (the first circuit frame, two values
  alternating from run to run); that is the trace, not a renderer, so compare Vector with Vector from the same tree.
- `tests/vec-pre-*.test.js` are the node preconditions of the six acceptance points (below; the points themselves are not passed), on the real anatomy where a check needs it
  (`tests/vec-anatomy.js` boots the stage with the do-nothing WebGL, as the compiler's tests do; each file takes about a minute).

## Acceptance (the brief's list): not passed

None of the six has passed. The files below are node **preconditions**: they test partition rules, mathematical helpers and scheduling, and
say nothing about how the picture looks or how fast it runs. "One render pass" is not "little work" either (the reviewer's point):
the workload numbers above are what say how much work a pass holds. Each point is judged on the devices, once the vessels draw.

| Point | Node precondition (kept green) | File | Waits for the device judgement |
|---|---|---|---|
| Seamless joins and region edges at the deepest zoom | one owner a pixel centre under random cameras to the deepest zoom, every lumen point in a cell that draws it, the same cell under any camera; stretch and region shaders share the cell text and `vecShadeOne` | `vec-pre-1-seamless` | pinch to the deepest zoom over a join and a region edge |
| Stream ownership at crossings and confluences | crossing → front stream only; confluence weights sum to 1 and swap eased with a reversal | `vec-pre-2-streams` | a crossing; the portal confluence |
| Continuous blood through speed change and reversal | distance has no jump across steps, beats, re-anchors, reversals (seeded random flows) | `vec-pre-3-continuity` | a TIPS slide; a reversal slide |
| Stable streaks in a slow pinch and pan | footprint attenuation and the zoom's lattice weights have no step; a world point's vessel coordinates and cell ignore the camera | `vec-pre-4-streaks` | a slow pinch through the point where streaks pass a pixel |
| Fades and selection without double-darkening | the group's alpha applied once (JS twin of the compositing, and the shader's one multiply) | `vec-pre-5-fades` | select a vessel over another |
| Sustained pacing after warm-up | one pass a frame kind, no bind inside it, base once per end of motion, nothing allocated over a seeded session | `vec-pre-6-pacing` | ten minutes on the Mac and the iPhone, `?perf` |

The preconditions follow the structure: when the hierarchy replaces the fixed cells, the cell and region checks in `vec-pre-1`, `vec-pre-2`
and `vec-pre-4` are rewritten for leaves, runs and classes in the same push that switches over, and stay green. No device numbers are
recorded here.
