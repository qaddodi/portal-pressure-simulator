// The phone's and the wide screen's split readings sheet (app.css .pz-data.pz-sheet under .pz.stack / .pz.pz-wide): its glass is not
// its own box but its two pseudo-elements', the instrument's card (::before) and the readings' card behind it (::after), of which only
// what lies outside the instrument card shows (its CSS mask). Read here as the card glass draws them (glass-gl cards.read): the
// readings' card first, as that same shape (its rounded box with the instrument card's cut out, a mask path), then the instrument's
// card over it, each with its own corners, tint and fade.
import { rgbaOf } from './lz-pills.js?v=78a9c7ce60';
import { readOwnBox } from './layout-snap.js?v=8d28b1c421';
import { layoutWidth } from './glass-motion.js?v=ef36fb5a2a';

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
  // (The page's own box, never the stand-in a zoomed card answers with (card-zoom.js pin): the glass takes the zoom back out itself.)
  const b = readOwnBox(el);
  const bs = gcs(el, '::before'), as = gcs(el, '::after');
  const lw = layoutWidth(el, es), k = lw > 0 && b.width > 0 ? b.width / lw : 1;
  const rk = (r) => (k === 1 ? r : r.map((v) => v * k));
  const shows = (s) => s && s.content !== 'none' && s.display !== 'none' && s.visibility !== 'hidden' && NUM(s.opacity) > 0.001;
  const front = shows(bs) ? boxOf(b, es, bs, k) : null, back = shows(as) ? boxOf(b, es, as, k) : null;
  const out = [];
  const fr = front ? rk(radii(bs, front.width / k, front.height / k)) : null;
  // (How each pane's top and bottom move as the readings come out, page px per unit of --pz-u, as app.css lays them: the card's box grows
  // down by --pz-d from a top that stays (a wide card's rise is its translate, --pz-lift, followed apart). The phone's instrument card
  // keeps its place, and the readings' card under it travels with the box's foot less the 24 px it shows tucked; the wide card's
  // instrument card goes down with the box's foot (its rise brings it back), and the readings' card above it by those 24 px. at(): how far
  // out the readings are now, from the inline value as written this frame (presenter.js slideUnder, the finger), or the card's class at rest.
  // So the glass rebuilds both panes, and the instrument card's cut out of the readings' card, every frame of a tuck with no read of the
  // page (2 Nov 2026: the panes read again in the frame after each --pz-u, the glass a frame behind the card).)
  const D = NUM(es.getPropertyValue('--pz-d')) * k, wide = !!el.closest('.pz.pz-wide'), L = 24 * k;
  const at = () => uOf(el);
  const fu = wide ? { at, top: D, bottom: D } : { at, top: 0, bottom: 0 };
  if (back) {
    const rad = rk(radii(as, back.width / k, back.height / k));
    // (Its own box, the instrument card's cut out of it the other way round, in its own coordinates.)
    const d = boxPath(0, 0, back.width, back.height, rad) + (front ? boxPath(front.left - back.left, front.top - back.top, front.width, front.height, fr, true) : '');
    // (cut: the same cut drawn on the GPU as a rounded box taken out of a rounded box, so it moves and grows with no mask made again.)
    const bu = wide ? { at, top: L, bottom: L } : { at, top: D - L, bottom: D - L };
    out.push({ r: back, d, rad, cut: front ? { r: front, rad: fr, u: fu } : null, u: bu, a: Math.min(1, NUM(as.opacity)), tint: tintOf(as) });
  }
  if (front) out.push({ r: front, rad: fr, u: fu, a: Math.min(1, NUM(bs.opacity)), tint: tintOf(bs) });
  return out;
}
/** How far out a split sheet's readings are (presenter.js underU): the inline --pz-u while it slides, else 1 out (tool-open) or 0. */
export function uOf(el) {
  return el.classList.contains('pz-sliding') ? parseFloat(el.style.getPropertyValue('--pz-u')) || 0 : el.classList.contains('tool-open') ? 1 : 0;
}
