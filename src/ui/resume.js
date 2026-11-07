// Where each presentation was left, so the Present menu can offer "Resume 7 / 12" (review U24).
// One small record per deck on this device: { at, n } (the slide index, outline included, and the deck's slide count
// then). A deck whose slide count has changed since, or a position past its end, starts from the beginning again.

import { caught } from './caught.js';
const KEY = 'pps.resume';   // { [id]: { at, n, w } }: w is when it was noted, so the oldest goes first whatever the id looks like (B8: an all-digit id sorts first in an object)
const MAX = 40;   // (decks remembered; the oldest go first)

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
function readAll() {
  try { const v = JSON.parse(store()?.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeAll(all) {
  const ids = Object.keys(all).sort((a, b) => (all[a]?.w || 0) - (all[b]?.w || 0));   // (oldest first by its own stamp)
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[id];
  try { store()?.setItem(KEY, JSON.stringify(all)); } catch (e) { caught('resume:15', e); /* storage unavailable */ }
}

// (A stamp above every one kept, so the order holds even when two notes land in the same millisecond.)
const stamp = (all) => Math.max(Date.now(), ...Object.values(all).map((r) => (r?.w || 0) + 1));

/** Remember slide `at` of the deck (n slides). The first slide, or the last (the talk is over), forgets it. */
export function noteResume(id, at, n) {
  if (!id || !(n > 1) || !Number.isInteger(at)) return;
  const all = readAll();
  if (at <= 0 || at >= n - 1) { if (!(id in all)) return; delete all[id]; }
  else { if (all[id]?.at === at && all[id]?.n === n) return; all[id] = { at, n, w: stamp(all) }; }
  writeAll(all);
}

/** Where to resume the deck (n slides now): { at, n }, or null for the beginning. */
export function resumeFor(id, n) {
  const r = readAll()[id];
  return r && Number.isInteger(r.at) && r.n === n && r.at > 0 && r.at < n - 1 ? { at: r.at, n } : null;
}

export function forgetResume(id) {
  const all = readAll();
  if (id in all) { delete all[id]; writeAll(all); }
}
