// What a recording instrument does with the history the model sends it (worker-core.js, History): the last seconds of the steady state
// it opens on, in the form of the live samples and ending at the moment it was asked for. A card that opens on a steady state then starts
// with its window full, not sweeping in from empty, and the live samples follow on. The history only ever goes in front of what the
// instrument has already recorded, which stays as it is.

import { firstAtOrAbove } from './sorted.js?v=662e543c85';

/** How many of the history's samples come before time t (the instrument's first own sample): all of them for Infinity, none for no history. */
export const olderThan = (hs, t) => (hs?.t?.length ? firstAtOrAbove(hs.t, t) : 0);

/** The record `own` (arrays by key, `t` among them) with the history's first n samples in front, as new arrays; own is left as it was.
 *  A key the history does not carry is NaN for those samples. */
export function inFront(own, hs, keys, n = olderThan(hs, own.t?.[0] ?? Infinity)) {
  const out = {};
  for (const k of keys) out[k] = (hs[k] ? hs[k].slice(0, n) : new Array(n).fill(NaN)).concat(own[k] || []);
  return out;
}
