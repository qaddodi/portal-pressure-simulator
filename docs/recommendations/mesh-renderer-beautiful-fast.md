# Mesh vessel renderer: more beautiful, simpler, faster (recommendations, 9 Nov 2026)

Docs only. Nothing here is built. Mohammad picks; then each pick is built as written.

Scope: the Mesh vessel renderer (`src/ui/veins-gl.js` mesh path, `veins-mesh-glsl.js`, `veins-mesh.js`, `veins-mesh-data.js`; Settings › Display › Mesh).
Read at `22230884` on `claude/settings-topbar-icon-flvft1`. This file takes in three earlier pieces and ranks everything in one list:

- the speed recommendations of the same day, `docs/recommendations/mesh-renderer-optimization.md` (called "the speed doc" below; its item numbers are kept as O1 to O9);
- the visual style review, `docs/recommendations/visual-style.md` (its vessel items V1 to V5);
- the Vector renderer debrief, `/mnt/project-files/vector-renderer/debrief-nov9.md`, whose lesson is that a cost worked out in node was wrong by a large margin on the real GPU.

Rules kept throughout: everything stays on the GPU. Mesh is mesh, with no Classic frame or fallback inside it. No headless browser runs. Labels keep the one label style. Glass stays real GPU glass. The textbook shading, the faint contact shadow and the portal tree's heavier casing are the owner's and are not reopened.

## The short version

Three things matter most.

1. **Look: the outlines and shadows get heavy when you zoom in.** A vessel's casing, its shadow, its glow and the selection ring are sized in figure units, so they grow one for one with the zoom. Counted on the real anatomy for a Mac: the middle vessel's casing is 1.3 px at the fitted view, 5.4 px at 4x and 8 px at 6x; the shadow sits 5 px away at fit and 28 px away at 6x; a glow band is 23 px at fit and 140 px at 6x. The finer details (the pale wall band, the dark-lumen rim) already hold their width in pixels. Giving the casing, shadow, glow and ring a gentler law is the largest change to the picture on this list, and it also makes the mesh draw less when zoomed.
2. **Speed: one GPU pass per draw (O1) is still the right first build, but its size is a model, not a device number.** So is the speed doc's claim that shading is cheap. The join patches run the longest shader in the app twice per pixel, and nobody has timed them. Build the on-device cost switches (item 1 below) with O1, and let them choose what comes next.
3. **Simpler: once the keys come from the geometry (O4), the mesh can use small programs, one per kind of pass**, instead of the whole classic shader text switched by a number. That is the step that makes the code elegant, and it is also the one speed step that can move the picture by a part of a pixel.

| Rank | What | Changes the picture? | Speed | Size | From |
|---:|---|---|---|---|---|
| 1 | **Cost switches in `?perf`**: time a whole mesh draw as it is, with flat shaders, without patches, without shadows | No | Measurement only. Decides the order of 6, 7 and 8 | S | new (replaces O9) |
| 2 | **One render pass per mesh draw** | No | Model: about 15x less tile traffic per draw. Not timed on a device | S | O1 |
| 3 | **Line weights that hold when zoomed**: casing, shadow, glow and ring grow with the square root of the zoom | **Yes, when zoomed in.** Nothing changes at the fitted view | Narrower strips at zoom (count: shadow strips are 53% of fragments at 4x) | S to M | new |
| 4 | **Mesh from the first frame** (no Classic picture while the mesh shaders load) | **Yes, for the first seconds of a load**: the figure no longer changes under you | None | S | O2 |
| 5 | **A fading tier fades as one shape** (its shadow no longer shows through it) | **Yes, during fades** (every slide change that fades vessels) | Small cost while a fade runs | S to M | O6.1 |
| 6 | **Narrower shadow strips** | No | Count: about a quarter to a third fewer shadow fragments | S | O3 |
| 7 | **Keys from the geometry, then small programs per pass** | **Possibly, under 1 px where vessels of one tier cross** (count below) | Prepass nearly free, colour pass shades only what shows. Unmeasured | M | O4 + new |
| 8 | **Lighter join patches** | No | Unmeasured. Item 1 says if it should move up | M | O5 |
| 9 | **The crossing ring back, in Mesh, with joins left out** | **Yes**: an edge where two vessels of one tier cross | Two more draws per tier that has a crossing | M | V2, parked 8 Nov |
| 10 | **Mesh-native view switch** | No (a smoother Anatomy to Circuit switch) | Removes the CPU binning spikes | M | O7 |
| 11 | **Small look fixes**: glow cut, one dither, stream at a casing's edge | Yes, slightly | Small | S each | O6.2 to O6.4 |
| 12 | **The lobule on the mesh** | No, by intent | Unknown | L | O8 |

