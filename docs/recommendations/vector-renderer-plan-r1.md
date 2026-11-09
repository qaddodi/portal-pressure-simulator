# Vector vessel renderer: plan revision 1 (the adaptive hierarchy)

9 Nov 2026, 17:00 UTC. For Mohammad. This revises `vector-renderer-plan.md` to follow the reviewer's second recommendation
(`vector-renderer-brief-r2.md`, word for word), sent after the first GPU run at `8772ff8`: almost no vessels draw, and the lobule
runs at about 9 fps with about 98% of its occupied cells as regions. Read from the code at `ef44ef0`.

**What stays:** the retained renderer, one renderer, everything on the GPU, the pure third Settings choice, the lobule following it,
blood shaded on the geometry, the organs, the overlays, the setting and seam, the frame kinds (FULL, BASE, BLOOD), the ten
workstreams A to J and their threads, the common rules (plan section 9) and the stop points (plan section 10).

**What this replaces:** plan section 4 (the fixed 16-unit classification) entirely, the member loop of section 5.2, the reach rule in
`vec-contract.js`, and the acceptance status. Not in this round, by the reviewer's word: sinusoid merging, a distance field, a new
universal cell size, a nearest-k cutoff.

**Not a pass yet:** none of the six acceptance criteria has passed. The node checks in `tests/vec-accept-*.test.js` test partition rules,
maths and scheduling. They are preconditions, not acceptance. Seamless rendering, stable streaks and sustained pacing can only be judged
on the devices, once the vessels draw.

## 1. What the build does today, and why it costs what it costs

Read from `vec-compile.js` (`classify`, `joinRuns`) and `vec-region-glsl.js`:

1. **One interval a vessel a cell.** `classify` gathers a vessel's segments within reach of the cell, then keeps only their first and last
   (`vI0`, `vI1`). Two separate pieces of one vessel in a cell become one interval with every segment between them.
2. **Joins widen it further.** A join's member run (`joinRuns`: every segment within the join's reach) is merged into the same interval.
3. **The reach is the widest of everything.** Each vessel's reach is its radius × `REACH_HEADROOM` plus casing, shadow offset, glow at 1.3 and
   the edge (`padReach`), for every vessel, glowing or not. Neighbours whose lumens never meet still make a region.
4. **The shader evaluates first and asks later.** The region fragment loops over all `MAX_MEMBERS` (48) members and runs `vecNear` over each
   member's whole interval before it knows whether the member matters, then keeps the nearest `SLOTS` (8).
5. **Overflow drops anatomy silently.** Over `MAX_MEMBERS`, the compiler keeps joined members and the nearest; over `MAX_JOINS`, the nearest
   joins (`keepNearestJoins`). The shader's `SLOTS` = 8 per pixel drops the rest.
6. **Cell percentages are not workload.** The 98% counts occupied cells, not visible pixels, lumen overlap or GPU time.

## 2. The new structure

### 2.1 Short segment runs (fixed per vessel)

Each vessel row's 63 segments are cut into runs of `RUN_SEGS` = 4 consecutive segments: run `k` of row `r` holds segments `4k … 4k + 3`
(16 runs a row, the last one shorter). A run is the unit everything refers to. Two separate pieces of a vessel in one leaf are two runs.
A run is never widened to cover what lies between two runs.

### 2.2 Bounds per contribution (conservative, per run)

Each run keeps one bound per contribution, as a capsule around the run's chord (the segment from its first point to its last), whose
radius already includes the run's sagitta (how far its points stray from the chord):

