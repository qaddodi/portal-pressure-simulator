// Slide charts drawn on the GPU (Mohammad, 1 Nov 2026: "Move. Everything. To. GPU."; "Always go to 100% GPU").
//
// The deck's charts (the talk so far, the curves, the courses, the flows) were built as SVG and painted by the browser. Their builders
// keep their code: they write the same tree with the same classes and numbers, but through svgModel, which makes plain (HTML) elements
// of the same names, never SVG. The tree is a model: it sits in the chart's box hidden ([hidden], nothing laid out or painted), so the
// stylesheet still decides each piece's look (its class, its data-rate, the theme), and svg-morph.js still pairs and glides its pieces
// between two drawings, writing their numbers as it always did. What the page shows is a GPU picture of it (createSvgGL): each piece's
// look is read once, as a drawing is placed (and between frames, in a rest pass, when the theme changes); every frame of a glide or a fade then
// draws the model's numbers as they stand, through the charts' shared GPU context (trace-gl.js: its strokes, fills, clips and words).
//
// Drawn: g (its transform and opacity), line, path, rect (rx), circle, ellipse, polyline, polygon, text and its tspans (anchor, weight,
// size, letter spacing, upper case, a stroke laid under the fill: paint-order), clip-path to a clipPath of rects or paths, stroke dashes,
// round or butt ends, fill and stroke opacity, visibility, display none, vector-effect non-scaling-stroke. A drawing's viewBox is mapped to
// the box as SVG maps it (preserveAspectRatio none, or meet in the middle). The picture covers the box exactly.

import { createTraceGL, fitPen } from './trace-gl.js?v=8de977450f';
import { flattenPath, elBox } from './shape-gl.js?v=d13987be06';
import { finalFrameFor, easeNow } from './frame.js?v=26e2e46fff';
import { restPass } from './rest-pass.js?v=ed71462b47';
import { cssCurve, D_SURFACE, EASE_ARRIVE } from './ease.js?v=7513a88c68';
import { cssColor } from './css-color.js?v=e56f0c77ae';
import { morphSvg } from './svg-morph.js?v=979224c12c';

// (No bleed: a picture reaching past the box counts as overflow, and the card's fit then shrank the whole card to take it in.)
export const BLEED = 0;
const TAGS = { title: 'x-title' };   // (an HTML <title> in the body would be the page's own; the tooltip's words are kept, not shown)

/** An element of a chart's model: the SVG builder's sv(tag, attrs, ...kids), as plain elements. The root <svg> is marked and hidden. */
export function svgModel(tag, attrs = {}, ...kids) {
  const el = document.createElement(TAGS[tag] || tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k);
  if (tag === 'svg') { el.setAttribute('data-svg-model', ''); el.hidden = true; }
  return el;
}

// A piece's words changed in a frame (a value that counts as a chart glides): kept on the piece, not written into it, so no text node
// is made, no mutation is seen and nothing is read again for it; the picture draws them from there. (2 Nov 2026, "Move everything to GPU".)
/** Sets the words a model's text piece shows; a piece given words this way draws them alone, over any children it had. */
export function setWords(el, t) { t = String(t); if (wordsOf(el) !== t) el._t = t; }
/** The words a model's text piece shows now. */
export const wordsOf = (el) => el._t ?? el.textContent;

// The fades svg-morph runs on a model's pieces (their Web Animations), so a frame can draw each piece at the strength it has now from
// the animation's own clock and keyframes, with nothing asked of the page.
const FADES = new WeakMap();
/** svg-morph.js: a fade it started on a piece (opacity from → to, after delay, over ms, on easing). */
export function noteFade(el, anim, from, to, delay, ms, easing) { FADES.set(el, { anim, from, to, delay, ms, ease: cssCurve(easing) }); }
function fadeOf(el) {
  const f = FADES.get(el);
  if (!f) return null;
  const a = f.anim;
  if (!a || a.playState === 'idle') { FADES.delete(el); return null; }
  const t = typeof a.currentTime === 'number' ? a.currentTime : 0, k = f.ms > 0 ? Math.max(0, Math.min(1, (t - f.delay) / f.ms)) : 1;
  return f.from + (f.to - f.from) * f.ease(k);
}

// A piece a teaching scene keeps moving for as long as it shows (albumin drifting in a lumen, a pulse along a flow): its strength and its
// offset at each moment of a loop, drawn by the picture from the frame's clock, never a keyframe animation the page runs on SVG (2 Nov
// 2026, "Move everything to GPU"). spec: { ms (one turn), delay (ms), alternate, op(k) (its strength, 0 to 1), xy(k) ([x, y] in the
// drawing's units) }, k the turn's place, 0 to 1. A drawing with a loop in it is drawn every frame while it is on the page.
const LOOPS = new WeakMap();
/** Keeps `el` moving on a loop in the picture (see above). */
export function noteLoop(el, spec) { LOOPS.set(el, { t0: easeNow() + (spec.delay || 0), ...spec }); }
function loopAt(lp, now) {
  if (now < lp.t0) return 0;
  const n = (now - lp.t0) / lp.ms, f = n - Math.floor(n);
  return lp.alternate && Math.floor(n) % 2 ? 1 - f : f;
}

// ── A piece's look ──
// The stylesheet's word is the computed style. A model's elements are not SVG, so an attribute such as text-anchor="end" or fill="…" is
// not a presentation hint to the page: it is taken here as SVG takes it, under any rule of the stylesheet (a value the stylesheet left as
// it came down from the parent, or at its initial value, gives way to the attribute) and inherited by the children as SVG inherits it.
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
// [CSS property, attribute, inherited, initial]
const PROPS = [['fill', 'fill', true, 'rgb(0, 0, 0)'],   // colour-exempt: SVG's initial fill, to tell the stylesheet's from it
  ['stroke', 'stroke', true, 'none'], ['strokeWidth', 'stroke-width', true, '1px'], ['opacity', 'opacity', false, '1'],
  ['fillOpacity', 'fill-opacity', true, '1'], ['strokeOpacity', 'stroke-opacity', true, '1'], ['strokeDasharray', 'stroke-dasharray', true, 'none'],
  ['strokeDashoffset', 'stroke-dashoffset', true, '0px'], ['strokeLinecap', 'stroke-linecap', true, 'butt'], ['strokeLinejoin', 'stroke-linejoin', true, 'miter'],
  ['fontSize', 'font-size', true, null], ['fontWeight', 'font-weight', true, '400'], ['textAnchor', 'text-anchor', true, 'start'], ['letterSpacing', 'letter-spacing', true, 'normal'],
  ['textTransform', 'text-transform', true, 'none'], ['paintOrder', 'paint-order', true, 'normal'], ['visibility', 'visibility', true, 'visible'], ['display', 'display', false, null],
  ['vectorEffect', 'vector-effect', false, 'none'], ['dominantBaseline', 'dominant-baseline', true, 'auto'],
  ['stopColor', 'stop-color', false, 'rgb(0, 0, 0)'], ['stopOpacity', 'stop-opacity', false, '1']];   // colour-exempt: a gradient stop's initial colour
