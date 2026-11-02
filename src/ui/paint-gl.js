// Pictures painted on the GPU. A painter written for a 2D canvas (lobule-paint.js: fills, strokes, clips, shadows, gradients) is run
// once against a recorder with the same calls (recordPaint), which keeps only the geometry, in the canvas's device px, and the colours;
// nothing is drawn on the CPU. The GPU context that shows the picture then draws that record straight into a texture of its own
// (createPaintGL): in tiles of a multisampled framebuffer (4 samples where the GPU has them), each resolved and copied into its place in
// the texture, then mipmapped. Shapes that cannot overlap themselves (a convex fill, the ring of a convex outline) go down in batches,
// one draw for hundreds, in the order they were painted (the GPU blends a draw's triangles in order); every other fill or stroke is
// drawn by stencil then cover (nonzero or even-odd), so each pixel is laid once, as the canvas lays it; clips are the stencil's top bit;
// a shadow is the shape's coverage blurred by a two-pass Gaussian on the GPU (sigma: shadowBlur / 2, as the canvas's) and laid under it.
//
// The picture stands where a canvas did (gpuPicture): it has the canvas's width and height, free() (width 0) gives its texture back,
// and a context that is handed one in place of a canvas makes its texture from the record (isGpuPicture), the first time it is drawn.
// No 2D context, no drawImage and no pixel read anywhere (the owner, 1 Nov 2026: "block everything until everything is on GPU").

import { glGet, glOn, glCap } from './gl-state.js?v=ca10f41a87';
import { cssColor } from './css-color.js?v=e56f0c77ae';
import { hold } from './gpu-budget.js?v=6537238017';
import { WARM_VIEWS, WARM_MS, bucket } from './warm-views.js?v=510b2dee9e';
import { startProgram, checkProgram, publishWhenDone, stillCompiling } from './gl-compile.js?v=63e54c6c92';

const TAU = Math.PI * 2;
const TOL = 0.2;   // (curves flattened to within 0.2 device px)

