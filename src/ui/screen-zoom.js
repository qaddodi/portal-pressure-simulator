// How much a card shrinks its contents on the screen (the fit zoom --pz-fit, and --pz-dk where the data card is stacked under the words), for a
// canvas drawn in its own px: its letters come out that much smaller, so a drawing keeps its words about 11 px on the screen by growing them by
// 1 / zoom (hvpg-proc.js traceRoom, fibroscan.js). Read from the inline values the card layout wrote, never from the page's layout, and kept
// for a quarter of a second per element so a frame reads nothing.
const kept = new WeakMap();   // element → { z, at }
const num = (e, n) => { const v = e ? parseFloat(e.style.getPropertyValue(n)) : NaN; return v > 0 ? v : 1; };
/** The least size (px, in the canvas's own units) a word needs to read `px` on the screen: px / zoom, never under px. */
export const screenMin = (el, px = 11) => Math.ceil(px / screenZoom(el));
/** el: any element inside a card. → the scale (0..1] the card puts on it. */
export function screenZoom(el) {
  const now = typeof performance === 'object' ? performance.now() : 0;
  let r = kept.get(el);
  if (r && now - r.at < 250) return r.z;
  if (!r) kept.set(el, r = { z: 1, at: 0 });   // alloc-rare: one record per canvas
  const host = el.closest('.pz-data, .pz-text, .pz-panel');
  let z = num(host, '--pz-fit');
  if (host && host.classList.contains('pz-data') && host.classList.contains('col')) z *= num(host, '--pz-dk');
  r.z = Math.min(1, Math.max(0.2, z)); r.at = now;
  return r.z;
}
