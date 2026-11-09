# The vector vessel renderer

How it works, as built. Workstream J keeps this page: it states what is in the tree, so a line here is true of the code at the commit
that last touched the page, and the status table says which parts have not landed yet. The design and its reasons are
`docs/recommendations/vector-renderer-plan.md` (the plan) and `docs/recommendations/vector-renderer-brief.md` (Mohammad's reviewer brief,
word for word). The shared numbers and layouts are `src/ui/vec-contract.js`, the only place they are written.

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

## Pipeline

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
| B stretch shader | `vec-shade-glsl.js`, `vec-stretch-glsl.js` | yes (`7e679ec`; the loop windowed about the strip's own sample, `a7fb90f`) |
| C region shader | `vec-region-glsl.js` | yes (first slice `8cb684e`; morph regions `be2c71d`) |
| D blood | `vec-blood-glsl.js`, `vec-blood-math.js` | yes (`08b0799`; the heads' fragment shader, `a02a438`) |
| E renderer core | `vec-renderer.js`, `vec-frame.js`, `vec-targets.js` | yes (`2ea671d`; BEHIND phase `62d8c19`; D's uniforms `2d060ef`; F's organs wired `6544d79`; blood rows `40a1f73`) |
| F organs | `vec-organs.js`, `vec-organs-glsl.js` | yes (`6962e93`; every figure organ, `2586eb0`) |
| G overlays | `vec-overlays.js`, `vec-overlays-glsl.js` | yes (`fd581c3`; E's overlay port `c861d5e`) |
| H setting and seam | `frame.js`, `main.js`, `veins-gl.js`, `vec-seam.js` | the Classic / Mesh / Vector choice and the seam (`aeaa31e`, `ee684a9`); at `5bcfca7`+ Vector is chosen but the renderer is still "waiting for region, compile" and the figure draws with the other renderer (see the trace below) |
| I lobule | `vec-lobule.js` | first slice (`2ef670b`: flow-row index, kept-picture stamps and box repaint) |
| J trace, acceptance, docs | `scripts/stage-trace.mjs --renderer`, `tests/vec-accept-*.test.js`, this page | trace flag; all six acceptance points judged in node (40 checks, none skipped) |

## Checking it (node only: no browser, no screenshots)

- `npm run lint && npm test && npm run check:static`.
- `node scripts/stage-trace.mjs --renderer vector --save` hashes the fixed scripted session (boot, zoom, Anatomy ↔ Circuit, the dive into
  the lobule and the rise, card zooms) with Vector chosen, into `/tmp/stage-trace-vector.json`; `--renderer vector --compare` says
  whether a later push draws the same GL calls in the same frames. `--renderer classic|mesh` does the same for the others. Without
  `--renderer` nothing changes. Where frame.js cannot select the renderer the trace exits 2 and says so; where it is selected but cannot be made (`veins-gl.js` warns and
  draws with the other renderer: today Vector is "waiting for region, compile" until the seam hands E its parts) it exits 3, saves and compares
  nothing, and prints the reason, rather than hashing another renderer's draws (`--allow-fallback` hashes them anyway). Note: the unflagged trace already differs from its own saved copy at frame 317 (the first circuit frame, two values
  alternating from run to run); that is the trace, not a renderer, so compare Vector with Vector from the same tree.
- `tests/vec-accept-*.test.js` are the six acceptance points as node checks (below), on the real anatomy where a check needs it
  (`tests/vec-anatomy.js` boots the stage with the do-nothing WebGL, as the compiler's tests do; each file takes about a minute).

## Acceptance (the brief's list)

| Point | Node check | Test file | On the devices (when Mohammad likes) |
|---|---|---|---|
| Seamless joins and region edges at the deepest zoom | one owner a pixel centre under random cameras to the deepest zoom, every lumen point in a cell that draws it, the same cell under any camera; stretch and region shaders share the cell text and `vecShadeOne` | `vec-accept-1-seamless` | pinch to the deepest zoom over a join and a region edge |
| Stream ownership at crossings and confluences | crossing → front stream only; confluence weights sum to 1 | `vec-accept-2-streams` | a crossing; the portal confluence |
| Continuous blood through speed change and reversal | distance continuous across steps, beats, re-anchors, reversals | `vec-accept-3-continuity` | a TIPS slide; a reversal slide |
| Stable streaks in a slow pinch and pan | footprint attenuation smooth; (s, y) unchanged by the camera | `vec-accept-4-streaks` | a slow pinch through the point where streaks pass a pixel |
| Fades and selection without double-darkening | the group's alpha applied once | `vec-accept-5-fades` | select a vessel over another |
| Sustained pacing after warm-up | one pass a frame kind, no bind inside it, nothing allocated a frame | `vec-accept-6-pacing` | ten minutes on the Mac and the iPhone, `?perf` |

What node cannot judge (how the picture looks, the frame times on the devices) is not claimed here. No device numbers are recorded.
