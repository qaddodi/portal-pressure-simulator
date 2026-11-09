# Mesh vessel renderer: how to make it fast and right (recommendations, 9 Nov 2026)

Docs only. Nothing here is built. Mohammad picks; then each pick is built as written.

Scope: the Mesh vessel renderer (`src/ui/veins-gl.js` mesh path, `veins-mesh-glsl.js`, `veins-mesh.js`, `veins-mesh-data.js`;
Settings › Display › Mesh, on by default) on Mac and iPhone. Rules kept throughout: everything stays on the GPU, Mesh is mesh and
Classic is classic (no classic frame or fallback inside Mesh), no headless browser runs.

## The short version

The mesh draw is slow mainly because it is split into **24 to 30 separate GPU render passes** per whole vessel draw, not because its
shaders do too much. Each pass makes an Apple GPU write the whole layer out to memory and read it back in. Shading is small by comparison:
the strips and patches shade about **0.6 pixels per layer pixel** at the fitted anatomy view (2.3 per pixel zoomed 4x).

The split comes from one call. Every prepass and pass changes `gl.drawBuffers`, and Safari's WebGL (ANGLE on Metal) treats a changed set
of draw buffers as a new Metal render pass. The 9 Nov fix that put every pass in one framebuffer ("keeps the layer on chip") did not
achieve that, because the draw-buffer changes still split the passes.

| Rank | What | Speed (model, see caveats) | Look | Size |
|---:|---|---|---|---|
| 1 | **One render pass per mesh draw**: never change the draw buffers inside a draw; mask with `colorMask` / `colorMaski` | tile traffic per whole draw about 15x less (2.3 GB to 0.15 GB on a 3.6 MP Mac layer); roughly 10 to 15 ms saved per whole draw on the M5 Air, more on iPhone | identical | small |
| 2 | **No classic frames in Mesh at start-up**: compile the mesh programs first, hold the figure until they are ready | none | Mesh is mesh from the first frame | small |
| 3 | **Narrower shadow strips**: move the strip by the shadow offset instead of widening it by it | about 25 to 35% fewer shadow fragments (shadow strips are half of all mesh fragments) | identical | small |
| 4 | **Keys from the vertex shader**, so the GPU itself throws away the hidden fragments | prepasses become nearly free; about half the fragment shading | may differ by a fraction of a pixel where two vessels of one tier cross: checked in node first, your call | medium |
| 5 | **Lighter join patches**: tighter boxes, fewer segments per member | patches are 28 to 32% of fragments with the heaviest shader; saving unmeasured | identical | medium |
| 6 | **Look fixes**: one fade per tier, the stream kept under an upper casing, one dither | small cost | closer to classic (fixes the known differences) | small to medium |
| 7 | **Mesh-native view switch**: switch frames drawn from the frame's points, no stretch binnings | removes the CPU binning fallback in Anatomy to Circuit | identical | medium |
| 8 | **The lobule on the mesh too** (it draws classic today even with Mesh chosen) | unknown: the lobule's cost is mostly its blood and composite passes | Mesh everywhere | large |
| 9 | **Fence timings per mesh phase in `?perf`** (strips, patches, shadow, lay) | none (measurement) | none | tiny |

Recommended order: 1, 2, 3, 9 together first (small, no change to the picture), then 4 and 5 if pinch and zoom are still short of 60 fps,
then 6, 7, 8.

## What was measured, and how

The Vector renderer was chosen on a cost model that counted the wrong thing, so every number below says what it is: a count from the real
code, a fact from a driver's source, or a model. None is a device timing except the one in "What the device has shown".

### What the device has shown

- **M5 MacBook Air, 9 Nov:** whole mesh redraws of about **70 ms** each (`?perf`, "tubes changed", noted at `veins-gl.js` ~4582). The fence
  that times a whole redraw also waits for GPU work queued before it, so 70 ms is an upper bound on the mesh draw itself.
- The first mesh build was slower than classic; moving every pass into one framebuffer helped (`docs/veins-mesh-plan.md` section 6). There
  are no recorded same-view Mesh against Classic fps.
- Safari, 9 Nov (on `8bc88c5`): about 17.5 fps, GPU-bound, with no script stall left (`safari-recording-nov8.md`).

### Count 1: render passes per mesh draw (node, the real stage)

I ran the real stage in node under the stage trace's recorder (`scripts/stage-trace.mjs`'s session: boot, zooms, Circuit, Anatomy, dive,
rise, card zooms) and fed every GL call through a model of how ANGLE's Metal backend splits render passes: a new pass whenever the bound
framebuffer, an attachment, or the **enabled draw-buffer set** changes before a draw or clear. Scripts:
`/mnt/project-files/mesh-renderer-recs/` (`counter.mjs`, `run.mjs`).

