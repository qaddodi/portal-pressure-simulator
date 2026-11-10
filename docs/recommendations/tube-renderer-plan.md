# The Tube vessel renderer: build plan (10 Nov 2026)

Plan only. Nothing here is built. Read at `363a81c` on `claude/settings-topbar-icon-flvft1`.

Mohammad's brief (10 Nov): build the depth tube option of `tubes-and-particles-first-principles.md` (mock: "Depth tube mock",
source kept at `/mnt/project-files/tube-renderer/depth-tubes-mock.html`) with three changes:

1. **The joints are smoothed** (not the hard weld of the mock).
2. **Cel-shaded cartoon look**, not 3D-looking tubes: a flat fill, one hard-edged tone, no gradients, no highlights that round the tube.
3. **A black outline**, like a cartoon or an anatomy book.

Built by Sonnet threads in parallel. The briefs are in `/mnt/project-files/tube-renderer/briefs/` (A, B, C, D). Each thread builds its
brief exactly as written and asks before deviating (project rule, 8 Nov).

## What "Tube" is

A third vessel renderer beside Classic and Mesh. **Tube is Tube**: it never falls back into Mesh or Classic while it is the choice
(rule of 9 Nov). The exceptions are the ones Mesh already has, and they are not fall-backs inside a picture: the lobule and software
GL keep the classic pass, and if the Tube shaders fail to compile the classic pass draws and `?perf` says why.

Settings > Display gets one new row, "Tube vessel renderer", default **off**. On, it wins over the Mesh row.

## The design, and why it is this one

I read the Mesh's code before fixing this. Four facts decided the design:

- The composite (blood, dye, lymph, arrowheads, catheter) reads four targets the vessel pass writes: colour, two flow targets and a
  depth mask. `scripts/rules-lint.mjs` pins parts of the composite. So **stage 1 keeps that contract** and replaces only the vessel pass.
- The Mesh's join patch (`vesselFS(false, 2)`) already draws a smoothed join exactly as Classic does (`smin`, `corner()`, the trunk and
  fork roles, the copies of a lower tier's trunk, the hand-over of the stream). It owns every pixel inside a join's reach. That is the
  hardest code in the renderer and it is proven. **Tube reuses it unchanged for the smoothed joints**, with the cel shading in place of
  the tube shading. Nothing about a join is written again.
- All of the picture of one vessel (casing, lumen, lines, rim, ring, hover) comes from one function, `tubeShade(...)`. **The cel look is
  one new function with the same signature, `celShade(...)`**, used by the Tube's strips and its patches alike, so the two cannot differ.
- This environment cannot compile GLSL (the unit tests lint it). The less new shader text, the fewer mistakes reach a device.

So stage 1 is:

| Part | Mesh today | Tube stage 1 |
|---|---|---|
| Geometry of a vessel | flat cover strip, no depth | half tube: every vertex has a height, written as depth (new) |
| Who wins a pixel in a tier | a key prepass that writes `gl_FragDepth` (no early rejection) | the depth of the geometry: the taller surface wins, casings under every lumen |
| Join | patch owns the join's reach, smoothed | the same patch, the same maths, cel shaded |
| Draw-once for faded vessels | key prepass + EQUAL + stencil | depth prepass (colour masked) + EQUAL + stencil, same program both times |
| Render passes | 24 to 30 (the draw buffers change per pass) | one, except while something glows or the network is dimmed |
| Contact shadow | two strips per vessel per tier | none (a cartoon has an outline, not a soft shadow) |
| Look | flat plate with light and dark lines, soft casing | flat fill, one hard tone on the side away from the light, opaque near-black outline |
| Blood | streaks (style E or D) in the composite | particles stretched by their speed (new style P) in the composite |

### Honest staging note

The recommendations file promised one pass, one target, a short shader, and the blood drawn in the tube's own shader. Stage 1 does not
deliver all of that, on purpose:

- **Stage 1** (this plan, four threads): the look he asked for, on real depth tubes, smoothed joints, particles, one render pass. The
  strips still run the classic arithmetic per pixel (through `vesselFS(true, 1)`), so the shader saving is not in yet. What is saved is
  the shadow strips, the key prepass's lost early rejection, and the render-pass changes that the Mesh speed review named as its main cost.
- **Stage 2** (briefs written after stage 1 is on his devices): the short strip shader (along and across from the geometry, no
  nearest-segment search), a depth-only prepass with no fragment work for plain rows, the outline weight rule when zoomed, the lobule.
- **Stage 3** (needs his word, it moves the dye, arrowheads and lymph): the blood in the tube's shader, the flow targets dropped.

Each stage leaves a working renderer. Nothing in stage 2 or 3 changes the picture stage 1 gets approved with, except where it says so.

## Depth: the one rule every part follows

