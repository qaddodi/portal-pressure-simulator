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
4. `meshPatchVS` writes `zU` as the position's z (0 unless set, so the Mesh, which writes `gl_FragDepth`, is unchanged).

## The pass (`src/ui/tube-pass.js`, `createTubePass`)

`meshPass` with these differences only: the strip is `MG.tubeVAO` (`tubeIndex`, same attribute layout and row buffer as the Mesh's strip);
a pass pair takes one band of depth from `meshKeyNext()` (`H = 0.999 / KEY_PASSES`); the **prepass** is the same program with the colour
masked off (depth LESS, write on, no blend, no stencil), the **colour pass** draws with depth EQUAL, write off, blend `ONE, ONE_MINUS_SRC_ALPHA`
and the stencil `NOTEQUAL ref / REPLACE`. Depth comes from the vertices: levels in `TUBE_LEVEL` (glow .02 to .08, casing .10 to .20, lumen
.30 + .50 h / hRef, patch .95; `zU` for patches). No `gl_FragDepth`, no key pass, no `MESH_NONE`.

`gl.drawBuffers` is `ATTACH` for the whole pass except around a glow pair's colour pass (`MESH_GLOW_BUF`), the lift (`MESH_COLOR_BUF`) and
the laying of a scratch layer (then back to `ATTACH`). Per tier: glow pair if lit (strips only), shape pair (strips and patches), the lift as
the Mesh has it; the up-glows after the group's tiers; the network laid from the scratch target when dimmed. Per pass: `celK = CEL.K` on
both programs, `hRef = 64` and `aaPad = 2 px` on the strip. The module is separate because `veins-gl.js` alone filled the build's 200 KB
chunk limit; it is given what it works on once, and reads the values that change (programs, layer texture, frame morph) through getters.

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
(both Tube fragment builds and `meshPatchVS` linted through `tests/glsl-pp.js`, no `gl_FragDepth`, `celShade(` used), plus A's, B's and C's own.
