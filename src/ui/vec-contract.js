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
export const REGION_TEXELS = 64;
export const MASK_SPLIT = 24;           // member-mask bits in B.x (a float32 holds 24 whole bits); the rest are in B.z
export const MAX_MEMBERS = 48;          // listed per region (the lobule's centre holds 25 with its Lymph layer, the morph sets' cells up to 44: Mohammad, 9 Nov); the shader keeps the nearest SLOTS per pixel, as classic keeps MAXS = 8
if (MAX_MEMBERS > 2 * MASK_SPLIT) throw new Error('vec-contract: MAX_MEMBERS needs more mask bits');
export const SLOTS = 8;
export const MAX_JOINS = 6;             // as veins-mesh-data PG_J
export const JOIN0 = 1 + MAX_MEMBERS;   // texel of the first join (49); joins end at JOIN0 + 2 · MAX_JOINS = 61; 61 … 63 spare
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