// ── The recorder ──
class Gradient {
  constructor(x0, y0, r0, x1, y1, r1, m) { this.g = { x0, y0, r0, x1, y1, r1, m }; this.stops = []; }
  addColorStop(t, c) { this.stops.push([Math.max(0, Math.min(1, +t)), cssColor(c)]); this.stops.sort((a, b) => a[0] - b[0]); }
}
const mulM = (m, a, b, c, d, e, f) => [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/** A recorder with a 2D context's drawing calls (the ones the app's painters use). The record: ops (in order) over two vertex arrays. */
export class PaintRecorder {
  constructor(width, height) {
    this.width = width; this.height = height;
    this.ops = [];
    this.cv = [];   // coloured triangles: x, y, r, g, b, a (premultiplied)
    this.pv = [];   // plain triangles: x, y
    this.s = { m: [1, 0, 0, 1, 0, 0], fill: 'black', stroke: 'black', lw: 1, cap: 'butt', join: 'miter', ga: 1, sb: 0, sc: 'transparent', clip: null };
    this.stack = [];
    this.path = []; this.sub = null;
    this.batch = null;
    this.canvas = { width, height };
    this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low'; this.globalCompositeOperation = 'source-over';
  }
  // State
  get fillStyle() { return this.s.fill; } set fillStyle(v) { this.s.fill = v; }
  get strokeStyle() { return this.s.stroke; } set strokeStyle(v) { this.s.stroke = v; }
  get lineWidth() { return this.s.lw; } set lineWidth(v) { if (v > 0 && Number.isFinite(v)) this.s.lw = +v; }
  get lineCap() { return this.s.cap; } set lineCap(v) { this.s.cap = v; }
  get lineJoin() { return this.s.join; } set lineJoin(v) { this.s.join = v; }
  get globalAlpha() { return this.s.ga; } set globalAlpha(v) { if (v >= 0 && v <= 1) this.s.ga = +v; }
  get shadowBlur() { return this.s.sb; } set shadowBlur(v) { if (v >= 0 && Number.isFinite(v)) this.s.sb = +v; }
  get shadowColor() { return this.s.sc; } set shadowColor(v) { this.s.sc = v; }
  save() { this.stack.push({ ...this.s, m: this.s.m.slice() }); }
  restore() { const s = this.stack.pop(); if (s) this.s = s; }
  setTransform(a, b, c, d, e, f) { if (typeof a === 'object' && a) ({ a, b, c, d, e, f } = a); this.s.m = [a, b, c, d, e, f]; }
  resetTransform() { this.s.m = [1, 0, 0, 1, 0, 0]; }
  getTransform() { const [a, b, c, d, e, f] = this.s.m; return { a, b, c, d, e, f }; }
  transform(a, b, c, d, e, f) { this.s.m = mulM(this.s.m, a, b, c, d, e, f); }
  translate(x, y) { this.s.m = mulM(this.s.m, 1, 0, 0, 1, x, y); }
  scale(x, y) { this.s.m = mulM(this.s.m, x, 0, 0, y, 0, 0); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.s.m = mulM(this.s.m, c, s, -s, c, 0, 0); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient(x0, y0, r0, x1, y1, r1, this.s.m.slice()); }
  // Path (points kept in device px)
  _pt(x, y) { const m = this.s.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  beginPath() { this.path = []; this.sub = null; }
  moveTo(x, y) { this.sub = { p: [this._pt(x, y)], closed: false }; this.path.push(this.sub); }
  lineTo(x, y) { if (!this.sub) { this.moveTo(x, y); return; } if (this.sub.closed) this._reopen(); this.sub.p.push(this._pt(x, y)); }
  _reopen() { const s = this.sub.p[0]; this.sub = { p: [s.slice()], closed: false }; this.path.push(this.sub); }
  closePath() { if (this.sub && this.sub.p.length) this.sub.closed = true; }
  _curve(f, n) { for (let i = 1; i <= n; i++) { const [x, y] = f(i / n); this.sub.p.push(this._pt(x, y)); } }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.sub) this.moveTo(cx, cy);
    if (this.sub.closed) this._reopen();
    const m = this.s.m, last = this.sub.p[this.sub.p.length - 1], inv = invPt(m, last);
    const n = Math.min(64, Math.max(2, Math.ceil(Math.sqrt(Math.hypot(cx - inv[0], cy - inv[1]) * scaleOf(m) / TOL) / 2)));
    this._curve((t) => { const u = 1 - t; return [u * u * inv[0] + 2 * u * t * cx + t * t * x, u * u * inv[1] + 2 * u * t * cy + t * t * y]; }, n);
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.sub) this.moveTo(c1x, c1y);
    if (this.sub.closed) this._reopen();
    const m = this.s.m, last = this.sub.p[this.sub.p.length - 1], p0 = invPt(m, last);
    const L = Math.hypot(c1x - p0[0], c1y - p0[1]) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y);
    const n = Math.min(96, Math.max(2, Math.ceil(Math.sqrt(L * scaleOf(m) / TOL) / 2)));
    this._curve((t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * p0[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y]; }, n);
  }
  arc(x, y, r, a0, a1, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    if (!(rx >= 0 && ry >= 0)) return;
    let sweep;
    if (!ccw) sweep = a1 - a0 >= TAU ? TAU : ((((a1 - a0) % TAU) + TAU) % TAU);
    else sweep = a0 - a1 >= TAU ? -TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    const rr = Math.max(rx, ry) * scaleOf(this.s.m);
    const step = rr > TOL ? 2 * Math.acos(Math.max(-1, 1 - TOL / rr)) : TAU / 4;
    const n = Math.min(720, Math.max(1, Math.ceil(Math.abs(sweep) / step)));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (a) => { const ex = rx * Math.cos(a), ey = ry * Math.sin(a); return this._pt(x + ex * cr - ey * sr, y + ex * sr + ey * cr); };
    const p0 = at(a0);
    if (!this.sub) { this.sub = { p: [p0], closed: false }; this.path.push(this.sub); }
    else { if (this.sub.closed) this._reopen(); this.sub.p.push(p0); }
    for (let i = 1; i <= n; i++) this.sub.p.push(at(a0 + (sweep * i) / n));
  }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); this.moveTo(x, y); }
  roundRect(x, y, w, h, r = 0) {
    let rr = Array.isArray(r) ? r[0] : r;
    rr = Math.max(0, Math.min(+rr || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    this.moveTo(x + rr, y);
    this.lineTo(x + w - rr, y); if (rr) this.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - rr); if (rr) this.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
    this.lineTo(x + rr, y + h); if (rr) this.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
    this.lineTo(x, y + rr); if (rr) this.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
    this.closePath(); this.moveTo(x, y);
  }
  // Painting
  _paint(style) {
    if (style instanceof Gradient) {
      const { x0, y0, r0, x1, y1, r1, m } = style.g, k = scaleOf(m), ga = this.s.ga;
      const c = [m[0] * x1 + m[2] * y1 + m[4], m[1] * x1 + m[3] * y1 + m[5]];
      const stops = (style.stops.length ? style.stops : [[0, [0, 0, 0, 0]]]).slice(0, 8).map(([t, q]) => [t, q[0] * q[3] * ga, q[1] * q[3] * ga, q[2] * q[3] * ga, q[3] * ga]);
      void x0; void y0;   // (concentric gradients only: the app's are)
      return { grad: { cx: c[0], cy: c[1], r0: r0 * k, r1: r1 * k, stops } };
    }
    const q = cssColor(style), a = q[3] * this.s.ga;
    return { rgba: [q[0] * a, q[1] * a, q[2] * a, a] };
  }
  _shadow(paint) {
    if (!(this.s.sb > 0)) return null;
    const q = cssColor(this.s.sc);
    if (!(q[3] > 0)) return null;
    const pa = paint.rgba ? paint.rgba[3] : 1;
    const a = q[3] * pa;
    return { rgba: [q[0] * a, q[1] * a, q[2] * a, a], sigma: this.s.sb / 2 };
  }
  _end() { this.batch = null; }
  _direct(tris, rgba) {
    let b = this.batch;
    if (!b || b.clip !== this.s.clip) { b = this.batch = { k: 'direct', from: this.cv.length / 6, count: 0, clip: this.s.clip }; this.ops.push(b); }
    const [r, g, bb, a] = rgba, cv = this.cv;
    for (let i = 0; i < tris.length; i += 2) cv.push(tris[i], tris[i + 1], r, g, bb, a);
    b.count += tris.length / 2;
  }
  _stencil(k, tris, rule, paint, shadow) {
    if (tris.length < 6) return;
    this._end();
    const from = this.pv.length / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < tris.length; i += 2) {
      const x = tris[i], y = tris[i + 1];
      this.pv.push(x, y);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    this.ops.push({ k, from, count: tris.length / 2, rule, paint, shadow, clip: this.s.clip, box: [x0, y0, x1, y1] });
  }
  fill(rule = 'nonzero') {
    if (typeof rule === 'object') rule = 'nonzero';   // (a Path2D is not recorded)
    const paint = this._paint(this.s.fill);
    if (!paint.grad && !(paint.rgba[3] > 0)) return;
    const subs = this.path.filter((s) => s.p.length >= 3), shadow = this._shadow(paint);
    if (!subs.length) return;
    if (subs.length === 1 && paint.rgba && !shadow && convex(subs[0].p)) { this._direct(fan(subs[0].p), paint.rgba); return; }
    const tris = [];
    for (const s of subs) for (const t of fan(s.p)) tris.push(t);
    this._stencil('fill', tris, rule === 'evenodd' ? 'evenodd' : 'nonzero', paint, shadow);
  }
  stroke() {
    const paint = this._paint(this.s.stroke);
    if (!paint.grad && !(paint.rgba[3] > 0)) return;
    const k = scaleOf(this.s.m), w = this.s.lw * k, hair = w < 1, hw = Math.max(w, 1) / 2;
    if (hair) { if (paint.rgba) paint.rgba = paint.rgba.map((v) => v * w); else paint.grad.stops = paint.grad.stops.map(([t, ...c]) => [t, ...c.map((v) => v * w)]); }
    const subs = this.path.filter((s) => s.p.length >= 2), shadow = this._shadow(paint);
    if (!subs.length) return;
    if (subs.length === 1 && subs[0].closed && paint.rgba && !shadow) {
      const ring = convexRing(subs[0].p, hw);
      if (ring) { this._direct(ring, paint.rgba); return; }
    }
    const tris = [];
    for (const s of subs) strokeTris(s.p, s.closed, hw, this.s.cap, tris);
    this._stencil('stroke', tris, 'nonzero', paint, shadow);
  }
  clip(rule = 'nonzero') {
    const subs = this.path.filter((s) => s.p.length >= 3), tris = [];
    for (const s of subs) for (const t of fan(s.p)) tris.push(t);
    this._end();
    const from = this.pv.length / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < tris.length; i += 2) { const x = tris[i], y = tris[i + 1]; this.pv.push(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const c = { from, count: tris.length / 2, rule: rule === 'evenodd' ? 'evenodd' : 'nonzero', box: tris.length ? [x0, y0, x1, y1] : [0, 0, 0, 0] };
    this.s.clip = this.s.clip ? [...this.s.clip, c] : [c];
  }
  fillRect(x, y, w, h) { const keep = [this.path, this.sub]; this.beginPath(); this.rect(x, y, w, h); this.fill(); [this.path, this.sub] = keep; }
  strokeRect(x, y, w, h) { const keep = [this.path, this.sub]; this.beginPath(); this.rect(x, y, w, h); this.stroke(); [this.path, this.sub] = keep; }
  clearRect(x, y, w, h) {
    const m = this.s.m, full = !this.s.clip && m[1] === 0 && m[2] === 0 && this.ops.length === 0;
    const a = this._pt(x, y), b = this._pt(x + w, y + h);
    if (full && Math.min(a[0], b[0]) <= 0 && Math.min(a[1], b[1]) <= 0 && Math.max(a[0], b[0]) >= this.width && Math.max(a[1], b[1]) >= this.height) return;   // (the picture starts clear)
    const keep = [this.path, this.sub]; this.beginPath(); this.rect(x, y, w, h);
    const tris = fan(this.sub ? this.path[0].p : []);
    [this.path, this.sub] = keep;
    this._end();
    const from = this.pv.length / 2;
    for (const t of tris) this.pv.push(t);
    this.ops.push({ k: 'clear', from, count: tris.length / 2, clip: this.s.clip, box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] });
  }
  // (Pixel calls a 2D painter might make are not recorded: a GPU picture has no pixels on the CPU.)
  drawImage() { throw new Error('paint-gl: drawImage is not recorded'); }
  /** The record, its arrays packed. */
  done() { this._end(); return { width: this.width, height: this.height, ops: this.ops, cv: new Float32Array(this.cv), pv: new Float32Array(this.pv) }; }
}
function invPt(m, [x, y]) {
  const det = m[0] * m[3] - m[1] * m[2] || 1, dx = x - m[4], dy = y - m[5];
  return [(m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det];
}
function fan(p) {
  const out = [];
  for (let i = 1; i + 1 < p.length; i++) out.push(p[0][0], p[0][1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
  return out;
}
// (A polygon that turns one way only, once round: its fan never overlaps itself.)
function clean(p) {
  const q = [];
  for (const v of p) { const l = q[q.length - 1]; if (!l || Math.abs(l[0] - v[0]) > 1e-6 || Math.abs(l[1] - v[1]) > 1e-6) q.push(v); }
  while (q.length > 1 && Math.abs(q[0][0] - q[q.length - 1][0]) < 1e-6 && Math.abs(q[0][1] - q[q.length - 1][1]) < 1e-6) q.pop();
  return q;
}
function convex(p) {
  const q = clean(p), n = q.length;
  if (n < 3) return false;
  let sign = 0, turn = 0;
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n], c = q[(i + 2) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const cr = ux * vy - uy * vx;
    if (Math.abs(cr) > 1e-9) { const s = Math.sign(cr); if (sign && s !== sign) return false; sign = s; }
    turn += Math.atan2(cr, ux * vx + uy * vy);
  }
  return Math.abs(turn) < TAU + 0.01;
}
// The outline of a convex closed path as one ring of quads (half width hw), or null when it is not one (then stencil and cover).
function convexRing(p, hw) {
  const q = clean(p), n = q.length;
  if (n < 3 || !convex(q)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (let i = 0; i < n; i++) { const [x, y] = q[i], [x2, y2] = q[(i + 1) % n]; area += x * y2 - x2 * y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (hw > 0.22 * Math.min(x1 - x0, y1 - y0)) return null;
  const s = area > 0 ? 1 : -1, inn = [], out = [];
  for (let i = 0; i < n; i++) {
    const a = q[(i + n - 1) % n], b = q[i], c = q[(i + 1) % n];
    const e1 = norm(b[0] - a[0], b[1] - a[1]), e2 = norm(c[0] - b[0], c[1] - b[1]);
    const n1 = [e1[1] * s, -e1[0] * s], n2 = [e2[1] * s, -e2[0] * s];   // (outward)
    const mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my);
    if (ml < 1e-6) return null;
    const d = (mx / ml) * n1[0] + (my / ml) * n1[1];
    if (d < 0.25) return null;   // (a corner sharper than about 150°: drawn by stencil and cover)
    const k = hw / d, ox = (mx / ml) * k, oy = (my / ml) * k;
    out.push([b[0] + ox, b[1] + oy]); inn.push([b[0] - ox, b[1] - oy]);
  }
  const t = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    t.push(out[i][0], out[i][1], out[j][0], out[j][1], inn[j][0], inn[j][1], out[i][0], out[i][1], inn[j][0], inn[j][1], inn[i][0], inn[i][1]);
  }
  return t;
}
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
function disc(x, y, r, out) {
  const n = Math.max(6, Math.min(48, Math.ceil(TAU / (2 * Math.acos(Math.max(-1, 1 - TOL / Math.max(r, TOL)))))));
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n, b = (TAU * (i + 1)) / n;
    out.push(x, y, x + r * Math.cos(a), y + r * Math.sin(a), x + r * Math.cos(b), y + r * Math.sin(b));
  }
}
// A stroke's triangles (they overlap at the joins: drawn by stencil and cover, so each pixel is laid once). Joins are round (a
// disc at each bend), caps as asked.
function strokeTris(p, closed, hw, cap, out) {
  const q = clean(p);
  if (q.length < 2) return;
  const n = q.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    let a = q[i], b = q[(i + 1) % n];
    const [dx, dy] = norm(b[0] - a[0], b[1] - a[1]);
    if (cap === 'square' && !closed) {
      if (i === 0) a = [a[0] - dx * hw, a[1] - dy * hw];
      if (i === segs - 1) b = [b[0] + dx * hw, b[1] + dy * hw];
    }
    const nx = -dy * hw, ny = dx * hw;
    out.push(a[0] + nx, a[1] + ny, b[0] + nx, b[1] + ny, b[0] - nx, b[1] - ny, a[0] + nx, a[1] + ny, b[0] - nx, b[1] - ny, a[0] - nx, a[1] - ny);
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = q[(i + n - 1) % n], b = q[i], c = q[(i + 1) % n];
    const e1 = norm(b[0] - a[0], b[1] - a[1]), e2 = norm(c[0] - b[0], c[1] - b[1]);
    if (e1[0] * e2[0] + e1[1] * e2[1] > 0.9995) continue;   // (all but straight on: no gap to fill)
    disc(b[0], b[1], hw, out);
  }
  if (!closed && cap === 'round') { disc(q[0][0], q[0][1], hw, out); disc(q[n - 1][0], q[n - 1][1], hw, out); }
}

