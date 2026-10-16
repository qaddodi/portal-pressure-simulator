// The FibroScan probe's wave packets (stage.js scanTick): each a group of three arcs (a faint ripple, the crest, a faint
// ripple). Their elements are found once, and a group's opacity or an arc's path is written only when its text changed.

/** The packets under a probe element: [{ g, paths, op, d }] (op and d: the text last written). */
export function wavePacks(root) {
  return [...root.querySelectorAll('.sp-waves > g')].map((g) => ({ g, paths: [...g.children], op: null, d: [] }));
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
