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

import { createTraceGL, fitPen, eraseHoles } from './trace-gl.js';
import { flattenPath, flattenCmdsInto, newFlat, elBox4 } from './shape-gl.js';
import { finalFrameFor, easeNow, cancelFrame, framePart } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { cssCurve, D_SURFACE, EASE_ARRIVE } from './ease.js';
import { cssColor } from './css-color.js';
import { morphSvg } from './svg-morph.js';
import { setGeo } from './held-geo.js';
export { setGeo };
import { attrSoon } from './class-soon.js';
import { onTheme } from './theme-epoch.js';
import { lookFor, makeCtx, clearLookMemo, hostSizeFor, looksNeedWidth } from './chart-looks/resolve.js';

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
export function setWords(el, t) {
  if (typeof t !== 'string') t = String(t);   // alloc-rare: only a value that is not already text (the callers pass text)
  if (wordsOf(el) !== t) el._t = t;
}
// A path piece's shape handed over as polylines ([{ pts, closed }], as flattenPath gives them): kept on the piece, not written as a `d`, so a
// shape that changes in a frame (a jump's day count) writes no attribute and the picture parses nothing. Draws instead of its `d`.
/** Sets the polylines a model's path piece draws; one given them draws them, not its `d`. */
export function setPolys(el, polys) { el._polys = polys; }
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
// alloc-rare: a scene loop is noted once, when its scene is built (the record is kept on the piece)
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
// (A piece takes its look from the chart-looks table, in the chart's context lc (makeCtx), by its data-look; a piece with none takes its
// attributes and its parent's, as SVG does. The page is asked nothing: docs/chart-looks-in-code-plan.md WP12.)
function resolve(el, parentRaw, parentOut, lc) {
  return lookFor(el, lc || makeCtx(), parentOut, PROPS);
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
    // (what paintText keeps on a look: its font text and the widths of the words set in it, for each of the last four scales it drew at)
    slots: null, slotN: 0,
  };
}
const looks = new WeakMap();
// A piece whose strength the stylesheet changes (a class on or off: a ring, a value, a name) and eases (its transition on opacity): the
// picture runs that ease itself, from the strength it drew to the new one, on the stylesheet's duration and curve, since a model is never
// styled by the page and its own transition would not run. [from, to, t0, ms, ease]
const EASES = new WeakMap();
// (easeAt answers in a record it keeps and writes in place; its callers read v and done at once.)
const EASED = { v: 0, done: false };
const easeAt = (e, now) => { const k = e.ms > 0 ? Math.max(0, Math.min(1, (now - e.t0) / e.ms)) : 1; EASED.v = e.from + (e.to - e.from) * e.ease(k); EASED.done = k >= 1; return EASED; };
// (A piece's ease is one record kept on it and written in place when a new ease starts: [from, to, t0, ms, ease].)
function setEase(el, from, to, t0, ms, ease) {
  let e = EASES.get(el);
  if (!e) EASES.set(el, e = { from, to, t0, ms, ease });   // alloc-rare: a piece's first ease (its record is kept and written in place after)
  else { e.from = from; e.to = to; e.t0 = t0; e.ms = ms; e.ease = ease; }
  return e;
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
const SHARED = new Map();
function clearShared() { SHARED.clear(); ROOTS.clear(); }
const ROOTS = new Map();   // (place key → the keys its roots' shared looks are kept by)
/** Drops the shared looks of the roots of every box standing at place key pk. */
function dropRoots(pk) { const ks = ROOTS.get(pk); if (ks) { ks.forEach((k) => SHARED.delete(k)); ROOTS.delete(pk); } }
// (Not on every event of a window drag: that made each chart that redrew ask the page for its looks again, the more so as the drag went
// on. Once, when the size has held for 150 ms; the charts on show look again then, as for a new theme.)
let sizeT = 0;
if (typeof addEventListener === 'function') addEventListener('resize', () => { clearTimeout(sizeT); sizeT = setTimeout(() => { sizeT = 0; if (!themeAsk) themeAsk = restPass(themeRead); }, 150); });
// (A box's own inline style, and each ancestor's, minus what only moves it: a type size or a scale set there is part of where it stands.)
const STYLE_PLACE = /(^|;)\s*(opacity|transform|translate|scale|rotate|clip-path|will-change|transition[\w-]*)\s*:[^;]*/g;
/** Where a box stands, for the shared looks: its own and its ancestors' tags, classes, data attributes (the theme and palette among
 *  them) and inline styles (less their motion). Nothing is read from the page's style or layout. */
export function placeKey(box) {
  let k = '';
  for (let n = box; n && n.nodeType === 1; n = n.parentElement) {
    const st = (n.getAttribute('style') || '').replace(STYLE_PLACE, '').replace(/[;\s]+$/, '');   // alloc-rare: a box's place is keyed when its looks are read or its drawing is first adopted (the looks cache is empty), never in a drawing frame
    let d = '';
    for (const a of n.attributes) if (a.name.startsWith('data-')) d += `|${a.name}=${a.value}`;   // alloc-rare: the same, a place key made for a new place
    k = `${n.localName}.${n.getAttribute('class') || ''}${st ? `{${st}}` : ''}${d ? `[${d}]` : ''}>${k}`;   // alloc-rare: the same, a place key made for a new place
  }
  return k;
}
/** Reads the looks of a model's pieces; returns the longest ease it started (ms), 0 for none. Fresh: as a new drawing, nothing eased.
 *  shared: the box's place key, to take looks already read for a piece like it there (SHARED) and keep the ones read. */
function readLooks(root, fresh = false, cache = null, shared = '', lc = null) {
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
      const r = resolve(el, pr, po, lc);
      raw = r.raw; o = r.o;
      L = lookOf(o, num(raw.fontSize, 12));
      L.tr = r.tr; L.trT = r.trT;
      if (shared && !pr) {
        const plain = key;
        key += `|${PROPS.map(([k]) => raw[k]).join('|')}`;
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
// (The walk is one function with its state in these three, not a closure made for each drawing.)
let adoptCache = null, adoptInto = null, adoptAll = true;
function adoptWalk(el, pk) {
  const key = keyOf(el, pk), hit = adoptCache.get(key);
  if (hit) { const was = looks.get(el); if (was !== hit.L) looks.set(el, hit.L); if (adoptInto) adoptInto.set(key, hit); } else adoptAll = false;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) adoptWalk(c, hit?.full || key);
}
function adoptLooks(root, cache, pk = 'root', into = null) {
  adoptCache = cache; adoptInto = into; adoptAll = true;
  adoptWalk(root, pk);
  const all = adoptAll;
  adoptCache = adoptInto = null;
  return all;
}
// (A strength the chart sets on a piece inline (style.opacity, each frame of its own glide or once, as a stent's ring comes): read as it
// stands, and eased as the page would ease it when the piece's stylesheet has a transition on opacity.)
const INLINE = new WeakMap();
let easing = false;   // (a piece is still easing: the picture draws the next frame too)
function opNow(el, L, now) {
  const base = L.opAttr ? num(el.getAttribute('opacity'), 1) : L.op;   // (a strength the chart writes as an attribute, read as it stands)
  const so = el.style.opacity;
  if (so) {
    const v = num(so, 1), was = INLINE.get(el);
    INLINE.set(el, v);
    if (was != null && was !== v && L.tr) {
      const e = EASES.get(el), shown = e ? easeAt(e, now).v : was;
      setEase(el, shown, v, now + L.tr.delay, L.tr.ms, L.tr.ease);
    } else if (was == null || !L.tr) EASES.delete(el);
    if (!EASES.has(el)) return v;
  } else if (INLINE.has(el)) {   // (an inline strength taken off: back to the stylesheet's, eased the same way)
    const was = INLINE.get(el), e0 = EASES.get(el), shown = e0 ? easeAt(e0, now).v : was;
    INLINE.delete(el);
    if (L.tr && shown !== base) setEase(el, shown, base, now + L.tr.delay, L.tr.ms, L.tr.ease); else EASES.delete(el);
  }
  const e = EASES.get(el);
  if (!e) return base;
  const r = easeAt(e, now);
  if (r.done) EASES.delete(el); else easing = true;
  return now < e.t0 ? e.from : r.v;
}
/** A piece shown at its strength now, with no ease from the one before (a new vessel drawn at once, its stent's ring with it). */
export function snapOp(el) { EASES.delete(el); INLINE.delete(el); }
// (A piece the chart moves inline (style.transform, translate in px: a case's dot, a zone's words): drawn there, and glided there on the
// piece's transition on transform, as the page would, from where it stood.) One record kept on the piece and written in place:
// { tx, ty (where it is going), fx, fy (where it came from), t0, ms, ease }, ms 0 when it rests. The answer is MV, [x, y], written in place.
const MOVES = new WeakMap();
const MV = [0, 0];
const TR_RE = /translate\(\s*(-?[\d.]+)(?:px)?\s*,?\s*(-?[\d.]+)?(?:px)?\s*\)/;
const trCache = new Map();   // (a transform's text -> its [x, y], or null: read once for each text)
function trXY(t) {
  if (!t) return null;
  let r = trCache.get(t);
  if (r === undefined) {
    const m = TR_RE.exec(t);   // alloc-rare: a transform text met for the first time (kept in trCache)
    r = m ? [+m[1], +(m[2] ?? 0)] : null;   // alloc-rare: the same, its numbers made once
    if (trCache.size > 256) trCache.clear();
    trCache.set(t, r);
  }
  return r;
}
function at2(q, now) {
  const k = q.ease(Math.max(0, Math.min(1, (now - q.t0) / q.ms)));
  MV[0] = q.fx + (q.tx - q.fx) * k; MV[1] = q.fy + (q.ty - q.fy) * k;
}
function moveNow(el, L, now) {
  const xy = trXY(el.style.transform);
  if (!xy) { MOVES.delete(el); return null; }
  let r = MOVES.get(el);
  if (!r) {
    MOVES.set(el, { tx: xy[0], ty: xy[1], fx: xy[0], fy: xy[1], t0: 0, ms: 0, ease: null });   // alloc-rare: a piece's first move (its record is kept and written in place after)
    MV[0] = xy[0]; MV[1] = xy[1];
    return MV;
  }
  if (r.tx !== xy[0] || r.ty !== xy[1]) {
    if (r.ms) { at2(r, now); r.fx = MV[0]; r.fy = MV[1]; } else { r.fx = r.tx; r.fy = r.ty; }
    r.tx = xy[0]; r.ty = xy[1];
    if (L.trT) { r.t0 = now + L.trT.delay; r.ms = L.trT.ms; r.ease = L.trT.ease; } else r.ms = 0;
  }
  if (!r.ms) { MV[0] = r.tx; MV[1] = r.ty; return MV; }
  at2(r, now);
  if (now - r.t0 >= r.ms) r.ms = 0; else easing = true;
  return MV;
}

/** Where a piece the chart moves inline (style.transform) is drawn now, [x, y] in MV (read it at once), or null while it has no look or move.
 *  The one answer for the picture and for a chart that draws something to follow it (a line to a dot): both read this record at the
 *  frame's clock, so they cannot differ by the frame the glide was first seen in or by the time a callback has used. */
export function moveAt(el, now = easeNow()) {
  const L = looks.get(el);
  return L && !L.none && el.style.transform ? moveNow(el, L, now) : null;
}

// ── Transforms ──
const mulM = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];   // alloc-rare: a transform text's matrix is worked out once (transformOf keeps it in tCache)
// A matrix with a translation (tx, ty) laid on the outside of it, in SM (written in place, used at once): a piece's own move or loop.
const SM = [1, 0, 0, 1, 0, 0];
function shiftM(m, tx, ty) {
  if (m) { SM[0] = m[0]; SM[1] = m[1]; SM[2] = m[2]; SM[3] = m[3]; SM[4] = m[4] + tx; SM[5] = m[5] + ty; }
  else { SM[0] = 1; SM[1] = 0; SM[2] = 0; SM[3] = 1; SM[4] = tx; SM[5] = ty; }
  return SM;
}
const tCache = new Map();
/** An SVG transform attribute as a matrix [a, b, c, d, e, f] (translate, rotate about a point, scale, skewX/Y, matrix), or null. */
export function transformOf(s) {
  if (!s) return null;
  let m = tCache.get(s);
  if (m !== undefined) return m;
  // alloc-rare: a transform text met for the first time: its matrix is worked out below and kept in tCache (the lines through the end of the loop)
  m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {   // alloc-rare: a transform text met for the first time
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);   // alloc-rare: the same
    let n = null;
    if (fn === 'translate') n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];   // alloc-rare: the same
    else if (fn === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];   // alloc-rare: the same
    else if (fn === 'rotate') {
      const r = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(r), si = Math.sin(r), cx = a[1] || 0, cy = a[2] || 0;
      n = [c, si, -si, c, cx - c * cx + si * cy, cy - si * cx - c * cy];   // alloc-rare: the same
    } else if (fn === 'matrix' && a.length === 6) n = a;
    else if (fn === 'skewX') n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];   // alloc-rare: the same
    else if (fn === 'skewY') n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];   // alloc-rare: the same
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
  if (!m) { if (flatCache.size > 8) flatCache.clear(); m = new Map(); flatCache.set(tol, m); }   // alloc-rare: a path tolerance met for the first time (quarter-octave steps; kept in flatCache)
  let f = m.get(d);
  if (!f) { if (m.size > FLAT_MAX) m.clear(); f = flattenPath(d, tol); m.set(d, f); }
  return f;
}
// (A model piece's moving numbers (a leader's ends, a ring's centre and size, a root's viewBox) are kept on the piece, not written as
// attributes: no attribute write and no mutation to watch in a frame. setGeo returns whether the value changed; the owner asks the
// picture to draw once it has set what moved. Read back with geoOf. A piece never given one reads its attribute, as before.)
// (A path's or polygon's outline held on the piece as points, not written as a `d` string: x, y pairs in a typed array the owner keeps
// and writes in place, n pairs used, closed or not; a pair with an x that is NaN lifts the pen, the next pair starts a new stretch.
// No string is made in a frame; the picture draws from the points. A piece never given points reads its `d` or `points`, as before.)
/** Sets the points a model path/polygon/polyline piece is drawn from: buf holds x, y pairs, n of them used; returns true (the owner asks the picture to draw). */
export function setPts(el, buf, n, closed = false) {
  const P = el._pts;
  // alloc-rare: a piece's first points record, made once (kept on the piece; later calls write it in place)
  if (P) { P.buf = buf; P.n = n; P.closed = closed; } else el._pts = { buf, n, closed };
  return true;
}
/** Hides or shows a model piece, held on the piece (no style written: a frame makes none); the picture skips a hidden piece. Returns true when it changed. */
export function setHidden(el, on) {
  if (!!el._hide === on) return false;
  el._hide = on;
  return true;
}
/** A model piece's held value for k, else its attribute (null when it has neither). */
export const geoOf = (el, k) => { const v = el._g?.[k]; return v !== undefined ? v : el.getAttribute?.(k) ?? null; };
const at = (el, k) => { const v = el._g?.[k]; return v !== undefined ? +v || 0 : num(el.getAttribute(k)); };
const firstNum = (el, k) => num(el.getAttribute(k));   // (parseFloat reads the first number of a list itself and stops at the space or comma after it)
const paintOn = (p) => p && p !== 'none' && !/^url\(/.test(p);   // (gradient fills by url() are not drawn by any chart's model)
// (A polyline's or polygon's points text read once for each text: its numbers, kept. Another text, as when the points glide, is read once more.)
const ptsCache = new Map();
const NO_PTS = new Float64Array(0);
function pointsOf(text) {
  if (!text) return NO_PTS;
  let v = ptsCache.get(text);
  if (v === undefined) {
    v = Float64Array.from(String(text).trim().split(/[\s,]+/).map(Number));   // alloc-rare: a points text met for the first time (kept in ptsCache)
    if (ptsCache.size > 512) ptsCache.clear();
    ptsCache.set(text, v);
  }
  return v;
}
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
  if (el._pts && (tag === 'path' || tag === 'polyline' || tag === 'polygon')) {
    const { buf, n, closed } = el._pts;
    let pen = false, drawn = 0;
    for (let i = 0; i < n; i++) {
      const x = buf[2 * i], y = buf[2 * i + 1];
      if (x !== x) { pen = false; continue; }
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      drawn++;
    }
    if (closed && drawn > 1) ctx.closePath();
    return drawn > 1;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const v = pointsOf(el.getAttribute('points'));
    if (v.length < 4) return false;
    ctx.moveTo(v[0], v[1]);
    for (let i = 2; i + 1 < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
    if (tag === 'polygon') ctx.closePath();
    return true;
  }
  if (tag === 'path') {
    const cm = el._cmds, d = cm ? null : el.getAttribute('d'), kept = el._polys;
    if (!d && !kept && !cm) return false;
    // (A curve mid-glide is held as commands (svg-morph.js) and cut here at the zoom it is drawn at, into a store kept on the piece.)
    for (const { pts, closed } of cm ? flattenCmdsInto(cm, 0.25 / Math.max(k, 0.05), el._cflat || (el._cflat = newFlat())) : kept || flatOf(d, 0.25 / Math.max(k, 0.05))) {   // alloc-rare: a piece's first store, kept on it
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
// (The node a url names is kept for each drawing and url text, and used while it is still inside the drawing; one not found is asked for again.)
const REF_RE = /^\s*url\(\s*["']?#([^"')]+)["']?\s*\)/;
const refKept = new WeakMap();
function refOf(root, p) {
  if (!p) return null;
  let m = refKept.get(root);
  const hit = m?.get(p);
  if (hit && root.contains(hit)) return hit;
  const id = REF_RE.exec(p)?.[1];   // alloc-rare: a url() met for the first time on this drawing (the node it names is kept in refKept)
  const n = id ? root.querySelector(`[id="${id}"]`) : null;   // alloc-rare: the same
  if (n) { if (!m) refKept.set(root, m = new Map()); m.set(p, n); }   // alloc-rare: the same
  return n;
}
// (A look shared between charts (keyOf drops a drawing's ids) holds the url() of the chart it was first read from, whose gradient or
// pattern is gone or is another chart's: the id is taken from the piece's own fill or stroke, or the nearest ancestor's that sets it,
// as written, never from the look. 2 Nov 2026: the profile chart's patient line, its fill and the block hatch went missing whenever the
// chart was built again with a new id and took its looks from the one before.)
// (The url a style text sets for fill or for stroke is found once for each style text and kept.)
const URL_RE = { fill: /(?:^|;)\s*fill\s*:\s*(url\([^)]*\))/, stroke: /(?:^|;)\s*stroke\s*:\s*(url\([^)]*\))/ };
const URL_OF = { fill: new Map(), stroke: new Map() };
const URL_ATTR = /^\s*url\(/;
const urlIn = (el, prop) => {
  const st = el.getAttribute?.('style');
  if (st) {
    const kept = URL_OF[prop];
    let u = kept.get(st);
    if (u === undefined) { const m = URL_RE[prop].exec(st); u = m ? m[1] : ''; if (kept.size > 256) kept.clear(); kept.set(st, u); }   // alloc-rare: a style text met for the first time (kept in URL_OF)
    if (u) return u;
  }
  const a = el.getAttribute?.(prop);
  return a && URL_ATTR.test(a) ? a : null;   // (refOf takes a url with space round it)
};
export function ownPaint(el, prop, look) {
  if (!/^url\(/.test(look || '')) return look;
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) { const u = urlIn(n, prop); if (u) return u; if (n.localName === 'svg') break; }
  return look;
}
// A gradient attribute as a number: a percentage is a share, and a bare number is in the gradient's own units (user space or the shape's box).
function gradPt(g, ax, dflt, user, w, o) {
  const v = g.getAttribute(ax), n = v == null ? dflt : /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v);
  return user ? n : o + n * w;
}
// A stop's colour text for the pen, kept on the stop for the colour and strength it was made from.
function stopCss(st, sc, op) {
  if (st._sc === sc && st._so === op) return st._sv;
  const c = cssColor(sc);
  st._sc = sc; st._so = op;
  return (st._sv = `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3] * op})`);   // alloc-rare: a stop's colour text, made when its colour or strength changes (kept on the stop)
}
// A shape's gradient is asked of the pen again for each frame, with its stops read from the page as they stand: the pen (trace-gl.js) hands
// out the same few gradient objects round and round, so a frame makes nothing, and one asked for here is good until the next frame only.
const GP = new Float64Array(6);
function gradientOf(ctx, g, el) {
  const user = g.getAttribute('gradientUnits') === 'userSpaceOnUse';
  let bx = 0, by = 0, bw = 0, bh = 0;
  if (!user) {
    const b = elBox4(el);
    if (!b) return null;
    bx = b[0]; by = b[1]; bw = b[2] - b[0]; bh = b[3] - b[1];
    if (!(bw > 0 && bh > 0)) return null;
  }
  const radial = g.localName === 'radialgradient';
  if (radial) {
    const cx = gradPt(g, 'cx', 0.5, user, bw, bx), cy = gradPt(g, 'cy', 0.5, user, bh, by);
    const r = user ? at(g, 'r') : (g.hasAttribute('r') ? parseFloat(g.getAttribute('r')) / (/%$/.test(g.getAttribute('r')) ? 100 : 1) : 0.5) * Math.max(bw, bh);
    GP[0] = cx; GP[1] = cy; GP[2] = 0; GP[3] = cx; GP[4] = cy; GP[5] = r;
  } else {
    GP[0] = gradPt(g, 'x1', 0, user, bw, bx); GP[1] = gradPt(g, 'y1', 0, user, bh, by); GP[2] = gradPt(g, 'x2', 1, user, bw, bx); GP[3] = gradPt(g, 'y2', 0, user, bh, by);
  }
  const gr = radial ? ctx.createRadialGradient(GP[0], GP[1], GP[2], GP[3], GP[4], GP[5]) : ctx.createLinearGradient(GP[0], GP[1], GP[2], GP[3]);
  // The stops, in turn, given to it as they stand.
  for (let st = g.firstElementChild; st; st = st.nextElementSibling) {
    if (st.localName !== 'stop') continue;
    const S = looks.get(st), off = st.getAttribute('offset') || '0', o = /%$/.test(off) ? parseFloat(off) / 100 : parseFloat(off) || 0;
    // (A stop with no look read yet, a chart built in this frame, takes the colour it is written with: the line never draws empty.)
    const sc = S?.stopAttr || !S ? st.getAttribute('stop-color') : S?.stop;
    if (!sc) continue;
    gr.addColorStop(Math.max(0, Math.min(1, o)), stopCss(st, sc, S ? S.stopOp : 1));
  }
  return gr;
}
// The tiles a pattern fill needs to lay over a shape's box b (x0, x1, y0, y1 in tiles, written in place): the box's four corners taken into the
// pattern's own space (m is its patternTransform, or none), and the span of them in tiles of tw x th.
const TILES = [0, 0, 0, 0];
function tileSpan(bx, by, bw, bh, m, tw, th) {
  let i0 = 1, i1 = 0, i2 = 0, i3 = 1, i4 = 0, i5 = 0;
  if (m) { const d = m[0] * m[3] - m[1] * m[2]; i0 = m[3] / d; i1 = -m[1] / d; i2 = -m[2] / d; i3 = m[0] / d; i4 = (m[2] * m[5] - m[3] * m[4]) / d; i5 = (m[1] * m[4] - m[0] * m[5]) / d; }
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (let c = 0; c < 4; c++) {
    const x = bx + (c & 1 ? bw : 0), y = by + (c & 2 ? bh : 0), px = i0 * x + i2 * y + i4, py = i1 * x + i3 * y + i5;
    xa = Math.min(xa, px); xb = Math.max(xb, px); ya = Math.min(ya, py); yb = Math.max(yb, py);
  }
  TILES[0] = Math.floor(xa / tw); TILES[1] = Math.ceil(xb / tw); TILES[2] = Math.floor(ya / th); TILES[3] = Math.ceil(yb / th);
}
function fillByRef(ctx, root, el, tag, ref, alpha, k) {
  if (ref.localName === 'lineargradient' || ref.localName === 'radialgradient') {
    const gr = gradientOf(ctx, ref, el);
    if (gr) { ctx.globalAlpha = alpha; ctx.fillStyle = gr; ctx.fill(); }
    return;
  }
  if (ref.localName !== 'pattern') return;
  const tw = at(ref, 'width'), th = at(ref, 'height'), b = elBox4(el);
  if (!(tw > 0 && th > 0 && b && b[2] - b[0] > 0 && b[3] - b[1] > 0)) return;
  const bx = b[0], by = b[1], bw = b[2] - b[0], bh = b[3] - b[1];   // (the box's array may be the one the next call writes: read at once)
  ctx.save();
  ctx.clip();
  const m = transformOf(ref.getAttribute('patternTransform'));
  if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  // (The shape's box in the pattern's own space, the tiles laid over it.)
  tileSpan(bx, by, bw, bh, m, tw, th);
  const x0 = TILES[0], x1 = TILES[1], y0 = TILES[2], y1 = TILES[3];
  if ((x1 - x0) * (y1 - y0) <= 20000) for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) {
    ctx.save(); ctx.translate(i * tw, j * th);
    for (const c of ref.children) paintEl(ctx, root, c, alpha, k);
    ctx.restore();
  }
  ctx.restore();
}
const DASH = [];   // (the scaled dash of the stroke being drawn, written in place: the pen copies it)
const NO_DASH = Object.freeze([]);
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
    // (A dashed stroke sets its dash and puts it back after; a plain one leaves the pen's dash, which is none, as it is.)
    if (L.dash) { const n = L.dash.length; DASH.length = n; for (let i = 0; i < n; i++) DASH[i] = L.dash[i] * s; ctx.setLineDash(DASH); }
    ctx.lineDashOffset = L.dashOff * s;
    ctx.stroke();
    if (L.dash) ctx.setLineDash(NO_DASH);
  }
}
// (Words: the shim sets them at their size on the screen, turned with the transform but not scaled by it, so the size is scaled here.)
// A look keeps its font text, and the widths of the words set in it, for each of the last four scales it drew at (a look is shared by the
// charts of a kind, drawn at their own scales): the widths come from the atlas's own metrics (glyph-measure.js), so they do not change
// while a scale stands. A scale it has not drawn at is a new slot, the oldest of four taken over.
function slotFor(L, k) {
  const ss = L.slots;
  if (ss) for (let i = 0; i < ss.length; i++) if (ss[i].k === k) return ss[i];
  const sl = { k, font: `${L.weight} ${(L.size * k).toFixed(2)}px Inter`, widths: new Map(), chars: new Map() };   // alloc-rare: a look's font text and width tables, made once for each scale it draws at (a zoom or a new box size)
  if (!ss) L.slots = [sl];   // alloc-rare: a look's first scale
  else if (ss.length < 4) ss.push(sl);
  else ss[L.slotN++ & 3] = sl;
  return sl;
}
const upperKept = new Map();   // (a word's upper-case text, made once for each word)
function upperOf(t) {
  let u = upperKept.get(t);
  if (u === undefined) { u = t.toUpperCase(); if (upperKept.size > 512) upperKept.clear(); upperKept.set(t, u); }   // alloc-rare: a word met for the first time (kept in upperKept)
  return u;
}
// A word's width in the drawing's units as the run sets it: its glyphs and the letter spacing between them.
function wordW(ctx, L, sl, t, k) {
  let w = sl.widths.get(t);
  if (w === undefined) {
    ctx.font = sl.font;
    w = ctx.measureText(t).width / k + L.ls * [...t].length;   // alloc-rare: a word met for the first time at this scale (kept on the look)
    if (sl.widths.size > 256) sl.widths.clear();
    sl.widths.set(t, w);
  }
  return w;
}
// One letter's width, for words with letter spacing (they are set a letter at a time).
function charW(ctx, sl, ch, k) {
  let w = sl.chars.get(ch);
  if (w === undefined) { ctx.font = sl.font; w = ctx.measureText(ch).width / k; if (sl.chars.size > 256) sl.chars.clear(); sl.chars.set(ch, w); }   // alloc-rare: a letter met for the first time at this scale (kept on the look)
  return w;
}
// The runs of the text being painted, kept and written in place: { t, L, x, y, dx, dy } (x and y null: carry on from the one before).
const RUNS = [];
let nRuns = 0;
function addRun(t, L, x, y, dx, dy) {
  let r = RUNS[nRuns++];
  if (!r) RUNS[nRuns - 1] = r = { t: '', L: null, x: null, y: null, dx: 0, dy: 0 };   // alloc-rare: the first paint that needs this many runs (the records are reused after)
  r.t = t; r.L = L; r.x = x; r.y = y; r.dx = dx; r.dy = dy;
}
const runText = (r) => (r.L.upper ? upperOf(r.t) : r.t);
// The offset from y to the baseline, by dominant-baseline: central sits the words' middle, between Inter's ascent and descent, on y;
// middle, half the x-height; hanging and text-before-edge, the ascent.
const baseShift = (L) => (L.base === 'central' ? 0.3638 : L.base === 'middle' ? 0.2729 : L.base === 'hanging' || L.base === 'text-before-edge' || L.base === 'text-top' ? 0.9688 : L.base === 'text-after-edge' || L.base === 'ideographic' || L.base === 'text-bottom' ? -0.2412 : 0) * L.size;
// A run's words, filled or stroked: whole, or a letter at a time with the letter spacing between.
function setRun(ctx, L, sl, t, cx, yb, k, stroke) {
  if (!L.ls) { if (stroke) ctx.strokeText(t, cx, yb); else ctx.fillText(t, cx, yb); return; }
  let px = cx;
  for (const ch of t) { if (stroke) ctx.strokeText(ch, px, yb); else ctx.fillText(ch, px, yb); px += charW(ctx, sl, ch, k) + L.ls; }
}
function fillRun(ctx, L, sl, t, cx, yb, alpha, k) { if (paintOn(L.fill)) { ctx.globalAlpha = alpha * L.fo; ctx.fillStyle = L.fill; setRun(ctx, L, sl, t, cx, yb, k, false); } }
function strokeRun(ctx, L, sl, t, cx, yb, alpha, k) { if (paintOn(L.stroke) && L.sw > 0) { ctx.globalAlpha = alpha * L.so; ctx.strokeStyle = L.stroke; ctx.lineWidth = L.sw * k; setRun(ctx, L, sl, t, cx, yb, k, true); } }
function paintText(ctx, el, L0, alpha, k) {
  nRuns = 0;
  let x = firstNum(el, 'x') + at(el, 'dx'), y = firstNum(el, 'y') + at(el, 'dy');
  if (el._t != null) { if (el._t) addRun(el._t, L0, null, null, 0, 0); }
  else {
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (n.nodeType === 3) { if (n.data) addRun(n.data, L0, null, null, 0, 0); continue; }
      if (n.nodeType !== 1 || n.localName !== 'tspan') continue;
      const L = looks.get(n) || L0;
      if (L.none) continue;
      addRun(wordsOf(n), L, n.hasAttribute('x') ? firstNum(n, 'x') : null, n.hasAttribute('y') ? firstNum(n, 'y') : null, at(n, 'dx'), at(n, 'dy'));
    }
  }
  if (!nRuns) return;
  // (The anchor sets each chunk: a run with its own x starts a new one.)
  let i = 0;
  while (i < nRuns) {
    let j = i + 1;
    while (j < nRuns && RUNS[j].x == null) j++;
    if (RUNS[i].x != null) x = RUNS[i].x;
    let total = 0;
    for (let q = i; q < j; q++) { const r = RUNS[q]; total += wordW(ctx, r.L, slotFor(r.L, k), runText(r), k) + (r.dx || 0); }
    const anchor = (L0.anchorAttr && el.getAttribute('text-anchor')) || L0.anchor;
    let cx = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x;
    for (let q = i; q < j; q++) {
      const r = RUNS[q], L = r.L, sl = slotFor(L, k), t = runText(r);
      if (L.hidden) { cx += wordW(ctx, L, sl, t, k); continue; }
      cx += r.dx || 0; if (r.y != null) y = r.y; y += r.dy || 0;
      ctx.font = sl.font; ctx.textAlign = 'left';
      const yb = y + baseShift(L);
      if (L.strokeFirst) { strokeRun(ctx, L, sl, t, cx, yb, alpha, k); fillRun(ctx, L, sl, t, cx, yb, alpha, k); } else { fillRun(ctx, L, sl, t, cx, yb, alpha, k); strokeRun(ctx, L, sl, t, cx, yb, alpha, k); }
      cx += wordW(ctx, L, sl, t, k);
    }
    i = j;
  }
}
const LEAVES = new Set(['line', 'rect', 'circle', 'ellipse', 'polyline', 'polygon', 'path']);
// (The clipPath a piece names is found once for each clip-path text and kept on the piece, and used while it is still inside the drawing.)
const CLIP_RE = /url\(#([^)]+)\)/;
function clipTo(ctx, root, el, k) {
  const attr = el.getAttribute('clip-path') || '';
  let cp = el._cpn;
  if (!cp || el._cpa !== attr || !root.contains(cp)) {
    const id = CLIP_RE.exec(attr)?.[1];   // alloc-rare: a clip-path text met for the first time on this piece (the node it names is kept on the piece)
    cp = id ? root.querySelector(`[id="${id}"]`) : null;   // alloc-rare: the same
    el._cpa = attr; el._cpn = cp;
  }
  if (!cp) return;
  ctx.beginPath();
  for (const c of cp.children) {
    const tag = c.localName;
    if (tag === 'rect') { const rx = at(c, 'rx'); if (rx > 0) ctx.roundRect(at(c, 'x'), at(c, 'y'), at(c, 'width'), at(c, 'height'), rx); else ctx.rect(at(c, 'x'), at(c, 'y'), at(c, 'width'), at(c, 'height')); }
    else if (tag === 'path') {
      // (A clip path mid-glide (svg-morph.js) is held as points or commands, cut here: no text made and no outline parsed in a frame.)
      const P = c._pts, cm = c._cmds;
      if (P) {
        const { buf, n } = P;
        let pen = false;
        for (let q = 0; q < n; q++) { const x = buf[2 * q], y = buf[2 * q + 1]; if (x !== x) { if (pen) ctx.closePath(); pen = false; continue; } if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } }
        if (pen) ctx.closePath();
      } else for (const { pts } of cm ? flattenCmdsInto(cm, 0.25 / Math.max(k, 0.05), c._cflat || (c._cflat = newFlat())) : flatOf(c.getAttribute('d') || '', 0.25 / Math.max(k, 0.05))) {   // alloc-rare: a clip piece's first store, kept on it
        ctx.moveTo(pts[0], pts[1]); for (let q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]); ctx.closePath();
      }
    }
  }
  ctx.clip();
}
// A mask of rectangles, a white one over the drawing with black ones cut out of it (a chart's line stopping short of its numbers): the
// clip is the white one less the black ones, the black ones first made into strips that never overlap, so the clip's winding rule cuts
// each out once. Any other mask is not drawn (the piece shows whole).
function holesOf(rs) {
  const xs = [...new Set(rs.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b), out = [];   // alloc-rare: worked out only when the mask's rectangles change (maskTo keeps the answer)
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1], ys = rs.filter((r) => r[0] <= xa && r[2] >= xb).map((r) => [r[1], r[3]]).sort((a, b) => a[0] - b[0]);   // alloc-rare: the same
    let cur = null;
    for (const [a, b] of ys) { if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b); else { if (cur) out.push([xa, cur[0], xb, cur[1]]); cur = [a, b]; } }   // alloc-rare: the same
    if (cur) out.push([xa, cur[0], xb, cur[1]]);   // alloc-rare: the same
  }
  return out;
}
// What a mask drew last, with what it was made from: the numbers of its rectangles and each one's fill text. While they stand still the
// clip is laid again from the kept strips; the strips are worked out again only when something moved (as a line glides to its end).
const MASKS = new WeakMap();
function maskTo(ctx, root, el) {
  const ref = refOf(root, el.getAttribute('mask'));
  if (!ref || ref.localName !== 'mask') return;
  const kids = ref.children, n = kids.length;
  if (!n) return;
  let ms = MASKS.get(ref);
  if (!ms) MASKS.set(ref, ms = { n: -1, ok: false, sig: [], fills: [], box: [0, 0, 0, 0], holes: [] });   // alloc-rare: a mask's first paint (the record is kept on the mask)
  let same = ms.n === n;
  for (let i = 0; i < n; i++) {
    const c = kids[i];
    if (c.localName !== 'rect') { ms.n = -1; return; }   // (not a mask of rectangles: the piece shows whole)
    const x0 = at(c, 'x'), y0 = at(c, 'y'), x1 = x0 + at(c, 'width'), y1 = y0 + at(c, 'height'), f = looks.get(c)?.fill || c.getAttribute('fill') || '#000', j = i * 4;   // colour-exempt: a mask's black
    if (same && (ms.sig[j] !== x0 || ms.sig[j + 1] !== y0 || ms.sig[j + 2] !== x1 || ms.sig[j + 3] !== y1 || ms.fills[i] !== f)) same = false;
    ms.sig[j] = x0; ms.sig[j + 1] = y0; ms.sig[j + 2] = x1; ms.sig[j + 3] = y1; ms.fills[i] = f;
  }
  ms.n = n;
  if (!same) {
    // alloc-rare: the mask's rectangles changed: the strips are worked out again (a glide), and kept while they stand still
    const lum = (c) => { const [r, g, b] = cssColor(looks.get(c)?.fill || c.getAttribute('fill') || '#000'); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };   // colour-exempt: a mask's black
    const box = (c) => [at(c, 'x'), at(c, 'y'), at(c, 'x') + at(c, 'width'), at(c, 'y') + at(c, 'height')];   // alloc-rare: the same
    const all = [...kids], white = all.filter((c) => lum(c) > 0.5);   // alloc-rare: the same
    ms.ok = white.length === 1 && all.indexOf(white[0]) === 0;
    if (ms.ok) {
      const b0 = box(white[0]);   // alloc-rare: the same
      ms.box[0] = b0[0]; ms.box[1] = b0[1]; ms.box[2] = b0[2]; ms.box[3] = b0[3];
      ms.holes = holesOf(all.slice(1).map(box).filter((r) => r[2] > r[0] && r[3] > r[1]));   // alloc-rare: the same
    }
  }
  if (!ms.ok) return;
  const bx = ms.box, x0 = bx[0], y0 = bx[1], x1 = bx[2], y1 = bx[3];
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
  const hs = ms.holes;
  for (let i = 0; i < hs.length; i++) { const h = hs[i]; ctx.moveTo(h[0], h[1]); ctx.lineTo(h[0], h[3]); ctx.lineTo(h[2], h[3]); ctx.lineTo(h[2], h[1]); ctx.closePath(); }
  ctx.clip();
}
export { holesOf };
function paintEl(ctx, root, el, alpha, k) {
  const tag = el.localName;
  if (tag === 'defs' || tag === 'clippath' || tag === 'x-title' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'mask' || tag === 'marker' || tag === 'pattern') return;
  const L = looks.get(el);
  if (!L || L.none) return;
  if (el._hide || el.style.display === 'none') return;   // (a piece the chart hides: held on the piece, or inline)
  const f = fadeOf(el);
  let a = alpha * (f ?? opNow(el, L, easeNow()));
  if (a <= 0.002) return;
  const own = el.style.visibility === 'hidden' || (L.hidden && el.style.visibility !== 'visible');
  let m = el._mat || transformOf(el.getAttribute('transform'));   // (a glide of a transform is held as a matrix, written in place)
  const mv = el.style.transform ? moveNow(el, L, easeNow()) : null, clip = el.hasAttribute('clip-path');
  if (mv) m = shiftM(m, mv[0], mv[1]);
  const lp = LOOPS.get(el);
  if (lp) {
    easing = true;   // (drawn again next frame: a loop never ends while it shows)
    const k = loopAt(lp, easeNow()), xy = lp.xy?.(k);   // (before its delay, the loop's start)
    if (xy) m = shiftM(m, xy[0], xy[1]);
    a *= Math.max(0, Math.min(1, lp.op ? lp.op(k) : 1));
    if (a <= 0.002) return;
  }
  const mask = el.hasAttribute('mask');
  if (m || clip || mask) { ctx.save(); if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); if (clip) clipTo(ctx, root, el, k); if (mask) maskTo(ctx, root, el); }
  const kk = m ? k * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : k;
  if (tag === 'text') { if (!own) paintText(ctx, el, L, a, kk); }
  else if (LEAVES.has(tag)) { if (!own) paintShape(ctx, root, el, tag, L, a, kk); }
  else for (const c of el.children) paintEl(ctx, root, c, a, kk);
  if (m || clip || mask) ctx.restore();
}
/** The viewBox's units mapped into a box w × h: [sx, sy, tx, ty]. The answer is the array viewMap keeps and writes in place: read it at once. */
const VM = [1, 1, 0, 0];
const vbKept = new Map();   // (a viewBox text -> its four numbers, or null for a text that is not one: read once for each text)
const UNIT_VB = null;
export function viewMap(vb, par, w, h) {
  let v = vbKept.get(vb);
  if (v === undefined) {
    const nums = String(vb || '').trim().split(/[\s,]+/).map(Number);   // alloc-rare: a viewBox text met for the first time (kept in vbKept)
    v = nums.length !== 4 || !(nums[2] > 0 && nums[3] > 0) ? UNIT_VB : Float64Array.from(nums);   // alloc-rare: the same
    if (vbKept.size > 64) vbKept.clear();
    vbKept.set(vb, v);
  }
  if (v === UNIT_VB) { VM[0] = 1; VM[1] = 1; VM[2] = 0; VM[3] = 0; return VM; }
  const sx = w / v[2], sy = h / v[3];
  if (par && /^none\b/.test(par)) { VM[0] = sx; VM[1] = sy; VM[2] = -v[0] * sx + 0; VM[3] = -v[1] * sy + 0; return VM; }
  const al = par || 'xMidYMid', s = /slice/.test(par || '') ? Math.max(sx, sy) : Math.min(sx, sy);
  const fx = /xMin/.test(al) ? 0 : /xMax/.test(al) ? 1 : 0.5, fy = /YMin/.test(al) ? 0 : /YMax/.test(al) ? 1 : 0.5;
  VM[0] = s; VM[1] = s; VM[2] = (w - v[2] * s) * fx - v[0] * s + 0; VM[3] = (h - v[3] * s) * fy - v[1] * s + 0;
  return VM;
}

