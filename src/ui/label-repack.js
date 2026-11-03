// Packing the label atlas afresh without a label losing its picture (3 Nov 2026, R12; label-gl.js).
//
// A full atlas used to be reset: every slot given up, every label described, laid out and painted again, and the SVG drawing the labels
// till that was done. Here the pictures stay where they are and drawable while a second packer lays the same pictures out compactly
// (largest first) and the GPU copies each picture's texels into its new place a few at a time (copyTexSubImage2D from the old page, no
// repaint, nothing read back); the labels change to their new places in one step, after one last pass over what changed meanwhile.
// No GL and no DOM here (the copy is a function the caller gives), so tests can run it.

/** A repack of `live` (each { slot, ver }: ver counts the label's paintings) into `packer` (empty): { packer, moves, i } or null when they will not fit. */
export function planRepack(live, packer) {
  const todo = [];
  for (const st of live) if (st.slot) todo.push(st);
  // (Tallest first, then widest: the shelves take a run of one height, so fewer are left part full.)
  todo.sort((a, b) => b.slot.h - a.slot.h || b.slot.w - a.slot.w);
  const moves = [];
  for (const st of todo) {
    const to = packer.alloc(st.slot.w, st.slot.h);
    if (!to) { for (const m of moves) packer.free(m.to); return null; }
    moves.push({ st, from: st.slot, to, w: st.slot.w, h: st.slot.h, ver: st.ver, done: false });
  }
  return { packer, moves, i: 0 };
}

/** Copies planned moves in order until `budgetMs` of `clock()` is spent (at least `least`); true once every move is copied. */
export function stepRepack(rp, copy, clock, budgetMs, least = 8) {
  const t0 = clock();
  let n = 0;
  while (rp.i < rp.moves.length) {
    if (n >= least && clock() - t0 >= budgetMs) return false;
    const m = rp.moves[rp.i++];
    if (!m.done) { copy(m.from, m.to, m.w, m.h); m.done = true; }
    n++;
  }
  return true;
}

/**
 * The step before the swap: `live` is every label with a picture now. A move whose label is gone, or whose picture was painted again or
 * given another place since it was copied, is undone (its new place given back) and the label planned and copied afresh; a label new
 * since the plan is added. Returns false when the new packer has no room for them (the old generation then stays as it is).
 * Afterwards, for every label in `live` with a picture, `placeOf(st)` is its place in the new packer.
 */
export function reconcileRepack(rp, live, copy) {
  const liveSet = new Set(live), by = new Map();
  for (const m of rp.moves) {
    const st = m.st;
    const same = liveSet.has(st) && st.slot === m.from && st.slot.w === m.w && st.slot.h === m.h && st.ver === m.ver && m.done;
    if (same) { by.set(st, m); continue; }
    if (liveSet.has(st) && st.slot && st.slot === m.from && st.slot.w === m.w && st.slot.h === m.h) {   // (painted again in place: copy it again to the same place)
      copy(m.from, m.to, m.w, m.h); m.ver = st.ver; m.done = true; by.set(st, m);
    } else rp.packer.free(m.to);
  }
  const moves = [];
  for (const st of live) {
    if (!st.slot) continue;
    let m = by.get(st);
    if (!m) {
      const to = rp.packer.alloc(st.slot.w, st.slot.h);
      if (!to) { for (const q of moves) rp.packer.free(q.to); return false; }
      m = { st, from: st.slot, to, w: st.slot.w, h: st.slot.h, ver: st.ver, done: false };
      copy(m.from, m.to, m.w, m.h); m.done = true;
    }
    moves.push(m);
  }
  rp.moves = moves;
  return true;
}

/** The swap: every label with a move takes its new place. */
export function commitRepack(rp) {
  for (const m of rp.moves) m.st.slot = m.to;
}
