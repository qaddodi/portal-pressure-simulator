// The device's saved preferences and data, one door (SHL-6, 19 Nov 2026). Every `pps.*` key of the app goes through `prefs` instead of `localStorage` itself.
//
// Why: the live site (/) and the preview (/preview/) are one origin, so one localStorage. A migration shipped to the preview ran on the tester's live data, and the
// preview's "Delete everything" deleted the live site's saved scripts. Now the live site keeps `pps.*` as it always did, and the preview keeps its own copy of the same
// names under `ppsPreview.*` (made from the live ones the first time the preview opens, then separate): neither can read, change or delete the other's.
//
// What it adds: `clearAll()` clears this copy's keys, the session data (the error ring) and this copy's offline cache; `persist()` asks the browser not to drop
// the data after a week unused (Safari does that to a site the person has not opened; saved scripts are a lecturer's work).
// Storage that is blocked or full never throws out of here: reads answer null, writes answer false.

/** Which copy of the site this page is: 'preview' under /preview/, else 'live' (the live site, a local server, an installed app). */
export const scopeOf = (path = globalThis.location?.pathname || '/') => (/\/preview(\/|$)/.test(path) ? 'preview' : 'live');
const PREVIEW = 'ppsPreview.';

const ls = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
/** The key as stored in this copy: `pps.x` on the live site, `ppsPreview.x` on the preview. */
export const keyFor = (k, scope = scopeOf()) => (scope === 'preview' && k.startsWith('pps.') ? PREVIEW + k.slice(4) : k);
/** The name the app knows a stored key by (`ppsPreview.x` → `pps.x`), or null for a key that is not this copy's. */
const nameOf = (stored, scope = scopeOf()) => (scope === 'preview' ? (stored.startsWith(PREVIEW) ? 'pps.' + stored.slice(PREVIEW.length) : null) : stored.startsWith('pps.') ? stored : null);

/** The first time the preview opens on a device: its own copy of what the live site holds, so the tester's looks, scripts and patients carry over. Never deletes. */
export function migrateToPreview(store = ls()) {
  try {
    if (!store || store.getItem(PREVIEW + 'migrated')) return false;
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith('pps.') && store.getItem(PREVIEW + k.slice(4)) == null) store.setItem(PREVIEW + k.slice(4), store.getItem(k)); }
    store.setItem(PREVIEW + 'migrated', '1');
    return true;
  } catch { return false; }
}
if (scopeOf() === 'preview') migrateToPreview();

export const prefs = {
  getItem(k) { try { return ls()?.getItem(keyFor(k)) ?? null; } catch { return null; } },
  // (a failed write is thrown, as localStorage's is: every caller already wraps it and counts the failure with caught())
  setItem(k, v) { const s = ls(); if (!s) throw new Error('no storage'); s.setItem(keyFor(k), v); },
  removeItem(k) { try { ls()?.removeItem(keyFor(k)); } catch { /* blocked storage: nothing to remove */ } },
  /** This copy's stored names, as the app spells them (`pps.*`). */
  keys() { const s = ls(); const out = []; try { for (let i = 0; s && i < s.length; i++) { const n = nameOf(s.key(i)); if (n) out.push(n); } } catch { /* blocked */ } return out; },
};

/** Everything this copy keeps on the device: its keys, the session data, and its offline cache. Never touches the other copy's. */
export async function clearAll({ store = ls(), session = globalThis.sessionStorage, cacheApi = globalThis.caches, scope = scopeOf(), path = globalThis.location?.pathname || '/' } = {}) {
  try { for (const k of [...prefs.keys()]) store?.removeItem(keyFor(k, scope)); if (scope === 'preview') store?.removeItem(PREVIEW + 'migrated'); } catch { /* blocked */ }
  try { session?.clear(); } catch { /* blocked */ }
  try {
    if (cacheApi?.keys) {
      const base = path.replace(/[^/]*$/, '');   // (this copy's folder: the worker's caches are named by their scope, build.mjs)
      for (const n of await cacheApi.keys()) if (n.startsWith(`pps@${base}@`)) await cacheApi.delete(n);
    }
  } catch { /* the cache is a bonus */ }
}

/** Asks the browser to keep this site's data (a saved script is a lecturer's work). Answers whether it will; never throws. */
export async function persist() {
  try { return !!(await globalThis.navigator?.storage?.persist?.()); } catch { return false; }
}