- A whole mesh draw is **24 to 30 render passes** (the frame's other work adds 1 to 5). All but a few of the breaks are `drawBuffers` changes.
- Per tier, as drawn today: the shape key prepass (no colour targets), the shape strips (targets 0, 1, 3), the shape patches (0 to 3); a tier
  with a shadow adds the shadow key prepass and the shadow pass (target 0). That is 3 passes a tier, 5 with a shadow. Glows (2 more a lit tier,
  2 more for "up" glows), the crossing ring (2 more) and a focused or selected vessel (the scratch layer swap, 2 to 4 more) add to it. The
  trace's scene has no lit or selected vessel, so on a slide with glows the count is higher.
- Tile traffic, if each pass loads and stores the attachments it has (Metal's load and store actions here are Load and Store): **648 bytes per
  layer pixel per whole mesh draw**. On a 3.6 MP Mac layer (an assumed size; the M5 Air's own layer was not recorded) that is 2.3 GB, which at the M5's ~150 GB/s is ~15 ms; on a 2.1 MP iPhone layer
  (also assumed) 1.4 GB, ~20 to 25 ms at its bandwidth. One pass would be 42 bytes per pixel (one load and one store of the four targets and the
  depth-stencil): 0.15 GB on the Mac.
- Caveats: Apple GPUs compress render targets losslessly, so real traffic is lower than this model; each pass also has a fixed cost (a new
  encoder, a tile flush) that the model leaves out. The model says where the time goes and how much it can shrink, not the device's ms.

The driver fact, from ANGLE's source (`src/libANGLE/renderer/metal/FramebufferMtl.mm`, `prepareRenderPass` and `syncState`): a disabled
draw buffer is left out of the `MTLRenderPassDescriptor`; `syncState` compares the old and new descriptors and, when they differ, the context
calls `endEncoding`, ending the render pass. A colour-mask change only updates the pipeline's write mask (`ContextMtl.mm`,
`DIRTY_BIT_COLOR_MASK`), and the Metal backend supports per-attachment masks natively (`DisplayMtl.mm`: `drawBuffersIndexedOES = true`).

### Count 2: fragments shaded per mesh draw (node, the real geometry)

Same session. At each mesh draw I rebuilt every strip from the uploaded points, radii and tube data with the JS mirror of the strip vertex
shader (`veins-mesh.js` `meshVertex`), every patch box as the patch vertex shader makes it, and rasterized them (pixel centres). The trace's
own camera is degenerate in jsdom, so the camera is fitted to the figure. Script: `frag.mjs`, `run2.mjs` in the same folder.

| View (anatomy at rest, 8 tiers) | Layer | Fragments, all passes | Per layer pixel | Shadow strips' share | Patches' share |
|---|---|---:|---:|---:|---:|
| Mac, fitted | 2400 x 1500 | 2.3 M | 0.64 | 45% | 30% |
| Mac, 4x zoom | 2400 x 1500 | 8.4 M | 2.34 | 53% | 28% |
| iPhone portrait, fitted | 1170 x 1800 | 2.9 M | 1.36 | 44% | 31% |
| Circuit, Mac, fitted | 2400 x 1500 | 4.6 M | 1.27 | 46% | 32% |

Overdraw (fragments over pixels covered) is 1.1 to 1.5 for shapes and patches and **2.4 to 2.8 for the shadow strips**. Every fragment counts
twice (prepass and pass), because each one writes its key as `gl_FragDepth`, which stops the GPU from rejecting hidden fragments before
shading them.

What this rules out: at fitted views, shading 2 to 3 million fragments is a millisecond or two of GPU time even for a long shader; it cannot
be most of a 70 ms draw. Deep zoom and the patches' heavy shader are where shading starts to matter (ranks 3 to 5).

## 1. One render pass per mesh draw

**Now.** `meshPair` sets `drawBuffers(NONE)` for each key prepass and back to the pass's set for its colour pass; `meshDraw` switches
between `ATTACH_ONE` (strips) and `ATTACH` (patches) inside the shape pass; `meshRing` uses `NONE` then `[0, 1]`; the dimmed network and the
lift swap the colour attachment (`meshTarget`). Each change ends the Metal render pass.

**Change.**

1. Enable all four targets once (`drawBuffers(ATTACH)`) at the start of `meshPass` and leave them until it returns.
2. Key prepasses and the ring's mark pass: `colorMask(false, false, false, false)` instead of `drawBuffers(NONE)`.
3. Colour passes that must leave some targets alone (glows: 0 and 3; shadow and lift: 0; ring: 0 and 1): `colorMaski` per target, from
   `OES_draw_buffers_indexed`.
4. Shape strips: write target 2 as zero and use the same set as the patches. Target 2 is only read where target 1's `LUMEN2` bit is set
   (`veins-gl.js` 1572 to 1577, `blood-heads.js` 167), and a strip writes target 1 with that bit clear wherever it writes, so the zero is
   never read. This removes the strip/patch switch without the extension.
5. Dimmed network and lift: attach the two scratch layers as targets 4 and 5 for the whole draw and choose with `colorMaski` (the mesh
   programs write the same colour to locations 0, 4 and 5). Laying a scratch layer reads it as a texture, so that one step still needs its
   own pass, once a group rather than once a tier.

**Without the extension** (checked at start; the `?perf` "vessel renderer" gauge says which): steps 1, 2 and 4 alone take the trace's
draw from 24 passes to about 7 (one pass, plus two for each tier with a shadow), about a third of today's traffic.

**Expected.** One to three passes per whole mesh draw; tile traffic about 15x less. Every whole draw benefits: pinch and zoom frames, pans
that redraw strips, the view switch frames, and the "tubes changed" redraws at rest (whose tiles are scissored, but still pay the passes).

**Look.** Identical: the same draws, in the same order, writing the same values to the same targets.

**Checks.** A node test from the counter: a whole mesh draw in the stage-trace session is at most 3 render passes (with the extension in
the stub) and at most 1 + 2 x shadowed tiers without it. Stage trace re-saved (the GL calls change by design). Full node tests.

## 2. No classic frames in Mesh at start-up

**Now.** The mesh programs are compiled last of the deferred programs (`later` in `veins-gl.js` ~2118: simple, plain, streak, fused,
heads, then mesh). Until they are linked, `meshUse()` is false and **the classic shader draws the figure in Mesh mode**. That breaks
"Mesh is mesh" for the first seconds of every load, and the picture changes under the user when the mesh takes over.

**Change.** With Mesh chosen, compile the mesh programs first and do not draw the vessel layer until they are ready (the figure's first
frame waits, as it does for other start-up GPU work). The classic deferred programs compile after. Shader failure and software GL keep
their console warnings, and Settings shows that Mesh is unavailable on that device, rather than drawing classic under the Mesh label.

**Look.** The first vessel frame is a mesh frame. **Checks.** Node: with Mesh on, no classic vessel program is used for a draw before the
first mesh draw (trace recorder).

## 3. Narrower shadow strips

**Now.** A shadow strip is the vessel widened by `|shOff| + 2.4 x 1.4 + aa + 2 px` on every side (`meshPad`), because the shadow is the
vessel moved by `shOff` (1.4, 2.8 world units in the default look, 3.1 long). Shadow strips are 44 to 53% of all mesh fragments, with
overdraw 2.4 to 2.8.

**Change.** In the shadow passes, place the strip at the vessel moved by `shOff` and widen it by the blur alone (`2.4 x 1.4 + aa + 2 px`).
The strip then covers exactly the pixels whose shadow distance is in reach, which is all the shader can draw.

**Expected.** About a quarter to a third fewer shadow fragments (from the widths above, for the anatomy's 2 to 8 unit radii). **Look.**
Identical (coverage only). **Checks.** The coverage test in `tests/veins-mesh.test.js` run for the moved strip.

## 4. Keys from the vertex shader

**Now.** Every key prepass and colour pass writes its key with `gl_FragDepth` and may `discard`. That turns off early depth testing and
Apple's hidden-surface removal: the GPU runs the full shader for every fragment of every pass, then throws most of them away in the depth
test. That is why every fragment counts twice in count 2.

**Change.** Make the shape key a depth the rasterizer interpolates: each strip quad gets vertices at the lumen's edge as well as its
sides, so the lumen band has the constant key `0.5 (1 - z)` and the casing bands a key that rises with the distance past the wall, as
today's per-pixel key does. The prepass then writes no colour, reads nothing and runs no fragment shader (Apple GPUs do a depth-only pass
in hardware), and the colour pass's depth test (EQUAL, early) shades only the winning fragment. The shadow and glow keys can follow the
same pattern, or keep the exact per-pixel key, which still benefits from rank 1.

**Expected.** The prepasses nearly free and the colour passes shade only visible fragments: about half of today's fragment work (the K
rows in count 2), more where strips overlap. This matters at deep zoom (8.4 M fragments at 4x on the Mac) and on iPhone, much less at fit.

**Look.** The shading of every pixel is still exact (each fragment still computes its own distances). What can change is which vessel
wins a pixel where two vessels of the same tier overlap, within the strip's polygon error of the true round outline (a fraction of a pixel
at normal zooms). **Before building**: a node check that replays both keys over the real geometry and counts the pixels where the winner
differs; then your call. This is a change to how the brief resolves overlaps, so it waits for your OK.

