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

import { glGet, glOn, glCap, fbComplete } from './gl-state.js';
import { ucOf } from './uniform-cache.js';
import { cssColor } from './css-color.js';
import { hold } from './gpu-budget.js';
import { WARM_MS, bucket } from './warm-views.js';
import { startProgram, checkProgram, publishWhenDone, stillCompiling } from './gl-compile.js';
import { caught } from './caught.js';

const TAU = Math.PI * 2;
const TOL = 0.2;   // (curves flattened to within 0.2 device px)

// ── The recorder ──
const NUM_FILL = { numeric: 'fill' }, NUM_STROKE = { numeric: 'stroke' }, QN = [0, 0, 0, 1];   // (a colour set as numbers, and the array it is read from)
const numQ = (r, g, b, a) => { QN[0] = r; QN[1] = g; QN[2] = b; QN[3] = a; return QN; };
// (A gradient is the recorder's own, one of a list it keeps and hands out again for each recording: a painter uses it where it made it,
// and none is kept past the picture. Its stops are the first ns of the list, in order of offset.)
class Gradient {
  constructor() { this.g = { x0: 0, y0: 0, r0: 0, x1: 0, y1: 0, r1: 0, m: [1, 0, 0, 1, 0, 0] }; this.stops = []; this.ns = 0; }   // alloc-rare: pool empty: a gradient is made only when more are used in one picture than ever before
  addColorStop(t, c) {
    const st = this.stops;
    if (this.ns === st.length) st.push([0, null]);   // alloc-rare: pool empty: a stop slot is made only when a gradient has more stops than ever before
    const e = st[this.ns++];
    e[0] = Math.max(0, Math.min(1, +t)); e[1] = cssColor(c);
    // (Kept in order of offset, equal offsets in the order they came, as the stable sort did.)
    for (let i = this.ns - 1; i > 0 && st[i - 1][0] - st[i][0] > 0; i--) { const q = st[i]; st[i] = st[i - 1]; st[i - 1] = q; }
  }
}
// (The matrix times (a..f), written back into m: the same six numbers the product made, with no new array.)
const mulM = (m, a, b, c, d, e, f) => {
  const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
  const e2 = m0 * e + m2 * f + m[4], f2 = m1 * e + m3 * f + m[5];
  m[0] = m0 * a + m2 * b; m[1] = m1 * a + m3 * b; m[2] = m0 * c + m2 * d; m[3] = m1 * c + m3 * d; m[4] = e2; m[5] = f2;
};
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

// ── The record's pools ──
// A picture's record is made of many small records (a batch, an op, a clip, a paint, a shadow, a stop list) over two vertex arrays. During
// a zoom several new tiles are recorded in consecutive frames, so none of them is made afresh: each kind has a free list, the recorder
// takes from it, and a picture given back (releasePicture, lobule-zoom.js free) returns all of its records to it. Every taker sets every
// field, so nothing of an earlier picture is left in the next. A pool grows only when it is empty, to the most records alive at once
// (one line each, tagged); after that a picture's recording makes none. A record is recycled once: its holders are counted (gpuPicture
// holds one; a record that nobody holds is released by releaseRecord), and the picture lets go of its record when it is released, so a
// stale reader finds none. The pooled records are the very shapes the unpooled recorder made (same keys, same values), nothing more.
const LED = Symbol('paint-gl record ledger');   // (a hidden property of each record: not enumerable, so the record reads as it always did)
const EMPTY_F32 = new Float32Array(0);
const P_SHELL = [], P_RECORDER = [], P_STATE = [], P_BATCH = [], P_OP = [], P_CLEAR = [], P_CLIP = [], P_SOLID = [], P_SHADOW = [];
const P_GRAD = [], P_CHAIN = [], P_F32 = [];   // (by stop count, by chain length, by size class: lists of lists)
function newShell() {
  const rec = { width: 0, height: 0, ops: [], cv: EMPTY_F32, pv: EMPTY_F32 };   // alloc-rare: pool empty: a record shell is made only when more pictures are alive than ever before
  Object.defineProperty(rec, LED, { value: { live: false, refs: 0, clips: [], chains: [], nClips: 0, nChains: 0, cvb: null, pvb: null } });   // alloc-rare: pool empty (the shell's ledger, made with the shell)
  return rec;
}
function takeShell() {
  const rec = P_SHELL.pop() || newShell(), led = rec[LED];
  led.live = true; led.refs = 0; led.nClips = 0; led.nChains = 0; led.cvb = null; led.pvb = null;
  rec.width = 0; rec.height = 0; rec.ops.length = 0; rec.cv = EMPTY_F32; rec.pv = EMPTY_F32;
  return rec;
}
// (A vertex array's storage: Float32Arrays in power-of-two classes, from 1024 numbers.)
function f32Take(n) {
  const c = n <= 1024 ? 10 : 32 - Math.clz32(n - 1);
  const list = P_F32[c] || (P_F32[c] = []);   // alloc-rare: the first storage of a size class (the list of its spare ones)
  return list.pop() || new Float32Array(1 << c);   // alloc-rare: pool empty: storage of this class is made only when more is in use than ever before
}
const f32Give = (b) => { P_F32[31 - Math.clz32(b.length)].push(b); };
function takeBatch(from, clip) {
  const b = P_BATCH.pop() || { k: 'direct', from: 0, count: 0, clip: null };   // alloc-rare: pool empty: a batch is made only when more are alive than ever before
  b.from = from; b.count = 0; b.clip = clip;
  return b;
}
function takeOp(k, from, count, rule, paint, shadow, clip, x0, y0, x1, y1) {
  const o = P_OP.pop() || { k: '', from: 0, count: 0, rule: '', paint: null, shadow: null, clip: null, box: [0, 0, 0, 0] };   // alloc-rare: pool empty: an op (with its box) is made only when more are alive than ever before
  o.k = k; o.from = from; o.count = count; o.rule = rule; o.paint = paint; o.shadow = shadow; o.clip = clip;
  const b = o.box; b[0] = x0; b[1] = y0; b[2] = x1; b[3] = y1;
  return o;
}
function takeClear(from, count, clip, x0, y0, x1, y1) {
  const o = P_CLEAR.pop() || { k: 'clear', from: 0, count: 0, clip: null, box: [0, 0, 0, 0] };   // alloc-rare: pool empty: a clear op (with its box) is made only when more are alive than ever before
  o.from = from; o.count = count; o.clip = clip;
  const b = o.box; b[0] = x0; b[1] = y0; b[2] = x1; b[3] = y1;
  return o;
}
function takeClip(from, count, rule, x0, y0, x1, y1) {
  const c = P_CLIP.pop() || { from: 0, count: 0, rule: '', box: [0, 0, 0, 0] };   // alloc-rare: pool empty: a clip (with its box) is made only when more are alive than ever before
  c.from = from; c.count = count; c.rule = rule;
  const b = c.box; b[0] = x0; b[1] = y0; b[2] = x1; b[3] = y1;
  return c;
}
// A clip chain: the clips before it, then the new one (a list of exactly that length, kept by length).
function takeChain(prev, c) {
  const n = (prev ? prev.length : 0) + 1;
  const list = P_CHAIN[n] || (P_CHAIN[n] = []);   // alloc-rare: the first chain of this length (the list of its spare ones)
  let a = list.pop();
  if (!a) { a = []; for (let i = 0; i < n; i++) a.push(null); }   // alloc-rare: pool empty: a chain of this length is made only when more are alive than ever before
  for (let i = 0; i < n - 1; i++) a[i] = prev[i];
  a[n - 1] = c;
  return a;
}
function takeSolid(r, g, b, a) {
  const p = P_SOLID.pop() || { rgba: [0, 0, 0, 0] };   // alloc-rare: pool empty: a solid paint is made only when more are alive than ever before
  const o = p.rgba; o[0] = r; o[1] = g; o[2] = b; o[3] = a;
  return p;
}
function makeGrad(n) {
  const stops = [];   // alloc-rare: pool empty (a gradient paint of this many stops)
  for (let i = 0; i < n; i++) stops.push([0, 0, 0, 0, 0]);   // alloc-rare: pool empty (its stops)
  return { grad: { cx: 0, cy: 0, r0: 0, r1: 0, stops } };   // alloc-rare: pool empty (the paint itself)
}
function takeGrad(n) {
  const list = P_GRAD[n] || (P_GRAD[n] = []);   // alloc-rare: the first gradient paint with this many stops (the list of its spare ones)
  return list.pop() || makeGrad(n);
}
function takeShadow(r, g, b, a, sigma) {
  const s = P_SHADOW.pop() || { rgba: [0, 0, 0, 0], sigma: 0 };   // alloc-rare: pool empty: a shadow is made only when more are alive than ever before
  const o = s.rgba; o[0] = r; o[1] = g; o[2] = b; o[3] = a; s.sigma = sigma;
  return s;
}
// (The path's points and sub-paths are pooled the same way: they are given back when the path is begun again. A path is its list a and
// the count n of sub-paths in it, a sub-path its list p and the count n of points: the lists keep their room, so they are written by
// index, and what is past the count is not read.)
const P_PT = [], P_SUB = [], P_PATH = [];
function takePt(x, y) {
  const a = P_PT.pop() || [0, 0];   // alloc-rare: pool empty: a path point is made only when a path has more points than ever before
  a[0] = x; a[1] = y;
  return a;
}
function takeSub(first) {
  const s = P_SUB.pop() || { p: [], n: 0, closed: false };   // alloc-rare: pool empty: a sub-path is made only when a path has more of them than ever before
  s.p[0] = first; s.n = 1; s.closed = false;
  return s;
}
function dropPath(path) {
  for (let i = 0; i < path.n; i++) {
    const sub = path.a[i], p = sub.p;
    for (let j = 0; j < sub.n; j++) P_PT.push(p[j]);
    P_SUB.push(sub);
  }
  path.n = 0;
}
function newState() {
  return { m: [1, 0, 0, 1, 0, 0], fill: 'black', stroke: 'black', fr: 0, fg: 0, fb: 0, fa: 1, kr: 0, kg: 0, kb: 0, ka: 1, lw: 1, cap: 'butt', join: 'miter', ga: 1, sb: 0, sc: 'transparent', clip: null };   // alloc-rare: pool empty: a saved drawing state is made only when saves nest deeper than ever before
}
function copyState(to, s) {
  const m = to.m, f = s.m;
  m[0] = f[0]; m[1] = f[1]; m[2] = f[2]; m[3] = f[3]; m[4] = f[4]; m[5] = f[5];
  to.fill = s.fill; to.stroke = s.stroke; to.fr = s.fr; to.fg = s.fg; to.fb = s.fb; to.fa = s.fa; to.kr = s.kr; to.kg = s.kg; to.kb = s.kb; to.ka = s.ka; to.lw = s.lw; to.cap = s.cap; to.join = s.join; to.ga = s.ga; to.sb = s.sb; to.sc = s.sc; to.clip = s.clip;
}
// A record's own parts given back to their pools (the shapes are told apart as the recorder made them).
function giveOp(op) {
  if (op.k === 'direct') { P_BATCH.push(op); return; }
  if (op.k === 'clear') { P_CLEAR.push(op); return; }
  const p = op.paint;
  if (p) { if (p.rgba) P_SOLID.push(p); else P_GRAD[p.grad.stops.length].push(p); }
  if (op.shadow) P_SHADOW.push(op.shadow);
  P_OP.push(op);
}
function recycle(rec, led) {
  led.live = false; led.refs = 0;
  const ops = rec.ops;
  for (let i = 0; i < ops.length; i++) giveOp(ops[i]);
  ops.length = 0;
  for (let i = 0; i < led.nClips; i++) P_CLIP.push(led.clips[i]);
  for (let i = 0; i < led.nChains; i++) { const a = led.chains[i]; P_CHAIN[a.length].push(a); }
  led.nClips = 0; led.nChains = 0;
  if (led.cvb) f32Give(led.cvb);
  if (led.pvb) f32Give(led.pvb);
  led.cvb = null; led.pvb = null;
  rec.width = 0; rec.height = 0; rec.cv = EMPTY_F32; rec.pv = EMPTY_F32;
  P_SHELL.push(rec);
}
/** Gives a record's parts back for the next picture. A record held by pictures (gpuPicture) goes only when the last lets go; one nobody
 *  holds goes at once. False for a record already given back, or one this recorder did not make. Nothing may read it afterwards. */
