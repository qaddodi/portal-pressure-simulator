# Tube renderer, stages 2 and 3: the plan (10 Nov 2026)

**Status (11 Nov 2026).** Built; `docs/tube-renderer.md` is the as-built reference ("The varyings", "Stage 2", "Stage 3", "Seamless joins", "The compositor's lumen text") and this file is the 10 Nov plan, kept as history.
- Built (checked in `src/ui/tube-stage2.js`, `tube-lean-glsl.js`, `tube-joint.js`, `tube-data.js`, `tube-lumen-glsl.js`, `comp-glsl.js`, `scripts/glsl-compile.mjs`): the shared varyings, the lean and depth programs, webs for joins, the lumen layer and the compositor's Tube builds, the compile check. One program more than the table: `tubeJoinDepth`.
- Superseded: safety rule 4 (the escape hatches `?tube=1`, `?tube=2`, `?tubejoin=patch`) was carried out as planned: they were removed on 11 Nov 2026 (8c51b6a), and the stage now follows which programs are ready. Where this plan says Classic or Mesh "draw for it as today", read: only the hidden classic safety net draws, while the Tube is not ready. "Patches are drawn only with `?tubejoin=patch` or when the web programs failed" now reads: patches only in stage 1.
- Open: "Glow pairs keep the stage 1 program" was changed by the glow program (`tubeGlow`, speed plan P6). The "Known differences" below still hold.



Mohammad, 10 Nov: "let's start stage 2 and 3 and do this right; do everything in parallel and make it perfect", then "finish the
entire renderer ... no mistakes". Stage 1 is `docs/tube-renderer.md` (as built) and `docs/recommendations/tube-renderer-plan.md`;
the lobule is `docs/recommendations/tube-renderer-lobule-plan.md`. This plan adds to both and changes neither's rules, except where
it says so. Briefs: `/mnt/project-files/tube-renderer/briefs/` (`S0-K`, `S2-A`, `S2-B`, `S2-J`, `S2-D`, `S3-X`, `S3-C`, `S3-D`).

## What each stage is, in one line

- **Stage 2:** the same picture drawn with far less work: a short fragment shader fed by the geometry (no nearest-segment search), a
  depth prepass that runs no fragment work for plain vessels, and **joins made of geometry** (a small rounded web in each corner of a
  join) in place of the join patches. The patches are the Tube's costliest part and the reason the lobule cannot be fast.
- **Stage 3:** the blood, dye, origin colours and lymph are drawn by the tubes themselves, every frame, on lumen pixels only, into one
  small layer the compositor lays in. The compositor stops reading the two flow targets on every pixel of every frame.

## The safety rule (why this can be built without a device in the loop)

1. **Every new program is optional.** When one fails to compile or link, the Tube draws the stage before it, and `?perf` says which
   stage draws and why (`vessel renderer` gauge: `tube 3`, `tube 2`, `tube 1: lean failed`, ...). This is not a hybrid: Tube is still
   Tube; Classic and Mesh never draw for it except as today (program not ready).
2. **No text another renderer compiles may change.** `vesselFS(..., tube = 0)` and `COMP_FS(...)` without its new last argument stay
   byte for byte what they are (hash tests, as `tests/vessel-fs-old-builds.test.js` does). New text lives in new modules.
