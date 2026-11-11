// The marks on the vessels (bands, clamps, clots, stents, sutures, plugs, balloons) read as the SVG draws them and drawn on the GPU: rings, earcut, strokes, discs.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { gpuProbe } from './gpu-probe.js';
import { darkMQ } from './look.js';
import { transformOf } from './svg-gl.js';

/**
 * The matrix [a b c d e f] that takes an element's own coordinates to the overlay's: the transforms of the element and of every group above it, outer first, up to `stop`.
 * A transform the browser's computed style does not give (a browser that leaves an SVG transform attribute out of it: Safari showed the TIPS stent's front marker at the
 * figure's origin, a thin bar stuck to the figure, 11 Nov 2026) is read from the attribute. null: no transform on the way. `cs`: the element's computed style, read by the caller.
 */
export function markMatrix(el, stop, cs) {
  let M = null;
  for (let e = el; e && e !== stop; e = e.parentNode) {
    const c = e === el && cs ? cs : getComputedStyle(e), t = c.transform;
    let q = null;
    if (t && t !== 'none') q = t.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
    else if (e.getAttribute?.('transform')) q = transformOf(e.getAttribute('transform'));
    if (q) M = M ? [q[0] * M[0] + q[2] * M[1], q[1] * M[0] + q[3] * M[1], q[0] * M[2] + q[2] * M[3], q[1] * M[2] + q[3] * M[3], q[0] * M[4] + q[2] * M[5] + q[4], q[1] * M[4] + q[3] * M[5] + q[5]] : q;
  }
  return M;
}

