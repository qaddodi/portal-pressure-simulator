// A reading and its vessel light together on hover (sprint brief 8, 1 Nov 2026).
//
// Hovering a vessel already lights it (stage.js setHover). Hovering its reading ("Portal vein 22.4", "Right sinusoids 22.0", "Varices 18.1")
// lit nothing, so the learner followed the leader by eye to see which vessel a number belongs to. Now the two answer each other: the label
// under the pointer lights what it names with the vessel's own hover glow, and a hovered vessel lifts its label (CSS: #labels.hovlink .lb.hov-link).
// Only on a pointer that hovers, never a finger; never in a talk (its slides set the lights).
//
// This file is the pure part: what a label names, and which labels name a vessel. stage.js does the lighting.

import { normalizeSel } from './actions.js';
import { LABEL_VESSEL } from './anatomy.js';

export const HOVER_LINK = true;   // (switch deleted; kept for stage.js until its own pass)

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
  // (Only the first time a key is asked: the answer is kept in memo, whatever it is.)
  const id = key.slice(2).split(':')[0], hung = LABEL_VESSEL[id];   // alloc-rare: only a label key's first ask (memo)
  const sel = id === 'TIPS' || id === 'DIPS' ? { type: 'edge', id } : normalizeSel({ type: 'node', id });   // alloc-rare: only a label key's first ask (memo)
  if (sel?.type === 'edge') t = { edge: sel.id, also: hung && hung !== sel.id ? [hung] : [] };   // alloc-rare: only a label key's first ask (memo)
  else if (hung) t = { edge: hung, also: [] };   // alloc-rare: only a label key's first ask (memo)
  else if (sel?.type === 'organ' && OUTLINED.has(sel.id)) t = { organ: sel.id };   // alloc-rare: only a label key's first ask (memo)
  else t = null;
  if (memo.size >= 400) memo.clear();   // (bounded: keys are a few hundred at most; clearing only rebuilds the answer once)
  memo.set(key, t);
  return t;
}

// (The list of a target is made once and kept with it, so asking for it builds nothing. Read it, never write to it.)
const edgeLists = new WeakMap(), NO_EDGES = Object.freeze([]);
/** The vessels a label names (its edge, then the others): a vessel in this list lights its label, and the label lights them all.
 *  The same list each time for a label; read only. */
export function edgesOfLabel(t) {
  if (!t?.edge) return NO_EDGES;
  let list = edgeLists.get(t);
  if (!list) { list = [t.edge, ...(t.also || [])]; edgeLists.set(t, list); }   // alloc-rare: only a target's first ask (kept in edgeLists)
  return list;
}

// (The labels found, written into one list kept for it: read it before the next call.)
const found = [];
/** The label keys (of those given) that name a vessel in `edges` (a Set of vessel ids), in the order given. The same list is rewritten by
 *  every call: use it at once (stage.js linkSync copies it into a Set), keep nothing of it. */
export function labelsOf(keys, edges) {
  found.length = 0;
  if (!edges || !edges.size) return found;
  for (const k of keys) {
    const list = edgesOfLabel(labelTarget(k));
    for (let i = 0; i < list.length; i++) if (edges.has(list[i])) { found.push(k); break; }
  }
  return found;
}
