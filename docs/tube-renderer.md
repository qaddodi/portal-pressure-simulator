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
- **`aRow` is `vec4`** `(row, endStart, endEnd, kind + 2)`: `kind + 2` is 2 for a plain row and 3 for an exact one. Until the pass feeds a four-float buffer
  (S2-D) it feeds one float a row and WebGL fills `(0, 0, 1)` for the rest: `w = 1` reads as "no ends" (`vEnd = aRow.w > 1.5 ? aRow.yz : vec2(-1.0)`).
- The JS twin: `tubeVarying(P, R, a, o)` returns `{ vI, vD, vG, vRad }`; `tubeVertex` still returns `[x, y, f]`. A shape pass is given `o.aaPad` (and `selPad`, `sel`);
  `o.w` alone is a fixed width (a glow pass, and any older caller).

## Known differences from the plan's list and from Mesh

- No contact shadow; no crossing ring. Same-tier crossings without a join merge (as the Mesh shows them with its ring off).
- The outline is 1.6 times the casing width and still grows with zoom (the "weight that holds when zoomed" rule is stage 2). Its colour is
  near-black on the light looks and the look's own line colour on the dark ones (`celShade`).
- Blood is particles in Tube and streaks in Mesh and Classic.
- The lobule and software GL keep the classic pass (as with Mesh).

## What stage 1 leaves out

Stage 2: the short strip shader (along and across from the geometry, no nearest-segment search), a depth-only prepass without fragment
work for plain rows, the zoom line-weight rule, the lobule. Stage 3 (needs Mohammad's word): the blood in the tube's shader and the flow
targets dropped. The shaders are linted, not compiled (this environment cannot compile GLSL): the first real compile is a device.

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
