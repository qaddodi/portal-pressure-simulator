// The figure's one edge softness (combined plan V3 b, 31 Oct): how many device pixels an edge takes to go from covered to clear. The
// vessels' signed-distance edge (veins-gl.js: the lumen and the casing) and the organ painter's GPU shapes (shape-gl.js: its fills and
// strokes, by exact pixel coverage) are both drawn with it, so where a vessel meets an organ the two edges are the same width. One
// device pixel, the width the browser's own anti-aliasing gives (and what each drew before it was shared: the same pixels).
export const EDGE_PX = 1;
/** As a GLSL float literal, for the shaders that take it. */
export const EDGE_GLSL = EDGE_PX.toFixed(4);
