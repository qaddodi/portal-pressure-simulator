// The renderer's own record of each WebGL2 context's state (R09, 2 Nov 2026: "replace GL state queries with renderer-owned state").
//
// Every pass that shares a context with another (the GPU painter's saveState, the vessels' organ covers, the labels' reserve page, the
// lobule tiles' copies) used to discover what was bound by asking the driver: gl.getParameter for a dozen bindings and switches before
// each paint. Each query is a trip into the driver, and on some implementations a wait for the GPU. Here the context's state is read
// once per context generation (its first use, and once after a restore), and from then on every call that changes it goes through a
// thin wrapper that keeps the record. glGet / glOn answer from that record, never from the driver.
//
// - Immutable limits (MAX_TEXTURE_SIZE, MAX_SAMPLES, ...) are read once per context generation (glCap).
// - The wrappers are installed on the context object itself (own properties over the prototype's methods), so every module that holds
//   the context, whichever made it, routes its state changes through the record. A deleted object that was bound reads back as null,
//   as the context itself would.
// The wrappers also hand each allocation to the resource registry (gpu-budget.js, R06): see onGLCall.

import { caught } from './caught.js';
import { noteContext } from './gl-contexts.js';
const W2 = typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null;

const recs = new WeakMap();
// (The tracked WebGL2 contexts, weakly, so anything can ask whether the page already holds one: gl-support.js, the dev context assert.)
const held = [];
/** A WebGL2 context the page already holds and that is not lost, if any (null: none). Asking makes nothing. */
export function heldGL() {
  for (let i = held.length - 1; i >= 0; i--) {
    const gl = held[i].deref();
    if (!gl) { held.splice(i, 1); continue; }
    if (!gl.isContextLost()) return gl;
  }
  return null;
}
// (Listeners for the calls that allocate or free, and for the passes: the registry. Set once, by gpu-budget.js.)
let hook = null;
/** For gpu-budget.js: fn(gl, name, x, n) after each allocating, freeing, binding or drawing call the wrappers see (x: the call's
 *  arguments for an allocation, with their count n; the freed object for a delete*; its pixel area for 'draw' / 'clear' / 'copy').
 *  For an allocation x is one array kept and rewritten by every call: read it in the call, keep nothing of it. */
export function onGLCall(fn) { hook = fn; }

const isGL2 = (gl) => !!(W2 && gl instanceof W2);

function sweep(gl, r) {
  const g = (k) => gl.getParameter(k); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.fbR = g(gl.READ_FRAMEBUFFER_BINDING); r.fbD = g(gl.DRAW_FRAMEBUFFER_BINDING);
  r.vp = Int32Array.from(g(gl.VIEWPORT) || [0, 0, 0, 0]); r.sci = Int32Array.from(g(gl.SCISSOR_BOX) || [0, 0, 0, 0]); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.prog = g(gl.CURRENT_PROGRAM); r.vao = g(gl.VERTEX_ARRAY_BINDING); r.buf = g(gl.ARRAY_BUFFER_BINDING); r.rb = g(gl.RENDERBUFFER_BINDING);
  r.unit = g(gl.ACTIVE_TEXTURE); r.tex = new Map([[r.unit, g(gl.TEXTURE_BINDING_2D)]]); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.caps = new Map([gl.BLEND, gl.STENCIL_TEST, gl.SCISSOR_TEST, gl.DEPTH_TEST, gl.CULL_FACE, gl.RASTERIZER_DISCARD].map((c) => [c, gl.isEnabled(c)])); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.bf = [g(gl.BLEND_SRC_RGB), g(gl.BLEND_DST_RGB), g(gl.BLEND_SRC_ALPHA), g(gl.BLEND_DST_ALPHA)]; // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.be = [g(gl.BLEND_EQUATION_RGB), g(gl.BLEND_EQUATION_ALPHA)]; // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.cm = Array.from(g(gl.COLOR_WRITEMASK) || [true, true, true, true]); r.cc = Float32Array.from(g(gl.COLOR_CLEAR_VALUE) || [0, 0, 0, 0]); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.sm = g(gl.STENCIL_WRITEMASK); r.sbm = g(gl.STENCIL_BACK_WRITEMASK);
  r.lim = new Map(); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  r.fresh = !gl.isContextLost();
}

