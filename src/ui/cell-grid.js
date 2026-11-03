// The credit's art grid, worked out from the shapes' own geometry (1 Nov 2026): which cells of a coarse grid a fill or a stroke
// touches, as the 2D canvas it replaces gave them (any pixel with some cover counted), with no canvas, no picture and no pixel read.
// Each shape is its outline as polylines (an SVG path cut into chords, a circle, an ellipse, a rect, a polygon), placed by a
// transform into the grid's cells (one cell a unit). A fill is scanned four rows a cell (non-zero winding) and its edges' own cells
// added (a sliver a scan row misses still counts, as a canvas's edge pixels do); a stroke takes every cell within half its width
// (plus the cell's own reach) of a segment. The calls are the 2D context's few the credit made, so its drawing reads the same.
//
//   const g = new CellGrid(); g.clearRect(0, 0, cols, rows); g.setTransform(a, b, c, d, e, f); g.fill(shapeGeom(el)); g.readInto(grid);

import { flattenPath } from './shape-gl.js';

const SUB = 4;   // (scan rows a cell)

/** An element's outline as polylines in its own units: { polys: [{ pts, closed }] }. tol: the chord's reach from a curve. */
export function geomOf(tag, attr, tol = 0.25) {
  tag = String(tag).toLowerCase();   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  const n = (k) => parseFloat(attr(k)) || 0;   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  if (tag === 'path') return { polys: flattenPath(attr('d') || '', tol) };   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  if (tag === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); return { polys: w > 0 && h > 0 ? [{ pts: Float32Array.of(x, y, x + w, y, x + w, y + h, x, y + h), closed: true }] : [] }; }   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
    return { polys: rx > 0 && ry > 0 ? [{ pts: ring(cx, cy, rx, ry, tol), closed: true }] : [] };   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const v = String(attr('points') || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
    return { polys: v.length >= 4 ? [{ pts: Float32Array.from(v.slice(0, v.length & ~1)), closed: tag === 'polygon' }] : [] };   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  }
  return { polys: [] };   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
}
function ring(cx, cy, rx, ry, tol) {
  const r = Math.max(rx, ry), k = Math.min(256, Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / Math.max(r, tol))))));
  const pts = new Float32Array(2 * k);   // alloc-rare: an outline is made once for a shape, when first needed (stage.js organCoverGeoms keeps the organ covers' until a band width changes)
  for (let i = 0; i < k; i++) { const a = (2 * Math.PI * i) / k; pts[2 * i] = cx + rx * Math.cos(a); pts[2 * i + 1] = cy + ry * Math.sin(a); }
  return pts;
}

