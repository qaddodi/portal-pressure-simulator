// Comparing two screen reports and two lists of findings (plan section 3, steps 1 and 4): "does the replay match what the person saw?" and "what did the fix change?".
// Pure JSON in, JSON out.

import { findingKey, isMotion } from './packet.js';

/** Parts of a report that differ between runs of one state for reasons that are not the bug: the build, the device's memory and speed, time. */
export const VOLATILE = ['findings', 'errors', 'health', 'page.commit', 'page.build', 'page.device', 'motion'];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const nameOf = (v) => (isObj(v) ? v.id ?? v.name ?? v.key ?? v.text : undefined);
const near = (a, b, tol) => Math.abs(a - b) <= tol + 0.005 * Math.max(Math.abs(a), Math.abs(b));
const ignored = (path, ignore) => ignore.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));

/**
 * The differences between two reports as [{ path, a, b }], at most `max`. Lists whose items carry an id, name, key or text are matched by it (an item that came or
 * went is one difference, not a shift of every item after it); other lists by position. Numbers within `tol` (and half a percent) are the same.
 */
export function diffScreens(a, b, { ignore = VOLATILE, tol = 0.02, max = 60 } = {}) {
  const out = [];
  const walk = (x, y, path) => {
    if (out.length >= max || ignored(path, ignore)) return;
    if (typeof x === 'number' && typeof y === 'number') { if (!near(x, y, tol)) out.push({ path, a: x, b: y }); return; }
    if (Array.isArray(x) && Array.isArray(y)) {
      const named = x.concat(y).every((v) => nameOf(v) !== undefined);
      if (named && x.length + y.length > 0) {
        const mx = new Map(x.map((v) => [String(nameOf(v)), v])), my = new Map(y.map((v) => [String(nameOf(v)), v]));
        for (const k of new Set([...mx.keys(), ...my.keys()])) {
          const p = `${path}[${k}]`;
          if (!my.has(k)) { if (!ignored(p, ignore)) out.push({ path: p, a: mx.get(k), b: undefined }); } else if (!mx.has(k)) { if (!ignored(p, ignore)) out.push({ path: p, a: undefined, b: my.get(k) }); } else walk(mx.get(k), my.get(k), p);
        }
      } else for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`);
      return;
    }
    if (isObj(x) && isObj(y)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path ? `${path}.${k}` : k); return; }
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path, a: x, b: y });
  };
  walk(a ?? {}, b ?? {}, '');
  return out;
}

const shorten = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'absent' : s.length > 60 ? `${s.slice(0, 57)}...` : s; };
/** One line per difference, for the replay's report. */
export const diffLines = (d) => d.map((x) => `${x.path}: ${shorten(x.a)} -> ${shorten(x.b)}`);

/**
 * Findings before and after: `still` (in both), `fixed` (only before), `introduced` (only after). A finding is the same one when its rule and what it is about match;
 * a `still` one whose `where` changed is marked `changed` (a fix that made it smaller is progress, not done).
 */
export function compareFindings(before, after) {
  const bk = new Map((before || []).map((f) => [findingKey(f), f])), ak = new Map((after || []).map((f) => [findingKey(f), f]));
  const still = [], fixed = [], introduced = [];
  for (const [k, f] of bk) { if (ak.has(k)) still.push({ ...ak.get(k), changed: (ak.get(k).where || '') !== (f.where || '') ? { was: f.where || '' } : undefined }); else fixed.push(f); }
  for (const [k, f] of ak) if (!bk.has(k)) introduced.push(f);
  return { still, fixed, introduced };
}

/** The findings that can come back from a replayed state (not those of the recorded motion). */
export const stateFindings = (list) => (list || []).filter((f) => !isMotion(f));