Picture-changing items are 3, 4, 5, 9 and 11, and 7 by a part of a pixel. Items 1, 2, 6, 8, 10 and 12 are meant to leave every pixel as it is.

Recommended order: 1 and 2 together, then 3 (your call on the look; I can mock it first), then 4 and 5, then whichever of 6, 7, 8 the cost switches point at, then 9, 10, 11, and 12 last.

## What the Vector build teaches, applied here

The Vector renderer was chosen and then revised on node counts (bound tests, segment tests) that said it would do 3 to 13% of the old work. On the Mac it gave 13 fps in the lobule and 35 fps in the anatomy. The debrief's own conclusion is that the counts were no basis for the choice. The same weakness is in the mesh material so far, so this file holds to five rules.

1. **Every number says what it is.** "Count" is counted from the real stage in node. "Driver fact" is read from ANGLE's source. "Model" is arithmetic on a count. "Device" is seen on Mohammad's hardware. Only two mesh numbers are device numbers today: whole mesh redraws of about 70 ms on the M5 Air (an upper bound, the fence also waits for earlier work), and the first mesh build being slower than Classic.
2. **The speed doc's two central claims are both models.** That the 24 to 30 pass breaks are most of the 70 ms is a driver fact plus a traffic model. That shading 2 to 3 million fragments is "a millisecond or two" is not counted at all: it assumes a cheap shader, and the patch shader is not cheap (next section). Either may be right. Neither has been timed.
3. **Measure on the device, by switching parts off.** Item 1. Timing a part with a fence inside the draw (O9 as written) stops working once O1 is built: a tiled GPU does all the work of a render pass when the pass ends, so fences inside one pass cannot tell the strips from the patches. Switching a part off and timing the whole draw still can.
4. **No step is proven by a node test.** Node tests say the picture's rules still hold and count passes. They do not say a step is faster. Each speed step ships with its cost-switch reading visible in `?perf`, so any readout that happens to come in settles it. Nobody needs to be asked for one.
5. **One change at a time, by one thread.** The Vector pieces were joined within minutes of each other on node tests alone, and the debrief could not rule out that the device ran tables the shaders did not expect. The mesh path has one owner thread; each item below is one push.

## What I checked for this file

Counts from the real stage in node, under the stage trace's recorder, with the speed doc's scripts plus one more (`geo.mjs`, in `/mnt/project-files/mesh-renderer-recs/`). The camera is fitted to the figure, as in the speed doc, so pixel sizes are for an assumed 2400 x 1500 Mac layer and 1170 x 1800 iPhone layer, not the devices' own.

**Line weights by zoom (count).** 66 vessel rows at the anatomy's rest. Casing widths are 0.7 to 1.17 figure units (median 0.9; `stage-tubes.js:424`, written to the tube texture at `stage-vessels.js:748`). The shadow offset is (1.4, 2.8) units, 3.1 long. The fitted Mac view is 1.5 px per unit, the iPhone's 1.7.

| Mac zoom | Casing, middle vessel | Shadow offset | Glow band | Selection ring, past the wall | Lumen radius, middle vessel |
|---|---:|---:|---:|---:|---:|
| fit | 1.3 px | 4.7 px | 23 px | 6 px | 2.7 px |
| 4x | 5.4 px | 19 px | 94 px | 24 px | 10.7 px |
| 6x (the pinch limit) | 8.1 px | 28 px | 140 px | 36 px | 16 px |
| 9x (the TIPS close-up) | 12 px | 42 px | 211 px | 54 px | 24 px |

**How round the curves are (count).** Every vessel is 64 points joined by straight pieces with round joints. The gap between those straight pieces and a smooth curve through the same points is at most 0.12 px at fit, 0.5 px at 4x and about 1 px at 9x, on 12 of 66 vessels. The sharpest corner between two pieces is 17 degrees, on the tortuous collaterals. So the curves are smooth enough: this is not worth building now (see "Not recommended"). The same number bounds how far item 7 can move a crossing.