// A call with n arguments exactly (a WebGL overload is told by how many arrive, so none is passed as undefined): no rest array, no spread.
function callN(f, n, a, b, c, d, e, g, h, i, j, k, l) {
  switch (n) {
    case 0: return f();
    case 1: return f(a);
    case 2: return f(a, b);
    case 3: return f(a, b, c);
    case 4: return f(a, b, c, d);
    case 5: return f(a, b, c, d, e);
    case 6: return f(a, b, c, d, e, g);
    case 7: return f(a, b, c, d, e, g, h);
    case 8: return f(a, b, c, d, e, g, h, i);
    case 9: return f(a, b, c, d, e, g, h, i, j);
    case 10: return f(a, b, c, d, e, g, h, i, j, k);
    default: return f(a, b, c, d, e, g, h, i, j, k, l);
  }
}

// The calls that change what the record holds, each wrapped once on the context.
function wrap(gl, r) {
  const own = (name, make) => { const f = gl[name]; if (typeof f === 'function') gl[name] = make(f.bind(gl)); }; // alloc-rare: installed once per context, when its record starts
  const FB = gl.FRAMEBUFFER, RFB = gl.READ_FRAMEBUFFER, DFB = gl.DRAW_FRAMEBUFFER, AB = gl.ARRAY_BUFFER, T2 = gl.TEXTURE_2D;
  const tell = (name, a, n) => { if (hook) hook(gl, name, a, n); }; // alloc-rare: installed once per context, when its record starts
  // (The driver's call first, then the record: a call that throws (a wrong argument type) leaves the record as the driver has it.)
  own('bindFramebuffer', (f) => (t, fb) => { f(t, fb); if (t === FB || t === RFB) r.fbR = fb; if (t === FB || t === DFB) r.fbD = fb; if (hook && t !== RFB) hook(gl, 'target', fb); }); // alloc-rare: installed once per context, when its record starts
  own('viewport', (f) => (x, y, w, h) => { f(x, y, w, h); const v = r.vp; v[0] = x; v[1] = y; v[2] = w; v[3] = h; }); // alloc-rare: installed once per context, when its record starts
  own('scissor', (f) => (x, y, w, h) => { f(x, y, w, h); const v = r.sci; v[0] = x; v[1] = y; v[2] = w; v[3] = h; }); // alloc-rare: installed once per context, when its record starts
  own('useProgram', (f) => (p) => { f(p); r.prog = p; }); // alloc-rare: installed once per context, when its record starts
  own('bindVertexArray', (f) => (v) => { f(v); r.vao = v; }); // alloc-rare: installed once per context, when its record starts
  own('bindBuffer', (f) => (t, b) => { f(t, b); if (t === AB) r.buf = b; }); // alloc-rare: installed once per context, when its record starts
  own('bindRenderbuffer', (f) => (t, b) => { f(t, b); r.rb = b; }); // alloc-rare: installed once per context, when its record starts
  own('activeTexture', (f) => (u) => { f(u); r.unit = u; }); // alloc-rare: installed once per context, when its record starts
  own('bindTexture', (f) => (t, x) => { f(t, x); if (t === T2) r.tex.set(r.unit, x); }); // alloc-rare: installed once per context, when its record starts
  own('enable', (f) => (c) => { f(c); r.caps.set(c, true); }); // alloc-rare: installed once per context, when its record starts
  own('disable', (f) => (c) => { f(c); r.caps.set(c, false); }); // alloc-rare: installed once per context, when its record starts
  own('blendFunc', (f) => (s, d) => { f(s, d); r.bf[0] = r.bf[2] = s; r.bf[1] = r.bf[3] = d; }); // alloc-rare: installed once per context, when its record starts
  own('blendFuncSeparate', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.bf; v[0] = a; v[1] = b; v[2] = c; v[3] = d; }); // alloc-rare: installed once per context, when its record starts
  own('blendEquation', (f) => (m) => { f(m); r.be[0] = r.be[1] = m; }); // alloc-rare: installed once per context, when its record starts
  own('blendEquationSeparate', (f) => (a, b) => { f(a, b); r.be[0] = a; r.be[1] = b; }); // alloc-rare: installed once per context, when its record starts
  own('colorMask', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.cm; v[0] = a; v[1] = b; v[2] = c; v[3] = d; }); // alloc-rare: installed once per context, when its record starts
  own('clearColor', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.cc; v[0] = a; v[1] = b; v[2] = c; v[3] = d; }); // alloc-rare: installed once per context, when its record starts
  own('stencilMask', (f) => (m) => { f(m); r.sm = r.sbm = m; }); // alloc-rare: installed once per context, when its record starts
  own('stencilMaskSeparate', (f) => (face, m) => { f(face, m); if (face !== gl.BACK) r.sm = m; if (face !== gl.FRONT) r.sbm = m; }); // alloc-rare: installed once per context, when its record starts
  // (B10: a verdict belongs to one framebuffer object with one attachment set: changing what is attached ends it.)
  const unverify = (t) => { const fb = t === RFB ? r.fbR : r.fbD; const v = fb && r.fbOk.get(fb); if (v) v.key = null; }; // alloc-rare: installed once per context, when its record starts
  own('framebufferTexture2D', (f) => (t, a, b, c, d) => { f(t, a, b, c, d); unverify(t); });   // (named arguments, no rest array: called every frame by a rig that re-attaches) // alloc-rare: installed once per context, when its record starts
  own('framebufferRenderbuffer', (f) => (t, a, b, c) => { f(t, a, b, c); unverify(t); }); // alloc-rare: installed once per context, when its record starts
  own('framebufferTextureLayer', (f) => (t, a, b, c, d) => { f(t, a, b, c, d); unverify(t); }); // alloc-rare: installed once per context, when its record starts
  // (A bound object that is deleted reads back as null, as the context's own query would answer. One function for every texture unit,
  // the doomed texture in a variable: no closure or entry array made by a delete.)
  let doomed = null;
  const unbind = (t, u, m) => { if (t === doomed) m.set(u, null); }; // alloc-rare: installed once per context, when its record starts
  own('deleteFramebuffer', (f) => (x) => { if (x && r.fbR === x) r.fbR = null; if (x && r.fbD === x) r.fbD = null; f(x); tell('deleteFramebuffer', x); }); // alloc-rare: installed once per context, when its record starts
  own('deleteTexture', (f) => (x) => { if (x) { doomed = x; r.tex.forEach(unbind); doomed = null; } f(x); tell('deleteTexture', x); }); // alloc-rare: installed once per context, when its record starts
  own('deleteBuffer', (f) => (x) => { if (x && r.buf === x) r.buf = null; f(x); tell('deleteBuffer', x); }); // alloc-rare: installed once per context, when its record starts
  own('deleteRenderbuffer', (f) => (x) => { if (x && r.rb === x) r.rb = null; f(x); tell('deleteRenderbuffer', x); }); // alloc-rare: installed once per context, when its record starts
  own('deleteVertexArray', (f) => (x) => { if (x && r.vao === x) r.vao = null; f(x); }); // alloc-rare: installed once per context, when its record starts
  // (Allocations, for the registry only: their arguments handed on as they came, by count (an overload is told by how many arrive), and
  // written into one kept array the registry reads during the call: no rest array, no copy. Eleven is the most any of them takes.)
  const argv = new Array(11).fill(undefined); // alloc-rare: installed once per context, when its record starts
  for (const name of ['texImage2D', 'copyTexImage2D', 'generateMipmap', 'texStorage2D', 'texImage3D', 'texStorage3D', 'renderbufferStorage', 'renderbufferStorageMultisample', 'bufferData']) { // alloc-rare: installed once per context, when its record starts
    own(name, (f) => function (a, b, c, d, e, g, h, i, j, k, l) {
      const n = arguments.length;
      const out = callN(f, n, a, b, c, d, e, g, h, i, j, k, l);
      if (hook) { argv[0] = a; argv[1] = b; argv[2] = c; argv[3] = d; argv[4] = e; argv[5] = g; argv[6] = h; argv[7] = i; argv[8] = j; argv[9] = k; argv[10] = l; hook(gl, name, argv, n); argv.fill(undefined); }   // (nothing kept of the sources: a picture or an array is let go as soon as the call is over)
      return out;
    });
  }
  // (Passes: no arguments kept, so a draw allocates nothing. The registry reads the area from the record: the viewport, or the
  // scissor's box while it is on. A blit and a copy hand their own area.)
  // (recs-production-120hz §13: an estimate, labelled as one. A draw of no vertices or no instances counts nothing; the scissor counts only
  // where it meets the viewport (a draw is clipped to both); clearBuffer* is counted as clear() is. It is the area a pass may touch, an
  // upper bound per pass for a draw that covers its box once, not measured fragment work.)
  const area = () => { // alloc-rare: installed once per context, when its record starts
    const v = r.vp;
    if (!r.caps.get(gl.SCISSOR_TEST)) return Math.max(0, v[2]) * Math.max(0, v[3]);
    const s = r.sci, w = Math.min(v[0] + v[2], s[0] + s[2]) - Math.max(v[0], s[0]), h = Math.min(v[1] + v[3], s[1] + s[3]) - Math.max(v[1], s[1]);
    return Math.max(0, w) * Math.max(0, h);
  };
  // (A clear is clipped by the scissor alone; without one it covers the target, whose size the viewport is taken for: the record does
  // not know a framebuffer object's size.)
  const clearArea = () => { const b = r.caps.get(gl.SCISSOR_TEST) ? r.sci : r.vp; return Math.max(0, b[2]) * Math.max(0, b[3]); }; // alloc-rare: installed once per context, when its record starts
  const pass = (name, n = 1) => { if (hook && n > 0) hook(gl, name, area()); }; // alloc-rare: installed once per context, when its record starts
  own('drawArrays', (f) => (m, a, n) => { f(m, a, n); pass('draw', n); }); // alloc-rare: installed once per context, when its record starts
  own('drawElements', (f) => (m, n, t, o) => { f(m, n, t, o); pass('draw', n); }); // alloc-rare: installed once per context, when its record starts
  own('drawArraysInstanced', (f) => (m, a, n, k) => { f(m, a, n, k); pass('draw', n * k); }); // alloc-rare: installed once per context, when its record starts
  own('drawElementsInstanced', (f) => (m, n, t, o, k) => { f(m, n, t, o, k); pass('draw', n * k); }); // alloc-rare: installed once per context, when its record starts
  own('clear', (f) => (m) => { f(m); if (hook) hook(gl, 'clear', clearArea()); }); // alloc-rare: installed once per context, when its record starts
  for (const name of ['clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) { // alloc-rare: installed once per context, when its record starts
    own(name, (f) => (b, i, v, o) => { if (o === undefined) f(b, i, v); else f(b, i, v, o); if (hook) hook(gl, 'clear', clearArea()); });   // (named arguments, no rest array: called every frame) // alloc-rare: installed once per context, when its record starts
  }
  own('blitFramebuffer', (f) => (a, b, c, d, e, g, h, i, m, n) => { f(a, b, c, d, e, g, h, i, m, n); if (hook) hook(gl, 'copy', Math.abs((h - e) * (i - g))); }); // alloc-rare: installed once per context, when its record starts
  own('copyTexSubImage2D', (f) => (t, l, a, b, x, y, w, h) => { f(t, l, a, b, x, y, w, h); if (hook) hook(gl, 'copy', w * h); }); // alloc-rare: installed once per context, when its record starts
  const c = gl.canvas;
  // (A loss ends the generation at once: nothing kept from it (limits, framebuffer verdicts, bindings) answers for the next one.)
  const end = () => { r.fresh = false; r.lim = new Map(); r.fbOk = new WeakMap(); r.gen++; epoch++; }; // alloc-rare: installed once per context, when its record starts
  c?.addEventListener?.('webglcontextlost', end);
  c?.addEventListener?.('webglcontextrestored', () => { end(); if (hook) tell('restored'); for (const f of [...epochFns]) { try { f(); } catch { /* a listener's own error */ } } }); // alloc-rare: installed once per context, when its record starts
}

