// The vector vessel renderer's shared contract (docs/recommendations/vector-renderer-plan.md, 9 Nov 2026): the numbers and layouts
// that the workstreams building it (compiler, stretch shader, region shader, blood, renderer core, organs, overlays, settings seam,
// lobule, acceptance) all read, so each can build against them at the same time. Constants only: nothing here draws, and nothing
// imports this file until the renderer core does.
//
// Owner: workstream A (the compiler). Another workstream that needs a change asks A's thread; A changes this file and says so in its
// push. A number here never changes silently: every reader's unit test imports it from here, never a copy.
//
// The renderer in one line: the anatomy compiled once into a sparse world grid of cells (veins-bin's CELL squares), each cell either
// empty, owned by ONE vessel's ordinary stretch, or an interaction region (a join, a crossing, a hairpin, a close approach) that lists
// its members. Ordinary stretches are retained strips (veins-mesh.js geometry) whose fragments draw only inside cells their vessel owns;
// regions are cell quads whose fragments resolve their members together. The two partition the picture exactly (the cell test below),
// so no vessel's contribution reaches one pixel twice. Blood is shaded in the same fragments, from the vessel's own coordinates.

/** The vessel renderers, as Settings › Display offers them (frame.js keeps the choice; workstream H). */
export const RENDERERS = Object.freeze(['classic', 'mesh', 'vector']);
/** The stored choice's key (localStorage); the old boolean key pps.vesselMesh is read once to migrate ('0' → classic). */
export const RENDERER_KEY = 'pps.vesselRenderer';

// ── The cell grid ──
// One texel per CELL × CELL world square (veins-bin.js CELL, 16 world units), the same squares binVeins makes, over the box of the
// binning's cells (veins-gl boxOfCells) grown by GRID_PAD cells. Texture: RGBA16UI, GRID_W × rows. A fragment finds its cell from its
// own pixel centre: world = inv × gl_FragCoord.xy (the same matrix and the same floor() in every program), cell = floor((world − gridO) /
// CELL). That one rule is what keeps strips and regions from both drawing a pixel: never a cell index interpolated from vertices.
export const GRID_PAD = 1;
/** Texels per row of the cell texture (cells across; the grid's own width is the uniform gridN.x, at most this). */
export const GRID_W = 256;
/** A cell texel: R = kind, G = vessel row (SIMPLE) or region index (REGION), B = first segment i0, A = last segment i1 (SIMPLE). */
export const CELL_EMPTY = 0, CELL_SIMPLE = 1, CELL_REGION = 2;
/** The most segments an ordinary stretch's fragment loops over in one cell (i1 − i0 + 1). A cell whose vessel needs more is a region. */
export const WIN_MAX = 64;   // (Mohammad, 9 Nov: 8 left about 80% of the occupied cells regions on the real anatomy, 64 about 61%; B windows its loop around the strip's own sample index)

// ── Interaction regions ──
// One region per REGION cell (a region may be one cell; neighbouring region cells each hold their own copy of the lists they need).
// Texture: RGBA32F, REGION_TEXELS texels a region, one region a texel row.
//   texel 0:                 kind bits (K_*), member count, join count, the region's largest reach (world)
//   texels 1 … MAX_MEMBERS:  a member: vessel row, first segment i0, last segment i1, member flags (M_*)
//   texels JOIN0 + 2j, +1:   join j: A = (x, y, blend width k, reach), B = (member mask bits 0 … MASK_SPLIT−1, trunk member index or −1 (+ FORK_BIT at a fork),
//                            member mask bits MASK_SPLIT … 2·MASK_SPLIT−1, fillet 0 … 1)
//     B.x and B.z are whole numbers (a float32 holds 24 bits): bit m of the mask, B.x for m < MASK_SPLIT and B.z (bit m − MASK_SPLIT) for m ≥ MASK_SPLIT, means the region's member m
//     (texel 1 + m) belongs to this join. B.y = trunk member index (−1 none) plus FORK_BIT when the join is a fork (the trunk runs on into the rest
//     of its course). B.w is the fillet fraction veins-bin writeJoin keeps in the fractional part of the entry's blend width
//     (ent[q+3] = round(k·100) + 0.99·fillet), so the shader has classic's own js: run-on at a fork is fork && fillet < 0.01, a run is fillet < 0.98.
//     k is that rounded value / 100, the world blend width.
//     (In a morph set's region the join's A.x is its index in the frame's join rows, A.y = 0: the shader reads the join as the frame has it.)
export const REGION_TEXELS = 128;
export const MASK_SPLIT = 24;           // member-mask bits in B.x (a float32 holds 24 whole bits); the rest are in B.z
export const MAX_MEMBERS = 48;          // listed per region (the lobule's centre holds 25 with its Lymph layer, the morph sets' cells up to 44: Mohammad, 9 Nov); the shader keeps the nearest SLOTS per pixel, as classic keeps MAXS = 8
if (MAX_MEMBERS > 2 * MASK_SPLIT) throw new Error('vec-contract: MAX_MEMBERS needs more mask bits');
export const SLOTS = 8;
export const MAX_JOINS = 16;            // listed per region, the nearest to the cell kept (the lobule's central vein takes 12 within a few cells: Mohammad, 9 Nov; veins-mesh-data PG_J is 6, classic's MAXJ per pixel)
export const JOIN0 = 1 + MAX_MEMBERS;   // texel of the first join (49); joins end at JOIN0 + 2 · MAX_JOINS = 81; 81 … 127 spare
export const FORK_BIT = 64;             // added to a join's trunk member index in B.y at a fork
/** Region kind bits (texel 0.x, as a whole number): which interactions the cell holds. */
export const K_JOIN = 1, K_CROSS = 2, K_HAIRPIN = 4, K_CROSSTIER = 8, K_NEAR = 16, K_LONG = 32, K_MORPH = 64;
/** Member flag bits (member texel .w): its lumen can reach the cell; it is a member of a join here; it is the trunk of a join here. */
export const M_LUMEN = 1, M_JOINED = 2, M_TRUNK = 4;