**What the mesh shaders run (code read).** A strip's program is the whole classic vessel shader compiled for one vessel (`vesselFS(true, 1)`), and a patch's is the whole shader for eight vessels and six joins (`vesselFS(false, 2)`). A number, `mPass`, picks which of eleven jobs it does. A strip pixel works out five segments (15 texture reads) before it knows its key. A patch pixel walks up to eight members over every segment near its joins, then every pair of members for the fillets. Both run once in the key prepass and again in the colour pass. Patches are 28 to 32% of all fragments (speed doc, count 2). How long that takes on an Apple GPU is unknown.

**The parked ring (code read).** The paper ring where vessels of one tier cross (V2) is switched off on every look (`theme-tokens.js:118`, `--vessel-knock-a: 0`): it cut the lower vessel round the end of a vessel that joins it. So the mesh's two ring draws per tier never run today, and same-tier crossings still swap colour with no edge.

**Two corrections to the speed doc.** O5 (a) asks for a rectangle in place of a square patch box; the patch vertex shader already draws the rectangle round its joins' discs (`veins-mesh-glsl.js` 430 and 450), so only "one quad per join disc" is left of (a). O9 is replaced by item 1, for the reason in rule 3.

## 1. Cost switches in `?perf`

**What.** With `?perf` open and Mesh chosen, while the figure is at rest, the renderer now and then redraws the vessel layer a few times in each of four ways and times each with the fence timer the app already has (`gpu-fence.js`), then draws it properly again:

- as it is;
- with flat shaders: the same strips and patches, the same passes, a fragment shader that writes one colour. What is left is the passes, the vertex work and the fill. The difference from "as it is" is the shading;
- without the patches;
- without the shadow passes.

The panel shows one line, for example "mesh draw 41 ms: passes and fill 22, shading 19 (patches 9, shadows 6)", with the layer's size in pixels and the view. Copy includes it. The flat shaders compile only with `?perf`.

**Why first.** It tests the speed doc's main claim on the device (if the flat draw is still most of the time, the passes are the cost and item 2 is the fix; if not, the shaders are, and 7 and 8 move up). It then proves or disproves item 2 with the same line. It also gives the first same-view number to hold Mesh against Classic: the panel already times Classic's whole draws when Classic is chosen.

**Look.** None outside `?perf`. The probe's draws are mesh draws into the mesh layer, so Mesh stays mesh.

## 2. One render pass per mesh draw (O1)

As the speed doc's section 1, unchanged: enable all four targets once per draw, mask with `colorMask` and `colorMaski` in place of changing `drawBuffers`, let the strips write target 2 as zero. The picture is identical by construction, the change is small, and it is right whatever the device says: 24 to 30 passes for one layer is poor structure on any tiled GPU. What is not known is how many milliseconds it buys; item 1 says.

One addition: it is also the step that lets the pass sequence be written as a short table (which keys, which targets, which blend) run by one loop, in place of the GL state each helper sets and unsets today. Do that in the same push.

## 3. Line weights that hold when zoomed

**Now.** The table above. At 6x the middle vessel is a 32 px lumen inside two 8 px black lines with a shadow floating 28 px away, and a lit vessel's glow is a 140 px band. That is the look of a small drawing enlarged, not of a drawing made for the size it is seen at. Atlases and maps do not scale line weight one for one with size, and the app already agrees for its finest details: the pale wall band is 1.2 to 2.4 device px at any zoom, the dark-lumen rim is 1 px, the parked ring 2.5 px, and labels never scale.

**Change.** One factor, `lineK = (fitted scale / current scale) ^ 0.5`, never above 1, set once per draw. It multiplies the casing width, the shadow's offset and blur, the glow's reach and the selection ring's distance in the shared shading text (`veins-mesh-glsl.js` `vesAttrs`, `shadowOf`, `glowAmt`, `tubeShade`), and the strips' padding (`meshPad`). At and below the fitted view it is 1, so the fitted picture, and every slide that does not zoom, is exactly today's.

| Mac zoom | Casing today | Casing proposed | Shadow offset today | proposed | Glow today | proposed |
|---|---:|---:|---:|---:|---:|---:|
| fit | 1.3 px | 1.3 px | 4.7 px | 4.7 px | 23 px | 23 px |
| 2x | 2.7 px | 1.9 px | 9.4 px | 6.6 px | 47 px | 33 px |
| 4x | 5.4 px | 2.7 px | 19 px | 9.4 px | 94 px | 47 px |
| 6x | 8.1 px | 3.3 px | 28 px | 11.5 px | 140 px | 57 px |
| 9x | 12 px | 4.0 px | 42 px | 14 px | 211 px | 70 px |

