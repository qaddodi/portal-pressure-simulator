// Which circuit stations show a marker (their dot, their label, the Δ ring after a change). A station belongs to the vessels
// that end at it: it shows only while one of them is drawn there, so no marker floats where nothing is drawn (the gastric bed,
// whose vein the plate leaves out; the varices before they form; the epigastric veins before the paraumbilical vein opens),
// and it goes with the last of them.
// A vessel that is drawing on (or retracting, the same stroke run backward) is drawn from its upstream end only: its far end
// gets its marker once it has arrived, and loses it as the vessel starts to withdraw.

/** The end a drawing-on vessel starts from, and stays at while it retracts: where its flow comes from. */
export const leadEnd = (reveal) => (reveal.dir < 0 ? 'to' : 'from');

/** Whether the vessel record `x` ({ vis, reveal }, the stage's) is drawn at its end `end` ('from' or 'to'). */
export const drawnAt = (x, end) => !!x?.vis && (!x.reveal || end === leadEnd(x.reveal));

/** The vessel ends at each station, { [node id]: [{ x, end }] }, from the model's edges and a lookup of the stage's records. */
export function nodeEnds(edges, record) {
  const at = {};
  for (const e of edges) for (const end of ['from', 'to']) (at[e[end]] ||= []).push({ x: record(e), end });
  return at;
}

/** Whether any vessel is drawn at a station (its `nodeEnds` list). */
export function nodeDrawn(ends) {
  if (!ends) return false;
  for (let i = 0; i < ends.length; i++) if (drawnAt(ends[i].x, ends[i].end)) return true;
  return false;
}

// The dots themselves, and the room readings keep from them. A dot's radius is in the map's units (it scales with the map); its
// outline is the ring stage.js draws on the GPU (nodeVerts: 1.6 wide, half of it outside the radius).
export const dotRadius = (kind) => (kind === 'heart' ? 7 : kind === 'bed' ? 5.5 : 4.5);
const DOT_HALF_STROKE = 0.8;

/**
 * The box a reading keeps out of round a dot at (x, y) on the screen: the dot as drawn plus 2 px, at least the station ring's
 * own size (minX, minY). A reading's box already stands 3 px (sideways) or 2 px (up and down) off its words, so the words end
 * at least 4 px from the dot's edge, whichever side the reading sits on.
 */
export function dotBox(x, y, kind, scale, minX = 0, minY = 0) {
  return dotBoxInto({ x0: 0, y0: 0, x1: 0, y1: 0 }, x, y, kind, scale, minX, minY);
}
/** dotBox written into `out` (no object made). */
export function dotBoxInto(out, x, y, kind, scale, minX = 0, minY = 0) {
  const h = (dotRadius(kind) + DOT_HALF_STROKE) * scale + 2, hx = Math.max(h, minX), hy = Math.max(h, minY);
  out.x0 = x - hx; out.y0 = y - hy; out.x1 = x + hx; out.y1 = y + hy;
  return out;
}

// bareDots' answer: one kept list of kept { id, x, y, box } records, rewritten by each call (the stage copies each box into its own list
// as it walks them). The records are made as the list first grows.
const BARE = [], BARE_POOL = [];
const newBare = () => ({ id: '', x: 0, y: 0, box: { x0: 0, y0: 0, x1: 0, y1: 0 } });   // (the pool's growth: only while it is still filling)   // alloc-rare: a pool's growth, only while it is still filling
for (let i = 0; i < 48; i++) BARE_POOL.push(newBare());

/**
 * Every visible dot with no reading placed beside it (its station's reading is left out at this level of detail, or it has none)
 * with the box readings keep out of. The stations with a reading keep their ring, which the stage sets from the reading itself.
 * `nodes`: the model's stations; `labelled`: ids with a reading; `shown(id)`: whether a vessel is drawn there; `at(id)`: [x, y] on the screen.
 * The list and its records are kept and rewritten by the next call: read them at once.
 */
export function bareDots(nodes, { labelled, shown, at, scale, minX, minY }) {
  let k = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (labelled.has(n.id) || !shown(n.id)) continue;
    const p = at(n.id);
    if (k === BARE_POOL.length) BARE_POOL.push(newBare());
    const r = BARE_POOL[k];
    r.id = n.id; r.x = p[0]; r.y = p[1];
    dotBoxInto(r.box, p[0], p[1], n.kind, scale, minX, minY);
    BARE[k++] = r;
  }
  BARE.length = k;
  return BARE;
}