// ── Reach ── how far from a centreline a vessel can change a pixel: what the compiler tests cells against. It includes the lumen, the
// casing, the contact shadow (offset and blur), the glow, the selection ring and the hover, at REACH_HEADROOM times the radius now, so
// a width easing inside that headroom needs no new compile. A radius past its compiled reach recompiles that vessel's cells (A).
export const REACH_HEADROOM = 1.25;
// The pieces of a reach beyond the lumen, in world units, as the shader draws them (veins-mesh-glsl.js; veins-mesh.js padOf adds them up): the
// glow up to 1.3 times its usual 12 past the casing, the contact shadow's offset (the look's shOff, 1.4 and 2.8: 3.13) and blur (a selected
// vessel's, 2.4 · 1.4), the selection ring 4 past the casing, the antialiased edge. The hover only brightens the lumen: no reach of its own.
// The glow is the widest, and padOf adds the shadow offset to it, so one pad holds all of them; the ring and the blur lie inside it.
export const REACH_GLOW = 12 * 1.3, REACH_RING = 4, REACH_SHADOW_BLUR = 2.4 * 1.4, REACH_SHADOW_OFF = 3.2, REACH_AA = 1;
/** A region's quad is drawn this many device pixels wider all round than its cell's square, so a pixel whose cell (by the one formula above) is
 *  this region is always covered by its quad however the rasteriser rounds the quad's edge; the fragment still draws only when the formula agrees. */
export const REGION_QUAD_PAD_PX = 1;

// ── Passes ── (one program per kind × variant; the renderer core, workstream E)
/** FULL: everything, the blood included (camera, morph and deforming frames). BASE: everything but the blood and what lies over it
 *  (the kept still picture). BLOOD: lumen pixels only, the kept BASE read under the blood (frames where only the blood moved). */
export const V_FULL = 0, V_BASE = 1, V_BLOOD = 2;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT v2 (docs/recommendations/vector-renderer-plan-r1.md section 2.5; Mohammad's reviewer's second recommendation, 9 Nov 2026).
// Additive: the names above (the fixed classification's CELL_SIMPLE / CELL_REGION path, MAX_MEMBERS, MAX_JOINS, WIN_MAX, REGION_TEXELS, JOIN0,
// MASK_SPLIT) stay until E's switch-over and go in the push E switches in. Owner: A. Readers: K (leaves), B, C, D, E, I, L.
//
// The structure: the broad 16-unit cell index stays (GRID_*, one texel a cell, now empty, a leaf or a node); inside a cell a quadtree down to MAX_DEPTH
// levels of leaves. Every vessel row is cut once into short RUNS of RUN_SEGS segments; a run keeps a conservative capsule bound for each contribution
// (lumen and casing, shadow, glow, ring), and a leaf lists the runs whose bounds reach it, with the bits of the contributions each reaches with. A run is
// never widened over what lies between two runs. Nothing keeps "the nearest" of anything: a leaf over SLOTS candidates becomes L_WIDE (SLOTS_WIDE slots).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Runs ──
/** Segments a run (a row's 63 segments are cut into runs 4k … 4k + 3, the last run shorter), and runs a row. A run id is row · RUNS_PER_ROW + k. */
export const RUN_SEGS = 4, RUNS_PER_ROW = 16;
/**
 * The RUN texture: RGBA32F, texel (k · RUN_TEXELS + t, row), t = 0 … 3:
 *   t0  the chord: a.xy (the run's first point), b.xy (its last point)
 *   t1  the bound radii past the chord, sagitta included: rL (lumen and casing), rS (shadow, around the chord moved by shOff), rG (glow), rR (ring)
 *       (0 where the contribution does not apply: rS 0 without F_SHADOW, rG 0 unless the vessel glows now, rR 0 unless it is selected)
 *   t2  i0, i1 (the run's first and last segment), flags (R_* below), 0
 *   t3  the morph box x0, y0, x1, y1 over every frame of the stretch (a morph set's run; a figure's run holds its own box)
 */
