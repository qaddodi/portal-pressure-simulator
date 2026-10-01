// Live SVG → self-contained SVG: every style the page's CSS gives an element, resolved and written
// on the element itself, so the markup renders the same on its own (an exported figure, or an
// image the GPU draws the organs from).

export const PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'paint-order', 'stop-color', 'stop-opacity', 'visibility'];

/** Copies the computed styles of `src` and its descendants onto the clone `dst`; drops what is not displayed. */
export function inlineStyles(src, dst) {
  const cs = getComputedStyle(src);
  if (cs.display === 'none') return false;
  for (const p of PROPS) {
    const v = cs.getPropertyValue(p);
    if (v && v !== 'normal' && !(p === 'visibility' && v === 'visible')) dst.setAttribute(p, v);
  }
  dst.removeAttribute('class'); dst.removeAttribute('style'); dst.removeAttribute('tabindex'); dst.removeAttribute('role');
  const sk = [...src.children], dk = [...dst.children];
  for (let i = sk.length - 1; i >= 0; i--) if (inlineStyles(sk[i], dk[i]) === false) dk[i].remove();
  return true;
}
