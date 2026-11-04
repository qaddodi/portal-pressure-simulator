// The resolver for chart looks written in code (docs/chart-looks-in-code-plan.md §2). A piece of a chart's model that carries data-look="<key>"
// gets its look from the table (LOOKS, index.js) and the chart's context, never from the page's style. Nothing here reads a style, a
// layout or a canvas: the context is built from the attributes on <html>, two media queries and what the chart itself hands over.
//
// Order for one piece: take what the parent passes down (SVG inherits fill, stroke, font…), apply the entry's base, then each `when` row
// that matches, in list order (a later row wins; there is no specificity), then the attributes the builder wrote where the entry left a
// property alone, then turn every value into a number or a colour. The answer is shaped as the page's computed style was, so svg-gl's
// lookOf makes the same record from it: { raw, o, tr, trT }.
//
// Built for the node unit tests too: this file loads with no page.
import { mixColor, parseCssColor } from '../css-color.js';
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, cssCurve } from '../ease.js';
import { LOOKS, HOSTS } from './index.js';
import { tokensFor as themeTokens } from '../theme-tokens.js';

const MAGENTA = 'rgb(255, 0, 255)';   // colour-exempt: (a colour or a key the table lacks: seen at once in a dev build)
const warned = new Set();   // alloc-rare: one entry for each missing key or token, kept
function report(what) {
  if (warned.has(what)) return;
  warned.add(what);
  const dev = typeof location === 'object' && /[?&]debug\b/.test(location.search || '');
  if (dev) throw new Error(`chart-looks: ${what}`);
  if (typeof console === 'object') console.warn(`chart-looks: ${what}`);
}

// ── Where the theme tokens come from ──
// theme-tokens.js's tokensFor(ctx): a { name: CSS colour } map for the look (theme, palette, view) the ctx names. setTokenSource replaces it (tests).
let tokensFor = themeTokens;
const tokenMaps = new Map();   // alloc-rare: one map for each look, kept until the memo is cleared
/** Sets where tokens come from: fn(ctx) → { token name: CSS colour string }. */
export function setTokenSource(fn) { tokensFor = fn; tokenMaps.clear(); memo.clear(); }
function tokensOf(ctx) {
  const k = `${ctx.theme}|${ctx.dark}|${ctx.palette}|${ctx.view}`;
  let m = tokenMaps.get(k);
  if (!m) tokenMaps.set(k, m = tokensFor(ctx) || {});
  return m;
}

// ── The context ──
let viewNow = 'anatomic';
/** The figure's view, 'anatomic' | 'circuit' (the circuit view re-colours the dock's instruments in dark looks), for a chart that hands none of its own (local.view, set by a chart that sits inside the figure's wrap). */
export function setView(v) { if (v !== viewNow) { viewNow = v; } }
const mq = (q) => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(q).matches : false);
/**
 * The context of one chart now. local: what the chart handed over ({ host, layout, in, boxW, scale, svk }). The look comes from the
 * attributes on <html> (looks.js writes data-theme and data-palette) and the device's own dark mode, as theme-epoch.js watches them.
 * Made when a drawing is placed or its looks are read again (rest passes), never in a frame.
 */