The lumens themselves keep their true size at every zoom: they carry the physiology. The portal tree's casing stays 1.3 times the systemic side's.

**What must move with it.** Marks that sit on the casing read the same width and need the same factor, or a gap opens at zoom: the stent mesh and its markers, the tied-off stroke (`stage-transitions.js` 258, 292, 306, 311) and the figure's hit and reach sizes (`stage-geo.js:99`, `stage.js:1851`, which may stay as they are, since a smaller casing is inside them). Mesh and Classic share the shading text, so both renderers get the same weights and stay comparable; nothing is mixed between them.

**Speed.** The strips' padding shrinks with it, so zoomed draws shade less: at 4x the shadow strips are 53% of all mesh fragments and their padding is mostly the shadow offset. A count, not a timing.

**Your call.** This is a change to how the figure looks when zoomed, inferred from the numbers and not seen on a screen. The exponent is the one knob: 0.5 is the proposal, 1 is today, 0 is "constant pixels". I can mock fit, 4x and 6x at three exponents on one page before anything is built.

## 4. Mesh from the first frame (O2)

As the speed doc's section 2: with Mesh chosen, compile the mesh programs first and hold the vessel layer until they are ready, in place of drawing Classic for the first seconds and swapping. This is the one place where the app still breaks "Mesh is mesh" on every load, and the swap is a visible change of picture. After item 7 the mesh programs are much smaller than today's, which shortens the hold.

## 5. A fading tier fades as one shape (O6.1)

**Now.** A tier's shadow and its shape are each faded, in separate passes. While a tier fades in or out, its shadow shows through its own vessels, so the tier darkens and then lightens: a small pulse of grey on every slide change that fades vessels. Classic does not do this.

**Change.** As the speed doc's 6.1: while a tier's alpha is under 1, draw its shadow and shape into the scratch layer and lay that once at the tier's alpha, as the dimmed network is laid now. Only fading tiers pay for it, and only while they fade.

## 6. Narrower shadow strips (O3)

As the speed doc's section 3. If item 3 is built, do this after it: item 3 already takes most of the padding away at zoom, and this takes the rest at every zoom.

## 7. Keys from the geometry, then small programs per pass (O4, extended)

**Now.** Every fragment writes its key as `gl_FragDepth`, so the GPU cannot reject hidden fragments before shading them, and the colour pass must make exactly the key the prepass made. That second point is why one large program does all eleven jobs: two different programs could round the same key differently, and the depth test (EQUAL) would then drop pixels.

**Change, in two steps.**

1. **O4 as written**: the strips carry the key as ordinary depth from their vertices (the lumen band flat at its z, the casing bands rising with distance from the wall). The prepass then runs no fragment shader, and the colour pass shades only the fragment that shows.
2. **New, and only possible after step 1**: with the key coming from the same vertex shader in both passes (`invariant gl_Position`), the fragment programs no longer have to match. Build one small program per kind of pass from the same shared text: shadow, shape for a strip, shape for a patch, glow, lift. A strip's shape program has no slots, no join loops and no tier loop. This is what makes the mesh code read as a mesh renderer and not as the classic shader with switches, and it cuts compile time (item 4).

**Look.** Each pixel is still shaded exactly from its own distances. What can change is which of two overlapping vessels of one tier draws a pixel, within the gap between the strip's straight pieces and the true curve: at most 0.12 px at fit and 0.5 px at 4x on the Mac (count above). Before building, the node check the speed doc asks for (replay both keys over the real geometry, count the pixels whose winner differs), then your call.

**Speed.** Expected to be the largest shading saving. How large depends on what shading costs today, which item 1 measures. If item 1 shows shading is small after item 2, build step 2 anyway for the code, at leisure.

## 8. Lighter join patches (O5)

As the speed doc's section 5, less its part (a)'s rectangle, which exists. If item 1 shows "without patches" is far cheaper than the full draw, this moves ahead of 6 and 7: test each member's segment range against the pixel with one bound before walking it, and one quad per join disc for merged groups.

