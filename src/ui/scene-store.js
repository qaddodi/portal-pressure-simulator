// The scene store's looks (docs/pure-gpu-plan.md A2, step 2 on): the paint of an element of the figure (fill, stroke, opacities,
// widths, caps, dashes, clips, masks, its display and visibility) worked out in script from the page's own style rules, never asked of
// the browser (getComputedStyle). The figure's GL painters read the figure from here, so a class change on the page (a lit term, the
// patient, the look) restyles nothing that is read back: the browser's style engine is out of the picture's path.
//
// How: the style rules are read once (document.styleSheets, again only when their count changes) into buckets by the last part of
// each selector (a class, an id, a tag), as a browser does. An element's style is its matching rules' declarations in cascade order
// (presentation attributes, then the rules by specificity and order, then its own style attribute; !important above those), with
// inheritance from its parent, custom properties (var(), with fallbacks, @property's inherits and initial values), currentColor,
// color-mix() and calc() of numbers and percentages worked out here (css-color.js is the one mixer). Selector matching is the element's
// own matches(): it reads no style and no layout.
//
// What it cannot answer it does not guess: a matching rule inside @container (that needs the layout), a CSS transform, a value it does not
// read (env(), attr(), min(), revert…) make the answer null, and the caller asks the browser for that element alone, as before.
// ?scene=dom turns this off (every element asked of the browser); ?scenecheck compares every answer with the browser's and logs a difference.
//
// It loads with no page too (node unit tests): rulesFromText reads a style sheet's text into the same rules.
import { parseCssColor } from './css-color.js';
import { readStyle } from './layout-snap.js';