One depth and stencil buffer (the Mesh's, `meshTargets()`), cleared once per draw. Each pass pair takes one band of depth from
`meshKeyNext()` exactly as the Mesh does (`base`, `H = 0.999 / KEY_PASSES`; later pairs are nearer). Inside a band a fragment's place
is its level `f` in 0..1, **higher is nearer**:

```
depth01 = base + (1 - f) * H            gl_Position.z = 2 * depth01 - 1
```

| What | f |
|---|---|
| Glow strip (only in a glow pair) | 0.02 at its outer edge to 0.08 on the centreline (so the stronger glow wins) |
| Casing skirt | 0.10 at its outer edge to 0.20 where it meets the lumen (so the fuller casing wins) |
| Lumen | 0.30 + 0.50 * clamp(h / hRef, 0, 1), h = the half tube's height at the vertex, in world units |
| Join patch | 0.95 (above every lumen of its tier, so it owns its join's reach, as in Mesh) |

Depth comes from vertices only. No Tube shader writes `gl_FragDepth`.

Within a tier the row order `z` is **not** used: the taller surface wins (the mock's rule). Two vessels of one tier that cross without a
join therefore merge without an outline across the crossing. That is what Mesh shows today (its crossing ring is parked at alpha 0).
It is listed under "Known differences" for Mohammad.

## Draw order of a Tube pass (`tubePass`, thread D)

`tubePass(m, look)` is `meshPass(m, look)` line for line with these differences and no others:

1. Programs `tubeS` (strip) and `tubePt` (patch) in place of `meshS`, `meshPt`. Geometry buffers from thread A's `tubeIndex`.
2. `tubePair(pass, t, ...)` in place of `meshPair`: one band from `meshKeyNext()`; **prepass**: the same program and uniforms,
   `gl.colorMask(false, false, false, false)`, depth LESS, depth write on, no blend, no stencil; **colour pass**: `gl.colorMask(true, true, true, true)`,
   depth EQUAL, depth write off, premultiplied blend, stencil `NOTEQUAL ref / REPLACE` with `meshRefNext()`. The fragment shader discards
   where it draws nothing, in both, so the prepass keeps depth only where the colour pass will draw.
3. `gl.drawBuffers` is set to `ATTACH` once at the start and is changed only for: a glow pair's colour pass (`MESH_GLOW_BUF`, only when
   `tb.lit[t]` or `tb.litUp[t]`), the lift's colour pass and `meshLay` (`MESH_COLOR_BUF`). Never to `MESH_NONE`: the prepass uses the colour mask.
4. No shadow pair. No crossing ring.
5. Per tier, in order: glow pair if `tb.lit[t]` (strips only), shape pair (strips and patches), the lift as Mesh has it. The up-glows after
   the group's tiers, the network laid from the scratch target when dimmed, the lift laid last: all as `meshPass`.
6. `?perf`: `gpuProbe.note('vessels: tube')`, gauge `tube: N passes, N strips, N patches drawn`.

## Shared contract between the threads (exact names)

Thread D imports every name below. D cannot build until A, B and C are on the branch; that is intended and it fixes the order.

**Thread A, `src/ui/tube-geo.js`** (new; pure JS and GLSL strings, no GL calls):

- `TUBE_ARC` (arc vertices across the lumen), `TUBE_ACROSS` (vertices a ring), `TUBE_CAP` (extra rings past each end), `TUBE_RINGS`.
- `tubeIndex(maxRows)` returns `{ attr, index, nVerts, nIndex, rows }` in the shape `stripIndex` returns (`attr`: 4 floats a vertex; `index`: `Uint16Array`).
- `tubeStripVS(STRIP_VS_GLSL, F_SEL)` returns the full vertex shader. Attributes at the Mesh's locations (0 `aV` vec4, 1 `aRow` float per
  instance). Outputs `out float vI; flat out int vRow;` as `meshStripVS`. Uniforms: `world`, `size`, `lOff`, `tube`, `mPass`, `padU`, `selPad`
  (as `meshStripVS`), plus `tubeBase`, `tubeH` (the band), `hRef` (world), `celK` (the outline's width as a multiple of the row's casing width),
  `aaPad` (world: 2 device pixels).
- `tubeVertex(P, R, a, o)`: the JS twin of the placement, returning `[x, y, f]`, for the tests.
- `TUBE_LEVEL = { GLOW0: 0.02, GLOW1: 0.08, CASE0: 0.10, CASE1: 0.20, LUMEN0: 0.30, LUMEN_H: 0.50, PATCH: 0.95 }`.

**Thread B, `src/ui/tube-cel-glsl.js`** (new):

- `celGLSL({ F_DIFFUSE, F_EDGE, F_VEIL })` returns GLSL (no `#version`) that defines
  `vec4 celShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov, vec3 edge, float kn, float kcas, float aa, float aL)`:
  the signature of `tubeShade`, premultiplied result. It declares `uniform float celK;` itself and needs what `shadeGLSL` needs from the host.
- `CEL = { K: 1.6, INK: [0.07, 0.06, 0.06], BAND: 0.62, TONE: 0.80 }` and `celShadeJS(...)`, the JS twin for the tests.

**Thread C, `src/ui/blood-particles.js`** (new) and the blood branch in `veins-gl.js` `bloodAt`:

- `STYLE_P = 3`, `P_GLSL` (defines `pNoise`), a JS twin for the tests. `bloodStyle == 3` draws particles. Nothing sets 3 until D does.

**Thread D** owns every other edit: `veins-gl.js` (all but C's `bloodAt` branch), `veins-mesh-glsl.js`, `frame.js`, `main.js`, the
settings tests, the as-built doc `docs/tube-renderer.md`.

## Feature table: every classic feature and where Tube gets it

| Feature | Tube stage 1 |
|---|---|
| Colour along a vessel, recoloured stretch, EUS glue cast | shared `vesAttrs`, unchanged |
| Fades (linear, radial, dip), drawn part (a vessel drawing on), dotted collateral | shared text (`segNear`, `vesAttrs`), unchanged; the fragment discards what it does not draw, in the prepass too |
| Veil behind organs, `F_WHOLE` | shared text, unchanged |
| Tiers, groups (behind organs, network, lifted), `tierAlpha` | `tubePass` as `meshPass` |
| Network dimming, the selected vessel's lift | scratch targets and `meshLay`, as `meshPass` |
| Selection ring, hover | in `celShade` (kept from `tubeShade`); the skirt widens by `selPad` for a selected row |
| Glow, up-glow | glow pairs, strips only, as Mesh |
| Joins: smoothing, roles, cross-tier trunk copies, stream hand-over | the Mesh patch text under `TUBE`, unchanged maths |
| Own edge colour (`F_EDGE`), no casing (`F_NOCASE`) | kept in `celShade` |
| Dark lumen's light rim on dark looks (`rimInk`) | kept in `celShade` |
| Flow targets, depth mask | written by the shared text as today |
| Morph between views (`posBase`, `joinBase`) | the vertex shaders read `PT()` and `JT()` as the Mesh's do |
| Partial redraws (`meshCellsPass`), `redraw` | the same code path, calling `tubePass` |
| `tint` colour-only redraw, `lowPass`, one-pass `fuse` | off while Tube draws, as they are for Mesh (`meshUse()` becomes "a geometry renderer is drawing") |
| Contact shadow | **dropped in Tube** |
| Crossing ring | not drawn (parked in every look today) |
| Lobule, software GL | classic pass, as with Mesh today |
| Circuit view | uses whatever the figure uses; D checks the seam covers it as it does for Mesh |

## Known differences from Mesh, for Mohammad

1. No contact shadow under vessels in Tube.
2. The outline is near-black and opaque on every look. On the dark looks a black line on a dark ground is nearly invisible, so the
   vessels read by their fill and the existing light rim. If he wants a light outline on dark looks, that is one constant.
3. The outline is 1.6 times today's casing width and still grows with zoom as today. The "weight that holds when zoomed" rule is stage 2.
4. Same-tier crossings without a join merge (as Mesh shows them today).
5. Blood is particles in Tube and streaks in Mesh and Classic.

## Checks

- Every thread: `npm run lint && npm test && npm run check:static` green before a push. No headless browser runs (owner's rule).
- No new test reads the text of `src/` (rules-lint, PR-02): tests judge what a module exports (a shader builder's string is an export);
  rules on `veins-gl.js` itself go in `scripts/rules-lint.mjs` with a reason. At `363a81c` lint already has one failure of another
  thread's (`tests/label-move-fade.test.js`); these threads leave it and add none.
- New GLSL is linted in a unit test with `tests/glsl-lint.js` (`lintGLSL`), which finds unmatched braces, undeclared names and wrong
  argument counts but **does not type-check**. A type error will only show on a device, as "Tube shaders failed" in `?perf` with the
  classic picture drawn. To cut that risk: new GLSL is small, every new function has a JS twin with tests, and every `uniform` a vertex
  and a fragment shader share is declared with the same precision (the mock failed to link on exactly this).
- The first real compile is Mohammad's Mac and iPhone. I recommend he allows one headless compile-only check per push for these four
  threads (no picture judged); until he says so, they do not run one.

## Stop points

- A thread that finds its brief cannot work as written stops and asks. It does not substitute its own design.
- D does not show the Settings row until the whole of stage 1 draws through `tubePass`.
- Stage 3 does not start without Mohammad's word.
