// The phone's and the wide screen's split readings sheet (app.css .pz-data.pz-sheet under .pz.stack / .pz.pz-wide): its glass is not
// its own box but its two pseudo-elements', the instrument's card (::before) and the readings' card behind it (::after), of which only
// what lies outside the instrument card shows (its CSS mask). Read here as the card glass draws them (glass-gl cards.read): the
// readings' card first, as that same shape (its rounded box with the instrument card's cut out, a mask path), then the instrument's
// card over it, each with its own corners, tint and fade.
import { rgbaOf } from './lz-pills.js?v=670139934d';

const NUM = (v) => parseFloat(v) || 0;
const radii = (s, w, h) => [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map((v) => Math.max(0, Math.min(NUM(v), w / 2, h / 2)));

/** A rounded box's outline as a path (x, y: its corner; rad: top left, top right, bottom right, bottom left), clockwise, or the other way. */
export function boxPath(x, y, w, h, [tl, tr, br, bl], back = false) {
  const f = (n) => +n.toFixed(2);
  if (!back) return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}V${f(y + h - br)}A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}H${f(x + bl)}A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}V${f(y + tl)}A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}Z`;
  return `M${f(x + tl)} ${f(y)}A${f(tl)} ${f(tl)} 0 0 0 ${f(x)} ${f(y + tl)}V${f(y + h - bl)}A${f(bl)} ${f(bl)} 0 0 0 ${f(x + bl)} ${f(y + h)}H${f(x + w - br)}A${f(br)} ${f(br)} 0 0 0 ${f(x + w)} ${f(y + h - br)}V${f(y + tr)}A${f(tr)} ${f(tr)} 0 0 0 ${f(x + w - tr)} ${f(y)}Z`;
}

// A pseudo-element's box in page CSS px from its element's border box and its resolved insets.
function boxOf(b, es, ps) {
  const bl = NUM(es.borderLeftWidth), bt = NUM(es.borderTopWidth), br = NUM(es.borderRightWidth), bb = NUM(es.borderBottomWidth);
  const left = b.left + bl + NUM(ps.left), top = b.top + bt + NUM(ps.top), right = b.right - br - NUM(ps.right), bottom = b.bottom - bb - NUM(ps.bottom);
  return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
}

/** The split sheet's two panes as glass-gl cards.read takes them ([readings' card, instrument's card], either left out while it does
 *  not show), or undefined for any other card (its own glass, read as usual). */
export function sheetPanes(el, gcs = getComputedStyle) {
  if (!el.classList.contains('pz-sheet') || !el.closest?.('.pz.stack, .pz.pz-wide')) return undefined;
  const es = gcs(el);
  if (es.getPropertyValue('--gl-glass').trim() !== '0') return undefined;   // (a sheet with its own glass after all)
  const b = el.getBoundingClientRect(), bs = gcs(el, '::before'), as = gcs(el, '::after');
  const shows = (s) => s && s.content !== 'none' && s.display !== 'none' && s.visibility !== 'hidden' && NUM(s.opacity) > 0.001;
  const front = shows(bs) ? boxOf(b, es, bs) : null, back = shows(as) ? boxOf(b, es, as) : null;
  const out = [];
  const fr = front ? radii(bs, front.width, front.height) : null;
  if (back) {
    const rad = radii(as, back.width, back.height);
    // (Its own box, the instrument card's cut out of it the other way round, in its own coordinates.)
    const d = boxPath(0, 0, back.width, back.height, rad) + (front ? boxPath(front.left - back.left, front.top - back.top, front.width, front.height, fr, true) : '');
    out.push({ r: back, d, a: Math.min(1, NUM(as.opacity)), tint: rgbaOf(as.backgroundColor) });
  }
  if (front) out.push({ r: front, rad: fr, a: Math.min(1, NUM(bs.opacity)), tint: rgbaOf(bs.backgroundColor) });
  return out;
}