// ── The properties the painters read: initial value, and whether it inherits ──
const INITIAL = {
  'display': 'inline', 'visibility': 'visible', 'opacity': '1', 'fill': 'rgb(0, 0, 0)', 'stroke': 'none', 'fill-opacity': '1',   // colour-exempt: CSS initial values
  'stroke-opacity': '1', 'stroke-width': '1px', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-dasharray': 'none',
  'stroke-dashoffset': '0px', 'fill-rule': 'nonzero', 'color': 'rgb(0, 0, 0)', 'filter': 'none', 'mix-blend-mode': 'normal',   // colour-exempt: CSS initial values
  'mask': 'none', 'clip-path': 'none', 'vector-effect': 'none', 'animation-name': 'none', 'marker-start': 'none', 'marker-mid': 'none',
  'marker-end': 'none', 'paint-order': 'normal', 'shape-rendering': 'auto', 'stop-color': 'rgb(0, 0, 0)', 'stop-opacity': '1',   // colour-exempt: CSS initial values
  'transform': 'none', 'translate': 'none', 'rotate': 'none', 'scale': 'none',
};
const PROPS = Object.keys(INITIAL);
const INHERITED = new Set(['visibility', 'fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'color', 'marker-start', 'marker-mid', 'marker-end', 'paint-order', 'shape-rendering']);
const PROP_SET = new Set(PROPS);
const CAMEL = {};
for (const p of PROPS) CAMEL[p] = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
// (SVG presentation attributes the painters' properties have: below every rule in the cascade.)
const PRESENTATION = ['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'fill-rule', 'display', 'visibility', 'mask', 'clip-path', 'filter', 'color', 'stop-color', 'stop-opacity', 'vector-effect',
  'shape-rendering', 'paint-order', 'marker-start', 'marker-mid', 'marker-end'];
const COLORISH = new Set(['fill', 'stroke', 'stop-color']);
const NUMBERISH = new Set(['opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity']);
const LENGTHISH = new Set(['stroke-width', 'stroke-dashoffset']);
const TRANSFORMS = new Set(['transform', 'translate', 'rotate', 'scale']);

// ── Declarations: a property's text as written, normalised to the painters' longhands ──
/** Pushes [prop, value, important] for one declaration, if it is one the painters read (or a custom property). */
function pushDecl(out, name, value, imp) {
  name = name.trim().toLowerCase();
  value = value.trim();
  if (!value) return;
  if (name.startsWith('--')) { out.push([name, value, imp]); return; }   // alloc-rare: style rules are read once, when the sheets change
  if (PROP_SET.has(name)) { out.push([name, value, imp]); return; }   // alloc-rare: as above
  if (name === 'marker') { for (const k of ['marker-start', 'marker-mid', 'marker-end']) out.push([k, value, imp]); return; }   // alloc-rare: as above
  if (name === 'animation') { out.push(['animation-name', /^none\b/i.test(value) && !/,/.test(value) ? 'none' : value, imp]); return; }   // alloc-rare: as above
  if (name === 'mask-image') { out.push(['mask', value, imp]); return; }   // alloc-rare: as above
  if (name === 'all') out.push(['all', value, imp]);   // alloc-rare: as above
}

// ── Selectors: split, specificity, the bucket a selector's last part goes in ──
/** A selector list split at its top-level commas. */
export function splitList(sel) {
  const out = [];
  let depth = 0, q = '', at = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(sel.slice(at, i).trim()); at = i + 1; }
  }
  out.push(sel.slice(at).trim());
  return out.filter(Boolean);
}
const PSEUDO_EL = /^(before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|cue|part|slotted|-webkit-|-moz-)/i;
/** [ids, classes, types] of one complex selector (a pseudo-element: hasPE), as CSS Selectors 4 counts them. */
export function specificity(sel) {
  let a = 0, b = 0, c = 0, pe = false;
  const n = sel.length;
  let i = 0;
  const ident = () => { const s = i; while (i < n && /[\w\-\\\u00a0-\uffff]/.test(sel[i])) { if (sel[i] === '\\') i++; i++; } return sel.slice(s, i); };
  const args = () => {   // the text inside ( ), i at '('
    let d = 0, s = i + 1, q = '';
    for (; i < n; i++) {
      const ch = sel[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === '(') d++;
      else if (ch === ')') { d--; if (!d) { i++; return sel.slice(s, i - 1); } }
    }
    return sel.slice(s);
  };
  const maxOf = (list) => { let best = [0, 0, 0]; for (const s of splitList(list)) { const k = specificity(s); if (k.hasPE) pe = true; if (cmp3(k, best) > 0) best = k; } return best; };
  while (i < n) {
    const ch = sel[i];
    if (ch === '#') { i++; ident(); a++; }
    else if (ch === '.') { i++; ident(); b++; }
    else if (ch === '[') { let d = 0, q = ''; for (; i < n; i++) { const x = sel[i]; if (q) { if (x === q) q = ''; continue; } if (x === '"' || x === "'") q = x; else if (x === '[') d++; else if (x === ']') { d--; if (!d) { i++; break; } } } b++; }
    else if (ch === ':') {
      if (sel[i + 1] === ':') { i += 2; ident(); if (sel[i] === '(') args(); c++; pe = true; continue; }
      i++;
      const name = ident().toLowerCase();
      if (PSEUDO_EL.test(name) && /^(before|after|first-line|first-letter)$/.test(name)) { c++; pe = true; continue; }
      if (sel[i] === '(') {
        const inner = args();
        if (name === 'where') continue;
        if (name === 'is' || name === 'not' || name === 'has' || name === 'matches' || name === '-webkit-any') { const k = maxOf(inner); a += k[0]; b += k[1]; c += k[2]; continue; }
        if (name === 'nth-child' || name === 'nth-last-child') { b++; const m = inner.match(/\bof\s+(.+)$/i); if (m) { const k = maxOf(m[1]); a += k[0]; b += k[1]; c += k[2]; } continue; }
        b++;
        continue;
      }
      b++;
    } else if (ch === '*') i++;
    else if (/[\w\-\\]/.test(ch)) { ident(); c++; }
    else i++;
  }
  const out = [a, b, c];
  out.hasPE = pe;
  return out;
}
function cmp3(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
/** The bucket a complex selector goes in: '.class', '#id', a tag, or '*', from its last compound. */
export function bucketOf(sel) {
  let depth = 0, q = '', last = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) last = i + 1;
  }
  const comp = sel.slice(last).trim();
  // (Only the compound's own parts: never one inside :not() or :is(), which need not hold.)
  let flat = '', d = 0;
  for (const ch of comp) { if (ch === '(') d++; else if (ch === ')') d--; else if (!d) flat += ch; }
  const cls = flat.match(/\.((?:[\w-]|\\.)+)/);
  if (cls) return '.' + cls[1].replace(/\\(.)/g, '$1');
  const id = flat.match(/#((?:[\w-]|\\.)+)/);
  if (id) return '#' + id[1].replace(/\\(.)/g, '$1');
  const tag = flat.match(/^([a-zA-Z][\w-]*)/);
  if (tag) return tag[1].toLowerCase();
  return '*';
}

