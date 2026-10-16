// Where each presentation was left, so the Present menu can offer "Resume 7 / 12" (review U24).
// One small record per deck on this device: { at, n } (the slide index, outline included, and the deck's slide count
// then). A deck whose slide count has changed since, or a position past its end, starts from the beginning again.

const KEY = 'pps.resume';
const MAX = 40;   // (decks remembered; the oldest go first)

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
function readAll() {
  try { const v = JSON.parse(store()?.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeAll(all) {
  const ids = Object.keys(all);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[id];
  try { store()?.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}

/** Remember slide `at` of the deck (n slides). The first slide, or the last (the talk is over), forgets it. */
export function noteResume(id, at, n) {
  if (!id || !(n > 1) || !Number.isInteger(at)) return;
  const all = readAll();
  if (at <= 0 || at >= n - 1) { if (!(id in all)) return; delete all[id]; }
  else { if (all[id]?.at === at && all[id]?.n === n) return; delete all[id]; all[id] = { at, n }; }   // (re-added: the newest last)
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
