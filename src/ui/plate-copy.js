// The organs' copy for the GPU (stage.js plateMarkup), made cheaper to draw without changing what it shows: what
// draws nothing is left out, an element's see-through layer is folded into its paint, neighbouring parts clipped
// to the same outline share one clip, and the nodules and nutmeg spots off the view are not sent.

/** The subpaths of an absolute path `d` (each M … , coordinates in x y pairs) whose box, grown by `pad`, meets the
 *  rectangle [x, y, w, h]. A subpath wholly outside the view adds no pixel to it, so the view draws the same. */
export function subpathsIn(d, rect, pad = 6) {
  if (!d) return d || '';
  const x0 = rect[0] - pad, y0 = rect[1] - pad, x1 = rect[0] + rect[2] + pad, y1 = rect[1] + rect[3] + pad;
  let out = '';
  for (const sp of d.split(/(?=M)/)) {
    const n = sp.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    if (!n) continue;
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) {
      const x = +n[i], y = +n[i + 1];
      if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y;
    }
    if (bx >= x0 && ax <= x1 && by >= y0 && ay <= y1) out += sp;
  }
  return out;
}

const painted = (el, p) => { const v = el.getAttribute(p); return p === 'fill' ? v !== 'none' : !!v && v !== 'none'; };

/** An element's opacity folded into its one paint (fill or stroke): a single fill or stroke drawn at alpha a·o is
 *  what the same paint drawn into a layer and faded by o gives. Elements that both fill and stroke keep the layer. */
export function foldOpacity(el) {
  const o = parseFloat(el.getAttribute('opacity') ?? '1');
  if (!(o < 1)) { el.removeAttribute('opacity'); return true; }
  const paints = ['fill', 'stroke'].filter((p) => painted(el, p));
  if (paints.length !== 1) return false;
  const p = paints[0], k = parseFloat(el.getAttribute(p + '-opacity') ?? '1');
  el.setAttribute(p + '-opacity', String(+(k * o).toFixed(5)));
  el.removeAttribute('opacity');
  return true;
}

/** Drops what draws nothing: fully transparent elements and empty paths. */
export function dropInvisible(root) {
  for (const el of [...root.querySelectorAll('[opacity]')]) if (parseFloat(el.getAttribute('opacity')) === 0) el.remove();
  for (const el of [...root.querySelectorAll('path')]) if (!el.getAttribute('d')) el.remove();
}

/** Neighbouring children clipped to the same organ outline (`clip-<organ>`, user space) under the same transform
 *  are wrapped in one group that carries the clip: the clip is set up once instead of once per part. */
export function mergeClipRuns(parent) {
  const kids = [...parent.children], sig = (el) => {
    const c = el.getAttribute('clip-path');
    if (!c || !/#clip-/.test(c) || el.hasAttribute('mask') || el.hasAttribute('filter')) return null;
    return c + '|' + (el.getAttribute('transform') || '');
  };
  for (let i = 0; i < kids.length;) {
    const s = sig(kids[i]);
    let j = i + 1;
    while (s && j < kids.length && sig(kids[j]) === s) j++;
    if (s && j - i > 1) {
      const g = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('clip-path', kids[i].getAttribute('clip-path'));
      const t = kids[i].getAttribute('transform');
      if (t) g.setAttribute('transform', t);
      parent.insertBefore(g, kids[i]);
      for (let k = i; k < j; k++) { kids[k].removeAttribute('clip-path'); kids[k].removeAttribute('transform'); g.append(kids[k]); }
    }
    i = j;
  }
}
