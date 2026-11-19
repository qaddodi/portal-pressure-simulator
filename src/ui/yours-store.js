// "Yours" on this device (Work backward, src/engine/portal/yours.js): the saved records live in this browser's storage and nowhere else, so a patient made from
// readings is not on another device and is not in a share link (the link carries the model's settings, which any device can open). Storage can be
// refused (a private window, site data blocked, a full quota): reads then give nothing and a save keeps the list in memory for the page's life.

import { prefs } from './prefs.js';
import { cleanYours, yoursRecord, YOURS_MAX } from '../engine/portal/yours.js';
import { caught } from './caught.js';

export const YOURS_KEY = 'pps.yours';
let mem = null;   // (the list when storage will not take it)

/** The saved records, made safe (engine/portal/yours.js cleanYours). */
export function readYours() {
  if (mem) return mem;
  try { return cleanYours(JSON.parse(prefs.getItem(YOURS_KEY) || '[]')); } catch (e) { caught('yours-store:read', e); return []; }
}
function write(list) {
  try { prefs.setItem(YOURS_KEY, JSON.stringify(list)); mem = null; } catch (e) { caught('yours-store:write', e); mem = list; }
  return list;
}
/** Save the patient for family f at settings p, made from `readings`; the newest first, the oldest dropped past YOURS_MAX. Returns { list, rec }. */
export function saveYours(f, p, readings) {
  const rec = yoursRecord(f, p, readings);
  if (!rec) return { list: readYours(), rec: null };
  const list = [rec, ...readYours().filter((r) => r.id !== rec.id)].slice(0, YOURS_MAX);
  return { list: write(list), rec };
}
/** Forget one saved patient. Returns the list that is left. */
export const removeYours = (id) => write(readYours().filter((r) => r.id !== id));
