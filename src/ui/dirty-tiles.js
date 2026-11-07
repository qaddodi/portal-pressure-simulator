// Where the figure's blood frames drew, as coarse tiles (render-cost plan 3a, 5 Nov 2026): "recalculate glass blur only when the pixels
// beneath that glass change". The figure kept one rectangle per blood frame, the union of every square the blood drew. Vessels cross the
// whole screen, so that one box nearly always reached the top bar, the dock and every card, and the glass blurred all of them again for
// blood that moved far away. Here each frame keeps a bit per tile (at most 64 x 64 tiles over the canvas), and a range of frames is handed
// to the glass as a short list of rectangles: the tiles any of them touched, joined along rows and then down columns. The glass grows
// them by its blur's reach itself, so a part of a glass is blurred again only when blood moved within that reach of it.
//
// Nothing here is allocated per frame: the masks are a ring of typed arrays made once, and the rectangles are written into a kept pool.

const COLS = 64, ROWS = 64, WORDS = (COLS / 32) * ROWS;
/** The most rectangles a range is handed back as; a range that needs more is handed back as its bounding box (one rectangle). */
export const MAX_RECTS = 24;

/** A ring of `n` frames' tile masks. */
export function createDirtyTiles(n = 16) {
  const seqs = new Float64Array(n).fill(-1), known = new Uint8Array(n);   // alloc-rare: made once, with the renderer
  const tile = new Float64Array(n), cols = new Uint8Array(n), rows = new Uint8Array(n), Ws = new Float64Array(n), Hs = new Float64Array(n);   // alloc-rare: made once, with the renderer
  const masks = new Uint32Array(n * WORDS), acc = new Uint32Array(WORDS);   // alloc-rare: made once, with the renderer
  const bounds = new Float64Array(n * 4);   // alloc-rare: made once, with the renderer
  const runs = new Int16Array(COLS * ROWS * 4);   // (x0, x1, y0, y1 in tiles, per run)   // alloc-rare: made once, with the renderer
  let cur = -1;
  return {   // alloc-rare: made once, with the renderer
    /** Starts frame `seq` on a W x H (device px) canvas, with nothing marked yet. */
    begin(seq, W, H) {
      const i = seq % n;
      seqs[i] = seq; known[i] = W > 0 && H > 0 ? 1 : 0; cur = i;
      const t = Math.max(32, Math.ceil(W / COLS), Math.ceil(H / ROWS));
      tile[i] = t; cols[i] = Math.min(COLS, Math.ceil(W / t)); rows[i] = Math.min(ROWS, Math.ceil(H / t)); Ws[i] = W; Hs[i] = H;
      masks.fill(0, i * WORDS, (i + 1) * WORDS);
      const b = i * 4; bounds[b] = Infinity; bounds[b + 1] = Infinity; bounds[b + 2] = -Infinity; bounds[b + 3] = -Infinity;
    },
    /** Frame `seq` is not known (drawn whole, under a camera, or with no list of its squares): a range across it blurs everything. */
    unknown(seq) { const i = seq % n; seqs[i] = seq; known[i] = 0; if (cur === i) cur = -1; },
    /** Marks the device-px box x0..x1, y0..y1 in the frame begun last. */
    add(x0, y0, x1, y1) {
      if (cur < 0 || !known[cur]) return;
      const i = cur, W = Ws[i], H = Hs[i];
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
      if (!(x1 > x0 && y1 > y0)) return;
      const b = i * 4;
      if (x0 < bounds[b]) bounds[b] = x0; if (y0 < bounds[b + 1]) bounds[b + 1] = y0; if (x1 > bounds[b + 2]) bounds[b + 2] = x1; if (y1 > bounds[b + 3]) bounds[b + 3] = y1;
      const t = tile[i], c = cols[i], r = rows[i];
      const c0 = Math.floor(x0 / t), c1 = Math.min(c - 1, Math.floor((x1 - 1e-6) / t));
      const r0 = Math.floor(y0 / t), r1 = Math.min(r - 1, Math.floor((y1 - 1e-6) / t));
      const base = i * WORDS;
      for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) masks[base + y * 2 + (x >> 5)] |= 1 << (x & 31);
    },
    /** The bounding box of frame `seq`'s marks into out [x0, y0, x1, y1] (x0 > x1 when nothing was marked); false when not known. */
    boundsOf(seq, out) {
      const i = seq % n;
      if (seqs[i] !== seq || !known[i]) return false;
      const b = i * 4;
      out[0] = bounds[b]; out[1] = bounds[b + 1]; out[2] = bounds[b + 2]; out[3] = bounds[b + 3];
      return true;
    },
    /**
     * Where the frames after `from` up to `to` drew, as boxes { x, y, w, h } in device px written into `out` (from `pool`, kept), at most
     * MAX_RECTS of them. Returns their count (0: nowhere), or -1 when that is not known: a frame of the range left the ring, was not known,
     * or was on a canvas of another size.
     */
    rects(from, to, out, pool) {
      out.length = 0;
      if (!(to > from) || to - from > n) return -1;
      let t = 0, c = 0, r = 0, W = 0, H = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      acc.fill(0);
      for (let s = from + 1; s <= to; s++) {
        const i = s % n;
        if (seqs[i] !== s || !known[i]) return -1;
        if (s === from + 1) { t = tile[i]; c = cols[i]; r = rows[i]; W = Ws[i]; H = Hs[i]; }
        else if (Ws[i] !== W || Hs[i] !== H) return -1;
        const base = i * WORDS;
        for (let k = 0; k < WORDS; k++) acc[k] |= masks[base + k];
        const b = i * 4;
        if (bounds[b + 2] > bounds[b]) { bx0 = Math.min(bx0, bounds[b]); by0 = Math.min(by0, bounds[b + 1]); bx1 = Math.max(bx1, bounds[b + 2]); by1 = Math.max(by1, bounds[b + 3]); }
      }
      if (!(bx1 > bx0)) return 0;
      // (Runs of marked tiles along each row; a run with the same columns as one ending on the row above extends it down.)
      let nr = 0;
      for (let y = 0; y < r; y++) {
        const rowStart = nr;
        for (let x = 0; x < c;) {
          if (!(acc[y * 2 + (x >> 5)] & (1 << (x & 31)))) { x++; continue; }
          let e = x + 1;
          while (e < c && (acc[y * 2 + (e >> 5)] & (1 << (e & 31)))) e++;
          let joined = false;
          for (let q = 0; q < rowStart; q++) {
            if (runs[q * 4 + 3] === y && runs[q * 4] === x && runs[q * 4 + 1] === e) { runs[q * 4 + 3] = y + 1; joined = true; break; }
          }
          if (!joined) {
            if (nr >= MAX_RECTS * 4) { put(out, pool, 0, bx0, by0, bx1 - bx0, by1 - by0); return 1; }   // (scattered everywhere: the bounding box)
            runs[nr * 4] = x; runs[nr * 4 + 1] = e; runs[nr * 4 + 2] = y; runs[nr * 4 + 3] = y + 1; nr++;
          }
          x = e;
        }
      }
      let m = 0;
      if (nr > MAX_RECTS) {
        put(out, pool, m++, bx0, by0, bx1 - bx0, by1 - by0);
        return m;
      }
      for (let q = 0; q < nr; q++) {
        const x0 = runs[q * 4] * t, x1 = Math.min(W, runs[q * 4 + 1] * t), y0 = runs[q * 4 + 2] * t, y1 = Math.min(H, runs[q * 4 + 3] * t);
        // (Tiles are coarser than the marks: each rectangle is cut to the marks' own bounds, so nothing outside where the blood drew is handed over.)
        const cx0 = Math.max(x0, bx0), cy0 = Math.max(y0, by0), cx1 = Math.min(x1, bx1), cy1 = Math.min(y1, by1);
        if (cx1 > cx0 && cy1 > cy0) put(out, pool, m++, cx0, cy0, cx1 - cx0, cy1 - cy0);
      }
      return m;
    },
  };
}
function put(out, pool, i, x, y, w, h) {
  const o = pool[i] || (pool[i] = { x: 0, y: 0, w: 0, h: 0 });   // alloc-rare: the pool grows to the most rectangles a range has had (MAX_RECTS)
  o.x = x; o.y = y; o.w = w; o.h = h;
  out[i] = o;
}
