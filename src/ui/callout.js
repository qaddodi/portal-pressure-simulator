// The frosted-glass body of a figure callout (.cath-label): the card and its pointer are ONE shape, so the blur,
// the tint and the 2 px outline stay seamless where the pointer joins the card. The glass is a child (backdrop blur
// and tint, clipped to the shape's path); the outline is that same path stroked inside it (4 px, so only the inner 2 px shows; the
// hairline of cl-hair strokes 2 px, so 1 px shows). The pointer reaches outside the card's box, so the child is the box grown by the pointer's depth.

import { createSvgGL, svgModel, setGeo } from './svg-gl.js';
import { restPass, cancelRest } from './rest-pass.js';
import { onTheme } from './theme-epoch.js';

const PTR = 11;   // how far the pointer reaches past the card's edge, and its half-width at the edge
const KEEP = 28;  // the pointer stays this far from the card's sides, clear of the rounded corners
const BORDER = 2; // the card's (transparent) border, which the glass covers
// The printed-tag outline (1 Nov 2026): a 1 px hairline in the theme's strong border with a fifth of the reading's colour in it, not a
// 2 px ring of the colour itself (app.css .cl-glass.cl-hair).

// The glass is built into a callout's model (its template) once, ahead of time, and comes with every clone of it, so making a
// callout on a frame writes nothing to the page for it (2 Nov 2026, "Move everything to GPU"). withGlass(tpl) gives a model its glass.
export const withGlass = (el) => {
  const glass = document.createElement('i');
  glass.className = 'cl-glass cl-hair'; glass.setAttribute('aria-hidden', 'true');
  // (Its outline is a model drawn on the GPU (svg-gl) over the glass, never SVG the page paints: 2 Nov 2026, "Move everything to
  // GPU". The model is cloned with the callout; its picture is made between frames, after the clone joins the page: glassCallout.)
  // (The model is the glass's first child and its path the model's: the figure's GPU glass reads the shape there, glass-gl.js readPanes.)
  glass.append(svgModel('svg', { viewBox: '0 0 1 1', preserveAspectRatio: 'none' }, svgModel('path')));
  el.prepend(glass);
  return el;
};
// (A callout's outline picture, made between frames for each callout as it is made: a frame makes no canvas.)
function lineGL(S) {
  S.ask = 0;
  if (S.gl || S.gone) return;
  S.gl = createSvgGL(S.glass);
  S.gl.cv.setAttribute('aria-hidden', 'true'); S.gl.cv.removeAttribute('role');
  S.gl.show(S.svg, false);
  S.glass.prepend(S.svg);   // (the model first, before the GPU drawer's canvases: the figure's GPU glass reads the shape there)
}

// The outline: a rounded rectangle (w × h at y = top) with the pointer on its bottom or top edge at x = px.
const outline = (w, h, r, top, px, dir) => {
  const b = top + h, f = (n) => +n.toFixed(2);
  const P = (x, y) => `${f(x)} ${f(y)}`;
  const arc = (x, y) => `A${f(r)} ${f(r)} 0 0 1 ${P(x, y)}`;
  let d = `M${P(r, top)}`;
  if (dir === 'top') d += `H${f(px - PTR)}L${P(px, top - PTR)}L${P(px + PTR, top)}`;
  d += `H${f(w - r)}${arc(w, top + r)}V${f(b - r)}${arc(w - r, b)}`;
  if (dir === 'bottom') d += `H${f(px + PTR)}L${P(px, b + PTR)}L${P(px - PTR, b)}`;
  return `${d}H${f(r)}${arc(0, b - r)}V${f(top + r)}${arc(r, top)}Z`;
};

// (Read in the observer's callback, after the browser's own layout: never on a frame.)
function observedSize(el, es) {
  const b = es[es.length - 1].borderBoxSize?.[0];
  return [b ? [b.inlineSize, b.blockSize] : [el.offsetWidth, el.offsetHeight], parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14];
}

const NO_OPTS = {};
/** Gives `el` its glass body and returns `update(ax)`: call it whenever the pointer's offset `ax` (px from the card's
 *  centre) may have changed. It also redraws itself when the card is resized (a reading's text changing). */