## 5. Lighter join patches

**Now.** A patch is a square box around all its joins' reaches (`max(w, h) / 2`), drawn in the shape and shadow passes, prepass and pass, in
every tier it has members in. Its fragment shader walks up to 8 members over every segment within the joins' reach, then every pair of
members for the fillets. Patches are 28 to 32% of fragments and their shader is the heaviest in the mesh path; how heavy per fragment is
not measured.

**Change.** (a) A rectangle (not a square) per group, or one quad per join disc, so merged groups like the hepatic veins on the cava cover
less. (b) In the fragment shader, test each member's segment range against the pixel with one bound before walking it. (c) Measure with
rank 9 before going further.

**Look.** Identical. **Checks.** `tests/veins-mesh-data.test.js`; a node check that every join pixel is still inside a patch.

## 6. Look fixes (closer to classic)

The plan's known differences (`docs/veins-mesh-plan.md` section 6), in the order they show:

1. **A fading tier darkens twice**: its shadow and its shape are each faded, so the shadow shows through the fading vessel. Fix: while a
   tier's alpha is under 1, draw its shadow and shape into the scratch layer and lay it once at the tier's alpha (as the dimmed network is
   laid now). With rank 1 the scratch costs no extra passes until the lay.
2. **An upper tier's casing or ring hides the stream of the lumen under it** (target 1 is written zero there; integer targets cannot blend).
   Fix: the shape pass masks targets 1 and 2 (`colorMaski`), and a flow-only pass over the same keys writes them where a lumen shows. Needs
   the extension.
