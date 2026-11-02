// A reading and its vessel light together on hover (sprint brief 8, 1 Nov 2026).
//
// Hovering a vessel already lights it (stage.js setHover). Hovering its reading ("Portal vein 22.4", "Right sinusoids 22.0", "Varices 18.1")
// lit nothing, so the learner followed the leader by eye to see which vessel a number belongs to. Now the two answer each other: the label
// under the pointer lights what it names with the vessel's own hover glow, and a hovered vessel lifts its label (CSS: #labels.hovlink .lb.hov-link).
// Only on a pointer that hovers, never a finger; never in a talk (its slides set the lights). ?hoverlink=0 turns it all off: no listener, no class.
//
// This file is the pure part: what a label names, and which labels name a vessel. stage.js does the lighting.

import { normalizeSel } from './actions.js?v=4aa1288f75';
import { LABEL_VESSEL } from './anatomy.js?v=fe0f3d1f0e';

/** The switch: ?hoverlink=0 gives the app as it was (no listeners, no class on the label layer). */
export const HOVER_LINK = !/[?&]hoverlink=0\b/.test(typeof location === 'undefined' ? '' : location.search);

// Organs a click on a station's label selects that also have a hover outline of their own (stage.js setOrganHover).
const OUTLINED = new Set(['liver', 'heart', 'spleen']);

const memo = new Map();
/**
 * What a reading label names, from its key ('n:' + station, or 'n:TIPS' / 'n:TIPS:mid' for a stent's velocity):
 * { edge, also } the vessel a click on it selects, and any other vessel its callout hangs from (the splenic vein is two: its distal and
 * proximal runs); { organ } an organ it stands for that has a hover outline; or null (a bed, a chamber, a site with nothing of its own to
 * light). The varices name the vessel their callout hangs from.
 */
export function labelTarget(key) {
  if (typeof key !== 'string' || !key.startsWith('n:')) return null;
  let t = memo.get(key);
  if (t !== undefined) return t;
  const id = key.slice(2).split(':')[0], hung = LABEL_VESSEL[id];
  const sel = id === 'TIPS' || id === 'DIPS' ? { type: 'edge', id } : normalizeSel({ type: 'node', id });
  if (sel?.type === 'edge') t = { edge: sel.id, also: hung && hung !== sel.id ? [hung] : [] };
  else if (hung) t = { edge: hung, also: [] };
  else if (sel?.type === 'organ' && OUTLINED.has(sel.id)) t = { organ: sel.id };
  else t = null;
  memo.set(key, t);
  return t;
}

/** The vessels a label names (its edge, then the others): a vessel in this list lights its label, and the label lights them all. */
export const edgesOfLabel = (t) => (t?.edge ? [t.edge, ...(t.also || [])] : []);

/** The label keys (of those given) that name a vessel in `edges` (a Set of vessel ids), in the order given. */
export function labelsOf(keys, edges) {
  const out = [];
  if (!edges || !edges.size) return out;
  for (const k of keys) if (edgesOfLabel(labelTarget(k)).some((e) => edges.has(e))) out.push(k);
  return out;
}