export const RUN_TEXELS = 4;
export const R_ON = 1, R_SHADOW = 2, R_GLOW = 4, R_RING = 8;   // run flags (t2.z): the run draws; its vessel has a shadow, glows now, is selected
/** Contribution bits (a leaf's run reference carries the bits it reaches the leaf with; boundOf takes one). */
export const C_LUMEN = 1, C_SHADOW = 2, C_GLOW = 4, C_RING = 8, C_JOIN = 16;

// ── Leaves and the node tree ── (K builds them; the names are here so every reader has one source)
/** Cell texel kinds beside CELL_EMPTY: the cell is one leaf (G = leaf index) or a node (G = node index). */
export const CELL_LEAF = 3, CELL_NODE = 4;
/** NODE_TEX: RGBA32UI, NODE_W texels a row; four children a node, child q = 2 · (y ≥ centre) + (x ≥ centre), each `kind << 30 | index` (kind 0 empty, 1 leaf, 2 node). */
export const NODE_W = 1024, NODE_KIND_EMPTY = 0, NODE_KIND_LEAF = 1, NODE_KIND_NODE = 2;
export const MAX_DEPTH = 6;     // levels under a cell (a leaf of 0.25 world units at the finest)
/** LEAF_TEX: RGBA32UI, LEAF_TEXELS a leaf: t0 class (+ L_CROSSTIER_BIT), runStart, runCount, joinStart; t1 joinCount, candMax, depth, owner row (L_SINGLE) or 0xffffffff. */
export const LEAF_TEXELS = 2;
/** Leaves a row of LEAF_TEX (so the texture is LEAF_ROW × LEAF_TEXELS wide), and leaves (texels) a row of LEAF_BOX (K asked, 9 Nov). */
export const LEAF_ROW = 1024, BOX_W = 4096;
/** CELL_TEX texel (RGBA16UI): R kind, G the leaf or node index's low 16 bits, B its high 16 bits, A 0. A node's child word is kind << CELL_KIND_SHIFT | index (CELL_INDEX_MASK). */
export const CELL_KIND_SHIFT = 30, CELL_INDEX_MASK = 0x3fffffff;
/** LEAF_BOX: RGBA32F, one texel a leaf: x0, y0, size, class (the leaf quad's square). */
export const LEAF_BOX_TEXELS = 1;
/** RUNREF_TEX and JOINREF_TEX: R32UI, LIST_W texels a row; a run reference is `runId | bits << 24` (bits: C_*), a join reference is a join index. No capacity limit: leaves hold start and count. */
export const LIST_W = 4096;
export const RUNREF_BITS_SHIFT = 24, RUNREF_ID_MASK = 0xffffff;
/** Leaf classes (section 2.3); K_CROSSTIER is kept as a bit (L_CROSSTIER_BIT) on the class word. */
export const L_SINGLE = 1, L_LAYERED = 2, L_CROSS = 3, L_JOIN = 4, L_WIDE = 5, L_MORPH = 6, L_CROSSTIER_BIT = 256;
export const OWNER_NONE = 0xffffffff;

// ── Joins ──
/** The JOIN texture (a join record, one per join of the graph, not per cell): RGBA32F, JOIN_TEXELS texels: t0 x, y, k, reach; t1 member rows (−1 none); t2 trunk member row (−1), fork 0/1, fillet 0 … 1, 0. */
export const JOIN_TEXELS = 3;

// ── Candidates and the refinement policy ──
export const SLOTS_WIDE = 32;   // candidates a pixel in an L_WIDE leaf (SLOTS is the standard program's). Over SLOTS_WIDE is a stop point.
/** Defaults the workload benchmark (workstream L) sets on the real anatomy. */
export const BOUND_HEADROOM = 1.0;            // radius headroom in the lumen bound (a lower one: tighter leaves, more rebuilds during width easings)
/** A join's grown bound (plan r1.1, 2.2.1): a member run's lumen bound + G_JOIN × jk, its shadow bound + G_JOIN_SH × jk, jk = k × (1 − smoothstep(0.55 R, R, d)) at the leaf's point nearest the centre. */
export const G_JOIN = 2.2, G_JOIN_SH = 1.25;
export const LEAF_MIN_PX = 8, LEAF_OVERHEAD = 64, REFINE_GAIN = 0.05;
/** The rendering tolerance a shortlist must prove: half an 8-bit level. */
export const TOLERANCE_8BIT = 0.5 / 255;