// ── The picture ──
const finalFrame = finalFrameFor('svg-gl');
const live = new Set();
let themeAsk = 0;
function themeRead() { themeAsk = 0; clearShared(); clearLookMemo(); for (const g of live) { if (!g.box.isConnected) continue; g.relook(); } }
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(() => { clearShared(); if (!themeAsk && live.size) themeAsk = restPass(themeRead); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
}
// (The device's own dark mode too, which the attributes above never show: theme-epoch.js sees it, and runs this in the theme's frame.)
onTheme(() => { clearShared(); clearLookMemo(); if (!themeAsk && live.size) themeAsk = restPass(themeRead); });

// (A box's roots are kept under its place key and "root"; the joined text is made once for each place key, not for each drawing.)
function rootKeyOf(g) {
  if (!g.pk) return 'root';
  if (g.rkFor !== g.pk) { g.rkFor = g.pk; g.rk = `${g.pk}root`; }   // alloc-rare: a box's place key changed (a theme or size change), not a drawing
  return g.rk;
}

/**
 * The GPU picture of the models in `box` (each child <svg> made by svgModel): a canvas laid over the box (class svg-gl; the box takes
 * svg-gl-box, position relative), drawn by the charts' shared context. place(root) after a model is put in the box (its look read
 * then, once; again between frames on a theme change); fadeIn(root, ms) fades a new model in; wake(ms) draws every frame for ms (a glide); paint() once.
 */
const endPen = (ctx) => ctx.end?.() !== false;
export function createSvgGL(box, opts = null) {
  box.classList.add('svg-gl-box');
  const cv = document.createElement('canvas');
  cv.className = 'svg-gl';
  cv.setAttribute('role', 'img');
  box.prepend(cv);
  // alloc-rare: a picture's kept state, made once for each chart host
  const g = { box, cv, local: { host: opts?.host || '' }, lc: null, gpu: null, until: 0, ask: 0, lookAsk: 0, ins: new Map(), dead: false, timers: new Set(), vk: 1, ve: 0, vf: 0 };
  live.add(g);
  // (A drawing swapped in during a frame waits off the page, pending, and is drawn from there; it joins the box between frames.)
  // alloc-rare: the picture's drawings list, called by slide changes and rest passes, never by a frame's draw
  const models = () => { const m = [...box.children].filter((c) => c.hasAttribute?.('data-svg-model')); if (g.pending && !g.pending.isConnected) m.push(g.pending); return m; };
  // One drawing of the box, painted (the viewBox mapped to the box, then each piece in turn).
  function drawModel(ctx, root, now, bw, bh) {
    if (!looks.has(root)) return;
    let a = 1;
    const fi = g.ins.get(root);
    if (fi) { const k = Math.min(1, (now - fi.t0) / fi.ms); a = fi.ease(k); if (k >= 1) g.ins.delete(root); }
    const vm = viewMap(geoOf(root, 'viewBox'), root.getAttribute('preserveAspectRatio'), bw, bh), sx = vm[0], sy = vm[1];
    ctx.save();
    ctx.translate(BLEED + vm[2], BLEED + vm[3]); ctx.scale(sx, sy);
    const kk = Math.sqrt(sx * sy);
    for (let c = root.firstElementChild; c; c = c.nextElementSibling) paintEl(ctx, root, c, a, kk);
    ctx.restore();
  }
  // The drawings of the box in order, then the one waiting off the page (models, walked in place with no list made); the last of them is returned.
  function drawModels(ctx, now, bw, bh) {
    let last = null;
    for (let c = box.firstElementChild; c; c = c.nextElementSibling) {
      if (!c.hasAttribute('data-svg-model')) continue;
      drawModel(ctx, c, now, bw, bh); last = c;
    }
    const p = g.pending;
    if (p && !p.isConnected) { drawModel(ctx, p, now, bw, bh); last = p; }
    return last;
  }
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  const connect = () => { g.connAsk = 0; if (g.dead) { g.pending = null; return; } const r = g.pending; g.pending = null; if (r && !r.isConnected) box.append(r); };
  // (Nothing in the box to draw, and the last picture drawn was empty too: the canvas is already clear, so nothing is sized, drawn or
  // handed over. A full-screen layer with no drawing in it (the lobule's leaders, while the lobule is shut) took a whole-screen
  // clear and transfer, ~100-350 ms on a phone, again and again through a change between the views.)
  const hasInk = () => {
    for (let c = box.firstElementChild; c; c = c.nextElementSibling) if (c.hasAttribute('data-svg-model') && c.firstElementChild) return true;
    const p = g.pending;
    return !!p && !p.isConnected && !!p.firstElementChild;
  };
  function draw() {
    g.ask = 0;
    if (g.dead || !cv.isConnected) return;
    // (An owner's say that nothing in the box shows now (g.skip: the lobule's leaders and dots, drawn with their names by label-gl, with no
    // slide pointer up): the picture is cleared once and then left alone. The lobule's full-screen leader layer was cleared, drawn with
    // nothing visible and handed over on every frame of a zoom, resizing the charts' shared canvas between it and the dock's charts,
    // 35 ms a frame on a Mac (4 Nov 2026, Mohammad: "zooming into the lobule still flickers"). A fade under way finishes first.)
    const skip = !!g.skip && !g.eased && !g.ins.size && g.skip();
    if (g.blank && (skip || (!g.ins.size && !hasInk()))) return;
    // (Nothing to show: the picture on show is cleared where it stands, with no frame drawn. Drawn as an empty frame, a full-screen layer
    // (the lobule's leaders) sized the charts' one shared buffer to the whole screen for every chart after it.)
    if (skip && g.gpu?.clearShown?.()) { g.blank = true; g.eased = false; return; }
    const pen = framePart('svg-gl: begin (size, context)', fitPen, cv, g.gpu), { ctx, w, h } = pen;   // (named, so a long frame says whether the drawing's time went in the shared canvas's size, the pieces or the hand-over)
    const now = easeNow();
    easing = false;
    const bw = w - 2 * BLEED, bh = h - 2 * BLEED;
    let handed;
    try {
      ctx.clearRect(0, 0, w, h);
      if (!(bw > 0 && bh > 0)) return;
      // (The whole picture carried by the owner's view, g.view: a pan or a zoom about a point, drawn as it is, never a transform on the page.)
      const moved = g.vk !== 1 || g.ve !== 0 || g.vf !== 0;
      if (moved) { ctx.save(); ctx.translate(g.ve + BLEED * (1 - g.vk), g.vf + BLEED * (1 - g.vk)); ctx.scale(g.vk, g.vk); }
      const last = skip ? null : drawModels(ctx, now, bw, bh);
      if (moved) ctx.restore();
      if (g.holes?.length && !skip) eraseHoles(ctx, cv, w, h, g.holes);   // (the glasses over the picture: left out under them)
      g.blank = skip || !hasInk();
      g.eased = easing;
      const label = last?.getAttribute('aria-label');
      if (label) attrSoon(cv, 'aria-label', label);
    } finally { handed = framePart('svg-gl: hand over', endPen, ctx); }   // (false: the picture could not be handed over, trace-gl.js end)
    g.drawn?.(!!pen.gpu && bw > 0 && bh > 0 && handed);   // (whether the GPU drew this frame: gl-words.js shows its picture only then)
    if (now < g.until || g.ins.size || easing) g.ask = finalFrame(draw);
  }
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.gpu = createTraceGL(cv, { redraw: () => draw() });
  // (Drawn again as its box first gets a size, or a new one: a chart built before its card was on the page drew nothing then.)
  // (A box that changes size may take another type size or scale from the stylesheet: its roots' shared looks are read again.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  if (typeof ResizeObserver === 'function') { g.ro = new ResizeObserver((es) => { if (g.pk) dropRoots(g.pk); const r = es[0]?.contentRect; if (r && g.local.boxW !== r.width) { g.local.boxW = r.width; if (looksNeedWidth()) g.relook(); } g.paint(); }); g.ro.observe(box); }
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.paint = () => { if (!g.ask) g.ask = finalFrame(draw); };
  /** The picture moved as one: a point p is drawn at k p + (e, f) (box px). A pan is k 1; the lobule's dive is a scale about a point. */
  g.setHoles = (list) => { if (g.holes === list) return; g.holes = list; g.paint(); };
  g.view = (k, e, f) => { if (g.vk === k && g.ve === e && g.vf === f) return; g.vk = k; g.ve = e; g.vf = f; g.paint(); };
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.wake = (ms) => { g.until = Math.max(g.until, easeNow() + ms); g.paint(); };
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.cache = new Map();
  // (Where the box stands, for the shared looks: the page round it, and what the chart handed over (host, layout, fit, letter scale, card scale).)
  // alloc-rare: a place key made when looks are read, never in a frame
  const placeOf = () => { const pk = placeKey(box); return pk && g.local.host ? pk + makeCtx(g.local).sig : pk; };   // (a chart with no host given keeps the place key as it was)
  /** The chart's context for its looks: { host, layout, in, scale, svk, fit } as handed over; the look is read again between frames. */
  // alloc-rare: called when the card's fit or layout changes, not in a frame
  g.setCtx = (c) => { let ch = false; for (const k in c) if (g.local[k] !== c[k]) { g.local[k] = c[k]; ch = true; } if (ch) { clearLookMemo(); g.relook(); } };
  /** The host's base type size in px (what `em` means to its pieces); a builder asks for it in place of reading the host's font size. */
  g.hostSize = () => hostSizeFor(makeCtx(g.local));
  function lookRead() { g.lookAsk = 0; if (g.dead) return; g.cache.clear(); g.pk = placeOf(); g.lc = makeCtx(g.local); let ms = 0; for (const root of models()) ms = Math.max(ms, readLooks(root, false, g.cache, g.pk, g.lc)); if (ms) g.wake(ms + 20); else g.paint(); }
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.relook = () => { if (!g.lookAsk) g.lookAsk = restPass(lookRead); };
  // (A drawing's look is read as it is placed, once, in the task that builds it (a slide's change, a resize), so its first frame draws it
  // whole: a morph hides the old drawing's pieces in that same task.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.place = (root) => { live.add(g); g.cache.clear(); g.pk = placeOf(); g.lc = makeCtx(g.local); readLooks(root, true, g.cache, g.pk, g.lc); g.paint(); };
  // (Pieces built again in a frame (a redraw, a glide): each takes the look of the piece before it like it, read from nothing; a new kind of
  // piece is read between frames, and drawn from then.)
  // (A chart's first drawing in a new box (a slide's new data card) has no looks of its own yet: it takes those read for a chart like it
  // standing in the same place (the shared looks), with no page read; a chart's own first drawing, built in the task that brings its card,
  // is placed instead (g.show), its looks read there. Its card never comes in empty with the chart popping in a moment later (Mohammad,
  // 2 Nov 2026). ?firstlook=0 off.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.adopt = (root) => {
    if (adoptLooks(root, g.cache, rootKeyOf(g))) { g.paint(); return; }
    if (!g.cache.size) {
      const pk = placeOf();
      // alloc-rare: only while the drawing's looks cache is empty (its first drawing, or after a theme or size change)
      if (pk && adoptLooks(root, SHARED, `${pk}root`, g.cache)) { g.pk = pk; g.relook(); g.paint(); return; }
    }
    g.relook(); g.paint();
  };
  // (A piece fading in, in the picture, from nothing to its own strength, over ms on easing.)
  // (delay: ms the piece waits, at nothing, before it starts: a row of points coming in one after the other.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.fadeEl = (el, ms, easing = 'ease', delay = 0) => { EASES.set(el, { from: 0, to: 1, t0: easeNow() + delay, ms, ease: cssCurve(easing) }); g.wake(delay + ms + 20); };
  // (A class or a piece changed on a model after it was placed (a value turned on, a word's pieces rebuilt): its looks are read again
  // between frames, and any ease the stylesheet gives the change is run by the picture.)
  if (typeof MutationObserver === 'function') g.mo = new MutationObserver(g.relook);
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.mo?.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-rate'] });
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.fadeIn = (root, ms, easing = 'ease') => { g.ins.set(root, { t0: easeNow(), ms, ease: cssCurve(easing) }); g.paint(); };
  g.noteFade = noteFade;
  // A piece's strength now, for svg-morph's fades: the fade it is in, else its look's strength (a piece not yet looked at is resolved here), never the page's.
  g.strengthOf = (el) => { const f = fadeOf(el); if (f != null) return f; const L = looks.get(el); return L ? L.op : num(lookFor(el, g.lc || makeCtx(g.local), null, PROPS).o.opacity, 1); };
  // A new drawing in place of the old: each piece in both glides to its new place (svg-morph.js); where that cannot be, the new one fades
  // in over the old, which then goes (never a jump); without a fade (a new size) it simply takes over.
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.show = (root, fade) => {
    if (g.pending) connect();
    const old = models();
    // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
    if (!fade) { old.forEach((o) => o.remove()); box.append(root); g.place(root); return; }
    // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
    if (old.length && morphSvg(old.at(-1), root)) { old.slice(0, -1).forEach((o) => o.remove()); g.place(root); return; }
    box.append(root);
    g.place(root);
    g.fadeIn(root, D_SURFACE, EASE_ARRIVE);
    // alloc-rare: a new drawing that fades in over the old one, instead of a morph (a slide's change), once for each such change
    const t = setTimeout(() => { g.timers.delete(t); if (!g.dead) restPass(() => { if (g.dead) return; old.forEach((o) => o.remove()); g.paint(); }); }, 480);
    g.timers.add(t);
  };
  // (A drawing built afresh in a frame, in place of the one before: its pieces take the looks of the ones before them like them.)
  // (Never put on the page in the frame: it is drawn from where it waits, with the looks of the pieces before it, and joins the box in a
  // rest pass, between frames, where a new kind of piece has its look read.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.swap = (root) => {
    // (Every other drawing of the box goes, and the one waiting off the page: walked in place, with no list made.)
    for (let c = box.firstElementChild, nx; c; c = nx) { nx = c.nextElementSibling; if (c !== root && c.hasAttribute('data-svg-model')) c.remove(); }
    if (g.pending && g.pending !== root && !g.pending.isConnected) g.pending.remove();
    g.pending = root;
    if (!g.connAsk) g.connAsk = restPass(connect);
    g.adopt(root);
  };
  /** What the picture holds (the browser checks and ?perf read it): its drawings, those with their looks read, the looks kept. */
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.stat = () => { const ms = models(); return { models: ms.length, looked: ms.filter((r) => looks.has(r)).length, pieces: ms.reduce((n, r) => n + r.querySelectorAll('*').length, 0), unlooked: ms.reduce((n, r) => n + [...r.querySelectorAll('*')].filter((e) => !looks.has(e)).length, 0), cache: g.cache.size, w: cv.width, h: cv.height }; };
  // (Every drawing of the box goes, and the one waiting off the page: walked in place, with no list made.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.clear = () => {
    for (let c = box.firstElementChild, nx; c; c = nx) { nx = c.nextElementSibling; if (c.hasAttribute('data-svg-model')) c.remove(); }
    if (g.pending && !g.pending.isConnected) g.pending.remove();
    g.pending = null; g.paint();
  };
  // (Disposed once and for good: the frame, the rest passes and the entrance timers are cancelled, the pending drawing and the entrance
  // records let go, and every mutator becomes a no-op, so nothing can attach a model or ask for a frame afterwards.)
  // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
  g.dispose = () => {
    if (g.dead) return;
    g.dead = true;
    live.delete(g); g.mo?.disconnect?.(); g.ro?.disconnect?.();
    cancelFrame(g.ask); cancelRest(g.lookAsk); cancelRest(g.connAsk); g.ask = g.lookAsk = g.connAsk = 0;
    for (const t of g.timers) clearTimeout(t);
    g.timers.clear(); g.ins.clear(); g.pending = null; g.cache.clear();
    // alloc-rare: made once as the picture for a chart host is created, or on a slide change (not per frame)
    for (const k of ['paint', 'wake', 'relook', 'place', 'adopt', 'fadeEl', 'fadeIn', 'show', 'swap', 'clear']) g[k] = () => {};
    g.gpu?.dispose();
  };
  box._svgGL = g;
  return g;
}
