// "Yours": the patients Work backward makes from a person's readings. A saved one is a small record, { id, f, p, readings, label, at }: the lesion
// family, its settings and the readings it was made from. The patient itself (its params patch, days and volume) is rebuilt from the family every
// time, never read back from storage, so a record that was edited or is old can only ever give a patient the app can make. Pure: no storage here
// (src/ui/yours-store.js keeps them on this device), no engine; the worker and the page both read it.

import { FAMILY, LESION, sidesOf, keyOf, patientOf, settingText } from './inverse-families.js';
import { READINGS, READING_KEYS, chipText } from './inverse.js';
import { registerPreset, forgetPreset, PRESETS } from './scenario.js';

export const YOURS_GROUP = 'Yours';
/** The most patients kept: the oldest goes when one more is made. */
export const YOURS_MAX = 12;
export const YOURS_NOTE = 'A model scenario made from your readings, not a diagnosis.';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** A stable id for a family at settings p: the same scenario opened twice is the same patient. */
export function yoursId(f, p) {
  const s = keyOf(f, p);
  let x = 5381;
  for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'yours-' + x.toString(36);
}

/** The patient's name in the menu: each lesion with how far it is pushed ("Cirrhosis 30% + Right heart failure marked"). */
export function yoursLabel(f, p) {
  return FAMILY[f].axes.map((k) => `${LESION[k].short} ${settingText(k, p[k])}`).join(' + ') || FAMILY[f].short;
}

/** The readings as a short sentence for the patient's summary: the first few, then "and n more". */
export function readingsLine(readings, max = 5) {
  const ks = READING_KEYS.filter((k) => k in readings);
  const shown = ks.slice(0, max).map((k) => `${READINGS[k].short} ${chipText(k, readings[k])}`);
  return shown.join(', ') + (ks.length > max ? ` and ${ks.length - max} more` : '');
}

/** A record for family f at settings p, made from `readings`. Returns null when f or p are not a patient the app can make. */
export function yoursRecord(f, p, readings = {}, at = Date.now()) {
  const fam = FAMILY[f];
  if (!fam || !p || !fam.axes.every((k) => finite(p[k]))) return null;
  // (side settings the fit chose ride along when they are real numbers inside their slider's range; anything else is left to the lesion's own line)
  const set = { ...Object.fromEntries(fam.axes.map((k) => [k, p[k]])), ...Object.fromEntries(sidesOf(fam.axes).filter((x) => finite(p[x.id]) && p[x.id] >= x.lo && p[x.id] <= x.hi).map((x) => [x.id, p[x.id]])) };
  const kept = Object.fromEntries(READING_KEYS.filter((k) => finite(readings[k])).map((k) => [k, readings[k]]));
  return { id: yoursId(f, set), f, p: set, readings: kept, label: yoursLabel(f, set), at: finite(at) ? at : 0 };
}

/** What storage held, made safe: records the app can rebuild, at most YOURS_MAX, newest first, one to an id. */
export function cleanYours(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Map();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const rec = yoursRecord(r.f, r.p, r.readings && typeof r.readings === 'object' ? r.readings : {}, r.at);
    if (rec && !(out.get(rec.id)?.at >= rec.at)) out.set(rec.id, rec);   // (two of one id: the newer is kept)
  }
  return [...out.values()].sort((a, b) => b.at - a.at).slice(0, YOURS_MAX);
}

/** The preset definition (scenario.js registerPreset) a record becomes. */
export function yoursPreset(rec) {
  const { patch, days, volume } = patientOf(rec.f, rec.p), fam = FAMILY[rec.f];
  const said = readingsLine(rec.readings);
  return {
    id: rec.id, label: rec.label, group: YOURS_GROUP, patch, days, volume, note: YOURS_NOTE,
    summary: `${fam.sub} Made from your readings${said ? ` (${said})` : ''}. ${YOURS_NOTE}`,
  };
}

/** Make the list of records the patients the engine knows: the old Yours are forgotten and these registered, in order. Returns how many. */
export function setYours(list) {
  for (const p of PRESETS.filter((x) => x.group === YOURS_GROUP)) forgetPreset(p.id);
  let n = 0;
  for (const rec of cleanYours(list)) if (registerPreset(yoursPreset(rec))) n++;
  return n;
}
