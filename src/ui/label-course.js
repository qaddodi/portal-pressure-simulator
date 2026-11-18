// A station's callout hangs from the middle of the vessel it names (anatomy.js LABEL_VESSEL). A vein a shunt joins part-way is several pieces (topology.js
// JUNCTIONS), but it is one vein to the reader: its middle is the middle of the whole course, not of the piece the label is filed under (the portal vein's
// "PV" callout slid to the middle of its upper piece, beside the hepatic artery's, when the coronary vein's junction cut it: 15 Nov 2026). `labelCourse` is that
// course: the vessel's own points when it is whole, its pieces end to end when it is cut (one kept list per vein, made again only when a piece's points move).
import { piecesOf } from './part-names.js';
const KEPT = new Map();
const stamp = (c) => c.length + c[0][0] * 1.7 + c[0][1] * 2.3 + c[c.length - 1][0] * 3.1 + c[c.length - 1][1] * 5.3 + c[c.length >> 1][0] * 7.1 + c[c.length >> 1][1] * 11.3;
/** The points of the course a station label hangs on, `eid` being the vessel LABEL_VESSEL names for it (undefined when it has no points). */
export function labelCourse(geo, eid) {
  const ids = eid ? piecesOf(eid) : null;
  if (!ids || ids.length < 2) return eid ? geo[eid]?.cur : undefined;
  let k = KEPT.get(eid);
  if (!k) KEPT.set(eid, (k = { refs: [], stamps: [], P: [] }));   // alloc-rare: the first ask for this vein
  let same = k.refs.length === ids.length;
  for (let i = 0; i < ids.length; i++) {
    const c = geo[ids[i]]?.cur;
    if (!(c?.length > 1)) return geo[eid]?.cur;
    if (same && (k.refs[i] !== c || k.stamps[i] !== stamp(c))) same = false;
  }
  if (same) return k.P;
  k.P.length = 0;
  for (let i = 0; i < ids.length; i++) {
    const c = geo[ids[i]].cur;
    k.refs[i] = c; k.stamps[i] = stamp(c);
    for (let j = i ? 1 : 0; j < c.length; j++) k.P.push(c[j]);
  }
  return k.P;
}
