// The streak noise's lattice, looked up instead of hashed (veins-gl.js COMP_FS, vnoiseT; review/blood-shading-ideas item 1).
// The composite's shimmer interpolates value noise over a lattice whose corner values are a hash of the vessel's seed and the
// corner (hsh, h01 in the shader): four hashes and about twelve integer multiplies for every noise read, three to eight reads
// a lumen pixel. Each vessel's lattice is bounded (the noise wraps along the vessel every 50 or 100 cells, and across it the
// coordinate stays within about ±8), so its corners are worked out here once, bit for bit as the shader hashes them, and the
// shader reads a cell's four corners in one texel. A corner outside the table (none in the app's range) is hashed as before.
//
// Layout: one block of NOISE_W × NOISE_H RGBA32F texels per vessel row, NOISE_PER_ROW blocks side by side. In a block, the
// coarse octave (seed id·31, period 50) at x 0–49 and y 0–15 for lattice rows −8 … 7; the fine octave (seed id·57 + 11, period
// 100) at x 50–149 and y 0–27 for lattice rows −7 … 20. Texel (x0, cy) holds the corners (x0, y0), (x1, y0), (x0, y1), (x1, y1)
// of its cell, x1 = x0 + 1 wrapped, y0 = the lattice row + 4096 (as the shader offsets it), y1 = y0 + 1.

export const NOISE_W = 150, NOISE_H = 28, NOISE_PER_ROW = 13;
// Each octave: [seed multiplier, seed offset, period, first x in the block, lattice row of block row 0 (negated: yo), rows].
export const OCTAVES = [
  { mul: 31, add: 0, period: 50, x: 0, yo: 8, rows: 16 },
  { mul: 57, add: 11, period: 100, x: 50, yo: 7, rows: 28 },
];

// The shader's hash (hsh) and its 24-bit unit value (h01), on 32-bit unsigned integers.
export function hsh(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}
export const h01 = (x) => (hsh(x >>> 0) & 0xffffff) / 16777216;
// One lattice corner as vnoise hashes it: seed ^ (x · 73856093) ^ (y · 19349663), every product wrapping at 32 bits.
export const corner = (seed, x, y) => h01((seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0);
export const seedOf = (id, o) => (Math.imul(id, o.mul) + o.add) >>> 0;

/** Where vessel row `id`'s block starts in the table: [x, y] texels. */
export const blockAt = (id) => [(id % NOISE_PER_ROW) * NOISE_W, Math.floor(id / NOISE_PER_ROW) * NOISE_H];
/** The table's size for `rows` vessel rows: [width, height] texels. */
export const tableSize = (rows) => [NOISE_PER_ROW * NOISE_W, Math.max(1, Math.ceil(rows / NOISE_PER_ROW)) * NOISE_H];

/**
 * Vessel row `id`'s block: NOISE_W × NOISE_H texels of four floats, row by row (the texels no octave uses stay 0). Each corner's
 * value is a 24-bit integer over 2^24, exact in a 32-bit float, so the table holds what the shader's hash gives, to the bit.
 */
export function noiseBlock(id, out = new Float32Array(NOISE_W * NOISE_H * 4)) {
  out.fill(0);
  for (const o of OCTAVES) {
    const seed = seedOf(id, o), P = o.period;
    // (Each corner hashed once: the period's columns by the rows of the octave and one more.)
    const lat = new Float64Array(P * (o.rows + 1));
    for (let r = 0; r <= o.rows; r++) {
      const y = r - o.yo + 4096;
      for (let x = 0; x < P; x++) lat[r * P + x] = corner(seed, x, y);
    }
    for (let cy = 0; cy < o.rows; cy++) {
      for (let x0 = 0; x0 < P; x0++) {
        const x1 = (x0 + 1) % P, q = (cy * NOISE_W + o.x + x0) * 4;
        out[q] = lat[cy * P + x0]; out[q + 1] = lat[cy * P + x1];
        out[q + 2] = lat[(cy + 1) * P + x0]; out[q + 3] = lat[(cy + 1) * P + x1];
      }
    }
  }
  return out;
}