3. **Rounding in several blended passes**: each pass dithers, so soft glows and shadows can band or speckle. Fix: dither only in the last
   pass that touches a pixel's colour (the shape pass of its top tier), as the plan's risk R4 meant.
4. **A glow is cut only by lit lumens of its own tier.** Fix with the stencil from all lit lumens drawn so far (plan risk R5). Small.

## 7. Mesh-native view switch

The strips and patches read only the frame's points and joins. Today they get them through the stretch binnings made ahead for the classic
shader (`makeMorphSet`, `setMorphFrame`), and when a stretch is not ready the frame falls back to binning on the CPU (`binningStep`, ~40 ms of
script and MB of uploads a frame in node, `anatomy-circuit-switch-speed.md`). In Mesh mode, upload the frame's points and join centres
straight from the vessels' morph frame (about 150 KB a frame for ~300 rows) and build the patch list once per switch. The switch then never
waits on the sweep worker and never bins on the CPU. The 10 fps switch on Mac is mostly GPU per that note; rank 1 is the bigger part of
the fix, this removes the remaining CPU spikes.

## 8. The lobule on the mesh renderer

`who: 'lobule'` never builds the mesh programs, so the lobule draws classic vessels even with Mesh chosen. By the "Mesh is mesh" rule
that is the largest hybrid left. Building it means the mesh path learning the lobule's kept picture and blood rows. The lobule's frame cost
is mostly its blood, composite and lay passes (`lobule-lag-recs.md`), so the fps gain is unknown; the case for it is consistency and the
cost of whole vessel redraws during lobule zooms. Do it after ranks 1 to 4 are proven on the anatomy.

## 9. Fence timings per mesh phase in `?perf`

`gpu-fence.js` already times whole redraws. Add a fenced part around the strips, the patches, the shadow passes and the scratch lays of one
whole mesh draw in four (at most one per 250 ms, as now), shown in the panel's GPU section. Only with `?perf`. This turns the model above into
device numbers the next time a readout comes in, without anyone being asked for one.

## Not recommended

- Lowering the figure's megapixel cap: the 4 MP attempt broke the picture on the Mac (`mac-lag-preserve-buffer.md`).
- A draw-order union without key passes ("lean mesh" in `vessel-renderer-alternatives.md`): it changes the look at overlaps, and rank 1
  plus rank 4 give most of its speed while keeping the brief's resolution.
- WebGPU or a new renderer: the measured problem is pass structure, which the mesh can fix in place.

## Files

- Measurement scripts and how to rerun them: `/mnt/project-files/mesh-renderer-recs/` (run from the repo root:
  `node /mnt/project-files/mesh-renderer-recs/run.mjs` for passes, `CW=2400 CH=1500 ZOOM=1 TAGS=anatomy node .../run2.mjs` for fragments).
- Code read: `src/ui/veins-gl.js` (mesh path ~3223 to 3500, `vesselFS` 280 to 870), `src/ui/veins-mesh-glsl.js`, `src/ui/veins-mesh.js`,
  `src/ui/veins-mesh-data.js`, `docs/veins-mesh-plan.md`.