/** The properties a model's look reads, by their CSS names (the unit tests keep the list whole). */
export const LOOK_PROPS = PROPS.map((q) => q[0]);
const ATTRS = new Set(PROPS.map((q) => q[1]).concat(['font-size']));
// (A colour as the GPU's words and lines take it: rgba(), whatever form the page computed it in: oklab() from a color-mix, color(srgb …).)
const rgbaOf = (c) => {
  if (!c || c === 'none' || /^url\(/.test(c)) return c;
  const [r, g, b, a] = cssColor(c);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};
function resolve(el, parentRaw, parentOut) {
  const cs = getComputedStyle(el), raw = {}, o = {};
  for (const [k, attr, inh, init] of PROPS) {
    const v = cs[k];
    raw[k] = v;
    const css = parentRaw ? (inh ? v !== parentRaw[k] : v !== init) : true;   // (the stylesheet set it on this element)
    const a = el.getAttribute(attr);
    if (!css && a != null && a !== '') { o[k] = a; if (attr === 'opacity' || attr === 'stop-color') o[`@${attr}`] = true; }
    else if (!css && inh && parentOut) o[k] = parentOut[k];
    else o[k] = v;
    if (attr === 'text-anchor' && !css) o['@text-anchor'] = true;   // (the stylesheet leaves it to the attribute, which a frame may move)
  }
  // (A drawing's own root is never hidden by the page round it: a card hidden while it slides in hides the picture with it, and its
  // looks, read then, would have kept every piece hidden after.)
  if (!parentRaw) o.visibility = 'visible';
  return { raw, o, cs };
}
function lookOf(o, size) {
  const fs = /em$/.test(String(o.fontSize)) ? num(o.fontSize) * size : num(o.fontSize, size || 12);
  return {
    fill: rgbaOf(o.fill), stroke: rgbaOf(o.stroke), sw: num(o.strokeWidth, 1), op: num(o.opacity, 1), fo: num(o.fillOpacity, 1), so: num(o.strokeOpacity, 1),
    dash: o.strokeDasharray && o.strokeDasharray !== 'none' ? String(o.strokeDasharray).split(/[\s,]+/).map((v) => num(v)).filter((v) => v >= 0) : null,
    dashOff: num(o.strokeDashoffset), cap: o.strokeLinecap, join: o.strokeLinejoin,
    size: fs, weight: num(o.fontWeight, 400) || (o.fontWeight === 'bold' ? 700 : 400), anchor: o.textAnchor, ls: o.letterSpacing === 'normal' ? 0 : /em$/.test(String(o.letterSpacing)) ? num(o.letterSpacing) * fs : num(o.letterSpacing),
    upper: o.textTransform === 'uppercase', strokeFirst: /^stroke/.test(o.paintOrder || ''), hidden: o.visibility === 'hidden' || o.visibility === 'collapse',
    none: o.display === 'none', fixed: o.vectorEffect === 'non-scaling-stroke', base: o.dominantBaseline,
    stop: rgbaOf(o.stopColor), stopOp: num(o.stopOpacity, 1),
    // (a strength or a stop's colour the chart writes as an attribute, each frame of its glide: read from the piece as it stands)
    opAttr: !!o['@opacity'], stopAttr: !!o['@stop-color'], anchorAttr: !!o['@text-anchor'],
  };
}
const looks = new WeakMap();
// A piece whose strength the stylesheet changes (a class on or off: a ring, a value, a name) and eases (its transition on opacity): the
// picture runs that ease itself, from the strength it drew to the new one, on the stylesheet's duration and curve, since a model is never
// styled by the page and its own transition would not run. [from, to, t0, ms, ease]
const EASES = new WeakMap();
const easeAt = (e, now) => { const k = e.ms > 0 ? Math.max(0, Math.min(1, (now - e.t0) / e.ms)) : 1; return { v: e.from + (e.to - e.from) * e.ease(k), done: k >= 1 }; };
const secs = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? (/ms$/.test(String(v).trim()) ? n : n * 1000) : 0; };
function opEase(cs, prop = 'opacity') {
  const ps = String(cs.transitionProperty || '').split(','), i = ps.findIndex((q) => q.trim() === prop || q.trim() === 'all');
  if (i < 0) return null;
  const pick = (v) => { const l = String(v || '').split(/,(?![^(]*\))/); return l[i % l.length]; };
  const ms = secs(pick(cs.transitionDuration));
  return ms > 0 ? { ms, delay: secs(pick(cs.transitionDelay)), ease: cssCurve(pick(cs.transitionTimingFunction)?.trim() || 'ease') } : null;
}
// (A piece's look by what the stylesheet sees of it, under its parent's: a chart that builds its pieces again (a redraw, a frame of its
// glide) takes each one's look from the one before with the same classes, attributes and parent, never asking the page in a frame.)
const URL_ID = /url\(#[^)]*\)/g, LIVE_ATTRS = new Set(['opacity', 'stop-color', 'text-anchor']);   // (a drawing's own ids, made afresh each time, and what is read live)
const STYLE_MOTION = /(^|;)\s*(opacity|transform)\s*:[^;]*/g;
function keyOf(el, pk) {
  let k = `${pk}>${el.localName}.${el.getAttribute('class') || ''}`;
  for (const a of el.attributes) {
    const n = a.name;
    if (n === 'style') k += `|s:${a.value.replace(STYLE_MOTION, '').replace(URL_ID, 'url(#)')}`;
    else if (n.startsWith('data-') ? n !== 'data-points' && n !== 'data-of' && n !== 'data-ring' && n !== 'data-bars' && n !== 'data-pos' && n !== 'data-body' : ATTRS.has(n) && !LIVE_ATTRS.has(n)) k += `|${n}=${a.value.replace(URL_ID, 'url(#)')}`;
  }
  return k;
}
// Looks read once are kept for every chart, by the piece's key under where its box stands in the page (the classes of the box and its
// ancestors, the theme): the next slide's chart, built in the task that changes the slide, takes the looks of the pieces like it already
// read, and only a new kind of piece asks the page (2 Nov 2026: the charts asked the page about 230 times in a slide change). Dropped
// on a new theme or palette and on a resize (the stylesheet's media queries).
export const FIRST_LOOK = true;   // (switch deleted; kept for tool-profile.js until its own pass)
const SHARED = new Map(), SCALE_VARS = ['--svk', '--pzh', '--ch-cap', '--s-cap'];
export const sharedLooks = () => SHARED;
function clearShared() { SHARED.clear(); ROOTS.clear(); }
const ROOTS = new Map();   // (place key → the keys its roots' shared looks are kept by)
/** Drops the shared looks of the roots of every box standing at place key pk. */
function dropRoots(pk) { const ks = ROOTS.get(pk); if (ks) { ks.forEach((k) => SHARED.delete(k)); ROOTS.delete(pk); } }
if (typeof addEventListener === 'function') addEventListener('resize', () => clearShared());
// (A box's own inline style, and each ancestor's, minus what only moves it: a type size or a scale set there is part of where it stands.)
const STYLE_PLACE = /(^|;)\s*(opacity|transform|translate|scale|rotate|clip-path|will-change|transition[\w-]*)\s*:[^;]*/g;
/** Where a box stands, for the shared looks: its own and its ancestors' tags, classes, data attributes (the theme and palette among
 *  them) and inline styles (less their motion). Nothing is read from the page's style or layout. */
export function placeKey(box) {
  let k = '';
  for (let n = box; n && n.nodeType === 1; n = n.parentElement) {
    const st = (n.getAttribute('style') || '').replace(STYLE_PLACE, '').replace(/[;\s]+$/, '');
    let d = '';
    for (const a of n.attributes) if (a.name.startsWith('data-')) d += `|${a.name}=${a.value}`;
    k = `${n.localName}.${n.getAttribute('class') || ''}${st ? `{${st}}` : ''}${d ? `[${d}]` : ''}>${k}`;
  }
  return k;
}
/** Reads the looks of a model's pieces; returns the longest ease it started (ms), 0 for none. Fresh: as a new drawing, nothing eased.
 *  shared: the box's place key, to take looks already read for a piece like it there (SHARED) and keep the ones read. */
function readLooks(root, fresh = false, cache = null, shared = '') {
  const now = easeNow();
  let longest = 0;
  if (SHARED.size > 20000) clearShared();
  const walk = (el, pr, po, pk) => {
    let key = cache || shared ? keyOf(el, pk) : '';
    // (A drawing's root takes from the page round it (its type size, colours, the scale its words take); what it took is in the key its
    // pieces are kept by, so a piece's look sized in em, or by the card's own scale, is never taken from another size. A root is taken
    // from the shared looks only for a box standing in the same place (placeKey), and dropped when that box changes size (rootsOf).)
    const hit = shared && (pr || fresh) ? SHARED.get(key) : null;   // (a look read again because something changed reads its root)
    let raw, o, L;
    if (hit) { ({ raw, o, L } = hit); if (!pr && hit.full) { if (cache) cache.set(key, { raw, o, L, full: hit.full }); key = hit.full; } }
    else {
      const r = resolve(el, pr, po);
      raw = r.raw; o = r.o;
      L = lookOf(o, num(raw.fontSize, 12));
      L.tr = opEase(r.cs); L.trT = opEase(r.cs, 'transform');
      if (shared && !pr) {
        const plain = key;
        key += `|${PROPS.map(([k]) => raw[k]).join('|')}|${SCALE_VARS.map((v) => r.cs.getPropertyValue(v)).join('|')}`;
        if (cache) cache.set(plain, { raw, o, L, full: key });   // (a drawing built again in a frame finds its root by its plain key: adoptLooks)
        SHARED.set(plain, { raw, o, L, full: key });
        let ks = ROOTS.get(shared); if (!ks) ROOTS.set(shared, ks = new Set()); ks.add(plain);
      }
      if (shared) SHARED.set(key, { raw, o, L });
    }
    const was = looks.get(el), tr = L.tr;
    if (fresh) { EASES.delete(el); INLINE.delete(el); MOVES.delete(el); }
    else if (was && was.op !== L.op && !el.style.opacity) {
      const e = EASES.get(el), shown = e ? easeAt(e, now).v : was.op;
      if (tr && shown !== L.op) { EASES.set(el, { from: shown, to: L.op, t0: now + tr.delay, ms: tr.ms, ease: tr.ease }); longest = Math.max(longest, tr.delay + tr.ms); }
      else EASES.delete(el);
    }
    looks.set(el, L);
    if (cache) cache.set(key, { raw, o, L });
    for (const c of el.children) walk(c, raw, o, key);
  };
  walk(root, null, null, shared ? `${shared}root` : 'root');
  return longest;
}
/** A model's pieces given the looks of the pieces before them with the same key (cache), with no page read; false if one has none yet. */
function adoptLooks(root, cache, pk = 'root', into = null) {
  let all = true;
  const walk = (el, pk) => {
    const key = keyOf(el, pk), hit = cache.get(key);
    if (hit) { const was = looks.get(el); if (was !== hit.L) looks.set(el, hit.L); if (into) into.set(key, hit); } else all = false;
    for (const c of el.children) walk(c, hit?.full || key);
  };
  walk(root, pk);
  return all;
}
// (A strength the chart sets on a piece inline (style.opacity, each frame of its own glide or once, as a stent's ring comes): read as it
// stands, and eased as the page would ease it when the piece's stylesheet has a transition on opacity.)
const INLINE = new WeakMap();
let easing = false;   // (a piece is still easing: the picture draws the next frame too)
function opNow(el, L0, now) {
  const L = L0.opAttr ? { ...L0, op: num(el.getAttribute('opacity'), 1) } : L0;
  const so = el.style.opacity;
  if (so) {
    const v = num(so, 1), was = INLINE.get(el);
    INLINE.set(el, v);
    if (was != null && was !== v && L.tr) {
      const e = EASES.get(el), shown = e ? easeAt(e, now).v : was;
      EASES.set(el, { from: shown, to: v, t0: now + L.tr.delay, ms: L.tr.ms, ease: L.tr.ease });
    } else if (was == null || !L.tr) EASES.delete(el);
    if (!EASES.has(el)) return v;
  } else if (INLINE.has(el)) {   // (an inline strength taken off: back to the stylesheet's, eased the same way)
    const was = INLINE.get(el), e0 = EASES.get(el), shown = e0 ? easeAt(e0, now).v : was;
    INLINE.delete(el);
    if (L.tr && shown !== L.op) EASES.set(el, { from: shown, to: L.op, t0: now + L.tr.delay, ms: L.tr.ms, ease: L.tr.ease }); else EASES.delete(el);
  }
  const e = EASES.get(el);
  if (!e) return L.op;
  const r = easeAt(e, now);
  if (r.done) EASES.delete(el); else easing = true;
  return now < e.t0 ? e.from : r.v;
}
/** A piece shown at its strength now, with no ease from the one before (a new vessel drawn at once, its stent's ring with it). */
export function snapOp(el) { EASES.delete(el); INLINE.delete(el); }
// (A piece the chart moves inline (style.transform, translate in px: a case's dot, a zone's words): drawn there, and glided there on the
// piece's transition on transform, as the page would, from where it stood.) [x, y] of the translate; a move { from, to, t0, ms, ease }.
const MOVES = new WeakMap();
const trXY = (t) => { const m = /translate\(\s*(-?[\d.]+)(?:px)?\s*,?\s*(-?[\d.]+)?(?:px)?\s*\)/.exec(t || ''); return m ? [+m[1], +(m[2] ?? 0)] : null; };
function moveNow(el, L, now) {
  const xy = trXY(el.style.transform);
  if (!xy) { MOVES.delete(el); return null; }
  const r = MOVES.get(el);
  if (!r) { MOVES.set(el, { to: xy }); return xy; }
  if (r.to[0] !== xy[0] || r.to[1] !== xy[1]) {
    const from = r.ms ? at2(r, now) : r.to;
    MOVES.set(el, L.trT ? { from, to: xy, t0: now + L.trT.delay, ms: L.trT.ms, ease: L.trT.ease } : { to: xy });
  }
  const q = MOVES.get(el);
  if (!q.ms) return q.to;
  const v = at2(q, now);
  if (now - q.t0 >= q.ms) MOVES.set(el, { to: q.to }); else easing = true;
  return v;
}
function at2(q, now) { const k = q.ease(Math.max(0, Math.min(1, (now - q.t0) / q.ms))); return [q.from[0] + (q.to[0] - q.from[0]) * k, q.from[1] + (q.to[1] - q.from[1]) * k]; }

// ── Transforms ──
const mulM = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const tCache = new Map();
/** An SVG transform attribute as a matrix [a, b, c, d, e, f] (translate, rotate about a point, scale, skewX/Y, matrix), or null. */
export function transformOf(s) {
  if (!s) return null;
  let m = tCache.get(s);
  if (m !== undefined) return m;
  m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let n = null;
    if (fn === 'translate') n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (fn === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(r), si = Math.sin(r), cx = a[1] || 0, cy = a[2] || 0;
      n = [c, si, -si, c, cx - c * cx + si * cy, cy - si * cx - c * cy];
    } else if (fn === 'matrix' && a.length === 6) n = a;
    else if (fn === 'skewX') n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    if (n) m = mulM(m, n);
  }
  if (tCache.size > 512) tCache.clear();
  tCache.set(s, m);
  return m;
}