export function createMarks(st) {
  const { gOver, glLines, ov, svg, themeKey, toRGB, wrapCls } = st;
  // The marks on the vessels (bands, clamps, clots, stents and sutures, plugs, balloons, the spleen's marks) are drawn
  // on the GPU with the outlines, for the same reason: an SVG overlay is composited apart from the vessel canvas, and
  // a browser may show it a frame ahead of the vessels (Safari), so during a pan or pinch the marks slid along their
  // vessels. Each shape (not text) is read as the SVG draws it now, styles included, into world-space strokes and
  // fills; the SVG copy stays, hidden (data-gl), and shows again wherever the GPU cannot draw.
  const mk = { key: '', ver: 0, verts: new Float32Array(0), draws: [], all: null, dirty: false, ndAt: 0, ndRev: -1 };
// (darkMQ: the page's one dark-mode list, look.js, imported at the top)
    const marksKey = () => `${mk.ver}|${wrapCls()}|${themeKey()}|${darkMQ.matches}`;
  // (Rev 2 §2.8: whether the marks' key moved, told from its parts as they were at the last build (mk.dep), field by field: no string
  // is built a frame. The figure's classes as wrapCls keeps them (worked out again only when the class string changed); the theme by
  // the root's data-theme and data-palette, which are all themeKey reads.)
  const mkDep = { ver: -1, cls: null, theme: null, pal: null, dark: null };
  function marksStale() {
    const d = document.documentElement.dataset;
    return mkDep.ver !== mk.ver || mkDep.cls !== wrapCls() || mkDep.theme !== d.theme || mkDep.pal !== d.palette || mkDep.dark !== darkMQ.matches;
  }
  function marksBuilt() { const d = document.documentElement.dataset; mkDep.ver = mk.ver; mkDep.cls = wrapCls(); mkDep.theme = d.theme; mkDep.pal = d.palette; mkDep.dark = darkMQ.matches; }
  // (A shape's rings are flat lists of points, { xy: [x, y, x, y …], closed }, handed out by mkRing from a kept pool and read at once by
  // marksBuild, which builds the marks' strokes and fills from one shape at a time and keeps no ring. The pool grows to the most rings
  // a shape has had; everything below writes over what the last build left.)
  const mkRings = [], NO_TOK = [], pbC = [0, 0, 0, 0, 0, 0];   // (pbC: a curve's control numbers)
  let mkRingN = 0;
  function mkRing(closed) {
    let r = mkRings[mkRingN++];
    if (!r) mkRings.push(r = { xy: [], closed: false });
    r.xy.length = 0; r.closed = closed;
    return r;
  }
  // Subpaths of an absolute M/L/H/V/C/Q/Z path as rings in the pool (curves sampled); false for anything else.
  function pathRings(d) {
    const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || NO_TOK;
    mkRingN = 0;
    let cur = null, cmd = '', i = 0, x = 0, y = 0;
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'M') { x = Number(tok[i++]); y = Number(tok[i++]); cur = mkRing(false); cur.xy.push(x, y); cmd = 'L'; }
      else if (!cur) return false;
      else if (cmd === 'L') { x = Number(tok[i++]); y = Number(tok[i++]); cur.xy.push(x, y); }
      else if (cmd === 'H') { x = Number(tok[i++]); cur.xy.push(x, y); }
      else if (cmd === 'V') { y = Number(tok[i++]); cur.xy.push(x, y); }
      else if (cmd === 'C' || cmd === 'Q') {
        const c = pbC, cn = cmd === 'C' ? 6 : 4;
        for (let q = 0; q < cn; q++) c[q] = Number(tok[i++]);
        const ex = c[cn - 2], ey = c[cn - 1], x0 = x, y0 = y;
        const n = Math.max(2, Math.min(24, Math.ceil(Math.hypot(ex - x0, ey - y0) / 2)));
        for (let k = 1; k <= n; k++) {
          const t = k / n, u = 1 - t;
          if (cmd === 'C') cur.xy.push(u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * ex, u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * ey);
          else cur.xy.push(u * u * x0 + 2 * u * t * c[0] + t * t * ex, u * u * y0 + 2 * u * t * c[1] + t * t * ey);
        }
        x = ex; y = ey;
      } else if (cmd === 'Z' || cmd === 'z') { cur.closed = true; x = cur.xy[0]; y = cur.xy[1]; }
      else return false;
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
    }
    return true;
  }
  // An ellipse's points, written into the ring r.
  function mkEllipse(r, cx, cy, rx, ry) {
    const n = Math.max(24, Math.min(96, Math.ceil(Math.PI * (rx + ry) / 1.5))), xy = r.xy;
    for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI; xy.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
    return r;
  }
  const mkAttr = (el, a) => Number(el.getAttribute(a)) || 0;
  // A shape's rings in the pool (mkRings, the first mkRingN); false for a shape it does not read.
  function shapeRings(el) {
    mkRingN = 0;
    switch (el.tagName) {
      case 'path': return pathRings(el.getAttribute('d') || '');
      case 'circle': mkEllipse(mkRing(true), mkAttr(el, 'cx'), mkAttr(el, 'cy'), mkAttr(el, 'r'), mkAttr(el, 'r')); return true;
      case 'ellipse': mkEllipse(mkRing(true), mkAttr(el, 'cx'), mkAttr(el, 'cy'), mkAttr(el, 'rx'), mkAttr(el, 'ry')); return true;
      case 'rect': {
        const x = mkAttr(el, 'x'), y = mkAttr(el, 'y'), w = mkAttr(el, 'width'), h = mkAttr(el, 'height'), r = Math.min(mkAttr(el, 'rx') || mkAttr(el, 'ry'), w / 2, h / 2);
        const ring = mkRing(true), xy = ring.xy;
        if (!r) { xy.push(x, y, x + w, y, x + w, y + h, x, y + h); return true; }
        for (let q = 0; q < 4; q++) {   // (the four corners, from the top right round: their centres and first angles)
          const cx = q < 2 ? x + w - r : x + r, cy = q === 0 || q === 3 ? y + r : y + h - r, a0 = -90 + 90 * q;
          for (let k = 0; k <= 8; k++) { const a = ((a0 + (k / 8) * 90) * Math.PI) / 180; xy.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
        }
        return true;
      }
      default: return false;
    }
  }
  // A paint as [r, g, b, alpha] written into out; false for none (no paint, or a url).
  function paintTo(out, v, a) {
    if (!v || v === 'none' || v.startsWith('url')) return false;
    const m = /^rgba?\(([^)]+)\)$/.exec(v);
    if (!m) { const c = toRGB(v, getComputedStyle(svg)); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = a; return true; }
    const k = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    out[0] = k[0] / 255; out[1] = k[1] / 255; out[2] = k[2] / 255; out[3] = a * (k.length > 3 ? k[3] : 1);
    return true;
  }
  // Ear clipping: the triangles of a simple polygon (counter-clockwise or not), as indices of the points of P (flat, n points), in ecOut,
  // three to a triangle; the winding's sign returned.
  const ecIdx = [], ecOut = [];
  let ecSgn = 1;
  const ecCross = (P, a, b, c) => ((P[2 * b] - P[2 * a]) * (P[2 * c + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * c] - P[2 * a])) * ecSgn;
  const ecInside = (P, p, a, b, c) => ecCross(P, a, b, p) >= 0 && ecCross(P, b, c, p) >= 0 && ecCross(P, c, a, p) >= 0;
  function earcut(P, n) {
    const idx = ecIdx, out = ecOut;
    idx.length = 0; out.length = 0;
    for (let i = 0; i < n; i++) idx.push(i);
    let area = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; }
    const sgn = area > 0 ? 1 : -1;
    ecSgn = sgn;
    let guard = n * n;
    while (idx.length > 3 && guard-- > 0) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        if (ecCross(P, ia, ib, ic) <= 0) continue;
        let blocked = false;
        for (let q = 0; q < idx.length; q++) { const j = idx[q]; if (j !== ia && j !== ib && j !== ic && ecInside(P, j, ia, ib, ic)) { blocked = true; break; } }
        if (blocked) continue;
        out.push(ia, ib, ic);
        for (let q = i; q < idx.length - 1; q++) idx[q] = idx[q + 1];
        idx.length--;
        cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return sgn;
  }
  // The marks' build: the vertices written into one kept list (mkV), the draws into a kept pool (two, taken in turn: the list the GPU
  // was last given keeps the draws of the build before until olStep writes it afresh), a stroke as a strip of mitred joins (as SVG, limit 4;
  // open ends with square or round caps), a disc as triangles.
  const mkV = [], mkDrawPool = [[], []], mkDrawLists = [[], []], mkDiscRing = { xy: [], closed: true };
  const strokeP = [], nrm1 = [0, 0], nrm2 = [0, 0], mkFillP = [0, 0, 0, 0], mkSkP = [0, 0, 0, 0], mkDrawn = new Set();
  let mkSet = 0, mkDrawN = 0, mkFirst = 0, mkFade, mkDraws = null, mkPool = null;   // (mkFade: a narrowing's clamp, its id, whose fade olStep lays on the draw's alpha)
  function mkDraw(col, count, tri) {
    if (!count) return;
    let d = mkPool[mkDrawN++];
    if (!d) mkPool.push(d = { first: 0, count: 0, col: [0, 0, 0], alpha: 0, tri: false, fade: undefined });
    d.first = mkFirst; d.count = count; d.col[0] = col[0]; d.col[1] = col[1]; d.col[2] = col[2]; d.alpha = col[3]; d.tri = tri; d.fade = mkFade;
    mkDraws.push(d); mkFirst += count;
  }
  function nrmTo(o, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1; o[0] = -dy / l; o[1] = dx / l; }
  function mkStroke(xy, closed, h, cap) {
    const n = xy.length >> 1;
    if (n < 2) return 0;
    const P = strokeP;
    P.length = 0;
    for (let i = 0; i < xy.length; i++) P.push(xy[i]);
    if (!closed && cap === 'square') {
      let l = Math.hypot(P[0] - P[2], P[1] - P[3]) || 1;
      const sx = P[0] + (P[0] - P[2]) / l * h, sy = P[1] + (P[1] - P[3]) / l * h;
      P[0] = sx; P[1] = sy;
      l = Math.hypot(P[2 * n - 2] - P[2 * n - 4], P[2 * n - 1] - P[2 * n - 3]) || 1;
      const ex = P[2 * n - 2] + (P[2 * n - 2] - P[2 * n - 4]) / l * h, ey = P[2 * n - 1] + (P[2 * n - 1] - P[2 * n - 3]) / l * h;
      P[2 * n - 2] = ex; P[2 * n - 1] = ey;
    }
    let c = 0;
    for (let i = 0; i <= (closed ? n : n - 1); i++) {
      const k = i % n, px = P[2 * k], py = P[2 * k + 1];
      const pk = closed ? (k - 1 + n) % n : Math.max(0, k - 1), nk = closed ? (k + 1) % n : Math.min(n - 1, k + 1);
      if (k > 0 || closed) nrmTo(nrm1, P[2 * pk], P[2 * pk + 1], px, py); else nrmTo(nrm1, px, py, P[2 * nk], P[2 * nk + 1]);
      if (k < n - 1 || closed) nrmTo(nrm2, px, py, P[2 * nk], P[2 * nk + 1]); else { nrm2[0] = nrm1[0]; nrm2[1] = nrm1[1]; }
      let mx = nrm1[0] + nrm2[0], my = nrm1[1] + nrm2[1];
      const ml = Math.hypot(mx, my);
      if (ml < 1e-6) { mx = nrm1[0]; my = nrm1[1]; } else { mx /= ml; my /= ml; }
      const sc = 1 / Math.max(0.25, mx * nrm1[0] + my * nrm1[1]);
      mkV.push(px, py, mx * sc, my * sc, 1, h, px, py, mx * sc, my * sc, -1, h);
      c += 2;
    }
    return c;
  }
  function mkDisc(px, py, r) {
    mkDiscRing.xy.length = 0;
    const xy = mkEllipse(mkDiscRing, px, py, r, r).xy, n = xy.length >> 1;
    let c = 0;
    for (let k = 0; k < n; k++) {
      const b = (k + 1) % n;
      mkV.push(px, py, 1, 0, 0, 1e4, xy[2 * k], xy[2 * k + 1], 1, 0, 0, 1e4, xy[2 * b], xy[2 * b + 1], 1, 0, 0, 1e4);
      c += 3;
    }
    return c;
  }
  // Reads the marks for the GPU when they are not read yet (new shapes, a new look). Run in the frame loop, and by the update that rebuilds the
  // overlays (below), in the same task: a rebuilt mark is an SVG shape without data-gl, shown until it is read, and the frame loop does not
  // come round in every frame (a paced or yielding frame, a step in between), so a pan or pinch painted the new marks as SVG a frame apart
  // from the vessels (the stent and the band rings, on a slow screen up to a quarter of a second after the model changed them).
  function marksSync() {
    if (glLines && marksStale()) gpuProbe.time(null, 'vessel marks (script)', marksBuild);
  }
  function marksBuild() {
    mk.key = marksKey(); marksBuilt();
    mkSet ^= 1; mkPool = mkDrawPool[mkSet]; mkDraws = mkDrawLists[mkSet];
    mkDraws.length = 0; mkDrawN = 0; mkFirst = 0; mkV.length = 0; mkFade = undefined;
    // (Every style is read before any data-gl is written: an attribute the style sheet matches, taken off and put back on one shape
    // after another, made each shape's read a style pass of its own, about 36 of them in a slide change on a phone. data-gl changes
    // only the marks' visibility, which nothing here reads, so the reads are the same; the attributes end as before.)
    const drawn = mkDrawn;
    drawn.clear();
    for (const key in ov) {
      const g = ov[key];
      for (const el of g.querySelectorAll('path, circle, ellipse, rect')) {
        // (Nothing inside a <defs>, <clipPath> or <mask> is a mark: the stent's clip is a plain path with no class, so the painter drew it as a solid black rectangle at the
        // origin of the figure, stuck to it, 11 Nov 2026, Mohammad's TIPS shots.)
        if (el.closest('defs, clipPath, mask, pattern, marker')) continue;
        let cs = getComputedStyle(el), op = 1, ok = cs.display !== 'none' && cs.strokeDasharray === 'none';
        for (let e = el; ok && e && e !== gOver; e = e.parentNode) {
          const c = e === el ? cs : getComputedStyle(e);
          if (c.display === 'none' || (e !== el && (e.getAttribute('clip-path') || e.getAttribute('mask')))) ok = false;
          op *= Number(c.opacity);
        }
        const M = markMatrix(el, gOver, cs);
        if (!(ok && shapeRings(el))) continue;
        const nR = mkRingN;
        mkFade = el.classList.contains('clamp') || el.classList.contains('clamp-out') ? el.dataset.id : el.closest('[data-mk]')?.dataset.mk;
        if (M) for (let ri = 0; ri < nR; ri++) { const xy = mkRings[ri].xy; for (let i = 0; i < xy.length; i += 2) { const x = xy[i], y = xy[i + 1]; xy[i] = M[0] * x + M[2] * y + M[4]; xy[i + 1] = M[1] * x + M[3] * y + M[5]; } }
        for (let ri = 0; ri < nR; ri++) {
          // (A point within a thousandth of the one before it, as it was before this walk, is dropped; the list is closed up in place.)
          const xy = mkRings[ri].xy, len = xy.length;
          let w = len ? 2 : 0;
          for (let i = 2; i < len; i += 2) if (Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]) > 1e-3) { xy[w++] = xy[i]; xy[w++] = xy[i + 1]; }
          xy.length = w;
        }
        const hasFill = paintTo(mkFillP, cs.fill, op * Number(cs.fillOpacity)), hasSk = paintTo(mkSkP, cs.stroke, op * Number(cs.strokeOpacity));
        const sw = parseFloat(cs.strokeWidth) || 0;
        if (hasFill && mkFillP[3] > 0) for (let ri = 0; ri < nR; ri++) {
          const xy = mkRings[ri].xy, n = xy.length >> 1;
          if (n < 3) continue;
          const sgn = earcut(xy, n), tris = ecOut;
          for (let q = 0; q < tris.length; q++) mkV.push(xy[2 * tris[q]], xy[2 * tris[q] + 1], 1, 0, 0, 1e4);
          mkDraw(mkFillP, tris.length, true);
          // Without a stroke over it, the fill's edge is antialiased by a one-pixel fringe outside it.
          if (!(hasSk && sw >= 0.6)) {
            let c = 0;
            for (let i = 0; i <= n; i++) {
              const pi = i % n, ai = (i - 1 + n) % n, bi = (i + 1) % n, px = xy[2 * pi], py = xy[2 * pi + 1];
              const ux = xy[2 * bi] - xy[2 * ai], uy = xy[2 * bi + 1] - xy[2 * ai + 1], l = Math.hypot(ux, uy) || 1, ox = (uy / l) * sgn, oy = (-ux / l) * sgn;
              mkV.push(px, py, ox, oy, 0, -1, px, py, ox, oy, 1, -1); c += 2;
            }
            mkDraw(mkFillP, c, false);
          }
        }
        if (hasSk && mkSkP[3] > 0 && sw > 0) {
          const h = sw / 2, cap = cs.strokeLinecap;
          for (let ri = 0; ri < nR; ri++) {
            const r = mkRings[ri], xy = r.xy;
            mkDraw(mkSkP, mkStroke(xy, r.closed, h, cap), false);
            if (cap === 'round' && !r.closed && xy.length > 2) { mkDraw(mkSkP, mkDisc(xy[0], xy[1], h), true); mkDraw(mkSkP, mkDisc(xy[xy.length - 2], xy[xy.length - 1], h), true); }
          }
        }
        drawn.add(el);
      }
    }
    for (const g of Object.values(ov)) for (const el of g.querySelectorAll('path, circle, ellipse, rect')) { if (drawn.has(el)) { if (!el.hasAttribute('data-gl')) el.setAttribute('data-gl', ''); } else if (el.hasAttribute('data-gl')) el.removeAttribute('data-gl'); }
    drawn.clear();   // (the shapes are not held on to once their attributes are written)
    mk.verts = new Float32Array(mkV); mk.draws = mkDraws; mk.dirty = true;
  }
  return { marksStale, marksSync, mk };
}
