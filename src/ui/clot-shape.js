// The geometry of a drawn clot (pure, so it can be tested without the stage). A clot is a lumpy
// plug that lies against one wall of the vessel: it grows from that wall inwards as the occlusion
// rises, lengthens along the vessel, and at full occlusion spans the lumen with blunt ends.
// Every number is a smooth function of the occlusion v (0–1), so an eased change of v eases the
// clot. The lumps and the side come from the vessel's id, so a clot never shimmers or flips.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Small seeded random numbers (mulberry32), so a clot's speckles are the same on every redraw.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which wall the clot lies against (+1 or -1 along the vessel's normal).
export const clotSide = (seed) => (seed & 1 ? 1 : -1);

// The stretch of the vessel (0–1 along it) the clot covers.
export const clotSpan = (v) => ({ u0: 0.4 - 0.22 * v, u1: 0.6 + 0.22 * v });

// Half the clot's thickness at its thickest, for a vessel of width w. Full occlusion fills the lumen.
export const clotHalf = (v, w) => (w / 2) * clamp(0.1 + 0.9 * v, 0, 1);

// The clot's half-thickness at fraction f (0–1) along its own length: tapered tails that blunt
// toward full occlusion, with two gentle lumps. Never wider than the lumen.
export function clotRadius(v, w, f, seed) {
  const r = rng(seed ^ 0x9E3779B9);
  const p1 = r() * 6.283, p2 = r() * 6.283;
  const floor = 0.3 + 0.5 * v * v * v;
  const body = floor + (1 - floor) * Math.sqrt(Math.sin(Math.PI * clamp(f, 0, 1)));
  const lump = 1 + 0.08 * Math.sin(f * 18.85 + p1) + 0.05 * Math.sin(f * 43.98 + p2);
  return Math.min(w / 2, clotHalf(v, w) * body * lump);
}

// How far the clot's centreline sits off the vessel's, so its outer edge rests on the wall.
export const clotShift = (w, r, side) => side * (w / 2 - r);

// The clot's body: stacked fills of one translucent red, each a fraction k of the clot's radius,
// outermost first, so the colour builds toward the thick middle and fades out at the edges.
export const clotLayers = [
  { cls: 'thrombus-halo', k: 1 },
  { cls: 'thrombus', k: 0.82 },
  { cls: 'thrombus-core', k: 0.55 },
];
// Where the hairline sits, as a fraction of the radius: just inside the halo's free edge.
export const CLOT_EDGE = 0.97;