// ── Rules: read from the page's style sheets, or from a sheet's text ──
// A rule: { sel (one complex selector), spec, order, decls, conds: [[kind, text]] }. Registered custom properties: { name: { inherits, initial } }.
function newRules() { return { list: [], buckets: new Map(), props: Object.create(null), order: 0, bad: false }; }
function addRule(R, selText, decls, conds) {
  if (!decls.length) return;
  for (const sel of splitList(selText)) {
    const spec = specificity(sel);
    if (spec.hasPE) continue;   // (a pseudo-element's style is not the element's)
    const r = { sel, spec, order: R.order++, decls, conds };   // alloc-rare: style rules are read once, when the sheets change
    R.list.push(r);
    const k = bucketOf(sel);
    let b = R.buckets.get(k);
    if (!b) R.buckets.set(k, (b = []));   // alloc-rare: as above
    b.push(r);
  }
}
function addProperty(R, name, inherits, initial) { R.props[name] = { inherits: !!inherits, initial: initial == null ? null : String(initial).trim() }; }

/** The rules of the page's style sheets (CSSOM). */
export function rulesFromSheets(sheets) {
  const R = newRules();
  const walk = (rules, conds) => {
    for (const r of rules) {
      if (r.selectorText !== undefined && r.style) {
        const decls = [], st = r.style;
        for (let i = 0; i < st.length; i++) { const nm = st[i]; if (nm.startsWith('--')) pushDecl(decls, nm, st.getPropertyValue(nm), st.getPropertyPriority(nm) === 'important'); }
        for (const p of PROPS) { const v = st.getPropertyValue(p); if (v) pushDecl(decls, p, v, st.getPropertyPriority(p) === 'important'); }
        for (const p of ['marker', 'mask-image', 'animation', 'all']) { const v = st.getPropertyValue(p); if (v && !(p === 'mask-image' && st.getPropertyValue('mask'))) pushDecl(decls, p, v, st.getPropertyPriority(p) === 'important'); }
        addRule(R, r.selectorText, decls, conds);
        if (r.cssRules && r.cssRules.length) R.bad = true;   // (nested rules: not read here)
      } else if (r.name !== undefined && r.inherits !== undefined && r.syntax !== undefined) addProperty(R, r.name, r.inherits, r.initialValue);
      else if (r.styleSheet) { const m = r.media?.mediaText; try { walk(r.styleSheet.cssRules, m ? [...conds, ['media', m]] : conds); } catch { R.bad = true; } }
      else if (r.cssRules) {
        const ctor = r.constructor?.name || '';
        if (/Container/.test(ctor) || r.containerName !== undefined || r.containerQuery !== undefined) walk(r.cssRules, [...conds, ['container', r.conditionText || '']]);
        else if (/Media/.test(ctor) || r.media) walk(r.cssRules, [...conds, ['media', r.media?.mediaText ?? r.conditionText ?? '']]);
        else if (/Supports/.test(ctor)) walk(r.cssRules, [...conds, ['supports', r.conditionText || '']]);
        else if (/Keyframes|FontFeature|Page/.test(ctor)) continue;
        else walk(r.cssRules, [...conds, ['unknown', ctor]]);   // (@layer, @scope: the cascade they make is not read here)
      }
    }
  };
  for (const sh of sheets) {
    let rules;
    try { rules = sh.cssRules; } catch { R.bad = true; continue; }
    const m = sh.media?.mediaText;
    walk(rules, m ? [['media', m]] : []);
  }
  return R;
}