/** Runs draw(ctx) against a recorder w × h (device px) and keeps the record. */
export function recordPaint(width, height, draw) {
  const r = new PaintRecorder(width, height);
  draw(r);
  return r.done();
}

/** A GPU picture: a record that stands where a canvas did (width, height; free() sets them to 0). ver: the caller's count of paints. */
export function gpuPicture(rec, ver = 0) {
  return { width: rec.width, height: rec.height, rec, ver, gpuPicture: true };
}
export const isGpuPicture = (cv) => !!cv && cv.gpuPicture === true;

// ── The GPU side ──
const VS_C = `#version 300 es
in vec2 p; in vec4 c;
uniform vec4 uV;   // tile origin (device px), 2 / tile size
out vec4 vc;
void main() { vc = c; gl_Position = vec4((p - uV.xy) * uV.zw - 1.0, 0.0, 1.0); }`;
const FS_C = `#version 300 es
precision mediump float;
in vec4 vc; out vec4 o;
void main() { o = vc; }`;
const VS_P = `#version 300 es
in vec2 p;
uniform vec4 uV;
void main() { gl_Position = vec4((p - uV.xy) * uV.zw - 1.0, 0.0, 1.0); }`;
// A solid colour, or a radial gradient (concentric: centre, r0, r1, up to 8 stops, premultiplied), at the pixel's device px.
const FS_P = `#version 300 es
precision highp float;
uniform vec4 uC;
uniform int uN;
uniform vec4 uG;      // centre x, y, r0, r1
uniform vec2 uO;      // tile origin
uniform vec4 uS[8];   // stops' colours
uniform float uT[8];  // stops' offsets
out vec4 o;
void main() {
  if (uN == 0) { o = uC; return; }
  vec2 q = gl_FragCoord.xy + uO;
  float t = clamp((length(q - uG.xy) - uG.z) / max(uG.w - uG.z, 1e-6), 0.0, 1.0);
  vec4 c = uS[0];
  for (int i = 1; i < 8; i++) {
    if (i >= uN) break;
    if (t >= uT[i - 1]) c = mix(uS[i - 1], uS[i], clamp((t - uT[i - 1]) / max(uT[i] - uT[i - 1], 1e-6), 0.0, 1.0));
  }
  o = c;
}`;
// The shadow's blur: one direction per pass, texels outside the scratch read clear. uD: the offset into the source of this target's
// pixel (the scratch's margin when laying it on the tile).
const VS_Q = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_B = `#version 300 es
precision highp float;
uniform sampler2D uS;
uniform ivec2 uDir;
uniform ivec2 uD;
uniform float uSigma;
uniform int uN;
out vec4 o;
vec4 at(ivec2 q, ivec2 size) { return (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) ? vec4(0.0) : texelFetch(uS, q, 0); }
void main() {
  ivec2 size = textureSize(uS, 0), q = ivec2(gl_FragCoord.xy) + uD;
  vec4 c = at(q, size);
  float ws = 1.0;
  for (int i = 1; i <= 96; i++) {
    if (i > uN) break;
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    c += (at(q + uDir * i, size) + at(q - uDir * i, size)) * w;
    ws += 2.0 * w;
  }
  o = c / ws;
}`;
export const paintShaders = { VS_C, FS_C, VS_P, FS_P, VS_Q, FS_B };

