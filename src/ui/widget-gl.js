// A widget of the page's own (a toast, a menu, a sheet, a slider's track) drawn on the GPU (Mohammad, 3 Nov 2026: "100% GPU, no glitches").
//
// The widget's element stays in the page for what only the page can do: its box (placed and sized by script, never measured), its
// hit area, focus, keys and the words a screen reader reads. What it looks like is drawn here, through the charts' shared GPU context
// (trace-gl.js: one WebGL2 context for every chart, a picture handed to the element's own canvas on the GPU, nothing copied by the CPU),
// once while it holds still. Its arrival, its leaving and its glide are the element's own transform and opacity, which the compositor
// moves: the picture moves with the element, and a frame of motion costs the script nothing.
//
//   const w = widgetGL(el, (ctx, w, h, pad) => { … }, { pad: 18 });   // el: the widget's element (position: relative or absolute)
//   w.paint();   // draws it now (a rest pass, an event: never a frame of motion); the widget's `ctx` is a 2D context's own calls
//   w.live       // true once the GPU has drawn it: only then does the page's own look give way (.wgl-on, app.css), so a GPU that cannot
//                // draw yet (shaders compiling, the glyph field not in, a lost context) leaves the widget as the page paints it, never blank
//   w.dispose()
//
// `pad`: CSS px of picture around the element's box (a shadow reaches past it). The picture is the box plus pad on every side; the paint
// callback draws the box at (pad, pad).

import { createTraceGL, fitPen } from './trace-gl.js';
import { onTheme } from './theme-epoch.js';
import { onCanvasResized } from './util.js';
import { caught } from './caught.js';

const ALL = new Set();   // alloc-rare: the widgets alive (a toast, a menu: each added once when built)
let themed = false;
// (A new theme or palette: every widget is drawn again, in a rest pass after the frame that re-reads the tokens.)
function watchTheme() {
  if (themed || typeof MutationObserver === 'undefined') return;
  themed = true;
  onTheme(drawAll);   // (the theme epoch, theme-epoch.js: drawn in the same frame as every other surface)
}
function drawAll() { for (const w of ALL) w.paint(); }

/** How many widgets the GPU draws now (the ?perf readout and the checks). */
export const widgetsLive = () => { let n = 0; for (const w of ALL) if (w.live) n++; return n; };

/**
 * The GPU drawer for one widget over `el`, or null where the GPU cannot take it (the page keeps painting the widget).
 * `paint(ctx, w, h, pad)` draws it through a 2D context's calls (the shim of trace-gl.js); w × h is the picture's size in CSS px.
 */
export function widgetGL(el, paint, { pad = 0 } = {}) {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('canvas');
  host.className = 'wgl';
  host.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--wgl-pad', `${pad}px`);   // (on the element: the picture's canvas, the host's neighbour, reads it too)
  el.prepend(host);
  let dead = false;
  const api = {
    live: false,
    pad,
    paint() {
      if (dead) return false;
      const p = fitPen(host, gpu), ctx = p.ctx;
      if (!ctx || ctx.onGPU !== true) return false;
      try { paint(ctx, p.w, p.h, pad); } catch (e) { caught('widget-gl:paint', e); }
      const ok = ctx.end?.() !== false;
      if (ok && !api.live) { api.live = true; el.classList.add('wgl-on'); }
      return ok;
    },
    dispose() {
      if (dead) return;
      dead = true;
      ALL.delete(api);
      unsized(); gpu?.dispose();
      host.remove();
      api.live = false;
      el.classList.remove('wgl-on');
    },
  };
  const gpu = createTraceGL(host, { redraw: () => api.paint(), keep: true });
  if (!gpu) { host.remove(); dead = true; return null; }
  ALL.add(api);
  const unsized = onCanvasResized(host, () => api.paint());   // (a card or the window changed size: the picture is drawn again at the new size, not stretched)
  watchTheme();
  return api;
}