| Contribution | Bound (capsule radius past the sagitta) | Listed for |
|---|---|---|
| Lumen and casing (`C_LUMEN`) | the run's largest radius × `BOUND_HEADROOM` + casing + antialiased edge | every run |
| Shadow (`C_SHADOW`) | the lumen bound + shadow blur (a selected vessel's blur when selected), around the chord moved by `shOff` | vessels with `F_SHADOW` |
| Glow (`C_GLOW`) | the lumen bound + the glow's width now (its active reach, never the widest possible) | glowing vessels only |
| Ring (`C_RING`) | the lumen bound + the selection ring | the selected vessel only |
| Junction (`C_JOIN`) | a member run's lumen bound + `G_JOIN` × the join's blend width, and its shadow bound + `G_JOIN_SH` × the blend width, inside the join's disc (section 2.2.1). Not the whole disc, and not every member run the disc reaches | a join's members |
| Morph (`K_MORPH` leaves) | the run's box over every frame of the morph stretch, plus the radii above | a morph set's runs |

#### 2.2.1 The junction bound (revision 1.1, 9 Nov 17:50)

The first build listed a join in every leaf its disc reached, with every member run the disc reached. On the lobule at 9407607 that made
97% of the screen `L_JOIN` (294k of 300k pixels at 1440×900, Lymph on; blood-only 94%, lobule-tissue 94%): 250 join discs of median reach
16.3 world units cover the sinusoids (median radius 1.9), and each join leaf listed 6 runs or more. No leaf was over 32 candidates (13 at
the central vein), so the cause is the bound, not the slots. Measured on the same lobule (`binAway` capture, 0.5-unit grid): 68.7% of the
vessel area lies in some join disc, but only 41.2% has two members of one join within the reach below, and 47.5% with their shadows.

Classic's own join code says where a join can change a pixel (`veins-gl.js`, the junction block and the tier loop):

- **The fillet** `smin(sd[a], sd[b], kk)` differs from `min` only where `|sd[a] − sd[b]| < kk`, and pulls the edge in by at most `kk / 4`.
  So it can change a pixel only where both members lie within their lumen-and-casing reach + 1.25 `kk`. `kk ≤ jk = k × (1 − smoothstep(0.55 R,
  R, dc))`, with `k = floor(A.w) × 0.01` and `R = A.z`.
- **The attribute blend across the join** (colour, caliber, wall, alpha) weights a joined member by `exp(−(sd − m) / (0.3 jk))`, which is
  under half an 8-bit level (1/510) past `0.3 × ln 510 ≈ 1.87` `jk` beyond the nearest member, itself within `jk / 4` of a drawn edge.
- **The crossing and knock-out rules** treat joined members as one shape only where a member's lumen, casing or ring covers the pixel.
- **Cross-tier copies** (`keep`, `pres`) apply wherever the lower-tier member draws inside `0.85 R`, whatever the upper member's distance,
  but only when the upper member is a candidate there.

So, per join `j`, with `jk(leaf)` taken at the leaf's point nearest the join's centre (the fade only falls with distance, so this is
conservative):

1. **Grown bounds.** A member run's join bound is its `C_LUMEN` capsule + `G_JOIN × jk(leaf)` and, for `F_SHADOW` vessels, its `C_SHADOW`
   capsule + `G_JOIN_SH × jk(leaf)`. `G_JOIN = 2.2` (0.25 + 1.87, rounded up), `G_JOIN_SH = 1.25`. Both are contract constants (A).
2. **A join is listed in a leaf** only when the leaf reaches the disc (`R × BOUND_HEADROOM`) and **two different member vessels** have a grown
   bound reaching the leaf: classic's own "at least two members present" (`c < 2: continue`), decided at leaf level. Refinement makes this
   converge on where the two bounds actually meet.
3. **Required runs** are only the member runs whose grown bound reaches the leaf, never every run the disc reaches. They carry `C_JOIN`
   (with whatever other bits they reach the leaf with).
4. **Cross-tier joins** (`K_CROSSTIER`) are also listed where the leaf reaches `0.85 R` (× headroom) and a lower-tier member's bound (any
   contribution) reaches the leaf. There the upper member is required as a presence candidate: its one run nearest the join's centre,
   `C_JOIN` only, so the copy rules see it exactly as classic does. A presence-only run adds no shading of its own beyond what classic's
   tier loop does with it.
