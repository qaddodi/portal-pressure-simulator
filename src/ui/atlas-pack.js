// Where the label pictures sit in the GPU's atlas pages (label-gl.js): a shelf packer with a padded gutter round every picture,
// freed slots reused, and a hard cap on pages (so on memory). No DOM here, so tests can run it.
//
// A page is a square of `size` px. Pictures stand on shelves (rows); a shelf is as tall as the first picture put on it (rounded up to
// 8 px), and takes later pictures up to 1.5 times that high (+ 8) so a freed slot is found again. Each picture gets `pad` px of empty
// texels on every side: the shader reads exactly its own texels (texelFetch), so a neighbour can never show in a label, and the gutter
// keeps that true if a picture's size ever rounds the other way.

// Nothing here allocates once the packer is warm (it runs in the label layer's frames): the pages' shelves are made with the packer
// (a page holds at most size / 8 + 2 of them: a shelf is at least 8 px high), a shelf's free spans are two number lists (x, width) kept
// sorted, and the slots handed out are recycled objects: free() takes one back, alloc() hands the same object out again. So a slot is
// valid from alloc() to free() or reset() only; the owner drops its reference when it frees (it does: label-gl sets slot = null),
// and a freed slot (shelf null) is ignored by a second free().
const newSlot = () => ({ page: 0, x: 0, y: 0, w: 0, h: 0, pw: 0, ph: 0, shelf: null, sx: 0 });   // (a pool's growth: only while the pool is still filling)   // alloc-rare: a pool's growth, only while the pool is still filling
const SLOTS_AT_START = 128;

export function createAtlasPacker({ size = 2048, pad = 2, maxPages = 2 } = {}) {
  const shelfMax = Math.floor(size / 8) + 2;
  // A page: { shelves: [{ y, h, x, fx: [x…], fw: [w…], nf }], n, bottom }. The shelf objects are made here, once.
  const pool = [];    // all the pages the packer may use (maxPages), each with its shelves
  for (let p = 0; p < maxPages; p++) {
    const shelves = [];
    for (let i = 0; i < shelfMax; i++) shelves.push({ y: 0, h: 0, x: 0, fx: [], fw: [], nf: 0 });
    pool.push({ shelves, n: 0, bottom: 0 });
  }
  let nPages = 0;     // pages in use: pool[0 … nPages - 1]
  let used = 0;       // texels held by pictures (padded)
  const slots = [];   // every slot object made so far; spare[0 … spareN - 1] are the ones free to hand out
  const spare = [];
  let spareN = 0;
  for (let i = 0; i < SLOTS_AT_START; i++) { const sl = newSlot(); slots.push(sl); spare.push(sl); spareN++; }
  let atX = 0;        // place()'s second result: the x of the spot it found
  const place = (pg, pw, ph) => {
    for (let k = 0; k < pg.n; k++) {
      const sh = pg.shelves[k];
      if (ph > sh.h || sh.h > ph * 1.5 + 8) continue;
      for (let i = 0; i < sh.nf; i++) {
        if (sh.fw[i] < pw) continue;
        atX = sh.fx[i];
        if (sh.fw[i] === pw) { for (let j = i + 1; j < sh.nf; j++) { sh.fx[j - 1] = sh.fx[j]; sh.fw[j - 1] = sh.fw[j]; } sh.nf--; }
        else { sh.fx[i] += pw; sh.fw[i] -= pw; }
        return sh;
      }
      if (sh.x + pw <= size) { atX = sh.x; sh.x += pw; return sh; }
    }
    const h = Math.min(size - pg.bottom, Math.ceil(ph / 8) * 8);
    if (h < ph || pw > size) return null;
    const sh = pg.shelves[pg.n++];
    sh.y = pg.bottom; sh.h = h; sh.x = pw; sh.nf = 0;
    pg.bottom += h;
    atX = 0;
    return sh;
  };
  return {
    size, pad, maxPages,
    /** A slot for a w × h picture: { page, x, y } is its top left texel (inside the gutter); null when it will not fit. */
    alloc(w, h) {
      const pw = w + pad * 2, ph = h + pad * 2;
      if (pw > size || ph > size) return null;
      for (let p = 0; p <= nPages && p < maxPages; p++) {
        if (p === nPages) { const np = pool[nPages++]; np.n = 0; np.bottom = 0; }
        const sh = place(pool[p], pw, ph);
        if (sh) {
          used += pw * ph;
          let sl;
          if (spareN > 0) sl = spare[--spareN];
          else { sl = newSlot(); slots.push(sl); }
          sl.page = p; sl.x = atX + pad; sl.y = sh.y + pad; sl.w = w; sl.h = h; sl.pw = pw; sl.ph = ph; sl.shelf = sh; sl.sx = atX;
          return sl;
        }
      }
      return null;
    },
    /** Gives a slot back; its neighbours' free space joins up with it. */
    free(slot) {
      if (!slot || !slot.shelf) return;
      const sh = slot.shelf;
      used -= slot.pw * slot.ph;
      // (The span goes in at its place in x order, then every run of touching spans is one.)
      let at = sh.nf;
      while (at > 0 && sh.fx[at - 1] > slot.sx) { sh.fx[at] = sh.fx[at - 1]; sh.fw[at] = sh.fw[at - 1]; at--; }
      sh.fx[at] = slot.sx; sh.fw[at] = slot.pw; sh.nf++;
      let m = 0;
      for (let i = 0; i < sh.nf; i++) {
        if (m > 0 && sh.fx[m - 1] + sh.fw[m - 1] === sh.fx[i]) sh.fw[m - 1] += sh.fw[i];
        else { sh.fx[m] = sh.fx[i]; sh.fw[m] = sh.fw[i]; m++; }
      }
      sh.nf = m;
      // (Free space at the shelf's end goes back to the cursor.)
      if (m > 0 && sh.fx[m - 1] + sh.fw[m - 1] === sh.x) { sh.x = sh.fx[m - 1]; sh.nf = m - 1; }
      slot.shelf = null;
      spare[spareN++] = slot;
    },
    /** Forgets every slot (a repack: the owner then draws every picture again). */
    reset() {
      nPages = 0; used = 0;
      spareN = 0;
      for (let i = 0; i < slots.length; i++) { slots[i].shelf = null; spare[spareN++] = slots[i]; }
    },
    get pages() { return nPages; },
    /** Texels held, and what the pages reserve (each size × size). */
    get used() { return used; },
    get bytes() { return nPages * size * size * 4; },
  };
}

// The runs of the last batchRuns call: one kept array of recycled objects, rewritten by the next call. Its caller walks it at once
// (label-gl's draw does, and calls nothing that batches again meanwhile).
const runs = [];
const runPool = [];
const newRun = () => ({ page: 0, from: 0, to: 0 });   // (the pool's growth: only while it is still filling)
let runN = 0;
/** Consecutive items on one page, in order: [{ page, from, to }] (to exclusive). Painter order inside a run is the instance order; a run ends where the page changes. */
export function batchRuns(items) {
  runN = 0;
  for (let i = 0; i < items.length; i++) {
    const l = runN > 0 ? runPool[runN - 1] : null;
    if (l && l.page === items[i].page) l.to = i + 1;
    else {
      if (runN === runPool.length) runPool.push(newRun());
      const r = runPool[runN];
      r.page = items[i].page; r.from = i; r.to = i + 1;
      runs[runN++] = r;
    }
  }
  runs.length = runN;
  return runs;
}