/** The text of a style sheet (or several, in order) read into rules: the node tests' way, and a sheet the page cannot read. */
export function rulesFromText(...texts) {
  const R = newRules();
  for (const t of texts) parseText(R, t.replace(/\/\*[\s\S]*?\*\//g, ''), []);
  return R;
}
/** The index of the brace that closes the one at `open`, past strings and parentheses. */
function closeOf(src, open) {
  let d = 0, q = '';
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return j; }
  }
  return src.length;
}
/** The next { or ; at the top level from i (past strings and parentheses), or -1. */
function nextStop(src, i) {
  let q = '', p = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(') p++;
    else if (c === ')') p--;
    else if (!p && (c === '{' || c === ';' || c === '}')) return j;
  }
  return -1;
}
function splitDecls(body) {
  const out = [];
  let q = '', p = 0, at = 0;
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(') p++;
    else if (c === ')') p--;
    else if (!p && c === ';') { out.push(body.slice(at, j)); at = j + 1; }
  }
  out.push(body.slice(at));
  return out;
}
function parseText(R, src, conds) {
  let i = 0;
  while (i < src.length) {
    const stop = nextStop(src, i);
    if (stop === -1) break;
    const head = src.slice(i, stop).trim().replace(/\s+/g, ' ');
    if (src[stop] === ';' || src[stop] === '}') { i = stop + 1; continue; }   // (@import, @charset: not read)
    const close = closeOf(src, stop), body = src.slice(stop + 1, close);
    i = close + 1;
    if (head.startsWith('@media')) parseText(R, body, [...conds, ['media', head.slice(6).trim()]]);
    else if (head.startsWith('@supports')) parseText(R, body, [...conds, ['supports', head.slice(9).trim()]]);
    else if (head.startsWith('@container')) parseText(R, body, [...conds, ['container', head.slice(10).trim()]]);
    else if (head.startsWith('@layer') || head.startsWith('@scope')) parseText(R, body, [...conds, ['unknown', head]]);
    else if (head.startsWith('@property')) {
      const d = {};
      for (const x of splitDecls(body)) { const k = x.indexOf(':'); if (k > 0) d[x.slice(0, k).trim()] = x.slice(k + 1).trim(); }
      addProperty(R, head.slice(9).trim(), d.inherits === 'true', d['initial-value']);
    } else if (head.startsWith('@')) continue;
    else {
      const decls = [];
      for (const x of splitDecls(body)) {
        const k = x.indexOf(':');
        if (k <= 0) continue;
        let v = x.slice(k + 1).trim(), imp = false;
        const m = v.match(/\s*!\s*important\s*$/i);
        if (m) { imp = true; v = v.slice(0, m.index); }
        pushDecl(decls, x.slice(0, k), v, imp);
      }
      addRule(R, head, decls, conds);
    }
  }
}

// ── Values: var(), calc(), colours, lengths ──
/** The index of the ) that closes the ( at `open`. */
function parenClose(s, open) {
  let d = 0, q = '';
  for (let j = open; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(') d++;
    else if (c === ')') { d--; if (!d) return j; }
  }
  return -1;
}
/** `text` with every var() replaced (lookup(name) → text or undefined), or null where a var() has neither a value nor a fallback. */
export function substitute(text, lookup) {
  if (text.indexOf('var(') < 0) return text;
  let out = '', i = 0;
  for (;;) {
    const k = text.indexOf('var(', i);
    if (k < 0) { out += text.slice(i); return out; }
    out += text.slice(i, k);
    const end = parenClose(text, k + 3);
    if (end < 0) return null;
    const inner = text.slice(k + 4, end), comma = topComma(inner);
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    let v = lookup(name);
    if (v === undefined || v === null) {
      if (comma < 0) return null;
      v = substitute(inner.slice(comma + 1).trim(), lookup);
      if (v === null) return null;
    }
    out += v;
    i = end + 1;
  }
}
function topComma(s) { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && !d) return i; } return -1; }