export function glassCallout(el, { pointer = true } = NO_OPTS) {
  const glass = el.firstElementChild, svg = glass.firstElementChild, path = svg.firstElementChild;   // (its glass, cloned with it from a model: withGlass)
  const S = { glass, svg, gl: null, ask: 0, gone: false };   // alloc-rare: made once for each callout, as it is first built (stage.js makes a callout only when it first shows), never per frame
  S.ask = restPass(() => lineGL(S));   // alloc-rare: made once for each callout, as it is first built (stage.js makes a callout only when it first shows), never per frame
  // size: the card's exact (fractional) border box, and rad its corner radius, both taken when it is observed (its size changes): the
  // update itself, called on the figure's frames, reads no layout or style (1 Nov 2026, "Move everything to GPU").
  let ax = 0, size = null, rad = 14;
  let kw = NaN, kh = NaN, kdir = '', kax = NaN;   // (what the shape was last drawn for: the size to 0.01 px, the pointer's offset to 0.1 px, its side)
  const update = (a) => {   // alloc-rare: made once for each callout, as it is first built (stage.js makes a callout only when it first shows), never per frame
    if (a != null) ax = a;
    if (!size) return;
    const [w, h] = size;
    if (!w) return;
    const dir = !pointer || el.classList.contains('in-sum') ? 'none' : (el.classList.contains('cath-js') || el.dataset.at === 'ahead') && !el.classList.contains('above') ? 'top' : 'bottom';
    const qw = Math.round(w * 100), qh = Math.round(h * 100), qax = Math.round(ax * 10);
    if (qw === kw && qh === kh && dir === kdir && qax === kax) return;
    kw = qw; kh = qh; kdir = dir; kax = qax;
    const r = rad;
    const px = Math.max(KEEP, Math.min(w - KEEP, w / 2 + Math.max(-0.4 * w, Math.min(0.4 * w, ax)))), up = dir === 'top' ? PTR : 0;
    const d = outline(w, h, r, up, px, dir);
    glass.style.cssText = `left:${-BORDER}px;top:${-BORDER - up}px;width:${+w.toFixed(2)}px;height:${+(h + (dir === 'none' ? 0 : PTR)).toFixed(2)}px;clip-path:path('${d}')`;
    setGeo(path, 'd', d);
    setGeo(svg, 'viewBox', `0 0 ${+w.toFixed(2)} ${+(h + (dir === 'none' ? 0 : PTR)).toFixed(2)}`);
    S.gl?.paint();
  };
  // A live observation keeps the observer and the card alive: it ends with dispose(), or when the card leaves the page.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {   // alloc-rare: made once for each callout, as it is first built (stage.js makes a callout only when it first shows), never per frame
    // (A report while the card is off the page, as it is built before it joins the page between frames, is passed over, and the
    // observation kept: ending it there left a summary's readings with no shape at all, so no glass ("the callouts are transparent", 2 Nov
    // 2026). The observation ends with dispose(), which every caller makes as the card goes.)
    if (!el.isConnected) return;
    [size, rad] = observedSize(el, es);
    askLine();
    update();
  }) : null;
  ro?.observe(el);
  // The outline's colour and weight are the stylesheet's word for this callout (its reading's colour --c, the theme's border), so they are read here,
  // between frames, when the callout's size is observed, the theme changes or its classes change (a tone), and written on the path as attributes,
  // which the picture takes: the picture itself asks the page nothing (chart-looks WP12).
  let lineT = 0, lineCls = '';
  const readLine = () => {
    lineT = 0;
    if (S.gone || !el.isConnected) return;
    if (typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(path);
    lineCls = el.className;
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', cs.stroke);
    path.setAttribute('stroke-width', cs.strokeWidth);
    path.setAttribute('stroke-linejoin', cs.strokeLinejoin);
    S.gl?.relook();
  };
  const askLine = () => { if (!lineT && !S.gone) lineT = restPass(readLine); };
  const offTheme = onTheme(askLine);
  const classed = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (el.className !== lineCls) askLine(); }) : null;   // alloc-rare: made once for each callout, as it is first built
  classed?.observe(el, { attributes: true, attributeFilter: ['class'] });
  askLine();
  update.dispose = () => { ro?.disconnect(); offTheme(); classed?.disconnect(); if (lineT) cancelRest(lineT); S.gone = true; S.gl?.dispose(); };   // alloc-rare: made once for each callout, as it is first built (stage.js makes a callout only when it first shows), never per frame
  return update;
}
