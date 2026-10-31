// The lobule's and the sinusoid's label pills (app.css :is(.lz-lab, .lz-zone, .sv-region)::before), read as the page lays them out
// this frame, for their frost drawn on the GPU instead of each pill's own backdrop blur (recs B4). A pill is its label's ::before:
// a rounded box a set gap outside the label (its insets), tinted, ringed in the term's colour (an inset box shadow), at the opacity
// its fades give it. Only the pills that show are returned.

const NUM = (v) => parseFloat(v) || 0;

/** The ring of an inset box shadow ("inset 0 0 0 2px <colour>" as computed: "<colour> 0px 0px 0px 2px inset"): { w, colour }, or null. */
export function ringOf(s) {
  if (!s || s === 'none' || !/\binset\b/.test(s)) return null;
  const m = s.match(/^(.*?\))?\s*(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s*(.*?)\s*inset\s*$/) || s.match(/^\s*inset\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s+(.*)$/);
  if (!m) return null;
  if (m[0].trimStart().startsWith('inset')) return { w: NUM(m[4]), colour: m[5].trim() };
  return { w: NUM(m[5]), colour: (m[1] || m[6] || '').trim() };
}

/**
 * Every pill under `root` that shows: [{ el, x, y, w, h, r, a, tint, ring }] in CSS px from `origin` (a DOMRect-like box, the
 * canvas the frost is drawn on). `gcs`: getComputedStyle (a stand-in in the tests).
 */
export function readPills(root, origin, gcs = getComputedStyle) {
  const out = [];
  for (const el of root.querySelectorAll(':is(.lz-lab, .lz-zone, .sv-region)')) {
    if (el.hidden) continue;
    const ps = gcs(el, '::before');
    if (!ps || ps.display === 'none' || ps.content === 'none' || ps.visibility === 'hidden') continue;
    const a = NUM(ps.opacity);
    if (!(a > 0.001)) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    // (Resolved insets: the pill's edges against its label's padding box, negative outward.)
    const es = gcs(el), bl = NUM(es.borderLeftWidth), bt = NUM(es.borderTopWidth);
    const x0 = b.left + bl + NUM(ps.left), y0 = b.top + bt + NUM(ps.top);
    const x1 = b.right - NUM(es.borderRightWidth) - NUM(ps.right), y1 = b.bottom - NUM(es.borderBottomWidth) - NUM(ps.bottom);
    if (!(x1 > x0 && y1 > y0)) continue;
    out.push({ el, x: x0 - origin.left, y: y0 - origin.top, w: x1 - x0, h: y1 - y0, r: Math.min(NUM(ps.borderTopLeftRadius), (x1 - x0) / 2, (y1 - y0) / 2), a: Math.min(1, a), tint: ps.backgroundColor, ring: ringOf(ps.boxShadow) });
  }
  return out;
}