## 9. The crossing ring back, with joins left out (V2)

**Now.** Where two vessels of one tier cross, one lumen simply replaces the other, with no edge. The ring that fixes it was built on 8 Nov and parked the same day, because it also cut the trunk round the end of every vessel that joins it.

**Change.** In Mesh the fix is natural, because the join pixels already belong to the patches: before the ring draws, one draw of the tier's patches clears the ring's stencil mark inside each join's disc. The ring then appears only at true crossings. Do it for tiers that have a crossing (found once when the vessels are set), so the others pay nothing. The "black cap" seen on the dark looks on 8 Nov is described in the token's note as part of the same join fault; that is to be confirmed when it is built, not assumed.

**Look.** A 2.5 px gap of the figure's ground round the upper vessel where it crosses a vessel of its own tier, the atlas convention. Needs `--vessel-knock-a` above 0 again, per look. Classic keeps it parked unless its own join list is added; that is a separate choice.

## 10. Mesh-native view switch (O7)

As the speed doc's section 7. It removes the last place where Mesh waits on data made for the classic shader. Item 2 is the larger part of the switch's speed.

## 11. Small look fixes (O6.2 to O6.4)

In the order they show: a glow cut by every lit lumen drawn so far, not only its own tier's; the dither applied once, in the last pass that touches a pixel; a lower lumen's stream kept under the soft edge of an upper tier's casing. Each is small and each moves the mesh toward Classic's picture. The last needs `colorMaski` (item 2).

## 12. The lobule on the mesh (O8)

As the speed doc's section 8, and still last. The lobule's frame time is mostly blood, composite and tissue, the Vector build showed 13 fps there with a different vessel renderer, and no same-view Mesh or Classic number exists. Item 1's panel line, read in the lobule with Classic, is the number to have before deciding.

## Simpler code, in one place

These need no pick of their own; each falls out of an item above.

- **A pass table** in place of hand-set GL state (with item 2).
- **Small programs per pass** in place of one program with eleven jobs (item 7, step 2).
- **No Classic inside Mesh**: start-up (item 4), the view switch's binnings (item 10), the lobule (item 12). When all three are done, the mesh path reads nothing made for the classic shader.
- **The mesh pass in its own file.** About 280 lines of `veins-gl.js` (3223 to 3502) are the mesh draw. Moving them to `veins-mesh-pass.js` with the state they need passed in changes nothing on screen and makes the single-owner rule easy to keep. Do it with item 2, when those lines are being rewritten anyway.

## Not recommended

- **Smoother curves** (more points, or curved pieces in the shader): the straight pieces are within 0.5 px of a smooth curve up to 4x and about 1 px at 9x. If the varices' second wave (visual style V3) is built, check those vessels again; they are the ones with 17 degree corners.
- **Drawing the mesh at lower resolution while the hand moves**: a softer picture in exactly the frames the eye is on, and the megapixel cap attempt broke the picture on the Mac (`mac-lag-preserve-buffer.md`).
- **Multisampling the layer**: the edges are already antialiased from exact distances, the integer stream targets cannot be resolved, and it multiplies the tile traffic item 2 removes.
- **A draw-order union without keys, WebGPU, or another new renderer**: unchanged from the speed doc. The Vector build is the reason to finish this renderer and not start another.
- **Per-phase fences inside the draw** (O9 as written): replaced by item 1.

## What this file does not claim

- Nothing here was seen on a screen. Pixel sizes use a fitted camera and assumed layer sizes.
- No speed figure here is a device timing. Item 1 exists to get them.
- The line-weight law's exponent is a judgement. A mock, then a device, decide it.

## Files

- Scripts: `/mnt/project-files/mesh-renderer-recs/` (`geo.mjs` for line weights and curve gaps: `node geo.mjs`, `CW=1170 CH=1800 node geo.mjs`, `TAG=circuit node geo.mjs`; the speed doc's `run.mjs` and `run2.mjs` for passes and fragments).
- Code read: `src/ui/veins-gl.js` (`vesselFS` 280 to 877, mesh path 3223 to 3502, draw routing 4575 to 4690), `src/ui/veins-mesh-glsl.js`, `src/ui/stage-tubes.js` 405 to 428, `src/ui/stage-vessels.js` 740 to 950, `src/ui/theme-tokens.js`, `docs/veins-mesh-plan.md`.
