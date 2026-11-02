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
/** For gpu-budget.js: fn(gl, name, x) after each allocating, freeing, binding or drawing call the wrappers see (x: the call's
 *  arguments for an allocation, its pixel area for 'draw' / 'clear' / 'copy'). */
export function onGLCall(fn) { hook = fn; }

const isGL2 = (gl) => !!(W2 && gl instanceof W2);

function sweep(gl, r) {
  const g = (k) => gl.getParameter(k);
  r.fbR = g(gl.READ_FRAMEBUFFER_BINDING); r.fbD = g(gl.DRAW_FRAMEBUFFER_BINDING);
  r.vp = Int32Array.from(g(gl.VIEWPORT) || [0, 0, 0, 0]); r.sci = Int32Array.from(g(gl.SCISSOR_BOX) || [0, 0, 0, 0]);
  r.prog = g(gl.CURRENT_PROGRAM); r.vao = g(gl.VERTEX_ARRAY_BINDING); r.buf = g(gl.ARRAY_BUFFER_BINDING); r.rb = g(gl.RENDERBUFFER_BINDING);
  r.unit = g(gl.ACTIVE_TEXTURE); r.tex = new Map([[r.unit, g(gl.TEXTURE_BINDING_2D)]]);
  r.caps = new Map([gl.BLEND, gl.STENCIL_TEST, gl.SCISSOR_TEST, gl.DEPTH_TEST, gl.CULL_FACE].map((c) => [c, gl.isEnabled(c)]));
  r.bf = [g(gl.BLEND_SRC_RGB), g(gl.BLEND_DST_RGB), g(gl.BLEND_SRC_ALPHA), g(gl.BLEND_DST_ALPHA)];
  r.be = [g(gl.BLEND_EQUATION_RGB), g(gl.BLEND_EQUATION_ALPHA)];
  r.cm = Array.from(g(gl.COLOR_WRITEMASK) || [true, true, true, true]); r.cc = Float32Array.from(g(gl.COLOR_CLEAR_VALUE) || [0, 0, 0, 0]);
  r.sm = g(gl.STENCIL_WRITEMASK); r.sbm = g(gl.STENCIL_BACK_WRITEMASK);
  r.lim = new Map();
  r.fresh = !gl.isContextLost();
}