3. **A compile check, and only that** (decided 10 Nov under Mohammad's "I trust him to take decisions like me"): `scripts/glsl-compile.mjs`
   compiles and links exported shader strings in headless Chromium's WebGL2 and prints the info log. It loads no app page, draws nothing,
   takes no picture, judges no look and no speed. It is the one exception to "no headless runs", and every stage 2 and 3 thread runs it
   on its own programs before a push. (Brief S0-K.)
4. **Escape hatches while this lands:** `?tube=1` and `?tube=2` cap the stage; `?tubejoin=patch` keeps the patches. They are for
   comparing on a device, never needed for normal use, and are removed when Mohammad approves stage 3.
5. `src/ui/veins-gl.js` is at the build's chunk limit. Thread D owns it outside the compositor's source; thread X owns the compositor's
   source (`COMP_FS` and the strings it includes). Nobody else edits it. Everyone rebases before a push and never force pushes.

## The shared contract (names are fixed here so the threads can build at once)

### Varyings every Tube vertex shader writes (strips, domes, trapezia, webs)

```glsl
invariant gl_Position;      // every Tube vertex shader, so the depth prepass and the colour pass agree exactly
out float vI;               // the sample index along the vessel (as now)
flat out int vRow;          // the vessel row (as now)
out float vD;               // signed distance from the lumen's wall, world units: negative inside, 0 on the wall, positive in the outline's skirt
out vec2 vG;                // direction from the centreline to this point (not unit; the fragment shader normalises; (0,0) on the centreline)
out float vRad;             // the lumen's radius here, world units (a web: 4 x its larger member's radius)
flat out vec2 vEnd;         // the vessel this row ends on at its start (x) and its end (y): trunk row * 64 + the trunk's sample there, or -1
```

The skirt's outer edge is exactly the outline's width plus the edge softness: `wl + aaPad`, with `wl = clamp(0.14 R, 1.5 px, 3 px)` as
`celShade` has it, so no transparent geometry takes a pixel in the prepass.

### The Tube's row buffer (per instance, 4 floats; `src/ui/tube-data.js`, thread J)

`(row, endStart, endEnd, kind + 2)`: `kind` 0 plain, 1 exact (the `+ 2` so that a one-float buffer, which WebGL pads with
`(0, 0, 1)`, reads as "no ends": `vEnd = aRow.w > 1.5 ? aRow.yz : vec2(-1.0)`). A row is **exact** when its fragment shader can leave a pixel empty other than
by `vD`: dotted (`F_DOTTED`), clipped (the row's clip range is not 0..1), or it ends on a vessel (`vEnd` not -1). `tubeBuckets(...)`
orders each tier's rows plain first and gives `plain[t]`, `count[t]`, `start[t]`, with `sel`, `lit`, `litUp` as `tierBuckets` gives them.

### Programs (all optional, finished as the optional builds are)

| Name | Vertex | Fragment | Used for |
|---|---|---|---|
| `tubeLean` | `tubeStripVS` | `tubeLeanFS()` | every strip's colour pass; exact rows' prepass (colour masked) |
| `tubeDepth` | `tubeStripVS` | `TUBE_DEPTH_FS` | plain rows' prepass |
| `tubeWeb` | `tubeWebVS` | `tubeLeanFS()` | the webs' colour pass |
| `tubeWebDepth` | `tubeWebVS` | `TUBE_DEPTH_FS` | the webs' prepass |
| `tubeLumen`, `tubeWebLumen` | the same two vertex shaders | `tubeLumenFS()` | stage 3: the lumen layer |

Stage 2 draws when the first four are ready; stage 3 when the last two and the compositor's Tube builds are too. Glow pairs keep the
stage 1 program in every stage (few rows, and their prepass is a fragment rule).

### Depth

Levels as stage 1 and the lobule plan (`TUBE_LEVEL`, the lumen by `zK`, `hK`, the fade band). New: `TUBE_LEVEL.WEB = 0.295`, a web's
fill: over every casing and every fading lumen, under every opaque lumen, so a web shows only in the corner outside its members'
lumens. A web's skirt runs from `CASE1` at the arc down to `CASE0`. The colour pass tests `LEQUAL` with the stencil as now;
`TUBE_EQ_BIAS` (0) is the one lever if a device ever shows holes.

## Stage 2 in detail

### The short fragment shader (`tubeLeanFS`, brief S2-B)

From the varyings: `D = vD`, `g = normalize(vG)`, `R = vRad`, the along place from `vI`. It keeps, from the shared text and unchanged:
`vesAttrs`, the organ veil, the dotted and clip rules, `celShade`, `packFlow`, `ditherOut`, the tier and group alphas, the redraw rule,
the four outputs. It has no search, no joins, no loops over vessels. New in it: the **open end**. A row that ends on another vessel
(`vEnd`) draws no outline inside that vessel's lumen (it discards skirt pixels there), so a branch in a higher tier never draws a ring
across the trunk it ends on. This replaces the patch's copy of a lower trunk.

### Joins made of geometry (`tube-joint.js`, brief S2-J)

The union of half tubes under one depth test is already a correct join: the taller lumen wins each pixel, and every outline is under
every lumen of its tier. What is missing is the rounding of the concave corner. A **web** fills it: a fan from the corner point where
the two facing walls meet, out to an arc tangent to both walls, with a skirt past the arc for the outline. Its radius is the join's own
blend width times its fillet share (the numbers the patches use). It is placed in the vertex shader from the points and radii of the
frame, so it follows every dilation and the change between views. A trunk that runs on through a join counts as two members, one each
way, so a tributary gets a web on each side.

What changes in the picture, on purpose: (1) inside a join a tributary's stream ends where the trunk's lumen is taller, on a curved line,
and its streaks fade at its end as `bloodAt` already fades them; there is no cross-fade of the two streams. (2) A web takes its trunk's
colour and attributes (or the wider member's). (3) No second lumen anywhere in Tube.

### The prepass (brief S2-D)

Per tier: plain rows and webs with the depth programs (no fragment work), exact rows with `tubeLean` and the colour masked, then the
colour pass over all. Patches are drawn only with `?tubejoin=patch` or when the web programs failed.

### The lobule

L-A, L-E and L-D go ahead now, on patches, as their briefs say; the two-part patch of `269cc98` is folded into L-D (see its
Correction 2). When stage 2 lands the lobule draws webs like the figure, which is what makes it fast: about 127 patch groups, each
running the full join shader over its box four times, become about 400 small fans.

## Stage 3 in detail

- **The lumen layer** (`RGBA8`, the vessel layer's size and mapping, with a depth buffer of its own): every blood frame the Tube draws
  the depth of everything (the stage 2 prepass, bands as the layer pass) and then the lumens only (`vD < 0`), depth `LEQUAL`, with
  `tubeLumenFS`. That shader is the compositor's lumen section fed by the varyings in place of the flow target: origin colours, blood
  (style P), lymph dashes, dye and its edge, the casts. It writes the lumen's final colour, premultiplied by its coverage and the
  vessel's opacity.
- **The compositor's Tube builds** (`COMP_FS(plain, streak, heads, tube = 1)`, brief S3-X): where the lumen section was, one read of the
  lumen layer and one mix. Everything else in it (plates, fluid, bleed, outlines, order) is the same text. Its helper functions move,
  unchanged, into `src/ui/comp-glsl.js` so both shaders include the same text; `COMP_FS` without the new argument stays byte identical.
- **The flow targets:** the layer pass stops writing the second one. The first stays, written only when the layer is redrawn, because
  the arrowheads' quads (`blood-heads.js`) and picking the lumen in front read it; nothing reads it per pixel per frame any more.
- Not in the Tube after stage 3: the half-size streak pass and the second-lumen mix (both are aids of the flow-target design).

## Threads and order

| Brief | Thread | Files it owns | Waits for |
|---|---|---|---|
| S0-K compile check | new: "Build shader compile check" | `scripts/glsl-compile.mjs` | nothing |
| L-A, then S2-A | A (geometry) | `tube-geo.js` | fault 3 (done) |
| S2-B lean shader | B (shading) | new `tube-lean-glsl.js` | nothing (contract above) |
| S2-J joints | new: "Build Tube joints from geometry" | new `tube-joint.js`, `tube-data.js` | nothing (contract above) |
| L-E | its thread | as its brief | nothing |
| S3-X compositor | new: "Split the compositor's lumen shader" | `comp-glsl.js`, the compositor's source in `veins-gl.js` | nothing |
| S3-C lumen shader | C (particles) | new `tube-lumen-glsl.js` | S3-X's first push (the helpers' module) |
| fault 1, L-D, S2-D, S3-D | D (integrator) | `tube-pass.js`, `veins-gl.js` outside the compositor | L-D: L-A, L-E. S2-D: S2-A, S2-B, S2-J, S0-K. S3-D: S2-D, S3-X, S3-C |

Everything in the first six rows starts at once. D works its four jobs in order as their inputs land.

## Checks

Node only, plus the compile check: `npm run lint && npm test && npm run check:static`, and `node scripts/glsl-compile.mjs` on every new
program. Tests judge exported strings and JS twins (rule PR-02: no new test reads `src/` text). Geometry is tested on real data: the
figure's rows and the lobule's (`/mnt/project-files/tube-renderer/lobule-capture.mjs`).

## Stop points (ask the planner thread, not Mohammad)

- A text another renderer compiles would have to change.
- A web cannot be placed for a kind of join (say which, with the rows).
- Something outside the list reads a flow target per frame.
- The lumen layer cannot follow the vessel layer's mapping in one draw.
- The compile check passes and a thread still believes a program is wrong.

## Known differences from stage 1, after stage 3

The three under "Joins made of geometry"; the blood shows in the lumen in front at that vessel's opacity (as now, read from geometry);
no half-size streak pass in Tube.
