// The width at each node that the vessel tubes ease their ends to (stage.js renderTube's J): the second widest vessel meeting
// there, or the widest when only one does. The width step works it out on every frame the breath keeps the widths moving, so
// one tally per node and one answer object are kept and reused instead of an array per node, a sort and two new objects.
export function createJunctionWidths() {
  const tally = new Map(), out = {};
  return {
    /** Starts a new count: every node reads as having no vessel. */
    reset() { for (const v of tally.values()) v.n = 0; },
    /** One vessel of width w meeting at node n. */
    put(n, w) {
      let v = tally.get(n);
      if (!v) tally.set(n, v = { a: 0, b: 0, n: 0 });
      if (!v.n) { v.a = w; v.n = 1; return; }
      if (w > v.a) { v.b = v.a; v.a = w; } else if (v.n === 1 || w > v.b) v.b = w;
      v.n++;
    },
    /** node → width, the same object each time; a node no vessel met since reset reads undefined. */
    answer() {
      for (const n in out) out[n] = undefined;
      tally.forEach((v, n) => { if (v.n) out[n] = v.n > 1 ? v.b : v.a; });
      return out;
    },
  };
}