export function makeCtx(local = null) {
  const root = typeof document === 'object' ? document.documentElement : null;
  const ra = (n) => (root && typeof root.getAttribute === 'function' ? root.getAttribute(n) : null);
  const attr = ra('data-theme');
  const dark = attr === 'dark' || (attr !== 'light' && attr !== 'soft' && mq('(prefers-color-scheme: dark)'));
  const theme = attr === 'light' || attr === 'soft' || attr === 'dark' ? attr : dark ? 'dark' : 'light';
  const l = local || {};
  const c = {
    theme, dark, palette: ra('data-palette') || 'navy', view: l.view || viewNow, motion: mq('(prefers-reduced-motion: reduce)') ? 'reduce' : 'full',
    host: l.host || '', layout: l.layout || '', in: l.in || '', boxW: l.boxW || 0, scale: l.scale || NO_SCALE, svk: l.svk || 1, fit: l.fit || 1, dk: l.dk || 1, lad: l.lad || 1, hostPx: 12, sig: '',
  };
  c.hostPx = l.px > 0 ? l.px : HOSTS[c.host] ? HOSTS[c.host](c) : 12;   // (px: the size a fitted chart is drawn in, flow-time, curve and course: its host's size, grown to keep the type readable on a zoomed card)
  c.sig = ctxSig(c);
  return c;
}
const NO_SCALE = {};
function ctxSig(c) {
  let s = `${c.theme}${c.dark ? 'd' : ''}|${c.palette}|${c.view}|${c.motion}|${c.host}|${c.layout}|${c.in}|${c.svk}|${c.fit}|${c.dk}|${c.lad}|${c.hostPx}`;
  for (const k in c.scale) s += `|${k}=${c.scale[k]}`;
  return s;
}
/** A context made from a ctx, with some fields replaced (the node tests use this to ask the same piece under another look). */
export function withCtx(c, over) { const n = { ...c, ...over }; n.sig = ctxSig(n); return n; }
/** The base type size of the chart host of ctx, what `em` means there. */
export const hostSizeFor = (ctx) => ctx.hostPx;

// ── Values ──
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const f6 = (v) => (Math.round(clamp01(v) * 1e6) / 1e6);
const colourString = (c) => `color(srgb ${f6(c[0])} ${f6(c[1])} ${f6(c[2])} / ${f6(c[3])})`;
function num(v) { return typeof v === 'number' ? v : 0; }
/** One value node to a number, a colour string, an array or an ease record, for ctx and the piece's params. */
function val(v, ctx, params) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  switch (v.k) {
    case 'tok': {
      const c = tokensOf(ctx)[v.n];
      if (c == null) { report(`no token "${v.n}" for ${ctx.theme}/${ctx.palette}/${ctx.view}`); return MAGENTA; }
      return c;
    }
    case 'param': {
      const name = params && params[v.n];
      if (name == null) { report(`no data-p-${v.n} on a piece that asks for it`); return MAGENTA; }
      const c = tokensOf(ctx)[name];
      if (c == null) { report(`no token "${name}" (data-p-${v.n}) for ${ctx.theme}/${ctx.palette}/${ctx.view}`); return MAGENTA; }
      return c;
    }
    case 'mix': {
      const m = mixColor(v.space, val(v.a, ctx, params), v.pct, val(v.b, ctx, params), v.pctB);
      if (!m) { report(`a colour mix that cannot be read (${v.space})`); return MAGENTA; }
      return colourString(m);
    }
    case 'px': return v.n;
    case 'em': return v.n * ctx.hostPx;
    case 'own': return `${v.n}em`;   // (the piece's own font size: svg-gl's lookOf takes an em letter spacing against it)
    case 'svk': return num(val(v.x, ctx, params)) * ctx.svk;
    case 'scale': {
      const s = ctx.scale[v.name];
      if (s == null) { report(`no card scale "${v.name}" in the context of host "${ctx.host}"`); return 0; }
      return s * v.m;
    }
    case 'fn': {
      const a = v.a.map((x) => num(val(x, ctx, params)));
      return v.f === 'max' ? Math.max(...a) : v.f === 'min' ? Math.min(...a) : Math.min(Math.max(a[1], a[0]), a[2]);
    }
    case 'ease': {
      const ms = typeof v.kind === 'number' ? v.kind : v.kind === 'flip' ? D_FLIP : v.kind === 'small' ? D_SMALL : D_SURFACE;
      return { ms, delay: v.delay, ease: cssCurve(v.curve || EASE_ARRIVE) };
    }
    default: return v;
  }
}

