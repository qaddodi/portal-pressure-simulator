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

import { createTraceGL, fitPen } from './trace-gl.js?v=275432c81b';
import { flattenPath } from './shape-gl.js?v=1e2bc57a21';
import { finalFrameFor, easeNow } from './frame.js?v=7710f677e2';
import { restPass } from './rest-pass.js?v=bf0c42ead5';
import { cssCurve } from './ease.js?v=7513a88c68';
import { cssColor } from './css-color.js?v=e56f0c77ae';

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

// ── A piece's look ──
// The stylesheet's word is the computed style. A model's elements are not SVG, so an attribute such as text-anchor="end" or fill="…" is
// not a presentation hint to the page: it is taken here as SVG takes it, under any rule of the stylesheet (a value the stylesheet left as
// it came down from the parent, or at its initial value, gives way to the attribute) and inherited by the children as SVG inherits it.
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
// [CSS property, attribute, inherited, initial]
const PROPS = [['fill', 'fill', true, 'rgb(0, 0, 0)'],   // colour-exempt: SVG's initial fill, to tell the stylesheet's from it ['stroke', 'stroke', true, 'none'], ['strokeWidth', 'stroke-width', true, '1px'], ['opacity', 'opacity', false, '1'],
  ['fillOpacity', 'fill-opacity', true, '1'], ['strokeOpacity', 'stroke-opacity', true, '1'], ['strokeDasharray', 'stroke-dasharray', true, 'none'],
  ['strokeDashoffset', 'stroke-dashoffset', true, '0px'], ['strokeLinecap', 'stroke-linecap', true, 'butt'], ['strokeLinejoin', 'stroke-linejoin', true, 'miter'],
  ['fontSize', 'font-size', true, null], ['fontWeight', 'font-weight', true, '400'], ['textAnchor', 'text-anchor', true, 'start'], ['letterSpacing', 'letter-spacing', true, 'normal'],
  ['textTransform', 'text-transform', true, 'none'], ['paintOrder', 'paint-order', true, 'normal'], ['visibility', 'visibility', true, 'visible'], ['display', 'display', false, null],
  ['vectorEffect', 'vector-effect', false, 'none'], ['dominantBaseline', 'dominant-baseline', true, 'auto']];
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
    if (!css && a != null && a !== '') o[k] = a;
    else if (!css && inh && parentOut) o[k] = parentOut[k];
    else o[k] = v;
  }
  return { raw, o };
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
  };
}
const looks = new WeakMap();
function readLooks(root) {
  const walk = (el, pr, po) => {
    const { raw, o } = resolve(el, pr, po);
    looks.set(el, lookOf(o, num(raw.fontSize, 12)));
    for (const c of el.children) walk(c, raw, o);
  };
  walk(root, null, null);
}

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
    for (const { pts, closed } of flattenPath(d, 0.25 / Math.max(k, 0.05))) {
      if (pts.length < 2) continue;
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      if (closed) ctx.closePath();
    }
    return true;
  }
  return false;
}
function paintShape(ctx, el, tag, L, alpha, k) {
  if (!shapePath(ctx, el, tag, k)) return;
  if (paintOn(L.fill) && tag !== 'line') { ctx.globalAlpha = alpha * L.fo; ctx.fillStyle = L.fill; ctx.fill(); }
  if (paintOn(L.stroke) && L.sw > 0) {
    const s = L.fixed ? 1 / k : 1;
    ctx.globalAlpha = alpha * L.so; ctx.strokeStyle = L.stroke; ctx.lineWidth = L.sw * s;
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
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.data) runs.push({ t: n.data, L: L0, x: null, y: null }); continue; }
    if (n.nodeType !== 1 || n.localName !== 'tspan') continue;
    const L = looks.get(n) || L0;
    if (L.none) continue;
    runs.push({ t: n.textContent, L, x: n.hasAttribute('x') ? firstNum(n, 'x') : null, y: n.hasAttribute('y') ? firstNum(n, 'y') : null, dx: at(n, 'dx'), dy: at(n, 'dy') });
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
    const total = chunk.reduce((s, r) => s + widthOf(r) + (r.dx || 0), 0), anchor = L0.anchor;
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
function paintEl(ctx, root, el, alpha, k) {
  const tag = el.localName;
  if (tag === 'defs' || tag === 'clippath' || tag === 'x-title' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'mask' || tag === 'marker') return;
  const L = looks.get(el);
  if (!L || L.none) return;
  const f = fadeOf(el), a = alpha * (f ?? L.op);
  if (a <= 0.002) return;
  const own = el.style.visibility === 'hidden' || (L.hidden && el.style.visibility !== 'visible');
  const m = transformOf(el.getAttribute('transform')), clip = el.hasAttribute('clip-path');
  if (m || clip) { ctx.save(); if (m) ctx.transform(...m); if (clip) clipTo(ctx, root, el, k); }
  const kk = m ? k * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : k;
  if (tag === 'text') { if (!own) paintText(ctx, el, L, a, kk); }
  else if (LEAVES.has(tag)) { if (!own) paintShape(ctx, el, tag, L, a, kk); }
  else for (const c of el.children) paintEl(ctx, root, c, a, kk);
  if (m || clip) ctx.restore();
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
function themeRead() { themeAsk = 0; for (const g of live) { if (!g.box.isConnected) continue; g.relook(); } }
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(() => { if (!themeAsk && live.size) themeAsk = restPass(themeRead); })
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
  const models = () => [...box.children].filter((c) => c.hasAttribute?.('data-svg-model'));
  function draw() {
    g.ask = 0;
    if (!cv.isConnected) return;
    const pen = fitPen(cv, g.gpu), { ctx, w, h } = pen;
    const now = easeNow();
    try {
      ctx.clearRect(0, 0, w, h);
      const bw = w - 2 * BLEED, bh = h - 2 * BLEED;
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
    if (now < g.until || g.ins.size) g.ask = finalFrame(draw);
  }
  g.gpu = createTraceGL(cv, { redraw: () => draw() });
  g.paint = () => { if (!g.ask) g.ask = finalFrame(draw); };
  g.wake = (ms) => { g.until = Math.max(g.until, easeNow() + ms); g.paint(); };
  function lookRead() { g.lookAsk = 0; for (const root of models()) readLooks(root); g.paint(); }
  g.relook = () => { if (!g.lookAsk) g.lookAsk = restPass(lookRead); };
  // (A drawing's look is read as it is placed, once, in the task that builds it (a slide's change, a resize), so its first frame draws it
  // whole: a morph hides the old drawing's pieces in that same task.)
  g.place = (root) => { live.add(g); readLooks(root); g.paint(); };
  g.fadeIn = (root, ms, easing = 'ease') => { g.ins.set(root, { t0: easeNow(), ms, ease: cssCurve(easing) }); g.paint(); };
  g.noteFade = noteFade;
  g.dispose = () => { live.delete(g); g.gpu?.dispose(); };
  box._svgGL = g;
  return g;
}
