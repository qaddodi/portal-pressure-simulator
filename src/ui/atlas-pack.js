// Where the label pictures sit in the GPU's atlas pages (label-gl.js): a shelf packer with a padded gutter round every picture,
// freed slots reused, and a hard cap on pages (so on memory). No DOM here, so tests can run it.
//
// A page is a square of `size` px. Pictures stand on shelves (rows); a shelf is as tall as the first picture put on it (rounded up to
// 8 px), and takes later pictures up to 1.5 times that high (+ 8) so a freed slot is found again. Each picture gets `pad` px of empty
// texels on every side: the shader reads exactly its own texels (texelFetch), so a neighbour can never show in a label, and the gutter
// keeps that true if a picture's size ever rounds the other way.

export function createAtlasPacker({ size = 2048, pad = 2, maxPages = 2 } = {}) {
  const pages = [];   // { shelves: [{ y, h, x, free: [{ x, w }] }], bottom }
  let used = 0;       // texels held by pictures (padded)
  const place = (pg, pw, ph) => {
    for (const sh of pg.shelves) {
      if (ph > sh.h || sh.h > ph * 1.5 + 8) continue;
      for (let i = 0; i < sh.free.length; i++) {
        const f = sh.free[i];
        if (f.w < pw) continue;
        const x = f.x;
        if (f.w === pw) sh.free.splice(i, 1); else { f.x += pw; f.w -= pw; }
        return { sh, x };
      }
      if (sh.x + pw <= size) { const x = sh.x; sh.x += pw; return { sh, x }; }
    }
    const h = Math.min(size - pg.bottom, Math.ceil(ph / 8) * 8);
    if (h < ph || pw > size) return null;
    const sh = { y: pg.bottom, h, x: pw, free: [] };
    pg.shelves.push(sh); pg.bottom += h;
    return { sh, x: 0 };
  };
  return {
    size, pad, maxPages,
    /** A slot for a w × h picture: { page, x, y } is its top left texel (inside the gutter); null when it will not fit. */
    alloc(w, h) {
      const pw = w + pad * 2, ph = h + pad * 2;
      if (pw > size || ph > size) return null;
      for (let p = 0; p <= pages.length && p < maxPages; p++) {
        if (p === pages.length) pages.push({ shelves: [], bottom: 0 });
        const at = place(pages[p], pw, ph);
        if (at) { used += pw * ph; return { page: p, x: at.x + pad, y: at.sh.y + pad, w, h, pw, ph, shelf: at.sh, sx: at.x }; }
      }
      return null;
    },
    /** Gives a slot back; its neighbours' free space joins up with it. */
    free(slot) {
      if (!slot || !slot.shelf) return;
      const sh = slot.shelf;
      used -= slot.pw * slot.ph;
      sh.free.push({ x: slot.sx, w: slot.pw });
      sh.free.sort((a, b) => a.x - b.x);
      const out = [];
      for (const f of sh.free) {
        const l = out[out.length - 1];
        if (l && l.x + l.w === f.x) l.w += f.w; else out.push({ x: f.x, w: f.w });
      }
      // (Free space at the shelf's end goes back to the cursor.)
      const l = out[out.length - 1];
      if (l && l.x + l.w === sh.x) { sh.x = l.x; out.pop(); }
      sh.free = out;
      slot.shelf = null;
    },
    /** Forgets every slot (a repack: the owner then draws every picture again). */
    reset() { pages.length = 0; used = 0; },
    get pages() { return pages.length; },
    /** Texels held, and what the pages reserve (each size × size). */
    get used() { return used; },
    get bytes() { return pages.length * size * size * 4; },
  };
}

/** Consecutive items on one page, in order: [{ page, from, to }] (to exclusive). Painter order inside a run is the instance order; a run ends where the page changes. */
export function batchRuns(items) {
  const runs = [];
  for (let i = 0; i < items.length; i++) {
    const l = runs[runs.length - 1];
    if (l && l.page === items[i].page) l.to = i + 1; else runs.push({ page: items[i].page, from: i, to: i + 1 });
  }
  return runs;
}
