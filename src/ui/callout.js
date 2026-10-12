// The frosted-glass body of a figure callout (.cath-label): the card and its pointer are ONE shape, so the blur,
// the tint and the 2 px outline stay seamless where the pointer joins the card. The glass is a child (backdrop blur
// and tint, clipped to the shape's path); the outline is that same path stroked 4 px inside it, so only the inner 2 px
// shows. The pointer reaches outside the card's box, so the child is the box grown by the pointer's depth.

const NS = 'http://www.w3.org/2000/svg';
const PTR = 11;   // how far the pointer reaches past the card's edge, and its half-width at the edge
const KEEP = 28;  // the pointer stays this far from the card's sides, clear of the rounded corners
const BORDER = 2; // the card's (transparent) border, which the glass covers

const make = (el) => {
  const glass = document.createElement('i');
  glass.className = 'cl-glass'; glass.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.append(document.createElementNS(NS, 'path'));
  glass.append(svg);
  el.prepend(glass);
  return glass;
};

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

/** Gives `el` its glass body and returns `update(ax)`: call it whenever the pointer's offset `ax` (px from the card's
 *  centre) may have changed. It also redraws itself when the card is resized (a reading's text changing). */
export function glassCallout(el, { pointer = true } = {}) {
  const glass = make(el), path = glass.firstChild.firstChild;
  let ax = 0, key = '', size = null;   // size: the card's exact (fractional) border box, once observed
  const update = (a) => {
    if (a != null) ax = a;
    const w = size ? size[0] : el.offsetWidth, h = size ? size[1] : el.offsetHeight;
    if (!w) return;
    const dir = !pointer || el.classList.contains('in-sum') ? 'none' : el.dataset.at === 'ahead' && !el.classList.contains('above') ? 'top' : 'bottom';
    const k = `${w.toFixed(2)}|${h.toFixed(2)}|${dir}|${ax.toFixed(1)}`;
    if (k === key) return;
    key = k;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14;
    const px = Math.max(KEEP, Math.min(w - KEEP, w / 2 + Math.max(-0.4 * w, Math.min(0.4 * w, ax)))), up = dir === 'top' ? PTR : 0;
    const d = outline(w, h, r, up, px, dir);
    glass.style.cssText = `left:${-BORDER}px;top:${-BORDER - up}px;width:${+w.toFixed(2)}px;height:${+(h + (dir === 'none' ? 0 : PTR)).toFixed(2)}px;clip-path:path('${d}')`;
    path.setAttribute('d', d);
  };
  // A live observation keeps the observer and the card alive: it ends with dispose(), or when the card leaves the page.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    if (!el.isConnected) { ro.disconnect(); return; }
    const b = es[es.length - 1].borderBoxSize?.[0]; if (b) size = [b.inlineSize, b.blockSize]; update();
  }) : null;
  ro?.observe(el);
  update.dispose = () => ro?.disconnect();
  return update;
}