5. **Inside the shader** a listed join still passes classic's per-pixel tests unchanged (`dc ≤ R`, two of its members among the pixel's
   candidates): the leaf test only decides where the join is worth listing. A pixel outside every grown bound sees no difference within
   `TOLERANCE_8BIT`. A node test (A) replays classic's fillet and attribute blend densely around every join of every preset and the
   lobule and checks that each point they change lies inside two members' grown bounds.
6. **The class follows the work.** A leaf is `L_JOIN` only when a join passes step 2 or 4 there. A leaf whose join was dropped by step 2 is
   classed by what remains (`L_SINGLE`, `L_LAYERED` or `L_CROSS`).

The lobule's join discs then stop covering the tissue between vessels: the measured upper bound for junction pixels is the 47.5% of the
vessel area above, before refinement narrows it further toward the pixels where two members' bounds meet.

A material change invalidates the bounds it moves: glow on, off or wider (tube texels 10 and 11), selection on or off (texel 12), a casing
change, a radius past its bound (`setRadii`). Only that row's runs are rebuilt, and only the leaves those runs reach are rebuilt. A colour
or pressure change moves no bound.

`BOUND_HEADROOM` (default 1.1) is a measured choice: a lower one makes tighter leaves and more rebuilds during width easings. The workload
benchmark (section 4) picks it.

### 2.3 The adaptive hierarchy

- **The broad index stays:** `binVeins`' 16-unit cells, one texel a cell. A cell texel is now empty, a **leaf**, or a **node**.
- **Nodes split in four** (a quadtree inside the cell) down to `MAX_DEPTH` = 6 levels (a leaf of 0.25 world units at the finest).
- **A leaf holds:** references to the short runs that reach it, each with the contribution bits it reaches the leaf with; references to the
  junction records needed there; the largest number of candidates any of its pixels can have; and its **class**, which says what shader
  work it needs:

| Class | Holds | Drawn by |
|---|---|---|
| `L_SINGLE` | runs of one vessel only (one or several runs: a hairpin of one vessel is still one vessel) | that vessel's strip (B) |
| `L_LAYERED` | several vessels whose lumens cannot meet and no join: only soft contributions (shadow, glow, ring) overlap | C, cheap compose in tier order; one tier's shadows as one union (the `min` of their distances, as classic's `Ds`), never stacked |
| `L_CROSS` | lumens or casings that can overlap, not connected here | C, depth, casing, ring, front stream |
| `L_JOIN` | a connected junction (cross-tier included, `K_CROSSTIER` bit) | C, complete junction resolve |
| `L_WIDE` | any of the above whose candidates still exceed `SLOTS` at the finest level | C's wide program, `SLOTS_WIDE` |
| `L_MORPH` | a morph set's leaf whose membership changes over the stretch | C |

- **Refinement policy:** split a leaf when its four children's estimated shader work is materially lower than its own:
  `cost(leaf) = area × (LEAF_OVERHEAD + bound tests + segment tests + junction work per pixel)`, estimated from the runs and joins that
  survive the bounds at sample points in the leaf. A join counts as junction work at a sample point only where it passes the test of
  section 2.2.1 there (the disc, and two members' grown bounds), never merely where its disc covers the point. Split when `Σ cost(children) < cost(leaf) × (1 − REFINE_GAIN)`. The projected footprint
  enters through `LEAF_OVERHEAD`, the fixed cost of a leaf's quad in pixels at the fit view, and a floor: no leaf smaller than
  `LEAF_MIN_PX` device pixels at the fit view, unless it is still over `SLOTS`. Because area scales the same for a parent and its children,
  the decision does not change with the zoom, so the hierarchy never needs rebuilding on a pinch. A deep zoom only makes each leaf cover
  more pixels. The constants are defaults until the benchmark (section 4) sets them on the real anatomy. No universal cell size is chosen.
- **Retained on the GPU.** Built on the CPU when the geometry, the bounds or a material that moves a bound changes, uploaded in part, and
  never on a camera change. A pinch selects and transforms prepared data.
- **Exclusive ownership, kept.** Every program finds a pixel's leaf the same way: `world = inv × gl_FragCoord.xy`, the cell by
  `floor((world − gridO) / CELL)`, then at each node the child by comparing `world` with the node's centre (the centre computed by exact
  halving from the cell's corner), down to a leaf. The JS mirror `leafAt(world)` does the same arithmetic in the same order, and a node
  test compares them. A strip draws only where the leaf is `L_SINGLE` of its own row; a leaf quad covers exactly its leaf's square (padded
  by `REGION_QUAD_PAD_PX`, the formula still deciding).

