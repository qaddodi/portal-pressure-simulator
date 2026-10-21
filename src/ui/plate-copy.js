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

/** True when a painted box [x0, y0, x1, y1] lies wholly outside a rectangle [x, y, w, h] (touching counts as inside). */
export function boxOutside(b, r) {
  return b[2] < r[0] || b[0] > r[0] + r[2] || b[3] < r[1] || b[1] > r[1] + r[3];
}

/** The world box a shape paints: its geometry box [x, y, w, h] through the matrix m ({a..f}, to the world), grown by the
 *  most its stroke can reach (a miter at the default limit of 4 reaches twice the stroke width past the outline) and a
 *  margin, all in world units. */
export function paintBox(bb, m, sw, pad = 6) {
  const xs = [], ys = [];
  for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]) {
    xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
  }
  const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1, g = (2 * (sw || 0) + 2) * k + pad;
  return [Math.min(...xs) - g, Math.min(...ys) - g, Math.max(...xs) + g, Math.max(...ys) + g];
}

// Safari draws a mask into a layer as big as everything the mask covers, at the picture's scale, however little of it the
// picture shows: zoomed in, the gut's cut, the rectum's fade and the diaphragm's were each a layer of up to 16 million pixels,
// made again for every strip of the view's sharp picture, and the strip's read stalled for 70–130 ms (Mohammad's ?perf
// readout, Mac Safari, 21 Oct). A mask's region (its x, y, width, height) bounds that layer, so each strip's copy of a mask
// has its region cut to the strip and a margin: nothing outside the strip shows in it, so the strip's pixels are the same.

/**
 * A mask's region [x, y, w, h] (in the user space of the elements using it) cut to a strip's world rect `band` [x, y, w, h],
 * given the world → user-space matrix ({a..f}) of each element using the mask. Unknown (an empty list or a null matrix):
 * the whole region stays. A strip the region misses gives an empty region (the masked shapes show nothing there).
 */
export function maskRegionIn(r, band, toLocal) {
  if (!toLocal.length || toLocal.some((m) => !m)) return r;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of toLocal) {
    for (const [x, y] of [[band[0], band[1]], [band[0] + band[2], band[1]], [band[0], band[1] + band[3]], [band[0] + band[2], band[1] + band[3]]]) {
      const u = m.a * x + m.c * y + m.e, v = m.b * x + m.d * y + m.f;
      if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
  }
  const ax = Math.max(r[0], x0), ay = Math.max(r[1], y0), bx = Math.min(r[0] + r[2], x1), by = Math.min(r[1] + r[3], y1);
  return bx > ax && by > ay ? [ax, ay, bx - ax, by - ay] : [ax, ay, 0, 0];
}

/** The placeholder written for a mask's region attribute in the copy's defs (fillMaskHead puts the strip's numbers in). */
export const maskSlot = (i, k) => `__pcm${i}_${k}__`;

/** The defs' markup with each mask's region filled in from `regions` (index → [x, y, w, h]). */
export function fillMaskHead(head, regions) {
  return head.replace(/__pcm(\d+)_([xywh])__/g, (_, i, k) => String(+regions[+i]['xywh'.indexOf(k)].toFixed(3)));
}

/**
 * The ids a piece of markup points at: url(#id) in any paint, clip, mask or filter, and href="#id" (a gradient built on
 * another, a use).
 */
export function refsIn(s) {
  return [...s.matchAll(/url\(\s*["']?[^)"'#]*#([^)"'\s&]+)|href="#([^"]+)"/g)].map((m) => m[1] || m[2]);
}

/**
 * Removes from the copy's defs (`defs`, an element) every child with an id that nothing in `parts` (the serialized organs)
 * points at, directly or through other defs: the page's defs also hold the vessels' gradients and masks, about a third of a
 * megabyte once their styles are written out, and each strip of the view's picture was read in with all of it (headless
 * WebKit, 21 Oct: 57 ms a strip with them, 35 ms without). An unused definition paints nothing: the same pixels.
 */
export function pruneDefs(defs, parts) {
  const byId = new Map();
  for (const k of [...defs.children]) if (k.id) byId.set(k.id, k);
  const keep = new Set(), todo = refsIn(parts);
  for (const k of defs.children) if (!k.id) todo.push(...refsIn(k.outerHTML ?? ''));
  while (todo.length) {
    const id = todo.pop();
    if (keep.has(id) || !byId.has(id)) continue;
    keep.add(id);
    const el = byId.get(id);
    todo.push(...refsIn(el.outerHTML ?? ''));
  }
  for (const [id, el] of byId) if (!keep.has(id)) el.remove();
  return keep;
}