// ── An entry, read once ──
// Which params it names, whether its rows ask for the box width, and the states it declares.
const FLAGS = new WeakMap();
let widthUsed = false;
/** True once any entry that has been used asks for the chart's box width (a container query), so a box resize must read looks again. */
export const looksNeedWidth = () => widthUsed;
function scanParams(v, into) {
  if (v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) { for (const x of v) scanParams(x, into); return; }
  if (v.k === 'param') { into.add(v.n); return; }
  for (const k in v) if (typeof v[k] === 'object') scanParams(v[k], into);
}
function flagsOf(entry) {
  let f = FLAGS.get(entry);
  if (f) return f;
  const params = new Set();
  scanParams(entry.base, params);
  let usesW = false;
  for (const [cond, props] of entry.when || []) {
    scanParams(props, params);
    if ('minW' in cond || 'maxW' in cond) usesW = true;
  }
  f = { params: [...params], usesW, stateNames: Object.keys(entry.state || {}) };
  if (usesW) widthUsed = true;
  FLAGS.set(entry, f);
  return f;
}

// ── State: read off the piece or its ancestors in the model ──
const hasClass = (el, name) => {
  const c = el.getAttribute('class');
  if (!c) return false;
  for (const t of c.split(/\s+/)) if (t === name) return true;
  return false;
};
function stateOf(el, spec) {
  const cls = spec.startsWith('class:'), name = cls ? spec.slice(6) : spec;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (cls) { if (hasClass(n, name)) return true; }
    else { const v = n.getAttribute(name); if (v != null) return v; }
    if (n.hasAttribute('data-svg-model')) break;
  }
  return cls ? false : undefined;
}
const absent = (v) => v === undefined || v === false || v === '';
function same(want, have) {
  if (want === false) return absent(have);
  if (want === true) return !absent(have);
  return have === want;
}
function matches(cond, ctx, state) {
  for (const f in cond) {
    const want = cond[f];
    let have;
    switch (f) {
      case 'minW': if (!(ctx.boxW >= want)) return false; continue;
      case 'maxW': if (!(ctx.boxW <= want)) return false; continue;
      case 'dark': have = ctx.dark; break;
      case 'host': case 'layout': case 'theme': case 'palette': case 'view': case 'motion': have = ctx[f]; break;
      case 'in': have = ctx.in; break;
      default: have = state[f];
    }
    if (Array.isArray(want)) { let ok = false; for (const w of want) if (same(w, have)) { ok = true; break; } if (!ok) return false; } else if (!same(want, have)) return false;
  }
  return true;
}

// ── Applying props ──
// The names an entry is written with → the CSS property names of svg-gl's PROPS, and how each is spelled as the page's computed style was.
const CSSNAME = { fill: 'fill', stroke: 'stroke', width: 'strokeWidth', opacity: 'opacity', fillOpacity: 'fillOpacity', strokeOpacity: 'strokeOpacity', dash: 'strokeDasharray',
  dashOffset: 'strokeDashoffset', cap: 'strokeLinecap', join: 'strokeLinejoin', size: 'fontSize', weight: 'fontWeight', anchor: 'textAnchor', letterSpacing: 'letterSpacing',
  upper: 'textTransform', paintStroke: 'paintOrder', hidden: 'visibility', none: 'display', fixed: 'vectorEffect', baseline: 'dominantBaseline', stop: 'stopColor', stopOpacity: 'stopOpacity' };
