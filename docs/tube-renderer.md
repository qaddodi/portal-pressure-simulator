# The Tube vessel renderer, as built (stage 1, 10 Nov 2026)

Settings › Display › **Vessel renderer**: one choice of Classic, Mesh (the default) or Tube (round 2, 10 Nov 2026: it replaced the two switches, Mesh and Tube, which could both be on).
`frame.js` keeps one value, `vesselRenderer()` (`'classic' | 'mesh' | 'tube'`, `pps.vesselRenderer`, key removed for the default), with `vesselMesh()` and `vesselTube()` as readers that are true for their own choice only; a tester's earlier switches are carried over once. Mohammad's brief (10 Nov): the depth tube
option of `docs/recommendations/tubes-and-particles-first-principles.md` with smoothed joints, a cel-shaded cartoon look and a black outline.
The plan is `docs/recommendations/tube-renderer-plan.md`; this file says what was built. Built by four threads: A `src/ui/tube-geo.js`
(the geometry and the strip's vertex shader), B `src/ui/tube-cel-glsl.js` (`celShade`), C `src/ui/blood-particles.js` (blood style 3, P),
D (the rest: the setting, the builds of the shared shader text, the pass `src/ui/tube-pass.js`, the picking in `veins-gl.js`).

## The seam

Tube is a third renderer beside Classic and Mesh and **never a hybrid**. While it is chosen it is used in place of the Mesh row's renderer:

- `frame.js`: `vesselRenderer()`, `setVesselRenderer(v)`, `onVesselRenderer(f)`; a change draws the figure again (the render subscribers hear it).
- `veins-gl.js` keeps `tubePick` beside `meshPick` (`meshSync` follows both; a change makes the next picture a whole draw, and the depth and
  stencil buffer is given back only when both are off). `meshUse()` is "a geometry renderer draws": with Tube chosen it needs `tubeS`, `tubePt`
  and `meshL` (otherwise false, and `tubeWhy` says why), else the Mesh's rule as before. The software, lost and targets checks stay for both.
  So every `meshUse()` branch in `draw` (no `lowPass`, no `fuse`, no `rowParts` tint, `meshCellsPass` for partial redraws) does the right thing for Tube.
- `pieceFn`: `meshUse() && (tubePick ? tubePass(...) : meshPass(...))`. Tube chosen and not ready means `meshUse()` is false and the classic
  pass draws; it never tries the Mesh. `scripts/rules-lint.mjs` holds that line.
- `?perf`: gauge `vessel renderer` says `tube: N passes, N strips, N patches drawn`, or `classic: tube compiling` / `shader failed` /
  `software GL` / `no depth and stencil` / `no lay program`. The probe note is `vessels: tube`.
- The blood style uniform is 3 (`STYLE_P`) while Tube chosen and `meshUse()` (the condition `pieceFn` uses), else exactly as before.
- Programs: `tubeStrip` (`tubeStripVS` over `vesselFS(true, 1, 1)`) and `tubePatch` (`meshPatchVS` over `vesselFS(false, 2, 1)`), started
  beside the Mesh's for the stage's figure only, in their own `try`, finished into `tubeS` and `tubePt` as the optional builds are
  (`later` key `'tube'`, `startsOf`, the deletion list). The lay program `meshL` is the Mesh's.

## The Tube builds of the shader text

`vesselFS(simple, mesh = 0, tube = 0)`: **for `tube = 0` the text is byte for byte what it was at `363a81c`**
(`tests/vessel-fs-old-builds.test.js` keeps four hashes). Every difference is JS in the template. The Tube builds differ from the Mesh builds in:

1. `celGLSL(...)` (B) after `shadeGLSL`; the tier loop's two `tubeShade(` calls are `celShade(` (the `tubeShade` definition stays in the shared text).
2. `meshFS({ ..., tube: 1 })`: the key block keeps every line and every `discard`, without `gl_FragDepth = kd;` and the return after it.
   **Also left out of the Tube builds, because no Tube build may contain `gl_FragDepth`:** the crossing ring's `gl_FragDepth = keyShape ...`
   line (in the key block) and `if (mPass == MP_MARK) { gl_FragDepth = ...; return; }`. Both belong to passes the Tube never draws (`RING`, `MARK`).
3. The strip build declares `layout(location=2) out uvec4 outFlow2;` so the strip and the patch write the same four targets.
4. `meshPatchVS` writes `zU` as the position's z (0 unless set, so the Mesh, which writes `gl_FragDepth`, is unchanged). The Tube no longer sets it: the Tube's patch writes its own depth (below).

## The pass (`src/ui/tube-pass.js`, `createTubePass`)

`meshPass` with these differences only: the strip is `MG.tubeVAO` (`tubeIndex`, same attribute layout and row buffer as the Mesh's strip);
a pass pair takes one band of depth from `meshKeyNext()` (`H = 0.999 / KEY_PASSES`); the **prepass** is the same program with the colour
masked off (depth LESS, write on, no blend, no stencil), the **colour pass** draws with depth EQUAL, write off, blend `ONE, ONE_MINUS_SRC_ALPHA`
and the stencil `NOTEQUAL ref / REPLACE`. Depth comes from the vertices: levels in `TUBE_LEVEL` (glow .02 to .08, casing .10 to .20, lumen
.30 + .50 h / hRef, patch lumen .82 and outline .20 to .25 by the fragment (the patch's depth rule below)). No `gl_FragDepth` in a strip, no key pass, no `MESH_NONE`.
A patch does not draw where it leaves a pixel clear, but in a shape pair's prepass (`tubeKey` 2) it keeps the depth of the pixels inside its shape (`mD < 0`) that it leaves clear: where a higher tier's copy replaces a see-through vessel (`keep` 0) the vessel's own strips, which see no join, must not draw it whole under the copy (the Mesh's key pass does the same). The colour pass discards them.

`gl.drawBuffers` is `ATTACH` for the whole pass except around a glow pair's colour pass (`MESH_GLOW_BUF`), the lift (`MESH_COLOR_BUF`) and
the laying of a scratch layer (then back to `ATTACH`). Per tier: glow pair if lit (strips only), shape pair (strips and patches), the lift as
the Mesh has it; the up-glows after the group's tiers; the network laid from the scratch target when dimmed. Per pass: `celK = CEL.K` on
both programs, `hRef = 64` and `aaPad = 2 px` on the strip. The module is separate because `veins-gl.js` alone filled the build's 200 KB
chunk limit; it is given what it works on once, and reads the values that change (programs, layer texture, frame morph) through getters.

## A fading vessel's depth (fault 3, 10 Nov 2026)

Inside a tier the taller surface wins a pixel, so a faded branch that overlaps its trunk beyond the join's patch (where only strips draw) won
the pixel wherever its half tube was the taller and thinned the trunk's lumen to the branch's alpha. The classic shader's rule is that a fade
of the vessel joining it never thins the trunk's lumen. In `tubeStripVS` a lumen level is therefore eased into a low band (`TUBE_FADE`: .26 to
.295, above every casing level and a join patch's outline (.25, `PATCH_RING`) and below every opaque lumen's .30) as the vessel's alpha at that vertex falls from 1 to `TUBE_FADE.A` (.35):
`tubeAlpha` reads the row's base alpha and its dip, radial or linear fade from texels 1, 3 and 4 as `vesAttrs` does (the organ veil stays the
fragment shader's), and `tubeFadeLevel` is the ease, both with JS twins under test. Casing, glow and patch levels are not moved, an opaque
vessel is not moved, and a vessel fading along its length never steps in depth. Not drawn in glow passes.

## z in the strip's lumen level (brief L-A, for the lobule)

`tubeStripVS` has two uniforms, `zK` and `hK`: an arc vertex, a dome centre and a cap vertex have the level
`LUMEN0 + LUMEN_H * clamp(zK * z + hK * clamp(h / hRef, 0, 1), 0, 1)`, with `z` the row's z (texel 2, y). `tube-pass.js` sets `zK = 0`, `hK = 1` for the anatomy (an unset uniform reads 0, which would flatten every lumen to LUMEN0); the lobule sets `zK = 1`, `hK = 0.008`. Where `zK > 0`
the fading rule above is off (the row's z says what is in front). `tubeVertex` takes `o.z`, `o.zK`, `o.hK` (defaults 0, 0, 1).

## The patch's depth is the fragment's (brief L-D, 10 Nov 2026)

The strip's depth is its geometry's and its build writes no `gl_FragDepth`. The patch is one quad over many vessels, so only the fragment knows which it is on: **the
patch build writes `gl_FragDepth`** (`keyBase + (1 - f) * keyH`), in the key block after `Dk` and `zmx`, per part (`tubePart`):
the outline's part at `CASE1 + 0.05 * (1 - clamp(Dk / 255, 0, 1))` (over every casing, under every lumen and under the fading band, the nearest wall nearest), the lumen's part at
`LUMEN0 + LUMEN_H * clamp(zK * zmx + hK, 0, 1) + 0.02` (over every strip lumen on the figure, where it is .82). `zK` and `hK` are fragment uniforms of the patch
program of the same names as the strip's vertex uniforms, set together: the figure 0 and 1, the lobule 1 and 0.008. A guard `gl_FragDepth = gl_FragCoord.z;` opens the patch's `main`, so every path of it has written one
(the brief says exactly one write; the guard is the second, there so no path leaves it undefined). The pixels a patch leaves clear inside its shape (the
`keep` 0 pixels of fault 1) are the lumen part's, and in a shape prepass (`tubeKey` 2) they return having written that depth. `tests/tube-patch-depth.test.js`.

## The lobule on the Tube (brief L-D)

The lobule's renderer instance (`who: 'lobule'`) makes the Tube's strip and patch programs and the lay program when Tube is first chosen (`startLobuleTube`, veins-gl.js;
at its creation if Tube is already the choice), never for Mesh or Classic: its lobule stays classic then (`meshUse()` needs the Mesh programs for Mesh). It has one tier, so what is in front
is each row's `z`: `zK` 1, `hK` 0.008, `hRef` 22 (the largest radius, 21.42, `node scripts/lobule-joins.mjs`) in `tube-pass.js` (`E.lobule`).
`?perf`: `vessels: tube` and the gauge `lobule vessel renderer`. `tests/tube-lobule-programs.test.js`.
Under Tube the lobule's paths: a whole draw is the Tube pass; `drawRows` (the pulse and every recolour) draws the changed rows' cells by `meshCellsPass` (most cells: a whole draw); the pinch's
lower layer and the one-pass zoom frames are off while a geometry renderer draws (`!meshUse()` guards), so a zoom frame is a whole Tube draw; the kept picture and `keepBlood` read the layer and the flow
targets (same encodings) and the composite's blood style P through `compBind`, which the half-size streak program and the wide copy's draws share.

## The varyings and the exact skirt (brief S2-A, for stage 2)

`tubeStripVS` now writes, for all three kinds of vertex (ring grid, dome, trapezium), the contract of `docs/recommendations/tube-renderer-stage2-3-plan.md`:
`vD` (signed distance from the lumen's wall: -R on the centreline, 0 on the wall, + in the skirt), `vG` (offset from the centreline point to the vertex),
`vRad` (the lumen radius at that ring or sample, floored at `MIN_RADIUS`) and `vEnd` (flat, from the instance). `invariant gl_Position;` heads the shader.
The stage 1 fragment shader ignores all four, so nothing in the picture changes except the skirt below.

- **Grid:** `vD = |d| - R` with `d` the across offset (the arc: `(|a| - 1) R`; skirt inner 0; skirt outer `+w`), `vG = d * n` (a mitred ring's `vG` is the mitre's,
  longer than `vD` says: `vD` is the perpendicular distance to both legs, the wall's). A cap ring: `|vG| - R`, the plan-view disc's own distance.
- **Dome:** `-R` at the centre, `dist - R` on the rim (so the wall falls at 0 along every spoke), `vG` corner minus centre. **Trapezium:** its corners are the skirt's
  outer edge, `+w`. A collapsed dome or trapezium has `vG = (0, 0)` and `vD = -R`, and no area.
- **The skirt's width in a shape pass** is exactly the outline's: `clamp(0.14 R, 1.5 px, 3 px) + aaPad` (`px = aaPad / 2`, `celShade`'s rule) plus `selPad` on a selected
  row, from the `R` of the vertex's own ring or sample (`tubeWidth(R, aaPad, selPad, selected)`). The old reach (casing x celK + the pass's `padU`) is gone from shape
  passes. A glow pass keeps the row's reach (`tubeGlowWidth`). Bevel and mitre decisions use the width of the vertex's own sample; a trapezium (whose four corners must
  agree on whether it is drawn) decides with the larger of its two ends' and reaches with each end's own.
- **`aRow` is `vec4`** `(row, endStart, endEnd, kind + 2)`: `kind + 2` is 2 for a plain row and 3 for an exact one. Stage 1 and the glow passes feed one float a row (stage 2's shape passes feed four, S2-D) and WebGL fills `(0, 0, 1)` for the rest: `w = 1` reads as "no ends" (`vEnd = aRow.w > 1.5 ? aRow.yz : vec2(-1.0)`).
- The JS twin: `tubeVarying(P, R, a, o)` returns `{ vI, vD, vG, vRad }`; `tubeVertex` still returns `[x, y, f]`. A shape pass is given `o.aaPad` (and `selPad`, `sel`);
  `o.w` alone is a fixed width (a glow pass, and any older caller).

## Stage 2 (brief S2-D, 10 Nov 2026)

What was built: the Tube's pass draws with four more programs when they are all ready, and the joins are webs. Code: `src/ui/tube-stage2.js` (the programs' start
and finish, the choice, the data and buffers), `src/ui/tube-pass.js` (`draw2`, `webCall`, `stripCall`), and a few lines in `veins-gl.js` (the programs are started with
the Tube's others and finished apart from them; `MG.gen` counts a binning).

- **Programs** (each optional, started with the Tube's stage 1 programs, finished one by one with `finishProgram`; any one failing gives the other three back and leaves the
  Tube at stage 1, never at the Mesh or the classic pass): `tubeLean` (`tubeStripVS` + `tubeLeanFS`), `tubeDepth` (`tubeStripVS` + `TUBE_DEPTH_FS`), `tubeWeb`
  (`tubeWebVS` + `tubeLeanFS`), `tubeWebDepth` (`tubeWebVS` + `TUBE_DEPTH_FS`). `stage2Sources(K, ZOOM_VS)` builds their text, for the app and for the compile check
  (`node scripts/glsl-compile.mjs`, all four link). The figure starts them at creation (in `later`, published when the driver is done with them), the lobule's
  instance with its stage 1 programs when Tube is first chosen.
- **The choice** (`tubeStage(ready, query)`, a pure function): stage 2 when the four are ready and `?tube=1` is not in the address, else stage 1; joins `'web'` in stage 2
  unless `?tubejoin=patch`, else `'patch'` (stage 1 always draws patches). The address is read once, when `tube-stage2.js` loads. Both flags are in `scripts/rules-lint.mjs`'s list
  of allowed switches (`KEEP`) with a note: they are comparison aids for a device, like `?perf`.
- **Rows**: J's records (`tubeRows`, `tubeBuckets`), 4 floats a row, attribute 1 a `vec4`, each tier's plain rows first. A binning (`MG.gen`, bumped by `meshGeo`) reads the rows' ends
  and the webs; a frame bins the rows by tier and the webs by tier and uploads both (grown to their largest, no allocation). A row that becomes dotted or clipped after the
  binning turns exact at once (a cheap check each frame); an exact row stays exact until the next binning (slower, never wrong). Stage 1 keeps its own bucket call and
  buffer, untouched; a stage 2 frame does not use them.
- **A shape pair** of tier `t`, in its band: the prepass (colour masked, depth `LESS`) draws the plain rows with `tubeDepth` (no fragment work), the exact rows with `tubeLean`,
  the webs with `tubeWebDepth` (or the patches, in their two parts, with `?tubejoin=patch`); the colour pass (depth `LEQUAL`, the stencil as before) draws all rows with
  `tubeLean` and the webs with `tubeWeb`. The lift's colour pass is the same colour draw. A web is binned in the higher of its two rows' tiers and drawn there with `isWeb` 1
  (the tier test of the lean shader is skipped for it, B, `e60bf08`); a strip has `isWeb` 0. **Glow pairs, the scratch layers and the draw buffers are exactly stage 1's**: the glow
  uses the stage 1 strip program over the stage 2 row buffer read as one float a record (stride 16), depth `EQUAL`.
- **The lobule** runs the same code (its own renderer instance, its own programs and data): its `zK`, `hK` and `hRef` from L-D, and it draws webs where it drew 127 patch groups.
- **`?perf`** (the "vessel renderer" and "lobule vessel renderer" lines): `tube 2: N passes, N strips (N plain), N webs` (`N patches` with `?tubejoin=patch`), or `tube 1: <why>, N passes, N strips,
  N patches drawn` with why = `compiling`, `<program> failed` or `set by ?tube=1`. Strips, webs and patches are counted in the colour draws (the prepass draws the same rows again); a pass is
  one draw of a tier (prepass and colour pass each count); plain is the share of the strips whose prepass cost no fragment work.
- **Expected gauge** (from the real captures through the real pass in node, the default view; the lobule is the blood-only layer):

  | | passes | strips | plain | webs |
  |---|---|---|---|---|
  | figure, anatomy | 12 | 41 | 30 (73%) | 35 |
  | figure, circuit | 12 | 56 | 33 (59%) | 41 |
  | lobule | 2 | 156 | 156 (100%) | 310 |

  More strips appear with more vessels shown; a selected vessel adds the lift's draw, a glow adds a pair.
- **Known differences at joins** (the plan's three, on purpose): (1) inside a join a tributary's stream ends where the trunk's lumen is taller, on a curved line, and its streaks fade at
  its end as `bloodAt` already fades them; there is no cross-fade of the two streams. (2) A web takes its trunk's colour and attributes (or the wider member's). (3) No second lumen anywhere
  in the Tube.
- Not in stage 2: the lumen layer and the compositor's Tube builds (stage 3, below).

## Stage 3: the lumen layer (brief S3-D, 10 Nov 2026)

**What it is.** Stage 3 is stage 2 plus a lumen layer: the blood, the dye and the origin tint are drawn by the Tube's own lumen programs into a texture of their
own, and the compositor reads that texture (`lumenL`) in place of its lumen section, the second flow target (`gbuf2`) and the half-size streak pass. The Tube
is at stage 3 when stage 2 is drawing webs, the six stage 3 programs are ready, and neither `?tube=1` nor `?tube=2` is set (`tubeStage(ready, query, ready3)` in
`tube-stage2.js`; `?tube=2` keeps stage 2 to compare the two on a device; `?tubejoin=patch` keeps stage 2 with patches). A failed stage 3 program leaves stage 2,
never Mesh or Classic (`finishTube3` is separate from `finishTube2` and from `finishTube`; `meshUse` names none of them).

**Programs** (`stage3Sources`, `stage3Start`, `stage3Finish` in `tube-stage2.js`, started with the stage 2 four, one compile for the strip's and the web's lumen fragment
shader, the shader objects shared by text): `tubeLumen` (`tubeStripVS` + `tubeLumenFS`), `tubeWebLumen` (`tubeWebVS` + `tubeLumenFS`), and the compositor's Tube builds
beside the four it has: `compTube`, `compTubeCell`, `plainTube`, `plainTubeCell` (`COMP_FS(plain, false, false, 1)` over `COMP_VS` / `COMP_CELL_VS`, now exported). The streak build is not
needed. The arrowheads' quads program is the compositor's own heads build, reused: it reads `gbuf` only.

**The lumen layer** (`createLumenTarget`): one `RGBA8` texture and a `DEPTH_COMPONENT24` renderbuffer on a framebuffer of their own, the vessel layer's size
(`fboW` x `fboH`), made at the first lumen pass and again when the layer is, for the figure and, in its own instance, the lobule. The colour is cleared whole each
frame; the depth is cleared in each piece's scissor and invalidated after the pass.

**The lumen pass** (`tubeLumenPass` in `tube-pass.js`, `lumenFrame` in `veins-gl.js`), on every frame the compositor would draw blood (`blood.on`, or dye, or origin:
the kept-picture and blood-only frames included), after the compositor has decided to draw the frame and before it binds its textures. The lumen layer is drawn through the vessel
layer's own pieces (`eachPiece`: its wrap, scissors and `lOff`), so every texel the compositor reads is read at the place the layer's is. In a piece: the stage 2
prepass of **every** tier first (depth only, colour masked, `LESS`, the layer pass's order and tier groups), then every tier's lumens (`tubeLumen` for the rows, `tubeWebLumen`
for the webs, `LEQUAL`, no blend, no stencil, depth not written) with each tier's own kept band. Glows, lift and scratch layers are not drawn. A pixel's nearest surface is
one lumen or none. The blood's uniforms and textures are set by `lumenBind` from the same values the compositor sets (`blood`, `flowA`, `blendA`, `lenOn`, `origin`, `dyeOn`,
`clock`, `bT`, `rows`, the colours; the flow, dye and bend textures on units 6, 7 and 12, the noise tile on 15; the vessel set on units 0 to 5).

**Planned as per-tier, built as all prepasses first (planner, 10 Nov 2026).** The brief says "for each tier: prepass, then lumens". With a later tier's prepass after an earlier tier's lumens, the earlier
tier's lumen would lie under the later tier's casing and outline. Prepasses first, then lumens, leaves a lumen only where its surface is the nearest of all tiers.

**The layer pass writes no second flow target (say which way, brief S3-D 5).** In stage 3 its draw buffers are `[colour, first flow target, NONE, picking target]` (`A3`) in place
of the four `ATTACH`es, set where the pass sets them today (`AT` in `tube-pass.js`), and the layer's own four are restored at the end of the pass. The draw buffers change at the same places as in stage 2
(none added). The first flow target stays for `blood-heads.js` and picking.

**The compositor** in stage 3 uses its Tube builds (`stage3` in `composite`), with `lumenL` bound on unit 8 (the unit `gbuf2` has in the other builds). `halfOn` is off. The
still-lumen signature includes the stage so a lumen drawn the other way is drawn again.

**`?perf`.** `tube 3: N passes, N strips (N plain), N webs, lumen pass N strips N webs` (the lumen pass counted in the lumen draws only); the lumen pass is its own GPU-timed row,
`lumen layer`, like the other whole redraws. Expected from the real captures, run through the real pass in node:

  | | passes | strips (plain) | webs | lumen pass |
  |---|---|---|---|---|
  | figure, anatomy | 12 | 41 (30) | 35 | 41 strips 35 webs |
  | figure, circuit | 12 | 56 (33) | 41 | 56 strips 41 webs |
  | lobule | 2 | 156 (156) | 310 | 156 strips 310 webs |

  When stage 3 failed, the stage 2 gauge adds `, stage 3: <programs> failed`.

**Known differences (stage 3).** The three under "Joins made of geometry". The blood shows in the lumen in front, at that vessel's opacity (as it did, read from geometry). No half-size
streak pass in Tube. Where a see-through vessel of a later tier lies over a lumen, the lumen under it shows no moving blood (only the surface in front draws blood). The lumen layer is a second
pass over the same geometry on every blood frame; its cost is the `lumen layer` row.

**Tests.** `tests/tube-stage3.test.js`, `tests/tube-stage3-two.test.js` (the stage choice as a pure function, the programs' start and finish, the target, the lumen pass's draw order, the
draw buffers, nothing of stage 3 in stages 1 and 2), and `scripts/rules-lint.mjs` (in stage 3 the compositor program is a Tube build and the lumen pass runs before it on every blood frame; in stages 1 and 2 nothing of
stage 3 runs). The compile check lists all six programs (and the heads build, linked with its own vertex shader): 23 programs ok.

## The lumen layer keeps its depth (brief PD part 2, 10 Nov 2026)

The lumen pass used to clear its depth and draw every tier's prepass again on every blood frame. The depth only changes when what the vessel layer shows changes, so it is kept:
`createDepthStamp` (tube-stage2.js) answers `needs(m, wo, la, w, h)`. **Any draw of the vessel layer** (`pieceFn`, so the whole layer, a pan's strip, marked cells and the tier pieces) calls
`lumenDepth.stale()` first; a new or resized lumen target and a context loss do too; and a fresh depth is stale again if the view matrix, the layer's wrap (`wo`), window (`la`) or size
differs from the ones it was drawn with. `lumenFrame` asks once a frame and hands the answer to every piece (`pRedo`).

- **Stale:** as before (depth cleared, every tier's prepass, then the lumens), then the stamp is fresh. The depth is no longer invalidated at the end of the pass (it is the next frame's).
- **Fresh:** no depth clear, no prepass; the colour is cleared, the lumens are drawn on `LEQUAL` with depth writes off and the bands (`BASES`) the prepasses used.
- `?perf`: the note `lumen depth redraws` counts the frames that drew the depth (near 0 a second at rest, beside the `lumen layer` row).
- Not stamped: the rows' alpha or tier changing with no layer draw (the layer redraws for those); a tier that gains rows without one would use a band its prepass never wrote.

## The glow program (brief PD part 4, 10 Nov 2026)

A lit vessel's glow (`MP.GLOW`) and a glow asked to lie on top (`MP.UP`, the Doppler's) used the stage 1 strip program, whose fragment shader searches the vessel's segments for the distance. The
glow program is the same strip vertex shader over `tubeGlowFS` (`src/ui/tube-glow-glsl.js`), which takes the distance from the vertex shader (`vD`) and has no search, join, tier loop or shape.
- **One program, optional on its own.** `glowStart` / `glowFinish` (`tube-stage2.js`) start and finish `tubeGlow` apart from stages 1, 2 and 3 (`started.tubeGlow`, the `later` entry `'tubeGlow'`,
  `finishGlow`, the readers `E.tubeGlow` and `E.tubeGlowFailed`); the lobule's instance finishes it with its other Tube programs. A failure warns, deletes the program, and takes no stage down.
- **Where it draws.** `tubeDraw` picks `glowP` (`E.tubeGlow`, else `E.tubeS`, read once a frame in `tubePass`) for the two glow passes only, in every stage, and the program is given the pass's uniforms
  only when a tier is lit (stage 2) or always (stage 1). The shape passes, the lift and the webs keep the programs they had; the prepass of a glow (`tubeKey` 1) uses it too.
- **`?perf`.** The vessel renderer gauge adds `, tubeGlow failed (glow on the strip program)` when it failed; otherwise it says nothing.
- **Check.** `node scripts/glsl-compile.mjs tubeGlow` (in the list since P6). Tests: `tests/tube-glow-wiring.test.js`; rules in `scripts/rules-lint.mjs`.

## The Anatomy to Circuit switch (10 Nov 2026)

**What was slow.** The change between the views runs through morph sets (veins-sweep.js, six stretches made ahead). Each set change inside the change made `meshGeo()` derive the set's
data in that frame (points, the join list, the patch groups and the patch texture), and the Tube's stage 2 `bin()` then binned the rows and webs again (a swept set lists 19k to 59k join
entries, 7k at rest). Measured in node with the stage trace (real JS on the do-nothing GL; the sweep worker run on the same thread so the stretches are ready): 7 set changes a switch,
each about 30 ms in `meshGeo` and about 135 ms in the binning (210 to 240 ms and 930 to 1050 ms a switch); the frames that held them cost 250 to 450 ms against about 25. No program is
compiled or linked during the switch (0 calls in either direction).

**What it is now.** The geometry renderers' derived data is a *bundle* (`newBundle` in veins-gl.js), one for the figure's own binning (`mainB`, made again when `dirty`) and one for each
morph set (`S.derived`), made by `prepareSet(S)` in `makeMorphSet`, at the free moment the set is made. A bundle holds `pts`, `jl`, `patch` and `pj` (the patch texture), and `s2`, the
Tube's stage 2 record: **one opaque record** made by one call, `stage2Prepare(B, tubeNow, nTubes, joinBase)` in tube-stage2.js (the rows' kinds and ends, the join instances and
whatever replaces them). `meshGeo()` only swaps `MG.pts / jl / patch / pj / B` to the bundle in use; a set change builds and uploads nothing (the node trace: 6 swaps at 0 ms, and
only the final return to the figure's own binning derives, about 2 ms and 15 to 35 ms for the record). The frame's buckets (`D.tb`, `D.wb`) and their two small buffers stay per renderer:
they are the live tiers' order, a few KB, and are rebuilt only when the bundle, its binning or the tube rows' stamp (`MG.tv`, bumped by `setTubes`) changed, so the layer pass, the
lumen pass and each piece of a frame share one bucketing and one upload.

- **Patches only where drawn.** `patchGroups` and the `pj` upload run only while `patchesWanted()` (Mesh, or the Tube without web joins: stage 1, `?tube=1`, `?tubejoin=patch`). With web
  joins neither is built for any bundle. If the mode changes (a stage 2 or 3 program finishes, the renderer is switched, the query is fixed per page) `queuePrep()` makes the sets
  again, one per free moment and never while a set is in use (`prepKey` on each set: `web`, `patch`, `mesh`); a bundle that still lacks something is made in its first frame, as before.
- **Entries listed once.** A cell lists every join entry it reaches, so a swept set lists the same entry tens of times. `stage2Prepare` reads each entry index once, in first-listed order
  (the result is the same: repeats were skipped by the readers).
- **Whatever replaces the webs** builds its records in `stage2Prepare` (or the call that replaces it) and nowhere else; nothing in the bundle or the set names webs. Its budget is the numbers
  above: it runs once per morph set (6 a switch) and once for the figure's own binning, over up to about 59k listed entries (a few hundred distinct), and must finish in a free moment.

## Seamless joins at a row's end (10 Nov 2026, after Mohammad's device shots of 138d637)

**Step 2 (10 Nov 2026, after the planner's perf finding on e5eccf7, which cost 19 fps):** the ends are worked out once a vertex (tube-join-glsl.js `joinOne`, in the strip's vertex shader) and reach the fragment shaders as three flat varyings `vJ0, vJ1, vJK`; a fragment does one point-to-segment distance (or one dot product) and a smoothstep, and reads no texture. A branch in a higher tier than its trunk FADES out into it (its lumen and colour between 0.6 radii outside the wall and a radius inside, its outline faster) instead of being cut; every other open end is cut at the wall; a continuation is cut at the bisector plane, so there is no cap. Webs between rows of different tiers are left out (the mouth is the fade); a web carries its owner's tier alpha and group (as the lumen layer's shader had it). `uniform int joinCut` (strip vertex shader) is 1 in the figure and 0 in the lobule, which never has ends (`?tubejoin=off` turns it off in the figure too; `tubeJoinCut()` in tube-stage2.js).

Two faults the webs could not fix: (1) a branch's round end (its lumen, not only its outline) lay inside the trunk it ends on, so where the trunk is faded (a tier
alpha, the organ veil: the cava behind the liver) and the branch opaque, the end showed through as a capsule; (2) two rows meeting end to end drew a round cap each
over the other, a ring wherever their opacities differ. `src/ui/tube-join-glsl.js` is the one GLSL text both fragment shaders (`tubeLeanFS`, `tubeLumenFS`) include
(`trunkGap`, `joinEnd`, `joinOther`), with its JS twin `joinEndJS`. A row's end in `vEnd` (the row record's endStart / endEnd) is now one of:

| code | meaning | what the row does |
|---|---|---|
| `row * 64 + sample` | open end on a trunk | draws nothing inside the trunk's lumen (lumen or outline); within 1.5 of its radii from the trunk's wall it takes the trunk's colour and opacity more and more |
| `-(2 + row * 64 + sample)` | continuation of that row | ends at the bisector plane of the break, so the two are one surface with no cap or end outline; within 1.5 radii of the plane each takes half of the other's look, so both meet at the mean |
| `-1` | none | as before |

`tubeRows` (tube-data.js) sets them: an end leg of a join ends on the row that runs through the join (the marked trunk, else the first member with two legs: the
mark is no longer needed); two rows' ends alone in a join, bent by at most 45 degrees, continue each other, both or neither. The opacity is each shader's own formula
(`aA * tierAlpha * veil` for the colour, with the network's group fade for the lumen), taken at the other row's end sample and this pixel, so the vessel layer and the
lumen layer agree. A web keeps its owner's look (known difference 3). Not handled: a branch in a lower tier than its trunk (the trunk's band draws over it, so the
trunk's outline still crosses the branch's mouth; 1 end in the anatomy, 5 in the circuit), bends over 45 degrees and joins of three rows or more with no row through
them (they keep caps and webs).

## Known differences from the plan's list and from Mesh

- No contact shadow; no crossing ring. Same-tier crossings without a join merge (as the Mesh shows them with its ring off).
- The outline is 1.6 times the casing width and still grows with zoom (the "weight that holds when zoomed" rule is stage 2). Its colour is
  near-black on the light looks and the look's own line colour on the dark ones (`celShade`).
- Blood is particles in Tube and streaks in Mesh and Classic.
- The lobule and software GL keep the classic pass (as with Mesh).

## What stage 1 leaves out

Stage 2: the short strip shader (along and across from the geometry, no nearest-segment search), a depth-only prepass without fragment
work for plain rows, the zoom line-weight rule, the lobule. Stage 3 is built (above). The shaders are compiled and linked by the compile check below in a software driver; the first real compile on a device is still the test.

## Tests

`tests/vessel-renderer-setting.test.js` (the one choice and the carry-over), `tests/vessel-fs-old-builds.test.js` (the old builds' hashes), `tests/vessel-fs-tube.test.js`
(both Tube fragment builds and `meshPatchVS` linted through `tests/glsl-pp.js`, no `gl_FragDepth` in the strip build and the patch's two, `celShade(` used), plus A's, B's and C's own.

## The shader compile check (brief S0-K, 10 Nov 2026)

`node scripts/glsl-compile.mjs [name ...]` compiles and links the shader strings listed in `scripts/glsl-compile-list.mjs` (`programs()`) in headless
Chromium's software WebGL2 and prints, per program, `ok` or the shader and program info logs with the failing source lines numbered (exit 1 on any
failure, 2 when the check itself could not run). It opens `about:blank`, not the app: it draws nothing, takes no picture, judges no look and measures no
speed, and it is **the only headless step the Tube threads may run** (owner, 10 Nov 2026), on their own programs before a push. It is not part of
`npm test`, lint, CI or any workflow. SwiftShader is not an iPhone, iPad or Mac driver: `ok` is strong evidence, not a guarantee. A thread adds its
programs with one `add(...)` line in the list (the header there says how); a missing module or export is skipped with a note until it lands. A
program whose vertex shader is not exported yet (the classic vessel `VS`, `COMP_VS`) is compiled as a fragment shader alone, and linked once the
owner of `veins-gl.js` exports it (the list reads `VESSEL_VS` and `COMP_VS`). `tests/glsl-compile-list.test.js` judges the list in node.

## The compositor's lumen text and its Tube builds (brief S3-X, 10 Nov 2026)

**Part 1 (5f42928).** The helpers the compositor's lumen section calls moved, as written, into `src/ui/comp-glsl.js`: `compLumenUniforms()` (the
declarations, in pieces in `COMP_U` so `COMP_FS` lays each where it stood), `compConsts()`, `compBasics()` (`hsh`, `h01`, `over`), `compBloodFns()`
(the noise styles, the particles, `radAt`, `flowD`, `flowDrift`, `rootDD`, `lymphAt`, `castAt`, `bloodAt`, `originAt`), `compBendFn()`, `compDyeFns()`,
and `compLumenFns()` for another shader. `N_SAMPLES`, `ORIGIN_GREY`, `LANE_K`, `S_OFF`, `ALONG_GLSL` and `ROWS_GLSL` moved with them (veins-gl.js
re-exports what it exported). Functions that read `gbuf`, `gbuf2`, `base` or `halfL` are only `main`, which stays. A shader that includes the text
needs `#define PLAIN 0|1` before it. `tests/comp-fs-old-builds.test.js` holds the four old builds byte for byte.

**Part 2.** `COMP_FS(plain, streak, heads, tube = 1)`:

- A new `uniform sampler2D lumenL;` (premultiplied colour of the lumen in front, alpha its coverage x the vessel's opacity), read at the texel `base`
  is read at (filtered at `lowUV` on a tier frame, as `base` is). `gbuf2`, `halfL`, the blood's helpers and the dye's are not in the text.
- The lumen section is one mix. With `vis = clamp(L.a / max(v.a, 1e-3), 0, 1)` (the lumen's share of the layer's alpha, which is what `vis` was) and
  `F = min(L.rgb / max(L.a, 1e-4), 1)`: `col = mix(col, F, vis)`, `col` the layer's colour `v.rgb / v.a`. The old section applied each effect as
  `col = mix(col, X, k * vis)`; with the effects folded into `F` the lumen is `F` where it covers whole (vis 1: the interior, and a whole ghosted
  vessel, whose lumen and layer alpha are both its opacity) and, at its edge or over another vessel, the layer's colour moved toward `F` by the
  share. Where `L.a` is 0 (casing, outline, nothing) the pixel is exactly the layer's. The alpha is never changed. `tubeLumenMixJS` is the twin.
- `bloodOnly`: a pixel with `L.a == 0` is left as drawn (the layer the blood is in). `stillOn`: the row in front is read from `gbuf` and the same
  `flow` column test is made (no second row). The arrowheads the compositor draws itself (`chevQuad` 0) keep their text and read `gbuf` for the row, arc,
  across and share. So `gbuf` is read once, only for those two uses.
- `streak` is ignored with `tube` (the Tube has no half-size pass); `heads` ignores `tube` (the quads read `gbuf` and `gbuf2` and draw the same heads).