/** A calc() sum of numbers of one unit ('', '%', 'px', 'deg'): [value, unit], or null. */
function evalExpr(s) {
  let i = 0;
  const ws = () => { while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++; };
  const atom = () => {
    ws();
    if (s[i] === '(') { i++; const v = sum(); ws(); if (s[i] !== ')') return null; i++; return v; }
    if (s.startsWith('calc(', i)) { i += 4; return atom(); }
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|px|deg|[a-z]+)?/i.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return [parseFloat(m[1]), (m[2] || '').toLowerCase()];
  };
  const prod = () => {
    let v = atom();
    for (;;) {
      if (!v) return null;
      ws();
      const op = s[i];
      if (op !== '*' && op !== '/') return v;
      i++;
      const w = atom();
      if (!w) return null;
      if (op === '*') { if (v[1] && w[1]) return null; v = [v[0] * w[0], v[1] || w[1]]; } else { if (w[1] || !w[0]) return null; v = [v[0] / w[0], v[1]]; }
    }
  };
  function sum() {
    let v = prod();
    for (;;) {
      if (!v) return null;
      ws();
      const op = s[i];
      if (op !== '+' && op !== '-') return v;
      i++;
      const w = prod();
      if (!w) return null;
      if (v[1] !== w[1] && v[0] !== 0 && w[0] !== 0) return null;
      v = [op === '+' ? v[0] + w[0] : v[0] - w[0], v[0] === 0 ? w[1] : v[1]];
    }
  }
  const v = sum();
  ws();
  return v && i === s.length ? v : null;
}
/** Every calc() in `text` worked out (a number with its unit), or null where one cannot be. */
export function calcs(text) {
  for (;;) {
    const k = text.search(/calc\(/i);
    if (k < 0) return text;
    const end = parenClose(text, k + 4);
    if (end < 0) return null;
    const v = evalExpr(text.slice(k + 5, end));
    if (!v) return null;
    text = text.slice(0, k) + +v[0].toFixed(6) + v[1] + text.slice(end + 1);
  }
}
const UNREAD = /\b(env|attr|min|max|clamp|round|mod|rem|sin|cos|tan|sqrt|pow|hypot|log|exp|abs|sign|light-dark|var)\(|\b(revert|revert-layer)\b/i;
const colorText = (c) => `rgba(${+(c[0] * 255).toFixed(3)}, ${+(c[1] * 255).toFixed(3)}, ${+(c[2] * 255).toFixed(3)}, ${+c[3].toFixed(4)})`;
/** A colour's text (vars already substituted) with currentColor read as `cur` ([r, g, b, a]): [r, g, b, a], or null. */
function colorOf(text, cur) {
  let t = text.replace(/\bcurrentcolor\b/gi, colorText(cur));
  t = calcs(t);
  if (t === null || UNREAD.test(t)) return null;
  return parseCssColor(t);
}
/** A paint (fill, stroke) as the page computes it: 'none', 'url("#id")', or a colour; null where it cannot be read here. */
function paintOf(text, cur, prop) {
  const t = text.trim();
  if (/^none$/i.test(t)) return 'none';
  if (/^url\(/i.test(t)) {
    const m = t.match(/^url\(\s*["']?([^)"']*)["']?\s*\)\s*(.*)$/i);
    if (!m) return null;
    return `url("${m[1]}")${m[2] ? ' ' + m[2] : ''}`;
  }
  if (prop !== 'stop-color' && /^(context-fill|context-stroke)$/i.test(t)) return null;
  const c = colorOf(t, cur);
  return c ? colorText(c) : null;
}
function numberOf(text) {
  const t = calcs(text.trim());
  if (t === null) return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%)?$/i.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1]) / (m[2] ? 100 : 1);
  return String(Math.min(1, Math.max(0, v)));
}
function lengthOf(text) {
  const t = calcs(text.trim());
  if (t === null) return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px)?$/i.exec(t);
  return m ? `${+m[1]}px` : null;
}
function dashOf(text) {
  const t = calcs(text.trim());
  if (t === null) return null;
  if (/^none$/i.test(t)) return 'none';
  const parts = t.split(/[\s,]+/).filter(Boolean), out = [];
  for (const p of parts) { const l = lengthOf(p); if (l === null) return null; out.push(l); }
  return out.length ? out.join(', ') : null;
}
function urlOrNone(text) {
  const t = text.trim();
  if (/^none$/i.test(t)) return 'none';
  const m = t.match(/^url\(\s*["']?([^)"']*)["']?\s*\)$/i);
  if (m) return `url("${m[1]}")`;
  return UNREAD.test(t) ? null : t;
}

