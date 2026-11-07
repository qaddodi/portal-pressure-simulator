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

// A computed colour as rgb()/rgba(): a browser that serialises a mixed colour as color(srgb r g b / a) gives the glass one it can read.
export function rgbaOf(c) {
  const m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([-\d.e]+%?))?\s*\)$/.exec((c || '').trim());
  if (!m) return c || '';
  const ch = (v) => Math.round(Math.min(1, Math.max(0, +v)) * 255);
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? NUM(m[4]) / 100 : NUM(m[4]);
  return `rgba(${ch(m[1])}, ${ch(m[2])}, ${ch(m[3])}, ${+a.toFixed(4)})`;
}

/** One label's pill as it shows now, or null: { r (its box, page CSS px, a DOMRect's fields), rad (corners), a, tint, ring }. */
// (Its tint from --gl-pill, the colour its CSS paints it (app.css), never from its computed background: a pill whose glass the GPU draws
// has no background of its own ([data-gl]), so read from there the next look found no tint, gave the pill back to the browser's blur, found
// its tint again, and so on: the pills' glass went between the two over and over (1 Nov 2026).)
export function pillOf(el, gcs = getComputedStyle) {
  if (el.hidden) return null;
  const ps = gcs(el, '::before');
  if (!ps || ps.display === 'none' || ps.content === 'none' || ps.visibility === 'hidden') return null;
  // (Its fades are layers' opacities, app.css: the pill's own, its label's (lit, coming or going) and the label set's (the camera,
  // a slide's hush). The glass takes their product, as the page draws them.)
  const OP = (v) => (v == null || v === '' ? 1 : NUM(v));
  const es = gcs(el), set = el.parentElement?.classList?.contains('lz-labels') ? gcs(el.parentElement) : null;
  const a = NUM(ps.opacity) * OP(es.opacity) * (set ? OP(set.opacity) : 1);
  if (!(a > 0.001)) return null;
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  // (Resolved insets: the pill's edges against its label's padding box, negative outward.)
  const x0 = b.left + NUM(es.borderLeftWidth) + NUM(ps.left), y0 = b.top + NUM(es.borderTopWidth) + NUM(ps.top);
  const x1 = b.right - NUM(es.borderRightWidth) - NUM(ps.right), y1 = b.bottom - NUM(es.borderBottomWidth) - NUM(ps.bottom);
  if (!(x1 > x0 && y1 > y0)) return null;
  const w = x1 - x0, h = y1 - y0, r = Math.min(NUM(ps.borderTopLeftRadius), w / 2, h / 2);
  return { r: { left: x0, top: y0, width: w, height: h, right: x1, bottom: y1 }, rad: [r, r, r, r], a: Math.min(1, a), tint: rgbaOf(ps.getPropertyValue?.('--gl-pill')?.trim() || ps.backgroundColor), ring: ringOf(ps.boxShadow) };
}

/** The labels under `root` that may carry a pill. */
export const pillLabels = (root) => [...root.querySelectorAll(':is(.lz-lab, .lz-zone)')];

/**
 * Every pill under `root` that shows: [{ el, x, y, w, h, r, a, tint, ring }] in CSS px from `origin` (a DOMRect-like box, the
 * canvas the frost is drawn on). `gcs`: getComputedStyle (a stand-in in the tests).
 */
export function readPills(root, origin, gcs = getComputedStyle) {
  const out = [];
  for (const el of root.querySelectorAll(':is(.lz-lab, .lz-zone, .sv-region)')) {
    const p = pillOf(el, gcs);
    if (!p) continue;
    out.push({ el, x: p.r.left - origin.left, y: p.r.top - origin.top, w: p.r.width, h: p.r.height, r: p.rad[0], a: p.a, tint: p.tint, ring: p.ring });
  }
  return out;
}

/**
 * Whether the copy of the lobule that the pills' frost is blurred from may stay as it is (laptop-heat Q4, 31 Oct): it was taken for
 * this very state (`key`: the lobule's size, its drawVersion, its view and the fade of its marks), the tissue's canvas was not painted
 * since, and so the only thing that has moved under the pills is the blood. A frost is a 16 px blur, so the streaks sliding under it
 * changed it a little on every frame, and each new copy sampled them a different way (the shimmer he saw, 31 Oct); held, it cannot shimmer,
 * and the glass takes no new copy, blurs none and draws nothing new. The model's own frames (about ten a second) and any pan, zoom,
 * ease or fade change the key and take a copy as before.
 */
export const pillHold = (held, key, ready, tissueDrew) => !!ready && !tissueDrew && held === key;