// The calls that change what the record holds, each wrapped once on the context.
function wrap(gl, r) {
  const own = (name, make) => { const f = gl[name]; if (typeof f === 'function') gl[name] = make(f.bind(gl)); };
  const FB = gl.FRAMEBUFFER, RFB = gl.READ_FRAMEBUFFER, DFB = gl.DRAW_FRAMEBUFFER, AB = gl.ARRAY_BUFFER, T2 = gl.TEXTURE_2D;
  const tell = (name, a) => { if (hook) hook(gl, name, a); };
  // (The driver's call first, then the record: a call that throws (a wrong argument type) leaves the record as the driver has it.)
  own('bindFramebuffer', (f) => (t, fb) => { f(t, fb); if (t === FB || t === RFB) r.fbR = fb; if (t === FB || t === DFB) r.fbD = fb; if (hook && t !== RFB) hook(gl, 'target', fb); });
  own('viewport', (f) => (x, y, w, h) => { f(x, y, w, h); const v = r.vp; v[0] = x; v[1] = y; v[2] = w; v[3] = h; });
  own('scissor', (f) => (x, y, w, h) => { f(x, y, w, h); const v = r.sci; v[0] = x; v[1] = y; v[2] = w; v[3] = h; });
  own('useProgram', (f) => (p) => { f(p); r.prog = p; });
  own('bindVertexArray', (f) => (v) => { f(v); r.vao = v; });
  own('bindBuffer', (f) => (t, b) => { f(t, b); if (t === AB) r.buf = b; });
  own('bindRenderbuffer', (f) => (t, b) => { f(t, b); r.rb = b; });
  own('activeTexture', (f) => (u) => { f(u); r.unit = u; });
  own('bindTexture', (f) => (t, x) => { f(t, x); if (t === T2) r.tex.set(r.unit, x); });
  own('enable', (f) => (c) => { f(c); r.caps.set(c, true); });
  own('disable', (f) => (c) => { f(c); r.caps.set(c, false); });
  own('blendFunc', (f) => (s, d) => { f(s, d); r.bf[0] = r.bf[2] = s; r.bf[1] = r.bf[3] = d; });
  own('blendFuncSeparate', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.bf; v[0] = a; v[1] = b; v[2] = c; v[3] = d; });
  own('blendEquation', (f) => (m) => { f(m); r.be[0] = r.be[1] = m; });
  own('blendEquationSeparate', (f) => (a, b) => { f(a, b); r.be[0] = a; r.be[1] = b; });
  own('colorMask', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.cm; v[0] = a; v[1] = b; v[2] = c; v[3] = d; });
  own('clearColor', (f) => (a, b, c, d) => { f(a, b, c, d); const v = r.cc; v[0] = a; v[1] = b; v[2] = c; v[3] = d; });
  own('stencilMask', (f) => (m) => { f(m); r.sm = r.sbm = m; });
  own('stencilMaskSeparate', (f) => (face, m) => { f(face, m); if (face !== gl.BACK) r.sm = m; if (face !== gl.FRONT) r.sbm = m; });
  // (B10: a verdict belongs to one framebuffer object with one attachment set: changing what is attached ends it.)
  const unverify = (t) => { const fb = t === RFB ? r.fbR : r.fbD; if (fb) r.fbOk.delete(fb); };
  for (const name of ['framebufferTexture2D', 'framebufferRenderbuffer', 'framebufferTextureLayer']) {
    own(name, (f) => (t, ...a) => { const out = f(t, ...a); unverify(t); return out; });
  }
  // (A bound object that is deleted reads back as null, as the context's own query would answer.)
  own('deleteFramebuffer', (f) => (x) => { if (x && r.fbR === x) r.fbR = null; if (x && r.fbD === x) r.fbD = null; f(x); tell('deleteFramebuffer', [x]); });
  own('deleteTexture', (f) => (x) => { if (x) for (const [u, t] of r.tex) if (t === x) r.tex.set(u, null); f(x); tell('deleteTexture', [x]); });
  own('deleteBuffer', (f) => (x) => { if (x && r.buf === x) r.buf = null; f(x); tell('deleteBuffer', [x]); });
  own('deleteRenderbuffer', (f) => (x) => { if (x && r.rb === x) r.rb = null; f(x); tell('deleteRenderbuffer', [x]); });
  own('deleteVertexArray', (f) => (x) => { if (x && r.vao === x) r.vao = null; f(x); });
  // (Allocations, for the registry only: rare calls, their arguments handed on as they came.)
  for (const name of ['texImage2D', 'copyTexImage2D', 'generateMipmap', 'texStorage2D', 'texImage3D', 'texStorage3D', 'renderbufferStorage', 'renderbufferStorageMultisample', 'bufferData']) {
    own(name, (f) => (...a) => { const out = f(...a); if (hook) tell(name, a); return out; });
  }
  // (Passes: no arguments kept, so a draw allocates nothing. The registry reads the area from the record: the viewport, or the
  // scissor's box while it is on. A blit and a copy hand their own area.)
  // (recs-production-120hz §13: an estimate, labelled as one. A draw of no vertices or no instances counts nothing; the scissor counts only
  // where it meets the viewport (a draw is clipped to both); clearBuffer* is counted as clear() is. It is the area a pass may touch, an
  // upper bound per pass for a draw that covers its box once, not measured fragment work.)
  const area = () => {
    const v = r.vp;
    if (!r.caps.get(gl.SCISSOR_TEST)) return Math.max(0, v[2]) * Math.max(0, v[3]);
    const s = r.sci, w = Math.min(v[0] + v[2], s[0] + s[2]) - Math.max(v[0], s[0]), h = Math.min(v[1] + v[3], s[1] + s[3]) - Math.max(v[1], s[1]);
    return Math.max(0, w) * Math.max(0, h);
  };
  // (A clear is clipped by the scissor alone; without one it covers the target, whose size the viewport is taken for: the record does
  // not know a framebuffer object's size.)
  const clearArea = () => { const b = r.caps.get(gl.SCISSOR_TEST) ? r.sci : r.vp; return Math.max(0, b[2]) * Math.max(0, b[3]); };
  const pass = (name, n = 1) => { if (hook && n > 0) hook(gl, name, area()); };
  own('drawArrays', (f) => (m, a, n) => { f(m, a, n); pass('draw', n); });
  own('drawElements', (f) => (m, n, t, o) => { f(m, n, t, o); pass('draw', n); });
  own('drawArraysInstanced', (f) => (m, a, n, k) => { f(m, a, n, k); pass('draw', n * k); });
  own('drawElementsInstanced', (f) => (m, n, t, o, k) => { f(m, n, t, o, k); pass('draw', n * k); });
  own('clear', (f) => (m) => { f(m); if (hook) hook(gl, 'clear', clearArea()); });
  for (const name of ['clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) {
    own(name, (f) => (b, i, v, o) => { if (o === undefined) f(b, i, v); else f(b, i, v, o); if (hook) hook(gl, 'clear', clearArea()); });   // (named arguments, no rest array: called every frame)
  }
  own('blitFramebuffer', (f) => (a, b, c, d, e, g, h, i, m, n) => { f(a, b, c, d, e, g, h, i, m, n); if (hook) hook(gl, 'copy', Math.abs((h - e) * (i - g))); });
  own('copyTexSubImage2D', (f) => (t, l, a, b, x, y, w, h) => { f(t, l, a, b, x, y, w, h); if (hook) hook(gl, 'copy', w * h); });
  const c = gl.canvas;
  // (A loss ends the generation at once: nothing kept from it (limits, framebuffer verdicts, bindings) answers for the next one.)
  const end = () => { r.fresh = false; r.lim = new Map(); r.fbOk = new WeakMap(); r.gen++; };
  c?.addEventListener?.('webglcontextlost', end);
  c?.addEventListener?.('webglcontextrestored', () => { end(); if (hook) tell('restored', []); });
}

