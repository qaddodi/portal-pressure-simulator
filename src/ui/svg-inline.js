// Live SVG → self-contained SVG: every style the page's CSS gives an element, resolved and written
// on the element itself, so the markup renders the same on its own (an exported figure, or an
// image the GPU draws the organs from).

export const PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'paint-order', 'stop-color', 'stop-opacity', 'visibility'];

/** Copies the computed styles of `src` and its descendants onto the clone `dst`; drops what is not displayed. */
export function inlineStyles(src, dst, vis = null) {
  const cs = getComputedStyle(src);
  if (cs.display === 'none') return false;
  // Visibility below the top element is taken from the element's own setting, else its parent's resolved one: Chrome can
  // report a descendant still hidden after the class that hid its ancestor came off (the stage hides the organs while the GPU
  // draws them, and shows them for this copy), and the copy of the organs came out empty.
  const own = src.style?.visibility || src.getAttribute('visibility');
  const v = vis === null || (own && own !== 'inherit') ? (vis === null ? cs.visibility : own) : vis;
  for (const p of PROPS) {
    const x = p === 'visibility' ? v : cs.getPropertyValue(p);
    if (x && x !== 'normal' && !(p === 'visibility' && x === 'visible')) dst.setAttribute(p, x);
  }
  dst.removeAttribute('class'); dst.removeAttribute('style'); dst.removeAttribute('tabindex'); dst.removeAttribute('role');
  const sk = [...src.children], dk = [...dst.children];
  for (let i = sk.length - 1; i >= 0; i--) if (inlineStyles(sk[i], dk[i], v) === false) dk[i].remove();
  return true;
}