/** A grid of cells drawn into as the credit drew its canvas: setTransform, clearRect, fill, stroke (lineWidth), a path of its own. */
export class CellGrid {
  constructor() { this.t = [1, 0, 0, 1, 0, 0]; this.w = 0; this.h = 0; this.cells = new Uint8Array(0); this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter'; this.cur = null; }
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }
  /** Empties the grid, `w` by `h` cells (the credit always clears the whole of it). */
  clearRect(x, y, w, h) { w = Math.max(0, Math.round(w)); h = Math.max(0, Math.round(h)); if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.cells = new Uint8Array(w * h); } else this.cells.fill(0); }
  beginPath() { this.cur = { polys: [] }; this.open = null; }
  moveTo(x, y) { this.cur ||= { polys: [] }; this.open = [x, y]; this.cur.polys.push({ pts: this.open, closed: false }); }
  lineTo(x, y) { if (!this.open) return this.moveTo(x, y); this.open.push(x, y); }
  closePath() { const p = this.cur?.polys.at(-1); if (p) p.closed = true; this.open = null; }
  arc(x, y, r, a0, a1) { this.cur ||= { polys: [] }; if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9) { this.cur.polys.push({ pts: ring(x, y, r, r, 0.05), closed: true }); this.open = null; } }
  /** Places a polyline's points into cells (x, y pairs). */
  place(pts) {
    const [a, b, c, d, e, f] = this.t, q = new Float64Array(pts.length);
    for (let k = 0; k < pts.length; k += 2) { const x = pts[k], y = pts[k + 1]; q[k] = a * x + c * y + e; q[k + 1] = b * x + d * y + f; }
    return q;
  }
  /** A fill (non-zero), of a geometry ({ polys }) or else of the path built here. */
  fill(g = this.cur) {
    if (!g?.polys?.length || !this.w || !this.h) return;
    const H = this.h * SUB, rows = new Map(), W = this.w, cells = this.cells;
    for (const p of g.polys) {
      const q = this.place(p.pts), n = q.length / 2;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, x0 = q[2 * i], y0 = q[2 * i + 1], x1 = q[2 * j], y1 = q[2 * j + 1];   // (a fill always closes its outline)
        this.line(x0, y0, x1, y1);
        if (y0 === y1) continue;
        const dir = y1 > y0 ? 1 : -1, lo = Math.min(y0, y1) * SUB, hi = Math.max(y0, y1) * SUB;
        for (let k = Math.max(0, Math.ceil(lo - 0.5)); k < Math.min(H, Math.ceil(hi - 0.5)); k++) {
          const yc = (k + 0.5) / SUB, x = x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0);
          let r = rows.get(k);
          if (!r) rows.set(k, (r = []));
          r.push(x, dir);
        }
      }
    }
    for (const [k, r] of rows) {
      const ord = [];
      for (let i = 0; i < r.length; i += 2) ord.push(i);
      ord.sort((u, v) => r[u] - r[v]);
      const row = Math.floor(k / SUB) * W;
      let wn = 0;
      for (let s = 0; s < ord.length; s++) {
        const was = wn;
        wn += r[ord[s] + 1];
        if (was !== 0 && s > 0) {
          const xa = r[ord[s - 1]], xb = r[ord[s]];
          if (xb > xa) for (let i = Math.max(0, Math.floor(xa)); i <= Math.min(W - 1, Math.ceil(xb) - 1); i++) cells[row + i] = 1;
        }
      }
    }
  }
  /** The cells a segment passes through (a fill's edge, which a canvas covers in part). */
  line(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= n; s++) this.mark(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n);
  }
  mark(x, y) { const i = Math.floor(x), j = Math.floor(y); if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j * this.w + i] = 1; }
  /** A stroke of lineWidth (in the shape's units, as a canvas takes it), of a geometry or else of the path built here. */
  stroke(g = this.cur) {
    if (!g?.polys?.length || !this.w || !this.h || !(this.lineWidth > 0)) return;
    const [a, b, c, d] = this.t, hw = (this.lineWidth * Math.sqrt(Math.abs(a * d - b * c))) / 2, reach = hw + 0.6;
    for (const p of g.polys) {
      const q = this.place(p.pts), n = q.length / 2;
      if (n === 1) { this.disc(q[0], q[1], reach); continue; }
      for (let i = 0; i < (p.closed ? n : n - 1); i++) { const j = (i + 1) % n; this.seg(q[2 * i], q[2 * i + 1], q[2 * j], q[2 * j + 1], reach); }
    }
  }
  disc(x, y, r) { this.seg(x, y, x, y, r); }
  /** Every cell whose centre is within `r` of the segment. */
  seg(x0, y0, x1, y1, r) {
    const W = this.w, H = this.h, cells = this.cells, dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, r2 = r * r;
    const i0 = Math.max(0, Math.floor(Math.min(x0, x1) - r)), i1 = Math.min(W - 1, Math.floor(Math.max(x0, x1) + r));
    const j0 = Math.max(0, Math.floor(Math.min(y0, y1) - r)), j1 = Math.min(H - 1, Math.floor(Math.max(y0, y1) + r));
    for (let j = j0; j <= j1; j++) {
      const cy = j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const cx = i + 0.5, u = L > 0 ? Math.min(1, Math.max(0, ((cx - x0) * dx + (cy - y0) * dy) / L)) : 0, ex = x0 + u * dx - cx, ey = y0 + u * dy - cy;
        if (ex * ex + ey * ey <= r2) cells[j * W + i] = 1;
      }
    }
  }
  /** The grid into `grid` (1 where art is, 0 elsewhere), as the canvas's alpha was read. */
  readInto(grid) { const n = Math.min(grid.length, this.cells.length); for (let k = 0; k < n; k++) grid[k] = this.cells[k]; for (let k = n; k < grid.length; k++) grid[k] = 0; }
}
