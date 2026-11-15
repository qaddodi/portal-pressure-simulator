// A vein split in pieces where a shunt or collateral joins it part-way along (topology.js JUNCTIONS) is one vein to a reader: its name, its note and its
// short label are the host's on every piece. `withPieces(table)` gives each piece the host's entry of a table keyed by vessel id (an entry already
// there stays), and returns the table.
import { JUNCTION_PIECES } from '../engine/topology.js';
export function withPieces(table) {
  for (const [host, ids] of Object.entries(JUNCTION_PIECES)) if (table[host] !== undefined) for (const id of ids) if (table[id] === undefined) table[id] = table[host];
  return table;
}
/** Every piece of the vein a vessel id belongs to (the id alone for a vein that is whole), in order along the vein. */
export function piecesOf(id) {
  for (const ids of Object.values(JUNCTION_PIECES)) if (ids.includes(id)) return ids;
  return [id];
}
/** The flow through the vein a vessel is a piece of: the largest of its pieces' flows (mL/s, magnitude) in `Q`, or 0 for a vein that is whole. */
export function throughFlow(id, Q, ei) {
  const ids = piecesOf(id);
  if (ids.length < 2) return 0;
  let m = 0;
  for (let i = 0; i < ids.length; i++) { const q = Math.abs(Q[ei[ids[i]]]); if (q > m) m = q; }
  return m;
}