function recOf(gl) {
  let r = recs.get(gl);
  if (r === undefined) {
    if (!isGL2(gl)) { recs.set(gl, null); return null; }
    r = { fresh: false, gen: 1, fbOk: new WeakMap() }; // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
    sweep(gl, r);
    wrap(gl, r);
    recs.set(gl, r);
    if (typeof WeakRef !== 'undefined') held.push(new WeakRef(gl));
    if (hook) hook(gl, 'context');
  } else if (r && !r.fresh && !gl.isContextLost()) sweep(gl, r);   // (a new context generation: read once again)
  return r;
}

/** The record itself, for the registry (gpu-budget.js): what is bound now (null off WebGL2). Read only. */
export function glRec(gl) { return recOf(gl); }

/** Starts the record for context gl (from its creation, so the registry sees every allocation). Returns gl. */
export function trackGL(gl) { if (gl) recOf(gl); return gl; }

function fromRec(gl, r, k) {
  switch (k) {
    case gl.READ_FRAMEBUFFER_BINDING: return r.fbR;
    case gl.DRAW_FRAMEBUFFER_BINDING: return r.fbD;   // (FRAMEBUFFER_BINDING is the same name)
    case gl.VIEWPORT: return Int32Array.from(r.vp);
    case gl.SCISSOR_BOX: return Int32Array.from(r.sci);
    case gl.CURRENT_PROGRAM: return r.prog;
    case gl.VERTEX_ARRAY_BINDING: return r.vao;
    case gl.ARRAY_BUFFER_BINDING: return r.buf;
    case gl.RENDERBUFFER_BINDING: return r.rb;
    case gl.ACTIVE_TEXTURE: return r.unit;
    case gl.TEXTURE_BINDING_2D: {
      if (!r.tex.has(r.unit)) r.tex.set(r.unit, gl.getParameter(k));   // (a unit not yet seen: asked once, then kept)
      return r.tex.get(r.unit);
    }
    case gl.BLEND_SRC_RGB: return r.bf[0];
    case gl.BLEND_DST_RGB: return r.bf[1];
    case gl.BLEND_SRC_ALPHA: return r.bf[2];
    case gl.BLEND_DST_ALPHA: return r.bf[3];
    case gl.BLEND_EQUATION_RGB: return r.be[0];
    case gl.BLEND_EQUATION_ALPHA: return r.be[1];
    case gl.COLOR_WRITEMASK: return r.cm.slice();   // (a copy: the record is written in place, and a caller that saves the mask to put it back needs the old one) // alloc-rare: only a caller that saves the mask to put it back (a warm-up draw, a paint's save), never a frame's own read
    case gl.COLOR_CLEAR_VALUE: return Float32Array.from(r.cc);
    case gl.STENCIL_WRITEMASK: return r.sm;
    case gl.STENCIL_BACK_WRITEMASK: return r.sbm;
    default: return undefined;
  }
}