export function releaseRecord(rec) {
  const led = rec?.[LED];
  if (!led || !led.live) return false;
  if (--led.refs > 0) return false;
  recycle(rec, led);
  return true;
}

/** A recorder with a 2D context's drawing calls (the ones the app's painters use). The record: ops (in order) over two vertex arrays. */
export class PaintRecorder {
  // (Made only when no recorder is spare, recordPaint: its own state, path, saved states and gradients, which every recording after reuses.)
  constructor(width, height) {
    this.s = newState();
    this.stack = [];   // alloc-rare: pool empty: a recorder is made only when more recordings run at once than ever before
    this.path = { a: [], n: 0 }; this.sub = null;   // alloc-rare: pool empty (the recorder's own path)
    this.canvas = { width, height };   // alloc-rare: pool empty (the recorder's own canvas stand-in)
    this.grads = []; this.gn = 0;   // alloc-rare: pool empty (the gradients made in a recording, over again for the next)
    this.tf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };   // alloc-rare: pool empty (what getTransform hands out, written in place)
    this._init(width, height);
  }
  // Starts a recording (a pooled recorder is started again for each picture; every field is set).
  _init(width, height) {
    this.width = width; this.height = height;
    const rec = this.rec = takeShell(), led = rec[LED];
    this.ops = rec.ops;
    this.cvb = led.cvb = f32Take(0); this.cvn = 0;   // coloured triangles: x, y, r, g, b, a (premultiplied)
    this.pvb = led.pvb = f32Take(0); this.pvn = 0;   // plain triangles: x, y
    const s = this.s, m = s.m;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0;
    s.fill = 'black'; s.stroke = 'black'; s.fr = 0; s.fg = 0; s.fb = 0; s.fa = 1; s.kr = 0; s.kg = 0; s.kb = 0; s.ka = 1; s.lw = 1; s.cap = 'butt'; s.join = 'miter'; s.ga = 1; s.sb = 0; s.sc = 'transparent'; s.clip = null;
    while (this.stack.length) P_STATE.push(this.stack.pop());
    dropPath(this.path); this.sub = null;
    this.gn = 0;
    this.batch = null;
    this.canvas.width = width; this.canvas.height = height;
    this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low'; this.globalCompositeOperation = 'source-over';
  }
  // A recording given up part way (the painter threw): what it made goes back.
  _abort() {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null; this.ops = null; this.gn = 0;
    recycle(rec, rec[LED]);
  }
  _growCv(need) { const b = f32Take(need); b.set(this.cvb); f32Give(this.cvb); this.cvb = this.rec[LED].cvb = b; }
  _growPv(need) { const b = f32Take(need); b.set(this.pvb); f32Give(this.pvb); this.pvb = this.rec[LED].pvb = b; }
  // State
  get fillStyle() { return this.s.fill; } set fillStyle(v) { this.s.fill = v; }
  get strokeStyle() { return this.s.stroke; } set strokeStyle(v) { this.s.stroke = v; }
  // The fill or stroke colour given as numbers (r, g, b: 0 ... 255, a: 0 ... 1), the colour 'rgba(r,g,b,a)' names, with no text made to be parsed.
  setFillRGBA(r, g, b, a) { const s = this.s; s.fill = NUM_FILL; s.fr = r / 255; s.fg = g / 255; s.fb = b / 255; s.fa = a; }
  setStrokeRGBA(r, g, b, a) { const s = this.s; s.stroke = NUM_STROKE; s.kr = r / 255; s.kg = g / 255; s.kb = b / 255; s.ka = a; }
  get lineWidth() { return this.s.lw; } set lineWidth(v) { if (v > 0 && Number.isFinite(v)) this.s.lw = +v; }
  get lineCap() { return this.s.cap; } set lineCap(v) { this.s.cap = v; }
  get lineJoin() { return this.s.join; } set lineJoin(v) { this.s.join = v; }
  get globalAlpha() { return this.s.ga; } set globalAlpha(v) { if (v >= 0 && v <= 1) this.s.ga = +v; }
  get shadowBlur() { return this.s.sb; } set shadowBlur(v) { if (v >= 0 && Number.isFinite(v)) this.s.sb = +v; }
  get shadowColor() { return this.s.sc; } set shadowColor(v) { this.s.sc = v; }
  // (A saved state is a pooled record copied from the current one; the state restored from is given back.)
  save() { const t = P_STATE.pop() || newState(); copyState(t, this.s); this.stack.push(t); }
  restore() { const s = this.stack.pop(); if (s) { P_STATE.push(this.s); this.s = s; } }
  setTransform(a, b, c, d, e, f) { if (typeof a === 'object' && a) ({ a, b, c, d, e, f } = a); const m = this.s.m; m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f; }
  resetTransform() { const m = this.s.m; m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0; }
  // (The recorder's own object, written in place: read where it is asked for, as the painting does; not kept.)
  getTransform() { const m = this.s.m, t = this.tf; t.a = m[0]; t.b = m[1]; t.c = m[2]; t.d = m[3]; t.e = m[4]; t.f = m[5]; return t; }
  transform(a, b, c, d, e, f) { mulM(this.s.m, a, b, c, d, e, f); }
  translate(x, y) { mulM(this.s.m, 1, 0, 0, 1, x, y); }
  scale(x, y) { mulM(this.s.m, x, 0, 0, y, 0, 0); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); mulM(this.s.m, c, s, -s, c, 0, 0); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    if (this.gn === this.grads.length) this.grads.push(new Gradient());   // alloc-rare: pool empty: a gradient is made only when more are used in one picture than ever before
    const G = this.grads[this.gn++];
    const g = G.g, m = g.m, f = this.s.m;
    g.x0 = x0; g.y0 = y0; g.r0 = r0; g.x1 = x1; g.y1 = y1; g.r1 = r1;
    m[0] = f[0]; m[1] = f[1]; m[2] = f[2]; m[3] = f[3]; m[4] = f[4]; m[5] = f[5];
    G.ns = 0;
    return G;
  }
  // Path (points kept in device px; each is a pooled pair, given back with its sub-path when the path is begun again)
  _pt(x, y) { const m = this.s.m; return takePt(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]); }
  beginPath() { dropPath(this.path); this.sub = null; }
  // (A path made on the side, for a rect that is filled or stroked at once: the path in hand is kept as it was.)
  _side() { const kp = this.path; this.path = P_PATH.pop() || { a: [], n: 0 }; return kp; }   // alloc-rare: pool empty: a side path is made only when more nest than ever before
  _unside(kp, ks) { dropPath(this.path); P_PATH.push(this.path); this.path = kp; this.sub = ks; }
  _addSub(sub) { const path = this.path; path.a[path.n++] = sub; this.sub = sub; }
  moveTo(x, y) { this._addSub(takeSub(this._pt(x, y))); }
  lineTo(x, y) { if (!this.sub) { this.moveTo(x, y); return; } if (this.sub.closed) this._reopen(); const sub = this.sub; sub.p[sub.n++] = this._pt(x, y); }
  _reopen() { const s = this.sub.p[0]; this._addSub(takeSub(takePt(s[0], s[1]))); }
  closePath() { if (this.sub && this.sub.n) this.sub.closed = true; }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.sub) this.moveTo(cx, cy);
    if (this.sub.closed) this._reopen();
    const m = this.s.m, sub = this.sub, p = sub.p;
    invPt(m, p[sub.n - 1]);
    const ix = IX, iy = IY;
    const n = Math.min(64, Math.max(2, Math.ceil(Math.sqrt(Math.hypot(cx - ix, cy - iy) * scaleOf(m) / TOL) / 2)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      p[sub.n++] = this._pt(u * u * ix + 2 * u * t * cx + t * t * x, u * u * iy + 2 * u * t * cy + t * t * y);
    }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.sub) this.moveTo(c1x, c1y);
    if (this.sub.closed) this._reopen();
    const m = this.s.m, sub = this.sub, p = sub.p;
    invPt(m, p[sub.n - 1]);
    const ix = IX, iy = IY;
    const L = Math.hypot(c1x - ix, c1y - iy) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y);
    const n = Math.min(96, Math.max(2, Math.ceil(Math.sqrt(L * scaleOf(m) / TOL) / 2)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      p[sub.n++] = this._pt(u * u * u * ix + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * iy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
    }
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
    const p0 = this._ept(x, y, rx, ry, cr, sr, a0);
    if (!this.sub) this._addSub(takeSub(p0));
    else { if (this.sub.closed) this._reopen(); const sub = this.sub; sub.p[sub.n++] = p0; }
    const sub = this.sub;
    for (let i = 1; i <= n; i++) sub.p[sub.n++] = this._ept(x, y, rx, ry, cr, sr, a0 + (sweep * i) / n);
  }
  // The point at angle a of an ellipse (centre x, y; radii rx, ry; turned by rot, whose cosine and sine are cr, sr), in device px.
  _ept(x, y, rx, ry, cr, sr, a) { const ex = rx * Math.cos(a), ey = ry * Math.sin(a); return this._pt(x + ex * cr - ey * sr, y + ex * sr + ey * cr); }
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
  // Painting. The paint, the shadow and the triangles of a call are written into the kept scratch (PS, SHD, TR); only a shape that goes
  // into the record (a stencil op, a clip, a batch) makes the record's own entries, which the picture keeps.
  _paint(style) {
    const ps = PS;
    if (style instanceof Gradient) {
      const { r0, x1, y1, r1, m } = style.g, k = scaleOf(m), ga = this.s.ga, st = style.stops, ns = style.ns;
      ps.grad = true; ps.cx = m[0] * x1 + m[2] * y1 + m[4]; ps.cy = m[1] * x1 + m[3] * y1 + m[5]; ps.r0 = r0 * k; ps.r1 = r1 * k;
      // (concentric gradients only: the app's are; no stops at all is one clear stop)
      const n = ns ? Math.min(8, ns) : 1;
      for (let i = 0; i < n; i++) {
        const o = ps.st[i];
        if (ns) { const t = st[i][0], q = st[i][1]; o[0] = t; o[1] = q[0] * q[3] * ga; o[2] = q[1] * q[3] * ga; o[3] = q[2] * q[3] * ga; o[4] = q[3] * ga; }
        else { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 0; }
      }
      ps.n = n;
      return;
    }
    const q = style === NUM_FILL ? numQ(this.s.fr, this.s.fg, this.s.fb, this.s.fa) : style === NUM_STROKE ? numQ(this.s.kr, this.s.kg, this.s.kb, this.s.ka) : cssColor(style), a = q[3] * this.s.ga, o = ps.rgba;
    ps.grad = false; o[0] = q[0] * a; o[1] = q[1] * a; o[2] = q[2] * a; o[3] = a;
  }
  // The shadow of the paint just made, into SHD (false: none).
  _shadow() {
    if (!(this.s.sb > 0)) return false;
    const q = cssColor(this.s.sc);
    if (!(q[3] > 0)) return false;
    const pa = PS.grad ? 1 : PS.rgba[3];
    const a = q[3] * pa, o = SHD.rgba;
    o[0] = q[0] * a; o[1] = q[1] * a; o[2] = q[2] * a; o[3] = a; SHD.sigma = this.s.sb / 2;
    return true;
  }
  _end() { this.batch = null; }
  // The triangles in TR[0..tn), one colour (premultiplied).
  _direct(rgba) {
    let b = this.batch;
    if (!b || b.clip !== this.s.clip) { b = this.batch = takeBatch(this.cvn / 6, this.s.clip); this.ops.push(b); }
    const r = rgba[0], g = rgba[1], bb = rgba[2], a = rgba[3];
    if (this.cvn + tn * 3 > this.cvb.length) this._growCv(this.cvn + tn * 3);
    const cv = this.cvb;
    let k = this.cvn;
    for (let i = 0; i < tn; i += 2) { cv[k] = TR[i]; cv[k + 1] = TR[i + 1]; cv[k + 2] = r; cv[k + 3] = g; cv[k + 4] = bb; cv[k + 5] = a; k += 6; }
    this.cvn = k;
    b.count += tn / 2;
  }
  // The triangles in TR[0..tn) as a stencil-and-cover op with the scratch's paint (and its shadow, when sh).
  _stencil(k, rule, sh) {
    if (tn < 6) return;
    this._end();
    const from = this.pvn / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (this.pvn + tn > this.pvb.length) this._growPv(this.pvn + tn);
    const pv = this.pvb;
    let q = this.pvn;
    for (let i = 0; i < tn; i += 2) {
      const x = TR[i], y = TR[i + 1];
      pv[q] = x; pv[q + 1] = y; q += 2;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    this.pvn = q;
    const paint = keptPaint(), shadow = sh ? keptShadow() : null;
    this.ops.push(takeOp(k, from, tn / 2, rule, paint, shadow, this.s.clip, x0, y0, x1, y1));
  }
  fill(rule = 'nonzero') {
    if (typeof rule === 'object') rule = 'nonzero';   // (a Path2D is not recorded)
    this._paint(this.s.fill);
    if (!PS.grad && !(PS.rgba[3] > 0)) return;
    const path = this.path;
    let ns = 0, only = null;
    for (let i = 0; i < path.n; i++) if (path.a[i].n >= 3) { ns++; only = path.a[i]; }
    const sh = this._shadow();
    if (!ns) return;
    tn = 0;
    if (ns === 1 && !PS.grad && !sh && convex(only.p, only.n)) { fanTo(only.p, only.n); this._direct(PS.rgba); return; }
    for (let i = 0; i < path.n; i++) if (path.a[i].n >= 3) fanTo(path.a[i].p, path.a[i].n);
    this._stencil('fill', rule === 'evenodd' ? 'evenodd' : 'nonzero', sh);
  }
  stroke() {
    this._paint(this.s.stroke);
    const ps = PS;
    if (!ps.grad && !(ps.rgba[3] > 0)) return;
    const k = scaleOf(this.s.m), w = this.s.lw * k, hair = w < 1, hw = Math.max(w, 1) / 2;
    if (hair) {
      if (!ps.grad) { const o = ps.rgba; o[0] = o[0] * w; o[1] = o[1] * w; o[2] = o[2] * w; o[3] = o[3] * w; }
      else for (let i = 0; i < ps.n; i++) { const o = ps.st[i]; o[1] = o[1] * w; o[2] = o[2] * w; o[3] = o[3] * w; o[4] = o[4] * w; }
    }
    const path = this.path;
    let ns = 0, only = null;
    for (let i = 0; i < path.n; i++) if (path.a[i].n >= 2) { ns++; only = path.a[i]; }
    const sh = this._shadow();
    if (!ns) return;
    tn = 0;
    if (ns === 1 && only.closed && !ps.grad && !sh && convexRingTo(only.p, only.n, hw)) { this._direct(ps.rgba); return; }
    tn = 0;
    for (let i = 0; i < path.n; i++) if (path.a[i].n >= 2) strokeTris(path.a[i].p, path.a[i].n, path.a[i].closed, hw, this.s.cap);
    this._stencil('stroke', 'nonzero', sh);
  }
  clip(rule = 'nonzero') {
    const path = this.path;
    tn = 0;
    for (let i = 0; i < path.n; i++) if (path.a[i].n >= 3) fanTo(path.a[i].p, path.a[i].n);
    this._end();
    const from = this.pvn / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (this.pvn + tn > this.pvb.length) this._growPv(this.pvn + tn);
    const pv = this.pvb;
    let q = this.pvn;
    for (let i = 0; i < tn; i += 2) { const x = TR[i], y = TR[i + 1]; pv[q] = x; pv[q + 1] = y; q += 2; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    this.pvn = q;
    const eo = rule === 'evenodd' ? 'evenodd' : 'nonzero';
    const c = tn ? takeClip(from, tn / 2, eo, x0, y0, x1, y1) : takeClip(from, 0, eo, 0, 0, 0, 0);
    const chain = takeChain(this.s.clip, c), led = this.rec[LED];
    led.clips[led.nClips++] = c; led.chains[led.nChains++] = chain;
    this.s.clip = chain;
  }
  fillRect(x, y, w, h) { const ks = this.sub, kp = this._side(); this.sub = null; this.rect(x, y, w, h); this.fill(); this._unside(kp, ks); }
  strokeRect(x, y, w, h) { const ks = this.sub, kp = this._side(); this.sub = null; this.rect(x, y, w, h); this.stroke(); this._unside(kp, ks); }
  clearRect(x, y, w, h) {
    const m = this.s.m, full = !this.s.clip && m[1] === 0 && m[2] === 0 && this.ops.length === 0;
    const a = this._pt(x, y), b = this._pt(x + w, y + h);
    if (full && Math.min(a[0], b[0]) <= 0 && Math.min(a[1], b[1]) <= 0 && Math.max(a[0], b[0]) >= this.width && Math.max(a[1], b[1]) >= this.height) return;   // (the picture starts clear)
    const ks = this.sub, kp = this._side(); this.sub = null; this.rect(x, y, w, h);
    tn = 0;
    if (this.sub) fanTo(this.path.a[0].p, this.path.a[0].n);
    this._unside(kp, ks);
    this._end();
    const from = this.pvn / 2;
    if (this.pvn + tn > this.pvb.length) this._growPv(this.pvn + tn);
    const pv = this.pvb;
    let q = this.pvn;
    for (let i = 0; i < tn; i++) pv[q++] = TR[i];
    this.pvn = q;
    this.ops.push(takeClear(from, tn / 2, this.s.clip, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])));
  }
  // (Pixel calls a 2D painter might make are not recorded: a GPU picture has no pixels on the CPU.)
  drawImage() { throw new Error('paint-gl: drawImage is not recorded'); }
  /** The record, its arrays packed. */
  done() {
    this._end();
    const rec = this.rec;
    rec.width = this.width; rec.height = this.height;
    // (Each array is a view of its storage as long as the numbers written: the record reads as the array made from them.)
    rec.cv = this.cvn === this.cvb.length ? this.cvb : this.cvb.subarray(0, this.cvn);
    rec.pv = this.pvn === this.pvb.length ? this.pvb : this.pvb.subarray(0, this.pvn);
    this.rec = null; this.ops = null; this.cvb = null; this.pvb = null; this.gn = 0;
    return rec;
  }
}
// ── Kept scratch (the recorder is single-threaded and none of its calls re-enter another): the paint, the shadow and the triangles of the
// call in hand, and the points of a cleaned polygon. They grow to the biggest shape seen and are then reused, so a shape allocates nothing.
const PS = { grad: false, cx: 0, cy: 0, r0: 0, r1: 0, n: 0, rgba: [0, 0, 0, 0], st: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]] };
const SHD = { rgba: [0, 0, 0, 0], sigma: 0 };
let TR = new Float64Array(8192), tn = 0;   // the triangles (x, y each), TR[0..tn)
let RING = new Float64Array(512);   // a ring's outer corners then its inner ones
const QB = [];   // the cleaned polygon's points (the path's own, not copies)
function trGrow(need) {
  const b = new Float64Array(Math.max(need, TR.length * 2));   // alloc-rare: the triangle scratch grows only when a shape is bigger than every one before it, then it is reused
  b.set(TR.subarray(0, tn)); TR = b;   // alloc-rare: the same growth: the old scratch's filled part, copied once into the bigger one
}
function tri(a, b, c, d, e, f) {
  if (tn + 6 > TR.length) trGrow(tn + 6);
  TR[tn] = a; TR[tn + 1] = b; TR[tn + 2] = c; TR[tn + 3] = d; TR[tn + 4] = e; TR[tn + 5] = f; tn += 6;
}
// The record's own copy of the paint in PS (a stencil op keeps it), and of the shadow in SHD.
function keptPaint() {
  if (!PS.grad) return takeSolid(PS.rgba[0], PS.rgba[1], PS.rgba[2], PS.rgba[3]);
  const p = takeGrad(PS.n), g = p.grad, stops = g.stops;
  g.cx = PS.cx; g.cy = PS.cy; g.r0 = PS.r0; g.r1 = PS.r1;
  for (let i = 0; i < PS.n; i++) { const o = PS.st[i], d = stops[i]; d[0] = o[0]; d[1] = o[1]; d[2] = o[2]; d[3] = o[3]; d[4] = o[4]; }
  return p;
}
function keptShadow() { return takeShadow(SHD.rgba[0], SHD.rgba[1], SHD.rgba[2], SHD.rgba[3], SHD.sigma); }