const PX = new Set(['width', 'dashOffset', 'size', 'letterSpacing']);
function spell(k, v) {
  if (PX.has(k)) return typeof v === 'string' && /em$/.test(v) ? v : `${v}px`;
  switch (k) {
    case 'dash': return v && v.length ? v.join(' ') : 'none';
    case 'upper': return v ? 'uppercase' : 'none';
    case 'paintStroke': return v ? 'stroke fill markers' : 'normal';
    case 'hidden': return v ? 'hidden' : 'visible';
    case 'none': return v ? 'none' : 'inline';
    case 'fixed': return v ? 'non-scaling-stroke' : 'none';
    default: return typeof v === 'string' ? v : String(v);
  }
}
function put(P, k, v, ctx, params) {
  if (k === 'font') { put(P, 'weight', v[0], ctx, params); put(P, 'size', v[1], ctx, params); return; }
  if (k === 'halo') {   // paint-order: stroke, a stroke laid under the fill
    if (v === null) { P.paintStroke = false; return; }
    P.paintStroke = true;
    if (v.stroke !== undefined) P.stroke = val(v.stroke, ctx, params);
    if (v.width !== undefined) P.width = val(v.width, ctx, params);
    if (v.join !== undefined) P.join = val(v.join, ctx, params);
    return;
  }
  if (k === 'ease') {
    const e = P.ease || (P.ease = { opacity: null, transform: null });
    for (const c in v) e[c] = v[c] === null ? null : val(v[c], ctx, params);   // (reduced motion: a row with motion: 'reduce' sets ease: { opacity: null })
    return;
  }
  if (!(k in CSSNAME)) { report(`unknown look prop "${k}"`); return; }
  P[k] = val(v, ctx, params);
}
function apply(P, props, ctx, params) { for (const k in props) put(P, k, props[k], ctx, params); }

const memo = new Map();   // alloc-rare: key|context|state|params → the entry's own resolved props; kept until a look or a size change clears it
/** Drops the memo (a new look, a new size). The token maps go too. */
export function clearLookMemo() { memo.clear(); tokenMaps.clear(); }

/** The props an entry gives for ctx, states (name → value) and params (name → token name): own, before inheritance. */
export function resolveProps(entry, ctx, state, params) {
  const P = {};
  apply(P, entry.base || {}, ctx, params);
  if (entry.when) for (const [cond, props] of entry.when) if (matches(cond, ctx, state)) apply(P, props, ctx, params);
  return P;
}

/**
 * A model piece with data-look: { raw, o, cs: null, tr, trT } in the form svg-gl's resolve() answers. props is svg-gl's PROPS list
 * ([CSS property, attribute, inherited, initial]), parentOut the parent's `o`, ctx the chart's context (makeCtx).
 */
export function lookFor(el, ctx, parentOut, props) {
  const key = el.getAttribute('data-look');
  const entry = LOOKS[key];
  let own;
  if (!entry) { report(`no look "${key}"`); own = { fill: MAGENTA, stroke: MAGENTA }; } else {
    const f = flagsOf(entry);
    const state = {};
    let sig = '';
    for (const n of f.stateNames) { const v = stateOf(el, entry.state[n]); state[n] = v; sig += `|${v}`; }
    const params = {};
    for (const n of f.params) { const v = el.getAttribute(`data-p-${n}`); params[n] = v; sig += `|${v}`; }
    const mk = `${key}|${ctx.sig}${f.usesW ? `|w${ctx.boxW}` : ''}${sig}`;
    own = memo.get(mk);
    if (!own) { own = resolveProps(entry, ctx, state, params); if (memo.size > 4000) memo.clear(); memo.set(mk, own); }   // alloc-rare: a look is resolved once for each key, context and state
  }
  const css = {};
  for (const k in own) { const n = CSSNAME[k]; if (n) css[n] = spell(k, own[k]); }
  const o = {};
  for (const [k, attr, inh, init] of props) {
    if (k in css) { o[k] = css[k]; continue; }   // (the entry set it)
    const a = el.getAttribute(attr);
    if (a != null && a !== '') { o[k] = a; if (attr === 'opacity' || attr === 'stop-color') o[`@${attr}`] = true; }   // (the builder's attribute, where the entry left it alone)
    else if (inh && parentOut) o[k] = parentOut[k];
    else o[k] = init != null ? init : k === 'fontSize' ? `${ctx.hostPx}px` : 'inline';
    if (attr === 'text-anchor') o['@text-anchor'] = true;   // (left to the attribute, which a frame may move)
  }
  if ('textAnchor' in css) delete o['@text-anchor'];
  const e = own.ease;
  return { raw: o, o, cs: null, tr: e ? e.opacity : null, trT: e ? e.transform : null };
}

// (Exported for the unit tests: a colour string as [r, g, b, a].)
export const colourOf = (c) => parseCssColor(c);