// ── The cascade ──
const RANK_PRES = 1, RANK_AUTHOR = 2, RANK_INLINE = 3, RANK_AUTHOR_IMP = 4, RANK_INLINE_IMP = 5;
/** A record shaped as the page's computed style is, for the properties the painters read, or null. */
function makeRecord(vals, vars) {
  const r = { getPropertyValue(n) { if (n.startsWith('--')) { const v = vars[n]; return v == null ? '' : v; } return vals[n] ?? ''; } };
  for (const p of PROPS) r[CAMEL[p]] = vals[p];
  return r;
}

/**
 * A style engine over `rules` (rulesFromSheets / rulesFromText). env: { media(text) → bool, supports(text) → bool }.
 * Returns { styleOf(el): record | null, begin(): forget what was worked out (call when the page may have changed) }.
 */
export function createSceneStyle(rules, env = {}) {
  const media = env.media || (() => false), supports = env.supports || (() => true);
  let memo = new Map();
  const condOk = (conds) => {
    for (const [k, t] of conds) {
      if (k === 'media') { if (!media(t)) return false; } else if (k === 'supports') { if (!supports(t)) return false; } else return null;
    }
    return true;
  };
  function matching(el) {
    const out = [];
    const take = (key) => {
      const b = rules.buckets.get(key);
      if (!b) return true;
      for (const r of b) {
        let hit;
        try { hit = el.matches(r.sel); } catch { return false; }
        if (!hit) continue;
        const ok = r.conds.length ? condOk(r.conds) : true;
        if (ok === null) return false;   // (@container, @layer: not read here)
        if (ok) out.push(r);
      }
      return true;
    };
    if (!take('*')) return null;
    if (!take(el.localName.toLowerCase())) return null;
    if (el.id && !take('#' + el.id)) return null;
    const cl = el.classList;
    if (cl) for (let i = 0; i < cl.length; i++) if (!take('.' + cl[i])) return null;
    return out;
  }
  function compute(el) {
    if (memo.has(el)) return memo.get(el);
    memo.set(el, null);   // (a cycle cannot happen up a tree; this marks the work in progress)
    const parent = el.parentElement || (el.parentNode && el.parentNode.host) || null;
    const pc = parent ? compute(parent) : null;
    if (parent && !pc) return null;
    const rs = matching(el);
    if (!rs) return null;
    // The winning declaration of each property: [value, rank, spec, order].
    const win = new Map();
    const offer = (prop, value, rank, spec, order) => {
      const w = win.get(prop);
      if (w && (w[1] > rank || (w[1] === rank && (cmp3(w[2], spec) > 0 || (cmp3(w[2], spec) === 0 && w[3] > order))))) return;
      win.set(prop, [value, rank, spec, order]);
    };
    const Z = [0, 0, 0];
    if (el.getAttribute) for (let i = 0; i < PRESENTATION.length; i++) { const v = el.getAttribute(PRESENTATION[i]); if (v != null && v !== '') offer(PRESENTATION[i], v, RANK_PRES, Z, -1); }
    for (const r of rs) for (const d of r.decls) offer(d[0], d[1], d[2] ? RANK_AUTHOR_IMP : RANK_AUTHOR, r.spec, r.order);
    const st = el.style;
    if (st && st.length) {
      const own = [];
      for (let i = 0; i < st.length; i++) { const nm = st[i]; if (nm.startsWith('--')) pushDecl(own, nm, st.getPropertyValue(nm), st.getPropertyPriority(nm) === 'important'); }
      for (const p of PROPS) { const v = st.getPropertyValue(p); if (v) pushDecl(own, p, v, st.getPropertyPriority(p) === 'important'); }
      for (const p of ['marker', 'mask-image', 'animation']) { const v = st.getPropertyValue(p); if (v && !(p === 'mask-image' && st.getPropertyValue('mask'))) pushDecl(own, p, v, st.getPropertyPriority(p) === 'important'); }
      for (const d of own) offer(d[0], d[1], d[2] ? RANK_INLINE_IMP : RANK_INLINE, Z, 0);
    }
    if (win.has('all')) return null;
    // Custom properties: the parent's (those that inherit), then the element's own, each var() in them worked out.
    const vars = Object.create(pc ? pc.vars : null);
    if (!pc) for (const n in rules.props) { const p = rules.props[n]; if (p.initial != null) vars[n] = p.initial; }
    for (const n in rules.props) { const p = rules.props[n]; if (pc && !p.inherits) vars[n] = p.initial ?? undefined; }
    const raw = new Map();
    for (const [k, w] of win) if (k.startsWith('--')) raw.set(k, w[0]);
    const doing = new Set(), done = new Map();
    const lookup = (n) => {
      if (!raw.has(n)) { const v = vars[n]; return v == null ? undefined : v; }
      if (done.has(n)) return done.get(n);
      if (doing.has(n)) return undefined;   // (a cycle: invalid)
      doing.add(n);
      let v = raw.get(n).trim();
      if (/^inherit$/i.test(v)) v = pc ? pc.vars[n] : undefined;
      else if (/^(initial|unset)$/i.test(v)) v = /^unset$/i.test(v) && pc && rules.props[n]?.inherits !== false ? pc.vars[n] : rules.props[n]?.initial ?? undefined;
      else { const s = substitute(v, lookup); v = s === null ? (rules.props[n]?.initial ?? undefined) : s; }
      doing.delete(n);
      done.set(n, v);
      return v;
    };
    for (const n of raw.keys()) vars[n] = lookup(n);
    // The painters' properties: the winning text, var()s worked out, else inherited or initial.
    const spec = {};   // (the computed text before colours are read: currentColor kept, as CSS inherits it)
    for (const p of PROPS) {
      const w = win.get(p);
      let v = w ? substitute(w[0], lookup) : undefined;
      if (w && v === null) v = 'unset';   // (invalid at computed-value time)
      if (v !== undefined) v = v.trim();
      if (v === undefined || /^unset$/i.test(v)) v = INHERITED.has(p) ? 'inherit' : 'initial';
      if (/^inherit$/i.test(v)) v = pc ? pc.spec[p] : INITIAL[p];
      else if (/^initial$/i.test(v)) v = INITIAL[p];
      if (/\b(revert|revert-layer)\b/i.test(v)) return null;
      spec[p] = v;
    }
    for (const p of TRANSFORMS) if (!/^none$/i.test(spec[p])) return null;   // (a CSS transform: laid by the browser, asked of it)
    // Values as the page computes them.
    const vals = {};
    const cur = colorOf(spec.color, pc ? pc.cur : [0, 0, 0, 1]);
    if (!cur) return null;
    vals.color = colorText(cur);
    for (const p of PROPS) {
      if (p === 'color') continue;
      const t = spec[p];
      let v;
      if (COLORISH.has(p)) v = paintOf(t, cur, p);
      else if (NUMBERISH.has(p)) v = numberOf(t);
      else if (LENGTHISH.has(p)) v = lengthOf(t);
      else if (p === 'stroke-dasharray') v = dashOf(t);
      else if (p === 'mask' || p === 'clip-path' || p.startsWith('marker-')) v = urlOrNone(t);
      else if (p === 'transform') v = transformAttr(el);
      else v = UNREAD.test(t) ? null : t.toLowerCase();
      if (v === null) return null;
      vals[p] = v;
    }
    const rec = { vals, vars, spec, cur, out: null };
    memo.set(el, rec);
    return rec;
  }
  return {
    styleOf(el) {
      if (rules.bad) return null;
      const c = compute(el);
      if (!c) return null;
      return c.out || (c.out = makeRecord(c.vals, c.vars));
    },
    begin() { memo = new Map(); },
  };
}
/** The transform attribute as the page's computed transform holds it (matrix(…)), or 'none'. */
function transformAttr(el) {
  const t = el.transform?.baseVal;
  if (!t || !t.numberOfItems) return 'none';
  const k = t.consolidate().matrix;
  return `matrix(${k.a}, ${k.b}, ${k.c}, ${k.d}, ${k.e}, ${k.f})`;
}

