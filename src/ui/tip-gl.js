// The tooltip drawn on the GPU (Mohammad, 3 Nov 2026: "Move. Everything. To. GPU."): its card, shadow, words and key, laid out in script from
// Inter's own advances (tip-layout.js) and drawn through the shared GPU context (widget-gl.js). The page's #tooltip keeps its box (its size is
// written from the layout, never measured), its place, its fade and the words a screen reader reads; its own paint gives way (.tip-gl, app.css)
// once the GPU has drawn it.

import { widgetGL } from './widget-gl.js';
import { lookOf, paintLook } from './plate-gl.js';
import { noteBox } from './util.js';
import { caught } from './caught.js';
import { ASC, DESC, PX, FONT, LS, KEY_PAD, lum } from './tip-layout.js';

const ON = 'tip-gl';

/** Draws a laid-out tooltip at (x, y) in a picture: its look (the stylesheet's: fill, shadow, corner), then its words and key. */
export function paintTip(ctx, L, look, x, y) {
  paintLook(ctx, look, x, y, L.w, L.h);
  ctx.font = FONT; ctx.letterSpacing = `${LS}px`; ctx.fillStyle = look.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // (Light words on a dark card: the browser's own smoothing thickens them, a distance field's does not, so they are laid twice, 0.15 px apart.)
  const light = lum(look.color) > lum(look.bg);
  for (const ln of L.lines) { ctx.fillText(ln.text, x + ln.x, y + ln.y); if (light) ctx.fillText(ln.text, x + ln.x + 0.15, y + ln.y); }
  const k = L.key;
  if (k) {
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = look.color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + k.x + 0.5, y + k.y + 0.5, k.w - 1, k.h - 1, 3.5); ctx.stroke();
    ctx.fillText(k.label, x + k.x + KEY_PAD, y + k.y + (k.h - (ASC + DESC) * PX) / 2 + ASC * PX);
    ctx.globalAlpha = 1;
  }
  ctx.letterSpacing = '0px';
}

/**
 * Gives `tip` (the page's #tooltip) a GPU picture of `L` (from layoutTip): sizes the element from it, draws it, and lets the page's own paint
 * step aside once the GPU has drawn. Returns whether the GPU drew it (false: the page paints it, as before).
 */
const state = new WeakMap();   // (the tooltip element → { wgl, L, look })
export function tipDraw(tip, L) {
  let s = state.get(tip);
  if (!s) state.set(tip, s = { wgl: null, L: null, look: null, tried: false });   // alloc-rare: one record for the page's one tooltip
  s.L = L;
  tip.style.width = `${L.w}px`; tip.style.height = `${L.h}px`;
  try {
    s.look = lookOf(tip, ON);
    if (!s.look.ok) { tip.classList.remove(ON); return false; }
    if (!s.wgl) {
      // (words and key only: the card is the glass's, or the page's own until it is drawn)
      s.wgl = widgetGL(tip, (ctx, w, h, pad) => { if (s.look && s.L) paintTip(ctx, s.L, { ...s.look, bg: 'rgba(0,0,0,0)', shadows: [] }, pad, pad); queueMicrotask(() => { if (s.wgl?.live) tip.classList.add(ON); }); }, { pad: Math.max(8, s.look.pad) });   // colour-exempt: a clear plate, the GPU draws the glass
      if (!s.wgl) return false;
    }
    const host = tip.firstElementChild;
    if (host && host.classList.contains('wgl')) noteBox(host, L.w + 2 * s.wgl.pad, L.h + 2 * s.wgl.pad);
    const ok = s.wgl.paint() === true;
    tip.classList.toggle(ON, ok);
    return ok;
  } catch (e) { caught('tip-gl:draw', e); tip.classList.remove(ON); return false; }
}
/** The page's tooltip is out of use for the GPU's picture (a text it cannot set): the page paints the next one. */
export function tipUndrawn(tip) { tip.classList.remove(ON); }