// ── Drawing a model ──
// (recs-production-120hz §9: a path's flattening kept by its d and tolerance, so a glyph drawn again, or a chart piece that did not
// change, is not parsed and flattened on every paint. Bounded: each tolerance's map is dropped whole past FLAT_MAX entries.)
const FLAT_MAX = 2048, flatCache = new Map();
function flatOf(d, tol) {
  tol = 2 ** (Math.floor(Math.log2(tol) * 4) / 4);   // (in quarter octaves, never coarser than asked: a zoom's every scale shares a few)
  let m = flatCache.get(tol);
  if (!m) { if (flatCache.size > 8) flatCache.clear(); m = new Map(); flatCache.set(tol, m); }
  let f = m.get(d);
  if (!f) { if (m.size > FLAT_MAX) m.clear(); f = flattenPath(d, tol); m.set(d, f); }
  return f;
}
const at = (el, k) => num(el.getAttribute(k));
const firstNum = (el, k) => num(String(el.getAttribute(k) || '').split(/[\s,]+/)[0]);
const paintOn = (p) => p && p !== 'none' && !/^url\(/.test(p);   // (gradient fills by url() are not drawn by any chart's model)
function shapePath(ctx, el, tag, k) {
  ctx.beginPath();
  if (tag === 'line') { ctx.moveTo(at(el, 'x1'), at(el, 'y1')); ctx.lineTo(at(el, 'x2'), at(el, 'y2')); return true; }
  if (tag === 'rect') {
    const w = at(el, 'width'), h = at(el, 'height');
    if (!(w > 0 && h > 0)) return false;
    const rx = el.hasAttribute('rx') ? at(el, 'rx') : at(el, 'ry');
    if (rx > 0) ctx.roundRect(at(el, 'x'), at(el, 'y'), w, h, Math.min(rx, w / 2, h / 2)); else ctx.rect(at(el, 'x'), at(el, 'y'), w, h);
    return true;
  }
  if (tag === 'circle') { const r = at(el, 'r'); if (!(r > 0)) return false; ctx.arc(at(el, 'cx'), at(el, 'cy'), r, 0, Math.PI * 2); return true; }
  if (tag === 'ellipse') { const rx = at(el, 'rx'), ry = at(el, 'ry'); if (!(rx > 0 && ry > 0)) return false; ctx.ellipse(at(el, 'cx'), at(el, 'cy'), rx, ry, 0, 0, Math.PI * 2); return true; }
  if (tag === 'polyline' || tag === 'polygon') {
    const v = String(el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    if (v.length < 4) return false;
    ctx.moveTo(v[0], v[1]);
    for (let i = 2; i + 1 < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
    if (tag === 'polygon') ctx.closePath();
    return true;
  }
  if (tag === 'path') {
    const d = el.getAttribute('d');
    if (!d) return false;
    for (const { pts, closed } of flatOf(d, 0.25 / Math.max(k, 0.05))) {
      if (pts.length < 2) continue;
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      if (closed) ctx.closePath();
    }
    return true;
  }
  return false;
}
// A fill or stroke by url(#id): a linear or radial gradient, as the GPU's own gradient, or a pattern, its tile drawn over the shape.
const refOf = (root, p) => { const id = /^url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(p || '')?.[1]; return id ? root.querySelector(`[id="${id}"]`) : null; };
// (A look shared between charts (keyOf drops a drawing's ids) holds the url() of the chart it was first read from, whose gradient or
// pattern is gone or is another chart's: the id is taken from the piece's own fill or stroke, or the nearest ancestor's that sets it,
// as written, never from the look. 2 Nov 2026: the profile chart's patient line, its fill and the block hatch went missing whenever the
// chart was built again with a new id and took its looks from the one before.)
const urlIn = (el, prop) => {
  const st = el.getAttribute?.('style');
  if (st) { const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(url\\([^)]*\\))`).exec(st); if (m) return m[1]; }
  const a = el.getAttribute?.(prop);
  return a && /^\s*url\(/.test(a) ? a.trim() : null;
};
export function ownPaint(el, prop, look) {
  if (!/^url\(/.test(look || '')) return look;
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) { const u = urlIn(n, prop); if (u) return u; if (n.localName === 'svg') break; }
  return look;
}
function gradientOf(ctx, g, el) {
  const user = g.getAttribute('gradientUnits') === 'userSpaceOnUse', b = user ? null : elBox(el);
  if (!user && !(b && b.width > 0 && b.height > 0)) return null;
  const pt = (ax, dflt, w, o) => { const v = g.getAttribute(ax); const n = v == null ? dflt : /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v); return user ? n : o + n * w; };
  const gr = g.localName === 'radialgradient'
    ? (() => { const cx = pt('cx', 0.5, b?.width, b?.x), cy = pt('cy', 0.5, b?.height, b?.y), r = user ? at(g, 'r') : (g.hasAttribute('r') ? parseFloat(g.getAttribute('r')) / (/%$/.test(g.getAttribute('r')) ? 100 : 1) : 0.5) * Math.max(b.width, b.height);
      return ctx.createRadialGradient(cx, cy, 0, cx, cy, r); })()
    : ctx.createLinearGradient(pt('x1', 0, b?.width, b?.x), pt('y1', 0, b?.height, b?.y), pt('x2', 1, b?.width, b?.x), pt('y2', 0, b?.height, b?.y));
  for (const st of g.children) {
    if (st.localName !== 'stop') continue;
    const S = looks.get(st), off = st.getAttribute('offset') || '0', o = /%$/.test(off) ? parseFloat(off) / 100 : parseFloat(off) || 0;
    // (A stop with no look read yet, a chart built in this frame, takes the colour it is written with: the line never draws empty.)
    const sc = S?.stopAttr || !S ? st.getAttribute('stop-color') : S?.stop;
    if (!sc) continue;
    const [r, gg, bb, a] = cssColor(sc);
    gr.addColorStop(Math.max(0, Math.min(1, o)), `rgba(${Math.round(r * 255)}, ${Math.round(gg * 255)}, ${Math.round(bb * 255)}, ${a * (S ? S.stopOp : 1)})`);
  }
  return gr;
}
function fillByRef(ctx, root, el, tag, ref, alpha, k) {
  if (ref.localName === 'lineargradient' || ref.localName === 'radialgradient') {
    const gr = gradientOf(ctx, ref, el);
    if (gr) { ctx.globalAlpha = alpha; ctx.fillStyle = gr; ctx.fill(); }
    return;
  }
  if (ref.localName !== 'pattern') return;
  const tw = at(ref, 'width'), th = at(ref, 'height'), b = elBox(el);
  if (!(tw > 0 && th > 0 && b && b.width > 0 && b.height > 0)) return;
  ctx.save();
  ctx.clip();
  const m = transformOf(ref.getAttribute('patternTransform'));
  if (m) ctx.transform(...m);
  // (The shape's box in the pattern's own space, the tiles laid over it.)
  const inv = m ? (() => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; })() : [1, 0, 0, 1, 0, 0];
  const cs = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
  const x0 = Math.floor(Math.min(...cs.map((c) => c[0])) / tw), x1 = Math.ceil(Math.max(...cs.map((c) => c[0])) / tw);
  const y0 = Math.floor(Math.min(...cs.map((c) => c[1])) / th), y1 = Math.ceil(Math.max(...cs.map((c) => c[1])) / th);
  if ((x1 - x0) * (y1 - y0) <= 20000) for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) {
    ctx.save(); ctx.translate(i * tw, j * th);
    for (const c of ref.children) paintEl(ctx, root, c, alpha, k);
    ctx.restore();
  }
  ctx.restore();
}
function paintShape(ctx, root, el, tag, L, alpha, k) {
  if (!shapePath(ctx, el, tag, k)) return;
  if (paintOn(L.fill) && tag !== 'line') { ctx.globalAlpha = alpha * L.fo; ctx.fillStyle = L.fill; ctx.fill(); }
  else if (tag !== 'line' && /^url\(/.test(L.fill || '')) { const ref = refOf(root, ownPaint(el, 'fill', L.fill)); if (ref) { fillByRef(ctx, root, el, tag, ref, alpha * L.fo, k); if (ref.localName === 'pattern') shapePath(ctx, el, tag, k); } }
  const sRef = !paintOn(L.stroke) && /^url\(/.test(L.stroke || '') ? refOf(root, ownPaint(el, 'stroke', L.stroke)) : null;
  const sGr = sRef && (sRef.localName === 'lineargradient' || sRef.localName === 'radialgradient') ? gradientOf(ctx, sRef, el) : null;
  if ((paintOn(L.stroke) || sGr) && L.sw > 0) {
    const s = L.fixed ? 1 / k : 1;
    ctx.globalAlpha = alpha * L.so; ctx.strokeStyle = sGr || L.stroke; ctx.lineWidth = L.sw * s;
    ctx.lineCap = L.cap === 'round' ? 'round' : 'butt'; ctx.lineJoin = L.join || 'miter';
    ctx.setLineDash(L.dash ? L.dash.map((v) => v * s) : []); ctx.lineDashOffset = L.dashOff * s;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
// (Words: the shim sets them at their size on the screen, turned with the transform but not scaled by it, so the size is scaled here.)
function paintText(ctx, el, L0, alpha, k) {
  const runs = [];
  let x = firstNum(el, 'x') + at(el, 'dx'), y = firstNum(el, 'y') + at(el, 'dy');
  if (el._t != null) { if (el._t) runs.push({ t: el._t, L: L0, x: null, y: null }); }
  else for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.data) runs.push({ t: n.data, L: L0, x: null, y: null }); continue; }
    if (n.nodeType !== 1 || n.localName !== 'tspan') continue;
    const L = looks.get(n) || L0;
    if (L.none) continue;
    runs.push({ t: wordsOf(n), L, x: n.hasAttribute('x') ? firstNum(n, 'x') : null, y: n.hasAttribute('y') ? firstNum(n, 'y') : null, dx: at(n, 'dx'), dy: at(n, 'dy') });
  }
  if (!runs.length) return;
  const fontOf = (L) => `${L.weight} ${(L.size * k).toFixed(2)}px Inter`;
  const widthOf = (r) => { const t = r.L.upper ? r.t.toUpperCase() : r.t; ctx.font = fontOf(r.L); return ctx.measureText(t).width / k + r.L.ls * [...t].length; };
  // (The anchor sets each chunk: a run with its own x starts a new one.)
  let i = 0;
  while (i < runs.length) {
    let j = i + 1;
    while (j < runs.length && runs[j].x == null) j++;
    const chunk = runs.slice(i, j);
    if (chunk[0].x != null) x = chunk[0].x;
    const total = chunk.reduce((s, r) => s + widthOf(r) + (r.dx || 0), 0), anchor = (L0.anchorAttr && el.getAttribute('text-anchor')) || L0.anchor;
    let cx = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x;
    // (dominant-baseline: central sits the words' middle, between Inter's ascent and descent, on y; middle, half the x-height; hanging
    // and text-before-edge, the ascent.)
    const bs = (L) => (L.base === 'central' ? 0.3638 : L.base === 'middle' ? 0.2729 : L.base === 'hanging' || L.base === 'text-before-edge' || L.base === 'text-top' ? 0.9688 : L.base === 'text-after-edge' || L.base === 'ideographic' || L.base === 'text-bottom' ? -0.2412 : 0) * L.size;
    for (const r of chunk) {
      const L = r.L, t = L.upper ? r.t.toUpperCase() : r.t;
      if (L.hidden) { cx += widthOf(r); continue; }
      cx += r.dx || 0; if (r.y != null) y = r.y; y += r.dy || 0;
      ctx.font = fontOf(L); ctx.textAlign = 'left';
      const yb = y + bs(L);
      const one = (fn) => {
        if (!L.ls) { ctx[fn](t, cx, yb); return; }
        let px = cx;
        for (const ch of t) { ctx[fn](ch, px, yb); px += ctx.measureText(ch).width / k + L.ls; }
      };
      const fillIt = () => { if (paintOn(L.fill)) { ctx.globalAlpha = alpha * L.fo; ctx.fillStyle = L.fill; one('fillText'); } };
      const strokeIt = () => { if (paintOn(L.stroke) && L.sw > 0) { ctx.globalAlpha = alpha * L.so; ctx.strokeStyle = L.stroke; ctx.lineWidth = L.sw * k; one('strokeText'); } };
      if (L.strokeFirst) { strokeIt(); fillIt(); } else { fillIt(); strokeIt(); }
      cx += widthOf(r);
    }
    i = j;
  }
}
const LEAVES = new Set(['line', 'rect', 'circle', 'ellipse', 'polyline', 'polygon', 'path']);
function clipTo(ctx, root, el, k) {
  const id = /url\(#([^)]+)\)/.exec(el.getAttribute('clip-path') || '')?.[1];
  const cp = id && root.querySelector(`[id="${id}"]`);
  if (!cp) return;
  ctx.beginPath();
  for (const c of cp.children) {
    const tag = c.localName;
    if (tag === 'rect') { const rx = at(c, 'rx'); if (rx > 0) ctx.roundRect(at(c, 'x'), at(c, 'y'), at(c, 'width'), at(c, 'height'), rx); else ctx.rect(at(c, 'x'), at(c, 'y'), at(c, 'width'), at(c, 'height')); }
    else if (tag === 'path') for (const { pts } of flattenPath(c.getAttribute('d') || '', 0.25 / Math.max(k, 0.05))) { ctx.moveTo(pts[0], pts[1]); for (let q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]); ctx.closePath(); }
  }
  ctx.clip();
}
// A mask of rectangles, a white one over the drawing with black ones cut out of it (a chart's line stopping short of its numbers): the
// clip is the white one less the black ones, the black ones first made into strips that never overlap, so the clip's winding rule cuts
// each out once. Any other mask is not drawn (the piece shows whole).
function holesOf(rs) {
  const xs = [...new Set(rs.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1], ys = rs.filter((r) => r[0] <= xa && r[2] >= xb).map((r) => [r[1], r[3]]).sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const [a, b] of ys) { if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b); else { if (cur) out.push([xa, cur[0], xb, cur[1]]); cur = [a, b]; } }
    if (cur) out.push([xa, cur[0], xb, cur[1]]);
  }
  return out;
}
function maskTo(ctx, root, el) {
  const ref = refOf(root, el.getAttribute('mask'));
  if (!ref || ref.localName !== 'mask') return;
  const kids = [...ref.children];
  if (!kids.length || kids.some((c) => c.localName !== 'rect')) return;
  const lum = (c) => { const [r, g, b] = cssColor(looks.get(c)?.fill || c.getAttribute('fill') || '#000'); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };   // colour-exempt: a mask's black
  const box = (c) => [at(c, 'x'), at(c, 'y'), at(c, 'x') + at(c, 'width'), at(c, 'y') + at(c, 'height')];
  const white = kids.filter((c) => lum(c) > 0.5);
  if (white.length !== 1 || kids.indexOf(white[0]) !== 0) return;
  const [x0, y0, x1, y1] = box(white[0]);
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
  for (const [a, b, c, d] of holesOf(kids.slice(1).map(box).filter((r) => r[2] > r[0] && r[3] > r[1]))) { ctx.moveTo(a, b); ctx.lineTo(a, d); ctx.lineTo(c, d); ctx.lineTo(c, b); ctx.closePath(); }
  ctx.clip();
}
export { holesOf };
function paintEl(ctx, root, el, alpha, k) {
  const tag = el.localName;
  if (tag === 'defs' || tag === 'clippath' || tag === 'x-title' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'mask' || tag === 'marker' || tag === 'pattern') return;
  const L = looks.get(el);
  if (!L || L.none) return;
  if (el.style.display === 'none') return;   // (a piece the chart hides inline)
  const f = fadeOf(el);
  let a = alpha * (f ?? opNow(el, L, easeNow()));
  if (a <= 0.002) return;
  const own = el.style.visibility === 'hidden' || (L.hidden && el.style.visibility !== 'visible');
  let m = transformOf(el.getAttribute('transform'));
  const mv = el.style.transform ? moveNow(el, L, easeNow()) : null, clip = el.hasAttribute('clip-path');
  if (mv) m = m ? mulM([1, 0, 0, 1, mv[0], mv[1]], m) : [1, 0, 0, 1, mv[0], mv[1]];
  const lp = LOOPS.get(el);
  if (lp) {
    easing = true;   // (drawn again next frame: a loop never ends while it shows)
    const k = loopAt(lp, easeNow()), xy = lp.xy?.(k);   // (before its delay, the loop's start)
    if (xy) m = m ? mulM([1, 0, 0, 1, xy[0], xy[1]], m) : [1, 0, 0, 1, xy[0], xy[1]];
    a *= Math.max(0, Math.min(1, lp.op ? lp.op(k) : 1));
    if (a <= 0.002) return;
  }
  const mask = el.hasAttribute('mask');
  if (m || clip || mask) { ctx.save(); if (m) ctx.transform(...m); if (clip) clipTo(ctx, root, el, k); if (mask) maskTo(ctx, root, el); }
  const kk = m ? k * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : k;
  if (tag === 'text') { if (!own) paintText(ctx, el, L, a, kk); }
  else if (LEAVES.has(tag)) { if (!own) paintShape(ctx, root, el, tag, L, a, kk); }
  else for (const c of el.children) paintEl(ctx, root, c, a, kk);
  if (m || clip || mask) ctx.restore();
}
/** The viewBox's units mapped into a box w × h: [sx, sy, tx, ty]. */
export function viewMap(vb, par, w, h) {
  const v = String(vb || '').trim().split(/[\s,]+/).map(Number);
  if (v.length !== 4 || !(v[2] > 0 && v[3] > 0)) return [1, 1, 0, 0];
  const sx = w / v[2], sy = h / v[3];
  if (/^none\b/.test(par || '')) return [sx, sy, -v[0] * sx + 0, -v[1] * sy + 0];
  const s = /slice/.test(par || '') ? Math.max(sx, sy) : Math.min(sx, sy), al = String(par || 'xMidYMid').trim();
  const fx = /xMin/.test(al) ? 0 : /xMax/.test(al) ? 1 : 0.5, fy = /YMin/.test(al) ? 0 : /YMax/.test(al) ? 1 : 0.5;
  return [s, s, (w - v[2] * s) * fx - v[0] * s + 0, (h - v[3] * s) * fy - v[1] * s + 0];
}

// ── The picture ──
const finalFrame = finalFrameFor('svg-gl');
const live = new Set();
let themeAsk = 0;
function themeRead() { themeAsk = 0; clearShared(); for (const g of live) { if (!g.box.isConnected) continue; g.relook(); } }
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(() => { clearShared(); if (!themeAsk && live.size) themeAsk = restPass(themeRead); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
}

/**
 * The GPU picture of the models in `box` (each child <svg> made by svgModel): a canvas laid over the box (class svg-gl; the box takes
 * svg-gl-box, position relative), drawn by the charts' shared context. place(root) after a model is put in the box (its look read
 * then, once; again between frames on a theme change); fadeIn(root, ms) fades a new model in; wake(ms) draws every frame for ms (a glide); paint() once.
 */
export function createSvgGL(box) {
  box.classList.add('svg-gl-box');
  const cv = document.createElement('canvas');
  cv.className = 'svg-gl';
  cv.setAttribute('role', 'img');
  box.prepend(cv);
  const g = { box, cv, gpu: null, until: 0, ask: 0, lookAsk: 0, ins: new Map() };
  live.add(g);
  // (A drawing swapped in during a frame waits off the page, pending, and is drawn from there; it joins the box between frames.)
  const models = () => { const m = [...box.children].filter((c) => c.hasAttribute?.('data-svg-model')); if (g.pending && !g.pending.isConnected) m.push(g.pending); return m; };
  const connect = () => { g.connAsk = 0; const r = g.pending; g.pending = null; if (r && !r.isConnected) box.append(r); };
  function draw() {
    g.ask = 0;
    if (!cv.isConnected) return;
    const pen = fitPen(cv, g.gpu), { ctx, w, h } = pen;
    const now = easeNow();
    easing = false;
    const bw = w - 2 * BLEED, bh = h - 2 * BLEED;
    try {
      ctx.clearRect(0, 0, w, h);
      if (!(bw > 0 && bh > 0)) return;
      for (const root of models()) {
        if (!looks.has(root)) continue;
        let a = 1;
        const fi = g.ins.get(root);
        if (fi) { const k = Math.min(1, (now - fi.t0) / fi.ms); a = fi.ease(k); if (k >= 1) g.ins.delete(root); }
        const [sx, sy, tx, ty] = viewMap(root.getAttribute('viewBox'), root.getAttribute('preserveAspectRatio'), bw, bh);
        ctx.save();
        ctx.translate(BLEED + tx, BLEED + ty); ctx.scale(sx, sy);
        for (const c of root.children) paintEl(ctx, root, c, a, Math.sqrt(sx * sy));
        ctx.restore();
      }
      const label = models().at(-1)?.getAttribute('aria-label');
      if (label && cv.getAttribute('aria-label') !== label) cv.setAttribute('aria-label', label);
    } finally { ctx.end?.(); }
    g.drawn?.(!!pen.gpu && bw > 0 && bh > 0);   // (whether the GPU drew this frame: gl-words.js shows its picture only then)
    if (now < g.until || g.ins.size || easing) g.ask = finalFrame(draw);
  }
  g.gpu = createTraceGL(cv, { redraw: () => draw() });
  // (Drawn again as its box first gets a size, or a new one: a chart built before its card was on the page drew nothing then.)
  // (A box that changes size may take another type size or scale from the stylesheet: its roots' shared looks are read again.)
  if (typeof ResizeObserver === 'function') { g.ro = new ResizeObserver(() => { if (g.pk) dropRoots(g.pk); g.paint(); }); g.ro.observe(box); }
  g.paint = () => { if (!g.ask) g.ask = finalFrame(draw); };
  g.wake = (ms) => { g.until = Math.max(g.until, easeNow() + ms); g.paint(); };
  g.cache = new Map();
  function lookRead() { g.lookAsk = 0; g.cache.clear(); g.pk = placeKey(box); let ms = 0; for (const root of models()) ms = Math.max(ms, readLooks(root, false, g.cache, g.pk)); if (ms) g.wake(ms + 20); else g.paint(); }
  g.relook = () => { if (!g.lookAsk) g.lookAsk = restPass(lookRead); };
  // (A drawing's look is read as it is placed, once, in the task that builds it (a slide's change, a resize), so its first frame draws it
  // whole: a morph hides the old drawing's pieces in that same task.)
  g.place = (root) => { live.add(g); g.cache.clear(); g.pk = placeKey(box); readLooks(root, true, g.cache, g.pk); g.paint(); };
  // (Pieces built again in a frame (a redraw, a glide): each takes the look of the piece before it like it, read from nothing; a new kind of
  // piece is read between frames, and drawn from then.)
  // (A chart's first drawing in a new box (a slide's new data card) has no looks of its own yet: it takes those read for a chart like it
  // standing in the same place (the shared looks), with no page read; a chart's own first drawing, built in the task that brings its card,
  // is placed instead (g.show), its looks read there. Its card never comes in empty with the chart popping in a moment later (Mohammad,
  // 2 Nov 2026). ?firstlook=0 off.)
  g.adopt = (root) => {
    if (adoptLooks(root, g.cache, g.pk ? `${g.pk}root` : 'root')) { g.paint(); return; }
    if (!g.cache.size) {
      const pk = placeKey(box);
      if (pk && adoptLooks(root, SHARED, `${pk}root`, g.cache)) { g.pk = pk; g.relook(); g.paint(); return; }
    }
    g.relook(); g.paint();
  };
  // (A piece fading in, in the picture, from nothing to its own strength, over ms on easing.)
  g.fadeEl = (el, ms, easing = 'ease') => { EASES.set(el, { from: 0, to: 1, t0: easeNow(), ms, ease: cssCurve(easing) }); g.wake(ms + 20); };
  // (A class or a piece changed on a model after it was placed (a value turned on, a word's pieces rebuilt): its looks are read again
  // between frames, and any ease the stylesheet gives the change is run by the picture.)
  if (typeof MutationObserver === 'function') g.mo = new MutationObserver(g.relook);
  g.mo?.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-rate'] });
  g.fadeIn = (root, ms, easing = 'ease') => { g.ins.set(root, { t0: easeNow(), ms, ease: cssCurve(easing) }); g.paint(); };
  g.noteFade = noteFade;
  // A new drawing in place of the old: each piece in both glides to its new place (svg-morph.js); where that cannot be, the new one fades
  // in over the old, which then goes (never a jump); without a fade (a new size) it simply takes over.
  g.show = (root, fade) => {
    if (g.pending) connect();
    const old = models();
    if (!fade) { old.forEach((o) => o.remove()); box.append(root); g.place(root); return; }
    if (old.length && morphSvg(old.at(-1), root)) { old.slice(0, -1).forEach((o) => o.remove()); g.place(root); return; }
    box.append(root);
    g.place(root);
    g.fadeIn(root, D_SURFACE, EASE_ARRIVE);
    setTimeout(() => { old.forEach((o) => o.remove()); g.paint(); }, 480);
  };
  // (A drawing built afresh in a frame, in place of the one before: its pieces take the looks of the ones before them like them.)
  // (Never put on the page in the frame: it is drawn from where it waits, with the looks of the pieces before it, and joins the box in a
  // rest pass, between frames, where a new kind of piece has its look read.)
  g.swap = (root) => {
    for (const o of models()) if (o !== root) o.remove();
    g.pending = root;
    if (!g.connAsk) g.connAsk = restPass(connect);
    g.adopt(root);
  };
  /** What the picture holds (the browser checks and ?perf read it): its drawings, those with their looks read, the looks kept. */
  g.stat = () => { const ms = models(); return { models: ms.length, looked: ms.filter((r) => looks.has(r)).length, pieces: ms.reduce((n, r) => n + r.querySelectorAll('*').length, 0), unlooked: ms.reduce((n, r) => n + [...r.querySelectorAll('*')].filter((e) => !looks.has(e)).length, 0), cache: g.cache.size, w: cv.width, h: cv.height }; };
  g.clear = () => { for (const o of models()) o.remove(); g.pending = null; g.paint(); };
  g.dispose = () => { live.delete(g); g.mo?.disconnect?.(); g.ro?.disconnect?.(); g.gpu?.dispose(); };
  box._svgGL = g;
  return g;
}