// ── The page's own engine ──
const PARAMS = typeof location === 'object' && location ? new URLSearchParams(location.search) : null;
const OFF = PARAMS?.get('scene') === 'dom', CHECK = PARAMS?.has('scenecheck');
let pageEngine = null, pageSig = '';
const mqls = new Map(), sups = new Map();
const pageEnv = {
  media(t) {
    if (!t || /^all$/i.test(t)) return true;
    let q = mqls.get(t);
    if (!q) mqls.set(t, (q = typeof matchMedia === 'function' ? matchMedia(t) : { matches: false }));   // alloc-rare: one list per query text, kept
    return q.matches;
  },
  supports(t) {
    let v = sups.get(t);
    if (v === undefined) { v = typeof CSS === 'object' && CSS.supports ? CSS.supports(t) : true; sups.set(t, v); }
    return v;
  },
};
/** The page's sheets' signature: their number and each one's count of rules (plate-gl adds rules to a sheet of its own). */
function sheetsSig(sheets) {
  let s = String(sheets.length);
  for (let i = 0; i < sheets.length; i++) { let n = -1; try { n = sheets[i].cssRules.length; } catch { /* (a sheet that cannot be read) */ } s += ',' + n; }
  return s;
}
function engine() {
  if (typeof document !== 'object' || !document.styleSheets) return null;
  const sheets = document.styleSheets, sig = sheetsSig(sheets);
  if (!pageEngine || sig !== pageSig) { pageSig = sig; pageEngine = createSceneStyle(rulesFromSheets(sheets), pageEnv); }
  return pageEngine;
}
const CHECK_KEYS = ['display', 'visibility', 'opacity', 'fill', 'stroke', 'fillOpacity', 'strokeOpacity', 'strokeWidth', 'strokeDasharray', 'mask', 'clipPath'];
const checked = new Set();
/** Forget the page's styles worked out so far (the start of a reading: the page may have changed since the last). */
export function sceneBegin() { if (!OFF) engine()?.begin(); }
/** The element's style as the page computes it, worked out here: a record (camelCase properties and getPropertyValue), or null (ask the browser). */
export function sceneStyle(el) {
  if (OFF || !el) return null;
  const e = engine();
  const r = e ? e.styleOf(el) : null;
  if (CHECK && r) {
    const cs = readStyle(el);   // (?scenecheck only: the comparison this engine is judged by)
    for (const k of CHECK_KEYS) {
      if (same(k, r[k], cs[k])) continue;
      const key = `${el.getAttribute('class') || el.localName}|${k}`;
      if (!checked.has(key)) { checked.add(key); console.warn(`scene-store: ${key} reads ${r[k]}, the page has ${cs[k]}`, el); }
    }
  }
  return r;
}
function same(k, a, b) {
  if (a === b) return true;
  if (k === 'fill' || k === 'stroke') { const x = parseCssColor(a), y = parseCssColor(b); if (x && y) return x.every((v, i) => Math.abs(v - y[i]) < 0.006); }
  if (k === 'opacity' || k === 'fillOpacity' || k === 'strokeOpacity' || k === 'strokeWidth') return Math.abs(parseFloat(a) - parseFloat(b)) < 1e-3;
  if (k === 'mask' || k === 'clipPath') return String(a).replace(/["']/g, '') === String(b).replace(/["']/g, '');
  return false;
}
