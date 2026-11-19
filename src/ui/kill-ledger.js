// The kill ledger (bible review 19 Nov 2026, 5.5 gap 6): every number the app reports about GPU memory is its own estimate (gpu-budget.js) against a guessed envelope, and Safari exposes no process
// memory, so the envelope can only be calibrated from the kills themselves. report.js already writes the page's last moment (where, the estimate, its highest) and the next page reads it as a
// "last-seen" note after a memory kill; this keeps each such moment, so the Phone check can print what the estimate stood at every time the tab was ended on this device. Local only (the key is
// `pps.kills`, listed and cleared by Help > Privacy with the others); nothing is sent. Pure: handed a storage.
export const KILLS_KEY = 'pps.kills', KILLS_MAX = 12;

/** The ledger as stored: [{ at, where, mb, peak, env, s, device }], oldest first. Never throws. */
export function readLedger(storage) {
  try { const v = JSON.parse(storage?.getItem(KILLS_KEY) || '[]'); return Array.isArray(v) ? v.filter((k) => k && typeof k === 'object') : []; } catch { return []; }
}

/** Adds one kill (the page's last moment, read after the tab was ended) and keeps the last KILLS_MAX. `last`: { where, mb, peak, env, s }. Returns the ledger. */
export function addKill(storage, last, { at = new Date().toISOString(), device = '' } = {}) {
  const list = readLedger(storage);
  if (!last || typeof last.where !== 'string') return list;
  list.push({ at, where: last.where.slice(0, 80), mb: +last.mb || 0, peak: +last.peak || 0, env: String(last.env || '').slice(0, 40), s: +last.s || 0, device: String(device).slice(0, 20) });
  if (list.length > KILLS_MAX) list.splice(0, list.length - KILLS_MAX);
  try { storage?.setItem(KILLS_KEY, JSON.stringify(list)); } catch { /* (storage full or blocked: the kill is still in this page's ring) */ }
  return list;
}

/** The ledger as the lines the Phone check prints: when, where, the estimate then, its highest, how long the page had been open. */
export function ledgerLines(list) {
  if (!list.length) return ['KILL LEDGER: no tab ended on this device since the ledger began.'];
  const mbs = list.map((k) => k.mb).filter((n) => n > 0);
  const head = `KILL LEDGER (${list.length} tab${list.length === 1 ? '' : 's'} ended on this device; the page's own estimate at the last moment it wrote${mbs.length ? `: lowest ${Math.min(...mbs)} MB, highest ${Math.max(...mbs)} MB` : ''}; the envelope it is judged against is a guess, calibrate it from these):`;
  return [head, ...list.map((k) => `  ${String(k.at).slice(0, 16).replace('T', ' ')}  ${k.mb} MB (highest ${k.peak}) of ${k.env}, ${k.s} s after opening, at ${k.where}${k.device ? ` [${k.device}]` : ''}`)];
}