function recOf(gl) {
  let r = recs.get(gl);
  if (r === undefined) {
    if (!isGL2(gl)) { recs.set(gl, null); return null; }
    r = { fresh: false, gen: 1, fbOk: new WeakMap() };
    sweep(gl, r);
    wrap(gl, r);
    recs.set(gl, r);
    if (typeof WeakRef !== 'undefined') held.push(new WeakRef(gl));
    if (hook) hook(gl, 'context', []);
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
    case gl.COLOR_WRITEMASK: return r.cm.slice();
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
  if (!r.lim) r.lim = new Map();
  if (!r.lim.has(k)) { const v = gl.getParameter(k); if (gl.isContextLost()) return v; r.lim.set(k, v); }
  return r.lim.get(k);
}

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
  const rev = key + '|' + w + 'x' + h;
  if (fb && r.fbOk.get(fb) === rev) return true;
  const ok = gl.checkFramebufferStatus(target) === gl.FRAMEBUFFER_COMPLETE;
  if (fb) { if (ok && !gl.isContextLost()) r.fbOk.set(fb, rev); else r.fbOk.delete(fb); }
  return ok;
}
/** For tests: whether framebuffer fb holds a kept complete verdict in this context's generation. */
export const fbVerified = (gl, fb) => recs.get(gl)?.fbOk?.has(fb) ?? false;

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
      if (ctx && (type === 'webgl2')) { try { trackGL(ctx); } catch { /* the record is a help, never a failure */ } }
      return ctx;
    };
    mine.__ppsGL = true;
    P.getContext = mine;
  }
}
