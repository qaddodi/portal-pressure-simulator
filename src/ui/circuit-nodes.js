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
export const nodeDrawn = (ends) => !!ends && ends.some(({ x, end }) => drawnAt(x, end));
