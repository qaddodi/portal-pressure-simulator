// Checks for what an imported or shared deck may carry into the page. Pure strings and objects (no DOM), so the
// same code runs in the app, in the notes tab's HTML and in the tests.
//
//   cleanMathML(ml)   → the equation's markup rebuilt from an allowlist of MathML elements, or null when it holds
//                       anything else (an HTML element, an event attribute, a URL, an unbalanced tag).
//   safeParamPath(p)  → whether a curve tool's `param` path names a setting (and cannot reach a prototype).
//   BAD_KEYS          → the object keys no imported path or patch may use.

export const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Equations ──
// The elements and attributes the decks' own equations use (mi, mo, mn, mtext, msub, mfrac, mrow and kin), no others.
// `math` itself is not allowed inside: the sinks supply the wrapper.
const MATH_TAGS = new Set(['mrow', 'mi', 'mn', 'mo', 'mtext', 'mfrac', 'msub', 'msup', 'msubsup', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mspace', 'mstyle']);
const MATH_VOID = new Set(['mspace']);
const CLASS_OK = /^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/;
const VARIANT_OK = new Set(['normal', 'italic', 'bold', 'bold-italic']);
const TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z-]+\s*=\s*"[^"<>&]*")*)\s*(\/?)>/y;
const ATTR = /\s+([A-Za-z-]+)\s*=\s*"([^"]*)"/g;
const ENTITY = /&(?:[A-Za-z][A-Za-z0-9]{1,31}|#[0-9]{1,7}|#x[0-9A-Fa-f]{1,6});/y;
const MAX_ML = 4000, MAX_DEPTH_ML = 24;

export function cleanMathML(ml) {
  if (typeof ml !== 'string' || !ml || ml.length > MAX_ML) return null;
  let out = '', i = 0;
  const stack = [];
  while (i < ml.length) {
    const c = ml[i];
    if (c === '<') {
      TAG.lastIndex = i;
      const m = TAG.exec(ml);
      if (!m) return null;
      const [whole, close, name, attrs, selfClose] = m;
      if (!MATH_TAGS.has(name)) return null;
      i += whole.length;
      if (close) {
        if (attrs || selfClose || stack.pop() !== name) return null;
        out += `</${name}>`;
        continue;
      }
      let clean = '';
      for (const [, k, v] of attrs.matchAll(ATTR)) {
        if (k === 'class' && CLASS_OK.test(v)) clean += ` class="${v}"`;
        else if (k === 'mathvariant' && VARIANT_OK.has(v)) clean += ` mathvariant="${v}"`;
        else return null;
      }
      if (MATH_VOID.has(name)) { if (clean) return null; out += `<${name}/>`; continue; }
      if (selfClose) return null;
      if (stack.push(name) > MAX_DEPTH_ML) return null;
      out += `<${name}${clean}>`;
    } else if (c === '&') {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(ml);
      if (!m) return null;
      out += m[0];
      i += m[0].length;
    } else if (c === '>' || c === '"' || c === "'") { out += c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; i++; } else { out += c; i++; }
  }
  return stack.length ? null : out;
}

/** A slide's eq pair [MathML, legend]: its markup cleaned, or null. */
export const cleanEq = (eq) => {
  if (!Array.isArray(eq) || eq.length < 1 || eq.length > 2) return null;
  const ml = cleanMathML(eq[0]);
  if (ml === null || (eq[1] != null && typeof eq[1] !== 'string')) return null;
  return [ml, eq[1] ?? ''];
};

// ── Curve settings ──
// A setting is a bare name from the model's parameters (cirrhosis, tr, habrStrength …) or a path inside one of its groups
// (tips.d, stenosis.TIPS, thrombus.PV_TRUNK, fibrosis.R.post, scope.air …). Every segment is a plain identifier.
const SEG = /^[A-Za-z][A-Za-z0-9_]*$/;
const GROUPS = new Set(['tips', 'dips', 'stenosis', 'thrombus', 'fibrosis', 'scope']);
const NAMES = new Set(['cirrhosis', 'gestation', 'albumin', 'habrStrength', 'splanchnicTone', 'systemicTone', 'contractility', 'tr', 'pericardial', 'apShunt']);

export function safeParamPath(p) {
  if (typeof p !== 'string' || !p || p.length > 60) return false;
  const keys = p.split('.');
  if (keys.length > 4 || !keys.every((k) => SEG.test(k) && !BAD_KEYS.has(k))) return false;
  return keys.length === 1 ? NAMES.has(keys[0]) : GROUPS.has(keys[0]);
}

/** Whether anywhere in an imported value an own key is a prototype key, or a `param` names an unsafe setting. Returns the first offending path text, or ''. */
export function unsafeIn(v, depth = 0, seen = new Set()) {
  if (!v || typeof v !== 'object' || depth > 60 || seen.has(v)) return '';
  seen.add(v);
  if (Array.isArray(v)) { for (const x of v) { const r = unsafeIn(x, depth + 1, seen); if (r) return r; } return ''; }
  for (const k of Object.keys(v)) {
    if (BAD_KEYS.has(k)) return k;
    if (k === 'param' && typeof v[k] === 'string' && !safeParamPath(v[k])) return `param “${v[k].slice(0, 40)}”`;
    const r = unsafeIn(v[k], depth + 1, seen);
    if (r) return r;
  }
  return '';
}

// ── Setting paths on a params object ──
const ownKey = (o, k) => o !== null && typeof o === 'object' && Object.hasOwn(o, k);
export const pathOf = (p) => String(p || '').split('.').filter(Boolean);
/** The value at a dotted path of a params object (own properties only; a prototype path reads nothing). */
export const getAt = (o, path) => (safeParamPath(path) ? pathOf(path).reduce((x, k) => (ownKey(x, k) ? x[k] : undefined), o) : undefined);
/** The params patch that sets path to v (a TIPS or DIPS diameter switches its shunt on), merged over also. */
export function patchOf(path, v, also = null) {
  const keys = pathOf(path), out = also ? structuredClone(also) : {};
  if (!safeParamPath(path)) return out;   // (an unsafe path, e.g. through __proto__, changes nothing)
  let at = out;
  keys.slice(0, -1).forEach((k) => { at = at[k] = ownKey(at, k) && at[k] && typeof at[k] === 'object' ? at[k] : {}; });
  at[keys.at(-1)] = v;
  if (keys.length === 2 && (keys[0] === 'tips' || keys[0] === 'dips') && keys[1] === 'd') at.on = true;
  return out;
}
/** b merged over a (objects key by key, anything else replaced), a fresh copy. */
export function mergeOf(a, b) {
  const out = a && typeof a === 'object' ? structuredClone(a) : {};
  for (const [k, v] of Object.entries(b || {})) if (!BAD_KEYS.has(k)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? mergeOf(out[k], v) : structuredClone(v);
  return out;
}