### 2.4 The fragment, in the reviewer's order

1. **Reject the leaf:** empty leaves have no quad and no strip pixel draws there.
2. **Reject runs:** for each run in the leaf, test the pixel against the bound of each contribution its bits list (a point-to-capsule
   distance squared against a radius squared). A run that survives no bound is skipped.
3. **Distances for survivors only:** `vecNear` over the surviving runs' segments (4 each), the several runs of one vessel merged into its
   nearest point.
4. **Junctions and depth:** only the joins listed in the leaf (section 2.2.1), each still tested per pixel as classic does (disc, two
   members among the candidates), with their required runs; tiers and z as before.
5. **Shade:** each candidate only for the contributions it survived (a vessel that survives only by its glow adds only its glow), composed in
   classic's order, so the final picture is unchanged. Then the blood.

**No silent drops.** The compiler records each leaf's largest candidate count (the most vessels whose bounds cover any one point of it).
It subdivides until that count is at most `SLOTS` (8). A leaf still over `SLOTS` at the finest level is a genuine multiway junction or a
genuine pile of vessels: it becomes `L_WIDE`, drawn by a program with `SLOTS_WIDE` (32) slots that keeps every candidate. Over
`SLOTS_WIDE` is a stop point (the compiler reports it and keeps everything; nothing is truncated). Lists have no capacity limit: runs and
joins are referenced by start and count into list textures, and the shader loops to the count. A shortlist is used only when the bounds
prove the excluded runs cannot change the pixel by more than `TOLERANCE_8BIT` (half an 8-bit level).

### 2.5 Contract v2 (A writes it into `vec-contract.js` first, additively; the old names stay until E's switch-over)

