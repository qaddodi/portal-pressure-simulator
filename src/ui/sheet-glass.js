// The phone's and the wide screen's split readings sheet (app.css .pz-data.pz-sheet under .pz.stack / .pz.pz-wide): its glass is not
// its own box but its two pseudo-elements', the instrument's card (::before) and the readings' card behind it (::after), of which only
// what lies outside the instrument card shows (its CSS mask). Read here as the card glass draws them (glass-gl cards.read): the
// readings' card first, as that same shape (its rounded box with the instrument card's cut out, a mask path), then the instrument's
// card over it, each with its own corners, tint and fade.
import { rgbaOf } from './lz-pills.js';
import { zoomRide } from './scene-cam.js';

const NUM = (v) => parseFloat(v) || 0;
const radii = (s, w, h) => [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map((v) => Math.max(0, Math.min(NUM(v), w / 2, h / 2)));

/** A rounded box's outline as a path (x, y: its corner; rad: top left, top right, bottom right, bottom left), clockwise, or the other way. */
export function boxPath(x, y, w, h, [tl, tr, br, bl], back = false) {
  const f = (n) => +n.toFixed(2);
  if (!back) return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}V${f(y + h - br)}A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}H${f(x + bl)}A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}V${f(y + tl)}A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}Z`;
  return `M${f(x + tl)} ${f(y)}A${f(tl)} ${f(tl)} 0 0 0 ${f(x)} ${f(y + tl)}V${f(y + h - bl)}A${f(bl)} ${f(bl)} 0 0 0 ${f(x + bl)} ${f(y + h)}H${f(x + w - br)}A${f(br)} ${f(br)} 0 0 0 ${f(x + w)} ${f(y + h - br)}V${f(y + tr)}A${f(tr)} ${f(tr)} 0 0 0 ${f(x + w - tr)} ${f(y)}Z`;
}

// A pseudo-element's box in page CSS px from its element's border box and its resolved insets.
// (k: the card's scale on the screen, its box over its layout size: a card zoomed up (card-zoom.js) is drawn k times larger, its panes' insets,
// borders and corners with it. Before, they were read at their layout size from the zoomed box's corner: a small pane where the card had
// been, a ghost, and the rest of the zoomed card bare (Mohammad, 2 Nov 2026, HVPG 3: "CARDS ARE GLASS").)
function boxOf(b, es, ps, k = 1) {
  const bl = NUM(es.borderLeftWidth) * k, bt = NUM(es.borderTopWidth) * k, br = NUM(es.borderRightWidth) * k, bb = NUM(es.borderBottomWidth) * k;
  const left = b.left + bl + NUM(ps.left) * k, top = b.top + bt + NUM(ps.top) * k, right = b.right - br - NUM(ps.right) * k, bottom = b.bottom - bb - NUM(ps.bottom) * k;
  return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
}

// A pane's tint: --gl-tint, the colour its CSS paints it (app.css), never its computed background. A sheet whose glass the GPU draws has no
// background of its own ([data-gl]), so read from there the next frame found no tint, gave the sheet back to the browser's blur, found its
// tint again and drew it on the GPU: the sheet's glass went between the two on every frame (1 Nov 2026).
const tintOf = (ps) => rgbaOf(ps.getPropertyValue?.('--gl-tint')?.trim() || ps.backgroundColor);

/** The split sheet's two panes as glass-gl cards.read takes them ([readings' card, instrument's card], either left out while it does
 *  not show), or undefined for any other card (its own glass, read as usual). */
export function sheetPanes(el, gcs = getComputedStyle) {
  if (!el.classList.contains('pz-sheet') || !el.closest?.('.pz.stack, .pz.pz-wide')) return undefined;
  const es = gcs(el);
  if (es.getPropertyValue('--gl-glass').trim() !== '0') return undefined;   // (a sheet with its own glass after all)
  const b = zoomRide.box(el), bs = gcs(el, '::before'), as = gcs(el, '::after');
  const k = el.offsetWidth > 0 && b.width > 0 ? b.width / el.offsetWidth : 1;
  const rk = (r) => (k === 1 ? r : r.map((v) => v * k));
  // (A pane faded right out is still laid out, and kept: the glass follows its pseudo-element's fade each frame (glass-gl.js pseudoOf, pe), so
  // a sheet read at the start of its fade in is drawn as it comes in, never left out until a later read (10 Nov 2026). The readings' card
  // keeps the instrument card's cut whatever the instrument card's fade, as its CSS mask does.)
  const laid = (s) => s && s.content !== 'none' && s.display !== 'none' && s.visibility !== 'hidden';
  const front = laid(bs) ? boxOf(b, es, bs, k) : null, back = laid(as) ? boxOf(b, es, as, k) : null;
  const out = [];
  const fr = front ? rk(radii(bs, front.width / k, front.height / k)) : null;
  if (back) {
    const rad = rk(radii(as, back.width / k, back.height / k));
    // (Its own box, the instrument card's cut out of it the other way round, in its own coordinates.)
    const d = boxPath(0, 0, back.width, back.height, rad) + (front ? boxPath(front.left - back.left, front.top - back.top, front.width, front.height, fr, true) : '');
    out.push({ r: back, d, a: Math.min(1, NUM(as.opacity)), tint: tintOf(as), pe: '::after' });
  }
  if (front) out.push({ r: front, rad: fr, a: Math.min(1, NUM(bs.opacity)), tint: tintOf(bs), pe: '::before' });
  return out;
}
