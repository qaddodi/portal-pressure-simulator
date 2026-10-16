// Share links (#s=…) are read from a URL anyone can edit, so nothing in one is applied as it stands: keys that
// could reach an object's prototype are dropped as the JSON is read, and the view, selection, camera and
// patient are checked against what the app can show. A link the app wrote itself always passes unchanged.

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const VIEWS = new Set(['anatomic', 'circuit']);
const SEL_TYPES = new Set(['edge', 'organ', 'node', 'lobule']);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The payload of a #s= link (base64url JSON), or null if it cannot be read. */
export function parseShare(code) {
  if (typeof code !== 'string' || !code) return null;
  try {
    const json = decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))));
    const v = JSON.parse(json, (k, val) => (UNSAFE.has(k) ? undefined : val));
    return isObj(v) ? v : null;
  } catch { return null; }
}

/** Only the parts of a payload the app can use: a known patient (else healthy, with `missing` naming the unknown one), params as an object, a known view,
 *  a selection of a known kind, and a camera with finite numbers and a sane zoom. Anything else is left out. */
export function cleanShare(s, presetIds = null) {
  if (!isObj(s)) return null;
  const out = {};
  const known = (id) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id) && (!presetIds || presetIds.includes(id));
  out.preset = known(s.preset) ? s.preset : 'healthy';
  // (A patient the link names but the app does not have is reported, never swapped for another without a word.)
  if (s.preset != null && !known(s.preset)) out.missing = String(s.preset).slice(0, 60);
  if (isObj(s.params)) out.params = s.params;
  if (VIEWS.has(s.view)) out.view = s.view;
  if (isObj(s.sel) && SEL_TYPES.has(s.sel.type) && (s.sel.type === 'lobule' || typeof s.sel.id === 'string')) out.sel = s.sel;
  const c = s.cam;
  if (isObj(c) && finite(c.k) && finite(c.x) && finite(c.y) && c.k >= 0.3 && c.k <= 12 && Math.abs(c.x) < 1e5 && Math.abs(c.y) < 1e5) out.cam = { k: c.k, x: c.x, y: c.y };
  return out;
}