| Name | Value | Meaning |
|---|---|---|
| `RUN_SEGS` | 4 | segments a run |
| `RUNS_PER_ROW` | 16 | runs a vessel row (63 segments) |
| `RUN_TEXELS` | 4 | run texture texels a run, RGBA32F, texel `(k · 4 + t, row)`: t0 chord `a.xy, b.xy`; t1 bound radii `rL, rS, rG, rR`; t2 `i0, i1, flags, 0`; t3 morph box `x0, y0, x1, y1` |
| `C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN` | 1, 2, 4, 8, 16 | contribution bits |
| `CELL_LEAF, CELL_NODE` | 3, 4 | cell texel kinds beside `CELL_EMPTY` (cell texel: R kind, G leaf or node index) |
| `NODE_TEX` | RGBA32UI, `NODE_W` = 1024 a row | four children a node, child `q = 2 · (y ≥ centre) + (x ≥ centre)`, each `kind << 30 \| index` (kind 0 empty, 1 leaf, 2 node) |
| `MAX_DEPTH` | 6 | levels under a cell |
| `LEAF_TEXELS` | 2 | RGBA32UI: t0 `class, runStart, runCount, joinStart`; t1 `joinCount, candMax, depth, owner row (L_SINGLE) or 0xffffffff` |
| `LEAF_BOX` | RGBA32F, one texel a leaf | `x0, y0, size, class` (the leaf quad's square) |
| `RUNREF_TEX` | R32UI, `LIST_W` = 4096 a row | `runId \| bits << 24`, runId = row · 16 + k |
| `JOINREF_TEX` | R32UI, `LIST_W` a row | join index |
| `JOIN_TEXELS` | 3 | RGBA32F: t0 `x, y, k, reach`; t1 member rows (−1 none); t2 `trunk member (−1), fork 0/1, fillet, 0` |
| `L_SINGLE … L_MORPH` | 1 … 6 | leaf classes (section 2.3), `K_CROSSTIER` kept as a bit on the class word (bit 8) |
| `SLOTS`, `SLOTS_WIDE` | 8, 32 | candidates a pixel, standard and wide programs |
| `BOUND_HEADROOM` | 1.1 (default, set by the benchmark) | radius headroom in the lumen bound |
| `LEAF_MIN_PX`, `LEAF_OVERHEAD`, `REFINE_GAIN` | 8, 64, 0.2 (defaults, set by the benchmark) | refinement policy |
| `TOLERANCE_8BIT` | 0.5 / 255 | the rendering tolerance a shortlist must prove |
| `G_JOIN`, `G_JOIN_SH` | 2.2, 1.25 | a join's grown bound: × its faded blend width past a member's lumen and shadow bounds (section 2.2.1) |

`MAX_MEMBERS`, `MAX_JOINS`, `WIN_MAX`, `REGION_TEXELS`, `JOIN0`, `MASK_SPLIT` and the `CELL_SIMPLE` / `CELL_REGION` path go when E switches
over (they were the fixed classification's).

## 3. Visibility first (E, already in progress: not blocked by anything here)

The reviewer's step 1. E confirms that strips and regions both render: the cell lookup (the same matrix and floor the compiler's
`cellOfPixel` uses, the y flip, the device pixel ratio), the instance counts (strip instances = rows drawn, region instances = region
cells, both non-zero on the slice's preset), the coordinates (the strip's `world` matrix, the quad's square, `gridO` / `gridN` against the
compiler's), the depth and blend state and the cell and region textures' formats and sizes. Node checks with the tap GL
(`tests/vec-tap-gl.js`). E's fix lands on the current structure. The hierarchy then replaces the structure under it.

## 4. Measuring the workload (new workstream L)

Cell percentages are not reported any more. The reported numbers are:

| Number | How |
|---|---|
| Projected pixels by leaf class (and by strip) | node: the leaves' squares under the benchmark camera at the device's size |
| Bound tests, segment tests, surviving candidates (mean, p95, max) and active joins, per pixel | node: the fragment's culling replayed in JS at every pixel centre of a sample grid (every 4th pixel), from the uploaded tables |
| GPU time by component: strips, each leaf class, organs, overlays, blood pass, present and glass | in the app: `EXT_disjoint_timer_query_webgl2` around each component in `?perf` mode only (the queries may split the pass there, which `?perf` says), read asynchronously, dropped when `GPU_DISJOINT_EXT` is set |
| Whole-frame time and pacing | in the app: the `?perf` panel's own |

**Named benchmarks** (the same cameras in node and in the app's `?vecbench=<name>`, which runs the camera and puts a copyable report in
`?perf`; nobody is asked to run it):

| Name | Scene |
|---|---|
| `cv-junction` | the lobule's central vein: the dense multiway sinusoid junction, measured on its own |
| `lobule-tissue` | the lobule's ordinary sinusoid field, away from the central vein and the triads |
| `anat-fit` | the anatomy, `preset=cirr-decomp`, fit view |
| `anat-deep` | the anatomy at the deepest zoom over the portal confluence |
| `pinch` | a pinch from fit to deepest over the confluence, 2 s (camera motion) |
| `blood-only` | the anatomy at rest, blood moving: the `V_BLOOD` frames |

Every benchmark reports old (the fixed classification at `ef44ef0`) beside new, and the policy constants (`BOUND_HEADROOM`,
`LEAF_MIN_PX`, `LEAF_OVERHEAD`, `REFINE_GAIN`) are swept in node on the real anatomy and lobule. The chosen values go into the contract
with the table that chose them.

## 5. Workstreams for this revision

The ten threads stay. Two new threads, **K** and **L**, take the new parts that no existing file holds. Each owns its files. Nothing here
blocks E's visibility fix.

| | Workstream (thread) | This revision's work | Owns (new files in **bold**) |
|---|---|---|---|
| A | Graph and compiler | contract v2 (first push); short runs and per-contribution bounds; invalidation by material; morph bounds; `vec-compile.js` becomes the adapter that feeds K | `vec-contract.js`, `vec-graph.js`, `vec-compile.js`, **`vec-runs.js`**, `tests/vec-compile*.test.js`, **`tests/vec-runs.test.js`** |
| K | Adaptive leaves (new) | the quadtree under the cells, the cost model and refinement, classes, explicit overflow, the GPU tables, the shared GLSL lookup and its JS mirror | **`vec-leaves.js`**, **`vec-leaves-pack.js`**, **`vec-hier-glsl.js`**, **`tests/vec-leaves.test.js`** |
| B | Stretch shader | the leaf lookup (K's GLSL) in place of the cell test; the loop over the leaf's own runs with bound tests | `vec-shade-glsl.js`, `vec-stretch-glsl.js`, `tests/vec-stretch.test.js` |
| C | Region shader | one program per class (`L_LAYERED`, `L_CROSS`, `L_JOIN`, `L_WIDE`, `L_MORPH`), the reviewer's five steps, contributions shaded only where they survived, no `SLOTS` drop | `vec-region-glsl.js`, `tests/vec-region.test.js` |
| D | Blood | `vecBloodMix` over a variable count up to `SLOTS_WIDE`; nothing else changes | `vec-blood-glsl.js`, `vec-blood-math.js`, `tests/vec-blood.test.js` |
| E | Renderer core | **first, visibility (section 3)**; then K's tables uploaded in part, one instanced draw per class program, the strips' leaf test, material invalidations to A, the switch-over push, L's timer hooks around each component | `vec-renderer.js`, `vec-frame.js`, `vec-targets.js`, their tests |
| L | Workload and benchmarks (new) | section 4: the node replay and sweep, the named benchmarks, the app's `?vecbench` and per-component timers (E calls its hooks) | **`vec-measure.js`**, **`vec-bench.js`**, **`scripts/vec-workload.mjs`**, **`tests/vec-measure.test.js`** |
| I | Lobule | the lobule's benchmark scenes (`cv-junction`, `lobule-tissue`: camera, state, slide) for L; the lobule compiled by A and K checked (classes, `L_WIDE` count, central vein named) | `vec-lobule.js`, `tests/vec-lobule.test.js` (A keeps `tests/vec-compile-lobule.test.js`; I asks A for changes there) |
| J | Acceptance and docs | the acceptance status set to "not passed" with the reason; the node files renamed to preconditions; `docs/vector-renderer.md` for the hierarchy; the trace on the new structure | `tests/vec-accept-*.test.js`, `docs/vector-renderer.md`, `scripts/stage-trace.mjs` flag, `CHANGELOG.md` |
| F, G, H | Organs, overlays, seam | no change of plan; F and G keep their bounded soft effects; H passes the material changes that move bounds (glow, selection, casing) through the seam if E asks | as before |

**Order inside the round** (all start now; the arrows are handoffs, not waits):
- A's contract v2 push first (an hour's work), so K, B, C, L code against the real names. Until then they code against section 2.5.
- K builds on A's run interface (`runsOf(row)`, `boundsOf(run, contribution)`: A publishes the signatures in its first push).
- B and C build against K's `vec-hier-glsl.js` (`vecLeafAt`, `vecRunAt`, `vecBoundHit`: K publishes the signatures first).
- L measures the current structure first (the "old" column), then K's as it lands.
- E switches over in one push when A, K, B and C have landed and E's visibility fix is in. Until then the current structure keeps drawing.

## 6. Stop points added by this revision

1. A leaf with more than `SLOTS_WIDE` (32) candidates (K): reported with its place; nothing truncated.
2. A false proximity that subdivision to `MAX_DEPTH` cannot separate (K): reported with the vessels.
3. Any need for sinusoid merging, a distance field, a nearest-k cutoff or a fixed new cell size (anyone): not in this round.
4. A benchmark where the new structure does more work than the old (L): reported with the numbers before anything else is changed.

## 7. Acceptance

Unchanged as the target (plan section 11), with its status stated honestly: **not passed.** The node checks are preconditions. The
six criteria are judged when the vessels draw, on Mohammad's devices, when he likes.