/** gl.getParameter(k), from the record where it keeps k (the driver otherwise). */
export function glGet(gl, k) {
  const r = recOf(gl);
  if (!r || !r.fresh) return gl.getParameter(k);
  const v = fromRec(gl, r, k);
  if (v === undefined) return gl.getParameter(k);
  return v;
}

/** gl.isEnabled(cap), from the record. */
export function glOn(gl, cap) {
  const r = recOf(gl);
  if (!r || !r.fresh || !r.caps.has(cap)) return gl.isEnabled(cap);
  return r.caps.get(cap);
}

/** A limit of the context that never changes in its generation (MAX_TEXTURE_SIZE, MAX_SAMPLES, ...): asked once, then kept. */
export function glCap(gl, k) {
  const r = recOf(gl);
  if (!r) return gl.getParameter(k);
  if (!r.lim) r.lim = new Map(); // alloc-rare: read once when a context's record starts (its first use, and once after a restore)
  if (!r.lim.has(k)) { const v = gl.getParameter(k); if (gl.isContextLost()) return v; r.lim.set(k, v); }
  return r.lim.get(k);
}

// (B17, 2 Nov 2026: one count for every tracked context. It rises at each loss and each restore of any of them, so what was prepared
// against the resources of an older generation (a slide's readiness) can tell it is no longer this one's: epoch() is part of its identity.)
let epoch = 0;
const epochFns = new Set();
/** Rises at every loss and restore of any tracked context. 0 until the first. */
export const glEpoch = () => epoch;
/** fn() after any tracked context is restored (its resources are gone: rebuild what was ready). Returns the way to stop listening. */
export function onGLRestored(fn) { epochFns.add(fn); return () => { epochFns.delete(fn); }; }

