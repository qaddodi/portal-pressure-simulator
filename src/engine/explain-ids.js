// The Why? ids of one vessel and one compartment, in one place: every card, panel and button that asks "why this value?" of a vessel
// takes its id from here, so none of them can send a vessel to someone else's quantity (the hepatic artery's panel once asked for the
// portal pressure). engine/explain.js reads them back: `edge:A_HEP` is that vessel's flow, `node:HA` that compartment's pressure.

export const edgeWhy = (id) => `edge:${id}`;
export const nodeWhy = (id) => `node:${id}`;

/** What an id names: { kind: 'edge' | 'node', id } for a vessel's or a compartment's, else null (a metric of METRICS). */
export function whyTarget(metric) {
  const m = /^(edge|node):(\w+)$/.exec(String(metric));
  return m ? { kind: m[1], id: m[2] } : null;
}