const TILE = 1024;
const painters = new WeakMap();
/** The painter for one GPU context (made once per context; its programs start compiling at once). */
export function paintGL(gl) {
  let p = painters.get(gl);
  if (!p) { p = createPaintGL(gl); painters.set(gl, p); }
  return p;
}

export function createPaintGL(gl) {
  let progs = null, started = null, failed = false, res = null, freeT = 0, warmHold = null;
  // (Review pass item 8: what a paint leaves warm is held in the global budget (gpu-budget.js hold), which may let it go before WARM_MS.)
  const resBytes = () => { const r = res; if (!r) return 0; const t = TILE * TILE; return t * 8 * Math.max(1, r.samples) + t * 4 + (r.sh ? r.sh.w * r.sh.h * 12 : 0); };
  const begin = () => {
    try {
      started = [startProgram(gl, VS_C, FS_C, [['p', 0], ['c', 1]]), startProgram(gl, VS_P, FS_P, [['p', 0]]), startProgram(gl, VS_Q, FS_B, [['p', 0]])];
      publishWhenDone(gl, started, () => { try { ready(); } catch { /* read at the first paint */ } });
    } catch { failed = true; }
  };
  begin();
  gl.canvas?.addEventListener?.('webglcontextlost', () => { progs = null; res = null; started = null; warmHold?.drop(); warmHold = null; });
  gl.canvas?.addEventListener?.('webglcontextrestored', () => { failed = false; begin(); });
  function ready() {
    if (progs) return true;
    if (failed || gl.isContextLost()) return false;
    if (!started) begin();
    // (Review pass 2, item 2: never a status read that waits for the driver at the first paint. Still compiling, there is no picture
    // yet (null: the tissue keeps its last frame and asks again shortly), and the poller publishes the programs once they are done.)
    if (started && stillCompiling(gl, started)) return false;
    try {
      const [c, p, b] = started.map((h) => checkProgram(gl, h));
      const loc = (pr, ns) => Object.fromEntries(ns.map((n) => [n, gl.getUniformLocation(pr, n)]));
      progs = { c: { p: c, U: loc(c, ['uV']) }, p: { p, U: loc(p, ['uV', 'uC', 'uN', 'uG', 'uO', 'uS', 'uT']) }, b: { p: b, U: loc(b, ['uS', 'uDir', 'uD', 'uSigma', 'uN']) } };
      return true;
    } catch (err) { failed = true; console.warn('GPU pictures cannot be painted here.', err); return false; }
  }
  // The tile's framebuffers (multisampled, and its resolve), the shadow's scratch pair and the quad: made for a paint, given back a
  // few seconds after the last one (they are tens of MB: an iPhone keeps none of it between paints).
  function resources() {
    if (res) return res;
    const samples = Math.min(4, glCap(gl, gl.MAX_SAMPLES) || 0);
    const ms = gl.createFramebuffer(), msC = gl.createRenderbuffer(), msS = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msC);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, TILE, TILE); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, TILE, TILE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, msS);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH24_STENCIL8, TILE, TILE); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, TILE, TILE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msC);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, msS);
    const rs = gl.createFramebuffer(), rsT = tex(TILE, TILE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rs);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rsT, 0);
    const vaoC = gl.createVertexArray(), vaoP = gl.createVertexArray(), bufC = gl.createBuffer(), bufP = gl.createBuffer(), vaoQ = gl.createVertexArray(), bufQ = gl.createBuffer();
    gl.bindVertexArray(vaoC); gl.bindBuffer(gl.ARRAY_BUFFER, bufC);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(vaoP); gl.bindBuffer(gl.ARRAY_BUFFER, bufP);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(vaoQ); gl.bindBuffer(gl.ARRAY_BUFFER, bufQ);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    res = { samples, ms, msC, msS, rs, rsT, vaoC, vaoP, bufC, bufP, vaoQ, bufQ, sh: null };
    return res;
  }
  function tex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  // (The shadow's scratch: a texture with a stencil for the shape, and a second texture for the first blur pass.)
  function shadowScratch(w, h) {
    const r = res;
    if (r.sh && r.sh.w >= w && r.sh.h >= h) return r.sh;
    // (The old size read before it is let go (recs-production-120hz §18: dropShadow clears r.sh, so reading it after kept nothing, and a
    // wide shadow then a tall one made the scratch again each time). It grows to hold both, in buckets.)
    const ow = r.sh?.w || 0, oh = r.sh?.h || 0;
    dropShadow();
    const W = bucket(Math.max(w, ow)), H = bucket(Math.max(h, oh));   // (R08: in buckets, warm-views.js)
    const a = gl.createFramebuffer(), aT = tex(W, H), aS = gl.createRenderbuffer(), b = gl.createFramebuffer(), bT = tex(W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, aS); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, aT, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, aS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bT, 0);
    r.sh = { a, aT, aS, b, bT, w: W, h: H };
    return r.sh;
  }
  function dropShadow() {
    const s = res?.sh;
    if (!s) return;
    if (!gl.isContextLost()) { gl.deleteFramebuffer(s.a); gl.deleteFramebuffer(s.b); gl.deleteTexture(s.aT); gl.deleteTexture(s.bT); gl.deleteRenderbuffer(s.aS); }
    res.sh = null;
  }
  function release() {
    clearTimeout(freeT); freeT = 0;
    warmHold?.drop(); warmHold = null;
    if (!res) return;
    if (!gl.isContextLost()) {
      dropShadow();
      const r = res;
      gl.deleteFramebuffer(r.ms); gl.deleteFramebuffer(r.rs); gl.deleteRenderbuffer(r.msC); gl.deleteRenderbuffer(r.msS); gl.deleteTexture(r.rsT);
      gl.deleteVertexArray(r.vaoC); gl.deleteVertexArray(r.vaoP); gl.deleteVertexArray(r.vaoQ); gl.deleteBuffer(r.bufC); gl.deleteBuffer(r.bufP); gl.deleteBuffer(r.bufQ); if (r.bufQ2) gl.deleteBuffer(r.bufQ2);
    }
    res = null;
  }

  // The host's state, put back as it was after a paint (it may be drawing a frame around it).
  function saveState() {
    // (From the renderer's own record of the context (gl-state.js, R09): no query reaches the driver. ?glstate=0: asked, as before.)
    const g = (k) => glGet(gl, k);
    return {
      fbR: g(gl.READ_FRAMEBUFFER_BINDING), fbD: g(gl.DRAW_FRAMEBUFFER_BINDING), vp: g(gl.VIEWPORT), prog: g(gl.CURRENT_PROGRAM), vao: g(gl.VERTEX_ARRAY_BINDING),
      buf: g(gl.ARRAY_BUFFER_BINDING), rb: g(gl.RENDERBUFFER_BINDING), unit: g(gl.ACTIVE_TEXTURE), tex: g(gl.TEXTURE_BINDING_2D),
      blend: glOn(gl, gl.BLEND), stencil: glOn(gl, gl.STENCIL_TEST), scissor: glOn(gl, gl.SCISSOR_TEST), depth: glOn(gl, gl.DEPTH_TEST), cull: glOn(gl, gl.CULL_FACE),
      bf: [g(gl.BLEND_SRC_RGB), g(gl.BLEND_DST_RGB), g(gl.BLEND_SRC_ALPHA), g(gl.BLEND_DST_ALPHA)], be: [g(gl.BLEND_EQUATION_RGB), g(gl.BLEND_EQUATION_ALPHA)],
      cm: g(gl.COLOR_WRITEMASK), cc: g(gl.COLOR_CLEAR_VALUE), sm: g(gl.STENCIL_WRITEMASK), sbm: g(gl.STENCIL_BACK_WRITEMASK), sci: g(gl.SCISSOR_BOX),
    };
  }
  function putState(s) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.fbR); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fbD);
    gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3]);
    gl.useProgram(s.prog); gl.bindVertexArray(s.vao); gl.bindBuffer(gl.ARRAY_BUFFER, s.buf); gl.bindRenderbuffer(gl.RENDERBUFFER, s.rb);
    gl.activeTexture(s.unit); gl.bindTexture(gl.TEXTURE_2D, s.tex);
    for (const [cap, on] of [[gl.BLEND, s.blend], [gl.STENCIL_TEST, s.stencil], [gl.SCISSOR_TEST, s.scissor], [gl.DEPTH_TEST, s.depth], [gl.CULL_FACE, s.cull]]) { if (on) gl.enable(cap); else gl.disable(cap); }
    gl.blendFuncSeparate(s.bf[0], s.bf[1], s.bf[2], s.bf[3]); gl.blendEquationSeparate(s.be[0], s.be[1]);
    gl.colorMask(s.cm[0], s.cm[1], s.cm[2], s.cm[3]); gl.clearColor(s.cc[0], s.cc[1], s.cc[2], s.cc[3]);
    gl.stencilMaskSeparate(gl.FRONT, s.sm); gl.stencilMaskSeparate(gl.BACK, s.sbm);
    gl.scissor(s.sci[0], s.sci[1], s.sci[2], s.sci[3]);
  }

  /** Paints record rec into a new texture (RGBA8, premultiplied, mipmapped unless mip is false, row 0 at the picture's top, as a
   *  canvas's texture is sent); null where it cannot (no programs, a lost context, a picture past the GPU's texture size). The host's
   *  bindings and switches are as they were afterwards, except that the new texture is bound on the active unit. */
  function paint(rec, { mip = true, wrap = null } = {}) {
    if (!rec || !(rec.width > 0) || !(rec.height > 0) || gl.isContextLost() || !ready()) return null;
    const W = Math.ceil(rec.width), H = Math.ceil(rec.height);
    const MAX = glCap(gl, gl.MAX_TEXTURE_SIZE);
    if (W > MAX || H > MAX) return null;
    const st = saveState();
    let out = null;
    try {
      const r = resources();
      out = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, out);
      const levels = mip ? Math.floor(Math.log2(Math.max(W, H))) + 1 : 1;
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, W, H);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.bufC); gl.bufferData(gl.ARRAY_BUFFER, rec.cv.length ? rec.cv : new Float32Array(6), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.bufP); gl.bufferData(gl.ARRAY_BUFFER, rec.pv.length ? rec.pv : new Float32Array(2), gl.STATIC_DRAW);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.SCISSOR_TEST);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      for (let ty = 0; ty < H; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
        const tw = Math.min(TILE, W - tx), th = Math.min(TILE, H - ty);
        drawTile(rec, r, tx, ty, tw, th);
        // (Resolved at the same place, as a multisampled blit must be, then copied into its place in the picture.)
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, r.rs);
        gl.blitFramebuffer(0, 0, tw, th, 0, 0, tw, th, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.rs);
        gl.bindTexture(gl.TEXTURE_2D, out);
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, tx, ty, 0, 0, tw, th);
        gl.enable(gl.SCISSOR_TEST);
      }
      gl.bindTexture(gl.TEXTURE_2D, out);
      const wr = wrap || gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    } catch (err) {
      console.warn('A GPU picture could not be painted.', err);
      if (out) gl.deleteTexture(out);
      out = null;
    } finally {
      putState(st);
      if (out) gl.bindTexture(gl.TEXTURE_2D, out);
    }
    clearTimeout(freeT); freeT = setTimeout(release, WARM_VIEWS ? WARM_MS : 3000);   // (R08: kept warm through the next slide's paints)
    if (res) { if (warmHold?.held) warmHold.touch(); else warmHold = hold({ owner: 'paint-gl', kind: 'warm', bytes: resBytes, release, gl }); }
    return out;
  }

  // A cover: the box, a pixel past it, laid with the plain program from a small buffer of its own.
  function coverBox(r, b) {
    const x0 = b[0] - 1, y0 = b[1] - 1, x1 = b[2] + 1, y1 = b[3] + 1;
    gl.bindVertexArray(r.vaoP);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.bufQ2 || (r.bufQ2 = gl.createBuffer()));
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]), gl.STREAM_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.bufP); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  }
  // One tile: cleared, every op that reaches it drawn in order, its clip kept in the stencil's top bit.
  function drawTile(rec, r, tx, ty, tw, th) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.ms);
    gl.viewport(0, 0, tw, th); gl.scissor(0, 0, tw, th);
    gl.colorMask(true, true, true, true); gl.stencilMask(0xff);
    gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const view = [tx, ty, 2 / tw, 2 / th];
    let clipOn = null;
    const hits = (b) => b[2] >= tx - 1 && b[0] <= tx + tw + 1 && b[3] >= ty - 1 && b[1] <= ty + th + 1;
    const plain = (from, count) => { gl.bindVertexArray(r.vaoP); gl.drawArrays(gl.TRIANGLES, from, count); };
    const useP = () => { gl.useProgram(progs.p.p); gl.uniform4fv(progs.p.U.uV, view); };
    const quad = (b) => coverBox(r, b);
    const full = [tx - 2, ty - 2, tx + tw + 2, ty + th + 2];
    const winding = (from, count, rule, stroke) => {
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      if (stroke) { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
      else if (rule === 'evenodd') { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); }
      else { gl.stencilMask(0x7f); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
      plain(from, count);
      gl.colorMask(true, true, true, true);
    };
    const setClip = (list) => {
      if (list === clipOn) return;
      useP();
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xff); gl.clear(gl.STENCIL_BUFFER_BIT);
      (list || []).forEach((c, i) => {
        winding(c.from, c.count, c.rule, false);
        gl.colorMask(false, false, false, false);
        gl.stencilMask(0xff);
        if (i === 0) { gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x7f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); quad(c.box); }
        else { gl.stencilFunc(gl.LESS, 0x80, 0xff); gl.stencilOp(gl.ZERO, gl.ZERO, gl.REPLACE); quad(full); }
        gl.colorMask(true, true, true, true);
      });
      clipOn = list;
    };
    const setPaint = (paint) => {
      useP();
      const U = progs.p.U;
      if (paint.rgba) { gl.uniform1i(U.uN, 0); gl.uniform4fv(U.uC, paint.rgba); return; }
      const g = paint.grad, n = g.stops.length, S = new Float32Array(32), T = new Float32Array(8);
      g.stops.forEach(([t, r0, g0, b0, a0], i) => { S.set([r0, g0, b0, a0], i * 4); T[i] = t; });
      gl.uniform1i(U.uN, n); gl.uniform4f(U.uG, g.cx, g.cy, g.r0, g.r1); gl.uniform2f(U.uO, tx, ty);
      gl.uniform4fv(U.uS, S); gl.uniform1fv(U.uT, T);
    };
    const cover = (box, clip) => {
      gl.stencilMask(0x7f);
      if (clip) gl.stencilFunc(gl.LESS, 0x80, 0xff); else gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
      gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
      quad(box);
    };
    for (const op of rec.ops) {
      if (op.k === 'direct') {
        if (op.clip) { setClip(op.clip); gl.enable(gl.STENCIL_TEST); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); } else gl.disable(gl.STENCIL_TEST);
        gl.useProgram(progs.c.p); gl.uniform4fv(progs.c.U.uV, view);
        gl.bindVertexArray(r.vaoC); gl.drawArrays(gl.TRIANGLES, op.from, op.count);
        continue;
      }
      const reach = op.shadow ? Math.ceil(op.shadow.sigma * 3) + 2 : 0, b = op.box;
      if (!hits([b[0] - reach, b[1] - reach, b[2] + reach, b[3] + reach])) continue;
      setClip(op.clip);
      gl.enable(gl.STENCIL_TEST);
      if (op.k === 'clear') {
        useP(); gl.uniform1i(progs.p.U.uN, 0); gl.uniform4f(progs.p.U.uC, 0, 0, 0, 0);
        gl.blendFunc(gl.ZERO, gl.ZERO);
        gl.stencilMask(0); if (op.clip) gl.stencilFunc(gl.EQUAL, 0x80, 0x80); else gl.stencilFunc(gl.ALWAYS, 0, 0);
        plain(op.from, op.count);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        continue;
      }
      if (op.shadow) shadow(rec, r, op, tx, ty, tw, th, reach, view);
      useP();
      winding(op.from, op.count, op.rule, op.k === 'stroke');
      setPaint(op.paint);
      cover(op.box, !!op.clip);
    }
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(null);
  }
  // A shape's shadow on this tile: its coverage in the shadow's colour, on a scratch reaching `reach` px past the tile, blurred across,
  // then down onto the tile under the shape (inside the clip), as the canvas lays a shadow before its shape.
  function shadow(rec, r, op, tx, ty, tw, th, M, view) {
    const sw = tw + 2 * M, shh = th + 2 * M, s = shadowScratch(sw, shh), sig = Math.max(0.5, op.shadow.sigma), n = Math.min(96, Math.ceil(sig * 3));
    // 1. Coverage.
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.a);
    gl.viewport(0, 0, sw, shh); gl.scissor(0, 0, s.w, s.h);
    gl.colorMask(true, true, true, true); gl.stencilMask(0xff); gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(progs.p.p);
    const sv = [tx - M, ty - M, 2 / sw, 2 / shh];
    gl.uniform4fv(progs.p.U.uV, sv);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    if (op.k === 'stroke') { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
    else if (op.rule === 'evenodd') { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); }
    else { gl.stencilMask(0x7f); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
    gl.bindVertexArray(r.vaoP); gl.drawArrays(gl.TRIANGLES, op.from, op.count);
    gl.colorMask(true, true, true, true);
    gl.uniform1i(progs.p.U.uN, 0); gl.uniform4fv(progs.p.U.uC, op.shadow.rgba);
    gl.stencilMask(0x7f); gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
    gl.disable(gl.BLEND);
    coverBox(r, [tx - M, ty - M, tx + tw + M, ty + th + M]);
    gl.bindVertexArray(r.vaoQ);
    // 2. Across, into the second scratch.
    gl.disable(gl.STENCIL_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.b);
    gl.useProgram(progs.b.p);
    const U = progs.b.U;
    gl.uniform1i(U.uS, 0); gl.uniform1f(U.uSigma, sig); gl.uniform1i(U.uN, n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.aT);
    gl.uniform2i(U.uDir, 1, 0); gl.uniform2i(U.uD, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. Down, onto the tile (inside its clip).
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.ms);
    gl.viewport(0, 0, tw, th); gl.scissor(0, 0, tw, th);
    gl.bindTexture(gl.TEXTURE_2D, s.bT);
    gl.uniform2i(U.uDir, 0, 1); gl.uniform2i(U.uD, M, M);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (op.clip) { gl.enable(gl.STENCIL_TEST); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.STENCIL_TEST);
    void view;
  }
  return {
    paint,
    release,
    get ready() { return !!progs; },
  };
}