/** The context's generation: 1 from its creation, one more at each loss and restore (an object or verdict kept from an older
 *  generation is not this one's). 0 where nothing is recorded (WebGL 1). */
export function glGen(gl) { const r = recOf(gl); return r ? r.gen : 0; }

// Framebuffer completeness (B10, 2 Nov 2026: a verdict is for the framebuffer it was asked of). checkFramebufferStatus is a synchronous
// trip into the driver, so a framebuffer that was found complete is not asked again while it stays as it was: the same object, the same
// layout key (e.g. 'rgba8', 'rgba8+s8'), the same size w x h, and no framebufferTexture2D / Renderbuffer / TextureLayer call on it since.
// A new framebuffer, a resized one or one re-attached is asked, so a later allocation that fails (memory, a layout the first one did
// not use) is seen. Only a complete verdict is kept, and a context loss drops them all. A size of 0 (or past the texture limit) is
// never complete and never asked. The default framebuffer (null bound) is asked every time.
/** gl.checkFramebufferStatus(target) === FRAMEBUFFER_COMPLETE for the framebuffer bound there, whose attachments have layout `key`
 *  (e.g. 'rgba8', 'rgba8+s8') and size w x h. */
export function fbComplete(gl, target, key, w, h) {
  if (!(w > 0 && h > 0)) return false;
  const r = recOf(gl);
  if (!r || !r.fresh) return gl.checkFramebufferStatus(target) === gl.FRAMEBUFFER_COMPLETE;
  const max = glCap(gl, gl.MAX_TEXTURE_SIZE);
  if (max && (w > max || h > max)) return false;
  const fb = target === gl.READ_FRAMEBUFFER ? r.fbR : r.fbD;
  // (The verdict is a record kept per framebuffer, written in place: key null is none. Compared by its three parts, no string made.)
  const v = fb ? r.fbOk.get(fb) : undefined;
  if (v && v.key === key && v.w === w && v.h === h) return true;
  const ok = gl.checkFramebufferStatus(target) === gl.FRAMEBUFFER_COMPLETE;
  if (fb) {
    if (ok && !gl.isContextLost()) {
      if (v) { v.key = key; v.w = w; v.h = h; } else r.fbOk.set(fb, { key, w, h });
    } else if (v) v.key = null;
  }
  return ok;
}
/** For tests: whether framebuffer fb holds a kept complete verdict in this context's generation. */
export const fbVerified = (gl, fb) => recs.get(gl)?.fbOk?.get(fb)?.key != null;

