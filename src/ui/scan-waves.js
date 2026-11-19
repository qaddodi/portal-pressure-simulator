// The FibroScan probe's wave packets (stage.js scanTick): each a group of three arcs (a faint ripple, the crest, a faint
// ripple). Their elements are found once, and a group's opacity or an arc's path is written only when its text changed.

/** The packets under a probe element: [{ g, paths, op, d }] (op and d: the text last written). */
export function wavePacks(root) {
  // alloc-rare: the packets are looked up once for a probe element (stage.js keeps the list in scan.packs)
  return [...root.querySelectorAll('.sp-waves > .sp-pk')].map((g) => ({ g, paths: [...g.children], op: null, d: [] }));
}
/** Sets a packet's opacity (text) and, given arcOf(j) for each of its paths, their `d`. */
export function paintWave(w, op, arcOf) {
  if (w.op !== op) { w.op = op; w.g.style.opacity = op; }
  if (!arcOf) return;
  for (let j = 0; j < w.paths.length; j++) {
    const d = arcOf(j);
    if (w.d[j] !== d) { w.d[j] = d; w.paths[j].setAttribute('d', d); }
  }
}

// The packets as numbers for the GPU (15 Nov 2026, app review SF-2). The probe's waves were passed to the labels' GPU pass through the DOM: scanTick wrote each
// packet's opacity and each arc's `d` string on up to 36 elements, and the pass parsed them back in the same frame, though the page never painted them. A packet is
// WAVE_STRIDE floats in a record both sides hold: the opacity, then each of its WAVE_ARCS arcs' start x and y, radius, end x and y, as the path text gave them (to a tenth).
export const WAVE_ARCS = 3, WAVE_STRIDE = 1 + 5 * WAVE_ARCS;
/** Packet `i`'s numbers into rec: its opacity `op` (a number) and, for arc j, arcNums(j, rec, offset) writing that arc's five. A packet with no front: op 0. */
export function waveRecInto(rec, i, op, arcNums) {
  const o = i * WAVE_STRIDE;
  rec[o] = op;
  if (!arcNums || !(op > 0)) return;
  for (let j = 0; j < WAVE_ARCS; j++) arcNums(j, rec, o + 1 + 5 * j);
}

/** An arc of radius r about `tip`, as the path text the page's own element carries (to a tenth); `half`: the sector's half angle at 50 units, widening a little with depth. */
export function arcPath(tip, half, r) {
  const [cx, cy] = tip, h = half * (0.75 + 0.25 * Math.min(1, r / 50));
  const p = (t) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  return `M${p(-h)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p(h)}`;
}
const tenth = (v) => Math.round(v * 10) / 10;
/** The same arc as numbers into rec at o: start x, y, radius, end x, y, each to a tenth as arcPath's text has them. */
export function arcNumsInto(rec, o, tip, half, r) {
  const [cx, cy] = tip, h = half * (0.75 + 0.25 * Math.min(1, r / 50));
  rec[o] = tenth(cx + r * Math.cos(-h)); rec[o + 1] = tenth(cy + r * Math.sin(-h)); rec[o + 2] = tenth(r);
  rec[o + 3] = tenth(cx + r * Math.cos(h)); rec[o + 4] = tenth(cy + r * Math.sin(h));
}