// A point of the device, back in the space of matrix m: into IX, IY.
let IX = 0, IY = 0;
function invPt(m, pt) {
  const det = m[0] * m[3] - m[1] * m[2] || 1, dx = pt[0] - m[4], dy = pt[1] - m[5];
  IX = (m[3] * dx - m[2] * dy) / det; IY = (-m[1] * dx + m[0] * dy) / det;
}
// A polygon's fan of triangles, appended to TR.
function fanTo(p, np) {
  const p0 = p[0];
  for (let i = 1; i + 1 < np; i++) tri(p0[0], p0[1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
}
// The polygon without repeated points, into QB; its count.
function cleanTo(p, np) {
  let n = 0;
  for (let i = 0; i < np; i++) { const v = p[i], l = n ? QB[n - 1] : null; if (!l || Math.abs(l[0] - v[0]) > 1e-6 || Math.abs(l[1] - v[1]) > 1e-6) QB[n++] = v; }
  while (n > 1 && Math.abs(QB[0][0] - QB[n - 1][0]) < 1e-6 && Math.abs(QB[0][1] - QB[n - 1][1]) < 1e-6) n--;
  return n;
}
// (A polygon that turns one way only, once round: its fan never overlaps itself.)
function convex(p, np) { return convexQ(cleanTo(p, np)); }
function convexQ(n) {   // of the n points already in QB
  if (n < 3) return false;
  let sign = 0, turn = 0;
  for (let i = 0; i < n; i++) {
    const a = QB[i], b = QB[(i + 1) % n], c = QB[(i + 2) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const cr = ux * vy - uy * vx;
    if (Math.abs(cr) > 1e-9) { const s = Math.sign(cr); if (sign && s !== sign) return false; sign = s; }
    turn += Math.atan2(cr, ux * vx + uy * vy);
  }
  return Math.abs(turn) < TAU + 0.01;
}
// The outline of a convex closed path as one ring of quads (half width hw), appended to TR; false when it is not one (then stencil and cover).
function convexRingTo(p, np, hw) {
  const n = cleanTo(p, np);
  if (n < 3 || !convexQ(n)) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (let i = 0; i < n; i++) { const x = QB[i][0], y = QB[i][1], x2 = QB[(i + 1) % n][0], y2 = QB[(i + 1) % n][1]; area += x * y2 - x2 * y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (hw > 0.22 * Math.min(x1 - x0, y1 - y0)) return false;
  if (RING.length < 4 * n) RING = new Float64Array(4 * n * 2);   // alloc-rare: the ring scratch grows only when a polygon has more corners than every one before it, then it is reused
  const s = area > 0 ? 1 : -1, R = RING, I = 2 * n;   // (out at R[2i], in at R[I + 2i])
  for (let i = 0; i < n; i++) {
    const a = QB[(i + n - 1) % n], b = QB[i], c = QB[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const e1x = dx / l, e1y = dy / l;
    dx = c[0] - b[0]; dy = c[1] - b[1]; l = Math.hypot(dx, dy) || 1;
    const e2x = dx / l, e2y = dy / l;
    const n1x = e1y * s, n1y = -e1x * s, n2x = e2y * s, n2y = -e2x * s;   // (outward)
    const mx = n1x + n2x, my = n1y + n2y, ml = Math.hypot(mx, my);
    if (ml < 1e-6) return false;
    const d = (mx / ml) * n1x + (my / ml) * n1y;
    if (d < 0.25) return false;   // (a corner sharper than about 150°: drawn by stencil and cover)
    const k = hw / d, ox = (mx / ml) * k, oy = (my / ml) * k;
    R[2 * i] = b[0] + ox; R[2 * i + 1] = b[1] + oy; R[I + 2 * i] = b[0] - ox; R[I + 2 * i + 1] = b[1] - oy;
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(R[2 * i], R[2 * i + 1], R[2 * j], R[2 * j + 1], R[I + 2 * j], R[I + 2 * j + 1]);
    tri(R[2 * i], R[2 * i + 1], R[I + 2 * j], R[I + 2 * j + 1], R[I + 2 * i], R[I + 2 * i + 1]);
  }
  return true;
}
function disc(x, y, r) {
  const n = Math.max(6, Math.min(48, Math.ceil(TAU / (2 * Math.acos(Math.max(-1, 1 - TOL / Math.max(r, TOL)))))));
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n, b = (TAU * (i + 1)) / n;
    tri(x, y, x + r * Math.cos(a), y + r * Math.sin(a), x + r * Math.cos(b), y + r * Math.sin(b));
  }
}
// A stroke's triangles, appended to TR (they overlap at the joins: drawn by stencil and cover, so each pixel is laid once). Joins are
// round (a disc at each bend), caps as asked.
function strokeTris(p, np, closed, hw, cap) {
  const n = cleanTo(p, np);
  if (n < 2) return;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = QB[i], b = QB[(i + 1) % n];
    let ax = a[0], ay = a[1], bx = b[0], by = b[1];
    const l = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / l, dy = (by - ay) / l;
    if (cap === 'square' && !closed) {
      if (i === 0) { ax = ax - dx * hw; ay = ay - dy * hw; }
      if (i === segs - 1) { bx = bx + dx * hw; by = by + dy * hw; }
    }
    const nx = -dy * hw, ny = dx * hw;
    tri(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny);
    tri(ax + nx, ay + ny, bx - nx, by - ny, ax - nx, ay - ny);
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = QB[(i + n - 1) % n], b = QB[i], c = QB[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const e1x = dx / l, e1y = dy / l;
    dx = c[0] - b[0]; dy = c[1] - b[1]; l = Math.hypot(dx, dy) || 1;
    if (e1x * (dx / l) + e1y * (dy / l) > 0.9995) continue;   // (all but straight on: no gap to fill)
    disc(b[0], b[1], hw);
  }
  if (!closed && cap === 'round') { disc(QB[0][0], QB[0][1], hw); disc(QB[n - 1][0], QB[n - 1][1], hw); }
}

/** Runs draw(ctx) against a recorder w × h (device px) and keeps the record. */
export function recordPaint(width, height, draw) {
  const r = P_RECORDER.pop() || new PaintRecorder(width, height);   // alloc-rare: pool empty: a recorder is made only when more recordings run at once than ever before (one, in practice)
  if (r.rec === null) r._init(width, height);   // (a new recorder is started by its constructor, a pooled one here)
  let rec;
  try { draw(r); rec = r.done(); } catch (err) { r._abort(); P_RECORDER.push(r); throw err; }
  P_RECORDER.push(r);
  return rec;
}

/** A GPU picture: a record that stands where a canvas did (width, height; free() sets them to 0). ver: the caller's count of paints. */
export function gpuPicture(rec, ver = 0) {
  const led = rec[LED];
  if (led && led.live) led.refs++;   // (the picture holds the record; releasePicture lets go of it)
  return { width: rec.width, height: rec.height, rec, ver, gpuPicture: true };   // alloc-rare: the picture's own handle, one small object a picture: it is the key the GPU contexts' caches know the picture by (tissue-gl texs, tile-gl raw and copies' src), so it is never recycled, or a new picture would read as the old one
}
/** Gives a picture back (what free() does to a canvas, width 0): it lets go of its record, which returns to the pools once no picture holds it. */
export function releasePicture(pic) {
  const rec = pic.rec;
  pic.width = 0; pic.height = 0;
  if (!rec) return false;
  pic.rec = null;
  return releaseRecord(rec);
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
const NO_OPTS = {};   // (paint's options when none are given: read, never written)
const EMPTY_CV = new Float32Array(6), EMPTY_PV = new Float32Array(2), FS_TRI = new Float32Array([-1, -1, 3, -1, -1, 3]);
const painters = new WeakMap();
/** The painter for one GPU context (made once per context; its programs start compiling at once). */
export function paintGL(gl) {
  let p = painters.get(gl);
  if (!p) { p = createPaintGL(gl); painters.set(gl, p); }
  return p;
}

export function createPaintGL(gl) {
  let progs = null, started = null, failed = false, res = null, freeT = 0, warmHold = null, stenOnly = true, shChecked = false;
  const SAVED = { fbR: null, fbD: null, vp: null, prog: null, vao: null, buf: null, rb: null, unit: 0, tex: null, blend: false, stencil: false, scissor: false, depth: false, cull: false,   // alloc-rare: once per GL context (made at its first picture), not per frame: the host's state, saved and put back at each paint
    bf: [0, 0, 0, 0], be: [0, 0], cm: null, cc: null, sm: 0, sbm: 0, sci: null };   // alloc-rare: once per GL context (made at its first picture), not per frame
  const VIEW = [0, 0, 0, 0], FULL = [0, 0, 0, 0], BOX4 = [0, 0, 0, 0], SV = [0, 0, 0, 0], QUAD = new Float32Array(12), GS = new Float32Array(32), GT = new Float32Array(8);   // alloc-rare: once per GL context (made at its first picture), not per frame: scratch the tile and its shadow write in place
  const D = { r: null, tx: 0, ty: 0, tw: 0, th: 0, clipOn: null };   // alloc-rare: once per GL context (made at its first picture), not per frame: the tile being drawn
  // (Review pass item 8: what a paint leaves warm is held in the global budget (gpu-budget.js hold), which may let it go before WARM_MS.)
  const resBytes = () => { const r = res; if (!r) return 0; const t = TILE * TILE; return t * (r.sten ? 5 : 8) * Math.max(1, r.samples) + t * 4 + (r.sh ? r.sh.w * r.sh.h * (r.sten ? 9 : 12) : 0); };   // alloc-rare: once per GL context (made at its first picture), not per frame
  const begin = () => {   // alloc-rare: once per GL context (made at its first picture), not per frame
    try {
      started = [startProgram(gl, VS_C, FS_C, [['p', 0], ['c', 1]]), startProgram(gl, VS_P, FS_P, [['p', 0]]), startProgram(gl, VS_Q, FS_B, [['p', 0]])];   // alloc-rare: once per GL context (made at its first picture), not per frame
      publishWhenDone(gl, started, () => { try { ready(); } catch (e) { caught('paint-gl:392', e); /* read at the first paint */ } });   // alloc-rare: once per GL context (made at its first picture), not per frame
    } catch { failed = true; }
  };
  begin();
  gl.canvas?.addEventListener?.('webglcontextlost', () => { progs = null; res = null; started = null; warmHold?.drop(); warmHold = null; });   // alloc-rare: once per GL context (made at its first picture), not per frame
  gl.canvas?.addEventListener?.('webglcontextrestored', () => { failed = false; begin(); });   // alloc-rare: once per GL context (made at its first picture), not per frame
  function ready() {
    if (progs) return true;
    if (failed || gl.isContextLost()) return false;
    if (!started) begin();
    // (Review pass 2, item 2: never a status read that waits for the driver at the first paint. Still compiling, there is no picture
    // yet (null: the tissue keeps its last frame and asks again shortly), and the poller publishes the programs once they are done.)
    if (started && stillCompiling(gl, started)) return false;
    try {
      const [c, p, b] = started.map((h) => checkProgram(gl, h));   // alloc-rare: once per GL context (made at its first picture), not per frame
      const loc = (pr, ns) => Object.fromEntries(ns.map((n) => [n, gl.getUniformLocation(pr, n)]));   // alloc-rare: once per GL context (made at its first picture), not per frame
      progs = { c: { p: c, U: loc(c, ['uV']) }, p: { p, U: loc(p, ['uV', 'uC', 'uN', 'uG', 'uO', 'uS', 'uT']) }, b: { p: b, U: loc(b, ['uS', 'uDir', 'uD', 'uSigma', 'uN']) } };   // alloc-rare: once per GL context (made at its first picture), not per frame
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msC);
    // (Perf D4: stencil only. Depth testing is never on here and nothing reads depth, so the 24 bits were 3 bytes a sample for nothing. The
    // framebuffer is checked once; a driver that will not complete it keeps the old depth-stencil format, still on the GPU.)
    stencilTo(msS, TILE, TILE, samples);
    if (stenOnly && !fbComplete(gl, gl.FRAMEBUFFER, 'rgba8+s8', TILE, TILE)) { stenOnly = false; stencilTo(msS, TILE, TILE, samples); }
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
    gl.bufferData(gl.ARRAY_BUFFER, FS_TRI, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    res = { sten: stenOnly, samples, ms, msC, msS, rs, rsT, vaoC, vaoP, bufC, bufP, vaoQ, bufQ, sh: null };   // alloc-rare: once per warm period of the painter's targets (they are freed a few seconds after the last picture)
    return res;
  }
  // A stencil renderbuffer for the bound framebuffer, in the format in use (stencil only, or the old depth-stencil if the driver refused it).
  function stencilTo(rb, w, h, samples = 0) {
    const f = stenOnly ? gl.STENCIL_INDEX8 : gl.DEPTH24_STENCIL8;
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, f, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, f, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, stenOnly ? gl.STENCIL_ATTACHMENT : gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  function tex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, a);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, aT, 0);
    stencilTo(aS, W, H);
    if (!shChecked) {   // (checked once, as the tile's is)
      shChecked = true;
      if (stenOnly && !fbComplete(gl, gl.FRAMEBUFFER, 'rgba8+s8', W, H)) { stenOnly = false; stencilTo(aS, W, H); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, b);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bT, 0);
    r.sh = { a, aT, aS, b, bT, w: W, h: H };   // alloc-rare: only when the shadow's scratch is made or has to grow (a bigger shadow than any before)
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
    // (One record for the painter, written in place at each paint: a paint saves the host's state, draws, and puts it back before the next.)
    const S = SAVED;
    S.fbR = glGet(gl, gl.READ_FRAMEBUFFER_BINDING); S.fbD = glGet(gl, gl.DRAW_FRAMEBUFFER_BINDING); S.vp = glGet(gl, gl.VIEWPORT); S.prog = glGet(gl, gl.CURRENT_PROGRAM); S.vao = glGet(gl, gl.VERTEX_ARRAY_BINDING);
    S.buf = glGet(gl, gl.ARRAY_BUFFER_BINDING); S.rb = glGet(gl, gl.RENDERBUFFER_BINDING); S.unit = glGet(gl, gl.ACTIVE_TEXTURE); S.tex = glGet(gl, gl.TEXTURE_BINDING_2D);
    S.blend = glOn(gl, gl.BLEND); S.stencil = glOn(gl, gl.STENCIL_TEST); S.scissor = glOn(gl, gl.SCISSOR_TEST); S.depth = glOn(gl, gl.DEPTH_TEST); S.cull = glOn(gl, gl.CULL_FACE);
    S.bf[0] = glGet(gl, gl.BLEND_SRC_RGB); S.bf[1] = glGet(gl, gl.BLEND_DST_RGB); S.bf[2] = glGet(gl, gl.BLEND_SRC_ALPHA); S.bf[3] = glGet(gl, gl.BLEND_DST_ALPHA);
    S.be[0] = glGet(gl, gl.BLEND_EQUATION_RGB); S.be[1] = glGet(gl, gl.BLEND_EQUATION_ALPHA);
    S.cm = glGet(gl, gl.COLOR_WRITEMASK); S.cc = glGet(gl, gl.COLOR_CLEAR_VALUE); S.sm = glGet(gl, gl.STENCIL_WRITEMASK); S.sbm = glGet(gl, gl.STENCIL_BACK_WRITEMASK); S.sci = glGet(gl, gl.SCISSOR_BOX);
    return S;
  }
  const setCap = (cap, on) => { if (on) gl.enable(cap); else gl.disable(cap); };   // alloc-rare: once per GL context (made at its first picture), not per frame
  function putState(s) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.fbR); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.fbD);
    gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3]);
    gl.useProgram(s.prog); gl.bindVertexArray(s.vao); gl.bindBuffer(gl.ARRAY_BUFFER, s.buf); gl.bindRenderbuffer(gl.RENDERBUFFER, s.rb);
    gl.activeTexture(s.unit); gl.bindTexture(gl.TEXTURE_2D, s.tex);
    setCap(gl.BLEND, s.blend); setCap(gl.STENCIL_TEST, s.stencil); setCap(gl.SCISSOR_TEST, s.scissor); setCap(gl.DEPTH_TEST, s.depth); setCap(gl.CULL_FACE, s.cull);
    gl.blendFuncSeparate(s.bf[0], s.bf[1], s.bf[2], s.bf[3]); gl.blendEquationSeparate(s.be[0], s.be[1]);
    gl.colorMask(s.cm[0], s.cm[1], s.cm[2], s.cm[3]); gl.clearColor(s.cc[0], s.cc[1], s.cc[2], s.cc[3]);
    gl.stencilMaskSeparate(gl.FRONT, s.sm); gl.stencilMaskSeparate(gl.BACK, s.sbm);
    gl.scissor(s.sci[0], s.sci[1], s.sci[2], s.sci[3]);
  }

  /** Paints record rec into a new texture (RGBA8, premultiplied, mipmapped unless mip is false, row 0 at the picture's top, as a
   *  canvas's texture is sent); null where it cannot (no programs, a lost context, a picture past the GPU's texture size). The host's
   *  bindings and switches are as they were afterwards, except that the new texture is bound on the active unit. */
  function paint(rec, { mip = true, wrap = null } = NO_OPTS) {
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
      gl.bindBuffer(gl.ARRAY_BUFFER, r.bufC); gl.bufferData(gl.ARRAY_BUFFER, rec.cv.length ? rec.cv : EMPTY_CV, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.bufP); gl.bufferData(gl.ARRAY_BUFFER, rec.pv.length ? rec.pv : EMPTY_PV, gl.STATIC_DRAW);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.SCISSOR_TEST);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      for (let ty = 0; ty < H; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
        const tw = Math.min(TILE, W - tx), th = Math.min(TILE, H - ty);
        drawTile(rec, r, tx, ty, tw, th);
        // (Resolved at the same place, as a multisampled blit must be, then copied into its place in the picture.)
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, r.rs);
        gl.blitFramebuffer(0, 0, tw, th, 0, 0, tw, th, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        // (The multisampled colour and depth are cleared by the next tile and read by nothing else: told to the driver, a tile-based GPU (the
        // iPhone's) does not write the 4x samples, about 32 MB, back to memory after each tile. Render-cost review P4, 5 Nov 2026.)
        gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, r.sten ? INVAL_S : INVAL_DS);
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
    clearTimeout(freeT); freeT = setTimeout(release, WARM_MS);   // (R08: kept warm through the next slide's paints)
    if (res) { if (warmHold?.held) warmHold.touch(); else warmHold = hold({ owner: 'paint-gl', kind: 'warm', bytes: resBytes, release, gl }); }   // alloc-rare: only on the first picture of a warm period, when the painter's targets are first held
    return out;
  }

  // A cover: the box, a pixel past it, laid with the plain program from a small buffer of its own.
  function coverBox(r, b) {
    const x0 = b[0] - 1, y0 = b[1] - 1, x1 = b[2] + 1, y1 = b[3] + 1;
    gl.bindVertexArray(r.vaoP);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.bufQ2 || (r.bufQ2 = gl.createBuffer()));
    const q = QUAD;
    q[0] = x0; q[1] = y0; q[2] = x1; q[3] = y0; q[4] = x1; q[5] = y1; q[6] = x0; q[7] = y0; q[8] = x1; q[9] = y1; q[10] = x0; q[11] = y1;
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.STREAM_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.bufP); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  }
  // One tile: cleared, every op that reaches it drawn in order, its clip kept in the stencil's top bit.
  // (Its helpers are made once for the painter and read the tile being drawn from D, so a tile makes no function and no list.)
  const tileHits = (x0, y0, x1, y1) => x1 >= D.tx - 1 && x0 <= D.tx + D.tw + 1 && y1 >= D.ty - 1 && y0 <= D.ty + D.th + 1;   // alloc-rare: once per GL context (made at its first picture), not per frame
  const plain = (from, count) => { gl.bindVertexArray(D.r.vaoP); gl.drawArrays(gl.TRIANGLES, from, count); };   // alloc-rare: once per GL context (made at its first picture), not per frame
  // The state the tile's ops set again and again (a colour mask, the stencil's mask, function and op, the stencil test, the blend, the program) is
  // sent only when it is not what this painter last set (P5 of the 4 Nov review: ~20 state calls to a draw). Forgotten at the start of a tile and
  // after a shadow, which sets its own; nothing else sets these between two ops of a tile.
  let tCM = -1, tSM = -1, tSF = -1, tSR = 0, tSK = 0, tSO = -1, tSO2 = 0, tSO3 = 0, tST = -1, tBL = -1, tBF = -1, tBD = 0, tPG = null;   // alloc-rare: made once per GL context
  const forget = () => { tCM = tSM = tSF = tSO = tST = tBL = tBF = -1; tPG = null; };   // alloc-rare: once per GL context
  const cm = (on) => { const v = on ? 1 : 0; if (tCM !== v) { tCM = v; gl.colorMask(on, on, on, on); } };   // alloc-rare: once per GL context
  const sm = (m) => { if (tSM !== m) { tSM = m; gl.stencilMask(m); } };   // alloc-rare: once per GL context
  const sf = (f, r, m) => { if (tSF !== f || tSR !== r || tSK !== m) { tSF = f; tSR = r; tSK = m; gl.stencilFunc(f, r, m); } };   // alloc-rare: once per GL context
  const so = (a, b, c) => { if (tSO !== a || tSO2 !== b || tSO3 !== c) { tSO = a; tSO2 = b; tSO3 = c; gl.stencilOp(a, b, c); } };   // alloc-rare: once per GL context
  const sops = () => { tSO = -1; gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); };   // alloc-rare: once per GL context
  const stenOn = (on) => { const v = on ? 1 : 0; if (tST !== v) { tST = v; if (on) gl.enable(gl.STENCIL_TEST); else gl.disable(gl.STENCIL_TEST); } };   // alloc-rare: once per GL context
  const blendOn = () => { if (tBL !== 1) { tBL = 1; gl.enable(gl.BLEND); } };   // alloc-rare: once per GL context
  const bf = (s, d) => { if (tBF !== s || tBD !== d) { tBF = s; tBD = d; gl.blendFunc(s, d); } };   // alloc-rare: once per GL context
  const prog = (p) => { if (tPG !== p) { tPG = p; gl.useProgram(p); } };   // alloc-rare: once per GL context
  const useP = () => { prog(progs.p.p); ucOf(gl).fv4(progs.p.U.uV, VIEW); };   // alloc-rare: once per GL context (made at its first picture), not per frame
  const winding = (from, count, rule, stroke) => {   // alloc-rare: once per GL context (made at its first picture), not per frame
    cm(false);
    sf(gl.ALWAYS, 1, 0xff);
    if (stroke) { sm(0x01); so(gl.KEEP, gl.KEEP, gl.REPLACE); }
    else if (rule === 'evenodd') { sm(0x01); so(gl.KEEP, gl.KEEP, gl.INVERT); }
    else { sm(0x7f); sops(); }
    plain(from, count);
    cm(true);
  };
  const setClip = (list) => {   // alloc-rare: once per GL context (made at its first picture), not per frame
    if (list === D.clipOn) return;
    useP();
    stenOn(true);
    sm(0xff); gl.clear(gl.STENCIL_BUFFER_BIT);
    if (list) for (let i = 0; i < list.length; i++) {
      const c = list[i];
      winding(c.from, c.count, c.rule, false);
      cm(false);
      sm(0xff);
      if (i === 0) { sf(gl.NOTEQUAL, 0x80, 0x7f); so(gl.KEEP, gl.KEEP, gl.REPLACE); coverBox(D.r, c.box); }
      else { sf(gl.LESS, 0x80, 0xff); so(gl.ZERO, gl.ZERO, gl.REPLACE); coverBox(D.r, FULL); }
      cm(true);
    }
    D.clipOn = list;
  };
  const setPaint = (paint) => {   // alloc-rare: once per GL context (made at its first picture), not per frame
    useP();
    const U = progs.p.U;
    if (paint.rgba) { ucOf(gl).i1(U.uN, 0); ucOf(gl).fv4(U.uC, paint.rgba); return; }
    const g = paint.grad, stops = g.stops, n = stops.length, S = GS, T = GT;
    for (let i = 0; i < S.length; i++) S[i] = 0;   // (a fresh pair was all zeros: the stops past n stay zero)
    for (let i = 0; i < T.length; i++) T[i] = 0;
    for (let i = 0; i < n; i++) { const st = stops[i]; S[i * 4] = st[1]; S[i * 4 + 1] = st[2]; S[i * 4 + 2] = st[3]; S[i * 4 + 3] = st[4]; T[i] = st[0]; }
    ucOf(gl).i1(U.uN, n); ucOf(gl).f4(U.uG, g.cx, g.cy, g.r0, g.r1); ucOf(gl).f2(U.uO, D.tx, D.ty);
    ucOf(gl).fv4(U.uS, S); ucOf(gl).fv1(U.uT, T);
  };
  const cover = (box, clip) => {   // alloc-rare: once per GL context (made at its first picture), not per frame
    sm(0x7f);
    if (clip) sf(gl.LESS, 0x80, 0xff); else sf(gl.NOTEQUAL, 0, 0x7f);
    so(gl.ZERO, gl.ZERO, gl.ZERO);
    coverBox(D.r, box);
  };
  const INVAL_S = [0x8CE0, 0x8D20], INVAL_DS = [0x8CE0, 0x84F9];   // (COLOR_ATTACHMENT0 with STENCIL_ATTACHMENT, or with DEPTH_STENCIL_ATTACHMENT)
  function drawTile(rec, r, tx, ty, tw, th) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.ms);
    gl.viewport(0, 0, tw, th); gl.scissor(0, 0, tw, th);
    forget();   // (the host's state is whatever it was)
    cm(true); sm(0xff);
    gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    blendOn(); bf(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    D.r = r; D.tx = tx; D.ty = ty; D.tw = tw; D.th = th; D.clipOn = null;
    VIEW[0] = tx; VIEW[1] = ty; VIEW[2] = 2 / tw; VIEW[3] = 2 / th;
    FULL[0] = tx - 2; FULL[1] = ty - 2; FULL[2] = tx + tw + 2; FULL[3] = ty + th + 2;
    for (const op of rec.ops) {
      if (op.k === 'direct') {
        if (op.clip) { setClip(op.clip); stenOn(true); sm(0); sf(gl.EQUAL, 0x80, 0x80); } else stenOn(false);
        prog(progs.c.p); ucOf(gl).fv4(progs.c.U.uV, VIEW);
        gl.bindVertexArray(r.vaoC); gl.drawArrays(gl.TRIANGLES, op.from, op.count);
        continue;
      }
      const reach = op.shadow ? Math.ceil(op.shadow.sigma * 3) + 2 : 0, b = op.box;
      if (!tileHits(b[0] - reach, b[1] - reach, b[2] + reach, b[3] + reach)) continue;
      setClip(op.clip);
      stenOn(true);
      if (op.k === 'clear') {
        useP(); ucOf(gl).i1(progs.p.U.uN, 0); ucOf(gl).f4(progs.p.U.uC, 0, 0, 0, 0);
        bf(gl.ZERO, gl.ZERO);
        sm(0); if (op.clip) sf(gl.EQUAL, 0x80, 0x80); else sf(gl.ALWAYS, 0, 0);
        plain(op.from, op.count);
        bf(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        continue;
      }
      if (op.shadow) { shadow(rec, r, op, tx, ty, tw, th, reach, VIEW); forget(); }
      useP();
      winding(op.from, op.count, op.rule, op.k === 'stroke');
      setPaint(op.paint);
      cover(op.box, !!op.clip);
    }
    stenOn(false);
    gl.bindVertexArray(null);
    D.r = null; D.clipOn = null;
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
    const sv = SV;
    sv[0] = tx - M; sv[1] = ty - M; sv[2] = 2 / sw; sv[3] = 2 / shh;
    ucOf(gl).fv4(progs.p.U.uV, sv);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    if (op.k === 'stroke') { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
    else if (op.rule === 'evenodd') { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); }
    else { gl.stencilMask(0x7f); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
    gl.bindVertexArray(r.vaoP); gl.drawArrays(gl.TRIANGLES, op.from, op.count);
    gl.colorMask(true, true, true, true);
    ucOf(gl).i1(progs.p.U.uN, 0); ucOf(gl).fv4(progs.p.U.uC, op.shadow.rgba);
    gl.stencilMask(0x7f); gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
    gl.disable(gl.BLEND);
    BOX4[0] = tx - M; BOX4[1] = ty - M; BOX4[2] = tx + tw + M; BOX4[3] = ty + th + M;
    coverBox(r, BOX4);
    gl.bindVertexArray(r.vaoQ);
    // 2. Across, into the second scratch.
    gl.disable(gl.STENCIL_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.b);
    gl.useProgram(progs.b.p);
    const U = progs.b.U;
    ucOf(gl).i1(U.uS, 0); ucOf(gl).f1(U.uSigma, sig); ucOf(gl).i1(U.uN, n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.aT);
    ucOf(gl).i2(U.uDir, 1, 0); ucOf(gl).i2(U.uD, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. Down, onto the tile (inside its clip).
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.ms);
    gl.viewport(0, 0, tw, th); gl.scissor(0, 0, tw, th);
    gl.bindTexture(gl.TEXTURE_2D, s.bT);
    ucOf(gl).i2(U.uDir, 0, 1); ucOf(gl).i2(U.uD, M, M);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (op.clip) { gl.enable(gl.STENCIL_TEST); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.STENCIL_TEST);
    void view;
  }
  return {   // alloc-rare: once per GL context (made at its first picture), not per frame
    paint,
    release,
    get ready() { return !!progs; },   // alloc-rare: once per GL context (made at its first picture), not per frame
  };
}