// Error checks (B10): a copy or allocation that can fail for want of support or memory is checked by the driver every time. An earlier
// success is no proof of the next one (other objects, other sizes, other memory), so nothing is kept between calls. These run at
// creation boundaries (a slide's wide copy, a resolution fade, a kept sinusoid picture, a noise table), not per frame.
/** Clears the errors before a call that is to be checked. */
export function glOkBefore(gl) {
  for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR && !gl.isContextLost(); i++);
}
/** Whether the calls since glOkBefore(gl) went through: asked of the driver every time. */
export function glOkAfter(gl) {
  if (gl.isContextLost()) return false;
  return gl.getError() === gl.NO_ERROR;
}

// Every WebGL2 context the page makes is recorded from its creation (the registry then sees its first allocation too).
if (W2) {
  for (const C of [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]) {
    const P = C?.prototype, get = P?.getContext;
    if (!get || get.__ppsGL) continue;
    const mine = function getContext(type, opts) {
      const ctx = get.call(this, type, opts);
      if (ctx && (type === 'webgl2')) { try { trackGL(ctx); noteContext(ctx, this); } catch (e) { caught('gl-state:249', e); /* the record is a help, never a failure */ } }
      return ctx;
    };
    mine.__ppsGL = true;
    P.getContext = mine;
  }
}
